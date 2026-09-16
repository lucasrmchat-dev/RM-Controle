'use client';

import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  getEmpresas, 
  createEmpresa, 
  createEmpresasEmMassa, 
  isMockDataEnabled, 
  setMockDataEnabled,
  getChamadoAtivo,
  iniciarSuporte,
  finalizarSuporte,
  getMotivosSuporte
} from '@/lib/storage';
import Navbar from '@/components/Navbar';
import CompanyModal from '@/components/CompanyModal';
import CompanyManagementView from '@/components/CompanyManagementView';
import ChannelsManagement from '@/components/ChannelsManagement';
import AuditLogsView from '@/components/AuditLogsView';
import ServerConfigView from '@/components/ServerConfigView';
import DashboardView from '@/components/DashboardView';
import { WhatsAppIcon } from '@/components/Icons';

export default function Home() {
  // Tema Visual: 'light' (Padrão) | 'dark'
  const [theme, setTheme] = useState('light');

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
  const [activeTab, setActiveTab] = useState('empresas'); // 'empresas' | 'canais' | 'servidores' | 'auditoria'

  // Listagem de Empresas, Filtros e Paginação
  const [empresas, setEmpresas] = useState([]);
  const [totalEmpresas, setTotalEmpresas] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
  const [motivoEncerramento, setMotivoEncerramento] = useState('');
  const [obsEncerramento, setObsEncerramento] = useState('');
  const [motivosDisponiveis, setMotivosDisponiveis] = useState([]);

  // ==============================================================================
  // INICIALIZAÇÃO DE TEMA VISUAL (LIGHT COMO PADRÃO)
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
  // ==============================================================================
  useEffect(() => {
    if (!isAuthenticated) return;

    let timer = 1800;
    const resetTimer = () => {
      timer = 1800;
      setInactivityTimeLeft(1800);
    };

    const userEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    userEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    const interval = setInterval(() => {
      timer -= 1;
      setInactivityTimeLeft(timer);

      if (timer <= 0) {
        clearInterval(interval);
        handleLogout();
        alert('Sessão encerrada por inatividade de 30 minutos (Proteção LGPD).');
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      userEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [isAuthenticated]);

  // ==============================================================================
  // VALIDAÇÃO DE SESSÃO COM SUPABASE
  // ==============================================================================
  useEffect(() => {
    async function checkSession() {
      try {
        if (isSupabaseConfigured && supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setIsAuthenticated(true);
            setUserEmail(session.user.email || 'admin@rmcontrole.com');
          } else {
            const localUser = localStorage.getItem('rm_auth_user');
            if (localUser) {
              setIsAuthenticated(true);
              setUserEmail(localUser);
            }
          }
        } else {
          const localUser = localStorage.getItem('rm_auth_user');
          if (localUser) {
            setIsAuthenticated(true);
            setUserEmail(localUser);
          }
        }
      } catch (e) {
        console.error('Erro ao checar sessão:', e);
      } finally {
        setAuthLoading(false);
      }
    }

    checkSession();

    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setIsAuthenticated(true);
          setUserEmail(session.user.email || 'admin@rmcontrole.com');
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

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

  // ==============================================================================
  // AUTENTICAÇÃO NO SUPABASE
  // ==============================================================================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Informe o e-mail e a senha cadastrados.');
      return;
    }

    setLoginSubmitting(true);

    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('E-mail ou senha incorretos. Verifique suas credenciais no Supabase.');
          }
          if (error.message.includes('Database error querying schema')) {
            throw new Error("Erro no Supabase: o usuário possui campos nulos decorrentes de inserção SQL manual. No painel do Supabase, delete o usuário e crie-o pelo botão 'Add User' (ou use o botão de contingência abaixo).");
          }
          throw error;
        }

        if (data?.user) {
          setIsAuthenticated(true);
          setUserEmail(data.user.email);
          localStorage.setItem('rm_auth_user', data.user.email);
          return;
        }
      }

      // Fallback local caso Supabase não esteja conectado
      if (loginEmail.includes('@') && loginPassword.length >= 4) {
        setIsAuthenticated(true);
        setUserEmail(loginEmail.trim());
        localStorage.setItem('rm_auth_user', loginEmail.trim());
      } else {
        throw new Error('Credenciais inválidas.');
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
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {}
    }
    localStorage.removeItem('rm_auth_user');
    setIsAuthenticated(false);
    setUserEmail('');
  };

  const handleCreatedEmpresas = async (payload) => {
    if (payload.tipo === 'manual') {
      await createEmpresa({
        nome: payload.nome,
        formato_atendimento: payload.formato_atendimento,
        email_administrador: payload.email_administrador,
        senha_suporte: payload.senha_suporte,
        userEmail,
      });
    } else if (payload.tipo === 'massa') {
      await createEmpresasEmMassa(payload.nomes, {
        formato_atendimento: payload.formato_atendimento,
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#09090b]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#4d7c0f] dark:border-[#84cc16] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Carregando RM Controle...</span>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // TELA DE LOGIN (TEMA CLARO COMO PADRÃO, SEM CARA DE IA)
  // ==============================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 transition-colors duration-200">
        
        {/* Alternador de tema discreto no canto superior */}
        <div className="fixed top-5 right-5">
          <button
            onClick={() => handleToggleTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 rounded-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 shadow-sm transition-all"
            title="Alternar Tema Claro / Escuro"
          >
            {theme === 'light' ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
              </svg>
            )}
          </button>
        </div>

        <div className="w-full max-w-sm">
          {/* Card Principal de Login */}
          <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] p-8 sm:p-9 shadow-xl shadow-slate-200/50 dark:shadow-black/60">
            
            {/* Cabeçalho */}
            <div className="flex flex-col items-center text-center mb-7">
              <div className="w-12 h-12 rounded-2xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 flex items-center justify-center font-bold text-lg mb-3 shadow-md">
                RM
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                RM Controle
              </h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Portal de Gestão de Servidores & Suporte
              </p>
            </div>

            {/* Mensagem de Erro */}
            {loginError && (
              <div className="mb-5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs space-y-2 animate-fade-in">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{loginError}</span>
                </div>

                {/* Botão de Contingência se houver erro interno no Supabase */}
                {loginError.includes('Database error querying schema') && (
                  <button
                    type="button"
                    onClick={handleBypassDevLogin}
                    className="w-full mt-2 py-1.5 px-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-[11px] font-semibold hover:opacity-90 transition-all"
                  >
                    Entrar no Painel (Modo Desenvolvimento) →
                  </button>
                )}
              </div>
            )}

            {/* Formulário de Login */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  E-mail de Acesso
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@rmcontrole.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs focus:outline-none focus:border-[#4d7c0f] dark:focus:border-[#84cc16] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full px-3.5 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder-slate-400 text-xs focus:outline-none focus:border-[#4d7c0f] dark:focus:border-[#84cc16] transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    {showLoginPassword ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                        <line x1="2" x2="22" y1="2" y2="22"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] hover:opacity-95 text-white dark:text-zinc-950 text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                >
                  {loginSubmitting ? 'Validando...' : 'Acessar Plataforma'}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-zinc-800 text-center">
              <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                Acesso restrito para administradores e equipe técnica.
              </p>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // PAINEL PRINCIPAL (TEMA LIGHT DE ALTA FIDELIDADE)
  // ==============================================================================
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 flex flex-col transition-colors duration-200">
      
      {/* Navbar Flutuante Estilo Dynamic Island */}
      <Navbar
        activeTab={selectedEmpresa ? 'empresas' : activeTab}
        setActiveTab={(tab) => {
          setSelectedEmpresa(null);
          setActiveTab(tab);
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

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-16">
        {selectedEmpresa ? (
          /* TELA CHEIA: GERENCIAR EMPRESA (INTUITIVA E CLARA PARA LEIGOS) */
          <CompanyManagementView
            empresa={selectedEmpresa}
            onBack={() => setSelectedEmpresa(null)}
            onUpdated={carregarEmpresas}
            userEmail={userEmail}
          />
        ) : (
          <>
            {/* ABA 1: EMPRESAS */}
            {activeTab === 'empresas' && (
          <div className="space-y-5 animate-fade-in">
            
            {/* Barra de Ações Superior */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Empresas
                </h1>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Gerenciamento de clientes, canais WhatsApp (API / QR Code) e credenciais de suporte.
                </p>
              </div>

              <button
                onClick={() => setIsModalCreateOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-90 flex items-center gap-1.5 transition-all self-start sm:self-auto"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>Nova Empresa</span>
              </button>
            </div>

            {/* Aviso se estiver no Modo Mock Dev */}
            {showMockData && (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
                <span>Modo de Desenvolvimento ativo: exibindo empresas simuladas. Você pode desativar no seu menu de perfil no topo.</span>
                <button
                  onClick={() => handleToggleMockData(false)}
                  className="font-bold underline text-[11px] ml-2"
                >
                  Ocultar Mock
                </button>
              </div>
            )}

            {/* Painel de Busca e Filtros */}
            <div className="surface-card rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                
                {/* Campo de Busca Aprimorada */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar empresa, colaborador ou WhatsApp..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none text-slate-900 dark:text-white placeholder-slate-400"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none text-slate-900 dark:text-white font-medium"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none text-slate-900 dark:text-white"
                  >
                    <option value="todos">Todos os Canais</option>
                    <option value="api">WhatsApp API Oficial</option>
                    <option value="qrcode">WhatsApp QR Code</option>
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none text-slate-900 dark:text-white"
                  >
                    <option value="todos">Todos os Formatos</option>
                    <option value="colaborativo">Formato Colaborativo</option>
                    <option value="individual">Formato Individual</option>
                  </select>
                </div>
              </div>

              {/* Paginação Controles */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-[11px] text-slate-500 dark:text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span>Por página:</span>
                  {[5, 10, 15, 20].map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        setPageSize(size);
                        setPage(1);
                      }}
                      className={`px-2 py-0.5 rounded font-semibold transition-all ${
                        pageSize === size
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-zinc-950'
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                <span className="font-mono">
                  {totalEmpresas} {totalEmpresas === 1 ? 'empresa cadastrada' : 'empresas cadastradas'}
                </span>
              </div>
            </div>

            {/* Lista de Empresas */}
            {loadingEmpresas ? (
              <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-[#4d7c0f] dark:border-[#84cc16] border-t-transparent rounded-full animate-spin"></div>
                <span>Carregando empresas...</span>
              </div>
            ) : empresas.length === 0 ? (
              /* Estado Vazio Limpo e Elegante */
              <div className="surface-card rounded-2xl p-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
                    <path d="M9 22v-4h6v4"/>
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Nenhuma empresa cadastrada</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Cadastre sua primeira empresa para configurar canais de WhatsApp, credenciais de suporte e checklists.
                </p>
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={() => setIsModalCreateOpen(true)}
                    className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm"
                  >
                    + Cadastrar Empresa
                  </button>
                  <button
                    onClick={() => handleToggleMockData(true)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-200"
                  >
                    Exibir Dados de Teste (Mock Dev)
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {empresas.map((emp) => {
                  const checklistTotal = emp.checklist?.length || 0;
                  const checklistConcluidos = emp.checklist?.filter((c) => c.concluido).length || 0;

                  return (
                    <div
                      key={emp.id}
                      onClick={() => setEmpresaAcaoModal(emp)}
                      className="surface-card surface-card-hover rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-zinc-200 flex-shrink-0">
                          {emp.nome.charAt(0)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#4d7c0f] dark:group-hover:text-[#84cc16] transition-colors">
                              {emp.nome}
                            </h3>

                            {/* Badge do Servidor Alocado */}
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                              {emp.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}
                            </span>

                            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${
                              emp.formato_atendimento === 'colaborativo'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                            }`}>
                              {emp.formato_atendimento === 'colaborativo' ? 'Colaborativo' : 'Individual'}
                            </span>

                            {getChamadoAtivo(emp.id) && (
                              <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                Em Suporte
                              </span>
                            )}

                            {emp.is_mock && (
                              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                                Mock
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                            {emp.credenciais?.email_administrador || 'Sem e-mail cadastrado'}
                          </p>

                          {/* Canais */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {(!emp.canais || emp.canais.length === 0) ? (
                              <span className="text-[10px] text-slate-400 italic">Sem canais vinculados</span>
                            ) : (
                              emp.canais.map((c, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/80 dark:border-zinc-700 flex items-center gap-1"
                                >
                                  {(c.nome || '').toLowerCase().includes('whatsapp') && (
                                    <WhatsAppIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                                  )}
                                  <span>{c.nome}</span>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Status Checklist & Ação */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-zinc-800/80">
                        <div className="text-left sm:text-right text-[11px] text-slate-500 dark:text-zinc-400">
                          <span>Setup Servidor: </span>
                          <strong className="text-slate-900 dark:text-white font-mono">
                            {checklistConcluidos}/{checklistTotal}
                          </strong>
                        </div>

                        <span className="text-xs font-semibold text-[#4d7c0f] dark:text-[#84cc16] group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                          Gerenciar →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="p-3.5 rounded-2xl surface-card border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-zinc-400 text-[11px] font-mono">
                  Página {page} de {totalPages}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 disabled:opacity-30"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 disabled:opacity-30"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ============================================================================== */}
        {/* ABA: DASHBOARD DE SUPORTE */}
        {/* ============================================================================== */}
        {activeTab === 'dashboard' && (
          <DashboardView
            userEmail={userEmail}
            onSelectEmpresa={(empresaId) => {
              const emp = empresas.find((e) => e.id === empresaId);
              if (emp) setSelectedEmpresa(emp);
            }}
          />
        )}

        {/* ============================================================================== */}
        {/* ABA 2: CANAIS */}
        {/* ============================================================================== */}
        {activeTab === 'canais' && (
          <ChannelsManagement />
        )}

        {/* ============================================================================== */}
        {/* ABA 3: SERVIDORES */}
        {/* ============================================================================== */}
        {activeTab === 'servidores' && (
          <ServerConfigView />
        )}

        {/* ============================================================================== */}
        {/* ABA 4: AUDITORIA LGPD */}
        {/* ============================================================================== */}
        {activeTab === 'auditoria' && (
          <AuditLogsView />
        )}
          </>
        )}

      </main>

      {/* Modal de Criação */}
      <CompanyModal
        isOpen={isModalCreateOpen}
        onClose={() => setIsModalCreateOpen(false)}
        onCreated={handleCreatedEmpresas}
      />

      {/* Modal de Ação Rápida ao Clicar na Empresa */}
      {empresaAcaoModal && (
        <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] p-6 shadow-2xl space-y-4 text-slate-900 dark:text-zinc-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {empresaAcaoModal.nome}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {empresaAcaoModal.servidor_alocado === 'servidor_2' ? 'Servidor 2 (Expansão)' : 'Servidor 1 (Principal)'} • Modo {empresaAcaoModal.formato_atendimento}
                </p>
              </div>
              <button
                onClick={() => setEmpresaAcaoModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 pt-1">
              {getChamadoAtivo(empresaAcaoModal.id) ? (
                <>
                  <button
                    onClick={() => {
                      setSelectedEmpresa(empresaAcaoModal);
                      setEmpresaAcaoModal(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-95 flex items-center justify-center gap-2"
                  >
                    <span>▶ Continuar Chamado em Andamento</span>
                  </button>

                  <button
                    onClick={() => {
                      const ativo = getChamadoAtivo(empresaAcaoModal.id);
                      setModalEncerrarChamado(ativo);
                      setEmpresaAcaoModal(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <span>■ Encerrar Atendimento</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedEmpresa(empresaAcaoModal);
                      setEmpresaAcaoModal(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all"
                  >
                    Ver Detalhes da Empresa
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      await iniciarSuporte({ 
                        empresa_id: empresaAcaoModal.id, 
                        empresa_nome: empresaAcaoModal.nome, 
                        userEmail 
                      });
                      setSelectedEmpresa(empresaAcaoModal);
                      setEmpresaAcaoModal(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-95 flex items-center justify-center gap-2"
                  >
                    <span>▶ Iniciar Atendimento</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedEmpresa(empresaAcaoModal);
                      setEmpresaAcaoModal(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all"
                  >
                    Ver Detalhes / Gerenciar
                  </button>
                </>
              )}

              <button
                onClick={() => setEmpresaAcaoModal(null)}
                className="w-full py-2 text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rápido de Encerramento */}
      {modalEncerrarChamado && (
        <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] p-6 shadow-2xl space-y-4 text-slate-900 dark:text-zinc-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Encerrar Atendimento de Suporte
                </h3>
                <p className="text-xs text-slate-500">{modalEncerrarChamado.empresa_nome}</p>
              </div>
              <button
                onClick={() => setModalEncerrarChamado(null)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Voltar
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const motivoFinal = fecharMotivo || (motivosDisponiveis[0]?.nome || 'Redefinição de Senha / Acesso');
                await finalizarSuporte({
                  chamado_id: modalEncerrarChamado.id,
                  motivo: motivoFinal,
                  observacoes: fecharObs,
                  userEmail,
                });
                setModalEncerrarChamado(null);
                setFecharObs('');
                setFecharMotivo('');
                carregarEmpresas();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Motivo Principal do Chamado <span className="text-red-500">*</span>
                </label>
                <select
                  value={fecharMotivo || (motivosDisponiveis[0]?.nome || '')}
                  onChange={(e) => setFecharMotivo(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white font-medium focus:outline-none"
                >
                  {motivosDisponiveis.map((m) => (
                    <option key={m.id} value={m.nome}>{m.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Resumo da Solução Aplicada
                </label>
                <textarea
                  rows={3}
                  value={fecharObs}
                  onChange={(e) => setFecharObs(e.target.value)}
                  placeholder="Ex: Senha redefinida e informada ao cliente."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalEncerrarChamado(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90"
                >
                  Confirmar e Encerrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
