'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function ConfirmModal({
  isOpen,
  title = 'Confirmar Ação',
  message = 'Tem certeza que deseja prosseguir com esta ação?',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger', // 'danger' | 'warning' | 'info' | 'success'
  onConfirm,
  onClose,
  isProcessing = false,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Travar o scroll da página enquanto o modal estiver aberto
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const variantStyles = {
    danger: {
      badgeBg: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25',
      badgeText: 'Ação Crítica',
      confirmButton: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30',
      icon: (
        <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      ),
    },
    warning: {
      badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
      badgeText: 'Atenção',
      confirmButton: 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/30',
      icon: (
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" x2="12" y1="9" y2="13" />
          <line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
      ),
    },
    info: {
      badgeBg: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/25',
      badgeText: 'Informação',
      confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30',
      icon: (
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="16" y2="12" />
          <line x1="12" x2="12.01" y1="8" y2="8" />
        </svg>
      ),
    },
    success: {
      badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
      badgeText: 'Concluir',
      confirmButton: 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 shadow-lg shadow-[#4d7c0f]/30',
      icon: (
        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
  };

  const style = variantStyles[variant] || variantStyles.danger;

  // Portal direto para document.body para garantir que fique 100% fixo no viewport atual
  return createPortal(
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[999999] w-screen h-screen flex items-center justify-center p-4 overflow-hidden select-none"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999999,
        }}
      >
        {/* Backdrop com desfoque total na tela inteira visível */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
          onClick={!isProcessing ? onClose : undefined}
        />

        {/* Janela do Modal Centralizada com Física de Molas Apple */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: 'spring', damping: 28, stiffness: 360 }}
          className="relative w-full max-w-md rounded-[32px] border border-black/[0.08] dark:border-white/[0.14] bg-white dark:bg-[#18181b] backdrop-blur-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7] z-10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Brilho sutil no topo */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-15" />

          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl border ${style.badgeBg} flex-shrink-0 flex items-center justify-center shadow-xs`}>
              {style.icon}
            </div>

            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badgeBg}`}>
                  {style.badgeText}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-[#1d1d1f] dark:text-white leading-snug">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed pt-0.5">
                {message}
              </p>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-4 py-2.5 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50"
            >
              {cancelText}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={isProcessing}
              onClick={onConfirm}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 ${style.confirmButton}`}
            >
              {isProcessing && (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              )}
              <span>{confirmText}</span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
