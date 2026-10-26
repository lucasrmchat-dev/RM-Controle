'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import {
  EVENTO_NOTIFICACOES,
  limparNotificacoes,
  listarNotificacoes,
  marcarTodasLidas,
  removerNotificacao,
} from '@/lib/notificacoes';
import { AlertCircleIcon, CalendarIcon, ClockIcon, LightBulbIcon, SparklesIcon, SupportQueueIcon, XMarkIcon } from './Icons';

const MOLA = { type: 'spring', bounce: 0.22, duration: 0.45 };

const TIPOS = {
  demanda: { icone: SupportQueueIcon, cor: 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' },
  sla: { icone: AlertCircleIcon, cor: 'bg-rose-500/12 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400' },
  prazo: { icone: ClockIcon, cor: 'bg-amber-500/14 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400' },
  reuniao: { icone: CalendarIcon, cor: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' },
  feedback: { icone: LightBulbIcon, cor: 'bg-[#4d7c0f]/12 text-[#4d7c0f] dark:bg-[#84cc16]/15 dark:text-[#a3e635]' },
  sistema: { icone: SparklesIcon, cor: 'bg-[#4d7c0f]/12 text-[#4d7c0f] dark:bg-[#84cc16]/15 dark:text-[#a3e635]' },
};

function tempoRelativo(iso) {
  const seg = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return 'agora';
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

const Sino = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

function ItemNotificacao({ n, onAbrir, onRemover }) {
  const tipo = TIPOS[n.tipo] || TIPOS.sistema;
  const Icone = tipo.icone;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={MOLA}
      className="group relative"
    >
      <button
        type="button"
        onClick={() => onAbrir(n)}
        className="w-full text-left flex gap-3 px-3 py-3 pr-10 rounded-2xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tipo.cor}`}>
          <Icone className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {!n.lida && <span className="w-1.5 h-1.5 rounded-full bg-[#4d7c0f] dark:bg-[#a3e635] flex-shrink-0" aria-label="Não lida" />}
            <span className="text-[13px] font-semibold leading-snug text-[#1d1d1f] dark:text-white truncate">{n.titulo}</span>
          </span>
          {n.detalhe && <span className="block text-[12.5px] leading-snug text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{n.detalhe}</span>}
          <span className="block text-[11.5px] text-slate-400 dark:text-zinc-500 mt-1">{tempoRelativo(n.em)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onRemover(n.id)}
        aria-label={`Apagar notificação: ${n.titulo}`}
        className="absolute top-3 right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.1] cursor-pointer md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </motion.li>
  );
}

/**
 * Botão flutuante com as últimas notificações do sistema, visível em todas as telas.
 * No celular fica acima da barra de navegação inferior.
 */
export default function CentralNotificacoes({ onAbrirAba }) {
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const raiz = useRef(null);
  const sino = useAnimationControls();
  const totalAnterior = useRef(null);

  useEffect(() => {
    const atualizar = () => setLista(listarNotificacoes());
    atualizar();
    window.addEventListener(EVENTO_NOTIFICACOES, atualizar);
    // Outra aba do navegador também atualiza
    window.addEventListener('storage', atualizar);
    // Atualiza o "há x min"
    const relogio = setInterval(atualizar, 60000);
    return () => {
      window.removeEventListener(EVENTO_NOTIFICACOES, atualizar);
      window.removeEventListener('storage', atualizar);
      clearInterval(relogio);
    };
  }, []);

  const pendentes = lista.filter((n) => !n.lida).length;

  // Balança o sino quando chega algo novo
  useEffect(() => {
    if (totalAnterior.current !== null && pendentes > totalAnterior.current) {
      sino.start({ rotate: [0, -16, 13, -9, 6, -3, 0], transition: { duration: 0.8, ease: 'easeInOut' } });
    }
    totalAnterior.current = pendentes;
  }, [pendentes, sino]);

  const fechar = () => {
    setAberto(false);
    marcarTodasLidas();
  };

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (raiz.current && !raiz.current.contains(e.target)) fechar();
    };
    const tecla = (e) => e.key === 'Escape' && fechar();
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const abrirNotificacao = (n) => {
    fechar();
    if (n.aba) onAbrirAba?.(n.aba);
  };

  const novas = lista.filter((n) => !n.lida);
  const anteriores = lista.filter((n) => n.lida);

  return (
    <div ref={raiz} className="fixed z-40 right-4 bottom-[88px] md:right-6 md:bottom-6">
      <AnimatePresence>
        {aberto && (
          <motion.div
            role="dialog"
            aria-label="Notificações"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', bounce: 0.16, duration: 0.42 }}
            style={{ transformOrigin: 'bottom right' }}
            className="absolute right-0 bottom-[calc(100%+12px)] w-[min(380px,calc(100vw-32px))] max-h-[min(560px,70vh)] flex flex-col rounded-[24px] bg-white/95 dark:bg-[#232326]/95 backdrop-blur-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.12] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.35)] dark:shadow-[0_30px_70px_-20px_rgba(0,0,0,0.8)] text-[#1d1d1f] dark:text-[#f5f5f7] overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight">Notificações</h2>
                <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                  {lista.length === 0 ? 'Nada por aqui' : pendentes ? `${pendentes} ${pendentes === 1 ? 'nova' : 'novas'}` : 'Tudo lido'}
                </p>
              </div>
              {lista.length > 0 && (
                <button
                  type="button"
                  onClick={limparNotificacoes}
                  className="h-8 px-3 rounded-full text-[12.5px] font-medium text-slate-600 dark:text-zinc-300 hover:text-[#1d1d1f] dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.07] hover:bg-black/[0.07] dark:hover:bg-white/[0.11] cursor-pointer transition-colors"
                >
                  Limpar tudo
                </button>
              )}
            </div>

            <div className="h-px bg-black/[0.06] dark:bg-white/[0.08]" />

            {lista.length === 0 ? (
              <div className="px-6 py-12 flex flex-col items-center text-center">
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={MOLA}
                  className="w-14 h-14 rounded-full bg-[#4d7c0f]/10 dark:bg-[#84cc16]/12 text-[#4d7c0f] dark:text-[#a3e635] flex items-center justify-center"
                >
                  <Sino className="w-6 h-6" />
                </motion.span>
                <p className="mt-4 text-[14px] font-semibold">Tudo em dia</p>
                <p className="mt-1 text-[12.5px] text-slate-500 dark:text-zinc-400 max-w-[240px]">
                  Avisos de SLA, prazos, novas demandas e reuniões aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto overscroll-contain px-2 py-2">
                {[
                  ['Novas', novas],
                  ['Anteriores', anteriores],
                ].map(
                  ([titulo, itens]) =>
                    itens.length > 0 && (
                      <section key={titulo} className="mb-1">
                        <h3 className="px-3 pt-2 pb-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-zinc-500">{titulo}</h3>
                        <ul>
                          <AnimatePresence initial={false}>
                            {itens.map((n) => (
                              <ItemNotificacao key={n.id} n={n} onAbrir={abrirNotificacao} onRemover={removerNotificacao} />
                            ))}
                          </AnimatePresence>
                        </ul>
                      </section>
                    )
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-label={pendentes ? `Notificações, ${pendentes} novas` : 'Notificações'}
        aria-expanded={aberto}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={MOLA}
        className={`relative w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-pointer backdrop-blur-2xl ring-1 transition-colors shadow-[0_14px_34px_-10px_rgba(0,0,0,0.35)] dark:shadow-[0_14px_34px_-10px_rgba(0,0,0,0.8)] ${
          aberto
            ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] ring-transparent'
            : 'bg-white/85 dark:bg-[#26262a]/85 text-[#1d1d1f] dark:text-white ring-black/[0.08] dark:ring-white/[0.12]'
        }`}
      >
        <motion.span animate={sino} style={{ originY: 0.15 }} className="flex">
          <Sino className="w-[22px] h-[22px]" />
        </motion.span>
        <AnimatePresence>
          {pendentes > 0 && (
            <motion.span
              key="contador"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={MOLA}
              className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-[#f5f5f7] dark:ring-[#141416] tabular-nums"
            >
              {pendentes > 99 ? '99+' : pendentes}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
