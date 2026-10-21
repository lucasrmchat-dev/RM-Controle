'use client';

import React, { useEffect, useState } from 'react';
import { statusGoogleAgenda, salvarContasGoogleAgenda, testarContaGoogleAgenda, sincronizarGoogleAgenda } from '@/lib/storage';
import { showToast } from './ToastNotification';

const formatar = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : 'nunca';

const campo =
  'w-full h-10 px-3 rounded-xl bg-white dark:bg-white/[0.04] ring-1 ring-black/[0.1] dark:ring-white/[0.12] focus:ring-2 focus:ring-[#4d7c0f]/30 outline-none text-[13px] text-[#1d1d1f] dark:text-white placeholder:text-slate-400';

/**
 * Sincronização com o Google Agenda: situação, vínculo de cada pessoa da equipe com a sua conta Google
 * (o login do sistema pode ser diferente do e-mail do Workspace) e sincronizar agora.
 */
export default function GoogleAgendaSync() {
  const [st, setSt] = useState(null);
  const [vinculos, setVinculos] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [testes, setTestes] = useState({});

  const carregar = async () => {
    const r = await statusGoogleAgenda();
    setSt(r);
    const mapa = {};
    (r?.contas || []).forEach((c) => {
      mapa[c.email_sistema] = c.email_google;
    });
    setVinculos(mapa);
  };

  useEffect(() => {
    carregar();
  }, []);

  if (!st) return <div className="h-40 rounded-3xl bg-black/[0.03] dark:bg-white/[0.04] animate-pulse" />;

  const pronto = st.configurado;
  const equipe = st.equipe || [];

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarContasGoogleAgenda(equipe.map((m) => ({ email_sistema: m.email, email_google: (vinculos[m.email] || '').trim() })));
      showToast('Contas vinculadas. Sincronizando…', 'success');
      await sincronizarAgora();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  const sincronizarAgora = async () => {
    setSincronizando(true);
    const r = await sincronizarGoogleAgenda({ forcar: true });
    setSincronizando(false);
    if (!r?.ok) showToast(r?.mensagem || 'Não foi possível sincronizar.', 'error');
    await carregar();
  };

  const testar = async (email) => {
    const g = (vinculos[email] || '').trim();
    if (!g) return;
    setTestes((t) => ({ ...t, [email]: 'testando' }));
    try {
      await testarContaGoogleAgenda(g);
      setTestes((t) => ({ ...t, [email]: 'ok' }));
    } catch (e) {
      setTestes((t) => ({ ...t, [email]: e.message }));
    }
  };

  return (
    <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] space-y-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1d1d1f] dark:text-white">Sincronização com o Google Agenda</h3>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            O que for criado, editado ou excluído aqui vai para o Google, e o que mudar no Google aparece aqui — nas agendas de toda a equipe.
          </p>
        </div>
        {pronto && (
          <button
            type="button"
            onClick={sincronizarAgora}
            disabled={sincronizando}
            className="h-10 px-4 rounded-full text-[13px] font-semibold ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 cursor-pointer flex-shrink-0"
          >
            {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>
        )}
      </div>

      {!pronto ? (
        <div className="rounded-2xl bg-amber-500/[0.08] ring-1 ring-amber-500/20 p-4 text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
          A conta de serviço do Google ainda não está configurada no servidor. Depois de criar a credencial no Google Cloud, adicione a variável{' '}
          <code className="font-mono text-[12px]">GOOGLE_SERVICE_ACCOUNT_JSON</code> no painel da Vercel e publique novamente.
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
            <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] p-3.5">
              <dt className="text-slate-500 dark:text-zinc-400">Última sincronização</dt>
              <dd className="font-medium mt-0.5">{formatar(st.ultima_sincronizacao)}</dd>
            </div>
            <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] p-3.5">
              <dt className="text-slate-500 dark:text-zinc-400">Mudanças do Google</dt>
              <dd className="font-medium mt-0.5">{st.avisos_em_tempo_real ? 'Em tempo real' : 'Ao abrir a Agenda e 1× por dia'}</dd>
            </div>
            <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] p-3.5">
              <dt className="text-slate-500 dark:text-zinc-400">Agendas vinculadas</dt>
              <dd className="font-medium mt-0.5">{(st.contas || []).filter((c) => c.ativo !== false).length}</dd>
            </div>
          </dl>

          {st.client_id && (
            <p className="text-[12px] text-slate-500 dark:text-zinc-400">
              ID do cliente para a delegação no Workspace: <span className="font-mono select-all text-[#1d1d1f] dark:text-white">{st.client_id}</span>
            </p>
          )}

          {equipe.length > 0 && (
            <div>
              <p className="text-[13px] font-medium mb-2">Conta Google de cada pessoa</p>
              <div className="divide-y divide-black/[0.06] dark:divide-white/[0.09] rounded-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.09]">
                {equipe.map((m) => {
                  const teste = testes[m.email];
                  const erro = st.erros?.[m.email];
                  return (
                    <div key={m.email} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2 md:gap-4 items-center px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium truncate">{m.nome || m.email}</p>
                        <p className="text-[12px] text-slate-500 dark:text-zinc-400 truncate">{m.email}</p>
                      </div>
                      <input
                        type="email"
                        value={vinculos[m.email] || ''}
                        onChange={(e) => setVinculos((v) => ({ ...v, [m.email]: e.target.value }))}
                        placeholder="e-mail no Google (deixe vazio para não sincronizar)"
                        aria-label={`Conta Google de ${m.nome || m.email}`}
                        className={campo}
                      />
                      <div className="flex items-center gap-2 text-[12px] md:justify-end min-w-[96px]">
                        {teste === 'ok' ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Acesso ok</span>
                        ) : teste === 'testando' ? (
                          <span className="text-slate-500">Testando…</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => testar(m.email)}
                            disabled={!(vinculos[m.email] || '').trim()}
                            className="font-medium text-slate-600 dark:text-zinc-300 hover:text-[#1d1d1f] dark:hover:text-white disabled:opacity-40 cursor-pointer"
                          >
                            Testar acesso
                          </button>
                        )}
                      </div>
                      {(teste && teste !== 'ok' && teste !== 'testando') || erro ? (
                        <p className="md:col-span-3 text-[12px] text-rose-600 dark:text-rose-400">{teste && teste !== 'ok' && teste !== 'testando' ? teste : erro}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={salvar}
                  disabled={salvando}
                  className="h-10 px-5 rounded-full text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {salvando ? 'Salvando…' : 'Salvar e sincronizar'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
