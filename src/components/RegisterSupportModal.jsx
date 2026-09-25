'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getMotivosSuporte, 
  getEquipeUsuarios, 
  getEmpresaCredenciais, 
  getNomeTecnico,
  registrarSuporteRetroativo,
  getEmpresas
} from '@/lib/storage';
import { XMarkIcon, CheckIcon, BuildingIcon, UserIcon, ClockIcon } from './Icons';

export default function RegisterSupportModal({
  isOpen,
  onClose,
  empresaPreSelecionada = null,
  userEmail = 'admin@rmcontrole.com',
  onRegistered
}) {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [motivos, setMotivos] = useState([]);
  const [motivo, setMotivo] = useState('');
  const [equipe, setEquipe] = useState([]);
  const [atendente, setAtendente] = useState('');
  const [solicitanteNome, setSolicitanteNome] = useState('');
  const [colaboradoresSugeridos, setColaboradoresSugeridos] = useState([]);
  const [observacoes, setObservacoes] = useState('');
  const [dataAtendimento, setDataAtendimento] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    // Inicializa motivos
    const motList = getMotivosSuporte();
    setMotivos(motList);
    if (motList.length > 0) setMotivo(motList[0].nome);

    // Inicializa equipe
    const eq = getEquipeUsuarios();
    setEquipe(eq);
    const meuNome = getNomeTecnico(userEmail);
    setAtendente(meuNome);

    // Inicializa data atual (formato YYYY-MM-DDTHH:mm)
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    setDataAtendimento(agora.toISOString().slice(0, 16));

    // Carrega empresas caso não venha pré-selecionada
    if (empresaPreSelecionada) {
      setEmpresaId(empresaPreSelecionada.id);
      setEmpresaNome(empresaPreSelecionada.nome);
      carregarContatosEmpresa(empresaPreSelecionada.id, empresaPreSelecionada);
    } else {
      getEmpresas({ pageSize: 1000 }).then((res) => {
        const items = Array.isArray(res) ? res : (res?.items || []);
        setEmpresas(items);
        if (items.length > 0) {
          setEmpresaId(items[0].id);
          setEmpresaNome(items[0].nome);
          carregarContatosEmpresa(items[0].id, items[0]);
        }
      });
    }

    setObservacoes('');
    setSolicitanteNome('');
    setErrorMsg('');
  }, [isOpen, empresaPreSelecionada, userEmail]);

  const carregarContatosEmpresa = (id, empObj = null) => {
    const creds = getEmpresaCredenciais(id) || [];
    let contatos = creds.map((c) => c.rotulo || c.email_administrador || c.usuario_email).filter(Boolean);
    if (empObj?.colaboradores) {
      const extras = empObj.colaboradores.map((col) => col.nome).filter(Boolean);
      contatos = [...extras, ...contatos];
    }
    setColaboradoresSugeridos(Array.from(new Set(contatos)));
  };

  const handleEmpresaChange = (e) => {
    const id = e.target.value;
    setEmpresaId(id);
    const emp = empresas.find((item) => item.id === id);
    if (emp) {
      setEmpresaNome(emp.nome);
      carregarContatosEmpresa(id, emp);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!empresaId) {
      setErrorMsg('Selecione a empresa atendida.');
      return;
    }
    if (!motivo) {
      setErrorMsg('Selecione o motivo do suporte.');
      return;
    }

    try {
      setSubmitting(true);
      await registrarSuporteRetroativo({
        empresa_id: empresaId,
        empresa_nome: empresaNome,
        motivo,
        observacoes,
        solicitante_nome: solicitanteNome,
        atendente,
        userEmail,
        data_atendimento: dataAtendimento ? new Date(dataAtendimento).toISOString() : null,
      });

      if (onRegistered) onRegistered();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao registrar atendimento.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-xl rounded-[32px] border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#16161a] backdrop-blur-2xl p-6 sm:p-8 shadow-2xl space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7] my-auto"
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                  Registro Direto / Retroativo
                </span>
                {empresaPreSelecionada && (
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    {empresaPreSelecionada.nome}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                Registrar Atendimento Concluído
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Utilize este formulário para lançar suportes já finalizados sem necessidade de iniciar cronômetro em tempo real.
              </p>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all cursor-pointer flex-shrink-0"
              title="Fechar"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Feedback de Erro */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Empresa */}
            {!empresaPreSelecionada && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                  Empresa Atendida <span className="text-red-500">*</span>
                </label>
                <select
                  value={empresaId}
                  onChange={handleEmpresaChange}
                  required
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 cursor-pointer"
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id} className="dark:bg-zinc-900 text-black dark:text-white">
                      {emp.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Motivo do Atendimento */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Motivo / Categoria do Suporte <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {motivos.map((m) => {
                  const isSel = motivo === m.nome;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMotivo(m.nome)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSel
                          ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 shadow-sm'
                          : 'bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:border-black/[0.15]'
                      }`}
                    >
                      {isSel && <CheckIcon className="w-3 h-3 stroke-[2.5]" />}
                      <span>{m.nome}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Técnico & Solicitante */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                  Técnico / Atendente
                </label>
                <select
                  value={atendente}
                  onChange={(e) => setAtendente(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 cursor-pointer"
                >
                  {equipe.map((u) => (
                    <option key={u.id} value={u.nome} className="dark:bg-zinc-900 text-black dark:text-white">
                      {u.nome} ({u.papel})
                    </option>
                  ))}
                  <option value={getNomeTecnico(userEmail)} className="dark:bg-zinc-900 text-black dark:text-white">
                    {getNomeTecnico(userEmail)} (Atual)
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                  Solicitante da Empresa
                </label>
                <input
                  type="text"
                  value={solicitanteNome}
                  onChange={(e) => setSolicitanteNome(e.target.value)}
                  placeholder="Ex: Dra. Camila / Carlos"
                  list="sugestoes-solicitantes"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20"
                />
                {colaboradoresSugeridos.length > 0 && (
                  <datalist id="sugestoes-solicitantes">
                    {colaboradoresSugeridos.map((c, i) => (
                      <option key={i} value={c} />
                    ))}
                  </datalist>
                )}
              </div>
            </div>

            {/* Data e Hora do Atendimento */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Data e Horário em que foi Realizado
              </label>
              <input
                type="datetime-local"
                value={dataAtendimento}
                onChange={(e) => setDataAtendimento(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 cursor-pointer"
              />
            </div>

            {/* Resumo da Solução Aplicada */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200 pl-1">
                Resumo da Resolução / Ações Executadas
              </label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Descreva brevemente o que foi feito (ex: reescaneado QR code da instância, ajustada fila de triagem...)"
                className="w-full p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 leading-relaxed font-sans resize-none"
              />
            </div>

            {/* Nota de Esclarecimento sobre Métricas */}
            <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-2">
              <span className="text-sm">ℹ️</span>
              <span>
                Este atendimento será contabilizado no <strong>total de chamados resolvidos</strong>, nos gráficos de <strong>motivos</strong> e no <strong>histórico da empresa</strong>, sem afetar o cálculo de tempo médio ativo.
              </span>
            </div>

            {/* Ações do Rodapé */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-5 py-2.5 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? 'Salvando...' : 'Salvar Registro de Suporte'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
