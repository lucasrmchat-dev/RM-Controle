'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getAgendaConfig, 
  setAgendaConfig,
  getAgendaEventos, 
  addAgendaEvento, 
  updateAgendaEvento, 
  deleteAgendaEvento,
  getEquipeUsuarios,
  getNomeTecnico,
  getEmpresas,
  parseIcalEvents,
  saveAgendaEventos
} from '@/lib/storage';
import { playMeetingAlertTone } from '@/lib/audioNotifications';
import { showToast } from './ToastNotification';
import ConfirmModal from './ConfirmModal';
import { 
  CalendarIcon, 
  ClockIcon, 
  CheckIcon, 
  XMarkIcon, 
  UserIcon, 
  UsersIcon,
  BuildingIcon,
  RefreshIcon
} from './Icons';

export default function AgendaView({ userEmail, onSelectEmpresa, onNavigateConfig }) {
  const [eventos, setEventos] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [config, setConfig] = useState(getAgendaConfig());
  const [viewMode, setViewMode] = useState(() => {
    const cfg = getAgendaConfig();
    return cfg.visualizacaoPadrao === 'embed' ? 'embed' : 'semana';
  });
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos'); // 'todos' | 'meus' | email
  const [busca, setBusca] = useState('');
  const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
  const [syncing, setSyncing] = useState(false);
  const [, setTick] = useState(0);

  // Modal de Agendamento
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formTitulo, setFormTitulo] = useState('');
  const [formEmpresa, setFormEmpresa] = useState('');
  const [formData, setFormData] = useState(new Date().toISOString().split('T')[0]);
  const [formHoraInicio, setFormHoraInicio] = useState('09:00');
  const [formHoraFim, setFormHoraFim] = useState('10:00');
  const [formResponsavelEmail, setFormResponsavelEmail] = useState(userEmail || 'admin@rmcontrole.com');
  const [formLink, setFormLink] = useState('');
  const [formTipo, setFormTipo] = useState('cliente');
  const [formObs, setFormObs] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const carregarDados = () => {
    setEventos(getAgendaEventos());
    setEquipe(getEquipeUsuarios());
    setConfig(getAgendaConfig());
    getEmpresas({ pageSize: 1000 }).then((res) => {
      const lista = Array.isArray(res) ? res : (res?.items || []);
      setEmpresas(lista);
    });
  };

  useEffect(() => {
    carregarDados();
    const handleEventsUpdate = () => setEventos(getAgendaEventos());
    const handleConfigUpdate = () => setConfig(getAgendaConfig());
    window.addEventListener('agenda_eventos_updated', handleEventsUpdate);
    window.addEventListener('rm_agenda_config_updated', handleConfigUpdate);

    // Ticker a cada 30 segundos para atualizar cronômetros e proximidade de reuniões
    const interval = setInterval(() => setTick((t) => t + 1), 30000);

    return () => {
      window.removeEventListener('agenda_eventos_updated', handleEventsUpdate);
      window.removeEventListener('rm_agenda_config_updated', handleConfigUpdate);
      clearInterval(interval);
    };
  }, []);

  // Sincronização manual com Google Calendar via rota segura de API ou fallback iCal
  const handleSincronizarGoogle = async () => {
    if (!config.urlIcal) {
      showToast('Configure a URL pública iCal (.ics) do Google Agenda em Configurações.', 'warning');
      return;
    }
    setSyncing(true);
    try {
      let icsText = '';

      // 1. Tenta buscar via rota server-side do Next.js (sem problemas de CORS)
      try {
        const apiRes = await fetch(`/api/calendar?url=${encodeURIComponent(config.urlIcal)}`);
        if (apiRes.ok) {
          icsText = await apiRes.text();
        }
      } catch (apiErr) {
        console.warn('Tentativa via rota interna /api/calendar falhou:', apiErr);
      }

      // 2. Se a rota interna não obteve o conteúdo, tenta busca direta ou proxy
      if (!icsText || !icsText.includes('BEGIN:VCALENDAR')) {
        try {
          const res = await fetch(config.urlIcal);
          if (res.ok) {
            icsText = await res.text();
          }
        } catch (corsErr) {
          // Fallback usando proxy CORS de contingência para feeds iCal públicos
          const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(config.urlIcal);
          const resProxy = await fetch(proxyUrl);
          if (resProxy.ok) {
            icsText = await resProxy.text();
          }
        }
      }

      if (icsText && icsText.includes('BEGIN:VCALENDAR')) {
        const novosEventos = parseIcalEvents(icsText);
        if (novosEventos.length > 0) {
          // Mescla com eventos locais preservando edições manuais
          const atuais = getAgendaEventos();
          const mapa = new Map();
          novosEventos.forEach((e) => mapa.set(e.id, e));
          atuais.forEach((e) => {
            if (!e.origem || e.origem !== 'google_calendar') {
              mapa.set(e.id, e);
            }
          });
          const merged = Array.from(mapa.values());
          saveAgendaEventos(merged);
          setEventos(merged);
          showToast(`Sincronização concluída! ${novosEventos.length} reuniões importadas do Google Agenda.`, 'success');
        } else {
          showToast('Nenhum evento recente encontrado no feed iCal.', 'info');
        }
      } else {
        showToast('Não foi possível ler o arquivo iCal diretamente. Verifique se o endereço da agenda é público.', 'warning');
      }
    } catch (err) {
      showToast('Erro ao sincronizar com Google Agenda: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenCreateModal = (dataPre = null, horaPre = '09:00') => {
    setEditingEvent(null);
    setFormTitulo('');
    setFormEmpresa('');
    setFormData(dataPre || new Date().toISOString().split('T')[0]);
    setFormHoraInicio(horaPre || '09:00');
    // Hora fim + 1h
    const [h, m] = (horaPre || '09:00').split(':').map(Number);
    const endH = String(Math.min(23, h + 1)).padStart(2, '0');
    setFormHoraFim(`${endH}:${String(m).padStart(2, '0')}`);
    setFormResponsavelEmail(userEmail || 'admin@rmcontrole.com');
    setFormLink('');
    setFormTipo('cliente');
    setFormObs('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (evt) => {
    setEditingEvent(evt);
    setFormTitulo(evt.titulo || '');
    setFormEmpresa(evt.empresa || '');
    setFormData(evt.data || new Date().toISOString().split('T')[0]);
    setFormHoraInicio(evt.hora_inicio || '09:00');
    setFormHoraFim(evt.hora_fim || '10:00');
    setFormResponsavelEmail(evt.responsavel_email || userEmail || 'admin@rmcontrole.com');
    setFormLink(evt.link_reuniao || '');
    setFormTipo(evt.tipo || 'cliente');
    setFormObs(evt.observacoes || '');
    setModalOpen(true);
  };

  const handleSaveEvento = async (e) => {
    e.preventDefault();
    if (!formTitulo.trim()) {
      showToast('Informe o título do compromisso / reunião.', 'error');
      return;
    }

    const respObj = equipe.find((u) => (u.email || '').toLowerCase().trim() === formResponsavelEmail.toLowerCase().trim());
    const respNome = respObj?.nome || getNomeTecnico(formResponsavelEmail);

    const payload = {
      titulo: formTitulo.trim(),
      empresa: formEmpresa.trim() || 'Cliente Geral',
      data: formData,
      hora_inicio: formHoraInicio,
      hora_fim: formHoraFim,
      responsavel_email: formResponsavelEmail,
      responsavel_nome: respNome,
      link_reuniao: formLink.trim(),
      tipo: formTipo,
      observacoes: formObs.trim(),
      status: editingEvent?.status || 'agendada',
    };

    if (editingEvent) {
      await updateAgendaEvento(editingEvent.id, payload);
      showToast(`Compromisso "${formTitulo}" atualizado!`, 'success');
    } else {
      await addAgendaEvento(payload);
      showToast(`Reunião "${formTitulo}" agendada com sucesso!`, 'success');
    }

    setModalOpen(false);
  };

  const handleExcluirEvento = (evt) => {
    setConfirmDialog({
      title: 'Excluir Reunião?',
      message: `Deseja realmente remover o compromisso "${evt.titulo}" da agenda?`,
      confirmText: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        await deleteAgendaEvento(evt.id);
        showToast('Compromisso removido da agenda.', 'success');
      },
    });
  };

  const handleAlterarStatus = async (evt, novoStatus) => {
    await updateAgendaEvento(evt.id, { status: novoStatus });
    showToast(`Status atualizado para: ${novoStatus.toUpperCase()}`, 'info');
  };

  // Cálculo de dias da semana selecionada (Segunda a Domingo)
  const diasDaSemana = useMemo(() => {
    const base = new Date(dataSelecionada + 'T12:00:00');
    const dayOfWeek = base.getDay(); // 0 = Domingo, 1 = Segunda...
    // Queremos começar na Segunda-feira (1)
    const diffToSegunda = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const segunda = new Date(base);
    segunda.setDate(base.getDate() + diffToSegunda);

    const dias = [];
    const nomesSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(segunda);
      d.setDate(segunda.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      dias.push({
        dataIso: iso,
        diaMes: d.getDate(),
        mesNome: d.toLocaleString('pt-BR', { month: 'short' }),
        nomeSemana: nomesSemana[i],
        isHoje: iso === new Date().toISOString().split('T')[0],
      });
    }
    return dias;
  }, [dataSelecionada]);

  // Filtro de eventos
  const eventosFiltrados = useMemo(() => {
    const myEmail = (userEmail || '').toLowerCase().trim();

    return eventos.filter((evt) => {
      // 1. Filtro por responsável
      if (filtroResponsavel === 'meus') {
        const evEmail = (evt.responsavel_email || '').toLowerCase().trim();
        const evNome = (evt.responsavel_nome || '').toLowerCase().trim();
        const meuNome = getNomeTecnico(userEmail).toLowerCase().trim();
        if (evEmail !== myEmail && !evNome.includes(meuNome)) return false;
      } else if (filtroResponsavel !== 'todos') {
        const evEmail = (evt.responsavel_email || '').toLowerCase().trim();
        if (evEmail !== filtroResponsavel.toLowerCase().trim()) return false;
      }

      // 2. Busca textual
      if (busca.trim()) {
        const q = busca.toLowerCase().trim();
        const matchTitulo = (evt.titulo || '').toLowerCase().includes(q);
        const matchEmpresa = (evt.empresa || '').toLowerCase().includes(q);
        const matchResp = (evt.responsavel_nome || '').toLowerCase().includes(q);
        const matchObs = (evt.observacoes || '').toLowerCase().includes(q);
        if (!matchTitulo && !matchEmpresa && !matchResp && !matchObs) return false;
      }

      return true;
    }).sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
  }, [eventos, filtroResponsavel, busca, userEmail]);

  // Contagem de compromissos para hoje
  const hojeStr = new Date().toISOString().split('T')[0];
  const compromissosHoje = useMemo(() => {
    return eventos.filter((e) => e.data === hojeStr && e.status !== 'cancelada');
  }, [eventos, hojeStr]);

  // Navegação de datas (< > Hoje)
  const handleNavData = (offsetDias) => {
    const base = new Date(dataSelecionada + 'T12:00:00');
    base.setDate(base.getDate() + offsetDias);
    setDataSelecionada(base.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      
      {/* ============================================================================== */}
      {/* CABEÇALHO WIDESCREEN DA AGENDA                                                 */}
      {/* ============================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-mono">
              Agenda Integrada ao Google Calendar
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white flex items-center gap-3">
            <span>Agenda & Compromissos</span>
            {compromissosHoje.length > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-bold font-mono">
                {compromissosHoje.length} hoje
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Sincronização com Google Agenda, alertas prévios de reuniões e atribuição direta a membros da equipe.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Botão Sincronizar Google */}
          <button
            type="button"
            onClick={handleSincronizarGoogle}
            disabled={syncing}
            className="px-3.5 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1a1a20] hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-xs font-semibold text-slate-700 dark:text-zinc-200 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            title="Sincronizar reuniões da URL pública iCal do Google Agenda"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-500' : 'text-slate-400'}`} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar Google'}</span>
          </button>

          {/* Botão Novo Agendamento */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleOpenCreateModal()}
            className="px-4 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-md shadow-[#4d7c0f]/20 hover:opacity-95 flex items-center gap-2 transition-all cursor-pointer"
          >
            <span className="text-sm font-bold">+</span>
            <span>Agendar Reunião</span>
          </motion.button>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* BARRA DE CONTROLE: NAVEGAÇÃO DE DATAS, SELETORES E VISÃO                      */}
      {/* ============================================================================== */}
      <div className="p-3.5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Navegação de Datas */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-black/[0.03] dark:bg-white/[0.04] rounded-2xl border border-black/[0.04] dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => handleNavData(-7)}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-xs font-bold cursor-pointer transition-colors"
                title="Semana anterior"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => setDataSelecionada(new Date().toISOString().split('T')[0])}
                className="px-3 py-1 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer transition-colors"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => handleNavData(7)}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-xs font-bold cursor-pointer transition-colors"
                title="Próxima semana"
              >
                ▶
              </button>
            </div>

            <div className="text-xs font-bold text-[#1d1d1f] dark:text-white font-mono px-2">
              {diasDaSemana[0].diaMes} {diasDaSemana[0].mesNome} — {diasDaSemana[6].diaMes} {diasDaSemana[6].mesNome}
            </div>
          </div>

          {/* Modos de Visualização (Semana, Lista e Embed Google Calendar) */}
          <div className="flex items-center gap-1.5 p-1 bg-black/[0.03] dark:bg-white/[0.04] rounded-2xl border border-black/[0.04] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => setViewMode('semana')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'semana'
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Semana</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('lista')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'lista'
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <span>Lista / Hoje</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('embed')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'embed'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <span>Google Agenda (Ao Vivo)</span>
            </button>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar reunião ou cliente..."
              className="w-full px-3.5 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/20 text-[#1d1d1f] dark:text-white placeholder:text-slate-400"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black dark:hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Linha Inferior: Filtros de Responsabilidade (Meus vs Todos vs Colaborador) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-black/[0.04] dark:border-white/[0.05] text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto p-0.5 scrollbar-thin">
            <span className="text-slate-400 font-semibold px-1 text-[11px] uppercase tracking-wider font-mono flex-shrink-0">
              Responsável:
            </span>
            <button
              type="button"
              onClick={() => setFiltroResponsavel('todos')}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all flex items-center gap-1 flex-shrink-0 ${
                filtroResponsavel === 'todos'
                  ? 'bg-[#09090b] text-white dark:bg-white dark:text-black font-bold shadow-xs'
                  : 'bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.05]'
              }`}
            >
              <span>Todas as Reuniões</span>
              <span className="text-[10px] font-mono opacity-70">({eventos.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroResponsavel('meus')}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all flex items-center gap-1 flex-shrink-0 ${
                filtroResponsavel === 'meus'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.05]'
              }`}
            >
              <span>Minhas Reuniões</span>
            </button>

            {equipe.map((u) => {
              const uEmail = (u.email || '').toLowerCase().trim();
              const isSel = filtroResponsavel === uEmail;
              const countResp = eventos.filter((e) => (e.responsavel_email || '').toLowerCase().trim() === uEmail).length;

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setFiltroResponsavel(uEmail)}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 flex-shrink-0 ${
                    isSel
                      ? 'bg-[#09090b] text-white dark:bg-white dark:text-black font-bold shadow-xs'
                      : 'bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:bg-black/[0.05]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{u.nome}</span>
                  {countResp > 0 && (
                    <span className="text-[10px] font-mono opacity-70">({countResp})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Atalho de Configurações da Agenda */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {onNavigateConfig && (
              <button
                type="button"
                onClick={() => onNavigateConfig('agenda')}
                className="text-xs text-slate-500 hover:text-black dark:hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <span>⚙️ Configurar Google Agenda</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* CONTEÚDO PRINCIPAL: MODO SEMANAL, MODO LISTA OU GOOGLE EMBED                   */}
      {/* ============================================================================== */}
      {viewMode === 'embed' ? (
        /* VISÃO EMBUTIDA AO VIVO DO GOOGLE CALENDAR */
        <div className="w-full rounded-3xl overflow-hidden border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-xl p-2 sm:p-4 min-h-[750px] flex flex-col space-y-3">
          <div className="flex items-center justify-between px-2 text-xs text-slate-500 dark:text-zinc-400">
            <span className="font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Google Calendar Embed — {config.calendarId || 'suporte@rmchat.com.br'}
            </span>
            <a 
              href={config.urlEmbed || `https://calendar.google.com/calendar/u/0/r`} 
              target="_blank" 
              rel="noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              Abrir em Nova Aba ↗
            </a>
          </div>

          <div className="flex-1 w-full h-[720px] rounded-2xl overflow-hidden border border-black/[0.05] dark:border-white/[0.06]">
            <iframe
              src={config.urlEmbed || `https://calendar.google.com/calendar/embed?src=suporte%40rmchat.com.br&ctz=America%2FFortaleza`}
              style={{ border: 0 }}
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              title="Google Agenda RM Controle"
              className="w-full h-full"
            />
          </div>
        </div>
      ) : viewMode === 'semana' ? (
        /* VISÃO SEMANAL EM GRID (APPLE CALENDAR AESTHETICS) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {diasDaSemana.map((dia) => {
              const eventosDoDia = eventosFiltrados.filter((e) => e.data === dia.dataIso);

              return (
                <div
                  key={dia.dataIso}
                  className={`rounded-3xl p-3.5 border transition-all flex flex-col min-h-[460px] ${
                    dia.isHoje
                      ? 'border-blue-500/40 bg-gradient-to-b from-blue-500/[0.04] to-transparent dark:from-blue-500/[0.08] shadow-apple-hover'
                      : 'border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-[#16161a]/70 backdrop-blur-xl'
                  }`}
                >
                  {/* Cabeçalho do Dia */}
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-black/[0.04] dark:border-white/[0.06]">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
                        {dia.nomeSemana}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-lg font-bold font-mono ${dia.isHoje ? 'text-blue-600 dark:text-blue-400' : 'text-[#1d1d1f] dark:text-white'}`}>
                          {dia.diaMes}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {dia.mesNome}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenCreateModal(dia.dataIso)}
                      className="w-6 h-6 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                      title={`Adicionar reunião para ${dia.nomeSemana}`}
                    >
                      +
                    </button>
                  </div>

                  {/* Lista de Eventos do Dia */}
                  <div className="space-y-2 flex-1 overflow-y-auto pr-0.5">
                    {eventosDoDia.length === 0 ? (
                      <div className="h-full flex items-center justify-center p-3 text-center">
                        <span className="text-[11px] text-slate-300 dark:text-zinc-600 italic">
                          Livre
                        </span>
                      </div>
                    ) : (
                      eventosDoDia.map((evt) => {
                        const isMinha = (evt.responsavel_email || '').toLowerCase().trim() === (userEmail || '').toLowerCase().trim();

                        return (
                          <motion.div
                            key={evt.id}
                            whileHover={{ y: -2 }}
                            onClick={() => handleOpenEditModal(evt)}
                            className={`p-3 rounded-2xl border text-xs space-y-1.5 transition-all cursor-pointer relative group ${
                              evt.status === 'concluida'
                                ? 'border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]'
                                : evt.status === 'cancelada'
                                ? 'opacity-40 border-black/[0.05] line-through'
                                : isMinha
                                ? 'border-blue-500/40 bg-blue-500/[0.08] dark:bg-blue-500/[0.12] text-blue-950 dark:text-blue-200'
                                : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.03] hover:border-black/20'
                            }`}
                          >
                            {/* Horário */}
                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                              <span className="font-bold text-[#1d1d1f] dark:text-white">
                                {evt.hora_inicio} — {evt.hora_fim}
                              </span>
                              {evt.status === 'concluida' && (
                                <span className="text-emerald-600 font-bold">✓</span>
                              )}
                            </div>

                            {/* Título e Cliente */}
                            <h4 className="font-bold text-xs leading-snug line-clamp-2 text-[#1d1d1f] dark:text-white">
                              {evt.titulo}
                            </h4>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate flex items-center gap-1">
                              <BuildingIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{evt.empresa}</span>
                            </div>

                            {/* Responsável */}
                            <div className="pt-1 flex items-center justify-between text-[10px]">
                              <span className="text-slate-400 truncate max-w-[100px]">
                                {evt.responsavel_nome?.split(' ')[0] || 'Equipe'}
                              </span>

                              {evt.link_reuniao && (
                                <a
                                  href={evt.link_reuniao}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[9px] hover:bg-blue-700 flex items-center gap-1 shadow-xs"
                                >
                                  <span>Meet ↗</span>
                                </a>
                              )}
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* VISÃO LISTA / CRONOGRAMA */
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl shadow-xs overflow-hidden">
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {eventosFiltrados.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <CalendarIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-zinc-600 mb-2" />
                <p className="text-sm font-semibold">Nenhuma reunião encontrada para este filtro ou período.</p>
                <p className="text-xs text-slate-400 mt-1">Clique em "Agendar Reunião" ou sincronize com o Google Calendar.</p>
              </div>
            ) : (
              eventosFiltrados.map((evt) => {
                const isMinha = (evt.responsavel_email || '').toLowerCase().trim() === (userEmail || '').toLowerCase().trim();
                const isHoje = evt.data === hojeStr;

                return (
                  <div
                    key={evt.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      {/* Box de Horário */}
                      <div className="w-20 rounded-2xl p-2.5 bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06] text-center flex-shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                          {new Date(evt.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}
                        </span>
                        <span className="text-sm font-bold font-mono text-[#1d1d1f] dark:text-white block mt-0.5">
                          {evt.hora_inicio}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          até {evt.hora_fim}
                        </span>
                      </div>

                      {/* Informações da Reunião */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f] dark:text-white">
                            {evt.titulo}
                          </h3>
                          {isHoje && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-mono">
                              Hoje
                            </span>
                          )}
                          {isMinha && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              Minha Responsabilidade
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            evt.status === 'concluida'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : evt.status === 'cancelada'
                              ? 'bg-red-500/10 text-red-600 line-through'
                              : 'bg-black/[0.04] text-slate-600 dark:text-zinc-300'
                          }`}>
                            {evt.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 flex-wrap">
                          <span className="font-semibold text-slate-700 dark:text-zinc-200 flex items-center gap-1">
                            <BuildingIcon className="w-3.5 h-3.5 text-slate-400" />
                            {evt.empresa}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            Responsável: <strong>{evt.responsavel_nome}</strong>
                          </span>
                        </div>

                        {evt.observacoes && (
                          <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1 pt-0.5">
                            {evt.observacoes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Ações Rápidas */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                      {evt.link_reuniao && (
                        <a
                          href={evt.link_reuniao}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <span>Entrar no Meet</span>
                          <span>↗</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(evt)}
                        className="px-3 py-1.5 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        Editar
                      </button>

                      {evt.status !== 'concluida' ? (
                        <button
                          type="button"
                          onClick={() => handleAlterarStatus(evt, 'concluida')}
                          className="p-2 rounded-full text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer"
                          title="Marcar como Concluída"
                        >
                          <CheckIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAlterarStatus(evt, 'agendada')}
                          className="p-2 rounded-full text-slate-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                          title="Reabrir Compromisso"
                        >
                          ↺
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleExcluirEvento(evt)}
                        className="p-2 rounded-full text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Remover da Agenda"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE COMPROMISSO NA AGENDA                            */}
      {/* ============================================================================== */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#16161a] p-6 sm:p-8 shadow-2xl space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7] my-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
                <h3 className="text-xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                  {editingEvent ? 'Editar Reunião / Compromisso' : 'Agendar Nova Reunião'}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="text-slate-400 hover:text-black dark:hover:text-white p-1 rounded-full cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEvento} className="space-y-4 text-xs">
                {/* Título */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300">
                    Título da Reunião / Assunto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    placeholder="Ex: Alinhamento de Fluxo / Treinamento de Equipe"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                  />
                </div>

                {/* Cliente / Empresa */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300">
                    Cliente / Empresa Atendida
                  </label>
                  <input
                    type="text"
                    value={formEmpresa}
                    onChange={(e) => setFormEmpresa(e.target.value)}
                    placeholder="Ex: DV Protec / Hospital Gastrovitta"
                    list="agenda-sugestoes-empresas"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                  />
                  <datalist id="agenda-sugestoes-empresas">
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.nome} />
                    ))}
                  </datalist>
                </div>

                {/* Data e Horários */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block font-semibold text-slate-700 dark:text-zinc-300">Data</label>
                    <input
                      type="date"
                      required
                      value={formData}
                      onChange={(e) => setFormData(e.target.value)}
                      className="w-full px-3 py-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block font-semibold text-slate-700 dark:text-zinc-300">Início</label>
                    <input
                      type="time"
                      required
                      value={formHoraInicio}
                      onChange={(e) => setFormHoraInicio(e.target.value)}
                      className="w-full px-3 py-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block font-semibold text-slate-700 dark:text-zinc-300">Término</label>
                    <input
                      type="time"
                      required
                      value={formHoraFim}
                      onChange={(e) => setFormHoraFim(e.target.value)}
                      className="w-full px-3 py-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                    />
                  </div>
                </div>

                {/* Responsável da Equipe */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300">
                    Responsável pelo Compromisso
                  </label>
                  <select
                    value={formResponsavelEmail}
                    onChange={(e) => setFormResponsavelEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 cursor-pointer"
                  >
                    {equipe.map((u) => (
                      <option key={u.id} value={u.email} className="text-black dark:text-white dark:bg-zinc-900">
                        {u.nome} ({u.papel})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Link do Meet / Sala */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300">
                    Link da Sala Virtual (Google Meet / Zoom / Teams)
                  </label>
                  <input
                    type="url"
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    placeholder="https://meet.google.com/xyz-abcd-efg"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                  />
                </div>

                {/* Observações */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-zinc-300">
                    Observações / Pauta
                  </label>
                  <textarea
                    rows={2}
                    value={formObs}
                    onChange={(e) => setFormObs(e.target.value)}
                    placeholder="Tópicos da conversa, orientações prévias..."
                    className="w-full p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 resize-none font-sans"
                  />
                </div>

                {/* Botões do Rodapé */}
                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 font-semibold text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold shadow-md hover:opacity-95 transition-all cursor-pointer"
                  >
                    {editingEvent ? 'Salvar Alterações' : 'Confirmar Agendamento'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={Boolean(confirmDialog)}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText || 'Confirmar'}
        variant={confirmDialog?.variant || 'danger'}
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        onClose={() => setConfirmDialog(null)}
      />
    </div>
  );
}
