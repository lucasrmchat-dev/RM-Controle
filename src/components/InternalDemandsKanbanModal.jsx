'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getFeedbacks, fetchFeedbacks, updateFeedbackStatus } from '@/lib/storage';
import { showToast } from './ToastNotification';
import { 
  XMarkIcon, 
  CheckIcon, 
  SparklesIcon, 
  ClockIcon, 
  WrenchIcon, 
  LightBulbIcon,
  ViewGridIcon
} from './Icons';

export default function InternalDemandsKanbanModal({ isOpen, onClose, userEmail }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [feedbacks, setFeedbacks] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos' | 'ideia' | 'bug'
  const [busca, setBusca] = useState('');
  const [lightboxImagem, setLightboxImagem] = useState(null);
  const [colunaArrastando, setColunaArrastando] = useState(null);

  const carregar = async () => {
    try {
      await fetchFeedbacks();
    } catch (e) {}
    setFeedbacks(getFeedbacks());
  };

  useEffect(() => {
    if (isOpen) {
      carregar();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleUpdate = () => carregar();
    window.addEventListener('feedbacks_updated', handleUpdate);
    return () => window.removeEventListener('feedbacks_updated', handleUpdate);
  }, []);

  if (!mounted || !isOpen) return null;

  const handleMudarStatus = async (fbId, novoStatus) => {
    const agora = new Date().toISOString();
    setFeedbacks((prev) =>
      prev.map((fb) =>
        fb.id === fbId ? { ...fb, status: novoStatus, updated_at: agora } : fb
      )
    );

    try {
      await updateFeedbackStatus(fbId, novoStatus, userEmail);
      showToast(`Status atualizado para "${novoStatus.replace('_', ' ')}"!`, 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao mover card.', 'error');
      carregar();
    }
  };

  const colunas = [
    { 
      id: 'em_analise', 
      titulo: 'Novas Ideias & Triagem', 
      desc: 'Relatos e propostas recém-enviados',
      corBadge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
      dotCor: 'bg-amber-500'
    },
    { 
      id: 'em_correcao', 
      titulo: 'Em Desenvolvimento / Correção', 
      desc: 'Equipe trabalhando ativamente',
      corBadge: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/30',
      dotCor: 'bg-blue-500'
    },
    { 
      id: 'no_roadmap', 
      titulo: 'No Roadmap / Planejado', 
      desc: 'Ideias aprovadas para futuras versões',
      corBadge: 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-500/30',
      dotCor: 'bg-purple-500'
    },
    { 
      id: 'resolvido', 
      titulo: 'Concluído / Implementado', 
      desc: 'Entregue no sistema RM Controle',
      corBadge: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
      dotCor: 'bg-emerald-500'
    },
  ];

  const feedbacksFiltrados = feedbacks.filter((fb) => {
    if (filtroTipo === 'ideia' && fb.tipo !== 'ideia' && fb.tipo !== 'sugestao') return false;
    if (filtroTipo === 'bug' && fb.tipo !== 'bug' && fb.tipo !== 'melhoria') return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      const matchTitulo = (fb.titulo || '').toLowerCase().includes(q);
      const matchDesc = (fb.descricao || '').toLowerCase().includes(q);
      const matchMod = (fb.modulo_afetado || '').toLowerCase().includes(q);
      return matchTitulo || matchDesc || matchMod;
    }
    return true;
  });

  return createPortal(
    <div className="fixed inset-0 w-screen h-screen z-[99999] bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-7xl h-[92vh] rounded-[32px] bg-white dark:bg-[#16161a] border border-black/10 dark:border-white/15 p-5 sm:p-7 shadow-2xl flex flex-col justify-between text-[#1d1d1f] dark:text-[#f5f5f7] relative overflow-hidden"
      >
        {/* Header do Kanban */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.08] pb-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <ViewGridIcon className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-mono">
                Pipeline Interno RM Controle
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
              Quadro Kanban de Ideias, Bugs & Demandas Internas
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Organize os relatos internos, acompanhe o fluxo de desenvolvimento e conclua feedbacks.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap">
            {/* Filtro Rápido */}
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06] text-xs">
              <button
                type="button"
                onClick={() => setFiltroTipo('todos')}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                  filtroTipo === 'todos'
                    ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:text-black dark:hover:text-white'
                }`}
              >
                Todos ({feedbacks.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('ideia')}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                  filtroTipo === 'ideia'
                    ? 'bg-amber-500 text-white dark:bg-amber-500 dark:text-zinc-950 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-amber-600'
                }`}
              >
                <LightBulbIcon className="w-3 h-3" />
                <span>Ideias</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('bug')}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                  filtroTipo === 'bug'
                    ? 'bg-red-500 text-white dark:bg-red-500 dark:text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:text-red-600'
                }`}
              >
                <span>🐛</span>
                <span>Bugs</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Fechar Pipeline"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Colunas do Kanban */}
        <div className="flex-1 overflow-x-auto py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full min-w-[900px]">
            {colunas.map((col) => {
              const cardsColuna = feedbacksFiltrados.filter((fb) => (fb.status || 'em_analise') === col.id);
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (colunaArrastando !== col.id) setColunaArrastando(col.id);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    setColunaArrastando(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setColunaArrastando(null);
                    const fbId = e.dataTransfer.getData('text/plain');
                    if (fbId) {
                      handleMudarStatus(fbId, col.id);
                    }
                  }}
                  className={`rounded-3xl p-3.5 border flex flex-col h-full shadow-2xs transition-all ${
                    colunaArrastando === col.id
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] ring-2 ring-[#4d7c0f]/30 bg-[#4d7c0f]/[0.04]'
                      : 'bg-black/[0.015] dark:bg-white/[0.02] border-black/[0.05] dark:border-white/[0.06]'
                  }`}
                >
                  {/* Cabeçalho da Coluna */}
                  <div className="flex items-center justify-between pb-3 px-1 border-b border-black/[0.04] dark:border-white/[0.05] mb-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${col.dotCor}`}></span>
                      <h3 className="text-xs font-bold text-[#1d1d1f] dark:text-white truncate">
                        {col.titulo}
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300">
                      {cardsColuna.length}
                    </span>
                  </div>

                  {/* Lista de Cards da Coluna */}
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {cardsColuna.length === 0 ? (
                      <div className="p-6 text-center text-[11px] text-slate-400 italic">
                        Nenhum item nesta etapa.
                      </div>
                    ) : (
                      cardsColuna.map((fb) => {
                        const isIdeia = fb.tipo === 'ideia' || fb.tipo === 'sugestao';
                        return (
                          <motion.div
                            key={fb.id}
                            layout
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', fb.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="p-3.5 rounded-2xl bg-white dark:bg-[#1c1c22] border border-black/[0.06] dark:border-white/[0.08] space-y-2.5 shadow-2xs hover:shadow-sm transition-all cursor-grab active:cursor-grabbing hover:border-black/20 dark:hover:border-white/20 select-none"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                                  isIdeia 
                                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25' 
                                    : 'bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/25'
                                }`}>
                                  <span>{isIdeia ? '💡 Ideia' : '🐛 Bug'}</span>
                                </span>
                                <span className="text-[9px] font-mono text-slate-500 dark:text-zinc-400 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.5 rounded-md">
                                  {fb.modulo_afetado || 'Geral'}
                                </span>
                              </div>

                              <span className={`text-[9px] font-bold uppercase font-mono ${
                                fb.prioridade === 'critica' ? 'text-red-600' : fb.prioridade === 'alta' ? 'text-amber-600' : 'text-slate-400'
                              }`}>
                                {fb.prioridade || 'normal'}
                              </span>
                            </div>

                            <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white leading-snug">
                              {fb.titulo}
                            </h4>

                            <p className="text-[11px] text-slate-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                              {fb.descricao}
                            </p>

                            {fb.imagem_url && (
                              <div 
                                onClick={() => setLightboxImagem(fb.imagem_url)}
                                className="relative h-16 rounded-xl overflow-hidden border border-black/[0.08] dark:border-white/[0.1] cursor-pointer group"
                              >
                                <img src={fb.imagem_url} alt="Evidência" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold transition-opacity">
                                  Ver Print 🔍
                                </div>
                              </div>
                            )}

                            {/* Controles de Transição de Etapa */}
                            <div className="pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-1.5 text-[10px]">
                              <select
                                value={fb.status || 'em_analise'}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleMudarStatus(fb.id, e.target.value);
                                }}
                                className="px-2 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-[10px] font-bold text-slate-700 dark:text-zinc-200 cursor-pointer focus:outline-none"
                              >
                                <option value="em_analise">🟡 Triagem</option>
                                <option value="em_correcao">🔵 Em Andamento</option>
                                <option value="no_roadmap">🟣 No Roadmap</option>
                                <option value="resolvido">🟢 Concluído</option>
                              </select>

                              <div className="flex items-center gap-1 ml-auto">
                                {col.id !== 'em_analise' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const prevIdx = colunas.findIndex((c) => c.id === col.id) - 1;
                                      if (prevIdx >= 0) handleMudarStatus(fb.id, colunas[prevIdx].id);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.07] text-slate-600 dark:text-zinc-400 cursor-pointer font-semibold"
                                    title="Voltar etapa"
                                  >
                                    ←
                                  </button>
                                )}

                                {col.id !== 'resolvido' ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const nextIdx = colunas.findIndex((c) => c.id === col.id) + 1;
                                      if (nextIdx < colunas.length) handleMudarStatus(fb.id, colunas[nextIdx].id);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 hover:bg-[#4d7c0f]/25 text-[#4d7c0f] dark:text-[#84cc16] font-bold cursor-pointer transition-all"
                                    title="Avançar etapa"
                                  >
                                    →
                                  </button>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5 text-[9px]">
                                    <CheckIcon className="w-3 h-3" />
                                    <span>OK</span>
                                  </span>
                                )}
                              </div>
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

        {/* Rodapé Informativo */}
        <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 flex-shrink-0">
          <span className="font-mono text-[11px]">
            Total de {feedbacksFiltrados.length} demandas internas no pipeline
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 font-semibold cursor-pointer text-xs"
          >
            Fechar Quadro
          </button>
        </div>
      </motion.div>

      {/* Lightbox para Imagens */}
      {lightboxImagem && (
        <div 
          onClick={() => setLightboxImagem(null)}
          className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={lightboxImagem} alt="Print ampliado" className="max-w-4xl max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  ,
    document.body
  );
}
