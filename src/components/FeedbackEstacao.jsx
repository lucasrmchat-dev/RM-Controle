'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { atualizarDetalhesFeedback, getNomeTecnico } from '@/lib/storage';
import {
  ETAPAS_FEEDBACK,
  TIPOS_FEEDBACK,
  briefingImplementacao,
  diasAtePrazo,
  etapaDe,
  novaSubtarefa,
  prazoVencido,
  progressoSubtarefas,
  tipoFeedback,
} from '@/lib/feedbacks';
import { NOVIDADES, novidadesDoFeedback, rotuloTicket } from '@/lib/novidades';
import { CalendarioMes, rotuloData } from './SeletoresTempo';
import { showToast } from './ToastNotification';
import { CalendarIcon, CheckIcon, CopyIcon, TrashIcon, XMarkIcon } from './Icons';

const MOLA = { type: 'spring', bounce: 0.16, duration: 0.45 };
const dataLonga = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : '—');

const PONTO_ETAPA = {
  em_analise: 'bg-amber-500',
  no_roadmap: 'bg-violet-500',
  em_correcao: 'bg-sky-500',
  resolvido: 'bg-[#4d7c0f] dark:bg-[#84cc16]',
};

const diasAberto = (iso) => {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000));
  return d === 0 ? 'Aberto hoje' : d === 1 ? 'Aberto há 1 dia' : `Aberto há ${d} dias`;
};

const nomePessoa = (email) => (email ? getNomeTecnico(email) || email : 'alguém da equipe');

/** "Vence hoje", "Vence em 3 dias", "Venceu há 2 dias" */
export function textoPrazo(prazo) {
  const d = diasAtePrazo(prazo);
  if (d === null) return 'Sem prazo';
  if (d === 0) return 'Vence hoje';
  if (d === 1) return 'Vence amanhã';
  if (d > 1) return `${rotuloData(prazo)} · em ${d} dias`;
  return d === -1 ? 'Venceu ontem' : `Venceu há ${-d} dias`;
}

export function corPrazo(prazo, concluido = false) {
  if (!prazo || concluido) return 'text-slate-500 dark:text-zinc-400';
  if (prazoVencido(prazo)) return 'text-rose-600 dark:text-rose-400';
  return diasAtePrazo(prazo) <= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-zinc-300';
}

async function copiarTexto(texto, mensagem) {
  try {
    await navigator.clipboard.writeText(texto);
    showToast(mensagem, 'success');
  } catch {
    showToast('O navegador não deixou copiar. Selecione o texto e copie manualmente.', 'error');
  }
}

// Copia o print como imagem (PNG), pronto para colar em qualquer conversa
async function copiarImagem(dataUrl) {
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Print copiado. É só colar.', 'success');
  } catch {
    showToast('O navegador não deixou copiar a imagem. Use "Ampliar" e salve a imagem.', 'error');
  }
}

// ------------------------------------------------------------------------------
// Peças
// ------------------------------------------------------------------------------
function Painel({ titulo, acao, children, className = '' }) {
  return (
    <section className={`rounded-[24px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.08] ${className}`}>
      {titulo && (
        <header className="flex items-center justify-between gap-3 px-6 pt-5">
          <h2 className="text-[13px] font-semibold tracking-tight text-slate-500 dark:text-zinc-400">{titulo}</h2>
          {acao}
        </header>
      )}
      <div className="px-6 pb-6 pt-3">{children}</div>
    </section>
  );
}

function BotaoSutil({ onClick, children, icone: Icone = CopyIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-3 rounded-full text-[12.5px] font-medium text-slate-600 dark:text-zinc-300 hover:text-[#1d1d1f] dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.07] hover:bg-black/[0.07] dark:hover:bg-white/[0.11] cursor-pointer transition-colors flex items-center gap-1.5"
    >
      {Icone && <Icone className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

/** Escolha de dia que abre o calendário logo abaixo. */
function SeletorPrazo({ valor, onMudar, desabilitado, compacto = false, concluido = false }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={`inline-flex items-center gap-1.5 rounded-full transition-colors disabled:cursor-default ${
          compacto ? 'h-6 px-2 text-[11.5px]' : 'h-9 px-3.5 text-[13px] font-medium ring-1 ring-black/[0.1] dark:ring-white/[0.12]'
        } ${desabilitado ? '' : 'cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'} ${corPrazo(valor, concluido)}`}
      >
        <CalendarIcon className={compacto ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        {valor ? textoPrazo(valor) : compacto ? 'Prazo' : desabilitado ? 'Sem prazo' : 'Definir prazo'}
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
            <div className="pt-2 max-w-[320px]">
              <CalendarioMes
                valor={valor || ''}
                onMudar={(iso) => {
                  onMudar(iso);
                  setAberto(false);
                }}
              />
              {valor && (
                <button
                  type="button"
                  onClick={() => {
                    onMudar(null);
                    setAberto(false);
                  }}
                  className="mt-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/[0.08] cursor-pointer"
                >
                  Remover prazo
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LinhaSubtarefa({ st, podeEditar, onAlterar, onExcluir }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(st.titulo);
  const feita = Boolean(st.concluida_em);
  useEffect(() => setTexto(st.titulo), [st.titulo]);
  const salvarTexto = () => {
    setEditando(false);
    const t = texto.trim();
    if (t && t !== st.titulo) onAlterar({ ...st, titulo: t });
    else setTexto(st.titulo);
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex gap-3 py-3">
      <button
        type="button"
        disabled={!podeEditar}
        onClick={() => onAlterar({ ...st, concluida_em: feita ? null : new Date().toISOString() })}
        aria-label={feita ? `Reabrir: ${st.titulo}` : `Concluir: ${st.titulo}`}
        className={`mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${podeEditar ? 'cursor-pointer' : 'cursor-default'} ${
          feita ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950' : 'ring-[1.5px] ring-black/25 dark:ring-white/30 hover:ring-[#4d7c0f]'
        }`}
      >
        {feita && <CheckIcon className="w-3 h-3 stroke-[3]" />}
      </button>
      <div className="min-w-0 flex-1">
        {editando ? (
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={salvarTexto}
            onKeyDown={(e) => {
              if (e.key === 'Enter') salvarTexto();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setTexto(st.titulo);
                setEditando(false);
              }
            }}
            maxLength={200}
            className="w-full bg-transparent text-[14px] leading-snug outline-none border-b border-[#4d7c0f]/50 pb-0.5"
          />
        ) : (
          <button
            type="button"
            disabled={!podeEditar}
            onClick={() => setEditando(true)}
            title={podeEditar ? 'Clique para editar' : undefined}
            className={`text-left text-[14px] leading-snug ${podeEditar ? 'cursor-text' : 'cursor-default'} ${feita ? 'line-through text-slate-400 dark:text-zinc-500' : 'text-[#1d1d1f] dark:text-white'}`}
          >
            {st.titulo}
          </button>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-400 dark:text-zinc-500">
          <span>Criada {dataHora(st.criada_em)}</span>
          {feita && <span className="text-[#4d7c0f] dark:text-[#a3e635]">Concluída {dataHora(st.concluida_em)}</span>}
        </div>
        <div className="mt-1 -ml-2">
          <SeletorPrazo compacto valor={st.prazo} concluido={feita} desabilitado={!podeEditar} onMudar={(prazo) => onAlterar({ ...st, prazo })} />
        </div>
      </div>
      {podeEditar && (
        <button
          type="button"
          onClick={() => onExcluir(st)}
          aria-label={`Excluir subtarefa: ${st.titulo}`}
          className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-500/[0.08] cursor-pointer md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.li>
  );
}

function Anel({ fracao }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90 flex-shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-black/[0.07] dark:stroke-white/[0.1]" />
      <motion.circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-[#4d7c0f] dark:stroke-[#84cc16]" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - fracao) }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
    </svg>
  );
}

// ------------------------------------------------------------------------------
// Estação de trabalho
// ------------------------------------------------------------------------------
/**
 * Tela inteira de um ticket de feedback. Na área de desenvolvimento é o lugar de trabalhar
 * (etapa, prazo, subtarefas, briefing para implementar); para os demais, o ticket como foi escrito.
 */
export default function FeedbackEstacao({ fb, lista = [], onNavegar, onFechar, nomesEtapas, podeEditar, userEmail, onMudarEtapa }) {
  const [montado, setMontado] = useState(false);
  const [novaTexto, setNovaTexto] = useState('');
  const [novaPrazo, setNovaPrazo] = useState(null);
  const [ampliar, setAmpliar] = useState(false);
  const [briefingAberto, setBriefingAberto] = useState(false);
  const campoNova = useRef(null);
  const rolagem = useRef(null);

  useEffect(() => setMontado(true), []);

  // Trava a página por baixo enquanto a estação está aberta
  useEffect(() => {
    if (!fb) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [Boolean(fb)]);

  const posicao = fb ? lista.indexOf(fb.id) : -1;
  const anteriorId = posicao > 0 ? lista[posicao - 1] : null;
  const proximoId = posicao >= 0 && posicao < lista.length - 1 ? lista[posicao + 1] : null;

  useEffect(() => {
    if (!fb) return;
    const tecla = (e) => {
      const digitando = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
      if (e.key === 'Escape') return ampliar ? setAmpliar(false) : onFechar();
      if (digitando) return;
      if ((e.key === 'ArrowDown' || e.key === 'j') && proximoId) onNavegar(proximoId);
      if ((e.key === 'ArrowUp' || e.key === 'k') && anteriorId) onNavegar(anteriorId);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fb, ampliar, onFechar, onNavegar, anteriorId, proximoId]);

  useEffect(() => {
    setNovaTexto('');
    setNovaPrazo(null);
    setBriefingAberto(false);
    rolagem.current?.scrollTo({ top: 0 });
  }, [fb?.id]);

  const subtarefas = Array.isArray(fb?.subtarefas) ? fb.subtarefas : [];
  const prog = progressoSubtarefas(subtarefas);
  const etapa = fb ? etapaDe(fb) : null;
  const indiceEtapa = ETAPAS_FEEDBACK.indexOf(etapa);
  const ticket = fb ? rotuloTicket(fb) : '';
  const autor = fb ? fb.autor_nome || nomePessoa(fb.autor_email) : '';
  const entregas = useMemo(() => novidadesDoFeedback(fb, NOVIDADES), [fb]);
  const briefing = fb ? briefingImplementacao(fb, { nomesEtapas, ticket, autor }) : '';

  // Linha do tempo: abertura, mudanças de etapa, subtarefas e entregas
  const atividade = useMemo(() => {
    if (!fb) return [];
    const eventos = [{ em: fb.created_at, texto: `${autor} abriu o ticket`, cor: 'bg-[#1d1d1f] dark:bg-white' }];
    (fb.historico || []).forEach((h) => eventos.push({ em: h.em, texto: `${nomePessoa(h.por)} moveu para "${nomesEtapas[h.etapa] || h.etapa}"`, cor: PONTO_ETAPA[h.etapa] || 'bg-slate-400' }));
    subtarefas.forEach((s) => {
      eventos.push({ em: s.criada_em, texto: `Subtarefa criada: ${s.titulo}`, cor: 'bg-slate-300 dark:bg-zinc-600' });
      if (s.concluida_em) eventos.push({ em: s.concluida_em, texto: `Subtarefa concluída: ${s.titulo}`, cor: 'bg-[#4d7c0f] dark:bg-[#84cc16]' });
    });
    entregas.forEach((n) => eventos.push({ em: `${n.data}T12:00:00`, texto: `Entregue na novidade "${n.titulo}"`, cor: 'bg-[#4d7c0f] dark:bg-[#84cc16]' }));
    return eventos.filter((e) => e.em).sort((a, b) => new Date(b.em) - new Date(a.em));
  }, [fb, subtarefas, entregas, nomesEtapas, autor]);

  if (!montado) return null;

  const salvar = async (campos, sucesso) => {
    try {
      await atualizarDetalhesFeedback(fb.id, campos, userEmail);
      if (sucesso) showToast(sucesso, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const adicionar = (e) => {
    e.preventDefault();
    try {
      const st = novaSubtarefa(novaTexto, { prazo: novaPrazo, autor: userEmail });
      salvar({ subtarefas: [...subtarefas, st] });
      setNovaTexto('');
      setNovaPrazo(null);
      campoNova.current?.focus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const alterar = (st) => salvar({ subtarefas: subtarefas.map((s) => (s.id === st.id ? st : s)) });
  const excluir = (st) => salvar({ subtarefas: subtarefas.filter((s) => s.id !== st.id) }, 'Subtarefa excluída.');

  const tipo = fb ? TIPOS_FEEDBACK[tipoFeedback(fb.tipo)] : null;
  const prioridade = fb?.prioridade === 'critica' ? 'Impede o trabalho' : fb?.prioridade === 'alta' ? 'Prioridade alta' : 'Prioridade normal';

  return createPortal(
    <AnimatePresence>
      {fb && (
        <motion.div
          key="estacao"
          role="dialog"
          aria-modal="true"
          aria-labelledby="estacao-titulo"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.16 } }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9990] bg-[#f5f5f7] dark:bg-[#141416] text-[#1d1d1f] dark:text-[#f5f5f7] flex flex-col"
        >
          {/* Barra superior */}
          <div className="flex-shrink-0 h-16 px-4 sm:px-8 flex items-center gap-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-[#1c1c1f]/70 backdrop-blur-2xl">
            <button type="button" onClick={onFechar} className="h-9 pl-2.5 pr-3.5 rounded-full text-[13.5px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Feedbacks
            </button>
            <span className="h-5 w-px bg-black/[0.1] dark:bg-white/[0.12]" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold tabular-nums">Ticket {ticket}</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-zinc-400">
              <span className={`w-1.5 h-1.5 rounded-full ${PONTO_ETAPA[etapa]}`} />
              {nomesEtapas[etapa]}
            </span>

            <div className="ml-auto flex items-center gap-2">
              {lista.length > 1 && posicao >= 0 && (
                <div className="hidden md:flex items-center gap-1 mr-1">
                  <span className="text-[12px] text-slate-400 tabular-nums mr-1">
                    {posicao + 1} de {lista.length}
                  </span>
                  {[
                    ['Ticket anterior (↑)', anteriorId, 'm18 15-6-6-6 6'],
                    ['Próximo ticket (↓)', proximoId, 'm6 9 6 6 6-6'],
                  ].map(([rotulo, alvo, d]) => (
                    <button key={rotulo} type="button" disabled={!alvo} onClick={() => onNavegar(alvo)} aria-label={rotulo} title={rotulo} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer disabled:opacity-30 disabled:cursor-default">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={d} />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
              {podeEditar && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => copiarTexto(briefing, 'Ticket copiado com o relato original. É só colar para implementar.')}
                  className="h-10 px-4 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[13.5px] font-semibold cursor-pointer flex items-center gap-2 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)]"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Copiar para implementar</span>
                  <span className="sm:hidden">Copiar</span>
                </motion.button>
              )}
              <button type="button" onClick={onFechar} aria-label="Fechar" className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div ref={rolagem} className="flex-1 overflow-y-auto overscroll-contain">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={fb.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 lg:py-10">
                {/* Cabeçalho do ticket */}
                <div className="max-w-4xl">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500 dark:text-zinc-400">
                    <span className="font-medium text-[#1d1d1f] dark:text-white">{tipo.rotulo}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fb.modulo_afetado || 'Geral'}</span>
                    <span aria-hidden="true">·</span>
                    <span className={fb.prioridade === 'critica' ? 'text-rose-600 dark:text-rose-400 font-medium' : fb.prioridade === 'alta' ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>{prioridade}</span>
                  </p>
                  <h1 id="estacao-titulo" className="mt-2 text-[30px] sm:text-[38px] font-semibold tracking-[-0.03em] leading-[1.1]">
                    {fb.titulo}
                  </h1>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[12px] font-semibold flex items-center justify-center flex-shrink-0">
                      {String(autor)
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                    <p className="text-[13.5px] leading-tight">
                      <span className="font-semibold">{autor}</span>
                      <span className="block text-slate-500 dark:text-zinc-400 mt-0.5">
                        abriu em {dataLonga(fb.created_at)} às {hora(fb.created_at)}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Etapas */}
                <div className="mt-8 grid grid-cols-4 gap-2 max-w-4xl" role="group" aria-label="Etapa do ticket">
                  {ETAPAS_FEEDBACK.map((id, i) => {
                    const passou = i <= indiceEtapa;
                    const atual = i === indiceEtapa;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!podeEditar || atual}
                        onClick={() => onMudarEtapa(fb.id, id)}
                        aria-current={atual ? 'step' : undefined}
                        className={`group/etapa text-left ${podeEditar && !atual ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <span className="block h-1.5 rounded-full bg-black/[0.07] dark:bg-white/[0.09] overflow-hidden">
                          <motion.span className={`block h-full rounded-full ${id === 'resolvido' && passou ? 'bg-[#4d7c0f] dark:bg-[#84cc16]' : 'bg-[#1d1d1f] dark:bg-white'}`} initial={false} animate={{ width: passou ? '100%' : '0%' }} transition={{ duration: 0.45, delay: passou ? i * 0.06 : 0, ease: [0.16, 1, 0.3, 1] }} />
                        </span>
                        <span className={`mt-2.5 flex items-center gap-1.5 text-[12.5px] leading-tight ${atual ? 'font-semibold text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 group-hover/etapa:text-[#1d1d1f] dark:group-hover/etapa:text-white'}`}>
                          <span className="text-slate-400 tabular-nums">{i + 1}</span>
                          {nomesEtapas[id]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
                  {/* Coluna principal */}
                  <div className="space-y-6 min-w-0">
                    <Painel titulo="Relato original" acao={<BotaoSutil onClick={() => copiarTexto(fb.descricao || '', 'Texto do relato copiado.')}>Copiar texto</BotaoSutil>}>
                      <p className="text-[16px] leading-[1.7] text-[#1d1d1f] dark:text-zinc-100 whitespace-pre-wrap break-words">{fb.descricao}</p>
                      <p className="mt-4 text-[12px] text-slate-400 dark:text-zinc-500">Exatamente como {autor.split(' ')[0]} escreveu.</p>
                    </Painel>

                    {fb.imagem_url && (
                      <Painel
                        titulo="Print anexado"
                        acao={
                          <div className="flex gap-1.5">
                            <BotaoSutil onClick={() => copiarImagem(fb.imagem_url)}>Copiar imagem</BotaoSutil>
                          </div>
                        }
                      >
                        <button type="button" onClick={() => setAmpliar(true)} className="block w-full rounded-2xl overflow-hidden ring-1 ring-black/[0.06] dark:ring-white/[0.1] bg-black/[0.03] cursor-zoom-in">
                          <img src={fb.imagem_url} alt="Print anexado ao ticket" className="w-full max-h-[520px] object-contain" />
                        </button>
                      </Painel>
                    )}

                    {podeEditar && (
                      <Painel
                        titulo="Briefing para implementar"
                        acao={
                          <div className="flex gap-1.5">
                            <BotaoSutil onClick={() => setBriefingAberto((v) => !v)} icone={null}>
                              {briefingAberto ? 'Recolher' : 'Ver tudo'}
                            </BotaoSutil>
                            <BotaoSutil onClick={() => copiarTexto(briefing, 'Ticket copiado com o relato original. É só colar para implementar.')}>Copiar</BotaoSutil>
                          </div>
                        }
                      >
                        <div className="relative">
                          <pre className={`text-[12.5px] leading-[1.65] font-mono whitespace-pre-wrap break-words text-slate-700 dark:text-zinc-300 bg-black/[0.03] dark:bg-white/[0.04] rounded-2xl p-4 overflow-hidden transition-[max-height] duration-500 ${briefingAberto ? 'max-h-[2000px]' : 'max-h-[180px]'}`}>{briefing}</pre>
                          {!briefingAberto && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-2xl bg-gradient-to-t from-white dark:from-[#1e1e21] to-transparent" />}
                        </div>
                        <p className="mt-3 text-[12px] text-slate-400 dark:text-zinc-500">Leva o relato sem reescrever, mais etapa, prazo, subtarefas e o pedido para registrar a novidade citando o ticket.</p>
                      </Painel>
                    )}

                    {entregas.length > 0 && (
                      <Painel titulo="Entregue em">
                        <ul className="space-y-3">
                          {entregas.map((n) => (
                            <li key={n.id} className="flex gap-3">
                              <span className="mt-1.5 w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] flex-shrink-0" />
                              <span>
                                <span className="block text-[14px] font-semibold">{n.titulo}</span>
                                <span className="block text-[12.5px] text-slate-500 dark:text-zinc-400">{dataLonga(`${n.data}T12:00:00`)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </Painel>
                    )}
                  </div>

                  {/* Lateral de trabalho */}
                  <div className="space-y-6 lg:sticky lg:top-6">
                    <Painel titulo="Visão geral">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Anel fracao={prog.fracao} />
                          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold tabular-nums">{prog.total ? `${Math.round(prog.fracao * 100)}%` : '—'}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold">{prog.total ? `${prog.feitas} de ${prog.total} subtarefas` : 'Sem subtarefas'}</p>
                          <p className={`text-[12.5px] ${prog.atrasadas ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                            {prog.atrasadas ? `${prog.atrasadas} com prazo vencido` : etapa === 'resolvido' ? 'Ticket concluído' : diasAberto(fb.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
                        <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Prazo geral</p>
                        <SeletorPrazo valor={fb.prazo ? String(fb.prazo).slice(0, 10) : null} desabilitado={!podeEditar} concluido={etapa === 'resolvido'} onMudar={(prazo) => salvar({ prazo }, prazo ? 'Prazo definido.' : 'Prazo removido.')} />
                      </div>
                    </Painel>

                    <Painel titulo={`Subtarefas${prog.total ? ` · ${prog.feitas}/${prog.total}` : ''}`}>
                      {subtarefas.length === 0 && !podeEditar && <p className="text-[13px] text-slate-500 dark:text-zinc-400">Nenhuma subtarefa.</p>}
                      {subtarefas.length > 0 && (
                        <ul className="-mt-2 divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                          <AnimatePresence initial={false}>
                            {subtarefas.map((st) => (
                              <LinhaSubtarefa key={st.id} st={st} podeEditar={podeEditar} onAlterar={alterar} onExcluir={excluir} />
                            ))}
                          </AnimatePresence>
                        </ul>
                      )}
                      {podeEditar && (
                        <form onSubmit={adicionar} className="mt-2 rounded-2xl ring-1 ring-black/[0.1] dark:ring-white/[0.12] bg-black/[0.015] dark:bg-white/[0.03] p-2 pl-3.5 focus-within:ring-2 focus-within:ring-[#4d7c0f]/30">
                          <div className="flex items-center gap-2">
                            <input ref={campoNova} value={novaTexto} onChange={(e) => setNovaTexto(e.target.value)} placeholder="Nova subtarefa" maxLength={200} aria-label="Nova subtarefa" className="flex-1 min-w-0 bg-transparent text-[14px] outline-none placeholder:text-slate-400" />
                            <button type="submit" disabled={!novaTexto.trim()} className="h-8 px-3.5 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[12.5px] font-semibold cursor-pointer disabled:opacity-30 transition-opacity">
                              Adicionar
                            </button>
                          </div>
                          <div className="-ml-2 mt-1">
                            <SeletorPrazo compacto valor={novaPrazo} onMudar={setNovaPrazo} />
                          </div>
                        </form>
                      )}
                    </Painel>

                    <Painel titulo="Atividade">
                      <ol className="relative">
                        <span className="absolute left-[3px] top-2 bottom-2 w-px bg-black/[0.08] dark:bg-white/[0.1]" aria-hidden="true" />
                        {atividade.map((ev, i) => (
                          <li key={`${ev.em}-${i}`} className="relative pl-5 pb-3.5 last:pb-0">
                            <span className={`absolute left-0 top-[7px] w-[7px] h-[7px] rounded-full ${ev.cor}`} aria-hidden="true" />
                            <p className="text-[13px] leading-snug">{ev.texto}</p>
                            <p className="text-[11.5px] text-slate-400 dark:text-zinc-500 mt-0.5">{dataHora(ev.em)}</p>
                          </li>
                        ))}
                      </ol>
                    </Painel>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {ampliar && fb.imagem_url && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9995] bg-black/85 backdrop-blur-xl flex items-center justify-center p-6 cursor-zoom-out" onMouseDown={() => setAmpliar(false)}>
                <motion.img initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} transition={MOLA} src={fb.imagem_url} alt="Print ampliado" className="max-w-full max-h-[90vh] rounded-2xl" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
