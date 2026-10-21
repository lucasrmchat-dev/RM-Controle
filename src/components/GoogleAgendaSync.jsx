'use client';

import React, { useEffect, useState } from 'react';
import {
  statusGoogleAgenda,
  desconectarGoogleAgenda,
  sincronizarGoogleAgenda,
  listarAgendasGoogleDisponiveis,
  salvarAgendasGoogle,
  definirAgendaPadraoGoogle,
  URL_CONECTAR_GOOGLE_AGENDA,
} from '@/lib/storage';
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
 * Agendas compartilhadas com a pessoa (ex.: a do suporte@) que ela pode escolher sincronizar.
 * São da equipe toda: o responsável é definido em cada reunião, não na agenda.
 */
function AgendasCompartilhadas({ escolhidas = [], onSalvo }) {
  const [lista, setLista] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const abrir = async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await listarAgendasGoogleDisponiveis();
      setLista(r.agendas || []);
      setMarcadas(new Set((r.agendas || []).filter((a) => a.selecionada).map((a) => a.id)));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      const r = await salvarAgendasGoogle([...marcadas]);
      const falhas = Object.values(r.erros || {}).filter(Boolean);
      if (falhas.length) showToast(`Agendas salvas, mas a sincronização avisou: ${falhas[0]}`, 'warning');
      else showToast('Agendas salvas e sincronizadas.', 'success');
      setLista(null);
      onSalvo?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!lista) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-medium">Agendas compartilhadas</p>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5">
            {escolhidas.length
              ? `Sincronizando: ${escolhidas.map((a) => a.nome).join(', ')}`
              : 'Traga agendas da equipe que você pode editar, como a do suporte.'}
          </p>
          {erro && <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-1">{erro}</p>}
        </div>
        {/conecte o Google Agenda de novo/i.test(erro) && <BotaoConectarGoogle className="!h-9" />}
        <button
          type="button"
          onClick={abrir}
          disabled={carregando}
          className="h-9 px-3.5 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 cursor-pointer flex-shrink-0"
        >
          {carregando ? 'Carregando…' : escolhidas.length ? 'Alterar agendas' : 'Escolher agendas'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13.5px] font-medium mb-1">Agendas compartilhadas</p>
      <p className="text-[12px] text-slate-500 dark:text-zinc-400 mb-3">
        Marque as agendas da equipe que devem aparecer no RM Controle. O responsável é escolhido em cada reunião.
      </p>
      {lista.length === 0 ? (
        <p className="text-[13px] text-slate-500 dark:text-zinc-400">Nenhuma agenda que você possa editar foi encontrada além da sua.</p>
      ) : (
        <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.09] rounded-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.09]">
          {lista.map((a) => (
            <li key={a.id}>
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marcadas.has(a.id)}
                  onChange={(e) =>
                    setMarcadas((m) => {
                      const n = new Set(m);
                      if (e.target.checked) n.add(a.id);
                      else n.delete(a.id);
                      return n;
                    })
                  }
                  className="w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16]"
                />
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.cor || '#8e8e93' }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{a.nome}</span>
                  <span className="block text-[12px] text-slate-500 dark:text-zinc-400 truncate">{a.id}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-2">{erro}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={() => setLista(null)} className="h-9 px-3.5 rounded-full text-[13px] font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer">
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="h-9 px-4 rounded-full text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {salvando ? 'Salvando e sincronizando…' : 'Salvar e sincronizar'}
        </button>
      </div>
    </div>
  );
}

/** Onde as reuniões novas são criadas no Google (vale para a equipe toda). */
function AgendaPadrao({ agendas = [], padrao, onSalvo }) {
  if (agendas.length < 2) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium">Novas reuniões vão para</p>
        <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5">Dá para trocar em cada reunião, ao criar.</p>
      </div>
      <select
        value={padrao || ''}
        onChange={async (e) => {
          try {
            await definirAgendaPadraoGoogle(e.target.value);
            showToast('Agenda padrão atualizada.', 'success');
            onSalvo?.();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }}
        aria-label="Agenda padrão para novas reuniões"
        className="h-9 px-3 rounded-xl bg-white dark:bg-white/[0.04] ring-1 ring-black/[0.1] dark:ring-white/[0.12] text-[13px] cursor-pointer sm:w-64"
      >
        {agendas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </select>
    </div>
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
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] text-slate-600 dark:text-zinc-300">Sua agenda Google ainda não está conectada.</p>
                  {st.minha_falha_conexao && (
                    <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-1">
                      Última tentativa ({formatar(st.minha_falha_conexao.em)}): {st.minha_falha_conexao.mensagem}
                    </p>
                  )}
                </div>
                <BotaoConectarGoogle />
              </>
            )}
          </div>

          {minha && (
            <div className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] p-4">
              <AgendasCompartilhadas escolhidas={minha.agendas || []} onSalvo={carregar} />
            </div>
          )}
          {(st.agendas || []).length > 1 && (
            <div className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] p-4">
              <AgendaPadrao agendas={st.agendas} padrao={st.agenda_padrao} onSalvo={carregar} />
            </div>
          )}

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
