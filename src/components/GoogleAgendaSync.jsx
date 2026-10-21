'use client';

import React, { useEffect, useState } from 'react';
import { statusGoogleAgenda, desconectarGoogleAgenda, sincronizarGoogleAgenda, URL_CONECTAR_GOOGLE_AGENDA } from '@/lib/storage';
import { showToast } from './ToastNotification';
import ConfirmModal from './ConfirmModal';

const formatar = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : 'nunca';

const IconeGoogleAgenda = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4" />
  </svg>
);

/** Botão que leva para a autorização do Google (navegação comum: o servidor redireciona). */
export function BotaoConectarGoogle({ className = '' }) {
  return (
    <a
      href={URL_CONECTAR_GOOGLE_AGENDA}
      className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90 transition-opacity ${className}`}
    >
      <IconeGoogleAgenda />
      Conectar Google Agenda
    </a>
  );
}

/**
 * Sincronização com o Google Agenda: cada pessoa conecta a própria conta.
 * Mostra a minha conexão, quem da equipe já conectou e permite sincronizar agora.
 */
export default function GoogleAgendaSync() {
  const [st, setSt] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const carregar = async () => setSt(await statusGoogleAgenda());

  useEffect(() => {
    carregar();
  }, []);

  if (!st) return <div className="h-40 rounded-3xl bg-black/[0.03] dark:bg-white/[0.04] animate-pulse" />;

  const sincronizarAgora = async () => {
    setSincronizando(true);
    const r = await sincronizarGoogleAgenda({ forcar: true });
    setSincronizando(false);
    if (!r?.ok) showToast(r?.mensagem || 'Não foi possível sincronizar.', 'error');
    else showToast('Agenda sincronizada com o Google.', 'success');
    await carregar();
  };

  const desconectar = async () => {
    try {
      await desconectarGoogleAgenda();
      showToast('Google Agenda desconectado. Seus eventos não serão mais sincronizados.', 'info');
      await carregar();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setConfirmar(false);
    }
  };

  const minha = st.minha_conta;
  const outras = (st.contas || []).filter((c) => c.email_sistema !== minha?.email_sistema);

  return (
    <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] space-y-5 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-[#1d1d1f] dark:text-white">Sincronização com o Google Agenda</h3>
        <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
          Conecte a sua conta Google: o que for criado, editado ou excluído aqui vai para a sua agenda, e o que mudar lá aparece aqui.
        </p>
      </div>

      {!st.configurado ? (
        <div className="rounded-2xl bg-amber-500/[0.08] ring-1 ring-amber-500/20 p-4 text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
          A conexão com o Google ainda não foi ativada no servidor. Um administrador precisa criar o ID do cliente OAuth no Google Cloud e adicionar{' '}
          <code className="font-mono text-[12px]">GOOGLE_OAUTH_CLIENT_ID</code> e <code className="font-mono text-[12px]">GOOGLE_OAUTH_CLIENT_SECRET</code> na Vercel.
        </div>
      ) : (
        <>
          {/* Minha conexão */}
          <div className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            {minha ? (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    Conectado como {minha.email_google}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    Última sincronização: {formatar(st.ultima_sincronizacao)} · Mudanças do Google {st.avisos_em_tempo_real ? 'em tempo real' : 'ao abrir a Agenda'}
                  </p>
                  {st.meu_erro && <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-1">{st.meu_erro}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={sincronizarAgora}
                    disabled={sincronizando}
                    className="h-9 px-3.5 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 cursor-pointer"
                  >
                    {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
                  </button>
                  {st.meu_erro && <BotaoConectarGoogle className="!h-9" />}
                  <button type="button" onClick={() => setConfirmar(true)} className="h-9 px-3 rounded-full text-[13px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer">
                    Desconectar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13.5px] text-slate-600 dark:text-zinc-300 flex-1">Sua agenda Google ainda não está conectada.</p>
                <BotaoConectarGoogle />
              </>
            )}
          </div>

          {/* Equipe */}
          {outras.length > 0 && (
            <div>
              <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Também conectados</p>
              <ul className="flex flex-wrap gap-2">
                {outras.map((c) => (
                  <li key={c.email_sistema} className="h-8 px-3 rounded-full bg-black/[0.04] dark:bg-white/[0.07] text-[12.5px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {c.nome || c.email_sistema}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        isOpen={confirmar}
        title="Desconectar o Google Agenda?"
        message="Seus eventos param de sincronizar. O que já está aqui e no Google continua onde está."
        confirmText="Desconectar"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={desconectar}
        onClose={() => setConfirmar(false)}
      />
    </div>
  );
}
