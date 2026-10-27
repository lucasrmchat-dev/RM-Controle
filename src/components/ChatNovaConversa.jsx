'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchCanais, fetchListaContatos, getCategoriasDemandas, iniciarConversa } from '@/lib/storage';
import { PAISES } from '@/lib/paises';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { ModalEtapas, ErroRodape, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Agenda de contatos baixada uma vez (5 minutos): a busca filtra na hora, sem ir ao servidor a cada letra
const LIMITE_AGENDA = 500;
let agenda = { em: 0, lista: null, completa: false };
async function carregarAgenda() {
  if (agenda.lista && Date.now() - agenda.em < 5 * 60 * 1000) return agenda;
  const r = await fetchListaContatos('', 0, { limite: LIMITE_AGENDA });
  agenda = { em: Date.now(), lista: r.contatos || [], completa: !r.temMais };
  return agenda;
}
const filtrarAgenda = (lista, termo) => {
  const t = semAcento(termo).trim();
  const digitos = termo.replace(/\D/g, '');
  return lista.filter((c) => semAcento(c.nome).includes(t) || (digitos.length >= 3 && String(c.telefone || '').includes(digitos)));
};

function SeletorPais({ valor, onMudar }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);
  const atual = PAISES.find((p) => p.ddi === valor) || PAISES[0];
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => ref.current && !ref.current.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const lista = PAISES.filter((p) => !busca || semAcento(p.nome).includes(semAcento(busca)) || p.ddi.startsWith(busca.replace(/\D/g, '') || '§'));
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-label="Código do país" aria-expanded={aberto} className={`${classeCampo} w-[118px] flex items-center gap-2 cursor-pointer`}>
        <span className="text-[18px] leading-none">{atual.bandeira}</span>
        <span className="tabular-nums">+{atual.ddi}</span>
        <svg className="w-3.5 h-3.5 ml-auto opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-0 top-[calc(100%+6px)] z-40 w-[280px] rounded-2xl bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.12] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] p-1.5">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus placeholder="Procurar país ou código" className="w-full h-9 rounded-xl px-3 mb-1 bg-black/[0.04] dark:bg-white/[0.06] outline-none text-[13.5px]" />
            <ul className="max-h-[240px] overflow-y-auto">
              {lista.map((p) => (
                <li key={p.ddi + p.nome}>
                  <button
                    type="button"
                    onClick={() => {
                      onMudar(p.ddi);
                      setAberto(false);
                      setBusca('');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-[13.5px] cursor-pointer ${p.ddi === valor ? 'bg-rm-acento/10 font-semibold' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
                  >
                    <span className="text-[18px] leading-none">{p.bandeira}</span>
                    <span className="tabular-nums w-12 text-slate-500">+{p.ddi}</span>
                    <span className="truncate">{p.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const EMOJIS = '😀 😊 😉 🙂 😍 🤝 👍 👏 🙏 ✅ 📌 📅 ⏰ 📞 💬 🎉 🚀 💡 ❤️ 👋'.split(' ');

/**
 * Criar atendimento (nova conversa), como no RM Chat: contato (busca ou número com código do país),
 * canal, departamento e mensagem inicial.
 */
export default function ChatNovaConversa({ aberto, onFechar, onCriada, telefoneInicial = '' }) {
  const [canais, setCanais] = useState(null);
  const [ddi, setDdi] = useState('55');
  const [numero, setNumero] = useState('');
  const [contato, setContato] = useState(null);
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState([]);
  // Contato em destaque na lista (o primeiro, ao começar a digitar): Enter escolhe, setas mudam
  const [destaque, setDestaque] = useState(0);
  const [canalId, setCanalId] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [texto, setTexto] = useState('');
  const [emojis, setEmojis] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const departamentos = getCategoriasDemandas();

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setTexto('');
    setBusca('');
    setSugestoes([]);
    setContato(null);
    // Número vindo da lista de contatos: separa o código do país
    const d = String(telefoneInicial || '').replace(/\D/g, '');
    const pais = PAISES.slice().sort((a, b) => b.ddi.length - a.ddi.length).find((p) => d.startsWith(p.ddi) && d.length > p.ddi.length + 7);
    setDdi(pais?.ddi || '55');
    setNumero(pais ? d.slice(pais.ddi.length) : d);
    fetchCanais()
      .then((r) => {
        setCanais(r.canais || []);
        const primeiro = (r.canais || []).find((c) => c.ativo && c.status === 'conectado' && c.tipo === 'whatsapp_qr');
        setCanalId(primeiro?.id || '');
        setDepartamento(primeiro?.departamento_padrao || '');
      })
      .catch((e) => setErro(e.message));
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Agenda baixada ao abrir; a busca filtra na hora. Só vai ao servidor se a agenda tem mais de 500
  // contatos e ninguém dos já baixados combina.
  const [lista, setLista] = useState(agenda.lista);
  useEffect(() => {
    if (!aberto) return;
    carregarAgenda()
      .then((a) => setLista(a.lista))
      .catch(() => {});
  }, [aberto]);
  useEffect(() => {
    const termo = busca.trim();
    if (!aberto || termo.length < 2) {
      setSugestoes([]);
      return undefined;
    }
    const locais = lista ? filtrarAgenda(lista, termo) : [];
    setSugestoes(locais.slice(0, 6));
    setDestaque(0);
    if (locais.length || (lista && agenda.completa)) return undefined;
    let vivo = true;
    const t = setTimeout(() => fetchListaContatos(termo, 0).then((r) => vivo && setSugestoes(r.contatos.slice(0, 6))).catch(() => {}), 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [aberto, busca, lista]);

  const escolherContato = (c) => {
    setContato(c);
    setBusca('');
    setSugestoes([]);
    setDestaque(0);
  };
  const teclaBusca = (e) => {
    if (!sugestoes.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escolherContato(sugestoes[Math.min(destaque, sugestoes.length - 1)]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSugestoes([]);
    }
  };

  const canal = (canais || []).find((c) => c.id === canalId);
  const telefone = contato ? contato.telefone : `${ddi}${numero.replace(/\D/g, '')}`;
  const temDestino = canalId && (contato || numero.replace(/\D/g, '').length >= 8) && !enviando;
  const oficial = canal?.tipo === 'whatsapp_oficial';
  const podeEnviar = temDestino && texto.trim() && !oficial && canal?.status === 'conectado';

  // semMensagem: só abre a conversa (nada vai ao cliente)
  const enviar = async (semMensagem = false) => {
    setEnviando(true);
    setErro('');
    try {
      const r = await iniciarConversa(semMensagem ? { canal_id: canalId, telefone, departamento, sem_mensagem: true } : { canal_id: canalId, telefone, texto, departamento });
      onCriada(r.conversa);
      onFechar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-xl"
      idTitulo="nova-conversa-titulo"
      titulo="Criar atendimento"
      subtitulo="Inicie uma nova conversa com um contato pelo WhatsApp."
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onFechar} className={classeBotaoTexto}>
              Cancelar
            </button>
            <button type="button" onClick={() => enviar(true)} disabled={!temDestino} title="Abre a conversa sem mandar nada ao cliente" className="h-11 px-5 rounded-full text-[14px] font-semibold ring-1 ring-black/[0.12] dark:ring-white/[0.16] hover:bg-black/[0.03] dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-40">
              Abrir conversa
            </button>
            <button type="button" onClick={() => enviar(false)} disabled={!podeEnviar} title={oficial ? 'Pela API oficial, a primeira mensagem precisa ser um template aprovado' : ''} className={classeBotaoPrimario}>
              {enviando && <Spinner />}
              Enviar e abrir
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">Contato</h3>
          {contato ? (
            <div className="flex items-center gap-3 rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] px-3.5 py-2.5">
              <span className="w-9 h-9 rounded-full bg-rm-acento/12 text-rm-acento dark:text-rm-acento-vivo flex items-center justify-center text-[13px] font-semibold">{String(contato.nome || '#').slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium truncate">{contato.nome || 'Sem nome'}</span>
                <span className="block text-[12.5px] text-slate-500 tabular-nums">{formatarTelefone(contato.telefone)}</span>
              </span>
              <button type="button" onClick={() => setContato(null)} className="text-[13px] text-rm-acento dark:text-rm-acento-vivo font-medium cursor-pointer">
                Trocar
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <SeletorPais valor={ddi} onMudar={setDdi} />
                <input type="tel" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder={ddi === '55' ? 'DDD + número' : 'Número'} aria-label="Número do WhatsApp" className={`${classeCampo} flex-1`} autoFocus={!telefoneInicial} autoComplete="off" name="rm-numero-whatsapp" />
              </div>
              <div className="relative">
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ou localize e selecione o contato" aria-label="Buscar contato" className={classeCampo} autoComplete="off" name="rm-busca-contato" spellCheck={false} onKeyDown={teclaBusca} role="combobox" aria-expanded={sugestoes.length > 0} aria-controls="rm-sugestoes-contato" aria-activedescendant={sugestoes[destaque] ? `rm-contato-${sugestoes[destaque].id}` : undefined} />
                <p className="mt-1 pl-1 text-[11.5px] text-slate-400">Digite ao menos duas letras para localizar o contato.</p>
                {sugestoes.length > 0 && (
                  <ul id="rm-sugestoes-contato" role="listbox" className="absolute left-0 right-0 top-[46px] z-30 rounded-2xl bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.12] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] p-1.5">
                    {sugestoes.map((c, i) => (
                      <li key={c.id} id={`rm-contato-${c.id}`} role="option" aria-selected={i === destaque}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setDestaque(i)}
                          onClick={() => escolherContato(c)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left cursor-pointer ${i === destaque ? 'bg-rm-acento/10 dark:bg-rm-acento-escuro/12' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-medium truncate">{c.nome || 'Sem nome'}</span>
                            <span className="block text-[12px] text-slate-500 tabular-nums">{formatarTelefone(c.telefone)}</span>
                          </span>
                          {i === destaque && <kbd className="text-[10.5px] font-medium text-slate-400 border border-black/[0.1] dark:border-white/[0.15] rounded px-1.5 py-0.5">Enter</kbd>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2.5">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Canal e departamento</h3>
          {canais === null ? (
            <Spinner />
          ) : (
            <>
              <label className="block">
                <span className={classeRotulo}>Canal</span>
                <select
                  value={canalId}
                  onChange={(e) => {
                    setCanalId(e.target.value);
                    const c = canais.find((x) => x.id === e.target.value);
                    if (c?.departamento_padrao) setDepartamento(c.departamento_padrao);
                  }}
                  className={`${classeCampo} cursor-pointer`}
                >
                  <option value="">Escolha o número</option>
                  {canais.map((c) => {
                    return (
                      <option key={c.id} value={c.id} disabled={!c.ativo}>
                        {c.nome}
                        {c.numero ? ` · ${formatarTelefone(c.numero)}` : ''}
                        {c.tipo === 'whatsapp_oficial' ? ' (API oficial)' : c.status !== 'conectado' ? ' (desconectado)' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="block">
                <span className={classeRotulo}>Departamento</span>
                <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={`${classeCampo} cursor-pointer`}>
                  <option value="">Sem departamento (todos veem)</option>
                  {[...new Set([departamento, ...departamentos].filter(Boolean))].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              {canal && (
                <p className="pl-1 text-[11.5px] text-slate-400">
                  A conversa abre com você como responsável.{oficial ? ' Pela API oficial, a primeira mensagem precisa ser um template aprovado; dá para abrir a conversa sem mensagem.' : ''}
                </p>
              )}
            </>
          )}
        </section>

        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">
            Mensagem inicial <span className="normal-case font-normal tracking-normal text-slate-400">(opcional: use “Abrir conversa” para não enviar nada)</span>
          </h3>
          <div className="relative">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={4096} placeholder="Mensagem inicial" className={`${classeCampo} h-auto py-3 pr-12 resize-none`} />
            <button type="button" onClick={() => setEmojis((v) => !v)} aria-label="Emojis" className="absolute right-3 top-3 w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-black/[0.05] cursor-pointer">
              😊
            </button>
            {emojis && (
              <div className="absolute right-0 bottom-[calc(100%+6px)] z-30 grid grid-cols-10 gap-0.5 p-1.5 rounded-2xl bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.12] shadow-lg">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => setTexto((t) => t + e)} className="w-8 h-8 rounded-lg text-[18px] hover:bg-black/[0.05] cursor-pointer">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </ModalEtapas>
  );
}
