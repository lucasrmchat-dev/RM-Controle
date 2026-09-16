'use client';

import React, { useState } from 'react';
import { generateSecurePassword } from '@/lib/security';
import { getSenhaPadraoRedefinicao } from '@/lib/storage';

export default function CompanyModal({ isOpen, onClose, onCreated }) {
  const [mode, setMode] = useState('manual'); // 'manual' | 'massa'
  const [nome, setNome] = useState('');
  const [formato, setFormato] = useState('colaborativo'); // 'colaborativo' | 'individual'
  const [servidor, setServidor] = useState('servidor_1'); // 'servidor_1' | 'servidor_2'
  const [adminEmail, setAdminEmail] = useState('');
  const [senhaSuporte, setSenhaSuporte] = useState('');
  const [massaTexto, setMassaTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleGerarSenha = () => {
    setSenhaSuporte(generateSecurePassword(14));
  };

  const parseMassaNomes = () => {
    return massaTexto
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
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
        formato_atendimento: formato,
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
    const nomes = parseMassaNomes();
    if (nomes.length === 0) {
      setErrorMsg('Cole ou digite ao menos o nome de uma empresa (um por linha).');
      return;
    }

    try {
      setLoading(true);
      await onCreated({
        tipo: 'massa',
        nomes,
        formato_atendimento: formato,
        servidor_alocado: servidor,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao cadastrar empresas em lote.');
    } finally {
      setLoading(false);
    }
  };

  const empresasDetectadas = parseMassaNomes();

  return (
    <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] p-6 sm:p-7 shadow-2xl relative text-slate-900 dark:text-zinc-100">
        
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Título & Descrição */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-700 dark:text-zinc-200">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
              <path d="M9 22v-4h6v4"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Cadastrar Empresa</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Adicione individualmente ou faça a importação em lote para o sistema.
            </p>
          </div>
        </div>

        {/* Alternador de Modo: Manual vs Em Massa */}
        <div className="flex p-1 bg-slate-100 dark:bg-zinc-900 rounded-xl border border-slate-200/80 dark:border-zinc-800 mb-5">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === 'manual'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Cadastro Manual
          </button>
          <button
            type="button"
            onClick={() => setMode('massa')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === 'massa'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Cadastro em Massa
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Formulário Manual */}
        {mode === 'manual' && (
          <form onSubmit={handleSaveManual} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Nome da Empresa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Comercial Ramos & Filhos"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-none"
              />
            </div>

            {/* Classificação de Servidor (Servidor 1 vs Servidor 2) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Servidor Alocado
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setServidor('servidor_1')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    servidor === 'servidor_1'
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7] dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                      : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold">Servidor 1</span>
                    {servidor === 'servidor_1' && <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">Cluster primário</p>
                </button>

                <button
                  type="button"
                  onClick={() => setServidor('servidor_2')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    servidor === 'servidor_2'
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7] dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                      : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold">Servidor 2</span>
                    {servidor === 'servidor_2' && <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">Cluster de expansão</p>
                </button>
              </div>
            </div>

            {/* Formato de Atendimento */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Formato de Conversa com Clientes
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormato('colaborativo')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    formato === 'colaborativo'
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7] dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                      : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">Colaborativo</span>
                    {formato === 'colaborativo' && <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                    Fila única compartilhada entre os atendentes.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormato('individual')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    formato === 'individual'
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7] dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                      : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">Individual</span>
                    {formato === 'individual' && <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                    Cada atendente opera sua própria carteira isolada.
                  </p>
                </button>
              </div>
            </div>

            {/* Credenciais Iniciais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  E-mail do Administrador
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@empresa.com.br"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Senha de Suporte
                  </label>
                  <button
                    type="button"
                    onClick={handleGerarSenha}
                    className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline"
                  >
                    ⚡ Gerar Senha
                  </button>
                </div>
                <input
                  type="text"
                  value={senhaSuporte}
                  onChange={(e) => setSenhaSuporte(e.target.value)}
                  placeholder="Deixe em branco para usar padrão"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-700 text-xs font-mono focus:outline-none"
                />
              </div>
            </div>

            {/* Ações do Formulário */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
              >
                {loading ? 'Cadastrando...' : 'Cadastrar Empresa'}
              </button>
            </div>
          </form>
        )}

        {/* Formulário Em Massa */}
        {mode === 'massa' && (
          <form onSubmit={handleSaveMassa} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Lista de Empresas (um nome por linha)
              </label>
              <textarea
                rows={6}
                value={massaTexto}
                onChange={(e) => setMassaTexto(e.target.value)}
                placeholder={"Padaria Central\nAuto Peças Estrela\nClínica Sorriso Aberto"}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-none font-mono"
              />
              <div className="flex justify-between items-center mt-1">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {empresasDetectadas.length} {empresasDetectadas.length === 1 ? 'empresa detectada' : 'empresas detectadas'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Servidor Alocado
                </label>
                <select
                  value={servidor}
                  onChange={(e) => setServidor(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                >
                  <option value="servidor_1">Servidor 1 (Principal)</option>
                  <option value="servidor_2">Servidor 2 (Expansão)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Formato Padrão
                </label>
                <select
                  value={formato}
                  onChange={(e) => setFormato(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                >
                  <option value="colaborativo">Colaborativo</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || empresasDetectadas.length === 0}
                className="px-5 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {loading ? 'Importando...' : `Importar ${empresasDetectadas.length} Empresas`}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
