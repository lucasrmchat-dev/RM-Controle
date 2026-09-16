'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getMotivosSuporte, 
  getEmpresaCredenciais, 
  getConfiguracoesSuporte,
  finalizarSuporte 
} from '@/lib/storage';

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
  const [colaborador, setColaborador] = useState('');
  const [colaboradorPersonalizado, setColaboradorPersonalizado] = useState('');
  const [usarColabManual, setUsarColabManual] = useState(false);
  const [atendente, setAtendente] = useState(userEmail || 'admin@rmcontrole.com');
  const [observacoes, setObservacoes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Duração calculada congelada
  const [duracaoCongelada, setDuracaoCongelada] = useState(0);

  useEffect(() => {
    if (isOpen && chamado) {
      const mot = getMotivosSuporte();
      setMotivos(mot);
      if (mot.length > 0) setMotivo(mot[0].nome);

      const cfg = getConfiguracoesSuporte();
      setConfig(cfg);

      const creds = getEmpresaCredenciais(chamado.empresa_id);
      setColaboradores(creds);
      if (creds.length > 0) {
        setColaborador(creds[0].rotulo || creds[0].usuario_email || '');
      }

      setAtendente(userEmail || chamado.tecnico_email || 'admin@rmcontrole.com');

      // Calcula a duração no exato momento da abertura
      const inicio = new Date(chamado.iniciado_em).getTime();
      const diff = Math.max(1, Math.round((Date.now() - inicio) / 1000));
      setDuracaoCongelada(diff);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const solicitanteFinal = usarColabManual ? colaboradorPersonalizado.trim() : colaborador.trim();

    if (config.motivo_obrigatorio && !motivo.trim()) {
      setErrorMsg('Por favor, informe o motivo do suporte.');
      return;
    }
    if (config.solucao_obrigatoria && !observacoes.trim()) {
      setErrorMsg('Por favor, descreva o resumo da solução aplicada.');
      return;
    }
    if (config.colaborador_obrigatorio && !solicitanteFinal) {
      setErrorMsg('Por favor, selecione ou informe o colaborador solicitante.');
      return;
    }
    if (config.atendente_obrigatorio && !atendente.trim()) {
      setErrorMsg('Por favor, informe o atendente técnico responsável.');
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
        duracao_segundos: duracaoCongelada,
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
      <div className="fixed inset-0 w-screen h-screen z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl rounded-[36px] bg-white dark:bg-[#121216] border border-black/10 dark:border-white/12 p-6 sm:p-9 shadow-2xl space-y-6 text-[#0a0a0c] dark:text-[#ffffff] relative overflow-hidden my-auto"
        >
          
          {/* Header da Conclusão */}
          <div className="flex items-start justify-between gap-4 border-b border-black/8 dark:border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] border border-[#4d7c0f]/25">
                  Conclusão de Suporte
                </span>
                <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                  {chamado.empresa_nome}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0a0a0c] dark:text-white">
                Finalizar Atendimento Técnico
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Revise o tempo decorrido, registre o solicitante e o resumo da resolução técnica.
              </p>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-black dark:hover:text-white p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs font-bold"
            >
              ✕
            </button>
          </div>

          {/* Widget Apple de Duração Congelada */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.05] dark:to-white/[0.02] border border-black/8 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#09090b] dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-base shadow-sm">
                ⏱
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block">
                  Tempo Total de Resolução:
                </span>
                <span className="text-2xl sm:text-3xl font-bold font-mono text-[#0a0a0c] dark:text-white tabular-nums tracking-tight">
                  {formatarTempo(duracaoCongelada)}
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right text-[11px] text-slate-500 dark:text-zinc-400 font-mono space-y-0.5">
              <p>Iniciado: {new Date(chamado.iniciado_em).toLocaleTimeString('pt-BR')}</p>
              <p>Técnico: <strong className="text-slate-800 dark:text-zinc-200">{atendente}</strong></p>
            </div>
          </div>

          {/* Feedback de Validação */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Formulário de Finalização */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Linha 1: Solicitante & Atendente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Colaborador Solicitante */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between pl-1">
                  <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Colaborador Solicitante
                    {config.colaborador_obrigatorio ? (
                      <span className="text-red-500 ml-1">* (Obrigatório)</span>
                    ) : (
                      <span className="text-slate-400 text-[10px] ml-1 font-normal">(Opcional)</span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setUsarColabManual(!usarColabManual)}
                    className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline"
                  >
                    {usarColabManual ? 'Selecionar da Lista' : '+ Outro'}
                  </button>
                </div>

                {usarColabManual ? (
                  <input
                    type="text"
                    value={colaboradorPersonalizado}
                    onChange={(e) => setColaboradorPersonalizado(e.target.value)}
                    placeholder="Nome ou setor do colaborador"
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/10 dark:border-white/15 text-xs text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 font-medium"
                  />
                ) : (
                  <select
                    value={colaborador}
                    onChange={(e) => setColaborador(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/10 dark:border-white/15 text-xs text-black dark:text-white focus:outline-none font-medium"
                  >
                    {colaboradores.length === 0 ? (
                      <option value="">Nenhum colaborador pré-cadastrado</option>
                    ) : (
                      colaboradores.map((c) => (
                        <option key={c.id} value={c.rotulo || c.usuario_email}>
                          {c.rotulo} {c.usuario_email ? `(${c.usuario_email})` : ''}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              {/* Atendente Técnico Responsável */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                  Atendente Responsável
                  {config.atendente_obrigatorio ? (
                    <span className="text-red-500 ml-1">* (Obrigatório)</span>
                  ) : (
                    <span className="text-slate-400 text-[10px] ml-1 font-normal">(Opcional)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={atendente}
                  onChange={(e) => setAtendente(e.target.value)}
                  placeholder="Operador técnico"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/10 dark:border-white/15 text-xs text-black dark:text-white focus:outline-none font-medium"
                />
              </div>

            </div>

            {/* Linha 2: Motivo do Suporte */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Motivo / Categoria do Chamado
                {config.motivo_obrigatorio ? (
                  <span className="text-red-500 ml-1">* (Obrigatório)</span>
                ) : (
                  <span className="text-slate-400 text-[10px] ml-1 font-normal">(Opcional)</span>
                )}
              </label>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/10 dark:border-white/15 text-xs text-black dark:text-white font-medium focus:outline-none"
              >
                {motivos.map((m) => (
                  <option key={m.id} value={m.nome}>{m.nome}</option>
                ))}
              </select>
            </div>

            {/* Linha 3: Resumo da Solução */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Resumo da Solução Aplicada
                {config.solucao_obrigatoria ? (
                  <span className="text-red-500 ml-1">* (Obrigatório)</span>
                ) : (
                  <span className="text-slate-400 text-[10px] ml-1 font-normal">(Opcional)</span>
                )}
              </label>
              <textarea
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Descreva o procedimento executado (ex: Instância reiniciada e pareamento validado no WhatsApp QR Code)..."
                className="w-full px-4 py-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/10 dark:border-white/15 text-xs focus:outline-none leading-relaxed text-black dark:text-white"
              />
              <p className="text-[10px] text-slate-400 pl-1">
                ℹ Esta anotação será salva automaticamente na aba <strong>Anotações & Pedidos</strong> da empresa.
              </p>
            </div>

            {/* Ações do Rodapé */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/8 dark:border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              >
                Voltar e Continuar Suporte
              </button>
              
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {submitting ? 'Gravando...' : 'Confirmar e Concluir Chamado'}
              </motion.button>
            </div>

          </form>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
