'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAudioConfig, setAudioConfig, playNotificationTone, getSomDoModulo } from '@/lib/audioNotifications';
import SonsModulos from './SonsModulos';
import EscolhaPaleta from './EscolhaPaleta';
import { 
  getDefaultViewMode, 
  setDefaultViewMode,
  getSenhaPadraoRedefinicao,
  setSenhaPadraoRedefinicao,
  getConfiguracoesSuporte,
  setConfiguracoesSuporte,
  getServidoresConfig,
  setServidoresConfig,
  fetchServidoresConfig,
  getCategoriasDemandas,
  addCategoriaDemanda,
  removeCategoriaDemanda,
  getPermissoesAtuais,
  getAgendaConfig,
  setAgendaConfig,
  getGestaoAtual
} from '@/lib/storage';
import { generateSecurePassword } from '@/lib/security';
import ChannelsManagement from '@/components/ChannelsManagement';
import ServerConfigView from './ServerConfigView';
import AuditLogsView from './AuditLogsView';
import SupportIntegrationSettings from './SupportIntegrationSettings';
import GoogleAgendaSync from './GoogleAgendaSync';
import PerfisAcessoView from './PerfisAcessoView';
import ComercialSettings from './ComercialSettings';
import TitulosReuniaoSettings from './TitulosReuniaoSettings';
import FeedbacksSettings from './FeedbacksSettings';
import ChatSettings from './ChatSettings';
import WhatsappAgendaSettings, { PreferenciasWhatsapp } from './WhatsappAgendaSettings';
import PlataformaView from './PlataformaView';
import { podeVerConfiguracoesAvancadas, podeAcessarAbaConfiguracao, ROTULOS_PAPEL } from '@/lib/roles';
import { 
  SparklesIcon, 
  SaveIcon, 
  CheckIcon, 
  ViewGridIcon, 
  ViewListIcon,
  KanbanIcon,
  ShieldCheckIcon,
  WrenchIcon,
  XMarkIcon,
  CalendarIcon,
  ClockIcon
} from './Icons';
import { showToast } from './ToastNotification';
import EncaixeCabecalho, { ACOES_TITULO, LINHA_TITULO } from './EncaixeCabecalho';

export default function GeneralSettingsView({ userEmail, initialSubTab = 'visualizacao' }) {
  // Papel definido pelo servidor no login/sessão (mesma regra de src/lib/roles.js)
  // Administrador = perfil de acesso com acesso total (ou papel administrador para quem ainda não tem perfil).
  // "Ver o sistema como" também vale aqui, para conferir o que outro perfil enxerga.
  const [, atualizarPermissoes] = useState(0);
  const currentRole = getPermissoesAtuais(userEmail).administrador ? 'administrador' : 'suporte';
  const isAdmin = podeVerConfiguracoesAvancadas(currentRole);
  // Celular: primeiro o menu, depois a seção escolhida
  const [menuCelular, setMenuCelular] = useState(true);
  const [subTab, setSubTab] = useState(() =>
    podeAcessarAbaConfiguracao(currentRole, initialSubTab) ? initialSubTab : 'visualizacao'
  );

  useEffect(() => {
    // Recalcula com o e-mail da sessão em cada render, inclusive após Fast Refresh ou troca de conta.
    const atualizar = () => atualizarPermissoes((versao) => versao + 1);
    const eventos = ['user_role_updated', 'perfis_updated', 'equipe_updated'];
    eventos.forEach((evento) => window.addEventListener(evento, atualizar));
    return () => eventos.forEach((evento) => window.removeEventListener(evento, atualizar));
  }, []);

  // Se o papel mudar (ou a aba inicial vier de um link), nunca deixa um não-administrador numa aba avançada
  useEffect(() => {
    if (!podeAcessarAbaConfiguracao(currentRole, subTab)) setSubTab('visualizacao');
  }, [currentRole, subTab]);

  // 1. Preferência de Visualização Global
  const [viewMode, setViewModeState] = useState('list');

  // 2. Alertas Sonoros
  const [audioConfig, setAudioState] = useState({
    habilitado: true,
    tipoSom: 'harmonico',
    modoRepeticao: 'uma_vez',
    intervaloSegundos: 30,
    escopo: 'todos',
  });
  const [somTocando, setSomTocando] = useState(false);

  // 3. Regras de Suporte & Senha Padrão
  const [senhaPadrao, setSenhaPadrao] = useState('');
  const [senhaSalva, setSenhaSalva] = useState(false);
  const [servidoresConfig, setServidoresConfigState] = useState(getServidoresConfig() || {});
  const [configSuporte, setConfigSuporteState] = useState({
    motivo_obrigatorio: true,
    solucao_obrigatoria: false,
    colaborador_obrigatorio: false,
    atendente_obrigatorio: false,
  });

  // 4. Categorias de Demandas
  const [categoriasDemandas, setCategoriasDemandasState] = useState([]);
  const [novaCategoriaInput, setNovaCategoriaInput] = useState('');

  // 5. Integração Google Agenda & Alertas
  const [agendaConfig, setAgendaConfigState] = useState(getAgendaConfig());
  const [agendaSalva, setAgendaSalva] = useState(false);
  const [agendaSomTocando, setAgendaSomTocando] = useState(false);

  useEffect(() => {
    setViewModeState(getDefaultViewMode());
    setAudioState(getAudioConfig());
    setSenhaPadrao(getSenhaPadraoRedefinicao());
    setConfigSuporteState(getConfiguracoesSuporte());
    setCategoriasDemandasState(getCategoriasDemandas());
    setAgendaConfigState(getAgendaConfig());

    const handleAudioUpdate = () => setAudioState(getAudioConfig());
    const handleViewModeUpdate = (e) => setViewModeState(e.detail || getDefaultViewMode());
    const handleCatsUpdate = () => setCategoriasDemandasState(getCategoriasDemandas());
    const handleAgendaUpdate = () => setAgendaConfigState(getAgendaConfig());

    window.addEventListener('rm_audio_config_updated', handleAudioUpdate);
    window.addEventListener('rm_default_view_mode_updated', handleViewModeUpdate);
    window.addEventListener('categorias_demandas_updated', handleCatsUpdate);
    window.addEventListener('rm_agenda_config_updated', handleAgendaUpdate);
    const handleServidoresUpdate = () => setServidoresConfigState(getServidoresConfig() || {});
    fetchServidoresConfig();
    window.addEventListener('rm_servidores_config_updated', handleServidoresUpdate);
    window.addEventListener('rm_servidores_urls_updated', handleServidoresUpdate);

    return () => {
      window.removeEventListener('rm_audio_config_updated', handleAudioUpdate);
      window.removeEventListener('rm_default_view_mode_updated', handleViewModeUpdate);
      window.removeEventListener('categorias_demandas_updated', handleCatsUpdate);
      window.removeEventListener('rm_agenda_config_updated', handleAgendaUpdate);
      window.removeEventListener('rm_servidores_config_updated', handleServidoresUpdate);
      window.removeEventListener('rm_servidores_urls_updated', handleServidoresUpdate);
    };
  }, []);

  const handleChangeViewMode = (mode) => {
    setDefaultViewMode(mode);
    setViewModeState(mode);
    showToast(`Visualização do sistema definida para ${mode === 'cards' ? 'Cards' : mode === 'kanban' ? 'Kanban' : 'Lista'} por padrão.`, 'success');
  };

  const handleTestarSom = (tipo) => {
    setSomTocando(true);
    playNotificationTone(tipo || audioConfig.tipoSom);
    setTimeout(() => setSomTocando(false), 1200);
  };

  const handleSalvarAudioConfig = () => {
    setAudioConfig(audioConfig);
    showToast('Configurações de alerta sonoro salvas com sucesso para o seu perfil!', 'success');
  };

  const handleSalvarSenhaPadrao = (e) => {
    e.preventDefault();
    if (!senhaPadrao.trim()) return;
    setSenhaPadraoRedefinicao(senhaPadrao.trim());
    setSenhaSalva(true);
    showToast('Senha padrão de contingência atualizada!', 'success');
    setTimeout(() => setSenhaSalva(false), 2500);
  };

  const handleToggleRegraSuporte = (campo) => {
    const atualizado = setConfiguracoesSuporte({
      [campo]: !configSuporte[campo],
    });
    setConfigSuporteState(atualizado);
    showToast('Regra de atendimento atualizada!', 'info');
  };

  const handleAdicionarCategoria = (e) => {
    e.preventDefault();
    if (!novaCategoriaInput.trim()) return;
    try {
      const novas = addCategoriaDemanda(novaCategoriaInput.trim());
      setCategoriasDemandasState(novas);
      setNovaCategoriaInput('');
      showToast('Categoria adicionada com sucesso!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoverCategoria = (cat) => {
    try {
      const novas = removeCategoriaDemanda(cat);
      setCategoriasDemandasState(novas);
      showToast(`Categoria "${cat}" removida.`, 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSalvarAgendaConfig = (e) => {
    e.preventDefault();
    setAgendaConfig(agendaConfig);
    setAgendaSalva(true);
    showToast('Configurações de integração com Google Agenda salvas com sucesso!', 'success');
    setTimeout(() => setAgendaSalva(false), 2500);
  };

  const handleTestarSomAgenda = () => {
    setAgendaSomTocando(true);
    playNotificationTone(getSomDoModulo('reunioes').tipoSom);
    showToast('🔔 Chime harmônico de reunião executado!', 'info');
    setTimeout(() => setAgendaSomTocando(false), 1200);
  };

  const opcoesSons = [
    { id: 'harmonico', nome: 'Harmônico Apple', desc: 'Acorde suave em Dó Maior (arpejo cristalino)', tag: 'Padrão' },
    { id: 'dinamico', nome: 'Alerta Dinâmico', desc: 'Bip duplo estilo radar/sonar de alta clareza', tag: 'Alerta' },
    { id: 'sino', nome: 'Sino Suave / Marimba', desc: 'Timbre acústico acolhedor, não invasivo', tag: 'Calmo' },
    { id: 'incisivo', nome: 'Incisivo / Alerta Urgente', desc: 'Frequência de atenção imediata para triagem rápida', tag: 'Urgência' },
    { id: 'mensagem', nome: 'Mensagem', desc: 'Dois toques curtos, estilo aplicativo de conversa', tag: 'Leve' },
    { id: 'reuniao', nome: 'Chime de Agenda', desc: 'O mesmo toque dos lembretes de reunião', tag: 'Agenda' },
  ];

  const gruposNavegacao = [
    {
      titulo: 'Configurações Básicas',
      descricao: 'Preferências do sistema, alertas sonoros e regras acessíveis ao suporte',
      abas: [
        {
          id: 'visualizacao',
          label: 'Aparência',
          badge: viewMode === 'cards' ? 'Cards' : viewMode === 'kanban' ? 'Kanban' : 'Lista',
          icon: viewMode === 'cards' ? <ViewGridIcon className="w-4 h-4" /> : <ViewListIcon className="w-4 h-4" />,
        },
        {
          id: 'audio',
          label: 'Alertas Sonoros',
          badge: audioConfig.habilitado ? 'Ativo' : 'Mudo',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ),
        },
        {
          id: 'agenda',
          label: 'Google Agenda & Alertas',
          badge: `${agendaConfig.minutosAntecedencia || 15}m antes`,
          icon: <CalendarIcon className="w-4 h-4" />,
        },
        {
          id: 'whatsapp',
          label: 'WhatsApp nas reuniões',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 8 19.4L3 21z" />
            </svg>
          ),
        },
        {
          id: 'regras_suporte',
          label: 'Regras de Atendimento & Senha',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ),
        },
      ],
    },
    {
      titulo: 'Configurações Avançadas',
      descricao: 'Gestão de departamentos, infraestrutura, servidores, equipe e conformidade',
      abas: [
        { id: 'comercial', label: 'Comercial e pipelines', icon: <CalendarIcon className="w-4 h-4" /> },
        { id: 'titulos_reuniao', label: 'Títulos das reuniões', icon: <CalendarIcon className="w-4 h-4" /> },
        {
          id: 'whatsapp_envio',
          label: 'WhatsApp da agenda',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 8 19.4L3 21z" />
            </svg>
          ),
        },
        {
          id: 'chat',
          label: 'Chat do WhatsApp',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 9h10M7 13h6" />
              <path d="M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 3.5V6a1 1 0 0 1 1-1z" />
            </svg>
          ),
        },
        {
          id: 'feedbacks',
          label: 'Feedbacks',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          ),
        },
        {
          id: 'departamentos',
          label: 'Departamentos',
          badge: `${categoriasDemandas.length}`,
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          ),
        },
        {
          id: 'canais',
          label: 'Canais de Atendimento',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
              <circle cx="12" cy="12" r="2" />
              <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
            </svg>
          ),
        },
        {
          id: 'servidores',
          label: 'Servidores & Equipe',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
              <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
            </svg>
          ),
        },
        {
          id: 'perfis',
          label: 'Perfis de acesso',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
          ),
        },
        {
          id: 'suporte_automatico',
          label: 'Suporte Automático (API)',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          ),
        },
        {
          id: 'auditoria',
          label: 'Auditoria & LGPD',
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          ),
        },
      ],
    },
  ];

  // Menu das configurações por assunto (os itens reaproveitam ícones e selos acima)
  const porId = Object.fromEntries(gruposNavegacao.flatMap((g) => g.abas).map((a) => [a.id, a]));
  const gestao = getGestaoAtual();
  porId.plataforma = {
    id: 'plataforma',
    label: gestao?.nivel === 'revenda' ? 'Revenda' : 'Plataforma',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M17.5 14v7M14 17.5h7" />
      </svg>
    ),
  };
  const ROTULOS_MENU = {
    visualizacao: 'Aparência',
    audio: 'Sons e alertas',
    regras_suporte: 'Regras e senha padrão',
    canais: 'Canais de atendimento',
    chat: 'Chat e grupos',
    whatsapp_envio: 'Mensagens da agenda',
    whatsapp: 'Minhas preferências',
    agenda: 'Google Agenda e lembretes',
    titulos_reuniao: 'Títulos das reuniões',
    comercial: 'Comercial e pipelines',
    perfis: 'Perfis de acesso',
    servidores: 'Servidores e equipe',
    suporte_automatico: 'Suporte automático (API)',
    auditoria: 'Auditoria e LGPD',
  };
  const BASICAS = ['visualizacao', 'audio', 'agenda', 'whatsapp', 'regras_suporte'];
  const categoriasMenu = [
    { id: 'geral', titulo: 'Geral', cor: 'bg-slate-500/12 text-slate-600 dark:text-zinc-300', ids: ['visualizacao', 'audio'] },
    { id: 'atendimento', titulo: 'Atendimento', cor: 'bg-amber-500/14 text-amber-700 dark:text-amber-300', ids: ['regras_suporte', 'departamentos', 'canais', 'feedbacks'] },
    { id: 'whatsapp', titulo: 'WhatsApp', cor: 'bg-rm-acento-medio/14 text-rm-acento dark:text-rm-acento-vivo', ids: ['chat', 'whatsapp_envio', 'whatsapp'] },
    { id: 'agenda', titulo: 'Agenda e Comercial', cor: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', ids: ['agenda', 'titulos_reuniao', 'comercial'] },
    { id: 'equipe', titulo: 'Equipe e acesso', cor: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', ids: ['perfis', 'servidores'] },
    { id: 'integracoes', titulo: 'Integrações', cor: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300', ids: ['suporte_automatico'] },
    { id: 'plataforma', titulo: 'Plataforma', cor: 'bg-rm-acento/12 text-rm-acento dark:text-rm-acento-vivo', ids: gestao ? ['plataforma'] : [] },
    { id: 'seguranca', titulo: 'Segurança', cor: 'bg-rose-500/12 text-rose-700 dark:text-rose-300', ids: ['auditoria'] },
  ]
    .map((c) => ({ ...c, itens: c.ids.filter((id) => porId[id] && (isAdmin || BASICAS.includes(id))).map((id) => ({ ...porId[id], rotulo: ROTULOS_MENU[id] || porId[id].label, categoria: c.titulo })) }))
    .filter((c) => c.itens.length);
  const itemAtual = categoriasMenu.flatMap((c) => c.itens).find((i) => i.id === subTab || (subTab === 'categorias_demandas' && i.id === 'departamentos'));

  const renderRestrictedNotice = (tituloSecao) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 sm:p-8 rounded-3xl border border-amber-500/25 bg-amber-500/10 dark:bg-amber-500/[0.08] text-amber-900 dark:text-amber-200 space-y-2.5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">🔒</span>
        <h4 className="font-bold text-sm tracking-tight">Acesso Restrito ao Administrador</h4>
      </div>
      <p className="text-xs opacity-90 leading-relaxed max-w-xl">
        A seção <strong>{tituloSecao}</strong> faz parte das Configurações Avançadas, exclusivas para administradores. O seu perfil ({ROTULOS_PAPEL[currentRole] || currentRole}) tem acesso às <strong>Configurações Básicas</strong>: Visualização do Sistema, Alertas Sonoros, Google Agenda e Regras de Atendimento.
      </p>
    </motion.div>
  );

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      <div className={`hidden lg:grid ${LINHA_TITULO}`}>
        <div />
        <EncaixeCabecalho />
      </div>

      <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        {/* Menu por categorias (no celular aparece primeiro; no computador fica ao lado) */}
        <nav aria-label="Seções das configurações" className={`${menuCelular ? 'block' : 'hidden'} lg:block lg:sticky lg:top-[calc(var(--rm-cabecalho,60px)+16px)] space-y-5`}>
          {categoriasMenu.map((cat) => (
            <section key={cat.id}>
              <h2 className="px-3 mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-zinc-500">{cat.titulo}</h2>
              <ul className="rounded-2xl lg:rounded-none bg-white lg:bg-transparent dark:bg-rm-cartao-escuro lg:dark:bg-transparent ring-1 ring-black/[0.06] dark:ring-white/[0.09] lg:ring-0 overflow-hidden lg:overflow-visible divide-y divide-black/[0.05] dark:divide-white/[0.06] lg:divide-y-0">
                {cat.itens.map((item) => {
                  const ativo = subTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSubTab(item.id);
                          setMenuCelular(false);
                          window.scrollTo({ top: 0, behavior: 'instant' });
                        }}
                        aria-current={ativo ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 px-3 h-12 lg:h-10 lg:rounded-xl text-left text-[14px] cursor-pointer transition-colors ${
                          ativo ? 'lg:bg-black/[0.06] lg:dark:bg-white/[0.1] font-semibold' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cat.cor}`}>{item.icon}</span>
                        <span className="flex-1 min-w-0 truncate">{item.rotulo}</span>
                        {item.badge && <span className="text-[11px] text-slate-400 dark:text-zinc-500 flex-shrink-0">{item.badge}</span>}
                        <svg className="w-4 h-4 text-slate-300 dark:text-zinc-600 flex-shrink-0 lg:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!isAdmin && <p className="px-3 text-[12px] text-slate-400 dark:text-zinc-500 leading-relaxed">As demais configurações são exclusivas de administradores.</p>}
        </nav>

        <div className={`${menuCelular ? 'hidden' : 'block'} lg:block min-w-0 space-y-6`}>
          <div className="flex items-center gap-2 text-[13px]">
            <button type="button" onClick={() => setMenuCelular(true)} className="lg:hidden h-9 pl-1.5 pr-3 -ml-1.5 rounded-full flex items-center gap-1 text-rm-acento dark:text-rm-acento-vivo font-medium cursor-pointer">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
              Configurações
            </button>
            {itemAtual && (
              <span className="hidden lg:inline text-slate-400 dark:text-zinc-500">
                {itemAtual.categoria} <span className="mx-1">›</span> <span className="text-slate-600 dark:text-zinc-300">{itemAtual.rotulo}</span>
              </span>
            )}
          </div>

      {/* BÁSICA 1: MODO DE VISUALIZAÇÃO PADRÃO DO SISTEMA */}
      {subTab === 'visualizacao' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <EscolhaPaleta />

          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-sm space-y-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Preferência de Interface
              </span>
              <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                Modo de Visualização Padrão do Sistema
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Escolha o formato prioritário de exibição para todas as telas do RM Controle (Empresas, Fila de Demandas, Dashboard e Credenciais). Ao selecionar uma opção, o sistema inteiro adotará essa preferência.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { id: 'list', titulo: 'Lista / Tabela', tag: 'Alta densidade de dados', Icone: ViewListIcon, desc: 'Cabeçalhos clicáveis para ordenar, muitos dados por linha e leitura rápida.' },
                { id: 'cards', titulo: 'Cards / Grade', tag: 'Visual em cartões', Icone: ViewGridIcon, desc: 'Cada registro num cartão, com as métricas em destaque.' },
                { id: 'kanban', titulo: 'Kanban', tag: 'Por estado', Icone: KanbanIcon, desc: 'Colunas por estado na Fila de Demandas e no Chat; nas outras telas, cards.' },
              ].map(({ id, titulo, tag, Icone, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleChangeViewMode(id)}
                  aria-pressed={viewMode === id}
                  className={`text-left p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 ${
                    viewMode === id ? 'border-rm-acento dark:border-rm-acento-escuro bg-rm-acento/[0.03] dark:bg-rm-acento-escuro/[0.05] shadow-xs' : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.01] hover:border-black/[0.15]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.08] flex items-center justify-center">
                        <Icone className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">{titulo}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">{tag}</span>
                      </div>
                    </div>
                    {viewMode === id && (
                      <span className="w-5 h-5 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-black flex items-center justify-center">
                        <CheckIcon className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* BÁSICA 2: ALERTAS SONOROS */}
      {subTab === 'audio' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <SonsModulos departamentos={categoriasDemandas} />
        </motion.div>
      )}

      {/* BÁSICA: GOOGLE AGENDA & ALERTAS DE REUNIÃO */}
      {subTab === 'agenda' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {/* Sincronização bidirecional pelo servidor (Google Workspace) */}
          <GoogleAgendaSync />

          {/* Card 1: Formulário Principal de Integração */}
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-mono">
                    Google Calendar Integration
                  </span>
                </div>
                <h3 className="text-xl font-bold text-[#1d1d1f] dark:text-white">
                  Integração com Google Agenda & Alertas
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                  Conecte sua agenda do Google para receber notificações sonoras prévias de reuniões, visualizar compromissos ao vivo e evitar esquecimentos operacionais.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleTestarSomAgenda}
                  disabled={agendaSomTocando}
                  className="px-4 py-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-xs font-semibold text-slate-700 dark:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                  title="Testar toque acústico de reunião"
                >
                  <span>🔔</span>
                  <span>{agendaSomTocando ? 'Tocando...' : 'Testar Som de Reunião'}</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSalvarAgendaConfig} className="space-y-5 text-xs">
              {/* ID da Agenda & Visualização Padrão */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-800 dark:text-zinc-200">
                    ID da Agenda Google <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={agendaConfig.calendarId || ''}
                    onChange={(e) => setAgendaConfigState({ ...agendaConfig, calendarId: e.target.value.trim() })}
                    placeholder="Ex: suporte@rmchat.com.br"
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento/20"
                  />
                  <p className="text-[11px] text-slate-400">
                    Geralmente o e-mail proprietário da agenda Google (ex: suporte@rmchat.com.br).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-800 dark:text-zinc-200">
                    Modo Padrão ao Abrir a Aba Agenda
                  </label>
                  <select
                    value={agendaConfig.visualizacaoPadrao || 'nativa'}
                    onChange={(e) => setAgendaConfigState({ ...agendaConfig, visualizacaoPadrao: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento/20 cursor-pointer"
                  >
                    <option value="nativa" className="dark:bg-rm-cartao-escuro">Visão Semanal Nativa Apple / RM Controle (Recomendado)</option>
                    <option value="embed" className="dark:bg-rm-cartao-escuro">Visão Google Calendar Embutida (iFrame Oficial)</option>
                  </select>
                  <p className="text-[11px] text-slate-400">
                    A visão nativa permite cronômetros, contagem regressiva e alertas com som.
                  </p>
                </div>
              </div>

              {/* URL iCal (.ics) */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-800 dark:text-zinc-200">
                  Endereço Público no Formato iCal (.ics)
                </label>
                <input
                  type="url"
                  value={agendaConfig.urlIcal || ''}
                  onChange={(e) => setAgendaConfigState({ ...agendaConfig, urlIcal: e.target.value.trim() })}
                  placeholder="https://calendar.google.com/calendar/ical/suporte%40rmchat.com.br/public/basic.ics"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento/20"
                />
                <p className="text-[11px] text-slate-400">
                  Obtido em: Google Agenda → Configurações da Agenda → Integrar agenda → "Endereço público no formato iCal".
                </p>
              </div>

              {/* URL de Incorporação (Embed / iframe) */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-800 dark:text-zinc-200">
                  URL de Incorporação Pública (Embed)
                </label>
                <input
                  type="url"
                  value={agendaConfig.urlEmbed || ''}
                  onChange={(e) => setAgendaConfigState({ ...agendaConfig, urlEmbed: e.target.value.trim() })}
                  placeholder="https://calendar.google.com/calendar/embed?src=suporte%40rmchat.com.br&ctz=America%2FFortaleza"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento/20"
                />
                <p className="text-[11px] text-slate-400">
                  Utilizada na aba "Google Agenda (Ao Vivo)" para exibir o calendário completo dentro do RM Controle.
                </p>
              </div>

              {/* Regras de Alerta & Antecedência */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-black/[0.04] dark:border-white/[0.09]">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-800 dark:text-zinc-200">
                    Antecedência do Alerta Sonoro
                  </label>
                  <select
                    value={agendaConfig.minutosAntecedencia || 15}
                    onChange={(e) => setAgendaConfigState({ ...agendaConfig, minutosAntecedencia: parseInt(e.target.value, 10) })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento/20 cursor-pointer"
                  >
                    <option value={5} className="dark:bg-rm-cartao-escuro">5 minutos antes da reunião</option>
                    <option value={10} className="dark:bg-rm-cartao-escuro">10 minutos antes da reunião</option>
                    <option value={15} className="dark:bg-rm-cartao-escuro">15 minutos antes da reunião (Recomendado)</option>
                    <option value={30} className="dark:bg-rm-cartao-escuro">30 minutos antes da reunião</option>
                    <option value={60} className="dark:bg-rm-cartao-escuro">1 hora antes da reunião</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-800 dark:text-zinc-200">
                    Escopo das Notificações
                  </label>
                  <select
                    value={agendaConfig.notificarEscopo || 'proprias'}
                    onChange={(e) => setAgendaConfigState({ ...agendaConfig, notificarEscopo: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento/20 cursor-pointer"
                  >
                    <option value="proprias" className="dark:bg-rm-cartao-escuro">Apenas reuniões atribuídas a mim (Operador)</option>
                    <option value="todas" className="dark:bg-rm-cartao-escuro">Todas as reuniões da equipe (Gestor / Diretoria)</option>
                  </select>
                </div>
              </div>

              {/* Botão Salvar */}
              <div className="flex items-center justify-between pt-3 border-t border-black/[0.04] dark:border-white/[0.09]">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    Os alertas tocam no navegador com som harmônico e disparam aviso visual com link direto do Meet.
                  </span>
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-2xl bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <SaveIcon className="w-3.5 h-3.5" />
                  <span>{agendaSalva ? 'Configurações Salvas!' : 'Salvar Configurações da Agenda'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Guia Técnico de Integração e Sincronização */}
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro space-y-4 shadow-sm text-xs">
            <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white flex items-center gap-2">
              <span>📖 Como Obter os Links no seu Google Agenda</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-600 dark:text-zinc-300">
              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.09] space-y-1.5">
                <span className="font-bold text-blue-600 dark:text-blue-400 block font-mono">1. Endereço iCal (.ics)</span>
                <p className="leading-relaxed text-[11px] text-slate-500 dark:text-zinc-400">
                  No Google Agenda, vá em <strong>Configurações da agenda</strong> → clique na agenda desejada (ex: Pedro Alvarez) → role até <strong>Integrar agenda</strong> → copie o campo <strong>"Endereço público no formato iCal"</strong>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.09] space-y-1.5">
                <span className="font-bold text-purple-600 dark:text-purple-400 block font-mono">2. Visualização Embed</span>
                <p className="leading-relaxed text-[11px] text-slate-500 dark:text-zinc-400">
                  No mesmo bloco <strong>Integrar agenda</strong>, copie a <strong>URL pública para essa agenda</strong> ou o atributo <code>src="..."</code> do campo <strong>Incorporar código</strong>. Ela permite ver o calendário oficial ao vivo na aba Agenda.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.09] space-y-1.5">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block font-mono">3. Sincronização Total 2-Vias (API)</span>
                <p className="leading-relaxed text-[11px] text-slate-500 dark:text-zinc-400">
                  Para que alterações feitas no RM Controle salvem no Google e vice-versa sem delay, o Google exige credenciais de API (Google Cloud Console → Habilitar <strong>Google Calendar API</strong> → Criar OAuth 2.0 Client ID ou Service Account).
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* BÁSICA 3: CATEGORIAS DE DEMANDAS */}
      {(subTab === 'departamentos' || subTab === 'categorias_demandas') && !isAdmin && renderRestrictedNotice('Departamentos')}

      {(subTab === 'departamentos' || subTab === 'categorias_demandas') && isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-sm space-y-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Segmentação Operacional
              </span>
              <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                Departamentos da Central
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Cadastre e gerencie os departamentos operacionais da empresa (ex: Suporte, Financeiro, Automação, Implantação, Feedback / Bug RM). Essas categorias ficam disponíveis para seleção na abertura de demandas, na Fila e nos filtros do Dashboard.
              </p>
            </div>

            {/* Formulário de Adicionar Categoria */}
            <form onSubmit={handleAdicionarCategoria} className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="text"
                value={novaCategoriaInput}
                onChange={(e) => setNovaCategoriaInput(e.target.value)}
                placeholder="Nome do novo departamento (ex: Financeiro, Suporte, Automação)..."
                className="flex-1 px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rm-acento/20"
              />
              <button
                type="submit"
                className="px-6 py-2.5 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>+ Adicionar Departamento</span>
              </button>
            </form>

            {/* Lista de Categorias Atuais */}
            <div className="space-y-2 pt-2 border-t border-black/[0.05] dark:border-white/[0.09]">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-zinc-200">
                <span>Departamentos Cadastrados ({categoriasDemandas.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">Disponíveis em todo o sistema</span>
              </div>

              {categoriasDemandas.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4">Nenhuma categoria cadastrada.</p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {categoriasDemandas.map((cat) => (
                    <div
                      key={cat}
                      className="px-3.5 py-1.5 rounded-full bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2 shadow-2xs group"
                    >
                      <span>{cat}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoverCategoria(cat)}
                        className="text-slate-400 hover:text-red-500 rounded-full p-0.5 transition-colors cursor-pointer"
                        title={`Remover categoria ${cat}`}
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* BÁSICA 4: REGRAS DE ATENDIMENTO & SENHA PADRÃO */}
      {subTab === 'regras_suporte' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro space-y-4 shadow-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Acesso do Suporte
              </span>
              <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                Senha Padrão de Contingência
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Utilizada pela equipe de suporte para redefinir rapidamente acessos de clientes ou colaboradores sem senha específica cadastrada.
              </p>
            </div>

            <form onSubmit={handleSalvarSenhaPadrao} className="space-y-3 max-w-xl">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={senhaPadrao}
                  onChange={(e) => setSenhaPadrao(e.target.value)}
                  placeholder="Ex: RmSuporte#2026"
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-rm-acento/20"
                />
                <button
                  type="button"
                  onClick={() => setSenhaPadrao(generateSecurePassword(12))}
                  className="px-3 py-2 rounded-2xl border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1 cursor-pointer"
                  title="Gerar senha aleatória segura"
                >
                  <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Gerar</span>
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-2xl bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <SaveIcon className="w-3.5 h-3.5" />
                  <span>{senhaSalva ? 'Salvo!' : 'Salvar'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro space-y-4 shadow-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rm-acento dark:text-rm-acento-escuro">
                Validação de Atendimento
              </span>
              <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                Campos Obrigatórios na Conclusão de Chamados
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Configure os campos exigidos dos operadores antes de finalizar qualquer atendimento na Fila de Demandas.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {[
                { campo: 'motivo_obrigatorio', titulo: 'Motivo Diagnosticado', desc: 'Exige classificar a causa do atendimento' },
                { campo: 'solucao_obrigatoria', titulo: 'Resumo da Solução Aplicada', desc: 'Exige descrever o procedimento adotado' },
                { campo: 'colaborador_obrigatorio', titulo: 'Colaborador Solicitante', desc: 'Exige vincular quem acionou o chamado na empresa' },
                { campo: 'atendente_obrigatorio', titulo: 'Nome do Atendente', desc: 'Exige informar o técnico responsável pela conclusão' },
              ].map((item) => {
                const ativo = configSuporte[item.campo];
                return (
                  <div
                    key={item.campo}
                    onClick={() => handleToggleRegraSuporte(item.campo)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                      ativo
                        ? 'border-rm-acento dark:border-rm-acento-escuro bg-rm-acento/5 dark:bg-rm-acento-escuro/10'
                        : 'border-black/[0.06] dark:border-white/[0.11] bg-black/[0.01] hover:border-black/20'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                        {item.titulo}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-snug">
                        {item.desc}
                      </p>
                    </div>

                    <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      ativo
                        ? 'bg-rm-acento text-white dark:bg-rm-acento-escuro dark:text-zinc-950'
                        : 'bg-black/[0.05] dark:bg-white/[0.1] text-slate-400'
                    }`}>
                      {ativo ? <CheckIcon className="w-3 h-3" /> : '○'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card: Monitoramento de Tempos Operacionais (Saudável, Intermediário e Crítico) */}
          <div className="p-6 rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-xs space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-mono">
                Monitoramento Operacional & Níveis de Tempo
              </span>
              <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                Faixas de Tempo de Espera & Atendimento
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Configure os limites de minutos que definem os estados <strong>Saudável</strong>, <strong>Intermediário</strong> e <strong>Crítico</strong>. Ao atingir o nível crítico, alertas visuais e sonoros serão disparados para a equipe.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Nível Saudável */}
              <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Tempo Saudável</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Até quantos minutos o atendimento é considerado ideal:</p>
                <select
                  value={configSuporte.tempo_saudavel_minutos || 10}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const novo = setConfiguracoesSuporte({ ...configSuporte, tempo_saudavel_minutos: v });
                    setConfigSuporteState(novo);
                    showToast(`Tempo saudável ajustado para ${v} min.`, 'success');
                  }}
                  className="w-full px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value={5}>Até 5 minutos</option>
                  <option value={10}>Até 10 minutos (Padrão)</option>
                  <option value={15}>Até 15 minutos</option>
                </select>
              </div>

              {/* Nível Intermediário */}
              <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Tempo Intermediário</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Limite de atenção antes de se tornar crítico:</p>
                <select
                  value={configSuporte.tempo_intermediario_minutos || 20}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const novo = setConfiguracoesSuporte({ ...configSuporte, tempo_intermediario_minutos: v });
                    setConfigSuporteState(novo);
                    showToast(`Tempo intermediário ajustado para ${v} min.`, 'success');
                  }}
                  className="w-full px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value={15}>Até 15 minutos</option>
                  <option value={20}>Até 20 minutos (Padrão)</option>
                  <option value={25}>Até 25 minutos</option>
                  <option value={30}>Até 30 minutos</option>
                </select>
              </div>

              {/* Nível Crítico */}
              <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-800 dark:text-rose-300">Tempo Crítico (Alerta)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Dispara alerta sonoro e visual para a gestão:</p>
                <select
                  value={configSuporte.tempo_critico_minutos || 30}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const novo = setConfiguracoesSuporte({ ...configSuporte, tempo_critico_minutos: v });
                    setConfigSuporteState(novo);
                    showToast(`Tempo crítico ajustado para ${v} min.`, 'success');
                  }}
                  className="w-full px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value={20}>Acima de 20 minutos</option>
                  <option value={25}>Acima de 25 minutos</option>
                  <option value={30}>Acima de 30 minutos (Padrão)</option>
                  <option value={45}>Acima de 45 minutos</option>
                  <option value={60}>Acima de 60 minutos</option>
                </select>
              </div>
            </div>
          </div>
          {/* Card: URLs de Acesso aos Servidores (Servidor 1 e Servidor 2) */}
          <div className="p-6 rounded-3xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-xs space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
                Redirecionamento Rápido de Suporte
              </span>
              <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                URLs de Acesso aos Servidores (Servidor 1 e Servidor 2)
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Configure os links dos ambientes de produção. Na tela inicial da empresa, o suporte poderá clicar diretamente para abrir o servidor correspondente em uma nova aba do navegador.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Servidor 1 */}
              <div className="p-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.11] bg-black/[0.015] dark:bg-white/[0.02] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">Servidor 1 (Principal)</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <input
                  type="url"
                  placeholder="https://acesso.suaempresa.com.br"
                  value={servidoresConfig.servidor_1_url || ''}
                  onChange={(e) => setServidoresConfigState({ ...servidoresConfig, servidor_1_url: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none"
                />
              </div>

              {/* Servidor 2 */}
              <div className="p-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.11] bg-black/[0.015] dark:bg-white/[0.02] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">Servidor 2 (Secundário)</span>
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                </div>
                <input
                  type="url"
                  placeholder="https://acesso2.suaempresa.com.br"
                  value={servidoresConfig.servidor_2_url || ''}
                  onChange={(e) => setServidoresConfigState({ ...servidoresConfig, servidor_2_url: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await setServidoresConfig(servidoresConfig);
                    showToast('URLs dos servidores salvas para toda a equipe.', 'success');
                  } catch (err) {
                    showToast(err.message, 'error');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-rm-acento/20 hover:opacity-95 transition-all cursor-pointer"
              >
                Salvar URLs dos Servidores
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* AVANÇADA 1: CANAIS DE ATENDIMENTO */}
      {subTab === 'canais' && (
        isAdmin ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChannelsManagement userEmail={userEmail} />
          </motion.div>
        ) : (
          renderRestrictedNotice('Canais de Atendimento')
        )
      )}

      {/* AVANÇADA 2: SERVIDORES & EQUIPE */}
      {subTab === 'servidores' && (
        isAdmin ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ServerConfigView />
          </motion.div>
        ) : (
          renderRestrictedNotice('Servidores & Equipe')
        )
      )}

      {subTab === 'comercial' && (isAdmin ? <ComercialSettings /> : renderRestrictedNotice('Comercial'))}

      {subTab === 'titulos_reuniao' && (isAdmin ? <TitulosReuniaoSettings /> : renderRestrictedNotice('Títulos das reuniões'))}

      {subTab === 'feedbacks' && (isAdmin ? <FeedbacksSettings /> : renderRestrictedNotice('Feedbacks'))}
      {subTab === 'chat' && (isAdmin ? <ChatSettings /> : renderRestrictedNotice('Chat do WhatsApp'))}

      {subTab === 'whatsapp' && <PreferenciasWhatsapp />}

      {subTab === 'whatsapp_envio' && (isAdmin ? <WhatsappAgendaSettings /> : renderRestrictedNotice('WhatsApp da agenda'))}

      {/* AVANÇADA: PERFIS DE ACESSO */}
      {subTab === 'perfis' && (isAdmin ? <PerfisAcessoView /> : renderRestrictedNotice('Perfis de acesso'))}

      {/* AVANÇADA 3: AUDITORIA & LGPD */}
      {subTab === 'suporte_automatico' && (
        isAdmin ? <SupportIntegrationSettings /> : renderRestrictedNotice('Suporte Automático (API)')
      )}

      {subTab === 'auditoria' && (
        isAdmin ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AuditLogsView userEmail={userEmail} />
          </motion.div>
        ) : (
          renderRestrictedNotice('Auditoria & LGPD')
        )
      )}

      {subTab === 'plataforma' && (getGestaoAtual() ? <PlataformaView /> : renderRestrictedNotice('Plataforma'))}
        </div>
      </div>
    </div>
  );
}
