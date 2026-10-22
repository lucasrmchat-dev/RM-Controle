'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getDefaultViewMode,
  removerAcentos,
  getChamadosSuporte, 
  iniciarSuporte, 
  adicionarChamadoFila, 
  assumirSuporte, 
  cancelarSuporte, 
  getEmpresas, 
  getChamadosResolvidosHoje,
  getEquipeUsuarios,
  getNomeTecnico,
  getEmpresaById,
  addColaboradorEmpresa,
  addEmpresaCredencial,
  getEmpresaCredenciais,
  getCategoriasDemandas,
  getPermissoesAtuais,
  fetchChamadosFila,
  fetchHistoricoChamados,
  fetchEquipeUsuarios,
  isChamadoFeedback,
  getHistoricoChamados,
  createEmpresa,
  atualizarEtiquetasChamado,
  editarDescricaoChamado,
  adiarAlertaChamado,
  cancelarAdiarAlertaChamado,
  marcarChamadoEscalonado,
  getConfiguracoesSuporte,
  reatribuirChamadoSuporte,
  sanitizarCategoriasDemanda,
  getCurrentUserRole,
  diagnosticarVisibilidadeFila,
} from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { podeVerDemanda, departamentosVisiveis } from '@/lib/perfis';
import { stopSupportNotificationLoop, playNotificationTone } from '@/lib/audioNotifications';
import SupportCompletionModal from './SupportCompletionModal';
import ConfirmModal from './ConfirmModal';
import InternalDemandsKanbanModal from './InternalDemandsKanbanModal';
import { showToast } from './ToastNotification';
import QueueCommandBar from './QueueCommandBar';
import NovaDemandaModal from './NovaDemandaModal';
import { ListaDemandas, CardsDemandas, KanbanDemandas } from './FilaDemandasVisoes';
import { SupportQueueSkeleton } from './SkeletonLoaders';
import { 
  ViewGridIcon,
  ViewListIcon,
  HourglassIcon,
  SupportQueueIcon, 
  ClockIcon, 
  CheckIcon, 
  PlayIcon, 
  XMarkIcon, 
  BuildingIcon, 
  UserIcon, 
  UsersIcon,
  WrenchIcon, 
  SparklesIcon, 
  RefreshIcon,
  TagIcon,
  BellOffIcon,
  KanbanIcon,
  LayersIcon
} from './Icons';

export default function SupportQueueView({ onSelectEmpresa, onRegistrarRetroativo, onVerEmpresas, userEmail }) {
  const [chamados, setChamados] = useState([]);
  // Só mostra "fila vazia" depois da primeira carga real; antes disso, esqueleto
  const [carregado, setCarregado] = useState(false);
  const [empresasLista, setEmpresasLista] = useState([]);
  const [equipeLista, setEquipeLista] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('ativos'); // 'ativos' | 'em_andamento' | 'espera' | 'resolvidos_hoje'
  const [filtroPrioridade, setFiltroPrioridade] = useState('todas'); // 'todas' | 'urgente' | 'alta' | 'normal'
  const [busca, setBusca] = useState('');
  const [, setTick] = useState(0);
  const [filaViewMode, setFilaViewMode] = useState('cards');
  const [sortFilaCol, setSortFilaCol] = useState('status');
  const [sortFilaDir, setSortFilaDir] = useState('asc');

  useEffect(() => {
    const globalMode = getDefaultViewMode();
    const effective = globalMode === 'grid' || globalMode === 'cards' ? 'cards' : 'list';
    setFilaViewMode(effective);

    const handleGlobalUpdate = (e) => {
      const mode = e.detail === 'cards' || e.detail === 'grid' ? 'cards' : 'list';
      setFilaViewMode(mode);
    };
    window.addEventListener('rm_default_view_mode_updated', handleGlobalUpdate);
    return () => window.removeEventListener('rm_default_view_mode_updated', handleGlobalUpdate);
  }, []);

  // Modal para Finalizar Suporte
  const [chamadoParaFinalizar, setChamadoParaFinalizar] = useState(null);
  const [chamadoParaReatribuir, setChamadoParaReatribuir] = useState(null);
  const [novoTecnicoReatribuir, setNovoTecnicoReatribuir] = useState('');
  const [salvandoReatribuicao, setSalvandoReatribuicao] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Modal para Abrir Nova Demanda na Fila
  const [buscaEmpresa, setBuscaEmpresa] = useState('');
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null);
  const [salvandoChamado, setSalvandoChamado] = useState(false);
  const [modoSalvando, setModoSalvando] = useState('fila'); // qual botão do modal disparou o envio

  // Solicitante & Atendente
  const [buscaSolicitante, setBuscaSolicitante] = useState('');
  const [buscaTecnicoModal, setBuscaTecnicoModal] = useState('');
  const [novoPrazoModal, setNovoPrazoModal] = useState('');
  const [isLembreteModal, setIsLembreteModal] = useState(false);
  const [highlightedEmpresaIdx, setHighlightedEmpresaIdx] = useState(0);
  const [highlightedSolicitanteIdx, setHighlightedSolicitanteIdx] = useState(0);
  const [highlightedTecnicoIdx, setHighlightedTecnicoIdx] = useState(0);
  const [expandedChamadoId, setExpandedChamadoId] = useState(null);

  // Dropdown único e exclusivo no modal de demanda (abrir um fecha os outros)
  const [activeModalDropdown, setActiveModalDropdown] = useState(null); // 'empresa' | 'solicitante' | 'tecnico' | null

  // Filtro de Técnico Apple-Grade na Fila
  const [filtroTecnicoDropdownAberto, setFiltroTecnicoDropdownAberto] = useState(false);
  const [buscaFiltroTecnico, setBuscaFiltroTecnico] = useState('');
  const filtroTecnicoRef = useRef(null);

  // Métricas Operacionais Recolhíveis em todos os modos (Cards, Lista e Kanban)
  const [metricasRecolhidas, setMetricasRecolhidas] = useState(true);
  const [metricasRecolhidasKanban, setMetricasRecolhidasKanban] = useState(true);
  const [colaboradoresRecolhidos, setColaboradoresRecolhidos] = useState([]);
  const [kanbanPreset, setKanbanPreset] = useState('foco_mim'); // 'foco_mim' | 'expandir_todos' | 'recolher_todos' | 'custom'

  // Identidade canônica de cada colaborador (deduplica Lucas Amorim / admin e agrupa aliases)
  const getCanonicalPersonKey = (email = '', nome = '') => {
    const emailNorm = (email || '').toLowerCase().trim();
    const nomeClean = removerAcentos((nome || '').toLowerCase().trim())
      .replace(/\(.*?\)/g, '')
      .replace(/administrador|suporte|tecnico|operador/g, '')
      .trim();

    if (
      emailNorm === 'admin@rmcontrole.com' ||
      emailNorm.includes('lucas') ||
      nomeClean.includes('lucas amorim') ||
      nomeClean === 'lucas'
    ) {
      return 'lucas_amorim';
    }

    if (nomeClean && nomeClean.length >= 2) {
      return nomeClean.replace(/\s+/g, '_');
    }

    if (emailNorm) {
      return emailNorm.split('@')[0].replace(/[^a-z0-9]/g, '_');
    }

    return 'outros';
  };

  const getTecKey = (tec) => (tec?.key || tec?.id || tec?.email || tec?.nome || '');

  const isMeuAtendimento = (ch) => {
    if (!ch) return false;
    const myEmail = (userEmail || '').toLowerCase().trim();
    const chEmail = (ch.tecnico_email || '').toLowerCase().trim();
    const chNome = (ch.tecnico_nome || ch.atendente || '').toLowerCase().trim();
    
    if (chEmail && chEmail === myEmail) return true;
    if (chEmail.includes('admin') && (myEmail.includes('admin') || myEmail.includes('lucas'))) return true;
    if (chEmail.includes('lucas') && (myEmail.includes('lucas') || myEmail.includes('admin'))) return true;
    if (chNome.includes('lucas') && (myEmail.includes('lucas') || myEmail.includes('admin'))) return true;
    return false;
  };

  const isTecnicoMim = (tec) => {
    if (!tec || !userEmail) return false;
    const myKey = getCanonicalPersonKey(userEmail, getNomeTecnico(userEmail));
    return (
      tec.key === myKey ||
      (tec.id && tec.id === myKey) ||
      (tec.emails && tec.emails.includes(userEmail.toLowerCase().trim()))
    );
  };
  const kanbanScrollRef = useRef(null);

  const tableContainerRef = useRef(null);
  const empresaDropdownRef = useRef(null);
  const solicitanteDropdownRef = useRef(null);
  const tecnicoDropdownRef = useRef(null);
  const etiquetaDropdownRef = useRef(null);
  const [highlightedEtiquetaIdx, setHighlightedEtiquetaIdx] = useState(0);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (empresaDropdownRef.current && !empresaDropdownRef.current.contains(e.target)) {
        if (activeModalDropdown === 'empresa') setActiveModalDropdown(null);
      }
      if (solicitanteDropdownRef.current && !solicitanteDropdownRef.current.contains(e.target)) {
        if (activeModalDropdown === 'solicitante') setActiveModalDropdown(null);
      }
      if (tecnicoDropdownRef.current && !tecnicoDropdownRef.current.contains(e.target)) {
        if (activeModalDropdown === 'tecnico') setActiveModalDropdown(null);
      }
      if (etiquetaDropdownRef.current && !etiquetaDropdownRef.current.contains(e.target)) {
        if (activeModalDropdown === 'etiqueta') setActiveModalDropdown(null);
      }
      if (filtroTecnicoRef.current && !filtroTecnicoRef.current.contains(e.target)) {
        setFiltroTecnicoDropdownAberto(false);
      }
      if (tableContainerRef.current && !tableContainerRef.current.contains(e.target)) {
        setExpandedChamadoId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeModalDropdown]);
  const [solicitanteSelecionado, setSolicitanteSelecionado] = useState(null);
  const [solicitanteManual, setSolicitanteManual] = useState('');
  const [modoCadastroColab, setModoCadastroColab] = useState(false);
  const [novoColabNome, setNovoColabNome] = useState('');
  const [novoColabCargo, setNovoColabCargo] = useState('');
  const [novoColabEmail, setNovoColabEmail] = useState('');
  const [novoColabTelefone, setNovoColabTelefone] = useState('');

  // Atribuição de Atendente
  const [tecnicoAtribuido, setTecnicoAtribuido] = useState(userEmail || 'admin@rmcontrole.com');
  const [iniciarDireto, setIniciarDireto] = useState(false);
  const [dropdownTecnicoAberto, setDropdownTecnicoAberto] = useState(false);
  const [novaObservacao, setNovaObservacao] = useState('');
  const [feedback, setFeedback] = useState('');

  // Categorias de Demandas
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState([]);
  // Multi-seleção de departamentos com persistência de padrão do usuário
  const [filtrosDepartamentos, setFiltrosDepartamentos] = useState(() => {
    if (typeof window !== 'undefined' && userEmail) {
      try {
        const salvos = localStorage.getItem(`rm_padrao_departamentos_${userEmail}`);
        if (salvos) return JSON.parse(salvos);
      } catch (e) {}
    }
    return [];
  });
  const [filtroDeptDropdownAberto, setFiltroDeptDropdownAberto] = useState(false);
  const filtroDeptRef = useRef(null);
  const filtroCategoria = (filtrosDepartamentos && filtrosDepartamentos.length === 1) ? filtrosDepartamentos[0] : (filtrosDepartamentos && filtrosDepartamentos.length > 1 ? filtrosDepartamentos.join(", ") : "todas");

  // Filtro de Técnico com persistência de padrão do usuário
  const [filtroTecnico, setFiltroTecnico] = useState(() => {
    if (typeof window !== 'undefined' && userEmail) {
      try {
        const salvo = localStorage.getItem(`rm_padrao_tecnico_${userEmail}`);
        if (salvo) return salvo;
      } catch (e) {}
    }
    return 'todos';
  });

  // Padrões salvos do usuário para detecção reativa de alterações
  const [padraoSalvoDepartamentos, setPadraoSalvoDepartamentos] = useState(() => {
    if (typeof window !== 'undefined' && userEmail) {
      try {
        return JSON.parse(localStorage.getItem(`rm_padrao_departamentos_${userEmail}`) || '[]');
      } catch (e) {}
    }
    return [];
  });

  const [padraoSalvoTecnico, setPadraoSalvoTecnico] = useState(() => {
    if (typeof window !== 'undefined' && userEmail) {
      return localStorage.getItem(`rm_padrao_tecnico_${userEmail}`) || 'todos';
    }
    return 'todos';
  });

  const isFiltroDiferenteDoPadrao = useMemo(() => {
    const depsIguais =
      filtrosDepartamentos.length === padraoSalvoDepartamentos.length &&
      filtrosDepartamentos.every((d) => padraoSalvoDepartamentos.includes(d));
    const tecIgual = filtroTecnico === padraoSalvoTecnico;
    return !depsIguais || !tecIgual;
  }, [filtrosDepartamentos, padraoSalvoDepartamentos, filtroTecnico, padraoSalvoTecnico]);

  const handleSalvarComoPadrao = () => {
    if (typeof window !== 'undefined' && userEmail) {
      localStorage.setItem(`rm_padrao_departamentos_${userEmail}`, JSON.stringify(filtrosDepartamentos));
      localStorage.setItem(`rm_padrao_tecnico_${userEmail}`, filtroTecnico);
      setPadraoSalvoDepartamentos([...filtrosDepartamentos]);
      setPadraoSalvoTecnico(filtroTecnico);
      showToast('Filtros de departamentos e operador salvos como seu padrão!', 'success');
    }
  };
  const [novasCategoriasModal, setNovasCategoriasModal] = useState(['Suporte']);
  const [novasEtiquetasModal, setNovasEtiquetasModal] = useState([]);
  const [inputEtiqueta, setInputEtiqueta] = useState('');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('todas');
  const [kanbanAberto, setKanbanAberto] = useState(false);
  const [silenciarMeuDispositivo, setSilenciarMeuDispositivo] = useState(true);
  const [isClient, setIsClient] = useState(false);

  // Estados para Adiar Alerta (Snooze), Edição de Etiquetas e Escalonamento SLA
  const [snoozePopoverChamadoId, setSnoozePopoverChamadoId] = useState(null);
  const [tagInputChamadoId, setTagInputChamadoId] = useState(null);
  const [tagInputVal, setTagInputVal] = useState('');
  const [tempoEscalonamentoModal, setTempoEscalonamentoModal] = useState(15);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fecha o popover de Adiar Alerta ao clicar fora
  useEffect(() => {
    const handleCloseSnooze = () => setSnoozePopoverChamadoId(null);
    if (snoozePopoverChamadoId) {
      document.addEventListener('click', handleCloseSnooze);
      return () => document.removeEventListener('click', handleCloseSnooze);
    }
  }, [snoozePopoverChamadoId]);

  // Auto-recolhimento das métricas operacionais após 5 segundos ou ao scrollar
  const autoCollapseTimerQueueRef = useRef(null);

  useEffect(() => {
    // Exibe as métricas por 5 segundos e depois recolhe suavemente
    autoCollapseTimerQueueRef.current = setTimeout(() => {
      setMetricasRecolhidas(true);
    }, 5000);

    const handleScroll = () => {
      if (window.scrollY > 20) {
        if (autoCollapseTimerQueueRef.current) {
          clearTimeout(autoCollapseTimerQueueRef.current);
          autoCollapseTimerQueueRef.current = null;
        }
        setMetricasRecolhidas(true);
      }
    };

    const handleResize = () => {
      if (typeof window !== 'undefined' && window.innerWidth < 1440) {
        setMetricasRecolhidas(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      if (autoCollapseTimerQueueRef.current) clearTimeout(autoCollapseTimerQueueRef.current);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Fechar dropdown de departamento ao clicar fora
  useEffect(() => {
    const handleClickOutsideDept = (e) => {
      if (filtroDeptRef.current && !filtroDeptRef.current.contains(e.target)) {
        setFiltroDeptDropdownAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideDept);
    return () => document.removeEventListener('mousedown', handleClickOutsideDept);
  }, []);

  // Sequência de carregamento: uma carga antiga e lenta nunca sobrescreve uma mais recente
  // (antes, uma demanda recém-criada podia "sumir" quando um sync anterior terminava depois)
  const cargaSeqRef = useRef(0);
  // Diagnóstico: demandas que existem no banco mas não chegaram a este usuário (e o motivo)
  const [diagnosticoVisibilidade, setDiagnosticoVisibilidade] = useState(null);
  const ultimoDiagnosticoRef = useRef(0);

  // Monta a lista exibida a partir do que já está em memória (cache local + última sincronização)
  const montarListaChamados = () => {
    const ativos = getChamadosSuporte();
    const historico = getHistoricoChamados();
    const historicoIds = new Set((historico || []).map((h) => h.id));

    // Filtra estritamente apenas chamados ativos que NÃO tenham sido finalizados nem estejam no histórico.
    // A deduplicação é feita apenas por ID: a antiga assinatura empresa+solicitante+janela de 20s
    // escondia demandas legítimas (ex.: duas demandas da mesma empresa sem observação).
    const mapa = new Map();

    (ativos || []).forEach((c) => {
      if (!c || !c.id) return;
      if (c.status === 'concluido' || c.status === 'finalizado' || c.status === 'cancelado') return;
      if (c.finalizado_em) return;
      if (historicoIds.has(c.id)) return;
      if (isChamadoFeedback(c)) return;
      if (!mapa.has(c.id)) mapa.set(c.id, c);
    });

    // Chamados do histórico entram com status estritamente 'concluido'
    (historico || []).forEach((c) => {
      if (!mapa.has(c.id)) {
        mapa.set(c.id, {
          ...c,
          status: 'concluido',
          finalizado_em: c.finalizado_em || c.updated_at || new Date().toISOString(),
        });
      }
    });

    // Perfil de acesso: só as demandas dos departamentos que a pessoa enxerga
    const perm = getPermissoesAtuais();
    return Array.from(mapa.values()).filter((c) => podeVerDemanda(perm, c));
  };

  const carregarDados = async () => {
    const seq = ++cargaSeqRef.current;
    // Fase 1: a fila aparece assim que as demandas ativas chegam, sem esperar histórico e empresas
    const fila = fetchChamadosFila()
      .catch(() => {})
      .then(() => {
        if (seq !== cargaSeqRef.current) return;
        setChamados(montarListaChamados());
        setCarregado(true);
      });
    try {
      await Promise.all([fila, fetchHistoricoChamados(), fetchEquipeUsuarios()]);
    } catch (e) {}
    if (seq !== cargaSeqRef.current) return;
    // Fase 2: com o histórico em mãos, recalcula (resolvidos hoje, itens já finalizados)
    setChamados(montarListaChamados());
    setCarregado(true);

    if (Date.now() - ultimoDiagnosticoRef.current > 60000) {
      ultimoDiagnosticoRef.current = Date.now();
      diagnosticarVisibilidadeFila().then(setDiagnosticoVisibilidade).catch(() => {});
    }
    setEquipeLista(getEquipeUsuarios());
    setCategoriasDisponiveis(departamentosVisiveis(getPermissoesAtuais(), getCategoriasDemandas()));
    const resEmp = await getEmpresas({ pageSize: 1000 });
    const lista = Array.isArray(resEmp) ? resEmp : (resEmp?.items || []);
    const listaOrdenada = [...lista].sort((a, b) =>
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })
    );
    setEmpresasLista(listaOrdenada);
  };

  useEffect(() => {
    // Ao voltar para a aba, mostra na hora o que já está em memória; a sincronização atualiza em seguida
    const emCache = montarListaChamados();
    if (emCache.length > 0) {
      setChamados(emCache);
      setCarregado(true);
    }
    carregarDados();
  }, []);

  useEffect(() => {
    const handleUpdate = () => carregarDados();
    const handleCatsUpdated = () => setCategoriasDisponiveis(departamentosVisiveis(getPermissoesAtuais(), getCategoriasDemandas()));
    window.addEventListener('suporte_updated', handleUpdate);
    window.addEventListener('equipe_updated', handleUpdate);
    window.addEventListener('categorias_demandas_updated', handleCatsUpdated);
    // Perfil mudou (ou "Ver o sistema como"): refiltra a fila e os departamentos
    const handlePerfil = () => {
      setChamados(montarListaChamados());
      handleCatsUpdated();
    };
    window.addEventListener('user_role_updated', handlePerfil);
    window.addEventListener('perfis_updated', handlePerfil);

    // Ticker a cada 1 segundo para atualizar cronômetros e verificar escalonamento de SLA
    const timer = setInterval(() => {
      setTick((t) => t + 1);

      // Verificação de Escalonamento: se chamado atribuído a funcionário extrapolou o tempo limite sem resolução
      try {
        const chamadosAtuais = getChamadosSuporte();
        const agoraMs = Date.now();
        const myEmail = (userEmail || '').toLowerCase().trim();
        const isAdmin = getCurrentUserRole() === 'administrador';

        chamadosAtuais.forEach((ch) => {
          const isPendente = ch.status === 'aguardando_visualizacao' || ch.status === 'pendente' || ch.status === 'em_andamento';
          if (!isPendente) return;
          if (!ch.tecnico_email || ch.is_fila_geral) return;

          const atribuidoPor = (ch.atribuido_por_email || '').toLowerCase().trim();
          const souEuQuemAtribuiu = atribuidoPor === myEmail;

          if ((souEuQuemAtribuiu || isAdmin) && !ch.escalonado_notificado) {
            const atribuidoEmMs = new Date(ch.atribuido_em || ch.created_at || ch.tempo_espera_inicio || agoraMs).getTime();
            const limiteMin = ch.tempo_escalonamento_minutos || 15;
            const diffMin = Math.floor((agoraMs - atribuidoEmMs) / 60000);

            if (diffMin >= limiteMin) {
              marcarChamadoEscalonado(ch.id);
              try {
                playNotificationTone('dinamico');
              } catch (e) {}
              showToast(
                `⚠️ Demanda de "${ch.empresa_nome}" atribuída a ${ch.tecnico_nome || 'técnico'} não foi concluída em ${limiteMin} min!`,
                'warning'
              );
            }
          }
        });
      } catch (e) {}
    }, 1000);

    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      window.removeEventListener('equipe_updated', handleUpdate);
      window.removeEventListener('categorias_demandas_updated', handleCatsUpdated);
      window.removeEventListener('user_role_updated', handlePerfil);
      window.removeEventListener('perfis_updated', handlePerfil);
      clearInterval(timer);
    };
  }, []);

  const showFeedbackMsg = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3500);
  };

  // Função de formatação humanizada de duração: dias, horas, minutos e segundos (evita minutos gigantes)
  const formatarTempoDinamico = (segundos) => {
    if (!segundos || isNaN(segundos) || segundos <= 0) return '00:00';
    const totalSeg = Math.floor(segundos);
    const dias = Math.floor(totalSeg / 86400);
    const horas = Math.floor((totalSeg % 86400) / 3600);
    const mins = Math.floor((totalSeg % 3600) / 60);
    const secs = totalSeg % 60;

    if (dias > 0) {
      return `${dias}d ${horas.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    if (horas > 0) {
      return `${horas.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cronômetro 1: Tempo em Espera (Real e Preciso com Dias, Horas, Minutos e Segundos)
  const calcularTempoEspera = (chamado) => {
    const agora = Date.now();
    const dataCriacao = chamado.created_at || chamado.tempo_espera_inicio;
    const inicioEspera = new Date(chamado.tempo_espera_inicio || dataCriacao || agora).getTime();
    
    // 1. Se tem tempo_espera_segundos gravado maior que 0:
    if (chamado.tempo_espera_segundos && chamado.tempo_espera_segundos > 0) {
      return formatarTempoDinamico(chamado.tempo_espera_segundos);
    }

    // 2. Se já foi aceito e possui tempo_espera_fim registrado:
    if (chamado.tempo_espera_fim && inicioEspera) {
      const fimEspera = new Date(chamado.tempo_espera_fim).getTime();
      const diff = Math.max(0, Math.floor((fimEspera - inicioEspera) / 1000));
      return formatarTempoDinamico(diff);
    }

    // 3. Se está em andamento (assumido) e possui horário de início ativo:
    if (chamado.status === 'em_andamento') {
      const fim = new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em || agora).getTime();
      const diff = Math.max(0, Math.floor((fim - inicioEspera) / 1000));
      return formatarTempoDinamico(diff);
    }

    // 4. Se continua aguardando um atendente (ao vivo):
    if (chamado.status === 'aguardando_visualizacao') {
      const diffSeg = Math.max(0, Math.floor((agora - inicioEspera) / 1000));
      return formatarTempoDinamico(diffSeg);
    }

    // Aguardando cliente sem registro da espera inicial: não inventa um número que só cresce
    if (chamado.status === 'pendente') return '—';

    return '00:00';
  };

  // Cronômetro 2: Tempo Ativo (Em Atendimento com Dias, Horas, Minutos e Segundos)
  const calcularTempoAtivo = (chamado) => {
    if (chamado.status !== 'em_andamento') {
      if (chamado.status === 'concluido' || chamado.status === 'finalizado') {
        const segs = chamado.tempo_ativo_segundos || chamado.duracao_segundos || 0;
        return formatarTempoDinamico(segs);
      }
      return '00:00';
    }

    const agora = Date.now();
    const inicio = new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em || agora).getTime();
    const diffSeg = Math.max(0, Math.floor((agora - inicio) / 1000));
    return formatarTempoDinamico(diffSeg);
  };

  // Colaboradores da empresa selecionada no modal. getEmpresaById é assíncrono: antes era chamado
  // sem await dentro de try/catch, então o erro "Empresa não encontrada" (empresa nova ou fora do
  // cache) escapava como erro não tratado e os colaboradores nunca eram carregados.
  const [colaboradoresCadastro, setColaboradoresCadastro] = useState([]);
  useEffect(() => {
    setColaboradoresCadastro([]);
    if (!empresaSelecionada?.id || empresaSelecionada.isNova) return undefined;
    let cancelado = false;
    getEmpresaById(empresaSelecionada.id)
      .then((empFull) => {
        if (cancelado || !Array.isArray(empFull?.colaboradores)) return;
        setColaboradoresCadastro(
          empFull.colaboradores.map((col) => ({
            id: col.id,
            nome: col.nome,
            cargo: col.cargo || 'Colaborador',
            email: col.email || '',
            telefone: col.telefone || '',
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [empresaSelecionada?.id, empresaSelecionada?.isNova]);

  const colaboradoresEmpresaAtual = useMemo(() => {
    if (!empresaSelecionada || empresaSelecionada.isNova) return [];
    const list = [];
    const creds = getEmpresaCredenciais(empresaSelecionada.id) || [];
    creds.forEach((cr) => {
      list.push({
        id: cr.id,
        nome: cr.rotulo || cr.email_administrador || cr.usuario_email || 'Acesso Principal',
        cargo: 'Acesso Principal / Admin',
        email: cr.email_administrador || cr.usuario_email || '',
        telefone: '',
      });
    });
    return [...list, ...colaboradoresCadastro];
  }, [empresaSelecionada, colaboradoresCadastro]);

  const empresasFiltradasBusca = useMemo(() => {
    if (!buscaEmpresa.trim()) return empresasLista;
    const q = buscaEmpresa.toLowerCase().trim();
    return empresasLista.filter((e) => (e.nome || '').toLowerCase().includes(q));
  }, [empresasLista, buscaEmpresa]);

  const colaboradoresFiltradosBusca = useMemo(() => {
    if (!buscaSolicitante.trim()) return colaboradoresEmpresaAtual;
    const q = buscaSolicitante.toLowerCase().trim();
    return colaboradoresEmpresaAtual.filter((c) => 
      c.nome.toLowerCase().includes(q) || (c.cargo || '').toLowerCase().includes(q)
    );
  }, [colaboradoresEmpresaAtual, buscaSolicitante]);

  // Lista consolidada de todas as etiquetas já registradas no histórico ou padrões recomendados
  const todasEtiquetasDisponiveis = useMemo(() => {
    const padroes = ['Urgente', 'Alta Prioridade', 'Bug / Erro', 'Dúvida Operacional', 'Ajuste de Sistema', 'Financeiro', 'Treinamento', 'Implantação', 'Melhoria', 'Acesso'];
    const setTags = new Set(padroes);
    (chamados || []).forEach((c) => {
      if (Array.isArray(c.etiquetas)) {
        c.etiquetas.forEach((t) => {
          if (t && typeof t === 'string' && t.trim()) setTags.add(t.trim().replace(/^#/, ''));
        });
      }
    });
    return Array.from(setTags);
  }, [chamados]);

  // Etiquetas filtradas para o autocomplete inteligente no modal de demandas
  const etiquetasFiltradasModal = useMemo(() => {
    const jaSelecionadas = new Set(novasEtiquetasModal.map((t) => t.toLowerCase().trim().replace(/^#/, '')));
    const q = removerAcentos(inputEtiqueta.toLowerCase().trim().replace(/^#/, ''));
    const disponiveis = todasEtiquetasDisponiveis.filter((t) => !jaSelecionadas.has(t.toLowerCase().trim()));
    if (!q) return disponiveis.slice(0, 10);
    return disponiveis.filter((t) => removerAcentos(t.toLowerCase()).includes(q));
  }, [todasEtiquetasDisponiveis, novasEtiquetasModal, inputEtiqueta]);

  // Lista Filtrada com bloqueio de departamentos e filtro de etiquetas
  // Lista consolidada de colaboradores / técnicos com DEDUPLICAÇÃO CANÔNICA DE PESSOA (elimina colunas duplicadas)
  const listaTecnicosKanban = useMemo(() => {
    const mapa = new Map();

    // 1. Membros cadastrados na equipe (deduplicados por pessoa física)
    (equipeLista || []).forEach((m) => {
      if (!m) return;
      const email = (m.email || '').toLowerCase().trim();
      const nome = m.nome || getNomeTecnico(email);
      if (!email && !nome) return;

      const canonicalKey = getCanonicalPersonKey(email, nome);
      if (!mapa.has(canonicalKey)) {
        mapa.set(canonicalKey, {
          id: m.id || canonicalKey,
          key: canonicalKey,
          nome: canonicalKey === 'lucas_amorim' ? 'Lucas Amorim' : nome.replace(/\(.*?\)/g, '').trim(),
          email: email || `${canonicalKey}@rmcontrole.com`,
          emails: email ? [email] : [],
          cargo: m.cargo || (canonicalKey === 'lucas_amorim' ? 'Administrador' : (m.papel === 'administrador' ? 'Administrador' : 'Técnico')),
        });
      } else {
        const existing = mapa.get(canonicalKey);
        if (email && !existing.emails.includes(email)) {
          existing.emails.push(email);
        }
      }
    });

    // 2. Colaboradores que possuem chamados ativos ou em espera
    (chamados || []).forEach((c) => {
      if (isChamadoFeedback(c)) return;
      if (c.finalizado_em || c.status === 'concluido' || c.status === 'finalizado') return;
      const email = (c.tecnico_email || '').toLowerCase().trim();
      const nome = c.tecnico_nome || c.atendente;
      if (!email && (!nome || nome === 'Não informado' || nome === 'Colaborador')) return;

      const canonicalKey = getCanonicalPersonKey(email, nome);
      if (!mapa.has(canonicalKey)) {
        mapa.set(canonicalKey, {
          id: canonicalKey,
          key: canonicalKey,
          nome: canonicalKey === 'lucas_amorim' ? 'Lucas Amorim' : (nome || getNomeTecnico(email)).replace(/\(.*?\)/g, '').trim(),
          email: email || `${canonicalKey}@rmcontrole.com`,
          emails: email ? [email] : [],
          cargo: 'Técnico',
        });
      } else {
        const existing = mapa.get(canonicalKey);
        if (email && !existing.emails.includes(email)) {
          existing.emails.push(email);
        }
      }
    });

    // Garante presença do usuário logado se ele for operador/admin
    if (userEmail) {
      const myKey = getCanonicalPersonKey(userEmail, getNomeTecnico(userEmail));
      if (!mapa.has(myKey)) {
        mapa.set(myKey, {
          id: myKey,
          key: myKey,
          nome: myKey === 'lucas_amorim' ? 'Lucas Amorim' : getNomeTecnico(userEmail).replace(/\(.*?\)/g, '').trim(),
          email: userEmail.toLowerCase().trim(),
          emails: [userEmail.toLowerCase().trim()],
          cargo: 'Operador',
        });
      }
    }

    return Array.from(mapa.values());
  }, [equipeLista, chamados, userEmail]);

  // Target do técnico selecionado pelo filtro (ou null se for 'todos' ou 'nao_atribuido')
  const targetTec = useMemo(() => {
    if (!filtroTecnico || filtroTecnico === 'todos' || filtroTecnico === 'nao_atribuido') return null;
    return (
      listaTecnicosKanban.find((t) => 
        t.key === filtroTecnico ||
        t.id === filtroTecnico || 
        (t.email && t.email.toLowerCase().trim() === filtroTecnico.toLowerCase().trim()) || 
        (t.emails && t.emails.includes(filtroTecnico.toLowerCase().trim())) ||
        (t.nome && removerAcentos(t.nome.toLowerCase().trim()) === removerAcentos(filtroTecnico.toLowerCase().trim()))
      ) || null
    );
  }, [filtroTecnico, listaTecnicosKanban]);

  // Mapeamento exclusivo: atribui cada chamado ativo para EXATAMENTE UMA coluna de técnico
  const getChamadoTecnicoKey = (c) => {
    if (!c) return null;
    if (c.status !== 'em_andamento' || c.finalizado_em || c.status === 'concluido' || c.status === 'finalizado') {
      return null;
    }
    const email = (c.tecnico_email || '').toLowerCase().trim();
    const atribuido = (c.atribuido_a || '').toLowerCase().trim();
    const nome = c.tecnico_nome || c.atendente;

    // 1. Match estrito por e-mail ou lista de aliases de e-mail do técnico
    for (const tec of listaTecnicosKanban) {
      if (email && (tec.email === email || (tec.emails && tec.emails.includes(email)))) {
        return tec.key;
      }
      if (atribuido && (tec.email === atribuido || (tec.emails && tec.emails.includes(atribuido)))) {
        return tec.key;
      }
    }

    // 2. Match por chave canônica de identidade
    const key = getCanonicalPersonKey(email, nome);
    const match = listaTecnicosKanban.find((t) => t.key === key);
    if (match) return match.key;

    // 3. Match por nome limpo
    const nomeClean = removerAcentos((nome || '').toLowerCase().trim());
    if (nomeClean) {
      for (const tec of listaTecnicosKanban) {
        const tecNomeClean = removerAcentos(tec.nome.toLowerCase().trim());
        if (tecNomeClean && (nomeClean.includes(tecNomeClean) || tecNomeClean.includes(nomeClean))) {
          return tec.key;
        }
      }
    }

    return null;
  };

  const isChamadoDoTecnico = (chamado, tec) => {
    if (!chamado || !tec) return false;
    return getChamadoTecnicoKey(chamado) === tec.key;
  };

  // Manipulador unificado do filtro por colaborador: atualiza filtro, recolhe os demais no Kanban e rola até a coluna
  const handleSelecionarFiltroTecnico = (valor) => {
    setFiltroTecnico(valor);
    setFiltroTecnicoDropdownAberto(false);
    setBuscaFiltroTecnico('');

    if (valor === 'todos') {
      setColaboradoresRecolhidos([]);
      setKanbanPreset('expandir_todos');
    } else if (valor === 'nao_atribuido') {
      const todosKeys = listaTecnicosKanban.map(getTecKey);
      setColaboradoresRecolhidos(todosKeys);
      setKanbanPreset('custom');
      kanbanScrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      const tecObj = listaTecnicosKanban.find((t) => 
        (t.id && t.id === valor) || 
        (t.email && t.email.toLowerCase().trim() === valor.toLowerCase().trim()) || 
        (t.nome && removerAcentos(t.nome.toLowerCase().trim()) === removerAcentos(valor.toLowerCase().trim()))
      );
      if (tecObj) {
        const targetKey = getTecKey(tecObj);
        // Expande apenas o colaborador selecionado e recolhe os outros
        const outros = listaTecnicosKanban
          .filter((t) => getTecKey(t) !== targetKey)
          .map(getTecKey);
        setColaboradoresRecolhidos(outros);
        setKanbanPreset('custom');

        // Scroll suave até a coluna do colaborador
        setTimeout(() => {
          try {
            const colEl = document.getElementById('kanban-col-' + targetKey);
            if (colEl) {
              colEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
          } catch (e) {}
        }, 120);
      }
    }
  };

  // Efeito orquestrado: quando o preset for 'foco_mim' e filtroTecnico estiver em 'todos'
  useEffect(() => {
    if (kanbanPreset === 'foco_mim' && filtroTecnico === 'todos' && listaTecnicosKanban.length > 0) {
      const outros = listaTecnicosKanban
        .filter((t) => !isTecnicoMim(t))
        .map(getTecKey);
      if (outros.length > 0) {
        setColaboradoresRecolhidos((prev) => {
          const prevSet = new Set(prev);
          const isSame = outros.length === prev.length && outros.every((k) => prevSet.has(k));
          return isSame ? prev : outros;
        });
      }
    }
  }, [listaTecnicosKanban, userEmail, kanbanPreset, filtroTecnico]);

  // Efeito ao alternar para visualização Kanban com um colaborador selecionado (blindado contra reset por ticker/interval/polling)
  useEffect(() => {
    if (filaViewMode === 'kanban' && targetTec && kanbanPreset !== 'expandir_todos' && kanbanPreset !== 'recolher_todos') {
      const targetKey = getTecKey(targetTec);
      const outros = listaTecnicosKanban
        .filter((t) => getTecKey(t) !== targetKey)
        .map(getTecKey);
      setColaboradoresRecolhidos((prev) => {
        const prevSet = new Set(prev);
        const isSame = outros.length === prev.length && outros.every((k) => prevSet.has(k));
        return isSame ? prev : outros;
      });
      setTimeout(() => {
        try {
          const colEl = document.getElementById('kanban-col-' + targetKey);
          if (colEl) {
            colEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        } catch (e) {}
      }, 150);
    }
  }, [filaViewMode, targetTec]);

  // Aliases seguros para garantir retrocompatibilidade de referências no modal
  const solicitantesEmpresa = colaboradoresEmpresaAtual;
  const empresasFiltradasDropdown = empresasFiltradasBusca;

  // Permissões e Usuário
  const usuarioLogado = useMemo(() => {
    return Array.isArray(equipeLista)
      ? equipeLista.find((u) => (u.email || '').toLowerCase().trim() === (userEmail || '').toLowerCase().trim())
      : null;
  }, [equipeLista, userEmail]);

  const depsBloqueados = useMemo(() => {
    return Array.isArray(usuarioLogado?.departamentos_bloqueados)
      ? usuarioLogado.departamentos_bloqueados.map((d) => d.toLowerCase().trim())
      : [];
  }, [usuarioLogado]);

  const ehAdmin = useMemo(() => {
    return (
      usuarioLogado?.papel === 'administrador' || getCurrentUserRole() === 'administrador'
    );
  }, [usuarioLogado]);

  // KPIs (filtra estritamente chamados ativos e remove chamados finalizados ou com data de término)
  const emAndamento = useMemo(() => chamados.filter((c) => c.status === 'em_andamento' && !c.finalizado_em && c.status !== 'concluido' && c.status !== 'finalizado'), [chamados]);
  // Aguardando atendente = ninguém pegou ainda. Aguardando cliente (status 'pendente') = já tem responsável, esperando retorno.
  const emEspera = useMemo(() => chamados.filter((c) => c.status === 'aguardando_visualizacao' && !c.finalizado_em && !isChamadoFeedback(c)), [chamados]);
  const aguardandoCliente = useMemo(() => chamados.filter((c) => c.status === 'pendente' && !c.finalizado_em && !isChamadoFeedback(c)), [chamados]);
  const isDataHoje = (dataStr) => {
    if (!dataStr) return false;
    const d = new Date(dataStr);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  const resolvidosHoje = useMemo(() => {
    return chamados.filter((c) => {
      const isConcluido = c.status === 'concluido' || c.status === 'finalizado';
      if (!isConcluido) return false;
      return isDataHoje(c.finalizado_em || c.created_at || c.iniciado_em);
    });
  }, [chamados]);

  // Tempo Médio de Espera (TME) de hoje
  const tmeHojeMinutos = useMemo(() => {
    const concluidos = resolvidosHoje.filter((c) => c.tempo_espera_segundos > 0);
    if (concluidos.length === 0) return 0;
    const soma = concluidos.reduce((acc, c) => acc + (c.tempo_espera_segundos || 0), 0);
    return Math.round((soma / concluidos.length) / 60);
  }, [resolvidosHoje]);

  // Chamados da fila de espera filtrados para a Coluna Fixa do Kanban
  const chamadosEsperaKanban = useMemo(() => {
    return chamados
      .filter((c) => {
        if (c.status !== 'aguardando_visualizacao' && c.status !== 'pendente') return false;
        if (c.finalizado_em || c.status === 'concluido' || c.status === 'finalizado' || c.status === 'cancelado') return false;
        if (!ehAdmin && depsBloqueados.length > 0) {
          const cats = Array.isArray(c.categorias) && c.categorias.length > 0 ? c.categorias : ['Suporte'];
          const isBloqueado = cats.some((cat) => depsBloqueados.includes((cat || '').toLowerCase().trim()));
          if (isBloqueado) return false;
        }
        if (filtroCategoria && filtroCategoria !== 'todas') {
          const catQ = filtroCategoria.toLowerCase().trim();
          const cats = Array.isArray(c.categorias) && c.categorias.length > 0 ? c.categorias : ['Suporte'];
          if (!cats.some((cat) => (cat || '').toLowerCase().trim() === catQ)) return false;
        }
        if (filtroEtiqueta && filtroEtiqueta !== 'todas') {
          const etqQ = filtroEtiqueta.toLowerCase().trim();
          const etqs = Array.isArray(c.etiquetas) ? c.etiquetas : [];
          if (!etqs.some((e) => (e || '').toLowerCase().trim() === etqQ)) return false;
        }
        if (busca.trim()) {
          const q = busca.toLowerCase().trim();
          const nomeMatch = (c.empresa_nome || '').toLowerCase().includes(q);
          const solMatch = (c.solicitante_nome || c.solicitante || '').toLowerCase().includes(q);
          const descMatch = (c.observacao_inicial || c.descricao || '').toLowerCase().includes(q);
          if (!nomeMatch && !solMatch && !descMatch) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [chamados, ehAdmin, depsBloqueados, filtrosDepartamentos, filtroEtiqueta, busca]);

  // Lista Filtrada para as Visualizações em Cards e Lista (tabela)
  const chamadosFiltrados = useMemo(() => {
    return chamados.filter((c) => {
      if (isChamadoFeedback(c)) return false;
      // Bloqueio de visibilidade por departamento se o colaborador estiver restrito
      if (!ehAdmin && depsBloqueados.length > 0) {
        const cats = Array.isArray(c.categorias) && c.categorias.length > 0 ? c.categorias : ['Suporte'];
        const isBloqueado = cats.some((cat) => depsBloqueados.includes((cat || '').toLowerCase().trim()));
        if (isBloqueado) return false;
      }

      if (filtroEtiqueta && filtroEtiqueta !== 'todas') {
        const etqQ = filtroEtiqueta.toLowerCase().trim();
        const etqs = Array.isArray(c.etiquetas) ? c.etiquetas : [];
        if (!etqs.some((e) => (e || '').toLowerCase().trim() === etqQ)) return false;
      }
      // Se não for a aba resolvidos_hoje, NUNCA exibe chamados concluídos ou que tenham data de término
      if (filtroStatus !== 'resolvidos_hoje') {
        if (c.status === 'concluido' || c.status === 'finalizado' || c.status === 'cancelado' || Boolean(c.finalizado_em)) {
          return false;
        }
      }

      if (filtroStatus === 'ativos') {
        if (c.status !== 'em_andamento' && c.status !== 'pendente' && c.status !== 'aguardando_visualizacao') return false;
      } else if (filtroStatus === 'em_andamento') {
        if (c.status !== 'em_andamento') return false;
      } else if (filtroStatus === 'espera') {
        if (c.status !== 'aguardando_visualizacao') return false;
      } else if (filtroStatus === 'cliente') {
        if (c.status !== 'pendente') return false;
      } else if (filtroStatus === 'resolvidos_hoje') {
        const isConcluido = c.status === 'concluido' || c.status === 'finalizado' || Boolean(c.finalizado_em);
        if (!isConcluido || !isDataHoje(c.finalizado_em || c.created_at || c.iniciado_em)) return false;
      }

      if (filtrosDepartamentos && filtrosDepartamentos.length > 0) {
        const depsAlvo = filtrosDepartamentos.map((d) => (d || '').toLowerCase().trim());
        const cats = Array.isArray(c.categorias) && c.categorias.length > 0 ? c.categorias : ['Suporte'];
        if (!cats.some((cat) => depsAlvo.includes((cat || '').toLowerCase().trim()))) {
          return false;
        }
      }

      // Filtro estrito por Técnico/Colaborador
      if (filtroTecnico && filtroTecnico !== 'todos') {
        if (filtroTecnico === 'nao_atribuido') {
          const isAguardando = c.status === 'aguardando_visualizacao' || c.status === 'pendente';
          const chEmail = (c.tecnico_email || '').trim();
          const chNome = (c.tecnico_nome || '').trim();
          const chAtendente = (c.atendente || '').trim();
          if (!isAguardando && (chEmail || chNome || chAtendente)) {
            return false;
          }
        } else {
          if (!targetTec) return false;
          if (!isChamadoDoTecnico(c, targetTec)) {
            return false;
          }
        }
      }

      if (busca.trim()) {
        const q = busca.toLowerCase().trim();
        const nomeMatch = (c.empresa_nome || '').toLowerCase().includes(q);
        const tecMatch = (c.tecnico_nome || c.tecnico_email || '').toLowerCase().includes(q);
        const solMatch = (c.solicitante_nome || c.solicitante || '').toLowerCase().includes(q);
        const descMatch = (c.observacao_inicial || c.descricao || '').toLowerCase().includes(q);
        return nomeMatch || tecMatch || solMatch || descMatch;
      }

      return true;
    }).sort((a, b) => {
      // Prioridade para chamados em espera primeiro, depois em andamento
      if (a.status === 'aguardando_visualizacao' && b.status !== 'aguardando_visualizacao') return -1;
      if (b.status === 'aguardando_visualizacao' && a.status !== 'aguardando_visualizacao') return 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [chamados, filtroStatus, filtrosDepartamentos, filtroTecnico, targetTec, filtroEtiqueta, busca, ehAdmin, depsBloqueados]);

  // Quantas demandas do status atual existem SEM os filtros pessoais (técnico, departamentos,
  // etiqueta e busca). Cada colaborador tem filtros padrão salvos: sem este aviso, duas pessoas
  // olhando a mesma fila viam listas diferentes sem perceber.
  const totalSemFiltrosPessoais = useMemo(() => {
    return chamados.filter((c) => {
      if (isChamadoFeedback(c)) return false;
      if (!ehAdmin && depsBloqueados.length > 0) {
        const cats = Array.isArray(c.categorias) && c.categorias.length > 0 ? c.categorias : ['Suporte'];
        if (cats.some((cat) => depsBloqueados.includes((cat || '').toLowerCase().trim()))) return false;
      }
      const concluido = c.status === 'concluido' || c.status === 'finalizado' || Boolean(c.finalizado_em);
      if (filtroStatus === 'resolvidos_hoje') return concluido && isDataHoje(c.finalizado_em || c.created_at || c.iniciado_em);
      if (concluido || c.status === 'cancelado') return false;
      if (filtroStatus === 'em_andamento') return c.status === 'em_andamento';
      if (filtroStatus === 'espera') return c.status === 'aguardando_visualizacao';
      if (filtroStatus === 'cliente') return c.status === 'pendente';
      return true;
    }).length;
  }, [chamados, filtroStatus, ehAdmin, depsBloqueados]);
  const ocultasPorFiltro = Math.max(0, totalSemFiltrosPessoais - chamadosFiltrados.length);

  const handleLimparFiltrosPessoais = () => {
    setFiltroTecnico('todos');
    setFiltrosDepartamentos([]);
    setFiltroEtiqueta('todas');
    setBusca('');
  };

  // Ações de Chamado
  // Localiza o cadastro da empresa da demanda (para abrir a tela certa)
  const empresaDoChamado = (ch) =>
    empresasLista.find(
      (e) => (ch.empresa_id && e.id === ch.empresa_id) ||
             (ch.empresa_nome && e.nome && e.nome.trim().toLowerCase() === ch.empresa_nome.trim().toLowerCase())
    ) || (ch.empresa_nome ? { id: ch.empresa_id || ch.empresa_nome, nome: ch.empresa_nome } : null);

  const [assumindoId, setAssumindoId] = useState(null);

  // abrirEmpresa: depois de assumir, já leva para a tela da empresa (sem procurar a demanda na lista)
  const handleAceitarSuporte = async (chamado, { abrirEmpresa = false } = {}) => {
    if (assumindoId) return;
    setAssumindoId(chamado.id);
    try {
      await assumirSuporte({ chamado_id: chamado.id, userEmail: userEmail || 'admin@rmcontrole.com' });
      stopSupportNotificationLoop();
      if (abrirEmpresa && onSelectEmpresa && !chamado.is_demanda_interna) {
        showToast(`Atendimento de ${chamado.empresa_nome} iniciado.`, 'success');
        onSelectEmpresa(empresaDoChamado(chamado) || { id: chamado.empresa_id, nome: chamado.empresa_nome });
        return;
      }
      showFeedbackMsg(`Você aceitou o suporte de ${chamado.empresa_nome}. Cronômetro ativo iniciado!`);
    } catch (err) {
      // Ex.: outro colaborador assumiu primeiro — recarrega para mostrar o estado real
      showToast(err.message || 'Não foi possível assumir a demanda.', 'error');
      await carregarDados();
    } finally {
      setAssumindoId(null);
    }
  };

  const handleConfirmarReatribuicao = async (tecnicoDestino = null) => {
    if (!chamadoParaReatribuir) return;
    const target = tecnicoDestino || listaTecnicosKanban.find((t) => t.email === novoTecnicoReatribuir || t.key === novoTecnicoReatribuir);
    const emailDestino = target?.email || novoTecnicoReatribuir;
    const nomeDestino = target?.nome || getNomeTecnico(emailDestino);

    if (!emailDestino && !nomeDestino) {
      showToast('Selecione o novo atendente responsável.', 'error');
      return;
    }

    try {
      setSalvandoReatribuicao(true);
      await reatribuirChamadoSuporte(chamadoParaReatribuir.id, emailDestino, nomeDestino, userEmail);
      showToast(`Demanda transferida para ${nomeDestino} com sucesso!`, 'success');
      setChamadoParaReatribuir(null);
      setNovoTecnicoReatribuir('');
      await carregarDados();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoReatribuicao(false);
    }
  };

  const handleEncerrarSemResposta = (chamado) => {
    setConfirmDialog({
      title: 'Encerrar por Falta de Retorno?',
      message: `Deseja encerrar o atendimento de "${chamado.empresa_nome}" como "Sem Resposta do Cliente"? O atendimento será finalizado no histórico com essa justificativa.`,
      confirmText: 'Sim, Encerrar Sem Resposta',
      cancelText: 'Voltar',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await finalizarSuporte({
            chamado_id: chamado.id,
            motivo: 'Sem resposta do cliente',
            observacoes: 'Atendimento finalizado por falta de retorno / inatividade do cliente.',
            colaborador_solicitante: chamado.solicitante_nome || 'Colaborador',
            atendente: chamado.tecnico_nome || getNomeTecnico(userEmail),
            userEmail,
            status_resolucao: 'sem_resposta',
          });
          showToast(`Atendimento de "${chamado.empresa_nome}" encerrado por falta de retorno.`, 'info');
          setConfirmDialog(null);
          await carregarDados();
        } catch (err) {
          showToast(err.message || 'Erro ao encerrar chamado.', 'error');
        }
      },
    });
  };

  const handleCancelarChamado = (chamado) => {
    const isHistorico = chamado.status === 'concluido' || chamado.status === 'finalizado';
    setConfirmDialog({
      title: isHistorico ? 'Excluir Atendimento do Histórico?' : 'Cancelar Chamado da Fila?',
      message: isHistorico
        ? `Deseja realmente remover o atendimento de "${chamado.empresa_nome}" do histórico e da fila?`
        : `Deseja realmente cancelar o atendimento de "${chamado.empresa_nome}"? O tempo e o registro serão descartados.`,
      confirmText: isHistorico ? 'Sim, Excluir' : 'Sim, Cancelar',
      cancelText: 'Voltar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await cancelarSuporte({ chamado_id: chamado.id, userEmail });
          stopSupportNotificationLoop();
          showToast(
            isHistorico 
              ? `Atendimento de ${chamado.empresa_nome} removido do histórico.` 
              : `Chamado de ${chamado.empresa_nome} cancelado com sucesso.`, 
            'info'
          );
          setConfirmDialog(null);
          await carregarDados();
        } catch (err) {
          setConfirmDialog(null);
          showToast(err.message || 'Erro ao cancelar chamado.', 'error');
        }
      },
    });
  };

  const handleCadastrarNovoColaboradorInline = async () => {
    if (!novoColabNome.trim()) {
      showToast('Nome do colaborador é obrigatório.', 'error');
      return;
    }
    if (!empresaSelecionada) return;

    try {
      const novo = await addColaboradorEmpresa(empresaSelecionada.id, {
        nome: novoColabNome.trim(),
        cargo: novoColabCargo.trim(),
        email: novoColabEmail.trim(),
        telefone: novoColabTelefone.trim(),
      }, userEmail);

      setSolicitanteSelecionado(novo);
      setModoCadastroColab(false);
      setNovoColabNome('');
      setNovoColabCargo('');
      setNovoColabEmail('');
      setNovoColabTelefone('');
      showFeedbackMsg(`Colaborador ${novo.nome} adicionado à empresa com sucesso.`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleSalvarNovoColaborador = handleCadastrarNovoColaboradorInline;

  // Formulário de nova demanda: empresaInicial já vem escolhida quando a pessoa partiu da busca
  const [novaDemanda, setNovaDemanda] = useState({ aberto: false, empresaInicial: null });
  const handleAbrirModalNovoChamado = () => setNovaDemanda({ aberto: true, empresaInicial: null });

  // ---- Ações diretas da busca de empresas (barra de comando) ----

  // Atender agora: assume a demanda que já aguarda; sem demanda aberta, cria uma no meu nome e inicia
  const handleAtenderAgoraEmpresa = async (emp, demandaEmEspera = null) => {
    if (demandaEmEspera) {
      await handleAceitarSuporte(demandaEmEspera, { abrirEmpresa: true });
      return;
    }
    if (!userEmail) {
      showToast('Não foi possível identificar seu usuário. Entre novamente.', 'error');
      return;
    }
    try {
      await adicionarChamadoFila({
        empresa_id: emp.id,
        empresa_nome: emp.nome,
        categorias: ['Suporte'],
        atribuido_a: userEmail,
        iniciarAgora: true,
        userEmail,
      });
      showToast(`Atendimento de ${emp.nome} iniciado.`, 'success');
      if (onSelectEmpresa) onSelectEmpresa(emp);
      else await carregarDados();
    } catch (err) {
      showToast(err.message || 'Não foi possível iniciar o atendimento.', 'error');
    }
  };

  // Abrir demanda: abre o formulário completo já com a empresa escolhida
  // Ações vindas do cabeçalho compacto (Navbar) quando os botões do topo saem de vista
  // Os botões do topo estão no cabeçalho? (a Navbar avisa; ao voltar, eles voam de lá para cá)
  const [acoesNoCabecalho, setAcoesNoCabecalho] = useState(() => (typeof window !== 'undefined' ? Boolean(window.__rmFilaAcoesNoCabecalho) : false));
  useEffect(() => {
    const aoMudar = (e) => {
      const { encaixado, origens } = e.detail || {};
      setAcoesNoCabecalho(Boolean(encaixado));
      if (encaixado || !origens) return;
      // Volta: cada botão sai de onde estava no cabeçalho e desliza até o seu lugar na página
      requestAnimationFrame(() => {
        document.querySelectorAll('#fila-acoes-topo [data-acao-fila]').forEach((el) => {
          const de = origens[el.dataset.acaoFila];
          if (!de || !el.animate) return;
          const r = el.getBoundingClientRect();
          const dx = de.x - (r.left + r.width / 2);
          const dy = de.y - (r.top + r.height / 2);
          el.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.6 }, { transform: 'translate(0, 0)', opacity: 1 }], {
            duration: 520,
            easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
          });
        });
      });
    };
    window.addEventListener('rm_fila_acoes_cabecalho', aoMudar);
    return () => window.removeEventListener('rm_fila_acoes_cabecalho', aoMudar);
  }, []);

  // (a ref guarda os handlers atuais sem re-inscrever o ouvinte a cada segundo do cronômetro)
  const acoesCabecalhoRef = useRef({});
  acoesCabecalhoRef.current = {
    nova: handleAbrirModalNovoChamado,
    retroativo: () => onRegistrarRetroativo?.(),
    empresas: () => onVerEmpresas?.(''),
  };
  useEffect(() => {
    const aoAcionar = (e) => acoesCabecalhoRef.current[e.detail]?.();
    window.addEventListener('rm_fila_acao', aoAcionar);
    return () => window.removeEventListener('rm_fila_acao', aoAcionar);
  }, []);

  const handleAbrirDemandaEmpresa = (emp) => setNovaDemanda({ aberto: true, empresaInicial: emp });

  // Empresa que não existe: abre o formulário da demanda já com os campos de cadastro da empresa
  const handleCriarEmpresaRapida = (nome) =>
    setNovaDemanda({ aberto: true, empresaInicial: { id: 'temp_nova_' + Date.now(), nome: nome.trim(), isNova: true } });

  // Cria a demanda com o que veio do formulário. Erros sobem para o formulário mostrar (nada é aberto pela metade).
  // paraMim: a demanda fica com quem está logado, o atendimento começa e a tela da empresa abre.
  const criarDemanda = async (dados, { paraMim = false } = {}) => {
    if (paraMim && !userEmail) throw new Error('Não foi possível identificar seu usuário. Entre novamente.');
    const operador = userEmail || 'admin@rmcontrole.com';
    let empresaId = dados.empresa.id;
    let empresaNome = dados.empresa.nome;

    // 1. Empresa nova: cadastra antes da demanda. Se falhar, a demanda não é aberta.
    if (dados.empresa.isNova) {
      const n = dados.novaEmpresa;
      const novaEmp = await createEmpresa({
        nome: empresaNome.trim(),
        formato_atendimento: 'colaborativo',
        servidor_alocado: n.servidor_alocado,
        tipo_cliente: n.tipo_cliente,
        cliente_desde: n.cliente_desde,
        email_administrador: n.email_administrador.trim(),
        senha_suporte: n.senha_suporte.trim(),
        userEmail: operador,
      });
      if (!novaEmp?.id) throw new Error('Não foi possível cadastrar a empresa.');
      empresaId = novaEmp.id;
      empresaNome = novaEmp.nome || empresaNome;
      setEmpresasLista((prev) =>
        [...prev.filter((e) => e.id !== novaEmp.id), novaEmp].sort((a, b) =>
          (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })
        )
      );
    }

    const sol = dados.solicitante;
    const criado = await adicionarChamadoFila({
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      solicitante_nome: sol?.nome || '',
      solicitante_email: sol?.email || '',
      solicitante_telefone: sol?.telefone || '',
      categorias: dados.categorias,
      etiquetas: dados.etiquetas,
      atribuido_a: paraMim ? userEmail : null,
      observacao_inicial: dados.observacao,
      prazo_limite: dados.prazo,
      is_lembrete: dados.lembrete,
      iniciarAgora: paraMim,
      userEmail: operador,
    });

    // 2. Solicitante novo: entra na empresa e em Acessos e Senhas com o nome (e-mail/senha só se informados)
    if (sol?.novo && empresaId) {
      try {
        await addColaboradorEmpresa(empresaId, { nome: sol.nome, email: (sol.email || '').trim(), telefone: '', cargo: 'Solicitante' }, operador);
        await addEmpresaCredencial(empresaId, {
          rotulo: sol.nome,
          nome_usuario: sol.nome,
          usuario_email: (sol.email || '').trim(),
          senha: (sol.senha || '').trim(),
          observacao: '',
        }, operador);
      } catch (eColab) {
        showToast(`Demanda aberta, mas ${sol.nome} não foi cadastrado na empresa: ${eColab.message}`, 'warning');
      }
    }

    setNovaDemanda({ aberto: false, empresaInicial: null });
    await carregarDados();
    if (paraMim && onSelectEmpresa) {
      onSelectEmpresa({ id: empresaId, nome: empresaNome });
    }
    if (criado?.sync_estado === 'pendente') {
      showToast(`Demanda de ${empresaNome} salva neste computador, mas ainda não chegou à equipe. O envio será repetido automaticamente.`, 'warning');
    } else {
      showFeedbackMsg(paraMim ? `Demanda de ${empresaNome} iniciada agora!` : `Demanda de ${empresaNome} aberta na fila.`);
    }
  };

  // ---- Contexto e ações usados por lista, cards, kanban e painel de detalhe ----
  const cfgSuporte = getConfiguracoesSuporte();
  const ctxDemandas = useMemo(
    () => ({ cfg: cfgSuporte, isMeu: isMeuAtendimento }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfgSuporte.tempo_saudavel_minutos, cfgSuporte.tempo_critico_minutos, userEmail]
  );
  const temposDemanda = {
    espera: calcularTempoEspera,
    ativo: calcularTempoAtivo,
    cliente: (ch) => {
      const inicio = new Date(ch.aguardando_cliente_desde || ch.iniciado_em || Date.now()).getTime();
      return formatarTempoDinamico(Math.max(0, Math.floor((Date.now() - inicio) / 1000)));
    },
  };

  const [detalheId, setDetalheId] = useState(null);
  const chamadoDetalhe = detalheId ? chamados.find((c) => c.id === detalheId) || null : null;

  // Esc fecha os detalhes abertos
  useEffect(() => {
    if (!chamadoDetalhe) return undefined;
    const esc = (e) => e.key === 'Escape' && setDetalheId(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [chamadoDetalhe]);

  const acoesDemanda = {
    abrirDetalhe: (ch) => setDetalheId((atual) => (atual === ch.id ? null : ch.id)),
    assumir: async (ch, opcoes = {}) => {
      if (opcoes.abrirEmpresa) setDetalheId(null);
      await handleAceitarSuporte(ch, opcoes);
    },
    // Cliente respondeu: volta a ser atendida (por quem retomar) e abre a empresa
    retomar: async (ch) => {
      setDetalheId(null);
      await handleAceitarSuporte(ch, { abrirEmpresa: !ch.is_demanda_interna });
    },
    concluir: (ch) => {
      setDetalheId(null);
      setChamadoParaFinalizar(ch);
    },
    abrirEmpresa: (ch) => {
      setDetalheId(null);
      if (onSelectEmpresa) onSelectEmpresa(empresaDoChamado(ch) || { id: ch.empresa_id, nome: ch.empresa_nome });
    },
    repassar: (ch) => {
      setDetalheId(null);
      setChamadoParaReatribuir(ch);
      setNovoTecnicoReatribuir('');
    },
    cancelar: (ch) => {
      setDetalheId(null);
      handleCancelarChamado(ch);
    },
    adiar: (ch, mins) => {
      adiarAlertaChamado(ch.id, mins, userEmail);
      carregarDados();
      const hora = new Date(Date.now() + mins * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      showToast(`Alerta adiado. Você será avisado às ${hora}.`, 'info');
    },
    reativarAlerta: (ch) => {
      cancelarAdiarAlertaChamado(ch.id, userEmail);
      carregarDados();
      showToast('Alerta sonoro reativado.', 'info');
    },
    editarDescricao: async (ch, texto) => {
      try {
        await editarDescricaoChamado(ch.id, texto, userEmail);
        await carregarDados();
        showToast('Descrição atualizada.', 'success');
        return true;
      } catch (err) {
        showToast(err.message || 'Não foi possível salvar a descrição.', 'error');
        return false;
      }
    },
    etiquetas: async (ch, lista) => {
      await atualizarEtiquetasChamado(ch.id, lista, userEmail);
      await carregarDados();
    },
    abrirPipeline: () => {
      setDetalheId(null);
      setKanbanAberto(true);
    },
    // Kanban: soltar o card na coluna de alguém atribui a demanda a essa pessoa
    atribuir: async (chamadoId, tec) => {
      const ch = chamados.find((c) => c.id === chamadoId);
      if (!ch) return;
      if (isChamadoDoTecnico(ch, tec)) return;
      try {
        await assumirSuporte({ chamado_id: ch.id, userEmail: tec.email || userEmail });
        await carregarDados();
        showToast(`Demanda de ${ch.empresa_nome} atribuída para ${tec.nome}.`, 'success');
      } catch (err) {
        showToast(err.message || 'Não foi possível atribuir a demanda.', 'error');
      }
    },
  };

  return (
    <div className="text-[#1d1d1f] dark:text-[#f5f5f7]">
      <div className="space-y-6">
      
      {/* ============================================================================== */}
      {/* CABEÇALHO: TÍTULO + AÇÕES PRINCIPAIS                                           */}
      {/* ============================================================================== */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
            Fila de Demandas
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Encontre a empresa, assuma a demanda e resolva — tudo a partir daqui.
          </p>
        </div>

        {/* Ao rolar, estes botões "voam" para o cabeçalho (Navbar) e ficam ocultos aqui, mantendo o espaço */}
        <div id="fila-acoes-topo" className={`flex flex-wrap items-center gap-2 ${acoesNoCabecalho ? 'invisible' : ''}`}>
          {onVerEmpresas && (
            <button
              type="button"
              data-acao-fila="empresas"
              onClick={() => onVerEmpresas('')}
              className="h-10 px-4 rounded-full border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[#1d1d1f] dark:text-white text-xs font-semibold shadow-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.08] flex items-center gap-2 transition-colors cursor-pointer"
              title="Lista completa de empresas, cadastros e filtros"
            >
              <BuildingIcon className="w-3.5 h-3.5" />
              <span>Ver empresas</span>
            </button>
          )}
          {onRegistrarRetroativo && (
            <button
              type="button"
              data-acao-fila="retroativo"
              onClick={onRegistrarRetroativo}
              className="h-10 px-4 rounded-full border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[#1d1d1f] dark:text-white text-xs font-semibold shadow-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.08] flex items-center gap-2 transition-colors cursor-pointer"
              title="Registrar um atendimento que já foi feito, sem passar pela fila"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />
              </svg>
              <span>Suporte retroativo</span>
            </button>
          )}
          <button
            type="button"
            data-acao-fila="nova"
            onClick={handleAbrirModalNovoChamado}
            className="h-10 px-5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20 hover:opacity-95 flex items-center gap-2 transition-opacity cursor-pointer"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span>Nova demanda</span>
          </button>
        </div>
      </div>

      {/* Busca unificada: empresas + ações diretas (atender, abrir demanda, cadastrar) */}
      <QueueCommandBar
        empresas={empresasLista}
        chamados={chamados}
        onAtenderAgora={handleAtenderAgoraEmpresa}
        onAbrirDemanda={handleAbrirDemandaEmpresa}
        onVerEmpresa={onSelectEmpresa ? (emp) => onSelectEmpresa(emp) : null}
        onCriarEmpresa={handleCriarEmpresaRapida}
        onVerTodas={onVerEmpresas || null}
      />

      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold shadow-xs flex items-center gap-2"
        >
          <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{feedback}</span>
        </motion.div>
      )}

      <div className="w-full">
        <div className="min-w-0 w-full space-y-4">

          {/* BARRA DE STATUS, VISUALIZAÇÃO E FILTROS */}
          <div className="relative z-30 rounded-2xl p-2.5 sm:p-3 border border-black/[0.06] dark:border-white/[0.11] bg-white dark:bg-[#1e1e21] shadow-sm space-y-3">
            <div className="flex flex-col xl:flex-row xl:items-center gap-3">

              {/* Status com contagem (substitui o antigo painel lateral de métricas) */}
              <div className="flex gap-1.5 flex-1 min-w-0 overflow-x-auto -mx-1 px-1 pb-0.5 lg:grid lg:grid-cols-5 lg:overflow-visible lg:mx-0 lg:px-0">
                {[
                  { id: 'ativos', label: 'Todos ativos', count: emAndamento.length + emEspera.length + aguardandoCliente.length, dot: 'bg-slate-400' },
                  { id: 'espera', label: 'Aguardando atendente', count: emEspera.length, dot: 'bg-amber-500', ping: emEspera.length > 0 },
                  { id: 'em_andamento', label: 'Em atendimento', count: emAndamento.length, dot: 'bg-emerald-500' },
                  { id: 'cliente', label: 'Aguardando cliente', count: aguardandoCliente.length, dot: 'bg-violet-500' },
                  { id: 'resolvidos_hoje', label: 'Resolvidos hoje', count: resolvidosHoje.length, dot: 'bg-[#4d7c0f] dark:bg-[#84cc16]' },
                ].map((st) => {
                  const isSelected = filtroStatus === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setFiltroStatus(st.id)}
                      aria-pressed={isSelected}
                      className={`text-left px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer flex-shrink-0 min-w-[148px] lg:min-w-0 ${
                        isSelected
                          ? 'bg-[#1d1d1f] dark:bg-white border-transparent text-white dark:text-[#1d1d1f] shadow-sm'
                          : 'border-black/[0.06] dark:border-white/[0.11] hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap">
                        <span className={`relative w-1.5 h-1.5 rounded-full ${st.dot}`}>
                          {st.ping && <span className={`absolute inset-0 rounded-full ${st.dot} animate-ping`} />}
                        </span>
                        {st.label}
                      </span>
                      <span className="block mt-0.5 text-xl font-bold tabular-nums leading-tight">{carregado ? st.count : '–'}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tempo médio + alternador de visualização */}
              <div className="flex items-center justify-between xl:justify-end gap-3 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 whitespace-nowrap" title="Tempo médio de espera até o atendimento, hoje">
                  <ClockIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Espera média hoje</span>
                  <strong className="text-[#1d1d1f] dark:text-white tabular-nums">{tmeHojeMinutos} min</strong>
                </div>

                <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]" role="group" aria-label="Modo de visualização">
                  {[
                    { id: 'list', label: 'Lista', Icon: ViewListIcon },
                    { id: 'cards', label: 'Cards', Icon: ViewGridIcon },
                    { id: 'kanban', label: 'Kanban', Icon: KanbanIcon },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFilaViewMode(id)}
                      aria-pressed={filaViewMode === id}
                      className={`h-8 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer ${
                        filaViewMode === id
                          ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* BARRA REFINADA DE DEPARTAMENTOS E FILTRO DE TÉCNICO (100% SEM SCROLL HORIZONTAL) */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-black/[0.05] dark:border-white/[0.09] text-xs">

              {/* Filtrar demandas já listadas */}
              <div className="relative w-full md:w-64 flex-shrink-0">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar demandas, técnico, etiqueta…"
                  className="w-full h-8 pl-8 pr-7 rounded-full bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.11] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/15 dark:focus:ring-[#84cc16]/15 text-[#1d1d1f] dark:text-white placeholder:text-slate-400"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white text-xs cursor-pointer"
                    aria-label="Limpar filtro"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filtros em Popovers Apple: Departamentos & Responsável (Zero Scroll Horizontal) */}
              <div className="flex items-center gap-2 flex-wrap md:flex-1 min-w-0">
                {/* 1. Popover de Departamentos (Multi-seleção com Checkboxes) */}
                {categoriasDisponiveis.length === 1 ? (
                  // Perfil com um só departamento: nada para alternar
                  <span className="px-3.5 py-1.5 rounded-full border border-black/[0.08] dark:border-white/[0.1] text-xs font-semibold flex items-center gap-2 text-slate-600 dark:text-zinc-300">
                    <LayersIcon className="w-3.5 h-3.5 text-slate-400" />
                    {categoriasDisponiveis[0]}
                  </span>
                ) : (
                <div ref={filtroDeptRef} className="relative z-40">
                  <button
                    type="button"
                    onClick={() => setFiltroDeptDropdownAberto(!filtroDeptDropdownAberto)}
                    className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                      filtrosDepartamentos.length > 0
                        ? 'border-[#4d7c0f]/50 bg-[#4d7c0f]/10 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                        : 'border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] text-slate-700 dark:text-zinc-200 hover:border-black/20'
                    }`}
                  >
                    <LayersIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Departamentos:</span>
                    <span className="font-bold text-[#1d1d1f] dark:text-white">
                      {filtrosDepartamentos.length === 0
                        ? 'Todos'
                        : filtrosDepartamentos.length === 1
                        ? filtrosDepartamentos[0]
                        : `${filtrosDepartamentos.length} selecionados`}
                    </span>
                    <span className="text-[10px] text-slate-400">▾</span>
                  </button>

                  {filtroDeptDropdownAberto && (
                    <div
                      className="absolute top-full left-0 mt-1.5 w-72 rounded-2xl bg-white dark:bg-[#1e1e21] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-2 z-50 space-y-1 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-2.5 py-1 border-b border-black/[0.05] dark:border-white/[0.09] mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                          Departamentos
                        </span>
                        {filtrosDepartamentos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFiltrosDepartamentos([])}
                            className="text-[10px] text-red-500 hover:underline cursor-pointer font-semibold"
                          >
                            Limpar
                          </button>
                        )}
                      </div>

                      {/* Opção Todos */}
                      <button
                        type="button"
                        onClick={() => setFiltrosDepartamentos([])}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                          filtrosDepartamentos.length === 0
                            ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                          <span>Todos os Departamentos</span>
                        </div>
                        {filtrosDepartamentos.length === 0 && <CheckIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />}
                      </button>

                      {/* Lista com Checkboxes */}
                      <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin">
                        {categoriasDisponiveis.map((cat) => {
                          const countNoDept = chamados.filter((c) => {
                            if (c.status === 'concluido' || c.status === 'finalizado' || c.finalizado_em) return false;
                            if (c.status !== 'em_andamento' && c.status !== 'aguardando_visualizacao' && c.status !== 'pendente') return false;
                            const cats = Array.isArray(c.categorias) && c.categorias.length > 0 ? c.categorias : ['Suporte'];
                            return cats.some((d) => (d || '').toLowerCase().trim() === cat.toLowerCase().trim());
                          }).length;

                          const isSelected = filtrosDepartamentos.includes(cat);
                          const n = (cat || '').toLowerCase();
                          const dotColor = n.includes('suporte') ? 'bg-blue-500' : n.includes('automacao') || n.includes('automação') ? 'bg-purple-500' : n.includes('financeiro') ? 'bg-emerald-500' : n.includes('implantacao') || n.includes('implantação') ? 'bg-amber-500' : 'bg-slate-400';

                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                setFiltrosDepartamentos((prev) =>
                                  prev.includes(cat) ? prev.filter((d) => d !== cat) : [...prev, cat]
                                );
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  readOnly
                                  className="rounded text-[#4d7c0f] pointer-events-none"
                                />
                                <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                                <span>{cat}</span>
                              </div>
                              {countNoDept > 0 && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300">
                                  {countNoDept}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* Chips Ativos de Departamentos Selecionados */}
                {filtrosDepartamentos.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setFiltrosDepartamentos((prev) => prev.filter((d) => d !== dept))}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] text-xs font-bold border border-[#4d7c0f]/20 hover:bg-[#4d7c0f]/20 transition-all cursor-pointer shadow-2xs"
                  >
                    <span>{dept}</span>
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                ))}

                {/* Botão com Motion Design: Definir filtros como padrão do usuário */}
                <AnimatePresence>
                  {isFiltroDiferenteDoPadrao && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.9, y: -2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -2 }}
                      onClick={handleSalvarComoPadrao}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer shadow-xs"
                      title="Salvar esta combinação de departamentos e operador como seu padrão inicial"
                    >
                      <SparklesIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Definir como padrão</span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Filtro por Colaborador Responsável (Apple-Grade Custom Popover) */}
              <div ref={filtroTecnicoRef} className="relative z-40 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setFiltroTecnicoDropdownAberto(!filtroTecnicoDropdownAberto)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                    filtroTecnico !== 'todos'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                      : 'border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] text-slate-700 dark:text-zinc-200 hover:border-black/20'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                    {filtroTecnico === 'todos' ? (
                      <UsersIcon className="w-3 h-3 text-emerald-700 dark:text-emerald-300" />
                    ) : filtroTecnico === 'nao_atribuido' ? (
                      <HourglassIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    ) : (
                      (targetTec?.nome || filtroTecnico).charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="truncate max-w-[140px]">
                    {filtroTecnico === 'todos'
                      ? 'Todos os Técnicos'
                      : filtroTecnico === 'nao_atribuido'
                      ? 'Sem Técnico / Em Espera'
                      : targetTec?.nome || filtroTecnico}
                  </span>
                  <span className="text-[10px] opacity-60">▼</span>
                </button>

                {filtroTecnicoDropdownAberto && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-2xl bg-white dark:bg-[#1e1e21] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-2 space-y-1">
                    <input
                      type="text"
                      autoFocus
                      value={buscaFiltroTecnico}
                      onChange={(e) => setBuscaFiltroTecnico(e.target.value)}
                      placeholder="Filtrar operador..."
                      className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                    />
                    <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin">
                      <button
                        type="button"
                        onClick={() => handleSelecionarFiltroTecnico('todos')}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          filtroTecnico === 'todos'
                            ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <UsersIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Todos os Técnicos</span>
                        </div>
                        {filtroTecnico === 'todos' && <CheckIcon className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelecionarFiltroTecnico('nao_atribuido')}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          filtroTecnico === 'nao_atribuido'
                            ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <HourglassIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Sem Técnico / Em Espera</span>
                        </div>
                        {filtroTecnico === 'nao_atribuido' && <CheckIcon className="w-3.5 h-3.5" />}
                      </button>

                      <div className="my-1 border-t border-black/[0.05] dark:border-white/[0.09]" />

                      {listaTecnicosKanban
                        .filter((t) => {
                          if (!buscaFiltroTecnico.trim()) return true;
                          const q = removerAcentos(buscaFiltroTecnico.toLowerCase().trim());
                          return (
                            removerAcentos((t.nome || '').toLowerCase()).includes(q) ||
                            removerAcentos((t.email || '').toLowerCase()).includes(q)
                          );
                        })
                        .map((tec) => {
                          const isSel = Boolean(
                            (targetTec && (targetTec.id === tec.id || targetTec.email === tec.email || targetTec.nome === tec.nome)) ||
                            filtroTecnico === (tec.id || tec.email || tec.nome)
                          );
                          const chamadosCount = chamados.filter(
                            (c) => c.status === 'em_andamento' && isChamadoDoTecnico(c, tec)
                          ).length;

                          return (
                            <button
                              key={tec.id || tec.email}
                              type="button"
                              onClick={() => handleSelecionarFiltroTecnico(tec.id || tec.email || tec.nome)}
                              className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                isSel
                                  ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                  {tec.nome.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 truncate">
                                  <span className="block truncate font-medium">{tec.nome}</span>
                                  <span className="text-[10px] opacity-60 font-mono block truncate">{tec.cargo || 'Técnico'}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {chamadosCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                                    {chamadosCount}
                                  </span>
                                )}
                                {isSel && <CheckIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Demandas que existem no banco mas não chegam a este usuário (permissão/sessão) */}
          {diagnosticoVisibilidade && (
            <div role="alert" className="relative z-10 px-4 py-3 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200 text-xs leading-relaxed">
              <strong>
                {diagnosticoVisibilidade.ocultas === 1
                  ? 'Existe 1 demanda aberta que você não está conseguindo ver'
                  : `Existem ${diagnosticoVisibilidade.ocultas} demandas abertas que você não está conseguindo ver`}
              </strong>{' '}
              (de {diagnosticoVisibilidade.total} no total). Motivo provável: {diagnosticoVisibilidade.motivo}
            </div>
          )}

          {/* Aviso de filtros ativos: deixa explícito que há demandas fora da visão atual */}
          {ocultasPorFiltro > 0 && (
            <div
              role="status"
              className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs"
            >
              <span>
                Mostrando <strong>{chamadosFiltrados.length}</strong> de <strong>{totalSemFiltrosPessoais}</strong> demandas.{' '}
                {ocultasPorFiltro === 1 ? '1 está oculta' : `${ocultasPorFiltro} estão ocultas`} pelos filtros
                {filtroTecnico !== 'todos' ? ` de responsável (${targetTec?.nome || (filtroTecnico === 'nao_atribuido' ? 'não atribuídas' : filtroTecnico)})` : ''}
                {filtrosDepartamentos?.length > 0 ? ` de departamento (${filtrosDepartamentos.join(', ')})` : ''}
                {filtroEtiqueta !== 'todas' ? ` de etiqueta (#${filtroEtiqueta})` : ''}
                {busca.trim() ? ` de busca ("${busca.trim()}")` : ''}.
              </span>
              <button
                type="button"
                onClick={handleLimparFiltrosPessoais}
                className="self-start sm:self-auto px-3 py-1.5 rounded-full bg-amber-900/10 dark:bg-amber-200/10 hover:bg-amber-900/20 font-semibold cursor-pointer whitespace-nowrap"
              >
                Mostrar todas
              </button>
            </div>
          )}

          {/* LISTAGEM DE CHAMADOS (CARDS OU TABELA HTML ROBUSTA) */}
          {!carregado ? (
            <SupportQueueSkeleton modo={filaViewMode} />
          ) : chamadosFiltrados.length === 0 ? (
            <div className="relative z-10 rounded-3xl p-12 border border-black/[0.06] dark:border-white/[0.11] bg-white/80 dark:bg-[#1e1e21]/85 backdrop-blur-xl text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] text-slate-400 dark:text-zinc-400 flex items-center justify-center mx-auto">
                <SupportQueueIcon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-white">
                {ocultasPorFiltro > 0
                  ? 'Nenhuma demanda com esses filtros'
                  : filtroStatus === 'resolvidos_hoje'
                    ? 'Nenhuma demanda resolvida hoje ainda'
                    : 'Tudo em dia — nenhuma demanda aberta'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                {ocultasPorFiltro > 0
                  ? 'Ajuste ou limpe os filtros para ver as demais demandas.'
                  : 'Busque uma empresa no campo acima para atender agora, ou abra uma nova demanda.'}
              </p>
              <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
                {ocultasPorFiltro > 0 && (
                  <button
                    type="button"
                    onClick={handleLimparFiltrosPessoais}
                    className="px-5 py-2.5 rounded-full border border-black/10 dark:border-white/15 text-xs font-semibold text-[#1d1d1f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAbrirModalNovoChamado}
                  className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm cursor-pointer"
                >
                  + Nova demanda
                </button>
              </div>
            </div>
          ) : filaViewMode === 'kanban' ? (
            <KanbanDemandas
              chamados={chamadosFiltrados}
              ctx={ctxDemandas}
              acoes={acoesDemanda}
              tempos={temposDemanda}
              assumindoId={assumindoId}
              tecnicos={listaTecnicosKanban}
              pertenceA={isChamadoDoTecnico}
              ehMim={isTecnicoMim}
              selecionadaId={detalheId}
            />
          ) : filaViewMode === 'cards' ? (
            <CardsDemandas chamados={chamadosFiltrados} ctx={ctxDemandas} acoes={acoesDemanda} tempos={temposDemanda} assumindoId={assumindoId} selecionadaId={detalheId} />
          ) : (
            <ListaDemandas chamados={chamadosFiltrados} ctx={ctxDemandas} acoes={acoesDemanda} tempos={temposDemanda} assumindoId={assumindoId} selecionadaId={detalheId} />
          )}

        </div>
      </div>
      </div>

      {/* Formulário de nova demanda (3 etapas) */}
      <NovaDemandaModal
        aberto={novaDemanda.aberto}
        empresaInicial={novaDemanda.empresaInicial}
        onFechar={() => setNovaDemanda({ aberto: false, empresaInicial: null })}
        empresas={empresasLista}
        categorias={categoriasDisponiveis}
        etiquetasSugeridas={todasEtiquetasDisponiveis}
        onEnviar={criarDemanda}
      />

      {/* Modal do Pipeline Kanban de Demandas Internas da RM Controle */}
      <InternalDemandsKanbanModal
        isOpen={kanbanAberto}
        onClose={() => setKanbanAberto(false)}
        userEmail={userEmail}
      />

      {/* Modal de Transferência / Alteração de Responsável da Demanda (Portal em Tela Cheia Centralizado) */}
      {isClient && chamadoParaReatribuir && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg rounded-3xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#1e1e21] p-6 shadow-2xl space-y-5 my-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/6 dark:border-white/[0.11]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 font-mono">
                    Gestão de Responsabilidade
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">
                  Transferir Atendimento da Demanda
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Altere o colaborador responsável ou assuma o chamado diretamente para você.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChamadoParaReatribuir(null)}
                className="p-1 rounded-full text-slate-400 hover:text-black dark:hover:text-white hover:bg-black/5 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Dados do Chamado */}
            <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/6 dark:border-white/[0.11] space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Empresa:</span>
                <strong className="text-[#1d1d1f] dark:text-white">{chamadoParaReatribuir.empresa_nome}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Motivo:</span>
                <strong className="text-[#1d1d1f] dark:text-white">{chamadoParaReatribuir.motivo || 'Atendimento Geral'}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Atendente Atual:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold font-mono text-[11px]">
                  {chamadoParaReatribuir.atendente || chamadoParaReatribuir.tecnico_nome || chamadoParaReatribuir.tecnico_email}
                </span>
              </div>
            </div>

            {/* Ação 1: Assumir Demanda (se o atendente atual não for o usuário logado) */}
            {(() => {
              const atendenteAtualEmail = (chamadoParaReatribuir.tecnico_email || '').toLowerCase().trim();
              const isMeuChamado = isMeuAtendimento(chamadoParaReatribuir);

              if (!isMeuChamado) {
                return (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        Você deseja assumir este atendimento?
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                        1 Clique
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={salvandoReatribuicao}
                      onClick={() => handleConfirmarReatribuicao({ email: userEmail, nome: getNomeTecnico(userEmail) || 'Lucas' })}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <span>✋ Assumir Atendimento Agora</span>
                    </button>
                  </div>
                );
              }
              return null;
            })()}

            {/* Ação 2: Transferir para outro colaborador */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300">
                Selecione o novo colaborador responsável:
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {/* Opção Fila Geral (Livre para qualquer operador) */}
                <button
                  type="button"
                  disabled={!chamadoParaReatribuir?.atribuido_a || chamadoParaReatribuir?.atribuido_a === 'geral' || salvandoReatribuicao}
                  onClick={() => handleConfirmarReatribuicao({ email: 'geral', nome: 'Fila Geral' })}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    (!chamadoParaReatribuir?.atribuido_a || chamadoParaReatribuir?.atribuido_a === 'geral')
                      ? 'border-black/5 dark:border-white/[0.09] opacity-50 cursor-not-allowed bg-black/[0.01]'
                      : 'border-black/10 dark:border-white/10 hover:border-blue-500 hover:bg-blue-500/5 dark:hover:bg-blue-500/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-zinc-300">
                      <UsersIcon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#1d1d1f] dark:text-white block">
                        Fila Geral (Todos)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Livre para qualquer operador assumir na fila
                      </span>
                    </div>
                  </div>
                  {(!chamadoParaReatribuir?.atribuido_a || chamadoParaReatribuir?.atribuido_a === 'geral') ? (
                    <span className="text-[10px] text-slate-400 font-semibold">Atual</span>
                  ) : (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">
                      Mover para Geral →
                    </span>
                  )}
                </button>

                {listaTecnicosKanban.map((tec) => {
                  const isAtual = tec.email === chamadoParaReatribuir.tecnico_email || tec.nome === (chamadoParaReatribuir.tecnico_nome || chamadoParaReatribuir.atendente);
                  return (
                    <button
                      key={tec.key || tec.id}
                      type="button"
                      disabled={isAtual || salvandoReatribuicao}
                      onClick={() => handleConfirmarReatribuicao(tec)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isAtual
                          ? 'border-black/5 dark:border-white/[0.09] opacity-50 cursor-not-allowed bg-black/[0.01]'
                          : 'border-black/10 dark:border-white/10 hover:border-blue-500 hover:bg-blue-500/5 dark:hover:bg-blue-500/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-zinc-300">
                          {tec.nome.charAt(0)}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-[#1d1d1f] dark:text-white block">
                            {tec.nome}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {tec.email}
                          </span>
                        </div>
                      </div>
                      {isAtual ? (
                        <span className="text-[10px] text-slate-400 font-semibold">Atual</span>
                      ) : (
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">
                          Transferir →
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-black/6 dark:border-white/[0.11]">
              <button
                type="button"
                onClick={() => setChamadoParaReatribuir(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-black/5 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Modal de Conclusão do Chamado */}
      {chamadoParaFinalizar && (
        <SupportCompletionModal
          isOpen={true}
          chamado={chamadoParaFinalizar}
          onClose={() => setChamadoParaFinalizar(null)}
          onFinalizado={() => {
            setChamadoParaFinalizar(null);
            carregarDados();
            showFeedbackMsg('Atendimento concluído e arquivado no histórico!');
          }}
          userEmail={userEmail}
        />
      )}

      {/* Modal de Confirmação de Cancelamento / Exclusão de Chamado */}
      <ConfirmModal
        isOpen={Boolean(confirmDialog)}
        title={confirmDialog?.title || 'Cancelar Chamado?'}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText || 'Sim, Cancelar'}
        cancelText={confirmDialog?.cancelText || 'Voltar'}
        variant={confirmDialog?.variant || 'danger'}
        onConfirm={confirmDialog?.onConfirm}
        onClose={() => setConfirmDialog(null)}
      />

    </div>
  );
}

// Selos discretos no título do card: lembrete operacional e demandas ainda não sincronizadas com a equipe
function StatusExtraBadges({ chamado }) {
  if (!chamado) return null;
  const pendente = chamado.sync_estado === 'pendente';
  const enviando = chamado.sync_estado === 'enviando';
  if (!chamado.is_lembrete && !pendente && !enviando) return null;
  return (
    <span className="inline-flex items-center gap-1 ml-1.5 align-middle">
      {chamado.is_lembrete && (
        <span className="px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/25 text-[9px] font-bold uppercase tracking-wide">
          Lembrete
        </span>
      )}
      {(pendente || enviando) && (
        <span
          role="status"
          title={pendente ? `Ainda não sincronizada: ${chamado.sync_erro || 'sem conexão com o servidor'}. Reenvio automático em andamento.` : 'Enviando para a equipe…'}
          className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wide ${
            pendente
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
              : 'bg-slate-500/10 text-slate-500 dark:text-zinc-400 border-slate-500/20'
          }`}
        >
          {pendente ? 'Não sincronizada' : 'Enviando…'}
        </span>
      )}
    </span>
  );
}
