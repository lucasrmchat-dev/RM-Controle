'use client';

import React from 'react';

// ------------------------------------------------------------------------------
// Visual dos blocos do Fluxo Inteligente: cor por categoria e ícone por tipo
// ------------------------------------------------------------------------------
export const CORES_BLOCO = {
  emerald: { faixa: 'bg-emerald-500', suave: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300', anel: 'ring-emerald-500' },
  sky: { faixa: 'bg-sky-500', suave: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', anel: 'ring-sky-500' },
  blue: { faixa: 'bg-blue-500', suave: 'bg-blue-500/12 text-blue-700 dark:text-blue-300', anel: 'ring-blue-500' },
  violet: { faixa: 'bg-violet-500', suave: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', anel: 'ring-violet-500' },
  fuchsia: { faixa: 'bg-fuchsia-500', suave: 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300', anel: 'ring-fuchsia-500' },
  amber: { faixa: 'bg-amber-500', suave: 'bg-amber-500/14 text-amber-700 dark:text-amber-300', anel: 'ring-amber-500' },
  indigo: { faixa: 'bg-indigo-500', suave: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300', anel: 'ring-indigo-500' },
  teal: { faixa: 'bg-teal-500', suave: 'bg-teal-500/12 text-teal-700 dark:text-teal-300', anel: 'ring-teal-500' },
  slate: { faixa: 'bg-slate-500', suave: 'bg-slate-500/12 text-slate-700 dark:text-slate-300', anel: 'ring-slate-500' },
};

const ICONES = {
  gatilho_mensagem: ['M21 12a8.5 8.5 0 0 1-12.6 7.45L3 21l1.55-5.4A8.5 8.5 0 1 1 21 12z', 'M8.5 10.5h7M8.5 13.5h4.5'],
  gatilho_reuniao_agendada: ['M8 2.8v3.4M16 2.8v3.4', 'M5 4.6h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2z', 'M3 9.6h18', 'M12 13v5M9.5 15.5h5'],
  gatilho_reuniao_status: ['M8 2.8v3.4M16 2.8v3.4', 'M5 4.6h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2z', 'M3 9.6h18', 'M9 15l2 2 4-4'],
  enviar_mensagem: ['M21 3L10 14', 'M21 3l-7 18-4-7-7-4 18-7z'],
  condicao: ['M6 3v6a6 6 0 0 0 6 6h6', 'M6 21v-4', 'M15 12l3 3-3 3'],
  espera: ['M7 3h10M7 21h10', 'M8 3c0 4 8 5 8 9s-8 5-8 9', 'M16 3c0 4-8 5-8 9'],
  variavel: ['M8 4c-2 0-3 2-3 4v1c0 1.5-1 3-2 3 1 0 2 1.5 2 3v1c0 2 1 4 3 4', 'M16 4c2 0 3 2 3 4v1c0 1.5 1 3 2 3-1 0-2 1.5-2 3v1c0 2-1 4-3 4', 'M10 9l4 6M14 9l-4 6'],
  fim: ['M6 6h12v12H6z'],
  reuniao_status: ['M8 2.8v3.4M16 2.8v3.4', 'M5 4.6h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2z', 'M9 15l2 2 4-4'],
  reuniao_anotar: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  reuniao_criar: ['M8 2.8v3.4M16 2.8v3.4', 'M5 4.6h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2z', 'M12 12v6M9 15h6'],
  comercial_etapa: ['M3 5h5v14H3zM10 5h5v9h-5zM17 5h4v6h-4z'],
  conversa_departamento: ['M4 8h13l-3-3M20 16H7l3 3'],
  conversa_resolver: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M8 12l3 3 5-6'],
  fluxo: ['M5 3h4v4H5zM15 10h4v4h-4zM5 17h4v4H5z', 'M9 5h3a2 2 0 0 1 2 2v3M9 19h3a2 2 0 0 0 2-2v-3'],
};

export function IconeBloco({ tipo, className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(ICONES[tipo] || ICONES.fluxo).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const campoClasse =
  'w-full h-9 px-3 rounded-xl bg-white dark:bg-rm-campo-escuro border border-black/[0.1] dark:border-white/[0.12] text-[13px] text-[#1d1d1f] dark:text-zinc-100 outline-none focus:border-rm-acento-medio focus:ring-2 focus:ring-rm-acento-medio/20';
export const rotuloClasse = 'block text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-1.5';
