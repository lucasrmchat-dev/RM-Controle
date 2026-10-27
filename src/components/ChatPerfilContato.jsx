'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { acaoConversa, atualizarFotoContato, fetchAuditoriaConversa, fetchContatoChat, fetchParticipantesConversa, getEmpresas, salvarContatoChat } from '@/lib/storage';
import { ehGrupo } from '@/lib/canais';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { Spinner } from './FormularioEtapas';
import { showToast } from './ToastNotification';

const ACOES_AUDITORIA = {
  chat_iniciou: { texto: 'iniciou a conversa', cor: 'bg-[#00a884]' },
  chat_visualizou: { texto: 'abriu a conversa', cor: 'bg-slate-400' },
  chat_assumiu: { texto: 'assumiu', cor: 'bg-sky-500' },
  chat_transferiu: { texto: 'transferiu', cor: 'bg-violet-500' },
  chat_resolveu: { texto: 'resolveu (fechou)', cor: 'bg-[#4d7c0f]' },
  chat_reabriu: { texto: 'reabriu', cor: 'bg-amber-500' },
  chat_editou_mensagem: { texto: 'editou uma mensagem', cor: 'bg-slate-500' },
  chat_apagou_mensagem: { texto: 'apagou uma mensagem para todos', cor: 'bg-rose-500' },
  chat_mesclou: { texto: 'juntou a conversa do canal antigo', cor: 'bg-teal-500' },
};
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/** Linha do tempo de quem mexeu na conversa (inclui quem só abriu, sem responder). */
function Auditoria({ conversaId }) {
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState('');
  const [todos, setTodos] = useState(false);
  useEffect(() => {
    let vivo = true;
    setEventos(null);
    fetchAuditoriaConversa(conversaId)
      .then((r) => vivo && setEventos(r.eventos))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [conversaId]);
  if (erro) return <p className="text-[13px] text-rose-600">{erro}</p>;
  if (!eventos) return <Spinner />;
  const lista = todos ? eventos : eventos.slice(0, 8);
  return (
    <div>
      <ol className="relative ml-1.5 border-l border-black/[0.08] dark:border-white/[0.1] space-y-3 py-0.5">
        {lista.map((e) => {
          const a = ACOES_AUDITORIA[e.acao] || { texto: e.acao, cor: 'bg-slate-400' };
          return (
            <li key={e.id} className="relative pl-4">
              <span className={`absolute -left-[5px] top-1.5 w-[9px] h-[9px] rounded-full ring-2 ring-white dark:ring-[#111b21] ${a.cor}`} />
              <p className="text-[13px] leading-snug">
                <span className="font-semibold">{e.quem}</span> {a.texto}
                {e.detalhes?.para ? <span className="text-[#667781] dark:text-[#8696a0]"> · {e.detalhes.para}</span> : null}
              </p>
              <p className="text-[11.5px] text-[#8696a0]">{quando(e.em)}</p>
            </li>
          );
        })}
      </ol>
      {eventos.length > 8 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="mt-2 text-[12.5px] text-[#008069] dark:text-[#00d4a4] font-medium cursor-pointer">
          {todos ? 'Ver menos' : `Ver tudo (${eventos.length})`}
        </button>
      )}
    </div>
  );
}

/** Quem participa do grupo: nome (quando o WhatsApp informa) e número de verdade. */
function Participantes({ conversaId }) {
  const [lista, setLista] = useState(null);
  const [todos, setTodos] = useState(false);
  const [filtro, setFiltro] = useState('');
  useEffect(() => {
    let vivo = true;
    fetchParticipantesConversa(conversaId)
      .then((r) => vivo && setLista(r.participantes || []))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
  }, [conversaId]);
  if (!lista) return <Spinner />;
  if (!lista.length) return <p className="text-[13px] text-[#667781] dark:text-[#8696a0]">O WhatsApp não liberou a lista deste grupo (o número pode ter saído dele). Quem escrever aqui aparece nesta lista.</p>;
  const f = filtro.trim().toLowerCase();
  const filtrados = f ? lista.filter((p) => String(p.nome || '').toLowerCase().includes(f) || String(p.telefone || '').includes(f.replace(/\D/g, '') || '§')) : lista;
  const mostrados = todos || f ? filtrados : filtrados.slice(0, 12);
  return (
    <div>
      {lista.length > 8 && <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar participante" aria-label="Buscar participante" className="w-full h-9 mb-2 rounded-lg px-3 bg-[#f0f2f5] dark:bg-[#202c33] outline-none text-[13.5px]" />}
      <ul className="space-y-0.5">
        {mostrados.map((p) => (
          <li key={p.jid} className="flex items-center gap-2.5 py-1.5">
            <span className="w-8 h-8 rounded-full bg-[#dfe5e7] dark:bg-[#2a3942] text-[#54656f] dark:text-[#aebac1] flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
              {String(p.nome || '#')
                .split(/\s+/)
                .slice(0, 2)
                .map((x) => x[0])
                .join('')
                .toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium truncate">{p.nome || (p.telefone ? formatarTelefone(p.telefone) : 'Participante')}</span>
              <span className="block text-[12px] text-[#667781] dark:text-[#8696a0] tabular-nums">{p.telefone ? formatarTelefone(p.telefone) : 'Número oculto pelo WhatsApp'}</span>
            </span>
            {p.admin && <span className="text-[10.5px] font-semibold text-[#008069] dark:text-[#00d4a4] bg-[#00a884]/12 rounded-md px-1.5 py-0.5">Admin</span>}
          </li>
        ))}
      </ul>
      {!f && filtrados.length > 12 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="mt-1.5 text-[12.5px] text-[#008069] dark:text-[#00d4a4] font-medium cursor-pointer">
          {todos ? 'Ver menos' : `Ver todos (${filtrados.length})`}
        </button>
      )}
    </div>
  );
}

const ROTULO_STATUS = { aguardando: 'Na fila', em_atendimento: 'Em atendimento', aguardando_cliente: 'Aguardando cliente', resolvida: 'Resolvida' };

function Secao({ titulo, children }) {
  return (
    <section className="px-5 py-4 border-t border-black/[0.06] dark:border-white/[0.06]">
      <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-[#667781] dark:text-[#8696a0] mb-2">{titulo}</h3>
      {children}
    </section>
  );
}

/** Ficha do contato ao lado da conversa: foto, nome, empresa ligada, etiquetas, observações e conversas. */
export default function ChatPerfilContato({ contatoId, conversaAtualId, Avatar, onFechar, onMudou, onAbrirConversa, admin = false, onExcluida }) {
  const [excluindo, setExcluindo] = useState(false);
  const excluir = async () => {
    if (!window.confirm('Excluir esta conversa inteira? Todas as mensagens e arquivos dela serão apagados do RM Controle, sem volta. O WhatsApp do cliente não muda. O registro da exclusão fica na auditoria.')) return;
    setExcluindo(true);
    try {
      await acaoConversa(conversaAtualId, { acao: 'excluir' });
      showToast('Conversa excluída.', 'success');
      onExcluida?.();
    } catch (e) {
      showToast(e.message, 'error');
      setExcluindo(false);
    }
  };
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [versaoFoto, setVersaoFoto] = useState(0);
  const [nome, setNome] = useState('');
  const [editandoNome, setEditandoNome] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [novaEtiqueta, setNovaEtiqueta] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [buscaEmpresa, setBuscaEmpresa] = useState('');
  const [escolhendoEmpresa, setEscolhendoEmpresa] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    fetchContatoChat(contatoId)
      .then((r) => {
        if (!vivo) return;
        setDados(r);
        setNome(r.contato.nome || '');
        setObservacoes(r.contato.observacoes || '');
        // Sem foto ainda: pergunta ao WhatsApp uma vez
        if (!r.contato.tem_foto)
          atualizarFotoContato(contatoId)
            .then((f) => {
              if (vivo && f.tem_foto) {
                setDados((d) => (d ? { ...d, contato: { ...d.contato, tem_foto: true } } : d));
                setVersaoFoto((v) => v + 1);
                onMudou?.({ id: contatoId, tem_foto: true });
              }
            })
            .catch(() => {});
      })
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatoId]);

  useEffect(() => {
    if (!escolhendoEmpresa || empresas.length) return;
    getEmpresas({ pageSize: 1000 }).then((res) => {
      const lista = Array.isArray(res) ? res : res?.items || [];
      setEmpresas([...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })));
    });
  }, [escolhendoEmpresa, empresas.length]);

  const salvar = async (campos, sucesso) => {
    try {
      const r = await salvarContatoChat({ id: contatoId, ...campos });
      setDados((d) => ({ ...r, contato: { ...r.contato, tem_foto: d?.contato?.tem_foto ?? r.contato.tem_foto } }));
      onMudou?.({ id: contatoId, nome: r.contato.nome, etiquetas: r.contato.etiquetas, empresa_id: r.contato.empresa_id });
      if (sucesso) showToast(sucesso, 'success');
      return r;
    } catch (e) {
      showToast(e.message, 'error');
      return null;
    }
  };

  const empresasFiltradas = useMemo(() => {
    const b = buscaEmpresa.trim().toLowerCase();
    return (b ? empresas.filter((e) => String(e.nome || '').toLowerCase().includes(b)) : empresas).slice(0, 30);
  }, [empresas, buscaEmpresa]);

  const contato = dados?.contato;
  const grupo = ehGrupo(contato?.telefone);
  const etiquetas = contato?.etiquetas || [];

  return (
    <motion.aside
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ type: 'spring', bounce: 0.1, duration: 0.35 }}
      className="absolute xl:static inset-y-0 right-0 z-20 w-full sm:w-[370px] xl:w-[360px] flex-shrink-0 flex flex-col bg-white dark:bg-[#111b21] border-l border-black/[0.07] dark:border-white/[0.06] shadow-[-20px_0_40px_-24px_rgba(0,0,0,0.25)] xl:shadow-none"
      aria-label="Perfil do contato"
    >
      <header className="h-[60px] flex-shrink-0 flex items-center gap-3 px-4 bg-[#f0f2f5] dark:bg-[#202c33]">
        <button type="button" onClick={onFechar} aria-label="Fechar perfil" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span className="text-[15.5px] font-medium text-[#111b21] dark:text-[#e9edef]">{grupo ? 'Dados do grupo' : 'Dados do contato'}</span>
      </header>

      {erro ? (
        <p className="m-5 text-[13.5px] text-rose-600">{erro}</p>
      ) : !contato ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <Spinner />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center text-center px-5 pt-7 pb-5">
            <Avatar conversa={{ contato: { ...contato, tem_foto: contato.tem_foto } }} tamanho="w-[120px] h-[120px] text-[36px]" versao={versaoFoto} />
            {editandoNome ? (
              <form
                className="mt-4 w-full flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await salvar({ nome }, 'Nome salvo.')) setEditandoNome(false);
                }}
              >
                <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus placeholder="Nome" className="flex-1 h-10 rounded-lg px-3 bg-[#f0f2f5] dark:bg-[#202c33] outline-none focus:ring-2 focus:ring-[#00a884]/40 text-[15px]" />
                <button type="submit" className="h-10 px-4 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold cursor-pointer">
                  Salvar
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setEditandoNome(true)} className="group mt-4 inline-flex items-center gap-2 cursor-pointer" title="Editar nome">
                <span className="text-[21px] font-medium text-[#111b21] dark:text-[#e9edef]">{contato.nome || (grupo ? 'Grupo sem nome' : 'Sem nome')}</span>
                <svg className="w-4 h-4 text-[#8696a0] opacity-60 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
            )}
            {grupo ? (
              <p className="mt-1 text-[14px] text-[#667781] dark:text-[#8696a0]">Grupo do WhatsApp</p>
            ) : (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(formatarTelefone(contato.telefone)).then(() => showToast('Número copiado.', 'success'))}
                className="mt-1 text-[15px] text-[#667781] dark:text-[#8696a0] tabular-nums hover:text-[#111b21] dark:hover:text-[#e9edef] cursor-pointer"
                title="Copiar número"
              >
                {formatarTelefone(contato.telefone)}
              </button>
            )}
          </div>

          {grupo && conversaAtualId && (
            <Secao titulo="Participantes">
              <Participantes conversaId={conversaAtualId} />
            </Secao>
          )}

          <Secao titulo="Empresa">
            {escolhendoEmpresa ? (
              <div>
                <input value={buscaEmpresa} onChange={(e) => setBuscaEmpresa(e.target.value)} autoFocus placeholder="Buscar empresa" className="w-full h-9 rounded-lg px-3 bg-[#f0f2f5] dark:bg-[#202c33] outline-none text-[14px]" />
                <ul className="mt-1.5 max-h-[220px] overflow-y-auto">
                  {empresasFiltradas.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={async () => {
                          await salvar({ empresa_id: e.id }, 'Empresa ligada ao contato.');
                          setEscolhendoEmpresa(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-[14px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer truncate"
                      >
                        {e.nome}
                      </button>
                    </li>
                  ))}
                  {empresas.length === 0 && <li className="px-2.5 py-2 text-[13px] text-slate-400">Carregando…</li>}
                </ul>
                <button type="button" onClick={() => setEscolhendoEmpresa(false)} className="mt-1 text-[13px] text-[#667781] cursor-pointer">
                  Cancelar
                </button>
              </div>
            ) : dados.empresa ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[14.5px] font-medium truncate">{dados.empresa.nome}</span>
                <button type="button" onClick={() => setEscolhendoEmpresa(true)} className="text-[13px] text-[#008069] dark:text-[#00d4a4] cursor-pointer">
                  Trocar
                </button>
                <button type="button" onClick={() => salvar({ empresa_id: null }, 'Empresa desligada.')} className="text-[13px] text-rose-600 dark:text-rose-400 cursor-pointer">
                  Tirar
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setEscolhendoEmpresa(true)} className="text-[14px] text-[#008069] dark:text-[#00d4a4] font-medium cursor-pointer">
                + Ligar a uma empresa cliente
              </button>
            )}
          </Secao>

          <Secao titulo="Etiquetas">
            <div className="flex flex-wrap gap-1.5">
              {etiquetas.map((t) => (
                <span key={t} className="h-7 pl-2.5 pr-1 rounded-full bg-[#00a884]/12 text-[#00694f] dark:text-[#00d4a4] text-[12.5px] font-medium inline-flex items-center gap-1">
                  {t}
                  <button type="button" onClick={() => salvar({ etiquetas: etiquetas.filter((x) => x !== t) })} aria-label={`Tirar etiqueta ${t}`} className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center cursor-pointer">
                    ×
                  </button>
                </span>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = novaEtiqueta.trim();
                  if (!t) return;
                  setNovaEtiqueta('');
                  salvar({ etiquetas: [...etiquetas, t] });
                }}
              >
                <input value={novaEtiqueta} onChange={(e) => setNovaEtiqueta(e.target.value)} maxLength={30} placeholder="+ etiqueta" aria-label="Nova etiqueta" className="h-7 w-[110px] rounded-full px-3 bg-[#f0f2f5] dark:bg-[#202c33] outline-none text-[12.5px] focus:w-[150px] transition-all" />
              </form>
            </div>
          </Secao>

          <Secao titulo="Observações">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              onBlur={() => observacoes !== (contato.observacoes || '') && salvar({ observacoes }, 'Observações salvas.')}
              rows={4}
              maxLength={2000}
              placeholder="Anotações sobre o contato (só a equipe vê)"
              className="w-full rounded-lg px-3 py-2.5 bg-[#f0f2f5] dark:bg-[#202c33] outline-none focus:ring-2 focus:ring-[#00a884]/40 text-[14px] resize-none"
            />
          </Secao>

          <Secao titulo={`Conversas (${dados.total_conversas})`}>
            <ul className="space-y-1">
              {dados.conversas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => c.id !== conversaAtualId && onAbrirConversa?.(c.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[13px] ${c.id === conversaAtualId ? 'bg-[#00a884]/10' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{ROTULO_STATUS[c.status]}</span>
                      <span className="text-[#8696a0]">·</span>
                      <span className="text-[#667781] dark:text-[#8696a0]">{new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>
                      {c.id === conversaAtualId && <span className="ml-auto text-[11px] text-[#008069] dark:text-[#00d4a4] font-semibold">atual</span>}
                    </span>
                    <span className="block text-[12px] text-[#8696a0] truncate">
                      {c.canal?.nome}
                      {c.responsavel_nome ? ` · ${c.responsavel_nome}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Secao>

          {admin && conversaAtualId && (
            <>
              <Secao titulo="Auditoria desta conversa">
                <Auditoria conversaId={conversaAtualId} />
              </Secao>
              <section className="px-5 py-5 border-t border-black/[0.06] dark:border-white/[0.06]">
                <button type="button" onClick={excluir} disabled={excluindo} className="w-full h-10 rounded-xl text-[14px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/[0.08] ring-1 ring-rose-500/30 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                  {excluindo && <Spinner />}
                  Excluir conversa
                </button>
                <p className="mt-2 text-[11.5px] text-[#8696a0] text-center">Apaga as mensagens e os arquivos desta conversa. O contato continua salvo.</p>
              </section>
            </>
          )}
        </div>
      )}
    </motion.aside>
  );
}
