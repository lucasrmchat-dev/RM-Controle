'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getMotivosSuporte, 
  addMotivoSuporte,
  getEmpresaCredenciais, 
  getConfiguracoesSuporte,
  finalizarSuporte,
  getNomeTecnico,
  getEmpresaById,
  addColaboradorEmpresa,
  getColaboradoresEmpresa,
  deleteColaboradorEmpresa,
  removerAcentos,
  addSolucaoSuporte
} from '@/lib/storage';
import { XMarkIcon, CheckIcon, SparklesIcon, HourglassIcon, TrashIcon, ClockIcon, CheckCircleIcon, ClockPauseIcon, AlertCircleIcon } from './Icons';
import { showToast } from './ToastNotification';

export default function SupportCompletionModal({
  isOpen,
  chamado,
  onClose,
  onFinalizado,
  userEmail,
}) {
  const [mounted, setMounted] = useState(false);
  const [motivos, setMotivos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [config, setConfig] = useState({
    motivo_obrigatorio: true,
    solucao_obrigatoria: false,
    colaborador_obrigatorio: false,
    atendente_obrigatorio: false,
  });

  // Motivo do suporte - INICIA TOTALMENTE LIMPO / SEM NENHUM PRÉ-DEFINIDO
  const [motivo, setMotivo] = useState('');
  const [buscaMotivo, setBuscaMotivo] = useState('');
  const [dropdownMotivoAberto, setDropdownMotivoAberto] = useState(false);
  const [highlightedMotivoIdx, setHighlightedMotivoIdx] = useState(0);
  const motivoRef = useRef(null);

  // Colaborador solicitante - INICIA TOTALMENTE LIMPO / SEM NENHUM PRÉ-DEFINIDO
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState(null);
  const [buscaColab, setBuscaColab] = useState('');
  const [dropdownColabAberto, setDropdownColabAberto] = useState(false);
  const [highlightedColabIdx, setHighlightedColabIdx] = useState(0);
  const colabRef = useRef(null);

  const [atendente, setAtendente] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [tituloProblema, setTituloProblema] = useState('');
  const [codigoErroSolucao, setCodigoErroSolucao] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusResolucao, setStatusResolucao] = useState('resolvido'); // 'resolvido' | 'sem_resposta' | 'nao_resolvido'

  // Cronômetros calculados no momento de abertura
  const [tempoEsperaSegundos, setTempoEsperaSegundos] = useState(0);
  const [tempoAtivoSegundos, setTempoAtivoSegundos] = useState(0);

  // Edição manual de horários / tempo ativo
  const [editandoTempo, setEditandoTempo] = useState(false);
  const [horarioInicio, setHorarioInicio] = useState('');
  const [horarioFim, setHorarioFim] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const toLocalDatetimeInput = (dateObj) => {
    const d = dateObj ? new Date(dateObj) : new Date();
    if (isNaN(d.getTime())) return '';
    const pad = (n) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (colabRef.current && !colabRef.current.contains(e.target)) {
        setDropdownColabAberto(false);
      }
      if (motivoRef.current && !motivoRef.current.contains(e.target)) {
        setDropdownMotivoAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const carregarColaboradores = () => {
    if (!chamado?.empresa_id) return;
    const creds = getEmpresaCredenciais(chamado.empresa_id) || [];
    const colabsDiretos = getColaboradoresEmpresa(chamado.empresa_id) || [];

    const lista = [];
    const vistos = new Set();

    // 1. Colaboradores diretos cadastrados na empresa
    for (const c of colabsDiretos) {
      const nomeLimpo = (c?.nome || '').trim();
      if (nomeLimpo && !vistos.has(nomeLimpo.toLowerCase())) {
        vistos.add(nomeLimpo.toLowerCase());
        lista.push({
          id: c.id || ('col_' + Math.random()),
          nome: nomeLimpo,
          email: c.email || '',
          cargo: c.cargo || 'Colaborador da Empresa',
          is_colaborador: true,
        });
      }
    }

    // 2. Colaboradores e usuários registrados via Credenciais de Acesso
    for (const cr of creds) {
      const nomeCred = (cr.nome_usuario || cr.rotulo || '').trim();
      if (nomeCred && !vistos.has(nomeCred.toLowerCase()) && nomeCred.toLowerCase() !== 'painel admin') {
        vistos.add(nomeCred.toLowerCase());
        lista.push({
          id: cr.id,
          nome: nomeCred,
          email: cr.usuario_email || '',
          cargo: cr.rotulo || 'Acesso / Colaborador',
          is_credencial: true,
        });
      }
    }

    setColaboradores(lista);

    // O usuário especificou: NÃO quer que tenha colaborador nem motivo pré-definido!
    setColaboradorSelecionado(null);
    setBuscaColab('');
    setHighlightedColabIdx(0);
  };

  useEffect(() => {
    if (isOpen && chamado) {
      const mot = getMotivosSuporte();
      setMotivos(mot);

      // O usuário especificou: NÃO quer que tenha motivo pré-definido!
      setMotivo('');
      setBuscaMotivo('');
      setHighlightedMotivoIdx(0);

      const cfg = getConfiguracoesSuporte();
      setConfig(cfg);

      carregarColaboradores();

      const nomeOperador = getNomeTecnico(userEmail || chamado.tecnico_email);
      setAtendente(nomeOperador);

      setObservacoes('');
      setTituloProblema('');
      setCodigoErroSolucao('');

      // Calcula tempo em espera real e preciso
      const agora = Date.now();
      let espera = chamado.tempo_espera_segundos || 0;
      const dataCriacao = chamado.created_at || chamado.tempo_espera_inicio;
      const inicioEspera = new Date(chamado.tempo_espera_inicio || dataCriacao || agora).getTime();
      if (!espera) {
        const fimEspera = chamado.tempo_espera_fim 
          ? new Date(chamado.tempo_espera_fim).getTime() 
          : (chamado.tempo_ativo_inicio || chamado.iniciado_em ? new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em).getTime() : agora);
        espera = Math.max(0, Math.floor((fimEspera - inicioEspera) / 1000));
      }
      setTempoEsperaSegundos(espera);

      // Calcula tempo ativo inicial
      const inicioAtivo = new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em || agora);
      const ativo = Math.max(1, Math.floor((agora - inicioAtivo.getTime()) / 1000));
      setTempoAtivoSegundos(ativo);

      setHorarioInicio(toLocalDatetimeInput(inicioAtivo));
      setHorarioFim(toLocalDatetimeInput(new Date(agora)));
      setEditandoTempo(false);
      setErrorMsg('');
    }
  }, [isOpen, chamado?.id]);

  if (!mounted || !isOpen || !chamado) return null;

  const formatarTempo = (totalSegundos) => {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    if (horas > 0) {
      return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    }
    return `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  };

  const handleRecalcularTempo = (novoInicio, novoFim) => {
    const inMs = new Date(novoInicio).getTime();
    const fimMs = new Date(novoFim).getTime();
    if (!isNaN(inMs) && !isNaN(fimMs) && fimMs >= inMs) {
      const diffSegs = Math.max(1, Math.floor((fimMs - inMs) / 1000));
      setTempoAtivoSegundos(diffSegs);
    }
  };

  const handleAjustarMinutosRapidos = (minutos) => {
    const agora = new Date();
    const fim = horarioFim ? new Date(horarioFim) : agora;
    const inicio = new Date(fim.getTime() - minutos * 60 * 1000);
    const inStr = toLocalDatetimeInput(inicio);
    const fimStr = toLocalDatetimeInput(fim);
    setHorarioInicio(inStr);
    setHorarioFim(fimStr);
    setTempoAtivoSegundos(minutos * 60);
  };

  // Colaboradores filtrados
  const colaboradoresFiltrados = colaboradores.filter((c) => {
    if (!buscaColab.trim()) return true;
    const q = removerAcentos(buscaColab);
    return removerAcentos(c.nome).includes(q) || removerAcentos(c.email || '').includes(q);
  });

  const handleCadastrarRapidoColaborador = async (nomeDigitado) => {
    const nomeLimpo = (nomeDigitado || buscaColab).trim();
    if (!nomeLimpo) return;

    try {
      const novo = await addColaboradorEmpresa(chamado.empresa_id, {
        nome: nomeLimpo,
        cargo: 'Colaborador',
      }, userEmail);

      const novoItem = {
        id: novo.id,
        nome: novo.nome,
        email: '',
        cargo: 'Colaborador',
        is_colaborador: true,
      };

      setColaboradores((prev) => [novoItem, ...prev]);
      setColaboradorSelecionado(novoItem);
      setBuscaColab('');
      setDropdownColabAberto(false);
      showToast(`Colaborador "${novoItem.nome}" cadastrado e selecionado!`, 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar colaborador.', 'error');
    }
  };

  const handleExcluirColaborador = async (e, colab) => {
    e.stopPropagation();
    try {
      await deleteColaboradorEmpresa(chamado.empresa_id, colab.id, userEmail);
      setColaboradores((prev) => prev.filter((c) => c.id !== colab.id));
      if (colaboradorSelecionado?.id === colab.id) {
        setColaboradorSelecionado(null);
        setBuscaColab('');
      }
      showToast(`Colaborador "${colab.nome}" removido.`, 'info');
    } catch (err) {
      showToast(err.message || 'Erro ao remover colaborador.', 'error');
    }
  };

  // Motivos filtrados
  const motivosFiltrados = motivos.filter((m) => {
    if (!buscaMotivo.trim()) return true;
    return removerAcentos(m.nome).includes(removerAcentos(buscaMotivo));
  });

  const handleCadastrarRapidoMotivo = (nomeDigitado) => {
    const nomeLimpo = (nomeDigitado || buscaMotivo).trim();
    if (!nomeLimpo) return;
    try {
      const novo = addMotivoSuporte({ nome: nomeLimpo });
      setMotivos((prev) => [novo, ...prev]);
      setMotivo(novo.nome);
      setBuscaMotivo('');
      setDropdownMotivoAberto(false);
      showToast(`Motivo "${novo.nome}" cadastrado com sucesso!`, 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar motivo.', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const solicitanteFinal = (buscaColab.trim() || colaboradorSelecionado?.nome || 'Colaborador da Empresa').trim();
    let motivoFinal = (buscaMotivo.trim() || motivo || '').trim();

    if (statusResolucao === 'sem_resposta') {
      motivoFinal = motivoFinal || 'Sem resposta do cliente';
    } else {
      // Resolvido ou Não Resolvido: exige motivo se configurado como obrigatório
      if (config.motivo_obrigatorio && !motivoFinal) {
        setErrorMsg('Por favor, selecione ou digite o motivo do suporte.');
        return;
      }
      if (config.solucao_obrigatoria && !observacoes.trim()) {
        setErrorMsg('Por favor, descreva o procedimento adotado para solucionar o problema.');
        return;
      }
      if (config.colaborador_obrigatorio && !solicitanteFinal) {
        setErrorMsg('Por favor, identifique o colaborador solicitante na empresa.');
        return;
      }
    }

    try {
      setSubmitting(true);
      await finalizarSuporte({
        chamado_id: chamado.id,
        motivo: motivoFinal,
        categorias: chamado?.categorias || [],
        // Nunca injeta texto automático em observações! Fica rigorosamente o que o usuário digitou (ou vazio)
        observacoes: observacoes.trim(),
        colaborador_solicitante: solicitanteFinal,
        atendente,
        userEmail,
        tempo_ativo_segundos: tempoAtivoSegundos,
        tempo_ativo_inicio: horarioInicio ? new Date(horarioInicio).toISOString() : null,
        finalizado_em: horarioFim ? new Date(horarioFim).toISOString() : null,
        status_resolucao: statusResolucao,
      });

      if (observacoes.trim()) {
        try {
          const tituloFinal = tituloProblema.trim() || `${motivoFinal} (${chamado.empresa_nome || 'Empresa'})`;
          await addSolucaoSuporte({
            empresa_id: chamado.empresa_id || null,
            empresa_nome: chamado.empresa_nome || 'Global',
            titulo: tituloFinal,
            erro_codigo: codigoErroSolucao.trim().toUpperCase(),
            contexto: `Solução aplicada por ${atendente || 'atendente'} em atendimento.`,
            tipo_erro: motivoFinal,
            solucao_passos: observacoes.trim(),
            tags: [motivoFinal, chamado.empresa_nome, 'suporte_finalizado'],
            userEmail,
          });
        } catch (e) {
          console.warn('Erro ao salvar solucao na base:', e);
        }
      }

      showToast(`Atendimento de ${chamado.empresa_nome} concluído com sucesso!`, 'success');
      if (onFinalizado) onFinalizado();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao finalizar atendimento.');
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-5xl rounded-[32px] bg-white dark:bg-[#16161a] border border-black/10 dark:border-white/15 p-6 sm:p-8 shadow-2xl text-[#1d1d1f] dark:text-[#f5f5f7] relative overflow-hidden my-auto max-h-[94vh] flex flex-col"
        >
          {/* Header do Modal */}
          <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.08] pb-4 flex-shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] border border-[#4d7c0f]/20">
                  Conclusão do Chamado
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  {chamado.empresa_nome}
                </span>
                {atendente && (
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    • Atendente: <strong className="text-slate-700 dark:text-zinc-200">{atendente}</strong>
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                Finalizar Atendimento Técnico
              </h2>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer"
              title="Fechar"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Feedback de Validação */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium flex-shrink-0">
              {errorMsg}
            </div>
          )}

          {/* Formulário com Layout Horizontal 2 Colunas */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-5 pt-2">
            {/* Seletor Rápido de Desfecho / Resolução */}
            <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200">
                Desfecho do Atendimento
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatusResolucao('resolvido');
                    if (motivo === 'Sem resposta do cliente' || motivo === 'Impedimento técnico / Não resolvido') {
                      setMotivo('');
                      setBuscaMotivo('');
                    }
                  }}
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    statusResolucao === 'resolvido'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
                      : 'border-transparent text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span>Resolvido</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusResolucao('sem_resposta');
                    // Não polui o motivo nem insere texto automático em observações
                    if (motivo === 'Impedimento técnico / Não resolvido') {
                      setMotivo('');
                      setBuscaMotivo('');
                    }
                  }}
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    statusResolucao === 'sem_resposta'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300 font-bold shadow-xs'
                      : 'border-transparent text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <ClockPauseIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span>Sem Resposta</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusResolucao('nao_resolvido');
                    if (motivo === 'Sem resposta do cliente') {
                      setMotivo('');
                      setBuscaMotivo('');
                    }
                  }}
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    statusResolucao === 'nao_resolvido'
                      ? 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-300 font-bold shadow-xs'
                      : 'border-transparent text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <AlertCircleIcon className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                  <span>Não Resolvido</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              
              {/* ================================================================= */}
              {/* COLUNA ESQUERDA: CRONÔMETROS, SOLICITANTE E MOTIVO               */}
              {/* ================================================================= */}
              <div className="space-y-4">
                
                {/* Painel de Tempos & Edição de Horário */}
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Card 1: Tempo em Espera */}
                    <div className="p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                          <HourglassIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <span className="text-[9px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                            Espera (Triagem)
                          </span>
                          <span className="text-base font-bold font-mono text-amber-900 dark:text-amber-200 tabular-nums">
                            {formatarTempo(tempoEsperaSegundos)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Tempo Ativo com Botão de Ajuste */}
                    <div className="p-3.5 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                          <ClockIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <span className="text-[9px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                            Atendimento Ativo
                          </span>
                          <span className="text-base font-bold font-mono text-emerald-900 dark:text-emerald-200 tabular-nums">
                            {formatarTempo(tempoAtivoSegundos)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditandoTempo(!editandoTempo)}
                        className="px-2.5 py-1 rounded-xl border border-emerald-500/30 bg-white dark:bg-zinc-900 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/10 transition-all cursor-pointer shadow-2xs"
                        title="Alterar horários de início e término"
                      >
                        <span>{editandoTempo ? 'Fechar' : 'Ajustar'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Painel Expansível de Edição de Horário */}
                  {editandoTempo && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-emerald-500/30 space-y-2.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                            Início do Atendimento
                          </label>
                          <input
                            type="datetime-local"
                            value={horarioInicio}
                            onChange={(e) => {
                              setHorarioInicio(e.target.value);
                              handleRecalcularTempo(e.target.value, horarioFim);
                            }}
                            className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                            Término do Atendimento
                          </label>
                          <input
                            type="datetime-local"
                            value={horarioFim}
                            onChange={(e) => {
                              setHorarioFim(e.target.value);
                              handleRecalcularTempo(horarioInicio, e.target.value);
                            }}
                            className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                        <span className="text-slate-400 text-[10px] uppercase font-mono mr-1">Atalhos rápidos:</span>
                        {[5, 10, 15, 30, 45, 60].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => handleAjustarMinutosRapidos(mins)}
                            className="px-2 py-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] text-slate-700 dark:text-zinc-300 font-mono text-[10px] transition-colors cursor-pointer"
                          >
                            {mins} min
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Seção 1: Colaborador Solicitante - SEM NENHUM PRÉ-DEFINIDO (CAMPO LIMPO) */}
                <div ref={colabRef} className="space-y-1.5 relative">
                  <div className="flex items-center justify-between pl-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <span>Colaborador Solicitante na Empresa</span>
                      {config.colaborador_obrigatorio ? (
                        <span className="text-red-500 text-[10px]">* (Obrigatório)</span>
                      ) : (
                        <span className="text-slate-400 text-[10px] font-normal">(Opcional)</span>
                      )}
                    </label>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={buscaColab}
                      onChange={(e) => {
                        setBuscaColab(e.target.value);
                        setDropdownColabAberto(true);
                        setHighlightedColabIdx(0);
                      }}
                      onFocus={() => {
                        setDropdownColabAberto(true);
                        setHighlightedColabIdx(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedColabIdx((prev) => Math.min(prev + 1, Math.max(0, colaboradoresFiltrados.length - 1)));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedColabIdx((prev) => Math.max(prev - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          // Prioridade absoluta: seleciona a primeira opção já cadastrada correspondente
                          if (colaboradoresFiltrados.length > 0) {
                            const sel = colaboradoresFiltrados[highlightedColabIdx] || colaboradoresFiltrados[0];
                            setColaboradorSelecionado(sel);
                            setBuscaColab('');
                            setDropdownColabAberto(false);
                          } else if (buscaColab.trim()) {
                            // Apenas cadastra novo se realmente não existir nenhuma opção correspondente
                            handleCadastrarRapidoColaborador(buscaColab.trim());
                          }
                        }
                      }}
                      placeholder="Digite ou selecione o colaborador solicitante..."
                      className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium text-[#1d1d1f] dark:text-white"
                    />
                    <div className="absolute right-3 inset-y-0 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDropdownColabAberto(!dropdownColabAberto)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>

                    {/* Dropdown de Autocomplete do Colaborador: OPÇÕES CADASTRADAS EM PRIMEIRO LUGAR */}
                    {dropdownColabAberto && (
                      <div className="absolute top-full mt-1 left-0 w-full z-30 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/10 dark:border-white/15 shadow-xl p-2 space-y-1 max-h-56 overflow-y-auto">
                        {colaboradoresFiltrados.length > 0 ? (
                          <>
                            {colaboradoresFiltrados.map((c, idx) => {
                              const isHighlighted = idx === highlightedColabIdx;
                              const isSelected = colaboradorSelecionado?.id === c.id;
                              return (
                                <div
                                  key={c.id}
                                  onClick={() => {
                                    setColaboradorSelecionado(c);
                                    setBuscaColab('');
                                    setDropdownColabAberto(false);
                                  }}
                                  onMouseEnter={() => setHighlightedColabIdx(idx)}
                                  className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                                    isHighlighted
                                      ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 font-bold border border-emerald-500/30'
                                      : isSelected
                                      ? 'bg-black/5 dark:bg-white/10 font-bold'
                                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                      {c.nome.charAt(0).toUpperCase()}
                                    </span>
                                    <div className="truncate">
                                      <span className="text-[#1d1d1f] dark:text-white block truncate">{c.nome}</span>
                                      {c.email && (
                                        <span className="text-[10px] text-slate-400 block truncate font-mono">{c.email}</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {isHighlighted && (
                                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono font-normal">
                                        Enter ↵
                                      </span>
                                    )}
                                    {c.is_colaborador && (
                                      <button
                                        type="button"
                                        onClick={(e) => handleExcluirColaborador(e, c)}
                                        className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition-all cursor-pointer"
                                        title="Excluir Colaborador"
                                      >
                                        <TrashIcon className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {isSelected && (
                                      <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Opção secundária de cadastrar novo ao final se não houver match exato */}
                            {buscaColab.trim() && !colaboradores.some((c) => removerAcentos(c.nome) === removerAcentos(buscaColab)) && (
                              <button
                                type="button"
                                onClick={() => handleCadastrarRapidoColaborador(buscaColab.trim())}
                                className="w-full text-left px-3 py-1.5 mt-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] text-slate-600 dark:text-zinc-400 text-[11px] font-semibold flex items-center justify-between transition-colors cursor-pointer border-t border-black/[0.05] dark:border-white/[0.05]"
                              >
                                <span>+ Cadastrar outro &ldquo;{buscaColab.trim()}&rdquo;</span>
                              </button>
                            )}
                          </>
                        ) : buscaColab.trim() ? (
                          /* Se REALMENTE NÃO ENCONTRAR nenhuma opção cadastrada, aí sim oferece cadastrar */
                          <button
                            type="button"
                            onClick={() => handleCadastrarRapidoColaborador(buscaColab.trim())}
                            className="w-full text-left px-3 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-[#4d7c0f] dark:text-[#84cc16] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <span>+ Cadastrar colaborador &ldquo;{buscaColab.trim()}&rdquo;</span>
                            <span className="text-[10px] opacity-75 font-mono">Pressione Enter ↵</span>
                          </button>
                        ) : (
                          <div className="p-3 text-center text-xs text-slate-400">
                            Nenhum colaborador cadastrado para esta empresa.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Badge de Colaborador Selecionado com Remoção Rápida */}
                  {colaboradorSelecionado && !buscaColab && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-500/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>{colaboradorSelecionado.nome}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setColaboradorSelecionado(null);
                          setBuscaColab('');
                        }}
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Remover solicitante selecionado"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Seção 2: Motivo Diagnosticado - Exibido para Resolvido e Não Resolvido */}
                {statusResolucao === 'sem_resposta' ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-900 dark:text-amber-200 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold">
                      <ClockPauseIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>Encerramento por falta de retorno</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                      O chamado será concluído com o desfecho <strong>Sem resposta do cliente</strong>. O preenchimento de motivo técnico diagnosticado não se aplica a este desfecho.
                    </p>
                  </div>
                ) : (
                <div ref={motivoRef} className="space-y-1.5 relative">
                  <div className="flex items-center justify-between pl-1">
                    <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <span>Motivo Diagnosticado do Suporte</span>
                      {config.motivo_obrigatorio && <span className="text-red-500 text-[10px]">* (Obrigatório)</span>}
                    </label>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={buscaMotivo}
                      onChange={(e) => {
                        setBuscaMotivo(e.target.value);
                        setDropdownMotivoAberto(true);
                        setHighlightedMotivoIdx(0);
                      }}
                      onFocus={() => {
                        setDropdownMotivoAberto(true);
                        setHighlightedMotivoIdx(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedMotivoIdx((prev) => Math.min(prev + 1, Math.max(0, motivosFiltrados.length - 1)));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedMotivoIdx((prev) => Math.max(prev - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          // Prioridade absoluta: seleciona a primeira opção já cadastrada correspondente
                          if (motivosFiltrados.length > 0) {
                            const sel = motivosFiltrados[highlightedMotivoIdx] || motivosFiltrados[0];
                            setMotivo(sel.nome);
                            setBuscaMotivo('');
                            setDropdownMotivoAberto(false);
                          } else if (buscaMotivo.trim()) {
                            // Apenas cadastra novo se realmente não existir nenhuma opção correspondente
                            handleCadastrarRapidoMotivo(buscaMotivo.trim());
                          }
                        }
                      }}
                      placeholder="Pesquise ou selecione o motivo do suporte..."
                      className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium text-[#1d1d1f] dark:text-white"
                    />
                    <div className="absolute right-3 inset-y-0 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDropdownMotivoAberto(!dropdownMotivoAberto)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>

                    {/* Dropdown de Autocomplete de Motivos: OPÇÕES CADASTRADAS EM PRIMEIRO LUGAR */}
                    {dropdownMotivoAberto && (
                      <div className="absolute top-full mt-1 left-0 w-full z-30 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/10 dark:border-white/15 shadow-xl p-2 space-y-1 max-h-56 overflow-y-auto">
                        {motivosFiltrados.length > 0 ? (
                          <>
                            {motivosFiltrados.map((m, idx) => {
                              const isHighlighted = idx === highlightedMotivoIdx;
                              const isSelected = motivo === m.nome;
                              return (
                                <div
                                  key={m.id}
                                  onClick={() => {
                                    setMotivo(m.nome);
                                    setBuscaMotivo('');
                                    setDropdownMotivoAberto(false);
                                  }}
                                  onMouseEnter={() => setHighlightedMotivoIdx(idx)}
                                  className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer ${
                                    isHighlighted
                                      ? 'bg-[#4d7c0f]/15 dark:bg-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold border border-[#4d7c0f]/30'
                                      : isSelected
                                      ? 'bg-black/5 dark:bg-white/10 font-bold'
                                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
                                  }`}
                                >
                                  <span className="text-[#1d1d1f] dark:text-white truncate">{m.nome}</span>
                                  <div className="flex items-center gap-2">
                                    {isHighlighted && (
                                      <span className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-mono font-normal">
                                        Enter ↵
                                      </span>
                                    )}
                                    {isSelected && (
                                      <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Opção secundária de cadastrar novo ao final se não houver match exato */}
                            {buscaMotivo.trim() && !motivos.some((m) => removerAcentos(m.nome) === removerAcentos(buscaMotivo)) && (
                              <button
                                type="button"
                                onClick={() => handleCadastrarRapidoMotivo(buscaMotivo.trim())}
                                className="w-full text-left px-3 py-1.5 mt-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] text-slate-600 dark:text-zinc-400 text-[11px] font-semibold flex items-center justify-between transition-colors cursor-pointer border-t border-black/[0.05] dark:border-white/[0.05]"
                              >
                                <span>+ Cadastrar novo motivo &ldquo;{buscaMotivo.trim()}&rdquo;</span>
                              </button>
                            )}
                          </>
                        ) : buscaMotivo.trim() ? (
                          /* Se REALMENTE NÃO ENCONTRAR nenhuma opção cadastrada, aí sim oferece cadastrar */
                          <button
                            type="button"
                            onClick={() => handleCadastrarRapidoMotivo(buscaMotivo.trim())}
                            className="w-full text-left px-3 py-2.5 rounded-xl bg-[#4d7c0f]/10 hover:bg-[#4d7c0f]/20 text-[#4d7c0f] dark:text-[#84cc16] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <span>+ Cadastrar motivo &ldquo;{buscaMotivo.trim()}&rdquo;</span>
                            <span className="text-[10px] opacity-75 font-mono">Pressione Enter ↵</span>
                          </button>
                        ) : (
                          <div className="p-3 text-center text-xs text-slate-400">
                            Nenhum motivo catalogado.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Badge de Motivo Selecionado com Remoção Rápida */}
                  {motivo && !buscaMotivo && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold border border-[#4d7c0f]/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]"></span>
                        <span>{motivo}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setMotivo('');
                          setBuscaMotivo('');
                        }}
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Remover motivo selecionado"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}

              </div>

              {/* ================================================================= */}
              {/* COLUNA DIREITA: PROCEDIMENTO ADOTADO + MOTION ORQUESTRADO         */}
              {/* ================================================================= */}
              <div className="space-y-3 bg-black/[0.015] dark:bg-white/[0.02] p-4 sm:p-5 rounded-3xl border border-black/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center justify-between pl-1">
                  <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <span>Descreva o Procedimento Adotado</span>
                    {config.solucao_obrigatoria && <span className="text-red-500">*</span>}
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Resolução técnica
                  </span>
                </div>

                <textarea
                  rows={observacoes.trim().length > 0 ? 5 : 7}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Descreva o procedimento adotado para solucionar o problema..."
                  className="w-full p-4 rounded-2xl bg-white dark:bg-[#121215] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 resize-none leading-relaxed shadow-2xs"
                />

                {/* EXPANSÃO ORQUESTRADA COM MOTION DESIGN: TÍTULO E CÓDIGO DE ERRO */}
                <AnimatePresence>
                  {observacoes.trim().length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -8 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -8 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-3 pt-1 overflow-hidden"
                    >
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                          Título do Problema Resolvido
                        </label>
                        <input
                          type="text"
                          value={tituloProblema}
                          onChange={(e) => setTituloProblema(e.target.value)}
                          placeholder="Ex: Falha de conexão ao emitir NFe"
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-[#121215] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                          Código de Erro / Identificador (Opcional)
                        </label>
                        <input
                          type="text"
                          value={codigoErroSolucao}
                          onChange={(e) => setCodigoErroSolucao(e.target.value)}
                          placeholder="Ex: 131026, 401, SSL, ORA-01017, ERR_AUTH..."
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-[#121215] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                        />
                      </div>

                      <div className="p-3 rounded-2xl bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 border border-[#4d7c0f]/20 dark:border-[#84cc16]/20 flex items-start gap-2.5">
                        <SparklesIcon className="w-4 h-4 text-[#4d7c0f] dark:text-[#84cc16] mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-[#4d7c0f] dark:text-[#84cc16] leading-snug">
                          Esta solução será automaticamente catalogada no <strong>Banco de Soluções Geral</strong> para acelerar futuros atendimentos.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>

            </div>

            {/* Ações do Rodapé */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                Voltar
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>{submitting ? 'Finalizando...' : 'Concluir Chamado'}</span>
              </button>
            </div>

          </form>

        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
