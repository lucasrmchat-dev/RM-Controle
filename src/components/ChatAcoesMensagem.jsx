'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

// ------------------------------------------------------------------------------
// Ações em cada mensagem do Chat (como no WhatsApp): menu, reação rápida e dados da mensagem
// ------------------------------------------------------------------------------
export const REACOES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MAIS_EMOJIS = '😀 😁 😅 😊 😍 🥰 😘 😉 😎 🤩 🤔 🙄 😬 😴 😷 🥺 😭 😡 🤯 😱 👏 🙌 👌 ✌️ 🤝 💪 👀 🫶 🔥 🎉 ✅ ❌ ⚠️ 💯 ⭐ 💡 📌 🚀 💰 ☕'.split(' ');

/** Posição fixa ancorada num botão, virando para cima/esquerda quando falta espaço. */
function usePosicao(ancora, largura, altura) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ancora?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.right - largura), window.innerWidth - largura - 8);
    const abaixo = r.bottom + 6 + altura < window.innerHeight;
    setPos({ left: x, top: abaixo ? r.bottom + 6 : Math.max(8, r.top - altura - 6), origem: abaixo ? 'top right' : 'bottom right' });
  }, [ancora, largura, altura]);
  return pos;
}

function Flutuante({ ancora, largura, altura, onFechar, children, rotulo }) {
  const pos = usePosicao(ancora, largura, altura);
  const ref = useRef(null);
  useEffect(() => {
    const fora = (e) => ref.current && !ref.current.contains(e.target) && !ancora.current?.contains(e.target) && onFechar();
    const tecla = (e) => e.key === 'Escape' && onFechar();
    // Rolar a conversa fecha; rolar dentro da própria janela (lista de emojis) não
    const rolar = (e) => !ref.current?.contains(e.target) && onFechar();
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('resize', rolar);
    document.addEventListener('scroll', rolar, true);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('resize', rolar);
      document.removeEventListener('scroll', rolar, true);
    };
  }, [ancora, onFechar]);
  if (!pos) return null;
  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label={rotulo}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.13 }}
      style={{ position: 'fixed', left: pos.left, top: pos.top, width: largura, transformOrigin: pos.origem }}
      className="z-[250] rounded-2xl bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.08] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.35)] text-[#111b21] dark:text-[#e9edef]"
    >
      {children}
    </motion.div>,
    document.body
  );
}

/** Barra de reação rápida (+ mais emojis). `atual`: a reação da equipe nesta mensagem. */
export function BarraReacao({ ancora, atual, onEscolher, onFechar }) {
  const [mais, setMais] = useState(false);
  return (
    <Flutuante ancora={ancora} largura={mais ? 300 : 292} altura={mais ? 230 : 52} onFechar={onFechar} rotulo="Reagir">
      <div className="flex items-center gap-0.5 p-1.5">
        {REACOES_RAPIDAS.map((e) => (
          <button
            key={e}
            type="button"
            role="menuitem"
            onClick={() => onEscolher(e === atual ? '' : e)}
            aria-label={e === atual ? `Tirar reação ${e}` : `Reagir com ${e}`}
            className={`w-10 h-10 rounded-full text-[22px] flex items-center justify-center cursor-pointer transition-transform hover:scale-125 ${e === atual ? 'bg-black/[0.07] dark:bg-white/[0.12]' : ''}`}
          >
            {e}
          </button>
        ))}
        <button type="button" onClick={() => setMais((v) => !v)} aria-label="Mais emojis" className="w-9 h-9 ml-auto rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[18px] text-[#54656f] dark:text-[#aebac1] flex items-center justify-center cursor-pointer">
          {mais ? '−' : '+'}
        </button>
      </div>
      {mais && (
        <div className="grid grid-cols-8 gap-0.5 px-2 pb-2 max-h-[170px] overflow-y-auto">
          {MAIS_EMOJIS.map((e) => (
            <button key={e} type="button" role="menuitem" onClick={() => onEscolher(e === atual ? '' : e)} className="h-9 rounded-lg text-[20px] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer" aria-label={`Reagir com ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
    </Flutuante>
  );
}

const Icone = ({ d, className = 'w-[18px] h-[18px]' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);
const ICONES = {
  responder: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  reagir: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2', 'M9 9.5h.01M15 9.5h.01'],
  copiar: ['M8 8h11v11H8z', 'M5 16V5h11'],
  fixar: ['M12 17v5', 'M9 3h6l-1 6 4 4H6l4-4z'],
  favoritar: ['M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z'],
  editar: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  dados: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v6', 'M12 7.5h.01'],
  apagar: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
};

/** Menu da mensagem: só aparecem as opções possíveis para ela. */
export function MenuMensagem({ ancora, m, onAcao, onFechar }) {
  const texto = m.conteudo && !m.apagada_em;
  const nota = m.direcao === 'nota';
  const itens = [
    !nota && !m.apagada_em && { id: 'responder', rotulo: 'Responder' },
    m.acoes?.reagir && { id: 'reagir', rotulo: 'Reagir' },
    texto && { id: 'copiar', rotulo: 'Copiar' },
    !m.apagada_em && { id: 'fixar', rotulo: m.fixada_em ? 'Desafixar' : 'Fixar na conversa' },
    { id: 'favoritar', rotulo: m.favorita ? 'Tirar dos favoritos' : 'Favoritar' },
    m.acoes?.editar && { id: 'editar', rotulo: 'Editar' },
    { id: 'dados', rotulo: 'Dados da mensagem' },
    { separador: true },
    { id: 'apagar_mim', rotulo: 'Apagar para mim', perigo: true, icone: 'apagar' },
    m.acoes?.apagarParaTodos && { id: 'apagar_todos', rotulo: 'Apagar para todos', perigo: true, icone: 'apagar' },
  ].filter(Boolean);
  const altura = itens.filter((i) => !i.separador).length * 40 + 24;
  return (
    <Flutuante ancora={ancora} largura={230} altura={altura} onFechar={onFechar} rotulo="Ações da mensagem">
      <div className="p-1.5">
        {itens.map((i, n) =>
          i.separador ? (
            <div key={`s${n}`} className="h-px my-1 mx-2 bg-black/[0.07] dark:bg-white/[0.08]" />
          ) : (
            <button
              key={i.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onFechar();
                onAcao(i.id, m);
              }}
              className={`w-full h-10 px-3 rounded-xl flex items-center gap-3 text-[14px] text-left cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/[0.07] ${i.perigo ? 'text-rose-600 dark:text-rose-400' : ''}`}
            >
              <span className={i.perigo ? '' : 'text-[#54656f] dark:text-[#aebac1]'}>
                <Icone d={ICONES[i.icone || i.id]} />
              </span>
              {i.rotulo}
            </button>
          )
        )}
      </div>
    </Flutuante>
  );
}

const ROTULO_STATUS = { pendente: 'Enviando', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', falhou: 'Não enviada', recebida: 'Recebida' };
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

/** Conteúdo da janela "Dados da mensagem". */
export function DadosMensagem({ m, canal }) {
  const linhas = [
    ['Enviada por', m.direcao === 'saida' ? m.autor_nome || 'Equipe' : m.direcao === 'nota' ? `${m.autor_nome || 'Equipe'} (nota interna)` : m.autor_nome || 'Cliente'],
    ['Data e hora', dataHora(m.criado_em)],
    ['Situação', ROTULO_STATUS[m.status] || m.status],
    ['Canal', canal?.nome || '—'],
    m.editada_em && ['Editada em', dataHora(m.editada_em)],
    m.apagada_em && ['Apagada para todos em', dataHora(m.apagada_em)],
    m.fixada_em && ['Fixada por', `${m.fixada_por || 'Equipe'} · ${dataHora(m.fixada_em)}`],
    m.midia?.nome && ['Arquivo', m.midia.nome],
    m.midia?.tamanho && ['Tamanho', `${Math.max(1, Math.round(m.midia.tamanho / 1024))} KB`],
    m.erro && ['Erro', m.erro],
    m.id_externo && ['Código no WhatsApp', m.id_externo],
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      {(m.conteudo || m.conteudo_original) && (
        <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.05] px-4 py-3">
          <p className="text-[14px] whitespace-pre-wrap break-words">{m.conteudo || '—'}</p>
          {m.conteudo_original && m.conteudo_original !== m.conteudo && (
            <p className="mt-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08] text-[12.5px] text-slate-500 dark:text-zinc-400 whitespace-pre-wrap break-words">
              <span className="font-semibold">Texto original:</span> {m.conteudo_original}
            </p>
          )}
        </div>
      )}
      <dl className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        {linhas.map(([k, v]) => (
          <div key={k} className="flex gap-4 py-2.5 text-[13.5px]">
            <dt className="w-[150px] flex-shrink-0 text-slate-500 dark:text-zinc-400">{k}</dt>
            <dd className="min-w-0 break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
