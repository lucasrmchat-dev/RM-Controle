'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { removerAcentos } from '@/lib/storage';
import { classeCampo } from './NovaEmpresaCampos';
import { CheckIcon, XMarkIcon } from './Icons';

/**
 * Peças compartilhadas dos formulários em etapas (Nova demanda, Suporte retroativo, Finalizar atendimento):
 * mesma moldura, mesma hierarquia e o mesmo comportamento em todos.
 */

export const EASE = [0.16, 1, 0.3, 1];
export const normalizarBusca = (t) => removerAcentos(String(t || '').toLowerCase().trim());

export const classeBotaoPrimario =
  'h-11 px-5 rounded-full text-sm font-semibold bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 shadow-md shadow-[#4d7c0f]/20 dark:shadow-[#84cc16]/20 hover:opacity-95 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 transition-opacity';
export const classeBotaoSecundario =
  'h-11 px-5 rounded-full text-sm font-semibold border border-black/[0.14] dark:border-white/[0.18] bg-white dark:bg-white/[0.04] text-[#1d1d1f] dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.08] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-colors';
export const classeBotaoTexto =
  'h-11 px-4 rounded-full text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer disabled:opacity-50 transition-colors';

export const Spinner = () => <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />;

/** Moldura do formulário: portal, fundo, folha no celular, cabeçalho, corpo rolável e rodapé fixo. */
export function ModalEtapas({ aberto, onFechar, bloqueado = false, titulo, subtitulo, contexto, largura = 'max-w-5xl', rodape, children, idTitulo = 'formulario-etapas-titulo' }) {
  const reduzir = useReducedMotion();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!aberto) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e) => e.key === 'Escape' && !bloqueado && onFechar();
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', esc);
    };
  }, [aberto, bloqueado, onFechar]);

  if (!montado) return null;
  return createPortal(
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="fundo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[99999] bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
          onMouseDown={(e) => e.target === e.currentTarget && !bloqueado && onFechar()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitulo}
            initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE }}
            className={`w-full ${largura} max-h-[94dvh] sm:max-h-[90vh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-[#fbfbfa] dark:bg-[#151517] border border-black/[0.08] dark:border-white/[0.1] shadow-2xl text-[#1d1d1f] dark:text-white`}
          >
            <header className="flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="min-w-0">
                {contexto && <div className="mb-2">{contexto}</div>}
                <h2 id={idTitulo} className="text-xl sm:text-2xl font-bold tracking-tight">{titulo}</h2>
                {subtitulo && <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">{subtitulo}</p>}
              </div>
              <button
                type="button"
                onClick={onFechar}
                disabled={bloqueado}
                aria-label="Fechar"
                className="w-9 h-9 -mr-2 rounded-full flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">{children}</div>
            {rodape && (
              <footer className="px-6 sm:px-8 py-4 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.02] sm:rounded-b-[28px]">
                {rodape}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/**
 * Etapa numerada: número → check quando concluída; travada (esmaecida e sem clique) até a anterior terminar.
 * `fimDeColuna`: última etapa da coluna no desktop (a linha some a partir de lg).
 */
export function Etapa({ numero, titulo, descricao, estado, ultima = false, fimDeColuna = false, children }) {
  const travada = estado === 'travada';
  const concluida = estado === 'concluida';
  return (
    <section aria-disabled={travada} className={`grid grid-cols-[32px_1fr] gap-x-4 transition-opacity duration-300 ${travada ? 'opacity-45' : ''}`}>
      <div className="flex flex-col items-center">
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-colors duration-300 ${
            concluida
              ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950'
              : travada
                ? 'border border-black/15 dark:border-white/20 text-slate-400'
                : 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]'
          }`}
        >
          {concluida ? <CheckIcon className="w-4 h-4 stroke-[3]" /> : numero}
        </span>
        {!ultima && <span className={`flex-1 w-px my-2 bg-black/[0.08] dark:bg-white/[0.1] ${fimDeColuna ? 'lg:hidden' : ''}`} />}
      </div>
      <div className={`min-w-0 ${ultima ? '' : fimDeColuna ? 'pb-8 lg:pb-0' : 'pb-8'}`}>
        <h3 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-white leading-8">{titulo}</h3>
        {descricao && <p className="text-[13px] text-slate-500 dark:text-zinc-400 -mt-0.5 mb-3.5">{descricao}</p>}
        <div className={travada ? 'pointer-events-none select-none' : ''}>{children}</div>
      </div>
    </section>
  );
}

/** Combobox: digita, filtra, ↑↓ Enter; opcionalmente oferece "cadastrar novo" como última opção. */
export function Combobox({ id, placeholder, opcoes, renderOpcao, onEscolher, opcaoNova, onNova, autoFocus = false, mostrarAoFocar = true }) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const caixaRef = useRef(null);

  const filtradas = useMemo(() => {
    const q = normalizarBusca(termo);
    const lista = q
      ? opcoes
          .map((o) => ({ o, i: normalizarBusca(o.nome).indexOf(q) }))
          .filter((x) => x.i !== -1)
          .sort((a, b) => (a.i === 0 ? 0 : 1) - (b.i === 0 ? 0 : 1))
          .map((x) => x.o)
      : mostrarAoFocar
        ? opcoes
        : [];
    return lista.slice(0, 8);
  }, [opcoes, termo, mostrarAoFocar]);
  const existeExata = filtradas.some((o) => normalizarBusca(o.nome) === normalizarBusca(termo));
  const mostrarNova = Boolean(onNova && termo.trim().length >= 2 && !existeExata);
  const total = filtradas.length + (mostrarNova ? 1 : 0);

  useEffect(() => setDestaque(0), [termo]);
  useEffect(() => {
    const fora = (e) => caixaRef.current && !caixaRef.current.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const escolher = (i) => {
    if (i < filtradas.length) onEscolher(filtradas[i]);
    else if (mostrarNova) onNova(termo.trim());
    setTermo('');
    setAberto(false);
  };

  return (
    <div ref={caixaRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        autoComplete="off"
        value={termo}
        placeholder={placeholder}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAberto(true);
            if (total) setDestaque((d) => (d + 1) % total);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (total) setDestaque((d) => (d - 1 + total) % total);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (aberto && total) escolher(destaque);
          } else if (e.key === 'Escape') {
            if (aberto) e.stopPropagation();
            setAberto(false);
          }
        }}
        className={classeCampo}
      />
      <AnimatePresence>
        {aberto && (total > 0 || termo) && (
          <motion.ul
            id={`${id}-lista`}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute z-30 left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-black/[0.1] dark:border-white/[0.14] bg-white dark:bg-[#1c1c20] shadow-xl p-1.5"
          >
            {filtradas.map((o, i) => (
              <li
                key={o.id || o.nome}
                role="option"
                aria-selected={i === destaque}
                onMouseEnter={() => setDestaque(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(i);
                }}
                className={`px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${i === destaque ? 'bg-black/[0.05] dark:bg-white/[0.08]' : ''}`}
              >
                {renderOpcao(o)}
              </li>
            ))}
            {filtradas.length === 0 && !mostrarNova && <li className="px-3 py-3 text-sm text-slate-500 dark:text-zinc-400">Nada encontrado.</li>}
            {mostrarNova && (
              <li
                role="option"
                aria-selected={destaque === filtradas.length}
                onMouseEnter={() => setDestaque(filtradas.length)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(filtradas.length);
                }}
                className={`mt-1 px-3 py-2.5 rounded-lg cursor-pointer border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2.5 text-sm font-semibold text-[#4d7c0f] dark:text-[#84cc16] ${
                  destaque === filtradas.length ? 'bg-[#4d7c0f]/[0.08] dark:bg-[#84cc16]/[0.1]' : ''
                }`}
              >
                <span className="w-5 h-5 rounded-md bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 flex items-center justify-center text-base leading-none">+</span>
                <span className="truncate">{opcaoNova(termo.trim())}</span>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Cartão do item escolhido no combobox, com ação para trocar. */
export function Escolhido({ icone, titulo, detalhe, selo, onTrocar, rotuloTrocar = 'Trocar' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="flex items-center gap-3 h-14 pl-3 pr-2 rounded-xl border border-black/[0.12] dark:border-white/[0.14] bg-white dark:bg-white/[0.04]"
    >
      <span className="w-9 h-9 rounded-lg bg-black/[0.05] dark:bg-white/[0.08] flex items-center justify-center flex-shrink-0 text-slate-600 dark:text-zinc-300">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1d1d1f] dark:text-white truncate">{titulo}</span>
          {selo}
        </span>
        {detalhe && <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{detalhe}</span>}
      </span>
      {onTrocar && (
        <button
          type="button"
          onClick={onTrocar}
          className="h-9 px-3 rounded-lg text-[13px] font-semibold text-slate-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
        >
          {rotuloTrocar}
        </button>
      )}
    </motion.div>
  );
}

export function SeloNovo({ children = 'Novo' }) {
  return <span className="px-1.5 py-0.5 rounded-md bg-[#4d7c0f]/12 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] text-[11px] font-bold">{children}</span>;
}

/** Bloco que abre/fecha com altura animada. */
export function Expandir({ aberto, children }) {
  return (
    <AnimatePresence initial={false}>
      {aberto && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pílulas de escolha (uma ou várias). */
export function Pilulas({ opcoes, selecionadas, onAlternar, rotuloId, cor = 'escura' }) {
  const ativoCls =
    cor === 'marca'
      ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 border-transparent'
      : 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent';
  return (
    <div role="group" aria-labelledby={rotuloId} className="flex flex-wrap gap-2">
      {opcoes.map((op) => {
        const ativo = selecionadas.includes(op);
        return (
          <button
            key={op}
            type="button"
            aria-pressed={ativo}
            onClick={() => onAlternar(op)}
            className={`h-9 px-3.5 rounded-full text-[13px] font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
              ativo
                ? ativoCls
                : 'bg-white dark:bg-white/[0.04] border-black/[0.12] dark:border-white/[0.14] text-slate-700 dark:text-zinc-300 hover:border-black/25 dark:hover:border-white/25'
            }`}
          >
            {ativo && <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />}
            {op}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Escolha única entre muitas opções sem lista com rolagem: as mais usadas ficam à vista como pílulas,
 * o resto abre no mesmo lugar e "Outra" vira um campo para criar na hora.
 * `valor` é { nome, nova } ou null.
 */
export function SeletorCategoria({ opcoes, valor, onMudar, rotuloId, visiveis = 8 }) {
  const [todas, setTodas] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [criando, setCriando] = useState(false);
  const [texto, setTexto] = useState('');
  const campoRef = useRef(null);

  useEffect(() => {
    if (criando) campoRef.current?.focus();
  }, [criando]);

  const termo = normalizarBusca(filtro);
  const comFiltro = opcoes.length > 12 && todas;
  let mostradas = termo ? opcoes.filter((o) => normalizarBusca(o).includes(termo)) : todas ? opcoes : opcoes.slice(0, visiveis);
  // A escolhida continua à vista mesmo fora das mais usadas
  if (valor?.nome && !valor.nova && !mostradas.includes(valor.nome)) mostradas = [valor.nome, ...mostradas];
  const ocultas = opcoes.length - visiveis;

  const confirmarNova = () => {
    const nome = texto.trim().replace(/\s+/g, ' ');
    if (!nome) return setCriando(false);
    const existente = opcoes.find((o) => normalizarBusca(o) === normalizarBusca(nome));
    onMudar(existente ? { nome: existente } : { nome, nova: true });
    setTexto('');
    setCriando(false);
  };

  const pilula = (ativo) =>
    `h-9 px-3.5 rounded-full text-[13px] font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
      ativo
        ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent'
        : 'bg-white dark:bg-white/[0.04] border-black/[0.12] dark:border-white/[0.14] text-slate-700 dark:text-zinc-300 hover:border-black/25 dark:hover:border-white/25'
    }`;
  const pilulaSutil =
    'h-9 px-3.5 rounded-full text-[13px] font-medium border border-dashed border-black/[0.18] dark:border-white/[0.2] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-colors cursor-pointer';

  return (
    <div className="space-y-2.5">
      {comFiltro && (
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar categorias"
          aria-label="Filtrar categorias"
          className={`${classeCampo} h-9 text-[13px]`}
        />
      )}
      <div role="group" aria-labelledby={rotuloId} className="flex flex-wrap gap-2">
        {mostradas.map((op) => {
          const ativo = valor?.nome === op && !valor?.nova;
          return (
            <button key={op} type="button" aria-pressed={ativo} onClick={() => onMudar(ativo ? null : { nome: op })} className={pilula(ativo)}>
              {ativo && <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />}
              {op}
            </button>
          );
        })}
        {valor?.nova && (
          <button type="button" aria-pressed onClick={() => onMudar(null)} className={pilula(true)}>
            <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />
            {valor.nome}
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">nova</span>
          </button>
        )}
        {termo && mostradas.length === 0 && <span className="h-9 flex items-center text-[13px] text-slate-500 dark:text-zinc-400">Nenhuma categoria com esse nome.</span>}
        {!termo && ocultas > 0 && (
          <button type="button" onClick={() => { setTodas((v) => !v); setFiltro(''); }} className={pilulaSutil}>
            {todas ? 'Mostrar menos' : `+ ${ocultas} outras`}
          </button>
        )}
        {criando ? (
          <span className="flex items-center gap-1.5">
            <input
              ref={campoRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmarNova(); }
                if (e.key === 'Escape') { e.stopPropagation(); setCriando(false); setTexto(''); }
              }}
              onBlur={confirmarNova}
              maxLength={60}
              placeholder="Nome da categoria"
              aria-label="Nome da nova categoria"
              className="h-9 w-48 px-3.5 rounded-full text-[13px] border border-black/25 dark:border-white/30 bg-white dark:bg-white/[0.04] outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/15"
            />
          </span>
        ) : (
          <button type="button" onClick={() => setCriando(true)} className={pilulaSutil}>
            + Outra
          </button>
        )}
      </div>
    </div>
  );
}

/** Mensagem de erro animada do rodapé. */
export function ErroRodape({ erro }) {
  return (
    <AnimatePresence>
      {erro && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="text-[13px] text-red-700 dark:text-red-400 mb-3 overflow-hidden"
        >
          {erro}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
