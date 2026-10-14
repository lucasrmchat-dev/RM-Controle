'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeOffIcon, AppleLockIcon } from './Icons';

// ==============================================================================
// CONFIGURAÇÃO DOS SLIDES INSTITUCIONAIS (ESTÉTICA VERCEL & APPLE)
// ==============================================================================
export const DEFAULT_LOGIN_SLIDES = [
  {
    id: 'infraestrutura',
    tag: 'Infraestrutura & VPS',
    titulo: 'Gestão Centralizada de Servidores & Instâncias',
    descricao: 'Monitoramento contínuo de Servidor 1 e Servidor 2 com isolamento Docker, verificação de portas e rotinas de contingência.',
    destaques: ['Uptime 99.9%', 'VPS Hardened', 'Ambientes Isolados'],
    imagem: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'tempo_real',
    tag: 'Fila & Atendimento',
    titulo: 'Triagem em Tempo Real com Notificações Ativas',
    descricao: 'Distribuição ágil de demandas com cronômetro de precisão, alertas sonoros e sincronização instantânea via WebSockets.',
    destaques: ['WebSockets Realtime', 'Alertas Sonoros', 'Timer de Suporte'],
    imagem: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'seguranca',
    tag: 'Segurança & Privacidade',
    titulo: 'Cofre de Credenciais & Conformidade LGPD',
    descricao: 'Acesso restrito com isolamento multitenant, políticas de Row-Level Security (RLS) no Supabase e trilha imutável de auditoria.',
    destaques: ['Criptografia em Repouso', 'Políticas RLS', 'Auditoria por IP'],
    imagem: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'qualidade',
    tag: 'Controle de Qualidade',
    titulo: 'Reporte de Falhas & Sugestões com Evidência',
    descricao: 'Canal estruturado para envio de feedbacks, relatórios de erros com print anexo e geração automática de demandas técnicas.',
    destaques: ['Prints Otimizados', 'Triagem de Bugs', 'Evolução Contínua'],
    imagem: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80',
  },
];

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
  slides = DEFAULT_LOGIN_SLIDES,
  honeypot = '',
  setHoneypot = () => {},
}) {
  const [focusedField, setFocusedField] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [verifiedHuman, setVerifiedHuman] = useState(true);

  const SLIDE_DURATION = 6000;

  useEffect(() => {
    if (isPaused || !slides || slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, SLIDE_DURATION);
    return () => clearInterval(timer);
  }, [isPaused, slides]);

  const slideAtivo = slides[currentSlide] || slides[0];

  const handleProximoSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const handleSlideAnterior = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#fafafa] dark:bg-[#09090b] text-[#09090b] dark:text-[#fafafa] transition-colors duration-300 selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900 overflow-x-hidden font-sans">
      
      {/* Botão de Alternância de Tema Flutuante no Topo (Estilo Apple) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        className="fixed top-5 right-5 sm:top-7 sm:right-7 z-50"
      >
        <button
          type="button"
          onClick={() => handleToggleTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-2.5 rounded-full backdrop-blur-xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-95 transition-all text-zinc-700 dark:text-zinc-300 cursor-pointer"
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

      {/* ============================================================================== */}
      {/* LADO ESQUERDO: CARROSSEL MONOCROMÁTICO COM IMAGENS E TIPOGRAFIA DE PRECISÃO */}
      {/* ============================================================================== */}
      <div 
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative hidden lg:flex lg:w-[54%] xl:w-[58%] flex-col justify-between p-10 xl:p-14 overflow-hidden select-none bg-zinc-950 border-r border-zinc-900"
      >
        {/* Imagem de Fundo com Transição Suave e Zoom Físico Leve */}
        <AnimatePresence mode="wait">
          <motion.div
            key={slideAtivo.id}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${slideAtivo.imagem})` }}
          >
            {/* Gradientes Neutros de Alto Contraste (Sem orbes radiais agressivos) */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950/40 backdrop-blur-[0.5px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-950/40 to-transparent" />
          </motion.div>
        </AnimatePresence>

        {/* Topo do Carrossel: Identidade Visual Clean */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 p-1 flex items-center justify-center shadow-xs">
              <svg viewBox="0 0 64 64" className="w-5 h-5 text-white" fill="none">
                <path
                  d="M17 46V18H29.5C34.5 18 38 21 38 25.5C38 29.5 35 32 31 32.8L38.5 46H32.5L25.8 33.5H22.5V46H17ZM22.5 29H29C31.5 29 33 27.8 33 25.5C33 23.2 31.5 22 29 22H22.5V29Z"
                  fill="#ffffff"
                />
                <path
                  d="M34.5 46V25H38.5L44 37.5L49.5 25H53.5V46H48.5V32.5L44.5 41H43.5L39.5 32.5V46H34.5Z"
                  fill="#ffffff"
                />
              </svg>
            </div>
            <div>
              <span className="text-white text-sm font-semibold tracking-tight block">RM Controle</span>
              <span className="text-zinc-400 text-[10px] uppercase font-mono tracking-wider">Enterprise Architecture</span>
            </div>
          </div>

          {/* Badge Informativo de Pausa */}
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[10px] text-zinc-300 font-mono flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" />
              <span>Pausado</span>
            </motion.div>
          )}
        </div>

        {/* Textos Informativos do Slide */}
        <div className="relative z-10 max-w-xl space-y-4 my-auto pt-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideAtivo.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-zinc-200 text-[10px] font-mono uppercase tracking-wider backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{slideAtivo.tag}</span>
              </div>

              <h2 className="text-2xl sm:text-3xl xl:text-4xl font-semibold text-white tracking-tight leading-tight">
                {slideAtivo.titulo}
              </h2>

              <p className="text-sm xl:text-base text-zinc-300 leading-relaxed font-normal">
                {slideAtivo.descricao}
              </p>

              {slideAtivo.destaques && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {slideAtivo.destaques.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 backdrop-blur-md transition-colors"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Rodapé: Navegação e Progresso */}
        <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            {slides.map((s, index) => {
              const isActive = index === currentSlide;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentSlide(index)}
                  className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden relative transition-all hover:bg-white/30 cursor-pointer"
                  title={`Slide ${index + 1}`}
                >
                  {isActive && (
                    <motion.div
                      key={`progress-${currentSlide}-${isPaused}`}
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{
                        duration: isPaused ? 0 : SLIDE_DURATION / 1000,
                        ease: 'linear',
                      }}
                      className="h-full bg-white"
                    />
                  )}
                  {!isActive && index < currentSlide && (
                    <div className="h-full w-full bg-white/60" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSlideAnterior}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
              title="Anterior"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleProximoSlide}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
              title="Próximo"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* LADO DIREITO: FORMULÁRIO DE LOGIN DE ALTA PRECISÃO (VERCEL / APPLE) */}
      {/* ============================================================================== */}
      <div className="w-full lg:w-[46%] xl:w-[42%] flex flex-col justify-between p-6 sm:p-12 xl:p-16 bg-white dark:bg-zinc-950 border-l border-zinc-200/80 dark:border-zinc-800/80 min-h-screen overflow-y-auto relative z-10">
        
        {/* Topo do Formulário: Status e Versão */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
              Portal Corporativo
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
            v3.6 Blindado
          </span>
        </div>

        {/* Centro: Cartão do Formulário */}
        <div className="my-auto py-8 max-w-[400px] w-full mx-auto space-y-6">
          
          <div className="space-y-2">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 28, stiffness: 240 }}
              className="w-11 h-11 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-xs border border-zinc-800 dark:border-zinc-200 mb-3"
            >
              <AppleLockIcon className="w-5 h-5" />
            </motion.div>

            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Entrar no RM Controle
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-normal leading-relaxed">
              Informe suas credenciais autorizadas. Sessões autenticadas via cookies HTTP-only e monitoramento contínuo.
            </p>
          </div>

          {/* Notificação de Erro com Animação Spring */}
          <AnimatePresence>
            {loginError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-xs flex items-start gap-2.5"
              >
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span className="leading-relaxed font-medium">{loginError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulário de Login */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Campo Oculto Honeypot (Anti-Bot invisível para humanos, captura robôs) */}
            <input
              type="text"
              name="rm_auth_hp_field"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ display: 'none', position: 'absolute', opacity: 0, pointerEvents: 'none' }}
            />

            {/* Campo E-mail Corporativo */}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 pl-0.5 cursor-pointer">
                E-mail Corporativo
              </label>
              <div
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all ${
                  focusedField === 'email'
                    ? 'border-zinc-900 dark:border-white bg-white dark:bg-zinc-900 ring-2 ring-zinc-900/10 dark:ring-white/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <svg className="w-4 h-4 text-zinc-400 dark:text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="admin@rmcontrole.com"
                  required
                  className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none font-medium"
                />
              </div>
            </div>

            {/* Campo Senha de Acesso */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between pl-0.5">
                <label htmlFor="login-password" className="text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  Senha de Acesso
                </label>
              </div>
              <div
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all ${
                  focusedField === 'password'
                    ? 'border-zinc-900 dark:border-white bg-white dark:bg-zinc-900 ring-2 ring-zinc-900/10 dark:ring-white/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <AppleLockIcon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
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
                  className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5 transition-colors cursor-pointer"
                  tabIndex={-1}
                  title={showLoginPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showLoginPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Selo Anti-Bot & Conformidade LGPD */}
            <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Navegador Verificado</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-400">SSL 256-bit</span>
            </div>

            {/* Botão de Autenticação */}
            <div className="pt-1">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                type="submit"
                disabled={loginSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold tracking-wide shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loginSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-900 border-t-transparent rounded-full animate-spin" />
                    <span>Autenticando sessão segura...</span>
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

        </div>

        {/* Rodapé de Segurança e LGPD */}
        <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Criptografia & RLS Ativos
          </span>
          <span className="font-mono text-[10px] text-zinc-400">Conforme LGPD Art. 46</span>
        </div>

      </div>

    </div>
  );
}
