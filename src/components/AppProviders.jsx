'use client';

import React, { useEffect, useState } from 'react';
import { MotionConfig, AnimatePresence, motion } from 'framer-motion';
import { showToast } from './ToastNotification';

// Provedores globais da interface:
// - MotionConfig respeita "reduzir movimento" do sistema em todas as animações do framer-motion
// - Aviso de conexão: modela o estado "sem conexão" e ressincroniza ao voltar
export default function AppProviders({ children }) {
  const [online, setOnline] = useState(true);
  const [recemReconectado, setRecemReconectado] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    let timer = null;

    const handleOffline = () => {
      setOnline(false);
      setRecemReconectado(false);
    };
    const handleOnline = () => {
      setOnline(true);
      setRecemReconectado(true);
      clearTimeout(timer);
      timer = setTimeout(() => setRecemReconectado(false), 3500);
      // As telas abertas recarregam; o sync da fila reenvia as demandas criadas offline
      window.dispatchEvent(new Event('suporte_updated'));
      window.dispatchEvent(new Event('feedbacks_updated'));
    };

    // Gravações que o Supabase recusou: a mudança foi desfeita na tela e o motivo aparece aqui
    const handleFalhaSync = (e) => showToast(e.detail || 'Uma alteração não foi salva para a equipe.', 'error');

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('rm_sync_erro', handleFalhaSync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('rm_sync_erro', handleFalhaSync);
    };
  }, []);

  const visivel = !online || recemReconectado;

  return (
    <MotionConfig reducedMotion="user">
      {children}
      <div role="status" aria-live="polite" className="fixed top-3 left-1/2 -translate-x-1/2 z-[1000000] pointer-events-none">
        <AnimatePresence>
          {visivel && (
            <motion.div
              key={online ? 'online' : 'offline'}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
              className={`px-4 py-2 rounded-full text-xs font-semibold shadow-lg border backdrop-blur-xl ${
                online
                  ? 'bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-500/30'
                  : 'bg-amber-50/95 dark:bg-amber-950/90 text-amber-900 dark:text-amber-200 border-amber-500/40'
              }`}
            >
              {online
                ? 'Conexão restabelecida — fila sincronizada.'
                : 'Sem conexão. Novas demandas ficam salvas aqui e serão enviadas quando a internet voltar.'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
