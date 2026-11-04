'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buscarMensagensChat, getEmpresas, getFilaChamados, getPermissoesAtuais, getNomeTecnico, removerAcentos } from '@/lib/storage';
import { podeVerDemanda } from '@/lib/perfis';
import { ehGrupo } from '@/lib/canais';

// ------------------------------------------------------------------------------
// Busca única da ilha do cabeçalho (vale em todas as telas). A lupa fica no começo da ilha; ao abrir, o campo
// cresce para o lado e o painel desce logo abaixo. Empresas, demandas e conversas aparecem na hora (já estão no
// navegador); mensagens vão ao servidor depois de uma pausa na digitação (e só com 3 letras ou mais).
// ------------------------------------------------------------------------------
const MOLA_CAMPO = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 };
const MOLA_PAINEL = { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 };
const norm = (t) => removerAcentos(String(t || '').toLowerCase().trim());
const digitos = (t) => String(t || '').replace(/\D/g, '');
const iniciais = (nome) => String(nome || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';

const ABAS = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'empresas', rotulo: 'Empresas' },
  { id: 'demandas', rotulo: 'Demandas' },
  { id: 'conversas', rotulo: 'Conversas' },
  { id: 'mensagens', rotulo: 'Mensagens' },
];
// A busca abre já filtrada pelo que faz sentido na tela onde a pessoa está
const ABA_DA_TELA = { chat: 'conversas', fila: 'empresas', agenda: 'empresas', dashboard: 'empresas', daily: 'empresas', comercial: 'empresas' };

// Lista de empresas carregada uma vez (na primeira busca) e reaproveitada
let CACHE_EMPRESAS = { em: 0, lista: null };
async function carregarEmpresas() {
  if (CACHE_EMPRESAS.lista && Date.now() - CACHE_EMPRESAS.em < 5 * 60 * 1000) return CACHE_EMPRESAS.lista;
  const r = await getEmpresas({ pageSize: 1000 });
  const lista = Array.isArray(r) ? r : r?.items || [];
  CACHE_EMPRESAS = { em: Date.now(), lista };
  return lista;
}

const Lupa = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const Marcar = ({ texto, termo }) => {
  const t = String(texto || '');
  const i = termo ? norm(t).indexOf(norm(termo)) : -1;
  if (i < 0 || norm(t).length !== t.length) return <>{t}</>;
  return (
    <>
      {t.slice(0, i)}
      <mark className="bg-amber-300/50 dark:bg-amber-400/30 text-inherit rounded-sm">{t.slice(i, i + termo.length)}</mark>
      {t.slice(i + termo.length)}
    </>
  );
};

const BTN = 'h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap cursor-pointer transition-colors';
const BTN_SUAVE = `${BTN} ring-1 ring-inset ring-black/15 dark:ring-white/20 text-[#1d1d1f] dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/10`;
const BTN_FORTE = `${BTN} bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90`;

/**
 * aberta / onAbertaChange: estado da busca (a ilha também reage a ele); abaAtual: tela de fundo;
 * getConversas(): conversas do Chat já em memória; onAcao({ tipo, ... }): o que fazer com o resultado escolhido.
 */
export default function BuscaGlobal({ aberta, onAbertaChange, abaAtual, userEmail, getConversas, onAcao }) {
  const [termo, setTermo] = useState('');
  const [aba, setAba] = useState('tudo');
  const [ativo, setAtivo] = useState(0);
  const [empresas, setEmpresas] = useState(CACHE_EMPRESAS.lista || []);
  const [mensagens, setMensagens] = useState({ estado: 'parado', itens: [] });
  const [, forcar] = useState(0);
  const campo = useRef(null);
  const caixa = useRef(null);
  const painel = useRef(null);
  const pedido = useRef(0);

  const abrir = useCallback(() => {
    setAba(ABA_DA_TELA[abaAtual] || 'tudo');
    onAbertaChange(true);
  }, [abaAtual, onAbertaChange]);
  const fechar = useCallback(() => {
    onAbertaChange(false);
    setTermo('');
    setAtivo(0);
    setMensagens({ estado: 'parado', itens: [] });
  }, [onAbertaChange]);

  // Atalhos: "/" e Ctrl/Cmd+K abrem; Esc fecha
  useEffect(() => {
    const tecla = (e) => {
      const digitando = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable);
      if ((e.key === '/' && !digitando && !e.metaKey && !e.ctrlKey && !e.altKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (!aberta) abrir();
        else campo.current?.focus();
      } else if (e.key === 'Escape' && aberta) {
        fechar();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta, abrir, fechar]);

  // Clicar fora fecha
  useEffect(() => {
    if (!aberta) return undefined;
    const fora = (e) => {
      if (caixa.current?.contains(e.target) || painel.current?.contains(e.target)) return;
      fechar();
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberta, fechar]);

  // Ao abrir: foca o campo e carrega as empresas (uma vez)
  useEffect(() => {
    if (!aberta) return;
    requestAnimationFrame(() => campo.current?.focus());
    if (!CACHE_EMPRESAS.lista) carregarEmpresas().then(setEmpresas).catch(() => {});
    else setEmpresas(CACHE_EMPRESAS.lista);
    forcar((n) => n + 1);
  }, [aberta]);

  const q = norm(termo);
  const qNum = digitos(termo);

  // Mensagens: só no servidor, com pausa na digitação; resposta atrasada é descartada
  useEffect(() => {
    if (!aberta || q.length < 3 || !['tudo', 'mensagens'].includes(aba)) {
      setMensagens({ estado: 'parado', itens: [] });
      return undefined;
    }
    const id = ++pedido.current;
    setMensagens((m) => ({ ...m, estado: 'buscando' }));
    const t = setTimeout(() => {
      buscarMensagensChat(termo.trim(), 30)
        .then((r) => id === pedido.current && setMensagens({ estado: 'pronto', itens: r?.resultados || [] }))
        .catch(() => id === pedido.current && setMensagens({ estado: 'erro', itens: [] }));
    }, 300);
    return () => clearTimeout(t);
  }, [aberta, q, aba, termo]);

  const perm = useMemo(() => (aberta ? getPermissoesAtuais(userEmail) : null), [aberta, userEmail]);
  const limite = aba === 'tudo' ? 4 : 20;
  const conversas = aberta ? getConversas?.() || [] : [];

  const grupoDaEmpresa = (emp) => {
    const dela = conversas.filter((c) => c.contato?.empresa_id && c.contato.empresa_id === emp.id);
    return dela.find((c) => ehGrupo(c.contato?.telefone)) || dela[0] || null;
  };

  const resultados = useMemo(() => {
    if (!aberta || !q) return { empresas: [], demandas: [], conversas: [], mensagens: [] };
    const fila = (getFilaChamados() || []).filter((c) => !perm || podeVerDemanda(perm, c));
    const abertas = (c) => ['aguardando_visualizacao', 'em_andamento', 'pendente'].includes(c.status);
    const emp = empresas
      .map((e) => {
        const n = norm(e.nome);
        const i = n.indexOf(q);
        return i < 0 ? null : { e, peso: i === 0 ? 0 : 1 };
      })
      .filter(Boolean)
      .sort((a, b) => a.peso - b.peso || (a.e.nome || '').localeCompare(b.e.nome || '', 'pt-BR'))
      .map((r) => ({
        tipo: 'empresa',
        empresa: r.e,
        abertas: fila.filter((c) => abertas(c) && (c.empresa_id === r.e.id || norm(c.empresa_nome) === norm(r.e.nome))).length,
        conversa: grupoDaEmpresa(r.e),
      }));
    const dem = fila
      .filter((c) => abertas(c) && norm(`${c.empresa_nome} ${c.observacao_inicial || ''} ${getNomeTecnico(c.tecnico_email) || ''}`).includes(q))
      .map((c) => ({ tipo: 'demanda', chamado: c }));
    const conv = conversas
      .filter((c) => norm(c.contato?.nome).includes(q) || (qNum.length >= 3 && digitos(c.contato?.telefone).includes(qNum)))
      .map((c) => ({ tipo: 'conversa', conversa: c }));
    const msg = mensagens.itens.map((m) => ({ tipo: 'mensagem', mensagem: m }));
    return { empresas: emp, demandas: dem, conversas: conv, mensagens: msg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, q, qNum, empresas, mensagens.itens, perm]);

  const existeExata = resultados.empresas.some((r) => norm(r.empresa.nome) === q);
  const podeCriar = termo.trim().length >= 2 && !existeExata && ['tudo', 'empresas'].includes(aba);

  // Lista plana (para navegar com as setas) na mesma ordem da tela
  const secoes = [
    ['Empresas', 'empresas', ['tudo', 'empresas']],
    ['Demandas', 'demandas', ['tudo', 'demandas']],
    ['Conversas e contatos', 'conversas', ['tudo', 'conversas']],
    ['Mensagens', 'mensagens', ['tudo', 'mensagens']],
  ]
    .filter(([, , abas]) => abas.includes(aba))
    .map(([titulo, chave]) => ({ titulo, chave, itens: resultados[chave].slice(0, limite), total: resultados[chave].length }))
    .filter((s) => s.itens.length);
  const plana = secoes.flatMap((s) => s.itens);
  if (podeCriar) plana.push({ tipo: 'criar', nome: termo.trim() });

  useEffect(() => setAtivo(0), [q, aba]);

  const executar = (item, tipoAcao) => {
    const acao =
      item.tipo === 'empresa'
        ? { tipo: tipoAcao || 'abrir_demanda', empresa: item.empresa, conversaId: item.conversa?.id }
        : item.tipo === 'demanda'
          ? { tipo: 'abrir_demanda_existente', chamado: item.chamado }
          : item.tipo === 'conversa'
            ? { tipo: 'abrir_conversa', conversaId: item.conversa.id }
            : item.tipo === 'mensagem'
              ? { tipo: 'abrir_conversa', conversaId: item.mensagem.conversa_id }
              : { tipo: 'criar_empresa', nome: item.nome };
    fechar();
    onAcao?.(acao);
  };

  const aoTeclar = (e) => {
    if (!plana.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((a) => (a + 1) % plana.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => (a - 1 + plana.length) % plana.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (plana[ativo]) executar(plana[ativo]);
    }
  };
  // Mantém o item ativo à vista ao navegar com as setas
  useEffect(() => {
    painel.current?.querySelector('[data-ativo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [ativo]);

  const linhaBase = (i) => `flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${plana[ativo] && plana.indexOf(plana[ativo]) === i ? 'bg-black/[0.05] dark:bg-white/[0.08]' : ''}`;
  let contador = -1;
  const proximo = () => {
    contador += 1;
    return contador;
  };

  const mono = (nome) => (
    <span className="w-9 h-9 rounded-full ring-1 ring-black/15 dark:ring-white/20 text-[12px] font-medium text-slate-500 dark:text-zinc-400 flex items-center justify-center flex-shrink-0" aria-hidden="true">
      {iniciais(nome)}
    </span>
  );

  const renderItem = (item, idx) => {
    const marca = { 'data-ativo': plana[ativo] === item ? 'true' : 'false', onMouseMove: () => setAtivo(idx) };
    if (item.tipo === 'empresa') {
      const e = item.empresa;
      return (
        <li key={`e-${e.id || e.nome}`} className={linhaBase(idx)} {...marca}>
          {mono(e.nome)}
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => executar(item, 'ver_empresa')} className="block max-w-full text-left text-[14px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate hover:underline cursor-pointer">
              <Marcar texto={e.nome} termo={termo.trim()} />
            </button>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 truncate">
              {[e.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1', item.abertas ? `${item.abertas} ${item.abertas === 1 ? 'demanda aberta' : 'demandas abertas'}` : 'sem demandas abertas', item.conversa ? (ehGrupo(item.conversa.contato?.telefone) ? 'grupo ligado' : 'conversa ligada') : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={() => executar(item, 'abrir_demanda')} className={BTN_FORTE}>
              Abrir demanda
            </button>
            <button type="button" onClick={() => executar(item, 'retroativo')} className={BTN_SUAVE}>
              Retroativo
            </button>
            {item.conversa && (
              <button type="button" onClick={() => executar(item, 'abrir_conversa')} className={BTN_SUAVE}>
                Chat
              </button>
            )}
          </div>
        </li>
      );
    }
    if (item.tipo === 'demanda') {
      const c = item.chamado;
      return (
        <li key={`d-${c.id}`} className={linhaBase(idx)} {...marca}>
          <span className="w-9 h-9 rounded-full ring-1 ring-black/15 dark:ring-white/20 flex items-center justify-center flex-shrink-0 text-slate-500 dark:text-zinc-400" aria-hidden="true">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13.5h4.2l1.6 2.5h6.4l1.6-2.5H21" /><path d="M5.3 5.6L3 13.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5l-2.3-7.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.9 1.6z" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate">{c.empresa_nome}</p>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 truncate"><Marcar texto={c.observacao_inicial || 'Sem descrição'} termo={termo.trim()} /></p>
          </div>
          <span className="text-[12px] text-slate-400 dark:text-zinc-400 whitespace-nowrap">{c.status === 'em_andamento' ? 'em atendimento' : c.status === 'pendente' ? 'aguardando cliente' : 'aguardando'}</span>
          <button type="button" onClick={() => executar(item)} className={BTN_SUAVE}>
            Abrir
          </button>
        </li>
      );
    }
    if (item.tipo === 'conversa') {
      const c = item.conversa;
      return (
        <li key={`c-${c.id}`} className={linhaBase(idx)} {...marca}>
          {mono(c.contato?.nome)}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate"><Marcar texto={c.contato?.nome || c.contato?.telefone} termo={termo.trim()} /></p>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 truncate">{ehGrupo(c.contato?.telefone) ? 'Grupo' : 'Contato'}{c.canal?.nome ? ` · ${c.canal.nome}` : ''}{c.ultima_mensagem_texto ? ` · ${String(c.ultima_mensagem_texto).slice(0, 50)}` : ''}</p>
          </div>
          <button type="button" onClick={() => executar(item)} className={BTN_SUAVE}>
            Abrir no Chat
          </button>
        </li>
      );
    }
    if (item.tipo === 'mensagem') {
      const m = item.mensagem;
      return (
        <li key={`m-${m.id}`} className={linhaBase(idx)} {...marca}>
          {mono(m.conversa?.contato?.nome)}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] text-[#1d1d1f] dark:text-white truncate"><Marcar texto={String(m.conteudo || '').slice(0, 140)} termo={termo.trim()} /></p>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 truncate">{m.conversa?.contato?.nome || 'Conversa'} · {m.criado_em ? new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : ''}</p>
          </div>
          <button type="button" onClick={() => executar(item)} className={BTN_SUAVE}>
            Ver conversa
          </button>
        </li>
      );
    }
    return (
      <li key="criar" className={linhaBase(idx)} {...marca}>
        <span className="w-9 h-9 rounded-full ring-1 ring-black/15 dark:ring-white/20 flex items-center justify-center text-lg text-slate-500 flex-shrink-0" aria-hidden="true">+</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white truncate">Cadastrar “{item.nome}” e abrir demanda</p>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400">Cria a empresa agora; o resto dá para completar depois.</p>
        </div>
        <button type="button" onClick={() => executar(item)} className={BTN_FORTE}>
          Cadastrar
        </button>
      </li>
    );
  };

  const vazio = q && !plana.length && mensagens.estado !== 'buscando';

  return (
    <>
      {/* Campo: a lupa cresce para o lado e vira o campo de texto */}
      <motion.div
        ref={caixa}
        initial={false}
        animate={{ width: aberta ? 300 : 40 }}
        transition={MOLA_CAMPO}
        className={`h-10 rounded-full flex items-center overflow-hidden flex-shrink-0 transition-colors duration-300 ${aberta ? 'bg-black/[0.05] dark:bg-white/[0.1]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]'}`}
      >
        <button
          type="button"
          onClick={() => (aberta ? campo.current?.focus() : abrir())}
          aria-label="Buscar empresa, demanda, conversa ou mensagem"
          aria-expanded={aberta}
          className="w-10 h-10 flex items-center justify-center flex-shrink-0 text-slate-500 dark:text-zinc-400 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-acento/40 rounded-full"
        >
          <Lupa />
        </button>
        <input
          ref={campo}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={aoTeclar}
          tabIndex={aberta ? 0 : -1}
          placeholder="Buscar em tudo…"
          aria-label="Buscar"
          autoComplete="off"
          style={{ boxShadow: "none", border: "none", outline: "none" }}
          className="flex-1 min-w-0 pr-3 bg-transparent text-[14px] text-[#1d1d1f] dark:text-white placeholder:text-slate-400 outline-none"
        />
      </motion.div>

      {/* Painel: desce logo abaixo da ilha */}
      <AnimatePresence>
        {aberta && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-50 w-[min(720px,calc(100vw-32px))]">
            <motion.div
              ref={painel}
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.14 } }}
              transition={MOLA_PAINEL}
              style={{ transformOrigin: 'top center' }}
              className="rounded-[28px] bg-white/90 dark:bg-rm-elevado-escuro/90 backdrop-blur-2xl border border-black/[0.07] dark:border-white/[0.11] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.3)] dark:shadow-[0_28px_70px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
              role="dialog"
              aria-label="Busca"
            >
              <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-2 overflow-x-auto [scrollbar-width:none]" role="tablist">
                {ABAS.map((a) => (
                  <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => { setAba(a.id); campo.current?.focus(); }} className={`relative h-8 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors ${aba === a.id ? 'text-white dark:text-[#1d1d1f]' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'}`}>
                    {aba === a.id && <motion.span layoutId="busca-aba" transition={MOLA_CAMPO} className="absolute inset-0 rounded-full bg-[#1d1d1f] dark:bg-white" />}
                    <span className="relative">{a.rotulo}</span>
                  </button>
                ))}
                <span className="ml-auto hidden sm:block text-[11.5px] text-slate-400 dark:text-zinc-500 whitespace-nowrap">↑ ↓ navegar · Enter abre · Esc fecha</span>
              </div>

              <div className="max-h-[min(60vh,520px)] overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
                {!q && <p className="px-3 py-8 text-center text-[13.5px] text-slate-500 dark:text-zinc-400">Digite o nome de uma empresa, de um contato ou um trecho de demanda ou de mensagem.</p>}
                {vazio && <p className="px-3 py-8 text-center text-[13.5px] text-slate-500 dark:text-zinc-400">Nada encontrado para “{termo.trim()}”.</p>}
                {secoes.map((s) => (
                  <section key={s.chave}>
                    {aba === 'tudo' && (
                      <h4 className="px-3 pt-3 pb-1 text-[12px] font-medium text-slate-400 dark:text-zinc-500">
                        {s.titulo}
                        {s.total > s.itens.length && (
                          <button type="button" onClick={() => setAba(s.chave)} className="ml-2 text-slate-500 dark:text-zinc-400 hover:underline cursor-pointer">ver mais ({s.total})</button>
                        )}
                      </h4>
                    )}
                    <ul>{s.itens.map((it) => renderItem(it, proximo()))}</ul>
                  </section>
                ))}
                {q.length >= 3 && ['tudo', 'mensagens'].includes(aba) && mensagens.estado === 'buscando' && (
                  <p className="px-3 py-3 text-[12.5px] text-slate-400 dark:text-zinc-500">Procurando nas mensagens…</p>
                )}
                {mensagens.estado === 'erro' && <p className="px-3 py-3 text-[12.5px] text-slate-400 dark:text-zinc-500">Não deu para buscar nas mensagens agora.</p>}
                {podeCriar && <ul className="mt-1 border-t border-black/[0.06] dark:border-white/[0.1] pt-1">{renderItem(plana[plana.length - 1], plana.length - 1)}</ul>}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
