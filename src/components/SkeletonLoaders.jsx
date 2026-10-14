'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * Componentes de Carregamento Progressivo (Skeleton Loaders)
 * Estética Apple/Vercel com pulso suave e sem layout shift (CLS = 0).
 */

export function SkeletonPulse({ className = '' }) {
  return (
    <div
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
 * Skeleton para Fila de Chamados
 */
export function SupportQueueSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-4 rounded-2xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-md flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 flex-1">
            <SkeletonPulse className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <SkeletonPulse className="w-48 h-4" />
              <SkeletonPulse className="w-32 h-3" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SkeletonPulse className="w-24 h-6 rounded-full" />
            <SkeletonPulse className="w-28 h-8 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
