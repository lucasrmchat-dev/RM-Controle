'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  getFeedbacks,
  fetchFeedbacks,
  updateFeedbackStatus,
  getConfigFeedbacks,
  fetchConfigFeedbacks,
  getPermissoesAtuais,
  getEquipeUsuarios,
  getLocalData,
  setLocalData,
  getPublicacaoNovidades,
  fetchPublicacaoNovidades,
  publicarNovidade,
} from '@/lib/storage';
import { ETAPAS_FEEDBACK, TIPOS_FEEDBACK, ehDesenvolvimento, etapaDe, prazoVencido, progressoSubtarefas, tipoFeedback } from '@/lib/feedbacks';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import FeedbackNovoModal from './FeedbackNovoModal';
import FeedbackEstacao, { corPrazo, textoPrazo } from './FeedbackEstacao';
import { NOVIDADES, feedbackDoTicket, novidadePublicada, ordenarNovidades, rotuloTicket } from '@/lib/novidades';
import { showToast } from './ToastNotification';
import { ListSkeleton } from './SkeletonLoaders';
import { BugIcon, CalendarIcon, CheckIcon, EditIcon, LightBulbIcon, SparklesIcon } from './Icons';

const MOLA = { type: 'spring', bounce: 0.18, duration: 0.42 };

const ESTILO_TIPO = {
  bug: { icone: BugIcon, ponto: 'bg-rose-500', texto: 'text-rose-700 dark:text-rose-300' },
  melhoria: { icone: EditIcon, ponto: 'bg-sky-500', texto: 'text-sky-700 dark:text-sky-300' },
  ideia: { icone: LightBulbIcon, ponto: 'bg-amber-500', texto: 'text-amber-700 dark:text-amber-300' },
  novidade: { icone: SparklesIcon, ponto: 'bg-[#4d7c0f] dark:bg-[#84cc16]', texto: 'text-[#4d7c0f] dark:text-[#a3e635]' },
};

const PONTO_ETAPA = {
  em_analise: 'bg-amber-500',
  no_roadmap: 'bg-violet-500',
  em_correcao: 'bg-sky-500',
  resolvido: 'bg-[#4d7c0f] dark:bg-[#84cc16]',
};

const iniciais = (nome) =>
  String(nome || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '');
const quandoConcluido = (fb) => fb.finalizado_em || fb.updated_at || fb.created_at;

// ------------------------------------------------------------------------------
// Peças pequenas
// ------------------------------------------------------------------------------
function Segmentado({ opcoes, valor, onMudar, id, rotulo }) {
  return (
    <div role="tablist" aria-label={rotulo} className="inline-flex gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.07]">
      {opcoes.map((op) => {
        const ativo = op.id === valor;
        return (
          <button
            key={op.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onMudar(op.id)}
            className={`relative h-8 px-3.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors whitespace-nowrap ${ativo ? 'text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'}`}
          >
            {ativo && <motion.span layoutId={`seg-${id}`} transition={MOLA} className="absolute inset-0 rounded-full bg-white dark:bg-[#3a3a3f] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" />}
            <span className="relative">
              {op.rotulo}
              {op.contador > 0 && <span className="ml-1.5 text-slate-400 dark:text-zinc-500 tabular-nums">{op.contador}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SeloTipo({ tipo }) {
  const t = tipoFeedback(tipo);
  const e = ESTILO_TIPO[t];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${e.texto}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.ponto}`} />
      {TIPOS_FEEDBACK[t].rotulo}
    </span>
  );
}

function Avatar({ nome, tamanho = 'w-6 h-6 text-[10px]' }) {
  return (
    <span title={nome} className={`${tamanho} rounded-full bg-black/[0.07] dark:bg-white/[0.1] text-slate-600 dark:text-zinc-300 font-semibold flex items-center justify-center flex-shrink-0`}>
      {iniciais(nome)}
    </span>
  );
}

/** Andamento em 4 traços (as etapas do pipeline). */
function TrilhaEtapas({ fb, nomes }) {
  const i = ETAPAS_FEEDBACK.indexOf(etapaDe(fb));
  return (
    <div>
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">
        {ETAPAS_FEEDBACK.map((id, k) => (
          <span key={id} className={`h-1 rounded-full ${k <= i ? (i === 3 ? 'bg-[#4d7c0f] dark:bg-[#84cc16]' : 'bg-[#1d1d1f] dark:bg-white') : 'bg-black/[0.08] dark:bg-white/[0.1]'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-slate-500 dark:text-zinc-400">
        <span className="font-medium text-[#1d1d1f] dark:text-white">{nomes[etapaDe(fb)]}</span>
        <span className="text-slate-400 dark:text-zinc-500"> · etapa {i + 1} de 4</span>
      </p>
    </div>
  );
}

function ChipPrazo({ fb }) {
  if (!fb.prazo) return null;
  const prazo = String(fb.prazo).slice(0, 10);
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] font-medium ${corPrazo(prazo, etapaDe(fb) === 'resolvido')}`}>
      <CalendarIcon className="w-3 h-3" />
      {textoPrazo(prazo)}
    </span>
  );
}

function ChipSubtarefas({ fb }) {
  const p = progressoSubtarefas(fb.subtarefas || []);
  if (!p.total) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] font-medium tabular-nums ${p.atrasadas ? 'text-rose-600 dark:text-rose-400' : p.feitas === p.total ? 'text-[#4d7c0f] dark:text-[#a3e635]' : 'text-slate-500 dark:text-zinc-400'}`}>
      <CheckIcon className="w-3 h-3 stroke-[2.5]" />
      {p.feitas}/{p.total}
    </span>
  );
}

function Vazio({ titulo, texto }) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <span className="w-14 h-14 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-400 flex items-center justify-center">
        <LightBulbIcon className="w-6 h-6" />
      </span>
      <p className="mt-4 text-[15px] font-semibold">{titulo}</p>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400 max-w-sm">{texto}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------
// Vista para todos
// ------------------------------------------------------------------------------
function CartaoEnvio({ fb, nomes, onAbrir }) {
  return (
    <motion.button
      layout
      type="button"
      onClick={() => onAbrir(fb)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={MOLA}
      className="text-left rounded-[22px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-5 flex flex-col gap-3 hover:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 transition-[box-shadow,transform] duration-300 cursor-pointer"
    >
      <div className="flex items-center justify-between gap-3">
        <SeloTipo tipo={fb.tipo} />
        <span className="text-[12px] text-slate-400 dark:text-zinc-500 truncate">
          {fb.modulo_afetado || 'Geral'} · <span className="tabular-nums">{rotuloTicket(fb)}</span>
        </span>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight leading-snug">{fb.titulo}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-zinc-400 line-clamp-2">{fb.descricao}</p>
      </div>
      <div className="mt-auto pt-1">
        <TrilhaEtapas fb={fb} nomes={nomes} />
      </div>
      <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-zinc-400">
        <Avatar nome={fb.autor_nome || fb.autor_email} />
        <span className="truncate">{fb.autor_nome || fb.autor_email}</span>
        <span className="ml-auto flex-shrink-0">{dataCurta(fb.created_at)}</span>
      </div>
    </motion.button>
  );
}

const dataNota = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Uma nota de versão: título, por que importa, o que mudou e de quais tickets veio. */
function CartaoNovidade({ nota, feedbacks, onAbrirTicket, rodape = null }) {
  const tickets = (nota.tickets || []).map((t) => ({ t, fb: feedbackDoTicket(t, feedbacks) }));
  return (
    <article className="rounded-[24px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-6 sm:p-7">
      <p className="text-[12px] font-medium text-[#4d7c0f] dark:text-[#a3e635]">{nota.modulo}</p>
      <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.015em] leading-snug">{nota.titulo}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600 dark:text-zinc-300">{nota.resumo}</p>
      {nota.itens?.length > 0 && (
        <ul className="mt-4 space-y-2">
          {nota.itens.map((item) => (
            <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-[#1d1d1f] dark:text-zinc-100">
              <CheckIcon className="w-4 h-4 mt-[3px] flex-shrink-0 text-[#4d7c0f] dark:text-[#84cc16] stroke-[2.5]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {tickets.length > 0 && (
        <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500 dark:text-zinc-400">
          <span>{tickets.length === 1 ? 'A partir do ticket' : 'A partir dos tickets'}</span>
          {tickets.map(({ t, fb }) =>
            fb ? (
              <button
                key={t}
                type="button"
                onClick={() => onAbrirTicket(fb)}
                className="h-7 px-2.5 rounded-full bg-black/[0.04] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-[#1d1d1f] dark:text-white font-medium cursor-pointer transition-colors"
                title={`Ver como foi escrito: ${fb.titulo}`}
              >
                <span className="tabular-nums">{rotuloTicket(fb)}</span>
                <span className="text-slate-500 dark:text-zinc-400 font-normal"> · {fb.autor_nome || fb.autor_email}</span>
              </button>
            ) : (
              <span key={t} className="tabular-nums">
                {String(t).startsWith('#') ? t : `#${String(t).slice(0, 4).toUpperCase()}`}
              </span>
            )
          )}
        </div>
      )}
      {rodape}
    </article>
  );
}

/** Notas de versão publicadas, agrupadas por dia. */
function NotasDeVersao({ notas, feedbacks, onAbrirTicket }) {
  if (!notas.length) return <Vazio titulo="Nenhuma novidade publicada ainda" texto="Quando uma melhoria for entregue e aprovada, ela aparece aqui com o que mudou." />;
  const dias = [];
  notas.forEach((n) => {
    const grupo = dias.find((d) => d.data === n.data);
    grupo ? grupo.itens.push(n) : dias.push({ data: n.data, itens: [n] });
  });
  return (
    <div className="max-w-3xl space-y-10">
      {dias.map((dia) => (
        <section key={dia.data} className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-x-8 gap-y-3">
          <h2 className="text-[13px] font-semibold text-slate-500 dark:text-zinc-400 sm:pt-7 sm:sticky sm:top-24 self-start">{dataNota(dia.data)}</h2>
          <div className="space-y-4">
            {dia.itens.map((n, i) => (
              <motion.div key={n.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...MOLA, delay: Math.min(i, 6) * 0.04 }}>
                <CartaoNovidade nota={n} feedbacks={feedbacks} onAbrirTicket={onAbrirTicket} />
              </motion.div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Desenvolvimento › Novidades: o que foi escrito e espera aprovação para a equipe ver. */
function AprovacaoNovidades({ publicacao, feedbacks, onAbrirTicket, onPublicar }) {
  const [salvando, setSalvando] = useState(null);
  const todas = ordenarNovidades(NOVIDADES);
  const pendentes = todas.filter((n) => !publicacao[n.id]);
  const decididas = todas.filter((n) => publicacao[n.id]);
  const agir = async (id, publicar) => {
    setSalvando(id);
    try {
      await onPublicar(id, publicar);
    } finally {
      setSalvando(null);
    }
  };
  const Bloco = ({ titulo, itens, vazio }) => (
    <section className="space-y-4">
      <h2 className="text-[13px] font-semibold text-slate-500 dark:text-zinc-400">
        {titulo} <span className="tabular-nums text-slate-400">{itens.length}</span>
      </h2>
      {itens.length === 0 && <p className="text-[13.5px] text-slate-500 dark:text-zinc-400">{vazio}</p>}
      {itens.map((n) => {
        const pub = publicacao[n.id];
        return (
          <CartaoNovidade
            key={n.id}
            nota={n}
            feedbacks={feedbacks}
            onAbrirTicket={onAbrirTicket}
            rodape={
              <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center gap-3">
                <span className="text-[12.5px] text-slate-500 dark:text-zinc-400 mr-auto">
                  {!pub ? `Escrita em ${dataNota(n.data)} · ninguém da equipe vê ainda` : pub.publicada ? `Publicada por ${pub.por} em ${new Date(pub.em).toLocaleDateString('pt-BR')}` : `Oculta por ${pub.por}`}
                </span>
                {(!pub || !pub.publicada) && (
                  <button type="button" disabled={salvando === n.id} onClick={() => agir(n.id, true)} className="h-9 px-4 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[13px] font-semibold cursor-pointer disabled:opacity-50">
                    Publicar para a equipe
                  </button>
                )}
                {(!pub || pub.publicada) && (
                  <button type="button" disabled={salvando === n.id} onClick={() => agir(n.id, false)} className="h-9 px-4 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-50">
                    {pub ? 'Ocultar' : 'Não publicar'}
                  </button>
                )}
              </div>
            }
          />
        );
      })}
    </section>
  );
  return (
    <div className="max-w-3xl space-y-10">
      <Bloco titulo="Aguardando aprovação" itens={pendentes} vazio="Tudo revisado. Novas melhorias aparecem aqui para você aprovar." />
      <Bloco titulo="Já revisadas" itens={decididas} vazio="Nenhuma ainda." />
    </div>
  );
}

function VistaTodos({ feedbacks, nomes, userEmail, onAbrir, publicacao }) {
  const [aba, setAba] = useState('novidades');
  const eu = String(userEmail || '').toLowerCase();
  const meus = feedbacks.filter((f) => String(f.autor_email || '').toLowerCase() === eu && tipoFeedback(f.tipo) !== 'novidade');
  const equipe = feedbacks.filter((f) => String(f.autor_email || '').toLowerCase() !== eu && tipoFeedback(f.tipo) !== 'novidade');
  const notas = ordenarNovidades(NOVIDADES).filter((n) => novidadePublicada(publicacao, n.id));

  return (
    <div className="space-y-6">
      <Segmentado
        id="feedbacks-todos"
        rotulo="Seções"
        valor={aba}
        onMudar={setAba}
        opcoes={[
          { id: 'novidades', rotulo: 'Novidades' },
          { id: 'meus', rotulo: 'Meus envios', contador: meus.length },
          { id: 'equipe', rotulo: 'Da equipe', contador: equipe.length },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={aba} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          {aba === 'novidades' && <NotasDeVersao notas={notas} feedbacks={feedbacks} onAbrirTicket={(fb) => onAbrir(fb, [fb.id])} />}
          {aba !== 'novidades' &&
            ((aba === 'meus' ? meus : equipe).length === 0 ? (
              <Vazio
                titulo={aba === 'meus' ? 'Você ainda não enviou nada' : 'Nada da equipe por enquanto'}
                texto={aba === 'meus' ? 'Encontrou um problema ou teve uma ideia? Envie e acompanhe cada etapa por aqui.' : 'Os envios dos colegas aparecem aqui.'}
              />
            ) : (
              <motion.div layout className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>
                  {(aba === 'meus' ? meus : equipe).map((fb, _, lista) => (
                    <CartaoEnvio key={fb.id} fb={fb} nomes={nomes} onAbrir={(f) => onAbrir(f, lista.map((x) => x.id))} />
                  ))}
                </AnimatePresence>
              </motion.div>
            ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------------------
// Vista de desenvolvimento
// ------------------------------------------------------------------------------
function CartaoPipeline({ fb, onAbrir, arrastandoId, setArrastandoId }) {
  const prioridade = fb.prioridade === 'critica' ? 'Impede o trabalho' : fb.prioridade === 'alta' ? 'Alta' : null;
  return (
    // Arraste nativo num div comum: o motion.div trata onDragStart como gesto próprio e não passa o dataTransfer
    <motion.div layout layoutId={`fb-${fb.id}`} transition={MOLA}>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', fb.id);
          e.dataTransfer.effectAllowed = 'move';
          setArrastandoId(fb.id);
        }}
        onDragEnd={() => setArrastandoId(null)}
        onClick={() => onAbrir(fb)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAbrir(fb)}
        className={`rounded-2xl bg-white dark:bg-[#232326] ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-3.5 cursor-grab active:cursor-grabbing select-none hover:shadow-[0_8px_22px_-12px_rgba(0,0,0,0.3)] transition-[box-shadow,opacity] ${arrastandoId === fb.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <SeloTipo tipo={fb.tipo} />
          {prioridade && <span className={`text-[11px] font-semibold ${fb.prioridade === 'critica' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>{prioridade}</span>}
        </div>
        <h4 className="mt-2 text-[13.5px] font-semibold leading-snug">{fb.titulo}</h4>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">
          <span className="tabular-nums">{rotuloTicket(fb)}</span> · {fb.modulo_afetado || 'Geral'}
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar nome={fb.autor_nome || fb.autor_email} tamanho="w-5 h-5 text-[9px]" />
          <ChipSubtarefas fb={fb} />
          <ChipPrazo fb={fb} />
          {fb.imagem_url && <span className="ml-auto text-[11px] text-slate-400" title="Tem print anexado">Print</span>}
        </div>
      </div>
    </motion.div>
  );
}

function Pipeline({ itens, nomes, onAbrir, onMover }) {
  const [sobre, setSobre] = useState(null);
  const [arrastandoId, setArrastandoId] = useState(null);
  return (
    <LayoutGroup>
      <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto pb-2">
        <div className="grid grid-cols-4 gap-3 min-w-[960px]">
          {ETAPAS_FEEDBACK.map((etapa) => {
            const cards = itens.filter((f) => etapaDe(f) === etapa);
            const destaque = sobre === etapa;
            return (
              <section
                key={etapa}
                aria-label={nomes[etapa]}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (sobre !== etapa) setSobre(etapa);
                }}
                onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setSobre(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSobre(null);
                  setArrastandoId(null);
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) onMover(id, etapa);
                }}
                className={`rounded-[22px] p-2.5 min-h-[420px] flex flex-col transition-colors duration-200 ${destaque ? 'bg-[#4d7c0f]/[0.07] ring-2 ring-[#4d7c0f]/40 dark:ring-[#84cc16]/40' : 'bg-black/[0.025] dark:bg-white/[0.03]'}`}
              >
                <header className="flex items-center gap-2 px-1.5 pt-1 pb-3">
                  <span className={`w-2 h-2 rounded-full ${PONTO_ETAPA[etapa]}`} />
                  <h3 className="text-[13px] font-semibold">{nomes[etapa]}</h3>
                  <span className="ml-auto text-[12px] text-slate-400 tabular-nums">{cards.length}</span>
                </header>
                <div className="flex-1 space-y-2">
                  {cards.map((fb) => (
                    <CartaoPipeline key={fb.id} fb={fb} onAbrir={onAbrir} arrastandoId={arrastandoId} setArrastandoId={setArrastandoId} />
                  ))}
                  {cards.length === 0 && (
                    <div className={`h-24 rounded-2xl border border-dashed flex items-center justify-center text-[12px] transition-colors ${destaque ? 'border-[#4d7c0f]/50 text-[#4d7c0f]' : 'border-black/[0.1] dark:border-white/[0.12] text-slate-400'}`}>
                      Arraste para cá
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </LayoutGroup>
  );
}

function Lista({ itens, nomes, onAbrir }) {
  if (!itens.length) return <Vazio titulo="Nada encontrado" texto="Ajuste a busca ou os filtros." />;
  return (
    <div className="rounded-[22px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] overflow-hidden">
      <div className="hidden lg:grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_70px_minmax(0,1fr)] gap-4 px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-slate-400 dark:text-zinc-500 border-b border-black/[0.06] dark:border-white/[0.08]">
        <span>Feedback</span>
        <span>Parte do sistema</span>
        <span>Etapa</span>
        <span>Prazo</span>
        <span>Tarefas</span>
        <span>Enviado por</span>
      </div>
      <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.07]">
        {itens.map((fb) => (
          <li key={fb.id}>
            <button
              type="button"
              onClick={() => onAbrir(fb)}
              className="w-full text-left px-5 py-3.5 grid grid-cols-1 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_70px_minmax(0,1fr)] gap-x-4 gap-y-1.5 items-center hover:bg-black/[0.025] dark:hover:bg-white/[0.03] cursor-pointer transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold truncate">
                  <span className="text-slate-400 font-medium tabular-nums mr-1.5">{rotuloTicket(fb)}</span>
                  {fb.titulo}
                </span>
                <SeloTipo tipo={fb.tipo} />
              </span>
              <span className="text-[13px] text-slate-600 dark:text-zinc-300 truncate">{fb.modulo_afetado || 'Geral'}</span>
              <span className="inline-flex items-center gap-1.5 text-[13px]">
                <span className={`w-1.5 h-1.5 rounded-full ${PONTO_ETAPA[etapaDe(fb)]}`} />
                {nomes[etapaDe(fb)]}
              </span>
              <span>{fb.prazo ? <ChipPrazo fb={fb} /> : <span className="text-[12px] text-slate-300 dark:text-zinc-600 hidden lg:inline">—</span>}</span>
              <span>{(fb.subtarefas || []).length ? <ChipSubtarefas fb={fb} /> : <span className="text-[12px] text-slate-300 dark:text-zinc-600 hidden lg:inline">—</span>}</span>
              <span className="flex items-center gap-2 min-w-0 text-[12.5px] text-slate-500 dark:text-zinc-400">
                <Avatar nome={fb.autor_nome || fb.autor_email} tamanho="w-5 h-5 text-[9px]" />
                <span className="truncate">{fb.autor_nome || fb.autor_email}</span>
                <span className="ml-auto flex-shrink-0 text-slate-400">{dataCurta(fb.created_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metrica({ rotulo, valor, detalhe, alerta = false }) {
  return (
    <div className="rounded-[22px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] px-5 py-4">
      <p className="text-[12.5px] font-medium text-slate-500 dark:text-zinc-400">{rotulo}</p>
      <p className={`mt-1 text-[28px] font-semibold tracking-tight tabular-nums ${alerta && valor > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>{valor}</p>
      {detalhe && <p className="text-[12px] text-slate-400 dark:text-zinc-500">{detalhe}</p>}
    </div>
  );
}

function VistaDesenvolvimento({ feedbacks, nomes, onAbrir, onMover, publicacao, onPublicar }) {
  const [modo, setModo] = useState(() => getLocalData('feedbacks_modo_dev', 'pipeline'));
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('todos');

  const trabalho = feedbacks.filter((f) => tipoFeedback(f.tipo) !== 'novidade');
  const termo = busca.trim().toLowerCase();
  const filtrados = trabalho.filter((f) => {
    if (tipo !== 'todos' && tipoFeedback(f.tipo) !== tipo) return false;
    if (!termo) return true;
    return [f.titulo, f.descricao, f.modulo_afetado, f.autor_nome, rotuloTicket(f)].some((t) => String(t || '').toLowerCase().includes(termo));
  });
  // Ordem de navegação na estação de trabalho: a mesma que a tela mostra
  const ordemPipeline = ETAPAS_FEEDBACK.flatMap((e) => filtrados.filter((f) => etapaDe(f) === e));
  const ordemLista = [...filtrados].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const abertos = trabalho.filter((f) => etapaDe(f) !== 'resolvido');
  const atrasados = abertos.filter((f) => prazoVencido(f.prazo) || progressoSubtarefas(f.subtarefas || []).atrasadas > 0).length;
  const trintaDias = Date.now() - 30 * 86400000;
  const concluidos30 = trabalho.filter((f) => etapaDe(f) === 'resolvido' && new Date(quandoConcluido(f)).getTime() >= trintaDias).length;
  const pendentes = NOVIDADES.filter((n) => !publicacao[n.id]).length;

  const mudarModo = (m) => {
    setModo(m);
    setLocalData('feedbacks_modo_dev', m);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metrica rotulo={nomes.em_analise} valor={trabalho.filter((f) => etapaDe(f) === 'em_analise').length} detalhe="esperando avaliação" />
        <Metrica rotulo={nomes.em_correcao} valor={trabalho.filter((f) => etapaDe(f) === 'em_correcao').length} detalhe={`${trabalho.filter((f) => etapaDe(f) === 'no_roadmap').length} em ${nomes.no_roadmap.toLowerCase()}`} />
        <Metrica rotulo="Atrasados" valor={atrasados} detalhe="prazo ou subtarefa vencida" alerta />
        <Metrica rotulo={`${nomes.resolvido} em 30 dias`} valor={concluidos30} detalhe={`${abertos.length} em aberto no total`} />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <Segmentado
          id="feedbacks-modo"
          rotulo="Visualização"
          valor={modo}
          onMudar={mudarModo}
          opcoes={[
            { id: 'pipeline', rotulo: 'Pipeline' },
            { id: 'lista', rotulo: 'Lista' },
            { id: 'novidades', rotulo: 'Novidades', contador: pendentes },
          ]}
        />
        {modo !== 'novidades' && (
          <>
            <div className="relative flex-1 max-w-md lg:ml-auto">
              <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por ticket, título, módulo ou autor"
                aria-label="Buscar feedbacks"
                className="w-full h-10 pl-10 pr-4 rounded-full bg-white dark:bg-white/[0.06] ring-1 ring-black/[0.08] dark:ring-white/[0.1] text-[13.5px] outline-none focus:ring-2 focus:ring-[#4d7c0f]/30 placeholder:text-slate-400"
              />
            </div>
            <Segmentado
              id="feedbacks-tipo"
              rotulo="Tipo"
              valor={tipo}
              onMudar={setTipo}
              opcoes={[
                { id: 'todos', rotulo: 'Todos' },
                { id: 'bug', rotulo: 'Problemas' },
                { id: 'melhoria', rotulo: 'Melhorias' },
                { id: 'ideia', rotulo: 'Ideias' },
              ]}
            />
          </>
        )}
      </div>

      {modo === 'novidades' ? (
        <AprovacaoNovidades publicacao={publicacao} feedbacks={feedbacks} onAbrirTicket={(fb) => onAbrir(fb, [fb.id])} onPublicar={onPublicar} />
      ) : modo === 'pipeline' ? (
        <Pipeline itens={filtrados} nomes={nomes} onAbrir={(fb) => onAbrir(fb, ordemPipeline.map((f) => f.id))} onMover={onMover} />
      ) : (
        <Lista itens={ordemLista} nomes={nomes} onAbrir={(fb) => onAbrir(fb, ordemLista.map((f) => f.id))} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------
// Tela
// ------------------------------------------------------------------------------
export default function FeedbacksView({ userEmail }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [config, setConfig] = useState(getConfigFeedbacks);
  const [dev, setDev] = useState(false);
  const [visao, setVisao] = useState(() => getLocalData('feedbacks_visao', 'dev'));
  const [novoAberto, setNovoAberto] = useState(false);
  const [abertoId, setAbertoId] = useState(null);
  const [navegacao, setNavegacao] = useState([]);
  const [publicacao, setPublicacao] = useState(getPublicacaoNovidades);
  const [devServidor, setDevServidor] = useState(null);

  // Quem é do desenvolvimento muda com perfis, equipe e a configuração de feedbacks
  useEffect(() => {
    const calcular = () => {
      const cfg = getConfigFeedbacks();
      setConfig(cfg);
      const membro = getEquipeUsuarios().find((u) => String(u.email || '').toLowerCase() === String(userEmail || '').toLowerCase());
      setDev(ehDesenvolvimento(getPermissoesAtuais(userEmail), membro, cfg));
    };
    calcular();
    fetchConfigFeedbacks().then(calcular);
    const eventos = ['feedbacks_config_updated', 'perfis_updated', 'equipe_updated', 'user_role_updated'];
    eventos.forEach((e) => window.addEventListener(e, calcular));
    return () => eventos.forEach((e) => window.removeEventListener(e, calcular));
  }, [userEmail]);

  // Publicação das novidades (e a confirmação do servidor de quem é do desenvolvimento)
  useEffect(() => {
    const ler = () =>
      fetchPublicacaoNovidades().then(({ publicacao: p, desenvolvimento }) => {
        setPublicacao(p);
        if (desenvolvimento !== null) setDevServidor(desenvolvimento);
      });
    ler();
    window.addEventListener('novidades_updated', ler);
    return () => window.removeEventListener('novidades_updated', ler);
  }, []);

  useEffect(() => {
    const atualizar = async () => {
      try {
        setFeedbacks(await fetchFeedbacks());
      } catch {
        setFeedbacks(getFeedbacks());
      } finally {
        setCarregado(true);
      }
    };
    const emCache = getFeedbacks() || [];
    if (emCache.length) {
      setFeedbacks(emCache);
      setCarregado(true);
    }
    atualizar();
    const local = () => setFeedbacks(getFeedbacks());
    window.addEventListener('feedbacks_updated', local);

    // Mudanças feitas por outras pessoas chegam pelo Realtime (com revalidação periódica de segurança)
    let canal = null;
    if (isSupabaseConfigured && supabase) {
      canal = supabase
        .channel('feedbacks_status_stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'feedbacks' }, atualizar)
        .subscribe();
    }
    const visivel = () => document.visibilityState === 'visible' && atualizar();
    document.addEventListener('visibilitychange', visivel);
    const polling = setInterval(visivel, 20000);
    return () => {
      window.removeEventListener('feedbacks_updated', local);
      document.removeEventListener('visibilitychange', visivel);
      clearInterval(polling);
      if (canal) supabase.removeChannel(canal);
    };
  }, []);

  const nomes = config.etapas;
  // O servidor tem a palavra final quando responde (o navegador pode ter dados antigos da equipe)
  const ehDev = devServidor ?? dev;
  const vistaDev = ehDev && visao === 'dev';
  const aberto = abertoId ? feedbacks.find((f) => f.id === abertoId) || null : null;
  const ordenados = useMemo(() => [...feedbacks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [feedbacks]);

  const mudarVisao = (v) => {
    setVisao(v);
    setLocalData('feedbacks_visao', v);
  };

  const mover = async (id, etapa) => {
    const anterior = feedbacks.find((f) => f.id === id);
    if (!anterior || etapaDe(anterior) === etapa) return;
    const agora = new Date().toISOString();
    setFeedbacks((lista) => lista.map((f) => (f.id === id ? { ...f, status: etapa, updated_at: agora, ...(etapa === 'resolvido' ? { finalizado_em: agora } : {}) } : f)));
    try {
      await updateFeedbackStatus(id, etapa, userEmail);
      showToast(`Movido para "${nomes[etapa]}".`, 'success');
    } catch (e) {
      setFeedbacks((lista) => lista.map((f) => (f.id === id ? anterior : f)));
      showToast(e.message || 'Não foi possível mover o feedback.', 'error');
    }
  };

  const abrir = (fb, ids = []) => {
    setNavegacao(ids.length ? ids : [fb.id]);
    setAbertoId(fb.id);
  };

  const publicar = async (id, publicarSim) => {
    try {
      setPublicacao(await publicarNovidade(id, publicarSim));
      showToast(publicarSim ? 'Novidade publicada. A equipe já pode ver.' : 'Novidade fora do ar para a equipe.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div className="space-y-8 text-[#1d1d1f] dark:text-[#f5f5f7]">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-5 pt-2">
        <div>
          <h1 className="text-[30px] sm:text-[34px] font-semibold tracking-[-0.025em] leading-tight">Feedbacks</h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500 dark:text-zinc-400 max-w-xl">
            {vistaDev ? 'Tudo o que a equipe enviou, do primeiro relato até a entrega.' : 'Problemas, melhorias e ideias para o RM Controle. Acompanhe o que você enviou e veja o que mudou.'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {ehDev && (
            <Segmentado
              id="feedbacks-visao"
              rotulo="Visão"
              valor={visao}
              onMudar={mudarVisao}
              opcoes={[
                { id: 'todos', rotulo: 'Para todos' },
                { id: 'dev', rotulo: 'Desenvolvimento' },
              ]}
            />
          )}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setNovoAberto(true)}
            className="h-11 px-5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[14px] font-semibold shadow-md shadow-[#4d7c0f]/20 flex items-center gap-2 cursor-pointer"
          >
            <span className="text-[18px] leading-none -mt-px">+</span>
            Enviar feedback
          </motion.button>
        </div>
      </header>

      {!carregado ? (
        <div className="p-5 rounded-[22px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09]">
          <ListSkeleton linhas={5} />
        </div>
      ) : vistaDev ? (
        <VistaDesenvolvimento feedbacks={ordenados} nomes={nomes} onAbrir={abrir} onMover={mover} publicacao={publicacao} onPublicar={publicar} />
      ) : (
        <VistaTodos feedbacks={ordenados} nomes={nomes} userEmail={userEmail} onAbrir={abrir} publicacao={publicacao} />
      )}

      <FeedbackNovoModal
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        userEmail={userEmail}
        onEnviado={() => {
          setFeedbacks(getFeedbacks());
          showToast('Feedback enviado. Você acompanha o andamento em "Meus envios".', 'success');
        }}
      />

      <FeedbackEstacao
        fb={aberto}
        lista={navegacao}
        onNavegar={setAbertoId}
        onFechar={() => setAbertoId(null)}
        nomesEtapas={nomes}
        podeEditar={vistaDev}
        userEmail={userEmail}
        onMudarEtapa={mover}
      />
    </div>
  );
}
