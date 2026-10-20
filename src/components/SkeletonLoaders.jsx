'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * Componentes de Carregamento Progressivo (Skeleton Loaders)
 * Estética Apple/Vercel com pulso suave e sem layout shift (CLS = 0).
 */

export function SkeletonPulse({ className = '', style }) {
  return (
    <div
      style={style}
      className={`animate-pulse bg-zinc-200/70 dark:bg-zinc-800/70 rounded-xl ${className}`}
    />
  );
}

/**
 * Skeleton para Cards de Empresas (Modo Grid)
 */
export function CompanyCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-md space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="space-y-1.5">
            <SkeletonPulse className="w-32 h-4" />
            <SkeletonPulse className="w-20 h-3" />
          </div>
        </div>
        <SkeletonPulse className="w-16 h-6 rounded-full" />
      </div>

      <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
        <SkeletonPulse className="w-full h-3" />
        <SkeletonPulse className="w-3/4 h-3" />
      </div>

      <div className="flex items-center justify-between pt-2">
        <SkeletonPulse className="w-24 h-7 rounded-lg" />
        <SkeletonPulse className="w-20 h-7 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Skeleton para Linhas de Tabela (Modo Lista)
 */
export function CompanyTableRowSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800/60">
      <div className="flex items-center gap-3 flex-1">
        <SkeletonPulse className="w-9 h-9 rounded-xl flex-shrink-0" />
        <div className="space-y-1.5 flex-1 max-w-xs">
          <SkeletonPulse className="w-3/4 h-4" />
          <SkeletonPulse className="w-1/2 h-3" />
        </div>
      </div>
      <div className="hidden md:flex items-center gap-6 flex-1 justify-around">
        <SkeletonPulse className="w-24 h-4" />
        <SkeletonPulse className="w-20 h-5 rounded-full" />
        <SkeletonPulse className="w-28 h-4" />
      </div>
      <SkeletonPulse className="w-20 h-8 rounded-xl" />
    </div>
  );
}

/**
 * Skeleton para Métricas do Dashboard
 */
export function DashboardMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-5 rounded-2xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-md space-y-3"
        >
          <div className="flex items-center justify-between">
            <SkeletonPulse className="w-24 h-3.5" />
            <SkeletonPulse className="w-8 h-8 rounded-lg" />
          </div>
          <SkeletonPulse className="w-20 h-8" />
          <SkeletonPulse className="w-32 h-3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para Fila de Chamados, no formato do modo de visualização (lista, cards ou kanban)
 */
export function SupportQueueSkeleton({ modo = 'list', linhas = 5 }) {
  const rotulo = <span className="sr-only">Carregando demandas…</span>;

  if (modo === 'cards') {
    return (
      <div role="status" aria-busy="true" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {rotulo}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4">
            <div className="flex justify-between">
              <SkeletonPulse className="w-20 h-6 rounded-full" />
              <SkeletonPulse className="w-28 h-6 rounded-full" />
            </div>
            <div className="space-y-2">
              <SkeletonPulse className="w-2/3 h-5" />
              <SkeletonPulse className="w-1/3 h-4 rounded-full" />
            </div>
            <SkeletonPulse className="w-full h-12" />
            <div className="flex gap-2 pt-2">
              <SkeletonPulse className="flex-1 h-9 rounded-full" />
              <SkeletonPulse className="w-20 h-9 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (modo === 'kanban') {
    return (
      <div role="status" aria-busy="true" className="flex gap-4 overflow-hidden">
        {rotulo}
        {Array.from({ length: 4 }).map((_, c) => (
          <div key={c} className="w-[300px] flex-shrink-0 rounded-2xl p-3 border border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-[#16161a]/70 space-y-3">
            <div className="flex items-center gap-2">
              <SkeletonPulse className="w-7 h-7 rounded-full" />
              <SkeletonPulse className="w-28 h-4" />
            </div>
            {Array.from({ length: 3 - (c % 2) }).map((__, i) => (
              <div key={i} className="rounded-xl p-3 border border-black/[0.05] dark:border-white/[0.06] bg-white dark:bg-[#1a1a20] space-y-2">
                <SkeletonPulse className="w-3/4 h-4" />
                <SkeletonPulse className="w-1/2 h-3" />
                <SkeletonPulse className="w-full h-8 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="status" aria-busy="true" className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden">
      {rotulo}
      <div className="h-10 border-b border-black/[0.05] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.02]" />
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 border-b last:border-b-0 border-black/[0.04] dark:border-white/[0.05]">
          <SkeletonPulse className="w-16 h-6 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <SkeletonPulse className="w-48 max-w-full h-4" />
            <SkeletonPulse className="w-64 max-w-full h-3" />
          </div>
          <SkeletonPulse className="hidden md:block w-20 h-5 rounded-full" />
          <SkeletonPulse className="hidden lg:block w-28 h-6 rounded-full" />
          <SkeletonPulse className="hidden sm:block w-24 h-4" />
          <SkeletonPulse className="w-24 h-8 rounded-full flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton genérico de lista (linhas com avatar e texto), para qualquer painel que ainda está carregando
 */
export function ListSkeleton({ linhas = 4, className = '' }) {
  return (
    <div role="status" aria-busy="true" className={`space-y-3 ${className}`}>
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonPulse className="w-9 h-9 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonPulse className="h-3.5" style={{ width: `${70 - i * 8}%` }} />
            <SkeletonPulse className="w-1/3 h-3" />
          </div>
          <SkeletonPulse className="w-14 h-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}
