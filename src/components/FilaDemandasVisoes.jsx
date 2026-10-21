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
    faixa: 'bg-amber-400',
    pilula: 'text-slate-600 dark:text-zinc-300',
    fundo: 'bg-white dark:bg-[#1c1c1e]',
    borda: 'ring-black/[0.07] dark:ring-white/[0.09]',
    linhaAberta: 'bg-black/[0.018] dark:bg-white/[0.03]',
    dica: 'Ninguém assumiu ainda',
  },
  atendimento: {
    rotulo: 'Em atendimento',
    curto: 'Em atendimento',
    ponto: 'bg-emerald-500',
    faixa: 'bg-emerald-500',
    pilula: 'text-slate-600 dark:text-zinc-300',
    fundo: 'bg-white dark:bg-[#1c1c1e]',
    borda: 'ring-black/[0.07] dark:ring-white/[0.09]',
    linhaAberta: 'bg-black/[0.018] dark:bg-white/[0.03]',
    dica: 'Sendo atendidas agora',
  },
  cliente: {
    rotulo: 'Aguardando cliente',
    curto: 'Aguardando cliente',
    ponto: 'bg-violet-500',
    faixa: 'bg-violet-500',
    pilula: 'text-slate-600 dark:text-zinc-300',
    fundo: 'bg-white dark:bg-[#1c1c1e]',
    borda: 'ring-black/[0.07] dark:ring-white/[0.09]',
    linhaAberta: 'bg-black/[0.018] dark:bg-white/[0.03]',
    dica: 'Esperando o cliente responder',
  },
  concluida: {
    rotulo: 'Concluída',
    curto: 'Concluída',
    ponto: 'bg-slate-400',
    faixa: 'bg-slate-300',
    pilula: 'text-slate-600 dark:text-zinc-300',
    fundo: 'bg-white dark:bg-[#1c1c1e]',
    borda: 'ring-black/[0.07] dark:ring-white/[0.09]',
    linhaAberta: 'bg-slate-50 dark:bg-white/[0.03]',
    dica: '',
  },
};

const ORDEM_GRUPOS = ['espera', 'atendimento', 'cliente', 'concluida'];

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
const PALETA = ['bg-[#f2f2f4] text-[#3a3a3c] dark:bg-white/[0.08] dark:text-zinc-200']
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
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${grande ? 'text-[13px]' : 'text-[12px]'} ${info.visual.pilula}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.visual.ponto}`} />
      {grande ? info.visual.rotulo : info.visual.curto}
    </span>
  );
}

function Selos({ ch, info }) {
  const itens = [];
  if (info.prioridade === 'critica') itens.push(['Urgente', 'text-rose-600 dark:text-rose-400']);
  if (info.prazoVencido) itens.push(['Prazo vencido', 'text-rose-600 dark:text-rose-400']);
  if (ch.is_lembrete) itens.push(['Lembrete', 'text-slate-500 dark:text-zinc-400']);
  if (ch.sync_estado === 'pendente') itens.push(['Não sincronizada', 'text-amber-600 dark:text-amber-400']);
  if (ch.adiado_ate && Date.now() < new Date(ch.adiado_ate).getTime()) itens.push(['Alerta pausado', 'text-slate-500 dark:text-zinc-400']);
  return itens.map(([t, c]) => (
    <span key={t} className={`text-[12px] font-medium ${c}`}>
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
const SAIDA_ITEM = { opacity: 0, height: 0, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } };
const ABRIR = { duration: 0.24, ease: [0.2, 0, 0, 1] };

/** Tempo dentro de um chip colorido pela urgência: dá para bater o olho e saber o que está atrasado. */
const COR_CHIP_TEMPO = {
  critica: 'text-rose-600 dark:text-rose-400',
  atencao: 'text-amber-600 dark:text-amber-400',
  normal: 'text-[#1d1d1f] dark:text-white',
};
function ChipTempo({ ch, info, tempos, tamanho = 'normal' }) {
  return (
    <span className="inline-flex flex-col items-end">
      <span className={`font-semibold tabular-nums tracking-tight whitespace-nowrap ${tamanho === 'pequeno' ? 'text-[13px]' : 'text-[15px]'} ${COR_CHIP_TEMPO[info.prioridade]}`}>
        {tempoCurto(ch, info, tempos)}
      </span>
      <span className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">{rotuloTempo(info)}</span>
    </span>
  );
}

// ==============================================================================
// DETALHES DENTRO DO PRÓPRIO ITEM (sem painel lateral; nada muda de lugar na tela)
// ==============================================================================

const acaoTexto = 'h-8 px-2.5 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-zinc-300 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] transition-colors disabled:opacity-50';

function EditorEtiquetas({ chamado, acoes }) {
  const [nova, setNova] = useState('');
  const etiquetas = chamado.etiquetas || [];
  const adicionar = () => {
    const limpa = nova.trim().replace(/^#/, '');
    if (limpa && !etiquetas.includes(limpa)) acoes.etiquetas(chamado, [...etiquetas, limpa]);
    setNova('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {etiquetas.map((t) => (
        <span key={t} className="inline-flex items-center gap-0.5 h-7 pl-2.5 pr-1 rounded-full bg-white dark:bg-white/[0.08] ring-1 ring-black/[0.06] dark:ring-white/[0.08] text-[12.5px]">
          {t}
          <button type="button" aria-label={`Remover ${t}`} onClick={() => acoes.etiquetas(chamado, etiquetas.filter((x) => x !== t))} className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer">
            <XMarkIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={nova}
        onChange={(e) => setNova(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            adicionar();
          }
        }}
        placeholder="+ Etiqueta"
        aria-label="Nova etiqueta"
        className="h-7 w-24 px-2.5 rounded-full bg-transparent border border-dashed border-black/[0.15] dark:border-white/[0.2] text-[12.5px] placeholder:text-slate-400 focus:outline-none focus:border-solid focus:border-[#4d7c0f] dark:focus:border-[#84cc16]"
      />
    </div>
  );
}

function AcoesSecundarias({ chamado, info, acoes, assumindoId, compacta = false }) {
  const [menuAdiar, setMenuAdiar] = useState(false);
  const parar = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {info.estado === 'espera' && !compacta && (
        <button type="button" onClick={parar(() => acoes.assumir(chamado))} disabled={Boolean(assumindoId)} className={acaoTexto} title="Só assumir" aria-label="Só assumir">
          <PlayIcon className="w-2.5 h-2.5 fill-current" /> {compacta ? null : 'Só assumir'}
        </button>
      )}
      {!info.interna && (
        <button type="button" onClick={parar(() => acoes.abrirEmpresa(chamado))} className={acaoTexto} title="Abrir empresa" aria-label="Abrir empresa">
          <BuildingIcon className="w-3.5 h-3.5" /> {!compacta && 'Empresa'}
        </button>
      )}
      {info.interna && info.estado !== 'espera' && (
        <button type="button" onClick={parar(() => acoes.abrirPipeline())} className={acaoTexto}>
          <KanbanIcon className="w-3.5 h-3.5" /> {!compacta && 'Pipeline'}
        </button>
      )}
      {info.estado !== 'concluida' && (
        <button type="button" onClick={parar(() => acoes.repassar(chamado))} className={acaoTexto} title="Repassar" aria-label="Repassar">
          <UsersIcon className="w-3.5 h-3.5" /> {!compacta && 'Repassar'}
        </button>
      )}
      {info.estado === 'espera' && (
        <span className="relative">
          <button type="button" onClick={parar(() => setMenuAdiar((v) => !v))} aria-expanded={menuAdiar} className={acaoTexto} title="Adiar alerta" aria-label="Adiar alerta">
            <BellOffIcon className="w-3.5 h-3.5" /> {!compacta && 'Adiar'}
          </button>
          {menuAdiar && (
            <div className="absolute bottom-full mb-1.5 left-0 z-20 p-1 rounded-xl ring-1 ring-black/[0.08] dark:ring-white/[0.12] bg-white dark:bg-[#1c1c20] shadow-lg flex" onClick={(e) => e.stopPropagation()}>
              {[10, 15, 30, 60, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    acoes.adiar(chamado, m);
                    setMenuAdiar(false);
                  }}
                  className="h-8 px-2.5 rounded-lg text-[13px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer whitespace-nowrap"
                >
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
      {!compacta && chamado.adiado_ate && Date.now() < new Date(chamado.adiado_ate).getTime() && (
        <button type="button" onClick={parar(() => acoes.reativarAlerta(chamado))} className={acaoTexto}>
          <BellOffIcon className="w-3.5 h-3.5" /> Reativar alerta
        </button>
      )}
      <button
        type="button"
        onClick={parar(() => acoes.cancelar(chamado))}
        title={info.estado === 'concluida' ? 'Excluir' : 'Cancelar demanda'}
        aria-label={info.estado === 'concluida' ? 'Excluir' : 'Cancelar demanda'}
        className={`${acaoTexto} !text-rose-600 dark:!text-rose-400 ${compacta ? 'ml-auto' : ''}`}
      >
        {compacta ? <XMarkIcon className="w-4 h-4" /> : info.estado === 'concluida' ? 'Excluir' : 'Cancelar'}
      </button>
    </div>
  );
}

/** Detalhes que se abrem embaixo da linha da lista: aproveita a largura toda, em três colunas. */
function DetalhesLinha({ ch, info, acoes, assumindoId }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-x-10 gap-y-6 px-4 sm:px-5 pb-5 pt-1 sm:pl-[76px]" onClick={(e) => e.stopPropagation()}>
      <div className="min-w-0 space-y-4">
        <div>
          <h4 className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Pedido</h4>
          <p className="text-[14px] leading-relaxed text-slate-800 dark:text-zinc-200 whitespace-pre-wrap">{info.descricao || <span className="text-slate-400">Sem descrição.</span>}</p>
        </div>
        <div>
          <h4 className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Etiquetas</h4>
          <EditorEtiquetas chamado={ch} acoes={acoes} />
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <dl className="grid grid-cols-[104px_1fr] gap-y-1.5 text-[13px]">
          <dt className="text-slate-500 dark:text-zinc-400">Responsável</dt>
          <dd className="truncate">{info.responsavel ? (info.meu ? 'Você' : info.responsavel) : <span className="text-slate-400">Fila geral</span>}</dd>
          <dt className="text-slate-500 dark:text-zinc-400">Departamento</dt>
          <dd className="truncate">{info.departamentos.join(', ')}</dd>
          {info.solicitante && (
            <>
              <dt className="text-slate-500 dark:text-zinc-400">Pedido por</dt>
              <dd className="truncate">{info.solicitante}</dd>
            </>
          )}
          {ch.prazo_limite && (
            <>
              <dt className="text-slate-500 dark:text-zinc-400">Prazo</dt>
              <dd className={info.prazoVencido ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>{formatarHora(ch.prazo_limite)}</dd>
            </>
          )}
        </dl>
        <LinhaDoTempo ch={ch} info={info} />
        <div className="pt-1 -ml-2.5">
          <AcoesSecundarias chamado={ch} info={info} acoes={acoes} assumindoId={assumindoId} />
        </div>
      </div>
    </div>
  );
}

// ==============================================================================
// LISTA
// ==============================================================================

function LinhaDemanda({ ch, ctx, acoes, tempos, assumindoId, aberta }) {
  const info = infoDemanda(ch, ctx);
  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={SAIDA_ITEM}
      transition={{ duration: 0.16 }}
      className={`group relative overflow-hidden transition-colors duration-200 ${aberta ? info.visual.linhaAberta : 'hover:bg-black/[0.015] dark:hover:bg-white/[0.025]'}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={aberta}
        onClick={() => acoes.abrirDetalhe(ch)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            acoes.abrirDetalhe(ch);
          }
        }}
        className="flex items-center gap-4 px-4 sm:px-5 py-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7c0f]"
      >
        <Monograma nome={ch.empresa_nome} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate">{ch.empresa_nome}</span>
            <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
              <Selos ch={ch} info={info} />
            </span>
          </div>
          <p className={`mt-0.5 text-[13px] text-slate-500 dark:text-zinc-400 ${aberta ? 'hidden' : 'truncate'}`}>{info.descricao || 'Sem descrição'}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-zinc-500 min-w-0">
            <PilulaEstado info={info} />
            <span className="truncate">
              {info.departamentos.join(' · ')}
              {info.responsavel && <> · {info.meu ? 'você' : info.responsavel}</>}
            </span>
          </p>
        </div>
        <div className="hidden sm:block flex-shrink-0">
          <ChipTempo ch={ch} info={info} tempos={tempos} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <AcaoPrincipal ch={ch} info={info} acoes={acoes} assumindoId={assumindoId} />
          <svg className={`hidden md:block w-4 h-4 text-slate-400 transition-transform duration-200 ${aberta ? 'rotate-90' : 'group-hover:translate-x-0.5'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {aberta && (
          <motion.div key="detalhes" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={ABRIR} className="overflow-hidden">
            <DetalhesLinha ch={ch} info={info} acoes={acoes} assumindoId={assumindoId} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function ListaDemandas({ chamados, ctx, acoes, tempos, assumindoId, selecionadaId = null }) {
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
                transition={ABRIR}
                className="rounded-2xl bg-white dark:bg-[#1c1c1e] ring-1 ring-black/[0.07] dark:ring-white/[0.09] overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.07]"
              >
                <AnimatePresence initial={false}>
                  {g.itens.map((ch) => (
                    <LinhaDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} aberta={selecionadaId === ch.id} />
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
// CARDS: ao clicar, o card mostra os detalhes no próprio espaço (mesma altura, nada se mexe)
// ==============================================================================

function CartaoDemanda({ ch, ctx, acoes, tempos, assumindoId, aberto = false, kanban = false }) {
  const info = infoDemanda(ch, ctx);
  const altura = kanban ? 'min-h-[200px]' : 'h-[236px]';
  const pad = kanban ? 'p-4' : 'p-5';
  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.16 }}
      draggable={kanban && !aberto}
      onDragStart={kanban ? (e) => e.dataTransfer.setData('text/plain', ch.id) : undefined}
      onClick={() => acoes.abrirDetalhe(ch)}
      className={`group relative flex flex-col ${altura} rounded-2xl ${info.visual.fundo} ring-1 ${aberto ? 'ring-[#1d1d1f]/30 dark:ring-white/30' : info.visual.borda} cursor-pointer overflow-hidden transition-shadow duration-200 ease-out ${aberto ? 'shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]' : 'hover:shadow-[0_6px_20px_-10px_rgba(0,0,0,0.16)]'}`}
    >

      {/* Cabeçalho fixo (igual nas duas faces) */}
      <div className={`${pad} pb-0 flex items-start gap-3`}>
        <Monograma nome={ch.empresa_nome} tamanho={kanban ? 'w-9 h-9 text-[12px] rounded-xl' : 'w-11 h-11 text-[14px] rounded-[14px]'} />
        <div className="min-w-0 flex-1">
          <h4 className={`font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate ${kanban ? 'text-[14px]' : 'text-[15px]'}`}>{ch.empresa_nome}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PilulaEstado info={info} />
            {!kanban && !aberto && <Selos ch={ch} info={info} />}
          </div>
        </div>
        {aberto && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              acoes.abrirDetalhe(ch);
            }}
            aria-label="Fechar detalhes"
            className="w-8 h-8 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex-shrink-0"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Corpo: resumo ↔ detalhes, trocando no mesmo espaço */}
      <div className="relative flex-1 min-h-0">
        <AnimatePresence initial={false} mode="popLayout">
          {!aberto ? (
            <motion.div key="frente" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className={`absolute inset-0 ${pad} pt-3.5 flex flex-col`}>
              <p className={`text-[13.5px] leading-relaxed text-slate-600 dark:text-zinc-300 ${kanban ? 'line-clamp-2' : 'line-clamp-3'}`}>{info.descricao || <span className="text-slate-400">Sem descrição</span>}</p>
              <div className="mt-auto pt-3 flex items-end justify-between gap-3">
                <div className="min-w-0 [&>span]:items-start">
                  <ChipTempo ch={ch} info={info} tempos={tempos} tamanho={kanban ? 'pequeno' : 'normal'} />
                </div>
                <AcaoPrincipal ch={ch} info={info} acoes={acoes} assumindoId={assumindoId} />
              </div>
            </motion.div>
          ) : (
            <motion.div key="verso" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }} className="absolute inset-0 flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className={`flex-1 min-h-0 overflow-y-auto ${pad} pt-3 space-y-2.5`}>
                <p className="text-[13px] leading-relaxed text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{info.descricao || <span className="text-slate-400">Sem descrição.</span>}</p>
                <p className="text-[12px] text-slate-500 dark:text-zinc-400">
                  {info.departamentos.join(', ')}
                  {info.solicitante && <> · pedido por {info.solicitante}</>}
                  {info.responsavel && <> · {info.meu ? 'com você' : `com ${info.responsavel}`}</>}
                  {' · '}aberta {formatarHora(ch.created_at || ch.tempo_espera_inicio)}
                </p>
                {!kanban && <EditorEtiquetas chamado={ch} acoes={acoes} />}
              </div>
              <div className={`${kanban ? 'px-3 py-2' : 'px-3.5 py-2.5'} flex items-center gap-1.5 border-t border-black/[0.06] dark:border-white/[0.08]`}>
                <AcaoPrincipal ch={ch} info={info} acoes={acoes} assumindoId={assumindoId} cheia />
                <div className="flex-1 min-w-0 [&>div]:flex-nowrap [&>div]:justify-end">
                  <AcoesSecundarias chamado={ch} info={info} acoes={acoes} assumindoId={assumindoId} compacta />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

export function CardsDemandas({ chamados, ctx, acoes, tempos, assumindoId, selecionadaId = null }) {
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
                transition={ABRIR}
                className="grid gap-4 p-1 -m-1 overflow-hidden grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              >
                <AnimatePresence initial={false}>
                  {g.itens.map((ch) => (
                    <CartaoDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} aberto={selecionadaId === ch.id} />
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
            ? 'ring-1 ring-black/[0.06] dark:ring-white/[0.08] bg-black/[0.02] dark:bg-white/[0.025]'
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
              <CartaoDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} kanban aberto={selecionadaId === ch.id} />
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
                  <CartaoDemanda key={ch.id} ch={ch} ctx={ctx} acoes={acoes} tempos={tempos} assumindoId={assumindoId} kanban aberto={selecionadaId === ch.id} />
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
// LINHA DO TEMPO
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

