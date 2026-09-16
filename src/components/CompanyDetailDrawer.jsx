'use client';

import React, { useState, useEffect } from 'react';
import { 
  getCanaisCatalogo, 
  addCanalEmpresa, 
  removeCanalEmpresa, 
  addEmpresaObservacao, 
  deleteEmpresaObservacao, 
  saveEmpresaCredenciais, 
  logVisualizacaoSenha, 
  toggleChecklistItem, 
  addCustomChecklistItem,
  updateEmpresa 
} from '@/lib/storage';
import { generateSecurePassword, maskPassword } from '@/lib/security';

export default function CompanyDetailDrawer({ empresa, onClose, onUpdated, userEmail }) {
  const [activeSubTab, setActiveSubTab] = useState('canais'); // 'canais' | 'observacoes' | 'credenciais' | 'checklist'
  const [catalogoCanais, setCatalogoCanais] = useState([]);
  
  // Estados para Canais
  const [selectedCanalId, setSelectedCanalId] = useState('');
  const [canalNumero, setCanalNumero] = useState('');
  const [canalObs, setCanalObs] = useState('');
  const [loadingCanal, setLoadingCanal] = useState(false);

  // Estados para Observações
  const [novaObsTitulo, setNovaObsTitulo] = useState('');
  const [novaObsConteudo, setNovaObsConteudo] = useState('');
  const [loadingObs, setLoadingObs] = useState(false);

  // Estados para Credenciais
  const [adminEmail, setAdminEmail] = useState(empresa?.credenciais?.email_administrador || '');
  const [senhaSuporte, setSenhaSuporte] = useState(empresa?.credenciais?.senha_suporte || '');
  const [revelarSenha, setRevelarSenha] = useState(false);
  const [editandoCredenciais, setEditandoCredenciais] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [loadingCred, setLoadingCred] = useState(false);

  // Estados para Formato e Checklist do Servidor
  const [formatoAtendimento, setFormatoAtendimento] = useState(empresa?.formato_atendimento || 'colaborativo');
  const [novoReqTitulo, setNovoReqTitulo] = useState('');
  const [novoReqObs, setNovoReqObs] = useState('');
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  const [toastMsg, setToastMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    async function loadCanais() {
      const data = await getCanaisCatalogo();
      setCatalogoCanais(data);
      if (data.length > 0) setSelectedCanalId(data[0].id);
    }
    loadCanais();
  }, []);

  const showToast = (text, type = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg({ text: '', type: '' }), 4000);
  };

  if (!empresa) return null;

  const handleAdicionarCanal = async (e) => {
    e.preventDefault();
    if (!selectedCanalId) return;

    try {
      setLoadingCanal(true);
      await addCanalEmpresa(empresa.id, {
        canal_id: selectedCanalId,
        identificador_numero: canalNumero.trim(),
        observacao: canalObs.trim(),
      }, userEmail);

      setCanalNumero('');
      setCanalObs('');
      showToast('Canal adicionado à empresa com sucesso!');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingCanal(false);
    }
  };

  const handleRemoverCanal = async (canalId) => {
    if (!confirm('Deseja realmente remover este canal da empresa?')) return;
    try {
      await removeCanalEmpresa(empresa.id, canalId, userEmail);
      showToast('Canal removido com sucesso.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAdicionarObservacao = async (e) => {
    e.preventDefault();
    if (!novaObsConteudo.trim()) return;

    try {
      setLoadingObs(true);
      await addEmpresaObservacao(empresa.id, {
        titulo: novaObsTitulo.trim() || 'Observação do Suporte',
        conteudo: novaObsConteudo.trim(),
      }, userEmail);

      setNovaObsTitulo('');
      setNovaObsConteudo('');
      showToast('Observação registrada!');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingObs(false);
    }
  };

  const handleRemoverObservacao = async (obsId) => {
    try {
      await deleteEmpresaObservacao(empresa.id, obsId, userEmail);
      showToast('Observação removida.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleRevelarSenha = async () => {
    if (!revelarSenha) {
      await logVisualizacaoSenha(empresa.id, userEmail);
    }
    setRevelarSenha(!revelarSenha);
  };

  const handleCopiarSenha = () => {
    if (senhaSuporte) {
      navigator.clipboard.writeText(senhaSuporte);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      showToast('Senha copiada com sucesso!');
    }
  };

  const handleSalvarCredenciais = async (e) => {
    e.preventDefault();
    try {
      setLoadingCred(true);
      await saveEmpresaCredenciais(empresa.id, {
        email_administrador: adminEmail.trim(),
        senha_suporte: senhaSuporte.trim(),
      }, userEmail);

      setEditandoCredenciais(false);
      showToast('Credenciais de suporte atualizadas!');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingCred(false);
    }
  };

  const handleAlterarFormato = async (novoFormato) => {
    setFormatoAtendimento(novoFormato);
    try {
      await updateEmpresa(empresa.id, { formato_atendimento: novoFormato }, userEmail);
      showToast(`Formato alterado para: ${novoFormato === 'colaborativo' ? 'Colaborativo' : 'Individual'}`);
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleChecklist = async (item) => {
    try {
      await toggleChecklistItem(empresa.id, item.id, {
        concluido: !item.concluido,
        observacao: item.observacao || '',
      }, userEmail);
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSalvarObsChecklist = async (item, obsTexto) => {
    try {
      await toggleChecklistItem(empresa.id, item.id, {
        concluido: item.concluido,
        observacao: obsTexto,
      }, userEmail);
      showToast('Observação salva.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAdicionarRequisitoCustom = async (e) => {
    e.preventDefault();
    if (!novoReqTitulo.trim()) return;

    try {
      setLoadingChecklist(true);
      await addCustomChecklistItem(empresa.id, {
        titulo: novoReqTitulo.trim(),
        observacao: novoReqObs.trim(),
      }, userEmail);

      setNovoReqTitulo('');
      setNovoReqObs('');
      showToast('Requisito adicionado ao checklist!');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingChecklist(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 dark:bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl h-full bg-white dark:bg-[#121216] border-l border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100">
        
        {/* Cabeçalho do Drawer */}
        <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-4 bg-slate-50/70 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-zinc-800 flex items-center justify-center font-bold text-sm text-slate-700 dark:text-zinc-200">
              {empresa.nome.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{empresa.nome}</h2>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  empresa.formato_atendimento === 'colaborativo'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                }`}>
                  {empresa.formato_atendimento === 'colaborativo' ? 'Colaborativo' : 'Individual'}
                </span>
                {empresa.is_mock && (
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                    Mock Dev
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {empresa.canais?.length || 0} canais configurados • Cadastrada em {new Date(empresa.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Notificação Toast */}
        {toastMsg.text && (
          <div className={`mx-5 mt-3 p-3 rounded-xl border text-xs flex items-center gap-2 ${
            toastMsg.type === 'error'
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400'
              : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
          }`}>
            <span className="font-semibold">{toastMsg.text}</span>
          </div>
        )}

        {/* Abas Internas */}
        <div className="flex border-b border-slate-200 dark:border-zinc-800 px-5 bg-white dark:bg-zinc-900/30 overflow-x-auto">
          {[
            { id: 'canais', label: `Canais (${empresa.canais?.length || 0})` },
            { id: 'observacoes', label: `Observações (${empresa.observacoes?.length || 0})` },
            { id: 'credenciais', label: 'Credenciais & Suporte' },
            { id: 'checklist', label: 'Checklist Servidor' },
          ].map((subTab) => (
            <button
              key={subTab.id}
              onClick={() => setActiveSubTab(subTab.id)}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                activeSubTab === subTab.id
                  ? 'border-[#4d7c0f] dark:border-[#84cc16] text-[#4d7c0f] dark:text-[#84cc16]'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {subTab.label}
            </button>
          ))}
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* ============================================================================== */}
          {/* ABA 1: CANAIS */}
          {/* ============================================================================== */}
          {activeSubTab === 'canais' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  Vincular Canal Contratado
                </h3>
                
                <form onSubmit={handleAdicionarCanal} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                        Canal do Catálogo
                      </label>
                      <select
                        value={selectedCanalId}
                        onChange={(e) => setSelectedCanalId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                      >
                        {catalogoCanais.map((canal) => (
                          <option key={canal.id} value={canal.id}>
                            {canal.nome} ({canal.tipo.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                        Identificador / Número
                      </label>
                      <input
                        type="text"
                        value={canalNumero}
                        onChange={(e) => setCanalNumero(e.target.value)}
                        placeholder="+55 11 99999-0000 ou ID"
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs placeholder-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                      Observação do Canal
                    </label>
                    <input
                      type="text"
                      value={canalObs}
                      onChange={(e) => setCanalObs(e.target.value)}
                      placeholder="Ex: Número exclusivo para setor de cobrança"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs placeholder-slate-400 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={loadingCanal}
                      className="px-3.5 py-1.5 rounded-lg bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-xs transition-all shadow-sm"
                    >
                      {loadingCanal ? 'Vinculando...' : 'Adicionar Canal'}
                    </button>
                  </div>
                </form>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2.5">
                  Canais Ativos ({empresa.canais?.length || 0})
                </h4>

                {(!empresa.canais || empresa.canais.length === 0) ? (
                  <p className="text-xs text-slate-400 dark:text-zinc-500 italic py-3">
                    Nenhum canal adicionado a esta empresa ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {empresa.canais.map((c) => (
                      <div
                        key={c.canal_id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{c.nome}</span>
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                              {c.tipo.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-slate-600 dark:text-zinc-300 mt-0.5">
                            {c.identificador_numero || 'Sem identificador informado'}
                          </p>
                          {c.observacao && (
                            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                              {c.observacao}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => handleRemoverCanal(c.canal_id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
                          title="Remover canal"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 2: OBSERVAÇÕES DINÂMICAS */}
          {/* ============================================================================== */}
          {activeSubTab === 'observacoes' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  Nova Observação / Registro
                </h3>

                <form onSubmit={handleAdicionarObservacao} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      value={novaObsTitulo}
                      onChange={(e) => setNovaObsTitulo(e.target.value)}
                      placeholder="Título da observação (ex: Regra de atendimento / particularidade)"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs placeholder-slate-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <textarea
                      rows={3}
                      value={novaObsConteudo}
                      onChange={(e) => setNovaObsConteudo(e.target.value)}
                      placeholder="Detalhes e histórico da observação..."
                      required
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs placeholder-slate-400 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loadingObs}
                      className="px-3.5 py-1.5 rounded-lg bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-xs shadow-sm"
                    >
                      {loadingObs ? 'Salvando...' : 'Registrar Observação'}
                    </button>
                  </div>
                </form>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2.5">
                  Histórico de Registros ({empresa.observacoes?.length || 0})
                </h4>

                {(!empresa.observacoes || empresa.observacoes.length === 0) ? (
                  <p className="text-xs text-slate-400 dark:text-zinc-500 italic py-3">
                    Nenhuma observação registrada para esta empresa.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {empresa.observacoes.map((obs) => (
                      <div
                        key={obs.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {obs.titulo || 'Observação'}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                              {new Date(obs.created_at).toLocaleDateString('pt-BR')}
                            </span>
                            <button
                              onClick={() => handleRemoverObservacao(obs.id)}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                              title="Excluir"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                          {obs.conteudo}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 3: CREDENCIAIS DE SUPORTE */}
          {/* ============================================================================== */}
          {activeSubTab === 'credenciais' && (
            <div className="space-y-5">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400">
                <span className="font-semibold text-slate-800 dark:text-zinc-200 block mb-0.5">Segurança & Auditoria LGPD</span>
                O acesso a esta senha é restrito à equipe técnica de suporte. Cada visualização ou alteração é registrada no rastro de auditoria com seu e-mail e data/hora.
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
                    Acesso Técnico
                  </h3>

                  {!editandoCredenciais ? (
                    <button
                      onClick={() => setEditandoCredenciais(true)}
                      className="px-3 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all"
                    >
                      Alterar Credenciais
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditandoCredenciais(false)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Cancelar
                    </button>
                  )}
                </div>

                {!editandoCredenciais ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block mb-0.5">
                        E-mail de Administrador
                      </span>
                      <span className="text-xs font-mono text-slate-800 dark:text-zinc-200 select-all">
                        {adminEmail || 'Nenhum e-mail de administrador cadastrado'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                          Senha de Suporte
                        </span>
                        {empresa.credenciais?.ultima_alteracao && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                            Última alteração: {new Date(empresa.credenciais.ultima_alteracao).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="font-mono text-sm tracking-wider text-slate-900 dark:text-white select-all">
                          {revelarSenha ? (
                            <span className="text-[#4d7c0f] dark:text-[#84cc16] font-bold">{senhaSuporte || 'Sem senha configurada'}</span>
                          ) : (
                            <span>{maskPassword(senhaSuporte)}</span>
                          )}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleToggleRevelarSenha}
                            className="px-2.5 py-1 rounded-lg bg-slate-200/80 dark:bg-zinc-800 text-[11px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-300 transition-all"
                          >
                            {revelarSenha ? 'Ocultar' : 'Ver Senha'}
                          </button>

                          <button
                            type="button"
                            onClick={handleCopiarSenha}
                            className="px-2.5 py-1 rounded-lg bg-slate-200/80 dark:bg-zinc-800 text-[11px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-300 transition-all"
                          >
                            {copiado ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSalvarCredenciais} className="space-y-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                        E-mail de Administrador
                      </label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@empresa.com.br"
                        required
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                          Nova Senha de Suporte
                        </label>
                        <button
                          type="button"
                          onClick={() => setSenhaSuporte(generateSecurePassword(16))}
                          className="text-[11px] text-[#4d7c0f] dark:text-[#84cc16] hover:underline"
                        >
                          Gerar Senha Segura
                        </button>
                      </div>
                      <input
                        type="text"
                        value={senhaSuporte}
                        onChange={(e) => setSenhaSuporte(e.target.value)}
                        placeholder="Nova senha"
                        required
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-mono focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditandoCredenciais(false)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={loadingCred}
                        className="px-4 py-1.5 rounded-lg bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-xs shadow-sm"
                      >
                        {loadingCred ? 'Salvando...' : 'Salvar Senha'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 4: CHECKLIST DE SERVIDOR */}
          {/* ============================================================================== */}
          {activeSubTab === 'checklist' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  Formato de Conversa no Servidor
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleAlterarFormato('colaborativo')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formatoAtendimento === 'colaborativo'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7] dark:bg-[#84cc16]/10 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold block mb-0.5">Formato Colaborativo</span>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                      Fila única para todos os operadores da empresa.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAlterarFormato('individual')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formatoAtendimento === 'individual'
                        ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7] dark:bg-[#84cc16]/10 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold block mb-0.5">Formato Individual</span>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                      Conversas isoladas por carteira restrita de cada atendente.
                    </p>
                  </button>
                </div>
              </div>

              {/* Checklist de Itens */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Requisitos do Servidor ({empresa.checklist?.filter((i) => i.concluido).length || 0} / {empresa.checklist?.length || 0})
                  </h4>
                </div>

                <div className="space-y-2">
                  {(empresa.checklist || []).map((item) => (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        item.concluido
                          ? 'border-[#4d7c0f]/30 dark:border-[#84cc16]/30 bg-emerald-50/20 dark:bg-emerald-950/10'
                          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={item.concluido}
                          onChange={() => handleToggleChecklist(item)}
                          className="mt-1 w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16] cursor-pointer rounded"
                        />
                        <div className="flex-1">
                          <span className={`text-xs font-semibold ${
                            item.concluido ? 'line-through text-slate-500 dark:text-zinc-400' : 'text-slate-900 dark:text-white'
                          }`}>
                            {item.titulo}
                          </span>
                          {item.descricao && (
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{item.descricao}</p>
                          )}
                          <input
                            type="text"
                            defaultValue={item.observacao || ''}
                            onBlur={(e) => handleSalvarObsChecklist(item, e.target.value)}
                            placeholder="Observação deste requisito..."
                            className="mt-2 w-full px-2.5 py-1 rounded bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-[11px] text-slate-800 dark:text-zinc-200 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Adicionar Requisito Customizado */}
                <form
                  onSubmit={handleAdicionarRequisitoCustom}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-900/30 space-y-2.5"
                >
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block">
                    + Adicionar Requisito Personalizado
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={novoReqTitulo}
                      onChange={(e) => setNovoReqTitulo(e.target.value)}
                      placeholder="Nome do requisito técnico"
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                    />
                    <input
                      type="text"
                      value={novoReqObs}
                      onChange={(e) => setNovoReqObs(e.target.value)}
                      placeholder="Observação (opcional)"
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loadingChecklist}
                      className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all"
                    >
                      Adicionar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
