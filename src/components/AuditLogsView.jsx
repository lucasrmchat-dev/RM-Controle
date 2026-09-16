'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuditoriaLogs } from '@/lib/storage';

export default function AuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  
  // Linha do Tempo Lúdica & Filtro de Data
  const [diaSelecionado, setDiaSelecionado] = useState(null); // 'YYYY-MM-DD' ou null (todos)
  const [mostrarFiltroAvancado, setMostrarFiltroAvancado] = useState(false);
  const [dataInicioAvancada, setDataInicioAvancada] = useState('');
  const [dataFimAvancada, setDataFimAvancada] = useState('');

  // Paginação
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const carregarLogs = async () => {
    setLoading(true);
    const data = await getAuditoriaLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    carregarLogs();
  }, []);

  // Formatação de Ação Detalhada com IP e Empresa
  const formatarAcao = (log) => {
    const acao = log.acao;
    const empresa = log.empresa_nome || log.detalhes?.empresa_nome || 'Empresa';
    const modulo = log.detalhes?.modulo || 'Geral';

    switch (acao) {
      case 'visualizou_senha_suporte':
        return { 
          titulo: `Visualizou Senha de Suporte`,
          descricao: `Acessou e revelou a senha técnica protegida da empresa ${empresa}`,
          badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30',
          modulo: modulo || 'Credenciais & Acessos'
        };
      case 'alterou_credenciais_suporte':
      case 'alterou_credencial_suporte':
        return { 
          titulo: `Alterou Credenciais de Acesso`,
          descricao: `Atualizou login ou senha de suporte para ${empresa}`,
          badge: 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30',
          modulo: modulo || 'Credenciais & Acessos'
        };
      case 'adicionou_credencial_suporte':
        return { 
          titulo: `Adicionou Nova Credencial / Acesso`,
          descricao: `Cadastrou o acesso '${log.detalhes?.rotulo || 'Novo Acesso'}' para a empresa ${empresa}`,
          badge: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30',
          modulo: 'Credenciais & Acessos'
        };
      case 'iniciou_suporte_tecnico':
        return { 
          titulo: `Iniciou Atendimento de Suporte`,
          descricao: `Abriu chamado técnico com cronômetro em tempo real para ${empresa}`,
          badge: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30',
          modulo: 'Suporte em Tempo Real'
        };
      case 'cancelou_suporte_tecnico':
        return { 
          titulo: `Cancelou Atendimento de Suporte`,
          descricao: `Cancelou e descartou o chamado de ${empresa}`,
          badge: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border border-zinc-500/30',
          modulo: 'Suporte em Tempo Real'
        };
      case 'finalizou_suporte_tecnico':
        return { 
          titulo: `Finalizou Chamado de Suporte`,
          descricao: `Encerrou atendimento de ${Math.round((log.detalhes?.duracao_segundos || 0) / 60)} min para ${empresa} (Motivo: ${log.detalhes?.motivo || 'Geral'})`,
          badge: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30',
          modulo: 'Suporte em Tempo Real'
        };
      case 'cadastrou_empresa_manual':
        return { 
          titulo: `Cadastrou Empresa (Individual)`,
          descricao: `Criou o cadastro da empresa '${empresa}'`,
          badge: 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/30',
          modulo: 'Gestão de Empresas'
        };
      case 'cadastrou_empresas_massa':
        return { 
          titulo: `Importou Empresas em Lote`,
          descricao: `Importou ${log.detalhes?.quantidade || 0} empresas em massa no sistema`,
          badge: 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/30',
          modulo: 'Gestão de Empresas'
        };
      case 'adicionou_canal_empresa':
        return { 
          titulo: `Vinculou Canal de Atendimento`,
          descricao: `Adicionou canal '${log.detalhes?.canal || 'Mensageria'}' na empresa ${empresa}`,
          badge: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30',
          modulo: 'Canais'
        };
      case 'atualizou_checklist_item':
        return { 
          titulo: `Modificou Requisito do Servidor`,
          descricao: `Marcou '${log.detalhes?.item_id}' como ${log.detalhes?.concluido ? 'CONCLUÍDO' : 'PENDENTE'} na empresa ${empresa}`,
          badge: 'bg-slate-500/15 text-slate-800 dark:text-slate-300 border border-slate-500/30',
          modulo: 'Configuração do Servidor'
        };
      default:
        return { 
          titulo: log.acao.replace(/_/g, ' ').toUpperCase(),
          descricao: `Operação executada na empresa ${empresa}`,
          badge: 'bg-black/5 dark:bg-white/10 text-slate-700 dark:text-zinc-300 border border-black/5 dark:border-white/10',
          modulo: modulo || 'Sistema'
        };
    }
  };

  // Gerador da Linha do Tempo Lúdica (5 dias atrás até 3 dias no futuro)
  const diasLinhaDoTempo = useMemo(() => {
    const lista = [];
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const hoje = new Date();

    for (let i = -5; i <= 3; i++) {
      const d = new Date();
      d.setDate(hoje.getDate() + i);
      const isoStr = d.toISOString().split('T')[0];
      const isHoje = i === 0;
      const isFuturo = i > 0;

      lista.push({
        iso: isoStr,
        diaNum: d.getDate(),
        diaSemana: diasSemana[d.getDay()],
        mes: meses[d.getMonth()],
        isHoje,
        isFuturo,
      });
    }
    return lista;
  }, []);

  // Filtragem dos Logs por Texto, Linha do Tempo e Filtro Avançado
  const logsFiltrados = useMemo(() => {
    return logs.filter((log) => {
      const dataLog = (log.criado_em || '').split('T')[0];

      // Filtro da Linha do Tempo
      if (diaSelecionado && dataLog !== diaSelecionado) {
        return false;
      }

      // Filtro de Data Avançada
      if (dataInicioAvancada && dataLog < dataInicioAvancada) {
        return false;
      }
      if (dataFimAvancada && dataLog > dataFimAvancada) {
        return false;
      }

      // Filtro de Texto
      if (filtroTexto) {
        const termo = filtroTexto.toLowerCase();
        const opNome = (log.operador_nome || '').toLowerCase();
        const opEmail = (log.usuario_email || '').toLowerCase();
        const empNome = (log.empresa_nome || log.detalhes?.empresa_nome || '').toLowerCase();
        const ipOrigem = (log.ip_origem || '').toLowerCase();
        const modulo = (log.detalhes?.modulo || '').toLowerCase();
        return (
          opNome.includes(termo) ||
          opEmail.includes(termo) ||
          empNome.includes(termo) ||
          ipOrigem.includes(termo) ||
          modulo.includes(termo)
        );
      }

      return true;
    });
  }, [logs, diaSelecionado, dataInicioAvancada, dataFimAvancada, filtroTexto]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(logsFiltrados.length / pageSize));
  const logsPaginados = useMemo(() => {
    const start = (page - 1) * pageSize;
    return logsFiltrados.slice(start, start + pageSize);
  }, [logsFiltrados, page, pageSize]);

  return (
    <div className="space-y-6 text-[#0a0a0c] dark:text-[#ffffff]">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0a0a0c] dark:text-white">
            Rastro de Auditoria & Conformidade LGPD
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Registro imutável contendo operador, e-mail, IP de origem, empresa e funcionalidade modificada.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMostrarFiltroAvancado(!mostrarFiltroAvancado)}
            className="px-4 py-2 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-[#16161a] hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all shadow-xs"
          >
            🗓️ {mostrarFiltroAvancado ? 'Ocultar Filtro Avançado' : 'Filtro de Data Avançado'}
          </button>

          <button
            onClick={carregarLogs}
            disabled={loading}
            className="px-4 py-2 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black text-xs font-semibold shadow-xs hover:opacity-90 transition-all"
          >
            {loading ? 'Atualizando...' : 'Atualizar Rastro'}
          </button>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* LINHA DO TEMPO LÚDICA COM DIAS PASSADOS, HOJE E DIAS FUTUROS SEMI-TRANSPARENTES */}
      {/* ============================================================================== */}
      <div className="rounded-3xl p-4 sm:p-5 border border-black/8 dark:border-white/10 bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Linha do Tempo de Atividades
          </span>
          {diaSelecionado && (
            <button
              onClick={() => {
                setDiaSelecionado(null);
                setPage(1);
              }}
              className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16] hover:underline"
            >
              Ver Todos os Dias
            </button>
          )}
        </div>

        {/* Fita de Dias em Carrossel Horizontal */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-1">
          {diasLinhaDoTempo.map((d) => {
            const isSelected = diaSelecionado === d.iso;

            if (d.isFuturo) {
              return (
                <div
                  key={d.iso}
                  className="flex flex-col items-center justify-center p-3 rounded-2xl border border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] opacity-30 cursor-not-allowed select-none min-w-[72px]"
                  title="Data futura ainda não ocorrida"
                >
                  <span className="text-[10px] font-semibold text-slate-400">{d.diaSemana}</span>
                  <span className="text-lg font-bold font-mono text-slate-400">{d.diaNum}</span>
                  <span className="text-[9px] uppercase text-slate-400">{d.mes}</span>
                </div>
              );
            }

            return (
              <motion.button
                key={d.iso}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setDiaSelecionado(isSelected ? null : d.iso);
                  setPage(1);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer min-w-[72px] relative ${
                  isSelected
                    ? 'border-black dark:border-white bg-black text-white dark:bg-white dark:text-black shadow-md'
                    : d.isHoje
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 text-[#0a0a0c] dark:text-white'
                    : 'border-black/8 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-slate-700 dark:text-zinc-300 hover:border-black/20 dark:hover:border-white/20'
                }`}
              >
                {d.isHoje && (
                  <span className={`absolute -top-2 px-1.5 py-0.2 rounded-full text-[8px] font-bold uppercase ${
                    isSelected ? 'bg-white text-black' : 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-black'
                  }`}>
                    Hoje
                  </span>
                )}
                <span className="text-[10px] font-semibold opacity-80">{d.diaSemana}</span>
                <span className="text-lg font-bold font-mono tabular-nums leading-tight">{d.diaNum}</span>
                <span className="text-[9px] uppercase opacity-75">{d.mes}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Painel de Filtro Avançado de Datas Anteriores */}
      <AnimatePresence>
        {mostrarFiltroAvancado && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white/90 dark:bg-[#16161a]/90 backdrop-blur-xl shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Filtro de Data Retroativa (Histórico Distante)
              </h3>
              <button
                onClick={() => {
                  setDataInicioAvancada('');
                  setDataFimAvancada('');
                  setPage(1);
                }}
                className="text-xs text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline"
              >
                Limpar Intervalo
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">Data De:</label>
                <input
                  type="date"
                  value={dataInicioAvancada}
                  onChange={(e) => {
                    setDataInicioAvancada(e.target.value);
                    setDiaSelecionado(null);
                    setPage(1);
                  }}
                  className="w-full px-3.5 py-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/10 dark:border-white/15 text-xs text-black dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">Data Até:</label>
                <input
                  type="date"
                  value={dataFimAvancada}
                  onChange={(e) => {
                    setDataFimAvancada(e.target.value);
                    setDiaSelecionado(null);
                    setPage(1);
                  }}
                  className="w-full px-3.5 py-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/10 dark:border-white/15 text-xs text-black dark:text-white"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barra de Busca Rápida */}
      <div className="rounded-2xl p-3 border border-black/8 dark:border-white/10 bg-white/80 dark:bg-[#16161a]/80 backdrop-blur-xl flex items-center gap-3 shadow-xs">
        <input
          type="text"
          value={filtroTexto}
          onChange={(e) => {
            setFiltroTexto(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar no rastro por operador, e-mail, IP ou empresa..."
          className="w-full px-3.5 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 text-xs focus:outline-none text-[#0a0a0c] dark:text-white placeholder-slate-400 font-medium"
        />
        {filtroTexto && (
          <button onClick={() => setFiltroTexto('')} className="text-xs text-slate-400 hover:text-black dark:hover:text-white whitespace-nowrap font-semibold">
            Limpar
          </button>
        )}
      </div>

      {/* Tabela de Eventos Detalhados com Paginação */}
      <div className="rounded-3xl border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-black/6 dark:border-white/8 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <span>Rastro de Atividades ({logsFiltrados.length})</span>
          <span className="text-[10px] text-slate-400 font-mono">Imutável • Protegido por RLS</span>
        </div>

        <div className="divide-y divide-black/5 dark:divide-white/6">
          {logsPaginados.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Nenhum evento localizado para o filtro aplicado.
            </div>
          ) : (
            logsPaginados.map((log) => {
              const infoAcao = formatarAcao(log);
              const dataFormatada = new Date(log.criado_em).toLocaleString('pt-BR');

              return (
                <div key={log.id} className="p-4 sm:p-5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${infoAcao.badge}`}>
                        {infoAcao.titulo}
                      </span>

                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-700 dark:text-zinc-300">
                        Módulo: {infoAcao.modulo}
                      </span>

                      {log.empresa_nome && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                          Empresa: {log.empresa_nome}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono self-start sm:self-auto tabular-nums">
                      {dataFormatada}
                    </span>
                  </div>

                  <p className="text-xs text-[#0a0a0c] dark:text-zinc-100 font-medium leading-relaxed">
                    {infoAcao.descricao}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-zinc-400 font-mono pt-1 flex-wrap">
                    <span>
                      Operador: <strong className="text-slate-800 dark:text-zinc-200">{log.operador_nome || 'Administrador'}</strong> ({log.usuario_email})
                    </span>
                    <span>•</span>
                    <span>
                      IP Origem: <strong className="text-slate-700 dark:text-zinc-300">{log.ip_origem || '192.168.1.1 (Rede)'}</strong>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Controles de Paginação */}
        <div className="p-4 border-t border-black/6 dark:border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Itens por página:</span>
            {[10, 20, 50].map((tam) => (
              <button
                key={tam}
                onClick={() => {
                  setPageSize(tam);
                  setPage(1);
                }}
                className={`px-2.5 py-0.5 rounded-full font-semibold transition-all ${
                  pageSize === tam
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-black/5 dark:bg-white/10 text-slate-600 dark:text-zinc-400 hover:bg-black/10'
                }`}
              >
                {tam}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="font-mono tabular-nums">
              Página {page} de {totalPages} ({logsFiltrados.length} registros)
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-full border border-black/10 dark:border-white/15 disabled:opacity-30 hover:bg-black/5"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-full border border-black/10 dark:border-white/15 disabled:opacity-30 hover:bg-black/5"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
