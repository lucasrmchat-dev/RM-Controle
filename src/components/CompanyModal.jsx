'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateSecurePassword } from '@/lib/security';
import { getSenhaPadraoRedefinicao } from '@/lib/storage';
import { CheckIcon, SparklesIcon, XMarkIcon } from './Icons';

export default function CompanyModal({ isOpen, onClose, onCreated }) {
  const [mode, setMode] = useState('manual'); // 'manual' | 'massa'
  const [nome, setNome] = useState('');
  const [servidor, setServidor] = useState('servidor_1'); // 'servidor_1' | 'servidor_2'
  const [adminEmail, setAdminEmail] = useState('');
  const [senhaSuporte, setSenhaSuporte] = useState('');
  const [massaTexto, setMassaTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  if (!isOpen) return null;

  const handleGerarSenha = () => {
    setSenhaSuporte(generateSecurePassword(14));
  };

  // Parser inteligente de linhas em lote: suporta pipe (|), ponto e vírgula (;), tabulação (\t) ou vírgula (,)
  const parseMassaLinhas = () => {
    return massaTexto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0)
      .map((linha) => {
        let parts = [];
        if (linha.includes('|')) {
          parts = linha.split('|').map((p) => p.trim());
        } else if (linha.includes(';')) {
          parts = linha.split(';').map((p) => p.trim());
        } else if (linha.includes('\t')) {
          parts = linha.split('\t').map((p) => p.trim());
        } else if (linha.includes(',')) {
          parts = linha.split(',').map((p) => p.trim());
        } else {
          parts = [linha.trim()];
        }

        const nomeEmpresa = parts[0] || '';
        let emailEmpresa = '';
        let senhaEmpresa = '';

        if (parts.length >= 2) {
          if (parts[1].includes('@')) {
            emailEmpresa = parts[1];
            senhaEmpresa = parts[2] || '';
          } else {
            // Caso tenham invertido ou passado senha na 2ª coluna
            emailEmpresa = parts[1];
            senhaEmpresa = parts[2] || '';
          }
        }

        return {
          nome: nomeEmpresa,
          email_administrador: emailEmpresa,
          senha_suporte: senhaEmpresa,
        };
      })
      .filter((item) => item.nome.length > 0);
  };

  const empresasDetectadas = parseMassaLinhas();
  const totalComEmail = empresasDetectadas.filter((e) => e.email_administrador).length;
  const totalComSenha = empresasDetectadas.filter((e) => e.senha_suporte).length;

  const AI_PROMPT_TEMPLATE = `Formate a lista de empresas a seguir para importar no sistema RM Controle.
Gere estritamente uma empresa por linha, utilizando o caractere pipe "|" como separador no seguinte formato:
Nome da Empresa | Email do Administrador | Senha de Suporte

Regras obrigatórias:
1. Caso não saiba o e-mail ou a senha de alguma empresa, mantenha o separador ou deixe em branco (o sistema gerará automaticamente).
2. Não inclua numeração, marcadores de lista (- ou *), cabeçalhos ou mensagens introdutórias.
3. Apenas retorne as linhas formatadas.

Exemplo de formato esperado:
Padaria Central | admin@padariacentral.com.br | SenhaSuporte123
Auto Peças Estrela | contato@estrela.com.br | Estrela@2026
Clínica Sorriso Aberto | contato@sorriso.com.br | Clinica@123
Supermercado União | |

Aqui está a lista de empresas bruta:
[COLE SUA LISTA AQUI]`;

  const handleCopyAiPrompt = () => {
    navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleSaveManual = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!nome.trim()) {
      setErrorMsg('Por favor, informe o nome da empresa.');
      return;
    }

    try {
      setLoading(true);
      await onCreated({
        tipo: 'manual',
        nome: nome.trim(),
        servidor_alocado: servidor,
        email_administrador: adminEmail.trim(),
        senha_suporte: senhaSuporte.trim() || getSenhaPadraoRedefinicao(),
      });
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao cadastrar empresa.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMassa = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (empresasDetectadas.length === 0) {
      setErrorMsg('Cole ou digite ao menos o nome de uma empresa (uma por linha).');
      return;
    }

    try {
      setLoading(true);
      await onCreated({
        tipo: 'massa',
        empresas: empresasDetectadas,
        servidor_alocado: servidor,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao cadastrar empresas em lote.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-black/[0.08] dark:border-white/[0.1] bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-3xl p-6 sm:p-8 shadow-2xl relative text-[#1d1d1f] dark:text-[#f5f5f7]"
        >
          {/* Botão Fechar Estilo Apple */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Título & Descrição */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 border border-[#4d7c0f]/20 flex items-center justify-center text-[#4d7c0f] dark:text-[#84cc16]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                <path d="M9 22v-4h6v4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-white">Cadastrar Empresa</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Adicione individualmente ou faça a importação em lote para o sistema.
              </p>
            </div>
          </div>

          {/* Alternador de Modo: Manual vs Em Massa (Apple Segmented Control) */}
          <div className="flex p-1 bg-black/[0.03] dark:bg-white/[0.05] rounded-2xl border border-black/[0.04] dark:border-white/[0.06] mb-5">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Cadastro Individual
            </button>
            <button
              type="button"
              onClick={() => setMode('massa')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mode === 'massa'
                  ? 'bg-white dark:bg-zinc-800 text-[#1d1d1f] dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Importação em Massa
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Formulário Individual */}
          {mode === 'manual' && (
            <form onSubmit={handleSaveManual} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                  Nome da Empresa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Comercial Ramos & Filhos"
                  required
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 text-[#1d1d1f] dark:text-white"
                />
              </div>

              {/* Classificação de Servidor (Servidor 1 vs Servidor 2) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                  Servidor Alocado
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setServidor('servidor_1')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      servidor === 'servidor_1'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white shadow-xs'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold">Servidor 1</span>
                      {servidor === 'servidor_1' && <CheckIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">Cluster primário</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setServidor('servidor_2')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      servidor === 'servidor_2'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white shadow-xs'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold">Servidor 2</span>
                      {servidor === 'servidor_2' && <CheckIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">Cluster de expansão</p>
                  </button>
                </div>
              </div>

              {/* Credenciais Iniciais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                    E-mail do Administrador
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@empresa.com.br"
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between pl-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                      Senha de Suporte
                    </label>
                    <button
                      type="button"
                      onClick={handleGerarSenha}
                      className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <SparklesIcon className="w-3 h-3" />
                      <span>Gerar Senha</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={senhaSuporte}
                    onChange={(e) => setSenhaSuporte(e.target.value)}
                    placeholder="Deixe em branco para usar padrão"
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none"
                  />
                </div>
              </div>

              {/* Ações do Formulário */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-black/[0.05] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {loading ? 'Cadastrando...' : 'Cadastrar Empresa'}
                </motion.button>
              </div>
            </form>
          )}

          {/* Formulário Em Massa */}
          {mode === 'massa' && (
            <form onSubmit={handleSaveMassa} className="space-y-4">
              {/* Card Educativo com Exemplo de Formatação & Prompt para IA */}
              <div className="p-3.5 rounded-2xl bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 border border-[#4d7c0f]/20 dark:border-[#84cc16]/25 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💡</span>
                    <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                      Formato por linha: <span className="font-mono text-[#4d7c0f] dark:text-[#84cc16]">Nome | Email | Senha</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyAiPrompt}
                    className="px-2.5 py-1 rounded-xl bg-white dark:bg-zinc-800 border border-black/[0.08] dark:border-white/[0.1] text-[11px] font-semibold text-[#4d7c0f] dark:text-[#84cc16] hover:bg-black/[0.02] dark:hover:bg-white/[0.05] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="Copiar prompt pronto para formatar no ChatGPT ou Claude"
                  >
                    {copiedPrompt ? (
                      <>
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-700 dark:text-emerald-400">Prompt Copiado!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copiar Prompt para IA</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                  Cole uma lista gerada por IA ou digite as empresas. Se omitir o e-mail ou a senha, o sistema cria credenciais padrão automaticamente.
                </p>

                <div className="p-2 rounded-xl bg-black/[0.04] dark:bg-black/30 font-mono text-[10px] text-slate-600 dark:text-zinc-300 leading-tight select-all">
                  Padaria Central | admin@padariacentral.com.br | Senha@123<br />
                  Auto Peças Estrela | contato@estrela.com.br | Estrela#2026<br />
                  Clínica Sorriso | admin@clinicasorriso.com.br | Suporte@456
                </div>
              </div>

              {/* Área de Texto da Importação */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                  Lista de Empresas para Cadastro
                </label>
                <textarea
                  rows={6}
                  value={massaTexto}
                  onChange={(e) => setMassaTexto(e.target.value)}
                  placeholder={`Padaria Central | admin@padariacentral.com.br | Senha@123\nAuto Peças Estrela | contato@estrela.com.br | Estrela#2026\nClínica Sorriso Aberto | contato@sorriso.com.br | Clinica@123\nSupermercado União`}
                  className="w-full px-4 py-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-mono text-[#1d1d1f] dark:text-white"
                />

                {/* Contadores e badges de detecção */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 px-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300">
                      {empresasDetectadas.length} {empresasDetectadas.length === 1 ? 'empresa detectada' : 'empresas detectadas'}
                    </span>
                    {totalComEmail > 0 && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                        {totalComEmail} com e-mail
                      </span>
                    )}
                    {totalComSenha > 0 && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        {totalComSenha} com senha personalizada
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Servidor Alocado */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                  Servidor Alocado para o Lote
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setServidor('servidor_1')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      servidor === 'servidor_1'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white shadow-xs'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold">Servidor 1</span>
                      {servidor === 'servidor_1' && <CheckIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">Cluster primário</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setServidor('servidor_2')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      servidor === 'servidor_2'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white shadow-xs'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold">Servidor 2</span>
                      {servidor === 'servidor_2' && <CheckIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">Cluster de expansão</p>
                  </button>
                </div>
              </div>

              {/* Ações do Formulário Em Massa */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-black/[0.05] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading || empresasDetectadas.length === 0}
                  className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {loading ? 'Importando...' : `Importar ${empresasDetectadas.length} Empresas`}
                </motion.button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
