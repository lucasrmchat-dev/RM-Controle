'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSolucoesSuporte, addSolucaoSuporte, deleteSolucaoSuporte, removerAcentos, fetchHistoricoChamados } from '@/lib/storage';
import { showToast } from './ToastNotification';
import ConfirmModal from './ConfirmModal';
import { XMarkIcon, LightBulbIcon, BookOpenIcon, CheckIcon, CopyIcon, SparklesIcon, ViewGridIcon, ViewListIcon } from './Icons';

export default function KnowledgeBaseTab({
  empresa = null,
  userEmail = 'admin@rmcontrole.com',
  initialQuery = '',
  hideListWhenEmpty = false,
}) {
  const [kbViewMode, setKbViewMode] = useState('cards'); // 'cards' | 'list'
  const [query, setQuery] = useState(initialQuery || '');
  const [selectedTipo, setSelectedTipo] = useState('todos');
  const [solucoes, setSolucoes] = useState([]);
  const [isNovaSolucaoOpen, setIsNovaSolucaoOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Form para nova solução
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoTipo, setNovoTipo] = useState('Envio de Mensagem');
  const [novoContexto, setNovoContexto] = useState('');
  const [novosPassos, setNovosPassos] = useState('');
  const [associarEmpresa, setAssociarEmpresa] = useState(Boolean(empresa?.id));
  const [salvando, setSalvando] = useState(false);

  // Confirm delete modal
  const [solucaoParaExcluir, setSolucaoParaExcluir] = useState(null);
  const formRef = useRef(null);

  const carregarSolucoes = async () => {
    try {
      await fetchHistoricoChamados();
    } catch (e) {}
    const list = getSolucoesSuporte({
      empresa_id: empresa?.id || null,
      query,
      tipo: selectedTipo,
    });
    // Ordena priorizando soluções desta empresa no topo do banco geral e depois por data
    const sorted = [...list].sort((a, b) => {
      if (empresa?.id || empresa?.nome) {
        const aIsEmp = (empresa?.id && a.empresa_id === empresa.id) || (empresa?.nome && a.empresa_nome && a.empresa_nome.toLowerCase().trim() === empresa.nome.toLowerCase().trim()) ? 1 : 0;
        const bIsEmp = (empresa?.id && b.empresa_id === empresa.id) || (empresa?.nome && b.empresa_nome && b.empresa_nome.toLowerCase().trim() === empresa.nome.toLowerCase().trim()) ? 1 : 0;
        if (aIsEmp !== bIsEmp) return bIsEmp - aIsEmp;
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    setSolucoes(sorted);
  };

  useEffect(() => {
    carregarSolucoes();
  }, [query, selectedTipo, empresa?.id]);

  useEffect(() => {
    const handleUpdate = () => carregarSolucoes();
    window.addEventListener('solucoes_updated', handleUpdate);
    return () => window.removeEventListener('solucoes_updated', handleUpdate);
  }, [query, selectedTipo, empresa?.id]);

  // Função inteligente que orquestra a abertura do formulário pré-preenchendo a busca
  const handleCriarSolucaoFromQuery = (termoPesquisado = query) => {
    const termo = (termoPesquisado || '').trim();
    const isCodigo = /^[A-Z0-9_\-]{3,15}$/i.test(termo) || termo.includes('1310') || termo.toUpperCase().startsWith('ERR_') || termo.length <= 6 && !termo.includes(' ');
    
    if (isCodigo) {
      setNovoCodigo(termo.toUpperCase());
      setNovoTitulo('');
    } else {
      setNovoTitulo(termo);
      setNovoCodigo('');
    }
    
    setIsNovaSolucaoOpen(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSalvarSolucao = async (e) => {
    e.preventDefault();
    if (!novoTitulo.trim() || !novosPassos.trim()) {
      showToast('Preencha o título e o passo a passo da solução.', 'error');
      return;
    }

    try {
      setSalvando(true);
      await addSolucaoSuporte({
        empresa_id: associarEmpresa && empresa?.id ? empresa.id : null,
        empresa_nome: associarEmpresa && empresa?.nome ? empresa.nome : 'Global',
        titulo: novoTitulo,
        erro_codigo: novoCodigo,
        contexto: novoContexto,
        tipo_erro: novoTipo,
        solucao_passos: novosPassos,
        userEmail,
      });

      showToast('Nova solução catalogada no Banco Geral com sucesso!', 'success');
      setNovoTitulo('');
      setNovoCodigo('');
      setNovoContexto('');
      setNovosPassos('');
      setIsNovaSolucaoOpen(false);
      carregarSolucoes();
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar solução.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!solucaoParaExcluir) return;
    try {
      await deleteSolucaoSuporte(solucaoParaExcluir.id, userEmail);
      showToast('Solução removida da base de conhecimento.', 'info');
      setSolucaoParaExcluir(null);
      carregarSolucoes();
    } catch (err) {
      showToast(err.message || 'Erro ao remover solução.', 'error');
    }
  };

  const handleCopyPassos = (id, texto) => {
    navigator.clipboard?.writeText(texto);
    setCopiedId(id);
    showToast('Passo a passo copiado para a área de transferência!', 'success');
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-5">
      {/* CARD DO TOPO: PESQUISA & CONTROLES DA BASE DE CONHECIMENTO */}
      <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <BookOpenIcon className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold tracking-tight text-[#0a0a0c] dark:text-white">
                Como Resolver Chamados
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Banco global de procedimentos e resoluções técnicas aplicadas em todas as empresas.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 bg-black/[0.03] dark:bg-white/[0.05] px-3 py-1 rounded-full">
              {solucoes.length} {solucoes.length === 1 ? 'procedimento' : 'procedimentos'}
            </span>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => {
                if (!isNovaSolucaoOpen && query.trim()) {
                  handleCriarSolucaoFromQuery(query);
                } else {
                  setIsNovaSolucaoOpen(!isNovaSolucaoOpen);
                }
              }}
              className="px-4 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
            >
              <LightBulbIcon className="w-3.5 h-3.5" />
              <span>{isNovaSolucaoOpen ? 'Voltar à Busca' : '+ Nova Solução'}</span>
            </motion.button>
          </div>
        </div>

        {/* Input de Busca com debounce instantâneo */}
        <div className="relative pt-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por sintoma, código de erro ou descrição..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs sm:text-sm font-medium text-[#1d1d1f] dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 transition-all"
          />
          <div className="absolute inset-y-0 left-0 pl-3.5 pt-1 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white text-xs font-bold p-1 rounded-full cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ============================================================================== */}
      {/* ORQUESTRAÇÃO DE MOTION DESIGN: EXPANSÃO AUTOMÁTICA QUANDO BUSCA NÃO ENCONTRA NADA */}
      {/* ============================================================================== */}
      <AnimatePresence>
        {query.trim() && solucoes.length === 0 && !isNovaSolucaoOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="p-5 sm:p-6 rounded-3xl border border-amber-500/30 bg-amber-500/[0.05] dark:bg-amber-500/[0.08] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <SparklesIcon className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                  Nenhum procedimento encontrado para &ldquo;{query}&rdquo;
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Deseja cadastrar agora o passo a passo de resolução para alimentar o banco geral da equipe?
                </p>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => handleCriarSolucaoFromQuery(query)}
              className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <span>+ Cadastrar Solução com &ldquo;{query}&rdquo;</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FORMULÁRIO DE NOVA SOLUÇÃO OU LISTAGEM UNIFICADA */}
      <AnimatePresence mode="wait">
        {isNovaSolucaoOpen ? (
          <motion.form
            ref={formRef}
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleSalvarSolucao} 
            className="space-y-5 p-6 sm:p-7 rounded-3xl border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] shadow-sm"
          >
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
              <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <LightBulbIcon className="w-4 h-4 text-emerald-600" />
                <span>Catalogar Novo Procedimento Técnico no Banco Geral</span>
              </span>
              <p className="text-slate-600 dark:text-zinc-300 text-[11px]">
                Documente sintomas e resoluções para agilizar futuros chamados de qualquer operador da equipe.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Título do Problema ou Solução <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Ex: Instância Desconectada / Falha de Pareamento QR Code"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium text-[#1d1d1f] dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Código de Erro / Identificador (Opcional)
                </label>
                <input
                  type="text"
                  value={novoCodigo}
                  onChange={(e) => setNovoCodigo(e.target.value)}
                  placeholder="Ex: ERR_EVOLUTION, 131026, 401..."
                  className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none text-[#1d1d1f] dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Categoria do Suporte
                </label>
                <select
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-[#1a1a20] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-[#1a1a20] dark:[&>option]:text-white cursor-pointer"
                >
                  <option value="Envio de Mensagem">Envio de Mensagem</option>
                  <option value="Desconexão de Instância">Desconexão de Instância</option>
                  <option value="Servidor VPS & SSL">Servidor VPS & SSL</option>
                  <option value="Banco de Dados">Banco de Dados</option>
                  <option value="Redefinição de Senha">Redefinição de Senha</option>
                  <option value="Suporte Geral">Suporte Geral</option>
                </select>
              </div>

              {empresa?.nome && (
                <div className="space-y-1 sm:col-span-2 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={associarEmpresa}
                      onChange={(e) => setAssociarEmpresa(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#4d7c0f] focus:ring-[#4d7c0f]"
                    />
                    <span>Mencionar <strong>{empresa.nome}</strong> no card desta solução no Banco Geral</span>
                  </label>
                </div>
              )}

              <div className="space-y-1 sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Contexto ou Sintoma
                </label>
                <input
                  type="text"
                  value={novoContexto}
                  onChange={(e) => setNovoContexto(e.target.value)}
                  placeholder="Ex: Ocorre quando a instância perde a sessão ou o aparelho do cliente reiniciou"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Passo a Passo da Resolução <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={5}
                  value={novosPassos}
                  onChange={(e) => setNovosPassos(e.target.value)}
                  placeholder={'1. Acessar o Manager do Servidor\n2. Clicar em Reiniciar Instância\n3. Aguardar 10s e escanear o novo QR Code gerado'}
                  required
                  className="w-full p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 leading-relaxed text-[#1d1d1f] dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsNovaSolucaoOpen(false)}
                className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-slate-600 dark:text-zinc-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="px-6 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {salvando ? 'Salvando...' : 'Salvar Procedimento'}
              </button>
            </div>
          </motion.form>
        ) : (
          <div className="space-y-4">
            {hideListWhenEmpty && !query.trim() ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="p-8 text-center rounded-3xl border border-dashed border-black/10 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.015] space-y-2.5"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                  <LightBulbIcon className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                  Digite para pesquisar resoluções de chamados
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Conforme você digita termos do erro, código ou dúvida da empresa, as soluções técnicas correspondentes são animadas na tela.
                </p>
                <div className="flex items-center justify-center gap-1.5 flex-wrap pt-2">
                  <span className="text-[10px] text-slate-400 font-mono">Sugestões rápidas:</span>
                  {['#login', '#senha', '#impressora', '#whatsapp', '#qrcode', '#timeout', '#banco'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setQuery(sug.replace('#', ''))}
                      className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10 text-[11px] font-mono text-slate-600 dark:text-zinc-300 hover:bg-black/10 cursor-pointer transition-colors"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-zinc-200 px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Soluções Encontradas ({solucoes.length})</span>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => setKbViewMode('cards')}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                        kbViewMode === 'cards'
                          ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-black dark:hover:text-white'
                      }`}
                      title="Visualizar em Cards"
                    >
                      <ViewGridIcon className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setKbViewMode('list')}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                        kbViewMode === 'list'
                          ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-black dark:hover:text-white'
                      }`}
                      title="Visualizar em Lista"
                    >
                      <ViewListIcon className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Lista</span>
                    </button>
                  </div>
                </div>

                <AnimatePresence mode="popLayout">
                  {solucoes.length === 0 ? (
              <div className="p-10 rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#16161a] text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                  <LightBulbIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                  Nenhuma solução catalogada ainda
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Utilize o botão abaixo para registrar o primeiro procedimento técnico e enriquecer a base de conhecimento.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleCriarSolucaoFromQuery('')}
                    className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-xs cursor-pointer inline-flex items-center gap-1.5 hover:opacity-95 transition-all"
                  >
                    <LightBulbIcon className="w-3.5 h-3.5" />
                    <span>Cadastrar Primeira Solução</span>
                  </button>
                </div>
              </div>
            ) : kbViewMode === 'cards' ? (
              <div className="flex flex-col gap-4 w-full">
                  {solucoes.map((s) => {
                    const isDestaEmpresa = Boolean(
                      (empresa?.id && s.empresa_id === empresa.id) ||
                      (empresa?.nome && s.empresa_nome && s.empresa_nome.toLowerCase().trim() === empresa.nome.toLowerCase().trim())
                    );
                    const temEmpresa = Boolean(s.empresa_nome && s.empresa_nome !== 'Global');

                    return (
                      <motion.div
                        key={s.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`w-full rounded-3xl p-5 sm:p-6 border space-y-4 relative group flex flex-col justify-between shadow-xs transition-all ${
                          isDestaEmpresa
                            ? 'border-emerald-500/35 dark:border-emerald-500/25 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04]'
                            : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a]'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                {s.erro_codigo && (
                                  <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 font-mono text-[10px] font-bold border border-red-500/20">
                                    {s.erro_codigo}
                                  </span>
                                )}
                                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300 font-semibold border border-black/[0.04] dark:border-white/[0.05]">
                                  {s.tipo_erro}
                                </span>

                                {/* Menção direta da Empresa */}
                                {temEmpresa ? (
                                  <span
                                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                                      isDestaEmpresa
                                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                                        : 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/20'
                                    }`}
                                    title={`Empresa de origem: ${s.empresa_nome}`}
                                  >
                                    <span>🏢</span>
                                    <span>{s.empresa_nome}</span>
                                    {isDestaEmpresa && (
                                      <span className="text-[9px] font-bold opacity-80 ml-0.5">• Desta Empresa</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    • Geral
                                  </span>
                                )}
                              </div>

                              <h4 className="text-base font-bold text-[#1d1d1f] dark:text-white leading-snug">
                                {s.titulo}
                              </h4>
                              {s.contexto && (
                                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 italic">
                                  {s.contexto}
                                </p>
                              )}
                            </div>

                            {s.is_user_created && (
                              <button
                                type="button"
                                onClick={() => setSolucaoParaExcluir(s)}
                                className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                                title="Excluir Solução"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="w-full p-4 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-zinc-900/90 border border-black/[0.05] dark:border-white/[0.06] text-xs sm:text-[13px] font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed shadow-2xs">
                            {s.solucao_passos}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-black/[0.04] dark:border-white/[0.06] text-xs">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : 'Registrado'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPassos(s.id, s.solucao_passos)}
                            className="px-3 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-xs font-semibold text-slate-800 dark:text-zinc-200 cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs"
                          >
                            {copiedId === s.id ? (
                              <>
                                <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <CopyIcon className="w-3.5 h-3.5 text-slate-500" />
                                <span>Copiar Passos</span>
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                /* MODO LISTA COMPLETO, ELEGANTE E LARGURA TOTAL */
                <div className="flex flex-col gap-2.5 w-full">
                  {solucoes.map((s) => {
                    const isDestaEmpresa = Boolean(
                      (empresa?.id && s.empresa_id === empresa.id) ||
                      (empresa?.nome && s.empresa_nome && s.empresa_nome.toLowerCase().trim() === empresa.nome.toLowerCase().trim())
                    );
                    const temEmpresa = Boolean(s.empresa_nome && s.empresa_nome !== 'Global');
                    const isExpanded = expandedIds.has(s.id);

                    return (
                      <motion.div
                        key={s.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`w-full rounded-2xl border p-4 sm:p-5 transition-all shadow-2xs ${
                          isDestaEmpresa
                            ? 'border-emerald-500/35 dark:border-emerald-500/25 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04]'
                            : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a]'
                        }`}
                      >
                        {/* Linha Principal do Item */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {s.erro_codigo && (
                                <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 font-mono text-[10px] font-bold border border-red-500/20">
                                  {s.erro_codigo}
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300 font-semibold border border-black/[0.04] dark:border-white/[0.05]">
                                {s.tipo_erro}
                              </span>

                              {temEmpresa ? (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                    isDestaEmpresa
                                      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                                      : 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/20'
                                  }`}
                                >
                                  <span>🏢</span>
                                  <span>{s.empresa_nome}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono">• Geral</span>
                              )}
                            </div>

                            <h4 className="text-sm sm:text-base font-bold text-[#1d1d1f] dark:text-white leading-snug">
                              {s.titulo}
                            </h4>

                            {/* Preview resumido quando fechado */}
                            {!isExpanded && (
                              <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono line-clamp-2 leading-relaxed bg-black/[0.015] dark:bg-white/[0.02] p-2 rounded-xl border border-black/[0.03] dark:border-white/[0.04]">
                                {s.solucao_passos}
                              </p>
                            )}
                          </div>

                          {/* Ações da Linha */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleExpand(s.id)}
                              className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] hover:bg-black/[0.06] text-xs font-semibold text-slate-700 dark:text-zinc-200 cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs"
                            >
                              <span>{isExpanded ? 'Recolher' : 'Ver Passos'}</span>
                              <span className="text-[9px]">{isExpanded ? '▲' : '▼'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopyPassos(s.id, s.solucao_passos)}
                              className="p-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] hover:bg-black/[0.05] text-slate-600 dark:text-zinc-300 cursor-pointer transition-colors shadow-2xs"
                              title="Copiar Procedimento"
                            >
                              {copiedId === s.id ? (
                                <CheckIcon className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <CopyIcon className="w-4 h-4" />
                              )}
                            </button>

                            {s.is_user_created && (
                              <button
                                type="button"
                                onClick={() => setSolucaoParaExcluir(s)}
                                className="text-slate-300 hover:text-red-500 p-1.5 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer"
                                title="Excluir Solução"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Conteúdo Expandido do Modo Lista */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] space-y-2.5">
                            {s.contexto && (
                              <p className="text-xs text-slate-500 dark:text-zinc-400 italic">
                                {s.contexto}
                              </p>
                            )}
                            <div className="w-full p-4 rounded-xl bg-slate-50/90 dark:bg-zinc-900/90 border border-black/[0.06] dark:border-white/[0.08] text-xs sm:text-[13px] font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed shadow-inner">
                              {s.solucao_passos}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                              <span>Registrado em {s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : 'Data não informada'}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyPassos(s.id, s.solucao_passos)}
                                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <CopyIcon className="w-3.5 h-3.5" />
                                <span>Copiar procedimento completo</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    )}
  </AnimatePresence>

      {/* Modal de Confirmação de Exclusão */}
      <ConfirmModal
        isOpen={Boolean(solucaoParaExcluir)}
        title="Excluir Solução?"
        message={`Deseja realmente remover a solução "${solucaoParaExcluir?.titulo}" da Base de Conhecimento?`}
        confirmText="Sim, Excluir"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleConfirmarExclusao}
        onClose={() => setSolucaoParaExcluir(null)}
      />
    </div>
  );
}
