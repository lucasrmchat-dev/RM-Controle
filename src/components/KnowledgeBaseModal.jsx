'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSolucoesSuporte, addSolucaoSuporte, deleteSolucaoSuporte } from '@/lib/storage';
import { showToast } from './ToastNotification';
import ConfirmModal from './ConfirmModal';

export default function KnowledgeBaseModal({
  isOpen,
  onClose,
  empresa = null,
  userEmail = 'admin@rmcontrole.com',
  initialQuery = '',
}) {
  const [query, setQuery] = useState(initialQuery || '');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedTipo, setSelectedTipo] = useState('todos');
  const [buscaGeral, setBuscaGeral] = useState(false);
  const [solucoes, setSolucoes] = useState([]);
  const [isNovaSolucaoOpen, setIsNovaSolucaoOpen] = useState(false);

  // Form para nova solução
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoTipo, setNovoTipo] = useState('Envio de Mensagem');
  const [novoContexto, setNovoContexto] = useState('');
  const [novosPassos, setNovosPassos] = useState('');
  const [novasTags, setNovasTags] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Confirm delete modal
  const [solucaoParaExcluir, setSolucaoParaExcluir] = useState(null);

  const carregarSolucoes = () => {
    const list = getSolucoesSuporte({
      empresa_id: empresa?.id || null,
      query,
      tag: selectedTag,
      tipo: selectedTipo,
      buscaGeral,
    });
    setSolucoes(list);
  };

  useEffect(() => {
    if (isOpen) {
      carregarSolucoes();
    }
  }, [isOpen, query, selectedTag, selectedTipo, buscaGeral, empresa]);

  useEffect(() => {
    const handleUpdate = () => carregarSolucoes();
    window.addEventListener('solucoes_updated', handleUpdate);
    return () => window.removeEventListener('solucoes_updated', handleUpdate);
  }, [query, selectedTag, selectedTipo, buscaGeral, empresa]);

  const handleSalvarSolucao = async (e) => {
    e.preventDefault();
    if (!novoTitulo.trim() || !novosPassos.trim()) {
      showToast('Preencha o título e o passo a passo da solução.', 'error');
      return;
    }

    try {
      setSalvando(true);
      await addSolucaoSuporte({
        empresa_id: buscaGeral ? null : (empresa?.id || null),
        empresa_nome: buscaGeral ? 'Global' : (empresa?.nome || 'Global'),
        titulo: novoTitulo,
        erro_codigo: novoCodigo,
        contexto: novoContexto,
        tipo_erro: novoTipo,
        solucao_passos: novosPassos,
        tags: novasTags,
        userEmail,
      });

      showToast('Nova solução catalogada com sucesso!', 'success');
      setNovoTitulo('');
      setNovoCodigo('');
      setNovoContexto('');
      setNovosPassos('');
      setNovasTags('');
      setIsNovaSolucaoOpen(false);
      carregarSolucoes();
    } catch (err) {
      showToast(err.message || 'Erro ao catalogar solução.', 'error');
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

  if (!isOpen) return null;

  const tagsFrequentes = [
    'qrcode', 'evolution', 'pareamento', 'meta', 'waba', 
    '131026', 'ssl', 'postgres', 'redefinicao', 'senha', 'timeout'
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-screen h-screen z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full max-w-4xl max-h-[90vh] rounded-[32px] border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#16161a] backdrop-blur-2xl p-6 sm:p-8 shadow-2xl flex flex-col text-[#1d1d1f] dark:text-[#f5f5f7] my-auto overflow-hidden"
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-black/[0.05] dark:border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Base de Conhecimento Operacional</span>
                </span>
                {empresa && (
                  <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    Contexto: <strong className="text-slate-800 dark:text-zinc-200">{empresa.nome}</strong>
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                Como Resolver Chamados
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Consulte causas, códigos de erro e soluções testadas em atendimentos anteriores para resolver rapidamente.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsNovaSolucaoOpen(!isNovaSolucaoOpen)}
                className="px-3.5 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
              >
                <span>{isNovaSolucaoOpen ? 'Voltar à Busca' : '+ Nova Solução'}</span>
              </motion.button>

              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
                title="Fechar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Alternância entre Busca de Soluções vs Cadastro de Nova Solução */}
          {!isNovaSolucaoOpen ? (
            <div className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1">
              
              {/* Barra de Busca Inteligente + Seletor de Escopo */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Pesquisar por erro (ex: 131026, 401), sintoma, instância, SSL, senha..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                      autoFocus
                    />
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>
                  </div>

                  {/* Toggle de Escopo: Apenas desta empresa vs Busca Geral */}
                  {empresa && (
                    <div className="flex items-center p-1 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setBuscaGeral(false)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          !buscaGeral
                            ? 'bg-white dark:bg-[#1a1a20] text-[#1d1d1f] dark:text-white shadow-xs'
                            : 'text-slate-500 hover:text-black dark:hover:text-white'
                        }`}
                      >
                        🏢 Desta Empresa
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuscaGeral(true)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          buscaGeral
                            ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold shadow-xs'
                            : 'text-slate-500 hover:text-black dark:hover:text-white'
                        }`}
                      >
                        🌐 Busca Geral (Todas)
                      </button>
                    </div>
                  )}
                </div>

                {/* Filtro Rápido por Tags Populares */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <span className="text-slate-400 text-[10px] uppercase font-mono mr-1">Tags:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTag('')}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                      !selectedTag
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.06]'
                    }`}
                  >
                    Todas
                  </button>
                  {tagsFrequentes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTag(selectedTag === t ? '' : t)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                        selectedTag === t
                          ? 'bg-[#4d7c0f] text-white dark:bg-[#84cc16] dark:text-zinc-950 font-bold'
                          : 'bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.06]'
                      }`}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista de Soluções com Cards Apple-grade */}
              <div className="space-y-3 pt-1">
                {solucoes.length === 0 ? (
                  <div className="p-8 text-center rounded-3xl border border-dashed border-black/[0.08] dark:border-white/[0.1] text-xs text-slate-400 space-y-2">
                    <p className="font-semibold text-sm text-slate-600 dark:text-zinc-300">
                      Nenhuma solução encontrada para os termos informados.
                    </p>
                    <p className="max-w-md mx-auto text-[11px]">
                      Você pode catalogar esta resolução clicando no botão <strong>+ Nova Solução</strong> acima para que toda a equipe aprenda com este atendimento.
                    </p>
                  </div>
                ) : (
                  solucoes.map((item, idx) => (
                    <motion.div
                      key={item.id || idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="p-4 sm:p-5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-[#1a1a20] hover:shadow-md transition-all space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.erro_codigo && (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                {item.erro_codigo}
                              </span>
                            )}
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300">
                              {item.tipo_erro || 'Suporte'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              • {item.empresa_nome || 'Global'}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white leading-snug">
                            {item.titulo}
                          </h3>

                          {item.contexto && (
                            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed italic">
                              Contexto: {item.contexto}
                            </p>
                          )}
                        </div>

                        {!item.is_from_history && (
                          <button
                            type="button"
                            onClick={() => setSolucaoParaExcluir(item)}
                            className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Remover solução da base"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Passo a Passo da Solução */}
                      <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/[0.05] dark:border-white/[0.06] text-xs font-mono text-slate-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                        {item.solucao_passos}
                      </div>

                      {/* Tags & Autor */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-black/[0.03] dark:border-white/[0.04]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.tags?.map((t, ti) => (
                            <span key={ti} className="font-mono text-slate-500 dark:text-zinc-400">
                              #{t}
                            </span>
                          ))}
                        </div>
                        <span className="font-mono">
                          Documentado por {item.autor_email?.split('@')[0]}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Formulário de Criação de Nova Solução */
            <form onSubmit={handleSalvarSolucao} className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                    Título do Problema ou Erro <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={novoTitulo}
                    onChange={(e) => setNovoTitulo(e.target.value)}
                    placeholder="Ex: Instância desconecta após reinício de VPS"
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                    Código de Erro / Referência (Opcional)
                  </label>
                  <input
                    type="text"
                    value={novoCodigo}
                    onChange={(e) => setNovoCodigo(e.target.value)}
                    placeholder="Ex: WABA_131026 / ERR_CONN_REFUSED / 502"
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                    Categoria do Erro
                  </label>
                  <select
                    value={novoTipo}
                    onChange={(e) => setNovoTipo(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 cursor-pointer"
                  >
                    <option value="Envio de Mensagem">Envio de Mensagem</option>
                    <option value="Desconexão de Instância">Desconexão de Instância</option>
                    <option value="Redefinição de Senha">Redefinição de Senha</option>
                    <option value="Servidor VPS & SSL">Servidor VPS & SSL</option>
                    <option value="Banco de Dados">Banco de Dados</option>
                    <option value="Fila & Triagem">Fila & Triagem</option>
                    <option value="Suporte Geral">Suporte Geral</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                  Contexto e Sintomas Observados
                </label>
                <input
                  type="text"
                  value={novoContexto}
                  onChange={(e) => setNovoContexto(e.target.value)}
                  placeholder="Ex: Mensagens param de disparar após 50 envios simultâneos"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                  Passo a Passo da Resolução / Como Resolver <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={novosPassos}
                  onChange={(e) => setNovosPassos(e.target.value)}
                  rows={4}
                  required
                  placeholder="1. Acesse o servidor VPS via SSH&#10;2. Execute docker restart evolution_api&#10;3. Limpe o cache do Redis&#10;4. Teste novo pareamento"
                  className="w-full p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 resize-none leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                  Tags e Palavras-chave (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={novasTags}
                  onChange={(e) => setNovasTags(e.target.value)}
                  placeholder="Ex: evolution, redis, restart, vps, timeout"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsNovaSolucaoOpen(false)}
                  className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-6 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar Solução na Base'}
                </button>
              </div>
            </form>
          )}

          {/* Modal de Confirmação de Exclusão */}
          <ConfirmModal
            isOpen={Boolean(solucaoParaExcluir)}
            title="Excluir Solução da Base?"
            message={`Deseja remover a solução "${solucaoParaExcluir?.titulo}" do banco de conhecimento?`}
            confirmText="Excluir Solução"
            cancelText="Manter"
            variant="danger"
            onConfirm={handleConfirmarExclusao}
            onClose={() => setSolucaoParaExcluir(null)}
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
