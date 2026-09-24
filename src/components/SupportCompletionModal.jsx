'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getMotivosSuporte, 
  getEmpresaCredenciais, 
  getConfiguracoesSuporte,
  finalizarSuporte,
  getNomeTecnico,
  getEmpresaById
} from '@/lib/storage';
import { XMarkIcon, ClockIcon, CheckIcon, SparklesIcon } from './Icons';

export default function SupportCompletionModal({
  isOpen,
  chamado,
  onClose,
  onFinalizado,
  userEmail,
}) {
  const [motivos, setMotivos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [config, setConfig] = useState({
    motivo_obrigatorio: true,
    solucao_obrigatoria: false,
    colaborador_obrigatorio: false,
    atendente_obrigatorio: false,
  });

  const [motivo, setMotivo] = useState('');
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState(null);
  const [colaboradorManual, setColaboradorManual] = useState('');
  const [modoManualColab, setModoManualColab] = useState(false);
  const [buscaColab, setBuscaColab] = useState('');
  const [dropdownColabAberto, setDropdownColabAberto] = useState(false);

  const [atendente, setAtendente] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Cronômetros calculados no momento de abertura
  const [tempoEsperaSegundos, setTempoEsperaSegundos] = useState(0);
  const [tempoAtivoSegundos, setTempoAtivoSegundos] = useState(0);

  useEffect(() => {
    if (isOpen && chamado) {
      const mot = getMotivosSuporte();
      setMotivos(mot);
      if (mot.length > 0 && !motivo) setMotivo(mot[0].nome);

      const cfg = getConfiguracoesSuporte();
      setConfig(cfg);

      // Puxa colaboradores da empresa (credenciais e contatos cadastrados)
      const creds = getEmpresaCredenciais(chamado.empresa_id) || [];
      let listaColabs = creds.map((c) => ({
        id: c.id,
        nome: c.rotulo || c.email_administrador || c.usuario_email || 'Acesso Principal',
        email: c.email_administrador || c.usuario_email || '',
        tipo: 'Credencial / Administrador',
      }));

      try {
        const emp = getEmpresaById(chamado.empresa_id);
        if (emp && emp.colaboradores) {
          const extras = emp.colaboradores.map((col) => ({
            id: col.id,
            nome: col.nome,
            email: col.email || '',
            cargo: col.cargo || 'Colaborador',
            tipo: 'Equipe do Cliente',
          }));
          listaColabs = [...extras, ...listaColabs];
        }
      } catch (e) {}

      setColaboradores(listaColabs);

      // Pré-seleciona se já houver solicitante registrado no chamado
      if (chamado.solicitante_nome) {
        const achado = listaColabs.find((c) => c.nome.toLowerCase() === chamado.solicitante_nome.toLowerCase());
        if (achado) {
          setColaboradorSelecionado(achado);
        } else {
          setColaboradorManual(chamado.solicitante_nome);
          setModoManualColab(true);
        }
      } else if (listaColabs.length > 0) {
        setColaboradorSelecionado(listaColabs[0]);
      }

      const nomeOperador = getNomeTecnico(userEmail || chamado.tecnico_email);
      setAtendente(nomeOperador);

      // Calcula tempo em espera
      const agora = Date.now();
      let espera = chamado.tempo_espera_segundos || 0;
      if (!espera && chamado.tempo_espera_inicio) {
        const inicioEspera = new Date(chamado.tempo_espera_inicio).getTime();
        const fimEspera = chamado.tempo_espera_fim ? new Date(chamado.tempo_espera_fim).getTime() : agora;
        espera = Math.max(0, Math.floor((fimEspera - inicioEspera) / 1000));
      }
      setTempoEsperaSegundos(espera);

      // Calcula tempo ativo
      let ativo = 0;
      const inicioAtivo = new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em || agora).getTime();
      ativo = Math.max(1, Math.floor((agora - inicioAtivo) / 1000));
      setTempoAtivoSegundos(ativo);

      setErrorMsg('');
    }
  }, [isOpen, chamado, userEmail]);

  if (!isOpen || !chamado) return null;

  const formatarTempo = (totalSegundos) => {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    if (horas > 0) {
      return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    }
    return `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  };

  const colaboradoresFiltrados = colaboradores.filter((c) => {
    if (!buscaColab.trim()) return true;
    const q = buscaColab.toLowerCase().trim();
    return c.nome.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const solicitanteFinal = modoManualColab 
      ? colaboradorManual.trim() 
      : (colaboradorSelecionado?.nome || '').trim();

    if (config.motivo_obrigatorio && !motivo.trim()) {
      setErrorMsg('Por favor, selecione o motivo do suporte.');
      return;
    }
    if (config.solucao_obrigatoria && !observacoes.trim()) {
      setErrorMsg('Por favor, descreva o resumo da solução aplicada.');
      return;
    }
    if (config.colaborador_obrigatorio && !solicitanteFinal) {
      setErrorMsg('Por favor, identifique o colaborador solicitante na empresa.');
      return;
    }

    try {
      setSubmitting(true);
      await finalizarSuporte({
        chamado_id: chamado.id,
        motivo,
        observacoes,
        colaborador_solicitante: solicitanteFinal,
        atendente,
        userEmail,
      });

      if (onFinalizado) onFinalizado();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao finalizar atendimento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl rounded-[32px] bg-white/95 dark:bg-[#16161a]/95 border border-black/[0.08] dark:border-white/[0.1] p-6 sm:p-8 shadow-2xl space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7] relative overflow-hidden my-auto backdrop-blur-3xl"
        >
          
          {/* Header Elegante Estilo Apple */}
          <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.08] pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] border border-[#4d7c0f]/20">
                  Conclusão do Chamado
                </span>
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  {chamado.empresa_nome}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                Finalizar Atendimento Técnico
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Valide o solicitante, selecione o motivo diagnosticado e registre o resumo da solução aplicada.
              </p>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Fechar"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Painel com Dois Cronômetros: Tempo em Espera & Tempo em Atendimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* Card 1: Tempo em Espera */}
            <div className="p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                  ⏳
                </div>
                <div>
                  <span className="text-[10px] font-medium text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                    Tempo em Espera (Triagem)
                  </span>
                  <span className="text-lg font-bold font-mono text-amber-900 dark:text-amber-200 tabular-nums">
                    {formatarTempo(tempoEsperaSegundos)}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                {tempoEsperaSegundos < 60 ? 'Imediato' : `${Math.floor(tempoEsperaSegundos / 60)} min`}
              </span>
            </div>

            {/* Card 2: Tempo Ativo */}
            <div className="p-4 rounded-2xl bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10 border border-[#4d7c0f]/20 dark:border-[#84cc16]/25 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] flex items-center justify-center font-bold text-xs">
                  ⏱
                </div>
                <div>
                  <span className="text-[10px] font-medium text-[#4d7c0f] dark:text-[#84cc16] uppercase tracking-wider block">
                    Tempo em Atendimento Ativo
                  </span>
                  <span className="text-lg font-bold font-mono text-[#1d1d1f] dark:text-white tabular-nums">
                    {formatarTempo(tempoAtivoSegundos)}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
                Técnico: {atendente.split(' ')[0]}
              </span>
            </div>

          </div>

          {/* Feedback de Validação */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Formulário de Conclusão */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Seção 1: Colaborador Solicitante (Custom Picker Elegante) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <span>Colaborador Solicitante na Empresa</span>
                  {config.colaborador_obrigatorio ? (
                    <span className="text-red-500 text-[10px]">* (Obrigatório)</span>
                  ) : (
                    <span className="text-slate-400 text-[10px] font-normal">(Opcional)</span>
                  )}
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setModoManualColab(!modoManualColab);
                    setDropdownColabAberto(false);
                  }}
                  className="text-[11px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline cursor-pointer"
                >
                  {modoManualColab ? '← Escolher da Lista da Empresa' : '+ Digitar Outro Nome'}
                </button>
              </div>

              {modoManualColab ? (
                <input
                  type="text"
                  value={colaboradorManual}
                  onChange={(e) => setColaboradorManual(e.target.value)}
                  placeholder="Ex: Carlos Oliveira (Gerente Comercial) ou (85) 99876-5432"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium"
                />
              ) : (
                <div className="relative">
                  {/* Botão Seletor Estilizado */}
                  <button
                    type="button"
                    onClick={() => setDropdownColabAberto(!dropdownColabAberto)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-left flex items-center justify-between transition-all hover:border-black/[0.15] dark:hover:border-white/[0.2] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                        {colaboradorSelecionado?.nome ? colaboradorSelecionado.nome.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-medium text-[#1d1d1f] dark:text-white block truncate">
                          {colaboradorSelecionado ? colaboradorSelecionado.nome : 'Selecione o solicitante...'}
                        </span>
                        {colaboradorSelecionado?.email && (
                          <span className="text-[10px] text-slate-400 font-mono truncate block">
                            {colaboradorSelecionado.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Dropdown Menu com Busca */}
                  {dropdownColabAberto && (
                    <div className="absolute top-full mt-1.5 left-0 w-full z-20 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/[0.08] dark:border-white/[0.12] shadow-2xl p-2 space-y-1.5 backdrop-blur-2xl max-h-60 overflow-y-auto">
                      <input
                        type="text"
                        value={buscaColab}
                        onChange={(e) => setBuscaColab(e.target.value)}
                        placeholder="Buscar colaborador..."
                        className="w-full px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-xs focus:outline-none mb-1 text-[#1d1d1f] dark:text-white"
                        autoFocus
                      />

                      {colaboradoresFiltrados.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          Nenhum colaborador encontrado.
                        </div>
                      ) : (
                        colaboradoresFiltrados.map((c) => {
                          const isSel = colaboradorSelecionado?.id === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setColaboradorSelecionado(c);
                                setDropdownColabAberto(false);
                              }}
                              className={`w-full p-2 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                                isSel
                                  ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold'
                                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-slate-700 dark:text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-5 h-5 rounded-full bg-black/[0.05] dark:bg-white/[0.1] text-[9px] flex items-center justify-center font-bold">
                                  {c.nome.charAt(0).toUpperCase()}
                                </div>
                                <div className="truncate">
                                  <span className="text-xs truncate block">{c.nome}</span>
                                  {c.email && <span className="text-[10px] text-slate-400 truncate block font-mono">{c.email}</span>}
                                </div>
                              </div>
                              {isSel && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Seção 2: Motivo do Atendimento (Pills Elegantes com Seleção em 1 Clique) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1 flex items-center justify-between">
                <span>Motivo / Diagnóstico do Suporte</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  Identificado na resolução
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                {motivos.map((m) => {
                  const isSelected = motivo === m.nome;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMotivo(m.nome)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 shadow-sm'
                          : 'bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:border-black/[0.15]'
                      }`}
                    >
                      {isSelected && <CheckIcon className="w-3 h-3 stroke-[2.5]" />}
                      <span>{m.nome}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seção 3: Resumo da Solução Aplicada */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Resumo da Solução Aplicada
                {config.solucao_obrigatoria ? (
                  <span className="text-red-500 ml-1 text-[10px]">* (Obrigatório)</span>
                ) : (
                  <span className="text-slate-400 text-[10px] ml-1 font-normal">(Opcional)</span>
                )}
              </label>
              <textarea
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Instância reiniciada e pareamento QR Code restabelecido com sucesso. Cliente confirmou envio de mensagens."
                className="w-full px-4 py-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 leading-relaxed text-[#1d1d1f] dark:text-white"
              />
              <p className="text-[10px] text-slate-400 pl-1">
                ℹ Este resumo é arquivado no histórico de chamados da empresa.
              </p>
            </div>

            {/* Ações do Rodapé */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
              >
                Voltar à Fila
              </button>
              
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{submitting ? 'Finalizando...' : 'Concluir Chamado'}</span>
              </motion.button>
            </div>

          </form>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
