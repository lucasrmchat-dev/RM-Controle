'use client';

import { getAudioConfig, setAudioConfig, playNotificationTone } from '@/lib/audioNotifications';
import React, { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
import { showToast } from './ToastNotification';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getChamadosAtivos, 
  getFilaChamados,
  getAbasPermitidas, 
  getCurrentUserRole, 
  setCurrentUserRole,
  cancelarSuporte,
  getAgendaEventos
} from '@/lib/storage';
import { XMarkIcon, SupportQueueIcon, CalendarIcon } from './Icons';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  userEmail, 
  onLogout,
  theme,
  setTheme,
  inactivityTimeLeft,
  showMockData,
  setShowMockData,
  onOpenChamadoAtivo
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [avisoAgendaOpen, setAvisoAgendaOpen] = useState(false);
  const dropdownRef = useRef(null);
  const mobileDropdownRef = useRef(null);
  const [chamadosAtivos, setChamadosAtivos] = useState([]);
  const [totalFila, setTotalFila] = useState(0);
  const [totalReunioesHoje, setTotalReunioesHoje] = useState(0);
  const [audioConfig, setAudioState] = useState({
    habilitado: true,
    tipoSom: 'harmonico',
    modoRepeticao: 'uma_vez',
    intervaloSegundos: 30,
    escopo: 'todos',
  });

  useEffect(() => {
    setAudioState(getAudioConfig());
    const handleAudioUpdate = () => setAudioState(getAudioConfig());
    window.addEventListener('rm_audio_config_updated', handleAudioUpdate);
    return () => window.removeEventListener('rm_audio_config_updated', handleAudioUpdate);
  }, []);
  const [userRole, setUserRole] = useState('administrador');
  const [, setTick] = useState(0);

  // Atualiza chamados ativos, agenda e permissões
  const checarEstado = () => {
    const ativos = getChamadosAtivos();
    setChamadosAtivos(ativos);
    const fila = getFilaChamados ? getFilaChamados() : [];
    setTotalFila(fila.length);
    setUserRole(getCurrentUserRole());
    try {
      const evts = getAgendaEventos ? getAgendaEventos() : [];
      const hojeIso = new Date().toISOString().split('T')[0];
      const countHoje = evts.filter((e) => e.data === hojeIso && e.status !== 'cancelada').length;
      setTotalReunioesHoje(countHoje);
    } catch (e) {}
  };

  useEffect(() => {
    checarEstado();
    const handleUpdate = () => checarEstado();
    window.addEventListener('suporte_updated', handleUpdate);
    window.addEventListener('user_role_updated', handleUpdate);
    window.addEventListener('equipe_updated', handleUpdate);
    window.addEventListener('agenda_eventos_updated', handleUpdate);

    const timer = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      window.removeEventListener('user_role_updated', handleUpdate);
      window.removeEventListener('equipe_updated', handleUpdate);
      window.removeEventListener('agenda_eventos_updated', handleUpdate);
      clearInterval(timer);
    };
  }, []);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Formata o timer de inatividade em MM:SS
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getUserDisplayName = () => {
    if (!userEmail) return 'Administrador';
    const namePart = userEmail.split('@')[0];
    return namePart
      .split(/[._-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  const todasAsAbas = [
    { 
      id: 'empresas', 
      label: 'Empresas', 
      shortLabel: 'Empresas',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
          <path d="M9 22v-4h6v4"/>
        </svg>
      ) 
    },
    { 
      id: 'fila', 
      label: 'Fila de Demandas', 
      shortLabel: 'Fila',
      badge: totalFila > 0 ? totalFila : null,
      icon: <SupportQueueIcon className="w-4 h-4" />
    },
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      shortLabel: 'Métricas',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1"/>
          <rect width="7" height="5" x="14" y="3" rx="1"/>
          <rect width="7" height="9" x="14" y="12" rx="1"/>
          <rect width="7" height="5" x="3" y="16" rx="1"/>
        </svg>
      ) 
    },
    { 
      id: 'feedbacks', 
      label: 'Feedbacks', 
      shortLabel: 'Feedbacks',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M12 7v4"/>
          <path d="M12 15h.01"/>
        </svg>
      ) 
    },
    { 
      id: 'agenda', 
      label: 'Agenda', 
      shortLabel: 'Agenda',
      badge: totalReunioesHoje > 0 ? totalReunioesHoje : null,
      icon: <CalendarIcon className="w-4 h-4" />
    },
    { 
      id: 'configuracoes', 
      label: 'Configurações Gerais', 
      shortLabel: 'Ajustes',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      ) 
    },
  ];

  const abasPermitidasIds = getAbasPermitidas(userRole);
  const abasFiltradas = todasAsAbas.filter((t) => abasPermitidasIds.includes(t.id));

  const handleSelectTab = (tabId) => {
    if (tabId === 'agenda') {
      setAvisoAgendaOpen(true);
      return;
    }
    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleConfirmarAgenda = () => {
    setAvisoAgendaOpen(false);
    setActiveTab('agenda');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <>
      {/* ============================================================================== */}
      {/* 1. HEADER SUPERIOR DESKTOP (MACOS SEQUOIA / VERCEL DESIGN DE ALTO PADRÃO)       */}
      {/* ============================================================================== */}
      <header className="hidden md:block fixed top-3.5 left-1/2 -translate-x-1/2 w-[96%] max-w-[1720px] z-40 transition-all duration-300">
        <div className="backdrop-blur-3xl bg-white/80 dark:bg-[#0c0c0e]/85 border border-black/[0.08] dark:border-white/[0.09] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] rounded-full px-4 py-2 flex items-center justify-between gap-4 relative">
          
          {/* Lado Esquerdo: Logo Monograma RM de Alto Padrão */}
          <div className="flex items-center gap-3 pl-1 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#020617] via-[#0f172a] to-[#1e293b] dark:from-[#18181b] dark:via-[#27272a] dark:to-[#3f3f46] text-white flex items-center justify-center font-bold text-xs border border-white/20 shadow-sm relative group">
              <span>RM</span>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0c0c0e] animate-pulse" title="Sistema Online"></span>
            </div>

            <div className="hidden xl:flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs tracking-tight text-[#0a0a0c] dark:text-[#f5f5f7]">
                  RM Controle
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16]">
                  PRO
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Central Operacional</span>
            </div>
          </div>

          {/* Abas Centrais: Sliding Pill Apple com Motion Design Físico */}
          <nav className="flex items-center gap-1 p-1 bg-black/[0.035] dark:bg-white/[0.04] rounded-full border border-black/[0.04] dark:border-white/[0.06] relative">
            {abasFiltradas.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 z-10 cursor-pointer ${
                    isActive
                      ? 'text-[#0a0a0c] dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-navbar-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-full bg-white dark:bg-[#1e1e24] shadow-sm border border-black/[0.06] dark:border-white/[0.08] -z-10"
                    />
                  )}
                  <span className={isActive ? 'text-[#4d7c0f] dark:text-[#84cc16]' : 'text-slate-500 dark:text-zinc-500'}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                      isActive 
                        ? 'bg-[#4d7c0f]/15 text-[#4d7c0f] dark:bg-[#84cc16]/20 dark:text-[#84cc16]' 
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Lado Direito: Timer LGPD + Perfil */}
          <div className="flex items-center gap-2.5 pr-1">
            {/* Timer de Inatividade LGPD */}
            <div 
              title="Desconexão automática após 30 min de inatividade (LGPD)"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.06] text-[11px] font-mono text-slate-600 dark:text-zinc-300 tabular-nums shadow-2xs"
            >
              <span className="text-slate-400 text-[10px]">⏱</span>
              <span>{formatTimer(inactivityTimeLeft)}</span>
            </div>

            {/* Menu de Perfil Desktop */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.05] border border-transparent hover:border-black/[0.06] dark:hover:border-white/[0.08] transition-all text-xs font-medium cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-slate-300 to-slate-100 dark:from-zinc-700 dark:to-zinc-800 text-slate-900 dark:text-zinc-100 flex items-center justify-center font-bold text-xs shadow-xs">
                  {getUserDisplayName().charAt(0)}
                </div>
                <span className="font-semibold text-slate-800 dark:text-zinc-200 max-w-[120px] truncate">{getUserDisplayName()}</span>
                <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 mt-3 w-80 rounded-3xl bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-3xl border border-black/[0.08] dark:border-white/[0.1] shadow-2xl p-4 text-xs text-slate-800 dark:text-zinc-200 z-50"
                  >
                    {/* Dados do Usuário */}
                    <div className="pb-3 border-b border-black/[0.05] dark:border-white/[0.06] mb-3 space-y-1">
                      <p className="font-semibold text-[#0a0a0c] dark:text-white text-xs">
                        {getUserDisplayName()}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                        {userEmail}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300">
                          Papel: {userRole}
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Sessão Segura
                        </span>
                      </div>
                    </div>

                    {/* Controles exclusivos do Administrador Principal */}
                    {((userEmail || '').toLowerCase() === 'admin@rmcontrole.com' || (userEmail || '').toLowerCase().includes('admin')) && (
                      <>
                        <div className="py-2 border-b border-black/[0.05] dark:border-white/[0.06] space-y-1.5">
                          <span className="text-[11px] font-medium text-slate-600 dark:text-zinc-400 block">
                            Permissão de Acesso (Setor):
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {['administrador', 'suporte', 'vendas'].map((r) => (
                              <button
                                key={r}
                                onClick={() => {
                                  setCurrentUserRole(r);
                                  setUserRole(r);
                                }}
                                className={`py-1 px-1.5 rounded-lg text-[10px] font-semibold uppercase transition-all ${
                                  userRole === r
                                    ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold'
                                    : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.06]'
                                }`}
                              >
                                {r.slice(0, 5)}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="py-2">
                          <div className="p-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="font-semibold text-[#0a0a0c] dark:text-zinc-200 text-[11px]">
                                Dados Simulados (Mock Dev)
                              </span>
                              <input
                                type="checkbox"
                                checked={showMockData}
                                onChange={(e) => setShowMockData(e.target.checked)}
                                className="w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16] cursor-pointer rounded"
                              />
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight">
                              {showMockData ? 'Exibindo empresas e checklist simulados.' : 'Modo limpo: somente dados reais do sistema.'}
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Tema */}
                    <div className="py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 dark:text-zinc-400 font-medium">Tema Visual</span>
                        <button
                          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                          className="px-2.5 py-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-[11px] font-semibold cursor-pointer"
                        >
                          {theme === 'light' ? 'Modo Claro' : 'Modo Escuro'}
                        </button>
                      </div>
                    </div>

                    {/* Sair */}
                    <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.06]">
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          onLogout();
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-semibold transition-all cursor-pointer text-center"
                      >
                        Sair do Sistema
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Espaçador Desktop para não sobrepor o conteúdo */}
      <div className="hidden md:block h-20" aria-hidden="true" />

      {/* ============================================================================== */}
      {/* 2. HEADER SUPERIOR MOBILE (IPHONE / IPAD - STATUS BAR LIMPA E MODERNA)         */}
      {/* ============================================================================== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 backdrop-blur-2xl bg-white/85 dark:bg-[#09090b]/90 border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-2.5 flex items-center justify-between transition-all">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#020617] to-[#1e293b] dark:from-[#18181b] dark:to-[#3f3f46] text-white flex items-center justify-center font-bold text-[11px] border border-white/20 shadow-xs relative">
            <span>RM</span>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white dark:border-[#09090b]"></span>
          </div>
          <div>
            <span className="font-bold text-xs text-[#0a0a0c] dark:text-white block leading-tight">RM Controle</span>
            <span className="text-[9px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold flex items-center gap-1 font-mono">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
              Ao Vivo
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.06] text-[10px] font-mono text-slate-600 dark:text-zinc-300">
            <span>⏱</span>
            <span>{formatTimer(inactivityTimeLeft)}</span>
          </div>

          <div className="relative" ref={mobileDropdownRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-7 h-7 rounded-full bg-gradient-to-tr from-slate-300 to-slate-100 dark:from-zinc-700 dark:to-zinc-800 text-slate-900 dark:text-zinc-100 flex items-center justify-center font-bold text-[11px] shadow-xs cursor-pointer"
            >
              {getUserDisplayName().charAt(0)}
            </button>
          </div>
        </div>
      </header>

      {/* Espaçador Superior Mobile */}
      <div className="md:hidden h-14" aria-hidden="true" />

      {/* ============================================================================== */}
      {/* 3. NAVBAR INFERIOR MOBILE ESTILO INSTAGRAM (LIQUID GLASS DOCK APPLE)            */}
      {/* ============================================================================== */}
      <nav className="md:hidden fixed bottom-2.5 sm:bottom-3 inset-x-2.5 sm:inset-x-4 z-50 backdrop-blur-3xl bg-white/80 dark:bg-[#121216]/85 border border-white/60 dark:border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.16)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.9)] rounded-[26px] p-1.5 flex items-center justify-between">
        {abasFiltradas.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.84 }}
              onClick={() => handleSelectTab(tab.id)}
              className={`relative flex-1 py-1 px-1 flex flex-col items-center justify-center gap-0.5 rounded-2xl transition-all cursor-pointer ${
                isActive
                  ? 'text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="mobile-dock-active"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  className="absolute inset-0 rounded-2xl bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 -z-10 border border-[#4d7c0f]/20 dark:border-[#84cc16]/25"
                />
              )}

              <div className="relative">
                <span className="w-5 h-5 flex items-center justify-center">
                  {tab.icon}
                </span>

                {tab.badge && (
                  <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 bg-red-500 text-white font-mono text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </div>

              <span className="text-[9px] tracking-tight truncate max-w-[56px] leading-tight">
                {tab.shortLabel || tab.label}
              </span>
            </motion.button>
          );
        })}
      </nav>

      {/* ============================================================================== */}
      {/* 4. MODAL DE AVISO: AGENDA EM DESENVOLVIMENTO & HOMOLOGAÇÃO                      */}
      {/* ============================================================================== */}
      <AnimatePresence>
        {avisoAgendaOpen && (
          <div 
            className="fixed inset-0 w-screen h-screen z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            onClick={() => setAvisoAgendaOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="w-full max-w-md rounded-3xl bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] p-6 sm:p-7 shadow-2xl space-y-5 relative text-[#1d1d1f] dark:text-[#f5f5f7]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl flex-shrink-0 border border-amber-500/25 shadow-xs">
                  📅
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">
                      Agenda & Compromissos
                    </h3>
                    <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-mono">
                      Em Produção
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Módulo em fase contínua de desenvolvimento e homologação.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] text-xs space-y-2 text-slate-600 dark:text-zinc-300 leading-relaxed">
                <p>
                  Esta aba inclui a visualização semanal nativa e a transmissão ao vivo do Google Agenda.
                </p>
                <p className="font-medium text-[#1d1d1f] dark:text-white">
                  Você deseja prosseguir para visualizar a prévia do módulo?
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setAvisoAgendaOpen(false)}
                  className="px-4 py-2.5 rounded-full border border-black/[0.08] dark:border-white/[0.1] text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmarAgenda}
                  className="px-5 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs hover:opacity-90 transition-all cursor-pointer shadow-md shadow-black/10"
                >
                  Sim, Continuar para a Agenda →
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
