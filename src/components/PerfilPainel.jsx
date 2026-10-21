'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ROTULOS_PAPEL } from '@/lib/roles';

const MOLA = { type: 'spring', bounce: 0.18, duration: 0.42 };
const LIMITE_SESSAO = 30 * 60;

const iniciais = (nome) =>
  String(nome || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

function Segmentado({ opcoes, valor, onMudar, id, rotulo }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid gap-1 p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      {opcoes.map((op) => {
        const ativo = valor === op.id;
        return (
          <button
            key={op.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onMudar(op.id)}
            className={`relative h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              ativo ? 'text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'
            }`}
          >
            {ativo && <motion.span layoutId={`seg-${id}`} transition={MOLA} className="absolute inset-0 rounded-lg bg-white dark:bg-[#3a3a3f] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" />}
            <span className="relative flex items-center gap-1.5">
              {op.icone}
              {op.rotulo}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Interruptor({ ligado, onMudar, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => onMudar(!ligado)}
      className={`relative w-[42px] h-[26px] rounded-full flex-shrink-0 cursor-pointer transition-colors duration-200 ${ligado ? 'bg-[#4d7c0f] dark:bg-[#84cc16]' : 'bg-black/[0.12] dark:bg-white/[0.18]'}`}
    >
      <motion.span
        animate={{ x: ligado ? 18 : 2 }}
        transition={MOLA}
        className="absolute top-[2px] left-0 w-[22px] h-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
      />
    </button>
  );
}

const Sol = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Lua = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const Auto = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

const linhaMenu =
  'w-full h-11 px-3 -mx-1 rounded-xl flex items-center gap-3 text-[13.5px] font-medium cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors';

/**
 * Conta, aparência e sessão. No computador abre ancorado ao avatar; no celular, como folha inferior.
 */
export default function PerfilPainel({
  modo = 'popover',
  nome,
  email,
  papelReal,
  papelAtual,
  onTrocarPapel,
  tema,
  onTema,
  segundosRestantes = LIMITE_SESSAO,
  podeConfigurar,
  onConfiguracoes,
  mostrarDemo,
  onDemo,
  onSair,
}) {
  const minutos = Math.floor(segundosRestantes / 60);
  const segundos = String(segundosRestantes % 60).padStart(2, '0');
  const fracao = Math.max(0, Math.min(1, segundosRestantes / LIMITE_SESSAO));
  const ehAdmin = papelReal === 'administrador';
  const folha = modo === 'sheet';

  return (
    <motion.div
      role="dialog"
      aria-label="Sua conta"
      initial={folha ? { y: '100%' } : { opacity: 0, y: -6, scale: 0.97 }}
      animate={folha ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
      exit={folha ? { y: '100%' } : { opacity: 0, y: -6, scale: 0.97 }}
      transition={folha ? { type: 'spring', bounce: 0.12, duration: 0.45 } : { duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      style={folha ? undefined : { transformOrigin: 'top right' }}
      className={
        folha
          ? 'fixed inset-x-0 bottom-0 z-[60] rounded-t-[28px] bg-[#f9f9fb] dark:bg-[#26262a] border-t border-black/[0.06] dark:border-white/[0.1] px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[88dvh] overflow-y-auto text-[#1d1d1f] dark:text-[#f5f5f7]'
          : 'absolute right-0 top-[calc(100%+10px)] w-[340px] rounded-[22px] bg-white/95 dark:bg-[#26262a]/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.12] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] p-4 text-[#1d1d1f] dark:text-[#f5f5f7] z-50'
      }
    >
      {folha && <div className="mx-auto mb-4 w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" aria-hidden="true" />}

      {/* Quem está conectado */}
      <div className="flex items-center gap-3.5 px-1">
        <div className="w-12 h-12 rounded-full bg-[#1d1d1f] dark:bg-[#f5f5f7] text-white dark:text-[#1d1d1f] flex items-center justify-center text-[15px] font-semibold tracking-wide flex-shrink-0">
          {iniciais(nome)}
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight truncate">{nome}</p>
          <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 truncate">{email}</p>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5">{ROTULOS_PAPEL[papelAtual] || papelAtual}</p>
        </div>
      </div>

      {/* Sessão */}
      <div className="mt-4 px-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-slate-500 dark:text-zinc-400">Sessão encerra por inatividade em</span>
          <span className="font-medium tabular-nums">
            {minutos}:{segundos}
          </span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-black/[0.07] dark:bg-white/[0.1] overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${fracao < 0.17 ? 'bg-rose-500' : 'bg-[#1d1d1f]/60 dark:bg-white/60'}`}
            style={{ width: `${fracao * 100}%` }}
          />
        </div>
      </div>

      <div className="my-4 h-px bg-black/[0.06] dark:bg-white/[0.1]" />

      {/* Aparência */}
      <div className="px-1">
        <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Aparência</p>
        <Segmentado
          id={`tema-${modo}`}
          rotulo="Aparência"
          valor={tema}
          onMudar={onTema}
          opcoes={[
            { id: 'light', rotulo: 'Claro', icone: <Sol /> },
            { id: 'dark', rotulo: 'Escuro', icone: <Lua /> },
            { id: 'system', rotulo: 'Auto', icone: <Auto /> },
          ]}
        />
      </div>

      {ehAdmin && (
        <div className="mt-4 px-1 space-y-3.5">
          <div>
            <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Ver o sistema como</p>
            <Segmentado
              id={`papel-${modo}`}
              rotulo="Ver o sistema como"
              valor={papelAtual}
              onMudar={onTrocarPapel}
              opcoes={[
                { id: 'administrador', rotulo: 'Admin' },
                { id: 'suporte', rotulo: 'Suporte' },
                { id: 'vendas', rotulo: 'Vendas' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium">Dados de demonstração</p>
              <p className="text-[12px] text-slate-500 dark:text-zinc-400">Empresas e checklists de exemplo.</p>
            </div>
            <Interruptor ligado={Boolean(mostrarDemo)} onMudar={onDemo} rotulo="Dados de demonstração" />
          </div>
        </div>
      )}

      <div className="my-3 h-px bg-black/[0.06] dark:bg-white/[0.1]" />

      <div className="px-1">
        {podeConfigurar && (
          <button type="button" onClick={onConfiguracoes} className={linhaMenu}>
            <svg className="w-[18px] h-[18px] text-slate-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
            </svg>
            <span className="flex-1 text-left">Configurações gerais</span>
            <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
        <button type="button" onClick={onSair} className={`${linhaMenu} text-rose-600 dark:text-rose-400`}>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span className="flex-1 text-left">Sair</span>
        </button>
      </div>
    </motion.div>
  );
}
