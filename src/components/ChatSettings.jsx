'use client';

import React, { useEffect, useState } from 'react';
import { fetchConfigChat, salvarConfigChat } from '@/lib/storage';
import { Spinner } from './FormularioEtapas';
import { showToast } from './ToastNotification';

const OPCOES_GRUPOS = [
  { id: 'desligado', titulo: 'Não receber grupos', desc: 'Mensagens de grupos do WhatsApp ficam só no celular. Ideal quando o número participa de muitos grupos.' },
  { id: 'aba', titulo: 'Grupos numa aba própria', desc: 'Os grupos aparecem na aba “Grupos” do Chat, fora da Fila. A equipe lê e responde sem misturar com o atendimento.', tag: 'Recomendado' },
  { id: 'fila', titulo: 'Grupos como conversa normal', desc: 'Cada grupo entra na Fila como qualquer conversa: pode ser assumido, transferido e resolvido.' },
];

/** Configurações avançadas › Chat (só administradores). */
export default function ChatSettings() {
  const [config, setConfig] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetchConfigChat()
      .then((c) => {
        setConfig(c);
        setSalvo(c);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      const r = await salvarConfigChat(config);
      setSalvo(r.valor);
      setConfig(r.valor);
      if (r.aviso) showToast(r.aviso, 'warning');
      else showToast('Configuração do Chat salva.', 'success');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const mudou = config && salvo && JSON.stringify(config) !== JSON.stringify(salvo);

  return (
    <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-cartao-escuro p-5 sm:p-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Chat do WhatsApp</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-2xl">Como as conversas chegam no Chat para toda a equipe.</p>
      </div>

      {!config ? (
        erro ? <p className="text-sm text-rose-600">{erro}</p> : <Spinner />
      ) : (
        <>
          <div>
            <h3 className="text-[15px] font-semibold">Grupos do WhatsApp</h3>
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 mb-4">Vale para os números conectados por QR Code. A API oficial da Meta não recebe grupos.</p>
            <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Grupos do WhatsApp">
              {OPCOES_GRUPOS.map((o) => {
                const ativo = config.grupos === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setConfig({ ...config, grupos: o.id })}
                    className={`text-left rounded-2xl p-4 ring-1 transition-colors cursor-pointer ${ativo ? 'ring-2 ring-rm-acento dark:ring-rm-acento-escuro bg-rm-acento/[0.05]' : 'ring-black/[0.1] dark:ring-white/[0.12] hover:bg-black/[0.02] dark:hover:bg-white/[0.04]'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${ativo ? 'border-rm-acento dark:border-rm-acento-escuro' : 'border-slate-300 dark:border-zinc-600'}`}>{ativo && <span className="w-2 h-2 rounded-full bg-rm-acento dark:bg-rm-acento-escuro" />}</span>
                      <span className="text-[14px] font-semibold">{o.titulo}</span>
                    </span>
                    {o.tag && <span className="inline-block mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-rm-acento dark:text-rm-acento-vivo">{o.tag}</span>}
                    <span className="block mt-1.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{o.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {erro && <p className="text-sm text-rose-600">{erro}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={salvar} disabled={salvando || !mudou} className="h-11 px-5 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-sm font-medium disabled:opacity-40 cursor-pointer flex items-center gap-2">
              {salvando && <Spinner />}
              Salvar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
