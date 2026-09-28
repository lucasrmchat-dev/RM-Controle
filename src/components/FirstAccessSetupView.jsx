'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playNotificationTone } from '@/lib/audioNotifications';
import { 
  CheckIcon, 
  ViewGridIcon, 
  ViewListIcon, 
  SparklesIcon, 
  ShieldCheckIcon,
  EyeIcon, 
  EyeOffIcon,
  ClockIcon
} from './Icons';
import { showToast } from './ToastNotification';

export default function FirstAccessSetupView({
  userEmail,
  userName = '',
  onConcluido,
  onLogout,
  theme = 'light',
  onToggleTheme,
}) {
  // Passos: 1 = Boas-vindas, 2 = Redefinir Senha, 3 = Alertas Sonoros, 4 = Visualização, 5 = Conclusão
  const [etapa, setEtapa] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Etapa 2: Redefinição de Senha
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false);

  // Etapa 3: Alertas Sonoros
  const [audioConfig, setAudioConfig] = useState({
    habilitado: true,
    tipoSom: 'harmonico',
    modoRepeticao: 'intermitente',
    intervaloSegundos: 30,
    escopo: 'todos',
  });
  const [somTocando, setSomTocando] = useState(false);

  // Etapa 4: Modo de Visualização do Sistema
  const [viewMode, setViewMode] = useState('list');

  // Validação em Tempo Real das Regras de Senha (LGPD & Segurança Bancária)
  const temOitoDigitos = novaSenha.length >= 8;
  const temMaiuscula = /[A-Z]/.test(novaSenha);
  const temMinuscula = /[a-z]/.test(novaSenha);
  const temNumero = /[0-9]/.test(novaSenha);
  const temEspecial = /[^A-Za-z0-9\s]/.test(novaSenha);
  const senhasConferem = novaSenha.length > 0 && novaSenha === confirmarSenha;

  const todasRegrasAtendidas = 
    temOitoDigitos && 
    temMaiuscula && 
    temMinuscula && 
    temNumero && 
    temEspecial && 
    senhasConferem;

  // Cálculo da Força da Senha
  const criteriosAtendidos = [temOitoDigitos, temMaiuscula, temMinuscula, temNumero, temEspecial].filter(Boolean).length;
  const forcaSenhaLabel = criteriosAtendidos <= 2 ? 'Fraca' : criteriosAtendidos <= 4 ? 'Boa' : 'Excelente';
  const forcaSenhaColor = criteriosAtendidos <= 2 ? 'bg-red-500' : criteriosAtendidos <= 4 ? 'bg-amber-500' : 'bg-emerald-500';

  const nomeExibicao = (userName || userEmail?.split('@')[0] || 'Colaborador')
    .split(' ')[0]
    .replace(/^./, (c) => c.toUpperCase());

  const opcoesSons = [
    { id: 'harmonico', nome: 'Harmônico Apple', desc: 'Acorde suave em Dó Maior (arpejo cristalino)', tag: 'Padrão' },
    { id: 'dinamico', nome: 'Alerta Dinâmico', desc: 'Bip duplo estilo radar/sonar de alta clareza', tag: 'Alerta' },
    { id: 'sino', nome: 'Sino Suave / Marimba', desc: 'Timbre acústico acolhedor, não invasivo', tag: 'Calmo' },
    { id: 'incisivo', nome: 'Incisivo / Alerta Urgente', desc: 'Frequência de atenção imediata para triagem rápida', tag: 'Urgência' },
  ];

  const handleTestarSom = (somId) => {
    setSomTocando(true);
    playNotificationTone(somId || audioConfig.tipoSom);
    setTimeout(() => setSomTocando(false), 1200);
  };

  const handleFinalizarSetup = async () => {
    try {
      setSubmitting(true);
      await onConcluido({
        novaSenha,
        audioConfig,
        viewMode,
      });
      showToast('Configuração inicial concluída com sucesso! Bem-vindo ao sistema.', 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao salvar configurações iniciais.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Variantes de Animação com Física Spring Apple
  const containerVariants = {
    hidden: { opacity: 0, scale: 0.96, y: 12 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { 
        duration: 0.45, 
        ease: [0.16, 1, 0.3, 1],
        staggerChildren: 0.08,
      } 
    },
    exit: { 
      opacity: 0, 
      scale: 0.96, 
      y: -10, 
      transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } 
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#f4f4f6] dark:bg-[#000000] text-[#0a0a0c] dark:text-[#ffffff] transition-colors duration-300">
      
      {/* Background Ambient Mesh Orbs com Movimento Orgânico Suave */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.18, 1],
            x: [0, 20, 0],
            y: [0, -15, 0],
            opacity: [0.25, 0.4, 0.25],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-[15%] -left-[10%] w-[60vw] h-[60vw] max-w-[650px] max-h-[650px] rounded-full bg-gradient-to-br from-[#4d7c0f]/20 via-[#84cc16]/15 to-transparent blur-[140px]"
        />
        <motion.div
          animate={{
            scale: [1.15, 1, 1.15],
            x: [0, -20, 0],
            y: [0, 20, 0],
            opacity: [0.2, 0.35, 0.2],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-[15%] -right-[10%] w-[60vw] h-[60vw] max-w-[650px] max-h-[650px] rounded-full bg-gradient-to-tl from-blue-500/15 via-purple-500/10 to-transparent blur-[150px]"
        />
      </div>

      {/* Botões de Ação no Canto Superior (Sair e Tema) */}
      <div className="fixed top-5 right-5 sm:top-7 sm:right-7 z-20 flex items-center gap-2">
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="px-3.5 py-2 rounded-full backdrop-blur-2xl bg-white/90 dark:bg-zinc-900/90 border border-black/10 dark:border-white/15 shadow-xs hover:scale-105 active:scale-95 transition-all text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5 cursor-pointer"
            title="Sair / Encerrar Sessão sem concluir o cadastro"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sair</span>
          </button>
        )}

        {onToggleTheme && (
          <button
            onClick={() => onToggleTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2.5 rounded-full backdrop-blur-2xl bg-white/90 dark:bg-zinc-900/90 border border-black/10 dark:border-white/15 shadow-xs hover:scale-105 active:scale-95 transition-all text-slate-800 dark:text-zinc-100 cursor-pointer"
            title="Alternar Tema Claro / Escuro"
          >
            {theme === 'light' ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Cartão Central Apple Setup Assistant */}
      <div className="w-full max-w-[620px] relative z-10 my-auto">
        
        {/* Barra de Progresso / Stepper Minimalista Apple */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((passoNum) => {
            const isAtual = etapa === passoNum;
            const isConcluido = etapa > passoNum;
            return (
              <div
                key={passoNum}
                className={`h-1.5 rounded-full transition-all duration-400 ${
                  isAtual
                    ? 'w-10 bg-[#4d7c0f] dark:bg-[#84cc16]'
                    : isConcluido
                    ? 'w-6 bg-[#4d7c0f]/50 dark:bg-[#84cc16]/50'
                    : 'w-4 bg-black/10 dark:bg-white/15'
                }`}
              />
            );
          })}
        </div>

        <div className="rounded-[36px] p-7 sm:p-10 backdrop-blur-3xl bg-white/95 dark:bg-[#121216]/95 border border-black/12 dark:border-white/15 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.12)] dark:shadow-[0_35px_110px_-25px_rgba(0,0,0,0.95)] overflow-hidden relative">
          <AnimatePresence mode="wait">

            {/* ============================================================================== */}
            {/* ETAPA 1: BOAS-VINDAS ESTILO APPLE ("OLÁ") */}
            {/* ============================================================================== */}
            {etapa === 1 && (
              <motion.div
                key="etapa_1"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-6 text-center"
              >
                <motion.div variants={itemVariants} className="space-y-2">
                  <span className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-[#4d7c0f] via-emerald-600 to-[#84cc16] bg-clip-text text-transparent inline-block">
                    Olá.
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] dark:text-white">
                    Seja bem-vindo, {nomeExibicao}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed pt-1">
                    Este é o seu primeiro acesso ao <strong>RM Controle</strong>. Antes de começar, vamos configurar suas preferências de segurança, alertas sonoros e modo de visualização.
                  </p>
                </motion.div>

                {/* Destaques das Etapas com Micro-Cards */}
                <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
                  <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-1">
                    <span className="text-lg">🔒</span>
                    <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">Segurança</h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">Crie sua senha pessoal com regras LGPD.</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-1">
                    <span className="text-lg">🔔</span>
                    <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">Alertas Sonoros</h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">Escolha o timbre e modo de repetição.</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-1">
                    <span className="text-lg">📱</span>
                    <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">Visualização</h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">Defina seu layout prioritário do sistema.</p>
                  </div>
                </motion.div>

                <motion.div variants={itemVariants} className="pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setEtapa(2)}
                    className="w-full py-3.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-sm shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Continuar</span>
                    <span>→</span>
                  </motion.button>
                </motion.div>
              </motion.div>
            )}

            {/* ============================================================================== */}
            {/* ETAPA 2: REDEFINIÇÃO DE SENHA PESSOAL (ESTILO APPLE SECURITY SETUP) */}
            {/* ============================================================================== */}
            {etapa === 2 && (
              <motion.div
                key="etapa_2"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5"
              >
                <motion.div variants={itemVariants} className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                      Etapa 1 de 3: Segurança
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                    Crie sua Senha Pessoal
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Por conformidade LGPD e segurança da conta, crie uma senha forte e individual para os seus acessos.
                  </p>
                </motion.div>

                {/* Campos de Senha */}
                <motion.div variants={itemVariants} className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                      Nova Senha <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNovaSenha ? 'text' : 'password'}
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        placeholder="Digite sua nova senha..."
                        className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNovaSenha(!showNovaSenha)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        {showNovaSenha ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                      Confirmar Nova Senha <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmarSenha ? 'text' : 'password'}
                        value={confirmarSenha}
                        onChange={(e) => setConfirmarSenha(e.target.value)}
                        placeholder="Repita sua nova senha..."
                        className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmarSenha(!showConfirmarSenha)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        {showConfirmarSenha ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Medidor de Força */}
                  {novaSenha && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-slate-500">Força da Senha:</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">{forcaSenhaLabel}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${forcaSenhaColor}`}
                          style={{ width: `${Math.min(100, (criteriosAtendidos / 5) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>

                {/* Checklist Interativo das Regras */}
                <motion.div variants={itemVariants} className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                    Requisitos Mínimos de Segurança:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className={`flex items-center gap-2 transition-colors ${temOitoDigitos ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                      <span>{temOitoDigitos ? '✓' : '○'}</span>
                      <span>Mínimo de 8 caracteres</span>
                    </div>
                    <div className={`flex items-center gap-2 transition-colors ${temMaiuscula ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                      <span>{temMaiuscula ? '✓' : '○'}</span>
                      <span>1 letra maiúscula (A-Z)</span>
                    </div>
                    <div className={`flex items-center gap-2 transition-colors ${temMinuscula ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                      <span>{temMinuscula ? '✓' : '○'}</span>
                      <span>1 letra minúscula (a-z)</span>
                    </div>
                    <div className={`flex items-center gap-2 transition-colors ${temNumero ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                      <span>{temNumero ? '✓' : '○'}</span>
                      <span>Pelo menos 1 número (0-9)</span>
                    </div>
                    <div className={`flex items-center gap-2 transition-colors ${temEspecial ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                      <span>{temEspecial ? '✓' : '○'}</span>
                      <span>1 caractere especial (!@#$...)</span>
                    </div>
                    <div className={`flex items-center gap-2 transition-colors ${senhasConferem ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                      <span>{senhasConferem ? '✓' : '○'}</span>
                      <span>Confirmação idêntica</span>
                    </div>
                  </div>
                </motion.div>

                {/* Botões de Navegação */}
                <motion.div variants={itemVariants} className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setEtapa(1)}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-black dark:hover:text-white cursor-pointer"
                  >
                    ← Voltar
                  </button>
                  <motion.button
                    whileHover={todasRegrasAtendidas ? { scale: 1.02 } : {}}
                    whileTap={todasRegrasAtendidas ? { scale: 0.98 } : {}}
                    disabled={!todasRegrasAtendidas}
                    onClick={() => setEtapa(3)}
                    className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Salvar e Continuar</span>
                    <span>→</span>
                  </motion.button>
                </motion.div>
              </motion.div>
            )}

            {/* ============================================================================== */}
            {/* ETAPA 3: ALERTAS SONOROS DA FILA DE DEMANDAS */}
            {/* ============================================================================== */}
            {etapa === 3 && (
              <motion.div
                key="etapa_3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5"
              >
                <motion.div variants={itemVariants} className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                      Etapa 2 de 3: Alertas Sonoros
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                    Toques Sonoros da Fila de Demandas
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Personalize como e quando o navegador emitirá sons ao entrar novas demandas na central.
                  </p>
                </motion.div>

                {/* Habilitar / Desabilitar */}
                <motion.div variants={itemVariants} className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                      Alertas Sonoros Ativos
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Tocar alerta de áudio nativo quando entrar chamado na fila.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={audioConfig.habilitado}
                      onChange={(e) => setAudioConfig({ ...audioConfig, habilitado: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-[#4d7c0f] dark:peer-checked:bg-[#84cc16]"></div>
                  </label>
                </motion.div>

                {audioConfig.habilitado && (
                  <>
                    {/* Modo de Repetição com Intermitente */}
                    <motion.div variants={itemVariants} className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                        Modo de Repetição
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'uma_vez', titulo: 'Uma Vez', desc: 'Apenas ao entrar' },
                          { id: 'intermitente', titulo: 'Intermitente', desc: 'Loop contínuo sem pausas' },
                          { id: 'intervalo', titulo: 'Por Intervalo', desc: `A cada ${audioConfig.intervaloSegundos || 30}s` },
                        ].map((m) => {
                          const isSel = audioConfig.modoRepeticao === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setAudioConfig({ ...audioConfig, modoRepeticao: m.id })}
                              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                isSel
                                  ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 font-bold'
                                  : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/20 bg-black/[0.01]'
                              }`}
                            >
                              <span className="text-xs font-bold block text-[#1d1d1f] dark:text-white">{m.titulo}</span>
                              <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5 leading-tight">{m.desc}</span>
                            </button>
                          );
                        })}
                      </div>

                      {audioConfig.modoRepeticao === 'intervalo' && (
                        <div className="pt-2 px-1">
                          <div className="flex justify-between text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                            <span>Intervalo:</span>
                            <span className="font-mono">{audioConfig.intervaloSegundos || 30} segundos</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="120"
                            step="5"
                            value={audioConfig.intervaloSegundos || 30}
                            onChange={(e) => setAudioConfig({ ...audioConfig, intervaloSegundos: parseInt(e.target.value, 10) })}
                            className="w-full accent-[#4d7c0f] dark:accent-[#84cc16]"
                          />
                        </div>
                      )}
                    </motion.div>

                    {/* Escolha do Timbre com Teste em Tempo Real */}
                    <motion.div variants={itemVariants} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Timbre do Som
                        </label>
                        <span className="text-[10px] text-slate-400">Clique para ouvir na hora</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {opcoesSons.map((som) => {
                          const isSel = audioConfig.tipoSom === som.id;
                          return (
                            <button
                              key={som.id}
                              type="button"
                              onClick={() => {
                                setAudioConfig({ ...audioConfig, tipoSom: som.id });
                                handleTestarSom(som.id);
                              }}
                              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSel
                                  ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 shadow-xs font-bold'
                                  : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/20 bg-black/[0.01]'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full mb-1">
                                <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">{som.nome}</span>
                                {isSel && <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]"></span>}
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight block">
                                {som.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  </>
                )}

                {/* Botões de Navegação */}
                <motion.div variants={itemVariants} className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setEtapa(2)}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-black dark:hover:text-white cursor-pointer"
                  >
                    ← Voltar
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setEtapa(4)}
                    className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Salvar e Continuar</span>
                    <span>→</span>
                  </motion.button>
                </motion.div>
              </motion.div>
            )}

            {/* ============================================================================== */}
            {/* ETAPA 4: MODO DE VISUALIZAÇÃO PADRÃO DO SISTEMA */}
            {/* ============================================================================== */}
            {etapa === 4 && (
              <motion.div
                key="etapa_4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5"
              >
                <motion.div variants={itemVariants} className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                      Etapa 3 de 3: Visualização
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                    Modo de Visualização do Sistema
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Escolha como deseja visualizar Empresas e Fila de Demandas por padrão. Você poderá alternar a qualquer momento.
                  </p>
                </motion.div>

                {/* Opções de Visualização em Cards Grandes */}
                <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Modo Lista / Tabela */}
                  <div
                    onClick={() => setViewMode('list')}
                    className={`p-5 rounded-3xl border-2 transition-all cursor-pointer space-y-3 ${
                      viewMode === 'list'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 shadow-sm'
                        : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.01] hover:border-black/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-black/[0.05] dark:bg-white/[0.08] flex items-center justify-center">
                          <ViewListIcon className="w-5 h-5 text-slate-700 dark:text-zinc-200" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                            Lista / Tabela
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">Alta Densidade</span>
                        </div>
                      </div>
                      {viewMode === 'list' && (
                        <span className="w-5 h-5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-black flex items-center justify-center">
                          <CheckIcon className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    {/* Wireframe Ilustrativo Minimalista */}
                    <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] space-y-1.5 font-mono text-[9px] text-slate-400">
                      <div className="h-2 w-full rounded-sm bg-black/10 dark:bg-white/10" />
                      <div className="h-2 w-5/6 rounded-sm bg-black/10 dark:bg-white/10" />
                      <div className="h-2 w-4/6 rounded-sm bg-black/10 dark:bg-white/10" />
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                      Ideal para operadores que precisam de visualização rápida em linha e ordenação direta de colunas.
                    </p>
                  </div>

                  {/* Modo Cards / Grade */}
                  <div
                    onClick={() => setViewMode('cards')}
                    className={`p-5 rounded-3xl border-2 transition-all cursor-pointer space-y-3 ${
                      viewMode === 'cards'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 shadow-sm'
                        : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.01] hover:border-black/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-black/[0.05] dark:bg-white/[0.08] flex items-center justify-center">
                          <ViewGridIcon className="w-5 h-5 text-slate-700 dark:text-zinc-200" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                            Cards / Grade
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">Layout Visual</span>
                        </div>
                      </div>
                      {viewMode === 'cards' && (
                        <span className="w-5 h-5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-black flex items-center justify-center">
                          <CheckIcon className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    {/* Wireframe Ilustrativo Minimalista */}
                    <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] grid grid-cols-2 gap-1.5">
                      <div className="h-7 rounded-lg bg-black/10 dark:bg-white/10" />
                      <div className="h-7 rounded-lg bg-black/10 dark:bg-white/10" />
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                      Apresenta as empresas em blocos visuais elegantes com indicadores de status em destaque.
                    </p>
                  </div>
                </motion.div>

                {/* Botões de Navegação */}
                <motion.div variants={itemVariants} className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setEtapa(3)}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-black dark:hover:text-white cursor-pointer"
                  >
                    ← Voltar
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setEtapa(5)}
                    className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Revisar e Concluir</span>
                    <span>→</span>
                  </motion.button>
                </motion.div>
              </motion.div>
            )}

            {/* ============================================================================== */}
            {/* ETAPA 5: TUDO PRONTO (ESTILO APPLE "ALL SET") */}
            {/* ============================================================================== */}
            {etapa === 5 && (
              <motion.div
                key="etapa_5"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-6 text-center"
              >
                <motion.div variants={itemVariants} className="space-y-2">
                  <div className="w-16 h-16 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] flex items-center justify-center mx-auto mb-2 border border-[#4d7c0f]/30">
                    <CheckIcon className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] dark:text-white">
                    Tudo Pronto!
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                    Sua conta foi protegida e personalizada com sucesso. Você já pode acessar todas as funcionalidades do sistema.
                  </p>
                </motion.div>

                {/* Resumo das Escolhas */}
                <motion.div variants={itemVariants} className="p-4 sm:p-5 rounded-3xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] text-left space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-black/[0.04] dark:border-white/[0.05] pb-2">
                    <span className="text-slate-500 dark:text-zinc-400">Usuário Autenticado:</span>
                    <strong className="text-[#1d1d1f] dark:text-white font-mono">{userEmail}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-black/[0.04] dark:border-white/[0.05] pb-2">
                    <span className="text-slate-500 dark:text-zinc-400">Senha Individual:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <span>✓</span> Redefinida com sucesso
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-black/[0.04] dark:border-white/[0.05] pb-2">
                    <span className="text-slate-500 dark:text-zinc-400">Alertas Sonoros:</span>
                    <span className="text-slate-800 dark:text-zinc-200 font-medium">
                      {audioConfig.habilitado ? `Ativos (${audioConfig.modoRepeticao === 'intermitente' ? 'Intermitente' : audioConfig.modoRepeticao === 'intervalo' ? `${audioConfig.intervaloSegundos}s` : 'Uma vez'})` : 'Desativados'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-zinc-400">Layout Padrão:</span>
                    <span className="text-slate-800 dark:text-zinc-200 font-medium">
                      {viewMode === 'cards' ? 'Cards / Grade' : 'Lista / Tabela'}
                    </span>
                  </div>
                </motion.div>

                {/* Botão Final de Abertura do Sistema */}
                <motion.div variants={itemVariants} className="pt-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={submitting}
                    onClick={handleFinalizarSetup}
                    className="w-full py-4 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-sm shadow-xl shadow-[#4d7c0f]/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <SparklesIcon className="w-4 h-4" />
                    <span>{submitting ? 'Gravando Configurações...' : 'Começar a Usar o RM Controle'}</span>
                  </motion.button>
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
