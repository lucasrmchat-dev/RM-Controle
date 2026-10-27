'use client';

import React, { useEffect, useState } from 'react';
import { fetchAcessoChat, salvarAcessoChat } from '@/lib/storage';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { showToast } from './ToastNotification';

function Chave({ ligado, onMudar, titulo, descricao, desabilitado }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={desabilitado}
      onClick={() => onMudar(!ligado)}
      className="w-full flex items-start gap-3 rounded-2xl px-3.5 py-3 ring-1 ring-black/[0.08] dark:ring-white/[0.1] text-left cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03] disabled:opacity-50"
    >
      <span className={`relative mt-0.5 w-9 h-[22px] rounded-full flex-shrink-0 transition-colors ${ligado ? 'bg-[#4d7c0f] dark:bg-[#84cc16]' : 'bg-black/15 dark:bg-white/20'}`}>
        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${ligado ? 'left-[17px]' : 'left-[3px]'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-white">{titulo}</span>
        <span className="block text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400 mt-0.5">{descricao}</span>
      </span>
    </button>
  );
}

/**
 * Acesso da pessoa ao Chat, dentro do editar usuário. Salva na hora a cada mudança.
 * Administradores veem tudo; estas regras valem para os demais perfis.
 */
export default function AcessoChatUsuario({ email, administrador = false }) {
  const [acesso, setAcesso] = useState(null);
  const [canais, setCanais] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!email) return;
    fetchAcessoChat(email)
      .then((r) => {
        setAcesso(r.acesso);
        setCanais(r.canais || []);
      })
      .catch((e) => setErro(e.message));
  }, [email]);

  const salvar = async (novo) => {
    const anterior = acesso;
    setAcesso(novo);
    setSalvando(true);
    try {
      const r = await salvarAcessoChat({ email, ...novo });
      setAcesso(r.acesso);
      showToast('Acesso ao Chat salvo.', 'success');
    } catch (e) {
      setAcesso(anterior);
      showToast(e.message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-2.5 pt-1">
      <div className="flex items-center gap-2 pl-1">
        <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Chat do WhatsApp</span>
        {salvando && <span className="text-[10.5px] text-slate-400">salvando…</span>}
      </div>
      {administrador && <p className="text-[11px] text-slate-500 dark:text-zinc-400 pl-1">Administradores veem todas as conversas; as regras abaixo valem quando a pessoa não é administradora.</p>}
      {erro ? (
        <p className="text-[11px] text-rose-600 pl-1">{erro}</p>
      ) : !acesso ? (
        <p className="text-[11px] text-slate-400 pl-1">Carregando…</p>
      ) : (
        <>
          <Chave
            ligado={acesso.verOutros}
            onMudar={(v) => salvar({ ...acesso, verOutros: v })}
            desabilitado={salvando}
            titulo="Visualizar tickets de outros usuários dos seus departamentos"
            descricao="Vê também as conversas que colegas do mesmo departamento já assumiram. Desligado, vê só as pendentes do departamento e as suas."
          />
          <Chave
            ligado={acesso.controleCanais}
            onMudar={(v) => salvar({ ...acesso, controleCanais: v })}
            desabilitado={salvando}
            titulo="Fluxo de controle de canais"
            descricao="Quando ativo, a pessoa vê apenas conversas e mensagens dos canais liberados a ela, mesmo que outros canais sejam do departamento dela."
          />
          {acesso.controleCanais && (
            <div className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] p-2">
              <p className="px-1.5 pb-1.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Canais liberados</p>
              {canais.length === 0 ? (
                <p className="px-1.5 pb-1 text-[11px] text-slate-400">Nenhum canal cadastrado em Canais.</p>
              ) : (
                canais.map((c) => {
                  const marcado = acesso.canais.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={salvando}
                        onChange={() => salvar({ ...acesso, canais: marcado ? acesso.canais.filter((id) => id !== c.id) : [...acesso.canais, c.id] })}
                        className="w-4 h-4 accent-[#4d7c0f]"
                      />
                      <span className="text-xs font-medium text-[#1d1d1f] dark:text-white">{c.nome}</span>
                      <span className="text-[11px] text-slate-400">{c.numero ? formatarTelefone(c.numero) : c.tipo === 'whatsapp_oficial' ? 'API oficial' : 'QR Code'}</span>
                    </label>
                  );
                })
              )}
              {acesso.canais.length === 0 && <p className="px-1.5 pt-1 text-[11px] text-amber-600 dark:text-amber-400">Sem nenhum canal marcado, a pessoa não vê conversas no Chat.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
