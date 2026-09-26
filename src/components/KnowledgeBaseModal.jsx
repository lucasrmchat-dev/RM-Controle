'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSolucoesSuporte, addSolucaoSuporte, deleteSolucaoSuporte, removerAcentos } from '@/lib/storage';
import { showToast } from './ToastNotification';
import ConfirmModal from './ConfirmModal';
import { XMarkIcon, LightBulbIcon, BookOpenIcon, CheckIcon } from './Icons';

export default function KnowledgeBaseTab({
  empresa = null,
  userEmail = 'admin@rmcontrole.com',
  initialQuery = '',
}) {
  const [query, setQuery] = useState(initialQuery || '');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedTipo, setSelectedTipo] = useState('todos');
  const [solucoes, setSolucoes] = useState([]);
  const [isNovaSolucaoOpen, setIsNovaSolucaoOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

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
    carregarSolucoes();
  }, [query, selectedTag, selectedTipo, empresa?.id]);

  useEffect(() => {
    const handleUpdate = () => carregarSolucoes();
    window.addEventListener('solucoes_updated', handleUpdate);
    return () => window.removeEventListener('solucoes_updated', handleUpdate);
  }, [query, selectedTag, selectedTipo, empresa?.id]);

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

  // Extrai tags disponíveis estritamente das soluções existentes (sem tags fictícias hardcoded)
  const tagsDisponiveis = Array.from(
    new Set(solucoes.flatMap((s) => s.tags || []).filter(Boolean))
  );

  // Separação inteligente: soluções desta empresa vs soluções do banco geral
  const solucoesDestaEmpresa = empresa?.id ? solucoes.filter((s) => s.empresa_id === empresa.id) : [];
  const solucoesBancoGeral = empresa?.id ? solucoes.filter((s) => s.empresa_id !== empresa.id) : solucoes;

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
              <h2 className="text-base sm:text-lg font-bold text-[#0a0a0c] dark:text-white">
                Como Resolver Chamados
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Catálogo de procedimentos técnicos e soluções operacionais para {empresa?.nome || 'esta empresa'} e banco geral.
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
              onClick={() => setIsNovaSolucaoOpen(!isNovaSolucaoOpen)}
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
            placeholder="Pesquisar por sintoma, código de erro (ex: 131026, 401, QR Code, SSL, deslogado, backup)..."
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white text-xs font-bold p-1 rounded-full"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtro por Tags Dinâmicas */}
        {tagsDisponiveis.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 text-[10px] uppercase font-mono mr-1">Tags:</span>
            <button
              type="button"
              onClick={() => setSelectedTag('')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                !selectedTag
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.08]'
              }`}
            >
              Todas
            </button>
            {tagsDisponiveis.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTag(selectedTag === t ? '' : t)}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-all cursor-pointer ${
                  selectedTag === t
                    ? 'bg-[#4d7c0f] text-white dark:bg-[#84cc16] dark:text-zinc-950 font-bold'
                    : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.08]'
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FORMULÁRIO DE NOVA SOLUÇÃO OU LISTAGEM */}
      {isNovaSolucaoOpen ? (
        <form onSubmit={handleSalvarSolucao} className="space-y-5 p-6 sm:p-7 rounded-3xl border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] shadow-sm">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
            <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <LightBulbIcon className="w-4 h-4 text-emerald-600" />
              <span>Catalogar Novo Procedimento Técnico</span>
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
                className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
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
                className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                Categoria do Suporte
              </label>
              <select
                value={novoTipo}
                onChange={(e) => setNovoTipo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
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
                placeholder="Ex: Ocorre quando a instância perde a sessão ou o aparelho do cliente reiniciou"
                className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
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
                placeholder="1. Acessar o Manager do Servidor \n2. Clicar em Reiniciar Instância \n3. Aguardar 10s e escanear o novo QR Code gerado"
                required
                className="w-full p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 leading-relaxed"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                Tags Separadas por Vírgula (Opcional)
              </label>
              <input
                type="text"
                value={novasTags}
                onChange={(e) => setNovasTags(e.target.value)}
                placeholder="qrcode, reconexao, evolution, timeout"
                className="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => setIsNovaSolucaoOpen(false)}
              className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
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
        </form>
      ) : (
        <div className="space-y-6">
          {/* 1. SEÇÃO ESPECÍFICA DA EMPRESA ATUAL */}
          {empresa?.id && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-zinc-200">
                <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]"></span>
                <span>Soluções Específicas de {empresa.nome} ({solucoesDestaEmpresa.length})</span>
              </div>

              {solucoesDestaEmpresa.length === 0 ? (
                <div className="p-6 rounded-3xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-slate-400 bg-white dark:bg-[#16161a]">
                  Nenhuma solução cadastrada especificamente para {empresa.nome} com este filtro.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {solucoesDestaEmpresa.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-3xl p-5 border border-emerald-500/25 dark:border-emerald-500/20 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] space-y-3 relative group flex flex-col justify-between shadow-xs"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {s.erro_codigo && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-bold">
                                  {s.erro_codigo}
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300 font-semibold">
                                {s.tipo_erro}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                              {s.titulo}
                            </h4>
                            {s.contexto && (
                              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 italic">
                                {s.contexto}
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => setSolucaoParaExcluir(s)}
                            className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Excluir Solução"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-4 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.06] dark:border-white/[0.08] text-xs font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed shadow-xs">
                          {s.solucao_passos}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-black/[0.04] dark:border-white/[0.06] text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] text-slate-400">
                          {s.tags && s.tags.map((t, idx) => (
                            <span key={idx}>#{t}</span>
                          ))}
                        </div>
                        <button
                          onClick={() => handleCopyPassos(s.id, s.solucao_passos)}
                          className="px-2.5 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.08] text-[10px] font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer flex items-center gap-1"
                        >
                          {copiedId === s.id ? (
                            <>
                              <CheckIcon className="w-3 h-3 text-emerald-600" />
                              <span>Copiado!</span>
                            </>
                          ) : (
                            <span>Copiar Passos</span>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. SEÇÃO BANCO GERAL */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-zinc-200 border-t border-black/[0.05] dark:border-white/[0.06] pt-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>Banco Geral de Soluções ({solucoesBancoGeral.length})</span>
              </div>
              {empresa?.id && (
                <span className="text-[10px] font-normal text-slate-400">
                  (Procedimentos aplicáveis a qualquer empresa)
                </span>
              )}
            </div>

            {solucoesBancoGeral.length === 0 ? (
              <div className="p-8 rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#16161a] text-center space-y-3 shadow-xs">
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Nenhuma solução encontrada no banco geral para os termos pesquisados.
                </p>
                <button
                  onClick={() => setIsNovaSolucaoOpen(true)}
                  className="px-4 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <LightBulbIcon className="w-3.5 h-3.5" />
                  <span>Cadastrar a primeira solução</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {solucoesBancoGeral.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-3 relative group flex flex-col justify-between shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {s.erro_codigo && (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 font-mono text-[10px] font-bold">
                                {s.erro_codigo}
                              </span>
                            )}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300 font-semibold">
                              {s.tipo_erro}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              • {s.empresa_nome || 'Global'}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                            {s.titulo}
                          </h4>
                          {s.contexto && (
                            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 italic">
                              {s.contexto}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => setSolucaoParaExcluir(s)}
                          className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Excluir Solução"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-black/[0.05] dark:border-white/[0.06] text-xs font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed shadow-xs">
                        {s.solucao_passos}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-black/[0.04] dark:border-white/[0.06] text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] text-slate-400">
                        {s.tags && s.tags.map((t, idx) => (
                          <span key={idx}>#{t}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => handleCopyPassos(s.id, s.solucao_passos)}
                        className="px-2.5 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.08] text-[10px] font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer flex items-center gap-1"
                      >
                        {copiedId === s.id ? (
                          <>
                            <CheckIcon className="w-3 h-3 text-emerald-600" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <span>Copiar Passos</span>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      <ConfirmModal
        isOpen={Boolean(solucaoParaExcluir)}
        title="Excluir Solução?"
        message={`Deseja realmente remover a solução "${solucaoParaExcluir?.titulo}" da Base de Conhecimento?`}
        confirmText="Sim, Excluir"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleConfirmarExclusao}
        onCancel={() => setSolucaoParaExcluir(null)}
      />
    </div>
  );
}
