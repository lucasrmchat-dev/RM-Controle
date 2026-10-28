'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChipTempo, ESTADOS, infoDemanda, ordenarPorPrioridade } from './FilaDemandasVisoes';
import { getSomDoModulo, pararSomDoModulo, playNotificationTone } from '@/lib/audioNotifications';
import { EVENTO_FOCO, MODOS_FOCO, definirEfeitosDoFoco, efeitosDoFoco, efeitosDoModo, lerPreferenciaFoco, salvarPreferenciaFoco } from '@/lib/modoFoco';

// ------------------------------------------------------------------------------
// Modo foco (Demandas): uma demanda por vez, em tela cheia e sem rolagem, com progresso da sessão,
// comemoração a cada conclusão e atalhos de teclado. A sessão sobrevive a ir à empresa e voltar.
// Três modos (src/lib/modoFoco.js): apenas a tela, parcial (a pessoa escolhe o que pausar) e total.
// ------------------------------------------------------------------------------
const CHAVE_SESSAO = 'rm_modo_foco';
const MOLA = { type: 'spring', bounce: 0.25, duration: 0.55 };
const FRASES = ['Mandou bem!', 'Uma a menos!', 'Isso aí!', 'Que ritmo!', 'Seguindo firme!', 'Excelente!', 'Arrasou!', 'Mais uma!'];

const lerSessao = () => {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null');
  } catch {
    return null;
  }
};
const gravarSessao = (s) => {
  try {
    if (s) sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {}
};
/** A sessão de foco estava aberta (ex.: a pessoa foi à empresa e voltou)? Sem sessão, desfaz efeitos esquecidos. */
export const focoEmAndamento = () => {
  if (typeof window === 'undefined') return false;
  const ativo = Boolean(lerSessao()?.ativo);
  if (!ativo && efeitosDoFoco().modo !== 'apenas') definirEfeitosDoFoco(null);
  return ativo;
};

function Interruptor({ ligado, onMudar, titulo, descricao }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => onMudar(!ligado)} className="w-full flex items-center gap-3 py-2 text-left cursor-pointer">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[#1d1d1f] dark:text-zinc-100">{titulo}</span>
        <span className="block text-[11.5px] text-slate-500 dark:text-zinc-400">{descricao}</span>
      </span>
      <span className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${ligado ? 'bg-rm-acento-medio' : 'bg-black/15 dark:bg-white/20'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

/** Botão "Modo foco" com a lista dos modos (apenas, parcial e total). onEntrar() abre a tela de foco. */
export function SeletorModoFoco({ onEntrar, className = '' }) {
  const [aberto, setAberto] = useState(false);
  const [pref, setPref] = useState(lerPreferenciaFoco);
  const [escolha, setEscolha] = useState(null);
  const caixa = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => !caixa.current?.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('pointerdown', fora);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      window.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const entrar = (modo) => {
    const nova = { ...pref, modo };
    setPref(nova);
    salvarPreferenciaFoco(nova);
    const efeitos = efeitosDoModo(modo, nova.parcial);
    definirEfeitosDoFoco(efeitos);
    if (efeitos.silenciarSom) ['chat', 'fila', 'reunioes'].forEach((m) => pararSomDoModulo(m));
    setAberto(false);
    onEntrar();
  };
  const mudarParcial = (campo, valor) => {
    const nova = { ...pref, parcial: { ...pref.parcial, [campo]: valor } };
    setPref(nova);
    salvarPreferenciaFoco(nova);
  };
  const parcialAberto = (escolha || pref.modo) === 'parcial';

  return (
    <div className={`relative ${className}`} ref={caixa}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          setEscolha(null);
          setAberto((v) => !v);
        }}
        aria-expanded={aberto}
        aria-haspopup="true"
        className="h-10 pl-4 pr-3 rounded-full text-xs font-bold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] shadow-sm inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
        Modo foco
        <svg className={`w-3.5 h-3.5 opacity-70 transition-transform ${aberto ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </motion.button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            className="absolute left-0 lg:left-auto lg:right-0 origin-top-left lg:origin-top-right top-[calc(100%+8px)] z-[51] w-[340px] max-w-[calc(100vw-24px)] rounded-2xl bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.1] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] p-1.5"
            role="menu"
          >
            {MODOS_FOCO.map((m) => {
              const ultimo = pref.modo === m.id;
              const parcial = m.id === 'parcial';
              return (
                <div key={m.id} className={`rounded-xl ${parcial && parcialAberto ? 'bg-black/[0.03] dark:bg-white/[0.04]' : ''}`}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => (parcial ? setEscolha(parcialAberto ? 'apenas_fechar' : 'parcial') : entrar(m.id))}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer flex gap-3"
                  >
                    <span className={`mt-0.5 w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[14px] ${m.id === 'total' ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' : m.id === 'parcial' ? 'bg-rm-acento/12 text-rm-acento dark:text-rm-acento-vivo' : 'bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300'}`} aria-hidden="true">
                      {m.id === 'total' ? '◉' : m.id === 'parcial' ? '◐' : '○'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13.5px] font-semibold text-[#1d1d1f] dark:text-zinc-100">
                        {m.titulo}
                        {ultimo && <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-slate-500 dark:text-zinc-400">último usado</span>}
                      </span>
                      <span className="block mt-0.5 text-[12px] leading-snug text-slate-500 dark:text-zinc-400">{m.descricao}</span>
                    </span>
                  </button>
                  {parcial && parcialAberto && (
                    <div className="px-3 pb-3 pl-14">
                      <Interruptor ligado={pref.parcial.silenciarSom} onMudar={(v) => mudarParcial('silenciarSom', v)} titulo="Silenciar sons" descricao="Chat, demandas e reuniões ficam sem toque." />
                      <Interruptor ligado={pref.parcial.silenciarAvisos} onMudar={(v) => mudarParcial('silenciarAvisos', v)} titulo="Pausar avisos na tela" descricao="Nada pula na tela nem pisca; tudo fica no sino." />
                      <Interruptor
                        ligado={pref.parcial.recolher}
                        onMudar={(v) => mudarParcial('recolher', v)}
                        titulo="Recolher o cabeçalho"
                        descricao={pref.parcial.recolher ? (pref.parcial.silenciarAvisos ? 'Recolhe sem notificação.' : 'Recolhe com notificação: os avisos aparecem no canto.') : 'Encoste o mouse no topo para ver de novo.'}
                      />
                      <button type="button" onClick={() => entrar('parcial')} className="mt-2 w-full h-10 rounded-full bg-rm-acento-medio text-white text-[13px] font-semibold cursor-pointer">
                        Entrar no foco parcial
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const duracao = (seg) => {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** Anel de progresso da sessão. */
function Anel({ fracao, tamanho = 44 }) {
  const r = (tamanho - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={tamanho} height={tamanho} className="-rotate-90" aria-hidden="true">
      <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-black/[0.08] dark:text-white/10" />
      <motion.circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke="rgb(var(--rm-acento-vivo))" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - fracao) }} transition={{ type: 'spring', bounce: 0, duration: 0.8 }} />
    </svg>
  );
}

/** Explosão de partículas e "+1" quando uma demanda é concluída. */
function Comemoracao({ chave, frase, sequencia }) {
  const reduzir = useReducedMotion();
  const particulas = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ i, ang: (i / 18) * Math.PI * 2 + Math.random() * 0.3, dist: 90 + Math.random() * 90, tam: 5 + Math.random() * 7, cor: ['rgb(var(--rm-acento-vivo))', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa'][i % 5] })), [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AnimatePresence>
      {chave > 0 && (
        <motion.div key={chave} className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 1.3, duration: 0.4 }}>
          {!reduzir &&
            particulas.map((p) => (
              <motion.span
                key={p.i}
                className="absolute rounded-full"
                style={{ width: p.tam, height: p.tam, background: p.cor }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
                animate={{ x: Math.cos(p.ang) * p.dist, y: Math.sin(p.ang) * p.dist, opacity: 0, scale: 1 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          <motion.div initial={{ scale: 0.5, y: 10, opacity: 0 }} animate={{ scale: 1, y: -30, opacity: 1 }} transition={MOLA} className="text-center">
            <p className="text-[64px] font-bold leading-none text-[#1d1d1f] dark:text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.25)]">+1</p>
            <p className="mt-2 text-[18px] font-semibold text-[#1d1d1f]/80 dark:text-white/90">{frase}</p>
            {sequencia >= 3 && <p className="mt-1 text-[14px] font-medium text-amber-600 dark:text-amber-300">🔥 {sequencia} seguidas</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const Tecla = ({ children }) => <kbd className="hidden sm:inline ml-1.5 px-1.5 py-0.5 rounded-md bg-black/[0.06] dark:bg-white/10 text-[10.5px] font-medium text-black/45 dark:text-white/60 font-sans">{children}</kbd>;

/**
 * chamados: lista da fila (já filtrada pelo perfil); acoes: as mesmas da Fila (assumir, concluir, abrirEmpresa);
 * eMinha(ch): a demanda é da pessoa; podeAssumir(ch): está livre ou designada a ela.
 */
export default function ModoFoco({ chamados, ctx, acoes, tempos, eMinha, onSair }) {
  // Demandas para trabalhar: as suas em atendimento, as da fila que você pode pegar e as suas aguardando cliente
  const disponiveis = useMemo(() => {
    const ativas = (chamados || []).filter((c) => ['aguardando_visualizacao', 'em_andamento', 'pendente'].includes(c.status));
    const minhasAtendendo = ordenarPorPrioridade(ativas.filter((c) => c.status === 'em_andamento' && eMinha(c)), ctx);
    // Da fila: as livres e as designadas a você (as designadas a colegas ficam com eles)
    const designadaAOutro = (c) => c.tecnico_email && c.tecnico_email !== 'geral' && !c.is_fila_geral && !eMinha(c);
    const espera = ordenarPorPrioridade(ativas.filter((c) => c.status === 'aguardando_visualizacao' && !designadaAOutro(c)), ctx);
    const minhasCliente = ordenarPorPrioridade(ativas.filter((c) => c.status === 'pendente' && eMinha(c)), ctx);
    return [...minhasAtendendo, ...espera, ...minhasCliente];
  }, [chamados, ctx, eMinha]);
  const porId = useMemo(() => new Map(disponiveis.map((c) => [String(c.id), c])), [disponiveis]);

  // Sessão: ordem das demandas, posição atual, concluídas e início (guardada para sobreviver a idas à empresa)
  const [sessao, setSessao] = useState(() => {
    const salva = typeof window !== 'undefined' ? lerSessao() : null;
    return salva?.ativo ? salva : { ativo: true, ordem: [], pos: 0, concluidas: 0, sequencia: 0, inicio: Date.now() };
  });
  useEffect(() => gravarSessao(sessao), [sessao]);

  // Mantém a ordem em dia: o que saiu da fila sai da ordem; o que chegou entra no fim
  useEffect(() => {
    setSessao((s) => {
      const ids = disponiveis.map((c) => String(c.id));
      const mantidas = s.ordem.filter((id) => porId.has(id));
      const novas = ids.filter((id) => !mantidas.includes(id));
      const ordem = [...mantidas, ...novas];
      if (ordem.join() === s.ordem.join()) return s;
      return { ...s, ordem, pos: Math.min(s.pos, Math.max(0, ordem.length - 1)) };
    });
  }, [disponiveis, porId]);

  const atualId = sessao.ordem[sessao.pos];
  const atual = atualId ? porId.get(atualId) : null;
  const info = atual ? infoDemanda(atual, ctx) : null;
  const total = sessao.concluidas + sessao.ordem.length;

  // Comemoração: quando a demanda que a pessoa mandou concluir sai da fila
  const concluindo = useRef(null);
  const [festa, setFesta] = useState({ chave: 0, frase: '', sequencia: 0 });
  useEffect(() => {
    // concluindo: { id, de } (status quando o formulário abriu); sem mudança = ainda decidindo ou cancelou
    if (!concluindo.current) return;
    const { id, de } = concluindo.current;
    const ainda = disponiveis.find((c) => String(c.id) === id);
    if (ainda && ainda.status === de) return;
    concluindo.current = null;
    if (!ainda) {
      setSessao((s) => {
        const sequencia = s.sequencia + 1;
        setFesta((f) => ({ chave: f.chave + 1, frase: FRASES[Math.floor(Math.random() * FRASES.length)], sequencia }));
        return { ...s, concluidas: s.concluidas + 1, sequencia };
      });
      try {
        if (getSomDoModulo('fila').habilitado) playNotificationTone('xilofone');
      } catch {}
    } else {
      // Ficou aguardando o cliente: vai para o fim e segue para a próxima
      setSessao((s) => ({ ...s, ordem: [...s.ordem.filter((x) => x !== id), id] }));
    }
  }, [disponiveis]);

  // Relógio da sessão
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [ocupado, setOcupado] = useState(false);
  const [direcao, setDirecao] = useState(1);
  const ir = useCallback((passo) => {
    concluindo.current = null;
    setDirecao(passo);
    setSessao((s) => (s.ordem.length ? { ...s, pos: (s.pos + passo + s.ordem.length) % s.ordem.length } : s));
  }, []);
  const paraOFinal = useCallback(() => {
    if (!atualId) return;
    concluindo.current = null;
    setDirecao(1);
    setSessao((s) => {
      const ordem = [...s.ordem.filter((x) => x !== atualId), atualId];
      return { ...s, ordem, pos: Math.min(s.pos, ordem.length - 1), sequencia: 0 };
    });
  }, [atualId]);
  const sair = useCallback(() => {
    gravarSessao(null);
    definirEfeitosDoFoco(null);
    onSair();
  }, [onSair]);

  const principal = useCallback(async () => {
    if (!atual || ocupado) return;
    if (info.estado === 'atendimento') {
      concluindo.current = { id: String(atual.id), de: atual.status };
      acoes.concluir(atual);
      return;
    }
    // Da fila (ou aguardando cliente): assume e começa, sem sair do foco
    setOcupado(true);
    try {
      await acoes.assumir(atual);
    } finally {
      setOcupado(false);
    }
  }, [atual, info, ocupado, acoes]);

  // Atalhos: → próxima · ← anterior · Enter ação principal · F para o final · E empresa · Esc sair
  useEffect(() => {
    const tecla = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
      else if (e.key === 'Enter') principal();
      else if (e.key.toLowerCase() === 'f') paraOFinal();
      else if (e.key.toLowerCase() === 'e' && atual) acoes.abrirEmpresa(atual);
      else if (e.key === 'Escape') sair();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ir, principal, paraOFinal, sair, atual, acoes]);

  const rotuloPrincipal = !info ? '' : info.estado === 'atendimento' ? 'Concluir' : info.estado === 'cliente' ? 'Retomar' : 'Começar';
  const fracao = total ? sessao.concluidas / total : 0;

  // Tela cheia de verdade: sem rolagem da página por trás; o modo em vigor decide se o cabeçalho fica
  const [efeitos, setEfeitos] = useState(efeitosDoFoco);
  useEffect(() => {
    const aoFoco = (e) => setEfeitos(e.detail || efeitosDoFoco());
    window.addEventListener(EVENTO_FOCO, aoFoco);
    const html = document.documentElement;
    const antes = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener(EVENTO_FOCO, aoFoco);
      [html.style.overflow, document.body.style.overflow] = antes;
    };
  }, []);
  const pausas = [efeitos.silenciarSom && 'sons', efeitos.silenciarAvisos && 'avisos', efeitos.recolher && 'cabeçalho'].filter(Boolean);
  const rotuloModo = { apenas: 'Modo foco', parcial: 'Foco parcial', total: 'Foco total' }[efeitos.modo] || 'Modo foco';

  const BOTAO_SUAVE = 'bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15';

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-[45] h-[100dvh] overflow-hidden overscroll-none bg-rm-fundo dark:bg-[#0b0d12] text-[#1d1d1f] dark:text-white">
      {/* Fundo vivo: luzes suaves que respiram na cor do sistema */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <motion.div className="absolute -top-40 -left-40 w-[620px] h-[620px] rounded-full blur-[120px] opacity-50 dark:opacity-100" style={{ background: 'rgb(var(--rm-acento-medio) / 0.35)' }} animate={{ x: [0, 80, 0], y: [0, 50, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full blur-[130px] bg-violet-500/15 dark:bg-violet-500/25" animate={{ x: [0, -60, 0], y: [0, -40, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className={`relative h-full flex flex-col max-w-[980px] mx-auto px-4 sm:px-8 pb-6 sm:pb-8 transition-[padding] duration-300 ${efeitos.recolher ? 'pt-6 sm:pt-8' : 'pt-6 sm:pt-[84px] lg:pt-[92px]'}`}>
        {/* Barra da sessão */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="relative flex items-center justify-center">
            <Anel fracao={fracao} />
            <span className="absolute text-[12px] font-bold tabular-nums">{sessao.concluidas}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-wide uppercase text-black/45 dark:text-white/50">
              {rotuloModo}
              {pausas.length > 0 && <span className="normal-case tracking-normal font-medium"> · {pausas.join(', ')} em pausa</span>}
            </p>
            <p className="text-[15px] font-medium">
              <motion.span key={sessao.concluidas} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-block tabular-nums">
                {sessao.concluidas}
              </motion.span>{' '}
              concluída{sessao.concluidas === 1 ? '' : 's'} · {sessao.ordem.length} pela frente
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline text-[13px] tabular-nums text-black/45 dark:text-white/50" title="Tempo nesta sessão">
              ⏱ {duracao(Math.floor((agora - sessao.inicio) / 1000))}
            </span>
            <button type="button" onClick={sair} className={`h-10 px-4 rounded-full ${BOTAO_SUAVE} text-[13px] font-medium cursor-pointer whitespace-nowrap`}>
              Sair do foco <Tecla>Esc</Tecla>
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden flex-shrink-0">
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, rgb(var(--rm-acento-medio)), rgb(var(--rm-acento-vivo)))' }} initial={false} animate={{ width: `${Math.round(fracao * 100)}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.8 }} />
        </div>

        {/* A demanda da vez */}
        <div className="flex-1 min-h-0 flex flex-col justify-center py-4 sm:py-6">
          <AnimatePresence mode="wait" custom={direcao}>
            {atual ? (
              <motion.article
                key={atual.id}
                custom={direcao}
                initial={{ opacity: 0, x: direcao * 60, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: direcao * -60, scale: 0.98 }}
                transition={MOLA}
                className="max-h-full flex flex-col rounded-[32px] bg-white/80 dark:bg-white/[0.06] backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/10 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.35)] dark:shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] p-6 sm:p-10"
              >
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] flex-shrink-0">
                  <span className="text-black/40 dark:text-white/45 tabular-nums">
                    {sessao.pos + 1} de {sessao.ordem.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-black/[0.05] dark:bg-white/10">
                    <span className={`w-2 h-2 rounded-full ${ESTADOS[info.estado]?.ponto || 'bg-slate-400'}`} />
                    {ESTADOS[info.estado]?.curto || info.estado}
                  </span>
                  {info.departamentos.map((d) => (
                    <span key={d} className="h-7 px-3 rounded-full bg-black/[0.035] dark:bg-white/[0.06] text-black/60 dark:text-white/70 inline-flex items-center">
                      {d}
                    </span>
                  ))}
                  {atual.prioridade === 'urgente' && <span className="h-7 px-3 rounded-full bg-rose-500/12 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 inline-flex items-center font-medium">Urgente</span>}
                  <span className="ml-auto dark:[&_*]:!text-white dark:[&_span:last-child]:!text-white/45">
                    <ChipTempo ch={atual} info={info} tempos={tempos} />
                  </span>
                </div>

                <h2 className="mt-5 sm:mt-6 text-[30px] sm:text-[46px] font-semibold tracking-[-0.03em] leading-[1.05] flex-shrink-0 break-words">{atual.empresa_nome || 'Demanda'}</h2>
                {info.descricao ? (
                  <p className="mt-4 min-h-0 text-[17px] sm:text-[20px] leading-relaxed text-black/75 dark:text-white/80 whitespace-pre-wrap break-words overflow-y-auto [scrollbar-width:thin]">{info.descricao}</p>
                ) : (
                  <p className="mt-4 text-[18px] text-black/35 dark:text-white/40">Sem descrição.</p>
                )}
                <p className="mt-5 text-[13.5px] text-black/45 dark:text-white/50 flex-shrink-0">
                  {[info.solicitante && `Pedido por ${info.solicitante}`, info.responsavel && (info.meu ? 'Com você' : `Com ${info.responsavel}`)].filter(Boolean).join(' · ')}
                </p>

                <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-2.5 flex-shrink-0">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={principal}
                    disabled={ocupado}
                    className="h-14 px-8 rounded-full text-[16px] font-semibold text-white shadow-[0_14px_40px_-10px_rgb(var(--rm-acento-medio)/0.8)] cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
                    style={{ background: 'linear-gradient(135deg, rgb(var(--rm-acento-medio)), rgb(var(--rm-acento)))' }}
                  >
                    {info.estado === 'atendimento' ? '✓ ' : '▶ '}
                    {ocupado ? 'Assumindo…' : rotuloPrincipal}
                    <kbd className="hidden sm:inline ml-1.5 px-1.5 py-0.5 rounded-md bg-white/20 text-[10.5px] font-medium text-white/80 font-sans">Enter</kbd>
                  </motion.button>
                  {!info.interna && (
                    <button type="button" onClick={() => acoes.abrirEmpresa(atual)} className={`h-14 px-6 rounded-full ${BOTAO_SUAVE} text-[15px] font-medium cursor-pointer`}>
                      Ir para a empresa <Tecla>E</Tecla>
                    </button>
                  )}
                  {atual.chat_conversa_id && acoes.abrirChat && (
                    <button type="button" onClick={() => acoes.abrirChat(atual)} className={`h-14 px-6 rounded-full ${BOTAO_SUAVE} text-[15px] font-medium cursor-pointer`}>
                      Ver no chat
                    </button>
                  )}
                  {info.estado === 'cliente' && (
                    <button
                      type="button"
                      onClick={() => {
                        concluindo.current = { id: String(atual.id), de: atual.status };
                        acoes.concluir(atual);
                      }}
                      className={`h-14 px-6 rounded-full ${BOTAO_SUAVE} text-[15px] font-medium cursor-pointer`}
                    >
                      Encerrar sem retorno
                    </button>
                  )}
                  <button type="button" onClick={paraOFinal} className="h-14 px-6 rounded-full text-black/60 hover:text-black dark:text-white/70 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-[15px] font-medium cursor-pointer">
                    Deixar para o final <Tecla>F</Tecla>
                  </button>
                </div>
              </motion.article>
            ) : (
              <motion.div key="fim" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={MOLA} className="text-center py-10">
                <p className="text-[72px] leading-none">🎉</p>
                <h2 className="mt-6 text-[40px] font-semibold tracking-tight">Tudo em dia!</h2>
                <p className="mt-3 text-[17px] text-black/55 dark:text-white/60">
                  {sessao.concluidas ? `${sessao.concluidas} demanda${sessao.concluidas === 1 ? '' : 's'} concluída${sessao.concluidas === 1 ? '' : 's'} em ${duracao(Math.floor((agora - sessao.inicio) / 1000))}.` : 'Nenhuma demanda esperando por você agora.'}
                </p>
                <button type="button" onClick={sair} className="mt-8 h-12 px-6 rounded-full bg-[#1d1d1f] text-white dark:bg-white dark:text-zinc-950 text-[15px] font-semibold cursor-pointer">
                  Sair do modo foco
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navegação */}
        {sessao.ordem.length > 1 && (
          <div className="flex items-center justify-between flex-shrink-0">
            <button type="button" onClick={() => ir(-1)} className={`h-12 px-5 rounded-full ${BOTAO_SUAVE} text-[14px] font-medium cursor-pointer`}>
              ← Anterior
            </button>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {sessao.ordem.slice(0, 12).map((id, i) => (
                <span key={id} className={`h-1.5 rounded-full transition-all ${i === sessao.pos ? 'w-6 bg-[#1d1d1f] dark:bg-white' : 'w-1.5 bg-black/20 dark:bg-white/25'}`} />
              ))}
              {sessao.ordem.length > 12 && <span className="text-[11px] text-black/40 dark:text-white/40 ml-1">+{sessao.ordem.length - 12}</span>}
            </div>
            <button type="button" onClick={() => ir(1)} className={`h-12 px-5 rounded-full ${BOTAO_SUAVE} text-[14px] font-medium cursor-pointer`}>
              Próxima →
            </button>
          </div>
        )}
      </div>

      <Comemoracao chave={festa.chave} frase={festa.frase} sequencia={festa.sequencia} />
    </motion.div>,
    document.body
  );
}
