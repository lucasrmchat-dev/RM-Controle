'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BrandMark, BrandLockup } from './BrandMark';
import CaptchaTurnstile, { captchaAtivo } from './CaptchaTurnstile';

// ==============================================================================
// MENSAGENS DO PAINEL DE APRESENTAÇÃO (o que o cliente ganha, não como funciona)
// ==============================================================================
export const DEFAULT_LOGIN_SLIDES = [
  {
    id: 'fila',
    titulo: ['Toda demanda', 'no lugar certo.'],
    descricao: 'Uma fila única, com responsável, prioridade e prazo à vista. Nada se perde entre conversas e planilhas.',
  },
  {
    id: 'clientes',
    titulo: ['Seus clientes', 'em um só painel.'],
    descricao: 'Empresas, canais de atendimento e histórico reunidos para responder com contexto — e com rapidez.',
  },
  {
    id: 'conhecimento',
    titulo: ['Menos retrabalho', 'a cada dia.'],
    descricao: 'Cada solução registrada vira referência para a equipe. A próxima demanda parecida se resolve em minutos.',
  },
  {
    id: 'equipe',
    titulo: ['Equipe e agenda', 'em sintonia.'],
    descricao: 'Distribua tarefas, acompanhe compromissos e saiba exatamente o que cada pessoa está resolvendo.',
  },
];

// Demandas ilustrativas da prévia animada do painel
const DEMANDAS_EXEMPLO = [
  { empresa: 'Clínica Vida Plena', titulo: 'Reconectar número do WhatsApp', resp: 'AL' },
  { empresa: 'Atlas Logística', titulo: 'Novo atendente na fila Comercial', resp: 'MR' },
  { empresa: 'Ótica Visão Real', titulo: 'Ajustar mensagem de boas-vindas', resp: 'JS' },
  { empresa: 'Mercado Bom Preço', titulo: 'Canal oficial aguardando aprovação', resp: 'AL' },
  { empresa: 'Studio Forma', titulo: 'Transferir conversas entre setores', resp: 'CP' },
  { empresa: 'Rede Farma Sul', titulo: 'Treinamento da equipe de vendas', resp: 'MR' },
  { empresa: 'Construtora Prisma', titulo: 'Integração com a agenda de visitas', resp: 'JS' },
];

const ROTULO_STATUS = {
  fila: 'Na fila',
  atendimento: 'Em atendimento',
  resolvida: 'Resolvida',
};

const SLIDE_MS = 7000;
const FILA_MS = 2600;
const EASE = [0.22, 1, 0.36, 1];

// Textura sutil de papel para tirar o aspecto "chapado" do fundo escuro
const GRAO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")";

function filaInicial() {
  return DEMANDAS_EXEMPLO.slice(0, 4).map((d, i) => ({
    ...d,
    id: i,
    status: i === 0 ? 'atendimento' : 'fila',
  }));
}

/** Prévia viva do produto: demandas entrando, sendo atendidas e resolvidas. */
function PreviaFila({ pausado }) {
  const [fila, setFila] = useState(filaInicial);
  const [proximo, setProximo] = useState(4);
  const [resolvidas, setResolvidas] = useState(27);

  useEffect(() => {
    if (pausado) return undefined;
    const timer = setInterval(() => {
      setFila((atual) => {
        if (atual[0]?.status !== 'resolvida') {
          return atual.map((d, i) => (i === 0 ? { ...d, status: 'resolvida' } : d));
        }
        return atual;
      });
    }, FILA_MS);
    return () => clearInterval(timer);
  }, [pausado]);

  // Uma demanda resolvida sai da lista logo depois; a seguinte passa a ser atendida
  useEffect(() => {
    if (fila[0]?.status !== 'resolvida') return undefined;
    const t = setTimeout(() => {
      setFila((atual) => {
        const base = DEMANDAS_EXEMPLO[proximo % DEMANDAS_EXEMPLO.length];
        const restantes = atual.slice(1).map((d, i) => (i === 0 ? { ...d, status: 'atendimento' } : d));
        return [...restantes, { ...base, id: proximo, status: 'fila' }];
      });
      setProximo((n) => n + 1);
      setResolvidas((n) => n + 1);
    }, 1100);
    return () => clearTimeout(t);
  }, [fila, proximo]);

  return (
    <div className="relative w-full max-w-[460px] rounded-[22px] bg-[#f4f2ec]/[0.035] border border-[#f4f2ec]/[0.08] p-2 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm">
      <div className="rounded-[16px] bg-[#11140d] border border-[#f4f2ec]/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <p className="text-[13px] font-medium text-[#f4f2ec]">Fila de hoje</p>
            <p className="text-[11px] text-[#f4f2ec]/45 mt-0.5">Atualizada agora</p>
          </div>
          <div className="text-right">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={resolvidas}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="text-[22px] leading-none font-semibold tabular-nums text-[#c5f07a]"
              >
                {resolvidas}
              </motion.p>
            </AnimatePresence>
            <p className="text-[11px] text-[#f4f2ec]/45 mt-1">resolvidas</p>
          </div>
        </div>

        <ul className="px-2 pb-2 space-y-1">
          <AnimatePresence initial={false} mode="popLayout">
            {fila.map((d) => (
              <motion.li
                key={d.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 16, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: EASE }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-500 ${
                  d.status === 'atendimento' ? 'bg-[#f4f2ec]/[0.05]' : ''
                }`}
              >
                <span
                  className={`relative flex-shrink-0 w-[18px] h-[18px] rounded-full border transition-colors duration-500 flex items-center justify-center ${
                    d.status === 'resolvida'
                      ? 'bg-[#a3e635] border-[#a3e635]'
                      : d.status === 'atendimento'
                        ? 'border-[#a3e635]/70'
                        : 'border-[#f4f2ec]/20'
                  }`}
                >
                  {d.status === 'resolvida' && (
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                      <motion.path
                        d="M2.5 6.2 5 8.5 9.5 3.5"
                        fill="none"
                        stroke="#10130c"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.35, ease: EASE }}
                      />
                    </svg>
                  )}
                  {d.status === 'atendimento' && <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635]" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13px] truncate transition-colors duration-500 ${
                      d.status === 'resolvida' ? 'text-[#f4f2ec]/45 line-through decoration-[#f4f2ec]/25' : 'text-[#f4f2ec]/90'
                    }`}
                  >
                    {d.titulo}
                  </p>
                  <p className="text-[11px] text-[#f4f2ec]/40 truncate">{d.empresa}</p>
                </div>

                <span
                  className={`hidden sm:inline-flex flex-shrink-0 text-[10.5px] px-2 py-0.5 rounded-full border transition-colors duration-500 ${
                    d.status === 'resolvida'
                      ? 'text-[#c5f07a] border-[#a3e635]/30 bg-[#a3e635]/10'
                      : d.status === 'atendimento'
                        ? 'text-[#f4f2ec]/80 border-[#f4f2ec]/15'
                        : 'text-[#f4f2ec]/40 border-[#f4f2ec]/10'
                  }`}
                >
                  {ROTULO_STATUS[d.status]}
                </span>

                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#f4f2ec]/[0.08] text-[9.5px] font-semibold text-[#f4f2ec]/70 flex items-center justify-center">
                  {d.resp}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

function BotaoTema({ theme, onToggle, sobreEscuro = false }) {
  const cores = sobreEscuro
    ? 'text-[#f4f2ec]/70 hover:text-[#f4f2ec] hover:bg-[#f4f2ec]/[0.08]'
    : 'text-[#14160f]/60 dark:text-[#f4f2ec]/60 hover:text-[#14160f] dark:hover:text-[#f4f2ec] hover:bg-[#14160f]/[0.05] dark:hover:bg-[#f4f2ec]/[0.06]';
  return (
    <button
      type="button"
      onClick={() => onToggle(theme === 'light' ? 'dark' : 'light')}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${cores}`}
      aria-label={theme === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
      title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
    >
      {theme === 'light' ? (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        </svg>
      ) : (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

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
  onCaptchaToken = () => {},
}) {
  const reduzirMovimento = useReducedMotion();
  const [slideAtual, setSlideAtual] = useState(0);
  const [paginaOculta, setPaginaOculta] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(!captchaAtivo);

  useEffect(() => {
    const aoMudar = () => setPaginaOculta(document.hidden);
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  }, []);

  const pausado = paginaOculta || Boolean(reduzirMovimento);

  useEffect(() => {
    if (pausado || !slides || slides.length <= 1) return undefined;
    const timer = setInterval(() => setSlideAtual((n) => (n + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [pausado, slides, slideAtual]);

  const slide = slides[slideAtual] || slides[0];
  const anoAtual = new Date().getFullYear();
  const bloqueado = loginSubmitting || !captchaOk;

  const receberCaptcha = (token) => {
    setCaptchaOk(Boolean(token));
    onCaptchaToken(token);
  };

  const campoBase =
    'w-full h-12 px-4 rounded-xl text-[15px] bg-white dark:bg-[#12150f] text-[#14160f] dark:text-[#f4f2ec] ' +
    'border border-[#14160f]/[0.12] dark:border-[#f4f2ec]/[0.10] placeholder:text-[#14160f]/30 dark:placeholder:text-[#f4f2ec]/25 ' +
    'shadow-[0_1px_0_rgba(20,22,15,0.03)] transition-[border-color,box-shadow] duration-200 ' +
    'hover:border-[#14160f]/25 dark:hover:border-[#f4f2ec]/20 ' +
    'focus:outline-none focus:border-[#4d7c0f] dark:focus:border-[#a3e635]/70 focus:ring-4 focus:ring-[#4d7c0f]/10 dark:focus:ring-[#a3e635]/10';

  return (
    <div className="min-h-[100dvh] w-full grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] bg-[#f7f6f2] dark:bg-[#0b0d09] text-[#14160f] dark:text-[#f4f2ec] selection:bg-[#a3e635]/30">
      {/* ============================================================================== */}
      {/* PAINEL DE APRESENTAÇÃO (desktop)                                               */}
      {/* ============================================================================== */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#0b0d09] text-[#f4f2ec] p-12 xl:p-16 select-none">
        {/* Luz e textura de fundo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -left-40 w-[620px] h-[620px] rounded-full opacity-[0.16] blur-[110px]"
          style={{ background: 'radial-gradient(circle, #a3e635 0%, transparent 65%)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-56 right-[-120px] w-[560px] h-[560px] rounded-full opacity-[0.10] blur-[120px]"
          style={{ background: 'radial-gradient(circle, #d9f99d 0%, transparent 65%)' }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAO }} />

        <div className="relative z-10">
          <BrandLockup tone="light" size={38} subtitle="Gestão de demandas e atendimento" />
        </div>

        <div className="relative z-10 flex flex-col gap-12 xl:gap-14 py-12">
          <div className="min-h-[200px] xl:min-h-[220px] max-w-[540px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <h2 className="text-[44px] xl:text-[56px] leading-[1.02] tracking-[-0.025em] font-semibold">
                  <span className="block">{slide.titulo[0]}</span>
                  <span className="block font-display font-normal italic tracking-[-0.01em] text-[#c5f07a]">
                    {slide.titulo[1]}
                  </span>
                </h2>
                <p className="mt-5 text-[15px] xl:text-[16px] leading-relaxed text-[#f4f2ec]/60 max-w-[440px]">
                  {slide.descricao}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <PreviaFila pausado={pausado} />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2" role="tablist" aria-label="Destaques">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === slideAtual}
                aria-label={`${s.titulo.join(' ')}`}
                onClick={() => setSlideAtual(i)}
                className="group py-2 cursor-pointer"
              >
                <span
                  className={`block h-[3px] rounded-full transition-all duration-500 ${
                    i === slideAtual ? 'w-9 bg-[#f4f2ec]' : 'w-4 bg-[#f4f2ec]/20 group-hover:bg-[#f4f2ec]/40'
                  }`}
                />
              </button>
            ))}
          </div>
          <span className="text-[12px] text-[#f4f2ec]/35">© {anoAtual} RM Controle</span>
        </div>
      </aside>

      {/* ============================================================================== */}
      {/* FORMULÁRIO DE ACESSO                                                           */}
      {/* ============================================================================== */}
      <main className="relative flex flex-col min-h-[100dvh] bg-[#0b0d09] lg:bg-transparent">
        {/* Topo escuro no celular: a mesma mensagem do painel, em versão compacta */}
        <section className="lg:hidden relative overflow-hidden text-[#f4f2ec] px-5 sm:px-10 pt-5 pb-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 -left-24 w-[420px] h-[420px] rounded-full opacity-[0.20] blur-[90px]"
            style={{ background: 'radial-gradient(circle, #a3e635 0%, transparent 65%)' }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAO }} />
          <div className="relative flex items-center justify-between">
            <BrandLockup size={34} tone="light" />
            <BotaoTema theme={theme} onToggle={handleToggleTheme} sobreEscuro />
          </div>
          <div className="relative mt-10 min-h-[132px] sm:min-h-[150px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <p className="text-[32px] sm:text-[40px] leading-[1.04] tracking-[-0.025em] font-semibold">
                  <span className="block">{slide.titulo[0]}</span>
                  <span className="block font-display font-normal italic tracking-[-0.01em] text-[#c5f07a]">{slide.titulo[1]}</span>
                </p>
                <p className="mt-3 text-[14px] leading-relaxed text-[#f4f2ec]/55 max-w-[420px]">{slide.descricao}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* Folha do formulário: sobe sobre o topo escuro no celular; ocupa o lado direito no desktop */}
        <div className="relative z-10 -mt-7 lg:mt-0 flex-1 flex flex-col rounded-t-[28px] lg:rounded-none bg-[#f7f6f2] dark:bg-[#11140e] lg:dark:bg-[#0b0d09] px-5 sm:px-10 xl:px-16 pt-2 pb-6 lg:py-8 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.5)] lg:shadow-none">
          <header className="hidden lg:flex relative z-10 items-center justify-end">
            <BotaoTema theme={theme} onToggle={handleToggleTheme} />
          </header>

          <div className="relative z-10 flex-1 flex items-center justify-center py-8 sm:py-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="w-full max-w-[392px]"
            >
              <div className="hidden lg:block mb-8">
                <BrandMark size={44} />
              </div>

              <h1 className="text-[30px] sm:text-[34px] leading-[1.1] tracking-[-0.025em] font-semibold">
                Bem-vindo <span className="font-display font-normal italic tracking-[-0.01em]">de volta</span>
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-[#14160f]/55 dark:text-[#f4f2ec]/50">
                Acesse sua conta para acompanhar e resolver as demandas da sua equipe.
              </p>

              <AnimatePresence>
                {loginError && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-3 rounded-xl border border-[#b42318]/20 dark:border-[#f97066]/25 bg-[#fef3f2] dark:bg-[#f97066]/[0.08] px-4 py-3 text-[13.5px] leading-snug text-[#912018] dark:text-[#fda29b]">
                      <svg className="w-4 h-4 mt-[1px] flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12a.9.9 0 0 1 .9.9v3.6a.9.9 0 1 1-1.8 0V6.9A.9.9 0 0 1 10 6Zm0 8.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                      </svg>
                      <span>{loginError}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                {/* Campo isca: invisível para pessoas, preenchido por robôs */}
                <input
                  type="text"
                  name="rm_auth_hp_field"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ display: 'none' }}
                />

                <div>
                  <label htmlFor="login-email" className="block text-[13px] font-medium mb-2 text-[#14160f]/80 dark:text-[#f4f2ec]/75">
                    E-mail
                  </label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={254}
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="voce@empresa.com.br"
                    required
                    className={campoBase}
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-[13px] font-medium mb-2 text-[#14160f]/80 dark:text-[#f4f2ec]/75">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      maxLength={128}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Sua senha"
                      required
                      className={`${campoBase} pr-[88px]`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-3 rounded-lg text-[12.5px] font-medium text-[#14160f]/55 dark:text-[#f4f2ec]/50 hover:text-[#14160f] dark:hover:text-[#f4f2ec] hover:bg-[#14160f]/[0.05] dark:hover:bg-[#f4f2ec]/[0.06] transition-colors cursor-pointer"
                      aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showLoginPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <CaptchaTurnstile onToken={receberCaptcha} theme={theme} />

                <motion.button
                  whileTap={bloqueado ? undefined : { scale: 0.985 }}
                  type="submit"
                  disabled={bloqueado}
                  className="group relative w-full h-12 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 cursor-pointer bg-[#14160f] text-[#f4f2ec] hover:bg-[#232719] dark:bg-[#c5f07a] dark:text-[#10130c] dark:hover:bg-[#d4f59a] shadow-[0_10px_24px_-12px_rgba(20,22,15,0.6)] dark:shadow-[0_10px_30px_-12px_rgba(163,230,53,0.45)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {loginSubmitting ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      <span>Entrando…</span>
                    </>
                  ) : (
                    <>
                      <span>Entrar</span>
                      <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
                      </svg>
                    </>
                  )}
                </motion.button>

                {captchaAtivo && !captchaOk && !loginSubmitting && (
                  <p className="text-center text-[12.5px] text-[#14160f]/45 dark:text-[#f4f2ec]/40">
                    Conclua a verificação acima para continuar.
                  </p>
                )}
              </form>

              <p className="mt-10 text-[13.5px] text-[#14160f]/50 dark:text-[#f4f2ec]/45">
                Ainda não tem acesso?{' '}
                <span className="text-[#14160f]/80 dark:text-[#f4f2ec]/80 font-medium">Solicite ao administrador da sua equipe.</span>
              </p>
            </motion.div>
          </div>

          <footer className="relative z-10 lg:hidden text-center text-[12px] text-[#14160f]/40 dark:text-[#f4f2ec]/35">
            © {anoAtual} RM Controle
          </footer>
        </div>
      </main>
    </div>
  );
}
