'use client';

import React, { useState } from 'react';
import { ModalEtapas, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { minutosDe } from './SeletoresTempo';
import { CheckIcon, BuildingIcon, UserIcon, CalendarIcon } from './Icons';

const deIso = (iso) => {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d);
};

const IconeVideo = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="14" height="12" rx="2.5" />
    <path d="m16 10 6-3v10l-6-3" />
  </svg>
);
const IconeTexto = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

const ESTADOS = {
  agendada: { rotulo: 'Agendada', cor: 'bg-black/[0.06] dark:bg-white/[0.1] text-slate-700 dark:text-zinc-200' },
  concluida: { rotulo: 'Realizada', cor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
};

function duracaoTexto(ini, fim) {
  const min = Math.max(0, minutosDe(fim) - minutosDe(ini));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h} h`;
}

function Linha({ icone, rotulo, children }) {
  return (
    <div className="grid grid-cols-[20px_1fr] gap-x-3.5 py-3">
      <span className="pt-0.5 text-slate-400 dark:text-zinc-500">{icone}</span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400 mb-0.5">{rotulo}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Resumo da reunião (o que abre ao clicar na agenda). Dali a pessoa entra na sala, copia o link,
 * marca como realizada, edita, cancela ou exclui.
 */
export default function AgendaEventoResumo({ evento, agendas = [], userEmail, onFechar, onEditar, onCancelar, onExcluir, onRealizada }) {
  const [copiado, setCopiado] = useState(false);
  const aberto = Boolean(evento);
  const e = evento || {};
  const estado = ESTADOS[e.status] || ESTADOS.agendada;
  const agenda = agendas.find((a) => a.id === e.google_calendar_id);
  const cancelada = e.status === 'cancelada';
  const dataLonga = e.data ? deIso(e.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const eu = e.responsavel_email && e.responsavel_email.toLowerCase() === (userEmail || '').toLowerCase();
  const fimMs = e.data ? deIso(e.data).getTime() + minutosDe(e.hora_fim) * 60000 : 0;
  const iniMs = e.data ? deIso(e.data).getTime() + minutosDe(e.hora_inicio) * 60000 : 0;
  const acontecendo = !cancelada && Date.now() >= iniMs && Date.now() < fimMs;
  const empresa = e.empresa && e.empresa !== 'Cliente Geral' ? e.empresa : '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(e.link_reuniao);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {}
  };

  const rodape = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
      <div className="flex items-center gap-1 sm:mr-auto">
        {!cancelada && (
          <button type="button" onClick={() => onCancelar(e)} className={`${classeBotaoTexto} !text-rose-600 dark:!text-rose-400`}>
            Cancelar reunião
          </button>
        )}
        <button type="button" onClick={() => onExcluir(e)} className={`${classeBotaoTexto} !text-slate-500`}>
          Excluir
        </button>
      </div>
      <button type="button" onClick={onFechar} className={classeBotaoTexto}>
        Fechar
      </button>
      <button type="button" onClick={() => onEditar(e)} className={classeBotaoPrimario}>
        {cancelada ? 'Reagendar' : 'Editar'}
      </button>
    </div>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      largura="max-w-xl"
      idTitulo="agenda-resumo-titulo"
      titulo={e.titulo || 'Reunião'}
      subtitulo={e.dia_inteiro ? `${dataLonga} · dia inteiro` : `${dataLonga} · ${e.hora_inicio} às ${e.hora_fim}`}
      contexto={
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold ${estado.cor}`}>{estado.rotulo}</span>
          {acontecendo && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold bg-[#4d7c0f]/12 text-[#4d7c0f] dark:text-[#a3e635]">Acontecendo agora</span>}
        </div>
      }
      rodape={rodape}
    >
      {/* Sala: a ação mais usada fica no topo */}
      {e.link_reuniao && !cancelada && (
        <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] p-4 mb-2 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-slate-500 dark:text-zinc-400">{/meet\.google\.com/.test(e.link_reuniao) ? 'Google Meet' : 'Sala virtual'}</p>
            <p className="text-[13px] font-mono truncate text-[#1d1d1f] dark:text-white">{e.link_reuniao.replace(/^https?:\/\//, '')}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={copiar} className="h-10 px-3.5 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer">
              {copiado ? 'Copiado' : 'Copiar link'}
            </button>
            <a
              href={e.link_reuniao}
              target="_blank"
              rel="noreferrer"
              className="h-10 px-4 rounded-full text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90 inline-flex items-center gap-2"
            >
              <IconeVideo /> Entrar na sala
            </a>
          </div>
        </div>
      )}

      <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        <Linha icone={<CalendarIcon className="w-4 h-4" />} rotulo="Quando">
          <p className="text-[14px] font-medium first-letter:uppercase">{dataLonga}</p>
          {!e.dia_inteiro && (
            <p className="text-[13px] text-slate-600 dark:text-zinc-300 tabular-nums">
              {e.hora_inicio} às {e.hora_fim} · {duracaoTexto(e.hora_inicio, e.hora_fim)}
            </p>
          )}
        </Linha>

        <Linha icone={<UserIcon className="w-4 h-4" />} rotulo="Responsável">
          <p className="text-[14px] font-medium">{e.responsavel_nome ? `${e.responsavel_nome}${eu ? ' (você)' : ''}` : 'Sem responsável · reunião da equipe'}</p>
        </Linha>

        {empresa && (
          <Linha icone={<BuildingIcon className="w-4 h-4" />} rotulo="Empresa">
            <p className="text-[14px] font-medium">{empresa}</p>
          </Linha>
        )}

        {e.observacoes && (
          <Linha icone={<IconeTexto />} rotulo="Pauta">
            <p className="text-[13.5px] leading-relaxed text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{e.observacoes}</p>
          </Linha>
        )}

        <Linha
          icone={<span className="block w-2.5 h-2.5 mt-1 ml-0.5 rounded-full" style={{ background: agenda?.cor || '#8e8e93' }} />}
          rotulo="Agenda"
        >
          <p className="text-[14px] font-medium">{agenda ? agenda.nome : e.google_event_id ? 'Google Agenda' : 'Só no RM Controle'}</p>
          {e.google_event_id && <p className="text-[12px] text-slate-500 dark:text-zinc-400">Sincronizada com o Google Agenda</p>}
        </Linha>
      </div>

      {!cancelada && onRealizada && (
        <button
          type="button"
          onClick={() => onRealizada(e)}
          className={`mt-3 w-full h-11 rounded-2xl text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors ${
            e.status === 'concluida'
              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/18'
              : 'ring-1 ring-black/[0.1] dark:ring-white/[0.12] hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
          }`}
        >
          <CheckIcon className="w-4 h-4 stroke-[2.5]" />
          {e.status === 'concluida' ? 'Realizada · desmarcar' : 'Marcar como realizada'}
        </button>
      )}
    </ModalEtapas>
  );
}
