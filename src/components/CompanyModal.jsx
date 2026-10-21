'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { removerAcentos } from '@/lib/storage';
import NovaEmpresaCampos, { dadosNovaEmpresaIniciais } from './NovaEmpresaCampos';

export default function CompanyModal({ isOpen, onClose, onCreated, initialNome = '', empresasExistentes = [] }) {
  const [nome, setNome] = useState(initialNome || '');
  const [dados, setDados] = useState(dadosNovaEmpresaIniciais);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const nomeInputRef = React.useRef(null);

  React.useEffect(() => {
    if (isOpen) {
      setNome(initialNome || '');
      setErrorMsg('');
      setDados(dadosNovaEmpresaIniciais());
      const timer = setTimeout(() => {
        if (nomeInputRef.current) {
          nomeInputRef.current.focus();
          const len = (initialNome || '').length;
          nomeInputRef.current.setSelectionRange(len, len);
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialNome]);

  const isNomeDuplicado = Boolean(
    nome.trim() &&
    (empresasExistentes || []).some(
      (emp) => removerAcentos((emp.nome || '').toLowerCase().trim()) === removerAcentos(nome.trim().toLowerCase())
    )
  );

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErrorMsg('Por favor, informe o nome da empresa.');
      return;
    }
    if (isNomeDuplicado) {
      setErrorMsg(`A empresa "${nomeLimpo}" já está cadastrada no sistema. Por favor, utilize um nome diferente.`);
      return;
    }
    if (!dados.tipo_cliente) {
      setErrorMsg('Informe se é um cliente novo ou um cliente que já existia antes do RM Controle.');
      return;
    }

    try {
      setLoading(true);
      await onCreated({
        tipo: 'manual',
        nome: nomeLimpo,
        servidor_alocado: dados.servidor_alocado,
        tipo_cliente: dados.tipo_cliente,
        cliente_desde: dados.cliente_desde,
        email_administrador: dados.email_administrador.trim(),
        senha_suporte: dados.senha_suporte.trim(),
      });
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao cadastrar empresa.');
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
          className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-black/[0.08] dark:border-white/[0.1] bg-white/95 dark:bg-[#1e1e21]/95 backdrop-blur-3xl p-6 sm:p-8 shadow-2xl relative text-[#1d1d1f] dark:text-[#f5f5f7]"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 border border-[#4d7c0f]/20 flex items-center justify-center text-[#4d7c0f] dark:text-[#84cc16]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                <path d="M9 22v-4h6v4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-white">Cadastrar Empresa</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Informe os dados iniciais do cliente.</p>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="cadastro-empresa-nome" className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                Nome da Empresa <span className="text-red-500">*</span>
              </label>
              <input
                id="cadastro-empresa-nome"
                ref={nomeInputRef}
                type="text"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Ex: Comercial Ramos & Filhos"
                required
                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 text-[#1d1d1f] dark:text-white"
              />
              {isNomeDuplicado && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium pl-1">
                  Já existe uma empresa cadastrada com este nome.
                </p>
              )}
            </div>

            <NovaEmpresaCampos
              valor={dados}
              idPrefixo="cadastro-empresa"
              onChange={(v) => {
                setDados(v);
                setErrorMsg('');
              }}
            />

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-black/[0.05] dark:border-white/[0.09]">
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
