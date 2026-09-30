'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  fetchChamadosFila
} from '@/lib/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { stopSupportNotificationLoop } from '@/lib/audioNotifications';
import SupportCompletionModal from './SupportCompletionModal';
import ConfirmModal from './ConfirmModal';
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
  WrenchIcon, 
  SparklesIcon, 
  RefreshIcon
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

  // Modal para Abrir Novo Chamado na Fila
  const [modalNovoChamadoOpen, setModalNovoChamadoOpen] = useState(false);
  const [buscaEmpresa, setBuscaEmpresa] = useState('');
  const [dropdownEmpresaAberto, setDropdownEmpresaAberto] = useState(false);
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null);

  // Solicitante
  const [buscaSolicitante, setBuscaSolicitante] = useState('');
  const [dropdownSolicitanteAberto, setDropdownSolicitanteAberto] = useState(false);
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
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [novasCategoriasModal, setNovasCategoriasModal] = useState(['Suporte']);
  const [silenciarMeuDispositivo, setSilenciarMeuDispositivo] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
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
      await fetchChamadosFila();
    } catch (e) {}
    const todos = getChamadosSuporte();
    setChamados(todos);
    setEquipeLista(getEquipeUsuarios());
    setCategoriasDisponiveis(getCategoriasDemandas());
    const resEmp = await getEmpresas({ pageSize: 1000 });
    const lista = Array.isArray(resEmp) ? resEmp : (resEmp?.items || []);
    setEmpresasLista(lista);
    // Não sobrescreve empresaSelecionada em segundo plano para não resetar a seleção do usuário
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

    // Ticker a cada 1 segundo para atualizar os dois cronômetros em tempo real
    const timer = setInterval(() => setTick((t) => t + 1), 1000);

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

  // Cronômetro 1: Tempo em Espera
  const calcularTempoEspera = (chamado) => {
    const agora = Date.now();
    const inicioEspera = new Date(chamado.tempo_espera_inicio || chamado.created_at || agora).getTime();
    
    // Se já foi aceito e congelou o tempo de espera:
    if (chamado.tempo_espera_fim || (chamado.tempo_espera_segundos && chamado.status === 'em_andamento')) {
      const segs = chamado.tempo_espera_segundos || 0;
      const mins = Math.floor(segs / 60);
      const secs = segs % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Se continua aguardando em espera (ao vivo):
    const diffSeg = Math.max(0, Math.floor((agora - inicioEspera) / 1000));
    const mins = Math.floor(diffSeg / 60);
    const secs = diffSeg % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cronômetro 2: Tempo Ativo (Em Atendimento)
  const calcularTempoAtivo = (chamado) => {
    if (chamado.status !== 'em_andamento') {
      if (chamado.status === 'concluido' || chamado.status === 'finalizado') {
        const segs = chamado.tempo_ativo_segundos || chamado.duracao_segundos || 0;
        const mins = Math.floor(segs / 60);
        const secs = segs % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return '00:00';
    }

    const agora = Date.now();
    const inicio = new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em || agora).getTime();
    const diffSeg = Math.max(0, Math.floor((agora - inicio) / 1000));
    const mins = Math.floor(diffSeg / 60);
    const secs = diffSeg % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

  // Aliases seguros para garantir retrocompatibilidade de referências no modal
  const solicitantesEmpresa = colaboradoresEmpresaAtual;
  const empresasFiltradasDropdown = empresasFiltradasBusca;

  // KPIs
  const emAndamento = useMemo(() => chamados.filter((c) => c.status === 'em_andamento'), [chamados]);
  const emEspera = useMemo(() => chamados.filter((c) => c.status === 'aguardando_visualizacao' || c.status === 'pendente'), [chamados]);
  const resolvidosHoje = useMemo(() => {
    const hojeStr = new Date().toISOString().split('T')[0];
    return chamados.filter((c) => (c.status === 'concluido' || c.status === 'finalizado') && (c.finalizado_em || '').startsWith(hojeStr));
  }, [chamados]);

  // Tempo Médio de Espera (TME) de hoje
  const tmeHojeMinutos = useMemo(() => {
    const concluidos = resolvidosHoje.filter((c) => c.tempo_espera_segundos > 0);
    if (concluidos.length === 0) return 0;
    const soma = concluidos.reduce((acc, c) => acc + (c.tempo_espera_segundos || 0), 0);
    return Math.round((soma / concluidos.length) / 60);
  }, [resolvidosHoje]);

  // Lista Filtrada
  const chamadosFiltrados = useMemo(() => {
    return chamados.filter((c) => {
      if (filtroStatus === 'ativos') {
        if (c.status !== 'em_andamento' && c.status !== 'pendente' && c.status !== 'aguardando_visualizacao') return false;
      } else if (filtroStatus === 'em_andamento') {
        if (c.status !== 'em_andamento') return false;
      } else if (filtroStatus === 'espera') {
        if (c.status !== 'pendente' && c.status !== 'aguardando_visualizacao') return false;
      } else if (filtroStatus === 'resolvidos_hoje') {
        const hojeStr = new Date().toISOString().split('T')[0];
        if ((c.status !== 'concluido' && c.status !== 'finalizado') || !(c.finalizado_em || '').startsWith(hojeStr)) return false;
      }

      if (filtroCategoria && filtroCategoria !== 'todas') {
        const catQ = filtroCategoria.toLowerCase().trim();
        const cats = Array.isArray(c.categorias) && c.categorias.length > 0 ? c.categorias : ['Suporte'];
        if (!cats.some((cat) => (cat || '').toLowerCase().trim() === catQ)) {
          return false;
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
  }, [chamados, filtroStatus, filtroCategoria, busca]);

  // Ações de Chamado
  const handleAceitarSuporte = async (chamado) => {
    await assumirSuporte({ chamado_id: chamado.id, userEmail: userEmail || 'admin@rmcontrole.com' });
    stopSupportNotificationLoop();
    showFeedbackMsg(`Você aceitou o suporte de ${chamado.empresa_nome}. Cronômetro ativo iniciado!`);
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
    setTecnicoAtribuido(userEmail || 'admin@rmcontrole.com');
    if (!empresaSelecionada && empresasLista.length > 0) {
      setEmpresaSelecionada(empresasLista[0]);
    }
    setDropdownEmpresaAberto(false);
    setDropdownSolicitanteAberto(false);
    setDropdownTecnicoAberto(false);
    setModoCadastroColab(false);
    setBuscaEmpresa('');
    setBuscaSolicitante('');
    setNovaObservacao('');
    setIniciarDireto(false);
  };

  const handleCriarChamado = async (e) => {
    e.preventDefault();
    if (!empresaSelecionada) {
      showToast('Selecione uma empresa.', 'error');
      return;
    }

    const solicitanteFinal = solicitanteSelecionado?.nome || solicitanteManual.trim() || buscaSolicitante.trim() || 'Colaborador da Empresa';

    try {
      await adicionarChamadoFila({
        empresa_id: empresaSelecionada.id,
        empresa_nome: empresaSelecionada.nome,
        solicitante_nome: solicitanteFinal,
        solicitante_email: solicitanteSelecionado?.email || '',
        solicitante_telefone: solicitanteSelecionado?.telefone || '',
        categorias: novasCategoriasModal.length > 0 ? novasCategoriasModal : ['Suporte'],
        atribuido_a: tecnicoAtribuido,
        observacao_inicial: novaObservacao,
        iniciarAgora: iniciarDireto,
        userEmail: userEmail || 'admin@rmcontrole.com',
      });

      setModalNovoChamadoOpen(false);
      setNovaObservacao('');
      setSolicitanteManual('');
      setBuscaEmpresa('');
      setBuscaSolicitante('');
      showFeedbackMsg(iniciarDireto ? `Atendimento de ${empresaSelecionada.nome} iniciado agora!` : `Chamado de ${empresaSelecionada.nome} aberto na fila.`);
    } catch (err) {
      showToast(err.message, 'error');
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
      {/* 4 CARDS DE KPI: ATENDIMENTO, ESPERA, TEMPO MÉDIO DE ESPERA & CONCLUÍDOS */}
      {/* ============================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <span className="text-xs text-amber-700/80 dark:text-amber-400 font-medium">cronômetro de espera ativo</span>
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
            <span className="text-xs text-slate-400 font-medium">minutos até ser atendido</span>
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
            <span className="text-xs text-slate-400 font-medium">atendimentos concluídos</span>
          </div>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* BARRA DE FILTROS, BUSCA E STATUS */}
      {/* ============================================================================== */}
      <div className="rounded-2xl p-3 border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-xl bg-white/80 dark:bg-[#16161a]/85 shadow-sm space-y-3">
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
                  ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs'
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
                  ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
              }`}
              title="Exibir Fila em Lista"
            >
              <ViewListIcon className="w-3.5 h-3.5" />
              <span className="text-[11px]">Lista</span>
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative min-w-[240px]">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar chamado, empresa ou técnico..."
              className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs font-medium text-[#1d1d1f] dark:text-white placeholder-slate-400 focus:outline-none"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

        </div>

        {/* Barra Secundária de Filtro por Categorias de Demandas */}
        {categoriasDisponiveis.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] text-xs">
            <span className="text-slate-400 text-[10px] uppercase font-mono mr-1">Categoria:</span>
            <button
              type="button"
              onClick={() => setFiltroCategoria('todas')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                filtroCategoria === 'todas'
                  ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.08]'
              }`}
            >
              Todas as Categorias
            </button>
            {categoriasDisponiveis.map((cat) => {
              const isSel = filtroCategoria === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFiltroCategoria(isSel ? 'todas' : cat)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    isSel
                      ? 'bg-[#4d7c0f] text-white dark:bg-[#84cc16] dark:text-zinc-950 font-bold shadow-xs'
                      : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.08]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================================== */}
      {/* LISTAGEM DE CHAMADOS COM DOIS CRONÔMETROS AO VIVO */}
      {/* ============================================================================== */}
      {chamadosFiltrados.length === 0 ? (
        <div className="rounded-3xl p-12 border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl text-center space-y-4 shadow-sm">
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
        <div className="space-y-3.5">
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
                className={`rounded-3xl p-5 border transition-all shadow-xs ${
                  isEmAndamento
                    ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-500/[0.04] via-transparent to-transparent dark:from-emerald-500/[0.08] dark:bg-[#16161a]'
                    : isAguardando
                    ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/[0.04] via-transparent to-transparent dark:from-amber-500/[0.06] dark:bg-[#16161a]'
                    : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Informações da Empresa & Chamado */}
                  <div className="space-y-2 flex-1 min-w-0">
                    
                    {/* Linha Superior: Status e os Dois Cronômetros */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      
                      {/* Badge de Status */}
                      {isEmAndamento && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                          <span>Em Atendimento Ao Vivo</span>
                        </span>
                      )}

                      {isAguardando && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1.5">
                          <ClockIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Aguardando Visualização</span>
                        </span>
                      )}

                      {isFinalizado && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-500/15 border border-slate-500/30 text-slate-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1.5">
                          <CheckIcon className="w-3 h-3 text-emerald-600" />
                          <span>Concluído</span>
                        </span>
                      )}

                      {/* Cronômetro 1: Tempo em Espera */}
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-mono font-bold">
                        <HourglassIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Espera:</span>
                        <span className="tabular-nums">{calcularTempoEspera(ch)}</span>
                      </div>

                      {/* Cronômetro 2: Tempo Ativo */}
                      {isEmAndamento && (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[11px] font-mono font-bold">
                          <HourglassIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Ativo:</span>
                          <span className="tabular-nums">{calcularTempoAtivo(ch)}</span>
                        </div>
                      )}

                    </div>

                    {/* Nome da Empresa e Categorias */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">
                        {ch.empresa_nome}
                      </h3>
                      {empresaObj?.servidor_alocado && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 font-mono">
                          {empresaObj.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}
                        </span>
                      )}
                      {(Array.isArray(ch.categorias) && ch.categorias.length > 0 ? ch.categorias : ['Suporte']).map((cat, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[9px] font-bold border border-blue-500/20"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>

                    {/* Solicitante & Observação Inicial */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300 font-medium">
                        <span>
                          Solicitante: <strong className="text-slate-800 dark:text-zinc-100">{ch.solicitante_nome || ch.solicitante || 'Não informado'}</strong>
                        </span>
                      </div>

                      {ch.observacao_inicial && (
                        <p className="text-xs text-slate-600 dark:text-zinc-400 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.05] leading-relaxed">
                          {ch.observacao_inicial}
                        </p>
                      )}
                    </div>

                    {/* Atendente Técnico Responsável */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono pt-1">
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>
                        Técnico:{' '}
                        <strong className="text-slate-700 dark:text-zinc-300">
                          {getNomeTecnico(ch.tecnico_email, ch.tecnico_nome)}
                        </strong>
                      </span>
                    </div>

                  </div>

                  {/* Botões de Ação Rápida */}
                  <div className="flex items-center gap-2 flex-wrap self-end lg:self-center flex-shrink-0">
                    
                    {/* Ações para Chamado em Espera */}
                    {isAguardando && (
                      <>
                        <button
                          onClick={() => handleAceitarSuporte(ch)}
                          className="px-4 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                        >
                          <PlayIcon className="w-3 h-3 fill-current" />
                          <span>Aceitar e Iniciar Suporte</span>
                        </button>

                        {onSelectEmpresa && (
                          <button
                            onClick={() => onSelectEmpresa(empresaObj || { id: ch.empresa_id, nome: ch.empresa_nome })}
                            className="px-3.5 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-black/[0.03] transition-all cursor-pointer"
                          >
                            Ver Empresa
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

                    {/* Ações para Chamado Em Andamento */}
                    {isEmAndamento && (
                      <>
                        <button
                          onClick={() => setChamadoParaFinalizar(ch)}
                          className="px-4 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs shadow-md hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Concluir Atendimento</span>
                        </button>

                        {onSelectEmpresa && (
                          <button
                            onClick={() => onSelectEmpresa(empresaObj || { id: ch.empresa_id, nome: ch.empresa_nome })}
                            className="px-3.5 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-black/[0.03] transition-all cursor-pointer"
                          >
                            Acessar Empresa
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

                    {/* Ações para Chamado Finalizado */}
                    {isFinalizado && (
                      <button
                        onClick={() => handleCancelarChamado(ch)}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Excluir do histórico"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    )}

                  </div>

                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-black/[0.05] dark:border-white/[0.06] text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 bg-black/[0.01] dark:bg-white/[0.02] min-w-[850px]">
              <div className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => {
                if (sortFilaCol === 'status') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortFilaCol('status'); setSortFilaDir('asc'); }
              }}>
                <span>Status</span>
                {sortFilaCol === 'status' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
              </div>
              <div className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => {
                if (sortFilaCol === 'empresa') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortFilaCol('empresa'); setSortFilaDir('asc'); }
              }}>
                <span>Empresa / Servidor</span>
                {sortFilaCol === 'empresa' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
              </div>
              <div className="col-span-2 select-none flex items-center gap-1 text-slate-400 dark:text-zinc-500">
                <span>Categorias</span>
              </div>
              <div className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => {
                if (sortFilaCol === 'solicitante') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortFilaCol('solicitante'); setSortFilaDir('asc'); }
              }}>
                <span>Solicitante</span>
                {sortFilaCol === 'solicitante' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
              </div>
              <div className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => {
                if (sortFilaCol === 'cronometro') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortFilaCol('cronometro'); setSortFilaDir('asc'); }
              }}>
                <HourglassIcon className="w-3 h-3 text-amber-500" />
                <span>Cronômetros</span>
                {sortFilaCol === 'cronometro' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
              </div>
              <div className="col-span-1 cursor-pointer select-none flex items-center gap-1 hover:text-black dark:hover:text-white" onClick={() => {
                if (sortFilaCol === 'tecnico') setSortFilaDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortFilaCol('tecnico'); setSortFilaDir('asc'); }
              }}>
                <span>Técnico</span>
                {sortFilaCol === 'tecnico' && <span>{sortFilaDir === 'asc' ? '▲' : '▼'}</span>}
              </div>
              <div className="col-span-1 text-right">Ações</div>
            </div>

            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05] min-w-[850px]">
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
                if (sortFilaCol === 'tecnico') {
                  const tA = a.tecnico_nome || '';
                  const tB = b.tecnico_nome || '';
                  return sortFilaDir === 'asc' ? tA.localeCompare(tB) : tB.localeCompare(tA);
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
                const empresaObj = empresasLista.find(
                  (e) => (ch.empresa_id && e.id === ch.empresa_id) || 
                         (ch.empresa_nome && e.nome && e.nome.trim().toLowerCase() === ch.empresa_nome.trim().toLowerCase())
                ) || (ch.empresa_nome ? { id: ch.empresa_id || ch.empresa_nome, nome: ch.empresa_nome } : null);

                return (
                  <div key={ch.id} className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors text-xs">
                    {/* Status */}
                    <div className="col-span-2">
                      {isEmAndamento && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                          <span>Ativo</span>
                        </span>
                      )}
                      {isAguardando && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold inline-flex items-center gap-1.5">
                          <ClockIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Espera</span>
                        </span>
                      )}
                      {isFinalizado && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-500/15 border border-slate-500/30 text-slate-700 dark:text-zinc-300 text-[10px] font-bold inline-flex items-center gap-1">
                          <CheckIcon className="w-3 h-3 text-emerald-600" />
                          <span>Concluído</span>
                        </span>
                      )}
                    </div>

                    {/* Empresa / Servidor */}
                    <div className="col-span-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1d1d1f] dark:text-white truncate block">
                          {ch.empresa_nome}
                        </span>
                        {empresaObj?.servidor_alocado && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 font-mono">
                            {empresaObj.servidor_alocado === 'servidor_2' ? 'S2' : 'S1'}
                          </span>
                        )}
                      </div>
                      {ch.observacao_inicial && (
                        <p className="text-[10px] text-slate-400 truncate italic">
                          {ch.observacao_inicial}
                        </p>
                      )}
                    </div>

                    {/* Categorias */}
                    <div className="col-span-2 flex items-center gap-1 flex-wrap">
                      {(Array.isArray(ch.categorias) && ch.categorias.length > 0 ? ch.categorias : ['Suporte']).map((cat, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[9px] font-bold border border-blue-500/20"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>

                    {/* Solicitante */}
                    <div className="col-span-2 truncate text-slate-700 dark:text-zinc-300">
                      {ch.solicitante_nome || ch.solicitante || '-'}
                    </div>

                    {/* Cronometros */}
                    <div className="col-span-2 font-mono text-[11px] space-y-0.5">
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
                    </div>

                    {/* Tecnico */}
                    <div className="col-span-1 truncate text-slate-600 dark:text-zinc-400 font-mono text-[11px]">
                      {(ch.tecnico_nome || ch.tecnico_email || '').split(' ')[0]}
                    </div>

                    {/* Acoes */}
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      {isAguardando && (
                        <button
                          type="button"
                          onClick={() => handleAceitarSuporte(ch)}
                          className="px-2.5 py-1 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-[10px] hover:opacity-95 shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <PlayIcon className="w-3 h-3 fill-current" />
                          <span>Assumir</span>
                        </button>
                      )}

                      {isEmAndamento && (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelectEmpresa(empresaObj || ch.empresa_id)}
                            className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 text-[10px] font-semibold text-slate-700 dark:text-zinc-200 cursor-pointer"
                          >
                            Empresa
                          </button>
                          <button
                            type="button"
                            onClick={() => setChamadoParaFinalizar(ch)}
                            className="px-2.5 py-1 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-[10px] shadow-xs cursor-pointer"
                          >
                            Concluir
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCancelarChamado(ch)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 cursor-pointer"
                        title={isFinalizado ? "Excluir do histórico" : "Cancelar chamado"}
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* ============================================================================== */}
      {/* MODAL DE CRIAÇÃO DE CHAMADO COM LAYOUT WIDESCREEN 16:9 E 2 COLUNAS */}
      {/* ============================================================================== */}
      {isClient && createPortal(
        <AnimatePresence>
          {modalNovoChamadoOpen && (
            <div 
              className="fixed inset-0 w-screen h-screen z-[99999] bg-black/60 dark:bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 overflow-hidden"
              onClick={() => setModalNovoChamadoOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-4xl max-h-[92vh] rounded-[32px] bg-white dark:bg-[#16161a] border border-black/[0.08] dark:border-white/[0.1] p-5 sm:p-7 shadow-2xl flex flex-col text-[#1d1d1f] dark:text-[#f5f5f7] relative"
                onClick={(e) => e.stopPropagation()}
              >
              {/* Cabeçalho Fixo do Modal */}
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">
                    Abrir Chamado de Suporte
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Selecione a empresa, o solicitante e atribua o departamento e técnico responsável.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalNovoChamadoOpen(false)}
                  className="p-2 text-slate-400 hover:text-black dark:hover:text-white rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Formulário com Scroll Interno e Grid de 2 Colunas */}
              <form onSubmit={handleCriarChamado} className="flex flex-col flex-1 min-h-0 pt-3">
                <div className="overflow-y-auto pr-1 sm:pr-2 flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* COLUNA ESQUERDA: Origem e Atendente */}
                    <div className="space-y-3.5">
                      
                      {/* 1. Empresa do Cliente */}
                      <div className="space-y-1.5 relative">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                          Empresa do Cliente <span className="text-red-500">*</span>
                        </label>
                        
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setDropdownEmpresaAberto(!dropdownEmpresaAberto)}
                            className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-left flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
                          >
                            <span className={empresaSelecionada ? 'text-[#1d1d1f] dark:text-white font-semibold' : 'text-slate-400'}>
                              {empresaSelecionada ? empresaSelecionada.nome : 'Selecione a empresa...'}
                            </span>
                            <span className="text-slate-400 text-xs">▼</span>
                          </button>

                          {dropdownEmpresaAberto && (
                            <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-xl p-2 max-h-56 overflow-y-auto space-y-1">
                              <input
                                type="text"
                                autoFocus
                                value={buscaEmpresa}
                                onChange={(e) => setBuscaEmpresa(e.target.value)}
                                placeholder="Buscar empresa..."
                                className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                              />
                              {empresasFiltradasBusca.length === 0 ? (
                                <p className="text-[11px] text-slate-400 p-2 text-center">Nenhuma empresa encontrada.</p>
                              ) : (
                                empresasFiltradasBusca.map((emp) => (
                                  <button
                                    key={emp.id}
                                    type="button"
                                    onClick={() => {
                                      setEmpresaSelecionada(emp);
                                      setDropdownEmpresaAberto(false);
                                      setBuscaEmpresa('');
                                      setSolicitanteSelecionado(null);
                                    }}
                                    className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                      empresaSelecionada?.id === emp.id
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
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Colaborador Solicitante */}
                      <div className="space-y-1.5">
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
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setDropdownSolicitanteAberto(!dropdownSolicitanteAberto)}
                              className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-left flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
                            >
                              <span className={solicitanteSelecionado || solicitanteManual ? 'text-[#1d1d1f] dark:text-white font-semibold' : 'text-slate-400'}>
                                {solicitanteSelecionado ? solicitanteSelecionado.nome : (solicitanteManual || 'Selecione ou busque o solicitante...')}
                              </span>
                              <span className="text-slate-400 text-xs">▼</span>
                            </button>

                            {dropdownSolicitanteAberto && (
                              <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-xl p-2 max-h-56 overflow-y-auto space-y-1">
                                <input
                                  type="text"
                                  autoFocus
                                  value={buscaSolicitante}
                                  onChange={(e) => {
                                    setBuscaSolicitante(e.target.value);
                                    setSolicitanteManual(e.target.value);
                                    if (solicitanteSelecionado && solicitanteSelecionado.nome !== e.target.value) {
                                      setSolicitanteSelecionado(null);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (buscaSolicitante.trim()) {
                                        setSolicitanteManual(buscaSolicitante.trim());
                                        setSolicitanteSelecionado(null);
                                        setDropdownSolicitanteAberto(false);
                                      }
                                    }
                                  }}
                                  placeholder="Digite para buscar ou adicionar solicitante..."
                                  className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                                />

                                {buscaSolicitante.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSolicitanteManual(buscaSolicitante.trim());
                                      setSolicitanteSelecionado(null);
                                      setDropdownSolicitanteAberto(false);
                                    }}
                                    className="w-full p-2 rounded-xl text-left flex items-center justify-between text-xs bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-bold hover:bg-[#4d7c0f]/20 transition-all cursor-pointer mb-1 border border-[#4d7c0f]/25"
                                  >
                                    <span>+ Usar &ldquo;{buscaSolicitante.trim()}&rdquo; como solicitante</span>
                                    <span className="text-[10px] opacity-75 font-mono">Pressione Enter ↵</span>
                                  </button>
                                )}

                                {colaboradoresEmpresaAtual.length === 0 ? (
                                  <div className="p-2 text-center space-y-1">
                                    <p className="text-[11px] text-slate-400">Nenhum colaborador registrado nesta empresa.</p>
                                  </div>
                                ) : colaboradoresFiltradosBusca.length === 0 ? (
                                  <div className="p-2 text-center space-y-1">
                                    <p className="text-[11px] text-slate-400">Nenhum colaborador pré-cadastrado com este nome.</p>
                                  </div>
                                ) : (
                                  colaboradoresFiltradosBusca.map((colab) => (
                                      <button
                                        key={colab.id || colab.nome}
                                        type="button"
                                        onClick={() => {
                                          setSolicitanteSelecionado(colab);
                                          setSolicitanteManual('');
                                          setDropdownSolicitanteAberto(false);
                                          setBuscaSolicitante('');
                                        }}
                                        className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                          solicitanteSelecionado?.id === colab.id
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
                                    ))
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
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
                                placeholder="WhatsApp / Telefone"
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

                      {/* 3. Atribuir Atendimento a */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                          Atribuir Atendimento a
                        </label>

                        {(() => {
                          const membroSelecionado = equipeLista.find((e) => (e.email || '').toLowerCase() === (tecnicoAtribuido || '').toLowerCase());
                          const isParaMim = !tecnicoAtribuido || (userEmail && tecnicoAtribuido.toLowerCase() === userEmail.toLowerCase());

                          return (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setDropdownTecnicoAberto(!dropdownTecnicoAberto)}
                                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-left flex items-center justify-between hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-[10px] flex items-center justify-center">
                                    {isParaMim ? (userEmail ? userEmail[0].toUpperCase() : 'M') : (tecnicoAtribuido ? tecnicoAtribuido[0].toUpperCase() : '👥')}
                                  </div>
                                  <span className="text-[#1d1d1f] dark:text-white font-semibold">
                                    {isParaMim 
                                      ? `Para mim (${getNomeTecnico(userEmail)}) [Padrão]`
                                      : membroSelecionado?.nome || getNomeTecnico(tecnicoAtribuido)}
                                  </span>
                                </div>
                                <span className="text-slate-400 text-xs">▼</span>
                              </button>

                              {dropdownTecnicoAberto && (
                                <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-2xl bg-white dark:bg-[#1c1c20] border border-black/[0.1] dark:border-white/[0.15] shadow-xl p-2 max-h-52 overflow-y-auto space-y-1">
                                  {/* Opção Para Mim */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTecnicoAtribuido(userEmail || 'admin@rmcontrole.com');
                                      setDropdownTecnicoAberto(false);
                                    }}
                                    className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                                      isParaMim
                                        ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold'
                                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-[10px] flex items-center justify-center">
                                        ★
                                      </div>
                                      <div>
                                        <span className="block font-semibold">Para mim ({getNomeTecnico(userEmail)})</span>
                                        <span className="text-[10px] opacity-70 block font-mono">{userEmail}</span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#4d7c0f]/20 dark:bg-[#84cc16]/20">
                                      Padrão
                                    </span>
                                  </button>

                                  {/* Demais Membros */}
                                  {equipeLista
                                    .filter((eq) => (eq.email || '').toLowerCase() !== (userEmail || '').toLowerCase())
                                    .map((eq) => (
                                      <button
                                        key={eq.id || eq.email}
                                        type="button"
                                        onClick={() => {
                                          setTecnicoAtribuido(eq.email);
                                          setDropdownTecnicoAberto(false);
                                        }}
                                        className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                                          tecnicoAtribuido && tecnicoAtribuido.toLowerCase() === (eq.email || '').toLowerCase()
                                            ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold'
                                            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 font-mono text-[10px] flex items-center justify-center">
                                            {eq.nome ? eq.nome[0].toUpperCase() : 'U'}
                                          </div>
                                          <div>
                                            <span className="block font-medium">{eq.nome}</span>
                                            <span className="text-[10px] opacity-70 block font-mono">{eq.email}</span>
                                          </div>
                                        </div>
                                        <span className="text-[10px] capitalize px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
                                          {eq.papel || 'suporte'}
                                        </span>
                                      </button>
                                    ))}

                                  {/* Opção Fila Geral */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTecnicoAtribuido('');
                                      setDropdownTecnicoAberto(false);
                                    }}
                                    className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                                      !tecnicoAtribuido 
                                        ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold' 
                                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold text-[10px] flex items-center justify-center">
                                        👥
                                      </div>
                                      <div>
                                        <span className="block font-medium">Fila Geral (Sem Atendente Fixo)</span>
                                        <span className="text-[10px] opacity-70 block">Disponível para qualquer operador</span>
                                      </div>
                                    </div>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* 4. Breve Descrição / Contexto do Problema */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                          Observação ou Solicitação do Cliente (Opcional)
                        </label>
                        <textarea
                          rows={2}
                          value={novaObservacao}
                          onChange={(e) => setNovaObservacao(e.target.value)}
                          placeholder="Ex: Cliente relata lentidão no envio de mensagens ou instabilidade na instância..."
                          className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none leading-relaxed"
                        />
                      </div>

                    </div>

                    {/* COLUNA DIREITA: Departamentos e Modo de Início */}
                    <div className="space-y-4">
                      
                      {/* 5. Departamentos da Demanda */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between pl-1">
                          <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Departamentos da Demanda <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] text-slate-400">Multi-seleção ativa</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                                  isSel
                                    ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 border-[#4d7c0f] dark:border-[#84cc16] shadow-xs'
                                    : 'bg-black/[0.02] dark:bg-white/[0.04] text-slate-600 dark:text-zinc-400 border-black/[0.08] dark:border-white/[0.1] hover:border-black/20'
                                }`}
                              >
                                {isSel && '✓ '}
                                {cat}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400 pl-1">
                          Apenas os colaboradores vinculados a estes departamentos receberão os alertas correspondentes.
                        </p>
                      </div>

                      {/* 6. Início do Chamado: Cronômetro Ativo vs Fila de Espera */}
                      {(() => {
                        const isParaMim = !tecnicoAtribuido || 
                          (userEmail && tecnicoAtribuido.toLowerCase() === userEmail.toLowerCase()) || 
                          (tecnicoAtribuido === 'admin@rmcontrole.com' && (!userEmail || userEmail === 'admin@rmcontrole.com'));

                        if (!isParaMim) {
                          return (
                            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2.5">
                              <span className="text-base flex-shrink-0">⏳</span>
                              <div className="space-y-0.5 leading-relaxed">
                                <span className="font-bold block">Encaminhamento para Fila de Espera</span>
                                <p className="text-[11px] opacity-90">
                                  Como o chamado está atribuído a outro operador ({getNomeTecnico(tecnicoAtribuido)}), ele entrará automaticamente na fila em espera até que o colaborador visualize e inicie o atendimento.
                                </p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-2 pt-1">
                            <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                              Modo de Início do Chamado
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <button
                                type="button"
                                onClick={() => setIniciarDireto(false)}
                                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                  !iniciarDireto
                                    ? 'bg-amber-500/10 border-amber-500/35 text-amber-900 dark:text-amber-200 shadow-xs'
                                    : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/[0.08] dark:border-white/[0.1] text-slate-600 dark:text-zinc-400 hover:border-black/[0.15]'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm">⏳</span>
                                  <span className="text-xs font-bold">Colocar na Fila de Espera</span>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-snug">
                                  Salvar na fila de triagem para atender depois ou como lembrete.
                                </p>
                              </button>

                              <button
                                type="button"
                                onClick={() => setIniciarDireto(true)}
                                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                  iniciarDireto
                                    ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 border-[#4d7c0f]/35 dark:border-[#84cc16]/35 text-[#4d7c0f] dark:text-[#84cc16] shadow-xs'
                                    : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/[0.08] dark:border-white/[0.1] text-slate-600 dark:text-zinc-400 hover:border-black/[0.15]'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm">⏱</span>
                                  <span className="text-xs font-bold">Iniciar Atendimento Agora</span>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-snug">
                                  O cronômetro ativo começa a contar imediatamente.
                                </p>
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                    </div>

                  </div>
                </div>

                {/* Rodapé Fixo do Modal com Botões Sempre Visíveis */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
                  {/* Opção de silenciar som local para quem cria */}
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={silenciarMeuDispositivo}
                      onChange={(e) => setSilenciarMeuDispositivo(e.target.checked)}
                      className="rounded accent-[#4d7c0f] dark:accent-[#84cc16]"
                    />
                    <span className="text-[11px]">Silenciar alerta sonoro neste meu dispositivo ao cadastrar</span>
                  </label>

                  <div className="flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setModalNovoChamadoOpen(false)}
                      className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer"
                    >
                      {(() => {
                        const isParaMim = !tecnicoAtribuido || 
                          (userEmail && tecnicoAtribuido.toLowerCase() === userEmail.toLowerCase()) || 
                          (tecnicoAtribuido === 'admin@rmcontrole.com' && (!userEmail || userEmail === 'admin@rmcontrole.com'));
                        return (isParaMim && iniciarDireto) ? 'Iniciar Atendimento Agora' : 'Adicionar à Fila de Espera';
                      })()}
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
