'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchAuditoria, fetchResumoAuditoria } from '@/lib/storage';
import { descreverLog } from '@/lib/auditoria';
import { RefreshIcon } from './Icons';
import { ListSkeleton } from './SkeletonLoaders';

// ------------------------------------------------------------------------------
// Auditoria: o que cada pessoa da equipe fez, dia a dia, com nome, e-mail, IP real (pego pelo servidor
// na hora da ação), navegador, módulo, ação e descrição. Só administradores veem.
// ------------------------------------------------------------------------------
const DIAS_NA_FITA = 9;
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hojeIso = () => isoLocal(new Date());
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};
const hora = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
const diaPorExtenso = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

const TONS = {
  azul: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  verde: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  ambar: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
  vermelho: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  roxo: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  neutro: 'bg-black/[0.05] dark:bg-white/[0.08] text-slate-700 dark:text-zinc-300',
};

const iniciais = (nome, email) =>
  (nome && nome !== email ? nome : (email || '?').split('@')[0])
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

function Linha({ log }) {
  const v = descreverLog(log);
  return (
    <div className="px-4 sm:px-5 py-3.5 grid grid-cols-1 lg:grid-cols-[76px_minmax(190px,1.1fr)_minmax(170px,1fr)_minmax(200px,1.6fr)_170px] gap-x-4 gap-y-1.5 items-start hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
      <span className="text-[12.5px] font-mono tabular-nums text-slate-500 dark:text-zinc-400 lg:pt-1.5">{hora(log.created_at || log.criado_em)}</span>

      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-full bg-black/[0.06] dark:bg-white/[0.1] text-[11px] font-semibold flex items-center justify-center flex-shrink-0 text-slate-700 dark:text-zinc-200">{iniciais(v.nome, v.email)}</span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#1d1d1f] dark:text-white truncate">{v.nome && v.nome !== v.email ? v.nome : v.email.split('@')[0] || 'Sistema'}</p>
          <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 truncate">{v.email || '—'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 lg:pt-1">
        <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${TONS[v.tom] || TONS.neutro}`}>{v.acao}</span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-black/[0.035] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400">{v.modulo}</span>
      </div>

      <div className="min-w-0 lg:pt-1">
        {v.empresa && <p className="text-[13px] font-medium text-[#1d1d1f] dark:text-zinc-100 truncate">{v.empresa}</p>}
        <p className={`text-[12.5px] leading-snug break-words ${v.descricao ? 'text-slate-600 dark:text-zinc-300' : 'text-slate-400 dark:text-zinc-500'}`}>{v.descricao || (v.empresa ? '' : 'Sem descrição')}</p>
      </div>

      <div className="min-w-0 lg:text-right lg:pt-1">
        <p className="text-[12.5px] font-mono tabular-nums text-[#1d1d1f] dark:text-zinc-200 truncate" title={log.detalhes?.ip_cadeia ? `Caminho: ${log.detalhes.ip_cadeia}` : undefined}>
          <span className="lg:hidden text-slate-400 font-sans">IP </span>
          {v.ip || 'não registrado'}
        </p>
        {v.navegador && <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 truncate">{v.navegador}</p>}
      </div>
    </div>
  );
}

export default function AuditLogsView() {
  const [dia, setDia] = useState(hojeIso);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [dados, setDados] = useState({ registros: [], total: 0 });
  const [contagens, setContagens] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Busca no servidor depois que a pessoa para de digitar
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [r, resumo] = await Promise.all([fetchAuditoria({ dia, busca: buscaAplicada, pagina, porPagina }), fetchResumoAuditoria({ ate: hojeIso(), dias: DIAS_NA_FITA }).catch(() => ({ dias: {} }))]);
      setDados({ registros: r.registros || [], total: r.total || 0 });
      setContagens(resumo.dias || {});
    } catch (e) {
      setErro(e.message);
      setDados({ registros: [], total: 0 });
    } finally {
      setCarregando(false);
    }
  }, [dia, buscaAplicada, pagina, porPagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const fita = useMemo(() => {
    const hoje = hojeIso();
    return Array.from({ length: DIAS_NA_FITA }, (_, i) => {
      const iso = somarDias(hoje, i - (DIAS_NA_FITA - 1));
      const d = new Date(`${iso}T12:00:00`);
      return { iso, num: d.getDate(), semana: SEMANA[d.getDay()], mes: MESES[d.getMonth()], hoje: iso === hoje };
    });
  }, []);

  const totalPaginas = Math.max(1, Math.ceil(dados.total / porPagina));
  const escolherDia = (iso) => {
    setDia(iso);
    setPagina(1);
  };

  return (
    <div className="space-y-5 text-[#0a0a0c] dark:text-white">
      {/* Dias */}
      <div className="rounded-3xl p-4 sm:p-5 border border-black/[0.08] dark:border-white/10 bg-white dark:bg-rm-cartao-escuro shadow-sm">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">Auditoria</h2>
            <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">O que cada pessoa fez no sistema, com e-mail, IP e navegador de onde veio a ação.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="h-9 pl-3 pr-2 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-rm-campo-escuro text-[12.5px] font-medium text-slate-600 dark:text-zinc-300 flex items-center gap-2 cursor-pointer">
              Outro dia
              <input type="date" value={dia} max={hojeIso()} onChange={(e) => e.target.value && escolherDia(e.target.value)} className="bg-transparent outline-none text-[12.5px] text-[#1d1d1f] dark:text-white" />
            </label>
            <button type="button" onClick={carregar} disabled={carregando} aria-label="Atualizar" title="Atualizar" className="w-9 h-9 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] flex items-center justify-center cursor-pointer disabled:opacity-60">
              <RefreshIcon className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-stretch gap-2 overflow-x-auto pb-1 pt-2">
          {fita.map((d) => {
            const ativo = d.iso === dia;
            const qtd = contagens[d.iso];
            return (
              <motion.button
                key={d.iso}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => escolherDia(d.iso)}
                className={`relative min-w-[70px] px-3 py-2.5 rounded-2xl border flex flex-col items-center cursor-pointer transition-colors ${
                  ativo ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent shadow-md' : 'border-black/[0.08] dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.03] hover:border-black/20 dark:hover:border-white/25'
                }`}
              >
                {d.hoje && <span className={`absolute -top-2 px-1.5 rounded-full text-[9px] font-bold uppercase ${ativo ? 'bg-rm-acento-medio text-white' : 'bg-rm-acento-medio text-white'}`}>Hoje</span>}
                <span className="text-[10.5px] font-semibold opacity-70">{d.semana}</span>
                <span className="text-[19px] font-bold tabular-nums leading-tight">{d.num}</span>
                <span className="text-[10px] uppercase opacity-60">{d.mes}</span>
                <span className={`mt-1 text-[10.5px] font-semibold tabular-nums ${ativo ? 'opacity-80' : qtd ? 'text-rm-acento dark:text-rm-acento-vivo' : 'opacity-40'}`}>{qtd === undefined ? '·' : `${qtd} ${qtd === 1 ? 'ação' : 'ações'}`}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Lista do dia */}
      <div className="rounded-3xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-rm-cartao-escuro overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-black/[0.06] dark:border-white/[0.1] flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold first-letter:uppercase">{diaPorExtenso(dia)}</p>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400">
              {dados.total} {dados.total === 1 ? 'registro' : 'registros'}
              {buscaAplicada && ` para “${buscaAplicada}”`}
            </p>
          </div>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pessoa, e-mail, empresa, módulo, ação ou IP"
            className="sm:ml-auto w-full sm:w-[360px] h-10 px-4 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/10 text-[13px] outline-none focus:border-rm-acento-medio"
          />
        </div>

        <div className="hidden lg:grid grid-cols-[76px_minmax(190px,1.1fr)_minmax(170px,1fr)_minmax(200px,1.6fr)_170px] gap-x-4 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500 border-b border-black/[0.05] dark:border-white/[0.08]">
          <span>Hora</span>
          <span>Operador</span>
          <span>Ação e módulo</span>
          <span>Empresa e descrição</span>
          <span className="text-right">IP e navegador</span>
        </div>

        <div className="divide-y divide-black/[0.05] dark:divide-white/[0.08]">
          {carregando && !dados.registros.length ? (
            <ListSkeleton linhas={6} className="p-5" />
          ) : erro ? (
            <p className="p-10 text-center text-[13px] text-rose-600 dark:text-rose-400">{erro}</p>
          ) : !dados.registros.length ? (
            <p className="p-12 text-center text-[13px] text-slate-400">{buscaAplicada ? 'Nada encontrado com essa busca neste dia.' : 'Nenhuma ação registrada neste dia.'}</p>
          ) : (
            dados.registros.map((log) => <Linha key={log.id} log={log} />)
          )}
        </div>

        <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12.5px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span>Por página:</span>
            {[20, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setPorPagina(n);
                  setPagina(1);
                }}
                className={`px-2.5 py-0.5 rounded-full font-semibold cursor-pointer ${porPagina === n ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-black' : 'bg-black/[0.05] dark:bg-white/10 hover:bg-black/10'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="tabular-nums">
              Página {pagina} de {totalPaginas}
            </span>
            <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1 rounded-full border border-black/10 dark:border-white/15 disabled:opacity-30 cursor-pointer">
              Anterior
            </button>
            <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} className="px-3 py-1 rounded-full border border-black/10 dark:border-white/15 disabled:opacity-30 cursor-pointer">
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
