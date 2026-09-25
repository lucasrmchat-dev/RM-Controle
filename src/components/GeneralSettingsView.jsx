'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAudioConfig, setAudioConfig, playNotificationTone } from '@/lib/audioNotifications';
import ChannelsManagement from './ChannelsManagement';
import ServerConfigView from './ServerConfigView';
import AuditLogsView from './AuditLogsView';

export default function GeneralSettingsView({ userEmail, initialSubTab = 'audio' }) {
  const [subTab, setSubTab] = useState(initialSubTab);
  const [audioConfig, setAudioState] = useState({
    habilitado: true,
    tipoSom: 'harmonico',
    modoRepeticao: 'uma_vez',
    intervaloSegundos: 30,
    escopo: 'todos',
  });
  const [somTocando, setSomTocando] = useState(false);

  useEffect(() => {
    setAudioState(getAudioConfig());
    const handleAudioUpdate = () => setAudioState(getAudioConfig());
    window.addEventListener('rm_audio_config_updated', handleAudioUpdate);
    return () => window.removeEventListener('rm_audio_config_updated', handleAudioUpdate);
  }, []);

  const handleTestarSom = (tipo) => {
    setSomTocando(true);
    playNotificationTone(tipo || audioConfig.tipoSom);
    setTimeout(() => setSomTocando(false), 1200);
  };

  const opcoesSons = [
    { id: 'harmonico', nome: 'Harmônico Apple', desc: 'Acorde suave em Dó Maior (arpejo cristalino)', tag: 'Padrão' },
    { id: 'dinamico', nome: 'Alerta Dinâmico', desc: 'Bip duplo estilo radar/sonar de alta clareza', tag: 'Alerta' },
    { id: 'sino', nome: 'Sino Suave / Marimba', desc: 'Timbre acústico acolhedor, não invasivo', tag: 'Calmo' },
    { id: 'incisivo', nome: 'Incisivo / Alerta Urgente', desc: 'Frequência de atenção imediata para triagem rápida', tag: 'Urgência' },
  ];

  const subAbas = [
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
  ];

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
            Gerencie alertas sonoros, catálogo de canais de mensageria, servidores, regras de suporte e conformidade LGPD.
          </p>
        </div>

        {/* Segmented Control Mac / Apple Style */}
        <div className="flex items-center p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-xl overflow-x-auto max-w-full">
          {subAbas.map((tab) => {
            const isSel = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer relative ${
                  isSel
                    ? 'text-[#1d1d1f] dark:text-white bg-white dark:bg-[#1a1a20] shadow-sm shadow-black/5'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                      audioConfig.habilitado
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-400/20 text-slate-500'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================================== */}
      {/* SUB-ABA 1: ALERTAS SONOROS & NOTIFICAÇÕES (NOVO DESIGN ELEGANTE DEDICADO) */}
      {/* ============================================================================== */}
      {subTab === 'audio' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* Card 1: Chave Geral de Alertas Sonoros */}
          <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  Notificações em Tempo Real
                </span>
                <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white mt-0.5">
                  Toques Sonoros da Fila de Suporte
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                  Emite alertas sonoros através da API de Áudio do navegador sempre que um novo chamado entrar na fila de espera, garantindo resposta rápida aos clientes.
                </p>
              </div>

              {/* Switch Toggle */}
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={audioConfig.habilitado}
                  onChange={(e) => setAudioConfig({ habilitado: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-zinc-600 peer-checked:bg-[#4d7c0f] dark:peer-checked:bg-[#84cc16]"></div>
              </label>
            </div>
          </div>

          {audioConfig.habilitado && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Card 2: Escopo de Notificação */}
              <div className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                    Filtro de Escopo de Atendimento
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Escolha quais chamados devem acionar o aviso sonoro neste dispositivo.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setAudioConfig({ escopo: 'apenas_meus' })}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      audioConfig.escopo === 'apenas_meus'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white shadow-xs'
                        : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12] text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold">Só atribuídos a mim</span>
                      {audioConfig.escopo === 'apenas_meus' && (
                        <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                      Toca apenas quando você for designado nominalmente como técnico do chamado.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioConfig({ escopo: 'todos' })}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      audioConfig.escopo === 'todos'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white shadow-xs'
                        : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12] text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold">Fila inteira (todos)</span>
                      {audioConfig.escopo === 'todos' && (
                        <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                      Toca para qualquer chamado que ingressar na fila, ideal para triagem geral.
                    </p>
                  </button>
                </div>
              </div>

              {/* Card 3: Modo de Repetição e Frequência */}
              <div className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                    Modo de Repetição do Alerta
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Defina a persistência do som enquanto o chamado estiver aguardando atendimento.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { id: 'uma_vez', label: 'Tocar 1 Vez', desc: 'Apenas no recebimento' },
                    { id: 'continuo', label: 'Contínuo', desc: 'Até alguém aceitar' },
                    { id: 'intervalo', label: 'Em Intervalo', desc: 'A cada X segundos' },
                  ].map((m) => {
                    const isSel = audioConfig.modoRepeticao === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAudioConfig({ modoRepeticao: m.id })}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                          isSel
                            ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white font-bold'
                            : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12] text-slate-600 dark:text-zinc-400'
                        }`}
                      >
                        <span className="text-xs block">{m.label}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5 leading-tight">{m.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {audioConfig.modoRepeticao === 'intervalo' && (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs">
                    <span className="text-slate-600 dark:text-zinc-300 font-medium">Intervalo de repetição:</span>
                    <div className="flex items-center gap-1.5">
                      {[15, 30, 60].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAudioConfig({ intervaloSegundos: s })}
                          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold cursor-pointer ${
                            audioConfig.intervaloSegundos === s
                              ? 'bg-[#4d7c0f] text-white dark:bg-[#84cc16] dark:text-zinc-950'
                              : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400'
                          }`}
                        >
                          {s}s
                        </button>
                      ))}
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={audioConfig.intervaloSegundos}
                        onChange={(e) => setAudioConfig({ intervaloSegundos: parseInt(e.target.value || '30', 10) })}
                        className="w-14 px-2 py-1 rounded-lg border border-black/10 dark:border-white/10 text-xs font-mono text-center focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-400">seg</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 4: Catálogo de Toques Sonoros com Teste em Tempo Real */}
              <div className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-sm space-y-4 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                      Biblioteca de Toques e Sons Sintetizados
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Toques gerados dinamicamente via síntese de frequências da Web Audio API nativa da Apple.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestarSom(audioConfig.tipoSom)}
                    disabled={somTocando}
                    className="px-4 py-2 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-semibold text-xs shadow-sm hover:opacity-90 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>{somTocando ? '🔊 Tocando...' : '▶ Testar Toque Selecionado'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-1">
                  {opcoesSons.map((s) => {
                    const isSel = audioConfig.tipoSom === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                          isSel
                            ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 text-[#1d1d1f] dark:text-white ring-1 ring-[#4d7c0f]/20'
                            : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                              {s.nome}
                            </span>
                            <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 dark:text-zinc-400">
                              {s.tag}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                            {s.desc}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-4 mt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => handleTestarSom(s.id)}
                            className="text-xs font-semibold text-[#4d7c0f] dark:text-[#84cc16] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>Ouvir</span>
                            <span>▶</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAudioConfig({ tipoSom: s.id })}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                              isSel
                                ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950'
                                : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300 hover:bg-black/[0.08]'
                            }`}
                          >
                            {isSel ? 'Selecionado' : 'Escolher'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </motion.div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 2: CANAIS DE ATENDIMENTO */}
      {/* ============================================================================== */}
      {subTab === 'canais' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <ChannelsManagement userEmail={userEmail} />
        </motion.div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 3: SERVIDORES & EQUIPE */}
      {/* ============================================================================== */}
      {subTab === 'servidores' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <ServerConfigView userEmail={userEmail} />
        </motion.div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 4: AUDITORIA & LGPD */}
      {/* ============================================================================== */}
      {subTab === 'auditoria' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <AuditLogsView userEmail={userEmail} />
        </motion.div>
      )}
    </div>
  );
}
