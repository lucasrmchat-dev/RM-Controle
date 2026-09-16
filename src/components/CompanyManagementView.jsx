'use client';

import React, { useState, useEffect } from 'react';
import { 
  getCanaisCatalogo, 
  addCanalEmpresa, 
  removeCanalEmpresa, 
  addEmpresaObservacao, 
  deleteEmpresaObservacao, 
  getEmpresaCredenciais,
  addEmpresaCredencial,
  updateEmpresaCredencial,
  deleteEmpresaCredencial,
  logVisualizacaoSenha, 
  toggleChecklistItem, 
  addCustomChecklistItem,
  updateEmpresa,
  iniciarSuporte,
  finalizarSuporte,
  getChamadoAtivo,
  getChamadosSuporte,
  getMotivosSuporte,
  isMockDataEnabled
} from '@/lib/storage';
import { generateSecurePassword, maskPassword } from '@/lib/security';
import { WhatsAppIcon, FacebookIcon, InstagramIcon, TelegramIcon, EyeIcon, EyeOffIcon } from './Icons';

export default function CompanyManagementView({ empresa, onBack, onUpdated, userEmail }) {
  const [activeTab, setActiveTab] = useState('canais'); // 'canais' | 'credenciais' | 'servidor' | 'observacoes' | 'chamados'
  const [catalogoCanais, setCatalogoCanais] = useState([]);
  
  // Suporte em Tempo Real & Congelamento de Timer
  const [chamadoAtivo, setChamadoAtivo] = useState(null);
  const [tempoSuporteSegundos, setTempoSuporteSegundos] = useState(0);
  const [tempoCongelado, setTempoCongelado] = useState(null); // Congela tempo ao abrir modal de finalização
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);
  const [motivosSuporte, setMotivosSuporte] = useState([]);
  const [motivoFinalizacao, setMotivoFinalizacao] = useState('');
  const [obsFinalizacao, setObsFinalizacao] = useState('');
  const [salvandoFinalizacao, setSalvandoFinalizacao] = useState(false);

  // Formato de Atendimento e Servidor Alocado (com botões de salvar explícitos)
  const [formatoSelecionado, setFormatoSelecionado] = useState(empresa?.formato_atendimento || 'colaborativo');
  const [servidorSelecionado, setServidorSelecionado] = useState(empresa?.servidor_alocado || 'servidor_1');
  const [salvandoFormato, setSalvandoFormato] = useState(false);
  const [salvandoServidor, setSalvandoServidor] = useState(false);

  // Modal de Adicionar Canal
  const [isAddCanalOpen, setIsAddCanalOpen] = useState(false);
  const [selectedCanalId, setSelectedCanalId] = useState('');
  const [canalNumero, setCanalNumero] = useState('');
  const [canalObs, setCanalObs] = useState('');
  const [loadingCanal, setLoadingCanal] = useState(false);

  // Estados de Observações
  const [isAddObsOpen, setIsAddObsOpen] = useState(false);
  const [novaObsTitulo, setNovaObsTitulo] = useState('');
  const [novaObsConteudo, setNovaObsConteudo] = useState('');
  const [loadingObs, setLoadingObs] = useState(false);

  // Estados de Múltiplas Credenciais
  const [credenciaisList, setCredenciaisList] = useState([]);
  const [isAddCredOpen, setIsAddCredOpen] = useState(false);
  const [credRotulo, setCredRotulo] = useState('');
  const [credUsuario, setCredUsuario] = useState('');
  const [credSenha, setCredSenha] = useState('');
  const [credObs, setCredObs] = useState('');
  const [senhasReveladas, setSenhasReveladas] = useState({});
  const [copiadoId, setCopiadoId] = useState(null);
  const [editandoCredId, setEditandoCredId] = useState(null);

  // Checklist
  const [novoReqTitulo, setNovoReqTitulo] = useState('');
  const [novoReqObs, setNovoReqObs] = useState('');
  const [isAddReqOpen, setIsAddReqOpen] = useState(false);
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  // Toast
  const [toast, setToast] = useState({ text: '', type: 'success' });

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast({ text: '', type: '' }), 4000);
  };

  const recarregarCredenciais = () => {
    const creds = getEmpresaCredenciais(empresa.id);
    setCredenciaisList(creds);
  };

  const verificarChamadoAtivo = () => {
    const ativo = getChamadoAtivo(empresa.id);
    setChamadoAtivo(ativo);
  };

  useEffect(() => {
    async function init() {
      const data = await getCanaisCatalogo();
      setCatalogoCanais(data);
      if (data.length > 0) setSelectedCanalId(data[0].id);
      recarregarCredenciais();
      verificarChamadoAtivo();
      const mot = getMotivosSuporte();
      setMotivosSuporte(mot);
      if (mot.length > 0) setMotivoFinalizacao(mot[0].nome);
      setFormatoSelecionado(empresa?.formato_atendimento || 'colaborativo');
      setServidorSelecionado(empresa?.servidor_alocado || 'servidor_1');
    }
    init();

    const handleUpdate = () => {
      verificarChamadoAtivo();
      recarregarCredenciais();
    };
    window.addEventListener('suporte_updated', handleUpdate);
    return () => window.removeEventListener('suporte_updated', handleUpdate);
  }, [empresa.id]);

  // Cronômetro do Suporte Ativo (respeita congelamento ao abrir modal)
  useEffect(() => {
    if (!chamadoAtivo) {
      setTempoSuporteSegundos(0);
      setTempoCongelado(null);
      return;
    }

    if (tempoCongelado !== null) {
      // Tempo está congelado enquanto o modal de finalização estiver aberto
      return;
    }

    const calc = () => {
      const inicio = new Date(chamadoAtivo.iniciado_em).getTime();
      const agora = Date.now();
      setTempoSuporteSegundos(Math.max(0, Math.round((agora - inicio) / 1000)));
    };

    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [chamadoAtivo, tempoCongelado]);

  const formatarTempo = (totalSegundos) => {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    if (horas > 0) {
      return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    }
    return `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  };

  // Iniciar Suporte
  const handleIniciarSuporte = async () => {
    try {
      const novo = await iniciarSuporte({
        empresa_id: empresa.id,
        empresa_nome: empresa.nome,
        userEmail,
      });
      setChamadoAtivo(novo);
      setTempoCongelado(null);
      showToast('Suporte técnico iniciado! O tempo está sendo contabilizado.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Abrir Modal de Finalizar (Congela o Cronômetro)
  const handleAbrirFinalizar = () => {
    setTempoCongelado(tempoSuporteSegundos);
    setIsFinalizarModalOpen(true);
  };

  // Cancelar e Continuar Atendimento (Descongela e Retoma o Cronômetro)
  const handleCancelarFinalizacao = () => {
    setTempoCongelado(null);
    setIsFinalizarModalOpen(false);
  };

  // Confirmar Encerramento
  const handleConfirmarFinalizarSuporte = async (e) => {
    e.preventDefault();
    if (!chamadoAtivo || !motivoFinalizacao) return;

    try {
      setSalvandoFinalizacao(true);
      const duracaoFinal = tempoCongelado !== null ? tempoCongelado : tempoSuporteSegundos;
      
      await finalizarSuporte({
        chamado_id: chamadoAtivo.id,
        motivo: motivoFinalizacao,
        observacoes: obsFinalizacao,
        duracao_segundos: duracaoFinal,
        userEmail,
      });

      setChamadoAtivo(null);
      setTempoCongelado(null);
      setIsFinalizarModalOpen(false);
      setObsFinalizacao('');
      showToast('Atendimento de suporte finalizado com sucesso! A observação foi adicionada ao histórico.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoFinalizacao(false);
    }
  };

  // Salvar Formato de Atendimento
  const handleSalvarFormato = async () => {
    try {
      setSalvandoFormato(true);
      await updateEmpresa(empresa.id, { formato_atendimento: formatoSelecionado }, userEmail);
      empresa.formato_atendimento = formatoSelecionado;
      showToast(`Formato salvo com sucesso: ${formatoSelecionado === 'colaborativo' ? 'Colaborativo' : 'Individual'}`);
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoFormato(false);
    }
  };

  // Salvar Servidor Alocado
  const handleSalvarServidor = async () => {
    try {
      setSalvandoServidor(true);
      await updateEmpresa(empresa.id, { servidor_alocado: servidorSelecionado }, userEmail);
      empresa.servidor_alocado = servidorSelecionado;
      showToast(`Servidor alocado salvo: ${servidorSelecionado === 'servidor_1' ? 'Servidor 1 (Principal)' : 'Servidor 2 (Expansão)'}`);
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoServidor(false);
    }
  };

  // Checklist de Requisitos (Filtra dados mock se mock dev estiver desligado)
  const checklistFiltrado = (empresa.checklist || []).filter((item) => {
    if (!isMockDataEnabled() && item.id.includes('mock')) return false;
    return true;
  });

  const totalChecklist = checklistFiltrado.length;
  const concluidosChecklist = checklistFiltrado.filter((c) => c.concluido).length;
  const pctChecklist = totalChecklist > 0 ? Math.round((concluidosChecklist / totalChecklist) * 100) : 0;
  const chamadosEmpresa = getChamadosSuporte({ empresa_id: empresa.id });

  // Ícones de Canal
  const renderCanalIcon = (c) => {
    const nomeLower = (c.nome || '').toLowerCase();
    if (nomeLower.includes('whatsapp')) return <WhatsAppIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    if (nomeLower.includes('facebook')) return <FacebookIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    if (nomeLower.includes('instagram')) return <InstagramIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />;
    if (nomeLower.includes('telegram')) return <TelegramIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    return (
      <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/>
      </svg>
    );
  };

  // Ações de Canais
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
      setIsAddCanalOpen(false);
      showToast('Canal adicionado com sucesso!');
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

  // Checklist Ações
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
      showToast('Anotação do checklist salva.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAdicionarRequisito = async (e) => {
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
      setIsAddReqOpen(false);
      showToast('Novo requisito adicionado ao checklist desta empresa!');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingChecklist(false);
    }
  };

  // Credenciais
  const handleSalvarNovaCredencial = async (e) => {
    e.preventDefault();
    try {
      if (editandoCredId) {
        await updateEmpresaCredencial(empresa.id, editandoCredId, {
          rotulo: credRotulo,
          usuario_email: credUsuario,
          senha: credSenha,
          observacao: credObs,
        }, userEmail);
        showToast('Acesso atualizado com sucesso!');
      } else {
        await addEmpresaCredencial(empresa.id, {
          rotulo: credRotulo,
          usuario_email: credUsuario,
          senha: credSenha,
          observacao: credObs,
        }, userEmail);
        showToast('Novo acesso cadastrado com sucesso!');
      }

      setCredRotulo('');
      setCredUsuario('');
      setCredSenha('');
      setCredObs('');
      setEditandoCredId(null);
      setIsAddCredOpen(false);
      recarregarCredenciais();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExcluirCredencial = async (credId) => {
    if (!confirm('Deseja excluir esta credencial de acesso?')) return;
    try {
      await deleteEmpresaCredencial(empresa.id, credId, userEmail);
      showToast('Credencial removida.');
      recarregarCredenciais();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEditarCredencial = (c) => {
    setEditandoCredId(c.id);
    setCredRotulo(c.rotulo);
    setCredUsuario(c.usuario_email);
    setCredSenha(c.senha);
    setCredObs(c.observacao || '');
    setIsAddCredOpen(true);
  };

  const handleToggleVerSenha = async (cred) => {
    const atual = Boolean(senhasReveladas[cred.id]);
    if (!atual) {
      await logVisualizacaoSenha(empresa.id, userEmail, { rotulo: cred.rotulo });
    }
    setSenhasReveladas({ ...senhasReveladas, [cred.id]: !atual });
  };

  const handleCopiarTexto = (texto, id) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
    showToast('Copiado para a área de transferência!');
  };

  // Observações
  const handleSalvarObservacao = async (e) => {
    e.preventDefault();
    if (!novaObsConteudo.trim()) return;

    try {
      setLoadingObs(true);
      await addEmpresaObservacao(empresa.id, {
        titulo: novaObsTitulo.trim() || 'Anotação Geral',
        conteudo: novaObsConteudo.trim(),
        tipo: 'manual',
      }, userEmail);

      setNovaObsTitulo('');
      setNovaObsConteudo('');
      setIsAddObsOpen(false);
      showToast('Anotação registrada com sucesso!');
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
      showToast('Anotação excluída.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-900 dark:text-zinc-100 pb-16">
      
      {/* Barra de Retorno e Ação de Suporte */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-sm transition-all self-start"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>Voltar para a lista de empresas</span>
        </button>

        {/* Botão de Suporte em Tempo Real */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!chamadoAtivo ? (
            <button
              onClick={handleIniciarSuporte}
              className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90 flex items-center gap-2 transition-all"
            >
              <span>▶ Iniciar Atendimento de Suporte</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 p-1.5 pl-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 font-mono">
                {formatarTempo(tempoCongelado !== null ? tempoCongelado : tempoSuporteSegundos)}
              </span>
              <button
                onClick={handleAbrirFinalizar}
                className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors shadow-sm ml-1"
              >
                ■ Finalizar Suporte
              </button>
            </div>
          )}
        </div>
      </div>

      {toast.text && (
        <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm ${
          toast.type === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400'
            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300'
        }`}>
          <span>{toast.text}</span>
        </div>
      )}

      {/* Faixa de Suporte em Andamento */}
      {chamadoAtivo && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center text-xs animate-pulse">
              ⏱
            </div>
            <div>
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                Atendimento de Suporte em Andamento
              </span>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-mono">
                Técnico: <strong>{chamadoAtivo.tecnico_email}</strong> • Iniciado às {new Date(chamadoAtivo.iniciado_em).toLocaleTimeString('pt-BR')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <span className="text-sm font-bold font-mono text-amber-800 dark:text-amber-300">
              Tempo: {formatarTempo(tempoCongelado !== null ? tempoCongelado : tempoSuporteSegundos)}
            </span>
            <button
              onClick={handleAbrirFinalizar}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm"
            >
              Concluir Chamado
            </button>
          </div>
        </div>
      )}

      {/* Cartão de Identificação da Empresa */}
      <div className="surface-card rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#4d7c0f]/15 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-lg flex items-center justify-center border border-[#4d7c0f]/25">
              {empresa.nome.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {empresa.nome}
                </h1>
                
                {/* Badge do Servidor Alocado */}
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                  {empresa.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}
                </span>

                <span className={`text-[11px] uppercase font-bold px-2.5 py-0.5 rounded-full ${
                  empresa.formato_atendimento === 'colaborativo'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                }`}>
                  {empresa.formato_atendimento === 'colaborativo' ? 'Modo Colaborativo' : 'Modo Individual'}
                </span>

                {empresa.is_mock && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Mock Dev
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                {empresa.canais?.length || 0} canais conectados • {chamadosEmpresa.length} atendimentos registrados
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-xs font-semibold self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Empresa Ativa
          </span>
        </div>

        {/* 4 Indicadores Rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">Servidor</span>
            <span className="text-xs font-bold">{empresa.servidor_alocado === 'servidor_2' ? 'Servidor 2 (Expansão)' : 'Servidor 1 (Principal)'}</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">Canais Ativos</span>
            <span className="text-xs font-bold">{empresa.canais?.length || 0} conectados</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">Acessos Técnicos</span>
            <span className="text-xs font-bold">{credenciaisList.length} cadastrados</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block mb-0.5">Chamados</span>
            <span className="text-xs font-bold font-mono">{chamadosEmpresa.length} atendimentos</span>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800 gap-2 overflow-x-auto">
        {[
          { id: 'canais', label: 'Canais do Cliente', count: empresa.canais?.length || 0 },
          { id: 'credenciais', label: 'Acessos & Senhas Técnicas', count: credenciaisList.length },
          { id: 'servidor', label: 'Configuração do Servidor', count: `${concluidosChecklist}/${totalChecklist}` },
          { id: 'observacoes', label: 'Anotações & Pedidos', count: empresa.observacoes?.length || 0 },
          { id: 'chamados', label: 'Histórico de Suporte', count: chamadosEmpresa.length },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                isActive
                  ? 'border-[#4d7c0f] dark:border-[#84cc16] text-[#4d7c0f] dark:text-[#84cc16]'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isActive
                  ? 'bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16]'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ============================================================================== */}
      {/* ABA 1: CANAIS DO CLIENTE */}
      {/* ============================================================================== */}
      {activeTab === 'canais' && (
        <div className="space-y-5 animate-fade-in">
          <div className="surface-card rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Canais de Atendimento Contratados
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                WhatsApp API Oficial, WhatsApp QR Code, Facebook Messenger e canais integrados.
              </p>
            </div>

            <button
              onClick={() => setIsAddCanalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-90 flex items-center gap-1.5 transition-all self-start sm:self-auto"
            >
              + Conectar Novo Canal
            </button>
          </div>

          {/* Modal Adicionar Canal */}
          {isAddCanalOpen && (
            <div className="surface-card rounded-3xl p-6 border-2 border-[#4d7c0f]/30 dark:border-[#84cc16]/40 bg-slate-50/70 dark:bg-zinc-900/80 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Conectar Novo Canal</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Informe o tipo e o número de WhatsApp ou ID da página.</p>
                </div>
                <button onClick={() => setIsAddCanalOpen(false)} className="text-xs text-slate-400 hover:text-slate-700">Fechar</button>
              </div>

              <form onSubmit={handleAdicionarCanal} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Tipo de Canal</label>
                    <select
                      value={selectedCanalId}
                      onChange={(e) => setSelectedCanalId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                    >
                      {catalogoCanais.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome} ({c.tipo.toUpperCase()})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Número do WhatsApp / Identificador</label>
                    <input
                      type="text"
                      value={canalNumero}
                      onChange={(e) => setCanalNumero(e.target.value)}
                      placeholder="Ex: +55 11 98888-7777"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Anotação sobre este canal</label>
                  <input
                    type="text"
                    value={canalObs}
                    onChange={(e) => setCanalObs(e.target.value)}
                    placeholder="Ex: Número exclusivo para setor comercial"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setIsAddCanalOpen(false)} className="px-4 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/60">Cancelar</button>
                  <button type="submit" disabled={loadingCanal} className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm">
                    {loadingCanal ? 'Salvando...' : 'Salvar Canal'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Lista de Canais */}
          {(!empresa.canais || empresa.canais.length === 0) ? (
            <div className="surface-card rounded-3xl p-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] text-center space-y-2">
              <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">Nenhum canal adicionado ainda</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Clique em "+ Conectar Novo Canal" para vincular o WhatsApp ou redes sociais.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {empresa.canais.map((c) => (
                <div key={c.canal_id} className="surface-card rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                        {renderCanalIcon(c)}
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{c.nome}</span>
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                        {c.tipo.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-800 dark:text-zinc-200 select-all">
                      {c.identificador_numero || 'Sem identificador'}
                    </p>
                    {c.observacao && (
                      <p className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-zinc-900 p-2 rounded-lg border border-slate-100 dark:border-zinc-800">
                        {c.observacao}
                      </p>
                    )}
                  </div>

                  <button onClick={() => handleRemoverCanal(c.canal_id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors" title="Remover">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================================== */}
      {/* ABA 2: MÚLTIPLOS ACESSOS E SENHAS TÉCNICAS (COM ÍCONE SVG DE OLHO PREMIUM) */}
      {/* ============================================================================== */}
      {activeTab === 'credenciais' && (
        <div className="space-y-5 animate-fade-in">
          
          <div className="surface-card rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Acessos e Senhas Técnicas ({credenciaisList.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Múltiplos logins e senhas com rótulo claro de identificação de usuário ou serviço técnico.
              </p>
            </div>

            <button
              onClick={() => {
                setEditandoCredId(null);
                setCredRotulo('');
                setCredUsuario('');
                setCredSenha('');
                setCredObs('');
                setIsAddCredOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm hover:opacity-90 flex items-center gap-1.5 self-start sm:self-auto transition-all"
            >
              + Adicionar Novo Acesso
            </button>
          </div>

          {/* Modal / Formulário de Cadastro/Edição de Acesso */}
          {isAddCredOpen && (
            <form onSubmit={handleSalvarNovaCredencial} className="surface-card rounded-3xl p-6 border-2 border-[#4d7c0f]/30 dark:border-[#84cc16]/40 bg-slate-50/70 dark:bg-zinc-900/80 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {editandoCredId ? 'Editar Acesso Técnico' : 'Novo Acesso de Suporte'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Identifique claramente de quem é este acesso e onde ele é utilizado.</p>
                </div>
                <button type="button" onClick={() => setIsAddCredOpen(false)} className="text-xs text-slate-400 hover:text-slate-700">Cancelar</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Nome / Rótulo do Acesso <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={credRotulo}
                    onChange={(e) => setCredRotulo(e.target.value)}
                    placeholder="Ex: Painel Admin - Marcos / Servidor SSH Root"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    E-mail ou Usuário de Login
                  </label>
                  <input
                    type="text"
                    value={credUsuario}
                    onChange={(e) => setCredUsuario(e.target.value)}
                    placeholder="Ex: marcos@empresa.com.br ou root"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Senha <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCredSenha(generateSecurePassword(14))}
                      className="text-[11px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline"
                    >
                      ⚡ Gerar senha segura
                    </button>
                  </div>
                  <input
                    type="text"
                    value={credSenha}
                    onChange={(e) => setCredSenha(e.target.value)}
                    placeholder="Digite ou gere a senha"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Observação do Acesso (Opcional)
                  </label>
                  <input
                    type="text"
                    value={credObs}
                    onChange={(e) => setCredObs(e.target.value)}
                    placeholder="Ex: Porta 2222 / 2FA ativo no celular do diretor"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                <button type="button" onClick={() => setIsAddCredOpen(false)} className="px-4 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/60">Cancelar</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm">
                  {editandoCredId ? 'Salvar Alterações' : 'Cadastrar Acesso'}
                </button>
              </div>
            </form>
          )}

          {/* Cards de Múltiplos Acessos */}
          {credenciaisList.length === 0 ? (
            <div className="surface-card rounded-3xl p-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] text-center space-y-2">
              <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">Nenhum acesso técnico cadastrado</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Clique em "+ Adicionar Novo Acesso" para salvar as credenciais de administradores e servidores.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {credenciaisList.map((cred) => {
                const isRevelada = Boolean(senhasReveladas[cred.id]);
                const copiado = copiadoId === cred.id;

                return (
                  <div
                    key={cred.id}
                    className="surface-card rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-3 shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                          Função / Rótulo do Acesso
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{cred.rotulo}</span>
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 self-start sm:self-auto">
                        <button
                          onClick={() => handleEditarCredencial(cred)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleExcluirCredencial(cred.id)}
                          className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/30 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-semibold transition-all"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Usuário / E-mail */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Login / E-mail
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-800 dark:text-zinc-200 select-all">
                            {cred.usuario_email || 'Não informado'}
                          </span>
                        </div>
                        {cred.usuario_email && (
                          <button
                            onClick={() => handleCopiarTexto(cred.usuario_email, `usr_${cred.id}`)}
                            className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 hover:underline"
                          >
                            {copiadoId === `usr_${cred.id}` ? '✓ Copiado' : 'Copiar'}
                          </button>
                        )}
                      </div>

                      {/* Senha Protegida com Ícone SVG de Olho Premium */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Senha
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-900 dark:text-white select-all">
                            {isRevelada ? (
                              <span className="text-[#4d7c0f] dark:text-[#84cc16] font-bold">{cred.senha}</span>
                            ) : (
                              <span>{maskPassword(cred.senha)}</span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleVerSenha(cred)}
                            className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-zinc-800 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-300 flex items-center gap-1.5"
                            title={isRevelada ? 'Ocultar Senha' : 'Ver Senha (Registra Auditoria LGPD)'}
                          >
                            {isRevelada ? (
                              <>
                                <EyeOffIcon className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                                <span>Ocultar</span>
                              </>
                            ) : (
                              <>
                                <EyeIcon className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-400" />
                                <span>Ver</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopiarTexto(cred.senha, cred.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-zinc-800 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-300"
                          >
                            {copiado ? '✓ Copiado' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {cred.observacao && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 italic bg-slate-50 dark:bg-zinc-900 p-2 rounded-lg border border-slate-100 dark:border-zinc-800">
                        Observação: {cred.observacao}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ============================================================================== */}
      {/* ABA 3: CONFIGURAÇÃO DO SERVIDOR & FORMATO COM BOTÃO SALVAR */}
      {/* ============================================================================== */}
      {activeTab === 'servidor' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Seção 1: Formato de Atendimento */}
          <div className="surface-card rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  1. Formato de Conversa com Clientes
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Defina se as mensagens serão compartilhadas entre todos ou isoladas por atendente.
                </p>
              </div>

              <button
                onClick={handleSalvarFormato}
                disabled={salvandoFormato}
                className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90 transition-all self-start sm:self-auto"
              >
                {salvandoFormato ? 'Salvando...' : '💾 Salvar Formato de Atendimento'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div
                onClick={() => setFormatoSelecionado('colaborativo')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  formatoSelecionado === 'colaborativo'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7]/80 dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                    : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold">Formato Colaborativo</span>
                  {formatoSelecionado === 'colaborativo' && (
                    <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓ Selecionado</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  Fila única onde todos os atendentes compartilham e visualizam as conversas da empresa.
                </p>
              </div>

              <div
                onClick={() => setFormatoSelecionado('individual')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  formatoSelecionado === 'individual'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7]/80 dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                    : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold">Formato Individual</span>
                  {formatoSelecionado === 'individual' && (
                    <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓ Selecionado</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  Cada atendente acessa em sigilo apenas as conversas dos clientes sob sua responsabilidade.
                </p>
              </div>
            </div>
          </div>

          {/* Seção 2: Classificação de Servidor (Servidor 1 vs Servidor 2) */}
          <div className="surface-card rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  2. Servidor Alocado
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Classifique a empresa entre Servidor 1 (Principal) ou Servidor 2 (Expansão).
                </p>
              </div>

              <button
                onClick={handleSalvarServidor}
                disabled={salvandoServidor}
                className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90 transition-all self-start sm:self-auto"
              >
                {salvandoServidor ? 'Salvando...' : '💾 Salvar Servidor'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div
                onClick={() => setServidorSelecionado('servidor_1')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  servidorSelecionado === 'servidor_1'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7]/80 dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                    : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-slate-600 dark:text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">Servidor 1 (Principal)</span>
                  {servidorSelecionado === 'servidor_1' && <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓ Selecionado</span>}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Cluster primário de alta disponibilidade.</p>
              </div>

              <div
                onClick={() => setServidorSelecionado('servidor_2')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  servidorSelecionado === 'servidor_2'
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#f7fee7]/80 dark:bg-[#84cc16]/10 text-slate-900 dark:text-white shadow-sm'
                    : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-slate-600 dark:text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">Servidor 2 (Expansão)</span>
                  {servidorSelecionado === 'servidor_2' && <span className="text-xs font-bold text-[#4d7c0f] dark:text-[#84cc16]">✓ Selecionado</span>}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Cluster secundário para grandes contas e expansão.</p>
              </div>
            </div>
          </div>

          {/* Seção 3: Checklist de Requisitos do Servidor */}
          <div className="surface-card rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  3. Checklist de Requisitos do Servidor
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Requisitos técnicos aplicados a esta empresa.
                </p>
              </div>
              <span className="text-xs font-bold font-mono">
                {concluidosChecklist} / {totalChecklist} ({pctChecklist}%)
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div className="h-full bg-[#4d7c0f] dark:bg-[#84cc16]" style={{ width: `${pctChecklist}%` }}></div>
            </div>

            <div className="space-y-2.5 pt-2">
              {checklistFiltrado.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Nenhum requisito cadastrado ainda. O administrador pode cadastrar os requisitos na aba "Servidores" ou adicionar um novo abaixo.
                </div>
              ) : (
                checklistFiltrado.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      item.concluido
                        ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-800/40 dark:bg-emerald-950/10'
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.concluido}
                        onChange={() => handleToggleChecklist(item)}
                        className="mt-1 w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16] cursor-pointer"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${item.concluido ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                            {item.titulo}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">{item.categoria || 'Servidor'}</span>
                        </div>
                        {item.descricao && <p className="text-[11px] text-slate-500 dark:text-zinc-400">{item.descricao}</p>}
                        <input
                          type="text"
                          defaultValue={item.observacao || ''}
                          onBlur={(e) => handleSalvarObsChecklist(item, e.target.value)}
                          placeholder="Anotação deste requisito (ex: IP, porta, credencial)..."
                          className="w-full px-2.5 py-1 rounded bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[11px] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {!isAddReqOpen ? (
              <button onClick={() => setIsAddReqOpen(true)} className="text-xs font-semibold text-[#4d7c0f] dark:text-[#84cc16] hover:underline pt-1">
                + Adicionar requisito específico para esta empresa
              </button>
            ) : (
              <form onSubmit={handleAdicionarRequisito} className="p-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 space-y-2.5">
                <input
                  type="text"
                  value={novoReqTitulo}
                  onChange={(e) => setNovoReqTitulo(e.target.value)}
                  placeholder="Nome do requisito (ex: Instalar Redis / Webhook secundário)"
                  required
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsAddReqOpen(false)} className="text-xs text-slate-500">Cancelar</button>
                  <button type="submit" disabled={loadingChecklist} className="px-3 py-1 bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs rounded-lg">
                    Salvar
                  </button>
                </div>
              </form>
            )}
          </div>

        </div>
      )}

      {/* ============================================================================== */}
      {/* ABA 4: OBSERVAÇÕES & ANOTAÇÕES (COM INTEGRAÇÃO AUTOMÁTICA DE SUPORTE) */}
      {/* ============================================================================== */}
      {activeTab === 'observacoes' && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Banner Informativo */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400">
            <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
              Histórico Central de Observações & Chamados
            </span>
            <p className="text-[11px] leading-relaxed">
              Toda observação ou solução informada ao finalizar um chamado de suporte é registrada automaticamente neste histórico para acompanhamento da equipe.
            </p>
          </div>

          <div className="surface-card rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Anotações e Histórico Geral</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Cadastre avisos manuais ou consulte as resoluções de suporte.</p>
            </div>
            <button onClick={() => setIsAddObsOpen(true)} className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm">
              + Nova Anotação
            </button>
          </div>

          {isAddObsOpen && (
            <form onSubmit={handleSalvarObservacao} className="surface-card rounded-3xl p-6 border-2 border-[#4d7c0f]/30 dark:border-[#84cc16]/40 bg-slate-50/70 dark:bg-zinc-900/80 space-y-3 animate-fade-in">
              <input
                type="text"
                value={novaObsTitulo}
                onChange={(e) => setNovaObsTitulo(e.target.value)}
                placeholder="Título do aviso"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
              />
              <textarea
                rows={4}
                value={novaObsConteudo}
                onChange={(e) => setNovaObsConteudo(e.target.value)}
                placeholder="Detalhes da anotação..."
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none leading-relaxed"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setIsAddObsOpen(false)} className="px-4 py-2 text-xs text-slate-600">Cancelar</button>
                <button type="submit" disabled={loadingObs} className="px-4 py-2 bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs rounded-xl shadow-sm">
                  {loadingObs ? 'Salvando...' : 'Salvar Anotação'}
                </button>
              </div>
            </form>
          )}

          {(!empresa.observacoes || empresa.observacoes.length === 0) ? (
            <div className="surface-card rounded-3xl p-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] text-center text-xs text-slate-500">
              Nenhuma anotação registrada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {empresa.observacoes.map((obs) => (
                <div key={obs.id} className="surface-card rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{obs.titulo || 'Anotação'}</h3>
                      {obs.tipo === 'suporte' && (
                        <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                          Resolução de Suporte
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">{new Date(obs.created_at).toLocaleDateString('pt-BR')}</span>
                      <button onClick={() => handleRemoverObservacao(obs.id)} className="text-slate-400 hover:text-red-500">×</button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{obs.conteudo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================================== */}
      {/* ABA 5: HISTÓRICO DE SUPORTE */}
      {/* ============================================================================== */}
      {activeTab === 'chamados' && (
        <div className="space-y-5 animate-fade-in">
          <div className="surface-card rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Histórico de Atendimentos ({chamadosEmpresa.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Todos os atendimentos realizados para {empresa.nome}.
              </p>
            </div>

            {!chamadoAtivo && (
              <button
                onClick={handleIniciarSuporte}
                className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-xs font-bold shadow-sm"
              >
                + Iniciar Novo Atendimento
              </button>
            )}
          </div>

          {chamadosEmpresa.length === 0 ? (
            <div className="surface-card rounded-3xl p-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] text-center text-xs text-slate-500">
              Nenhum suporte registrado para esta empresa ainda. Clique em "Iniciar Atendimento de Suporte" no topo para começar.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800 surface-card rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] overflow-hidden">
              {chamadosEmpresa.map((ch) => (
                <div key={ch.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        ch.status === 'finalizado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {ch.status === 'finalizado' ? 'Finalizado' : 'Em Andamento'}
                      </span>
                      {ch.motivo && <span className="text-xs font-bold text-slate-900 dark:text-white">{ch.motivo}</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Por: {ch.tecnico_email} • Início: {new Date(ch.iniciado_em).toLocaleString('pt-BR')}
                    </p>
                    {ch.observacoes && <p className="text-xs text-slate-600 dark:text-zinc-400 italic mt-1">{ch.observacoes}</p>}
                  </div>

                  <div className="text-right font-mono self-end sm:self-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      {ch.status === 'finalizado' ? formatarTempo(ch.duracao_segundos) : 'Em andamento'}
                    </span>
                    <span className="text-[10px] text-slate-400">Duração</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL DE ENCERRAMENTO LIMPO (SEM BORRÃO QUADRADO RECORTADO) */}
      {/* ============================================================================== */}
      {isFinalizarModalOpen && (
        <div className="fixed inset-0 w-screen h-screen z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Finalizar Suporte Técnico
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{empresa.nome}</p>
              </div>
              <button onClick={handleCancelarFinalizacao} className="text-xs font-semibold text-slate-400 hover:text-slate-700">
                Voltar
              </button>
            </div>

            {/* Duração Congelada com Clareza */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs">
              <span className="text-slate-500 block mb-0.5">Duração do Atendimento:</span>
              <strong className="text-lg font-mono text-[#4d7c0f] dark:text-[#84cc16]">
                {formatarTempo(tempoCongelado !== null ? tempoCongelado : tempoSuporteSegundos)}
              </strong>
            </div>

            <form onSubmit={handleConfirmarFinalizarSuporte} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Motivo Principal do Chamado <span className="text-red-500">*</span>
                </label>
                <select
                  value={motivoFinalizacao}
                  onChange={(e) => setMotivoFinalizacao(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white font-medium focus:outline-none"
                >
                  {motivosSuporte.map((m) => (
                    <option key={m.id} value={m.nome}>{m.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Resumo da Solução ou Providência (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={obsFinalizacao}
                  onChange={(e) => setObsFinalizacao(e.target.value)}
                  placeholder="Ex: Senha redefinida e entregue para o cliente / QR Code reconectado."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleCancelarFinalizacao}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  Voltar e Continuar Atendimento
                </button>
                <button
                  type="submit"
                  disabled={salvandoFinalizacao}
                  className="px-5 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90"
                >
                  {salvandoFinalizacao ? 'Salvando...' : 'Confirmar e Encerrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
