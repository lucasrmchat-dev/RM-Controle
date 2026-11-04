'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ACOES_PRAZO, PRAZOS_PEDIDO } from '@/lib/pedidosTratativa';

/**
 * O gestor pede que o responsável trate a demanda: mensagem opcional, prazo e o que fazer se o prazo vencer.
 * onEnviar({ mensagem, prazo_minutos, acao_prazo }) devolve uma Promise (erro sobe para o texto vermelho).
 */
export default function PedirTratativaModal({ chamado, responsavel, onFechar, onEnviar }) {
  const [mensagem, setMensagem] = useState('');
  const [prazo, setPrazo] = useState('1d');
  const [acao, setAcao] = useState('cancelar');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  // Sobre a tela toda, no centro (fora da página, que rola), sem rolagem por trás; Esc fecha
  useEffect(() => {
    const html = document.documentElement;
    const antes = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const esc = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => {
      [html.style.overflow, document.body.style.overflow] = antes;
      window.removeEventListener('keydown', esc);
    };
  }, [onFechar]);
  const minutos = PRAZOS_PEDIDO.find((p) => p.id === prazo)?.minutos || null;

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      await onEnviar({ mensagem: mensagem.trim(), prazo_minutos: minutos, acao_prazo: minutos ? acao : null });
    } catch (err) {
      setErro(err?.message || 'Não foi possível enviar o pedido.');
      setEnviando(false);
    }
  };

  const pilula = (ativa) => `h-9 px-3.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors ${ativa ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' : 'bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200'}`;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onFechar()} role="dialog" aria-modal="true" aria-label="Pedir tratativa">
      <motion.form
        onSubmit={enviar}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="w-full max-w-lg my-auto rounded-[28px] bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.06] dark:ring-white/10 shadow-2xl p-6 sm:p-7 text-[#1d1d1f] dark:text-white"
      >
        <h3 className="text-[19px] font-semibold tracking-tight">Pedir tratativa</h3>
        <p className="mt-1 text-[13.5px] text-slate-500 dark:text-zinc-400">
          {chamado.empresa_nome} está com <strong className="font-semibold text-[#1d1d1f] dark:text-white">{responsavel || 'outra pessoa'}</strong>. Ela será avisada e vai concluir, cancelar, colocar em espera ou explicar.
        </p>

        <label className="mt-5 block text-[12.5px] font-medium text-slate-500 dark:text-zinc-400">Recado (opcional)</label>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Ex.: o cliente já confirmou que resolveu, pode concluir?"
          className="mt-1.5 w-full rounded-2xl px-4 py-3 text-[14px] bg-black/[0.03] dark:bg-white/[0.06] ring-1 ring-black/[0.08] dark:ring-white/[0.12] outline-none focus:ring-2 focus:ring-rm-acento-medio resize-none"
        />

        <p className="mt-5 text-[12.5px] font-medium text-slate-500 dark:text-zinc-400">Prazo para responder</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PRAZOS_PEDIDO.map((p) => (
            <button key={p.id} type="button" onClick={() => setPrazo(p.id)} className={pilula(prazo === p.id)}>
              {p.rotulo}
            </button>
          ))}
        </div>

        {minutos && (
          <>
            <p className="mt-5 text-[12.5px] font-medium text-slate-500 dark:text-zinc-400">Se o prazo vencer sem resposta</p>
            <div className="mt-1.5 grid sm:grid-cols-2 gap-2">
              {ACOES_PRAZO.map((a) => (
                <button key={a.id} type="button" onClick={() => setAcao(a.id)} className={`text-left rounded-2xl p-3.5 ring-1 cursor-pointer transition-colors ${acao === a.id ? 'ring-2 ring-[#1d1d1f] dark:ring-white' : 'ring-black/[0.1] dark:ring-white/[0.14] hover:ring-black/30 dark:hover:ring-white/30'}`}>
                  <span className="block text-[14px] font-semibold">{a.rotulo}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 dark:text-zinc-400">{a.descricao}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {erro && <p className="mt-4 text-[13px] text-rose-600 dark:text-rose-400">{erro}</p>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onFechar} className="h-11 px-5 rounded-full text-[14px] font-medium bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15 cursor-pointer">
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className="h-11 px-6 rounded-full text-[14px] font-semibold bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] cursor-pointer disabled:opacity-60">
            {enviando ? 'Enviando…' : 'Pedir tratativa'}
          </button>
        </div>
      </motion.form>
    </div>,
    document.body
  );
}
