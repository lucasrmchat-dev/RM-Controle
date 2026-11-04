'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BLOCOS, STATUS_REUNIAO, dadosDaDemanda, dadosDaReuniao, efeitosSimulados, executarFluxo } from '@/lib/fluxos';
import { campoClasse, rotuloClasse } from './visual';

/**
 * Testar fluxo: roda o MESMO motor do servidor com efeitos simulados (nada sai do sistema).
 * Gatilho de WhatsApp: conversa de mentira, como no celular. Gatilho de agenda: reunião de exemplo.
 * onResultado(passos) destaca no desenho o caminho percorrido.
 */
export default function TestarFluxo({ definicao, canais = [], onResultado, onFechar }) {
  const tipos = useMemo(() => new Set((definicao?.nos || []).filter((n) => BLOCOS[n.tipo]?.gatilho).map((n) => n.tipo)), [definicao]);
  const modos = [tipos.has('gatilho_mensagem') && ['whatsapp', 'WhatsApp'], (tipos.has('gatilho_reuniao_agendada') || tipos.has('gatilho_reuniao_status')) && ['agenda', 'Agenda'], [...tipos].some((t) => t.startsWith('gatilho_demanda')) && ['demanda', 'Demandas']].filter(Boolean);
  const [modo, setModo] = useState(modos[0]?.[0] || 'whatsapp');
  useEffect(() => {
    if (modos.length && !modos.some(([id]) => id === modo)) setModo(modos[0][0]);
  }, [modos.map((m) => m[0]).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const [itens, setItens] = useState([]);
  const [texto, setTexto] = useState('');
  const [nome, setNome] = useState('Cliente Teste');
  const [grupo, setGrupo] = useState(false);
  const [canalId, setCanalId] = useState('');
  const [rodando, setRodando] = useState(false);
  const [passos, setPassos] = useState([]);
  const [reuniao, setReuniao] = useState({ titulo: 'Apresentação da plataforma', empresa: 'Empresa Teste', status: 'concluida', tipo: 'cliente', cliente_telefone: '5585999990000' });
  const [demanda, setDemanda] = useState({ empresa: 'Empresa Teste', departamento: 'Suporte', relato: 'A impressora não imprime.', minutos: 45 });
  const fim = useRef(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [itens]);

  const rodar = async (evento, rotuloEntrada) => {
    setRodando(true);
    if (rotuloEntrada) setItens((l) => [...l, { de: 'eu', texto: rotuloEntrada }]);
    try {
      const r = await executarFluxo({
        definicao,
        evento,
        efeitos: efeitosSimulados({ aoEnviar: (t) => setItens((l) => [...l, { de: 'bot', texto: t }]) }),
      });
      setPassos(r.passos);
      onResultado?.(r.passos);
      if (!r.casou) setItens((l) => [...l, { de: 'sistema', texto: 'Nenhum gatilho combinou com isso. Confira os filtros do gatilho.' }]);
      else if (r.status !== 'ok') setItens((l) => [...l, { de: 'erro', texto: r.passos.at(-1)?.erro || 'O fluxo parou.' }]);
    } finally {
      setRodando(false);
    }
  };

  const enviar = (e) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || rodando) return;
    setTexto('');
    const canal = canais.find((k) => k.id === canalId) || canais[0] || { id: 'teste', nome: 'Canal de teste' };
    rodar(
      {
        tipo: 'mensagem_recebida',
        dados: {
          mensagem: { texto: t, tipo: 'texto' },
          contato: { nome: grupo ? 'Grupo de Teste' : nome, telefone: '5585999990000' },
          participante: grupo ? { nome, telefone: '5585999990000' } : null,
          conversa: { id: 'conversa-teste', grupo, departamento: '', responsavel_email: '' },
          canal: { id: canal.id, nome: canal.nome },
        },
      },
      t
    );
  };

  const simularReuniao = (tipo) => {
    const e = { id: 'reuniao-teste', data: new Date().toISOString().slice(0, 10), hora_inicio: '14:00', responsavel_nome: 'Você', ...reuniao, status: tipo === 'reuniao_agendada' ? 'agendada' : reuniao.status };
    rodar({ tipo, dados: dadosDaReuniao(e) }, tipo === 'reuniao_agendada' ? `📅 Reunião agendada: ${e.titulo}` : `📅 Reunião ficou ${STATUS_REUNIAO.find((s) => s.id === e.status)?.rotulo.toLowerCase()}: ${e.titulo}`);
  };

  // Demanda de exemplo: cada botão simula uma situação (criada, em andamento, fechada ou parada há X minutos)
  const simularDemanda = (tipo, extra = {}) => {
    const minutos = Math.max(0, Number(demanda.minutos) || 0);
    const antes = new Date(Date.now() - minutos * 60000).toISOString();
    const chamado = {
      id: 'demanda-teste',
      empresa_nome: demanda.empresa,
      categorias: demanda.departamento ? [demanda.departamento] : [],
      observacao_inicial: demanda.relato,
      colaborador_solicitante: 'Colaborador Teste',
      tecnico_email: 'geral',
      created_at: antes,
      iniciado_em: antes,
      status: 'aguardando_visualizacao',
      ...extra,
    };
    const rotulos = { demanda_criada: 'criada', demanda_andamento: 'em andamento', demanda_fechada: 'fechada', demanda_sla: `parada há ${minutos} min` };
    rodar({ tipo, dados: dadosDaDemanda(chamado) }, `🗂 Demanda ${rotulos[tipo]}: ${demanda.empresa}`);
  };

  const limpar = () => {
    setItens([]);
    setPassos([]);
    onResultado?.([]);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 h-14 flex items-center gap-2 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
        <span className="text-[14.5px] font-semibold">Testar fluxo</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/14 text-amber-700 dark:text-amber-300 font-medium">simulação</span>
        <button type="button" onClick={limpar} title="Recomeçar" aria-label="Recomeçar" className="ml-auto w-8 h-8 rounded-full text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center justify-center">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button type="button" onClick={onFechar} aria-label="Fechar teste" className="w-8 h-8 rounded-full text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center justify-center text-[18px]">
          ×
        </button>
      </div>

      {modos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-[13px] text-slate-500">Coloque um gatilho no fluxo para testar.</div>
      ) : (
        <>
          {modos.length > 1 && (
            <div className="px-4 pt-3 flex gap-1">
              {modos.map(([id, rot]) => (
                <button key={id} type="button" onClick={() => setModo(id)} className={`h-8 px-3 rounded-full text-[12.5px] font-medium cursor-pointer ${modo === id ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' : 'bg-black/[0.05] dark:bg-white/[0.08]'}`}>
                  {rot}
                </button>
              ))}
            </div>
          )}

          {modo === 'whatsapp' && (
            <div className="px-4 pt-3 grid grid-cols-2 gap-2">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do contato" className={campoClasse} />
              <select value={grupo ? 'grupo' : 'contato'} onChange={(e) => setGrupo(e.target.value === 'grupo')} className={campoClasse}>
                <option value="contato">Conversa normal</option>
                <option value="grupo">Mensagem em grupo</option>
              </select>
              {canais.length > 1 && (
                <select value={canalId} onChange={(e) => setCanalId(e.target.value)} className={`${campoClasse} col-span-2`}>
                  {canais.map((k) => (
                    <option key={k.id} value={k.id}>
                      Canal: {k.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {modo === 'agenda' && (
            <div className="px-4 pt-3 space-y-2">
              <span className={rotuloClasse}>Reunião de exemplo</span>
              <input value={reuniao.titulo} onChange={(e) => setReuniao({ ...reuniao, titulo: e.target.value })} placeholder="Título" className={campoClasse} />
              <div className="grid grid-cols-2 gap-2">
                <input value={reuniao.empresa} onChange={(e) => setReuniao({ ...reuniao, empresa: e.target.value })} placeholder="Empresa" className={campoClasse} />
                <input value={reuniao.cliente_telefone} onChange={(e) => setReuniao({ ...reuniao, cliente_telefone: e.target.value })} placeholder="Telefone do cliente" className={campoClasse} />
              </div>
              <div className="flex gap-2">
                {tipos.has('gatilho_reuniao_agendada') && (
                  <button type="button" disabled={rodando} onClick={() => simularReuniao('reuniao_agendada')} className="flex-1 h-9 rounded-full text-[12.5px] font-semibold bg-sky-500/12 text-sky-700 dark:text-sky-300 cursor-pointer disabled:opacity-50">
                    Simular agendamento
                  </button>
                )}
              </div>
              {tipos.has('gatilho_reuniao_status') && (
                <div className="flex gap-2">
                  <select value={reuniao.status} onChange={(e) => setReuniao({ ...reuniao, status: e.target.value })} className={campoClasse}>
                    {STATUS_REUNIAO.filter((s) => s.id !== 'agendada').map((s) => (
                      <option key={s.id} value={s.id}>
                        Ficou {s.rotulo.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={rodando} onClick={() => simularReuniao('reuniao_status')} className="h-9 px-4 rounded-full text-[12.5px] font-semibold bg-sky-500/12 text-sky-700 dark:text-sky-300 cursor-pointer whitespace-nowrap disabled:opacity-50">
                    Simular
                  </button>
                </div>
              )}
            </div>
          )}

          {modo === 'demanda' && (
            <div className="px-4 pt-3 space-y-2">
              <span className={rotuloClasse}>Demanda de exemplo</span>
              <div className="grid grid-cols-2 gap-2">
                <input value={demanda.empresa} onChange={(e) => setDemanda({ ...demanda, empresa: e.target.value })} placeholder="Empresa" className={campoClasse} />
                <input value={demanda.departamento} onChange={(e) => setDemanda({ ...demanda, departamento: e.target.value })} placeholder="Departamento" className={campoClasse} />
              </div>
              <input value={demanda.relato} onChange={(e) => setDemanda({ ...demanda, relato: e.target.value })} placeholder="O que a pessoa relatou" className={campoClasse} />
              <div className="flex flex-wrap gap-2">
                {tipos.has('gatilho_demanda_criada') && <button type="button" disabled={rodando} onClick={() => simularDemanda('demanda_criada')} className="h-9 px-3 rounded-full text-[12.5px] font-semibold bg-orange-500/12 text-orange-700 dark:text-orange-300 cursor-pointer disabled:opacity-50">Criada</button>}
                {tipos.has('gatilho_demanda_andamento') && <button type="button" disabled={rodando} onClick={() => simularDemanda('demanda_andamento', { status: 'em_andamento', tecnico_email: 'voce@empresa.com' })} className="h-9 px-3 rounded-full text-[12.5px] font-semibold bg-orange-500/12 text-orange-700 dark:text-orange-300 cursor-pointer disabled:opacity-50">Em andamento</button>}
                {tipos.has('gatilho_demanda_fechada') && (
                  <>
                    <button type="button" disabled={rodando} onClick={() => simularDemanda('demanda_fechada', { status: 'finalizado' })} className="h-9 px-3 rounded-full text-[12.5px] font-semibold bg-orange-500/12 text-orange-700 dark:text-orange-300 cursor-pointer disabled:opacity-50">Concluída</button>
                    <button type="button" disabled={rodando} onClick={() => simularDemanda('demanda_fechada', { status: 'cancelado' })} className="h-9 px-3 rounded-full text-[12.5px] font-semibold bg-orange-500/12 text-orange-700 dark:text-orange-300 cursor-pointer disabled:opacity-50">Cancelada</button>
                  </>
                )}
              </div>
              {tipos.has('gatilho_demanda_sla') && (
                <div className="flex items-center gap-2">
                  <input type="number" min="0" value={demanda.minutos} onChange={(e) => setDemanda({ ...demanda, minutos: e.target.value })} className={`${campoClasse} w-24`} aria-label="Minutos parada" />
                  <span className="text-[12.5px] text-slate-500">minutos parada</span>
                  <button type="button" disabled={rodando} onClick={() => simularDemanda('demanda_sla')} className="ml-auto h-9 px-3 rounded-full text-[12.5px] font-semibold bg-orange-500/12 text-orange-700 dark:text-orange-300 cursor-pointer disabled:opacity-50 whitespace-nowrap">Simular prazo (SLA)</button>
                </div>
              )}
            </div>
          )}

          {/* Conversa simulada */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2 bg-[#efeae2] dark:bg-[#0b141a] mt-3">
            {itens.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#54656f] dark:text-[#8696a0] gap-2">
                <svg className="w-10 h-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a8.5 8.5 0 0 1-12.6 7.45L3 21l1.55-5.4A8.5 8.5 0 1 1 21 12z" />
                </svg>
                <p className="text-[14px] font-medium">{modo === 'whatsapp' ? 'Envie uma mensagem para começar' : modo === 'demanda' ? 'Simule a demanda acima' : 'Simule a reunião acima'}</p>
                <p className="text-[12px]">O fluxo responde como faria de verdade, sem enviar nada.</p>
              </div>
            )}
            <AnimatePresence initial={false}>
              {itens.map((it, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${it.de === 'eu' ? 'justify-end' : it.de === 'bot' ? 'justify-start' : 'justify-center'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 text-[13.5px] leading-snug whitespace-pre-wrap break-words shadow-sm ${
                      it.de === 'eu'
                        ? 'rounded-2xl rounded-tr-md bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef]'
                        : it.de === 'bot'
                          ? 'rounded-2xl rounded-tl-md bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef]'
                          : it.de === 'erro'
                            ? 'rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[12px]'
                            : 'rounded-xl bg-white/80 dark:bg-white/[0.08] text-[#54656f] dark:text-[#8696a0] text-[12px]'
                    }`}
                  >
                    {it.texto}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {rodando && <p className="text-center text-[12px] text-[#54656f]">executando…</p>}
            <div ref={fim} />
          </div>

          {passos.length > 0 && (
            <details className="border-t border-black/[0.06] dark:border-white/[0.08] px-4 py-2 text-[12.5px] flex-shrink-0 max-h-48 overflow-y-auto">
              <summary className="cursor-pointer font-medium text-slate-600 dark:text-zinc-300">Passo a passo ({passos.length})</summary>
              <ol className="mt-2 space-y-1">
                {passos.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${p.erro ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    <span>
                      <strong className="font-semibold">{p.rotulo}</strong> <span className="text-slate-500 dark:text-zinc-400">{p.erro || p.resultado}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {modo === 'whatsapp' && (
            <form onSubmit={enviar} className="p-3 flex items-center gap-2 border-t border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite uma mensagem…" className={`${campoClasse} h-10 rounded-full px-4`} />
              <button type="submit" disabled={!texto.trim() || rodando} aria-label="Enviar" className="w-10 h-10 rounded-full bg-rm-acento-medio text-white flex items-center justify-center cursor-pointer disabled:opacity-40 flex-shrink-0">
                <svg className="w-[18px] h-[18px] translate-x-px" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
                </svg>
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
