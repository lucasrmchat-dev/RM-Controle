'use client';

import React, { useEffect, useState } from 'react';
import { EVENTO_NOVA } from '@/lib/notificacoes';
import { CORES_FLASH, DURACOES_AVISO, ESTILOS_AVISO, EVENTO_AVISOS_CONFIG, INTERVALOS_FLASH, REPETICOES_FLASH, TIPOS_AVISO, lerAvisos, salvarAvisos } from '@/lib/avisosTela';

const pilula = (ativo) =>
  `h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
    ativo ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'bg-black/[0.04] dark:bg-white/[0.07] text-slate-600 dark:text-zinc-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.12]'
  }`;

function Linha({ titulo, children, dica }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-2 sm:gap-4 sm:items-start">
      <span className="text-[12.5px] font-semibold text-slate-500 dark:text-zinc-400 sm:pt-1.5">{titulo}</span>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
        {dica && <p className="mt-1.5 text-[12px] text-slate-400 dark:text-zinc-500">{dica}</p>}
      </div>
    </div>
  );
}

/** Mostra um aviso de exemplo com a configuração atual. */
const testar = (n = 0) =>
  window.dispatchEvent(
    new CustomEvent(EVENTO_NOVA, {
      detail: [
        { id: `teste-${Date.now()}`, tipo: 'chat', titulo: 'Maria Albano', detalhe: 'Oi! Conseguiu ver aquele orçamento?', teste: true },
        { id: `teste-${Date.now()}-2`, tipo: 'demanda', titulo: 'Nova demanda: DV Protec', detalhe: 'Ajuda com API, tirar dúvidas', teste: true },
        { id: `teste-${Date.now()}-3`, tipo: 'reuniao', titulo: 'Reunião em 15 min', detalhe: 'Alinhamento semanal · 14:00', teste: true },
      ][n],
    })
  );

/** Configurações › Aparência › Avisos na tela (neste navegador, salva na hora). */
export default function ConfigAvisosTela() {
  const [c, setC] = useState(null);
  useEffect(() => {
    setC(lerAvisos());
    const aoMudar = (e) => setC(e.detail);
    window.addEventListener(EVENTO_AVISOS_CONFIG, aoMudar);
    return () => window.removeEventListener(EVENTO_AVISOS_CONFIG, aoMudar);
  }, []);
  if (!c) return null;
  const mudar = (campos) => setC(salvarAvisos(campos));

  return (
    <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-sm space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">Avisos na tela</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">Como as notificações aparecem enquanto você trabalha (mensagens do WhatsApp, Demandas, Agenda). Tudo continua guardado no sino. Vale para este navegador e é salvo na hora.</p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => testar(0)} className="h-9 px-4 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 text-[13px] font-semibold cursor-pointer">
            Testar
          </button>
          <button type="button" onClick={() => [0, 1, 2].forEach((i) => setTimeout(() => testar(i), i * 350))} className="h-9 px-4 rounded-full ring-1 ring-black/[0.1] dark:ring-white/[0.14] text-[13px] font-medium cursor-pointer">
            Testar vários
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Estilo dos avisos">
        {ESTILOS_AVISO.map((e) => {
          const sel = c.estilo === e.id;
          return (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => {
                mudar({ estilo: e.id });
                if (e.id !== 'desligado') setTimeout(() => testar(0), 120);
              }}
              className={`text-left rounded-2xl p-3.5 border-2 transition-all cursor-pointer ${sel ? 'border-rm-acento dark:border-rm-acento-escuro bg-rm-acento/[0.04]' : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.15]'}`}
            >
              <span className="block text-[13.5px] font-semibold text-[#1d1d1f] dark:text-white">{e.nome}</span>
              <span className="block text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-snug">{e.descricao}</span>
            </button>
          );
        })}
      </div>

      {c.estilo !== 'desligado' && (
        <div className="space-y-3.5 pt-1">
          <Linha titulo="Avisar de">
            {TIPOS_AVISO.map((t) => {
              const marcado = c.tipos.includes(t.id);
              return (
                <button key={t.id} type="button" aria-pressed={marcado} onClick={() => mudar({ tipos: marcado ? c.tipos.filter((x) => x !== t.id) : [...c.tipos, t.id] })} className={pilula(marcado)}>
                  {t.nome}
                </button>
              );
            })}
          </Linha>
          <Linha titulo="Fica na tela por">
            {DURACOES_AVISO.map((d) => (
              <button key={d} type="button" aria-pressed={c.duracao === d} onClick={() => mudar({ duracao: d })} className={pilula(c.duracao === d)}>
                {d ? `${d} segundos` : 'Até eu fechar'}
              </button>
            ))}
          </Linha>
          <Linha titulo="Ao mesmo tempo" dica="Chegando mais, aparece “+N no sino” para ver o resto.">
            {[1, 2, 3].map((m) => (
              <button key={m} type="button" aria-pressed={c.maximo === m} onClick={() => mudar({ maximo: m })} className={pilula(c.maximo === m)}>
                {m === 1 ? 'Só 1' : `Até ${m}`}
              </button>
            ))}
          </Linha>
        </div>
      )}

      <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-[14px] font-semibold text-[#1d1d1f] dark:text-white">Piscar a tela</h4>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5">Um brilho em volta da tela quando chega um aviso, sem cobrir o que você está fazendo.</p>
          </div>
          <button type="button" role="switch" aria-checked={c.flash} aria-label="Piscar a tela" onClick={() => mudar({ flash: !c.flash })} className={`relative w-11 h-6 rounded-full flex-shrink-0 cursor-pointer transition-colors ${c.flash ? 'bg-rm-acento dark:bg-rm-acento-escuro' : 'bg-black/15 dark:bg-white/20'}`}>
            <span className={`absolute top-[2px] w-5 h-5 rounded-full bg-white shadow transition-all ${c.flash ? 'left-[22px]' : 'left-[2px]'}`} />
          </button>
        </div>
        {c.flash && (
          <>
            <Linha titulo="Cor">
              {CORES_FLASH.map((cor) => (
                <button
                  key={cor.id}
                  type="button"
                  aria-pressed={c.flashCor === cor.id}
                  aria-label={cor.nome}
                  title={cor.nome}
                  onClick={() => {
                    mudar({ flashCor: cor.id });
                    setTimeout(() => testar(0), 80);
                  }}
                  className={`w-8 h-8 rounded-full cursor-pointer ring-offset-2 ring-offset-white dark:ring-offset-rm-cartao-escuro ${c.flashCor === cor.id ? 'ring-2 ring-[#1d1d1f] dark:ring-white' : ''}`}
                  style={{ background: cor.valor }}
                />
              ))}
            </Linha>
            <Linha titulo="Quantas vezes">
              {REPETICOES_FLASH.map((r) => (
                <button key={r.id} type="button" aria-pressed={c.flashRepeticao === r.id} onClick={() => mudar({ flashRepeticao: r.id })} className={pilula(c.flashRepeticao === r.id)}>
                  {r.nome}
                </button>
              ))}
            </Linha>
            {c.flashRepeticao === 'intermitente' && (
              <Linha titulo="Repetir a cada" dica="Para quando você mexer no mouse ou no teclado.">
                {INTERVALOS_FLASH.map((s) => (
                  <button key={s} type="button" aria-pressed={c.flashIntervalo === s} onClick={() => mudar({ flashIntervalo: s })} className={pilula(c.flashIntervalo === s)}>
                    {s < 60 ? `${s} segundos` : s === 60 ? '1 minuto' : `${s / 60} minutos`}
                  </button>
                ))}
              </Linha>
            )}
          </>
        )}
      </div>
    </div>
  );
}
