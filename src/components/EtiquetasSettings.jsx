'use client';

import { ETIQUETA_MAX, TIPOS_ETIQUETA, etiquetaCadastrada } from '@/lib/etiquetas';
import { fetchEtiquetasCadastradas, salvarEtiquetasCadastradas } from '@/lib/storage';
import { useEffect, useState } from 'react';
import { XMarkIcon } from './Icons';
import { showToast } from './ToastNotification';

/**
 * Configurações › Etiquetas (administradores): cadastro das etiquetas da empresa, em duas listas
 * separadas — Chat (contatos e grupos) e Fila de Demandas. No dia a dia a equipe só escolhe destas listas.
 */

function ListaEtiquetas({ tipo, lista, onSalvar }) {
  const info = TIPOS_ETIQUETA[tipo];
  const [nova, setNova] = useState('');
  const [salvando, setSalvando] = useState(false);

  const gravar = async (proxima) => {
    setSalvando(true);
    try {
      await onSalvar(tipo, proxima);
      return true;
    } catch (e) {
      showToast(e.message || 'Não foi possível salvar.', 'error');
      return false;
    } finally {
      setSalvando(false);
    }
  };
  const adicionar = async (e) => {
    e.preventDefault();
    const nome = nova.trim().replace(/^#/, '');
    if (!nome) return;
    if (etiquetaCadastrada(lista, nome)) {
      showToast('Essa etiqueta já está cadastrada.', 'info');
      return;
    }
    if (await gravar([...lista, nome].sort((a, b) => a.localeCompare(b, 'pt-BR')))) setNova('');
  };

  return (
    <section className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rm-acento dark:text-rm-acento-escuro">
            {tipo === 'chat' ? 'Chat' : 'Demandas'}
          </span>
          <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">{info.rotulo}</h4>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
            {info.descricao}
          </p>
        </div>
        <span className="shrink-0 h-6 px-2.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[11.5px] font-semibold text-slate-600 dark:text-zinc-300 inline-flex items-center">
          {lista.length}
        </span>
      </div>

      <form onSubmit={adicionar} className="flex gap-2">
        <input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          maxLength={ETIQUETA_MAX}
          placeholder={tipo === 'chat' ? 'Ex.: Cliente VIP' : 'Ex.: Urgente'}
          aria-label={`Nova etiqueta — ${info.rotulo}`}
          className="flex-1 min-w-0 h-10 rounded-xl px-3.5 bg-rm-fundo dark:bg-rm-campo-escuro text-[14px] outline-none ring-1 ring-transparent focus:ring-rm-acento-medio/50"
        />
        <button
          type="submit"
          disabled={salvando || !nova.trim()}
          className="h-10 px-4 rounded-xl bg-rm-acento text-white text-[13.5px] font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-default"
        >
          Cadastrar
        </button>
      </form>

      {lista.length ? (
        <div className="flex flex-wrap gap-1.5">
          {lista.map((t) => (
            <span
              key={t}
              className="h-8 pl-3 pr-1 rounded-full bg-rm-acento-medio/10 text-[#00694f] dark:text-rm-acento-vivo text-[13px] font-medium inline-flex items-center gap-1"
            >
              {t}
              <button
                type="button"
                disabled={salvando}
                onClick={() => gravar(lista.filter((x) => x !== t))}
                aria-label={`Excluir etiqueta ${t}`}
                className="w-6 h-6 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-slate-500 dark:text-zinc-400">
          Nenhuma etiqueta cadastrada ainda.
        </p>
      )}
    </section>
  );
}

export default function EtiquetasSettings() {
  const [listas, setListas] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetchEtiquetasCadastradas({ forcar: true })
      .then(setListas)
      .catch((e) => setErro(e.message));
  }, []);

  const salvar = async (tipo, lista) => {
    const salvas = await salvarEtiquetasCadastradas(tipo, lista);
    setListas((l) => ({ ...l, [tipo]: salvas }));
  };

  if (erro) return <p className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>;
  if (!listas)
    return <p className="text-sm text-slate-500 dark:text-zinc-400">Carregando as etiquetas…</p>;
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-slate-500 dark:text-zinc-400 leading-relaxed max-w-[720px]">
        A equipe só consegue usar as etiquetas cadastradas aqui. Excluir uma etiqueta da lista não
        tira ela de quem já tem; só deixa de aparecer para escolher.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <ListaEtiquetas tipo="chat" lista={listas.chat} onSalvar={salvar} />
        <ListaEtiquetas tipo="demandas" lista={listas.demandas} onSalvar={salvar} />
      </div>
    </div>
  );
}
