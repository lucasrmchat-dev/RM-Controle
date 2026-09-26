'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function showToast(message, type = 'success') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('rm_toast_event', {
      detail: {
        id: 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        message,
        type, // 'success' | 'error' | 'info' | 'warning'
      },
    })
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      if (!e.detail) return;
      const newToast = e.detail;
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('rm_toast_event', handleToast);
    return () => window.removeEventListener('rm_toast_event', handleToast);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const typeConfig = {
    success: {
      bg: 'bg-white/90 dark:bg-[#18181b]/90 border-emerald-500/30 text-emerald-800 dark:text-emerald-300',
      icon: (
        <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
          ✓
        </span>
      ),
    },
    error: {
      bg: 'bg-white/90 dark:bg-[#18181b]/90 border-red-500/30 text-red-800 dark:text-red-300',
      icon: (
        <span className="w-5 h-5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-xs">
          ✕
        </span>
      ),
    },
    warning: {
      bg: 'bg-white/90 dark:bg-[#18181b]/90 border-amber-500/30 text-amber-800 dark:text-amber-300',
      icon: (
        <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
          !
        </span>
      ),
    },
    info: {
      bg: 'bg-white/90 dark:bg-[#18181b]/90 border-blue-500/30 text-blue-800 dark:text-blue-300',
      icon: (
        <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
          ℹ
        </span>
      ),
    },
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const cfg = typeConfig[toast.type] || typeConfig.success;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 24, stiffness: 350 }}
              onClick={() => removeToast(toast.id)}
              className={`pointer-events-auto p-3.5 sm:p-4 rounded-2xl border backdrop-blur-2xl shadow-xl flex items-center gap-3 cursor-pointer select-none transition-all ${cfg.bg}`}
            >
              <div className="flex-shrink-0">{cfg.icon}</div>
              <p className="text-xs font-semibold leading-snug flex-1">
                {toast.message}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-full text-xs"
              >
                ✕
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
