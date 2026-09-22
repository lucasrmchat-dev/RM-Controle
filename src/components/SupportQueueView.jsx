'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getChamadosSuporte, 
  iniciarSuporte, 
  adicionarChamadoFila, 
  assumirSuporte, 
  cancelarSuporte, 
  getMotivosSuporte, 
  getEmpresas, 
  getChamadosResolvidosHoje 
} from '@/lib/storage';
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
  RefreshIcon,
  CrownIcon
} from './Icons';

export default function SupportQueueView({ onSelectEmpresa, userEmail }) {
  const [chamados, setChamados] = useState([]);
  const [empresasLista, setEmpresasLista] = useState([]);
  const [motivosList, setMotivosList] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('ativos'); // 'ativos' | 'em_andamento' | 'pendente' | 'resolvidos_hoje'
  const [filtroPrioridade, setFiltroPrioridade] = useState('todas'); // 'todas' | 'urgente' | 'alta' | 'normal'
  const [busca, setBusca] = useState('');
  const [, setTick] = useState(0);

  // Modal para Finalizar Suporte
  const [chamadoParaFinalizar, setChamadoParaFinalizar] = useState(null);

  // Modal para Abrir Novo Chamado na Fila
  const [modalNovoChamadoOpen, setModalNovoChamadoOpen] = useState(false);
  const [novaEmpresaId, setNovaEmpresaId] = useState('');
  const [novoMotivo, setNovoMotivo] = useState('');
  const [novaPrioridade, setNovaPrioridade] = useState('normal');
  const [novoSolicitante, setNovoSolicitante] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [iniciarDireto, setIniciarDireto] = useState(true);
  const [feedback, setFeedback] = useState('');

  const carregarDados = async () => {
    const todos = getChamadosSuporte();
    setChamados(todos);
    setMotivosList(getMotivosSuporte());
    const resEmp = await getEmpresas({ pageSize: 1000 });
    const lista = Array.isArray(resEmp) ? resEmp : (resEmp?.items || []);
    setEmpresasLista(lista);
    if (lista.length > 0 && !novaEmpresaId) {
      setNovaEmpresaId(lista[0].id);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const handleUpdate = () => carregarDados();
    window.addEventListener('suporte_updated', handleUpdate);

    // Ticker a cada segundo para atualizar cronômetros em tempo real
    const timer = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      clearInterval(timer);
    };
  }, []);

  const showFeedbackMsg = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3500);
  };

  const calcularTempoDecorrido = (inicioIso) => {
    if (!inicioIso) return '00:00';
    const agora = Date.now();
    const inicio = new Date(inicioIso).getTime();
    const diffSeg = Math.max(0, Math.floor((agora - inicio) / 1000));
    const mins = Math.floor(diffSeg / 60);
    const secs = diffSeg % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const calcularTempoEspera = (createdIso) => {
    if (!createdIso) return '0 min';
    const agora = Date.now();
    const criado = new Date(createdIso).getTime();
    const diffMin = Math.max(0, Math.floor((agora - criado) / 60000));
    if (diffMin < 1) return 'menos de 1 min';
    if (diffMin < 60) return `${diffMin} min`;
    const horas = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `${horas}h ${m}m`;
  };

  const formatarDuracao = (segundos) => {
    if (!segundos || segundos <= 0) return '0 min';
    const mins = Math.round(segundos / 60);
    return `${mins} min`;
  };

  // KPIs
  const emAndamento = useMemo(() => chamados.filter((c) => c.status === 'em_andamento'), [chamados]);
  const pendentes = useMemo(() => chamados.filter((c) => c.status === 'pendente'), [chamados]);
  const resolvidosHoje = useMemo(() => {
    const hojeStr = new Date().toISOString().split('T')[0];
    return chamados.filter((c) => c.status === 'finalizado' && (c.finalizado_em || '').startsWith(hojeStr));
  }, [chamados]);

  const tmaHojeMinutos = useMemo(() => {
    if (resolvidosHoje.length === 0) return 0;
    const totalSeg = resolvidosHoje.reduce((acc, c) => acc + (c.duracao_segundos || 0), 0);
    return Math.round((totalSeg / resolvidosHoje.length) / 60);
  }, [resolvidosHoje]);

  // Lista Filtrada
  const chamadosFiltrados = useMemo(() => {
    return chamados.filter((c) => {
      // Filtro de Status
      if (filtroStatus === 'ativos') {
        if (c.status !== 'em_andamento' && c.status !== 'pendente') return false;
      } else if (filtroStatus === 'em_andamento') {
        if (c.status !== 'em_andamento') return false;
      } else if (filtroStatus === 'pendente') {
        if (c.status !== 'pendente') return false;
      } else if (filtroStatus === 'resolvidos_hoje') {
        const hojeStr = new Date().toISOString().split('T')[0];
        if (c.status !== 'finalizado' || !(c.finalizado_em || '').startsWith(hojeStr)) return false;
      }

      // Filtro de Prioridade
      if (filtroPrioridade !== 'todas') {
        if ((c.prioridade || 'normal') !== filtroPrioridade) return false;
      }

      // Filtro de Texto
      if (busca.trim()) {
        const q = busca.toLowerCase().trim();
        const nomeMatch = (c.empresa_nome || '').toLowerCase().includes(q);
        const tecMatch = (c.tecnico_email || '').toLowerCase().includes(q);
        const motMatch = (c.motivo || '').toLowerCase().includes(q);
        const descMatch = (c.descricao || '').toLowerCase().includes(q);
        const solMatch = (c.solicitante || '').toLowerCase().includes(q);
        return nomeMatch || tecMatch || motMatch || descMatch || solMatch;
      }

      return true;
    }).sort((a, b) => {
      // Prioridade primeiro para urgentes
      const pesoPrioridade = { urgente: 3, alta: 2, normal: 1, baixa: 0 };
      const pA = pesoPrioridade[a.prioridade || 'normal'] || 1;
      const pB = pesoPrioridade[b.prioridade || 'normal'] || 1;
      if (a.status === 'pendente' && b.status === 'pendente' && pB !== pA) {
        return pB - pA;
      }
      if (a.status === 'em_andamento' && b.status !== 'em_andamento') return -1;
      if (b.status === 'em_andamento' && a.status !== 'em_andamento') return 1;
      return new Date(b.iniciado_em || b.created_at || 0) - new Date(a.iniciado_em || a.created_at || 0);
    });
  }, [chamados, filtroStatus, filtroPrioridade, busca]);

  // Ações Rápidas
  const handleAtenderChamado = async (chamado) => {
    const emp = empresasLista.find((e) => e.id === chamado.empresa_id);
    await assumirSuporte({ chamado_id: chamado.id, userEmail: userEmail || 'admin@rmcontrole.com' });
    showFeedbackMsg(`Você assumiu o suporte de ${chamado.empresa_nome}. Cronômetro iniciado!`);
  };

  const handleCancelarChamado = async (chamado) => {
    if (confirm(`Deseja cancelar o suporte de ${chamado.empresa_nome}?`)) {
      await cancelarSuporte({ chamado_id: chamado.id, userEmail });
      showFeedbackMsg('Chamado cancelado.');
    }
  };

  const handleCriarChamado = async (e) => {
    e.preventDefault();
    if (!novaEmpresaId) {
      alert('Selecione uma empresa.');
      return;
    }

    const emp = empresasLista.find((e) => e.id === novaEmpresaId);
    if (!emp) return;

    try {
      await adicionarChamadoFila({
        empresa_id: emp.id,
        empresa_nome: emp.nome,
        motivo: novoMotivo || (motivosList[0]?.nome || 'Atendimento Geral'),
        prioridade: novaPrioridade,
        descricao: novaDescricao,
        solicitante: novoSolicitante,
        iniciarAgora: iniciarDireto,
        userEmail: userEmail || 'admin@rmcontrole.com',
      });

      setModalNovoChamadoOpen(false);
      setNovoDescricao('');
      setNovoSolicitante('');
      showFeedbackMsg(iniciarDireto ? `Atendimento de ${emp.nome} iniciado com sucesso!` : `Chamado de ${emp.nome} adicionado à fila.`);
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
            Monitore chamados em tempo real, assuma filas de atendimento e agilize resoluções com 1 clique.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setModalNovoChamadoOpen(true)}
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
      {/* 4 CARDS DE KPI DA FILA DE SUPORTE */}
      {/* ============================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Em Atendimento Agora */}
        <div className="rounded-3xl p-5 border border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300">
            <span className="text-xs font-semibold uppercase tracking-wider">Em Atendimento Agora</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-200 font-mono tabular-nums">
              {emAndamento.length}
            </span>
            <span className="text-xs text-emerald-700/80 dark:text-emerald-400 font-medium">ao vivo com cronômetro</span>
          </div>
        </div>

        {/* KPI 2: Aguardando na Fila */}
        <div className="rounded-3xl p-5 border border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-500/[0.08] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-amber-800 dark:text-amber-300">
            <span className="text-xs font-semibold uppercase tracking-wider">Aguardando na Fila</span>
            <span className="p-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold">
              Fila
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-200 font-mono tabular-nums">
              {pendentes.length}
            </span>
            <span className="text-xs text-amber-700/80 dark:text-amber-400 font-medium">aguardando técnico</span>
          </div>
        </div>

        {/* KPI 3: Tempo Médio de Atendimento Hoje */}
        <div className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">TMA de Hoje</span>
            <ClockIcon className="w-4 h-4 text-[#4d7c0f] dark:text-[#84cc16]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white font-mono tabular-nums">
              {tmaHojeMinutos}
            </span>
            <span className="text-xs text-slate-400 font-medium">minutos / chamado</span>
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
            <span className="text-xs text-slate-400 font-medium">suportes finalizados</span>
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
              { id: 'ativos', label: 'Todos os Ativos', count: emAndamento.length + pendentes.length },
              { id: 'em_andamento', label: 'Em Andamento', count: emAndamento.length, ping: emAndamento.length > 0 },
              { id: 'pendente', label: 'Aguardando Atendimento', count: pendentes.length },
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

          {/* Filtro de Prioridade e Busca */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <select
              value={filtroPrioridade}
              onChange={(e) => setFiltroPrioridade(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas as Prioridades</option>
              <option value="urgente">🔴 Prioridade Urgente</option>
              <option value="alta">🟠 Prioridade Alta</option>
              <option value="normal">🔵 Prioridade Normal</option>
            </select>

            <div className="relative min-w-[220px]">
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

        </div>
      </div>

      {/* ============================================================================== */}
      {/* LISTA DINÂMICA DE CHAMADOS DA FILA */}
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
            const isPendente = ch.status === 'pendente';
            const isFinalizado = ch.status === 'finalizado';
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
                    : isPendente
                    ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/[0.03] via-transparent to-transparent dark:from-amber-500/[0.06] dark:bg-[#16161a]'
                    : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Informações da Empresa & Chamado */}
                  <div className="space-y-2 flex-1 min-w-0">
                    
                    {/* Linha Superior: Status, Prioridade, Duração ao Vivo */}
                    <div className="flex items-center gap-2 flex-wrap">
                      
                      {/* Badge de Status */}
                      {isEmAndamento && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                          <span>Em Atendimento Ao Vivo</span>
                        </span>
                      )}

                      {isPendente && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1.5">
                          <ClockIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Aguardando na Fila</span>
                        </span>
                      )}

                      {isFinalizado && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-500/15 border border-slate-500/30 text-slate-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1.5">
                          <CheckIcon className="w-3 h-3 text-emerald-600" />
                          <span>Resolvido</span>
                        </span>
                      )}

                      {/* Badge de Prioridade */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                        ch.prioridade === 'urgente'
                          ? 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30'
                          : ch.prioridade === 'alta'
                          ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30'
                          : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                      }`}>
                        {ch.prioridade || 'normal'}
                      </span>

                      {/* Cronômetro ou Tempo de Espera */}
                      {isEmAndamento && (
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#4d7c0f] dark:text-[#84cc16] pl-2 border-l border-black/10 dark:border-white/10">
                          <ClockIcon className="w-3.5 h-3.5" />
                          <span className="tabular-nums text-sm">{calcularTempoDecorrido(ch.iniciado_em)}</span>
                        </div>
                      )}

                      {isPendente && (
                        <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 pl-2 border-l border-black/10 dark:border-white/10">
                          Na fila há: <strong className="text-slate-800 dark:text-zinc-200">{calcularTempoEspera(ch.created_at)}</strong>
                        </div>
                      )}

                      {isFinalizado && (
                        <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 pl-2 border-l border-black/10 dark:border-white/10">
                          Duração: <strong className="text-slate-800 dark:text-zinc-200">{formatarDuracao(ch.duracao_segundos)}</strong>
                        </div>
                      )}

                    </div>

                    {/* Nome da Empresa e Particularidades */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">
                        {ch.empresa_nome}
                      </h3>
                      {empresaObj?.formato_atendimento && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 font-medium capitalize">
                          {empresaObj.formato_atendimento}
                        </span>
                      )}
                      {empresaObj?.servidor_alocado && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 font-mono">
                          {empresaObj.servidor_alocado === 'servidor_1' ? 'Servidor 1' : 'Servidor 2'}
                        </span>
                      )}
                    </div>

                    {/* Motivo & Descrição do Problema */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300 font-medium">
                        <span className="text-[11px] px-2 py-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] font-semibold">
                          Motivo: {ch.motivo || 'Atendimento Geral'}
                        </span>
                        {ch.solicitante && (
                          <span className="text-slate-400 text-xs">
                            • Solicitado por: <strong className="text-slate-700 dark:text-zinc-200">{ch.solicitante}</strong>
                          </span>
                        )}
                      </div>

                      {ch.descricao && (
                        <p className="text-xs text-slate-600 dark:text-zinc-400 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.05] leading-relaxed">
                          {ch.descricao}
                        </p>
                      )}

                      {/* Se finalizado, mostra a solução */}
                      {isFinalizado && ch.observacoes && (
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] p-2.5 rounded-xl border border-emerald-500/20 leading-relaxed">
                          <strong>Resolução Técnica:</strong> {ch.observacoes}
                        </p>
                      )}
                    </div>

                    {/* Atendente Responsável */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono pt-1">
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>
                        Técnico:{' '}
                        <strong className="text-slate-700 dark:text-zinc-300">
                          {ch.tecnico_email || ch.atendente || 'Aguardando atribuição'}
                        </strong>
                      </span>
                    </div>

                  </div>

                  {/* ============================================================================== */}
                  {/* BOTÕES DE AÇÃO RÁPIDA (AGILIDADE TOTAL) */}
                  {/* ============================================================================== */}
                  <div className="flex items-center gap-2 flex-wrap self-end lg:self-center flex-shrink-0">
                    
                    {/* Ações para Chamado Pendente na Fila */}
                    {isPendente && (
                      <>
                        <button
                          onClick={() => handleAtenderChamado(ch)}
                          className="px-4 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                        >
                          <PlayIcon className="w-3 h-3 fill-current" />
                          <span>Atender Agora</span>
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
                          title="Cancelar da fila"
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
                          <span>Concluir Suporte</span>
                        </button>

                        {empresaObj && onSelectEmpresa && (
                          <button
                            onClick={() => onSelectEmpresa(empresaObj)}
                            className="px-3.5 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-black/[0.03] transition-all cursor-pointer"
                          >
                            Acessar Empresa
                          </button>
                        )}

                        {ch.tecnico_email !== userEmail && (
                          <button
                            onClick={() => handleAtenderChamado(ch)}
                            className="px-3 py-2 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold transition-all cursor-pointer"
                            title="Puxar atendimento para você"
                          >
                            Assumir
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
                    {isFinalizado && empresaObj && onSelectEmpresa && (
                      <button
                        onClick={() => onSelectEmpresa(empresaObj)}
                        className="px-3.5 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-black/[0.03] transition-all cursor-pointer"
                      >
                        Ver Empresa
                      </button>
                    )}

                  </div>

                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL DE FINALIZAR SUPORTE */}
      {/* ============================================================================== */}
      {chamadoParaFinalizar && (
        <SupportCompletionModal
          isOpen={Boolean(chamadoParaFinalizar)}
          chamado={chamadoParaFinalizar}
          onClose={() => setChamadoParaFinalizar(null)}
          onFinalizado={() => {
            setChamadoParaFinalizar(null);
            carregarDados();
            showFeedbackMsg('Atendimento finalizado e registrado com sucesso!');
          }}
          userEmail={userEmail}
        />
      )}

      {/* ============================================================================== */}
      {/* MODAL PARA ABRIR NOVO CHAMADO NA FILA */}
      {/* ============================================================================== */}
      <AnimatePresence>
        {modalNovoChamadoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#16161a] border border-black/[0.08] dark:border-white/[0.1] p-6 sm:p-7 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3.5">
                <div>
                  <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                    Abrir Chamado na Fila de Suporte
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    Selecione o cliente, motivo e prioridade da demanda técnica.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalNovoChamadoOpen(false)}
                  className="p-1 text-slate-400 hover:text-black dark:hover:text-white rounded-full cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCriarChamado} className="space-y-4">
                
                {/* Empresa */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Empresa Cliente <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={novaEmpresaId}
                    onChange={(e) => setNovaEmpresaId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium cursor-pointer"
                  >
                    {empresasLista.map((emp) => (
                      <option key={emp.id} value={emp.id} className="dark:bg-zinc-900">
                        {emp.nome} ({emp.formato_atendimento || 'colaborativo'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Motivo & Prioridade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                      Motivo do Suporte <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={novoMotivo}
                      onChange={(e) => setNovoMotivo(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium cursor-pointer"
                    >
                      {motivosList.map((m) => (
                        <option key={m.id} value={m.nome} className="dark:bg-zinc-900">
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                      Prioridade
                    </label>
                    <select
                      value={novaPrioridade}
                      onChange={(e) => setNovaPrioridade(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium cursor-pointer"
                    >
                      <option value="normal" className="dark:bg-zinc-900">🔵 Normal</option>
                      <option value="alta" className="dark:bg-zinc-900">🟠 Alta</option>
                      <option value="urgente" className="dark:bg-zinc-900">🔴 Urgente / Crítica</option>
                    </select>
                  </div>
                </div>

                {/* Solicitante */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Nome do Solicitante na Empresa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={novoSolicitante}
                    onChange={(e) => setNovoSolicitante(e.target.value)}
                    placeholder="Ex: Carlos (Gerente de Atendimento)"
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                  />
                </div>

                {/* Descrição do Problema */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Descrição da Demanda / Problema
                  </label>
                  <textarea
                    rows={2}
                    value={novaDescricao}
                    onChange={(e) => setNovaDescricao(e.target.value)}
                    placeholder="Ex: WhatsApp desconectado ou lentidão no envio de mensagens..."
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white"
                  />
                </div>

                {/* Alternador: Iniciar Agora vs Colocar na Fila */}
                <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={iniciarDireto}
                      onChange={(e) => setIniciarDireto(e.target.checked)}
                      className="w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16] rounded cursor-pointer"
                    />
                    <span className="font-semibold">
                      Iniciar atendimento imediatamente agora (iniciar cronômetro para mim)
                    </span>
                  </label>
                  <p className="text-[10px] text-slate-500 pl-6.5">
                    {iniciarDireto 
                      ? 'O cronômetro ao vivo começará a rodar imediatamente com seu usuário.' 
                      : 'O chamado ficará aguardando na fila para que qualquer atendente da equipe possa assumir.'}
                  </p>
                </div>

                {/* Botões do Rodapé */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setModalNovoChamadoOpen(false)}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs rounded-full shadow-sm hover:opacity-90 cursor-pointer"
                  >
                    {iniciarDireto ? '▶ Iniciar Atendimento' : '+ Adicionar à Fila'}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
