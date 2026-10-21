'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { minutosDe, horaDe } from './SeletoresTempo';

/**
 * Semana em grade de horários (como o Google Agenda). Arraste uma reunião para outro horário ou dia;
 * puxe a borda de baixo para mudar a duração; clique num espaço vazio para agendar ali.
 */

const HORA_PX = 56; // altura de uma hora
const PASSO_MIN = 5; // arrastar anda de 5 em 5 minutos
const NOMES_DIA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const deIso = (iso) => {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d);
};
const iniciais = (nome) =>
  String(nome || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/** Distribui reuniões sobrepostas lado a lado (faixas), como o Google faz. */
function emFaixas(eventos) {
  const ordenados = [...eventos].sort((a, b) => minutosDe(a.hora_inicio) - minutosDe(b.hora_inicio) || minutosDe(b.hora_fim) - minutosDe(a.hora_fim));
  const resultado = [];
  let grupo = [];
  let fimGrupo = -1;
  const fecharGrupo = () => {
    const faixas = [];
    grupo.forEach((evt) => {
      const ini = minutosDe(evt.hora_inicio);
      let faixa = faixas.findIndex((fim) => fim <= ini);
      if (faixa === -1) {
        faixa = faixas.length;
        faixas.push(0);
      }
      faixas[faixa] = Math.max(ini + 15, minutosDe(evt.hora_fim));
      resultado.push({ evt, faixa, total: 0 });
    });
    resultado.slice(-grupo.length).forEach((r) => (r.total = faixas.length));
    grupo = [];
  };
  ordenados.forEach((evt) => {
    const ini = minutosDe(evt.hora_inicio);
    if (grupo.length && ini >= fimGrupo) fecharGrupo();
    grupo.push(evt);
    fimGrupo = Math.max(fimGrupo, Math.max(ini + 15, minutosDe(evt.hora_fim)));
  });
  if (grupo.length) fecharGrupo();
  return resultado;
}

export default function AgendaGradeSemana({ dias, porDia, hojeIso, agora, corDaAgenda, onAbrir, onCriar, onMover }) {
  const rolagemRef = useRef(null);
  const colunaRef = useRef(null);
  const [arrasto, setArrasto] = useState(null); // { evt, modo, x0, y0, largura, dia, dMin, dDias, moveu }

  // Reuniões com horário (as de dia inteiro e os prazos de demanda ficam na faixa de cima)
  const { comHorario, noTopo } = useMemo(() => {
    const comH = {};
    const topo = {};
    dias.forEach((d) => {
      comH[d] = [];
      topo[d] = [];
      (porDia[d] || []).forEach((e) => (e.dia_inteiro || e.origem === 'fila_demandas' ? topo[d] : comH[d]).push(e));
    });
    return { comHorario: comH, noTopo: topo };
  }, [dias, porDia]);

  // Faixa de horas: 07h–21h, ampliada se houver reunião fora disso
  const [horaIni, horaFim] = useMemo(() => {
    let ini = 7;
    let fim = 21;
    dias.forEach((d) =>
      comHorario[d].forEach((e) => {
        ini = Math.min(ini, Math.floor(minutosDe(e.hora_inicio) / 60));
        fim = Math.max(fim, Math.ceil(Math.max(minutosDe(e.hora_fim), minutosDe(e.hora_inicio) + 15) / 60));
      })
    );
    return [ini, Math.min(24, fim)];
  }, [dias, comHorario]);
  const alturaTotal = (horaFim - horaIni) * HORA_PX;
  const yDe = (min) => ((min - horaIni * 60) / 60) * HORA_PX;

  // Abre já mostrando o horário atual (ou 08h)
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el) return;
    const agoraMin = new Date(agora).getHours() * 60 + new Date(agora).getMinutes();
    const alvo = dias.includes(hojeIso) ? Math.max(horaIni * 60, agoraMin - 90) : 8 * 60;
    el.scrollTop = Math.max(0, yDe(alvo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias[0]]);

  const arrastavel = (evt) => evt.origem !== 'fila_demandas' && evt.status !== 'cancelada' && !evt.dia_inteiro;

  const iniciarArrasto = (e, evt, diaIdx, modo) => {
    if (e.button !== 0 || !arrastavel(evt)) return;
    e.stopPropagation();
    // Captura o ponteiro para seguir o arrasto fora do bloco (pode falhar em ponteiros sintéticos)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
    setArrasto({ evt, modo, x0: e.clientX, y0: e.clientY, largura: colunaRef.current?.offsetWidth || 120, dia: diaIdx, dMin: 0, dDias: 0, moveu: false });
  };

  const moverArrasto = (e) => {
    if (!arrasto) return;
    const dx = e.clientX - arrasto.x0;
    const dy = e.clientY - arrasto.y0;
    const moveu = arrasto.moveu || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    const dMin = Math.round(((dy / HORA_PX) * 60) / PASSO_MIN) * PASSO_MIN;
    const dDias = arrasto.modo === 'mover' ? Math.max(-arrasto.dia, Math.min(6 - arrasto.dia, Math.round(dx / arrasto.largura))) : 0;
    if (dMin !== arrasto.dMin || dDias !== arrasto.dDias || moveu !== arrasto.moveu) setArrasto({ ...arrasto, dMin, dDias, moveu });
  };

  const novosHorarios = (a) => {
    const ini = minutosDe(a.evt.hora_inicio);
    const fim = Math.max(ini + 15, minutosDe(a.evt.hora_fim));
    if (a.modo === 'redimensionar') return { hora_inicio: a.evt.hora_inicio, hora_fim: horaDe(Math.max(ini + 15, Math.min(24 * 60 - 1, fim + a.dMin))) };
    const duracao = fim - ini;
    const novoIni = Math.max(0, Math.min(24 * 60 - duracao, ini + a.dMin));
    return { hora_inicio: horaDe(novoIni), hora_fim: horaDe(novoIni + duracao) };
  };

  const soltarArrasto = () => {
    if (!arrasto) return;
    const a = arrasto;
    setArrasto(null);
    if (!a.moveu) return onAbrir(a.evt);
    const h = novosHorarios(a);
    const data = dias[a.dia + a.dDias];
    if (data === a.evt.data && h.hora_inicio === a.evt.hora_inicio && h.hora_fim === a.evt.hora_fim) return;
    onMover(a.evt, { data, ...h });
  };

  const criarNoClique = (e, dia) => {
    if (arrasto) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.floor((horaIni * 60 + (y / HORA_PX) * 60) / 15) * 15;
    onCriar(dia, horaDe(min));
  };

  const agoraData = new Date(agora);
  const agoraMin = agoraData.getHours() * 60 + agoraData.getMinutes();
  const temTopo = dias.some((d) => noTopo[d].length);

  return (
    <div className="rounded-3xl bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] overflow-hidden select-none">
      <div ref={rolagemRef} className="relative overflow-y-auto overflow-x-auto max-h-[calc(100vh-260px)] min-h-[480px]">
        <div className="min-w-[760px]">
          {/* Cabeçalho dos dias (+ faixa de dia inteiro e prazos) */}
          <div className="sticky top-0 z-20 bg-white/95 dark:bg-[#1e1e21]/95 backdrop-blur border-b border-black/[0.06] dark:border-white/[0.09]">
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
              <div />
              {dias.map((dia, i) => {
                const hoje = dia === hojeIso;
                return (
                  <div key={dia} className="py-2.5 flex flex-col items-center gap-0.5">
                    <span className={`text-[11px] font-medium uppercase tracking-wide ${hoje ? 'text-[#4d7c0f] dark:text-[#a3e635]' : 'text-slate-500 dark:text-zinc-400'}`}>{NOMES_DIA[i]}</span>
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[16px] font-semibold tabular-nums ${
                        hoje ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950' : 'text-[#1d1d1f] dark:text-white'
                      }`}
                    >
                      {deIso(dia).getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            {temTopo && (
              <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-t border-black/[0.05] dark:border-white/[0.07]">
                <div className="text-[10px] text-slate-400 text-right pr-2 pt-1.5">dia</div>
                {dias.map((dia) => (
                  <div key={dia} className="p-1 space-y-1 border-l border-black/[0.05] dark:border-white/[0.07]">
                    {noTopo[dia].map((evt) => {
                      const prazo = evt.origem === 'fila_demandas';
                      return (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={() => onAbrir(evt)}
                          title={evt.titulo}
                          className={`w-full truncate text-left h-6 px-2 rounded-md text-[11px] font-medium cursor-pointer ${
                            prazo ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-black/[0.06] dark:bg-white/[0.1] text-[#1d1d1f] dark:text-white'
                          }`}
                        >
                          {prazo ? `${evt.hora_inicio} · Prazo ${evt.empresa}` : evt.titulo}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grade */}
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" onPointerMove={moverArrasto} onPointerUp={soltarArrasto} onPointerCancel={() => setArrasto(null)}>
            <div className="relative" style={{ height: alturaTotal }}>
              {Array.from({ length: horaFim - horaIni }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-slate-400" style={{ top: i * HORA_PX }}>
                  {i === 0 ? '' : `${String(horaIni + i).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>
            {dias.map((dia, diaIdx) => {
              const hoje = dia === hojeIso;
              return (
                <div
                  key={dia}
                  ref={diaIdx === 0 ? colunaRef : undefined}
                  onClick={(e) => criarNoClique(e, dia)}
                  className={`relative border-l border-black/[0.05] dark:border-white/[0.07] cursor-cell ${hoje ? 'bg-[#4d7c0f]/[0.025] dark:bg-[#84cc16]/[0.03]' : ''}`}
                  style={{
                    height: alturaTotal,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_PX - 1}px, var(--linha-grade) ${HORA_PX - 1}px, var(--linha-grade) ${HORA_PX}px)`,
                  }}
                >
                  {hoje && agoraMin >= horaIni * 60 && agoraMin <= horaFim * 60 && (
                    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: yDe(agoraMin) }}>
                      <div className="h-[2px] bg-rose-500" />
                      <div className="absolute -left-1 -top-[4px] w-2.5 h-2.5 rounded-full bg-rose-500" />
                    </div>
                  )}

                  {emFaixas(comHorario[dia]).map(({ evt, faixa, total }) => {
                    const ativo = arrasto?.evt.id === evt.id;
                    const h = ativo && arrasto.moveu ? novosHorarios(arrasto) : { hora_inicio: evt.hora_inicio, hora_fim: evt.hora_fim };
                    const ini = minutosDe(h.hora_inicio);
                    const fim = Math.max(ini + 15, minutosDe(h.hora_fim));
                    const altura = Math.max(20, ((fim - ini) / 60) * HORA_PX - 2);
                    const cancelada = evt.status === 'cancelada';
                    const passou = agora > deIso(evt.data).getTime() + fim * 60000;
                    const cor = corDaAgenda?.get(evt.google_calendar_id) || '#4d7c0f';
                    const compacta = altura < 36 || (total > 1 && altura < 48);
                    const largura = 100 / total;
                    return (
                      <div
                        key={evt.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${evt.titulo}, ${h.hora_inicio} às ${horaDe(fim)}`}
                        onPointerDown={(e) => iniciarArrasto(e, evt, diaIdx, 'mover')}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onAbrir(evt))}
                        className={`absolute rounded-lg px-1.5 overflow-hidden text-left transition-shadow ${
                          arrastavel(evt) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${ativo && arrasto.moveu ? 'z-30 shadow-[0_10px_28px_-8px_rgba(0,0,0,0.45)] ring-2 ring-white dark:ring-[#1e1e21]' : 'z-[5] hover:z-20 hover:shadow-md'} ${
                          passou || cancelada ? 'opacity-55' : ''
                        }`}
                        style={{
                          top: yDe(ini) + 1,
                          height: altura,
                          left: `calc(${faixa * largura}% + 2px)`,
                          width: `calc(${largura}% - 4px)`,
                          transform: ativo && arrasto.moveu && arrasto.dDias ? `translateX(${arrasto.dDias * arrasto.largura}px)` : undefined,
                          background: `color-mix(in srgb, ${cor} 22%, var(--fundo-evento))`,
                          touchAction: 'none',
                        }}
                      >
                        <div className={`${compacta ? 'flex items-center gap-1.5 h-full' : 'pt-1'}`}>
                          {/* Em blocos curtos o título tem prioridade sobre o horário */}
                          <p className={`text-[11.5px] font-semibold leading-tight text-[#1d1d1f] dark:text-white ${compacta ? 'truncate min-w-0 flex-1' : 'line-clamp-2'} ${cancelada ? 'line-through' : ''}`}>
                            {evt.titulo}
                          </p>
                          {(!compacta || total === 1) && (
                            <p className={`text-[10.5px] tabular-nums text-slate-600 dark:text-zinc-300 truncate ${compacta ? 'flex-shrink-0' : ''}`}>
                              {h.hora_inicio} – {horaDe(fim)}
                            </p>
                          )}
                          {!compacta && altura > 64 && evt.responsavel_nome && (
                            <p className="mt-1 flex items-center gap-1 text-[10.5px] text-slate-600 dark:text-zinc-300 truncate">
                              <span className="w-4 h-4 rounded-full bg-black/[0.08] dark:bg-white/[0.14] text-[8px] font-semibold flex items-center justify-center">{iniciais(evt.responsavel_nome)}</span>
                              {evt.responsavel_nome.split(' ')[0]}
                            </p>
                          )}
                        </div>
                        {!compacta && evt.link_reuniao && !cancelada && altura > 52 && (
                          <a
                            href={evt.link_reuniao}
                            target="_blank"
                            rel="noreferrer"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-1 bottom-1.5 h-5 px-1.5 rounded-full text-[10px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]"
                          >
                            Entrar
                          </a>
                        )}
                        {arrastavel(evt) && (
                          <span
                            onPointerDown={(e) => iniciarArrasto(e, evt, diaIdx, 'redimensionar')}
                            className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
