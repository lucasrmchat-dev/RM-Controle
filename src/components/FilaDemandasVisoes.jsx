'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BuildingIcon, CheckIcon, PlayIcon, XMarkIcon, BellOffIcon, UsersIcon, KanbanIcon } from './Icons';

// ==============================================================================
// ESTADO, COR E PRIORIDADE DE CADA DEMANDA (uma regra só para lista, cards, kanban e painel)
// ==============================================================================

export const ESTADOS = {
  espera: {
    rotulo: 'Aguardando atendente',
    curto: 'Aguardando',
    ponto: 'bg-amber-500',
    pilula: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-1 ring-inset ring-amber-500/20',
    dica: 'Ninguém assumiu ainda',
  },
  atendimento: {
    rotulo: 'Em atendimento',
    curto: 'Em atendimento',
    ponto: 'bg-emerald-500',
    pilula: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20',
    dica: 'Sendo atendidas agora',
  },
  cliente: {
    rotulo: 'Aguardando cliente',
    curto: 'Aguardando cliente',
    ponto: 'bg-violet-500',
    pilula: 'bg-violet-500/10 text-violet-800 dark:text-violet-300 ring-1 ring-inset ring-violet-500/20',
    dica: 'Esperando o cliente responder',
  },
  concluida: {
    rotulo: 'Concluída',
    curto: 'Concluída',
    ponto: 'bg-slate-400',
    pilula: 'bg-slate-500/10 text-slate-700 dark:text-zinc-300 ring-1 ring-inset ring-slate-500/20',
    dica: '',
  },
};

const ORDEM_GRUPOS = ['espera', 'atendimento', 'cliente', 'concluida'];
const MOLA = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 };

const minutosDesde = (iso) => {
  const t = new Date(iso || 0).getTime();
  return t ? Math.max(0, Math.floor((Date.now() - t) / 60000)) : 0;
};

const iniciais = (nome) =>
  String(nome || '?')
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

// Cor estável por empresa: dá identidade visual sem depender de logo
const PALETA = [
  'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/14 text-amber-700 dark:text-amber-300',
  'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  'bg-teal-500/12 text-teal-700 dark:text-teal-300',
  'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
];
const corDaEmpresa = (nome) => {
  let h = 0;
  for (const c of String(nome || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};

/** Tudo o que a interface precisa saber de uma demanda. */
export function infoDemanda(ch, { cfg = {}, isMeu = () => false } = {}) {
  const estado =
    ch.status === 'em_andamento' ? 'atendimento' : ch.status === 'pendente' ? 'cliente' : ch.status === 'aguardando_visualizacao' ? 'espera' : 'concluida';
  const saudavel = cfg.tempo_saudavel_minutos || 10;
  const critico = cfg.tempo_critico_minutos || 30;
  const minRef =
    estado === 'espera' ? minutosDesde(ch.tempo_espera_inicio || ch.created_at) : estado === 'atendimento' ? minutosDesde(ch.tempo_ativo_inicio || ch.iniciado_em) : 0;
  const prioridade = estado === 'espera' || estado === 'atendimento' ? (minRef >= critico ? 'critica' : minRef >= saudavel ? 'atencao' : 'normal') : 'normal';
  const prazoMs = ch.prazo_limite ? new Date(ch.prazo_limite).getTime() : null;
  const designado = ch.atribuido_a && ch.atribuido_a !== 'geral' ? ch.atribuido_nome || ch.atribuido_a : null;
  const responsavel = estado === 'atendimento' || estado === 'cliente' ? ch.tecnico_nome || ch.atendente || ch.atribuido_nome || null : designado;
  const solicitante = ch.solicitante_nome && !['Colaborador da Empresa', 'Colaborador', 'Acesso Principal'].includes(ch.solicitante_nome) ? ch.solicitante_nome : '';
  return {
    estado,
    visual: ESTADOS[estado],
    prioridade,
    prazoVencido: Boolean(prazoMs && prazoMs < Date.now() && estado !== 'concluida'),
    responsavel: responsavel && !/fila geral/i.test(responsavel) ? responsavel : null,
    meu: (estado === 'atendimento' || estado === 'cliente') && isMeu(ch),
    solicitante,
    descricao: (ch.observacao_inicial || '').trim(),
    departamentos: Array.isArray(ch.categorias) && ch.categorias.length ? ch.categorias : ['Suporte'],
    interna: Boolean(ch.is_demanda_interna || (ch.empresa_nome || '').includes('RM Controle')),
  };
}

const COR_TEMPO = {
  critica: 'text-rose-600 dark:text-rose-400',
  atencao: 'text-amber-600 dark:text-amber-400',
  normal: 'text-[#1d1d1f] dark:text-white',
};

const tempoPrincipal = (ch, info, tempos) =>
  info.estado === 'atendimento' ? tempos.ativo(ch) : info.estado === 'cliente' ? tempos.cliente(ch) : tempos.espera(ch);

// Versão curta para lista e cards: cabe numa linha e continua precisa onde importa (minutos ao vivo)
const segundosDesde = (iso) => {
  const t = new Date(iso || 0).getTime();
  return t ? Math.max(0, Math.floor((Date.now() - t) / 1000)) : 0;
};
function tempoCurto(ch, info, tempos) {
  let seg = null;
  if (info.estado === 'espera') seg = segundosDesde(ch.tempo_espera_inicio || ch.created_at);
  else if (info.estado === 'atendimento') seg = segundosDesde(ch.tempo_ativo_inicio || ch.iniciado_em);
  else if (info.estado === 'cliente') seg = segundosDesde(ch.aguardando_cliente_desde || ch.iniciado_em);
  if (seg === null) return tempoPrincipal(ch, info, tempos);
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${String(m).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
}
const rotuloTempo = (info) =>
  info.estado === 'espera' ? 'esperando' : info.estado === 'atendimento' ? 'em atendimento' : info.estado === 'cliente' ? 'sem resposta' : 'de espera';

function Monograma({ nome, tamanho = 'w-10 h-10 text-[13px] rounded-xl' }) {
  return (
    <span className={`${tamanho} ${corDaEmpresa(nome)} flex items-center justify-center font-semibold flex-shrink-0 tracking-tight`} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}

function Avatar({ nome, destaque = false, tamanho = 'w-6 h-6 text-[10px]' }) {
  return (
    <span
      className={`${tamanho} rounded-full flex items-center justify-center font-semibold flex-shrink-0 ring-2 ring-white dark:ring-[#16161a] ${
        destaque ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950' : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-100'
      }`}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </span>
  );
}

function PilulaEstado({ info, grande = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${grande ? 'h-7 px-3 text-[13px]' : 'h-[22px] px-2 text-[11px]'} ${info.visual.pilula}`}>
      <span className={`relative w-1.5 h-1.5 rounded-full ${info.visual.ponto}`}>
        {info.estado === 'espera' && info.prioridade === 'critica' && <span className={`absolute inset-0 rounded-full ${info.visual.ponto} animate-ping`} />}
      </span>
      {grande ? info.visual.rotulo : info.visual.curto}
    </span>
  );
}

function Selos({ ch, info }) {
  const itens = [];
  if (info.prioridade === 'critica') itens.push(['Urgente', 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20']);
  if (info.prazoVencido) itens.push(['Prazo vencido', 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20']);
  if (ch.is_lembrete) itens.push(['Lembrete', 'bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20']);
  if (ch.sync_estado === 'pendente') itens.push(['Não sincronizada', 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20']);
  if (ch.adiado_ate && Date.now() < new Date(ch.adiado_ate).getTime()) itens.push(['Alerta pausado', 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300 ring-black/[0.06]']);
  return itens.map(([t, c]) => (
    <span key={t} className={`inline-flex items-center h-[20px] px-1.5 rounded-md text-[10.5px] font-semibold ring-1 ring-inset ${c}`}>
      {t}
    </span>
  ));
}

const btnBase = 'h-9 rounded-full text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 disabled:opacity-60 whitespace-nowrap';

/** A ação mais importante para o momento da demanda. `realce`: visual cheio (hover da linha ou painel). */
function AcaoPrincipal({ ch, info, acoes, assumindoId, rotuloLongo = false, cheia = false }) {
  const parar = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  if (info.estado === 'espera') {
    return (
      <button
        type="button"
        disabled={Boolean(assumindoId)}
        onClick={parar(() => acoes.assumir(ch, { abrirEmpresa: !info.interna }))}
        title="Assume a demanda e abre a tela da empresa"
        className={`${btnBase} px-3.5 ${
          cheia
            ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 shadow-sm shadow-[#4d7c0f]/25 hover:opacity-90'
            : 'text-[#4d7c0f] dark:text-[#84cc16] ring-1 ring-inset ring-[#4d7c0f]/30 dark:ring-[#84cc16]/30 group-hover:bg-[#4d7c0f] group-hover:text-white group-hover:ring-transparent dark:group-hover:bg-[#84cc16] dark:group-hover:text-zinc-950'
        }`}
      >
        {assumindoId === ch.id ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <PlayIcon className="w-2.5 h-2.5 fill-current" />}
        {rotuloLongo ? 'Assumir e abrir empresa' : 'Assumir'}
      </button>
    );
  }
  if (info.estado === 'atendimento' && info.meu) {
    return (
      <button
        type="button"
        onClick={parar(() => acoes.concluir(ch))}
        className={`${btnBase} px-3.5 ${
          cheia
            ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90'
            : 'text-[#1d1d1f] dark:text-white ring-1 ring-inset ring-black/15 dark:ring-white/20 group-hover:bg-[#1d1d1f] group-hover:text-white group-hover:ring-transparent dark:group-hover:bg-white dark:group-hover:text-[#1d1d1f]'
        }`}
      >
        <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />
        {rotuloLongo ? 'Concluir atendimento' : 'Concluir'}
      </button>
    );
  }
  if (info.estado === 'cliente') {
    return (
      <button
        type="button"
        disabled={Boolean(assumindoId)}
        onClick={parar(() => acoes.retomar(ch))}
        title="O cliente respondeu: retoma o atendimento e abre a empresa"
        className={`${btnBase} px-3.5 ${
          cheia
            ? 'bg-violet-600 text-white hover:opacity-90'
            : 'text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/35 group-hover:bg-violet-600 group-hover:text-white group-hover:ring-transparent'
        }`}
      >
        <PlayIcon className="w-2.5 h-2.5 fill-current" />
        {rotuloLongo ? 'Cliente respondeu — retomar' : 'Retomar'}
      </button>
    );
  }
  if (info.estado === 'atendimento' && !info.interna) {
    return (
      <button
        type="button"
        onClick={parar(() => acoes.abrirEmpresa(ch))}
        className={`${btnBase} px-3.5 text-slate-700 dark:text-zinc-200 ring-1 ring-inset ring-black/12 dark:ring-white/15 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]`}
      >
        <BuildingIcon className="w-3.5 h-3.5" />
        Empresa
      </button>
    );
  }
  return null;
}

// ==============================================================================
// ORDEM E AGRUPAMENTO
// ==============================================================================

export function ordenarPorPrioridade(lista, ctx) {
  const peso = { critica: 0, atencao: 1, normal: 2 };
  return [...lista].sort((a, b) => {
    const ia = infoDemanda(a, ctx);
    const ib = infoDemanda(b, ctx);
    if (ia.meu !== ib.meu) return ia.meu ? -1 : 1;
    if (peso[ia.prioridade] !== peso[ib.prioridade]) return peso[ia.prioridade] - peso[ib.prioridade];
    return new Date(a.tempo_espera_inicio || a.created_at || 0) - new Date(b.tempo_espera_inicio || b.created_at || 0);
  });
}

function agrupar(chamados, ctx) {
  const grupos = new Map(ORDEM_GRUPOS.map((g) => [g, []]));
  chamados.forEach((ch) => grupos.get(infoDemanda(ch, ctx).estado)?.push(ch));
  return ORDEM_GRUPOS.map((g) => ({ estado: g, itens: ordenarPorPrioridade(grupos.get(g), ctx) })).filter((g) => g.itens.length);
}

function CabecalhoGrupo({ estado, total, aberto, onAlternar }) {
  const v = ESTADOS[estado];
  return (
    <button type="button" onClick={onAlternar} aria-expanded={aberto} className="group/cab w-full flex items-center gap-3 mb-3 cursor-pointer text-left">
      <span className={`w-2 h-2 rounded-full ${v.ponto}`} />
      <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">{v.rotulo}</span>
      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[12px] font-semibold tabular-nums text-slate-600 dark:text-zinc-300 flex items-center justify-center">{total}</span>
      <span className="hidden md:inline text-[13px] text-slate-400 dark:text-zinc-500">{v.dica}</span>
      <span className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
      <svg className={`w-4 h-4 text-slate-400 transition-transform duration-300 group-hover/cab:text-slate-600 ${aberto ? '' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function useGruposRecolhidos() {
  const [recolhidos, setRecolhidos] = useState({});
  return [recolhidos, (g) => setRecolhidos((r) => ({ ...r, [g]: !r[g] }))];
}

// Sai da lista recolhendo a altura (sem "fantasma" sobrepondo a linha de baixo)
const SAIDA_ITEM = { opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } };

// ==============================================================================
// LISTA
// ==============================================================================

function LinhaDemanda({ ch, ctx, acoes, tempos, assumindoId, selecionada, compacta }) {
  const info = infoDemanda(ch, ctx);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={SAIDA_ITEM}
      transition={MOLA}
      onClick={() => acoes.abrirDetalhe(ch)}
      aria-current={selecionada ? 'true' : undefined}
      className={`group relative overflow-hidden cursor-pointer transition-colors duration-200 ${
        selecionada ? 'bg-[#4d7c0f]/[0.05] dark:bg-[#84cc16]/[0.06]' : 'hover:bg-black/[0.018] dark:hover:bg-white/[0.025]'
      }`}
    >
      {selecionada && <motion.span layoutId="linha-selecionada" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#4d7c0f] dark:bg-[#84cc16]" transition={MOLA} />}
      <div className="flex items-center gap-4 px-4 sm:px-5 py-4">
        <Monograma nome={ch.empresa_nome} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate">{ch.empresa_nome}</span>
            <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
              <Selos ch={ch} info={info} />
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-zinc-400 truncate">{info.descricao || 'Sem descrição'}</p>
          <p className="mt-1 text-[12px] text-slate-400 dark:text-zinc-500 truncate">
            {info.departamentos.join(' · ')}
            {info.solicitante && <> · {info.solicitante}</>}
          </p>
        </div>

        {/* Responsável */}
        {!compacta && (
          <div className="hidden xl:flex items-center gap-2.5 w-44 flex-shrink-0">
            {info.responsavel ? (
              <>
                <Avatar nome={info.responsavel} destaque={info.meu} tamanho="w-7 h-7 text-[10.5px]" />
                <span className="text-[13px] text-slate-700 dark:text-zinc-200 truncate">{info.meu ? 'Você' : info.responsavel}</span>
              </>
            ) : (
              <span className="text-[13px] text-slate-400 dark:text-zinc-500">Ninguém ainda</span>
            )}
          </div>
        )}

        {/* Tempo */}
        <div className="hidden sm:block w-28 text-right flex-shrink-0">
          <span className={`block text-[15px] font-semibold tabular-nums tracking-tight whitespace-nowrap ${COR_TEMPO[info.prioridade]}`}>{tempoCurto(ch, info, tempos)}</span>
          <span className="block text-[11px] text-slate-400 dark:text-zinc-500">{rotuloTempo(info)}</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <AcaoPrincipal ch={ch} info={info} acoes={acoes} assumindoId={assumindoId} />
          <svg className="hidden md:block w-4 h-4 text-slate-300 dark:text-zinc-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </div>
      {/* Celular: tempo e responsável numa linha própria */}
      <div className="sm:hidden flex items-center gap-2 px-4 pb-3.5 -mt-2 pl-[72px] text-[12px]">
        <span className={`font-semibold tabular-nums ${COR_TEMPO[info.prioridade]}`}>{tempoCurto(ch, info, tempos)}</span>
        <span className="text-slate-400">{rotuloTempo(info)}</span>
        {info.responsavel && <span className="text-slate-500 truncate">· {info.meu ? 'Você' : info.responsavel}</span>}
      </div>
    </motion.li>
  );
}

export function ListaDemandas({ chamados, ctx, acoes, tempos, assumindoId, selecionadaId = null, compacta = false }) {
  const grupos = useMemo(() => agrupar(chamados, ctx), [chamados, ctx]);
  const [recolhidos, alternar] = useGruposRecolhidos();
  return (
    <div className="space-y-8">
      {grupos.map((g) => (
        <section key={g.estado}>
          <CabecalhoGrupo estado={g.estado} total={g.itens.length} aberto={!recolhidos[g.estado]} onAlternar={() => alternar(g.estado)} />
          <AnimatePresence initial={false}>
            {!recolhidos[g.estado] && (
              <motion.ul
                key="lista"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-[20px] bg-white dark:bg-[#16161a] ring-1 ring-black/[0.05] dark:ring-white/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-black/[0.045] dark:divide-white/[0.06]"
              >
                <AnimatePresence initial={false}>
                  {g.itens.map((ch) => (
                    <LinhaDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} selecionada={selecionadaId === ch.id} compacta={compacta} />
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      ))}
    </div>
  );
}

// ==============================================================================
// CARDS
// ==============================================================================

function CartaoDemanda({ ch, ctx, acoes, tempos, assumindoId, selecionada = false, kanban = false }) {
  const info = infoDemanda(ch, ctx);
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      whileHover={{ y: -3 }}
      transition={MOLA}
      draggable={kanban}
      onDragStart={kanban ? (e) => e.dataTransfer.setData('text/plain', ch.id) : undefined}
      onClick={() => acoes.abrirDetalhe(ch)}
      className={`group relative flex flex-col rounded-[20px] bg-white dark:bg-[#16161a] cursor-pointer overflow-hidden transition-shadow duration-300 ${
        selecionada
          ? 'ring-2 ring-[#4d7c0f] dark:ring-[#84cc16] shadow-lg'
          : 'ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_-18px_rgba(0,0,0,0.18)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_18px_40px_-18px_rgba(0,0,0,0.25)]'
      }`}
    >
      <div className={kanban ? 'p-4' : 'p-5'}>
        <div className="flex items-start gap-3">
          <Monograma nome={ch.empresa_nome} tamanho={kanban ? 'w-9 h-9 text-[12px] rounded-xl' : 'w-11 h-11 text-[14px] rounded-[14px]'} />
          <div className="min-w-0 flex-1">
            <h4 className={`font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate ${kanban ? 'text-[14px]' : 'text-[15px]'}`}>{ch.empresa_nome}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <PilulaEstado info={info} />
              {!kanban && <Selos ch={ch} info={info} />}
            </div>
          </div>
        </div>
        <p className={`mt-3.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-zinc-300 ${kanban ? 'line-clamp-2' : 'line-clamp-3 min-h-[3.9em]'}`}>
          {info.descricao || <span className="text-slate-400">Sem descrição</span>}
        </p>
      </div>
      <div className={`mt-auto flex items-center gap-3 border-t border-black/[0.05] dark:border-white/[0.06] bg-black/[0.012] dark:bg-white/[0.015] ${kanban ? 'px-4 py-2.5' : 'px-5 py-3.5'}`}>
        <div className="min-w-0 flex-1">
          <span className={`block font-semibold tabular-nums tracking-tight ${COR_TEMPO[info.prioridade]} ${kanban ? 'text-[13px]' : 'text-[15px]'}`}>{tempoCurto(ch, info, tempos)}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 truncate">
            {rotuloTempo(info)}
            {info.responsavel && <> · {info.meu ? 'você' : info.responsavel}</>}
          </span>
        </div>
        <AcaoPrincipal ch={ch} info={info} acoes={acoes} assumindoId={assumindoId} />
      </div>
    </motion.article>
  );
}

export function CardsDemandas({ chamados, ctx, acoes, tempos, assumindoId, selecionadaId = null, compacta = false }) {
  const grupos = useMemo(() => agrupar(chamados, ctx), [chamados, ctx]);
  const [recolhidos, alternar] = useGruposRecolhidos();
  return (
    <div className="space-y-9">
      {grupos.map((g) => (
        <section key={g.estado}>
          <CabecalhoGrupo estado={g.estado} total={g.itens.length} aberto={!recolhidos[g.estado]} onAlternar={() => alternar(g.estado)} />
          <AnimatePresence initial={false}>
            {!recolhidos[g.estado] && (
              <motion.div
                key="grade"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={`grid gap-4 p-1 -m-1 overflow-hidden ${compacta ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'}`}
              >
                <AnimatePresence initial={false}>
                  {g.itens.map((ch) => (
                    <CartaoDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} selecionada={selecionadaId === ch.id} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      ))}
    </div>
  );
}

// ==============================================================================
// KANBAN: coluna "Aguardando atendente" + uma coluna por pessoa (arraste para atribuir)
// ==============================================================================

function ColunaKanban({ titulo, subtitulo, cabecalho, itens, vazio, destaque, onSoltar, children }) {
  const [sobre, setSobre] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!onSoltar) return;
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        setSobre(false);
        if (!onSoltar) return;
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) onSoltar(id);
      }}
      className={`w-[300px] sm:w-[320px] flex-shrink-0 flex flex-col rounded-[22px] transition-colors max-h-[calc(100dvh-260px)] min-h-[320px] ${
        sobre
          ? 'ring-2 ring-[#4d7c0f] dark:ring-[#84cc16] bg-[#4d7c0f]/[0.05] dark:bg-[#84cc16]/[0.06]'
          : destaque
            ? 'ring-1 ring-amber-500/25 bg-amber-500/[0.04]'
            : 'ring-1 ring-black/[0.05] dark:ring-white/[0.07] bg-black/[0.018] dark:bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        {cabecalho}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate">{titulo}</p>
          {subtitulo && <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 truncate">{subtitulo}</p>}
        </div>
        <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[12px] font-semibold tabular-nums text-slate-600 dark:text-zinc-300 flex items-center justify-center">{itens.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
        {itens.length === 0 ? <p className="px-2 py-10 text-center text-xs text-slate-400 dark:text-zinc-500">{vazio}</p> : children}
      </div>
    </div>
  );
}

export function KanbanDemandas({ chamados, ctx, acoes, tempos, assumindoId, tecnicos = [], pertenceA, ehMim, selecionadaId = null }) {
  const espera = useMemo(() => ordenarPorPrioridade(chamados.filter((c) => c.status === 'aguardando_visualizacao'), ctx), [chamados, ctx]);
  const colunas = useMemo(() => {
    const ativos = chamados.filter((c) => c.status === 'em_andamento' || c.status === 'pendente');
    return tecnicos
      .map((tec) => ({ tec, itens: ordenarPorPrioridade(ativos.filter((c) => pertenceA(c, tec)), ctx) }))
      .sort((a, b) => (ehMim(a.tec) ? -1 : ehMim(b.tec) ? 1 : b.itens.length - a.itens.length));
  }, [chamados, ctx, tecnicos, pertenceA, ehMim]);

  return (
    <div className="-mx-1 px-1 overflow-x-auto pb-3">
      <div className="flex gap-4 items-stretch">
        <ColunaKanban titulo="Aguardando atendente" subtitulo="Arraste para alguém da equipe" itens={espera} vazio="Nenhuma demanda esperando." destaque cabecalho={<span className="w-2.5 h-2.5 rounded-full bg-amber-500" />}>
          <AnimatePresence initial={false}>
            {espera.map((ch) => (
              <CartaoDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} kanban selecionada={selecionadaId === ch.id} />
            ))}
          </AnimatePresence>
        </ColunaKanban>

        {colunas.map(({ tec, itens }) => {
          const mim = ehMim(tec);
          const emAtendimento = itens.filter((c) => c.status === 'em_andamento').length;
          const aguardando = itens.length - emAtendimento;
          return (
            <ColunaKanban
              key={tec.key || tec.email || tec.nome}
              titulo={mim ? `${tec.nome} (você)` : tec.nome}
              subtitulo={itens.length ? `${emAtendimento} em atendimento${aguardando ? ` · ${aguardando} aguardando cliente` : ''}` : 'Livre'}
              itens={itens}
              vazio="Sem demandas agora."
              cabecalho={<Avatar nome={tec.nome} tamanho="w-8 h-8 text-[11px]" destaque={mim} />}
              onSoltar={(id) => acoes.atribuir(id, tec)}
            >
              <AnimatePresence initial={false}>
                {itens.map((ch) => (
                  <CartaoDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} kanban selecionada={selecionadaId === ch.id} />
                ))}
              </AnimatePresence>
            </ColunaKanban>
          );
        })}
      </div>
    </div>
  );
}

// ==============================================================================
// PAINEL DA DEMANDA (abre ao lado, dividindo a tela)
// ==============================================================================

const formatarHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
};

/** Linha do tempo: o que aconteceu com a demanda até agora. */
function LinhaDoTempo({ ch, info }) {
  const passos = [{ titulo: 'Demanda aberta', detalhe: [ch.criador_nome && `por ${ch.criador_nome}`, formatarHora(ch.created_at || ch.tempo_espera_inicio)].filter(Boolean).join(' · '), feito: true }];
  if (info.estado === 'espera') {
    passos.push({ titulo: 'Aguardando alguém assumir', detalhe: info.responsavel ? `designada para ${info.responsavel}` : 'na fila geral', atual: true });
  } else {
    passos.push({ titulo: 'Atendimento iniciado', detalhe: [info.responsavel && (info.meu ? 'por você' : `por ${info.responsavel}`), formatarHora(ch.tempo_ativo_inicio)].filter(Boolean).join(' · '), feito: true, atual: info.estado === 'atendimento' });
  }
  if (info.estado === 'cliente') {
    passos.push({ titulo: 'Aguardando retorno do cliente', detalhe: formatarHora(ch.aguardando_cliente_desde), atual: true });
  }
  if (info.estado === 'concluida') {
    passos.push({ titulo: 'Concluída', detalhe: formatarHora(ch.finalizado_em), feito: true });
  }
  return (
    <ol className="relative">
      {passos.map((p, i) => (
        <li key={p.titulo} className="relative flex gap-3.5 pb-4 last:pb-0">
          {i < passos.length - 1 && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-black/[0.08] dark:bg-white/[0.1]" />}
          <span
            className={`relative mt-1 w-[15px] h-[15px] rounded-full flex-shrink-0 flex items-center justify-center ${
              p.atual ? `${info.visual.ponto} ring-4 ring-black/[0.04] dark:ring-white/[0.06]` : p.feito ? 'bg-[#1d1d1f] dark:bg-white' : 'bg-black/10'
            }`}
          >
            {p.feito && !p.atual && <CheckIcon className="w-2.5 h-2.5 text-white dark:text-[#1d1d1f] stroke-[3]" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-[#1d1d1f] dark:text-white">{p.titulo}</span>
            {p.detalhe && <span className="block text-[12px] text-slate-500 dark:text-zinc-400">{p.detalhe}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const SUGESTOES_ETIQUETA = ['urgente', 'financeiro', 'duvida', 'configuracao', 'bloqueado', 'reaberto'];

const botaoSecundario = 'h-10 px-3.5 rounded-xl text-[13px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer transition-colors text-slate-700 dark:text-zinc-200 bg-black/[0.035] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.1]';

export function PainelDemanda({ chamado, onFechar, ctx, acoes, tempos, assumindoId }) {
  const [novaTag, setNovaTag] = useState('');
  const [menuAdiar, setMenuAdiar] = useState(false);
  useEffect(() => {
    setNovaTag('');
    setMenuAdiar(false);
  }, [chamado?.id]);

  if (!chamado) return null;
  const info = infoDemanda(chamado, ctx);
  const etiquetas = chamado.etiquetas || [];
  const adiado = chamado.adiado_ate && Date.now() < new Date(chamado.adiado_ate).getTime();
  const adicionarTag = (t) => {
    const limpa = String(t || '').trim().replace(/^#/, '');
    if (!limpa || etiquetas.includes(limpa)) return;
    acoes.etiquetas(chamado, [...etiquetas, limpa]);
    setNovaTag('');
  };

  return (
    <div className="h-full flex flex-col rounded-[24px] bg-white dark:bg-[#16161a] ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_2px_6px_rgba(0,0,0,0.04),0_24px_60px_-24px_rgba(0,0,0,0.25)] overflow-hidden text-[#1d1d1f] dark:text-white">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={chamado.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-h-0 flex flex-col"
        >
          {/* Cabeçalho com identidade da empresa */}
          <header className="px-6 pt-6 pb-5">
            <div className="flex items-start justify-between gap-3">
              <Monograma nome={chamado.empresa_nome} tamanho="w-12 h-12 text-[15px] rounded-[15px]" />
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar detalhes"
                className="w-9 h-9 -mr-2 -mt-1 rounded-full flex items-center justify-center text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <h2 className="mt-4 text-[22px] font-bold tracking-tight leading-tight">{chamado.empresa_nome}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <PilulaEstado info={info} grande />
              <Selos ch={chamado} info={info} />
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-6">
            {/* Tempo em destaque */}
            <div className="grid grid-cols-2 rounded-2xl bg-black/[0.025] dark:bg-white/[0.04] divide-x divide-black/[0.06] dark:divide-white/[0.08]">
              <div className="p-4">
                <span className="block text-[12px] text-slate-500 dark:text-zinc-400">{rotuloTempo(info) === 'esperando' ? 'Esperando há' : rotuloTempo(info) === 'sem resposta' ? 'Sem resposta há' : 'Em atendimento há'}</span>
                <span className={`block mt-1 text-[19px] font-semibold tabular-nums tracking-tight whitespace-nowrap ${COR_TEMPO[info.prioridade]}`}>{tempoPrincipal(chamado, info, tempos)}</span>
              </div>
              <div className="p-4">
                <span className="block text-[12px] text-slate-500 dark:text-zinc-400">Responsável</span>
                <span className="mt-1.5 flex items-center gap-2 min-w-0">
                  {info.responsavel ? (
                    <>
                      <Avatar nome={info.responsavel} destaque={info.meu} tamanho="w-7 h-7 text-[10.5px]" />
                      <span className="text-[14px] font-medium truncate">{info.meu ? 'Você' : info.responsavel}</span>
                    </>
                  ) : (
                    <span className="text-[14px] text-slate-500">Fila geral</span>
                  )}
                </span>
              </div>
            </div>

            {/* Pedido */}
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-zinc-500 mb-2">O que precisa ser feito</h3>
              <p className="text-[14.5px] leading-relaxed text-slate-800 dark:text-zinc-200 whitespace-pre-wrap">{info.descricao || <span className="text-slate-400">Sem descrição.</span>}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-slate-500 dark:text-zinc-400">
                <span>{info.departamentos.join(', ')}</span>
                {info.solicitante && <span>Pedido por {info.solicitante}</span>}
                {chamado.prazo_limite && (
                  <span className={info.prazoVencido ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>Prazo {formatarHora(chamado.prazo_limite)}</span>
                )}
              </div>
            </section>

            {/* Linha do tempo */}
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-zinc-500 mb-3">Andamento</h3>
              <LinhaDoTempo ch={chamado} info={info} />
            </section>

            {/* Etiquetas */}
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-zinc-500 mb-2.5">Etiquetas</h3>
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[13px]">
                    #{t}
                    <button
                      type="button"
                      aria-label={`Remover ${t}`}
                      onClick={() => acoes.etiquetas(chamado, etiquetas.filter((x) => x !== t))}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={novaTag}
                  onChange={(e) => setNovaTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarTag(novaTag);
                    }
                  }}
                  placeholder="Adicionar…"
                  aria-label="Nova etiqueta"
                  className="h-7 w-28 px-2.5 rounded-full bg-transparent ring-1 ring-inset ring-black/[0.1] dark:ring-white/[0.15] text-[13px] focus:outline-none focus:ring-[#4d7c0f] dark:focus:ring-[#84cc16]"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {SUGESTOES_ETIQUETA.filter((s) => !etiquetas.includes(s)).map((s) => (
                  <button key={s} type="button" onClick={() => adicionarTag(s)} className="text-[12px] text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white cursor-pointer">
                    +{s}
                  </button>
                ))}
              </div>
            </section>

            {adiado && (
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] text-[13px]">
                <span className="flex items-center gap-2">
                  <BellOffIcon className="w-4 h-4 text-slate-500" />
                  Alerta pausado até {new Date(chamado.adiado_ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button type="button" onClick={() => acoes.reativarAlerta(chamado)} className="font-semibold text-[#4d7c0f] dark:text-[#84cc16] hover:underline cursor-pointer">
                  Reativar
                </button>
              </div>
            )}
          </div>

          {/* Ações por importância */}
          <footer className="px-6 py-5 border-t border-black/[0.05] dark:border-white/[0.07] space-y-2.5 bg-black/[0.012] dark:bg-white/[0.015]">
            <div className="[&>button]:w-full [&>button]:h-11 [&>button]:rounded-xl [&>button]:text-[14px]">
              <AcaoPrincipal ch={chamado} info={info} acoes={acoes} assumindoId={assumindoId} rotuloLongo cheia />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {info.estado === 'espera' && (
                <button type="button" onClick={() => acoes.assumir(chamado)} disabled={Boolean(assumindoId)} className={botaoSecundario}>
                  <PlayIcon className="w-2.5 h-2.5 fill-current" /> Só assumir
                </button>
              )}
              {!info.interna && info.estado !== 'espera' && (
                <button type="button" onClick={() => acoes.abrirEmpresa(chamado)} className={botaoSecundario}>
                  <BuildingIcon className="w-3.5 h-3.5" /> Abrir empresa
                </button>
              )}
              {info.interna && info.estado !== 'espera' && (
                <button type="button" onClick={() => acoes.abrirPipeline()} className={botaoSecundario}>
                  <KanbanIcon className="w-3.5 h-3.5" /> Pipeline
                </button>
              )}
              {info.estado !== 'concluida' && (
                <button type="button" onClick={() => acoes.repassar(chamado)} className={botaoSecundario}>
                  <UsersIcon className="w-3.5 h-3.5" /> Repassar
                </button>
              )}
              {info.estado === 'espera' && (
                <span className="relative col-span-2">
                  <button type="button" onClick={() => setMenuAdiar((v) => !v)} aria-expanded={menuAdiar} className={`${botaoSecundario} w-full`}>
                    <BellOffIcon className="w-3.5 h-3.5" /> Adiar alerta
                  </button>
                  <AnimatePresence>
                    {menuAdiar && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        className="absolute bottom-full mb-2 left-0 right-0 z-10 p-1.5 rounded-xl ring-1 ring-black/[0.08] dark:ring-white/[0.12] bg-white dark:bg-[#1c1c20] shadow-xl grid grid-cols-5 gap-1"
                      >
                        {[10, 15, 30, 60, 120].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              acoes.adiar(chamado, m);
                              setMenuAdiar(false);
                            }}
                            className="h-9 rounded-lg text-[13px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                          >
                            {m < 60 ? `${m}m` : `${m / 60}h`}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </span>
              )}
            </div>
            <button type="button" onClick={() => acoes.cancelar(chamado)} className="w-full h-9 text-[13px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/[0.06] rounded-xl cursor-pointer transition-colors">
              {info.estado === 'concluida' ? 'Excluir do histórico' : 'Cancelar demanda'}
            </button>
          </footer>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
