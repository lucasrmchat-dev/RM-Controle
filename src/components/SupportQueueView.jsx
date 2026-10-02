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
  getEmpresaCredenciais,
  getCategoriasDemandas,
  fetchChamadosFila,
  fetchHistoricoChamados,
  fetchEquipeUsuarios,
  isChamadoFeedback,
  getHistoricoChamados,
  createEmpresa,
  setLocalData,
  atualizarEtiquetasChamado,
  adiarAlertaChamado,
  cancelarAdiarAlertaChamado,
  marcarChamadoEscalonado
} from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { stopSupportNotificationLoop, playNotificationTone } from '@/lib/audioNotifications';
import SupportCompletionModal from './SupportCompletionModal';
import ConfirmModal from './ConfirmModal';
import InternalDemandsKanbanModal from './InternalDemandsKanbanModal';
import { showToast } from './ToastNotification';
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

export default function SupportQueueView({ onSelectEmpresa, userEmail }) {
  const [chamados, setChamados] = useState([]);
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
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Modal para Abrir Nova Demanda na Fila
  const [modalNovoChamadoOpen, setModalNovoChamadoOpen] = useState(false);
  const [buscaEmpresa, setBuscaEmpresa] = useState('');
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null);
  const [salvandoChamado, setSalvandoChamado] = useState(false);

  // Solicitante & Atendente
  const [buscaSolicitante, setBuscaSolicitante] = useState('');
  const [buscaTecnicoModal, setBuscaTecnicoModal] = useState('');
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
  const [metricasRecolhidas, setMetricasRecolhidas] = useState(false);
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

  // Trava scroll da tela enquanto o modal estiver aberto (padrão Apple)
  useEffect(() => {
    if (modalNovoChamadoOpen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [modalNovoChamadoOpen]);

  const carregarDados = async () => {
    try {
      await Promise.all([fetchChamadosFila(), fetchHistoricoChamados(), fetchEquipeUsuarios()]);
    } catch (e) {}
    const ativos = getChamadosSuporte();
    const historico = getHistoricoChamados();
    const historicoIds = new Set((historico || []).map((h) => h.id));

    // Filtra estritamente apenas chamados ativos que NÃO tenham sido finalizados nem estejam no histórico
    const mapa = new Map();
    const seenSigs = new Set();

    (ativos || []).forEach((c) => {
      if (!c || !c.id) return;
      if (c.status === 'concluido' || c.status === 'finalizado' || c.status === 'cancelado') return;
      if (c.finalizado_em) return;
      if (historicoIds.has(c.id)) return;
      if (isChamadoFeedback(c)) return;

      const empKey = (c.empresa_nome || c.empresa_id || '').toLowerCase().trim();
      const solKey = (c.solicitante_nome || '').toLowerCase().trim();
      const obsKey = (c.observacao_inicial || c.observacoes || c.descricao || '').trim().slice(0, 50);
      const timeMs = new Date(c.created_at || c.tempo_espera_inicio || 0).getTime();
      const timeBucket = Math.floor(timeMs / 20000);
      const sig = `${empKey}|${solKey}|${obsKey}|${timeBucket}`;

      if (seenSigs.has(sig)) return;
      seenSigs.add(sig);
      mapa.set(c.id, c);
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

    const listaUnica = Array.from(mapa.values());
    setChamados(listaUnica);
    setLocalData('chamados_suporte', listaUnica.filter((c) => c.status !== 'concluido' && c.status !== 'finalizado' && !c.finalizado_em));
    setEquipeLista(getEquipeUsuarios());
    setCategoriasDisponiveis(getCategoriasDemandas());
    const resEmp = await getEmpresas({ pageSize: 1000 });
    const lista = Array.isArray(resEmp) ? resEmp : (resEmp?.items || []);
    setEmpresasLista(lista);
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const handleUpdate = () => carregarDados();
    const handleCatsUpdated = () => setCategoriasDisponiveis(getCategoriasDemandas());
    window.addEventListener('suporte_updated', handleUpdate);
    window.addEventListener('equipe_updated', handleUpdate);
    window.addEventListener('categorias_demandas_updated', handleCatsUpdated);

    // Ticker a cada 1 segundo para atualizar cronômetros e verificar escalonamento de SLA
    const timer = setInterval(() => {
      setTick((t) => t + 1);

      // Verificação de Escalonamento: se chamado atribuído a funcionário extrapolou o tempo limite sem resolução
      try {
        const chamadosAtuais = getChamadosSuporte();
        const agoraMs = Date.now();
        const myEmail = (userEmail || '').toLowerCase().trim();
        const isAdmin = myEmail === 'admin@rmcontrole.com' || myEmail.includes('admin');

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

    // 4. Se continua aguardando em espera (ao vivo):
    if (chamado.status === 'aguardando_visualizacao' || chamado.status === 'pendente') {
      const diffSeg = Math.max(0, Math.floor((agora - inicioEspera) / 1000));
      return formatarTempoDinamico(diffSeg);
    }

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

  // Colaboradores da empresa selecionada no modal
  const colaboradoresEmpresaAtual = useMemo(() => {
    if (!empresaSelecionada) return [];
    let list = [];
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

    try {
      const empFull = getEmpresaById(empresaSelecionada.id);
      if (empFull && empFull.colaboradores) {
        empFull.colaboradores.forEach((col) => {
          list.push({
            id: col.id,
            nome: col.nome,
            cargo: col.cargo || 'Colaborador',
            email: col.email || '',
            telefone: col.telefone || '',
          });
        });
      }
    } catch (e) {}

    return list;
  }, [empresaSelecionada]);

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
      usuarioLogado?.papel === 'administrador' ||
      Boolean(userEmail && (userEmail.includes('admin') || userEmail.includes('lucas')))
    );
  }, [usuarioLogado, userEmail]);

  // KPIs (filtra estritamente chamados ativos e remove chamados finalizados ou com data de término)
  const emAndamento = useMemo(() => chamados.filter((c) => c.status === 'em_andamento' && !c.finalizado_em && c.status !== 'concluido' && c.status !== 'finalizado'), [chamados]);
  const emEspera = useMemo(() => chamados.filter((c) => (c.status === 'aguardando_visualizacao' || c.status === 'pendente') && !c.finalizado_em && c.status !== 'concluido' && c.status !== 'finalizado'), [chamados]);
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
        if (c.status !== 'pendente' && c.status !== 'aguardando_visualizacao') return false;
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

  // Ações de Chamado
  const handleAceitarSuporte = async (chamado) => {
    await assumirSuporte({ chamado_id: chamado.id, userEmail: userEmail || 'admin@rmcontrole.com' });
    stopSupportNotificationLoop();
    showFeedbackMsg(`Você aceitou o suporte de ${chamado.empresa_nome}. Cronômetro ativo iniciado!`);
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

  // Função centralizada para abrir o modal de nova demanda resetando estados inconsistentes
  const handleAbrirModalNovoChamado = () => {
    setModalNovoChamadoOpen(true);
    setNovasCategoriasModal(['Suporte']);
    setNovasEtiquetasModal([]);
    setInputEtiqueta('');
    // Pré-definido Fila Geral por padrão (conforme solicitado)
    setTecnicoAtribuido('');
    setBuscaTecnicoModal('');
    setHighlightedTecnicoIdx(0);
    if (!empresaSelecionada && empresasLista.length > 0) {
      setEmpresaSelecionada(empresasLista[0]);
    }
    setActiveModalDropdown(null);
    setModoCadastroColab(false);
    setBuscaEmpresa('');
    setBuscaSolicitante('');
    setNovaObservacao('');
    setIniciarDireto(false);
  };

  const handleCriarChamado = async (e) => {
    e.preventDefault();
    if (salvandoChamado) return;
    if (!empresaSelecionada) {
      showToast('Selecione ou informe a empresa da demanda.', 'error');
      return;
    }

    setSalvandoChamado(true);

    let empresaIdFinal = empresaSelecionada.id;
    let empresaNomeFinal = empresaSelecionada.nome;

    // Se a empresa foi digitada como nova, cadastra de verdade no banco apenas agora ao salvar a demanda
    if (empresaSelecionada.isNova) {
      try {
        const novaEmp = await createEmpresa({
          nome: empresaSelecionada.nome.trim(),
          userEmail: userEmail || 'admin@rmcontrole.com',
        });
        if (novaEmp?.id) {
          empresaIdFinal = novaEmp.id;
          empresaNomeFinal = novaEmp.nome || empresaSelecionada.nome;
        }
      } catch (errEmp) {
        console.warn('Aviso ao cadastrar empresa digitada:', errEmp);
      }
    }

    const solicitanteFinal = solicitanteSelecionado?.nome || solicitanteManual.trim() || buscaSolicitante.trim() || 'Colaborador da Empresa';

    try {
      await adicionarChamadoFila({
        empresa_id: empresaIdFinal,
        empresa_nome: empresaNomeFinal,
        solicitante_nome: solicitanteFinal,
        solicitante_email: solicitanteSelecionado?.email || '',
        solicitante_telefone: solicitanteSelecionado?.telefone || '',
        categorias: novasCategoriasModal.length > 0 ? novasCategoriasModal : ['Suporte'],
        etiquetas: novasEtiquetasModal,
        atribuido_a: tecnicoAtribuido || null,
        observacao_inicial: novaObservacao,
        iniciarAgora: iniciarDireto,
        tempo_escalonamento_minutos: tempoEscalonamentoModal,
        userEmail: userEmail || 'admin@rmcontrole.com',
      });

      setModalNovoChamadoOpen(false);
      setNovaObservacao('');
      setSolicitanteManual('');
      setBuscaEmpresa('');
      setBuscaSolicitante('');
      setBuscaTecnicoModal('');
      setActiveModalDropdown(null);
      await carregarDados();
      showFeedbackMsg(iniciarDireto ? `Demanda de ${empresaNomeFinal} iniciada agora!` : `Demanda de ${empresaNomeFinal} aberta na fila.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoChamado(false);
    }
  };

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      
      {/* ============================================================================== */}
      {/* CABEÇALHO WIDESCREEN COM AÇÕES DE ALTA PRODUTIVIDADE */}
      {/* ============================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-mono">
              Central Operacional ao Vivo
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
            Fila de Demandas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Central operacional ao vivo: triagem, acompanhamento por categorias e controle de demandas.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAbrirModalNovoChamado}
            className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20 hover:opacity-95 flex items-center gap-2 transition-all cursor-pointer"
          >
            <span className="text-sm font-bold">+</span>
            <span>Abrir Demanda na Fila</span>
          </motion.button>
        </div>
      </div>

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

      {/* ============================================================================== */}
      {/* LAYOUT PRINCIPAL RESPONSIVO: KPI NA LATERAL ESQUERDA + FILA NA DIREITA       */}
      {/* ============================================================================== */}
      <div className="flex flex-col lg:flex-row items-start gap-6">

        {/* ============================================================================== */}
        {/* COLUNA ESQUERDA: MÉTRICAS EM TEMPO REAL COM MOTION ORQUESTRADO APPLE           */}
        {/* No modo Cards/Lista: painel amplo completo.                                   */}
        {/* No modo Kanban: recolhe delicadamente para um trilho compacto (números+cores). */}
        {/* ============================================================================== */}
        {(() => {
          const isCompact = metricasRecolhidas || (filaViewMode === 'kanban' && metricasRecolhidasKanban);

          return (
            <motion.div
              layout
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`hidden lg:block flex-shrink-0 sticky top-24 transition-all ${
                isCompact ? 'lg:w-[68px] xl:w-[72px]' : 'lg:w-72 xl:w-80'
              }`}
            >
              {isCompact ? (
                /* ------------------------------------------------------------ */
                /* TRILHO DE MÉTRICAS COMPACTO APPLE (NÚMEROS & CORES DELICADOS)*/
                /* ------------------------------------------------------------ */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-2.5 rounded-3xl p-2 sm:p-2.5 border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl shadow-xs"
                >
                  {/* Botão de Expansão Rápida */}
                  <div className="flex justify-center pb-1 border-b border-black/[0.04] dark:border-white/[0.05]">
                    <button
                      type="button"
                      onClick={() => {
                        setMetricasRecolhidas(false);
                        setMetricasRecolhidasKanban(false);
                      }}
                      className="w-7 h-7 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-slate-500 hover:text-black dark:hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                      title="Expandir painel de métricas operacionais"
                    >
                      <span>⤢</span>
                    </button>
                  </div>

                  {/* 1. Em Atendimento Ativo */}
                  <div
                    className="rounded-2xl p-2 border border-emerald-500/30 bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] flex flex-col items-center justify-center text-center shadow-xs cursor-default group relative"
                    title={`Em Atendimento Ativo: ${emAndamento.length} ao vivo`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mb-1"></span>
                    <span className="text-base font-bold font-mono tracking-tight text-emerald-900 dark:text-emerald-200 tabular-nums leading-none">
                      {emAndamento.length}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-700/90 dark:text-emerald-400 font-mono mt-1">
                      Ativo
                    </span>
                  </div>

                  {/* 2. Aguardando na Fila */}
                  <div
                    className="rounded-2xl p-2 border border-amber-500/30 bg-amber-500/[0.08] dark:bg-amber-500/[0.12] flex flex-col items-center justify-center text-center shadow-xs cursor-default group relative"
                    title={`Aguardando na Fila: ${emEspera.length} em triagem`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse mb-1"></span>
                    <span className="text-base font-bold font-mono tracking-tight text-amber-900 dark:text-amber-200 tabular-nums leading-none">
                      {emEspera.length}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-amber-700/90 dark:text-amber-400 font-mono mt-1">
                      Fila
                    </span>
                  </div>

                  {/* 3. TME de Hoje */}
                  <div
                    className="rounded-2xl p-2 border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] flex flex-col items-center justify-center text-center shadow-xs cursor-default group relative"
                    title={`Tempo Médio de Espera: ${tmeHojeMinutos} minutos`}
                  >
                    <ClockIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mb-1" />
                    <span className="text-base font-bold font-mono tracking-tight text-[#1d1d1f] dark:text-white tabular-nums leading-none">
                      {tmeHojeMinutos}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 font-mono mt-1">
                      min
                    </span>
                  </div>

                  {/* 4. Concluídos Hoje */}
                  <div
                    className="rounded-2xl p-2 border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] flex flex-col items-center justify-center text-center shadow-xs cursor-default group relative"
                    title={`Concluídos Hoje: ${resolvidosHoje.length} finalizados`}
                  >
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mb-1" />
                    <span className="text-base font-bold font-mono tracking-tight text-[#1d1d1f] dark:text-white tabular-nums leading-none">
                      {resolvidosHoje.length}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 font-mono mt-1">
                      Hoje
                    </span>
                  </div>
                </motion.div>
              ) : (
                /* ------------------------------------------------------------ */
                /* PAINEL DE MÉTRICAS AMPLO COMPLETO                           */
                /* ------------------------------------------------------------ */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3.5"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-mono">
                      Métricas Operacionais
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <button
                        type="button"
                        onClick={() => {
                          setMetricasRecolhidas(true);
                          setMetricasRecolhidasKanban(true);
                        }}
                        className="w-6 h-6 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.04] text-slate-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs cursor-pointer flex items-center justify-center"
                        title="Recolher painel de métricas operacionais"
                      >
                        <span>⤡</span>
                      </button>
                    </div>
                  </div>

                  {/* KPI 1: Em Atendimento Ativo */}
                  <div className="rounded-3xl p-5 border border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300">
                      <span className="text-xs font-semibold uppercase tracking-wider">Em Atendimento Ativo</span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-200 font-mono tabular-nums">
                        {emAndamento.length}
                      </span>
                      <span className="text-xs text-emerald-700/80 dark:text-emerald-400 font-medium">ao vivo</span>
                    </div>
                  </div>

                  {/* KPI 2: Aguardando Visualização / Espera */}
                  <div className="rounded-3xl p-5 border border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-500/[0.08] shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-amber-800 dark:text-amber-300">
                      <span className="text-xs font-semibold uppercase tracking-wider">Aguardando na Fila</span>
                      <span className="p-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold">
                        Triagem
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-200 font-mono tabular-nums">
                        {emEspera.length}
                      </span>
                      <span className="text-xs text-amber-700/80 dark:text-amber-400 font-medium">cronômetro ativo</span>
                    </div>
                  </div>

                  {/* KPI 3: Tempo Médio de Espera (TME Hoje) */}
                  <div className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
                      <span className="text-xs font-semibold uppercase tracking-wider">TME de Hoje (Espera)</span>
                      <ClockIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white font-mono tabular-nums">
                        {tmeHojeMinutos}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">minutos até atendimento</span>
                    </div>
                  </div>

                  {/* KPI 4: Resolvidos Hoje */}
                  <div className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
                      <span className="text-xs font-semibold uppercase tracking-wider">Concluídos Hoje</span>
                      <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white font-mono tabular-nums">
                        {resolvidosHoje.length}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">atendimentos finalizados</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })()}

        {/* -------------------------------------------------------------------------- */}
        {/* COLUNA DIREITA: FILTROS + GESTÃO DA FILA (CARDS OU TABELA)                 */}
        {/* -------------------------------------------------------------------------- */}
        <div className="flex-1 min-w-0 w-full space-y-4">

          {/* BARRA DE FILTROS, BUSCA E STATUS */}
          <div className="relative z-30 rounded-2xl p-3 border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-xl bg-white/80 dark:bg-[#16161a]/85 shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              
              {/* Abas Rápidas de Visualização da Fila */}
              <div className="flex items-center gap-1.5 overflow-x-auto p-0.5">
                {[
                  { id: 'ativos', label: 'Todos os Ativos', count: emAndamento.length + emEspera.length },
                  { id: 'espera', label: 'Aguardando Atendimento', count: emEspera.length, badgeColor: 'amber' },
                  { id: 'em_andamento', label: 'Em Andamento', count: emAndamento.length, ping: emAndamento.length > 0 },
                  { id: 'resolvidos_hoje', label: 'Resolvidos Hoje', count: resolvidosHoje.length },
                ].map((st) => {
                  const isSelected = filtroStatus === st.id;
                  return (
                    <button
                      key={st.id}
                      onClick={() => setFiltroStatus(st.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {st.ping && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>}
                      <span>{st.label}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isSelected
                          ? 'bg-white/20 text-white dark:bg-black/20 dark:text-black'
                          : 'bg-black/[0.05] dark:bg-white/[0.08] text-slate-500 dark:text-zinc-400'
                      }`}>
                        {st.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Alternador de Visualização Cards / Lista */}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setFilaViewMode('cards')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                    filaViewMode === 'cards'
                      ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                  }`}
                  title="Exibir Fila em Cards"
                >
                  <ViewGridIcon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilaViewMode('list')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                    filaViewMode === 'list'
                      ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                  }`}
                  title="Exibir Fila em Lista"
                >
                  <ViewListIcon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilaViewMode('kanban')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                    filaViewMode === 'kanban'
                      ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                  }`}
                  title="Exibir Fila em Quadro Kanban"
                >
                  <ViewGridIcon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Kanban</span>
                </button>
              </div>

              

              {/* Campo de Busca */}
              <div className="relative min-w-[240px]">
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar chamado, empresa ou técnico..."
                  className="w-full px-3.5 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20 text-[#1d1d1f] dark:text-white placeholder:text-slate-400"
                />
                {busca && (
                  <button
                    onClick={() => setBusca('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

            </div>

            {/* BARRA REFINADA DE DEPARTAMENTOS E FILTRO DE TÉCNICO (100% SEM SCROLL HORIZONTAL) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] text-xs">
              
              {/* Filtros em Popovers Apple: Departamentos & Responsável (Zero Scroll Horizontal) */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* 1. Popover de Departamentos (Multi-seleção com Checkboxes) */}
                <div ref={filtroDeptRef} className="relative z-40">
                  <button
                    type="button"
                    onClick={() => setFiltroDeptDropdownAberto(!filtroDeptDropdownAberto)}
                    className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                      filtrosDepartamentos.length > 0
                        ? 'border-[#4d7c0f]/50 bg-[#4d7c0f]/10 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                        : 'border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1a1a20] text-slate-700 dark:text-zinc-200 hover:border-black/20'
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
                      className="absolute top-full left-0 mt-1.5 w-72 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-2 z-50 space-y-1 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-2.5 py-1 border-b border-black/[0.05] dark:border-white/[0.06] mb-1">
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
              <div ref={filtroTecnicoRef} className="relative z-40 flex-shrink-0 sm:border-l border-black/[0.06] dark:border-white/[0.08] sm:pl-3">
                <button
                  type="button"
                  onClick={() => setFiltroTecnicoDropdownAberto(!filtroTecnicoDropdownAberto)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                    filtroTecnico !== 'todos'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                      : 'border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1a1a20] text-slate-700 dark:text-zinc-200 hover:border-black/20'
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
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-2 space-y-1">
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

                      <div className="my-1 border-t border-black/[0.05] dark:border-white/[0.06]" />

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

          {/* LISTAGEM DE CHAMADOS (CARDS OU TABELA HTML ROBUSTA) */}
          {chamadosFiltrados.length === 0 ? (
            <div className="relative z-10 rounded-3xl p-12 border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] text-slate-400 dark:text-zinc-500 flex items-center justify-center mx-auto">
                <SupportQueueIcon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-white">Fila de Suporte Vazia</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                Nenhum chamado pendente ou em atendimento para os filtros selecionados.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleAbrirModalNovoChamado}
                  className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm cursor-pointer"
                >
                  + Adicionar Chamado à Fila
                </button>
              </div>
            </div>
          ) : filaViewMode === 'cards' ? (
            /* VISUALIZAÇÃO EM CARDS VERTICAIS (MENOS LARGURA, MAIS ALTURA) */
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {chamadosFiltrados.map((ch) => {
                const isEmAndamento = ch.status === 'em_andamento';
                const isAguardando = ch.status === 'aguardando_visualizacao' || ch.status === 'pendente';
                const isFinalizado = ch.status === 'concluido' || ch.status === 'finalizado';
                const empresaObj = empresasLista.find(
                  (e) => (ch.empresa_id && e.id === ch.empresa_id) || 
                         (ch.empresa_nome && e.nome && e.nome.trim().toLowerCase() === ch.empresa_nome.trim().toLowerCase())
                ) || (ch.empresa_nome ? { id: ch.empresa_id || ch.empresa_nome, nome: ch.empresa_nome } : null);

                return (
                  <motion.div
                    key={ch.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`rounded-3xl p-5 border transition-all shadow-xs flex flex-col justify-between min-h-[310px] h-full ${
                      isEmAndamento
                        ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.06] via-transparent to-transparent dark:from-emerald-500/[0.08] dark:bg-[#16161a]'
                        : isAguardando
                        ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/[0.06] via-transparent to-transparent dark:from-amber-500/[0.06] dark:bg-[#16161a]'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a]'
                    }`}
                  >
                    {/* Topo e Corpo do Card */}
                    <div className="space-y-3 flex-1 flex flex-col justify-start">
                      {/* Status & Cronômetros */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {isEmAndamento && (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                            <span>Ao Vivo</span>
                          </span>
                        )}

                        {isAguardando && (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1.5">
                            <ClockIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>Espera</span>
                          </span>
                        )}

                        {isFinalizado && (
                          <span className="px-2.5 py-1 rounded-full bg-slate-500/15 border border-slate-500/30 text-slate-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1.5">
                            <CheckIcon className="w-3 h-3 text-emerald-600" />
                            <span>Concluído</span>
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-mono font-bold">
                            <HourglassIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span className="text-[10px]">Espera:</span>
                            <span className="tabular-nums">{calcularTempoEspera(ch)}</span>
                          </div>

                          {isEmAndamento && (
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[11px] font-mono font-bold">
                              <HourglassIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-[10px]">Ativo:</span>
                              <span className="tabular-nums">{calcularTempoAtivo(ch)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Empresa & Servidor */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white leading-snug">
                            {ch.empresa_nome}
                          </h3>
                          {empresaObj?.servidor_alocado && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 font-mono font-semibold">
                              {empresaObj.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}
                            </span>
                          )}
                        </div>

                        {/* Departamentos & Etiquetas */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {(Array.isArray(ch.categorias) && ch.categorias.length > 0 ? ch.categorias : ['Suporte']).map((cat, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[9px] font-bold border border-blue-500/20"
                              title="Departamento"
                            >
                              {cat}
                            </span>
                          ))}

                          {(Array.isArray(ch.etiquetas) ? ch.etiquetas : []).map((etq, idx) => (
                            <span
                              key={'card_etq_' + idx}
                              className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono text-[9px] font-bold border border-amber-500/25"
                              title="Etiqueta"
                            >
                              #{etq}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Solicitante & Observação Inicial */}
                      <div className="space-y-1.5 pt-1 text-xs">
                        <div className="text-slate-600 dark:text-zinc-300 font-medium">
                          Solicitante: <strong className="text-slate-900 dark:text-zinc-100">{ch.solicitante_nome || ch.solicitante || 'Não informado'}</strong>
                        </div>

                        {ch.observacao_inicial && (
                          <p className="text-xs text-slate-600 dark:text-zinc-400 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 rounded-2xl border border-black/[0.04] dark:border-white/[0.05] leading-relaxed line-clamp-3">
                            {ch.observacao_inicial}
                          </p>
                        )}

                        {/* Técnico Responsável */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono pt-0.5">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Técnico: <strong className="text-slate-700 dark:text-zinc-300">{getNomeTecnico(ch.tecnico_email, ch.tecnico_nome)}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Indicador de Alerta Adiado (Snooze Ativo) no Card */}
                    {ch.adiado_ate && Date.now() < new Date(ch.adiado_ate).getTime() && (
                      <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-800 dark:text-purple-300 text-xs font-semibold shadow-2xs">
                        <BellOffIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Alerta pausado até {new Date(ch.adiado_ate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({Math.max(1, Math.round((new Date(ch.adiado_ate).getTime() - Date.now()) / 60000))}m)</span>
                        <button
                          type="button"
                          onClick={() => {
                            cancelarAdiarAlertaChamado(ch.id, userEmail);
                            carregarDados();
                            showToast('Alerta sonoro reativado.', 'info');
                          }}
                          className="underline hover:text-purple-950 dark:hover:text-white cursor-pointer ml-1"
                        >
                          Reativar
                        </button>
                      </div>
                    )}

                    {/* Rodapé com Botões de Ação */}
                    <div className="pt-3.5 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-2 mt-4 flex-wrap">
                      {/* Botão de Adiar Alerta no Card: EXCLUSIVO para chamado aguardando */}
                      {isAguardando && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSnoozePopoverChamadoId(snoozePopoverChamadoId === ch.id ? null : ch.id);
                          }}
                          className="px-3 py-2 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs hover:bg-purple-500/20 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                          title="Adiar Alerta (Visualizei, atender mais tarde)"
                        >
                          <BellOffIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          <span className="hidden sm:inline font-bold">Adiar</span>
                        </button>

                        {snoozePopoverChamadoId === ch.id && (
                          <div
                            className="absolute bottom-full mb-2 left-0 z-50 w-48 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.1] dark:border-white/[0.12] shadow-2xl p-2 text-xs space-y-1 text-[#1d1d1f] dark:text-[#f5f5f7]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 font-mono border-b border-black/[0.05] dark:border-white/[0.06] mb-1">
                              Lembrar em:
                            </div>
                            {[
                              { mins: 10, label: '10 min' },
                              { mins: 15, label: '15 min' },
                              { mins: 30, label: '30 min' },
                              { mins: 45, label: '45 min' },
                              { mins: 60, label: '1 hora' },
                              { mins: 120, label: '2 horas' },
                            ].map((item) => (
                              <button
                                key={item.mins}
                                type="button"
                                onClick={() => {
                                  adiarAlertaChamado(ch.id, item.mins, userEmail);
                                  setSnoozePopoverChamadoId(null);
                                  carregarDados();
                                  const horaAviso = new Date(Date.now() + item.mins * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                  showToast(`💤 Alerta adiado por ${item.mins} min. Alerta às ${horaAviso}.`, 'info');
                                }}
                                className="w-full text-left px-2 py-1 rounded-lg hover:bg-purple-500/10 hover:text-purple-700 dark:hover:text-purple-300 font-medium transition-colors cursor-pointer flex items-center justify-between text-xs"
                              >
                                <span>{item.label}</span>
                                <span className="text-[10px] text-slate-400 font-mono">+{item.mins}m</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      )}

                      {isAguardando && (
                        <>
                          <button
                            onClick={() => handleAceitarSuporte(ch)}
                            className="px-4 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-90 flex items-center gap-1.5 cursor-pointer flex-1 justify-center"
                          >
                            <PlayIcon className="w-3 h-3 fill-current" />
                            <span>Assumir Atendimento</span>
                          </button>

                          <button
                            onClick={() => handleCancelarChamado(ch)}
                            className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Cancelar chamado"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {isEmAndamento && (
                        <>
                          <button
                            onClick={() => setChamadoParaFinalizar(ch)}
                            className="px-3.5 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs shadow-md hover:opacity-90 flex items-center gap-1.5 cursor-pointer flex-1 justify-center"
                          >
                            <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Concluir</span>
                          </button>



                          {Boolean(ch.is_demanda_interna || (ch.empresa_nome && ch.empresa_nome.includes('RM Controle'))) ? (
                            <button
                              type="button"
                              onClick={() => setKanbanAberto(true)}
                              className="px-3.5 py-2 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-xs font-semibold hover:bg-blue-500/20 transition-all cursor-pointer shadow-xs flex items-center gap-1"
                            >
                              <KanbanIcon className="w-3.5 h-3.5" /> <span>Pipeline Kanban</span>
                            </button>
                          ) : onSelectEmpresa && (
                            <button
                              onClick={() => onSelectEmpresa(empresaObj || { id: ch.empresa_id, nome: ch.empresa_nome })}
                              className="px-3.5 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-black/[0.03] transition-all cursor-pointer"
                            >
                              Acessar
                            </button>
                          )}

                          <button
                            onClick={() => handleCancelarChamado(ch)}
                            className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Cancelar chamado"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {isFinalizado && (
                        <div className="w-full flex items-center justify-between text-xs text-slate-400">
                          <span>Atendimento Concluído</span>
                          <button
                            onClick={() => handleCancelarChamado(ch)}
                            className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Excluir do histórico"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : filaViewMode === 'kanban' ? (
            /* ==================================================================== */
            /* VISUALIZAÇÃO KANBAN POR COLABORADOR / TÉCNICO COM CONTROLES ROBUSTOS  */
            /* ==================================================================== */
            <div className="relative z-10 space-y-4">
              
              {/* Barra Superior de Ferramentas e Presets do Kanban */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-white/80 dark:bg-[#16161a]/85 border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-xl shadow-xs">
                
                {/* Presets de Foco e Visualização (Com Destaque Visual Nítido Apple) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-mono pl-1 pr-1">
                    Visualização:
                  </span>
                  
                  {/* Preset: Focar em Mim & Espera */}
                  <button
                    type="button"
                    onClick={() => {
                      const outros = listaTecnicosKanban
                        .filter((t) => !isTecnicoMim(t))
                        .map(getTecKey);
                      setColaboradoresRecolhidos(outros);
                      setKanbanPreset('foco_mim');
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      kanbanPreset === 'foco_mim'
                        ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold shadow-md shadow-[#4d7c0f]/20 ring-2 ring-[#4d7c0f]/30'
                        : 'bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.06]'
                    }`}
                    title="Recolhe os demais operadores e foca na fila de espera e nas suas demandas"
                  >
                    <span>★</span>
                    <span>Focar em Mim & Espera</span>
                    {kanbanPreset === 'foco_mim' && <CheckIcon className="w-3 h-3 stroke-[2.5]" />}
                  </button>

                  {/* Preset: Expandir Todos */}
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroTecnico('todos');
                      setColaboradoresRecolhidos([]);
                      setKanbanPreset('expandir_todos');
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      kanbanPreset === 'expandir_todos' && filtroTecnico === 'todos'
                        ? 'bg-[#09090b] dark:bg-white text-white dark:text-black font-bold shadow-md shadow-black/10 ring-2 ring-black/20 dark:ring-white/20'
                        : 'bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.06]'
                    }`}
                  >
                    <span>⤢</span>
                    <span>Expandir Todas</span>
                    {kanbanPreset === 'expandir_todos' && filtroTecnico === 'todos' && <CheckIcon className="w-3 h-3 stroke-[2.5]" />}
                  </button>

                  {/* Preset: Recolher / Ocultar Todos */}
                  <button
                    type="button"
                    onClick={() => {
                      const todos = listaTecnicosKanban.map(getTecKey);
                      setColaboradoresRecolhidos(todos);
                      setKanbanPreset('recolher_todos');
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      kanbanPreset === 'recolher_todos'
                        ? 'bg-[#09090b] dark:bg-white text-white dark:text-black font-bold shadow-md shadow-black/10 ring-2 ring-black/20 dark:ring-white/20'
                        : 'bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.06]'
                    }`}
                  >
                    <span>⤡</span>
                    <span>Ocultar Todas</span>
                    {kanbanPreset === 'recolher_todos' && <CheckIcon className="w-3 h-3 stroke-[2.5]" />}
                  </button>
                </div>
                {/* Controles de Navegação Horizontal & Alternância de Métricas */}
                <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                  {/* Botão para Exibir/Ocultar Métricas Operacionais */}
                  <button
                    type="button"
                    onClick={() => setMetricasRecolhidasKanban(!metricasRecolhidasKanban)}
                    className="px-3 py-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="Alterna a exibição das métricas operacionais para dar mais espaço ao Kanban"
                  >
                    <span>📊</span>
                    <span>{metricasRecolhidasKanban ? 'Exibir Métricas' : 'Ocultar Métricas'}</span>
                  </button>

                  {/* Botões de Rolagem Horizontal para Mouse sem Trackpad */}
                  <div className="flex items-center gap-1 pl-2 border-l border-black/[0.06] dark:border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => kanbanScrollRef.current?.scrollBy({ left: -360, behavior: 'smooth' })}
                      className="w-7 h-7 rounded-full border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors shadow-xs"
                      title="Rolar Kanban para a esquerda"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => kanbanScrollRef.current?.scrollBy({ left: 360, behavior: 'smooth' })}
                      className="w-7 h-7 rounded-full border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors shadow-xs"
                      title="Rolar Kanban para a direita"
                    >
                      ›
                    </button>
                  </div>
                </div>

              </div>

              {/* Quadro Kanban com Barra de Rolagem Horizontal Visível e Altura Padronizada */}
              <div
                ref={kanbanScrollRef}
                className="flex gap-4 overflow-x-auto pb-5 items-start scrollbar-thin scrollbar-thumb-zinc-400 dark:scrollbar-thumb-zinc-600 scrollbar-track-black/[0.02] dark:scrollbar-track-white/[0.02]"
              >
                
                {/* ------------------------------------------------------------------ */}
                {/* COLUNA FIXA 1: AGUARDANDO ATENDIMENTO (EM ESPERA / TRIAGEM GERAL) */}
                {/* ------------------------------------------------------------------ */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const chId = e.dataTransfer.getData('text/plain');
                    const ch = chamados.find((c) => c.id === chId);
                    if (ch && ch.status === 'em_andamento') {
                      showToast(`Chamado de ${ch.empresa_nome} na fila de espera.`, 'info');
                    }
                  }}
                  className="w-[330px] sm:w-[350px] flex-shrink-0 rounded-3xl p-4 sm:p-5 border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.05] via-white to-white dark:via-[#16161a] dark:to-[#16161a] shadow-xs flex flex-col min-h-[520px] max-h-[600px]"
                >
                  {/* Header da Coluna de Espera */}
                  <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-amber-500/20 mb-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 font-mono">
                          Aguardando Atendimento
                        </h3>
                        <p className="text-[10px] text-amber-700/80 dark:text-amber-400">
                          Fila geral em triagem
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30">
                      {chamadosEsperaKanban.length}
                    </span>
                  </div>

                  {/* Cards de Chamados em Espera (Scroll interno limitado sem esticar a página) */}
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1 scrollbar-thin max-h-[490px]">
                    {chamadosEsperaKanban.length === 0 ? (
                      <div className="py-20 text-center text-xs text-slate-400 dark:text-zinc-500 space-y-1">
                        <span className="text-xl block">🎉</span>
                        <span>Nenhum chamado aguardando suporte na fila.</span>
                      </div>
                    ) : (
                      chamadosEsperaKanban.map((ch) => (
                          <motion.div
                            key={ch.id}
                            layout
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', ch.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 rounded-2xl border border-amber-500/30 bg-white dark:bg-[#1a1a20] transition-all shadow-xs space-y-3 cursor-grab active:cursor-grabbing hover:border-amber-500/50"
                          >
                            {/* Tempo de Espera ao Vivo */}
                            <div className="flex items-center justify-between gap-1.5 flex-wrap">
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-mono font-bold">
                                <HourglassIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Espera: {calcularTempoEspera(ch)}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Arraste p/ atribuir →
                              </span>
                            </div>

                            {/* Empresa & Solicitante */}
                            <div>
                              <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white leading-snug">
                                {ch.empresa_nome}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                                Solicitante: <strong className="text-slate-700 dark:text-zinc-300">{ch.solicitante_nome || 'Colaborador da Empresa'}</strong>
                              </p>
                            </div>

                            {/* Departamentos & Etiquetas */}
                            <div className="flex items-center gap-1 flex-wrap">
                              {(Array.isArray(ch.categorias) && ch.categorias.length > 0 ? ch.categorias : ['Suporte']).map((cat, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[9px] font-bold border border-blue-500/20"
                                >
                                  {cat}
                                </span>
                              ))}
                              {(Array.isArray(ch.etiquetas) ? ch.etiquetas : []).map((etq, idx) => (
                                <span
                                  key={'kanban_etq_' + idx}
                                  className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono text-[9px] font-bold border border-amber-500/25"
                                >
                                  #{etq}
                                </span>
                              ))}
                            </div>

                            {/* Observação Inicial */}
                            {ch.observacao_inicial && (
                              <p className="text-[11px] text-slate-600 dark:text-zinc-400 bg-black/[0.02] dark:bg-white/[0.03] p-2 rounded-xl border border-black/[0.04] dark:border-white/[0.05] line-clamp-2 leading-relaxed">
                                {ch.observacao_inicial}
                              </p>
                            )}

                            {/* Ações: Assumir e Cancelar */}
                            <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAceitarSuporte(ch)}
                                className="px-3.5 py-1.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-[11px] hover:opacity-90 transition-all cursor-pointer flex-1 flex items-center justify-center gap-1 shadow-xs"
                              >
                                <PlayIcon className="w-2.5 h-2.5 fill-current" />
                                <span>Assumir Atendimento</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelarChamado(ch)}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 cursor-pointer"
                                title="Cancelar chamado"
                              >
                                <XMarkIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </motion.div>
                        ))
                    )}
                  </div>
                </div>

                {/* ------------------------------------------------------------------ */}
                {/* COLUNAS DINÂMICAS: UMA COLUNA PARA CADA TÉCNICO / COLABORADOR     */}
                {/* ------------------------------------------------------------------ */}
                {listaTecnicosKanban.map((tec) => {
                  const tecKey = getTecKey(tec);
                  const isRecolhido = colaboradoresRecolhidos.includes(tecKey);

                  const chamadosTecnico = chamados.filter((c) => {
                    if (c.status !== 'em_andamento' || c.finalizado_em || c.status === 'concluido' || c.status === 'finalizado' || c.status === 'cancelado') return false;
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
                      const tecMatch = (c.tecnico_nome || c.tecnico_email || '').toLowerCase().includes(q);
                      const solMatch = (c.solicitante_nome || c.solicitante || '').toLowerCase().includes(q);
                      const descMatch = (c.observacao_inicial || c.descricao || '').toLowerCase().includes(q);
                      if (!nomeMatch && !tecMatch && !solMatch && !descMatch) return false;
                    }
                    return isChamadoDoTecnico(c, tec);
                  });

                  // Renderização de Coluna Recolhida (Strip Vertical Compacta)
                  if (isRecolhido) {
                    return (
                      <div
                        key={tecKey}
                        onClick={() => { setColaboradoresRecolhidos((prev) => prev.filter((k) => k !== tecKey)); setKanbanPreset('custom'); }}
                        className="w-[60px] flex-shrink-0 min-h-[520px] max-h-[600px] p-3 rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03] flex flex-col items-center justify-between cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/[0.04] transition-all select-none group shadow-xs"
                        title={`Clique para expandir a coluna de ${tec.nome}`}
                      >
                        {/* Topo: Avatar e Contador */}
                        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-xs flex items-center justify-center group-hover:scale-105 transition-transform">
                            {tec.nome.charAt(0).toUpperCase()}
                          </div>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border ${
                            chamadosTecnico.length > 0
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                              : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 dark:text-zinc-400 border-black/[0.06]'
                          }`}>
                            {chamadosTecnico.length}
                          </span>
                        </div>

                        {/* Centro: Nome do Técnico em Orientação Vertical */}
                        <div className="flex-1 flex items-center justify-center my-4 py-2 overflow-hidden">
                          <span
                            className="text-xs font-bold text-slate-600 dark:text-zinc-400 tracking-wider uppercase font-mono whitespace-nowrap group-hover:text-black dark:group-hover:text-white transition-colors"
                            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          >
                            {tec.nome}
                          </span>
                        </div>

                        {/* Base: Ícone de Expansão */}
                        <div className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs text-slate-500 group-hover:bg-[#4d7c0f] group-hover:text-white dark:group-hover:bg-[#84cc16] dark:group-hover:text-black transition-all flex-shrink-0">
                          +
                        </div>
                      </div>
                    );
                  }

                  // Renderização de Coluna Expandida com Altura Limitada
                  return (
                    <div
                      id={'kanban-col-' + tecKey}
                      key={tecKey}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const chId = e.dataTransfer.getData('text/plain');
                        const ch = chamados.find((c) => c.id === chId);
                        if (ch) {
                          try {
                            await assumirSuporte({ chamado_id: ch.id, userEmail: tec.email || userEmail });
                            await carregarDados();
                            showToast(`Chamado de ${ch.empresa_nome} atribuído para ${tec.nome}!`, 'success');
                          } catch (err) {
                            showToast(err.message || 'Erro ao atribuir chamado.', 'error');
                          }
                        }
                      }}
                      className="w-[330px] sm:w-[350px] flex-shrink-0 rounded-3xl p-4 sm:p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs flex flex-col min-h-[520px] max-h-[600px]"
                    >
                      {/* Header do Colaborador com Botão de Recolher */}
                      <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-black/[0.05] dark:border-white/[0.06] mb-3 flex-shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {tec.nome.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 truncate">
                            <h3 className="text-xs font-bold text-[#1d1d1f] dark:text-white truncate">
                              {tec.nome}
                            </h3>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono truncate">
                              {tec.cargo || 'Técnico'} • {tec.email || 'Suporte'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                            chamadosTecnico.length > 0
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 font-bold'
                              : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 dark:text-zinc-400 border-black/[0.06]'
                          }`}>
                            {chamadosTecnico.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setColaboradoresRecolhidos((prev) => [...prev, tecKey]); setKanbanPreset('custom'); }}
                            className="px-2 py-0.5 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.04] text-[10px] font-semibold text-slate-500 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                            title={`Ocultar coluna de ${tec.nome}`}
                          >
                            <span>Ocultar</span>
                            <span className="font-mono text-xs leading-none">−</span>
                          </button>
                        </div>
                      </div>

                      {/* Cards do Técnico com Scroll Interno Limitado */}
                      <div className="space-y-3 flex-1 overflow-y-auto pr-1 scrollbar-thin max-h-[490px]">
                        {chamadosTecnico.length === 0 ? (
                          <div className="py-20 text-center text-xs text-slate-400 dark:text-zinc-500 border border-dashed border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-4">
                            <span>Nenhuma demanda ativa com este operador.</span>
                            <span className="block text-[10px] text-slate-400 mt-1">Arraste chamados aqui para atribuir</span>
                          </div>
                        ) : (
                          chamadosTecnico.map((ch) => {
                            const isRMControle = Boolean(ch.is_demanda_interna || (ch.empresa_nome && ch.empresa_nome.includes('RM Controle')));
                            const empresaObj = empresasLista.find(
                              (e) => (ch.empresa_id && e.id === ch.empresa_id) || 
                                     (ch.empresa_nome && e.nome && e.nome.trim().toLowerCase() === ch.empresa_nome.trim().toLowerCase())
                            ) || (ch.empresa_nome ? { id: ch.empresa_id || ch.empresa_nome, nome: ch.empresa_nome } : null);

                            return (
                              <motion.div
                                key={ch.id}
                                layout
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', ch.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.06] to-transparent dark:from-emerald-500/[0.08] dark:bg-[#1a1a20] transition-all shadow-xs space-y-3 cursor-grab active:cursor-grabbing hover:border-emerald-500/50"
                              >
                                {/* Status Ao Vivo & Cronômetros */}
                                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-mono font-bold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                      <span>Ativo: {calcularTempoAtivo(ch)}</span>
                                    </div>
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-mono">
                                      <span>Espera: {calcularTempoEspera(ch)}</span>
                                    </div>
                                  </div>

                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-[9px] font-bold">
                                    Em Atendimento
                                  </span>
                                </div>

                                {/* Empresa & Solicitante */}
                                <div>
                                  <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white leading-snug">
                                    {ch.empresa_nome}
                                  </h4>
                                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                                    Solicitante: <strong className="text-slate-700 dark:text-zinc-300">{ch.solicitante_nome || 'Colaborador da Empresa'}</strong>
                                  </p>
                                </div>

                                {/* Departamentos & Etiquetas */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {(Array.isArray(ch.categorias) && ch.categorias.length > 0 ? ch.categorias : ['Suporte']).map((cat, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[9px] font-bold border border-blue-500/20"
                                    >
                                      {cat}
                                    </span>
                                  ))}
                                  {(Array.isArray(ch.etiquetas) ? ch.etiquetas : []).map((etq, idx) => (
                                    <span
                                      key={'kanban_etq_' + idx}
                                      className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono text-[9px] font-bold border border-amber-500/25"
                                    >
                                      #{etq}
                                    </span>
                                  ))}
                                </div>

                                {/* Observação Inicial */}
                                {ch.observacao_inicial && (
                                  <p className="text-[11px] text-slate-600 dark:text-zinc-400 bg-black/[0.02] dark:bg-white/[0.03] p-2 rounded-xl border border-black/[0.04] dark:border-white/[0.05] line-clamp-2 leading-relaxed">
                                    {ch.observacao_inicial}
                                  </p>
                                )}

                                {/* Ações: Concluir, Acessar Empresa e Cancelar */}
                                <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => setChamadoParaFinalizar(ch)}
                                    className="px-2.5 py-1.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-[11px] hover:opacity-90 transition-all cursor-pointer flex-1 flex items-center justify-center gap-1 shadow-xs"
                                  >
                                    <CheckIcon className="w-3 h-3 stroke-[2.5]" />
                                    <span>Concluir</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleEncerrarSemResposta(ch)}
                                    className="px-2 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-semibold hover:bg-amber-500/20 transition-all cursor-pointer shadow-xs flex items-center gap-1"
                                    title="Encerrar chamado por falta de resposta do cliente"
                                  >
                                    <span>⏳ Sem Resposta</span>
                                  </button>

                                  {isRMControle ? (
                                    <button
                                      type="button"
                                      onClick={() => setKanbanAberto(true)}
                                      className="px-2.5 py-1.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 text-[10px] font-bold hover:bg-blue-500/20 cursor-pointer shadow-xs"
                                      title="Abrir Pipeline Kanban"
                                    >
                                      Pipeline Kanban
                                    </button>
                                  ) : onSelectEmpresa && (
                                    <button
                                      type="button"
                                      onClick={() => onSelectEmpresa(empresaObj || { id: ch.empresa_id, nome: ch.empresa_nome })}
                                      className="px-2.5 py-1.5 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-800 text-[10px] font-semibold text-slate-700 dark:text-zinc-200 hover:bg-black/5 cursor-pointer shadow-xs"
                                    >
                                      Acessar Empresa
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleCancelarChamado(ch)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 cursor-pointer"
                                    title="Cancelar chamado"
                                  >
                                    <XMarkIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </motion.div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
                        /* VISUALIZAÇÃO EM TABELA APPLE PREMIUM COM GAVETA EXPANSÍVEL DE AÇÕES */
            <div ref={tableContainerRef} className="relative z-10 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.05] dark:border-white/[0.06] text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 bg-black/[0.015] dark:bg-white/[0.02]">
                      <th className="px-3.5 py-3 cursor-pointer select-none whitespace-nowrap w-[90px]" onClick={() => {
                        if (sortFilaCol === 'status') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortFilaCol('status'); setSortFilaDir('asc'); }
                      }}>
                        <div className="flex items-center gap-1">
                          <span>Status</span>
                          {sortFilaCol === 'status' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th className="px-3.5 py-3 cursor-pointer select-none min-w-[160px]" onClick={() => {
                        if (sortFilaCol === 'empresa') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortFilaCol('empresa'); setSortFilaDir('asc'); }
                      }}>
                        <div className="flex items-center gap-1">
                          <span>Empresa</span>
                          {sortFilaCol === 'empresa' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th className="px-3 py-3 cursor-pointer select-none w-[130px]" onClick={() => {
                        if (sortFilaCol === 'departamento') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortFilaCol('departamento'); setSortFilaDir('asc'); }
                      }}>
                        <div className="flex items-center gap-1">
                          <span>Departamento</span>
                          {sortFilaCol === 'departamento' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th className="hidden xl:table-cell px-3 py-3 cursor-pointer select-none w-[120px]" onClick={() => {
                        if (sortFilaCol === 'etiqueta') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortFilaCol('etiqueta'); setSortFilaDir('asc'); }
                      }}>
                        <div className="flex items-center gap-1">
                          <span>Etiquetas</span>
                          {sortFilaCol === 'etiqueta' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th className="hidden sm:table-cell px-3 py-3 cursor-pointer select-none min-w-[130px]" onClick={() => {
                        if (sortFilaCol === 'solicitante') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortFilaCol('solicitante'); setSortFilaDir('asc'); }
                      }}>
                        <div className="flex items-center gap-1">
                          <span>Solicitante</span>
                          {sortFilaCol === 'solicitante' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th className="px-3.5 py-3 cursor-pointer select-none whitespace-nowrap w-[120px]" onClick={() => {
                        if (sortFilaCol === 'cronometro') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortFilaCol('cronometro'); setSortFilaDir('asc'); }
                      }}>
                        <div className="flex items-center gap-1">
                          <HourglassIcon className="w-3 h-3 text-amber-500" />
                          <span>Tempos</span>
                          {sortFilaCol === 'cronometro' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap w-[90px]">Ações</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
                    {[...chamadosFiltrados].sort((a, b) => {
                      if (sortFilaCol === 'empresa') {
                        return sortFilaDir === 'asc'
                          ? (a.empresa_nome || '').localeCompare(b.empresa_nome || '')
                          : (b.empresa_nome || '').localeCompare(a.empresa_nome || '');
                      }
                      if (sortFilaCol === 'solicitante') {
                        const sA = a.solicitante_nome || a.solicitante || '';
                        const sB = b.solicitante_nome || b.solicitante || '';
                        return sortFilaDir === 'asc' ? sA.localeCompare(sB) : sB.localeCompare(sA);
                      }
                      if (sortFilaCol === 'departamento') {
                        const dA = (Array.isArray(a.categorias) && a.categorias.length > 0 ? a.categorias[0] : 'Suporte') || '';
                        const dB = (Array.isArray(b.categorias) && b.categorias.length > 0 ? b.categorias[0] : 'Suporte') || '';
                        return sortFilaDir === 'asc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
                      }
                      if (sortFilaCol === 'etiqueta') {
                        const eA = (Array.isArray(a.etiquetas) ? a.etiquetas.join(',') : '') || '';
                        const eB = (Array.isArray(b.etiquetas) ? b.etiquetas.join(',') : '') || '';
                        return sortFilaDir === 'asc' ? eA.localeCompare(eB) : eB.localeCompare(eA);
                      }
                      if (sortFilaCol === 'cronometro') {
                        const tA = a.status === 'em_andamento' ? (a.tempo_ativo_segundos || 0) : (a.tempo_espera_segundos || 0);
                        const tB = b.status === 'em_andamento' ? (b.tempo_ativo_segundos || 0) : (b.tempo_espera_segundos || 0);
                        return sortFilaDir === 'asc' ? tA - tB : tB - tA;
                      }
                      return sortFilaDir === 'asc'
                        ? (a.status || '').localeCompare(b.status || '')
                        : (b.status || '').localeCompare(a.status || '');
                    }).map((ch) => {
                      const isEmAndamento = ch.status === 'em_andamento';
                      const isAguardando = ch.status === 'aguardando_visualizacao' || ch.status === 'pendente';
                      const isFinalizado = ch.status === 'concluido' || ch.status === 'finalizado';
                      const isExpanded = expandedChamadoId === ch.id;
                      const empresaObj = empresasLista.find(
                        (e) => (ch.empresa_id && e.id === ch.empresa_id) || 
                               (ch.empresa_nome && e.nome && e.nome.trim().toLowerCase() === ch.empresa_nome.trim().toLowerCase())
                      ) || (ch.empresa_nome ? { id: ch.empresa_id || ch.empresa_nome, nome: ch.empresa_nome } : null);

                      return (
                        <React.Fragment key={ch.id}>
                          {/* Linha Principal da Tabela */}
                          <tr 
                            onClick={() => setExpandedChamadoId(isExpanded ? null : ch.id)}
                            className={`cursor-pointer transition-colors text-xs ${
                              isExpanded 
                                ? 'bg-[#4d7c0f]/[0.03] dark:bg-[#84cc16]/[0.05]' 
                                : 'hover:bg-black/[0.015] dark:hover:bg-white/[0.02]'
                            }`}
                          >
                            {/* Status */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {isEmAndamento && (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                  <span>Ativo</span>
                                </span>
                              )}
                              {isAguardando && (
                                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold inline-flex items-center gap-1.5">
                                  <ClockIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span>Espera</span>
                                </span>
                              )}
                              {isFinalizado && (
                                <span className="px-2.5 py-1 rounded-full bg-slate-500/15 border border-slate-500/30 text-slate-700 dark:text-zinc-300 text-[10px] font-bold inline-flex items-center gap-1">
                                  <CheckIcon className="w-3 h-3 text-emerald-600" />
                                  <span>Concluído</span>
                                </span>
                              )}
                            </td>

                            {/* Empresa / Servidor */}
                            <td className="px-4 py-3.5 min-w-[200px]">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#1d1d1f] dark:text-white truncate block text-[13px]">
                                  {ch.empresa_nome}
                                </span>
                                {empresaObj?.servidor_alocado && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 font-mono font-semibold">
                                    {empresaObj.servidor_alocado === 'servidor_2' ? 'S2' : 'S1'}
                                  </span>
                                )}
                              </div>
                              {ch.observacao_inicial && (
                                <p className="text-[10px] text-slate-400 truncate italic max-w-xs mt-0.5">
                                  {ch.observacao_inicial}
                                </p>
                              )}
                            </td>

                            {/* Departamentos */}
                            <td className="px-4 py-3.5 min-w-[130px]">
                              <div className="flex items-center gap-1 flex-wrap">
                                {(Array.isArray(ch.categorias) && ch.categorias.length > 0 ? ch.categorias : ['Suporte']).map((cat, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[9px] font-bold border border-blue-500/20"
                                  >
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/* Etiquetas */}
                            <td className="px-4 py-3.5 min-w-[120px]">
                              <div className="flex items-center gap-1 flex-wrap">
                                {Array.isArray(ch.etiquetas) && ch.etiquetas.length > 0 ? (
                                  ch.etiquetas.map((etq, idx) => (
                                    <span
                                      key={'table_etq_' + idx}
                                      className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono text-[9px] font-bold border border-amber-500/25"
                                    >
                                      #{etq}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-slate-400 font-mono">—</span>
                                )}
                              </div>
                            </td>

                            {/* Solicitante & Técnico */}
                            <td className="px-4 py-3.5 min-w-[150px]">
                              <div className="font-semibold text-slate-800 dark:text-zinc-100 truncate">
                                {ch.solicitante_nome || ch.solicitante || 'Não informado'}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate">
                                Técnico: {getNomeTecnico(ch.tecnico_email, ch.tecnico_nome)}
                              </div>
                            </td>

                            {/* Cronômetros */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] space-y-0.5 min-w-[140px]">
                              <div className="flex items-center gap-1 text-amber-800 dark:text-amber-300 font-bold">
                                <HourglassIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span className="text-[10px] text-slate-400 font-normal">Espera:</span>
                                <span className="tabular-nums">{calcularTempoEspera(ch)}</span>
                              </div>
                              {isEmAndamento && (
                                <div className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 font-bold">
                                  <HourglassIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-[10px] text-slate-400 font-normal">Ativo:</span>
                                  <span className="tabular-nums">{calcularTempoAtivo(ch)}</span>
                                </div>
                              )}
                            </td>

                            {/* Botão Único Elegante "Ações ▾" na Linha da Tabela (Focado e Compacto) */}
                            <td className="px-3.5 py-3.5 text-right whitespace-nowrap w-[90px]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedChamadoId(isExpanded ? null : ch.id);
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs ${
                                  isExpanded
                                    ? 'bg-[#09090b] dark:bg-white text-white dark:text-black font-bold'
                                    : 'bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-slate-700 dark:text-zinc-200 border border-black/[0.06] dark:border-white/[0.08]'
                                }`}
                                title="Expandir opções de atendimento"
                              >
                                <span>Ações</span>
                                <span className={`text-[8px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                              </button>
                            </td>
                          </tr>

                          {/* Gaveta Expansível com Ações e Detalhes Completos */}
                          {isExpanded && (
                            <tr className="bg-black/[0.015] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.08]">
                              <td colSpan={7} className="p-4 sm:p-5">
                                <motion.div
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -4 }}
                                  className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#1a1a20] border border-black/[0.06] dark:border-white/[0.08] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                                >
                                  {/* Informações detalhadas */}
                                  <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                                        {ch.empresa_nome}
                                      </span>
                                      <span className="text-xs text-slate-400 font-mono">
                                        • Solicitante: <strong className="text-slate-800 dark:text-zinc-200">{ch.solicitante_nome || ch.solicitante || 'Colaborador da Empresa'}</strong>
                                      </span>
                                      <span className="text-xs text-slate-400 font-mono">
                                        • Atendente: <strong className="text-slate-800 dark:text-zinc-200">{getNomeTecnico(ch.tecnico_email, ch.tecnico_nome)}</strong>
                                      </span>
                                    </div>

                                    {ch.observacao_inicial && (
                                      <div className="text-xs text-slate-700 dark:text-zinc-300 bg-black/[0.02] dark:bg-white/[0.04] p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.05] leading-relaxed max-w-3xl">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Observação Inicial:</span>
                                        {ch.observacao_inicial}
                                      </div>
                                    )}

                                    {/* Indicador de Alerta Adiado (Snooze Ativo) */}
                                    {ch.adiado_ate && Date.now() < new Date(ch.adiado_ate).getTime() && (
                                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-800 dark:text-purple-300 text-xs font-semibold shadow-2xs">
                                        <BellOffIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                        <span>Alerta pausado até <strong>{new Date(ch.adiado_ate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> ({Math.max(1, Math.round((new Date(ch.adiado_ate).getTime() - Date.now()) / 60000))} min restantes)</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            cancelarAdiarAlertaChamado(ch.id, userEmail);
                                            carregarDados();
                                            showToast('Alerta sonoro reativado.', 'info');
                                          }}
                                          className="ml-1 text-[11px] underline hover:text-purple-950 dark:hover:text-white cursor-pointer font-bold"
                                        >
                                          Reativar Som Agora
                                        </button>
                                      </div>
                                    )}

                                    {/* Indicador Dinâmico de Tempo Operacional e Nível de Saúde (Saudável, Intermediário, Crítico) */}
                                    {(() => {
                                      const cfg = getConfiguracoesSuporte();
                                      const tSaudavel = cfg.tempo_saudavel_minutos || 10;
                                      const tIntermediario = cfg.tempo_intermediario_minutos || 20;
                                      const tCritico = cfg.tempo_critico_minutos || 30;

                                      const minPassados = isEmAndamento
                                        ? Math.floor((ch.tempo_ativo_segundos || 0) / 60)
                                        : Math.floor((ch.tempo_espera_segundos || 0) / 60);

                                      const isCritico = minPassados >= tCritico;
                                      const isIntermediario = !isCritico && minPassados >= tSaudavel;

                                      const badgeColor = isCritico
                                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                        : isIntermediario
                                        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                        : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25';

                                      const dotColor = isCritico ? 'bg-rose-500 animate-pulse' : isIntermediario ? 'bg-amber-500' : 'bg-emerald-500';
                                      const rotuloNivel = isCritico ? 'Crítico (Alerta)' : isIntermediario ? 'Atenção / Intermediário' : 'Saudável';
                                      const tempoFormatado = isEmAndamento ? calcularTempoAtivo(ch) : calcularTempoEspera(ch);

                                      return (
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-semibold ${badgeColor}`}>
                                          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                                          <ClockIcon className="w-3.5 h-3.5" />
                                          <span>
                                            {isEmAndamento ? 'Em Atendimento:' : 'Tempo em Espera:'} <strong>{tempoFormatado}</strong>
                                          </span>
                                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 border-l border-current/20 pl-2">
                                            {rotuloNivel}
                                          </span>
                                        </div>
                                      );
                                    })()}

                                    {/* Gestão Interativa de Etiquetas (Editar Etiquetas da Demanda) */}
                                    <div className="pt-2.5 border-t border-black/[0.04] dark:border-white/[0.05] space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-mono flex items-center gap-1">
                                          <TagIcon className="w-3.5 h-3.5 text-amber-500" />
                                          <span>Etiquetas da Demanda</span>
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          {(ch.etiquetas || []).length} {(ch.etiquetas || []).length === 1 ? 'etiqueta' : 'etiquetas'}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {(ch.etiquetas || []).map((etq, idx) => (
                                          <span
                                            key={idx}
                                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 text-amber-800 dark:text-amber-300 font-mono text-[11px] font-bold shadow-2xs"
                                          >
                                            <span>#{etq}</span>
                                            <button
                                              type="button"
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                const novas = (ch.etiquetas || []).filter((_, i) => i !== idx);
                                                await atualizarEtiquetasChamado(ch.id, novas, userEmail);
                                                await carregarDados();
                                                showToast(`Etiqueta #${etq} removida.`, 'info');
                                              }}
                                              className="w-3.5 h-3.5 rounded-full hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] cursor-pointer"
                                              title={`Remover #${etq}`}
                                            >
                                              ✕
                                            </button>
                                          </span>
                                        ))}

                                        <div className="inline-flex items-center gap-1">
                                          <input
                                            type="text"
                                            placeholder="+ Nova etiqueta"
                                            value={tagInputChamadoId === ch.id ? tagInputVal : ''}
                                            onFocus={() => {
                                              setTagInputChamadoId(ch.id);
                                              setTagInputVal('');
                                            }}
                                            onChange={(e) => setTagInputVal(e.target.value)}
                                            onKeyDown={async (e) => {
                                              if (e.key === 'Enter' && tagInputVal.trim()) {
                                                e.preventDefault();
                                                const nova = tagInputVal.trim().replace(/^#/, '');
                                                const atuais = ch.etiquetas || [];
                                                if (!atuais.includes(nova)) {
                                                  const novas = [...atuais, nova];
                                                  await atualizarEtiquetasChamado(ch.id, novas, userEmail);
                                                  await carregarDados();
                                                  showToast(`Etiqueta #${nova} adicionada.`, 'success');
                                                }
                                                setTagInputVal('');
                                              }
                                            }}
                                            className="px-2 py-0.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500/50 w-32"
                                          />
                                          {tagInputChamadoId === ch.id && tagInputVal.trim() && (
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                const nova = tagInputVal.trim().replace(/^#/, '');
                                                const atuais = ch.etiquetas || [];
                                                if (!atuais.includes(nova)) {
                                                  const novas = [...atuais, nova];
                                                  await atualizarEtiquetasChamado(ch.id, novas, userEmail);
                                                  await carregarDados();
                                                  showToast(`Etiqueta #${nova} adicionada.`, 'success');
                                                }
                                                setTagInputVal('');
                                              }}
                                              className="px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold text-xs cursor-pointer shadow-xs"
                                            >
                                              +
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] text-slate-400 font-mono">Sugeridas:</span>
                                        {['urgente', 'financeiro', 'duvida', 'configuracao', 'bloqueado', 'reaberto'].map((sug) => {
                                          const jaTem = (ch.etiquetas || []).includes(sug);
                                          if (jaTem) return null;
                                          return (
                                            <button
                                              key={sug}
                                              type="button"
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                const novas = [...(ch.etiquetas || []), sug];
                                                await atualizarEtiquetasChamado(ch.id, novas, userEmail);
                                                await carregarDados();
                                                showToast(`Etiqueta #${sug} adicionada.`, 'success');
                                              }}
                                              className="px-2 py-0.2 rounded-full bg-black/[0.02] dark:bg-white/[0.04] hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300 border border-black/[0.04] dark:border-white/[0.06] text-[10px] font-mono text-slate-500 dark:text-zinc-400 cursor-pointer transition-colors"
                                            >
                                              +{sug}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Grupo de Ações Espaçoso e Elegante */}
                                  <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-black/[0.04] dark:border-white/[0.05]">
                                    {isAguardando && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleAceitarSuporte(ch);
                                        }}
                                        className="px-4 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <PlayIcon className="w-3.5 h-3.5 fill-current" />
                                        <span>Assumir Atendimento</span>
                                      </button>
                                    )}

                                    {/* Botão Adiar Alerta (Visualizei, Lembrar em X min) */}
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSnoozePopoverChamadoId(snoozePopoverChamadoId === ch.id ? null : ch.id);
                                        }}
                                        className="px-3 py-2.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold text-xs hover:bg-purple-500/20 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                                        title="Visualizei, mas não posso atender agora — silenciar e me alertar mais tarde"
                                      >
                                        <BellOffIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                        <span>Adiar Alerta</span>
                                        <span className="text-[8px]">▼</span>
                                      </button>

                                      {snoozePopoverChamadoId === ch.id && (
                                        <div
                                          className="absolute bottom-full mb-2 right-0 sm:right-auto sm:left-0 z-50 w-52 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.1] dark:border-white/[0.12] shadow-2xl p-2 text-xs space-y-1 text-[#1d1d1f] dark:text-[#f5f5f7]"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 font-mono border-b border-black/[0.05] dark:border-white/[0.06] mb-1">
                                            Lembrar-me novamente em:
                                          </div>
                                          {[
                                            { mins: 10, label: '10 minutos' },
                                            { mins: 15, label: '15 minutos' },
                                            { mins: 30, label: '30 minutos' },
                                            { mins: 45, label: '45 minutos' },
                                            { mins: 60, label: '1 hora' },
                                            { mins: 120, label: '2 horas' },
                                          ].map((item) => (
                                            <button
                                              key={item.mins}
                                              type="button"
                                              onClick={() => {
                                                adiarAlertaChamado(ch.id, item.mins, userEmail);
                                                setSnoozePopoverChamadoId(null);
                                                carregarDados();
                                                const horaAviso = new Date(Date.now() + item.mins * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                showToast(`💤 Alerta adiado por ${item.mins} min. Você será avisado novamente às ${horaAviso}.`, 'info');
                                              }}
                                              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-purple-500/10 hover:text-purple-700 dark:hover:text-purple-300 font-medium transition-colors cursor-pointer flex items-center justify-between text-xs"
                                            >
                                              <span>{item.label}</span>
                                              <span className="text-[10px] text-slate-400 font-mono">+{item.mins}m</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {isEmAndamento && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setChamadoParaFinalizar(ch);
                                          }}
                                          className="px-4 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs shadow-md hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                                          <span>Concluir Atendimento</span>
                                        </button>


                                      </>
                                    )}

                                    {!isAguardando && (
                                      Boolean(ch.is_demanda_interna || (ch.empresa_nome && ch.empresa_nome.includes('RM Controle'))) ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setKanbanAberto(true);
                                          }}
                                          className="px-4 py-2.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-500/30 cursor-pointer shadow-xs flex items-center gap-1.5"
                                        >
                                          <KanbanIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> <span>Pipeline Kanban</span>
                                        </button>
                                      ) : onSelectEmpresa && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectEmpresa(empresaObj || { id: ch.empresa_id, nome: ch.empresa_nome });
                                          }}
                                          className="px-4 py-2.5 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer shadow-xs"
                                        >
                                          <BuildingIcon className="w-3.5 h-3.5 text-slate-400 inline mr-1" /> Acessar Empresa
                                        </button>
                                      )
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelarChamado(ch);
                                      }}
                                      className="px-3 py-2.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1"
                                      title={isFinalizado ? "Excluir do histórico" : "Cancelar chamado"}
                                    >
                                      <XMarkIcon className="w-4 h-4" />
                                      <span>Cancelar</span>
                                    </button>
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>


      {/* ============================================================================== */}
      {/* ============================================================================== */}
      {/* MODAL DE CRIAÇÃO DE DEMANDA COM LAYOUT AMPLO E DROPDOWNS INTELIGENTES EXCLUSIVOS */}
      {/* ============================================================================== */}
      {isClient && createPortal(
        <AnimatePresence>
          {modalNovoChamadoOpen && (
            <div 
              className="fixed inset-0 w-screen h-screen z-[99999] bg-black/60 dark:bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 overflow-hidden"
              onClick={() => {
                setActiveModalDropdown(null);
                setModalNovoChamadoOpen(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-4xl min-h-[580px] max-h-[92vh] rounded-[36px] bg-white dark:bg-[#16161a] border border-black/[0.08] dark:border-white/[0.1] p-6 sm:p-8 shadow-2xl flex flex-col text-[#1d1d1f] dark:text-[#f5f5f7] relative"
                onClick={(e) => e.stopPropagation()}
              >
              {/* Cabeçalho Fixo do Modal */}
              <div className="flex items-center justify-between pb-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-[#1d1d1f] dark:text-white">
                    Abrir Demanda
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Selecione a empresa, o solicitante, o departamento e o responsável pela demanda.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModalDropdown(null);
                    setModalNovoChamadoOpen(false);
                  }}
                  className="p-2 text-slate-400 hover:text-black dark:hover:text-white rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Formulário com Scroll Interno e Grid de 2 Colunas */}
              <form
                onSubmit={handleCriarChamado}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.tagName?.toLowerCase() === 'input') {
                    e.preventDefault();
                  }
                }}
                className="flex flex-col flex-1 min-h-0 pt-4"
              >
                <div className="overflow-y-auto pr-1 sm:pr-2 flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* COLUNA ESQUERDA: Origem e Responsável */}
                    <div className="space-y-4">
                      
                      {/* 1. Empresa do Cliente */}
                      <div className="space-y-1.5 relative">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                          Empresa do Cliente <span className="text-red-500">*</span>
                        </label>
                        
                        <div ref={empresaDropdownRef} className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveModalDropdown((prev) => (prev === 'empresa' ? null : 'empresa'));
                              setHighlightedEmpresaIdx(0);
                            }}
                            className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-left flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
                          >
                            <span className={empresaSelecionada ? 'text-[#1d1d1f] dark:text-white font-semibold' : 'text-slate-400'}>
                              {empresaSelecionada ? empresaSelecionada.nome : 'Selecione ou busque a empresa...'}
                            </span>
                            <span className="text-slate-400 text-xs">▼</span>
                          </button>

                          {activeModalDropdown === 'empresa' && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 z-40 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-2 max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
                              <input
                                type="text"
                                autoFocus
                                value={buscaEmpresa}
                                onChange={(e) => {
                                  setBuscaEmpresa(e.target.value);
                                  setHighlightedEmpresaIdx(0);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setHighlightedEmpresaIdx((prev) => Math.min(prev + 1, Math.max(0, empresasFiltradasBusca.length - 1)));
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setHighlightedEmpresaIdx((prev) => Math.max(prev - 1, 0));
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (empresasFiltradasBusca.length > 0 && highlightedEmpresaIdx >= 0) {
                                      const sel = empresasFiltradasBusca[highlightedEmpresaIdx];
                                      if (sel) {
                                        setEmpresaSelecionada(sel);
                                        setActiveModalDropdown(null);
                                        setBuscaEmpresa('');
                                        setSolicitanteSelecionado(null);
                                      }
                                    } else if (buscaEmpresa.trim()) {
                                      setEmpresaSelecionada({
                                        id: 'temp_nova_' + Date.now(),
                                        nome: buscaEmpresa.trim(),
                                        isNova: true,
                                      });
                                      setActiveModalDropdown(null);
                                      setBuscaEmpresa('');
                                      setSolicitanteSelecionado(null);
                                    }
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveModalDropdown(null);
                                  }
                                }}
                                placeholder="Digite o nome da empresa..."
                                className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                              />

                              {/* Opção para cadastrar nome digitado caso não exista no catálogo */}
                              {buscaEmpresa.trim() && !empresasFiltradasBusca.some((e) => removerAcentos(e.nome) === removerAcentos(buscaEmpresa)) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEmpresaSelecionada({
                                      id: 'temp_nova_' + Date.now(),
                                      nome: buscaEmpresa.trim(),
                                      isNova: true,
                                    });
                                    setActiveModalDropdown(null);
                                    setBuscaEmpresa('');
                                    setSolicitanteSelecionado(null);
                                  }}
                                  className="w-full p-2 rounded-xl text-left flex items-center justify-between text-xs bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-bold hover:bg-[#4d7c0f]/20 transition-all cursor-pointer mb-1 border border-[#4d7c0f]/25"
                                >
                                  <span>+ Usar &ldquo;{buscaEmpresa.trim()}&rdquo; (Cadastrar ao abrir demanda)</span>
                                  <span className="text-[10px] opacity-75 font-mono">↵ Enter</span>
                                </button>
                              )}

                              {empresasFiltradasBusca.length === 0 && !buscaEmpresa.trim() ? (
                                <p className="text-[11px] text-slate-400 p-2 text-center">Nenhuma empresa encontrada.</p>
                              ) : (
                                empresasFiltradasBusca.map((emp, empIdx) => {
                                  const isSelected = empresaSelecionada?.id === emp.id;
                                  const isHighlighted = empIdx === highlightedEmpresaIdx;
                                  return (
                                    <button
                                      key={emp.id}
                                      type="button"
                                      onMouseEnter={() => setHighlightedEmpresaIdx(empIdx)}
                                      onClick={() => {
                                        setEmpresaSelecionada(emp);
                                        setActiveModalDropdown(null);
                                        setBuscaEmpresa('');
                                        setSolicitanteSelecionado(null);
                                      }}
                                      className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                        isHighlighted
                                          ? 'bg-[#4d7c0f]/20 dark:bg-[#84cc16]/25 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                                          : isSelected
                                          ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold'
                                          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                      }`}
                                    >
                                      <span>{emp.nome}</span>
                                      {emp.servidor_alocado && (
                                        <span className="text-[10px] opacity-70 font-mono">
                                          {emp.servidor_alocado === 'servidor_2' ? 'S2' : 'S1'}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Colaborador Solicitante */}
                      <div className="space-y-1.5 relative">
                        <div className="flex items-center justify-between pl-1">
                          <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Colaborador Solicitante na Empresa
                          </label>
                          {empresaSelecionada && !modoCadastroColab && (
                            <button
                              type="button"
                              onClick={() => setModoCadastroColab(true)}
                              className="text-[11px] font-bold text-[#4d7c0f] dark:text-[#84cc16] hover:underline cursor-pointer"
                            >
                              + Cadastrar Novo Solicitante
                            </button>
                          )}
                        </div>

                        {!modoCadastroColab ? (
                          <div ref={solicitanteDropdownRef} className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveModalDropdown((prev) => (prev === 'solicitante' ? null : 'solicitante'));
                                setHighlightedSolicitanteIdx(0);
                              }}
                              className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-left flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
                            >
                              <span className={solicitanteSelecionado || solicitanteManual ? 'text-[#1d1d1f] dark:text-white font-semibold' : 'text-slate-400'}>
                                {solicitanteSelecionado ? solicitanteSelecionado.nome : (solicitanteManual || 'Selecione ou busque o solicitante...')}
                              </span>
                              <span className="text-slate-400 text-xs">▼</span>
                            </button>

                            {activeModalDropdown === 'solicitante' && (
                              <div className="absolute top-full left-0 right-0 mt-1.5 z-40 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-2 max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
                                <input
                                  type="text"
                                  autoFocus
                                  value={buscaSolicitante}
                                  onChange={(e) => {
                                    setBuscaSolicitante(e.target.value);
                                    setSolicitanteManual(e.target.value);
                                    setHighlightedSolicitanteIdx(0);
                                    if (solicitanteSelecionado && solicitanteSelecionado.nome !== e.target.value) {
                                      setSolicitanteSelecionado(null);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setHighlightedSolicitanteIdx((prev) => Math.min(prev + 1, Math.max(0, colaboradoresFiltradosBusca.length - 1)));
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setHighlightedSolicitanteIdx((prev) => Math.max(prev - 1, 0));
                                    } else if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      // Se houver opções filtradas, a PRIMEIRA existente é priorizada (não cadastra automático!)
                                      if (colaboradoresFiltradosBusca.length > 0 && highlightedSolicitanteIdx >= 0 && colaboradoresFiltradosBusca[highlightedSolicitanteIdx]) {
                                        const sel = colaboradoresFiltradosBusca[highlightedSolicitanteIdx];
                                        setSolicitanteSelecionado(sel);
                                        setSolicitanteManual('');
                                        setActiveModalDropdown(null);
                                        setBuscaSolicitante('');
                                      } else if (buscaSolicitante.trim()) {
                                        setSolicitanteManual(buscaSolicitante.trim());
                                        setSolicitanteSelecionado(null);
                                        setActiveModalDropdown(null);
                                      }
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setActiveModalDropdown(null);
                                    }
                                  }}
                                  placeholder="Digite para filtrar solicitante (↑↓ e Enter)..."
                                  className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                                />

                                {/* 1. Lista de Colaboradores Existentes (Renderizados PRIMEIRO para o Enter pegar a opção existente) */}
                                {colaboradoresEmpresaAtual.length === 0 ? (
                                  <div className="p-2 text-center space-y-1">
                                    <p className="text-[11px] text-slate-400">Nenhum colaborador registrado nesta empresa.</p>
                                  </div>
                                ) : colaboradoresFiltradosBusca.length === 0 ? (
                                  <div className="p-2 text-center space-y-1">
                                    <p className="text-[11px] text-slate-400">Nenhum colaborador pré-cadastrado com este termo.</p>
                                  </div>
                                ) : (
                                  colaboradoresFiltradosBusca.map((colab, colIdx) => {
                                    const isHighlighted = colIdx === highlightedSolicitanteIdx;
                                    const isSelected = solicitanteSelecionado?.id === colab.id;

                                    return (
                                      <button
                                        key={colab.id || colab.nome}
                                        type="button"
                                        onMouseEnter={() => setHighlightedSolicitanteIdx(colIdx)}
                                        onClick={() => {
                                          setSolicitanteSelecionado(colab);
                                          setSolicitanteManual('');
                                          setActiveModalDropdown(null);
                                          setBuscaSolicitante('');
                                        }}
                                        className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                          isHighlighted
                                            ? 'bg-[#4d7c0f]/20 dark:bg-[#84cc16]/25 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                                            : isSelected
                                            ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold'
                                            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                        }`}
                                      >
                                        <div>
                                          <span className="block font-medium">{colab.nome}</span>
                                          {colab.cargo && <span className="text-[10px] opacity-70 block">{colab.cargo}</span>}
                                        </div>
                                        {colab.telefone && (
                                          <span className="text-[10px] font-mono text-slate-400">{colab.telefone}</span>
                                        )}
                                      </button>
                                    );
                                  })
                                )}

                                {/* 2. Opção de Solicitante Avulso ao Final da Lista */}
                                {buscaSolicitante.trim() && !colaboradoresFiltradosBusca.some((c) => removerAcentos(c.nome) === removerAcentos(buscaSolicitante)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSolicitanteManual(buscaSolicitante.trim());
                                      setSolicitanteSelecionado(null);
                                      setActiveModalDropdown(null);
                                    }}
                                    className="w-full p-2 rounded-xl text-left flex items-center justify-between text-xs bg-black/[0.03] dark:bg-white/[0.05] text-slate-700 dark:text-zinc-300 hover:bg-black/[0.06] transition-all cursor-pointer mt-1 border border-dashed border-black/10 dark:border-white/10"
                                  >
                                    <span>+ Usar &ldquo;{buscaSolicitante.trim()}&rdquo; como solicitante avulso</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-[#4d7c0f] dark:text-[#84cc16]">Novo Solicitante na Empresa</span>
                              <button
                                type="button"
                                onClick={() => setModoCadastroColab(false)}
                                className="text-[10px] text-slate-400 hover:text-black dark:hover:text-white"
                              >
                                Cancelar
                              </button>
                            </div>
                            <input
                              type="text"
                              value={novoColabNome}
                              onChange={(e) => setNovoColabNome(e.target.value)}
                              placeholder="Nome completo do solicitante *"
                              className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={novoColabCargo}
                                onChange={(e) => setNovoColabCargo(e.target.value)}
                                placeholder="Cargo / Setor (opcional)"
                                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                              />
                              <input
                                type="text"
                                value={novoColabTelefone}
                                onChange={(e) => setNovoColabTelefone(e.target.value)}
                                placeholder="Telefone / Contato (ex: 84 99999-9999)"
                                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleCadastrarNovoColaboradorInline}
                              className="w-full py-1.5 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-xs hover:opacity-95"
                            >
                              Salvar e Selecionar Colaborador
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3. Atribuir Atendimento a (Com digitação inteligente e Fila Geral por padrão) */}
                      <div className="space-y-1.5 relative">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                          Atribuir Atendimento a
                        </label>

                        {(() => {
                          const membroSelecionado = equipeLista.find((e) => (e.email || '').toLowerCase() === (tecnicoAtribuido || '').toLowerCase());
                          const isFilaGeral = !tecnicoAtribuido;
                          const isParaMim = userEmail && tecnicoAtribuido && tecnicoAtribuido.toLowerCase() === userEmail.toLowerCase();

                          // Opções consolidadas para busca
                          const opcoesTecnico = [
                            {
                              id: 'opt_fila_geral',
                              email: '',
                              nome: 'Fila Geral (Sem Atendente Fixo)',
                              cargo: 'Disponível para qualquer operador',
                              isGeral: true,
                            },
                            {
                              id: 'opt_para_mim',
                              email: userEmail || 'admin@rmcontrole.com',
                              nome: `Para mim (${getNomeTecnico(userEmail)})`,
                              cargo: userEmail || 'Operador',
                              isMim: true,
                            },
                            ...equipeLista
                              .filter((eq) => (eq.email || '').toLowerCase() !== (userEmail || '').toLowerCase())
                              .map((eq) => ({
                                id: eq.id || eq.email,
                                email: eq.email,
                                nome: eq.nome,
                                cargo: eq.cargo || eq.papel || 'Técnico',
                              }))
                          ];

                          const opcoesFiltradas = opcoesTecnico.filter((opt) => {
                            if (!buscaTecnicoModal.trim()) return true;
                            const q = removerAcentos(buscaTecnicoModal.toLowerCase().trim());
                            return (
                              removerAcentos(opt.nome).includes(q) ||
                              removerAcentos(opt.email).includes(q) ||
                              removerAcentos(opt.cargo).includes(q)
                            );
                          });

                          return (
                            <div ref={tecnicoDropdownRef} className="relative">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveModalDropdown((prev) => (prev === 'tecnico' ? null : 'tecnico'));
                                  setBuscaTecnicoModal('');
                                  setHighlightedTecnicoIdx(0);
                                }}
                                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-left flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-[10px] flex items-center justify-center">
                                    {isFilaGeral ? <UsersIcon className="w-3 h-3" /> : isParaMim ? <UserIcon className="w-3 h-3 text-[#4d7c0f]" /> : tecnicoAtribuido ? tecnicoAtribuido[0].toUpperCase() : <UsersIcon className="w-3 h-3" />} 
                                  </div>
                                  <span className="text-[#1d1d1f] dark:text-white font-semibold">
                                    {isFilaGeral
                                      ? 'Fila Geral (Disponível para qualquer operador) [Padrão]'
                                      : isParaMim
                                      ? `Para mim (${getNomeTecnico(userEmail)})`
                                      : membroSelecionado?.nome || getNomeTecnico(tecnicoAtribuido)}
                                  </span>
                                </div>
                                <span className="text-slate-400 text-xs">▼</span>
                              </button>

                              {activeModalDropdown === 'tecnico' && (
                                <div className="absolute top-full left-0 right-0 mt-1.5 z-40 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-2 max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={buscaTecnicoModal}
                                    onChange={(e) => {
                                      setBuscaTecnicoModal(e.target.value);
                                      setHighlightedTecnicoIdx(0);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setHighlightedTecnicoIdx((prev) => Math.min(prev + 1, Math.max(0, opcoesFiltradas.length - 1)));
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setHighlightedTecnicoIdx((prev) => Math.max(prev - 1, 0));
                                      } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (opcoesFiltradas.length > 0 && highlightedTecnicoIdx >= 0 && opcoesFiltradas[highlightedTecnicoIdx]) {
                                          const sel = opcoesFiltradas[highlightedTecnicoIdx];
                                          setTecnicoAtribuido(sel.email);
                                          setActiveModalDropdown(null);
                                          setBuscaTecnicoModal('');
                                        }
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setActiveModalDropdown(null);
                                      }
                                    }}
                                    placeholder="Digite para filtrar (ex: Lucas, Fila Geral)..."
                                    className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                                  />

                                  {opcoesFiltradas.length === 0 ? (
                                    <div className="p-2.5 text-center text-xs text-slate-400">
                                      Nenhum colaborador encontrado com este nome.
                                      <span className="block text-[10px] mt-0.5 opacity-75">Colaboradores devem estar cadastrados na equipe.</span>
                                    </div>
                                  ) : (
                                    opcoesFiltradas.map((opt, optIdx) => {
                                      const isHighlighted = optIdx === highlightedTecnicoIdx;
                                      const isSelected = (!tecnicoAtribuido && opt.isGeral) || (tecnicoAtribuido && tecnicoAtribuido.toLowerCase() === opt.email.toLowerCase());

                                      return (
                                        <button
                                          key={opt.id || opt.email}
                                          type="button"
                                          onMouseEnter={() => setHighlightedTecnicoIdx(optIdx)}
                                          onClick={() => {
                                            setTecnicoAtribuido(opt.email);
                                            setActiveModalDropdown(null);
                                            setBuscaTecnicoModal('');
                                          }}
                                          className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                                            isHighlighted
                                              ? 'bg-[#4d7c0f]/20 dark:bg-[#84cc16]/25 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                                              : isSelected
                                              ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold'
                                              : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                              {opt.isGeral ? <UsersIcon className="w-3 h-3" /> : opt.isMim ? <UserIcon className="w-3 h-3 text-[#4d7c0f]" /> : opt.nome.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 truncate">
                                              <span className="block font-medium truncate">{opt.nome}</span>
                                              <span className="text-[10px] opacity-70 block font-mono truncate">{opt.cargo}</span>
                                            </div>
                                          </div>
                                          {opt.isGeral && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 flex-shrink-0">
                                              Padrão
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                    </div>

                    {/* COLUNA DIREITA: Departamento, Etiquetas e Descrição */}
                    <div className="space-y-4">
                      
                      {/* Departamentos */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                          Departamento / Categoria <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08]">
                          {categoriasDisponiveis.map((cat) => {
                            const isSel = novasCategoriasModal.includes(cat);
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  if (isSel) {
                                    if (novasCategoriasModal.length > 1) {
                                      setNovasCategoriasModal(novasCategoriasModal.filter((c) => c !== cat));
                                    }
                                  } else {
                                    setNovasCategoriasModal([...novasCategoriasModal, cat]);
                                  }
                                }}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                  isSel
                                    ? 'bg-[#09090b] text-white dark:bg-white dark:text-black shadow-xs font-bold'
                                    : 'bg-white dark:bg-zinc-800 border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.03]'
                                }`}
                              >
                                {isSel && <CheckIcon className="w-3 h-3 stroke-[2.5]" />}
                                <span>{cat}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Etiquetas / Tags com Autocomplete Inteligente (Sem botão de + tag) */}
                      <div className="space-y-1.5" ref={etiquetaDropdownRef}>
                        <div className="flex items-center justify-between pl-1">
                          <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Etiquetas / Tags da Demanda
                          </label>
                          <span className="text-[10px] text-slate-400">
                            {novasEtiquetasModal.length} selecionada(s)
                          </span>
                        </div>

                        {novasEtiquetasModal.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {novasEtiquetasModal.map((etq) => (
                              <span
                                key={etq}
                                className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25 font-mono text-[10px] font-bold flex items-center gap-1.5"
                              >
                                <span>#{etq}</span>
                                <button
                                  type="button"
                                  onClick={() => setNovasEtiquetasModal(novasEtiquetasModal.filter((e) => e !== etq))}
                                  className="text-amber-700 dark:text-amber-400 hover:text-red-500 cursor-pointer font-bold leading-none"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="relative">
                          <input
                            type="text"
                            value={inputEtiqueta}
                            onFocus={() => setActiveModalDropdown('etiqueta')}
                            onChange={(e) => {
                              setInputEtiqueta(e.target.value);
                              setActiveModalDropdown('etiqueta');
                              setHighlightedEtiquetaIdx(0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (etiquetasFiltradasModal.length > 0) {
                                  setHighlightedEtiquetaIdx((prev) => (prev + 1) % etiquetasFiltradasModal.length);
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                if (etiquetasFiltradasModal.length > 0) {
                                  setHighlightedEtiquetaIdx((prev) => (prev - 1 + etiquetasFiltradasModal.length) % etiquetasFiltradasModal.length);
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                const limpo = inputEtiqueta.trim().replace(/^#/, '');
                                if (activeModalDropdown === 'etiqueta' && etiquetasFiltradasModal.length > 0 && highlightedEtiquetaIdx < etiquetasFiltradasModal.length) {
                                  const selecionada = etiquetasFiltradasModal[highlightedEtiquetaIdx];
                                  if (!novasEtiquetasModal.includes(selecionada)) {
                                    setNovasEtiquetasModal([...novasEtiquetasModal, selecionada]);
                                  }
                                  setInputEtiqueta('');
                                  setActiveModalDropdown(null);
                                } else if (limpo) {
                                  if (!novasEtiquetasModal.includes(limpo)) {
                                    setNovasEtiquetasModal([...novasEtiquetasModal, limpo]);
                                  }
                                  setInputEtiqueta('');
                                  setActiveModalDropdown(null);
                                }
                              } else if (e.key === 'Escape') {
                                setActiveModalDropdown(null);
                              }
                            }}
                            placeholder="Digite para buscar ou criar tag (ex: urgente, bug, financeiro)..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20 text-[#1d1d1f] dark:text-white placeholder:text-slate-400"
                          />

                          {/* Dropdown Popover de Sugestões com Navegação por Teclado */}
                          {activeModalDropdown === 'etiqueta' && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-2xl p-1.5 space-y-0.5 max-h-48 overflow-y-auto scrollbar-thin">
                              {etiquetasFiltradasModal.map((etq, idx) => {
                                const isHighlighted = idx === highlightedEtiquetaIdx;
                                return (
                                  <button
                                    key={etq}
                                    type="button"
                                    onClick={() => {
                                      if (!novasEtiquetasModal.includes(etq)) {
                                        setNovasEtiquetasModal([...novasEtiquetasModal, etq]);
                                      }
                                      setInputEtiqueta('');
                                      setActiveModalDropdown(null);
                                    }}
                                    onMouseEnter={() => setHighlightedEtiquetaIdx(idx)}
                                    className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                      isHighlighted
                                        ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold'
                                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-slate-400 font-mono">#</span>
                                      <span>{etq}</span>
                                    </span>
                                    {isHighlighted && (
                                      <span className="text-[10px] opacity-60 font-mono">Enter ↵</span>
                                    )}
                                  </button>
                                );
                              })}

                              {inputEtiqueta.trim() && !etiquetasFiltradasModal.some(e => e.toLowerCase() === inputEtiqueta.trim().toLowerCase().replace(/^#/, '')) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const limpo = inputEtiqueta.trim().replace(/^#/, '');
                                    if (limpo && !novasEtiquetasModal.includes(limpo)) {
                                      setNovasEtiquetasModal([...novasEtiquetasModal, limpo]);
                                    }
                                    setInputEtiqueta('');
                                    setActiveModalDropdown(null);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between text-xs text-[#4d7c0f] dark:text-[#84cc16] hover:bg-[#4d7c0f]/10 font-bold transition-colors cursor-pointer border-t border-black/[0.04] dark:border-white/[0.05] mt-1 pt-1.5"
                                >
                                  <span>+ Criar nova tag "#{inputEtiqueta.trim().replace(/^#/, '')}"</span>
                                  <span className="text-[10px] opacity-60 font-mono">Enter ↵</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Observações / Descrição Inicial */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                          Descrição / Contexto Inicial da Demanda
                        </label>
                        <textarea
                          rows={3}
                          value={novaObservacao}
                          onChange={(e) => setNovaObservacao(e.target.value)}
                          placeholder="Informe detalhes importantes sobre o suporte, telefone de contato, etc."
                          className="w-full p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20 text-[#1d1d1f] dark:text-white leading-relaxed resize-none"
                        />
                      </div>

                    </div>

                  </div>
                </div>

                {/* Rodapé Fixo do Modal com Botões Sempre Visíveis */}
                <div className="pt-4 mt-2 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 flex-shrink-0">
                  <div className="text-[11px] text-slate-400">
                    {tecnicoAtribuido ? (
                      <span>Responsável: <strong>{getNomeTecnico(tecnicoAtribuido)}</strong></span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Fila Geral (Entrará na triagem em espera)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={salvandoChamado}
                      onClick={() => {
                        if (salvandoChamado) return;
                        setActiveModalDropdown(null);
                        setModalNovoChamadoOpen(false);
                      }}
                      className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <motion.button
                      whileHover={salvandoChamado ? {} : { scale: 1.01 }}
                      whileTap={salvandoChamado ? {} : { scale: 0.98 }}
                      type="submit"
                      disabled={salvandoChamado || !empresaSelecionada}
                      className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      {salvandoChamado && (
                        <svg className="animate-spin h-3.5 w-3.5 text-current" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                      )}
                      <span>
                        {salvandoChamado
                          ? (iniciarDireto ? 'Iniciando Atendimento...' : 'Abrindo Demanda...')
                          : (tecnicoAtribuido && tecnicoAtribuido === userEmail && iniciarDireto
                              ? 'Iniciar Atendimento Agora'
                              : 'Abrir Demanda na Fila')}
                      </span>
                    </motion.button>
                  </div>
                </div>

              </form>

              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Modal do Pipeline Kanban de Demandas Internas da RM Controle */}
      <InternalDemandsKanbanModal
        isOpen={kanbanAberto}
        onClose={() => setKanbanAberto(false)}
        userEmail={userEmail}
      />

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
