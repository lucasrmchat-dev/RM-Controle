'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAudioConfig, setAudioConfig, playNotificationTone } from '@/lib/audioNotifications';
import { 
  getDefaultViewMode, 
  setDefaultViewMode,
  getSenhaPadraoRedefinicao,
  setSenhaPadraoRedefinicao,
  getConfiguracoesSuporte,
  setConfiguracoesSuporte,
  getCategoriasDemandas,
  addCategoriaDemanda,
  removeCategoriaDemanda,
  resolveUserRole
} from '@/lib/storage';
import { generateSecurePassword } from '@/lib/security';
import ChannelsManagement from './ChannelsManagement';
import ServerConfigView from './ServerConfigView';
import AuditLogsView from './AuditLogsView';
import { 
  SparklesIcon, 
  SaveIcon, 
  CheckIcon, 
  ViewGridIcon, 
  ViewListIcon,
  ShieldCheckIcon,
  WrenchIcon,
  XMarkIcon
} from './Icons';
import { showToast } from './ToastNotification';

export default function GeneralSettingsView({ userEmail, initialSubTab = 'visualizacao' }) {
  const [subTab, setSubTab] = useState(initialSubTab);
  const currentRole = resolveUserRole(userEmail);
  const isAdmin = currentRole === 'administrador';

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
  const [configSuporte, setConfigSuporteState] = useState({
    motivo_obrigatorio: true,
    solucao_obrigatoria: false,
    colaborador_obrigatorio: false,
    atendente_obrigatorio: false,
  });

  // 4. Categorias de Demandas
  const [categoriasDemandas, setCategoriasDemandasState] = useState([]);
  const [novaCategoriaInput, setNovaCategoriaInput] = useState('');

  useEffect(() => {
    setViewModeState(getDefaultViewMode());
    setAudioState(getAudioConfig());
    setSenhaPadrao(getSenhaPadraoRedefinicao());
    setConfigSuporteState(getConfiguracoesSuporte());
    setCategoriasDemandasState(getCategoriasDemandas());

    const handleAudioUpdate = () => setAudioState(getAudioConfig());
    const handleViewModeUpdate = (e) => setViewModeState(e.detail || getDefaultViewMode());
    const handleCatsUpdate = () => setCategoriasDemandasState(getCategoriasDemandas());

    window.addEventListener('rm_audio_config_updated', handleAudioUpdate);
    window.addEventListener('rm_default_view_mode_updated', handleViewModeUpdate);
    window.addEventListener('categorias_demandas_updated', handleCatsUpdate);

    return () => {
      window.removeEventListener('rm_audio_config_updated', handleAudioUpdate);
      window.removeEventListener('rm_default_view_mode_updated', handleViewModeUpdate);
      window.removeEventListener('categorias_demandas_updated', handleCatsUpdate);
    };
  }, []);

  const handleChangeViewMode = (mode) => {
    setDefaultViewMode(mode);
    setViewModeState(mode);
    showToast(`Visualização do sistema definida para ${mode === 'cards' ? 'Cards' : 'Lista'} por padrão.`, 'success');
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

  const opcoesSons = [
    { id: 'harmonico', nome: 'Harmônico Apple', desc: 'Acorde suave em Dó Maior (arpejo cristalino)', tag: 'Padrão' },
    { id: 'dinamico', nome: 'Alerta Dinâmico', desc: 'Bip duplo estilo radar/sonar de alta clareza', tag: 'Alerta' },
    { id: 'sino', nome: 'Sino Suave / Marimba', desc: 'Timbre acústico acolhedor, não invasivo', tag: 'Calmo' },
    { id: 'incisivo', nome: 'Incisivo / Alerta Urgente', desc: 'Frequência de atenção imediata para triagem rápida', tag: 'Urgência' },
  ];

  const gruposNavegacao = [
    {
      titulo: 'Configurações Básicas',
      descricao: 'Preferências do sistema, alertas, categorias e regras acessíveis ao suporte',
      abas: [
        {
          id: 'visualizacao',
          label: 'Visualização do Sistema',
          badge: viewMode === 'cards' ? 'Cards' : 'Lista',
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
          id: 'categorias_demandas',
          label: 'Categorias de Demandas',
          badge: `${categoriasDemandas.length}`,
          icon: (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4 6h16M4 12h16M4 18h7" />
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
      descricao: 'Gestão de infraestrutura, servidores, equipe e conformidade',
      abas: [
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
        A seção <strong>{tituloSecao}</strong> é exclusiva para administradores da infraestrutura. O seu perfil ({currentRole}) possui acesso total às <strong>Configurações Básicas</strong> (Visualização do Sistema, Alertas Sonoros, Categorias de Demandas e Regras de Atendimento).
      </p>
    </motion.div>
  );

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Cabeçalho Unificado de Configurações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#4d7c0f] dark:text-[#84cc16] px-2.5 py-0.5 rounded-full bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 border border-[#4d7c0f]/20 inline-block mb-1.5">
            Painel Central do Sistema
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] dark:text-white">
            Configurações Gerais
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Gerencie modo de visualização, alertas sonoros, categorias de demandas, servidores e auditoria.
          </p>
        </div>
      </div>

      {/* Setorização em Configurações Básicas e Avançadas */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gruposNavegacao.map((grp, idx) => (
            <div
              key={idx}
              className="p-4 sm:p-5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-3 shadow-xs"
            >
              <div className="border-b border-black/[0.04] dark:border-white/[0.05] pb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-1 ${
                  idx === 0 
                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                    : 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20'
                }`}>
                  {grp.titulo}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {grp.descricao}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {grp.abas.map((tab) => {
                  const isSel = subTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSubTab(tab.id)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                        isSel
                          ? 'text-white bg-black dark:bg-white dark:text-black shadow-sm font-bold'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06]'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {tab.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                          isSel
                            ? 'bg-white/20 text-white dark:bg-black/20 dark:text-black'
                            : 'bg-black/[0.06] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300'
                        }`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BÁSICA 1: MODO DE VISUALIZAÇÃO PADRÃO DO SISTEMA */}
      {subTab === 'visualizacao' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-5">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => handleChangeViewMode('list')}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 ${
                  viewMode === 'list'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/[0.03] dark:bg-[#84cc16]/[0.05] shadow-xs'
                    : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.01] hover:border-black/[0.15]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.08] flex items-center justify-center">
                      <ViewListIcon className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                        Visualização em Lista / Tabela
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">Alta densidade de dados</span>
                    </div>
                  </div>
                  {viewMode === 'list' && (
                    <span className="w-5 h-5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-black flex items-center justify-center">
                      <CheckIcon className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Ideal para operadores e monitoramento contínuo: cabeçalhos clicáveis para ordenação alfabética, múltiplos dados em linha e rapidez na leitura.
                </p>
              </div>

              <div
                onClick={() => handleChangeViewMode('cards')}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 ${
                  viewMode === 'cards'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/[0.03] dark:bg-[#84cc16]/[0.05] shadow-xs'
                    : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.01] hover:border-black/[0.15]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.08] flex items-center justify-center">
                      <ViewGridIcon className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                        Visualização em Cards / Grade
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">Layout visual imersivo</span>
                    </div>
                  </div>
                  {viewMode === 'cards' && (
                    <span className="w-5 h-5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-black flex items-center justify-center">
                      <CheckIcon className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Apresenta cada registro em cartões elegantes com métricas visuais em destaque.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* BÁSICA 2: ALERTAS SONOROS */}
      {subTab === 'audio' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  Notificações em Tempo Real
                </span>
                <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                  Toques Sonoros da Fila de Demandas
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                  Emite alertas sonoros através da API de Áudio do navegador sempre que uma nova demanda entrar na fila de espera, garantindo resposta rápida aos clientes.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={audioConfig.habilitado}
                  onChange={(e) => setAudioState({ ...audioConfig, habilitado: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-zinc-600 peer-checked:bg-[#4d7c0f] dark:peer-checked:bg-[#84cc16]"></div>
              </label>
            </div>
          </div>

          {audioConfig.habilitado && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Escopo */}
                <div className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                      Escopo das Notificações
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Defina quando o som deve ser disparado para o seu usuário.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[
                      { id: 'todos', titulo: 'Qualquer Demanda na Fila', desc: 'Toca quando qualquer cliente solicitar demanda na central' },
                      { id: 'atribuidos', titulo: 'Apenas Demandas Atribuídas a Mim', desc: 'Toca exclusivamente quando a demanda estiver direcionada ao seu e-mail' },
                    ].map((item) => (
                      <label
                        key={item.id}
                        onClick={() => setAudioState({ ...audioConfig, escopo: item.id })}
                        className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                          audioConfig.escopo === item.id
                            ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10'
                            : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/20'
                        }`}
                      >
                        <input
                          type="radio"
                          name="audio_escopo"
                          checked={audioConfig.escopo === item.id}
                          onChange={() => setAudioState({ ...audioConfig, escopo: item.id })}
                          className="mt-0.5 text-[#4d7c0f] focus:ring-[#4d7c0f]"
                        />
                        <div>
                          <span className="text-xs font-bold text-[#1d1d1f] dark:text-white block">
                            {item.titulo}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight block mt-0.5">
                            {item.desc}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Modo de Repetição com Intermitente */}
                <div className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                      Modo de Repetição do Alerta
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Decida se o alerta deve tocar uma única vez, de forma intermitente ou por intervalo.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[
                      { id: 'uma_vez', titulo: 'Tocar uma única vez', desc: 'Emite o toque sonoro apenas no instante de entrada do chamado' },
                      { id: 'intermitente', titulo: 'Repetir em Modo Intermitente (Sem Pausas)', desc: 'Toca continuamente sem parar logo após cada repetição até ser atendido' },
                      { id: 'intervalo', titulo: 'Repetir com Intervalo de Tempo', desc: 'Repete o alerta sonoro em intervalos regulares até o chamado ser aceito' },
                    ].map((item) => (
                      <label
                        key={item.id}
                        onClick={() => setAudioState({ ...audioConfig, modoRepeticao: item.id })}
                        className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                          audioConfig.modoRepeticao === item.id
                            ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10'
                            : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/20'
                        }`}
                      >
                        <input
                          type="radio"
                          name="audio_modo"
                          checked={audioConfig.modoRepeticao === item.id}
                          onChange={() => setAudioState({ ...audioConfig, modoRepeticao: item.id })}
                          className="mt-0.5 text-[#4d7c0f] focus:ring-[#4d7c0f]"
                        />
                        <div>
                          <span className="text-xs font-bold text-[#1d1d1f] dark:text-white block">
                            {item.titulo}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight block mt-0.5">
                            {item.desc}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>

                  {audioConfig.modoRepeticao === 'intervalo' && (
                    <div className="pt-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1.5">
                        Intervalo de Repetição: {audioConfig.intervaloSegundos || 30} segundos
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="120"
                        step="5"
                        value={audioConfig.intervaloSegundos || 30}
                        onChange={(e) => setAudioState({ ...audioConfig, intervaloSegundos: parseInt(e.target.value, 10) })}
                        className="w-full accent-[#4d7c0f] dark:accent-[#84cc16]"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                        <span>5s (imediato)</span>
                        <span>30s (recomendado)</span>
                        <span>120s (espaçado)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Timbre do Alerta Sonoro */}
                <div className="lg:col-span-2 rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                        Timbre do Alerta Sonoro
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Escolha a frequência acústica que melhor se adapta à rotina da sua equipe.
                      </p>
                    </div>

                    <button
                      onClick={() => handleTestarSom(audioConfig.tipoSom)}
                      disabled={somTocando}
                      className="px-4 py-2 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] text-xs font-semibold text-slate-800 dark:text-zinc-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>{somTocando ? 'Reproduzindo...' : 'Testar Som Atual'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {opcoesSons.map((som) => {
                      const isSel = audioConfig.tipoSom === som.id;
                      return (
                        <div
                          key={som.id}
                          onClick={() => {
                            setAudioState({ ...audioConfig, tipoSom: som.id });
                            handleTestarSom(som.id);
                          }}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 flex flex-col justify-between ${
                            isSel
                              ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 shadow-sm'
                              : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/20 bg-black/[0.01]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-700 dark:text-zinc-300">
                              {som.tag}
                            </span>
                            {isSel && (
                              <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]"></span>
                            )}
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                              {som.nome}
                            </h5>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-tight">
                              {som.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botão de Salvar Alterações de Alerta Sonoro */}
              <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#16161a] border border-black/[0.08] dark:border-white/[0.1] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-[#4d7c0f] dark:text-[#84cc16]" />
                  <span className="text-xs text-slate-600 dark:text-zinc-300">
                    Clique em <strong>Salvar Alterações</strong> para aplicar a configuração no seu perfil.
                  </span>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleTestarSom(audioConfig.tipoSom)}
                    disabled={somTocando}
                    className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Testar Som
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={handleSalvarAudioConfig}
                    className="px-6 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                    <span>Salvar Alterações de Alerta Sonoro</span>
                  </motion.button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* BÁSICA 3: CATEGORIAS DE DEMANDAS */}
      {subTab === 'categorias_demandas' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Segmentação Operacional
              </span>
              <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                Categorias de Demandas & Chamados
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Cadastre as áreas e tipos de atendimento da empresa (ex: Suporte, Financeiro, Automação, Implantação). Essas categorias ficam disponíveis para seleção na abertura de demandas, na Fila e nos filtros do Dashboard.
              </p>
            </div>

            {/* Formulário de Adicionar Categoria */}
            <form onSubmit={handleAdicionarCategoria} className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="text"
                value={novaCategoriaInput}
                onChange={(e) => setNovaCategoriaInput(e.target.value)}
                placeholder="Nome da nova categoria (ex: Financeiro, Automação, Implantação)..."
                className="flex-1 px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
              />
              <button
                type="submit"
                className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>+ Adicionar Categoria</span>
              </button>
            </form>

            {/* Lista de Categorias Atuais */}
            <div className="space-y-2 pt-2 border-t border-black/[0.05] dark:border-white/[0.06]">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-zinc-200">
                <span>Categorias Cadastradas ({categoriasDemandas.length})</span>
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
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
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
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
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
                  className="px-5 py-2.5 rounded-2xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <SaveIcon className="w-3.5 h-3.5" />
                  <span>{senhaSalva ? 'Salvo!' : 'Salvar'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d7c0f] dark:text-[#84cc16]">
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
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10'
                        : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] hover:border-black/20'
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
                        ? 'bg-[#4d7c0f] text-white dark:bg-[#84cc16] dark:text-zinc-950'
                        : 'bg-black/[0.05] dark:bg-white/[0.1] text-slate-400'
                    }`}>
                      {ativo ? <CheckIcon className="w-3 h-3" /> : '○'}
                    </span>
                  </div>
                );
              })}
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

      {/* AVANÇADA 3: AUDITORIA & LGPD */}
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

    </div>
  );
}
