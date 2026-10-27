'use client';

import React, { useEffect, useRef, useState } from 'react';
import { fetchListaContatos, getEquipeUsuarios } from '@/lib/storage';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { ModalEtapas, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';

// ------------------------------------------------------------------------------
// Filtros avançados do Chat (como no RM Chat)
// ------------------------------------------------------------------------------
export const FILTROS_PADRAO = { ordem: 'recentes', verTodos: false, usuario: '', naoRespondidos: false, naoLidas: false };
const CHAVE_FILTROS = 'rm_chat_filtros';

/** Filtros guardados ("lembrar") ou o padrão. */
export function lerFiltrosSalvos() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FILTROS) || 'null');
    return salvo ? { filtros: { ...FILTROS_PADRAO, ...salvo }, lembrar: true } : { filtros: FILTROS_PADRAO, lembrar: false };
  } catch {
    return { filtros: FILTROS_PADRAO, lembrar: false };
  }
}
function guardarFiltros(filtros, lembrar) {
  try {
    if (lembrar) localStorage.setItem(CHAVE_FILTROS, JSON.stringify(filtros));
    else localStorage.removeItem(CHAVE_FILTROS);
  } catch {}
}
export const filtrosAtivos = (f) => f.ordem !== 'recentes' || f.verTodos || f.usuario || f.naoRespondidos || f.naoLidas;

/** A conversa ainda espera resposta? (a última mensagem é do cliente) */
export const naoRespondida = (c) => Boolean(c.ultima_entrada_cliente_em) && new Date(c.ultima_entrada_cliente_em) >= new Date(c.ultima_mensagem_em || 0);

function Chave({ ligado, onMudar, titulo, descricao, desabilitado = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={desabilitado}
      onClick={() => onMudar(!ligado)}
      className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3 ring-1 ring-black/[0.08] dark:ring-white/[0.1] text-left cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className={`relative w-10 h-6 rounded-full flex-shrink-0 transition-colors ${ligado ? 'bg-[#00a884]' : 'bg-black/15 dark:bg-white/20'}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${ligado ? 'left-5' : 'left-1'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{titulo}</span>
        {descricao && <span className="block text-[12.5px] text-slate-500 dark:text-zinc-400">{descricao}</span>}
      </span>
    </button>
  );
}

export function FiltrosAvancados({ aberto, onFechar, admin, valor, lembrarInicial, onAplicar }) {
  const [f, setF] = useState(valor);
  const [lembrar, setLembrar] = useState(lembrarInicial);
  useEffect(() => {
    if (aberto) {
      setF(valor);
      setLembrar(lembrarInicial);
    }
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const equipe = getEquipeUsuarios().filter((u) => u.ativo !== false && u.email);
  const aplicar = () => {
    guardarFiltros(f, lembrar);
    onAplicar(f, lembrar);
    onFechar();
  };
  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      largura="max-w-xl"
      idTitulo="filtros-chat-titulo"
      titulo="Filtros avançados"
      subtitulo="Refine a lista de atendimentos exibidos."
      rodape={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
          <button type="button" onClick={() => setF(FILTROS_PADRAO)} className={`${classeBotaoTexto} sm:mr-auto`}>
            Limpar filtros
          </button>
          <button type="button" onClick={onFechar} className={classeBotaoTexto}>
            Cancelar
          </button>
          <button type="button" onClick={aplicar} className={classeBotaoPrimario}>
            Filtrar
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">Ordenação</h3>
          <select value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} className={`${classeCampo} cursor-pointer`}>
            <option value="recentes">Recentes primeiro</option>
            <option value="antigos">Mais antigos primeiro</option>
          </select>
        </section>

        {admin && (
          <section className="space-y-2.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Escopo</h3>
            <Chave ligado={f.verTodos} onMudar={(v) => setF({ ...f, verTodos: v, usuario: v ? f.usuario : '' })} titulo="(Admin) Visualizar todos" descricao="Mostra em Ativos e Resolvidas as conversas de toda a equipe, não só as suas." />
            {f.verTodos && (
              <label className="block">
                <span className={classeRotulo}>Somente de</span>
                <select value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} className={`${classeCampo} cursor-pointer`}>
                  <option value="">Toda a equipe</option>
                  {equipe.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.nome || u.email}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}

        <section className="space-y-2.5">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Comportamento</h3>
          <Chave ligado={f.naoRespondidos} onMudar={(v) => setF({ ...f, naoRespondidos: v })} titulo="Somente não respondidos" descricao="A última mensagem é do cliente." />
          <Chave ligado={f.naoLidas} onMudar={(v) => setF({ ...f, naoLidas: v })} titulo="Somente com mensagens não lidas" />
          <Chave ligado={false} onMudar={() => {}} desabilitado titulo="Somente no chatbot" descricao="Disponível quando o chatbot for lançado." />
        </section>

        <section className="pt-1">
          <Chave ligado={lembrar} onMudar={setLembrar} titulo="Manter estes filtros" descricao={lembrar ? 'Ficam aplicados sempre que você abrir o Chat.' : 'Valem só agora; ao voltar ao Chat, a lista volta ao normal.'} />
        </section>
      </div>
    </ModalEtapas>
  );
}

// ------------------------------------------------------------------------------
// Lista de contatos
// ------------------------------------------------------------------------------
export function ContatosModal({ aberto, onFechar, Avatar, onEscolher }) {
  const [termo, setTermo] = useState('');
  const [lista, setLista] = useState(null);
  const [pagina, setPagina] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState('');
  const [abrindo, setAbrindo] = useState(null);
  const pedido = useRef(0);

  const carregar = (q, p) => {
    const n = ++pedido.current;
    if (p === 0) setLista(null);
    fetchListaContatos(q, p)
      .then((r) => {
        if (n !== pedido.current) return;
        setLista((l) => (p === 0 ? r.contatos : [...(l || []), ...r.contatos]));
        setTemMais(r.temMais);
        setPagina(p);
        setErro('');
      })
      .catch((e) => n === pedido.current && setErro(e.message));
  };

  useEffect(() => {
    if (!aberto) return undefined;
    const t = setTimeout(() => carregar(termo.trim(), 0), termo ? 300 : 0);
    return () => clearTimeout(t);
  }, [aberto, termo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ModalEtapas aberto={aberto} onFechar={onFechar} largura="max-w-lg" idTitulo="contatos-titulo" titulo="Contatos" subtitulo="Pessoas que já falaram com a empresa pelo WhatsApp (inclusive nos grupos)." rodape={null}>
      <div className="space-y-3">
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar por nome ou número" aria-label="Buscar contato" className={classeCampo} autoFocus />
        {erro ? (
          <p className="text-[13px] text-rose-600">{erro}</p>
        ) : lista === null ? (
          <div className="py-8 flex justify-center text-slate-400">
            <Spinner />
          </div>
        ) : lista.length === 0 ? (
          <p className="py-8 text-center text-[13.5px] text-slate-500 dark:text-zinc-400">{termo ? 'Nenhum contato encontrado.' : 'Nenhum contato ainda.'}</p>
        ) : (
          <ul className="max-h-[52vh] overflow-y-auto -mx-2">
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={Boolean(abrindo)}
                  onClick={async () => {
                    setAbrindo(c.id);
                    try {
                      await onEscolher(c);
                    } finally {
                      setAbrindo(null);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-60"
                >
                  <Avatar conversa={{ contato: c }} tamanho="w-10 h-10 text-[13px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium truncate">{c.nome || formatarTelefone(c.telefone)}</span>
                    <span className="block text-[12.5px] text-slate-500 dark:text-zinc-400 tabular-nums">{formatarTelefone(c.telefone)}</span>
                  </span>
                  {abrindo === c.id && <Spinner />}
                </button>
              </li>
            ))}
            {temMais && (
              <li className="pt-2 flex justify-center">
                <button type="button" onClick={() => carregar(termo.trim(), pagina + 1)} className="h-9 px-4 rounded-full text-[13px] font-medium ring-1 ring-black/[0.1] dark:ring-white/[0.14] cursor-pointer">
                  Carregar mais
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </ModalEtapas>
  );
}
