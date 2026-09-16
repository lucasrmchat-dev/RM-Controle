'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  getChamadoAtivo, 
  getAbasPermitidas, 
  getCurrentUserRole, 
  setCurrentUserRole 
} from '@/lib/storage';

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
  const dropdownRef = useRef(null);
  const [chamadoAtivo, setChamadoAtivo] = useState(null);
  const [tempoAtivoSegundos, setTempoAtivoSegundos] = useState(0);
  const [userRole, setUserRole] = useState('administrador');

  // Atualiza chamado ativo e permissões
  const checarEstado = () => {
    const ativo = getChamadoAtivo();
    setChamadoAtivo(ativo);
    setUserRole(getCurrentUserRole());
  };

  useEffect(() => {
    checarEstado();
    const handleUpdate = () => checarEstado();
    window.addEventListener('suporte_updated', handleUpdate);
    window.addEventListener('user_role_updated', handleUpdate);
    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      window.removeEventListener('user_role_updated', handleUpdate);
    };
  }, []);

  // Cronômetro do Suporte no Header
  useEffect(() => {
    if (!chamadoAtivo) {
      setTempoAtivoSegundos(0);
      return;
    }

    const calc = () => {
      const inicio = new Date(chamadoAtivo.iniciado_em).getTime();
      const agora = Date.now();
      setTempoAtivoSegundos(Math.max(0, Math.round((agora - inicio) / 1000)));
    };

    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [chamadoAtivo]);

  const formatarTempo = (totalSegundos) => {
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = totalSegundos % 60;
    return `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  };

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
          <path d="M9 22v-4h6v4"/>
        </svg>
      ) 
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

  // Filtra abas pelas permissões do papel atual
  const abasPermitidasIds = getAbasPermitidas(userRole);
  const abasFiltradas = todasAsAbas.filter((t) => abasPermitidasIds.includes(t.id));

  return (
    <>
      {/* NAVBAR FLUTUANTE ESTILO DYNAMIC ISLAND */}
      <header className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-40 transition-all duration-300">
        <div className="floating-island rounded-full px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 shadow-xl border border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95">
          
          {/* Logo & Indicador de Chamado Ativo */}
          <div className="flex items-center gap-2 pl-1 flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 flex items-center justify-center font-bold text-xs">
              RM
            </div>
            
            {/* Pill de Suporte Ativo em Tempo Real */}
            {chamadoAtivo && (
              <button
                onClick={() => onOpenChamadoAtivo && onOpenChamadoAtivo(chamadoAtivo.empresa_id)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition-all"
                title="Clique para abrir o atendimento desta empresa"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                <span>Suporte: {chamadoAtivo.empresa_nome}</span>
                <span className="font-mono text-[#4d7c0f] dark:text-[#84cc16]">({formatarTempo(tempoAtivoSegundos)})</span>
              </button>
            )}
          </div>

          {/* Abas Dinâmicas Baseadas em Permissão */}
          <nav className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-zinc-950/80 rounded-full border border-slate-200/80 dark:border-zinc-800">
            {abasFiltradas.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 sm:px-3.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white font-bold shadow-sm shadow-slate-950/5'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span className={isActive ? 'text-[#4d7c0f] dark:text-[#84cc16]' : 'text-slate-500 dark:text-zinc-500'}>
                    {tab.icon}
                  </span>
                  <span className="hidden xs:inline sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Timer de Inatividade + Menu Perfil */}
          <div className="flex items-center gap-2 pr-1">
            
            {/* Timer de 30 minutos */}
            <div 
              title="Desconexão automática após 30 min de inatividade (LGPD)"
              className="hidden xs:flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/60 text-[11px] font-mono text-slate-600 dark:text-zinc-300"
            >
              <span>⏱</span>
              <span>{formatTimer(inactivityTimeLeft)}</span>
            </div>

            {/* Perfil & Configurações */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 border border-transparent hover:border-slate-200 dark:hover:border-zinc-700 transition-all text-xs font-medium"
              >
                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 flex items-center justify-center font-bold text-[11px]">
                  {getUserDisplayName().charAt(0)}
                </div>
                <span className="hidden md:inline font-bold text-slate-800 dark:text-zinc-200 max-w-[100px] truncate">{getUserDisplayName()}</span>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-3 w-80 rounded-2xl bg-white dark:bg-[#121216] border border-slate-200 dark:border-zinc-800 shadow-2xl p-4 text-xs text-slate-800 dark:text-zinc-200 animate-fade-in z-50">
                  
                  {/* Dados do Usuário */}
                  <div className="pb-3 border-b border-slate-100 dark:border-zinc-800 mb-3 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-white text-xs">
                      {getUserDisplayName()}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                      {userEmail}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                        Papel: {userRole}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium">Sessão Segura</span>
                    </div>
                  </div>

                  {/* Controles exclusivos do Administrador Principal (Lucas Amorim) */}
                  {((userEmail || '').toLowerCase() === 'admin@rmcontrole.com' || (userEmail || '').toLowerCase().includes('admin')) && (
                    <>
                      {/* Seletor Rápido de Papel (Permissões de Abas) */}
                      <div className="py-2 border-b border-slate-100 dark:border-zinc-800 space-y-1.5">
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 block">
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
                              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                userRole === r
                                  ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950'
                                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                              }`}
                            >
                              {r.slice(0, 5)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Configuração: Habilitar/Desabilitar Mock Dev */}
                      <div className="py-2">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-semibold text-slate-800 dark:text-zinc-200 text-[11px]">
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

                  {/* Configuração de Tema (Disponível para todos os usuários) */}
                  <div className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-zinc-400 font-medium">Tema Visual</span>
                      <button
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-[11px] font-semibold"
                      >
                        {theme === 'light' ? 'Modo Claro' : 'Modo Escuro'}
                      </button>
                    </div>
                  </div>

                  {/* Sair */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        onLogout();
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold transition-all"
                    >
                      Sair do Sistema
                    </button>
                  </div>

                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      <div className="h-20 sm:h-24"></div>
    </>
  );
}
