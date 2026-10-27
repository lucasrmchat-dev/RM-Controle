'use client';

import React, { useEffect, useRef, useState } from 'react';
import { criarContatoChat, fetchListaContatos, getCategoriasDemandas, getEquipeUsuarios, salvarContatoChat } from '@/lib/storage';
import { PAISES } from '@/lib/paises';
import { showToast } from './ToastNotification';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { ModalEtapas, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';

// ------------------------------------------------------------------------------
// Filtros avançados do Chat (como no RM Chat)
// ------------------------------------------------------------------------------
export const FILTROS_PADRAO = { ordem: 'recentes', verTodos: false, usuario: '', naoRespondidos: false, naoLidas: false, departamento: '', canal: '' };
export const SEM_DEPARTAMENTO = '__sem__';
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
export const filtrosAtivos = (f) => f.ordem !== 'recentes' || f.verTodos || f.usuario || f.naoRespondidos || f.naoLidas || f.departamento || f.canal;

/** A conversa passa nos filtros de departamento e canal? */
export const noDepartamentoECanal = (f, c) =>
  (!f.departamento || (f.departamento === SEM_DEPARTAMENTO ? !String(c.departamento || '').trim() : c.departamento === f.departamento)) && (!f.canal || c.canal_id === f.canal);

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
      <span className={`relative w-10 h-6 rounded-full flex-shrink-0 transition-colors ${ligado ? 'bg-rm-acento-medio' : 'bg-black/15 dark:bg-white/20'}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${ligado ? 'left-5' : 'left-1'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{titulo}</span>
        {descricao && <span className="block text-[12.5px] text-slate-500 dark:text-zinc-400">{descricao}</span>}
      </span>
    </button>
  );
}

export function FiltrosAvancados({ aberto, onFechar, admin, valor, lembrarInicial, onAplicar, conversas = [] }) {
  const [f, setF] = useState(valor);
  const [lembrar, setLembrar] = useState(lembrarInicial);
  useEffect(() => {
    if (aberto) {
      setF(valor);
      setLembrar(lembrarInicial);
    }
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const equipe = getEquipeUsuarios().filter((u) => u.ativo !== false && u.email);
  // Departamentos cadastrados e os que aparecem nas conversas; canais das conversas que a pessoa vê
  const departamentos = [...new Set([...getCategoriasDemandas(), ...conversas.map((c) => String(c.departamento || '').trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const canais = [...new Map(conversas.filter((c) => c.canal?.id).map((c) => [c.canal.id, c.canal])).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={classeRotulo}>Departamento</span>
            <select value={f.departamento || ''} onChange={(e) => setF({ ...f, departamento: e.target.value })} className={`${classeCampo} cursor-pointer`}>
              <option value="">Todos</option>
              <option value={SEM_DEPARTAMENTO}>Sem departamento</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={classeRotulo}>Canal</span>
            <select value={f.canal || ''} onChange={(e) => setF({ ...f, canal: e.target.value })} className={`${classeCampo} cursor-pointer`}>
              <option value="">Todos</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
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
/** Uma pessoa na lista de contatos: conversar ou editar o nome ali mesmo. */
function LinhaContato({ c, Avatar, onConversar, onSalvo }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(c.nome || '');
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setOcupado(true);
    try {
      const r = await salvarContatoChat({ id: c.id, nome });
      onSalvo({ ...c, nome: r.contato?.nome ?? nome });
      setEditando(false);
      showToast('Contato salvo.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setOcupado(false);
    }
  };
  return (
    <li className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
      <Avatar conversa={{ contato: c }} tamanho="w-10 h-10 text-[13px]" />
      {editando ? (
        <form
          className="flex-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus placeholder="Nome" className="flex-1 h-9 rounded-lg px-3 bg-black/[0.04] dark:bg-white/[0.06] outline-none text-[14px]" />
          <button type="submit" disabled={ocupado} className="h-9 px-3 rounded-lg bg-rm-acento text-white text-[13px] font-semibold cursor-pointer disabled:opacity-50">
            Salvar
          </button>
          <button type="button" onClick={() => setEditando(false)} className="h-9 px-2 text-[13px] text-slate-500 cursor-pointer">
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium truncate">{c.nome || 'Sem nome'}</span>
            <span className="block text-[12.5px] text-slate-500 dark:text-zinc-400 tabular-nums">{formatarTelefone(c.telefone)}</span>
          </span>
          <button type="button" onClick={() => setEditando(true)} className="h-8 px-3 rounded-full text-[12.5px] font-medium text-slate-600 dark:text-zinc-300 ring-1 ring-black/[0.1] dark:ring-white/[0.14] hover:bg-black/[0.04] cursor-pointer md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100">
            Editar
          </button>
          <button type="button" onClick={() => onConversar(c)} disabled={ocupado} className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-white bg-rm-acento-medio hover:bg-[#019774] cursor-pointer">
            Conversar
          </button>
        </>
      )}
    </li>
  );
}

function NovoContato({ onCriado, onCancelar }) {
  const [nome, setNome] = useState('');
  const [ddi, setDdi] = useState('55');
  const [numero, setNumero] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const criar = async () => {
    setOcupado(true);
    try {
      const r = await criarContatoChat({ nome, telefone: `${ddi}${numero.replace(/\D/g, '')}` });
      showToast(r.ja_existia ? 'Esse número já estava nos contatos.' : 'Contato criado.', 'success');
      onCriado();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setOcupado(false);
    }
  };
  return (
    <form
      className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] p-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        criar();
      }}
    >
      <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus placeholder="Nome" aria-label="Nome do contato" className={classeCampo} />
      <div className="flex gap-2">
        <select value={ddi} onChange={(e) => setDdi(e.target.value)} aria-label="Código do país" className={`${classeCampo} w-[118px] cursor-pointer`}>
          {PAISES.map((p) => (
            <option key={p.ddi + p.nome} value={p.ddi}>
              {p.bandeira} +{p.ddi}
            </option>
          ))}
        </select>
        <input type="tel" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder={ddi === '55' ? 'DDD + número' : 'Número'} aria-label="Número" className={`${classeCampo} flex-1`} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className={classeBotaoTexto}>
          Cancelar
        </button>
        <button type="submit" disabled={ocupado || numero.replace(/\D/g, '').length < 8} className={classeBotaoPrimario}>
          {ocupado && <Spinner />}
          Salvar contato
        </button>
      </div>
    </form>
  );
}

export function ContatosModal({ aberto, onFechar, Avatar, onEscolher }) {
  const [criando, setCriando] = useState(false);
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
    <ModalEtapas aberto={aberto} onFechar={onFechar} largura="max-w-xl" idTitulo="contatos-titulo" titulo="Contatos" subtitulo="Pessoas que já falaram com a empresa pelo WhatsApp (inclusive nos grupos) e as que você cadastrar." rodape={null}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar por nome ou número" aria-label="Buscar contato" className={`${classeCampo} flex-1`} autoFocus autoComplete="off" name="rm-busca-contatos" spellCheck={false} />
          {!criando && (
            <button type="button" onClick={() => setCriando(true)} className="h-11 px-4 rounded-xl bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[13px] font-semibold whitespace-nowrap cursor-pointer">
              + Novo contato
            </button>
          )}
        </div>
        {criando && (
          <NovoContato
            onCancelar={() => setCriando(false)}
            onCriado={() => {
              setCriando(false);
              carregar(termo.trim(), 0);
            }}
          />
        )}
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
              <LinhaContato key={c.id} c={c} Avatar={Avatar} onConversar={async (x) => { setAbrindo(x.id); try { await onEscolher(x); } finally { setAbrindo(null); } }} onSalvo={(novo) => setLista((l) => l.map((y) => (y.id === novo.id ? novo : y)))} />
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
