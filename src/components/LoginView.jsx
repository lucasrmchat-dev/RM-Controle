'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeOffIcon, AppleLockIcon, AppleSparklesIcon } from './Icons';

export default function LoginView({
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  showLoginPassword,
  setShowLoginPassword,
  loginError,
  loginSubmitting,
  handleLogin,
  handleBypassDevLogin,
  theme,
  handleToggleTheme,
}) {
  const [focusedField, setFocusedField] = useState(null);

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#f5f5f7] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] transition-colors duration-300">
      
      {/* Background Ambient Mesh Glows (Estilo macOS / Apple Studio Display) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.35, 0.5, 0.35],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-[20%] -left-[10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-gradient-to-br from-[#84cc16]/15 to-[#3b82f6]/10 dark:from-[#84cc16]/10 dark:to-[#3b82f6]/10 blur-[130px]"
        />
        <motion.div
          animate={{
            scale: [1.1, 1, 1.1],
            opacity: [0.3, 0.45, 0.3],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-gradient-to-tl from-[#4d7c0f]/15 to-[#a855f7]/10 dark:from-[#4d7c0f]/10 dark:to-[#a855f7]/10 blur-[140px]"
        />
      </div>

      {/* Alternador de Tema no Canto Superior Direito (Glass Pill) */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-5 right-5 sm:top-7 sm:right-7 z-20"
      >
        <button
          onClick={() => handleToggleTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-2.5 rounded-full backdrop-blur-xl bg-white/70 dark:bg-zinc-900/70 border border-black/[0.06] dark:border-white/[0.08] shadow-sm hover:scale-105 active:scale-95 transition-all text-slate-700 dark:text-zinc-200"
          title="Alternar Tema Claro / Escuro"
        >
          {theme === 'light' ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
            </svg>
          )}
        </button>
      </motion.div>

      {/* Card Central de Login Estilo Apple ID */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] relative z-10"
      >
        <div className="rounded-[32px] p-8 sm:p-10 backdrop-blur-3xl bg-white/80 dark:bg-[#16161a]/85 border border-black/[0.07] dark:border-white/[0.09] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.08)] dark:shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)]">
          
          {/* Logo & Identidade Apple Minimalista */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#4d7c0f] to-[#3f660c] dark:from-[#84cc16] dark:to-[#65a30d] text-white dark:text-zinc-950 flex items-center justify-center font-bold text-lg shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20">
                RM
              </div>
              <div className="absolute -inset-1 rounded-3xl bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 blur-sm -z-10" />
            </div>

            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
              RM Controle
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-normal">
              Infraestrutura, canais e gestão técnica
            </p>
          </div>

          {/* Notificação de Erro com Shake Animation */}
          <AnimatePresence>
            {loginError && (
              <motion.div
                initial={{ opacity: 0, y: -6, x: -6 }}
                animate={{ opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="mb-6 p-4 rounded-2xl bg-red-50/90 dark:bg-red-950/30 border border-red-200/80 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs space-y-2"
              >
                <div className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span className="leading-relaxed">{loginError}</span>
                </div>

                {loginError.includes('Database error querying schema') && (
                  <button
                    type="button"
                    onClick={handleBypassDevLogin}
                    className="w-full mt-2 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold transition-all shadow-sm"
                  >
                    Entrar no Painel (Modo Homologação) →
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulário Apple-Style */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Campo E-mail */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                E-mail Corporativo
              </label>
              <div
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border transition-all ${
                  focusedField === 'email'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-white dark:bg-zinc-900 ring-2 ring-[#4d7c0f]/15 dark:ring-[#84cc16]/20 shadow-sm'
                    : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03]'
                }`}
              >
                <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="admin@rmcontrole.com"
                  required
                  className="w-full bg-transparent text-xs text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none font-medium"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                Senha de Acesso
              </label>
              <div
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border transition-all ${
                  focusedField === 'password'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-white dark:bg-zinc-900 ring-2 ring-[#4d7c0f]/15 dark:ring-[#84cc16]/20 shadow-sm'
                    : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03]'
                }`}
              >
                <AppleLockIcon className="w-4 h-4 text-slate-400 dark:text-zinc-500 flex-shrink-0" />
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-transparent text-xs text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 p-0.5 transition-colors"
                >
                  {showLoginPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão de Autenticação com Efeito Apple */}
            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loginSubmitting}
                className="w-full py-3 px-5 rounded-2xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20 hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loginSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {/* Acesso Rápido de Homologação / Teste */}
          <div className="mt-8 pt-6 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
            <span>Ambiente Seguro</span>
            <button
              type="button"
              onClick={handleBypassDevLogin}
              className="text-[#4d7c0f] dark:text-[#84cc16] hover:underline font-medium flex items-center gap-1"
            >
              <AppleSparklesIcon className="w-3 h-3" />
              <span>Acesso Rápido</span>
            </button>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
