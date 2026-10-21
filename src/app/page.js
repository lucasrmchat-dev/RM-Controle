'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  getDefaultViewMode,
  existeEmpresaComTermo,
  removerAcentos,
  getEmpresas, 
  createEmpresa, 
  garantirSessaoBanco,
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
  sincronizarDadosCompartilhados,
  getAbasPermitidas,
  resolveUserRole,
  isPrimeiroAcessoPendente,
  concluirPrimeiroAcesso,
  getNomeTecnico,
  fetchChamadosFila,
  getChamadosSuporte,
  updateEquipeUsuario,
  getAgendaConfig,
  getAgendaEventos
} from '@/lib/storage';
import { triggerSupportNotification, stopSupportNotificationLoop, playMeetingAlertTone } from '@/lib/audioNotifications';
import FirstAccessSetupView from '@/components/FirstAccessSetupView';
import { lerPreferenciaTema, aplicarTema, salvarPreferenciaTema } from '@/lib/tema';
import Navbar from '@/components/Navbar';
import CompanyModal from '@/components/CompanyModal';
import CompanyManagementView from '@/components/CompanyManagementView';
import AuditLogsView from '@/components/AuditLogsView';
import ServerConfigView from '@/components/ServerConfigView';
import DashboardView from '@/components/DashboardView';
import GeneralSettingsView from '@/components/GeneralSettingsView';
import RegisterSupportModal from '@/components/RegisterSupportModal';
import { CompanyCardSkeleton, CompanyTableRowSkeleton } from '@/components/SkeletonLoaders';
import ConfirmModal from '@/components/ConfirmModal';
import ToastContainer, { showToast } from '@/components/ToastNotification';
import LoginView from '@/components/LoginView';
import SupportCompletionModal from '@/components/SupportCompletionModal';
import SupportQueueView from '@/components/SupportQueueView';
import FeedbacksView from '@/components/FeedbacksView';
import AgendaView from '@/components/AgendaView';
import { 
  MessageChannelIcon, 
  ViewGridIcon, 
  ViewListIcon,
  PlayIcon,
  XMarkIcon,
  CheckIcon 
} from '@/components/Icons';

// O papel oficial vem do servidor (cadastro da equipe); a regra local é só contingência sem rede
async function obterPapelAtual(email) {
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.user?.role && (data.user.email || '').toLowerCase() === (email || '').toLowerCase()) {
        return data.user.role;
      }
    }
  } catch (e) {}
  return resolveUserRole(email);
}

export default function Home() {
  // Tema Visual: 'light' (Padrão Apple) | 'dark'
  const [theme, setTheme] = useState('light');

  // Modo de Exibição das Empresas: 'grid' (Cards) | 'list' (Lista/Tabela)
  const [empresasViewMode, setEmpresasViewMode] = useState('list');
  const [sortColumn, setSortColumn] = useState('nome');
  const [sortDirection, setSortDirection] = useState('asc');

  const handleSortColumn = (col) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    const defaultM = getDefaultViewMode();
    const effective = defaultM === 'cards' || defaultM === 'grid' ? 'grid' : 'list';
    setEmpresasViewMode(effective);

    const handleGlobalUpdate = (e) => {
      const mode = e.detail === 'cards' || e.detail === 'grid' ? 'grid' : 'list';
      setEmpresasViewMode(mode);
    };
    window.addEventListener('rm_default_view_mode_updated', handleGlobalUpdate);
    return () => window.removeEventListener('rm_default_view_mode_updated', handleGlobalUpdate);
  }, []);

  const handleChangeViewMode = (mode) => {
    setEmpresasViewMode(mode);
    localStorage.setItem('rm_empresas_view_mode', mode);
  };

  // Estado de Autenticação
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [primeiroAcessoPendente, setPrimeiroAcessoPendente] = useState(false);
  
  // Formulário de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginCaptchaToken, setLoginCaptchaToken] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  // Inatividade (30 minutos = 1800 segundos)
  const [inactivityTimeLeft, setInactivityTimeLeft] = useState(1800);

  // Controle de Dados Simulados (Mock Dev) - Desativado por padrão
  const [showMockData, setShowMockData] = useState(false);

  // Navegação Principal por Abas
  // Empresas virou subpágina da Fila de Demandas: a Fila é a tela inicial
  const [activeTab, setActiveTab] = useState('fila');
  const [settingsSubTab, setSettingsSubTab] = useState('audio');
  const [isRegistrarModalGlobalOpen, setIsRegistrarModalGlobalOpen] = useState(false);
  const [empresaParaRegistrar, setEmpresaParaRegistrar] = useState(null);
  const [confirmModalData, setConfirmModalData] = useState(null); // 'empresas' | 'dashboard' | 'canais' | 'servidores' | 'auditoria'

  // Listagem de Empresas, Filtros e Paginação
  const [empresas, setEmpresas] = useState([]);
  const [totalEmpresas, setTotalEmpresas] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickCreateServidor, setQuickCreateServidor] = useState('servidor_1');
  const [quickCreateFormato, setQuickCreateFormato] = useState('colaborativo');
  const [isSubmittingQuickCreate, setIsSubmittingQuickCreate] = useState(false);
  const [filtroCanal, setFiltroCanal] = useState('todos');
  const [filtroFormato, setFiltroFormato] = useState('todos');
  const [filtroServidor, setFiltroServidor] = useState('todos'); // 'todos' | 'servidor_1' | 'servidor_2'
  // Começa carregando: evita mostrar "nenhuma empresa" antes da primeira busca terminar
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);

  // Modais e Menu de Ação Rápida da Empresa
  const [isModalCreateOpen, setIsModalCreateOpen] = useState(false);
  const [modalInitialNome, setModalInitialNome] = useState('');
  const [modalFechadoManualmente, setModalFechadoManualmente] = useState(false);
  const debounceSearchRef = React.useRef(null);
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
    const pref = lerPreferenciaTema();
    setTheme(pref);
    aplicarTema(pref);
  }, []);

  // "Automático" acompanha a troca de aparência do sistema sem recarregar
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const mudar = () => aplicarTema('system');
    mq.addEventListener('change', mudar);
    return () => mq.removeEventListener('change', mudar);
  }, [theme]);

  // Volta do "Conectar Google Agenda": mostra o resultado e leva para onde faz sentido
  useEffect(() => {
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get('google_agenda');
    if (!status) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (status === 'conectado' && params.get('motivo') === 'importacao') {
      showToast('Google Agenda conectado, mas a primeira importação falhou. Veja o motivo em Configurações › Agenda.', 'warning');
      setSelectedEmpresa(null);
      setSettingsSubTab('agenda');
      setActiveTab('configuracoes');
      return;
    }
    if (status === 'conectado') {
      showToast('Google Agenda conectado. Sua agenda já está sincronizando.', 'success');
      setSelectedEmpresa(null);
      setActiveTab('agenda');
      return;
    }
    const motivos = {
      recusado: 'Você não autorizou o acesso à agenda no Google.',
      escopo: 'Para sincronizar, marque a permissão de acesso à agenda na tela do Google.',
      expirou: 'A conexão demorou demais. Tente conectar de novo.',
      sessao: 'Sua sessão mudou durante a conexão. Entre novamente e tente de novo.',
      nao_configurado: 'A conexão com o Google ainda não foi ativada no servidor.',
    };
    showToast(motivos[params.get('motivo')] || 'Não foi possível conectar o Google Agenda. Tente de novo.', 'error');
    setSelectedEmpresa(null);
    setSettingsSubTab('agenda');
    setActiveTab('configuracoes');
  }, [isAuthenticated]);

  const handleToggleTheme = (newTheme) => {
    setTheme(newTheme);
    salvarPreferenciaTema(newTheme);
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
        showToast('Sessão encerrada por inatividade de 30 minutos (Proteção LGPD).', 'warning');
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
  // ==============================================================================
  // LIMPEZA AUTOMÁTICA DE SESSÃO EFÊMERA (LGPD) AO FECHAR ABA DO NAVEGADOR
  // ==============================================================================
  useEffect(() => {
    const handleUnload = () => {
      try {
        sessionStorage.clear();
      } catch (e) {}
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  // ==============================================================================
  // VALIDAÇÃO DE SESSÃO SEGURA VIA COOKIES HTTP-ONLY E SUPABASE
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

        // 1. Validação prioritária por Cookie HTTP-Only seguro (/api/auth/session)
        try {
          const res = await fetch('/api/auth/session', { cache: 'no-store' });
          if (res.status === 403) {
            // Fora da equipe: encerra também a sessão do Supabase e explica o motivo no login
            const dataBloqueio = await res.json().catch(() => ({}));
            await handleLogout();
            setLoginError(dataBloqueio.motivo || 'Seu acesso não está liberado. Fale com o administrador.');
            setAuthLoading(false);
            return;
          }
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated && data.user?.email) {
              // O cookie sozinho não basta: sem sessão válida do banco (ou com a sessão de outra conta
              // neste navegador) a tela abria, mas toda gravação era recusada ("não foi possível assumir").
              if (isSupabaseConfigured && supabase) {
                const banco = await garantirSessaoBanco();
                if (!banco.ok || (banco.email && banco.email !== data.user.email.toLowerCase())) {
                  await handleLogout();
                  setLoginError(
                    banco.ok
                      ? 'Este navegador estava conectado com outra conta. Entre novamente.'
                      : 'Sua sessão expirou. Entre novamente para continuar.'
                  );
                  setAuthLoading(false);
                  return;
                }
              }
              setIsAuthenticated(true);
              setUserEmail(data.user.email);
              const role = data.user.role || resolveUserRole(data.user.email);
              setCurrentUserRole(role);
              localStorage.setItem('rm_last_active_timestamp', Date.now().toString());

              // Higienização preventiva contra vazamento no LocalStorage
              try {
                localStorage.removeItem('rm_auth_user');
                localStorage.removeItem('rm_user_role');
              } catch (e) {}

              const pendente = await isPrimeiroAcessoPendente(data.user.email);
              setPrimeiroAcessoPendente(pendente);
              setAuthLoading(false);
              return;
            }
          }
        } catch (cookieErr) {
          // Continua para validação Supabase
        }

        // 2. Validação por Supabase Auth nativo
        if (isSupabaseConfigured && supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const email = session.user.email || 'admin@rmcontrole.com';
            setIsAuthenticated(true);
            setUserEmail(email);
            setCurrentUserRole(await obterPapelAtual(email));
            localStorage.setItem('rm_last_active_timestamp', Date.now().toString());

            const pendente = await isPrimeiroAcessoPendente(email);
            setPrimeiroAcessoPendente(pendente);
            setAuthLoading(false);
            return;
          }
        }

        setIsAuthenticated(false);
        setUserEmail('');
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
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const email = session.user.email || 'admin@rmcontrole.com';
          setIsAuthenticated(true);
          setUserEmail(email);
          setCurrentUserRole(await obterPapelAtual(email));
          localStorage.setItem('rm_last_active_timestamp', Date.now().toString());

          const pendente = await isPrimeiroAcessoPendente(email);
          setPrimeiroAcessoPendente(pendente);
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
    // Só lê o papel já definido pelo servidor; regravá-lo aqui disparava 'user_role_updated'
    // dentro do próprio ouvinte (recursão) e trocava o papel do servidor pela regra local
    const checkRoleAndTab = () => {
      const permitidas = getAbasPermitidas(getCurrentUserRole());
      if (!permitidas.includes(activeTab)) {
        setActiveTab('fila');
      }
    };
    // Papel alterado em Equipe & Senhas: pergunta ao servidor e aplica
    const atualizarPapelDoServidor = async () => {
      const papel = await obterPapelAtual(userEmail);
      if (papel !== getCurrentUserRole()) setCurrentUserRole(papel);
    };

    checkRoleAndTab();

    window.addEventListener('user_role_updated', checkRoleAndTab);
    window.addEventListener('equipe_updated', atualizarPapelDoServidor);

    return () => {
      window.removeEventListener('user_role_updated', checkRoleAndTab);
      window.removeEventListener('equipe_updated', atualizarPapelDoServidor);
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

  // ==============================================================================
  // SINCRONIZAÇÃO GLOBAL EM TEMPO REAL DA FILA DE DEMANDAS & NOTIFICAÇÕES (SUPABASE)
  // Ativo globalmente em qualquer aba do sistema (Empresas, Dashboard, Fila, etc.)
  // ==============================================================================
  useEffect(() => {
    if (!isAuthenticated || primeiroAcessoPendente) return;

    // 1. Solicita permissão de notificação nativa do sistema se disponível
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch (e) {}
    }

    // Tudo que é compartilhado pela equipe vem do Supabase (e o legado local é enviado na 1ª vez)
    sincronizarDadosCompartilhados();
    let ultimaSincronizacao = Date.now();
    const sincronizarAoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaSincronizacao > 60000) {
        ultimaSincronizacao = Date.now();
        sincronizarDadosCompartilhados();
      }
    };
    document.addEventListener('visibilitychange', sincronizarAoVoltar);

    // Sincronização inicial global da fila de demandas
    fetchChamadosFila().then(() => {
      window.dispatchEvent(new Event('suporte_updated'));
    }).catch(() => {});

    // 2. Canal Supabase Realtime Global com WebSockets
    let realtimeChannel = null;
    if (isSupabaseConfigured && supabase) {
      try {
        realtimeChannel = supabase
          .channel('suporte_chamados_global_stream')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'suporte_chamados' },
            async (payload) => {
              const prevChamados = getChamadosSuporte();
              const prevIds = new Set(prevChamados.map((c) => c.id));

              await fetchChamadosFila();
              const novosChamados = getChamadosSuporte();
              window.dispatchEvent(new Event('suporte_updated'));

              // Se for um novo chamado cadastrado na fila
              if (payload.eventType === 'INSERT' && payload.new) {
                const item = payload.new;
                const isPendingOrWaiting = item.status === 'aguardando_visualizacao' || item.status === 'pendente' || item.status === 'em_andamento';

                // Usa o chamado já normalizado (categorias, fila geral, criador) em vez da linha crua do banco.
                // Se ele não estiver na fila exibida (feedback, já concluído, filtrado), não há o que notificar.
                const normalizado = novosChamados.find((c) => c.id === item.id);
                if (isPendingOrWaiting && !prevIds.has(item.id) && normalizado) {
                  triggerSupportNotification({ chamado: normalizado, userEmail });

                  // Dispara Alerta Visual Toast
                  const empresaNome = item.empresa_nome || 'Empresa';
                  const motivoNome = item.motivo || 'Demanda Geral';
                  showToast(`🔔 Nova demanda na fila: ${empresaNome} (${motivoNome})`, 'info');

                  // Dispara Notificação Nativa do Sistema Operacional (Mac / Windows / Chrome)
                  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                    try {
                      new Notification('RM Controle — Nova Demanda', {
                        body: `${empresaNome}
Solicitante: ${item.colaborador_solicitante || 'Colaborador'} • Categoria: ${motivoNome}`,
                        icon: '/favicon.ico',
                        tag: item.id,
                      });
                    } catch (notifErr) {}
                  }
                }
              } else if (payload.eventType === 'UPDATE' && payload.new) {
                // Se o chamado foi assumido ou finalizado, interrompe o loop sonoro se não houver outros pendentes
                // "Aguardando cliente" (pendente) não toca alerta: já tem responsável
                const hasPending = novosChamados.some((c) => c.status === 'aguardando_visualizacao');
                if (!hasPending) {
                  stopSupportNotificationLoop();
                }
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.warn('Erro ao conectar Supabase Realtime Global:', err);
      }
    }

    // 3. Polling em segundo plano a cada 5 segundos para garantir recepção em qualquer aba ou navegador
    const backgroundSyncTimer = setInterval(async () => {
      try {
        const antes = getChamadosSuporte();
        const antesIds = new Set(antes.map((c) => c.id));
        const atualizados = await fetchChamadosFila();

        // Verifica se há chamados recém-chegados que não estavam na lista local
        const novosEncontrados = atualizados.filter(
          (c) => c.status === 'aguardando_visualizacao' && !antesIds.has(c.id)
        );

        if (novosEncontrados.length > 0) {
          novosEncontrados.forEach((novoItem) => {
            triggerSupportNotification({ chamado: novoItem, userEmail });
            showToast(`🔔 Nova demanda na fila: ${novoItem.empresa_nome || 'Empresa'} (${novoItem.motivo || 'Geral'})`, 'info');
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('RM Controle — Nova Demanda', {
                  body: `${novoItem.empresa_nome || 'Empresa'}
Solicitante: ${novoItem.solicitante_nome || 'Colaborador'}`,
                  icon: '/favicon.ico',
                  tag: novoItem.id,
                });
              } catch (e) {}
            }
          });
        }

        window.dispatchEvent(new Event('suporte_updated'));
      } catch (e) {}
    }, 5000);

    // 4. Verificador de Reuniões da Agenda (Alerta prévio sonoro e visual com X min de antecedência)
    const checarAlertasReuniao = () => {
      try {
        if (typeof window === 'undefined') return;
        const agendaCfg = getAgendaConfig();
        if (!agendaCfg || agendaCfg.somHabilitado === false) return;

        const evts = getAgendaEventos();
        const hojeStr = new Date().toISOString().split('T')[0];
        const agora = new Date();
        const minutosAntecedencia = agendaCfg.minutosAntecedencia || 15;
        const myEmail = (userEmail || '').toLowerCase().trim();

        evts.forEach((evt) => {
          if (evt.data !== hojeStr || evt.status === 'concluida' || evt.status === 'cancelada') return;
          if (!evt.hora_inicio) return;

          // Verifica escopo de notificação (apenas minhas vs todas da equipe)
          if (agendaCfg.notificarEscopo === 'proprias') {
            const evEmail = (evt.responsavel_email || '').toLowerCase().trim();
            const evNome = (evt.responsavel_nome || '').toLowerCase().trim();
            const meuNome = getNomeTecnico(userEmail).toLowerCase().trim();
            if (evEmail !== myEmail && !evNome.includes(meuNome)) return;
          }

          const [h, m] = evt.hora_inicio.split(':').map(Number);
          const evtDate = new Date();
          evtDate.setHours(h, m, 0, 0);

          const diffMs = evtDate.getTime() - agora.getTime();
          const diffMins = Math.round(diffMs / 60000);

          if (diffMins >= 0 && diffMins <= minutosAntecedencia) {
            const sessionKey = `rm_alerted_meeting_${evt.id}_${diffMins <= 5 ? '5m' : 'window'}`;
            if (sessionStorage.getItem(sessionKey)) return;
            sessionStorage.setItem(sessionKey, 'true');

            playMeetingAlertTone();
            const tempoTexto = diffMins === 0 ? 'acontecendo agora' : `em ${diffMins} min`;
            showToast(`📅 Reunião ${tempoTexto}: "${evt.titulo}" (${evt.empresa || 'Cliente'})`, 'info');

            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('RM Controle — Alerta de Reunião', {
                  body: `${evt.titulo}\nHorário: ${evt.hora_inicio} • Responsável: ${evt.responsavel_nome || 'Equipe'}\nCliente: ${evt.empresa}`,
                  icon: '/favicon.ico',
                  tag: evt.id,
                });
              } catch (e) {}
            }
          }
        });
      } catch (e) {}
    };

    checarAlertasReuniao();
    const agendaTimer = setInterval(checarAlertasReuniao, 20000);

    return () => {
      if (realtimeChannel && supabase) {
        supabase.removeChannel(realtimeChannel);
      }
      clearInterval(backgroundSyncTimer);
      document.removeEventListener('visibilitychange', sincronizarAoVoltar);
      clearInterval(agendaTimer);
    };
  }, [isAuthenticated, userEmail, primeiroAcessoPendente]);

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
    let target = null;
    if (typeof empOrId === 'object') {
      if (empOrId.id) {
        target = empresas.find((e) => e.id === empOrId.id);
      }
      if (!target && empOrId.nome) {
        target = empresas.find((e) => e.nome.trim().toLowerCase() === empOrId.nome.trim().toLowerCase());
      }
      if (!target && (empOrId.id || empOrId.nome)) {
        target = empOrId;
      }
    } else if (typeof empOrId === 'string') {
      target = empresas.find((e) => e.id === empOrId || e.nome.trim().toLowerCase() === empOrId.trim().toLowerCase());
      if (!target) {
        target = { id: empOrId, nome: empOrId };
      }
    }

    if (target) {
      // Não troca de aba: ao voltar, a pessoa retorna exatamente para onde estava (Fila, Dashboard, Agenda…)
      setSelectedEmpresa(target);
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

    // Prevenção Anti-Bot via Honeypot
    if (honeypot && honeypot.trim() !== '') {
      setLoginError('Credenciais inválidas.');
      return;
    }

    const emailLimpo = loginEmail.trim().toLowerCase();
    const senhaLimpa = loginPassword.trim();

    if (!emailLimpo || !senhaLimpa) {
      setLoginError('Informe o e-mail e a senha cadastrados.');
      return;
    }

    setLoginSubmitting(true);

    try {
      // Permite entrar pelo nome ou pelo usuário (antes do @), como antes
      let emailFormal = emailLimpo;
      const membroEquipe = getEquipeUsuarios().find((u) => {
        const uEmail = (u.email || '').toLowerCase().trim();
        const uNome = (u.nome || '').toLowerCase().trim();
        return uEmail === emailLimpo || uNome === emailLimpo || uEmail.split('@')[0] === emailLimpo;
      });
      if (membroEquipe?.email) {
        emailFormal = membroEquipe.email.toLowerCase().trim();
      } else if (!emailFormal.includes('@')) {
        emailFormal = `${emailFormal}@rmcontrole.com`;
      }

      // 1. O servidor é a autoridade: confere a senha (hash), o captcha e o limite de tentativas,
      //    cria o cookie de sessão e deixa a conta de login do Supabase sincronizada.
      const resAuth = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailFormal, password: senhaLimpa, honeypot, captchaToken: loginCaptchaToken }),
      }).catch(() => null);
      const dataAuth = resAuth ? await resAuth.json().catch(() => ({})) : {};
      if (!resAuth || !resAuth.ok) {
        // O captcha é de uso único: pede um novo depois de qualquer tentativa recusada
        setLoginCaptchaToken('');
        window.dispatchEvent(new Event('rm_captcha_reset'));
        throw new Error(dataAuth.error || 'Não foi possível conectar ao servidor. Verifique sua internet.');
      }
      const serverRole = dataAuth.user?.role || 'suporte';

      // 2. Sessão do Supabase (RLS e tempo real) com a mesma senha já validada pelo servidor
      if (isSupabaseConfigured && supabase) {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: emailFormal, password: senhaLimpa });
        if (authError) {
          throw new Error('Login validado, mas a conexão com o banco falhou. Tente novamente em instantes.');
        }
      }

      setIsAuthenticated(true);
      setUserEmail(emailFormal);
      setCurrentUserRole(serverRole);

      // Limpeza de resíduos sensíveis de versões antigas (LGPD)
      try {
        localStorage.removeItem('rm_auth_user');
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('rm_user_password_')) localStorage.removeItem(k);
        });
      } catch (e) {}
      localStorage.setItem('rm_last_active_timestamp', Date.now().toString());

      const pendente = await isPrimeiroAcessoPendente(emailFormal);
      setPrimeiroAcessoPendente(pendente);
    } catch (err) {
      setLoginError(err.message || 'Falha ao autenticar.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleBypassDevLogin = async () => {
    setLoginError('Acesso direto desativado por segurança. Autentique-se com suas credenciais cadastradas.');
  };

  const handleLogout = async () => {
    // 1. Limpa cookie de sessão HTTP-Only no servidor
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}

    // 2. Encerra sessão do Supabase Auth
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {}
    }

    // 3. Limpeza completa de SessionStorage e chaves legadas de LocalStorage (LGPD)
    try {
      sessionStorage.clear();
      localStorage.removeItem('rm_auth_user');
      localStorage.removeItem('rm_user_role');
      localStorage.removeItem('rm_last_active_timestamp');
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('rm_user_password_')) localStorage.removeItem(k);
      });
    } catch (e) {}

    setIsAuthenticated(false);
    setUserEmail('');
  };


  const handleCreatedEmpresas = async (payload) => {
    try {
      if (payload.tipo === 'manual') {
        const criada = await createEmpresa({
          nome: payload.nome,
          formato_atendimento: 'colaborativo',
          servidor_alocado: payload.servidor_alocado,
          tipo_cliente: payload.tipo_cliente,
          cliente_desde: payload.cliente_desde,
          email_administrador: payload.email_administrador,
          senha_suporte: payload.senha_suporte,
          userEmail,
        });
        if (criada?.avisos?.length) {
          showToast(`Empresa "${payload.nome}" cadastrada, mas: ${criada.avisos.join('; ')}.`, 'warning');
        } else {
          showToast(`Empresa "${payload.nome}" cadastrada com sucesso!`, 'success');
        }
      }
      setIsModalCreateOpen(false);
      setSearchTerm('');
      setModalInitialNome('');
      setModalFechadoManualmente(false);
      await carregarEmpresas();
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar empresa.', 'error');
    }
  };

  // ==============================================================================
  // TELA DE CARREGAMENTO INICIAL
  // ==============================================================================
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-[#141416]">
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
        onCaptchaToken={setLoginCaptchaToken}
        handleLogin={handleLogin}
        handleBypassDevLogin={handleBypassDevLogin}
        theme={theme}
        handleToggleTheme={handleToggleTheme}
        honeypot={honeypot}
        setHoneypot={setHoneypot}
      />
    );
  }

  // ==============================================================================
  // TELA DE PRIMEIRO ACESSO / ONBOARDING (ESTILO SETUP ASSISTANT APPLE)
  // ==============================================================================
  if (primeiroAcessoPendente) {
    return (
      <FirstAccessSetupView
        userEmail={userEmail}
        userName={getNomeTecnico(userEmail)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onConcluido={async (config) => {
          await concluirPrimeiroAcesso(userEmail, config);
          setPrimeiroAcessoPendente(false);
          if (config.viewMode) {
            setEmpresasViewMode(config.viewMode === 'cards' || config.viewMode === 'grid' ? 'grid' : 'list');
          }
        }}
      />
    );
  }

  // ==============================================================================
  // PAINEL PRINCIPAL COM APROVEITAMENTO TOTAL DA LARGURA (MAX-W-[1720PX])
  // ==============================================================================
  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#141416] text-[#1d1d1f] dark:text-[#f5f5f7] flex flex-col transition-colors duration-300">
      
      {/* Navbar Flutuante Estilo macOS / Dynamic Island */}
      <Navbar
        activeTab={activeTab === 'empresas' ? 'fila' : activeTab}
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
        acoesFila={activeTab === 'fila' && !selectedEmpresa}
      />

      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-2 sm:py-4 pb-28 md:pb-16">
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
              voltarRotulo={
                {
                  empresas: 'Voltar para Empresas',
                  fila: 'Voltar para a Fila de Demandas',
                  dashboard: 'Voltar para o Dashboard',
                  feedbacks: 'Voltar para Feedbacks',
                  agenda: 'Voltar para a Agenda',
                }[activeTab] || 'Voltar'
              }
            />
          </div>
        ) : (
          <div key={activeTab} className="animate-fade-in">
              {/* ABA 1: EMPRESAS */}
              {activeTab === 'empresas' && (
                <div className="space-y-5">
                  
                  {/* Barra de Ações Superior Estilo Apple Padronizada */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      {/* Subpágina da Fila de Demandas */}
                      <nav aria-label="Navegação" className="flex items-center gap-1.5 mb-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setActiveTab('fila')}
                          className="inline-flex items-center gap-1 -ml-1.5 px-1.5 py-1 rounded-lg font-semibold text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 18-6-6 6-6" />
                          </svg>
                          Fila de Demandas
                        </button>
                        <span className="text-slate-300 dark:text-zinc-500">/</span>
                        <span className="font-semibold text-[#1d1d1f] dark:text-white">Empresas</span>
                      </nav>
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                        Empresas
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                        Gerenciamento de clientes, instâncias de mensageria e credenciais técnicas de suporte.
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEmpresaParaRegistrar(null);
                          setIsRegistrarModalGlobalOpen(true);
                        }}
                        className="px-4 py-2.5 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-800 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-[#1d1d1f] dark:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <span>+ Registrar Suporte</span>
                      </button>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setModalInitialNome('');
                          setModalFechadoManualmente(false);
                          setIsModalCreateOpen(true);
                        }}
                        className="px-4 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20 hover:opacity-95 flex items-center gap-2 transition-all cursor-pointer"
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
                  <div className="rounded-2xl p-3.5 border border-black/[0.06] dark:border-white/[0.11] backdrop-blur-xl bg-white/80 dark:bg-[#1e1e21]/85 shadow-sm space-y-3">
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
                            const val = e.target.value;
                            setSearchTerm(val);
                            setPage(1);
                            setModalFechadoManualmente(false);

                            if (debounceSearchRef.current) {
                              clearTimeout(debounceSearchRef.current);
                            }

                            // Debounce de 350ms para digitação fluida sem travar o navegador
                            debounceSearchRef.current = setTimeout(() => {
                              if (val.trim().length >= 1 && !existeEmpresaComTermo(val)) {
                                setModalInitialNome(val.trim());
                                setIsModalCreateOpen(true);
                              }
                            }, 350);
                          }}
                          placeholder="Buscar empresa, operador ou canal..."
                          className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.11] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 text-[#1d1d1f] dark:text-white placeholder-slate-400 font-medium"
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
                          className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.11] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
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
                          className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.11] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
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
                          className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.11] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                        >
                          <option value="todos">Todos os Formatos</option>
                          <option value="colaborativo">Formato Colaborativo</option>
                          <option value="individual">Formato Individual</option>
                        </select>
                      </div>
                    </div>

                    {/* Controles de Paginação & Densidade */}
                    {/* Controles de Paginação & Densidade & Alternador de Visualização */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-black/[0.04] dark:border-white/[0.09] text-[11px] text-slate-500 dark:text-zinc-400">
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
                        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.09]">
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
                  {loadingEmpresas && empresas.length === 0 ? (
                    empresasViewMode === 'grid' ? (
                      <div role="status" aria-busy="true" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <span className="sr-only">Carregando empresas…</span>
                        {Array.from({ length: 6 }).map((_, i) => <CompanyCardSkeleton key={i} />)}
                      </div>
                    ) : (
                      <div role="status" aria-busy="true" className="rounded-2xl border border-black/[0.06] dark:border-white/[0.11] bg-white dark:bg-[#1e1e21] overflow-hidden">
                        <span className="sr-only">Carregando empresas…</span>
                        {Array.from({ length: 6 }).map((_, i) => <CompanyTableRowSkeleton key={i} />)}
                      </div>
                    )
                  ) : empresas.length === 0 ? (
                    /* Estado Vazio Total Estilo Apple */
                    <div className="rounded-3xl p-12 border border-black/[0.06] dark:border-white/[0.11] bg-white/80 dark:bg-[#1e1e21]/85 backdrop-blur-xl text-center space-y-4 shadow-sm">
                      <div className="w-12 h-12 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] text-slate-400 dark:text-zinc-400 flex items-center justify-center mx-auto">
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
                          onClick={() => {
                            setModalInitialNome(searchTerm.trim());
                            setModalFechadoManualmente(false);
                            setIsModalCreateOpen(true);
                          }}
                          className="px-4 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm cursor-pointer"
                        >
                          + Cadastrar Empresa
                        </button>
                        <button
                          onClick={() => handleToggleMockData(true)}
                          className="px-4 py-2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 text-xs font-medium hover:bg-black/[0.08] cursor-pointer"
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
                      {[...empresas].sort((a, b) => {
                        let valA = '';
                        let valB = '';
                        if (sortColumn === 'nome') {
                          valA = a.nome || '';
                          valB = b.nome || '';
                        } else if (sortColumn === 'servidor') {
                          valA = `${a.servidor_alocado || ''}_${a.formato_atendimento || ''}`;
                          valB = `${b.servidor_alocado || ''}_${b.formato_atendimento || ''}`;
                        } else if (sortColumn === 'canais') {
                          valA = a.canais?.length || 0;
                          valB = b.canais?.length || 0;
                          return sortDirection === 'asc' ? valA - valB : valB - valA;
                        } else if (sortColumn === 'setup') {
                          const cA = a.checklist?.filter((c) => c.concluido).length || 0;
                          const cB = b.checklist?.filter((c) => c.concluido).length || 0;
                          return sortDirection === 'asc' ? cA - cB : cB - cA;
                        } else if (sortColumn === 'status') {
                          valA = getChamadoAtivo(a.id) ? 'em_suporte' : 'livre';
                          valB = getChamadoAtivo(b.id) ? 'em_suporte' : 'livre';
                        }
                        return sortDirection === 'asc'
                          ? valA.toString().localeCompare(valB.toString())
                          : valB.toString().localeCompare(valA.toString());
                      }).map((emp) => {
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
                            className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.11] bg-white dark:bg-[#1e1e21] hover:shadow-apple-hover transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden"
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
                                      {emp.credenciais?.email_administrador || emp.credenciais_lista?.[0]?.usuario_email || emp.credenciais_lista?.[0]?.email_administrador || emp.email_administrador || 'Sem e-mail cadastrado'}
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
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 border border-black/[0.04] dark:border-white/[0.09]">
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
                            <div className="py-3.5 my-3 border-y border-black/[0.04] dark:border-white/[0.09] space-y-2">
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
                                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] text-slate-700 dark:text-zinc-300 border border-black/[0.04] dark:border-white/[0.09] truncate max-w-[130px]"
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
                      className="rounded-3xl border border-black/[0.06] dark:border-white/[0.11] bg-white dark:bg-[#1e1e21] overflow-hidden shadow-sm"
                    >
                      {/* Cabeçalho da Tabela Apple com Ordenação */}
                      <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-black/[0.05] dark:border-white/[0.09] text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-400 bg-black/[0.01] dark:bg-white/[0.02]">
                        <div className="col-span-4 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => handleSortColumn('nome')}>
                          <span>Empresa / E-mail</span>
                          {sortColumn === 'nome' && <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                        <div className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => handleSortColumn('servidor')}>
                          <span>Servidor & Formato</span>
                          {sortColumn === 'servidor' && <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                        <div className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => handleSortColumn('canais')}>
                          <span>Canais</span>
                          {sortColumn === 'canais' && <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                        <div className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => handleSortColumn('setup')}>
                          <span>Setup Checklist</span>
                          {sortColumn === 'setup' && <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                        <div className="col-span-2 text-right cursor-pointer select-none flex items-center justify-end gap-1 hover:text-black dark:hover:text-white" onClick={() => handleSortColumn('status')}>
                          <span>Status / Ação</span>
                          {sortColumn === 'status' && <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </div>

                      <div className="divide-y divide-black/[0.04] dark:divide-white/[0.09]">
                        {[...empresas].sort((a, b) => {
                          let valA = '';
                          let valB = '';
                          if (sortColumn === 'nome') {
                            valA = a.nome || '';
                            valB = b.nome || '';
                          } else if (sortColumn === 'servidor') {
                            valA = `${a.servidor_alocado || ''}_${a.formato_atendimento || ''}`;
                            valB = `${b.servidor_alocado || ''}_${b.formato_atendimento || ''}`;
                          } else if (sortColumn === 'canais') {
                            valA = a.canais?.length || 0;
                            valB = b.canais?.length || 0;
                            return sortDirection === 'asc' ? valA - valB : valB - valA;
                          } else if (sortColumn === 'setup') {
                            const cA = a.checklist?.filter((c) => c.concluido).length || 0;
                            const cB = b.checklist?.filter((c) => c.concluido).length || 0;
                            return sortDirection === 'asc' ? cA - cB : cB - cA;
                          } else if (sortColumn === 'status') {
                            valA = getChamadoAtivo(a.id) ? 'em_suporte' : 'livre';
                            valB = getChamadoAtivo(b.id) ? 'em_suporte' : 'livre';
                          }
                          return sortDirection === 'asc'
                            ? valA.toString().localeCompare(valB.toString())
                            : valB.toString().localeCompare(valA.toString());
                        }).map((emp) => {
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
                              <div className="lg:col-span-2 flex items-center justify-between lg:justify-end gap-2 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-black/[0.04] dark:border-white/[0.09]">
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
                    <div className="p-3.5 rounded-2xl border border-black/[0.06] dark:border-white/[0.11] bg-white/80 dark:bg-[#1e1e21]/85 backdrop-blur-xl flex items-center justify-between text-xs">
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
                  onNavigate={(tab) => setActiveTab(tab)}
                />
              )}

              {/* ABA: CONFIGURAÇÕES GERAIS (UNIFICADA COM ALERTAS, CANAIS, SERVIDORES & LGPD) */}
              {(activeTab === 'configuracoes' || activeTab === 'canais' || activeTab === 'servidores' || activeTab === 'auditoria') && (
                <GeneralSettingsView
                  userEmail={userEmail}
                  initialSubTab={activeTab === 'configuracoes' ? settingsSubTab : activeTab}
                />
              )}

              {/* ABA 6: FILA DE SUPORTE */}
              {activeTab === 'fila' && (
                <SupportQueueView
                  onSelectEmpresa={handleSelectEmpresaGlobal}
                  onVerEmpresas={(termo = '') => {
                    setPage(1);
                    setSearchTerm(termo);
                    setActiveTab('empresas');
                  }}
                  onRegistrarRetroativo={() => {
                    setEmpresaParaRegistrar(null);
                    setIsRegistrarModalGlobalOpen(true);
                  }}
                  userEmail={userEmail}
                />
              )}

              {/* ABA 7: FEEDBACKS */}
              {activeTab === 'feedbacks' && (
                <FeedbacksView
                  userEmail={userEmail}
                  onSelectEmpresa={handleSelectEmpresaGlobal}
                />
              )}

              {/* ABA 8: AGENDA DE REUNIÕES & INTEGRAÇÃO GOOGLE */}
              {activeTab === 'agenda' && (
                <AgendaView
                  userEmail={userEmail}
                  onSelectEmpresa={handleSelectEmpresaGlobal}
                  onNavigateConfig={(sub) => {
                    setSettingsSubTab(sub || 'agenda');
                    setActiveTab('configuracoes');
                  }}
                />
              )}
          </div>
        )}
      </main>

      {/* Modal Oficial de Criação de Empresa */}
      <CompanyModal
        isOpen={isModalCreateOpen}
        initialNome={modalInitialNome}
        onClose={() => {
          setIsModalCreateOpen(false);
          setModalFechadoManualmente(true);
        }}
        onCreated={async (payload) => {
          await handleCreatedEmpresas(payload);
        }}
        empresasExistentes={empresas}
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
              className="w-full max-w-sm rounded-[28px] border border-black/[0.08] dark:border-white/[0.1] bg-white/95 dark:bg-[#1e1e21]/95 backdrop-blur-2xl p-6 shadow-2xl space-y-4 text-[#1d1d1f] dark:text-[#f5f5f7]"
            >
              <div className="flex items-center justify-between border-b border-black/[0.05] dark:border-white/[0.09] pb-3">
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
                      onClick={() => {
                        const ativo = getChamadoAtivo(empresaAcaoModal.id);
                        if (ativo) {
                          setModalEncerrarChamado(ativo);
                          setEmpresaAcaoModal(null);
                        }
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span>Concluir Chamado</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        const ativo = getChamadoAtivo(empresaAcaoModal.id);
                        setConfirmModalData({
                          title: 'Cancelar Atendimento?',
                          message: `Deseja realmente cancelar o atendimento em andamento de ${empresaAcaoModal.nome}? O tempo e registro serão descartados.`,
                          confirmText: 'Sim, Cancelar',
                          variant: 'danger',
                          onConfirm: async () => {
                            try {
                              await cancelarSuporte({ chamado_id: ativo.id, userEmail });
                              showToast(`Atendimento de ${empresaAcaoModal.nome} cancelado.`, 'info');
                              setEmpresaAcaoModal(null);
                            } catch (err) {
                              showToast(err.message || 'Não foi possível cancelar o atendimento.', 'error');
                            } finally {
                              setConfirmModalData(null);
                              carregarEmpresas();
                            }
                          },
                        });
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                      <span>Cancelar Chamado</span>
                    </motion.button>

                    {/* Uma empresa pode ter várias demandas simultâneas */}
                    <button
                      type="button"
                      onClick={async () => {
                        await iniciarSuporte({
                          empresa_id: empresaAcaoModal.id,
                          empresa_nome: empresaAcaoModal.nome,
                          userEmail,
                        });
                        showToast(`Nova demanda iniciada para ${empresaAcaoModal.nome}.`, 'success');
                        setSelectedEmpresa(empresaAcaoModal);
                        setEmpresaAcaoModal(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <span>+ Iniciar outra demanda</span>
                    </button>
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

      {/* Modal Global de Registro de Suporte Retroativo */}
      <RegisterSupportModal
        isOpen={isRegistrarModalGlobalOpen}
        onClose={() => {
          setIsRegistrarModalGlobalOpen(false);
          setEmpresaParaRegistrar(null);
        }}
        empresaPreSelecionada={empresaParaRegistrar}
        userEmail={userEmail}
        onRegistered={() => {
          carregarEmpresas();
          // Atualiza também a Fila de Demandas (contador de resolvidos hoje)
          window.dispatchEvent(new Event('suporte_updated'));
          showToast('Atendimento retroativo registrado com sucesso!', 'success');
        }}
      />

      {/* Modal de Confirmação Visual Apple / Vercel (Substitui confirm nativo) */}
      <ConfirmModal
        isOpen={Boolean(confirmModalData)}
        title={confirmModalData?.title || 'Confirmar'}
        message={confirmModalData?.message || ''}
        confirmText={confirmModalData?.confirmText || 'Confirmar'}
        cancelText={confirmModalData?.cancelText || 'Cancelar'}
        variant={confirmModalData?.variant || 'danger'}
        onConfirm={confirmModalData?.onConfirm}
        onClose={() => setConfirmModalData(null)}
      />

      {/* Container Flutuante de Toasts Estilo Apple / Vercel */}
      <ToastContainer />
    </div>
  );
}
