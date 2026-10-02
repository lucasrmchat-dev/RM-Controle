'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getFeedbacks, 
  fetchFeedbacks, 
  createFeedback, 
  updateFeedbackStatus,
  getEmpresas,
  getNomeTecnico 
} from '@/lib/storage';
import { 
  CheckIcon, 
  XMarkIcon, 
  SparklesIcon, 
  CopyIcon, 
  ClockIcon, 
  WrenchIcon,
  ShieldCheckIcon,
  LightBulbIcon,
  ViewGridIcon,
  ViewListIcon,
  BugIcon
} from './Icons';
import { showToast } from './ToastNotification';

export default function FeedbacksView({ userEmail, onSelectEmpresa }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [empresasLista, setEmpresasLista] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState('todos'); // 'todos' | 'em_analise' | 'em_correcao' | 'resolvido'
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [viewMode, setViewMode] = useState('lista'); // 'lista' | 'kanban'
  const [categoriaAba, setCategoriaAba] = useState('todas'); // 'todas' | 'ideias' | 'bugs'
  const [colunaArrastando, setColunaArrastando] = useState(null);

  const handleMudarStatusFeedback = async (fbId, novoStatus) => {
    const agora = new Date().toISOString();
    // 1. Atualização otimista imediata na interface
    setFeedbacks((prev) =>
      prev.map((fb) =>
        fb.id === fbId ? { ...fb, status: novoStatus, updated_at: agora } : fb
      )
    );

    // 2. Grava imediatamente no mapa blindado permanente de overrides para jamais reverter
    try {
      const overrides = JSON.parse(localStorage.getItem('rm_feedbacks_status_override') || '{}');
      overrides[fbId] = novoStatus;
      const targetFb = feedbacks.find((f) => f.id === fbId);
      if (targetFb?.titulo) {
        overrides[targetFb.titulo.trim().toLowerCase()] = novoStatus;
      }
      localStorage.setItem('rm_feedbacks_status_override', JSON.stringify(overrides));
    } catch (e) {}

    try {
      await updateFeedbackStatus(fbId, novoStatus, userEmail);
      const rotulo = novoStatus === 'resolvido' ? 'Concluído' : novoStatus === 'no_roadmap' ? 'No Roadmap' : novoStatus === 'em_correcao' ? 'Em Correção' : 'Triagem';
      showToast(`Feedback movido para "${rotulo}"!`, 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao atualizar feedback.', 'error');
    }
  };

  // Formulário de Novo Feedback
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [moduloAfetado, setModuloAfetado] = useState('Fila de Demandas');
  const [tipo, setTipo] = useState('ideia');
  const [prioridade, setPrioridade] = useState('normal');
  const [imagemBase64, setImagemBase64] = useState(null);
  const [imagemPreview, setImagemPreview] = useState(null);
  const [lightboxImagem, setLightboxImagem] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);

  const handleCopiarRelato = (fb) => {
    const texto = `Prioridade:
${fb.prioridade || 'normal'}
${fb.titulo}
Módulo: ${fb.modulo_afetado || fb.empresa_nome || 'Geral'}
[Módulo: ${fb.modulo_afetado || fb.empresa_nome || 'Geral'}] ${fb.descricao}

Classificação: ${fb.tipo || 'bug'}
Autor: ${fb.autor_nome || fb.autor_email || 'Usuário'}
Data: ${new Date(fb.created_at).toLocaleDateString('pt-BR')}
${fb.imagem_url ? '\nEvidência / Print Anexado: Sim (Visualizável no sistema)' : ''}`;

    navigator.clipboard?.writeText(texto);
    setCopiadoId(fb.id);
    showToast('Relato copiado com sucesso! Pronto para colar no Gemini.', 'success');
    setTimeout(() => setCopiadoId(null), 2500);
  };

  const fileInputRef = useRef(null);

  const carregarDados = async () => {
    try {
      const res = await fetchFeedbacks();
      setFeedbacks(res);
    } catch (e) {
      setFeedbacks(getFeedbacks());
    }

    try {
      const resEmp = await getEmpresas({ pageSize: 1000 });
      const lista = Array.isArray(resEmp) ? resEmp : (resEmp?.items || []);
      setEmpresasLista(lista);
    } catch (e) {}
  };

  useEffect(() => {
    carregarDados();
    const handleUpdate = () => carregarDados();
    window.addEventListener('feedbacks_updated', handleUpdate);
    return () => window.removeEventListener('feedbacks_updated', handleUpdate);
  }, []);

  // Trava scroll da tela enquanto o modal estiver aberto
  useEffect(() => {
    if (modalAberto) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [modalAberto]);

  // Compressão inteligente da imagem no cliente (Canvas Web API) para economizar armazenamento
  const handleSelecionarArquivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecione apenas arquivos de imagem (PNG, JPG, WebP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Comprime para WebP/JPEG com qualidade balanceada (50KB a 150KB)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.72);
        setImagemBase64(compressedBase64);
        setImagemPreview(compressedBase64);
        showToast('Captura de tela anexada e otimizada!', 'success');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverImagem = () => {
    setImagemBase64(null);
    setImagemPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!titulo.trim()) {
      showToast('Informe o título do feedback ou falha.', 'error');
      return;
    }
    if (!descricao.trim()) {
      showToast('Descreva detalhadamente o erro ou melhoria.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await createFeedback({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        modulo_afetado: moduloAfetado,
        empresa_nome: 'RM Controle',
        tipo,
        prioridade,
        imagem_base64: imagemBase64,
        autor_email: userEmail || 'admin@rmcontrole.com',
        autor_nome: getNomeTecnico(userEmail),
      });

      showToast('Feedback registrado! Uma demanda correspondente foi enviada para a Fila de Demandas.', 'success');
      setModalAberto(false);
      setTitulo('');
      setDescricao('');
      setModuloAfetado('Fila de Demandas');
      setTipo('bug');
      setPrioridade('normal');
      setImagemBase64(null);
      setImagemPreview(null);
      carregarDados();
    } catch (err) {
      showToast(err.message || 'Erro ao registrar feedback.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const feedbacksFiltrados = feedbacks.filter((fb) => {
    if (categoriaAba === 'ideias' && fb.tipo !== 'ideia' && fb.tipo !== 'sugestao') return false;
    if (categoriaAba === 'bugs' && fb.tipo !== 'bug' && fb.tipo !== 'melhoria') return false;
    if (filtroStatus !== 'todos' && fb.status !== filtroStatus) return false;
    if (filtroTipo !== 'todos' && fb.tipo !== filtroTipo) return false;
    return true;
  });

  const totalBugs = feedbacks.filter((f) => f.tipo === 'bug').length;
  const totalResolvidos = feedbacks.filter((f) => f.status === 'resolvido').length;
  const totalEmAnalise = feedbacks.filter((f) => f.status === 'em_analise').length;

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      
      {/* Cabeçalho Apple Widescreen */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-mono">
              Controle de Qualidade & Sugestões
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] dark:text-white">
            Central de Feedbacks & Reporte de Falhas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Cadastre relatos de erros com print, aprimoramentos de interface ou ideias operacionais.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Alternador de Modo de Visualização: Lista vs Kanban */}
          <div className="flex items-center gap-1 p-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06] text-xs">
            <button
              type="button"
              onClick={() => setViewMode('lista')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                viewMode === 'lista'
                  ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs font-bold'
                  : 'text-slate-500 hover:text-black dark:hover:text-white'
              }`}
            >
              <ViewListIcon className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-xs font-bold'
                  : 'text-slate-500 hover:text-black dark:hover:text-white'
              }`}
            >
              <ViewGridIcon className="w-3.5 h-3.5" />
              <span>Pipeline Kanban</span>
            </button>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setModalAberto(true)}
            className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md shadow-[#4d7c0f]/20 hover:opacity-95 flex items-center gap-2 transition-all cursor-pointer"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span>Adicionar Ideia / Falha</span>
          </motion.button>
        </div>
      </div>

      {/* Cards de Métricas de Feedbacks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 sm:p-5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-1">
          <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Total de Relatos</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-[#1d1d1f] dark:text-white">{feedbacks.length}</span>
            <span className="text-xs text-slate-400">itens registrados</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-1">
          <span className="text-xs text-amber-600 dark:text-amber-400 uppercase font-bold tracking-wider">Em Análise / Fila</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">{totalEmAnalise}</span>
            <span className="text-xs text-slate-400">aguardando triagem</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs space-y-1">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider">Resolvidos</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{totalResolvidos}</span>
            <span className="text-xs text-slate-400">concluídos com sucesso</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Segmentação por Categoria (Ideias vs Bugs) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs flex-wrap">
          <span className="text-slate-400 font-semibold px-2">Visão:</span>
          {[
            { id: 'todas', label: 'Todos os Relatos', icon: <SparklesIcon className="w-3.5 h-3.5" /> },
            { id: 'ideias', label: 'Ideias Futuras (Roadmap)', icon: <LightBulbIcon className="w-3.5 h-3.5" /> },
            { id: 'bugs', label: 'Bugs & Falhas', icon: <BugIcon className="w-3.5 h-3.5" /> },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoriaAba(cat.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                categoriaAba === cat.id
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                  : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}

          <span className="text-slate-300 dark:text-zinc-600 mx-1">|</span>

          <span className="text-slate-400 font-semibold px-2">Status:</span>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'em_analise', label: 'Em Análise' },
            { id: 'em_correcao', label: 'Em Correção' },
            { id: 'resolvido', label: 'Resolvidos' },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setFiltroStatus(st.id)}
              className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                filtroStatus === st.id
                  ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.08]'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-semibold">Tipo:</span>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-1.5 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1a1a20] text-[#1d1d1f] dark:text-white [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-[#1a1a20] dark:[&>option]:text-white text-xs font-semibold focus:outline-none cursor-pointer"
          >
            <option value="todos">Todos os Tipos</option>
            <option value="bug">Falha / Bug</option>
            <option value="melhoria">Melhoria Visual / UX</option>
            <option value="sugestao">Nova Funcionalidade</option>
            <option value="outro">Outro</option>
          </select>
        </div>
      </div>

      {/* Listagem de Feedbacks ou Pipeline Kanban */}
      {viewMode === 'kanban' ? (
        <div className="overflow-x-auto py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-[950px]">
            {[
              { id: 'em_analise', titulo: 'Novas Ideias & Triagem', dot: 'bg-amber-500' },
              { id: 'em_correcao', titulo: 'Em Correção / Andamento', dot: 'bg-blue-500' },
              { id: 'no_roadmap', titulo: 'No Roadmap / Planejado', dot: 'bg-purple-500' },
              { id: 'resolvido', titulo: 'Concluído / Implementado', dot: 'bg-emerald-500' },
            ].map((col, cIdx, arr) => {
              const cardsDaColuna = feedbacksFiltrados.filter((fb) => (fb.status || 'em_analise') === col.id);
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
                      handleMudarStatusFeedback(fbId, col.id);
                    }
                  }}
                  className={`rounded-3xl p-3.5 border flex flex-col min-h-[500px] transition-all ${
                    colunaArrastando === col.id
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] ring-2 ring-[#4d7c0f]/30 bg-[#4d7c0f]/[0.04]'
                      : 'bg-black/[0.015] dark:bg-white/[0.02] border-black/[0.05] dark:border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 px-1 border-b border-black/[0.04] dark:border-white/[0.05] mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`}></span>
                      <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">{col.titulo}</h4>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300">
                      {cardsDaColuna.length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    {cardsDaColuna.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 italic">Vazio</div>
                    ) : (
                      cardsDaColuna.map((fb) => {
                        const isIdeia = fb.tipo === 'ideia' || fb.tipo === 'sugestao';
                        return (
                          <div
                            key={fb.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', fb.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="p-3.5 rounded-2xl bg-white dark:bg-[#16161a] border border-black/[0.06] dark:border-white/[0.08] space-y-2.5 shadow-2xs hover:shadow-sm cursor-grab active:cursor-grabbing hover:border-black/20 dark:hover:border-white/20 select-none"
                          >
                            <div className="flex items-center justify-between gap-1.5 flex-wrap">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                isIdeia 
                                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25'
                                  : 'bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/25'
                              }`}>
                                {isIdeia ? 'Ideia' : 'Bug'}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">{fb.modulo_afetado || 'Geral'}</span>
                            </div>

                            <h5 className="text-xs font-bold text-[#1d1d1f] dark:text-white leading-snug">{fb.titulo}</h5>
                            <p className="text-[11px] text-slate-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">{fb.descricao}</p>

                            <div className="pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-1 text-[10px]">
                              {/* Seletor direto de etapa */}
                              <select
                                value={fb.status || 'em_analise'}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleMudarStatusFeedback(fb.id, e.target.value);
                                }}
                                className="px-2 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-[10px] font-bold text-slate-700 dark:text-zinc-200 cursor-pointer focus:outline-none"
                              >
                                <option value="em_analise">Triagem</option>
                                <option value="em_correcao">Em Andamento</option>
                                <option value="no_roadmap">No Roadmap</option>
                                <option value="resolvido">Concluído</option>
                              </select>

                              <div className="flex items-center gap-1 ml-auto">
                                {cIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMudarStatusFeedback(fb.id, arr[cIdx - 1].id);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer font-semibold"
                                    title="Voltar etapa"
                                  >
                                    ←
                                  </button>
                                )}
                                {cIdx < arr.length - 1 ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMudarStatusFeedback(fb.id, arr[cIdx + 1].id);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold cursor-pointer hover:bg-[#4d7c0f]/25 transition-all"
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
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : feedbacksFiltrados.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-2">
          <SparklesIcon className="w-8 h-8 text-[#4d7c0f] dark:text-[#84cc16] mx-auto opacity-70" />
          <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white">Nenhum feedback encontrado</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Utilize o botão acima para reportar uma falha, anexar uma captura de tela ou sugerir uma melhoria para a plataforma.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {feedbacksFiltrados.map((fb) => {
            const isBug = fb.tipo === 'bug';
            const isResolvido = fb.status === 'resolvido';

            return (
              <motion.div
                key={fb.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-5 rounded-3xl border transition-all shadow-xs flex flex-col justify-between space-y-4 ${
                  isResolvido
                    ? 'border-emerald-500/30 bg-emerald-500/[0.02] dark:bg-[#16161a]'
                    : isBug
                    ? 'border-red-500/25 bg-red-500/[0.015] dark:bg-[#16161a]'
                    : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      fb.status === 'resolvido'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                        : fb.status === 'em_correcao'
                        ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                    }`}>
                      {fb.status === 'resolvido' ? 'Resolvido' : fb.status === 'em_correcao' ? 'Em Correção' : 'Em Análise'}
                    </span>

                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                      <span>Prioridade:</span>
                      <strong className={`capitalize ${
                        fb.prioridade === 'critica' ? 'text-red-500 font-bold' : fb.prioridade === 'alta' ? 'text-amber-500' : 'text-slate-600 dark:text-zinc-300'
                      }`}>
                        {fb.prioridade}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white leading-snug">
                      {fb.titulo}
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400">
                      Módulo: <strong className="text-[#4d7c0f] dark:text-[#84cc16] font-semibold">{fb.modulo_afetado || 'Geral'}</strong>
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed bg-black/[0.02] dark:bg-white/[0.03] p-3 rounded-2xl border border-black/[0.04] dark:border-white/[0.05] whitespace-pre-wrap">
                    {fb.descricao}
                  </p>

                  {/* Thumbnail do Print Anexado */}
                  {fb.imagem_url && (
                    <div className="pt-1">
                      <span className="text-[10px] font-semibold text-slate-400 block mb-1">Evidência / Print Anexado:</span>
                      <div 
                        onClick={() => setLightboxImagem(fb.imagem_url)}
                        className="relative w-36 h-24 rounded-2xl overflow-hidden border border-black/[0.1] dark:border-white/[0.15] cursor-pointer group shadow-xs hover:border-black/30"
                      >
                        <img 
                          src={fb.imagem_url} 
                          alt="Evidência do erro" 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                          Ampliar Evidência
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[11px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Changer Rápido */}
                    <select
                      value={fb.status || 'em_analise'}
                      onChange={(e) => handleMudarStatusFeedback(fb.id, e.target.value)}
                      className="px-2.5 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-[11px] font-bold text-slate-700 dark:text-zinc-200 cursor-pointer focus:outline-none"
                    >
                      <option value="em_analise">Em Análise / Triagem</option>
                      <option value="em_correcao">Em Correção / Andamento</option>
                      <option value="no_roadmap">No Roadmap Futuro</option>
                      <option value="resolvido">Concluído / Implementado</option>
                    </select>

                    {fb.status !== 'resolvido' && (
                      <button
                        type="button"
                        onClick={() => handleMudarStatusFeedback(fb.id, 'resolvido')}
                        className="px-3 py-1 rounded-lg bg-[#4d7c0f]/15 hover:bg-[#4d7c0f]/25 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-[11px] cursor-pointer transition-all flex items-center gap-1 border border-[#4d7c0f]/20"
                      >
                        <CheckIcon className="w-3 h-3 stroke-[2.5]" />
                        <span>Concluir</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopiarRelato(fb)}
                    className="px-3 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.06] hover:bg-[#4d7c0f]/15 hover:text-[#4d7c0f] dark:hover:text-[#84cc16] text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-zinc-300"
                    title="Copiar dados deste relato para colar no Gemini"
                  >
                    {copiadoId === fb.id ? (
                      <>
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="w-3.5 h-3.5" />
                        <span>Copiar Relato</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Lightbox para Visualização do Print em Tela Cheia */}
      {isClient && createPortal(
        <AnimatePresence>
          {lightboxImagem && (
            <div 
              onClick={() => setLightboxImagem(null)}
              className="fixed inset-0 w-screen h-screen z-[100000] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 cursor-zoom-out overflow-hidden"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/20 shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                <img 
                  src={lightboxImagem} 
                  alt="Print ampliado" 
                  className="w-auto h-auto max-h-[85vh] object-contain rounded-2xl"
                />
                <button
                  onClick={() => setLightboxImagem(null)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Modal de Cadastro de Novo Feedback / Bug com Portal e Backdrop Blur Apple */}
      {isClient && createPortal(
        <AnimatePresence>
          {modalAberto && (
            <div 
              className="fixed inset-0 w-screen h-screen z-[99999] bg-black/60 dark:bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 overflow-hidden"
              onClick={() => setModalAberto(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-4xl max-h-[92vh] rounded-[32px] bg-white dark:bg-[#16161a] border border-black/[0.08] dark:border-white/[0.1] p-6 sm:p-8 shadow-2xl flex flex-col text-[#1d1d1f] dark:text-[#f5f5f7] relative"
                onClick={(e) => e.stopPropagation()}
              >
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">
                    Reportar Falha ou Sugerir Melhoria
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    O relato gerará automaticamente uma demanda correspondente na Fila de Demandas para a equipe técnica.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="p-2 text-slate-400 hover:text-black dark:hover:text-white rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitFeedback} className="flex flex-col flex-1 min-h-0 pt-4">
                <div className="overflow-y-auto pr-1 flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Coluna 1: Dados do Relato */}
                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Título Resumido do Erro / Ideia <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={titulo}
                          onChange={(e) => setTitulo(e.target.value)}
                          placeholder="Ex: Falha ao salvar servidor 2 ou botão cortado"
                          className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Módulo / Aba Afetada <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'Empresas', label: 'Empresas' },
                            { id: 'Fila de Demandas', label: 'Fila de Demandas' },
                            { id: 'Dashboard', label: 'Dashboard' },
                            { id: 'Configurações Gerais', label: 'Configurações Gerais' },
                          ].map((m) => {
                            const isSel = moduloAfetado === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setModuloAfetado(m.id)}
                                className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all border text-left cursor-pointer flex items-center justify-between ${
                                  isSel
                                    ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] border-[#4d7c0f]/40 dark:border-[#84cc16]/40 shadow-xs'
                                    : 'bg-black/[0.02] dark:bg-white/[0.04] text-slate-600 dark:text-zinc-400 border-black/[0.08] dark:border-white/[0.1] hover:border-black/20'
                                }`}
                              >
                                <span>{m.label}</span>
                                {isSel && <span className="text-[11px] font-bold">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Classificação
                          </label>
                          <select
                            value={tipo}
                            onChange={(e) => setTipo(e.target.value)}
                            className="w-full px-3 py-2 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-[#1a1a20] dark:[&>option]:text-white cursor-pointer"
                          >
                            <option value="bug">Erro / Bug</option>
                            <option value="melhoria">Melhoria Visual / UX</option>
                            <option value="sugestao">Sugestão / Nova Ideia</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Prioridade
                          </label>
                          <select
                            value={prioridade}
                            onChange={(e) => setPrioridade(e.target.value)}
                            className="w-full px-3 py-2 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-[#1a1a20] dark:[&>option]:text-white cursor-pointer"
                          >
                            <option value="normal">Normal</option>
                            <option value="alta">Alta</option>
                            <option value="critica">Crítica (Bloqueante)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Descrição Detalhada do Problema <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={4}
                          required
                          value={descricao}
                          onChange={(e) => setDescricao(e.target.value)}
                          placeholder="Explique o que aconteceu, passos para reproduzir ou o resultado esperado..."
                          className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* Coluna 2: Anexo de Print / Evidência */}
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                        Anexar Captura de Tela (Opcional)
                      </label>

                      {!imagemPreview ? (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-black/[0.12] dark:border-white/[0.15] hover:border-[#4d7c0f] dark:hover:border-[#84cc16] rounded-3xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px] bg-black/[0.01] dark:bg-white/[0.02]"
                        >
                          <span className="text-3xl mb-2">📸</span>
                          <span className="text-xs font-bold text-[#1d1d1f] dark:text-white block">
                            Clique ou arraste o print aqui
                          </span>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                            A imagem é comprimida automaticamente no seu navegador para não pesar o banco.
                          </p>
                          <span className="mt-3 px-3 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-[10px] font-semibold text-slate-600 dark:text-zinc-400">
                            PNG, JPG ou WebP
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="relative rounded-3xl overflow-hidden border border-black/[0.1] dark:border-white/[0.15] max-h-[240px] bg-black/5 flex items-center justify-center">
                            <img 
                              src={imagemPreview} 
                              alt="Print selecionado" 
                              className="w-full h-full max-h-[240px] object-contain"
                            />
                            <button
                              type="button"
                              onClick={handleRemoverImagem}
                              className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-all cursor-pointer"
                              title="Remover imagem"
                            >
                              <XMarkIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold text-center">
                            ✓ Imagem otimizada e pronta para envio
                          </p>
                        </div>
                      )}

                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleSelecionarArquivo}
                        accept="image/*"
                        className="hidden"
                      />
                    </div>

                  </div>
                </div>

                {/* Rodapé Fixo */}
                <div className="flex items-center justify-end gap-3 pt-3 mt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalAberto(false)}
                    className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={submitting}
                    type="submit"
                    className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Gravando e Encaminhando...' : 'Enviar Feedback & Criar Demanda'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}

    </div>
  );
}
