'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { removerAcentos } from '@/lib/storage';
import { BuildingIcon, PlayIcon } from './Icons';

const normalizar = (t) => removerAcentos(String(t || '').toLowerCase().trim());

const isEspera = (c) => c.status === 'aguardando_visualizacao' || c.status === 'pendente';
const isAtivo = (c) => c.status === 'em_andamento';

/**
 * Barra de comando da Fila: encontra a empresa e já age sobre ela (atender, abrir demanda, ver cadastro)
 * ou cadastra uma empresa nova sem sair da fila. Atalho "/" foca a busca.
 */
export default function QueueCommandBar({
  empresas = [],
  chamados = [],
  onAtenderAgora,
  onAbrirDemanda,
  onVerEmpresa,
  onCriarEmpresa,
  onVerTodas,
}) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);
  const caixaRef = useRef(null);

  // "/" em qualquer lugar da tela foca a busca (exceto quando já se está digitando em um campo)
  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target;
      const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
      if (digitando) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  useEffect(() => {
    const fora = (e) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  // Demandas abertas por empresa (para mostrar "2 na fila" e permitir assumir a existente)
  const abertasPorEmpresa = useMemo(() => {
    const mapa = new Map();
    chamados.forEach((c) => {
      if (!isEspera(c) && !isAtivo(c)) return;
      const chave = c.empresa_id || normalizar(c.empresa_nome);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(c);
    });
    return mapa;
  }, [chamados]);

  const demandasDa = (emp) => abertasPorEmpresa.get(emp.id) || abertasPorEmpresa.get(normalizar(emp.nome)) || [];

  const q = normalizar(termo);
  const resultados = useMemo(() => {
    if (!q) return [];
    const lista = empresas
      .map((e) => {
        const nome = normalizar(e.nome);
        const idx = nome.indexOf(q);
        if (idx === -1) return null;
        // Começa com o termo > contém o termo; depois ordem alfabética
        return { e, peso: idx === 0 ? 0 : 1 };
      })
      .filter(Boolean)
      .sort((a, b) => a.peso - b.peso || (a.e.nome || '').localeCompare(b.e.nome || '', 'pt-BR'))
      .slice(0, 7)
      .map((r) => r.e);
    return lista;
  }, [empresas, q]);

  const existeExata = resultados.some((e) => normalizar(e.nome) === q);
  const podeCriar = Boolean(termo.trim().length >= 2 && !existeExata && onCriarEmpresa);
  const totalItens = resultados.length + (podeCriar ? 1 : 0);

  useEffect(() => setDestaque(0), [q]);

  const executar = async (fn, ...args) => {
    if (ocupado || !fn) return;
    setOcupado(true);
    try {
      await fn(...args);
      setTermo('');
      setAberto(false);
      inputRef.current?.blur();
    } finally {
      setOcupado(false);
    }
  };

  const acaoPrincipal = (emp) => {
    const espera = demandasDa(emp).filter(isEspera);
    return executar(onAtenderAgora, emp, espera[0] || null);
  };

  const aoTeclar = (e) => {
    if (e.key === 'Escape') {
      setAberto(false);
      inputRef.current?.blur();
      return;
    }
    if (!totalItens) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setDestaque((d) => (d + 1) % totalItens);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque((d) => (d - 1 + totalItens) % totalItens);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (destaque < resultados.length) acaoPrincipal(resultados[destaque]);
      else if (podeCriar) executar(onCriarEmpresa, termo.trim());
    }
  };

  const mostrarPainel = aberto && q.length > 0;

  return (
    <div ref={caixaRef} className="relative z-40 w-full">
      <div
        className={`flex items-center gap-3 h-12 px-4 rounded-2xl border bg-white dark:bg-[#1e1e21] transition-all ${
          mostrarPainel
            ? 'border-[#4d7c0f]/50 dark:border-[#84cc16]/50 ring-4 ring-[#4d7c0f]/10 dark:ring-[#84cc16]/10'
            : 'border-black/[0.08] dark:border-white/[0.1] hover:border-black/20 dark:hover:border-white/20 shadow-sm'
        }`}
      >
        <svg className="w-[18px] h-[18px] text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
          placeholder="Buscar empresa para atender, abrir demanda ou cadastrar…"
          className="flex-1 min-w-0 bg-transparent text-sm text-[#1d1d1f] dark:text-white placeholder:text-slate-400 focus:outline-none"
          aria-label="Buscar empresa"
          autoComplete="off"
        />
        {ocupado ? (
          <span className="w-4 h-4 rounded-full border-2 border-[#4d7c0f] dark:border-[#84cc16] border-t-transparent animate-spin flex-shrink-0" />
        ) : termo ? (
          <button
            type="button"
            onClick={() => {
              setTermo('');
              inputRef.current?.focus();
            }}
            className="w-6 h-6 rounded-full text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-xs cursor-pointer"
            aria-label="Limpar busca"
          >
            ✕
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md border border-black/10 dark:border-white/15 text-[11px] text-slate-400 font-sans">
            /
          </kbd>
        )}
      </div>

      <AnimatePresence>
        {mostrarPainel && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1e1e21] shadow-2xl overflow-hidden"
          >
            {resultados.length === 0 && !podeCriar && (
              <p className="px-4 py-5 text-sm text-slate-500 dark:text-zinc-400 text-center">Nenhuma empresa encontrada.</p>
            )}

            {resultados.length > 0 && (
              <ul className="max-h-[60vh] overflow-y-auto p-1.5">
                {resultados.map((emp, i) => {
                  const abertas = demandasDa(emp);
                  const esperando = abertas.filter(isEspera);
                  const emAtendimento = abertas.filter(isAtivo);
                  const ativo = i === destaque;
                  return (
                    <li
                      key={emp.id || emp.nome}
                      onMouseEnter={() => setDestaque(i)}
                      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                        ativo ? 'bg-black/[0.04] dark:bg-white/[0.06]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <BuildingIcon className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white truncate">{emp.nome}</p>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                            {emp.servidor_alocado && <span>{emp.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}</span>}
                            {esperando.length > 0 && (
                              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                                {esperando.length === 1 ? '1 aguardando' : `${esperando.length} aguardando`}
                              </span>
                            )}
                            {emAtendimento.length > 0 && (
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                {emAtendimento.length === 1 ? '1 em atendimento' : `${emAtendimento.length} em atendimento`}
                              </span>
                            )}
                            {abertas.length === 0 && <span>Sem demandas abertas</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0 pl-12 sm:pl-0">
                        <button
                          type="button"
                          onClick={() => executar(onVerEmpresa, emp)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                        >
                          Ver empresa
                        </button>
                        <button
                          type="button"
                          onClick={() => executar(onAbrirDemanda, emp)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold border border-black/10 dark:border-white/15 text-[#1d1d1f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                        >
                          Abrir demanda
                        </button>
                        <button
                          type="button"
                          onClick={() => acaoPrincipal(emp)}
                          className="h-8 px-3 rounded-lg text-xs font-bold bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                          title={esperando.length > 0 ? 'Assume a demanda que já está aguardando e abre a empresa' : 'Cria a demanda no seu nome, inicia o atendimento e abre a empresa'}
                        >
                          <PlayIcon className="w-2.5 h-2.5 fill-current" />
                          {esperando.length > 0 ? 'Assumir e abrir' : 'Atender agora'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {podeCriar && (
              <button
                type="button"
                onMouseEnter={() => setDestaque(resultados.length)}
                onClick={() => executar(onCriarEmpresa, termo.trim())}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-t border-black/[0.06] dark:border-white/[0.11] cursor-pointer transition-colors ${
                  destaque === resultados.length ? 'bg-[#4d7c0f]/[0.06] dark:bg-[#84cc16]/[0.08]' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className="w-9 h-9 rounded-xl bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] flex items-center justify-center text-lg font-semibold flex-shrink-0">
                  +
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#1d1d1f] dark:text-white truncate">
                    Cadastrar “{termo.trim()}” e abrir demanda
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-zinc-400">Cria a empresa agora; os demais dados podem ser completados depois.</span>
                </span>
              </button>
            )}

            <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-black/[0.05] dark:border-white/[0.09] text-[11px] text-slate-400">
              <div className="hidden sm:flex items-center gap-4">
                <span><kbd className="font-sans">↑ ↓</kbd> navegar</span>
                <span><kbd className="font-sans">Enter</kbd> atender</span>
                <span><kbd className="font-sans">Esc</kbd> fechar</span>
              </div>
              {onVerTodas && (
                <button
                  type="button"
                  onClick={() => executar(onVerTodas, '')}
                  className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 -mr-1 rounded-lg text-xs font-semibold text-[#4d7c0f] dark:text-[#84cc16] hover:bg-[#4d7c0f]/[0.08] dark:hover:bg-[#84cc16]/[0.1] cursor-pointer"
                >
                  <BuildingIcon className="w-3.5 h-3.5" />
                  Ver todas as empresas
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
