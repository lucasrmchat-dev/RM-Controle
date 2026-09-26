'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSolucoesSuporte, addSolucaoSuporte, deleteSolucaoSuporte, removerAcentos } from '@/lib/storage';
import { showToast } from './ToastNotification';
import ConfirmModal from './ConfirmModal';
import { XMarkIcon } from './Icons';

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
    });
    setSolucoes(list);
  };

  useEffect(() => {
    if (isOpen) {
      carregarSolucoes();
    }
  }, [isOpen, query, selectedTag, selectedTipo, empresa]);

  useEffect(() => {
    const handleUpdate = () => carregarSolucoes();
    window.addEventListener('solucoes_updated', handleUpdate);
    return () => window.removeEventListener('solucoes_updated', handleUpdate);
  }, [query, selectedTag, selectedTipo, empresa]);

  const handleSalvarSolucao = async (e) => {
    e.preventDefault();
    if (!novoTitulo.trim() || !novosPassos.trim()) {
      showToast('Preencha o título e o passo a passo da solução.', 'error');
      return;
    }

    try {
      setSalvando(true);
      await addSolucaoSuporte({
        empresa_id: empresa?.id || null,
        empresa_nome: empresa?.nome || 'Global',
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

  // Extrai tags disponíveis estritamente das soluções existentes (sem tags fictícias hardcoded)
  const tagsDisponiveis = Array.from(
    new Set(solucoes.flatMap((s) => s.tags || []).filter(Boolean))
  );

  // Separação inteligente: soluções desta empresa vs soluções do banco geral
  const solucoesDestaEmpresa = empresa?.id ? solucoes.filter((s) => s.empresa_id === empresa.id) : [];
  const solucoesBancoGeral = empresa?.id ? solucoes.filter((s) => s.empresa_id !== empresa.id) : solucoes;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-screen h-screen z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl max-h-[90vh] rounded-[28px] border border-black/10 dark:border-white/15 bg-white dark:bg-[#16161a] p-6 sm:p-8 shadow-2xl flex flex-col text-[#1d1d1f] dark:text-[#f5f5f7] my-auto overflow-hidden"
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-black/[0.05] dark:border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Base de Conhecimento Operacional</span>
                </span>
                {empresa && (
                  <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    Atendimento Atual: <strong className="text-slate-800 dark:text-zinc-200">{empresa.nome}</strong>
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                Como Resolver Chamados
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Pesquisa automática: busca por sintomas, códigos de erro e procedimentos sem distinção de acentos ou maiúsculas.
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
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isNovaSolucaoOpen ? (
            <div className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1">
              
              {/* Barra de Busca Inteligente (Sem cliques manuais de alternância) */}
              <div className="space-y-2.5">
                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Digite o código de erro (ex: 131026, 401), sintoma, reconexão, SSL, senha..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                    autoFocus
                  />
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                </div>

                {/* Filtro Rápido por Tags Dinâmicas (apenas se houver tags reais cadastradas) */}
                {tagsDisponiveis.length > 0 && (
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
                    {tagsDisponiveis.map((t) => (
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
                )}
              </div>

              {/* LISTAGEM DE SOLUÇÕES: DESTA EMPRESA + FALLBACK GERAL AUTOMÁTICO */}
              <div className="space-y-4 pt-1">
                
                {/* 1. SEÇÃO DESTA EMPRESA (SE HOUVER) */}
                {empresa?.id && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-zinc-200">
                      <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]"></span>
                      <span>Soluções Específicas de {empresa.nome} ({solucoesDestaEmpresa.length})</span>
                    </div>

                    {solucoesDestaEmpresa.length === 0 ? (
                      <div className="p-4 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-slate-400">
                        Nenhuma solução cadastrada especificamente para {empresa.nome} com este filtro.
                      </div>
                    ) : (
                      solucoesDestaEmpresa.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-2xl p-5 border border-emerald-500/25 dark:border-emerald-500/20 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] space-y-3 relative group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {s.erro_codigo && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-bold">
                                    {s.erro_codigo}
                                  </span>
                                )}
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400">
                                  {s.tipo_erro}
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                                {s.titulo}
                              </h4>
                              {s.contexto && (
                                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 italic">
                                  Contexto: {s.contexto}
                                </p>
                              )}
                            </div>

                            <button
                              onClick={() => setSolucaoParaExcluir(s)}
                              className="text-slate-300 hover:text-red-500 p-1 rounded-md transition-colors cursor-pointer"
                              title="Excluir Solução"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="p-3.5 rounded-xl bg-white dark:bg-[#1a1a20] border border-black/[0.06] dark:border-white/[0.08] text-xs font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed">
                            {s.solucao_passos}
                          </div>

                          {s.tags && s.tags.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px] font-mono text-slate-400">
                              {s.tags.map((t, idx) => (
                                <span key={idx}>#{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 2. SEÇÃO BANCO GERAL AUTOMÁTICO */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-zinc-200 border-t border-black/[0.05] dark:border-white/[0.06] pt-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span>Banco Geral de Soluções ({solucoesBancoGeral.length})</span>
                    </div>
                    {empresa?.id && (
                      <span className="text-[10px] font-normal text-slate-400">
                        (Soluções aplicáveis a qualquer empresa)
                      </span>
                    )}
                  </div>

                  {solucoesBancoGeral.length === 0 ? (
                    <div className="p-8 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] text-center space-y-2">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Nenhuma solução encontrada no banco de conhecimento.
                      </p>
                      <button
                        onClick={() => setIsNovaSolucaoOpen(true)}
                        className="text-xs text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline cursor-pointer"
                      >
                        + Cadastrar a primeira solução
                      </button>
                    </div>
                  ) : (
                    solucoesBancoGeral.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-2xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1a1a20] space-y-3 relative group shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {s.erro_codigo && (
                                <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 font-mono text-[10px] font-bold">
                                  {s.erro_codigo}
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-slate-600 dark:text-zinc-400">
                                {s.tipo_erro}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                • {s.empresa_nome || 'Global'}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                              {s.titulo}
                            </h4>
                            {s.contexto && (
                              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 italic">
                                Contexto: {s.contexto}
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => setSolucaoParaExcluir(s)}
                            className="text-slate-300 hover:text-red-500 p-1 rounded-md transition-colors cursor-pointer"
                            title="Excluir Solução"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-black/[0.05] dark:border-white/[0.06] text-xs font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed">
                          {s.solucao_passos}
                        </div>

                        {s.tags && s.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px] font-mono text-slate-400">
                            {s.tags.map((t, idx) => (
                              <span key={idx}>#{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

              </div>

            </div>
          ) : (
            /* FORMULÁRIO DE NOVA SOLUÇÃO */
            <form onSubmit={handleSalvarSolucao} className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1">
              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] text-xs space-y-1">
                <span className="font-bold text-[#1d1d1f] dark:text-white">Catalogar Novo Procedimento Técnico</span>
                <p className="text-slate-500 dark:text-zinc-400 text-[11px]">
                  Documente sintomas e resoluções para agilizar futuros chamados de qualquer operador da equipe.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
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
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Categoria do Suporte
                  </label>
                  <select
                    value={novoTipo}
                    onChange={(e) => setNovoTipo(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                  >
                    <option value="Envio de Mensagem">Envio de Mensagem</option>
                    <option value="Desconexão de Instância">Desconexão de Instância</option>
                    <option value="Servidor VPS & SSL">Servidor VPS & SSL</option>
                    <option value="Banco de Dados">Banco de Dados</option>
                    <option value="Redefinição de Senha">Redefinição de Senha</option>
                    <option value="Suporte Geral">Suporte Geral</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Contexto ou Sintoma
                  </label>
                  <input
                    type="text"
                    value={novoContexto}
                    onChange={(e) => setNovoContexto(e.target.value)}
                    placeholder="Ex: Ocorre quando a VPS é reiniciada ou após inatividade do WhatsApp no celular"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Passo a Passo da Solução <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={novosPassos}
                    onChange={(e) => setNovosPassos(e.target.value)}
                    placeholder="1. Acesse o painel de instâncias&#10;2. Clique em resetar sessão&#10;3. Gere novo QR Code..."
                    required
                    className="w-full p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Tags de Busca (Separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    value={novasTags}
                    onChange={(e) => setNovasTags(e.target.value)}
                    placeholder="Ex: qrcode, evolution, reinicio, timeout"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
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
                  className="px-5 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar Solução'}
                </button>
              </div>
            </form>
          )}

        </motion.div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {solucaoParaExcluir && (
        <ConfirmModal
          isOpen={Boolean(solucaoParaExcluir)}
          title="Excluir Solução da Base?"
          message={`Tem certeza que deseja remover a solução "${solucaoParaExcluir.titulo}" da base de conhecimento?`}
          confirmText="Sim, Excluir"
          cancelText="Cancelar"
          variant="danger"
          onConfirm={handleConfirmarExclusao}
          onCancel={() => setSolucaoParaExcluir(null)}
        />
      )}
    </AnimatePresence>
  );
}
