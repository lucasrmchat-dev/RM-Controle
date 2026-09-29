'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeOffIcon, AppleLockIcon } from './Icons';

// ==============================================================================
// CONFIGURAÇÃO DOS SLIDES DO CARROSSEL (FÁCIL ADIÇÃO DE FOTOS E TEXTOS)
// ==============================================================================
export const DEFAULT_LOGIN_SLIDES = [
  {
    id: 'infraestrutura',
    tag: 'Infraestrutura & VPS',
    titulo: 'Gestão Centralizada de Servidores & Instâncias',
    descricao: 'Monitore Servidor 1 e Servidor 2 com integridade contínua, isolamento Docker e rotinas de backup automatizadas.',
    destaques: ['Uptime 99.9%', 'VPS Hardened', 'Ambientes Isolados'],
    imagem: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'tempo_real',
    tag: 'Fila de Demandas & Atendimento',
    titulo: 'Triagem em Tempo Real com Notificações Ativas',
    descricao: 'Distribuição ágil de chamados, cronômetro de atendimento, alertas sonoros e sincronização instantânea para toda a equipe.',
    destaques: ['WebSockets Realtime', 'Alertas Sonoros', 'Timer de Suporte'],
    imagem: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'seguranca',
    tag: 'Segurança & Privacidade',
    titulo: 'Cofre de Credenciais & Conformidade LGPD',
    descricao: 'Acesso seguro a senhas de suporte, isolamento multitenant com Supabase Row-Level Security (RLS) e trilha completa de auditoria.',
    destaques: ['Criptografia de Ponta', 'Políticas RLS', 'Auditoria por IP'],
    imagem: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1920&q=80',
  },
  {
    id: 'qualidade',
    tag: 'Controle de Qualidade',
    titulo: 'Reporte de Falhas & Sugestões com Print',
    descricao: 'Canal direto para envio de feedbacks, relatórios de erros com imagem em anexo e geração automática de demandas técnicas.',
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
}) {
  const [focusedField, setFocusedField] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Tempo de exibição confortável por slide (6 segundos)
  const SLIDE_DURATION = 6000;

  // Auto-play do Carrossel com pausa inteligente no Hover
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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f4f4f6] dark:bg-[#000000] text-[#0a0a0c] dark:text-[#ffffff] transition-colors duration-300 selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black overflow-x-hidden">
      
      {/* Botão de Alternância de Tema Flutuante no Topo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="fixed top-5 right-5 sm:top-7 sm:right-7 z-50"
      >
        <button
          type="button"
          onClick={() => handleToggleTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-3 rounded-full backdrop-blur-2xl bg-white/80 dark:bg-zinc-900/80 border border-black/10 dark:border-white/15 shadow-lg hover:scale-105 active:scale-95 transition-all text-slate-800 dark:text-zinc-100 cursor-pointer"
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
      {/* LADO ESQUERDO: CARROSSEL DE FOTOS COM SLIDES, TEXTOS E ANIMAÇÃO KEN BURNS */}
      {/* ============================================================================== */}
      <div 
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative hidden lg:flex lg:w-[54%] xl:w-[58%] flex-col justify-between p-10 xl:p-14 overflow-hidden select-none bg-[#09090b]"
      >
        {/* Camada das Imagens de Fundo com Transição Suave e Leve Zoom Ken Burns */}
        <AnimatePresence mode="wait">
          <motion.div
            key={slideAtivo.id}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${slideAtivo.imagem})` }}
          >
            {/* Gradientes de Fusão e Escurecimento para Legibilidade Perfeita */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30 backdrop-blur-[1px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80" />
            <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/40 to-black/90" />
          </motion.div>
        </AnimatePresence>

        {/* Topo do Carrossel: Marca e Status */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-1 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 64 64" className="w-6 h-6 text-white" fill="none">
                <path
                  d="M17 46V18H29.5C34.5 18 38 21 38 25.5C38 29.5 35 32 31 32.8L38.5 46H32.5L25.8 33.5H22.5V46H17ZM22.5 29H29C31.5 29 33 27.8 33 25.5C33 23.2 31.5 22 29 22H22.5V29Z"
                  fill="#ffffff"
                />
                <path
                  d="M34.5 46V25H38.5L44 37.5L49.5 25H53.5V46H48.5V32.5L44.5 41H43.5L39.5 32.5V46H34.5Z"
                  fill="#84cc16"
                />
              </svg>
            </div>
            <div>
              <span className="text-white text-sm font-bold tracking-tight block">RM Controle</span>
              <span className="text-zinc-400 text-[10px] uppercase font-mono tracking-wider">Enterprise Suite</span>
            </div>
          </div>

          {/* Badge Indicador de Pausa no Hover */}
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[10px] text-zinc-300 font-mono flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Pausado para leitura</span>
            </motion.div>
          )}
        </div>

        {/* Centro/Rodapé do Carrossel: Textos Animados do Slide */}
        <div className="relative z-10 max-w-xl space-y-5 my-auto pt-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideAtivo.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              {/* Tag / Categoria do Slide */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#84cc16]/20 border border-[#84cc16]/40 text-[#84cc16] text-[11px] font-bold uppercase tracking-wider backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[#84cc16]" />
                <span>{slideAtivo.tag}</span>
              </div>

              {/* Título de Destaque */}
              <h2 className="text-2xl sm:text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight drop-shadow-md">
                {slideAtivo.titulo}
              </h2>

              {/* Descrição Confortável */}
              <p className="text-sm xl:text-base text-zinc-300 leading-relaxed drop-shadow-sm font-normal">
                {slideAtivo.descricao}
              </p>

              {/* Pílulas de Destaques Técnicos */}
              {slideAtivo.destaques && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {slideAtivo.destaques.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-zinc-200 backdrop-blur-md transition-colors"
                    >
                      ✓ {item}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Rodapé do Carrossel: Barras de Progresso e Setas de Navegação Manual */}
        <div className="relative z-10 pt-8 border-t border-white/10 flex items-center justify-between gap-4">
          
          {/* Indicadores de Barras de Progresso (Estilo Apple / Stories) */}
          <div className="flex items-center gap-2.5 flex-1 max-w-sm">
            {slides.map((s, index) => {
              const isActive = index === currentSlide;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentSlide(index)}
                  className="h-1.5 flex-1 rounded-full bg-white/20 overflow-hidden relative transition-all hover:bg-white/30 cursor-pointer"
                  title={`Ir para o slide ${index + 1}: ${s.tag}`}
                >
                  {isActive && (
                    <motion.div
                      key={`progress-${currentSlide}-${isPaused}`}
                      initial={{ width: '0%' }}
                      animate={{ width: isPaused ? '100%' : '100%' }}
                      transition={{
                        duration: isPaused ? 0 : SLIDE_DURATION / 1000,
                        ease: 'linear',
                      }}
                      className="h-full bg-[#84cc16]"
                    />
                  )}
                  {!isActive && index < currentSlide && (
                    <div className="h-full w-full bg-white/60" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Controles Manuais: Anterior e Próximo */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSlideAnterior}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
              title="Slide anterior"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleProximoSlide}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
              title="Próximo slide"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

        </div>
      </div>

      {/* ============================================================================== */}
      {/* LADO DIREITO: FORMULÁRIO DE LOGIN DE ALTA FIDELIDADE */}
      {/* ============================================================================== */}
      <div className="w-full lg:w-[46%] xl:w-[42%] flex flex-col justify-between p-6 sm:p-12 xl:p-16 bg-[#ffffff] dark:bg-[#0c0c10] border-l border-black/[0.06] dark:border-white/[0.08] min-h-screen overflow-y-auto relative z-10">
        
        {/* Topo do Login: Identificação de Acesso */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-mono">
              Portal Corporativo
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 dark:text-zinc-400 border border-black/[0.06] dark:border-white/[0.08]">
            v3.5 Seguro
          </span>
        </div>

        {/* Centro: Cartão do Formulário */}
        <div className="my-auto py-8 max-w-[420px] w-full mx-auto space-y-6">
          
          {/* Brasão / Monograma RM */}
          <div className="space-y-3">
            <motion.div
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#0f172a] via-[#090d16] to-[#020617] dark:from-[#18181b] dark:via-[#121215] dark:to-[#09090b] border border-black/10 dark:border-white/20 p-0.5 shadow-xl flex items-center justify-center relative overflow-hidden"
            >
              <div className="absolute inset-1 rounded-[13px] border border-white/10 pointer-events-none" />
              <svg viewBox="0 0 64 64" className="w-8 h-8 text-white" fill="none">
                <path
                  d="M17 46V18H29.5C34.5 18 38 21 38 25.5C38 29.5 35 32 31 32.8L38.5 46H32.5L25.8 33.5H22.5V46H17ZM22.5 29H29C31.5 29 33 27.8 33 25.5C33 23.2 31.5 22 29 22H22.5V29Z"
                  fill="#ffffff"
                />
                <path
                  d="M34.5 46V25H38.5L44 37.5L49.5 25H53.5V46H48.5V32.5L44.5 41H43.5L39.5 32.5V46H34.5Z"
                  fill="#84cc16"
                />
                <circle cx="51.5" cy="45" r="1.5" fill="#84cc16" />
              </svg>
            </motion.div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] dark:text-white">
                Entrar no RM Controle
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 font-medium leading-relaxed">
                Informe suas credenciais autorizadas para gerenciar clientes, filas de suporte e servidores.
              </p>
            </div>
          </div>

          {/* Notificação de Erro com Shake Animation */}
          <AnimatePresence>
            {loginError && (
              <motion.div
                initial={{ opacity: 0, y: -6, x: -6 }}
                animate={{ opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs space-y-1"
              >
                <div className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span className="leading-relaxed font-semibold">{loginError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulário de Login */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Campo E-mail Corporativo */}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1 cursor-pointer">
                E-mail Corporativo
              </label>
              <label
                htmlFor="login-email"
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-text ${
                  focusedField === 'email'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-white dark:bg-zinc-900 ring-2 ring-[#4d7c0f]/15 dark:ring-[#84cc16]/20 shadow-xs'
                    : 'border-slate-300/80 dark:border-white/12 bg-black/[0.015] dark:bg-white/[0.03] hover:border-slate-400/80'
                }`}
              >
                <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
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
                  className="w-full bg-transparent text-sm text-[#1d1d1f] dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none font-medium cursor-text"
                />
              </label>
            </div>

            {/* Campo Senha de Acesso */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between pl-1">
                <label htmlFor="login-password" className="text-xs font-semibold text-slate-800 dark:text-zinc-200 cursor-pointer">
                  Senha de Acesso
                </label>
              </div>
              <label
                htmlFor="login-password"
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-text ${
                  focusedField === 'password'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-white dark:bg-zinc-900 ring-2 ring-[#4d7c0f]/15 dark:ring-[#84cc16]/20 shadow-xs'
                    : 'border-slate-300/80 dark:border-white/12 bg-black/[0.015] dark:bg-white/[0.03] hover:border-slate-400/80'
                }`}
              >
                <AppleLockIcon className="w-4 h-4 text-slate-400 dark:text-zinc-500 flex-shrink-0" />
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
                  className="w-full bg-transparent text-sm text-[#1d1d1f] dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none font-mono cursor-text"
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
                  title={showLoginPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showLoginPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </label>
            </div>

            {/* Botão de Autenticação */}
            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loginSubmitting}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#09090b] hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-black text-xs font-bold tracking-wide shadow-md shadow-black/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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

        </div>

        {/* Rodapé Seguro e Discreto */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Ambiente Autenticado
          </span>
          <span className="font-mono text-[10px] text-slate-400">RLS & LGPD Ativos</span>
        </div>

      </div>

    </div>
  );
}
