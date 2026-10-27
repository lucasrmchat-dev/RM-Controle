'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  acaoConversa,
  criarRespostaRapida,
  excluirRespostaRapida,
  fetchCanais,
  fetchConversa,
  fetchConversas,
  fetchRespostasRapidas,
  getCategoriasDemandas,
  getEquipeUsuarios,
  enviarArquivoConversa,
  iniciarConversa,
  atualizarFotoContato,
} from '@/lib/storage';
import { contarConversasNovas, ehGrupo, janelaAtendimento, preencherResposta } from '@/lib/canais';
import { ACEITOS, LIMITE_ENVIO, MidiaMensagem, PreviaArquivo, comprimirFoto, tipoPeloMime, useGravadorDeAudio } from './ChatMidia';
import ChatPerfilContato from './ChatPerfilContato';
import { BarraReacao, DadosMensagem, MenuMensagem } from './ChatAcoesMensagem';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ModalEtapas, ErroRodape, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';

// ------------------------------------------------------------------------------
// Visual
// ------------------------------------------------------------------------------
// Papel de parede próprio (desenhos de linha), no espírito do WhatsApp
const desenhos = (cor) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><g fill='none' stroke='${cor}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>` +
      `<path d='M16 18h28a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H30l-9 7v-7h-5a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6z'/><path d='M20 27h20M20 33h12'/>` +
      `<path d='M128 34c-4-7-15-5-15 4 0 7 15 15 15 15s15-8 15-15c0-9-11-11-15-4z'/>` +
      `<path d='M78 78l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z'/>` +
      `<path d='M132 110l7 7 14-14'/>` +
      `<rect x='22' y='104' width='20' height='34' rx='5'/><path d='M29 131h6'/>` +
      `<path d='M74 140h20v10a9 9 0 0 1-9 9h-2a9 9 0 0 1-9-9z'/><path d='M94 143h3a4 4 0 0 1 0 8h-3'/><path d='M80 133c0-3 3-3 3-6M87 133c0-3 3-3 3-6'/>` +
      `<rect x='128' y='146' width='28' height='19' rx='3'/><path d='M128 148l14 10 14-10'/>` +
      `<circle cx='66' cy='22' r='2.5'/><circle cx='162' cy='76' r='2'/><circle cx='44' cy='76' r='3'/><circle cx='112' cy='88' r='1.8'/>` +
      `<path d='M150 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2z'/><path d='M8 160l2 4 4 2-4 2-2 4-2-4-4-2 4-2z'/>` +
      `</g></svg>`
  )}")`;
// Discreto: o fundo não disputa atenção com as mensagens
const PAPEL_CLARO = desenhos('#e3e6ea');
const PAPEL_ESCURO = desenhos('#141c21');
const TAMANHO_PAPEL = '260px';

const CORES_AVATAR = ['#4d7c0f', '#0e7490', '#7c3aed', '#be123c', '#b45309', '#1d4ed8', '#047857', '#9d174d'];
const corDe = (texto) => CORES_AVATAR[[...String(texto || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % CORES_AVATAR.length];
const nomeDoContato = (c) => c?.contato?.nome || (ehGrupo(c?.contato?.telefone) ? 'Grupo' : formatarTelefone(c?.contato?.telefone)) || 'Contato';
const iniciais = (nome) =>
  String(nome || '?')
    .replace(/[^\p{L}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '#';

function Avatar({ conversa, tamanho = 'w-11 h-11 text-[14px]', versao = 0 }) {
  const nome = nomeDoContato(conversa);
  const contato = conversa?.contato;
  // 0 = carregando; 1 = falhou uma vez (tenta de novo com outro link); 2 = desiste e mostra as iniciais
  const [falhas, setFalhas] = useState(0);
  useEffect(() => setFalhas(0), [contato?.id, versao]);
  if (contato?.id && contato.tem_foto && falhas < 2)
    return (
      <img
        src={`/api/chat/arquivo?c=${contato.id}&v=${versao}${falhas ? '&r=1' : ''}`}
        alt=""
        onError={() => setTimeout(() => setFalhas((n) => n + 1), falhas ? 0 : 1200)}
        className={`${tamanho} rounded-full object-cover flex-shrink-0 bg-[#dfe5e7] dark:bg-[#2a3942]`}
      />
    );
  if (ehGrupo(contato?.telefone))
    return (
      <span className={`${tamanho} rounded-full flex items-center justify-center flex-shrink-0 bg-[#dfe5e7] dark:bg-[#2a3942] text-[#8696a0]`} aria-hidden="true">
        <svg className="w-1/2 h-1/2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-6 1.7-6 4v2h12v-2c0-2.3-2.7-4-6-4zm7.5.2c-.6 0-1.2.1-1.7.2 1.3.9 2.2 2.1 2.2 3.6v2h5v-1.8c0-2.2-2.5-4-5.5-4z" />
        </svg>
      </span>
    );
  return (
    <span className={`${tamanho} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`} style={{ background: corDe(contato?.telefone || nome) }} aria-hidden="true">
      {iniciais(contato?.nome) === '#' ? (
        <svg className="w-1/2 h-1/2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z" />
        </svg>
      ) : (
        iniciais(contato?.nome)
      )}
    </span>
  );
}

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
function quandoNaLista(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  if (mesmoDia(d, hoje)) return hora(iso);
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(d, ontem)) return 'Ontem';
  if (hoje - d < 6 * 864e5) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function rotuloDoDia(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  if (mesmoDia(d, hoje)) return 'Hoje';
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', ...(d.getFullYear() !== hoje.getFullYear() ? { year: 'numeric' } : {}) });
}

/** Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```mono```) e links — sempre como texto, nunca HTML. */
function TextoFormatado({ texto }) {
  const partes = String(texto || '').split(/(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s<]+)/g);
  return partes.map((p, i) => {
    if (!p) return null;
    if (/^```[^`]+```$/.test(p)) return <code key={i} className="font-mono text-[13px]">{p.slice(3, -3)}</code>;
    if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^~[^~\n]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
    if (/^https?:\/\//.test(p))
      return (
        <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="text-[#027eb5] dark:text-[#53bdeb] underline underline-offset-2 break-all">
          {p}
        </a>
      );
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function Tique({ status, erro }) {
  if (status === 'pendente')
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label="Enviando">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3.2l2 1.3" strokeLinecap="round" />
      </svg>
    );
  if (status === 'falhou')
    return (
      <span title={erro || 'Não enviada'} className="text-rose-600 dark:text-rose-400" aria-label="Não enviada">
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.8 3.5h1.6v5H7.2v-5zm0 6.2h1.6v1.6H7.2v-1.6z" />
        </svg>
      </span>
    );
  const duplo = status === 'entregue' || status === 'lida';
  return (
    <svg className={`w-4 h-3.5 ${status === 'lida' ? 'text-[#53bdeb]' : ''}`} viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-label={{ enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida' }[status] || ''}>
      <path d={duplo ? 'M1 6.5l3 3L10 3' : 'M4 6.5l3 3L13 3'} />
      {duplo && <path d="M7.5 9.5L14 3" />}
    </svg>
  );
}

const ROTULO_MIDIA = { imagem: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', documento: '📄 Documento', figurinha: '🏷️ Figurinha', localizacao: '📍 Localização', contato: '👤 Contato', reacao: 'Reação', template: '📋 Template', outro: 'Mensagem' };

/** Botões que aparecem ao passar o mouse: reagir (ao lado do balão) e o menu da mensagem (no canto). */
function ControlesMensagem({ m, minha, reacaoAtual, onAcao, fundo }) {
  const [menu, setMenu] = useState(false);
  const [reagir, setReagir] = useState(false);
  const refMenu = useRef(null);
  const refReagir = useRef(null);
  const fixo = menu || reagir;
  return (
    <>
      <button
        ref={refMenu}
        type="button"
        onClick={() => setMenu((v) => !v)}
        aria-label="Ações da mensagem"
        aria-expanded={menu}
        className={`absolute top-0.5 right-0.5 z-[2] w-7 h-6 rounded-md flex items-center justify-center text-[#667781] dark:text-[#aebac1] cursor-pointer transition-opacity ${fixo ? 'opacity-100' : 'md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
        style={{ background: `linear-gradient(to left, ${fundo} 60%, transparent)` }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {m.acoes?.reagir && (
        <button
          ref={refReagir}
          type="button"
          onClick={() => setReagir((v) => !v)}
          aria-label="Reagir"
          className={`absolute top-1/2 -translate-y-1/2 ${minha ? '-left-10' : '-right-10'} w-8 h-8 rounded-full bg-white/90 dark:bg-[#202c33]/90 shadow-sm flex items-center justify-center text-[#54656f] dark:text-[#aebac1] cursor-pointer transition-opacity ${fixo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" />
            <circle cx="9" cy="10" r="0.6" fill="currentColor" />
            <circle cx="15" cy="10" r="0.6" fill="currentColor" />
          </svg>
        </button>
      )}
      {menu && (
        <MenuMensagem
          ancora={refMenu}
          m={m}
          onFechar={() => setMenu(false)}
          onAcao={(id) => (id === 'reagir' ? setReagir(true) : onAcao(id, m))}
        />
      )}
      {reagir && (
        <BarraReacao
          ancora={refReagir.current ? refReagir : refMenu}
          atual={reacaoAtual}
          onFechar={() => setReagir(false)}
          onEscolher={(emoji) => {
            setReagir(false);
            onAcao('reacao', m, emoji);
          }}
        />
      )}
    </>
  );
}

/** Mensagem citada dentro do balão (resposta); clicar leva até ela. */
function Citada({ c, nomeContato, onIr }) {
  const autor = c.direcao === 'saida' ? c.autor_nome || 'Você' : c.direcao === 'nota' ? c.autor_nome || 'Nota' : c.autor_nome || nomeContato || 'Cliente';
  const cor = c.direcao === 'saida' ? '#06cf9c' : corDe(autor);
  return (
    <button type="button" onClick={() => onIr(c.id)} className="block w-full min-w-[160px] text-left mb-1 -mx-0.5 rounded-md bg-black/[0.05] dark:bg-black/25 border-l-4 px-2.5 py-1.5 cursor-pointer" style={{ borderColor: cor }}>
      <span className="block text-[12.5px] font-semibold" style={{ color: cor }}>
        {autor}
      </span>
      <span className="block text-[12.5px] text-[#667781] dark:text-[#aebac1] line-clamp-2 break-words">{c.apagada ? 'Mensagem apagada' : c.conteudo || ROTULO_MIDIA[c.tipo] || 'Mensagem'}</span>
    </button>
  );
}

/**
 * Etiquetas da conversa, como no RM Chat: canal (laranja), colaborador (azul) e departamento (vermelho).
 * `grande`: versão do topo da conversa.
 */
function Etiquetas({ conversa, eu, grande = false }) {
  const minha = conversa.responsavel_email && conversa.responsavel_email === eu?.email;
  const base = `${grande ? 'h-6 px-2.5 text-[11.5px] rounded-md max-w-[170px]' : 'h-[18px] px-1.5 text-[10.5px] rounded-[5px] max-w-[112px]'} inline-flex items-center font-semibold truncate flex-shrink-0`;
  const vazio = 'bg-black/[0.06] dark:bg-white/[0.08] text-slate-500 dark:text-[#8696a0] font-medium';
  return (
    <>
      <span className={`${base} bg-amber-400 text-amber-950`} title={`Canal: ${conversa.canal?.nome || '—'}`}>
        <span className="truncate">{conversa.canal?.nome || 'Canal'}</span>
      </span>
      <span className={`${base} ${conversa.responsavel_nome ? 'bg-sky-500 text-white' : vazio}`} title={conversa.responsavel_nome ? `Colaborador: ${conversa.responsavel_nome}` : 'Ninguém assumiu ainda'}>
        <span className="truncate">{conversa.responsavel_nome ? (minha && !grande ? 'Você' : conversa.responsavel_nome) : 'Na fila'}</span>
      </span>
      <span className={`${base} ${conversa.departamento ? 'bg-rose-400 text-white' : vazio}`} title={conversa.departamento ? `Departamento: ${conversa.departamento}` : 'Sem departamento'}>
        <span className="truncate">{conversa.departamento || 'Sem departamento'}</span>
      </span>
      {ehGrupo(conversa.contato?.telefone) && <span className={`${base} bg-violet-500 text-white`}>Grupo</span>}
    </>
  );
}

/** Reações presas ao balão (como no WhatsApp): emojis únicos e a contagem. */
function Reacoes({ lista, minha }) {
  const emojis = [...new Set(lista.map((r) => r.conteudo))].slice(0, 3);
  const quem = lista.map((r) => `${r.conteudo} ${r.direcao === 'saida' ? 'Você' : r.autor_nome || 'Cliente'}`).join(' · ');
  return (
    <span title={quem} className={`absolute -bottom-[18px] ${minha ? 'right-2' : 'left-2'} z-[1] h-[22px] px-1.5 rounded-full bg-white dark:bg-[#202c33] ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-sm flex items-center gap-0.5 text-[13px] leading-none select-none`}>
      {emojis.join('')}
      {lista.length > 1 && <span className="text-[11px] text-[#667781] dark:text-[#8696a0] ml-0.5 tabular-nums">{lista.length}</span>}
    </span>
  );
}

function Balao({ m, primeiraDoGrupo, reacoes = [], acoes }) {
  const reacaoAtual = reacoes.find((r) => r.direcao === 'saida')?.conteudo || null;
  if (m.tipo === 'sistema')
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 rounded-lg text-[12px] bg-white/90 dark:bg-[#182229] text-slate-600 dark:text-[#8696a0] shadow-sm">
          {m.conteudo} · {hora(m.criado_em)}
        </span>
      </div>
    );
  if (m.direcao === 'nota')
    return (
      <div id={`msg-${m.id}`} className="group flex justify-center my-1.5">
        <div className="relative max-w-[min(560px,88%)] rounded-xl px-3.5 py-2 bg-amber-100 dark:bg-amber-500/15 text-amber-950 dark:text-amber-100 ring-1 ring-amber-300/60 dark:ring-amber-400/20 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Nota interna · {m.autor_nome || 'Equipe'}</p>
          <p className="text-[14px] leading-snug whitespace-pre-wrap break-words mt-0.5">
            <TextoFormatado texto={m.conteudo} />
          </p>
          <p className="text-[10.5px] text-right text-amber-700/70 dark:text-amber-300/60 mt-0.5">
            {m.favorita ? '★ ' : ''}
            {m.fixada_em ? '📌 ' : ''}
            {hora(m.criado_em)}
          </p>
          {acoes && <ControlesMensagem m={m} minha={false} onAcao={acoes.onAcao} fundo="rgb(254 243 199)" />}
        </div>
      </div>
    );
  const minha = m.direcao === 'saida';
  const temArquivo = ['imagem', 'audio', 'video', 'documento', 'figurinha'].includes(m.tipo);
  const conteudo = m.conteudo || (m.tipo !== 'texto' && !temArquivo ? ROTULO_MIDIA[m.tipo] || 'Mensagem' : '');
  // Mensagens antigas mandadas pelo celular traziam esse rótulo; não mostramos mais
  const autor = m.autor_nome === 'Pelo celular' ? null : m.autor_nome;

  // Figurinha: sem balão, como no WhatsApp
  if (m.tipo === 'figurinha')
    return (
      <div id={`msg-${m.id}`} className={`group flex ${minha ? 'justify-end' : 'justify-start'} ${primeiraDoGrupo ? 'mt-2' : 'mt-0.5'} ${reacoes.length ? 'mb-4' : ''}`}>
        <div className="relative">
          {acoes && !m.apagada_em && <ControlesMensagem m={m} minha={minha} reacaoAtual={reacaoAtual} onAcao={acoes.onAcao} fundo="rgba(0,0,0,0.25)" />}
          {primeiraDoGrupo && autor && !minha && <p className="text-[12px] font-semibold mb-0.5 px-1" style={{ color: corDe(autor) }}>{autor}</p>}
          <MidiaMensagem m={m} minha={minha} />
          <span className={`absolute bottom-1 ${minha ? 'right-1' : 'left-1'} h-5 px-1.5 rounded-full bg-black/35 text-white text-[11px] flex items-center gap-1`}>
            {hora(m.criado_em)}
            {minha && <Tique status={m.status} erro={m.erro} />}
          </span>
          {reacoes.length > 0 && <Reacoes lista={reacoes} minha={minha} />}
        </div>
      </div>
    );
  return (
    <div id={`msg-${m.id}`} className={`group flex ${minha ? 'justify-end' : 'justify-start'} ${primeiraDoGrupo ? 'mt-2' : 'mt-0.5'} ${reacoes.length ? 'mb-4' : ''}`}>
      <div
        className={`relative max-w-[min(560px,85%)] px-2.5 pt-1.5 pb-1 rounded-lg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] text-[14.2px] leading-[1.38] text-[#111b21] dark:text-[#e9edef] ${
          minha ? 'bg-[#d9fdd3] dark:bg-[#005c4b]' : 'bg-white dark:bg-[#202c33]'
        } ${primeiraDoGrupo ? (minha ? 'rounded-tr-none' : 'rounded-tl-none') : ''}`}
      >
        {primeiraDoGrupo && (
          <svg className={`absolute top-0 w-2 h-3 ${minha ? '-right-2 text-[#d9fdd3] dark:text-[#005c4b]' : '-left-2 text-white dark:text-[#202c33] -scale-x-100'}`} viewBox="0 0 8 13" fill="currentColor" aria-hidden="true">
            <path d="M0 0h8L0 13z" />
          </svg>
        )}
        {primeiraDoGrupo && autor && (
          <p className="text-[12px] font-semibold mb-0.5" style={minha ? undefined : { color: corDe(autor) }}>
            <span className={minha ? 'text-[#3d7a58] dark:text-[#7dd3a8]' : ''}>{autor}</span>
          </p>
        )}
        {acoes && <ControlesMensagem m={m} minha={minha} reacaoAtual={reacaoAtual} onAcao={acoes.onAcao} fundo={minha ? 'var(--balao-meu)' : 'var(--balao-cliente)'} />}
        {m.citada && !m.apagada_em && <Citada c={m.citada} nomeContato={acoes?.nomeContato} onIr={acoes?.irPara || (() => {})} />}
        {m.apagada_em ? (
          <span className="italic text-[#667781] dark:text-[#8696a0] inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M5.6 5.6l12.8 12.8" />
            </svg>
            {minha ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}
          </span>
        ) : (
          <>
            {temArquivo && <MidiaMensagem m={m} minha={minha} />}
            {conteudo && (
              <span className={`whitespace-pre-wrap break-words ${m.tipo !== 'texto' && !m.conteudo ? 'italic text-slate-500 dark:text-[#8696a0]' : ''}`}>
                <TextoFormatado texto={conteudo} />
              </span>
            )}
          </>
        )}
        <span className={`inline-block ${m.editada_em || m.favorita || m.fixada_em ? 'w-[118px]' : 'w-[64px]'}`} aria-hidden="true" />
        <span className="absolute right-2 bottom-1 flex items-center gap-1 text-[11px] text-[#667781] dark:text-[#8696a0]">
          {m.fixada_em && <span title={`Fixada por ${m.fixada_por || 'equipe'}`}>📌</span>}
          {m.favorita && <span title="Favorita">★</span>}
          {m.editada_em && !m.apagada_em && <span>Editada</span>}
          {hora(m.criado_em)}
          {minha && <Tique status={m.status} erro={m.erro} />}
        </span>
        {m.status === 'falhou' && m.erro && <p className="text-[11.5px] text-rose-700 dark:text-rose-300 mt-1 max-w-[320px]">{m.erro}</p>}
        {reacoes.length > 0 && <Reacoes lista={reacoes} minha={minha} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------
// Emojis e respostas rápidas
// ------------------------------------------------------------------------------
const EMOJIS = {
  Rostos: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤗 🤩 🤔 🤨 😐 😑 😶 🙄 😏 😬 😌 😴 😷 🤒 😎 🤓 🧐 😕 😟 😮 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 🙃 🫡'.split(' '),
  Gestos: '👍 👎 👌 ✌️ 🤞 🤝 🙏 👏 🙌 👋 🤙 💪 👀 🫶 ☝️ 👉 👈 👆 👇 ✍️'.split(' '),
  Símbolos: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 ✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ ⭐ 🌟 ✨ 🔥 🎉 🎊 🎁 🏆 💡 📌 📎 📅 ⏰ ⏳ 📞 📱 💻 🖥️ 📧 📄 📊 💰 💳 🛒 🚀 🔒 🔑 🛠️ ⚙️ 📍 🏢'.split(' '),
  Natureza: '☀️ 🌤️ 🌧️ ⛈️ ❄️ 🌈 🌙 🌻 🌹 🍀 🌱 🐶 🐱 ☕ 🍕 🍔 🍰 🥳'.split(' '),
};

function SeletorEmoji({ onEscolher, onFechar }) {
  const [grupo, setGrupo] = useState('Rostos');
  const ref = useRef(null);
  useEffect(() => {
    const fora = (e) => ref.current && !ref.current.contains(e.target) && onFechar();
    const esc = (e) => e.key === 'Escape' && onFechar();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [onFechar]);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(340px,calc(100vw-32px))] rounded-2xl bg-white dark:bg-[#233138] ring-1 ring-black/[0.08] dark:ring-white/[0.08] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.35)] overflow-hidden"
    >
      <div className="flex gap-1 p-1.5 border-b border-black/[0.06] dark:border-white/[0.06] overflow-x-auto">
        {Object.keys(EMOJIS).map((g) => (
          <button key={g} type="button" onClick={() => setGrupo(g)} className={`px-2.5 h-7 rounded-full text-[12px] font-medium whitespace-nowrap cursor-pointer ${grupo === g ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'text-slate-600 dark:text-[#aebac1] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'}`}>
            {g}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-[220px] overflow-y-auto">
        {EMOJIS[grupo].map((e) => (
          <button key={e} type="button" onClick={() => onEscolher(e)} className="h-9 rounded-lg text-[21px] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer" aria-label={`Inserir ${e}`}>
            {e}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function GerenciarRespostas({ aberto, onFechar, respostas, admin, onMudou }) {
  const [form, setForm] = useState({ atalho: '', texto: '', alcance: 'pessoal', departamento: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const departamentos = getCategoriasDemandas();
  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await criarRespostaRapida(form);
      setForm({ atalho: '', texto: '', alcance: form.alcance, departamento: form.departamento });
      onMudou();
      showToast('Resposta rápida criada.', 'success');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };
  const excluir = async (r) => {
    if (!window.confirm(`Apagar a resposta /${r.atalho}?`)) return;
    try {
      await excluirRespostaRapida(r.id);
      onMudou();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={salvando}
      largura="max-w-[920px]"
      idTitulo="respostas-titulo"
      titulo="Respostas rápidas"
      subtitulo="No campo de mensagem, digite / e o atalho. Variáveis: {nome}, {primeiro_nome} e {atendente}."
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onFechar} className={classeBotaoTexto}>
              Fechar
            </button>
            <button type="button" onClick={salvar} disabled={salvando || !form.atalho.trim() || !form.texto.trim()} className={classeBotaoPrimario}>
              {salvando && <Spinner />}
              Criar resposta
            </button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
        <div className="space-y-3">
          <label className="block">
            <span className={classeRotulo}>Atalho</span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">/</span>
              <input value={form.atalho} onChange={(e) => setForm({ ...form, atalho: e.target.value })} placeholder="bomdia" maxLength={30} className={`${classeCampo} pl-7`} />
            </div>
          </label>
          <label className="block">
            <span className={classeRotulo}>Texto</span>
            <textarea value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} rows={5} maxLength={4000} placeholder="Olá, {primeiro_nome}! Aqui é {atendente}, como posso ajudar?" className={`${classeCampo} h-auto py-3 resize-none`} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {['{nome}', '{primeiro_nome}', '{atendente}'].map((v) => (
              <button key={v} type="button" onClick={() => setForm({ ...form, texto: `${form.texto}${v}` })} className="h-7 px-2.5 rounded-full text-[12px] font-mono ring-1 ring-black/[0.1] dark:ring-white/[0.14] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer">
                {v}
              </button>
            ))}
          </div>
          {admin && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={classeRotulo}>Quem usa</span>
                <select value={form.alcance} onChange={(e) => setForm({ ...form, alcance: e.target.value })} className={`${classeCampo} cursor-pointer`}>
                  <option value="pessoal">Só eu</option>
                  <option value="departamento">Um departamento</option>
                  <option value="empresa">Toda a equipe</option>
                </select>
              </label>
              {form.alcance === 'departamento' && (
                <label className="block">
                  <span className={classeRotulo}>Departamento</span>
                  <select value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} className={`${classeCampo} cursor-pointer`}>
                    <option value="">Escolha</option>
                    {departamentos.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
        <div className="md:border-l md:pl-10 border-black/[0.06] dark:border-white/[0.1]">
          <p className={classeRotulo}>Suas respostas ({respostas.length})</p>
          {respostas.length === 0 ? (
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 py-6">Nenhuma ainda. Crie a primeira ao lado.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {respostas.map((r) => (
                <li key={r.id} className="group rounded-xl px-3 py-2 bg-black/[0.03] dark:bg-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold">/{r.atalho}</span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">{{ pessoal: 'só você', departamento: r.departamento, empresa: 'equipe toda' }[r.alcance]}</span>
                    <button type="button" onClick={() => excluir(r)} className="ml-auto text-[12px] text-rose-600 dark:text-rose-400 opacity-70 hover:opacity-100 cursor-pointer">
                      Apagar
                    </button>
                  </div>
                  <p className="text-[12.5px] text-slate-600 dark:text-zinc-300 line-clamp-2 mt-0.5">{r.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalEtapas>
  );
}

// ------------------------------------------------------------------------------
// Campo de mensagem
// ------------------------------------------------------------------------------
const lerAssinar = () => {
  try {
    return localStorage.getItem('rm_chat_assinar') !== 'nao';
  } catch {
    return true;
  }
};

function Compositor({ conversa, eu, respostas, onEnviar, onEscolherArquivo, onEnviarArquivo, onGerenciarRespostas, bloqueio, resposta, onCancelarResposta, edicao, onCancelarEdicao, nomeContato }) {
  const [texto, setTexto] = useState('');
  const [assinar, setAssinar] = useState(lerAssinar);
  const gravador = useGravadorDeAudio();
  const seletor = useRef(null);
  const [modo, setModo] = useState('responder');
  const [emojis, setEmojis] = useState(false);
  const [indice, setIndice] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef(null);
  const nota = modo === 'nota';

  // Rascunho por conversa
  useEffect(() => {
    setTexto('');
    setModo('responder');
  }, [conversa.id]);

  // Editar: o campo recebe o texto da mensagem; responder: foco no campo
  useEffect(() => {
    if (edicao) {
      setModo('responder');
      setTexto(edicao.conteudo || '');
    }
    if (edicao || resposta) requestAnimationFrame(() => campo.current?.focus());
  }, [edicao?.id, resposta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  const busca = /^\/([\w-]*)$/.exec(texto.trimStart())?.[1];
  const sugestoes = busca !== undefined && !nota ? respostas.filter((r) => r.atalho.startsWith(busca.toLowerCase())).slice(0, 6) : [];
  const usar = (r) => {
    setTexto(preencherResposta(r.texto, { contato: conversa.contato, atendente: eu?.nome }));
    setIndice(0);
    requestAnimationFrame(() => campo.current?.focus());
  };

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setTexto('');
    try {
      await onEnviar(t, modo, { assinar });
    } catch {
      setTexto(t);
    } finally {
      setEnviando(false);
      requestAnimationFrame(() => campo.current?.focus());
    }
  };

  const tecla = (e) => {
    if (e.key === 'Escape' && (edicao || resposta)) {
      e.preventDefault();
      if (edicao) {
        onCancelarEdicao();
        setTexto('');
      } else onCancelarResposta();
      return;
    }
    if (sugestoes.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIndice((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        usar(sugestoes[Math.min(indice, sugestoes.length - 1)]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  };

  const alternarAssinatura = () => {
    setAssinar((v) => {
      try {
        localStorage.setItem('rm_chat_assinar', v ? 'nao' : 'sim');
      } catch {}
      return !v;
    });
  };

  const gravar = async () => {
    try {
      await gravador.iniciar();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  const enviarGravacao = async () => {
    const r = await gravador.concluir();
    if (r) onEnviarArquivo(r.arquivo, { segundos: r.segundos, assinar });
  };
  // Passou de 5 minutos: envia o que já gravou
  useEffect(() => {
    if (gravador.gravando && gravador.segundos >= gravador.limite) enviarGravacao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravador.segundos]);

  const colar = (e) => {
    const arquivo = e.clipboardData?.files?.[0];
    if (!arquivo || nota) return;
    e.preventDefault();
    onEscolherArquivo(arquivo, { assinar });
  };

  const inserirEmoji = (emoji) => {
    const el = campo.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + emoji + texto.slice(fim));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + emoji.length, ini + emoji.length);
    });
  };

  if (bloqueio && !nota) {
    return (
      <div className="px-4 py-3 bg-[#f0f2f5] dark:bg-[#202c33] flex flex-col sm:flex-row sm:items-center gap-2 text-[13px] text-slate-600 dark:text-[#aebac1]">
        <span className="flex-1">{bloqueio.texto}</span>
        {bloqueio.acao}
        <button type="button" onClick={() => setModo('nota')} className="h-9 px-3.5 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.03] dark:hover:bg-white/[0.06] cursor-pointer">
          Escrever nota interna
        </button>
      </div>
    );
  }

  return (
    <div className={`relative px-2.5 sm:px-4 pt-2 pb-2.5 ${nota ? 'bg-amber-50 dark:bg-[#2a2516]' : 'bg-[#f0f2f5] dark:bg-[#202c33]'}`}>
      <AnimatePresence>
        {sugestoes.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-2.5 right-2.5 sm:left-4 sm:right-4 bottom-[calc(100%-4px)] z-20 rounded-2xl bg-white dark:bg-[#233138] ring-1 ring-black/[0.08] dark:ring-white/[0.08] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.3)] p-1.5" role="listbox">
            {sugestoes.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === indice}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => usar(r)} onMouseEnter={() => setIndice(i)} className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer ${i === indice ? 'bg-black/[0.05] dark:bg-white/[0.07]' : ''}`}>
                  <span className="font-mono text-[13px] font-semibold">/{r.atalho}</span>
                  <span className="block text-[12.5px] text-slate-500 dark:text-[#8696a0] truncate">{r.texto}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1 mb-1.5">
        {['responder', 'nota'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            disabled={m === 'responder' && bloqueio}
            className={`h-7 px-3 rounded-full text-[12px] font-semibold cursor-pointer disabled:opacity-40 transition-colors ${
              modo === m ? (m === 'nota' ? 'bg-amber-500 text-white' : 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]') : 'text-slate-500 dark:text-[#8696a0] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
            }`}
          >
            {m === 'nota' ? 'Nota interna' : 'Responder'}
          </button>
        ))}
        {!nota && (
          <button
            type="button"
            onClick={alternarAssinatura}
            role="switch"
            aria-checked={assinar}
            title={assinar ? `O cliente recebe *${eu?.nome || ''}:* no início da mensagem` : 'Mensagens sem assinatura'}
            className="ml-auto h-7 pl-2 pr-3 rounded-full text-[12px] font-medium text-slate-500 dark:text-[#8696a0] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer inline-flex items-center gap-1.5"
          >
            <span className={`relative w-7 h-4 rounded-full transition-colors ${assinar ? 'bg-[#00a884]' : 'bg-black/20 dark:bg-white/20'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${assinar ? 'left-[14px]' : 'left-0.5'}`} />
            </span>
            Assinatura
          </button>
        )}
        <button type="button" onClick={onGerenciarRespostas} className={`${nota ? 'ml-auto' : ''} h-7 px-3 rounded-full text-[12px] font-medium text-slate-500 dark:text-[#8696a0] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer`}>
          Respostas rápidas
        </button>
      </div>

      {(resposta || edicao) && !nota && (
        <div className="flex items-center gap-2 mb-1.5 rounded-xl bg-white dark:bg-[#2a3942] pl-3 pr-1.5 py-1.5 border-l-4 border-[#00a884]">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-[#008069] dark:text-[#00d4a4]">
              {edicao ? 'Editando mensagem' : `Respondendo a ${resposta.direcao === 'saida' ? resposta.autor_nome || 'você' : resposta.direcao === 'nota' ? 'nota interna' : resposta.autor_nome || nomeContato}`}
            </p>
            <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0] truncate">{(edicao || resposta).conteudo || ROTULO_MIDIA[(edicao || resposta).tipo] || 'Mensagem'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (edicao) {
                onCancelarEdicao();
                setTexto('');
              } else onCancelarResposta();
            }}
            aria-label={edicao ? 'Cancelar edição' : 'Cancelar resposta'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      {gravador.gravando ? (
        <div className="flex items-center gap-2 h-[42px]">
          <button type="button" onClick={gravador.cancelar} aria-label="Descartar gravação" className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            </svg>
          </button>
          <div className="flex-1 flex items-center gap-2.5 h-[42px] rounded-[21px] px-4 bg-white dark:bg-[#2a3942]">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-[15px] tabular-nums text-[#111b21] dark:text-[#e9edef]">{gravador.relogio}</span>
            <span className="text-[12.5px] text-[#8696a0]">Gravando áudio…</span>
          </div>
          <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={enviarGravacao} aria-label="Enviar áudio" className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-white bg-[#00a884] cursor-pointer">
            <svg className="w-5 h-5 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
            </svg>
          </motion.button>
        </div>
      ) : (

      <div className="flex items-end gap-1.5">
        <div className="relative">
          <button type="button" onClick={() => setEmojis((v) => !v)} aria-label="Emojis" aria-expanded={emojis} className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" />
              <circle cx="9" cy="10" r="0.6" fill="currentColor" />
              <circle cx="15" cy="10" r="0.6" fill="currentColor" />
            </svg>
          </button>
          <AnimatePresence>{emojis && <SeletorEmoji onEscolher={inserirEmoji} onFechar={() => setEmojis(false)} />}</AnimatePresence>
        </div>
        {!nota && (
          <>
            <button type="button" onClick={() => seletor.current?.click()} aria-label="Anexar arquivo" title="Foto, vídeo ou documento" className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer">
              <svg className="w-[22px] h-[22px] -rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6L15.5 8" />
              </svg>
            </button>
            <input
              ref={seletor}
              type="file"
              accept={ACEITOS}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onEscolherArquivo(f, { assinar });
              }}
            />
          </>
        )}
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setIndice(0);
          }}
          onKeyDown={tecla}
          onPaste={colar}
          rows={1}
          maxLength={4096}
          placeholder={nota ? 'Nota para a equipe (o cliente não vê)' : 'Mensagem (/ para atalhos)'}
          aria-label={nota ? 'Nota interna' : 'Mensagem'}
          className={`flex-1 min-h-[42px] max-h-[160px] resize-none rounded-[21px] px-4 py-[10px] text-[15px] leading-[1.4] outline-none placeholder:text-slate-400 dark:placeholder:text-[#8696a0] text-[#111b21] dark:text-[#e9edef] ${
            nota ? 'bg-white dark:bg-[#3a3320] ring-1 ring-amber-300/70 dark:ring-amber-400/25' : 'bg-white dark:bg-[#2a3942]'
          }`}
        />
        {!nota && !texto.trim() && !enviando ? (
          <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={gravar} aria-label="Gravar áudio" title="Gravar áudio" className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </motion.button>
        ) : (
        <motion.button
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={enviar}
          disabled={!texto.trim() || enviando}
          aria-label={nota ? 'Salvar nota' : 'Enviar'}
          className={`w-[42px] h-[42px] rounded-full flex items-center justify-center text-white cursor-pointer disabled:opacity-40 transition-colors ${nota ? 'bg-amber-500' : 'bg-[#00a884]'}`}
        >
          {enviando ? (
            <Spinner />
          ) : (
            <svg className="w-5 h-5 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
            </svg>
          )}
        </motion.button>
        )}
      </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------
// Conversa aberta
// ------------------------------------------------------------------------------
const ROTULO_STATUS = { aguardando: 'Na fila', em_atendimento: 'Em atendimento', aguardando_cliente: 'Aguardando cliente', resolvida: 'Resolvida' };

function MenuTransferir({ conversa, onTransferir }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const departamentos = getCategoriasDemandas();
  const pessoas = getEquipeUsuarios().filter((u) => u.ativo !== false && u.email);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => ref.current && !ref.current.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const escolher = (corpo) => {
    setAberto(false);
    onTransferir(corpo);
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="h-9 px-3.5 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.03] dark:hover:bg-white/[0.06] cursor-pointer">
        Transferir
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }} className="absolute right-0 top-[calc(100%+6px)] z-30 w-[260px] max-h-[380px] overflow-y-auto rounded-2xl bg-white dark:bg-[#233138] ring-1 ring-black/[0.08] dark:ring-white/[0.08] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] p-1.5">
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Departamento</p>
            {departamentos.map((d) => (
              <button key={d} type="button" onClick={() => escolher({ departamento: d, responsavel_email: '' })} className={`w-full text-left px-3 py-2 rounded-xl text-[13.5px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer ${conversa.departamento === d ? 'font-semibold' : ''}`}>
                {d}
              </button>
            ))}
            <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pessoa</p>
            {pessoas.map((p) => (
              <button key={p.email} type="button" onClick={() => escolher({ responsavel_email: p.email })} className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer truncate">
                {p.nome || p.email}
              </button>
            ))}
            {conversa.responsavel_email && (
              <button type="button" onClick={() => escolher({ responsavel_email: '' })} className="w-full text-left px-3 py-2 mt-1 rounded-xl text-[13.5px] text-slate-500 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer border-t border-black/[0.06] dark:border-white/[0.06]">
                Devolver para a fila
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function JanelaOficial({ conversa }) {
  const [, setAgora] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAgora((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const j = janelaAtendimento(conversa);
  if (!j.aberta) return null;
  const h = Math.floor(j.restanteMs / 36e5);
  const m = Math.floor((j.restanteMs % 36e5) / 6e4);
  return (
    <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center ${h < 2 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-[#00a884]/12 text-[#008069] dark:text-[#00d4a4]'}`} title="Pela API oficial, só dá para mandar texto livre até 24h depois da última mensagem do cliente">
      Janela 24h · {h}h {String(m).padStart(2, '0')}min
    </span>
  );
}

function PainelConversa({ conversaId, eu, sinal, respostas, onAtualizada, onContatoMudou, onAbrirConversa, onExcluida, onVoltar, onGerenciarRespostas }) {
  const [conversa, setConversa] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [perfil, setPerfil] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [edicao, setEdicao] = useState(null);
  const [dados, setDados] = useState(null);
  const [fixadas, setFixadas] = useState([]);
  const [fixadaAtual, setFixadaAtual] = useState(0);
  const [versaoFoto, setVersaoFoto] = useState(0);
  const [mensagens, setMensagens] = useState([]);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(null);
  const rolagem = useRef(null);
  const colarNoFim = useRef(true);
  const alturaAntes = useRef(null);
  const atual = useRef(conversaId);

  const juntar = (lista, novas) => {
    const porId = new Map(lista.filter((m) => !String(m.id).startsWith('tmp-')).map((m) => [m.id, m]));
    novas.forEach((m) => porId.set(m.id, m));
    const pendentes = lista.filter((m) => String(m.id).startsWith('tmp-'));
    return [...porId.values(), ...pendentes].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  };

  const recarregar = useCallback(async () => {
    try {
      const r = await fetchConversa(conversaId);
      if (atual.current !== conversaId) return;
      setConversa(r.conversa);
      // A página mais recente vem inteira do servidor: dentro dela, o que sumiu (reação trocada, apagada para mim) sai
      const corte = r.temMais && r.mensagens.length ? new Date(r.mensagens[0].criado_em).getTime() : -Infinity;
      setMensagens((lista) => juntar(lista.filter((m) => String(m.id).startsWith('tmp-') || new Date(m.criado_em).getTime() < corte), r.mensagens));
      setFixadas(r.fixadas || []);
      setErro('');
      if (r.conversa.nao_lidas > 0 && document.visibilityState === 'visible') {
        acaoConversa(conversaId, { acao: 'lida' }).then(() => onAtualizada({ ...r.conversa, nao_lidas: 0 })).catch(() => {});
      }
    } catch (e) {
      setErro(e.message);
    }
  }, [conversaId, onAtualizada]);

  useEffect(() => {
    atual.current = conversaId;
    setConversa(null);
    setMensagens([]);
    setErro('');
    colarNoFim.current = true;
    // Primeira abertura: o servidor registra a visualização na auditoria
    fetchConversa(conversaId, null, { abrir: true })
      .then((r) => {
        if (atual.current !== conversaId) return;
        setConversa(r.conversa);
        setMensagens(r.mensagens);
        setFixadas(r.fixadas || []);
        setTemMais(r.temMais);
        if (r.conversa.nao_lidas > 0) acaoConversa(conversaId, { acao: 'lida' }).then(() => onAtualizada({ ...r.conversa, nao_lidas: 0 })).catch(() => {});
      })
      .catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId]);

  // Mudou algo no banco (tempo real) ou passou o intervalo: busca as mais recentes
  useEffect(() => {
    if (sinal) recarregar();
  }, [sinal, recarregar]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && recarregar(), 12000);
    return () => clearInterval(t);
  }, [recarregar]);

  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    if (alturaAntes.current !== null) {
      el.scrollTop += el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
    } else if (colarNoFim.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [mensagens]);

  const anteriores = async () => {
    if (!mensagens.length) return;
    alturaAntes.current = rolagem.current?.scrollHeight ?? null;
    try {
      const r = await fetchConversa(conversaId, mensagens[0].criado_em);
      setTemMais(r.temMais);
      setMensagens((lista) => juntar(lista, r.mensagens));
    } catch (e) {
      alturaAntes.current = null;
      showToast(e.message, 'error');
    }
  };

  const escolherArquivo = async (arquivo, { assinar }) => {
    const pronto = await comprimirFoto(arquivo);
    if (pronto.size > LIMITE_ENVIO) {
      showToast('Arquivo grande demais (máximo de 4 MB). Para vídeos, envie pelo celular ou mande um link.', 'error');
      return;
    }
    setPrevia({ arquivo: pronto, assinar });
  };

  const enviarArquivo = async (arquivo, { legenda = '', segundos = null, assinar = true } = {}) => {
    const tipo = tipoPeloMime(arquivo.type);
    const previewUrl = URL.createObjectURL(arquivo);
    const tmp = { id: `tmp-${Date.now()}`, conversa_id: conversaId, direcao: 'saida', tipo, conteudo: legenda || null, midia: { mime: arquivo.type, nome: arquivo.name, tamanho: arquivo.size, segundos }, previewUrl, status: 'pendente', autor_nome: eu?.nome, criado_em: new Date().toISOString() };
    colarNoFim.current = true;
    setMensagens((l) => [...l, tmp]);
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    if (legenda) fd.append('legenda', legenda);
    if (segundos) fd.append('segundos', String(segundos));
    fd.append('assinar', assinar ? 'true' : 'false');
    try {
      const r = await enviarArquivoConversa(conversaId, fd);
      setMensagens((l) => juntar(l.filter((m) => m.id !== tmp.id), [r.mensagem]));
      if (r.conversa) {
        setConversa(r.conversa);
        onAtualizada(r.conversa);
      }
    } catch (e) {
      setMensagens((l) => l.filter((m) => m.id !== tmp.id));
      showToast(e.message, 'error');
      recarregar();
    } finally {
      setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
    }
  };

  const enviar = async (texto, modo, { assinar = true } = {}) => {
    // Editando: salva a edição em vez de mandar uma nova mensagem
    if (edicao && modo !== 'nota') {
      const alvo = edicao;
      setEdicao(null);
      try {
        const r = await acaoConversa(conversaId, { acao: 'editar', mensagem_id: alvo.id, texto, assinar });
        setMensagens((l) => l.map((x) => (x.id === alvo.id ? { ...x, ...r.mensagem, citada: x.citada } : x)));
      } catch (e) {
        showToast(e.message, 'error');
        setEdicao(alvo);
        throw e;
      }
      return;
    }
    const citada = modo !== 'nota' && resposta ? { id: resposta.id, direcao: resposta.direcao, tipo: resposta.tipo, autor_nome: resposta.autor_nome, conteudo: resposta.conteudo } : null;
    setResposta(null);
    const tmp = { id: `tmp-${Date.now()}`, conversa_id: conversaId, direcao: modo === 'nota' ? 'nota' : 'saida', tipo: 'texto', conteudo: texto, status: 'pendente', autor_nome: eu?.nome, criado_em: new Date().toISOString(), ...(citada ? { citada } : {}) };
    colarNoFim.current = true;
    setMensagens((l) => [...l, tmp]);
    try {
      const r = await acaoConversa(conversaId, { acao: modo === 'nota' ? 'nota' : 'enviar', texto, assinar, ...(citada ? { responde_a: citada.id } : {}) });
      setMensagens((l) => juntar(l.filter((m) => m.id !== tmp.id), [citada ? { ...r.mensagem, citada } : r.mensagem]));
      if (r.conversa) {
        setConversa(r.conversa);
        onAtualizada(r.conversa);
      }
    } catch (e) {
      setMensagens((l) => l.filter((m) => m.id !== tmp.id));
      showToast(e.message, 'error');
      recarregar();
      throw e;
    }
  };

  const irPara = useCallback((id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      showToast('Mensagem antiga: carregue as anteriores para vê-la.', 'info');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate([{ backgroundColor: 'rgba(0,168,132,0.18)' }, { backgroundColor: 'transparent' }], { duration: 1400, easing: 'ease-out' });
  }, []);

  const atualizarMensagem = (m) => {
    setMensagens((l) => l.map((x) => (x.id === m.id ? { ...x, ...m, citada: x.citada } : x)));
    setFixadas((l) => {
      const sem = l.filter((x) => x.id !== m.id);
      return m.fixada_em ? [...sem, m] : sem;
    });
  };

  const acaoNaMensagem = async (id, m, extra) => {
    try {
      if (id === 'responder') {
        setEdicao(null);
        setResposta(m);
      } else if (id === 'copiar') {
        await navigator.clipboard?.writeText(m.conteudo || '');
        showToast('Mensagem copiada.', 'success');
      } else if (id === 'editar') {
        setResposta(null);
        setEdicao(m);
      } else if (id === 'dados') {
        setDados(m);
      } else if (id === 'reacao') {
        await acaoConversa(conversaId, { acao: 'reagir', mensagem_id: m.id, emoji: extra });
        recarregar();
      } else if (id === 'favoritar' || id === 'fixar') {
        const r = await acaoConversa(conversaId, { acao: id, mensagem_id: m.id, valor: id === 'favoritar' ? !m.favorita : !m.fixada_em });
        atualizarMensagem(r.mensagem);
        if (id === 'fixar') recarregar();
      } else if (id === 'apagar_mim') {
        if (!window.confirm('Apagar esta mensagem só para você? O cliente e o restante da equipe continuam vendo.')) return;
        await acaoConversa(conversaId, { acao: 'apagar', mensagem_id: m.id, para: 'mim' });
        setMensagens((l) => l.filter((x) => x.id !== m.id));
        setFixadas((l) => l.filter((x) => x.id !== m.id));
      } else if (id === 'apagar_todos') {
        if (!window.confirm('Apagar esta mensagem para todos? Ela some também do WhatsApp do cliente.')) return;
        const r = await acaoConversa(conversaId, { acao: 'apagar', mensagem_id: m.id, para: 'todos' });
        atualizarMensagem(r.mensagem);
        showToast('Mensagem apagada para todos.', 'success');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  const acoesDoBalao = { onAcao: acaoNaMensagem, irPara, nomeContato: conversa ? nomeDoContato(conversa) : '' };

  const acao = async (nome, corpo, sucesso) => {
    setOcupado(nome);
    try {
      const r = await acaoConversa(conversaId, corpo);
      if (r.conversa) {
        setConversa(r.conversa);
        onAtualizada(r.conversa);
      }
      if (sucesso) showToast(sucesso, 'success');
      colarNoFim.current = true;
      recarregar();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setOcupado(null);
    }
  };

  const grupos = useMemo(() => {
    const saida = [];
    let dia = null;
    // Reações vão para o balão da mensagem reagida, não para a linha do tempo
    const reacoes = {};
    mensagens.forEach((m) => {
      if (m.tipo === 'reacao' && m.responde_a) (reacoes[m.responde_a] ||= []).push(m);
    });
    const linha = mensagens.filter((m) => m.tipo !== 'reacao');
    linha.forEach((m, i) => {
      const d = new Date(m.criado_em).toDateString();
      if (d !== dia) {
        saida.push({ dia: m.criado_em, chave: `d-${d}` });
        dia = d;
      }
      const ant = linha[i - 1];
      const primeira = !ant || ant.direcao !== m.direcao || ant.tipo === 'sistema' || new Date(ant.criado_em).toDateString() !== d || new Date(m.criado_em) - new Date(ant.criado_em) > 5 * 6e4 || ant.autor_nome !== m.autor_nome;
      saida.push({ m, primeira, reacoes: reacoes[m.id] || [] });
    });
    return saida;
  }, [mensagens]);

  if (erro && !conversa)
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[14px] text-slate-500">
        <p>{erro}</p>
        <button type="button" onClick={onVoltar} className={classeBotaoTexto}>
          Voltar
        </button>
      </div>
    );
  if (!conversa)
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <Spinner />
      </div>
    );

  const minha = conversa.responsavel_email === eu?.email;
  const resolvida = conversa.status === 'resolvida';
  const oficial = conversa.canal?.tipo === 'whatsapp_oficial';
  const janelaFechada = oficial && !janelaAtendimento(conversa).aberta;
  const canalFora = !conversa.canal?.ativo || conversa.canal?.status !== 'conectado';
  const bloqueio = resolvida
    ? {
        texto: 'Conversa resolvida.',
        acao: (
          <button type="button" onClick={() => acao('reabrir', { acao: 'reabrir' }, 'Conversa reaberta.')} className="h-9 px-4 rounded-full text-[13px] font-semibold bg-[#00a884] text-white cursor-pointer">
            Reabrir
          </button>
        ),
      }
    : canalFora
      ? { texto: `O canal ${conversa.canal?.nome || ''} está desconectado. Reconecte em Canais para responder.` }
      : janelaFechada
        ? { texto: 'A janela de 24 horas fechou. Pela API oficial, só um template aprovado pode reabrir a conversa (os templates entram na próxima etapa).' }
        : null;

  const grupo = ehGrupo(conversa.contato?.telefone);
  return (
    <div className="flex-1 min-w-0 flex relative">
    <div className="flex-1 min-w-0 flex flex-col relative">
      <header className="h-[60px] flex-shrink-0 px-2 sm:px-4 flex items-center gap-2.5 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-black/[0.06] dark:border-white/[0.04]">
        <button type="button" onClick={onVoltar} aria-label="Voltar para as conversas" className="md:hidden w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button type="button" onClick={() => setPerfil((v) => !v)} className="min-w-0 flex-1 flex items-center gap-2.5 text-left cursor-pointer" title="Ver dados do contato">
        <Avatar conversa={conversa} tamanho="w-10 h-10 text-[13px]" versao={versaoFoto} />
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-semibold truncate text-[#111b21] dark:text-[#e9edef]">{nomeDoContato(conversa)}</p>
          <p className="text-[12px] text-[#667781] dark:text-[#8696a0] truncate">
            {(() => {
              // Com a lista visível, canal, colaborador e departamento já aparecem nas etiquetas dela; no celular, aqui
              const base = [grupo ? 'Grupo' : conversa.contato?.nome ? formatarTelefone(conversa.contato.telefone) : null].filter(Boolean);
              const extra = [conversa.canal?.nome, conversa.responsavel_nome ? `com ${minha ? 'você' : conversa.responsavel_nome}` : null, conversa.departamento].filter(Boolean);
              return (
                <>
                  <span className="hidden md:inline">{base.join(' · ') || 'Clique para ver os dados do contato'}</span>
                  <span className="md:hidden">{[...base, ...extra].join(' · ')}</span>
                </>
              );
            })()}
          </p>
        </div>
        </button>
        <div className="hidden lg:flex items-center gap-1.5">
          {oficial && !resolvida && <JanelaOficial conversa={conversa} />}
        </div>
        {!resolvida && (
          <div className="flex items-center gap-1.5">
            {!minha && (
              <button type="button" onClick={() => acao('assumir', { acao: 'assumir' }, 'Conversa assumida.')} disabled={Boolean(ocupado)} className="h-9 px-3.5 rounded-full text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer disabled:opacity-50">
                Assumir
              </button>
            )}
            <div className="hidden sm:block">
              <MenuTransferir conversa={conversa} onTransferir={(corpo) => acao('transferir', { acao: 'transferir', ...corpo }, 'Conversa transferida.')} />
            </div>
            <button type="button" onClick={() => acao('resolver', { acao: 'resolver' }, 'Conversa resolvida.')} disabled={Boolean(ocupado)} className="h-9 px-3.5 rounded-full text-[13px] font-semibold text-[#008069] dark:text-[#00d4a4] hover:bg-[#00a884]/10 cursor-pointer disabled:opacity-50">
              Resolver
            </button>
          </div>
        )}
      </header>

      {fixadas.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 sm:px-4 h-11 bg-white/95 dark:bg-[#111b21] border-b border-black/[0.06] dark:border-white/[0.05]">
          <button
            type="button"
            onClick={() => {
              const f = fixadas[fixadaAtual % fixadas.length];
              irPara(f.id);
              setFixadaAtual((n) => n + 1);
            }}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
            title={fixadas.length > 1 ? 'Clique para ir até a mensagem e passar para a próxima fixada' : 'Ir até a mensagem fixada'}
          >
            <span className="flex flex-col gap-0.5 flex-shrink-0" aria-hidden="true">
              {fixadas.map((f, i) => (
                <span key={f.id} className={`w-[3px] rounded-full ${fixadas.length > 1 ? 'h-2' : 'h-6'} ${i === fixadaAtual % fixadas.length ? 'bg-[#00a884]' : 'bg-black/15 dark:bg-white/20'}`} />
              ))}
            </span>
            <span className="text-[15px]">📌</span>
            <span className="min-w-0 flex-1 text-[13px] text-[#3b4a54] dark:text-[#d1d7db] truncate">
              {(() => {
                const f = fixadas[fixadaAtual % fixadas.length];
                return f.apagada_em ? 'Mensagem apagada' : f.conteudo || ROTULO_MIDIA[f.tipo] || 'Mensagem';
              })()}
            </span>
          </button>
          <button type="button" onClick={() => acaoNaMensagem('fixar', fixadas[fixadaAtual % fixadas.length])} className="text-[12px] text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-white cursor-pointer flex-shrink-0">
            Desafixar
          </button>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 bg-[#f1f3f5] dark:hidden" style={{ backgroundImage: PAPEL_CLARO, backgroundSize: TAMANHO_PAPEL }} aria-hidden="true" />
        <div className="absolute inset-0 hidden dark:block bg-[#0d1418]" style={{ backgroundImage: PAPEL_ESCURO, backgroundSize: TAMANHO_PAPEL }} aria-hidden="true" />
        <div
          ref={rolagem}
          onScroll={(e) => {
            const el = e.currentTarget;
            colarNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="absolute inset-0 overflow-y-auto px-3 sm:px-[6%] lg:px-[8%] py-3 [--balao-meu:#d9fdd3] dark:[--balao-meu:#005c4b] [--balao-cliente:#ffffff] dark:[--balao-cliente:#202c33]"
          role="log"
          aria-live="polite"
        >
          {temMais && (
            <div className="flex justify-center mb-2">
              <button type="button" onClick={anteriores} className="h-8 px-4 rounded-full text-[12.5px] font-medium bg-white/90 dark:bg-[#182229] text-slate-600 dark:text-[#aebac1] shadow-sm cursor-pointer">
                Carregar mensagens anteriores
              </button>
            </div>
          )}
          {mensagens.length === 0 && <p className="text-center text-[13px] text-slate-500 dark:text-[#8696a0] mt-10">Nenhuma mensagem ainda.</p>}
          {grupos.map((g) =>
            g.dia ? (
              <div key={g.chave} className="flex justify-center my-3 sticky top-0 z-10">
                <span className="px-3 py-1 rounded-lg text-[12px] font-medium bg-white/95 dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] shadow-sm">{rotuloDoDia(g.dia)}</span>
              </div>
            ) : (
              <Balao key={g.m.id} m={g.m} primeiraDoGrupo={g.primeira} reacoes={g.reacoes} acoes={String(g.m.id).startsWith('tmp-') ? null : acoesDoBalao} />
            )
          )}
        </div>
      </div>

      <Compositor
        conversa={conversa}
        eu={eu}
        respostas={respostas}
        onEnviar={enviar}
        onEscolherArquivo={escolherArquivo}
        onEnviarArquivo={enviarArquivo}
        onGerenciarRespostas={onGerenciarRespostas}
        bloqueio={bloqueio}
        resposta={resposta}
        onCancelarResposta={() => setResposta(null)}
        edicao={edicao}
        onCancelarEdicao={() => setEdicao(null)}
        nomeContato={nomeDoContato(conversa)}
      />
      <ModalEtapas aberto={Boolean(dados)} onFechar={() => setDados(null)} largura="max-w-lg" idTitulo="dados-mensagem-titulo" titulo="Dados da mensagem" rodape={null}>
        {dados && <DadosMensagem m={dados} canal={conversa.canal} />}
      </ModalEtapas>
      <AnimatePresence>
        {previa && (
          <PreviaArquivo
            arquivo={previa.arquivo}
            onCancelar={() => setPrevia(null)}
            onEnviar={(legenda) => {
              const p = previa;
              setPrevia(null);
              enviarArquivo(p.arquivo, { legenda, assinar: p.assinar });
            }}
          />
        )}
      </AnimatePresence>
    </div>
      <AnimatePresence>
        {perfil && conversa.contato?.id && (
          <ChatPerfilContato
            key={conversa.contato.id}
            contatoId={conversa.contato.id}
            conversaAtualId={conversa.id}
            Avatar={Avatar}
            onFechar={() => setPerfil(false)}
            onAbrirConversa={onAbrirConversa}
            admin={Boolean(eu?.admin)}
            onExcluida={() => onExcluida?.(conversa.id)}
            onMudou={(c) => {
              setConversa((cv) => (cv ? { ...cv, contato: { ...cv.contato, ...c } } : cv));
              if (c.tem_foto) setVersaoFoto((v) => v + 1);
              onContatoMudou?.(c);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------------------
// Nova conversa
// ------------------------------------------------------------------------------
function NovaConversaModal({ aberto, onFechar, onCriada }) {
  const [canais, setCanais] = useState([]);
  const [dados, setDados] = useState({ canal_id: '', telefone: '', texto: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setDados({ canal_id: '', telefone: '', texto: '' });
    fetchCanais()
      .then((r) => {
        const prontos = r.canais.filter((c) => c.ativo && c.status === 'conectado' && c.tipo === 'whatsapp_qr');
        setCanais(prontos);
        if (prontos.length) setDados((d) => ({ ...d, canal_id: prontos[0].id }));
      })
      .catch((e) => setErro(e.message));
  }, [aberto]);
  const enviar = async () => {
    setEnviando(true);
    setErro('');
    try {
      const r = await iniciarConversa(dados);
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
      largura="max-w-md"
      idTitulo="nova-conversa-titulo"
      titulo="Nova conversa"
      subtitulo="Manda a primeira mensagem para um número pelo WhatsApp."
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onFechar} className={classeBotaoTexto}>
              Cancelar
            </button>
            <button type="button" onClick={enviar} disabled={enviando || !dados.canal_id || !dados.telefone.trim() || !dados.texto.trim()} className={classeBotaoPrimario}>
              {enviando && <Spinner />}
              Enviar
            </button>
          </div>
        </>
      }
    >
      {canais.length === 0 && !erro ? (
        <p className="text-[13.5px] text-slate-500 dark:text-zinc-400">Nenhum canal por QR Code conectado. Pela API oficial, a primeira mensagem precisa ser um template aprovado pela Meta.</p>
      ) : (
        <div className="space-y-3">
          {canais.length > 1 && (
            <label className="block">
              <span className={classeRotulo}>Canal</span>
              <select value={dados.canal_id} onChange={(e) => setDados({ ...dados, canal_id: e.target.value })} className={`${classeCampo} cursor-pointer`}>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className={classeRotulo}>WhatsApp</span>
            <input type="tel" value={dados.telefone} onChange={(e) => setDados({ ...dados, telefone: e.target.value })} placeholder="(85) 99999-0000" className={classeCampo} autoFocus />
          </label>
          <label className="block">
            <span className={classeRotulo}>Mensagem</span>
            <textarea value={dados.texto} onChange={(e) => setDados({ ...dados, texto: e.target.value })} rows={3} maxLength={4096} className={`${classeCampo} h-auto py-3 resize-none`} />
          </label>
        </div>
      )}
    </ModalEtapas>
  );
}

// ------------------------------------------------------------------------------
// Tela
// ------------------------------------------------------------------------------
const ABAS = [
  { id: 'fila', rotulo: 'Fila' },
  { id: 'minhas', rotulo: 'Minhas' },
  { id: 'todas', rotulo: 'Todas' },
  { id: 'grupos', rotulo: 'Grupos' },
  { id: 'resolvidas', rotulo: 'Resolvidas' },
];
const ehConversaDeGrupo = (c) => ehGrupo(c?.contato?.telefone);

export default function ChatView() {
  const [abertas, setAbertas] = useState(null);
  const [resolvidas, setResolvidas] = useState(null);
  const [eu, setEu] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('fila');
  const [busca, setBusca] = useState('');
  const [selecionada, setSelecionada] = useState(null);
  const [sinal, setSinal] = useState(0);
  const [respostas, setRespostas] = useState([]);
  const [gerenciar, setGerenciar] = useState(false);
  const [novaConversa, setNovaConversa] = useState(false);
  const [config, setConfig] = useState({ grupos: 'desligado' });
  const escolhidaPorPadrao = useRef(false);
  // "Aba própria": grupos ficam fora da Fila, Minhas e Todas
  const gruposAParte = config.grupos === 'aba';

  const carregar = useCallback(async () => {
    try {
      const r = await fetchConversas('abertas');
      setAbertas(r.conversas);
      setEu(r.eu);
      if (r.config) setConfig(r.config);
      setErro('');
      // Primeira vez: abre na aba que tem algo para fazer
      if (!escolhidaPorPadrao.current) {
        escolhidaPorPadrao.current = true;
        const individuais = r.config?.grupos === 'aba' ? r.conversas.filter((c) => !ehConversaDeGrupo(c)) : r.conversas;
        const minhas = individuais.some((c) => c.responsavel_email === r.eu.email);
        const fila = individuais.some((c) => !c.responsavel_email);
        setAba(fila ? 'fila' : minhas ? 'minhas' : 'todas');
      }
    } catch (e) {
      setErro(e.message);
    }
  }, []);
  const carregarResolvidas = useCallback(() => fetchConversas('resolvidas').then((r) => setResolvidas(r.conversas)).catch((e) => showToast(e.message, 'error')), []);
  const carregarRespostas = useCallback(() => fetchRespostasRapidas().then((r) => setRespostas(r.respostas)).catch(() => {}), []);

  useEffect(() => {
    carregar();
    carregarRespostas();
    let canal = null;
    let espera = null;
    if (isSupabaseConfigured && supabase) {
      // Tempo real: qualquer mudança vira um aviso; a tela busca de novo pelo servidor (que confere a permissão)
      const avisar = () => {
        clearTimeout(espera);
        espera = setTimeout(() => {
          carregar();
          setSinal((n) => n + 1);
        }, 350);
      };
      canal = supabase
        .channel('chat_ao_vivo')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens' }, avisar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, avisar)
        .subscribe();
    }
    const t = setInterval(() => document.visibilityState === 'visible' && carregar(), 20000);
    return () => {
      clearInterval(t);
      clearTimeout(espera);
      if (canal) supabase.removeChannel(canal);
    };
  }, [carregar, carregarRespostas]);

  useEffect(() => {
    if (aba === 'resolvidas') carregarResolvidas();
  }, [aba, carregarResolvidas]);

  const atualizada = useCallback(
    (c) => {
      const aplicar = (lista) => (lista ? (lista.some((x) => x.id === c.id) ? lista.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [c, ...lista]) : lista);
      if (c.status === 'resolvida') {
        setAbertas((l) => (l || []).filter((x) => x.id !== c.id));
        setResolvidas(aplicar);
      } else {
        setAbertas(aplicar);
        setResolvidas((l) => (l ? l.filter((x) => x.id !== c.id) : l));
      }
    },
    []
  );

  const contagem = useMemo(() => {
    const todas = abertas || [];
    const l = gruposAParte ? todas.filter((c) => !ehConversaDeGrupo(c)) : todas;
    return {
      fila: l.filter((c) => !c.responsavel_email).length,
      minhas: l.filter((c) => c.responsavel_email === eu?.email).length,
      todas: l.length,
      grupos: todas.filter((c) => ehConversaDeGrupo(c) && c.nao_lidas > 0).length,
    };
  }, [abertas, eu, gruposAParte]);

  const lista = useMemo(() => {
    let l = aba === 'resolvidas' ? resolvidas || [] : abertas || [];
    if (aba === 'grupos') l = l.filter(ehConversaDeGrupo);
    else if (gruposAParte && aba !== 'resolvidas') l = l.filter((c) => !ehConversaDeGrupo(c));
    if (aba === 'fila') l = l.filter((c) => !c.responsavel_email);
    if (aba === 'minhas') l = l.filter((c) => c.responsavel_email === eu?.email);
    const b = busca.trim().toLowerCase();
    if (b) {
      const digitos = b.replace(/\D/g, '');
      l = l.filter((c) => String(c.contato?.nome || '').toLowerCase().includes(b) || (digitos && String(c.contato?.telefone || '').includes(digitos)) || String(c.ultima_mensagem_texto || '').toLowerCase().includes(b));
    }
    return [...l].sort((a, b2) => new Date(b2.ultima_mensagem_em || b2.criado_em) - new Date(a.ultima_mensagem_em || a.criado_em));
  }, [aba, abertas, resolvidas, busca, eu, gruposAParte]);

  // Fotos: busca no WhatsApp a de quem ainda não tem (2 por vez; cada contato no máximo 1 vez por dia)
  const buscandoFotos = useRef(false);
  useEffect(() => {
    if (!abertas?.length || buscandoFotos.current) return;
    let tentadas = {};
    try {
      tentadas = JSON.parse(localStorage.getItem('rm_chat_fotos_tentadas') || '{}');
    } catch {}
    const dia = Date.now() - 24 * 60 * 60 * 1000;
    const fila = [...new Map(abertas.filter((c) => c.contato?.id && !c.contato.tem_foto && !(tentadas[c.contato.id] > dia)).map((c) => [c.contato.id, c.contato.id])).values()].slice(0, 20);
    if (!fila.length) return;
    buscandoFotos.current = true;
    const marcar = (id) => {
      tentadas[id] = Date.now();
      try {
        localStorage.setItem('rm_chat_fotos_tentadas', JSON.stringify(tentadas));
      } catch {}
    };
    const trabalhar = async () => {
      while (fila.length) {
        const id = fila.shift();
        try {
          const r = await atualizarFotoContato(id);
          if (r.tem_foto) contatoMudou({ id, tem_foto: true });
        } catch {}
        marcar(id);
      }
    };
    Promise.all([trabalhar(), trabalhar()]).finally(() => {
      buscandoFotos.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertas?.length]);

  // O número da aba Chat no cabeçalho acompanha a tela na hora
  useEffect(() => {
    if (abertas) window.dispatchEvent(new CustomEvent('rm_chat_contagem', { detail: contarConversasNovas(abertas, config) }));
  }, [abertas, config]);

  const contatoMudou = useCallback((c) => {
    const aplicar = (l) => (l ? l.map((x) => (x.contato?.id === c.id ? { ...x, contato: { ...x.contato, ...c } } : x)) : l);
    setAbertas(aplicar);
    setResolvidas(aplicar);
  }, []);

  const carregando = aba === 'resolvidas' ? resolvidas === null : abertas === null;

  return (
    <div className="h-[calc(100dvh-178px)] md:h-[calc(100dvh-40px-var(--rm-cabecalho,78px))] md:transition-[height] md:duration-500 min-h-[460px] flex rounded-[22px] overflow-hidden ring-1 ring-black/[0.08] dark:ring-white/[0.08] bg-white dark:bg-[#111b21] shadow-[0_10px_40px_-18px_rgba(0,0,0,0.25)]">
      {/* Lista */}
      <aside className={`${selecionada ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] lg:w-[380px] flex-shrink-0 flex-col border-r border-black/[0.07] dark:border-white/[0.06] bg-white dark:bg-[#111b21]`}>
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-[#111b21] dark:text-[#e9edef] flex-1">Chat</h1>
          <button type="button" onClick={() => setNovaConversa(true)} aria-label="Nova conversa" title="Nova conversa" className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#54656f] dark:text-[#8696a0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar nome, número ou mensagem" aria-label="Pesquisar conversas" className="w-full h-9 rounded-lg pl-10 pr-3 text-[14px] bg-[#f0f2f5] dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] dark:placeholder:text-[#8696a0] outline-none focus:ring-2 focus:ring-[#00a884]/40" />
          </div>
          <div className="flex gap-1 mt-2.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="tablist">
            {ABAS.filter((a) => a.id !== 'grupos' || gruposAParte).map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={`h-8 px-2.5 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors ${aba === a.id ? 'bg-[#d9fdd3] text-[#008069] dark:bg-[#0a332c] dark:text-[#00d4a4]' : 'bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#8696a0] hover:bg-[#e6e8eb] dark:hover:bg-[#26353d]'}`}
              >
                {a.rotulo}
                {contagem[a.id] ? <span className="ml-1.5 tabular-nums opacity-80">{contagem[a.id]}</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {erro ? (
            <p className="m-4 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-300 px-4 py-3 text-[13.5px]">{erro}</p>
          ) : carregando ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Spinner />
            </div>
          ) : lista.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-[14.5px] font-semibold text-[#111b21] dark:text-[#e9edef]">{busca ? 'Nada encontrado' : { fila: 'Fila vazia', minhas: 'Nenhuma conversa com você', todas: 'Nenhuma conversa aberta', grupos: 'Nenhum grupo com mensagens', resolvidas: 'Nenhuma conversa resolvida' }[aba]}</p>
              <p className="mt-1 text-[13px] text-[#667781] dark:text-[#8696a0]">{aba === 'fila' && !busca ? 'Mensagens novas dos clientes aparecem aqui.' : ''}</p>
            </div>
          ) : (
            <ul>
              {lista.map((c) => {
                const ativa = c.id === selecionada;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelecionada(c.id)}
                      className={`w-full flex items-center gap-3 pl-3 pr-3.5 py-2.5 text-left cursor-pointer transition-colors ${ativa ? 'bg-[#f0f2f5] dark:bg-[#2a3942]' : 'hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'}`}
                    >
                      <Avatar conversa={c} />
                      <div className="min-w-0 flex-1 border-b border-black/[0.05] dark:border-white/[0.05] pb-2.5 -mb-2.5">
                        <div className="flex items-baseline gap-2">
                          <span className="flex-1 truncate text-[15.5px] text-[#111b21] dark:text-[#e9edef]">{nomeDoContato(c)}</span>
                          <span className={`text-[11.5px] flex-shrink-0 ${c.nao_lidas ? 'text-[#00a884] font-semibold' : 'text-[#667781] dark:text-[#8696a0]'}`}>{quandoNaLista(c.ultima_mensagem_em || c.criado_em)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex-1 truncate text-[13.5px] text-[#667781] dark:text-[#8696a0]">{c.ultima_mensagem_texto || 'Sem mensagens'}</span>
                          {c.nao_lidas > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#00a884] text-white dark:text-[#111b21] text-[11.5px] font-bold flex items-center justify-center tabular-nums">{c.nao_lidas > 99 ? '99+' : c.nao_lidas}</span>}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
                          <Etiquetas conversa={c} eu={eu} />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Conversa */}
      <section className={`${selecionada ? 'flex' : 'hidden md:flex'} flex-1 min-w-0`}>
        {selecionada ? (
          <PainelConversa
            key={selecionada}
            conversaId={selecionada}
            eu={eu}
            sinal={sinal}
            respostas={respostas}
            onAtualizada={atualizada}
            onContatoMudou={contatoMudou}
            onAbrirConversa={setSelecionada}
            onExcluida={(id) => {
              setAbertas((l) => (l || []).filter((x) => x.id !== id));
              setResolvidas((l) => (l ? l.filter((x) => x.id !== id) : l));
              setSelecionada(null);
            }}
            onVoltar={() => setSelecionada(null)}
            onGerenciarRespostas={() => setGerenciar(true)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-[#f0f2f5] dark:bg-[#222e35] border-b-[6px] border-[#25d366]">
            <span className="w-16 h-16 rounded-full bg-[#00a884]/12 text-[#008069] dark:text-[#00d4a4] flex items-center justify-center">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 8 19.4L3 21z" />
              </svg>
            </span>
            <p className="mt-5 text-[26px] font-light text-[#41525d] dark:text-[#e9edef]">RM Controle Chat</p>
            <p className="mt-2 text-[13.5px] text-[#667781] dark:text-[#8696a0] max-w-sm leading-relaxed">Escolha uma conversa à esquerda. Mensagens dos clientes chegam aqui na hora, pelos números conectados em Canais.</p>
            <p className="mt-6 text-[12px] text-[#8696a0] flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
              </svg>
              Cada pessoa vê só as conversas do seu departamento
            </p>
          </div>
        )}
      </section>

      <GerenciarRespostas aberto={gerenciar} onFechar={() => setGerenciar(false)} respostas={respostas} admin={Boolean(eu?.admin)} onMudou={carregarRespostas} />
      <NovaConversaModal
        aberto={novaConversa}
        onFechar={() => setNovaConversa(false)}
        onCriada={(c) => {
          atualizada(c);
          setAba('minhas');
          setSelecionada(c.id);
        }}
      />
    </div>
  );
}
