'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { excluirContratoEmpresa, fetchContratosEmpresa, salvarContratoEmpresa } from '@/lib/storage';
import { STATUS_CONTRATO_CLIENTE, formatarMoeda } from '@/lib/plataforma';
import { Spinner } from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';

const COR = {
  ativo: 'bg-[#4d7c0f]/12 text-[#4d7c0f] dark:text-[#a3e635]',
  em_negociacao: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  em_atraso: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
  encerrado: 'bg-black/[0.06] dark:bg-white/[0.1] text-slate-500 dark:text-zinc-400',
};
const VAZIO = { plano: '', valor_mensal: '', dia_vencimento: '', inicio: new Date().toISOString().slice(0, 10), renovacao: '', status: 'ativo', observacoes: '' };
const data = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—');

/** Contratos da empresa assinante com este cliente (plano, valor, vigência). Informação de negócio. */
export default function EmpresaContratos({ empresa, userEmail, podeEditar = true }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    fetchContratosEmpresa(empresa.id)
      .then((l) => {
        setLista(l);
        setErro('');
      })
      .catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
  }, [empresa.id]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarContratoEmpresa(empresa.id, form, userEmail);
      showToast('Contrato salvo.', 'success');
      setForm(null);
      carregar();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (c) => {
    try {
      await excluirContratoEmpresa(c.id);
      showToast('Contrato excluído.', 'success');
      carregar();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const ativo = (lista || []).find((c) => c.status === 'ativo');
  const campo = (id, rotulo, props = {}) => (
    <label className="block">
      <span className={classeRotulo}>{rotulo}</span>
      <input value={form[id] ?? ''} onChange={(e) => setForm({ ...form, [id]: e.target.value })} className={classeCampo} {...props} />
    </label>
  );

  return (
    <section className="rounded-3xl bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Contrato</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Plano, valor e vigência do que {empresa.nome} contratou com vocês.</p>
        </div>
        {podeEditar && !form && (
          <button type="button" onClick={() => setForm(ativo ? { ...VAZIO, plano: ativo.plano, valor_mensal: ativo.valor_mensal, dia_vencimento: ativo.dia_vencimento ?? '' } : VAZIO)} className="h-10 px-4 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[13px] font-semibold cursor-pointer">
            + Novo contrato
          </button>
        )}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          {erro}
        </p>
      )}

      <AnimatePresence initial={false}>
        {form && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.12] p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {campo('plano', 'Plano', { maxLength: 80, placeholder: 'Ex.: Atendimento Pro' })}
                {campo('valor_mensal', 'Valor mensal (R$)', { inputMode: 'decimal', placeholder: '0,00' })}
                {campo('dia_vencimento', 'Dia do vencimento', { type: 'number', min: 1, max: 28 })}
                {campo('inicio', 'Início', { type: 'date' })}
                {campo('renovacao', 'Renovação', { type: 'date' })}
                <label className="block">
                  <span className={classeRotulo}>Situação</span>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={`${classeCampo} cursor-pointer`}>
                    {Object.entries(STATUS_CONTRATO_CLIENTE).map(([id, rotulo]) => (
                      <option key={id} value={id}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className={classeRotulo}>Observações</span>
                <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} maxLength={1000} className={`${classeCampo} h-auto py-3 resize-none`} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setForm(null)} className="h-10 px-4 rounded-full text-[13px] font-medium cursor-pointer">
                  Cancelar
                </button>
                <button type="button" onClick={salvar} disabled={salvando || !form.plano?.trim()} className="h-10 px-4 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[13px] font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-2">
                  {salvando && <Spinner />}
                  Salvar contrato
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {lista === null && !erro ? (
        <div className="h-20 rounded-2xl animate-pulse bg-black/[0.04] dark:bg-white/[0.06]" />
      ) : lista?.length === 0 ? (
        <p className="text-[14px] text-slate-500 dark:text-zinc-400">Nenhum contrato registrado.</p>
      ) : (
        <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
          {(lista || []).map((c) => (
            <li key={c.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold">{c.plano}</span>
                  <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center ${COR[c.status]}`}>{STATUS_CONTRATO_CLIENTE[c.status]}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-zinc-400">
                  {formatarMoeda(c.valor_mensal)}/mês · desde {data(c.inicio)}
                  {c.renovacao ? ` · renova em ${data(c.renovacao)}` : ''}
                  {c.dia_vencimento ? ` · vence dia ${c.dia_vencimento}` : ''}
                </p>
                {c.observacoes && <p className="mt-1 text-[13px] text-slate-600 dark:text-zinc-300">{c.observacoes}</p>}
              </div>
              {podeEditar && (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setForm({ ...c, renovacao: c.renovacao || '' })} className="h-8 px-3 rounded-full text-[12.5px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] cursor-pointer">
                    Editar
                  </button>
                  <button type="button" onClick={() => excluir(c)} className="h-8 px-3 rounded-full text-[12.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/[0.08] cursor-pointer">
                    Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
