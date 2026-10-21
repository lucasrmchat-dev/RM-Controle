'use client';

import React, { useMemo, useState } from 'react';

/**
 * Seletores de data e horário próprios do RM Controle (em vez dos campos nativos do navegador):
 * calendário do mês, hora + minuto em botões e duração em atalhos.
 */

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const doisDigitos = (n) => String(n).padStart(2, '0');
export const isoDoDia = (d) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
const deIso = (iso) => {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  return a ? new Date(a, m - 1, d) : new Date();
};

export function minutosDe(hora) {
  const [h, m] = String(hora || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}
export function horaDe(minutos) {
  const t = Math.max(0, Math.min(23 * 60 + 59, minutos));
  return `${doisDigitos(Math.floor(t / 60))}:${doisDigitos(t % 60)}`;
}

/** "qua., 21 de out." */
export function rotuloData(iso) {
  const d = deIso(iso);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(/^(\w)/, (c) => c.toUpperCase());
}

/** Calendário do mês sempre visível, com atalhos de Hoje e Amanhã. */
export function CalendarioMes({ valor, onMudar }) {
  const selecionada = deIso(valor);
  const [mes, setMes] = useState(() => new Date(selecionada.getFullYear(), selecionada.getMonth(), 1));
  const hojeIso = isoDoDia(new Date());

  const celulas = useMemo(() => {
    const inicio = new Date(mes);
    inicio.setDate(1 - inicio.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      return d;
    });
  }, [mes]);
  // Só mostra a 6ª semana quando o mês precisa dela
  const visiveis = celulas.slice(35).some((d) => d.getMonth() === mes.getMonth()) ? celulas : celulas.slice(0, 35);

  const irPara = (d) => {
    onMudar(isoDoDia(d));
    setMes(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);

  return (
    <div className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] bg-white dark:bg-white/[0.03] p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mês anterior" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
          ‹
        </button>
        <span className="text-[13.5px] font-semibold capitalize">
          {MESES[mes.getMonth()]} {mes.getFullYear()}
        </span>
        <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Próximo mês" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 mb-1">
        {DIAS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div role="grid" className="grid grid-cols-7 gap-y-0.5">
        {visiveis.map((d) => {
          const iso = isoDoDia(d);
          const doMes = d.getMonth() === mes.getMonth();
          const ativo = iso === valor;
          const hoje = iso === hojeIso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => irPara(d)}
              aria-pressed={ativo}
              aria-label={d.toLocaleDateString('pt-BR', { dateStyle: 'full' })}
              className={`h-9 mx-auto w-9 rounded-full text-[13px] tabular-nums cursor-pointer transition-colors ${
                ativo
                  ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] font-semibold'
                  : hoje
                    ? 'text-[#4d7c0f] dark:text-[#a3e635] font-semibold hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                    : doMes
                      ? 'text-[#1d1d1f] dark:text-zinc-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                      : 'text-slate-300 dark:text-zinc-600 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
        {[
          ['Hoje', new Date()],
          ['Amanhã', amanha],
        ].map(([rotulo, d]) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => irPara(d)}
            className={`h-7 px-3 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${
              isoDoDia(d) === valor ? 'bg-black/[0.07] dark:bg-white/[0.12]' : 'text-slate-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

const HORAS = Array.from({ length: 15 }, (_, i) => i + 7); // 07h–21h, horário comercial ampliado
const MINUTOS = [0, 15, 30, 45];

/** Hora e minuto em botões: dois toques, sem rolar lista. */
export function SeletorHorario({ valor, onMudar, rotuloId }) {
  const [h, m] = String(valor || '09:00').split(':').map(Number);
  const foraDaGrade = !HORAS.includes(h) || !MINUTOS.includes(m);
  const pilula = (ativo) =>
    `h-8 rounded-lg text-[13px] tabular-nums cursor-pointer transition-colors ${
      ativo ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] font-semibold' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-[#1d1d1f] dark:text-zinc-100'
    }`;
  return (
    <div role="group" aria-labelledby={rotuloId} className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] bg-white dark:bg-white/[0.03] p-2.5 space-y-2">
      <div className="grid grid-cols-8 gap-1">
        {HORAS.map((hora) => (
          <button key={hora} type="button" onClick={() => onMudar(horaDe(hora * 60 + (MINUTOS.includes(m) ? m : 0)))} className={pilula(hora === h)} aria-pressed={hora === h}>
            {doisDigitos(hora)}h
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
        {MINUTOS.map((min) => (
          <button key={min} type="button" onClick={() => onMudar(horaDe(h * 60 + min))} className={pilula(min === m)} aria-pressed={min === m}>
            :{doisDigitos(min)}
          </button>
        ))}
      </div>
      {foraDaGrade && <p className="text-[12px] text-slate-500 dark:text-zinc-400 px-1">Horário atual: {valor}</p>}
    </div>
  );
}

const DURACOES = [
  [15, '15 min'],
  [30, '30 min'],
  [45, '45 min'],
  [60, '1 h'],
  [90, '1h30'],
  [120, '2 h'],
];

/** Duração em atalhos; o término é calculado (mínimo de 15 minutos). */
export function SeletorDuracao({ inicio, fim, onMudar, rotuloId }) {
  const duracao = Math.max(15, minutosDe(fim) - minutosDe(inicio));
  return (
    <div>
      <div role="group" aria-labelledby={rotuloId} className="flex flex-wrap gap-1.5">
        {DURACOES.map(([min, rotulo]) => {
          const ativo = duracao === min;
          return (
            <button
              key={min}
              type="button"
              onClick={() => onMudar(horaDe(minutosDe(inicio) + min))}
              aria-pressed={ativo}
              className={`h-9 px-3.5 rounded-full text-[13px] font-medium border cursor-pointer transition-colors ${
                ativo
                  ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent'
                  : 'bg-white dark:bg-white/[0.04] border-black/[0.12] dark:border-white/[0.14] text-slate-700 dark:text-zinc-300 hover:border-black/25 dark:hover:border-white/25'
              }`}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
      <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 mt-2">
        Das <span className="font-medium text-[#1d1d1f] dark:text-white tabular-nums">{inicio}</span> às{' '}
        <span className="font-medium text-[#1d1d1f] dark:text-white tabular-nums">{horaDe(minutosDe(inicio) + duracao)}</span>
        {!DURACOES.some(([min]) => min === duracao) && ` (${duracao} min)`}
      </p>
    </div>
  );
}
