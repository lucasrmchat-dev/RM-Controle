'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ROTULO_STATUS_PEDIDO, STATUS_ABERTOS, textoPrazo } from '@/lib/pedidosTratativa';

// ------------------------------------------------------------------------------
// Cantinho dos pedidos de tratativa (topo da tela de Demandas):
//  - "Para você": o gestor pediu que você trate uma demanda sua. Concluir, cancelar, pôr em espera ou explicar.
//  - "Que você pediu": como estão os pedidos que você fez (e dá para retirar).
// ------------------------------------------------------------------------------
const BTN = 'h-9 px-4 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors';
const BTN_SUAVE = `${BTN} bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white`;
const BTN_FORTE = `${BTN} bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90`;

const nomeCurto = (n, e) => String(n || e || 'O gestor').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0];

function CartaoParaVoce({ pedido, chamado, acoes, onResponder }) {
  const [respondendo, setRespondendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const venceTexto = pedido.prazo_em ? ` · ${textoPrazo(pedido.prazo_em)}${pedido.acao_prazo ? `, depois ${pedido.acao_prazo === 'concluir' ? 'conclui' : 'cancela'} sozinha` : ''}` : '';
  const atrasado = pedido.prazo_em && new Date(pedido.prazo_em).getTime() < Date.now();

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await onResponder(pedido.id, texto.trim());
      setRespondendo(false);
      setTexto('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="rounded-[22px] bg-amber-500/[0.09] dark:bg-amber-400/[0.1] ring-1 ring-amber-500/25 dark:ring-amber-400/25 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[16px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">{pedido.chamado?.empresa_nome}</span>
        <span className={`text-[12.5px] ${atrasado ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-500 dark:text-zinc-400'}`}>
          {nomeCurto(pedido.solicitante_nome, pedido.solicitante_email)} pediu a tratativa{venceTexto}
        </span>
      </div>
      {pedido.mensagem && <p className="mt-1.5 text-[14px] text-[#1d1d1f] dark:text-white">“{pedido.mensagem}”</p>}
      {pedido.chamado?.observacao_inicial && <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400 line-clamp-1">{pedido.chamado.observacao_inicial}</p>}
      {pedido.status === 'respondido' && pedido.resposta && <p className="mt-1.5 text-[13px] text-slate-600 dark:text-zinc-300">Você respondeu: {pedido.resposta}</p>}

      {chamado ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => acoes.concluir(chamado)} className={BTN_FORTE}>
            Concluir
          </button>
          <button type="button" onClick={() => acoes.aguardarCliente(chamado)} className={BTN_SUAVE}>
            Colocar em espera
          </button>
          <button type="button" onClick={() => setRespondendo((v) => !v)} className={BTN_SUAVE}>
            {pedido.status === 'respondido' ? 'Responder de novo' : 'Responder'}
          </button>
          <button type="button" onClick={() => acoes.cancelar(chamado)} className={`${BTN} text-rose-600 dark:text-rose-400 hover:bg-rose-500/10`}>
            Cancelar demanda
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500 dark:text-zinc-400">Essa demanda não está na sua lista agora.</p>
      )}

      <AnimatePresence initial={false}>
        {respondendo && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                maxLength={500}
                placeholder="Explique em uma frase (o gestor vai ver)"
                className="flex-1 min-w-0 h-10 px-4 rounded-full text-[14px] bg-white dark:bg-white/[0.07] ring-1 ring-black/[0.1] dark:ring-white/[0.14] outline-none focus:ring-2 focus:ring-rm-acento-medio"
              />
              <button type="button" onClick={enviar} disabled={enviando || !texto.trim()} className={`${BTN_FORTE} disabled:opacity-50`}>
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default function PedidosTratativaFaixa({ pedidos = [], chamados = [], souResponsavel, emailAtual, acoes, onResponder, onRetirar }) {
  const [, tic] = useState(0);
  // Atualiza o "vence em…" sem recarregar a lista
  useEffect(() => {
    const t = setInterval(() => tic((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const porId = new Map(chamados.map((c) => [String(c.id), c]));
  const meuEmail = String(emailAtual || '').toLowerCase().trim();

  const paraMim = pedidos.filter((p) => STATUS_ABERTOS.includes(p.status) && p.chamado && souResponsavel(p.chamado));
  const meus = pedidos.filter((p) => String(p.solicitante_email || '').toLowerCase() === meuEmail);
  if (!paraMim.length && !meus.length) return null;

  return (
    <section aria-label="Pedidos de tratativa" className="space-y-3">
      {paraMim.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Pedidos para você · {paraMim.length}
          </h3>
          <ul className={`grid gap-2.5 ${paraMim.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            <AnimatePresence initial={false}>
              {paraMim.map((p) => (
                <CartaoParaVoce key={p.id} pedido={p} chamado={porId.get(String(p.chamado_id))} acoes={acoes} onResponder={onResponder} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {meus.length > 0 && (
        <div>
          <h3 className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Pedidos que você fez</h3>
          <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08] border-y border-black/[0.06] dark:border-white/[0.08]">
            {meus.map((p) => {
              const aberto = STATUS_ABERTOS.includes(p.status);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                  <span className="font-semibold text-[#1d1d1f] dark:text-white">{p.chamado?.empresa_nome || 'Demanda'}</span>
                  <span className="text-slate-500 dark:text-zinc-400">com {nomeCurto(p.responsavel_nome, p.responsavel_email)}</span>
                  <span className={aberto ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-zinc-400'}>{ROTULO_STATUS_PEDIDO[p.status] || p.status}</span>
                  {aberto && <span className="text-slate-400 dark:text-zinc-500">{textoPrazo(p.prazo_em)}</span>}
                  {p.status === 'respondido' && p.resposta && <span className="basis-full text-slate-600 dark:text-zinc-300">Resposta: {p.resposta}</span>}
                  {aberto && (
                    <button type="button" onClick={() => onRetirar(p.id)} className="ml-auto text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white hover:underline cursor-pointer">
                      Retirar pedido
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
