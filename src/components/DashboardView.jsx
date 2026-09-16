'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getMetricasSuporte, 
  getChamadosSuporte, 
  getMotivosSuporte, 
  addMotivoSuporte, 
  removeMotivoSuporte, 
  finalizarSuporte 
} from '@/lib/storage';

export default function DashboardView({ onSelectEmpresa, userEmail }) {
  const [metricas, setMetricas] = useState({
    totalChamados: 0,
    finalizadosCount: 0,
    emAndamentoCount: 0,
    tempoMedioMinutos: 0,
    tempoMedioSegundos: 0,
    topMotivos: [],
    metricasEmpresas: [],
    emAndamento: [],
    evolucaoUltimos7Dias: [],
  });

  const [chamadosRecentes, setChamadosRecentes] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [isGerenciarMotivosOpen, setIsGerenciarMotivosOpen] = useState(false);
  const [novoMotivoNome, setNovoMotivoNome] = useState('');
  const [novoMotivoDesc, setNovoMotivoDesc] = useState('');

  // Modal para Finalizar Suporte
  const [chamadoParaFinalizar, setChamadoParaFinalizar] = useState(null);
  const [motivoSelecionado, setMotivoSelecionado] = useState('');
  const [obsFinalizacao, setObsFinalizacao] = useState('');
  const [finalizando, setFinalizando] = useState(false);
  const [tempoCongelado, setTempoCongelado] = useState(null);

  // Timer ao vivo para chamados em andamento
  const [, setTick] = useState(0);

  const carregarDados = () => {
    const met = getMetricasSuporte();
    setMetricas(met);
    setChamadosRecentes(getChamadosSuporte().slice(0, 15));
    const mot = getMotivosSuporte();
    setMotivos(mot);
    if (mot.length > 0 && !motivoSelecionado) {
      setMotivoSelecionado(mot[0].nome);
    }
  };

  useEffect(() => {
    carregarDados();

    const handleUpdate = () => carregarDados();
    window.addEventListener('suporte_updated', handleUpdate);

    // Tick a cada segundo para atualizar cronômetros em tempo real
    const timer = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      window.removeEventListener('suporte_updated', handleUpdate);
      clearInterval(timer);
    };
  }, []);

  const formatarDuracao = (segundos) => {
    if (!segundos || segundos <= 0) return '0s';
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const calcularTempoDecorrido = (iniciadoEm) => {
    const inicio = new Date(iniciadoEm).getTime();
    const agora = Date.now();
    const diff = Math.max(0, Math.round((agora - inicio) / 1000));
    return formatarDuracao(diff);
  };

  const handleSalvarNovoMotivo = (e) => {
    e.preventDefault();
    if (!novoMotivoNome.trim()) return;
    addMotivoSuporte({ nome: novoMotivoNome.trim(), descricao: novoMotivoDesc.trim() });
    setNovoMotivoNome('');
    setNovoMotivoDesc('');
    setMotivos(getMotivosSuporte());
  };

  const handleRemoverMotivo = (id) => {
    removeMotivoSuporte(id);
    setMotivos(getMotivosSuporte());
  };

  const handleAbrirFinalizacao = (ch) => {
    const inicio = new Date(ch.iniciado_em).getTime();
    const diff = Math.max(1, Math.round((Date.now() - inicio) / 1000));
    setTempoCongelado(diff);
    setChamadoParaFinalizar(ch);
  };

  const handleConfirmarFinalizacao = async (e) => {
    e.preventDefault();
    if (!chamadoParaFinalizar || !motivoSelecionado) return;

    try {
      setFinalizando(true);
      await finalizarSuporte({
        chamado_id: chamadoParaFinalizar.id,
        motivo: motivoSelecionado,
        observacoes: obsFinalizacao,
        duracao_segundos: tempoCongelado,
        userEmail,
      });
      setChamadoParaFinalizar(null);
      setTempoCongelado(null);
      setObsFinalizacao('');
      carregarDados();
    } catch (err) {
      alert(err.message);
    } finally {
      setFinalizando(false);
    }
  };

  // Cores harmoniosas Apple para os gráficos
  const paletaCores = [
    '#4d7c0f', // Verde Oliva
    '#3b82f6', // Azul
    '#8b5cf6', // Roxo
    '#f59e0b', // Âmbar
    '#ec4899', // Rosa
    '#06b6d4', // Ciano
    '#64748b', // Grafite
  ];

  // Cálculo para o Gráfico de Evolução (Linha SVG dos 7 dias)
  const evolucao = metricas.evolucaoUltimos7Dias || [];
  const maxChamadosEvolucao = Math.max(3, ...evolucao.map((d) => d.chamados));
  const svgWidth = 600;
  const svgHeight = 170;
  const paddingX = 40;
  const paddingY = 25;

  const points = evolucao.map((d, index) => {
    const x = paddingX + (index * (svgWidth - 2 * paddingX)) / Math.max(1, evolucao.length - 1);
    const y = svgHeight - paddingY - (d.chamados / maxChamadosEvolucao) * (svgHeight - 2 * paddingY);
    return { x, y, ...d };
  });

  const pathD = points.length > 0 ? points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '') : '';

  const areaD = points.length > 0 
    ? `${pathD} L ${points[points.length - 1].x} ${svgHeight - paddingY} L ${points[0].x} ${svgHeight - paddingY} Z` 
    : '';

  // Cálculo para o Donut Chart de Motivos
  const totalMotivosCount = metricas.topMotivos.reduce((acc, m) => acc + m.count, 0);
  let accumulatedAngle = 0;
  const donutSegments = metricas.topMotivos.map((m, index) => {
    const fraction = totalMotivosCount > 0 ? m.count / totalMotivosCount : 0;
    const strokeDasharray = `${fraction * 283} ${283}`;
    const strokeDashoffset = -accumulatedAngle;
    accumulatedAngle += fraction * 283;
    return {
      ...m,
      color: paletaCores[index % paletaCores.length],
      strokeDasharray,
      strokeDashoffset,
      fraction,
    };
  });

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
            Dashboard de Atendimentos & Métricas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Visão executiva, tendências temporais, distribuição de demandas e tempo médio de atendimento (TMA).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsGerenciarMotivosOpen(!isGerenciarMotivosOpen)}
            className="px-4 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-sm transition-all"
          >
            ⚙ Configurar Motivos de Chamado
          </motion.button>
        </div>
      </div>

      {/* Painel Administrativo de Motivos */}
      <AnimatePresence>
        {isGerenciarMotivosOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Gerenciar Categorias & Causas de Suporte
              </h3>
              <button
                onClick={() => setIsGerenciarMotivosOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSalvarNovoMotivo} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={novoMotivoNome}
                onChange={(e) => setNovoMotivoNome(e.target.value)}
                placeholder="Nome do motivo (ex: Queda de Instância)"
                required
                className="px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
              />
              <input
                type="text"
                value={novoMotivoDesc}
                onChange={(e) => setNovoMotivoDesc(e.target.value)}
                placeholder="Descrição ou procedimento (opcional)"
                className="px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-xs shadow-sm"
              >
                + Adicionar Motivo
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-black/[0.04] dark:border-white/[0.05]">
              {motivos.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-slate-700 dark:text-zinc-300 text-xs border border-black/[0.05] dark:border-white/[0.06]"
                >
                  <span>{m.nome}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoverMotivo(m.id)}
                    className="text-slate-400 hover:text-red-500 font-bold ml-1"
                    title="Remover"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4 Cards de Métricas Principais Widescreen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <motion.div whileHover={{ y: -2 }} className="rounded-3xl p-5 sm:p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 block mb-1">
            Total de Atendimentos
          </span>
          <span className="text-3xl font-bold text-[#1d1d1f] dark:text-white font-mono tabular-nums">
            {metricas.totalChamados}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">
            {metricas.finalizadosCount} finalizados
          </p>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className={`rounded-3xl p-5 sm:p-6 border transition-all ${
            metricas.emAndamentoCount > 0
              ? 'border-amber-500/40 bg-amber-500/[0.04] dark:bg-amber-500/[0.08]'
              : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a]'
          } shadow-sm`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Em Andamento
            </span>
            {metricas.emAndamentoCount > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
            )}
          </div>
          <span className={`text-3xl font-bold font-mono tabular-nums ${
            metricas.emAndamentoCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[#1d1d1f] dark:text-white'
          }`}>
            {metricas.emAndamentoCount}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">
            {metricas.emAndamentoCount > 0 ? 'Chamados ativos agora' : 'Nenhum chamado aberto'}
          </p>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="rounded-3xl p-5 sm:p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 block mb-1">
            Tempo Médio Geral (TMA)
          </span>
          <span className="text-3xl font-bold text-[#1d1d1f] dark:text-white font-mono tabular-nums">
            {formatarDuracao(metricas.tempoMedioSegundos)}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">
            Média por atendimento
          </p>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="rounded-3xl p-5 sm:p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 block mb-1">
            Principal Demanda
          </span>
          <span className="text-sm font-semibold text-[#4d7c0f] dark:text-[#84cc16] truncate block mt-1" title={metricas.topMotivos[0]?.nome}>
            {metricas.topMotivos[0]?.nome || 'Sem dados'}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">
            {metricas.topMotivos[0]?.count ? `${metricas.topMotivos[0]?.count} chamados` : 'Nenhum registro'}
          </p>
        </motion.div>

      </div>

      {/* Chamados em Andamento (Ao Vivo) */}
      {metricas.emAndamento.length > 0 && (
        <div className="rounded-3xl p-6 border border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              Suportes Iniciados e em Andamento ({metricas.emAndamento.length})
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
              Tempo correndo ao vivo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {metricas.emAndamento.map((ch) => (
              <div
                key={ch.id}
                className="p-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] flex items-center justify-between gap-3 shadow-xs"
              >
                <div>
                  <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                    {ch.empresa_nome}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
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
                  className="px-3.5 py-1.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-[11px] hover:opacity-90 shadow-sm"
                >
                  Finalizar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

              {/* Linhas de Grade Horizontal */}
              {[0, 0.33, 0.66, 1].map((ratio, i) => {
                const y = paddingY + ratio * (svgHeight - 2 * paddingY);
                return (
                  <line
                    key={i}
                    x1={paddingX}
                    y1={y}
                    x2={svgWidth - paddingX}
                    y2={y}
                    stroke="currentColor"
                    className="text-black/[0.04] dark:text-white/[0.05]"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Área preenchida */}
              {areaD && (
                <path d={areaD} fill="url(#areaGradient)" />
              )}

              {/* Linha Principal da Curva */}
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

              {/* Pontos de Dados com Rótulos */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4.5"
                    fill="#4d7c0f"
                    className="stroke-white dark:stroke-zinc-900"
                    strokeWidth="2.5"
                  />
                  <text
                    x={p.x}
                    y={p.y - 8}
                    textAnchor="middle"
                    className="text-[10px] font-mono font-bold fill-slate-700 dark:fill-zinc-300"
                  >
                    {p.chamados}
                  </text>
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
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
                          <span className="font-medium text-slate-800 dark:text-zinc-200 truncate max-w-[200px]" title={seg.nome}>
                            {seg.nome}
                          </span>
                        </div>
                        <span className="font-mono text-slate-500 font-semibold text-[11px] tabular-nums">
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

      {/* GRÁFICO 3: COMPARATIVO DE TMA POR EMPRESA */}
      <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Tempo Médio de Atendimento (TMA) por Empresa
            </h3>
            <p className="text-[11px] text-slate-400">Comparação da média de resolução em minutos por cliente</p>
          </div>
          <span className="text-xs font-mono font-bold text-[#4d7c0f] dark:text-[#84cc16] tabular-nums">
            Média Geral: {metricas.tempoMedioMinutos} min
          </span>
        </div>

        {metricas.metricasEmpresas.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-6 text-center">
            Nenhum registro de atendimento finalizado ainda para comparar TMA entre empresas.
          </p>
        ) : (
          <div className="space-y-3.5 pt-1">
            {metricas.metricasEmpresas.map((emp) => {
              const maxTMA = Math.max(1, ...metricas.metricasEmpresas.map((e) => e.tempo_medio_minutos));
              const barWidth = Math.max(5, Math.round((emp.tempo_medio_minutos / maxTMA) * 100));

              return (
                <div key={emp.empresa_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1d1d1f] dark:text-white">
                      {emp.empresa_nome}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {emp.total_chamados} chamados ({emp.concluidos} concluídos)
                      </span>
                      <strong className="font-mono text-slate-800 dark:text-zinc-200 tabular-nums">
                        {emp.tempo_medio_minutos} min
                      </strong>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden flex items-center">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#4d7c0f] to-[#84cc16] transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico Recente de Atendimentos */}
      <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <span>Histórico Recente de Suporte ({chamadosRecentes.length})</span>
          <span className="text-[10px] text-slate-400 font-mono">Registrado com operador e data</span>
        </div>

        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {chamadosRecentes.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Nenhum suporte realizado ainda.
            </div>
          ) : (
            chamadosRecentes.map((ch) => (
              <div key={ch.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                      {ch.empresa_nome}
                    </span>
                    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      ch.status === 'finalizado'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                    }`}>
                      {ch.status === 'finalizado' ? 'Finalizado' : 'Em Aberto'}
                    </span>
                    {ch.motivo && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 font-medium">
                        {ch.motivo}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                    Técnico: {ch.tecnico_email} • Início: {new Date(ch.iniciado_em).toLocaleString('pt-BR')}
                  </p>

                  {ch.observacoes && (
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-1 italic">
                      Solução: {ch.observacoes}
                    </p>
                  )}
                </div>

                <div className="text-right self-end sm:self-center font-mono">
                  <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block tabular-nums">
                    {ch.status === 'finalizado' ? formatarDuracao(ch.duracao_segundos) : calcularTempoDecorrido(ch.iniciado_em)}
                  </span>
                  <span className="text-[10px] text-slate-400">Duração</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal de Finalização do Suporte */}
      <AnimatePresence>
        {chamadoParaFinalizar && (
          <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-[32px] border border-black/[0.08] dark:border-white/[0.1] bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-2xl p-6 sm:p-7 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-white">
                    Finalizar Atendimento de Suporte
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{chamadoParaFinalizar.empresa_nome}</p>
                </div>
                <button
                  onClick={() => setChamadoParaFinalizar(null)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  Voltar
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs">
                <span className="text-slate-500 block mb-0.5">Duração do Chamado:</span>
                <strong className="text-base font-mono text-[#4d7c0f] dark:text-[#84cc16] tabular-nums">
                  {formatarDuracao(tempoCongelado)}
                </strong>
              </div>

              <form onSubmit={handleConfirmarFinalizacao} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Motivo Principal do Chamado <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={motivoSelecionado}
                    onChange={(e) => setMotivoSelecionado(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1d1d1f] dark:text-white font-medium focus:outline-none"
                  >
                    {motivos.map((m) => (
                      <option key={m.id} value={m.nome}>{m.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Resumo da Solução Aplicada
                  </label>
                  <textarea
                    rows={3}
                    value={obsFinalizacao}
                    onChange={(e) => setObsFinalizacao(e.target.value)}
                    placeholder="Ex: Pareamento restabelecido com sucesso."
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none leading-relaxed text-[#1d1d1f] dark:text-white"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setChamadoParaFinalizar(null)}
                    className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04]"
                  >
                    Voltar
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={finalizando}
                    className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-xs shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {finalizando ? 'Gravando...' : 'Confirmar Encerramento'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
