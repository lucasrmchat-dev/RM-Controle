'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAgendaEventos,
  getChamadosSuporte,
  updateAgendaEvento,
  deleteAgendaEvento,
  getEquipeUsuarios,
  getNomeTecnico,
  getEmpresas,
  fetchAgendaEventos,
  partesLocaisPrazo,
  sincronizarGoogleAgenda,
  statusGoogleAgenda,
  URL_CONECTAR_GOOGLE_AGENDA,
} from '@/lib/storage';
import { showToast } from './ToastNotification';
import { ListSkeleton } from './SkeletonLoaders';
import ConfirmModal from './ConfirmModal';
import AgendaEventoModal from './AgendaEventoModal';
import AgendaGradeSemana from './AgendaGradeSemana';
import { isoDoDia } from './SeletoresTempo';
import { CheckIcon, RefreshIcon } from './Icons';

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const deIso = (iso) => {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d);
};

/** Segunda-feira da semana que contém a data. */
function inicioDaSemana(iso) {
  const d = deIso(iso);
  const dia = d.getDay();
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  return d;
}

function rotuloSemana(dias) {
  const a = deIso(dias[0]);
  const b = deIso(dias[6]);
  const mes = (d) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} de ${mes(b)} ${b.getFullYear()}`
    : `${a.getDate()} de ${mes(a)} – ${b.getDate()} de ${mes(b)} ${b.getFullYear()}`;
}

const iniciais = (nome) =>
  String(nome || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

const minutosDoDia = (hora) => {
  const [h, m] = String(hora || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

const formatarHoraSync = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null);

const IconeVideo = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="14" height="12" rx="2.5" />
    <path d="m16 10 6-3v10l-6-3" />
  </svg>
);

const horarioDoEvento = (evt) =>
  evt.dia_inteiro ? 'Dia inteiro' : evt.origem === 'fila_demandas' ? `Prazo ${evt.hora_inicio}` : `${evt.hora_inicio} – ${evt.hora_fim}`;

/** Cartão de uma reunião na grade da semana. */
function CartaoReuniao({ evt, cor, agora, onAbrir }) {
  const prazo = evt.origem === 'fila_demandas';
  const cancelada = evt.status === 'cancelada';
  const realizada = evt.status === 'concluida';
  const base = deIso(evt.data).getTime();
  const iniMs = base + minutosDoDia(evt.hora_inicio) * 60000;
  const fimMs = base + minutosDoDia(evt.hora_fim) * 60000;
  const acontecendo = !cancelada && !prazo && agora >= iniMs && agora < fimMs;
  const passou = agora >= Math.max(fimMs, iniMs + 60000);
  const detalhePrazo = prazo ? evt.titulo.replace(/^\[[^\]]+\]\s*/, '').replace(evt.empresa, '').replace(/^\s*—\s*/, '') : '';

  return (
    <motion.button
      type="button"
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={() => onAbrir(evt)}
      className={`w-full text-left rounded-2xl p-3 ring-1 transition-colors cursor-pointer ${
        acontecendo
          ? 'bg-white dark:bg-[#26262a] ring-[#4d7c0f]/40 dark:ring-[#84cc16]/40 shadow-[0_6px_20px_-10px_rgba(77,124,15,0.45)]'
          : 'bg-white dark:bg-[#232326] ring-black/[0.07] dark:ring-white/[0.09] hover:ring-black/[0.16] dark:hover:ring-white/[0.18]'
      } ${passou || cancelada ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: prazo ? '#f59e0b' : cor || '#8e8e93' }} aria-hidden="true" />
        {horarioDoEvento(evt)}
        {acontecendo && <span className="ml-auto text-[10.5px] font-semibold text-[#4d7c0f] dark:text-[#a3e635]">agora</span>}
        {realizada && <CheckIcon className="ml-auto w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />}
      </div>
      <p className={`mt-1 text-[13px] font-semibold leading-snug text-[#1d1d1f] dark:text-white line-clamp-2 ${cancelada ? 'line-through' : ''}`}>
        {prazo ? evt.empresa : evt.titulo}
      </p>
      {prazo ? (
        <p className="mt-0.5 text-[12px] text-amber-700 dark:text-amber-400 truncate">{detalhePrazo || 'Prazo de demanda'}</p>
      ) : (
        evt.empresa && evt.empresa !== 'Cliente Geral' && <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400 truncate">{evt.empresa}</p>
      )}
      {(evt.responsavel_nome || evt.link_reuniao) && (
        <div className="mt-2.5 flex items-center gap-2">
          {evt.responsavel_nome ? (
            <span className="flex items-center gap-1.5 min-w-0 text-[11.5px] text-slate-600 dark:text-zinc-300" title={`Responsável: ${evt.responsavel_nome}`}>
              <span className="w-5 h-5 rounded-full bg-black/[0.06] dark:bg-white/[0.1] text-[9.5px] font-semibold flex items-center justify-center flex-shrink-0">
                {iniciais(evt.responsavel_nome)}
              </span>
              {/* Com o botão de entrar ao lado, só as iniciais (o nome inteiro aparece ao passar o mouse) */}
              {!(evt.link_reuniao && !cancelada) && <span className="truncate">{evt.responsavel_nome.split(' ')[0]}</span>}
            </span>
          ) : (
            <span />
          )}
          {evt.link_reuniao && !cancelada && (
            <a
              href={evt.link_reuniao}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-85"
              title="Entrar na sala"
            >
              <IconeVideo className="w-3 h-3" /> Entrar
            </a>
          )}
        </div>
      )}
    </motion.button>
  );
}

export default function AgendaView({ userEmail, onSelectEmpresa }) {
  const [eventos, setEventos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [equipe, setEquipe] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  // 'grade' (horários, como o Google) | 'semana' (cartões por dia) | 'lista'
  const [visao, setVisao] = useState(() => {
    // No celular a grade de 7 colunas fica apertada: começa nos cartões (dá para trocar)
    const padrao = typeof window !== 'undefined' && window.innerWidth < 768 ? 'semana' : 'grade';
    try {
      return localStorage.getItem('rm_agenda_visao') || padrao;
    } catch {
      return padrao;
    }
  });
  const escolherVisao = (v) => {
    setVisao(v);
    try {
      localStorage.setItem('rm_agenda_visao', v);
    } catch {}
  };
  const [pessoa, setPessoa] = useState('todas'); // 'todas' | 'eu' | email
  const [busca, setBusca] = useState('');
  const [referencia, setReferencia] = useState(isoDoDia(new Date()));
  const [syncing, setSyncing] = useState(false);
  const [googleSync, setGoogleSync] = useState(null);
  const [agora, setAgora] = useState(Date.now());
  const [modal, setModal] = useState(null); // { evento?, data? }
  const [confirmDialog, setConfirmDialog] = useState(null);
  const meuEmail = (userEmail || '').toLowerCase();

  const carregarDados = () => {
    // Cópias antigas do prazo salvas como evento duplicavam o evento derivado da própria demanda abaixo
    const ehCopiaDePrazo = (e) => Boolean(e?.chamado_id) || /^\[Prazo Demanda\]/.test(e?.titulo || '');
    const eventosNormais = (getAgendaEventos() || []).filter((e) => !ehCopiaDePrazo(e));
    // Demandas ativas com prazo aparecem na agenda (só leitura; clicar abre a empresa)
    const eventosChamados = (getChamadosSuporte() || [])
      .filter((c) => c && c.prazo_limite && c.status !== 'concluido' && c.status !== 'finalizado')
      .map((c) => {
        const { data, hora } = partesLocaisPrazo(c.prazo_limite);
        const designado = c.atribuido_a && c.atribuido_a !== 'geral' ? c.atribuido_a : null;
        return {
          id: 'evt_demanda_' + c.id,
          titulo: `[${c.is_lembrete ? 'Lembrete' : 'Prazo'}] ${c.empresa_nome || 'Empresa'}${c.solicitante_nome ? ' — ' + c.solicitante_nome : ''}`,
          empresa: c.empresa_nome || 'Empresa',
          empresa_id: c.empresa_id,
          data,
          hora_inicio: hora,
          hora_fim: hora,
          responsavel_email: designado,
          responsavel_nome: designado ? c.atribuido_nome || getNomeTecnico(designado) : null,
          status: 'agendada',
          origem: 'fila_demandas',
          chamado_id: c.id,
        };
      });
    setEventos([...eventosNormais, ...eventosChamados]);
    setEquipe(getEquipeUsuarios() || []);
  };

  useEffect(() => {
    carregarDados();
    if ((getAgendaEventos() || []).length > 0) setCarregado(true);
    fetchAgendaEventos()
      .catch(() => {})
      .finally(() => {
        carregarDados();
        setCarregado(true);
      });
    getEmpresas({ pageSize: 1000 }).then((res) => {
      const lista = Array.isArray(res) ? res : res?.items || [];
      setEmpresas([...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })));
    });
    window.addEventListener('agenda_eventos_updated', carregarDados);
    window.addEventListener('suporte_updated', carregarDados);
    const relogio = setInterval(() => setAgora(Date.now()), 30000);

    // Google Agenda: com a Agenda aberta, pergunta ao Google a cada minuto e ao voltar para a aba.
    // No site publicado o Google também avisa na hora (webhook); assim funciona mesmo sem o aviso
    // (ex.: em localhost). O servidor segura repetições: no máximo uma sincronização a cada 30 s.
    let ativo = true;
    let sincronizaComGoogle = false;
    const puxarNovidades = () => {
      if (document.visibilityState !== 'visible') return;
      const pedido = sincronizaComGoogle ? sincronizarGoogleAgenda() : fetchAgendaEventos();
      Promise.resolve(pedido)
        .catch(() => {})
        .finally(() => ativo && carregarDados());
    };
    statusGoogleAgenda().then((st) => {
      if (!ativo) return;
      setGoogleSync(st?.configurado ? st : null);
      sincronizaComGoogle = Boolean(st?.configurado && st.agendas?.length);
      if (sincronizaComGoogle) {
        sincronizarGoogleAgenda().finally(() => {
          if (!ativo) return;
          carregarDados();
          statusGoogleAgenda().then((s2) => ativo && s2?.configurado && setGoogleSync(s2));
        });
      }
    });
    const releitura = setInterval(puxarNovidades, 60000);
    document.addEventListener('visibilitychange', puxarNovidades);
    window.addEventListener('focus', puxarNovidades);

    return () => {
      ativo = false;
      document.removeEventListener('visibilitychange', puxarNovidades);
      window.removeEventListener('focus', puxarNovidades);
      window.removeEventListener('agenda_eventos_updated', carregarDados);
      window.removeEventListener('suporte_updated', carregarDados);
      clearInterval(relogio);
      clearInterval(releitura);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sincronizarAgora = async () => {
    setSyncing(true);
    try {
      const r = await sincronizarGoogleAgenda({ forcar: true });
      carregarDados();
      const falhas = Object.values(r?.erros || {}).filter(Boolean);
      if (!r?.ok) showToast(r?.mensagem || 'Não foi possível sincronizar com o Google Agenda.', 'error');
      else if (falhas.length) showToast(falhas[0], 'warning');
      const st = await statusGoogleAgenda();
      if (st?.configurado) setGoogleSync(st);
    } finally {
      setSyncing(false);
    }
  };

  // ------------------------------------------------------------------------------
  // Semana, filtros e cores
  // ------------------------------------------------------------------------------
  const dias = useMemo(() => {
    const seg = inicioDaSemana(referencia);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(seg);
      d.setDate(seg.getDate() + i);
      return isoDoDia(d);
    });
  }, [referencia]);
  const hojeIso = isoDoDia(new Date(agora));
  const estaNaSemanaAtual = dias.includes(hojeIso);

  const pessoas = useMemo(() => {
    const lista = (equipe || []).filter((u) => u?.email && u.ativo !== false).map((u) => ({ email: u.email.toLowerCase(), nome: u.nome || u.email }));
    if (meuEmail && !lista.some((p) => p.email === meuEmail)) lista.unshift({ email: meuEmail, nome: getNomeTecnico(meuEmail) });
    return lista;
  }, [equipe, meuEmail]);

  const corDaAgenda = useMemo(() => new Map((googleSync?.agendas || []).map((a) => [a.id, a.cor])), [googleSync]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = eventos.filter((evt) => {
      const resp = (evt.responsavel_email || '').toLowerCase();
      if (pessoa === 'eu' && resp !== meuEmail) return false;
      if (pessoa !== 'todas' && pessoa !== 'eu' && resp !== pessoa) return false;
      if (q && ![evt.titulo, evt.empresa, evt.responsavel_nome, evt.observacoes].some((v) => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
    // A mesma reunião vinda de duas agendas sincronizadas aparece uma vez só
    const vistas = new Set();
    return filtrados
      .filter((evt) => {
        if (!evt.google_ical_uid) return true;
        const chave = `${evt.google_ical_uid}|${evt.data}|${evt.hora_inicio}`;
        if (vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
      })
      .sort((a, b) => (a.data + (a.hora_inicio || '')).localeCompare(b.data + (b.hora_inicio || '')));
  }, [eventos, pessoa, busca, meuEmail]);

  const porDia = useMemo(() => {
    const mapa = Object.fromEntries(dias.map((d) => [d, []]));
    visiveis.forEach((e) => mapa[e.data]?.push(e));
    return mapa;
  }, [dias, visiveis]);
  const totalSemana = dias.reduce((n, d) => n + porDia[d].length, 0);

  const moverSemana = (semanas) => {
    const d = deIso(referencia);
    d.setDate(d.getDate() + semanas * 7);
    setReferencia(isoDoDia(d));
  };

  // ------------------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------------------
  const abrirEvento = (evt) => {
    if (evt.origem === 'fila_demandas') {
      if (onSelectEmpresa && evt.empresa_id) onSelectEmpresa({ id: evt.empresa_id, nome: evt.empresa });
      return;
    }
    setModal({ evento: evt });
  };

  const cancelarReuniao = (evt) =>
    setConfirmDialog({
      title: 'Cancelar esta reunião?',
      message: `"${evt.titulo}" sai do Google Agenda e fica marcada como cancelada aqui.`,
      confirmText: 'Cancelar reunião',
      onConfirm: async () => {
        try {
          const r = await updateAgendaEvento(evt.id, { status: 'cancelada' });
          showToast(r?.aviso_google || 'Reunião cancelada.', r?.aviso_google ? 'warning' : 'success');
          setModal(null);
        } catch (e) {
          showToast(e.message, 'error');
        } finally {
          setConfirmDialog(null);
          carregarDados();
        }
      },
    });

  const excluirReuniao = (evt) =>
    setConfirmDialog({
      title: 'Excluir esta reunião?',
      message: `"${evt.titulo}" é removida daqui e do Google Agenda.`,
      confirmText: 'Excluir',
      onConfirm: async () => {
        try {
          await deleteAgendaEvento(evt.id);
          showToast('Reunião excluída.', 'success');
          setModal(null);
        } catch (e) {
          showToast(e.message, 'error');
        } finally {
          setConfirmDialog(null);
          carregarDados();
        }
      },
    });

  // Arrastar na grade: remarca na hora (otimista) e leva ao Google
  const moverReuniao = async (evt, novo) => {
    setEventos((lista) => lista.map((e) => (e.id === evt.id ? { ...e, ...novo } : e)));
    try {
      const r = await updateAgendaEvento(evt.id, novo);
      const quando = `${deIso(novo.data).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }).replace('.', '')}, ${novo.hora_inicio}–${novo.hora_fim}`;
      showToast(r?.aviso_google || `"${evt.titulo}" remarcada para ${quando}.`, r?.aviso_google ? 'warning' : 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      carregarDados();
    }
  };

  const marcarRealizada = async (evt) => {
    try {
      await updateAgendaEvento(evt.id, { status: evt.status === 'concluida' ? 'agendada' : 'concluida' });
      carregarDados();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const conectado = Boolean(googleSync?.minha_conta);
  const ultimaSync = formatarHoraSync(googleSync?.ultima_sincronizacao);

  return (
    <div className="space-y-5 pb-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">Agenda</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            {totalSemana === 0 ? 'Nenhum compromisso nesta semana.' : `${totalSemana} ${totalSemana === 1 ? 'compromisso' : 'compromissos'} nesta semana.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {googleSync?.configurado &&
            (conectado ? (
              <button
                type="button"
                onClick={sincronizarAgora}
                disabled={syncing}
                title="Puxar agora as mudanças do Google Agenda"
                className="h-10 px-3.5 rounded-full flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-60"
              >
                <RefreshIcon className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando…' : ultimaSync ? `Google Agenda · ${ultimaSync}` : 'Sincronizar'}
              </button>
            ) : (
              <a
                href={URL_CONECTAR_GOOGLE_AGENDA}
                className="h-10 px-4 rounded-full flex items-center gap-2 text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                Conectar Google Agenda
              </a>
            ))}
          <button
            type="button"
            onClick={() => setModal({ data: estaNaSemanaAtual ? hojeIso : dias[0] })}
            className="h-10 pl-3.5 pr-4 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[13px] font-semibold flex items-center gap-1.5 hover:opacity-90 cursor-pointer shadow-sm"
          >
            <span className="text-[17px] leading-none -mt-px">+</span> Nova reunião
          </button>
        </div>
      </div>

      {/* Barra: semana, visão e filtros */}
      <div className="rounded-3xl bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-2 flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => moverSemana(-1)} aria-label="Semana anterior" className="w-9 h-9 rounded-full flex items-center justify-center text-lg text-slate-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
            ‹
          </button>
          <span className="min-w-[190px] text-center text-[14px] font-semibold tabular-nums">{rotuloSemana(dias)}</span>
          <button type="button" onClick={() => moverSemana(1)} aria-label="Próxima semana" className="w-9 h-9 rounded-full flex items-center justify-center text-lg text-slate-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
            ›
          </button>
          <AnimatePresence initial={false}>
            {!estaNaSemanaAtual && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setReferencia(hojeIso)}
                className="ml-1 h-8 px-3 rounded-full text-[12.5px] font-medium bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] cursor-pointer"
              >
                Voltar para hoje
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div role="radiogroup" aria-label="Visualização" className="flex p-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
            {[
              ['grade', 'Horários'],
              ['semana', 'Cartões'],
              ['lista', 'Lista'],
            ].map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={visao === id}
                onClick={() => escolherVisao(id)}
                className={`relative h-8 px-3.5 rounded-full text-[12.5px] font-medium cursor-pointer ${visao === id ? 'text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400'}`}
              >
                {visao === id && (
                  <motion.span layoutId="agenda-visao" className="absolute inset-0 rounded-full bg-white dark:bg-[#3a3a3f] shadow-sm" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />
                )}
                <span className="relative">{rotulo}</span>
              </button>
            ))}
          </div>
          <select
            value={pessoa}
            onChange={(e) => setPessoa(e.target.value)}
            aria-label="Filtrar por responsável"
            className="h-10 pl-3.5 pr-8 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-[12.5px] font-medium cursor-pointer outline-none focus:ring-2 focus:ring-[#4d7c0f]/30"
          >
            <option value="todas">Toda a equipe</option>
            <option value="eu">Só as minhas</option>
            {pessoas
              .filter((p) => p.email !== meuEmail)
              .map((p) => (
                <option key={p.email} value={p.email}>
                  {p.nome}
                </option>
              ))}
          </select>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar reunião ou empresa"
            aria-label="Buscar reunião ou empresa"
            className="h-10 w-full sm:w-56 px-4 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-[12.5px] outline-none focus:ring-2 focus:ring-[#4d7c0f]/30 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Conteúdo */}
      {!carregado ? (
        <ListSkeleton linhas={5} />
      ) : visao === 'grade' ? (
        <AgendaGradeSemana
          dias={dias}
          porDia={porDia}
          hojeIso={hojeIso}
          agora={agora}
          corDaAgenda={corDaAgenda}
          onAbrir={abrirEvento}
          onCriar={(data, hora) => setModal({ data, hora })}
          onMover={moverReuniao}
        />
      ) : visao === 'semana' ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
          {dias.map((dia, i) => {
            const hoje = dia === hojeIso;
            const itens = porDia[dia];
            return (
              <section
                key={dia}
                aria-label={deIso(dia).toLocaleDateString('pt-BR', { dateStyle: 'full' })}
                className={`group/dia rounded-3xl p-2 flex flex-col md:min-h-[420px] ${
                  hoje ? 'bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.08] dark:ring-white/[0.12]' : 'bg-black/[0.02] dark:bg-white/[0.02]'
                } ${!itens.length && !hoje ? 'max-md:hidden' : ''}`}
              >
                <header className="flex items-center justify-between px-1.5 pt-1 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[12px] font-medium ${hoje ? 'text-[#4d7c0f] dark:text-[#a3e635]' : 'text-slate-500 dark:text-zinc-400'}`}>{NOMES_DIA[(i + 1) % 7]}</span>
                    <span
                      className={`text-[15px] font-semibold tabular-nums ${
                        hoje ? 'w-7 h-7 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 flex items-center justify-center text-[13px]' : 'text-[#1d1d1f] dark:text-white'
                      }`}
                    >
                      {deIso(dia).getDate()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModal({ data: dia })}
                    aria-label="Nova reunião neste dia"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] md:opacity-0 group-hover/dia:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                  >
                    +
                  </button>
                </header>
                <div className="space-y-2 flex-1 flex flex-col">
                  <AnimatePresence initial={false}>
                    {itens.map((evt) => (
                      <CartaoReuniao key={evt.id} evt={evt} cor={corDaAgenda.get(evt.google_calendar_id)} agora={agora} onAbrir={abrirEvento} />
                    ))}
                  </AnimatePresence>
                  {!itens.length && (
                    <button
                      type="button"
                      onClick={() => setModal({ data: dia })}
                      className="flex-1 w-full min-h-[64px] md:min-h-[120px] flex items-center justify-center rounded-2xl text-[12px] text-slate-400 dark:text-zinc-500 md:opacity-0 group-hover/dia:opacity-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-opacity cursor-pointer"
                    >
                      + Agendar
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {dias
            .filter((d) => porDia[d].length)
            .map((dia) => (
              <section key={dia}>
                <h2 className={`text-[13px] font-semibold mb-2 px-1 first-letter:uppercase ${dia === hojeIso ? 'text-[#4d7c0f] dark:text-[#a3e635]' : 'text-slate-500 dark:text-zinc-400'}`}>
                  {deIso(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {dia === hojeIso && ' · hoje'}
                </h2>
                <ul className="rounded-3xl bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                  {porDia[dia].map((evt) => {
                    const prazo = evt.origem === 'fila_demandas';
                    return (
                      <li key={evt.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
                        <span className="w-[88px] sm:w-24 flex-shrink-0 text-[12.5px] tabular-nums text-slate-500 dark:text-zinc-400">{horarioDoEvento(evt)}</span>
                        <button type="button" onClick={() => abrirEvento(evt)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <span className={`block text-[14px] font-semibold truncate ${evt.status === 'cancelada' ? 'line-through opacity-60' : ''}`}>{prazo ? evt.empresa : evt.titulo}</span>
                          <span className="block text-[12.5px] text-slate-500 dark:text-zinc-400 truncate">
                            {[prazo ? 'Prazo de demanda' : evt.empresa !== 'Cliente Geral' ? evt.empresa : '', evt.responsavel_nome].filter(Boolean).join(' · ') || 'Sem responsável'}
                          </span>
                        </button>
                        {evt.link_reuniao && evt.status !== 'cancelada' && (
                          <a href={evt.link_reuniao} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-85">
                            <IconeVideo /> <span className="hidden sm:inline">Entrar</span>
                          </a>
                        )}
                        {!prazo && evt.status !== 'cancelada' && (
                          <button
                            type="button"
                            onClick={() => marcarRealizada(evt)}
                            title={evt.status === 'concluida' ? 'Desmarcar como realizada' : 'Marcar como realizada'}
                            aria-label={evt.status === 'concluida' ? 'Desmarcar como realizada' : 'Marcar como realizada'}
                            className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors flex-shrink-0 ${
                              evt.status === 'concluida' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'text-slate-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                            }`}
                          >
                            <CheckIcon className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          {totalSemana === 0 && <p className="text-center text-[13px] text-slate-500 dark:text-zinc-400 py-16">Nenhum compromisso nesta semana.</p>}
        </div>
      )}

      <AgendaEventoModal
        aberto={Boolean(modal)}
        onFechar={() => {
          setModal(null);
          carregarDados();
        }}
        evento={modal?.evento || null}
        dataInicial={modal?.data || null}
        horaInicial={modal?.hora || null}
        equipe={equipe}
        empresas={empresas}
        userEmail={userEmail}
        agendas={googleSync?.agendas || []}
        agendaPadrao={googleSync?.agenda_padrao || null}
        googleAtivo={Boolean(googleSync?.agendas?.length)}
        onCancelarReuniao={cancelarReuniao}
        onExcluir={excluirReuniao}
      />

      <ConfirmModal
        isOpen={Boolean(confirmDialog)}
        title={confirmDialog?.title || 'Confirmar'}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText || 'Confirmar'}
        cancelText="Voltar"
        variant="danger"
        onConfirm={confirmDialog?.onConfirm}
        onClose={() => setConfirmDialog(null)}
      />
    </div>
  );
}
