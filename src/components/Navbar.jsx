'use client';

import { getAudioConfig, setAudioConfig, playNotificationTone } from '@/lib/audioNotifications';

import React, { useState, useEffect, useRef } from 'react';
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
      id: 'canais', 
      label: 'Canais', 
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
          <circle cx="12" cy="12" r="2"/>
          <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
        </svg>
      ) 
    },
    { 
      id: 'servidores', 
      label: 'Servidores', 
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
          <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
        </svg>
      ) 
    },
    { 
      id: 'auditoria', 
      label: 'Auditoria LGPD', 
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
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
            {/* DYNAMIC ISLAND DA APPLE COM TRANSIÇÃO EXPANSÍVEL E SUPORTE A MÚLTIPLOS CHAMADOS */}
            {/* ============================================================================== */}
            {totalAtivos > 0 && (
              <div className="relative">
                <motion.div
                  layoutId="apple-dynamic-island"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  className="cursor-pointer"
                  onClick={() => setIslandExpanded(!islandExpanded)}
                >
                  {/* Cenário com 1 Chamado Adaptado a Tema */}
                  {totalAtivos === 1 && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 dark:bg-[#16161a]/95 border border-black/[0.08] dark:border-white/[0.12] text-[11px] font-semibold text-[#1d1d1f] dark:text-white shadow-xs hover:border-black/[0.15] dark:hover:border-white/[0.2] transition-all">
                      <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] animate-ping"></span>
                      <strong className="truncate max-w-[120px] sm:max-w-[150px]">
                        {chamadosAtivos[0].empresa_nome}
                      </strong>
                      <span className="font-mono font-bold text-[#4d7c0f] dark:text-[#84cc16] tabular-nums">
                        {formatarTempo(chamadosAtivos[0].iniciado_em)}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-0.5">▼</span>
                    </div>
                  )}

                  {/* Cenário com 2 Chamados (Lado a Lado Compacto) */}
                  {totalAtivos === 2 && (
                    <div className="flex items-center gap-1.5">
                      {chamadosAtivos.map((ch) => (
                        <div
                          key={ch.id}
                          className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 text-[10px] font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-500/25 transition-all"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                          <span className="truncate max-w-[75px] sm:max-w-[110px]">{ch.empresa_nome}</span>
                          <span className="font-mono font-bold text-[#4d7c0f] dark:text-[#84cc16] tabular-nums">
                            {formatarTempo(ch.iniciado_em)}
                          </span>
                        </div>
                      ))}
                      <span className="text-[10px] text-amber-700 dark:text-amber-300">▼</span>
                    </div>
                  )}

                  {/* Cenário com 3 ou mais Chamados */}
                  {totalAtivos >= 3 && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/40 text-[11px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-500/25 transition-all shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                      <span>{totalAtivos} Suportes Ativos</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        ({formatarTempo(chamadosAtivos[0].iniciado_em)})
                      </span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-300">▼</span>
                    </div>
                  )}
                </motion.div>

                {/* MODAL EXPANDIDO DA DYNAMIC ISLAND (ESTILO APPLE CAPSULE) */}
                <AnimatePresence>
                  {islandExpanded && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.94 }}
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      className="absolute left-0 mt-3 w-[330px] sm:w-[380px] rounded-[30px] bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-3xl text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.12] p-5 shadow-2xl z-50 space-y-3.5"
                    >
                      {/* Topo da Ilha */}
                      <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="text-xs font-bold tracking-tight">Ilha Dinâmica de Suporte</span>
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                            {totalAtivos} {totalAtivos === 1 ? 'chamado ativo' : 'chamados ativos'}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIslandExpanded(false);
                          }}
                          className="text-slate-400 hover:text-black dark:hover:text-white text-xs font-bold p-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Lista de Chamados com Ações Diretas */}
                      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                        {chamadosAtivos.map((ch) => (
                          <div
                            key={ch.id}
                            className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12] transition-all space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-white truncate max-w-[200px]">
                                  {ch.empresa_nome}
                                </h4>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  Técnico: {ch.tecnico_email}
                                </p>
                              </div>

                              <div className="text-right font-mono">
                                <span className="text-xs font-bold text-emerald-400 tabular-nums">
                                  {formatarTempo(ch.iniciado_em)}
                                </span>
                              </div>
                            </div>

                            {/* Botões de Ação Rápida */}
                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                onClick={() => {
                                  setIslandExpanded(false);
                                  onOpenChamadoAtivo && onOpenChamadoAtivo(ch.empresa_id);
                                }}
                                className="flex-1 py-1.5 px-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] text-[10px] font-semibold text-slate-700 dark:text-zinc-200 transition-all text-center"
                              >
                                Abrir Empresa
                              </button>

                              <button
                                onClick={() => {
                                  setIslandExpanded(false);
                                  window.dispatchEvent(new CustomEvent('abrir_conclusao_chamado', { detail: ch }));
                                }}
                                className="py-1.5 px-3 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[10px] font-bold transition-all"
                              >
                                Concluir
                              </button>

                              <button
                                onClick={async () => {
                                  if (confirm(`Deseja cancelar o suporte de ${ch.empresa_nome}?`)) {
                                    await cancelarSuporte({ chamado_id: ch.id, userEmail });
                                  }
                                }}
                                className="py-1.5 px-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-semibold transition-all"
                                title="Cancelar chamado"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ))}
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

                    {/* Controles de Alertas Sonoros de Suporte */}
                    <div className="py-2.5 border-b border-black/[0.05] dark:border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span>🔔</span>
                          <span className="font-semibold text-[11px] text-[#1d1d1f] dark:text-white">
                            Alertas Sonoros de Suporte
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={audioConfig.habilitado}
                          onChange={(e) => setAudioConfig({ habilitado: e.target.checked })}
                          className="w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16] cursor-pointer rounded"
                        />
                      </div>

                      {audioConfig.habilitado && (
                        <div className="space-y-2 pt-1 pl-1">
                          
                          {/* Escopo do Alerta */}
                          <div>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mb-1">
                              Tocar quando chegar chamado:
                            </span>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                              <button
                                type="button"
                                onClick={() => setAudioConfig({ escopo: 'apenas_meus' })}
                                className={`py-1 px-1.5 rounded-lg font-medium transition-all ${
                                  audioConfig.escopo === 'apenas_meus'
                                    ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold'
                                    : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400'
                                }`}
                              >
                                Só atribuídos a mim
                              </button>
                              <button
                                type="button"
                                onClick={() => setAudioConfig({ escopo: 'todos' })}
                                className={`py-1 px-1.5 rounded-lg font-medium transition-all ${
                                  audioConfig.escopo === 'todos'
                                    ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold'
                                    : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400'
                                }`}
                              >
                                Fila inteira (todos)
                              </button>
                            </div>
                          </div>

                          {/* 4 Tipos de Sons com Botão de Testar */}
                          <div>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mb-1">
                              Toque Sonoro:
                            </span>
                            <div className="space-y-1">
                              {[
                                { id: 'harmonico', label: 'Harmônico Apple (Suave)' },
                                { id: 'dinamico', label: 'Alerta Dinâmico (Radar)' },
                                { id: 'sino', label: 'Sino Suave / Marimba' },
                                { id: 'incisivo', label: 'Incisivo / Alerta Urgente' },
                              ].map((s) => {
                                const isSel = audioConfig.tipoSom === s.id;
                                return (
                                  <div key={s.id} className="flex items-center justify-between gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAudioConfig({ tipoSom: s.id });
                                        playNotificationTone(s.id);
                                      }}
                                      className={`flex-1 text-left px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                                        isSel
                                          ? 'bg-black/[0.06] dark:bg-white/[0.1] font-bold text-[#4d7c0f] dark:text-[#84cc16]'
                                          : 'text-slate-600 dark:text-zinc-400 hover:bg-black/[0.02]'
                                      }`}
                                    >
                                      {isSel ? '✓ ' : ''}{s.label}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => playNotificationTone(s.id)}
                                      className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] text-slate-500"
                                      title="Ouvir som de teste"
                                    >
                                      ▶ Testar
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Repetição: Uma vez, Intermitente ou Intervalo */}
                          <div>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mb-1">
                              Frequência da Notificação:
                            </span>
                            <div className="grid grid-cols-3 gap-1 text-[10px]">
                              {[
                                { id: 'uma_vez', label: 'Tocar 1x' },
                                { id: 'intermitente', label: 'Em loop' },
                                { id: 'intervalo', label: 'Intervalo' },
                              ].map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setAudioConfig({ modoRepeticao: m.id })}
                                  className={`py-1 px-1 rounded-lg text-center font-medium transition-all ${
                                    audioConfig.modoRepeticao === m.id
                                      ? 'bg-black text-white dark:bg-white dark:text-black font-bold'
                                      : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400'
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>

                            {audioConfig.modoRepeticao === 'intervalo' && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="text-[10px] text-slate-400">Repetir a cada:</span>
                                {[15, 30, 60].map((sec) => (
                                  <button
                                    key={sec}
                                    type="button"
                                    onClick={() => setAudioConfig({ intervaloSegundos: sec })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                      audioConfig.intervaloSegundos === sec
                                        ? 'bg-[#4d7c0f] text-white font-bold'
                                        : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600'
                                    }`}
                                  >
                                    {sec}s
                                  </button>
                                ))}
                                <input
                                  type="number"
                                  min="5"
                                  max="300"
                                  value={audioConfig.intervaloSegundos}
                                  onChange={(e) => setAudioConfig({ intervaloSegundos: parseInt(e.target.value || '30', 10) })}
                                  className="w-12 px-1.5 py-0.5 rounded border border-black/10 dark:border-white/10 text-[10px] font-mono text-center focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-400">seg</span>
                              </div>
                            )}
                          </div>

                        </div>
                      )}
                    </div>

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
