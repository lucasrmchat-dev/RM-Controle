'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getMetricasSuporte, 
  getChamadosSuporte, 
  getHistoricoChamados,
  fetchHistoricoChamados,
  deleteHistoricoChamado,
  getNomeTecnico,
  finalizarSuporte,
  getEmpresas
} from '@/lib/storage';
import SupportCompletionModal from './SupportCompletionModal';
import ConfirmModal from './ConfirmModal';
import { showToast } from './ToastNotification';
import { 
  ViewGridIcon, 
  ViewListIcon, 
  TrophyIcon, 
  MedalIcon, 
  SparklesIcon, 
  ClockIcon, 
  CheckIcon, 
  BuildingIcon, 
  CrownIcon, 
  WrenchIcon, 
  BriefcaseIcon,
  PlayIcon,
  UsersIcon,
  ChartBarIcon
} from './Icons';

export default function DashboardView({ onSelectEmpresa, userEmail }) {
  const [metricas, setMetricas] = useState({
    totalChamados: 0,
    finalizadosCount: 0,
    emAndamentoCount: 0,
    tempoMedioMinutos: 0,
    tempoMedioSegundos: 0,
    topMotivos: [],
    metricasEmpresas: [],
    metricasColaboradores: [],
    emAndamento: [],
    evolucaoUltimos7Dias: [],
  });

  const [chamadosRecentes, setChamadosRecentes] = useState([]);
  const [empresasLista, setEmpresasLista] = useState([]);

  // Períodos e Filtros de Data
  const [periodo, setPeriodo] = useState('mes_atual'); // 'hoje' | '7d' | '30d' | 'mes_atual' | 'personalizado'
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Modal para Finalizar Suporte
  const [chamadoParaFinalizar, setChamadoParaFinalizar] = useState(null);
  const [empresaDetalhesDemandas, setEmpresaDetalhesDemandas] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Modo de exibição dos chamados em andamento ('cards' | 'list')
  const [emAndamentoViewMode, setEmAndamentoViewMode] = useState('cards');

  // Timer ao vivo para chamados em andamento
  const [, setTick] = useState(0);

  const carregarDados = async () => {
    try {
      await fetchHistoricoChamados();
    } catch (e) {
      console.warn('Erro ao sincronizar historico:', e);
    }
    const met = getMetricasSuporte({ periodo, dataInicio, dataFim });
    setMetricas(met);
    const hist = getHistoricoChamados();
    setChamadosRecentes(hist.slice(0, 50));
    const emp = await getEmpresas({ pageSize: 1000 });
    const listaEmpresas = Array.isArray(emp) ? emp : (emp?.items || []);
    setEmpresasLista(listaEmpresas);
  };

  useEffect(() => {
    carregarDados();
  }, [periodo, dataInicio, dataFim]);

  useEffect(() => {
    const handleUpdate = () => carregarDados();
    window.addEventListener('suporte_updated', handleUpdate);

    // Tick a cada segundo para atualizar cronômetros em tempo real
    const timer = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      clearInterval(timer);
    };
  }, [periodo, dataInicio, dataFim]);

  const formatarDuracao = (segundos) => {
    if (!segundos || segundos <= 0) return '0s';
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
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

  const handleAbrirFinalizacao = (chamado) => {
    setChamadoParaFinalizar(chamado);
  };

  const handleExcluirHistorico = (chamadoId, empresaNome) => {
    setConfirmDialog({
      title: 'Excluir Chamado do Histórico?',
      message: `Deseja realmente remover este atendimento de ${empresaNome || 'empresa'} do histórico? Esta ação é definitiva.`,
      confirmText: 'Excluir Chamado',
      variant: 'danger',
      onConfirm: async () => {
        setChamadosRecentes((prev) => prev.filter((c) => c.id !== chamadoId));
        await deleteHistoricoChamado(chamadoId, userEmail);
        showToast('Chamado removido com sucesso.', 'info');
        setConfirmDialog(null);
        await carregarDados();
      },
    });
  };

  // Cálculos do Gráfico SVG de Evolução Temporal
  const maxChamadosDia = Math.max(1, ...metricas.evolucaoUltimos7Dias.map((d) => d.chamados));
  const svgWidth = 520;
  const svgHeight = 175;
  const paddingLeft = 45;
  const paddingRight = 25;
  const paddingTop = 32;
  const paddingBottom = 26;

  const pontosGrafico = metricas.evolucaoUltimos7Dias.map((d, index) => {
    const totalPontos = metricas.evolucaoUltimos7Dias.length;
    const x = paddingLeft + (index / (totalPontos - 1 || 1)) * (svgWidth - paddingLeft - paddingRight);
    const y = svgHeight - paddingBottom - (d.chamados / maxChamadosDia) * (svgHeight - paddingTop - paddingBottom);
    return { x, y, valor: d.chamados, label: d.label, data: d.data };
  });

  const pathD = pontosGrafico.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = pontosGrafico.length > 0
    ? `${pathD} L ${pontosGrafico[pontosGrafico.length - 1].x} ${svgHeight - paddingBottom} L ${pontosGrafico[0].x} ${svgHeight - paddingBottom} Z`
    : '';

  // Cores da Apple para Distribuição de Motivos (Donut)
  const coresApple = ['#4d7c0f', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];
  const totalMotivosCount = metricas.topMotivos.reduce((acc, m) => acc + m.count, 0);

  let acumuladorOffset = 0;
  const donutSegments = metricas.topMotivos.map((m, idx) => {
    const color = coresApple[idx % coresApple.length];
    const percentual = totalMotivosCount > 0 ? (m.count / totalMotivosCount) : 0;
    const dashArray = `${percentual * 283} ${283 - percentual * 283}`;
    const dashOffset = -acumuladorOffset * 283;
    acumuladorOffset += percentual;
    return { ...m, color, strokeDasharray: dashArray, strokeDashoffset: dashOffset };
  });

  const taxaResolucaoGeral = metricas.totalChamados > 0 
    ? Math.round((metricas.finalizadosCount / metricas.totalChamados) * 100) 
    : 100;

  return (
    <div className="space-y-7 text-[#1d1d1f] dark:text-[#f5f5f7]">
      
      {/* ============================================================================== */}
      {/* CABEÇALHO DO DASHBOARD (ESTRITAMENTE MÉTRICAS E INDICADORES) */}
      {/* ============================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 border border-[#4d7c0f]/20 dark:border-[#84cc16]/30 text-[#4d7c0f] dark:text-[#84cc16] text-xs font-semibold shadow-xs">
              <span className="text-xs">📅</span>
              <span className="capitalize">{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#4d7c0f]/20 dark:bg-[#84cc16]/20 font-bold">Mês Vigente</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
            Dashboard de Atendimentos & Métricas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Métricas consolidadas, produtividade da equipe, clientes mais demandantes e análise temporal de suporte.
          </p>
        </div>
      </div>

      {/* Barra de Filtros de Período Estilo Apple */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/80 backdrop-blur-xl shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto p-0.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 pl-2 pr-1">Período:</span>
          {[
            { id: 'hoje', label: 'Hoje' },
            { id: '7d', label: 'Últimos 7 dias' },
            { id: '30d', label: 'Últimos 30 dias' },
            { id: 'mes_atual', label: 'Mês Atual' },
            { id: 'personalizado', label: 'Personalizado' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                periodo === p.id
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {periodo === 'personalizado' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 px-2"
          >
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] text-xs text-[#1d1d1f] dark:text-white font-mono"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] text-xs text-[#1d1d1f] dark:text-white font-mono"
            />
          </motion.div>
        )}
      </div>

      {/* ============================================================================== */}
      {/* 4 CARDS DE KPI DE ALTA FIDELIDADE (APPLE HIG) */}
      {/* ============================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total de Chamados */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Chamados</span>
            <span className="p-2 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05]">
              <ChartBarIcon className="w-4 h-4 text-[#4d7c0f] dark:text-[#84cc16]" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white font-mono tabular-nums">
              {metricas.totalChamados}
            </span>
            <span className="text-[11px] text-slate-400">no período</span>
          </div>
        </motion.div>

        {/* KPI 2: Suportes Finalizados */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Resolvidos</span>
            <span className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white font-mono tabular-nums">
              {metricas.finalizadosCount}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              {taxaResolucaoGeral}% resolvidos
            </span>
          </div>
        </motion.div>

        {/* KPI 3: Chamados em Andamento */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Em Andamento</span>
            <span className="p-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ClockIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white font-mono tabular-nums">
              {metricas.emAndamentoCount}
            </span>
            {metricas.emAndamentoCount > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                ao vivo agora
              </span>
            )}
          </div>
        </motion.div>

        {/* KPI 4: Tempo Médio de Atendimento (TMA) */}
        <motion.div 
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Tempo Médio (TMA)</span>
            <span className="p-2 rounded-2xl bg-[#4d7c0f]/10 text-[#4d7c0f] dark:text-[#84cc16]">
              <ClockIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white font-mono tabular-nums">
              {metricas.tempoMedioMinutos}
            </span>
            <span className="text-xs text-slate-400 font-medium">minutos / chamado</span>
          </div>
        </motion.div>
      </div>

      {/* ============================================================================== */}
      {/* CHAMADOS EM ANDAMENTO (AO VIVO COM CRONÔMETRO) */}
      {/* ============================================================================== */}
      {metricas.emAndamento.length > 0 && (
        <div className="rounded-3xl p-6 border border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.06] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              Suportes Iniciados e em Andamento ({metricas.emAndamento.length})
            </h3>
            
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono hidden sm:inline">
                Tempo correndo ao vivo
              </span>

              {/* Alternador de Visualização Cards / Lista */}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setEmAndamentoViewMode('cards')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                    emAndamentoViewMode === 'cards'
                      ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                  }`}
                  title="Exibir em Cards"
                >
                  <ViewGridIcon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmAndamentoViewMode('list')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                    emAndamentoViewMode === 'list'
                      ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'
                  }`}
                  title="Exibir em Lista"
                >
                  <ViewListIcon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Lista</span>
                </button>
              </div>
            </div>
          </div>

          {emAndamentoViewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {metricas.emAndamento.map((ch) => (
                <div
                  key={ch.id}
                  className="p-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-white truncate">
                      {ch.empresa_nome}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                      Técnico: {ch.tecnico_email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-slate-400">Em atendimento há:</span>
                      <strong className="text-xs font-mono text-[#4d7c0f] dark:text-[#84cc16] tabular-nums">
                        {calcularTempoDecorrido(ch.iniciado_em)}
                      </strong>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAbrirFinalizacao(ch)}
                    className="px-3.5 py-1.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-[11px] hover:opacity-90 shadow-sm cursor-pointer flex-shrink-0"
                  >
                    Finalizar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-xs">
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.06] text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 bg-black/[0.01] dark:bg-white/[0.02]">
                <div className="col-span-5">Empresa em Suporte</div>
                <div className="col-span-3">Técnico Operador</div>
                <div className="col-span-2">Tempo Decorrido</div>
                <div className="col-span-2 text-right">Ação</div>
              </div>

              <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
                {metricas.emAndamento.map((ch) => (
                  <div key={ch.id} className="p-3.5 sm:px-4 sm:py-3 flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:gap-3 items-start sm:items-center hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                    <div className="sm:col-span-5 flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping flex-shrink-0"></span>
                      <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-white truncate">
                        {ch.empresa_nome}
                      </h4>
                    </div>

                    <div className="sm:col-span-3 min-w-0">
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate block">
                        {ch.tecnico_email}
                      </span>
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-1.5">
                      <strong className="text-xs font-mono text-[#4d7c0f] dark:text-[#84cc16] tabular-nums">
                        {calcularTempoDecorrido(ch.iniciado_em)}
                      </strong>
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-end w-full sm:w-auto">
                      <button
                        onClick={() => handleAbrirFinalizacao(ch)}
                        className="px-3 py-1 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-[11px] hover:opacity-90 shadow-sm cursor-pointer"
                      >
                        Finalizar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================================== */}
      {/* SEÇÃO LÚDICA COM MOTION: DESEMPENHO E PRODUTIVIDADE DA EQUIPE */}
      {/* ============================================================================== */}
      <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 flex items-center justify-center text-[#4d7c0f] dark:text-[#84cc16]">
                <UsersIcon className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Produtividade & Resoluções da Equipe
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Acompanhe os chamados atendidos e o volume de problemas solucionados por cada colaborador.
            </p>
          </div>

          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono self-start sm:self-auto">
            {metricas.metricasColaboradores.length} membros mapeados
          </span>
        </div>

        {metricas.metricasColaboradores.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-6 text-center">
            Nenhum membro com chamados registrados no período selecionado.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {metricas.metricasColaboradores.map((col, idx) => {
              const isTopPerformer = idx === 0 && col.resolvidos > 0;

              return (
                <motion.div
                  key={col.email}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.06 }}
                  whileHover={{ y: -3 }}
                  className={`rounded-3xl p-5 border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isTopPerformer
                      ? 'border-[#4d7c0f]/40 dark:border-[#84cc16]/40 bg-gradient-to-b from-[#4d7c0f]/[0.05] to-transparent dark:from-[#84cc16]/[0.08] shadow-apple-hover'
                      : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-[#16161a] hover:shadow-apple-hover'
                  }`}
                >
                  <div>
                    {/* Header do Membro com Avatar e Badge */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#4d7c0f]/20 to-[#84cc16]/25 dark:from-[#84cc16]/20 dark:to-[#4d7c0f]/10 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-sm flex items-center justify-center border border-[#4d7c0f]/20 flex-shrink-0">
                          {col.nome.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white truncate">
                            {col.nome}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono truncate block">
                            {col.email}
                          </span>
                        </div>
                      </div>

                      {/* Distintivo de Liderança / Destaque */}
                      {isTopPerformer ? (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 border border-[#4d7c0f]/30 dark:border-[#84cc16]/30 text-[#4d7c0f] dark:text-[#84cc16] text-[10px] font-bold shadow-xs flex-shrink-0">
                          <TrophyIcon className="w-3.5 h-3.5" />
                          <span>Destaque</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 dark:text-zinc-400 flex-shrink-0">
                          #{idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Bloco de Suportes Resolvidos */}
                    <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-black/[0.04] dark:border-white/[0.06] mb-3">
                      <div>
                        <span className="text-[10px] font-medium text-slate-400 block">Resolvidos</span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-xl font-bold font-mono text-[#4d7c0f] dark:text-[#84cc16] tabular-nums">
                            {col.resolvidos}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            / {col.total_chamados} total
                          </span>
                        </div>
                      </div>

                      <div className="border-l border-black/[0.04] dark:border-white/[0.06] pl-2.5">
                        <span className="text-[10px] font-medium text-slate-400 block">Tempo Médio</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-xl font-bold font-mono text-[#1d1d1f] dark:text-white tabular-nums">
                            {col.tempo_medio_minutos}
                          </span>
                          <span className="text-[10px] text-slate-400">min</span>
                        </div>
                      </div>
                    </div>

                    {/* Barra de Progresso Relativo */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                        <span>Taxa de Resolução</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">{col.taxa_resolucao}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#4d7c0f] to-[#84cc16] transition-all duration-500"
                          style={{ width: `${col.taxa_resolucao}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="pt-3 mt-3 border-t border-black/[0.04] dark:border-white/[0.05] flex items-center justify-between text-[11px] text-slate-400">
                    <span className="capitalize">{col.papel}</span>
                    {col.em_andamento > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                        {col.em_andamento} em atendimento
                      </span>
                    ) : (
                      <span className="text-slate-400">Disponível</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================================== */}
      {/* SEÇÃO: EMPRESAS QUE MAIS DEMANDAM SUPORTE */}
      {/* ============================================================================== */}
      <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <BuildingIcon className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Empresas com Maior Demanda de Suporte
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Identifique as contas com maior volume de chamados, causas recorrentes e tempo dedicado pela equipe.
            </p>
          </div>

          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono self-start sm:self-auto">
            {metricas.metricasEmpresas.length} empresas com chamados
          </span>
        </div>

        {metricas.metricasEmpresas.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-6 text-center">
            Nenhuma empresa com registros de suporte no período selecionado.
          </p>
        ) : (
          <div className="space-y-3">
            {metricas.metricasEmpresas.slice(0, 8).map((emp, idx) => {
              const maxChamados = Math.max(1, ...metricas.metricasEmpresas.map((e) => e.total_chamados));
              const barWidth = Math.max(8, Math.round((emp.total_chamados / maxChamados) * 100));
              const empresaObj = Array.isArray(empresasLista) ? empresasLista.find(
                (e) => (emp.empresa_id && e.id === emp.empresa_id) || 
                       (emp.empresa_nome && e.nome && e.nome.trim().toLowerCase() === emp.empresa_nome.trim().toLowerCase())
              ) : null;

              return (
                <div
                  key={emp.empresa_id}
                  className="p-4 sm:p-5 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-zinc-900/60 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="w-6 h-6 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] font-mono text-xs font-bold flex items-center justify-center text-slate-600 dark:text-zinc-400 flex-shrink-0">
                        #{idx + 1}
                      </span>
                      <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white truncate">
                        {emp.empresa_nome}
                      </h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                        {emp.total_chamados} {emp.total_chamados === 1 ? 'chamado' : 'chamados'} ({emp.percentual_do_total}%)
                      </span>
                      {emp.em_andamento > 0 && (
                        <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                          {emp.em_andamento} em aberto
                        </span>
                      )}
                    </div>

                    {/* Barra de Proporção de Demanda */}
                    <div className="w-full h-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-[#4d7c0f] dark:to-[#84cc16] transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-zinc-400 font-mono flex-wrap">
                      <span>
                        Principal Motivo: <strong className="text-slate-800 dark:text-zinc-200">{emp.motivo_mais_frequente}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        TMA: <strong className="text-slate-800 dark:text-zinc-200">{emp.tempo_medio_minutos} min</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Tempo Total: <strong className="text-slate-800 dark:text-zinc-200">{Math.round((emp.duracao_total || 0) / 60)} min</strong>
                      </span>
                    </div>
                  </div>

                  {onSelectEmpresa && (
                    <button
                      onClick={() => {
                        if (empresaObj) {
                          onSelectEmpresa(empresaObj);
                        } else {
                          setEmpresaDetalhesDemandas(emp);
                        }
                      }}
                      className="px-4 py-2 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-800 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-[#1d1d1f] dark:text-white transition-all self-start sm:self-center flex-shrink-0 cursor-pointer shadow-xs"
                    >
                      Ver Empresa →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================================== */}
      {/* SEÇÃO DE GRÁFICOS WIDESCREEN ESTILO APPLE */}
      {/* ============================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        
        {/* GRÁFICO 1: EVOLUÇÃO DIÁRIA DE CHAMADOS */}
        <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Evolução Diária de Atendimentos
              </h3>
              <p className="text-[11px] text-slate-400">Volume de chamados nos últimos 7 dias</p>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400">
              Tendência
            </span>
          </div>

          {/* Gráfico SVG de Área Suave */}
          <div className="w-full overflow-x-auto pt-2">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48 overflow-visible">
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4d7c0f" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#4d7c0f" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Eixo Vertical Y com Escala Numérica e Linhas de Grade */}
              {[
                { ratio: 0, val: maxChamadosDia },
                { ratio: 0.5, val: Math.round(maxChamadosDia / 2) },
                { ratio: 1, val: 0 }
              ].map((lvl, i) => {
                const y = paddingTop + lvl.ratio * (svgHeight - paddingTop - paddingBottom);
                return (
                  <g key={i}>
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="text-[10px] font-mono font-medium fill-slate-400 dark:fill-zinc-500"
                    >
                      {lvl.val}
                    </text>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={svgWidth - paddingRight}
                      y2={y}
                      stroke="currentColor"
                      className="text-black/[0.04] dark:text-white/[0.05]"
                      strokeDasharray="4 4"
                    />
                  </g>
                );
              })}

              {/* Área preenchida */}
              {areaD && <path d={areaD} fill="url(#areaGradient)" />}

              {/* Linha principal com sombra suave */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#4d7c0f"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Pontos de dados com badge numérico */}
              {pontosGrafico.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    className="fill-white dark:fill-zinc-900 stroke-[#4d7c0f] dark:stroke-[#84cc16]"
                    strokeWidth="2.5"
                  />
                  {/* Badge numérico de quantificação acima do ponto */}
                  <g>
                    <rect
                      x={p.x - 11}
                      y={Math.max(4, p.y - 20)}
                      width="22"
                      height="14"
                      rx="4"
                      className={p.valor > 0 ? "fill-[#4d7c0f] dark:fill-[#84cc16]" : "fill-black/10 dark:fill-white/10"}
                    />
                    <text
                      x={p.x}
                      y={Math.max(4, p.y - 20) + 10}
                      textAnchor="middle"
                      className={p.valor > 0 ? "text-[9px] font-mono font-bold fill-white dark:fill-zinc-950" : "text-[9px] font-mono font-medium fill-slate-500 dark:fill-zinc-400"}
                    >
                      {p.valor}
                    </text>
                  </g>
                  <text
                    x={p.x}
                    y={svgHeight - 6}
                    textAnchor="middle"
                    className="text-[10px] font-medium fill-slate-400 dark:fill-zinc-500"
                  >
                    {p.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* GRÁFICO 2: DISTRIBUIÇÃO DOS MOTIVOS DE SUPORTE (DONUT CHART) */}
        <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Distribuição dos Motivos de Suporte
              </h3>
              <p className="text-[11px] text-slate-400">Proporção e causas de maior impacto</p>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400">
              Donut Chart
            </span>
          </div>

          {metricas.topMotivos.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-slate-400 italic">
              Nenhum chamado finalizado para gerar gráfico de motivos.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-8 pt-2">
              
              {/* Gráfico Donut em SVG */}
              <div className="relative w-40 h-40 flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="transparent"
                    stroke="currentColor"
                    className="text-black/[0.04] dark:text-white/[0.05]"
                    strokeWidth="10"
                  />
                  {donutSegments.map((seg, idx) => (
                    <circle
                      key={idx}
                      cx="50"
                      cy="50"
                      r="45"
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="10"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      strokeLinecap="round"
                    />
                  ))}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-bold font-mono text-[#1d1d1f] dark:text-white leading-none tabular-nums">
                    {metricas.finalizadosCount}
                  </span>
                  <span className="text-[9px] uppercase font-bold text-slate-400 mt-1">
                    Chamados
                  </span>
                </div>
              </div>

              {/* Legenda dos Motivos com Percentual */}
              <div className="flex-1 space-y-2.5 w-full">
                {donutSegments.map((seg, idx) => {
                  const pct = totalMotivosCount > 0 ? Math.round((seg.count / totalMotivosCount) * 100) : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
                          <span className="font-medium text-slate-800 dark:text-zinc-200 truncate" title={seg.nome}>
                            {seg.nome}
                          </span>
                        </div>
                        <span className="font-mono text-slate-500 font-semibold text-[11px] tabular-nums flex-shrink-0 ml-2">
                          {seg.count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: seg.color }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>

      </div>

      {/* ============================================================================== */}
      {/* HISTÓRICO RECENTE DE ATENDIMENTOS */}
      {/* ============================================================================== */}
      <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <span>Histórico Recente de Atendimentos ({chamadosRecentes.length})</span>
          <span className="text-[10px] text-slate-400 font-mono">Registrado com operador e data</span>
        </div>

        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {chamadosRecentes.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Nenhum suporte realizado ainda.
            </div>
          ) : (
            chamadosRecentes.map((ch) => {
              const nomeTecnico = ch.tecnico_nome || getNomeTecnico(ch.tecnico_email, ch.atendente_nome || ch.atendente);
              const isConcluido = ch.status === 'finalizado' || ch.status === 'concluido';

              return (
                <div key={ch.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                        {ch.empresa_nome}
                      </span>
                      <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        isConcluido
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                      }`}>
                        {isConcluido ? 'Concluído' : 'Em Aberto'}
                      </span>
                      {ch.motivo && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 font-medium">
                          {ch.motivo}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400 font-mono flex-wrap">
                      <span>
                        Técnico: <strong className="text-slate-800 dark:text-zinc-200 font-semibold">{nomeTecnico}</strong>
                        {ch.tecnico_email && <span className="text-[10px] text-slate-400 ml-1">({ch.tecnico_email})</span>}
                      </span>
                      <span>•</span>
                      <span>
                        Data: {new Date(ch.finalizado_em || ch.iniciado_em || ch.created_at).toLocaleString('pt-BR')}
                      </span>
                      {ch.solicitante_nome && (
                        <>
                          <span>•</span>
                          <span>Solicitante: <strong className="text-slate-700 dark:text-zinc-300">{ch.solicitante_nome}</strong></span>
                        </>
                      )}
                    </div>

                    {ch.observacoes && (
                      <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-1 italic">
                        Solução: {ch.observacoes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center flex-shrink-0">
                    <div className="text-right font-mono">
                      <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block tabular-nums">
                        {isConcluido ? formatarDuracao(ch.duracao_segundos || ch.tempo_ativo_segundos) : calcularTempoDecorrido(ch.iniciado_em)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {ch.tempo_espera_segundos > 0 ? `Espera: ${Math.round(ch.tempo_espera_segundos / 60)}m` : 'Atendimento'}
                      </span>
                    </div>

                    {/* Botão de Excluir Chamado do Histórico */}
                    <button
                      type="button"
                      onClick={() => handleExcluirHistorico(ch.id, ch.empresa_nome)}
                      className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl hover:bg-red-500/10 transition-all cursor-pointer"
                      title="Excluir este chamado do histórico"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal de Detalhes da Demanda por Empresa (quando clicado no Dashboard) */}
      {empresaDetalhesDemandas && (
        <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] p-6 shadow-2xl space-y-4 text-[#1d1d1f] dark:text-[#f5f5f7]">
            <div className="flex items-center justify-between border-b border-black/[0.05] dark:border-white/[0.06] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">
                  {empresaDetalhesDemandas.empresa_nome}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {empresaDetalhesDemandas.total_chamados} chamados • TMA: {empresaDetalhesDemandas.tempo_medio_minutos} min • Motivo: {empresaDetalhesDemandas.motivo_mais_frequente}
                </p>
              </div>
              <button
                onClick={() => setEmpresaDetalhesDemandas(null)}
                className="p-1 rounded-full text-slate-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {chamadosRecentes
                .filter(
                  (c) =>
                    c.empresa_nome === empresaDetalhesDemandas.empresa_nome ||
                    (empresaDetalhesDemandas.empresa_id && c.empresa_id === empresaDetalhesDemandas.empresa_id)
                )
                .map((ch) => (
                  <div
                    key={ch.id}
                    className="p-3 rounded-2xl border border-black/[0.05] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.02] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1d1d1f] dark:text-white">{ch.motivo || 'Atendimento Geral'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {ch.duracao_segundos ? `${Math.round(ch.duracao_segundos / 60)} min` : 'Retroativo'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Técnico: {ch.tecnico_nome} • {new Date(ch.finalizado_em || ch.created_at).toLocaleString('pt-BR')}
                      </div>
                      {ch.observacoes && (
                        <p className="text-[10px] text-slate-400 italic mt-1">{ch.observacoes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setConfirmDialog({
                          title: 'Excluir Atendimento?',
                          message: `Deseja remover este atendimento de ${ch.motivo || 'suporte'} realizado em ${new Date(ch.finalizado_em || ch.created_at).toLocaleDateString()}?`,
                          confirmText: 'Excluir',
                          variant: 'danger',
                          onConfirm: async () => {
                            await deleteHistoricoChamado(ch.id, userEmail);
                            showToast('Chamado excluído.', 'info');
                            setConfirmDialog(null);
                            carregarDados();
                          }
                        });
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 cursor-pointer flex-shrink-0"
                      title="Excluir este chamado"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-black/[0.05] dark:border-white/[0.06]">
              <button
                onClick={() => {
                  setConfirmDialog({
                    title: `Excluir Todos os Chamados de ${empresaDetalhesDemandas.empresa_nome}?`,
                    message: `Todos os registros de atendimento vinculados à conta "${empresaDetalhesDemandas.empresa_nome}" serão permanentemente removidos.`,
                    confirmText: 'Excluir Todos os Registros',
                    variant: 'danger',
                    onConfirm: async () => {
                      const filtrados = chamadosRecentes.filter(
                        (c) =>
                          c.empresa_nome === empresaDetalhesDemandas.empresa_nome ||
                          (empresaDetalhesDemandas.empresa_id && c.empresa_id === empresaDetalhesDemandas.empresa_id)
                      );
                      for (const ch of filtrados) {
                        await deleteHistoricoChamado(ch.id, userEmail);
                      }
                      showToast(`Registros de ${empresaDetalhesDemandas.empresa_nome} limpos com sucesso.`, 'info');
                      setConfirmDialog(null);
                      setEmpresaDetalhesDemandas(null);
                      carregarDados();
                    },
                  });
                }}
                className="text-xs text-red-500 hover:underline cursor-pointer font-medium"
              >
                Limpar Chamados desta Conta
              </button>

              <button
                onClick={() => setEmpresaDetalhesDemandas(null)}
                className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação Personalizado Apple (Zero popups nativos) */}
      <ConfirmModal
        isOpen={Boolean(confirmDialog)}
        title={confirmDialog?.title || 'Confirmar'}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText || 'Confirmar'}
        cancelText={confirmDialog?.cancelText || 'Cancelar'}
        variant={confirmDialog?.variant || 'danger'}
        onConfirm={confirmDialog?.onConfirm}
        onClose={() => setConfirmDialog(null)}
      />

      {/* Modal Imersivo de Finalização de Suporte */}
      <SupportCompletionModal
        isOpen={Boolean(chamadoParaFinalizar)}
        chamado={chamadoParaFinalizar}
        onClose={() => setChamadoParaFinalizar(null)}
        onFinalizado={carregarDados}
        userEmail={userEmail}
      />
    </div>
  );
}
