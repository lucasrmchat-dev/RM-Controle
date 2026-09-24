'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeOffIcon, AppleLockIcon } from './Icons';

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
  theme,
  handleToggleTheme,
}) {
  const [focusedField, setFocusedField] = useState(null);

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#f4f4f6] dark:bg-[#000000] text-[#0a0a0c] dark:text-[#ffffff] transition-colors duration-300 selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      
      {/* Background Ambient Mesh Orbs com Movimento Orgânico */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 20, 0],
            y: [0, -15, 0],
            opacity: [0.3, 0.45, 0.3],
          }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-gradient-to-br from-[#4d7c0f]/20 via-[#65a30d]/15 to-transparent dark:from-[#84cc16]/12 dark:via-[#4d7c0f]/10 dark:to-transparent blur-[140px]"
        />
        <motion.div
          animate={{
            scale: [1.15, 1, 1.15],
            x: [0, -25, 0],
            y: [0, 20, 0],
            opacity: [0.25, 0.4, 0.25],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-[15%] -right-[10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-gradient-to-tl from-slate-400/20 via-zinc-400/15 to-transparent dark:from-zinc-800/30 dark:via-zinc-900/20 dark:to-transparent blur-[150px]"
        />
      </div>

      {/* Botão de Alternância de Tema no Canto Superior */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed top-5 right-5 sm:top-7 sm:right-7 z-20"
      >
        <button
          onClick={() => handleToggleTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-2.5 rounded-full backdrop-blur-2xl bg-white/90 dark:bg-zinc-900/90 border border-black/10 dark:border-white/15 shadow-sm hover:scale-105 active:scale-95 transition-all text-slate-800 dark:text-zinc-100"
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

      {/* Cartão Central de Alta Fidelidade e Alto Contraste */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[430px] relative z-10"
      >
        <div className="rounded-[36px] p-8 sm:p-10 backdrop-blur-3xl bg-white/95 dark:bg-[#0e0e12]/95 border border-black/12 dark:border-white/15 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.12)] dark:shadow-[0_35px_110px_-25px_rgba(0,0,0,0.95)]">
          
          {/* Símbolo RM Monograma Clássico de Luxo */}
          <div className="flex flex-col items-center text-center mb-8">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative mb-5"
            >
              {/* Halo de luz suave animado */}
              <motion.div
                animate={{
                  opacity: [0.4, 0.7, 0.4],
                  scale: [0.95, 1.05, 0.95],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute -inset-2 rounded-[26px] bg-gradient-to-tr from-[#4d7c0f]/20 via-[#84cc16]/25 to-transparent blur-md -z-10"
              />

              {/* Brasão Monograma RM */}
              <div className="w-16 h-16 rounded-[22px] bg-gradient-to-b from-[#0f172a] via-[#090d16] to-[#020617] dark:from-[#18181b] dark:via-[#121215] dark:to-[#09090b] border-2 border-slate-700/80 dark:border-white/20 p-0.5 shadow-xl flex items-center justify-center relative overflow-hidden group">
                
                {/* Linha fina decorativa interna */}
                <div className="absolute inset-1 rounded-[17px] border border-white/10 pointer-events-none" />

                {/* SVG Monograma RM com Linhas Clássicas */}
                <svg viewBox="0 0 64 64" className="w-10 h-10 text-white" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Gradiente do Monograma */}
                  <defs>
                    <linearGradient id="rmGoldGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="50%" stopColor="#e2e8f0" />
                      <stop offset="100%" stopColor="#94a3b8" />
                    </linearGradient>
                    <linearGradient id="accentGlow" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#84cc16" />
                      <stop offset="100%" stopColor="#4d7c0f" />
                    </linearGradient>
                  </defs>

                  {/* Letra R Elegante */}
                  <path
                    d="M17 46V18H29.5C34.5 18 38 21 38 25.5C38 29.5 35 32 31 32.8L38.5 46H32.5L25.8 33.5H22.5V46H17ZM22.5 29H29C31.5 29 33 27.8 33 25.5C33 23.2 31.5 22 29 22H22.5V29Z"
                    fill="url(#rmGoldGrad)"
                  />
                  
                  {/* Letra M Entrelaçada com Traço de Alta Precisão */}
                  <path
                    d="M34.5 46V25H38.5L44 37.5L49.5 25H53.5V46H48.5V32.5L44.5 41H43.5L39.5 32.5V46H34.5Z"
                    fill="url(#accentGlow)"
                    fillOpacity="0.9"
                  />

                  {/* Ponto de Precisão / Selo Minimalista */}
                  <circle cx="51.5" cy="45" r="1.5" fill="#84cc16" />
                </svg>
              </div>
            </motion.div>

            <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0c] dark:text-[#ffffff]">
              RM Controle
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium tracking-wide uppercase">
              Plataforma de Gestão & Infraestrutura
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
                className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs space-y-1.5"
              >
                <div className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span className="leading-relaxed font-medium">{loginError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulário com Alto Contraste */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Campo E-mail */}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1 cursor-pointer">
                E-mail Corporativo
              </label>
              <label
                htmlFor="login-email"
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-text ${
                  focusedField === 'email'
                    ? 'border-black dark:border-white bg-white dark:bg-zinc-900 ring-2 ring-black/10 dark:ring-white/20 shadow-sm'
                    : 'border-slate-300 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.04]'
                }`}
              >
                <svg className="w-4 h-4 text-slate-500 dark:text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <input
                  id="login-email"
                  name="email"
                  type="text"
                  autoComplete="username email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="admin@rmcontrole.com"
                  required
                  className="w-full bg-transparent text-sm text-black dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none font-medium cursor-text"
                />
              </label>
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1 cursor-pointer">
                Senha de Acesso
              </label>
              <label
                htmlFor="login-password"
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-text ${
                  focusedField === 'password'
                    ? 'border-black dark:border-white bg-white dark:bg-zinc-900 ring-2 ring-black/10 dark:ring-white/20 shadow-sm'
                    : 'border-slate-300 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.04]'
                }`}
              >
                <AppleLockIcon className="w-4 h-4 text-slate-500 dark:text-zinc-400 flex-shrink-0" />
                <input
                  id="login-password"
                  name="password"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-transparent text-sm text-black dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none font-mono cursor-text"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowLoginPassword(!showLoginPassword);
                  }}
                  className="text-slate-400 hover:text-black dark:hover:text-white p-1 transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showLoginPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </label>
            </div>

            {/* Botão de Autenticação Alto Contraste */}
            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loginSubmitting}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#09090b] hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-black text-xs font-bold tracking-wide shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loginSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin" />
                    <span>Autenticando sessão...</span>
                  </>
                ) : (
                  <>
                    <span>Acessar Plataforma</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {/* Rodapé Seguro e Discreto (Sem botão de acesso rápido) */}
          <div className="mt-8 pt-5 border-t border-black/8 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Ambiente Autenticado
            </span>
            <span className="font-mono text-[10px] text-slate-400">RLS & LGPD Ativos</span>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
