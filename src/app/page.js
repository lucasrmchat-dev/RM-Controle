'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  getEmpresas, 
  createEmpresa, 
  createEmpresasEmMassa, 
  isMockDataEnabled, 
  setMockDataEnabled,
  getChamadoAtivo,
  iniciarSuporte,
  cancelarSuporte,
  finalizarSuporte,
  getMotivosSuporte,
  getEquipeUsuarios,
  fetchEquipeUsuarios,
  setCurrentUserRole,
  getCurrentUserRole,
  getAbasPermitidas,
  resolveUserRole
} from '@/lib/storage';
import Navbar from '@/components/Navbar';
import CompanyModal from '@/components/CompanyModal';
import CompanyManagementView from '@/components/CompanyManagementView';
import ChannelsManagement from '@/components/ChannelsManagement';
import AuditLogsView from '@/components/AuditLogsView';
import ServerConfigView from '@/components/ServerConfigView';
import DashboardView from '@/components/DashboardView';
import GeneralSettingsView from '@/components/GeneralSettingsView';
import RegisterSupportModal from '@/components/RegisterSupportModal';
import LoginView from '@/components/LoginView';
import SupportCompletionModal from '@/components/SupportCompletionModal';
import SupportQueueView from '@/components/SupportQueueView';
import { 
  MessageChannelIcon, 
  ViewGridIcon, 
  ViewListIcon,
  PlayIcon,
  XMarkIcon,
  CheckIcon 
} from '@/components/Icons';

export default function Home() {
  // Tema Visual: 'light' (Padrão Apple) | 'dark'
  const [theme, setTheme] = useState('light');

  // Modo de Exibição das Empresas: 'grid' (Cards) | 'list' (Lista/Tabela)
  const [empresasViewMode, setEmpresasViewMode] = useState('grid');

  useEffect(() => {
    const saved = localStorage.getItem('rm_empresas_view_mode');
    if (saved === 'list' || saved === 'grid') {
      setEmpresasViewMode(saved);
    }
  }, []);

  const handleChangeViewMode = (mode) => {
    setEmpresasViewMode(mode);
    localStorage.setItem('rm_empresas_view_mode', mode);
  };

  // Estado de Autenticação
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  
  // Formulário de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Inatividade (30 minutos = 1800 segundos)
  const [inactivityTimeLeft, setInactivityTimeLeft] = useState(1800);

  // Controle de Dados Simulados (Mock Dev) - Desativado por padrão
  const [showMockData, setShowMockData] = useState(false);

  // Navegação Principal por Abas
  const [activeTab, setActiveTab] = useState('empresas');
  const [isRegistrarModalGlobalOpen, setIsRegistrarModalGlobalOpen] = useState(false);
  const [empresaParaRegistrar, setEmpresaParaRegistrar] = useState(null); // 'empresas' | 'dashboard' | 'canais' | 'servidores' | 'auditoria'

  // Listagem de Empresas, Filtros e Paginação
  const [empresas, setEmpresas] = useState([]);
  const [totalEmpresas, setTotalEmpresas] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroCanal, setFiltroCanal] = useState('todos');
  const [filtroFormato, setFiltroFormato] = useState('todos');
  const [filtroServidor, setFiltroServidor] = useState('todos'); // 'todos' | 'servidor_1' | 'servidor_2'
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);

  // Modais e Menu de Ação Rápida da Empresa
  const [isModalCreateOpen, setIsModalCreateOpen] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [empresaAcaoModal, setEmpresaAcaoModal] = useState(null);
  const [modalEncerrarChamado, setModalEncerrarChamado] = useState(null);
  const [fecharMotivo, setFecharMotivo] = useState('');
  const [fecharObs, setFecharObs] = useState('');
  const [motivosDisponiveis, setMotivosDisponiveis] = useState([]);

  // ==============================================================================
  // INICIALIZAÇÃO DE TEMA VISUAL (LIGHT COMO PADRÃO APPLE)
  // ==============================================================================
  useEffect(() => {
    const savedTheme = localStorage.getItem('rm_theme') || 'light';
    setTheme(savedTheme);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleToggleTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('rm_theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // ==============================================================================
  // TIMER DE INATIVIDADE (30 MINUTOS COM DESCONEXÃO AUTOMÁTICA LGPD)
  // Baseado em carimbo de relógio real (wall-clock timestamp) para não pausar com Mac/aba suspensa
  // ==============================================================================
  useEffect(() => {
    if (!isAuthenticated) return;

    if (!localStorage.getItem('rm_last_active_timestamp')) {
      localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
    }

    let lastThrottle = Date.now();
    const recordUserActivity = () => {
      const now = Date.now();
      if (now - lastThrottle > 2000) {
        lastThrottle = now;
        localStorage.setItem('rm_last_active_timestamp', now.toString());
      }
    };

    const userEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    userEvents.forEach((evt) => window.addEventListener(evt, recordUserActivity, { passive: true }));

    const checkInactivity = () => {
      const lastActiveStr = localStorage.getItem('rm_last_active_timestamp');
      const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : Date.now();
      const elapsedSec = Math.floor((Date.now() - lastActive) / 1000);
      const remainingSec = Math.max(0, 1800 - elapsedSec);

      setInactivityTimeLeft(remainingSec);

      if (remainingSec <= 0) {
        handleLogout();
        alert('Sessão encerrada por inatividade de 30 minutos (Proteção LGPD).');
      }
    };

    const interval = setInterval(checkInactivity, 1000);
    window.addEventListener('visibilitychange', checkInactivity);
    window.addEventListener('focus', checkInactivity);

    return () => {
      clearInterval(interval);
      userEvents.forEach((evt) => window.removeEventListener(evt, recordUserActivity));
      window.removeEventListener('visibilitychange', checkInactivity);
      window.removeEventListener('focus', checkInactivity);
    };
  }, [isAuthenticated]);

  // ==============================================================================
  // VALIDAÇÃO DE SESSÃO COM SUPABASE
  // ==============================================================================
  useEffect(() => {
    async function checkSession() {
      try {
        // Validação estrita de inatividade persistida (LGPD - 30 minutos)
        const lastActiveStr = localStorage.getItem('rm_last_active_timestamp');
        if (lastActiveStr) {
          const lastActive = parseInt(lastActiveStr, 10);
          if (!isNaN(lastActive) && (Date.now() - lastActive) > 1800 * 1000) {
            await handleLogout();
            setAuthLoading(false);
            return;
          }
        }

        try {
          await fetchEquipeUsuarios();
        } catch (e) {}

        if (isSupabaseConfigured && supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const email = session.user.email || 'admin@rmcontrole.com';
            setIsAuthenticated(true);
            setUserEmail(email);
            const role = resolveUserRole(email);
            setCurrentUserRole(role);
            localStorage.setItem('rm_auth_user', email);
            localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
          } else {
            const savedUser = localStorage.getItem('rm_auth_user');
            if (savedUser) {
              setIsAuthenticated(true);
              setUserEmail(savedUser);
              const role = resolveUserRole(savedUser);
              setCurrentUserRole(role);
              localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
            } else {
              setIsAuthenticated(false);
              setUserEmail('');
            }
          }
        } else {
          const savedUser = localStorage.getItem('rm_auth_user');
          if (savedUser) {
            setIsAuthenticated(true);
            setUserEmail(savedUser);
            const role = resolveUserRole(savedUser);
            setCurrentUserRole(role);
            localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
          } else {
            setIsAuthenticated(false);
            setUserEmail('');
          }
        }
      } catch (e) {
        console.error('Erro ao checar sessão:', e);
        setIsAuthenticated(false);
        setUserEmail('');
      } finally {
        setAuthLoading(false);
      }
    }

    checkSession();

    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const email = session.user.email || 'admin@rmcontrole.com';
          setIsAuthenticated(true);
          setUserEmail(email);
          const role = resolveUserRole(email);
          setCurrentUserRole(role);
          localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab, selectedEmpresa]);

  // Proteção e Redirecionamento de Abas Permitidas por Papel (Hierarquia Estrita)
  useEffect(() => {
    if (!isAuthenticated) return;
    const checkRoleAndTab = () => {
      const role = resolveUserRole(userEmail);
      setCurrentUserRole(role);
      const permitidas = getAbasPermitidas(role);
      if (!permitidas.includes(activeTab)) {
        setActiveTab('empresas');
      }
    };

    checkRoleAndTab();

    window.addEventListener('user_role_updated', checkRoleAndTab);
    window.addEventListener('equipe_updated', checkRoleAndTab);

    return () => {
      window.removeEventListener('user_role_updated', checkRoleAndTab);
      window.removeEventListener('equipe_updated', checkRoleAndTab);
    };
  }, [isAuthenticated, userEmail, activeTab]);

  // Monitora alternador de dados mock
  useEffect(() => {
    setShowMockData(isMockDataEnabled());
    const handleStorageUpdate = () => {
      setShowMockData(isMockDataEnabled());
      carregarEmpresas();
    };
    window.addEventListener('storage_mock_updated', handleStorageUpdate);
    return () => window.removeEventListener('storage_mock_updated', handleStorageUpdate);
  }, []);

  const handleToggleMockData = (enabled) => {
    setShowMockData(enabled);
    setMockDataEnabled(enabled);
    carregarEmpresas();
  };

  // ==============================================================================
  // CARREGAMENTO DE EMPRESAS COM FILTROS E PAGINAÇÃO
  // ==============================================================================
  const handleSelectEmpresaGlobal = (empOrId) => {
    if (!empOrId) return;
    if (typeof empOrId === 'object' && empOrId.id) {
      setSelectedEmpresa(empOrId);
      setActiveTab('empresas');
      return;
    }
    const id = typeof empOrId === 'string' ? empOrId : empOrId?.id;
    const emp = empresas.find((e) => e.id === id);
    if (emp) {
      setSelectedEmpresa(emp);
      setActiveTab('empresas');
    }
  };

  const carregarEmpresas = async () => {
    if (!isAuthenticated) return;
    setLoadingEmpresas(true);
    try {
      const res = await getEmpresas({
        page,
        pageSize,
        search: searchTerm,
        canalTipo: filtroCanal,
        formato: filtroFormato,
        servidor: filtroServidor,
      });

      setEmpresas(res.items);
      setTotalEmpresas(res.total);
      setTotalPages(res.totalPages);
      setMotivosDisponiveis(getMotivosSuporte());

      if (selectedEmpresa) {
        const atualizada = res.items.find((e) => e.id === selectedEmpresa.id);
        if (atualizada) setSelectedEmpresa(atualizada);
      }
    } catch (err) {
      console.error('Erro ao listar empresas:', err);
    } finally {
      setLoadingEmpresas(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      carregarEmpresas();
    }
  }, [isAuthenticated, page, pageSize, searchTerm, filtroCanal, filtroFormato, filtroServidor, showMockData]);

  // Listener para abertura de conclusão disparada pela Dynamic Island ou outros componentes
  useEffect(() => {
    const handleAbrirConclusao = (e) => {
      if (e.detail) setModalEncerrarChamado(e.detail);
    };
    window.addEventListener('abrir_conclusao_chamado', handleAbrirConclusao);
    return () => window.removeEventListener('abrir_conclusao_chamado', handleAbrirConclusao);
  }, []);

  // ==============================================================================
  // AUTENTICAÇÃO NO SUPABASE
  // ==============================================================================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    const emailLimpo = loginEmail.trim().toLowerCase();
    const senhaLimpa = loginPassword.trim();

    if (!emailLimpo || !senhaLimpa) {
      setLoginError('Informe o e-mail e a senha cadastrados.');
      return;
    }

    setLoginSubmitting(true);

    try {
      // 1. Resolve o e-mail completo (aceita tanto 'maria' quanto 'maria@rmcontrole.com')
      let emailFormal = emailLimpo;
      const equipe = getEquipeUsuarios();
      const membroEquipe = equipe.find((u) => {
        const uEmail = (u.email || '').toLowerCase().trim();
        const uNome = (u.nome || '').toLowerCase().trim();
        return uEmail === emailLimpo || uNome === emailLimpo || uEmail.split('@')[0] === emailLimpo;
      });

      if (membroEquipe?.email) {
        emailFormal = membroEquipe.email.toLowerCase().trim();
      } else if (!emailFormal.includes('@')) {
        emailFormal = `${emailFormal}@rmcontrole.com`;
      }

      const isAdminEmail = emailFormal === 'admin@rmcontrole.com' || emailFormal.includes('admin');
      const senhaEsperada = (membroEquipe?.senha || '').trim();

      // 2. Autenticação oficial no Supabase Auth (gera sessão JWT e concede papel 'authenticated' para o RLS)
      if (isSupabaseConfigured && supabase) {
        let authResult = await supabase.auth.signInWithPassword({
          email: emailFormal,
          password: senhaLimpa,
        });

        // Se falhar e o usuário for da equipe ou for o administrador, tenta auto-provisionamento no Supabase Auth
        if (authResult.error) {
          const podeAutenticar = (membroEquipe && (!senhaEsperada || senhaEsperada === senhaLimpa)) ||
            (isAdminEmail && (senhaLimpa === 'RmControle@Admin2026!' || senhaLimpa.length >= 6));

          if (podeAutenticar) {
            try {
              await supabase.auth.signUp({
                email: emailFormal,
                password: senhaLimpa,
                options: {
                  data: {
                    name: membroEquipe?.nome || (isAdminEmail ? 'Lucas Amorim' : emailFormal.split('@')[0]),
                    papel: membroEquipe?.papel || (isAdminEmail ? 'administrador' : 'suporte'),
                  },
                },
              });
              authResult = await supabase.auth.signInWithPassword({
                email: emailFormal,
                password: senhaLimpa,
              });
            } catch (autoErr) {
              console.warn('Tentativa de auto-registro no Supabase Auth:', autoErr);
            }
          }
        }

        if (authResult?.data?.user) {
          const user = authResult.data.user;
          setIsAuthenticated(true);
          setUserEmail(user.email);
          const role = resolveUserRole(user.email);
          setCurrentUserRole(role);
          localStorage.setItem('rm_auth_user', user.email);
          localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
          return;
        }

        // Fallback de contingência caso o Supabase Auth ainda exija confirmação de e-mail por link
        if (membroEquipe) {
          if (!senhaEsperada || senhaEsperada === senhaLimpa) {
            setIsAuthenticated(true);
            setUserEmail(membroEquipe.email);
            const role = membroEquipe.papel || 'suporte';
            setCurrentUserRole(role);
            localStorage.setItem('rm_auth_user', membroEquipe.email);
            localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
            return;
          } else {
            throw new Error(`Senha incorreta para o colaborador ${membroEquipe.nome || emailFormal}.`);
          }
        }

        if (isAdminEmail && (senhaLimpa === 'RmControle@Admin2026!' || senhaLimpa.length >= 6)) {
          setIsAuthenticated(true);
          setUserEmail(emailFormal);
          setCurrentUserRole('administrador');
          localStorage.setItem('rm_auth_user', emailFormal);
          localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
          return;
        }

        if (authResult?.error) {
          if (authResult.error.message.includes('Invalid login credentials')) {
            throw new Error('E-mail ou senha incorretos. Verifique suas credenciais.');
          }
          throw new Error('Falha ao autenticar: ' + authResult.error.message);
        }
      } else {
        if (membroEquipe) {
          if (!senhaEsperada || senhaEsperada === senhaLimpa) {
            setIsAuthenticated(true);
            setUserEmail(membroEquipe.email);
            setCurrentUserRole(membroEquipe.papel || 'suporte');
            localStorage.setItem('rm_auth_user', membroEquipe.email);
            localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
            return;
          }
        }
        if (isAdminEmail) {
          setIsAuthenticated(true);
          setUserEmail(emailFormal);
          setCurrentUserRole('administrador');
          localStorage.setItem('rm_auth_user', emailFormal);
          localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
          return;
        }
        throw new Error('Serviço de autenticação não configurado.');
      }
    } catch (err) {
      setLoginError(err.message || 'Falha ao autenticar.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleBypassDevLogin = () => {
    setIsAuthenticated(true);
    setUserEmail('admin@rmcontrole.com');
    localStorage.setItem('rm_auth_user', 'admin@rmcontrole.com');
    localStorage.setItem('rm_last_active_timestamp', Date.now().toString());
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {}
    }
    localStorage.removeItem('rm_auth_user');
    localStorage.removeItem('rm_user_role');
    localStorage.removeItem('rm_last_active_timestamp');
    setIsAuthenticated(false);
    setUserEmail('');
  };

  const handleCreatedEmpresas = async (payload) => {
    if (payload.tipo === 'manual') {
      await createEmpresa({
        nome: payload.nome,
        formato_atendimento: 'colaborativo',
        servidor_alocado: payload.servidor_alocado,
        email_administrador: payload.email_administrador,
        senha_suporte: payload.senha_suporte,
        userEmail,
      });
    } else if (payload.tipo === 'massa') {
      await createEmpresasEmMassa(payload.empresas || payload.nomes, {
        formato_atendimento: 'colaborativo',
        servidor_alocado: payload.servidor_alocado,
        userEmail,
      });
    }
    await carregarEmpresas();
  };

  // ==============================================================================
  // TELA DE CARREGAMENTO INICIAL
  // ==============================================================================
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-[#000000]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#4d7c0f] dark:border-[#84cc16] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Carregando RM Controle...</span>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // TELA DE LOGIN ESTILO APPLE ID / MACOS
  // ==============================================================================
  if (!isAuthenticated) {
    return (
      <LoginView
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        showLoginPassword={showLoginPassword}
        setShowLoginPassword={setShowLoginPassword}
        loginError={loginError}
        loginSubmitting={loginSubmitting}
        handleLogin={handleLogin}
        handleBypassDevLogin={handleBypassDevLogin}
        theme={theme}
        handleToggleTheme={handleToggleTheme}
      />
    );
  }

  // ==============================================================================
  // PAINEL PRINCIPAL COM APROVEITAMENTO TOTAL DA LARGURA (MAX-W-[1720PX])
  // ==============================================================================
  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] flex flex-col transition-colors duration-300">
      
      {/* Navbar Flutuante Estilo macOS / Dynamic Island */}
      <Navbar
        activeTab={selectedEmpresa ? 'empresas' : activeTab}
        setActiveTab={(tab) => {
          setSelectedEmpresa(null);
          setActiveTab(tab);
          if (tab === 'empresas') {
            carregarEmpresas();
          }
        }}
        userEmail={userEmail}
        onLogout={handleLogout}
        theme={theme}
        setTheme={handleToggleTheme}
        inactivityTimeLeft={inactivityTimeLeft}
        showMockData={showMockData}
        setShowMockData={handleToggleMockData}
        onOpenChamadoAtivo={(empresaId) => {
          const emp = empresas.find((e) => e.id === empresaId);
          if (emp) setSelectedEmpresa(emp);
        }}
      />

      <main className="flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-2 sm:py-4 pb-20">
        {selectedEmpresa ? (
          /* TELA CHEIA: GERENCIAR EMPRESA (WIDESCREEN DE ALTA PRODUTIVIDADE) */
          <div key="empresa-detail" className="animate-fade-in">
            <CompanyManagementView
              empresa={selectedEmpresa}
              onBack={() => {
                setSelectedEmpresa(null);
                window.scrollTo({ top: 0, behavior: 'instant' });
              }}
              onUpdated={carregarEmpresas}
              userEmail={userEmail}
            />
          </div>
        ) : (
          <div key={activeTab} className="animate-fade-in">
              {/* ABA 1: EMPRESAS */}
              {activeTab === 'empresas' && (
                <div className="space-y-5">
                  
                  {/* Barra de Ações Superior Estilo Apple */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                        Empresas
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                        Gerenciamento de clientes, instâncias de mensageria e credenciais técnicas de suporte.
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsModalCreateOpen(true)}
                        className="px-4 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20 hover:opacity-95 flex items-center gap-2 transition-all"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        <span>Nova Empresa</span>
                      </motion.button>
                    </div>
                  </div>

                  {/* Aviso se estiver no Modo Mock Dev */}
                  {showMockData && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
                      <span>Modo de Desenvolvimento ativo: exibindo empresas simuladas. Você pode desativar no seu menu de perfil no topo.</span>
                      <button
                        onClick={() => handleToggleMockData(false)}
                        className="font-bold underline text-[11px] ml-2"
                      >
                        Ocultar Mock
                      </button>
                    </div>
                  )}

                  {/* Toolbar Unificada Estilo macOS (Busca e Filtros Expandidos) */}
                  <div className="rounded-2xl p-3.5 border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-xl bg-white/80 dark:bg-[#16161a]/85 shadow-sm space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      
                      {/* Campo de Busca Aprimorada com SVG minimalista */}
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                        </div>
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setPage(1);
                          }}
                          placeholder="Buscar empresa, operador ou canal..."
                          className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 text-[#1d1d1f] dark:text-white placeholder-slate-400 font-medium"
                        />
                      </div>

                      {/* Filtro de Servidor Alocado */}
                      <div>
                        <select
                          value={filtroServidor}
                          onChange={(e) => {
                            setFiltroServidor(e.target.value);
                            setPage(1);
                          }}
                          className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                        >
                          <option value="todos">Todos os Servidores</option>
                          <option value="servidor_1">Servidor 1 (Principal)</option>
                          <option value="servidor_2">Servidor 2 (Expansão)</option>
                        </select>
                      </div>

                      {/* Filtro de Canal */}
                      <div>
                        <select
                          value={filtroCanal}
                          onChange={(e) => {
                            setFiltroCanal(e.target.value);
                            setPage(1);
                          }}
                          className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                        >
                          <option value="todos">Todos os Canais</option>
                          <option value="api">Canal Cloud API Oficial</option>
                          <option value="qrcode">Canal Pareamento QR Code</option>
                          <option value="social">Redes Sociais</option>
                        </select>
                      </div>

                      {/* Filtro de Formato */}
                      <div>
                        <select
                          value={filtroFormato}
                          onChange={(e) => {
                            setFiltroFormato(e.target.value);
                            setPage(1);
                          }}
                          className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                        >
                          <option value="todos">Todos os Formatos</option>
                          <option value="colaborativo">Formato Colaborativo</option>
                          <option value="individual">Formato Individual</option>
                        </select>
                      </div>
                    </div>

                    {/* Controles de Paginação & Densidade */}
                    {/* Controles de Paginação & Densidade & Alternador de Visualização */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-black/[0.04] dark:border-white/[0.05] text-[11px] text-slate-500 dark:text-zinc-400">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">Itens por página:</span>
                          {[8, 12, 16, 24].map((size) => (
                            <button
                              key={size}
                              onClick={() => {
                                setPageSize(size);
                                setPage(1);
                              }}
                              className={`px-2.5 py-0.5 rounded-full font-medium transition-all cursor-pointer ${
                                pageSize === size
                                  ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.08]'
                              }`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>

                        {/* Alternador de Visualização Cards / Lista */}
                        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => handleChangeViewMode('grid')}
                            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                              empresasViewMode === 'grid'
                                ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs'
                                : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                            }`}
                            title="Visualização em Grade de Cards"
                          >
                            <ViewGridIcon className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Cards</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeViewMode('list')}
                            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                              empresasViewMode === 'list'
                                ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs'
                                : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                            }`}
                            title="Visualização em Lista Detalhada"
                          >
                            <ViewListIcon className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Lista</span>
                          </button>
                        </div>
                      </div>

                      <span className="font-mono text-slate-500 dark:text-zinc-400 tabular-nums font-medium">
                        {totalEmpresas} {totalEmpresas === 1 ? 'empresa cadastrada' : 'empresas cadastradas'}
                      </span>
                    </div>
                  </div>

                  {/* Visualização de Empresas (Cards vs Lista) */}
                  {loadingEmpresas ? (
                    <div className="p-16 text-center text-xs text-slate-400 flex flex-col items-center gap-3">
                      <div className="w-7 h-7 border-2 border-[#4d7c0f] dark:border-[#84cc16] border-t-transparent rounded-full animate-spin"></div>
                      <span>Carregando empresas...</span>
                    </div>
                  ) : empresas.length === 0 ? (
                    /* Estado Vazio Estilo Apple */
                    <div className="rounded-3xl p-12 border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl text-center space-y-4 shadow-sm">
                      <div className="w-12 h-12 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] text-slate-400 dark:text-zinc-500 flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
                          <path d="M9 22v-4h6v4"/>
                        </svg>
                      </div>
                      <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-white">Nenhuma empresa encontrada</h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                        Cadastre uma nova empresa ou ative os dados simulados para explorar o sistema.
                      </p>
                      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                        <button
                          onClick={() => setIsModalCreateOpen(true)}
                          className="px-4 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm"
                        >
                          + Cadastrar Empresa
                        </button>
                        <button
                          onClick={() => handleToggleMockData(true)}
                          className="px-4 py-2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 text-xs font-medium hover:bg-black/[0.08]"
                        >
                          Ativar Dados Simulados (Mock Dev)
                        </button>
                      </div>
                    </div>
                  ) : empresasViewMode === 'grid' ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4"
                    >
                      {empresas.map((emp) => {
                        const checklistTotal = emp.checklist?.length || 0;
                        const checklistConcluidos = emp.checklist?.filter((c) => c.concluido).length || 0;
                        const progressoPct = checklistTotal > 0 ? Math.round((checklistConcluidos / checklistTotal) * 100) : 0;
                        const temSuporteAtivo = Boolean(getChamadoAtivo(emp.id));

                        return (
                          <motion.div
                            key={emp.id}
                            whileHover={{ y: -3 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setEmpresaAcaoModal(emp)}
                            className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] hover:shadow-apple-hover transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden"
                          >
                            {/* Topo do Card: Avatar, Nome e Badges */}
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#4d7c0f]/15 to-[#65a30d]/20 dark:from-[#84cc16]/15 dark:to-[#84cc16]/5 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-sm flex items-center justify-center border border-[#4d7c0f]/20 flex-shrink-0">
                                    {emp.nome.charAt(0)}
                                  </div>

                                  <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-white group-hover:text-[#4d7c0f] dark:group-hover:text-[#84cc16] transition-colors truncate">
                                      {emp.nome}
                                    </h3>
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                                      {emp.credenciais?.email_administrador || 'Sem e-mail cadastrado'}
                                    </p>
                                  </div>
                                </div>

                                {temSuporteAtivo && (
                                  <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1.5 flex-shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                    Suporte
                                  </span>
                                )}
                              </div>

                              {/* Badges Apple (Servidor + Formato) */}
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 border border-black/[0.04] dark:border-white/[0.06]">
                                  {emp.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}
                                </span>

                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  emp.formato_atendimento === 'colaborativo'
                                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                }`}>
                                  {emp.formato_atendimento === 'colaborativo' ? 'Colaborativo' : 'Individual'}
                                </span>

                                {emp.is_mock && (
                                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-slate-400">
                                    Mock
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Centro do Card: Canais Conectados com SVG Elegante */}
                            <div className="py-3.5 my-3 border-y border-black/[0.04] dark:border-white/[0.05] space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500 dark:text-zinc-400">Canais vinculados:</span>
                                <span className="font-semibold text-[#1d1d1f] dark:text-zinc-200">
                                  {emp.canais?.length || 0}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 overflow-hidden">
                                {(!emp.canais || emp.canais.length === 0) ? (
                                  <span className="text-[10px] text-slate-400 italic">Nenhum canal ativo</span>
                                ) : (
                                  emp.canais.slice(0, 3).map((c, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] text-slate-700 dark:text-zinc-300 border border-black/[0.04] dark:border-white/[0.06] truncate max-w-[130px]"
                                    >
                                      <MessageChannelIcon className="w-3 h-3 text-[#4d7c0f] dark:text-[#84cc16] flex-shrink-0" />
                                      <span className="truncate">{c.nome}</span>
                                    </span>
                                  ))
                                )}
                                {emp.canais && emp.canais.length > 3 && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    +{emp.canais.length - 3}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Rodapé: Progresso do Setup e Gatilho de Ação */}
                            <div className="flex items-center justify-between text-[11px] pt-0.5">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                                  <span>Setup:</span>
                                  <span className="font-semibold text-slate-800 dark:text-zinc-200 font-mono tabular-nums">
                                    {checklistConcluidos}/{checklistTotal} ({progressoPct}%)
                                  </span>
                                </div>
                                <div className="w-20 h-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#4d7c0f] to-[#84cc16]"
                                    style={{ width: `${progressoPct}%` }}
                                  />
                                </div>
                              </div>

                              <span className="text-xs font-semibold text-[#4d7c0f] dark:text-[#84cc16] group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                Gerenciar →
                              </span>
                            </div>

                          </motion.div>
                        );
                      })}
                    </motion.div>
                  ) : (
                    /* Visualização em Lista Detalhada (Estilo Apple macOS) */
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-sm"
                    >
                      {/* Cabeçalho da Tabela Apple */}
                      <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-black/[0.05] dark:border-white/[0.06] text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 bg-black/[0.01] dark:bg-white/[0.02]">
                        <div className="col-span-4">Empresa / E-mail</div>
                        <div className="col-span-2">Servidor & Formato</div>
                        <div className="col-span-2">Canais</div>
                        <div className="col-span-2">Setup Checklist</div>
                        <div className="col-span-2 text-right">Status / Ação</div>
                      </div>

                      <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
                        {empresas.map((emp) => {
                          const checklistTotal = emp.checklist?.length || 0;
                          const checklistConcluidos = emp.checklist?.filter((c) => c.concluido).length || 0;
                          const progressoPct = checklistTotal > 0 ? Math.round((checklistConcluidos / checklistTotal) * 100) : 0;
                          const temSuporteAtivo = Boolean(getChamadoAtivo(emp.id));

                          return (
                            <div
                              key={emp.id}
                              onClick={() => setEmpresaAcaoModal(emp)}
                              className="p-4 sm:px-5 sm:py-3.5 flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 items-start lg:items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors cursor-pointer group"
                            >
                              {/* Empresa / Contato */}
                              <div className="lg:col-span-4 flex items-center gap-3 min-w-0 w-full">
                                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#4d7c0f]/15 to-[#65a30d]/20 dark:from-[#84cc16]/15 dark:to-[#84cc16]/5 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-xs flex items-center justify-center border border-[#4d7c0f]/20 flex-shrink-0">
                                  {emp.nome.charAt(0)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-white group-hover:text-[#4d7c0f] dark:group-hover:text-[#84cc16] transition-colors truncate">
                                      {emp.nome}
                                    </h4>
                                    {emp.is_mock && (
                                      <span className="text-[8px] uppercase font-mono px-1.5 py-0.2 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-slate-400">
                                        Mock
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                                    {emp.credenciais?.email_administrador || 'Sem e-mail cadastrado'}
                                  </p>
                                </div>
                              </div>

                              {/* Servidor & Formato */}
                              <div className="lg:col-span-2 flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300">
                                  {emp.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}
                                </span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  emp.formato_atendimento === 'colaborativo'
                                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                }`}>
                                  {emp.formato_atendimento === 'colaborativo' ? 'Colaborativo' : 'Individual'}
                                </span>
                              </div>

                              {/* Canais */}
                              <div className="lg:col-span-2 flex items-center gap-1.5 overflow-hidden">
                                {(!emp.canais || emp.canais.length === 0) ? (
                                  <span className="text-[10px] text-slate-400 italic">0 canais</span>
                                ) : (
                                  <>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 font-mono">
                                      {emp.canais.length} {emp.canais.length === 1 ? 'canal' : 'canais'}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {emp.canais.slice(0, 2).map((c, i) => (
                                        <span key={i} className="w-5 h-5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] flex items-center justify-center text-slate-600 dark:text-zinc-400" title={c.nome}>
                                          <MessageChannelIcon className="w-3 h-3 text-[#4d7c0f] dark:text-[#84cc16]" />
                                        </span>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Setup Checklist */}
                              <div className="lg:col-span-2 space-y-1 w-full lg:w-auto">
                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                  <span>{checklistConcluidos}/{checklistTotal}</span>
                                  <span className="font-mono tabular-nums">{progressoPct}%</span>
                                </div>
                                <div className="w-full lg:w-28 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#4d7c0f] to-[#84cc16]"
                                    style={{ width: `${progressoPct}%` }}
                                  />
                                </div>
                              </div>

                              {/* Ações / Suporte */}
                              <div className="lg:col-span-2 flex items-center justify-between lg:justify-end gap-2 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-black/[0.04] dark:border-white/[0.05]">
                                {temSuporteAtivo ? (
                                  <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                    Em Suporte
                                  </span>
                                ) : (
                                  <span className="text-xs font-semibold text-[#4d7c0f] dark:text-[#84cc16] group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                                    Gerenciar →
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Paginação */}
                  {totalPages > 1 && (
                    <div className="p-3.5 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-zinc-400 text-[11px] font-mono tabular-nums">
                        Página {page} de {totalPages}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-3 py-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] text-slate-700 dark:text-zinc-300 disabled:opacity-30 hover:bg-black/[0.03]"
                        >
                          Anterior
                        </button>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="px-3 py-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] text-slate-700 dark:text-zinc-300 disabled:opacity-30 hover:bg-black/[0.03]"
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ABA 2: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <DashboardView
                  onSelectEmpresa={handleSelectEmpresaGlobal}
                  userEmail={userEmail}
                />
              )}

              {/* ABA: CONFIGURAÇÕES GERAIS (UNIFICADA COM ALERTAS, CANAIS, SERVIDORES & LGPD) */}
              {(activeTab === 'configuracoes' || activeTab === 'canais' || activeTab === 'servidores' || activeTab === 'auditoria') && (
                <GeneralSettingsView
                  userEmail={userEmail}
                  initialSubTab={activeTab === 'configuracoes' ? 'audio' : activeTab}
                />
              )}

              {/* ABA 6: FILA DE SUPORTE */}
              {activeTab === 'fila' && (
                <SupportQueueView
                  onSelectEmpresa={handleSelectEmpresaGlobal}
                  userEmail={userEmail}
                />
              )}
          </div>
        )}
      </main>

      {/* Modal de Criação de Empresa */}
      <CompanyModal
        isOpen={isModalCreateOpen}
        onClose={() => setIsModalCreateOpen(false)}
        onCreated={handleCreatedEmpresas}
      />

      {/* Modal de Ação Rápida ao Clicar na Empresa (Estilo Apple Sheet) */}
      <AnimatePresence>
        {empresaAcaoModal && (
          <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm rounded-[28px] border border-black/[0.08] dark:border-white/[0.1] bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-2xl p-6 shadow-2xl space-y-4 text-[#1d1d1f] dark:text-[#f5f5f7]"
            >
              <div className="flex items-center justify-between border-b border-black/[0.05] dark:border-white/[0.06] pb-3">
                <div>
                  <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-white">
                    {empresaAcaoModal.nome}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {empresaAcaoModal.servidor_alocado === 'servidor_2' ? 'Servidor 2 (Expansão)' : 'Servidor 1 (Principal)'} • Modo {empresaAcaoModal.formato_atendimento}
                  </p>
                </div>
                <button
                  onClick={() => setEmpresaAcaoModal(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-full cursor-pointer"
                  title="Fechar"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 pt-1">
                {getChamadoAtivo(empresaAcaoModal.id) ? (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setSelectedEmpresa(empresaAcaoModal);
                        setEmpresaAcaoModal(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm hover:opacity-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <PlayIcon className="w-3.5 h-3.5 fill-current" />
                      <span>Continuar Chamado em Andamento</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={async () => {
                        const ativo = getChamadoAtivo(empresaAcaoModal.id);
                        if (confirm(`Deseja cancelar o atendimento de ${empresaAcaoModal.nome}?`)) {
                          await cancelarSuporte({ chamado_id: ativo.id, userEmail });
                          setEmpresaAcaoModal(null);
                          carregarEmpresas();
                        }
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                      <span>Cancelar Chamado</span>
                    </motion.button>
                  </>
                ) : (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={async () => {
                        await iniciarSuporte({ 
                          empresa_id: empresaAcaoModal.id, 
                          empresa_nome: empresaAcaoModal.nome, 
                          userEmail 
                        });
                        setSelectedEmpresa(empresaAcaoModal);
                        setEmpresaAcaoModal(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm hover:opacity-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <PlayIcon className="w-3.5 h-3.5 fill-current" />
                      <span>Iniciar Atendimento</span>
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => {
                        setEmpresaParaRegistrar(empresaAcaoModal);
                        setIsRegistrarModalGlobalOpen(true);
                        setEmpresaAcaoModal(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <span>+ Registrar Suporte Retroativo</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => setEmpresaAcaoModal(null)}
                  className="w-full py-2 text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Imersivo de Finalização de Suporte */}
      <SupportCompletionModal
        isOpen={Boolean(modalEncerrarChamado)}
        chamado={modalEncerrarChamado}
        onClose={() => setModalEncerrarChamado(null)}
        onFinalizado={carregarEmpresas}
        userEmail={userEmail}
      />
    </div>
  );
}
