'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon } from './Icons';

export const hojeIso = () => new Date().toISOString().slice(0, 10);

/** Valores iniciais dos dados de cadastro de uma empresa nova. */
export function dadosNovaEmpresaIniciais() {
  return {
    servidor_alocado: 'servidor_1',
    tipo_cliente: '',
    cliente_desde: hojeIso(),
    email_administrador: '',
    senha_suporte: '',
  };
}

// Campo de texto legível (contraste AA nos dois temas) — compartilhado pelos formulários de cadastro
export const classeCampo =
  'w-full h-11 px-3.5 rounded-xl text-sm text-[#1d1d1f] dark:text-white bg-white dark:bg-white/[0.06] ' +
  'border border-black/[0.14] dark:border-white/[0.16] placeholder:text-slate-400 dark:placeholder:text-zinc-500 ' +
  'transition-[border-color,box-shadow] hover:border-black/25 dark:hover:border-white/25 ' +
  'focus:outline-none focus:border-[#4d7c0f] dark:focus:border-[#84cc16] focus:ring-4 focus:ring-[#4d7c0f]/10 dark:focus:ring-[#84cc16]/10';

export const classeRotulo = 'block text-[13px] font-medium text-[#1d1d1f]/80 dark:text-white/80 mb-1.5';

function Opcao({ ativo, titulo, desc, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={`relative p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
        ativo
          ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/[0.07] dark:bg-[#84cc16]/[0.08] ring-1 ring-[#4d7c0f]/30 dark:ring-[#84cc16]/30'
          : 'border-black/[0.12] dark:border-white/[0.14] bg-white dark:bg-white/[0.03] hover:border-black/25 dark:hover:border-white/25'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white">{titulo}</span>
        <span
          className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            ativo ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950' : 'border border-black/20 dark:border-white/25'
          }`}
        >
          {ativo && <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />}
        </span>
      </span>
      {desc && <span className="block mt-1 text-xs leading-snug text-slate-500 dark:text-zinc-400">{desc}</span>}
    </button>
  );
}

/**
 * Campos de cadastro de empresa nova: servidor, tipo de cliente (+ data, só para cliente novo)
 * e acesso do administrador (opcional). `onChange` recebe uma função de atualização (como o setState).
 */
export default function NovaEmpresaCampos({ valor, onChange, idPrefixo = 'nova-empresa' }) {
  // Atualização funcional: duas mudanças seguidas nunca sobrescrevem uma à outra
  const set = (campo, v) => onChange((anterior) => ({ ...anterior, [campo]: v }));
  const hoje = hojeIso();

  return (
    <div className="space-y-5">
      <div>
        <span id={`${idPrefixo}-servidor`} className={classeRotulo}>Servidor</span>
        <div role="radiogroup" aria-labelledby={`${idPrefixo}-servidor`} className="grid grid-cols-2 gap-2.5">
          <Opcao ativo={valor.servidor_alocado === 'servidor_1'} titulo="Servidor 1" onClick={() => set('servidor_alocado', 'servidor_1')} />
          <Opcao ativo={valor.servidor_alocado === 'servidor_2'} titulo="Servidor 2" onClick={() => set('servidor_alocado', 'servidor_2')} />
        </div>
      </div>

      <div>
        <span id={`${idPrefixo}-tipo`} className={classeRotulo}>
          Tipo de cliente <span className="text-red-600 dark:text-red-400">*</span>
        </span>
        <div role="radiogroup" aria-labelledby={`${idPrefixo}-tipo`} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Opcao
            ativo={valor.tipo_cliente === 'novo'}
            titulo="Cliente novo"
            desc="A implantação começa agora."
            onClick={() => set('tipo_cliente', 'novo')}
          />
          <Opcao
            ativo={valor.tipo_cliente === 'existente'}
            titulo="Já era cliente"
            desc="Só está entrando no RM Controle. Checklists ficam concluídos."
            onClick={() => set('tipo_cliente', 'existente')}
          />
        </div>

        {/* Data só faz sentido para cliente novo */}
        <AnimatePresence initial={false}>
          {valor.tipo_cliente === 'novo' && (
            <motion.div
              key="data"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <label className="flex items-center justify-between gap-3 pt-3">
                <span className="text-[13px] font-medium text-[#1d1d1f]/80 dark:text-white/80">Data de cadastro</span>
                <input
                  type="date"
                  value={valor.cliente_desde}
                  max={hoje}
                  onChange={(e) => set('cliente_desde', e.target.value || hoje)}
                  className={`${classeCampo} w-auto h-10 font-mono text-[13px]`}
                />
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#1d1d1f]/80 dark:text-white/80">
          Acesso do administrador <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
        </p>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 mb-2.5">
          Fica em Acessos e Senhas da empresa. Em branco, nada é cadastrado.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            id={`${idPrefixo}-email`}
            type="email"
            aria-label="E-mail do administrador"
            value={valor.email_administrador}
            onChange={(e) => set('email_administrador', e.target.value)}
            placeholder="E-mail"
            autoComplete="off"
            className={classeCampo}
          />
          <input
            id={`${idPrefixo}-senha`}
            type="text"
            aria-label="Senha de suporte"
            value={valor.senha_suporte}
            onChange={(e) => set('senha_suporte', e.target.value)}
            placeholder="Senha"
            autoComplete="off"
            spellCheck={false}
            className={`${classeCampo} font-mono`}
          />
        </div>
      </div>
    </div>
  );
}
