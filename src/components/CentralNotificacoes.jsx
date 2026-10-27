'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import {
  EVENTO_NOTIFICACOES,
  limparNotificacoes,
  listarNotificacoes,
  marcarLida,
  marcarTodasLidas,
  removerNotificacao,
} from '@/lib/notificacoes';
import { AlertCircleIcon, CalendarIcon, ClockIcon, LightBulbIcon, SparklesIcon, SupportQueueIcon, XMarkIcon } from './Icons';

const MOLA = { type: 'spring', bounce: 0.22, duration: 0.45 };
const ChatIcone = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8.5 8.5 0 0 1-12.6 7.45L3 21l1.55-5.4A8.5 8.5 0 1 1 21 12z" />
  </svg>
);

const TIPOS = {
  demanda: { icone: SupportQueueIcon, cor: 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' },
  sla: { icone: AlertCircleIcon, cor: 'bg-rose-500/12 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400' },
  prazo: { icone: ClockIcon, cor: 'bg-amber-500/14 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400' },
  reuniao: { icone: CalendarIcon, cor: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' },
  feedback: { icone: LightBulbIcon, cor: 'bg-rm-acento/12 text-rm-acento dark:bg-rm-acento-escuro/15 dark:text-rm-acento-vivo' },
  chat: { icone: ChatIcone, cor: 'bg-rm-acento-medio/14 text-rm-acento dark:bg-rm-acento-medio/20 dark:text-rm-acento-vivo' },
  sistema: { icone: SparklesIcon, cor: 'bg-rm-acento/12 text-rm-acento dark:bg-rm-acento-escuro/15 dark:text-rm-acento-vivo' },
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

// Filtros da central: só aparecem os tipos que têm aviso
const FILTROS = [
  { id: 'chat', rotulo: 'Chat', tipos: ['chat'] },
  { id: 'demandas', rotulo: 'Demandas', tipos: ['demanda', 'sla', 'prazo'] },
  { id: 'agenda', rotulo: 'Agenda', tipos: ['reuniao'] },
  { id: 'outros', rotulo: 'Outros', tipos: ['feedback', 'sistema'] },
];

function ItemNotificacao({ n, onAbrir, onRemover, onLida }) {
  const tipo = TIPOS[n.tipo] || TIPOS.sistema;
  const Icone = tipo.icone;
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }} transition={MOLA} className="group relative">
      <button
        type="button"
        onClick={() => onAbrir(n)}
        className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 pr-16 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${tipo.cor}`}>
          <Icone className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`text-[13px] leading-snug truncate ${n.lida ? 'font-medium text-slate-600 dark:text-zinc-300' : 'font-semibold text-[#1d1d1f] dark:text-white'}`}>{n.titulo}</span>
            <span className="ml-auto text-[11px] text-slate-400 dark:text-zinc-500 whitespace-nowrap flex-shrink-0">{tempoRelativo(n.em)}</span>
          </span>
          {n.detalhe && <span className="block text-[12px] leading-snug text-slate-500 dark:text-zinc-400 truncate">{n.detalhe}</span>}
        </span>
        {!n.lida && <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-rm-acento dark:bg-rm-acento-vivo" aria-label="Não lida" />}
      </button>
      {/* Ações ao passar o mouse: marcar como lida (sem abrir) e apagar */}
      <span className="absolute top-1/2 -translate-y-1/2 right-1.5 flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {!n.lida && (
          <button
            type="button"
            onClick={() => onLida(n.id)}
            aria-label={`Marcar como lida: ${n.titulo}`}
            title="Marcar como lida"
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rm-acento dark:hover:text-rm-acento-vivo hover:bg-black/[0.06] dark:hover:bg-white/[0.1] cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemover(n.id)}
          aria-label={`Apagar notificação: ${n.titulo}`}
          title="Apagar"
          className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.1] cursor-pointer"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      </span>
    </motion.li>
  );
}

/**
 * Central com as últimas notificações do sistema.
 *  embutido: sino dentro do cabeçalho (computador), painel abre para baixo
 *  soCelular: botão flutuante só no celular, acima da barra de navegação inferior
 */
export default function CentralNotificacoes({ onAbrirAba, embutido = false, soCelular = false }) {
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState('todas');
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

  // Fechar não marca tudo como lido: cada aviso fica não lido até ser aberto, marcado (✓) ou "Marcar lidas"
  const fechar = () => setAberto(false);

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
    marcarLida(n.id);
    setAberto(false);
    if (n.aba) onAbrirAba?.(n.aba);
    // Aviso do Chat: abre a conversa (já aberta a tela, na hora; senão, quando ela montar)
    if (n.alvo?.conversaId) {
      window.__rmChatAbrirPendente = n.alvo.conversaId;
      window.dispatchEvent(new CustomEvent('rm_chat_abrir', { detail: { conversaId: n.alvo.conversaId } }));
    }
  };

  const filtrosVisiveis = FILTROS.filter((f) => lista.some((n) => f.tipos.includes(n.tipo)));
  const ativo = filtrosVisiveis.find((f) => f.id === filtro);
  const visiveis = ativo ? lista.filter((n) => ativo.tipos.includes(n.tipo)) : lista;

  return (
    <div ref={raiz} className={embutido ? 'relative' : `fixed z-40 right-4 bottom-[88px] sm:right-6 sm:bottom-6 ${soCelular ? 'sm:hidden' : ''}`}>
      <AnimatePresence>
        {aberto && (
          <motion.div
            role="dialog"
            aria-label="Notificações"
            initial={{ opacity: 0, y: embutido ? -10 : 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: embutido ? -6 : 8, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', bounce: 0.16, duration: 0.42 }}
            style={{ transformOrigin: embutido ? 'top right' : 'bottom right' }}
            className={`absolute right-0 ${embutido ? 'top-[calc(100%+16px)] -mr-2' : 'bottom-[calc(100%+12px)]'} w-[min(380px,calc(100vw-32px))] max-h-[min(560px,70vh)] flex flex-col rounded-[24px] bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.12] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.35)] dark:shadow-[0_30px_70px_-20px_rgba(0,0,0,0.8)] text-[#1d1d1f] dark:text-[#f5f5f7] overflow-hidden`}
          >
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight">Notificações</h2>
                <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                  {lista.length === 0 ? 'Nada por aqui' : pendentes ? `${pendentes} ${pendentes === 1 ? 'nova' : 'novas'}` : 'Tudo lido'}
                </p>
              </div>
              {lista.length > 0 && (
                <div className="flex items-center gap-1">
                  {pendentes > 0 && (
                    <button type="button" onClick={marcarTodasLidas} className="h-8 px-3 rounded-full text-[12.5px] font-medium text-slate-600 dark:text-zinc-300 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer transition-colors">
                      Marcar lidas
                    </button>
                  )}
                  <button type="button" onClick={limparNotificacoes} className="h-8 px-3 rounded-full text-[12.5px] font-medium text-slate-600 dark:text-zinc-300 hover:text-[#1d1d1f] dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.07] hover:bg-black/[0.07] dark:hover:bg-white/[0.11] cursor-pointer transition-colors">
                    Limpar
                  </button>
                </div>
              )}
            </div>

            {filtrosVisiveis.length > 1 && (
              <div className="flex-shrink-0 flex flex-wrap gap-1 px-4 pb-3" role="tablist" aria-label="Filtrar notificações">
                {[{ id: 'todas', rotulo: 'Todas' }, ...filtrosVisiveis].map((f) => {
                  const qtd = f.id === 'todas' ? pendentes : lista.filter((n) => !n.lida && f.tipos.includes(n.tipo)).length;
                  const sel = (ativo?.id || 'todas') === f.id;
                  return (
                    <button key={f.id} type="button" role="tab" aria-selected={sel} onClick={() => setFiltro(f.id)} className={`h-7 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors ${sel ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'bg-black/[0.04] dark:bg-white/[0.07] text-slate-600 dark:text-zinc-300 hover:bg-black/[0.07]'}`}>
                      {f.rotulo}
                      {qtd > 0 && <span className="ml-1.5 tabular-nums opacity-70">{qtd}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex-shrink-0 h-px bg-black/[0.06] dark:bg-white/[0.08]" />

            {lista.length === 0 ? (
              <div className="px-6 py-12 flex flex-col items-center text-center">
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={MOLA}
                  className="w-14 h-14 rounded-full bg-rm-acento/10 dark:bg-rm-acento-escuro/12 text-rm-acento dark:text-rm-acento-vivo flex items-center justify-center"
                >
                  <Sino className="w-6 h-6" />
                </motion.span>
                <p className="mt-4 text-[14px] font-semibold">Tudo em dia</p>
                <p className="mt-1 text-[12.5px] text-slate-500 dark:text-zinc-400 max-w-[240px]">
                  Avisos de SLA, prazos, novas demandas e reuniões aparecem aqui.
                </p>
              </div>
            ) : (
              <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1.5 py-1.5">
                <AnimatePresence initial={false}>
                  {visiveis.map((n) => (
                    <ItemNotificacao key={n.id} n={n} onAbrir={abrirNotificacao} onRemover={removerNotificacao} onLida={marcarLida} />
                  ))}
                </AnimatePresence>
              </ul>
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
        className={
          embutido
            ? `relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-acento/40 ${
                aberto ? 'bg-black/[0.06] dark:bg-white/[0.12] text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.08]'
              }`
            : `relative w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-pointer backdrop-blur-2xl ring-1 transition-colors shadow-[0_14px_34px_-10px_rgba(0,0,0,0.35)] dark:shadow-[0_14px_34px_-10px_rgba(0,0,0,0.8)] ${
                aberto
                  ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] ring-transparent'
                  : 'bg-white/85 dark:bg-rm-elevado-escuro/85 text-[#1d1d1f] dark:text-white ring-black/[0.08] dark:ring-white/[0.12]'
              }`
        }
      >
        <motion.span animate={sino} style={{ originY: 0.15 }} className="flex">
          <Sino className={embutido ? 'w-[19px] h-[19px]' : 'w-[22px] h-[22px]'} />
        </motion.span>
        <AnimatePresence>
          {pendentes > 0 && (
            <motion.span
              key="contador"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={MOLA}
              className={`absolute ${embutido ? 'top-0.5 right-0.5 min-w-[16px] h-4 px-1 text-[10px] ring-white dark:ring-[#232326]' : '-top-0.5 -right-0.5 min-w-[20px] h-5 px-1.5 text-[11px] ring-[#f5f5f7] dark:ring-[#141416]'} rounded-full bg-rose-500 text-white font-semibold flex items-center justify-center ring-2 tabular-nums`}
            >
              {pendentes > 99 ? '99+' : pendentes}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
