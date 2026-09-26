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
  cancelarSuporte 
} from '@/lib/storage';
import { XMarkIcon, SupportQueueIcon } from './Icons';

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
  const [islandExpanded, setIslandExpanded] = useState(false);
  const dropdownRef = useRef(null);
  const islandRef = useRef(null);
  const [chamadosAtivos, setChamadosAtivos] = useState([]);
  const [totalFila, setTotalFila] = useState(0);
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

  // Atualiza chamados ativos e permissões
  const checarEstado = () => {
    const ativos = getChamadosAtivos();
    setChamadosAtivos(ativos);
    const fila = getFilaChamados ? getFilaChamados() : [];
    setTotalFila(fila.length);
    setUserRole(getCurrentUserRole());
  };

  useEffect(() => {
    checarEstado();
    const handleUpdate = () => checarEstado();
    window.addEventListener('suporte_updated', handleUpdate);
    window.addEventListener('user_role_updated', handleUpdate);
    window.addEventListener('equipe_updated', handleUpdate);

    // Ticker a cada segundo para atualizar cronômetros ao vivo
    const timer = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      window.removeEventListener('user_role_updated', handleUpdate);
      window.removeEventListener('equipe_updated', handleUpdate);
      clearInterval(timer);
    };
  }, []);

  const formatarTempo = (iniciadoEm) => {
    if (!iniciadoEm) return '00:00';
    const inicio = new Date(iniciadoEm).getTime();
    const diff = Math.max(0, Math.round((Date.now() - inicio) / 1000));
    const minutos = Math.floor(diff / 60);
    const segundos = diff % 60;
    return `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  };

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (islandRef.current && !islandRef.current.contains(event.target)) {
        setIslandExpanded(false);
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
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
          <path d="M9 22v-4h6v4"/>
        </svg>
      ) 
    },
    { 
      id: 'fila', 
      label: 'Fila de Suporte', 
      badge: totalFila > 0 ? totalFila : null,
      icon: <SupportQueueIcon className="w-4 h-4" />
    },
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
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
      id: 'configuracoes', 
      label: 'Configurações Gerais', 
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

  const totalAtivos = chamadosAtivos.length;

  return (
    <>
      {/* NAVBAR FLUTUANTE COM DYNAMIC ISLAND APPLE DE MOTION DESIGN AVANÇADO */}
      <header className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 w-[96%] max-w-[1720px] z-40 transition-all duration-300">
        <div className="backdrop-blur-2xl bg-white/85 dark:bg-[#121215]/90 border border-black/8 dark:border-white/10 shadow-[0_12px_36px_-10px_rgba(0,0,0,0.07)] dark:shadow-[0_16px_45px_-10px_rgba(0,0,0,0.8)] rounded-full px-3 sm:px-5 py-2 flex items-center justify-between gap-2 sm:gap-4 relative">
          
          {/* Lado Esquerdo: Logo & Dynamic Island */}
          <div className="flex items-center gap-2.5 pl-1 flex-shrink-0" ref={islandRef}>
            
            {/* Logo Monograma RM */}
            <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#0f172a] to-[#020617] dark:from-[#27272a] dark:to-[#09090b] text-white flex items-center justify-center font-bold text-[11px] border border-white/20 shadow-xs">
              RM
            </div>

            <span className="font-semibold text-xs tracking-tight text-[#0a0a0c] dark:text-[#f5f5f7] hidden xl:inline">
              RM Controle
            </span>
            
            {/* ============================================================================== */}
            {/* DYNAMIC ISLAND DA APPLE COM DESIGN SÓLIDO JET BLACK E ÍCONES SVG PUROS */}
            {/* ============================================================================== */}
            {totalAtivos > 0 && (
              <div className="relative">
                <motion.div
                  layoutId="apple-dynamic-island"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  className="cursor-pointer"
                  onClick={() => setIslandExpanded(!islandExpanded)}
                >
                  {/* Cenário com 1 Chamado: Cápsula Preta Sólida Apple */}
                  {totalAtivos === 1 && (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black text-white border border-white/20 shadow-lg ring-1 ring-black/10 select-none hover:border-white/35 transition-all">
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>

                      <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                      </svg>

                      <strong className="truncate max-w-[130px] sm:max-w-[160px] text-xs font-bold text-white tracking-tight">
                        {chamadosAtivos[0].empresa_nome}
                      </strong>

                      <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {formatarTempo(chamadosAtivos[0].iniciado_em)}
                      </span>

                      <svg className="w-3 h-3 text-white/50 ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  )}

                  {/* Cenário com 2 Chamados */}
                  {totalAtivos === 2 && (
                    <div className="flex items-center gap-1.5 p-1 rounded-full bg-black border border-white/20 shadow-lg">
                      {chamadosAtivos.map((ch) => (
                        <div
                          key={ch.id}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-white transition-all"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          <span className="truncate max-w-[80px] sm:max-w-[110px] text-white font-bold">{ch.empresa_nome}</span>
                          <span className="font-mono text-[10px] font-bold text-emerald-400 tabular-nums">
                            {formatarTempo(ch.iniciado_em)}
                          </span>
                        </div>
                      ))}
                      <svg className="w-3 h-3 text-white/50 mr-1.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  )}

                  {/* Cenário com 3 ou mais Chamados */}
                  {totalAtivos >= 3 && (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black text-white border border-white/20 shadow-lg select-none">
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-bold text-white">{totalAtivos} Suportes Ativos</span>
                      <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {formatarTempo(chamadosAtivos[0].iniciado_em)}
                      </span>
                      <svg className="w-3 h-3 text-white/50 ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  )}
                </motion.div>

                {/* MODAL EXPANDIDO DA DYNAMIC ISLAND: PRETO SÓLIDO LUXUOSO APPLE */}
                <AnimatePresence>
                  {islandExpanded && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.94 }}
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      className="absolute left-0 mt-3 w-[340px] sm:w-[390px] rounded-[32px] bg-[#0c0c0e] text-white border border-white/20 p-5 shadow-2xl z-50 space-y-3.5 backdrop-blur-3xl"
                    >
                      {/* Topo da Ilha */}
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          <span className="text-xs font-bold tracking-tight text-white">Ilha Dinâmica de Suporte</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {totalAtivos} {totalAtivos === 1 ? 'chamado ativo' : 'chamados ativos'}
                          </span>
                        </div>

                        <button
                          onClick={() => setIslandExpanded(false)}
                          className="text-white/50 hover:text-white p-1 rounded-full text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Lista de Chamados com Ações Diretas */}
                      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                        {chamadosAtivos.map((ch) => (
                          <div
                            key={ch.id}
                            className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-all space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-white truncate max-w-[200px]">
                                  {ch.empresa_nome}
                                </h4>
                                <p className="text-[10px] text-zinc-400 font-mono">
                                  Técnico: {ch.tecnico_email?.split('@')[0]}
                                </p>
                              </div>

                              <div className="text-right font-mono">
                                <span className="text-xs font-bold text-emerald-400 tabular-nums bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                  {formatarTempo(ch.iniciado_em)}
                                </span>
                              </div>
                            </div>

                            {/* Botões de Ação com SVG */}
                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                onClick={() => {
                                  setIslandExpanded(false);
                                  onOpenChamadoAtivo && onOpenChamadoAtivo(ch.empresa_id);
                                }}
                                className="flex-1 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/15 text-[10px] font-semibold text-white transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <svg className="w-3 h-3 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                <span>Abrir</span>
                              </button>

                              <button
                                onClick={() => {
                                  setIslandExpanded(false);
                                  window.dispatchEvent(new CustomEvent('abrir_conclusao_chamado', { detail: ch }));
                                }}
                                className="py-1.5 px-3 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Concluir</span>
                              </button>

                              <button
                                onClick={() => {
                                  setConfirmDialog({
                                    title: 'Cancelar Atendimento?',
                                    message: 'Deseja realmente cancelar o suporte de "' + ch.empresa_nome + '"? O tempo será descartado.',
                                    confirmText: 'Sim, Cancelar',
                                    variant: 'danger',
                                    onConfirm: async () => {
                                      await cancelarSuporte({ chamado_id: ch.id, userEmail });
                                      showToast('Suporte de ' + ch.empresa_nome + ' cancelado.', 'info');
                                      setConfirmDialog(null);
                                    },
                                  });
                                }}
                                className="py-1.5 px-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                                title="Cancelar chamado"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span>Cancelar</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Rodapé da Ilha */}
                      <div className="pt-2 border-t border-white/10 text-center">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Cronômetros de precisão sincronizados
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Abas Centrais com Sliding Pill Apple */}
          <nav className="flex items-center gap-1 p-1 bg-black/[0.04] dark:bg-white/[0.04] rounded-full border border-black/[0.04] dark:border-white/[0.06] relative">
            {abasFiltradas.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                  className={`relative flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 z-10 ${
                    isActive
                      ? 'text-[#0a0a0c] dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-navbar-pill"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-white dark:bg-zinc-800 shadow-sm border border-black/[0.04] dark:border-white/[0.06] -z-10"
                    />
                  )}
                  <span className={isActive ? 'text-[#4d7c0f] dark:text-[#84cc16]' : 'text-slate-500 dark:text-zinc-500'}>
                    {tab.icon}
                  </span>
                  <span className="hidden md:inline">{tab.label}</span>
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
          <div className="flex items-center gap-2 pr-1">
            
            {/* Timer de 30 minutos (Proteção LGPD) */}
            <div 
              title="Desconexão automática após 30 min de inatividade (LGPD)"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.06] text-[11px] font-mono text-slate-600 dark:text-zinc-300 tabular-nums"
            >
              <span className="text-slate-400 text-[10px]">⏱</span>
              <span>{formatTimer(inactivityTimeLeft)}</span>
            </div>

            {/* Menu de Perfil */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.05] border border-transparent hover:border-black/[0.06] dark:hover:border-white/[0.08] transition-all text-xs font-medium"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-slate-300 to-slate-100 dark:from-zinc-700 dark:to-zinc-800 text-slate-900 dark:text-zinc-100 flex items-center justify-center font-bold text-[11px] shadow-xs">
                  {getUserDisplayName().charAt(0)}
                </div>
                <span className="hidden lg:inline font-semibold text-slate-800 dark:text-zinc-200 max-w-[120px] truncate">{getUserDisplayName()}</span>
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
                    className="absolute right-0 mt-3 w-80 rounded-2xl bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-3xl border border-black/[0.08] dark:border-white/[0.1] shadow-2xl p-4 text-xs text-slate-800 dark:text-zinc-200 z-50"
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
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Sessão Segura</span>
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
                                    ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950'
                                    : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.06]'
                                }`}
                              >
                                {r.slice(0, 5)}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="py-2">
                          <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
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
                          className="px-2.5 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-[11px] font-semibold"
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
                        className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-semibold transition-all"
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

      <div className="h-16 sm:h-20" aria-hidden="true" />
    </>
  );
}
