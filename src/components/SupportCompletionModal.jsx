'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getMotivosSuporte, 
  getEmpresaCredenciais, 
  getConfiguracoesSuporte,
  finalizarSuporte,
  getNomeTecnico,
  getEmpresaById,
  addColaboradorEmpresa,
  deleteColaboradorEmpresa,
  removerAcentos,
  addSolucaoSuporte
} from '@/lib/storage';
import { XMarkIcon, CheckIcon, SparklesIcon, HourglassIcon, TrashIcon } from './Icons';
import { showToast } from './ToastNotification';

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
  const [buscaColab, setBuscaColab] = useState('');
  const [dropdownColabAberto, setDropdownColabAberto] = useState(false);

  const [atendente, setAtendente] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [salvarNaBase, setSalvarNaBase] = useState(true);
  const [codigoErroSolucao, setCodigoErroSolucao] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Cronômetros calculados no momento de abertura
  const [tempoEsperaSegundos, setTempoEsperaSegundos] = useState(0);
  const [tempoAtivoSegundos, setTempoAtivoSegundos] = useState(0);

  const carregarColaboradores = () => {
    if (!chamado?.empresa_id) return;
    const creds = getEmpresaCredenciais(chamado.empresa_id) || [];
    let listaColabs = creds.map((c) => ({
      id: c.id,
      nome: c.nome_usuario || c.rotulo || c.email_administrador || c.usuario_email || 'Acesso Principal',
      email: c.usuario_email || c.email_administrador || '',
      cargo: 'Credencial / Admin',
      is_credencial: true,
    }));

    try {
      const emp = getEmpresaById(chamado.empresa_id);
      if (emp && emp.colaboradores) {
        const extras = emp.colaboradores.map((col) => ({
          id: col.id,
          nome: col.nome,
          email: col.email || '',
          cargo: col.cargo || 'Colaborador',
          is_colaborador: true,
        }));
        listaColabs = [...extras, ...listaColabs];
      }
    } catch (e) {}

    setColaboradores(listaColabs);

    if (chamado.solicitante_nome) {
      const achado = listaColabs.find(
        (c) => removerAcentos(c.nome) === removerAcentos(chamado.solicitante_nome)
      );
      if (achado) {
        setColaboradorSelecionado(achado);
        setBuscaColab(achado.nome);
      } else {
        setColaboradorSelecionado({ id: 'manual_' + Date.now(), nome: chamado.solicitante_nome });
        setBuscaColab(chamado.solicitante_nome);
      }
    } else if (listaColabs.length > 0 && !colaboradorSelecionado) {
      setColaboradorSelecionado(listaColabs[0]);
      setBuscaColab(listaColabs[0].nome);
    }
  };

  useEffect(() => {
    if (isOpen && chamado) {
      const mot = getMotivosSuporte();
      setMotivos(mot);
      if (mot.length > 0 && !motivo) setMotivo(mot[0].nome);

      const cfg = getConfiguracoesSuporte();
      setConfig(cfg);

      carregarColaboradores();

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
      setBuscaColab(novoItem.nome);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const solicitanteFinal = (colaboradorSelecionado?.nome || buscaColab || '').trim();

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

      if (salvarNaBase && observacoes.trim()) {
        try {
          await addSolucaoSuporte({
            empresa_id: chamado.empresa_id || null,
            empresa_nome: chamado.empresa_nome || 'Global',
            titulo: `${motivo} (${chamado.empresa_nome || 'Empresa'})`,
            erro_codigo: codigoErroSolucao.trim().toUpperCase(),
            contexto: `Solução aplicada por ${atendente || 'atendente'} em atendimento.`,
            tipo_erro: motivo,
            solucao_passos: observacoes.trim(),
            tags: [motivo, chamado.empresa_nome, 'suporte_finalizado'],
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-screen h-screen z-50 bg-black/50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl rounded-[28px] bg-white dark:bg-[#16161a] border border-black/10 dark:border-white/15 p-6 sm:p-8 shadow-2xl space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7] relative overflow-hidden my-auto"
        >
          {/* Header */}
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

          {/* Painel com Dois Cronômetros: Tempo em Espera & Tempo em Atendimento (Ampulheta SVG) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Card 1: Tempo em Espera */}
            <div className="p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                  <HourglassIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
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
              <span className="text-[10px] text-slate-400 font-mono">
                {tempoEsperaSegundos > 0 ? `${Math.round(tempoEsperaSegundos / 60)} min` : 'Direto'}
              </span>
            </div>

            {/* Card 2: Tempo Ativo */}
            <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                  <HourglassIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <span className="text-[10px] font-medium text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                    Tempo em Atendimento Ativo
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-900 dark:text-emerald-200 tabular-nums">
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
            
            {/* Seção 1: Colaborador Solicitante (Busca com Auto-Complete, Cadastro com Enter e Exclusão) */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between pl-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <span>Colaborador Solicitante na Empresa</span>
                  {config.colaborador_obrigatorio ? (
                    <span className="text-red-500 text-[10px]">* (Obrigatório)</span>
                  ) : (
                    <span className="text-slate-400 text-[10px] font-normal">(Opcional)</span>
                  )}
                </label>
                <span className="text-[10px] text-slate-400">
                  Pressione Enter para cadastrar novo
                </span>
              </div>

              <div className="relative">
                <div className="relative">
                  <input
                    type="text"
                    value={buscaColab}
                    onChange={(e) => {
                      setBuscaColab(e.target.value);
                      setDropdownColabAberto(true);
                      if (colaboradorSelecionado && colaboradorSelecionado.nome !== e.target.value) {
                        setColaboradorSelecionado(null);
                      }
                    }}
                    onFocus={() => setDropdownColabAberto(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const exato = colaboradores.find(
                          (c) => removerAcentos(c.nome) === removerAcentos(buscaColab)
                        );
                        if (exato) {
                          setColaboradorSelecionado(exato);
                          setBuscaColab(exato.nome);
                          setDropdownColabAberto(false);
                        } else if (buscaColab.trim()) {
                          handleCadastrarRapidoColaborador(buscaColab.trim());
                        }
                      }
                    }}
                    placeholder="Digite para buscar ou cadastrar colaborador..."
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium text-[#1d1d1f] dark:text-white"
                  />
                  <div className="absolute right-3 inset-y-0 flex items-center gap-1.5">
                    {colaboradorSelecionado && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Colaborador Identificado" />
                    )}
                    <button
                      type="button"
                      onClick={() => setDropdownColabAberto(!dropdownColabAberto)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Dropdown de Autocomplete com opção de cadastrar e excluir */}
                {dropdownColabAberto && (
                  <div className="absolute top-full mt-1 left-0 w-full z-30 rounded-2xl bg-white dark:bg-[#1a1a20] border border-black/10 dark:border-white/15 shadow-xl p-2 space-y-1 max-h-56 overflow-y-auto">
                    {buscaColab.trim() && !colaboradores.some((c) => removerAcentos(c.nome) === removerAcentos(buscaColab)) && (
                      <button
                        type="button"
                        onClick={() => handleCadastrarRapidoColaborador(buscaColab.trim())}
                        className="w-full text-left px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-[#4d7c0f] dark:text-[#84cc16] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span>+ Cadastrar &ldquo;{buscaColab.trim()}&rdquo;</span>
                        <span className="text-[10px] opacity-75 font-mono">Pressione Enter ↵</span>
                      </button>
                    )}

                    {colaboradoresFiltrados.length === 0 && !buscaColab.trim() ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Nenhum colaborador cadastrado para esta empresa.
                      </div>
                    ) : (
                      colaboradoresFiltrados.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setColaboradorSelecionado(c);
                            setBuscaColab(c.nome);
                            setDropdownColabAberto(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                            colaboradorSelecionado?.id === c.id
                              ? 'bg-black/5 dark:bg-white/10 font-bold'
                              : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 text-slate-600 dark:text-zinc-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
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
                            {colaboradorSelecionado?.id === c.id && (
                              <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Seção 2: Motivo Diagnosticado do Suporte */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Motivo Diagnosticado do Suporte {config.motivo_obrigatorio && <span className="text-red-500">*</span>}
              </label>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium text-[#1d1d1f] dark:text-white"
              >
                {motivos.map((m) => (
                  <option key={m.id} value={m.nome}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Seção 3: Resumo da Solução Aplicada */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Resumo da Resolução / Solução Aplicada {config.solucao_obrigatoria && <span className="text-red-500">*</span>}
              </label>
              <textarea
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Descreva brevemente o que foi feito para resolver o problema..."
                className="w-full p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 resize-none leading-relaxed"
              />
            </div>

            {/* Checkbox: Catalogar na Base de Conhecimento */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20 space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={salvarNaBase}
                  onChange={(e) => setSalvarNaBase(e.target.checked)}
                  className="rounded text-[#4d7c0f] focus:ring-[#4d7c0f] w-4 h-4"
                />
                <span className="text-xs font-bold text-[#1d1d1f] dark:text-white flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />
                  <span>Catalogar esta resolução em &ldquo;Como Resolver Chamados&rdquo;</span>
                </span>
              </label>
              {salvarNaBase && (
                <div className="pl-6 pt-1">
                  <input
                    type="text"
                    value={codigoErroSolucao}
                    onChange={(e) => setCodigoErroSolucao(e.target.value)}
                    placeholder="Código de erro opcional (ex: ERR_AUTH, 131026)..."
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.1] text-[11px] font-mono focus:outline-none"
                  />
                </div>
              )}
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
}
