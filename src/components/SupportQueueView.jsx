'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
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
  getEmpresaCredenciais
} from '@/lib/storage';
import { stopSupportNotificationLoop } from '@/lib/audioNotifications';
import SupportCompletionModal from './SupportCompletionModal';
import { 
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

  // Modal para Finalizar Suporte
  const [chamadoParaFinalizar, setChamadoParaFinalizar] = useState(null);

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
  const [novaObservacao, setNovaObservacao] = useState('');
  const [feedback, setFeedback] = useState('');

  const carregarDados = async () => {
    const todos = getChamadosSuporte();
    setChamados(todos);
    setEquipeLista(getEquipeUsuarios());
    const resEmp = await getEmpresas({ pageSize: 1000 });
    const lista = Array.isArray(resEmp) ? resEmp : (resEmp?.items || []);
    setEmpresasLista(lista);
    if (lista.length > 0 && !empresaSelecionada) {
      setEmpresaSelecionada(lista[0]);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const handleUpdate = () => carregarDados();
    window.addEventListener('suporte_updated', handleUpdate);
    window.addEventListener('equipe_updated', handleUpdate);

    // Ticker a cada 1 segundo para atualizar os dois cronômetros em tempo real
    const timer = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      window.removeEventListener('equipe_updated', handleUpdate);
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
  }, [chamados, filtroStatus, busca]);

  // Ações de Chamado
  const handleAceitarSuporte = async (chamado) => {
    await assumirSuporte({ chamado_id: chamado.id, userEmail: userEmail || 'admin@rmcontrole.com' });
    stopSupportNotificationLoop();
    showFeedbackMsg(`Você aceitou o suporte de ${chamado.empresa_nome}. Cronômetro ativo iniciado!`);
  };

  const handleCancelarChamado = async (chamado) => {
    if (confirm(`Deseja cancelar o suporte de ${chamado.empresa_nome}?`)) {
      await cancelarSuporte({ chamado_id: chamado.id, userEmail });
      stopSupportNotificationLoop();
      showFeedbackMsg('Chamado cancelado.');
    }
  };

  const handleCadastrarNovoColaboradorInline = async () => {
    if (!novoColabNome.trim()) {
      alert('Nome do colaborador é obrigatório.');
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
      alert(e.message);
    }
  };

  const handleCriarChamado = async (e) => {
    e.preventDefault();
    if (!empresaSelecionada) {
      alert('Selecione uma empresa.');
      return;
    }

    const solicitanteFinal = solicitanteSelecionado?.nome || solicitanteManual.trim() || 'Colaborador da Empresa';

    try {
      await adicionarChamadoFila({
        empresa_id: empresaSelecionada.id,
        empresa_nome: empresaSelecionada.nome,
        solicitante_nome: solicitanteFinal,
        solicitante_email: solicitanteSelecionado?.email || '',
        solicitante_telefone: solicitanteSelecionado?.telefone || '',
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
      alert(err.message);
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
            Fila de Suporte Técnico
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Dois cronômetros simultâneos: acompanhe o tempo de espera (triagem) e o tempo de atendimento ativo.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setModalNovoChamadoOpen(true);
              setTecnicoAtribuido(userEmail || 'admin@rmcontrole.com');
            }}
            className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20 hover:opacity-95 flex items-center gap-2 transition-all cursor-pointer"
          >
            <span className="text-sm font-bold">+</span>
            <span>Novo Chamado na Fila</span>
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

          {/* Campo de Busca */}
          <div className="relative min-w-[260px]">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar chamado, empresa ou técnico..."
              className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs font-medium text-[#1d1d1f] dark:text-white placeholder-slate-400 focus:outline-none"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}\\n                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

        </div>
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
              onClick={() => setModalNovoChamadoOpen(true)}
              className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm cursor-pointer"
            >
              + Adicionar Chamado à Fila
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {chamadosFiltrados.map((ch) => {
            const isEmAndamento = ch.status === 'em_andamento';
            const isAguardando = ch.status === 'aguardando_visualizacao' || ch.status === 'pendente';
            const isFinalizado = ch.status === 'concluido' || ch.status === 'finalizado';
            const empresaObj = empresasLista.find((e) => e.id === ch.empresa_id);

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
                        <span>⏳ Espera:</span>
                        <span className="tabular-nums">{calcularTempoEspera(ch)}</span>
                      </div>

                      {/* Cronômetro 2: Tempo Ativo */}
                      {isEmAndamento && (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[11px] font-mono font-bold">
                          <span>⏱ Ativo:</span>
                          <span className="tabular-nums">{calcularTempoAtivo(ch)}</span>
                        </div>
                      )}

                    </div>

                    {/* Nome da Empresa */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">
                        {ch.empresa_nome}
                      </h3>
                      {empresaObj?.servidor_alocado && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 font-mono">
                          {empresaObj.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}
                        </span>
                      )}
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

                        {empresaObj && onSelectEmpresa && (
                          <button
                            onClick={() => onSelectEmpresa(empresaObj)}
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

                        {empresaObj && onSelectEmpresa && (
                          <button
                            onClick={() => onSelectEmpresa(empresaObj)}
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

                  </div>

                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL DE CRIAÇÃO DE CHAMADO COM BUSCA DE EMPRESA E SOLICITANTE */}
      {/* ============================================================================== */}
      <AnimatePresence>
        {modalNovoChamadoOpen && (
          <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-xl rounded-[32px] bg-white dark:bg-[#16161a] border border-black/[0.08] dark:border-white/[0.1] p-6 sm:p-8 shadow-2xl space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7] relative my-auto"
            >
              
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
                <div>
                  <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">
                    Abrir Chamado de Suporte
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Selecione a empresa, o solicitante e atribua o técnico responsável.
                  </p>
                </div>
                <button
                  onClick={() => setModalNovoChamadoOpen(false)}
                  className="p-2 text-slate-400 hover:text-black dark:hover:text-white rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCriarChamado} className="space-y-4">
                
                {/* 1. Empresa com Busca Instantânea */}
                <div className="space-y-1.5 relative">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                    Empresa do Cliente <span className="text-red-500">*</span>
                  </label>
                  
                  {/* Seletor Estilizado com Busca */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDropdownEmpresaAberto(!dropdownEmpresaAberto)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-left flex items-center justify-between cursor-pointer"
                    >
                      <span className="text-xs font-medium truncate">
                        {empresaSelecionada ? empresaSelecionada.nome : 'Selecione uma empresa...'}
                      </span>
                      <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {dropdownEmpresaAberto && (
                      <div className="absolute top-full mt-1.5 left-0 w-full z-30 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.08] dark:border-white/[0.12] shadow-2xl p-2 space-y-1.5 backdrop-blur-2xl max-h-56 overflow-y-auto">
                        <input
                          type="text"
                          value={buscaEmpresa}
                          onChange={(e) => setBuscaEmpresa(e.target.value)}
                          placeholder="Digitar nome da empresa..."
                          className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                          autoFocus
                        />
                        {empresasFiltradasBusca.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            Nenhuma empresa encontrada com este nome.
                          </div>
                        ) : (
                          empresasFiltradasBusca.map((emp) => {
                            const isSel = empresaSelecionada?.id === emp.id;
                            return (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  setEmpresaSelecionada(emp);
                                  setDropdownEmpresaAberto(false);
                                  setSolicitanteSelecionado(null);
                                }}
                                className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs cursor-pointer ${
                                  isSel 
                                    ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold' 
                                    : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                }`}
                              >
                                <span>{emp.nome}</span>
                                {isSel && <CheckIcon className="w-3.5 h-3.5" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Colaborador Solicitante com Busca e Cadastro Rápido */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between pl-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                      Colaborador Solicitante na Empresa
                    </label>
                    <button
                      type="button"
                      onClick={() => setModoCadastroColab(!modoCadastroColab)}
                      className="text-[11px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline cursor-pointer"
                    >
                      {modoCadastroColab ? '← Escolher da Lista' : '+ Cadastrar Novo Solicitante'}
                    </button>
                  </div>

                  {modoCadastroColab ? (
                    /* Formulário Inline de Cadastro Rápido de Solicitante */
                    <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2.5">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                        Adicionar Solicitante à Empresa:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={novoColabNome}
                          onChange={(e) => setNovoColabNome(e.target.value)}
                          placeholder="Nome do colaborador *"
                          className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                        />
                        <input
                          type="text"
                          value={novoColabCargo}
                          onChange={(e) => setNovoColabCargo(e.target.value)}
                          placeholder="Cargo ou setor (ex: Gerente)"
                          className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                        />
                        <input
                          type="email"
                          value={novoColabEmail}
                          onChange={(e) => setNovoColabEmail(e.target.value)}
                          placeholder="E-mail (opcional)"
                          className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                        />
                        <input
                          type="text"
                          value={novoColabTelefone}
                          onChange={(e) => setNovoColabTelefone(e.target.value)}
                          placeholder="WhatsApp (opcional)"
                          className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleCadastrarNovoColaboradorInline}
                        className="px-3.5 py-1.5 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold hover:opacity-90 cursor-pointer"
                      >
                        Salvar e Selecionar Solicitante
                      </button>
                    </div>
                  ) : (
                    /* Dropdown Estilizado com Busca */
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setDropdownSolicitanteAberto(!dropdownSolicitanteAberto)}
                        className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-left flex items-center justify-between cursor-pointer"
                      >
                        <span className="text-xs font-medium truncate">
                          {solicitanteSelecionado ? `${solicitanteSelecionado.nome} (${solicitanteSelecionado.cargo || 'Colaborador'})` : 'Selecione ou busque o solicitante...'}
                        </span>
                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {dropdownSolicitanteAberto && (
                        <div className="absolute top-full mt-1.5 left-0 w-full z-30 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.08] dark:border-white/[0.12] shadow-2xl p-2 space-y-1.5 backdrop-blur-2xl max-h-52 overflow-y-auto">
                          <input
                            type="text"
                            value={buscaSolicitante}
                            onChange={(e) => setBuscaSolicitante(e.target.value)}
                            placeholder="Buscar nome do colaborador..."
                            className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                            autoFocus
                          />
                          {colaboradoresFiltradosBusca.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              Nenhum colaborador encontrado. Você pode cadastrar acima.
                            </div>
                          ) : (
                            colaboradoresFiltradosBusca.map((c) => {
                              const isSel = solicitanteSelecionado?.id === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setSolicitanteSelecionado(c);
                                    setDropdownSolicitanteAberto(false);
                                  }}
                                  className={`w-full p-2 rounded-xl text-left flex items-center justify-between text-xs cursor-pointer ${
                                    isSel
                                      ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold'
                                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                                  }`}
                                >
                                  <div>
                                    <span className="block">{c.nome}</span>
                                    {c.cargo && <span className="text-[10px] text-slate-400 block">{c.cargo}</span>}
                                  </div>
                                  {isSel && <CheckIcon className="w-3.5 h-3.5" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Atribuição de Atendente Técnico */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                    Atribuir Atendimento a
                  </label>
                  <select
                    value={tecnicoAtribuido}
                    onChange={(e) => setTecnicoAtribuido(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium focus:outline-none cursor-pointer"
                  >
                    <option value={userEmail || 'admin@rmcontrole.com'}>
                      Para mim ({getNomeTecnico(userEmail)}) [Padrão]
                    </option>
                    {equipeLista
                      .filter((eq) => (eq.email || '').toLowerCase() !== (userEmail || '').toLowerCase())
                      .map((eq) => (
                        <option key={eq.id} value={eq.email}>
                          {eq.nome} ({eq.papel})
                        </option>
                      ))}
                    <option value="">Fila Geral (Aguardando Atendente Livre)</option>
                  </select>
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
                    placeholder="Ex: Cliente relata que mensagens do WhatsApp estão demorando para disparar..."
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none leading-relaxed"
                  />
                </div>

                {/* Opção de Iniciar Atendimento Imediato */}
                <div className="flex items-center gap-2 pl-1 pt-1">
                  <input
                    type="checkbox"
                    id="chkIniciarAgora"
                    checked={iniciarDireto}
                    onChange={(e) => setIniciarDireto(e.target.checked)}
                    className="rounded border-slate-300 text-[#4d7c0f] focus:ring-[#4d7c0f]"
                  />
                  <label htmlFor="chkIniciarAgora" className="text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                    Iniciar cronômetro de atendimento ativo imediatamente
                  </label>
                </div>

                {/* Botões do Modal */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
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
                    {iniciarDireto ? 'Iniciar Suporte Agora' : 'Adicionar à Fila de Espera'}
                  </motion.button>
                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

    </div>
  );
}
