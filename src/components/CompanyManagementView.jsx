'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  cancelarSuporte,
  getChamadoAtivo,
  getChamadosSuporte,
  isMockDataEnabled
} from '@/lib/storage';
import { generateSecurePassword } from '@/lib/security';
import { 
  MessageChannelIcon, 
  FacebookIcon, 
  InstagramIcon, 
  TelegramIcon, 
  EyeIcon, 
  EyeOffIcon,
  ViewGridIcon,
  ViewListIcon,
  SaveIcon,
  CopyIcon,
  AppleKeyIcon,
  SparklesIcon,
  PlayIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  EditIcon
} from './Icons';
import SupportCompletionModal from './SupportCompletionModal';

export default function CompanyManagementView({ empresa, onBack, onUpdated, userEmail }) {
  const [activeTab, setActiveTab] = useState('canais'); // 'canais' | 'credenciais' | 'servidor' | 'observacoes' | 'chamados'
  const [catalogoCanais, setCatalogoCanais] = useState([]);
  
  // Modos de Exibição (Cards vs Lista)
  const [canaisViewMode, setCanaisViewMode] = useState('grid'); // 'grid' | 'list'
  const [credenciaisViewMode, setCredenciaisViewMode] = useState('cards'); // 'cards' | 'list'

  useEffect(() => {
    const savedC = localStorage.getItem('rm_canais_view_mode');
    if (savedC === 'list' || savedC === 'grid') setCanaisViewMode(savedC);

    const savedK = localStorage.getItem('rm_credenciais_view_mode');
    if (savedK === 'list' || savedK === 'cards') setCredenciaisViewMode(savedK);
  }, []);

  const handleChangeCanaisViewMode = (mode) => {
    setCanaisViewMode(mode);
    localStorage.setItem('rm_canais_view_mode', mode);
  };

  const handleChangeCredenciaisViewMode = (mode) => {
    setCredenciaisViewMode(mode);
    localStorage.setItem('rm_credenciais_view_mode', mode);
  };

  // Suporte em Tempo Real
  const [chamadoAtivo, setChamadoAtivo] = useState(null);
  const [tempoSuporteSegundos, setTempoSuporteSegundos] = useState(0);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);

  // Formato de Atendimento e Servidor Alocado
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

  // Cronômetro do Suporte Ativo
  useEffect(() => {
    if (!chamadoAtivo) {
      setTempoSuporteSegundos(0);
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
  }, [chamadoAtivo]);

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
      showToast('Atendimento de suporte iniciado com cronômetro em tempo real!');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Cancelar Suporte (sem redundância)
  const handleCancelarChamado = async () => {
    if (!chamadoAtivo) return;
    if (!confirm('Deseja realmente cancelar este atendimento de suporte? O tempo e registro serão descartados.')) return;
    try {
      await cancelarSuporte({ chamado_id: chamadoAtivo.id, userEmail });
      setChamadoAtivo(null);
      showToast('Chamado de suporte cancelado com sucesso.');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Salvar Formato de Atendimento
  const handleSalvarFormato = async () => {
    try {
      setSalvandoFormato(true);
      await updateEmpresa(empresa.id, { formato_atendimento: formatoSelecionado }, userEmail);
      empresa.formato_atendimento = formatoSelecionado;
      showToast(`Formato salvo: ${formatoSelecionado === 'colaborativo' ? 'Colaborativo' : 'Individual'}`);
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

  // Checklist de Requisitos
  const checklistFiltrado = (empresa.checklist || []).filter((item) => {
    if (!isMockDataEnabled() && item.id.includes('mock')) return false;
    return true;
  });

  const totalChecklist = checklistFiltrado.length;
  const concluidosChecklist = checklistFiltrado.filter((c) => c.concluido).length;
  const pctChecklist = totalChecklist > 0 ? Math.round((concluidosChecklist / totalChecklist) * 100) : 0;
  const chamadosEmpresa = getChamadosSuporte({ empresa_id: empresa.id });

  // Ícones de Canal (Puro SVG minimalista, zero ícone de WhatsApp)
  const renderCanalIcon = (c) => {
    const nomeLower = (c.nome || '').toLowerCase();
    if (nomeLower.includes('whatsapp') || nomeLower.includes('api') || nomeLower.includes('qrcode')) {
      return <MessageChannelIcon className="w-4 h-4 text-[#4d7c0f] dark:text-[#84cc16]" />;
    }
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
      showToast('Canal vinculado com sucesso!');
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
    <div className="space-y-6 text-[#0a0a0c] dark:text-[#ffffff] pb-16">
      
      {/* Barra de Retorno e Controles de Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-[#16161a] text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 shadow-xs transition-all self-start"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>Voltar para a lista de empresas</span>
        </button>

        {/* Ações de Suporte (Sem redundância: Concluir ou Cancelar se ativo; Iniciar se inativo) */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!chamadoAtivo ? (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleIniciarSuporte}
              className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-95 flex items-center gap-2 transition-all cursor-pointer"
            >
              <PlayIcon className="w-3.5 h-3.5" />
              <span>Iniciar Atendimento de Suporte</span>
            </motion.button>
          ) : (
            <div className="flex items-center gap-2 p-1.5 pl-3.5 rounded-full bg-amber-500/15 border border-amber-500/30 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 font-mono tabular-nums">
                {formatarTempo(tempoSuporteSegundos)}
              </span>
              
              <button
                onClick={() => setIsFinalizarModalOpen(true)}
                className="px-4 py-1.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs hover:opacity-95 transition-all shadow-xs ml-1 flex items-center gap-1.5 cursor-pointer"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>Concluir Chamado</span>
              </button>

              <button
                onClick={handleCancelarChamado}
                className="p-1.5 rounded-full hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-all cursor-pointer"
                title="Cancelar atendimento"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {toast.text && (
        <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-sm ${
          toast.type === 'error'
            ? 'bg-red-500/10 text-red-700 border border-red-500/30 dark:text-red-300'
            : 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 dark:text-emerald-300'
        }`}>
          <span>{toast.text}</span>
        </div>
      )}

      {/* ============================================================================== */}
      {/* LAYOUT DIVIDIDO EM 2 COLUNAS (SPLIT-VIEW PARA NOTEBOOKS E TELAS LARGAS) */}
      {/* ============================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COLUNA ESQUERDA: INFORMAÇÕES ENGESSADAS DA EMPRESA (SIDEBAR ~35%) */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-4 lg:sticky lg:top-20">
          
          {/* Cartão de Identidade & Status da Empresa */}
          <div className="rounded-3xl p-6 border border-black/10 dark:border-white/12 bg-white dark:bg-[#16161a] shadow-sm space-y-5">
            
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4d7c0f]/20 to-[#84cc16]/25 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-xl flex items-center justify-center border border-[#4d7c0f]/30 flex-shrink-0">
                {empresa.nome.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold tracking-tight text-[#0a0a0c] dark:text-white truncate">
                    {empresa.nome}
                  </h1>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Empresa Ativa
                  </span>
                  {empresa.is_mock && (
                    <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      Mock Dev
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Configuração de Servidor Alocado */}
            <div className="pt-4 border-t border-black/8 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-zinc-300">Servidor Alocado</span>
                <button
                  type="button"
                  onClick={handleSalvarServidor}
                  disabled={salvandoServidor}
                  className="text-[11px] font-bold text-[#4d7c0f] dark:text-[#84cc16] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {salvandoServidor ? 'Salvando...' : (
                    <>
                      <SaveIcon className="w-3 h-3" />
                      <span>Salvar</span>
                    </>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setServidorSelecionado('servidor_1')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${
                    servidorSelecionado === 'servidor_1'
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 text-[#0a0a0c] dark:text-white'
                      : 'border-black/10 dark:border-white/10 text-slate-500'
                  }`}
                >
                  Servidor 1
                </button>
                <button
                  type="button"
                  onClick={() => setServidorSelecionado('servidor_2')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${
                    servidorSelecionado === 'servidor_2'
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 text-[#0a0a0c] dark:text-white'
                      : 'border-black/10 dark:border-white/10 text-slate-500'
                  }`}
                >
                  Servidor 2
                </button>
              </div>
            </div>

            {/* Configuração de Formato de Atendimento */}
            <div className="pt-4 border-t border-black/8 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-zinc-300">Formato de Conversa</span>
                <button
                  type="button"
                  onClick={handleSalvarFormato}
                  disabled={salvandoFormato}
                  className="text-[11px] font-bold text-[#4d7c0f] dark:text-[#84cc16] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {salvandoFormato ? 'Salvando...' : (
                    <>
                      <SaveIcon className="w-3 h-3" />
                      <span>Salvar</span>
                    </>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormatoSelecionado('colaborativo')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${
                    formatoSelecionado === 'colaborativo'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                      : 'border-black/10 dark:border-white/10 text-slate-500'
                  }`}
                >
                  Colaborativo
                </button>
                <button
                  type="button"
                  onClick={() => setFormatoSelecionado('individual')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${
                    formatoSelecionado === 'individual'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-black/10 dark:border-white/10 text-slate-500'
                  }`}
                >
                  Individual
                </button>
              </div>
            </div>

            {/* Indicadores Rápidos da Empresa */}
            <div className="pt-4 border-t border-black/8 dark:border-white/10 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Canais Ativos:</span>
                <span className="font-bold text-[#0a0a0c] dark:text-white">{empresa.canais?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Acessos Técnicos:</span>
                <span className="font-bold text-[#0a0a0c] dark:text-white">{credenciaisList.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Chamados Registrados:</span>
                <span className="font-mono font-bold text-[#0a0a0c] dark:text-white">{chamadosEmpresa.length}</span>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-500 dark:text-zinc-400">Progresso do Setup:</span>
                  <span className="font-mono font-bold text-[#0a0a0c] dark:text-white tabular-nums">
                    {concluidosChecklist}/{totalChecklist} ({pctChecklist}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#4d7c0f] to-[#84cc16] transition-all duration-500"
                    style={{ width: `${pctChecklist}%` }}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Cartão de Suporte Ativo em Tempo Real (se houver para esta empresa) */}
          {chamadoAtivo && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl p-5 border-2 border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 space-y-3.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                    Suporte em Aberto
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Ao Vivo</span>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-500/20 text-center">
                <span className="text-[11px] text-slate-500 block mb-0.5">Tempo Decorrido:</span>
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatarTempo(tempoSuporteSegundos)}
                </span>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  Operador: {chamadoAtivo.tecnico_email}
                </p>
              </div>

              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 text-center font-medium leading-relaxed pt-1">
                Atendimento ativo. Utilize o botão <span className="font-bold underline">Concluir Chamado</span> no topo para finalizar.
              </p>
            </motion.div>
          )}

        </div>

        {/* COLUNA DIREITA: CONTEÚDO DINÂMICO EM ABAS (~65%) */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-5">
          
          {/* Abas Apple Minimalistas */}
          <div className="flex border-b border-black/8 dark:border-white/10 gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'canais', label: 'Canais de Atendimento', count: empresa.canais?.length || 0 },
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
                  className={`py-2.5 px-3.5 text-xs font-semibold rounded-2xl transition-all whitespace-nowrap flex items-center gap-2 ${
                    isActive
                      ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? 'bg-white/20 dark:bg-black/20 text-white dark:text-black'
                      : 'bg-black/5 dark:bg-white/10 text-slate-500 dark:text-zinc-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ============================================================================== */}
          {/* ABA 1: CANAIS DE ATENDIMENTO (REDESENHADA, LUXUOSA E SEM ÍCONES DE WHATSAPP) */}
          {/* ============================================================================== */}
          {activeTab === 'canais' && (
            <div className="space-y-4">
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                    Canais de Mensageria Contratados
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Canais API Oficial Cloud, instâncias pareadas por QR Code e redes sociais.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
                  {/* Alternador de Visualização Cards / Lista */}
                  <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => handleChangeCanaisViewMode('grid')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                        canaisViewMode === 'grid'
                          ? 'bg-white dark:bg-zinc-800 text-[#0a0a0c] dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-[#0a0a0c] dark:hover:text-white'
                      }`}
                      title="Exibir canais em Cards"
                    >
                      <ViewGridIcon className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeCanaisViewMode('list')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                        canaisViewMode === 'list'
                          ? 'bg-white dark:bg-zinc-800 text-[#0a0a0c] dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-[#0a0a0c] dark:hover:text-white'
                      }`}
                      title="Exibir canais em Lista Detalhada"
                    >
                      <ViewListIcon className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Lista</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setIsAddCanalOpen(true)}
                    className="px-4 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black text-xs font-bold shadow-sm hover:opacity-90 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    + Conectar Novo Canal
                  </button>
                </div>
              </div>

              {/* Formulário / Drawer de Adicionar Canal */}
              <AnimatePresence>
                {isAddCanalOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-3xl p-6 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-zinc-900/90 space-y-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[#0a0a0c] dark:text-white">Conectar Novo Canal</h3>
                        <p className="text-xs text-slate-500">Selecione o tipo técnico e insira o número ou identificador.</p>
                      </div>
                      <button onClick={() => setIsAddCanalOpen(false)} className="text-xs text-slate-400 hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer">
                        <XMarkIcon className="w-3.5 h-3.5" />
                        <span>Fechar</span>
                      </button>
                    </div>

                    <form onSubmit={handleAdicionarCanal} className="space-y-4">
                      {/* Seleção Visual de Tipo */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Selecione o Tipo de Canal
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {catalogoCanais.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedCanalId(c.id)}
                              className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                                selectedCanalId === c.id
                                  ? 'border-black dark:border-white bg-white dark:bg-zinc-800 shadow-sm'
                                  : 'border-black/8 dark:border-white/10 bg-white/50 dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                                {renderCanalIcon(c)}
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-bold block truncate">{c.nome}</span>
                                <span className="text-[10px] text-slate-400 uppercase font-mono">{c.tipo}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Número / Identificador da Instância
                          </label>
                          <input
                            type="text"
                            value={canalNumero}
                            onChange={(e) => setCanalNumero(e.target.value)}
                            placeholder="Ex: +55 11 98888-7777"
                            required
                            className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs font-mono focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Observação (Opcional)
                          </label>
                          <input
                            type="text"
                            value={canalObs}
                            onChange={(e) => setCanalObs(e.target.value)}
                            placeholder="Ex: Instância exclusiva do setor de vendas"
                            className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setIsAddCanalOpen(false)} className="px-4 py-2 rounded-full text-xs text-slate-600 hover:bg-black/5">Cancelar</button>
                        <button type="submit" disabled={loadingCanal} className="px-5 py-2 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs shadow-sm hover:opacity-90">
                          {loadingCanal ? 'Vinculando...' : 'Salvar Canal'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Lista de Canais Ativos */}
              {(!empresa.canais || empresa.canais.length === 0) ? (
                <div className="rounded-3xl p-10 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] text-center space-y-2">
                  <p className="text-sm font-bold text-[#0a0a0c] dark:text-white">Nenhum canal conectado ainda</p>
                  <p className="text-xs text-slate-500">Vincule a primeira instância ou canal de mensageria da empresa.</p>
                </div>
              ) : canaisViewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {empresa.canais.map((c) => (
                    <div key={c.canal_id} className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] flex items-start justify-between gap-3 shadow-sm hover:shadow-md transition-all">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                            {renderCanalIcon(c)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[#0a0a0c] dark:text-white block truncate">{c.nome}</span>
                            <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-slate-600 dark:text-zinc-400">
                              {c.tipo}
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-xs font-mono font-bold text-slate-800 dark:text-zinc-200 select-all pl-1">
                          {c.identificador_numero || 'Sem identificador'}
                        </p>

                        {c.observacao && (
                          <p className="text-[11px] text-slate-500 italic bg-black/[0.02] dark:bg-white/[0.04] p-2.5 rounded-xl border border-black/5 dark:border-white/5">
                            {c.observacao}
                          </p>
                        )}
                      </div>

                      <button onClick={() => handleRemoverCanal(c.canal_id)} className="p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-500/10 transition-colors" title="Desconectar canal">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                /* Visualização em Lista de Canais (Estilo Tabela Apple) */
                <div className="rounded-3xl border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
                  <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 border-b border-black/5 dark:border-white/6 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 bg-black/[0.01] dark:bg-white/[0.02]">
                    <div className="col-span-4">Canal / Categoria</div>
                    <div className="col-span-4">Identificador / Número</div>
                    <div className="col-span-3">Observação Técnica</div>
                    <div className="col-span-1 text-right">Ação</div>
                  </div>

                  <div className="divide-y divide-black/5 dark:divide-white/6">
                    {empresa.canais.map((c) => (
                      <div key={c.canal_id} className="p-4 sm:px-5 sm:py-3.5 flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:gap-3 items-start sm:items-center hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                        <div className="sm:col-span-4 flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                            {renderCanalIcon(c)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[#0a0a0c] dark:text-white block truncate">{c.nome}</span>
                            <span className="text-[9px] uppercase font-mono font-semibold text-slate-400">
                              {c.tipo}
                            </span>
                          </div>
                        </div>

                        <div className="sm:col-span-4 flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-800 dark:text-zinc-200 select-all">
                            {c.identificador_numero || 'Sem identificador'}
                          </span>
                          {c.identificador_numero && (
                            <button
                              type="button"
                              onClick={() => handleCopiarTexto(c.identificador_numero, c.canal_id)}
                              className="text-[10px] text-slate-400 hover:text-black dark:hover:text-white"
                            >
                              Copiar
                            </button>
                          )}
                        </div>

                        <div className="sm:col-span-3 min-w-0">
                          <span className="text-[11px] text-slate-500 italic truncate block">
                            {c.observacao || '-'}
                          </span>
                        </div>

                        <div className="sm:col-span-1 flex items-center justify-end w-full sm:w-auto">
                          <button
                            onClick={() => handleRemoverCanal(c.canal_id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-500/10 transition-colors"
                            title="Desconectar canal"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 2: ACESSOS & SENHAS TÉCNICAS (ESTILO APPLE KEYCHAIN) */}
          {/* ============================================================================== */}
          {activeTab === 'credenciais' && (
            <div className="space-y-4">
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                    Acessos e Senhas Técnicas ({credenciaisList.length})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Chaves de acesso criptografadas com auditoria de visualização LGPD.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
                  {/* Alternador de Visualização Cards / Lista */}
                  <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => handleChangeCredenciaisViewMode('cards')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                        credenciaisViewMode === 'cards'
                          ? 'bg-white dark:bg-zinc-800 text-[#0a0a0c] dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-[#0a0a0c] dark:hover:text-white'
                      }`}
                      title="Exibir acessos em Cards"
                    >
                      <ViewGridIcon className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeCredenciaisViewMode('list')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                        credenciaisViewMode === 'list'
                          ? 'bg-white dark:bg-zinc-800 text-[#0a0a0c] dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-[#0a0a0c] dark:hover:text-white'
                      }`}
                      title="Exibir acessos em Lista / Tabela Keychain"
                    >
                      <ViewListIcon className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Lista</span>
                    </button>
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
                    className="px-4 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black text-xs font-bold shadow-sm hover:opacity-90 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    + Adicionar Novo Acesso
                  </button>
                </div>
              </div>

              {/* Formulário Novo Acesso */}
              <AnimatePresence>
                {isAddCredOpen && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleSalvarNovaCredencial}
                    className="rounded-3xl p-6 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-zinc-900/90 space-y-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[#0a0a0c] dark:text-white">
                          {editandoCredId ? 'Editar Acesso Técnico' : 'Novo Acesso de Suporte'}
                        </h3>
                        <p className="text-xs text-slate-500">Defina o rótulo do serviço e as credenciais.</p>
                      </div>
                      <button type="button" onClick={() => setIsAddCredOpen(false)} className="text-xs text-slate-400 hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer">
                        <XMarkIcon className="w-3.5 h-3.5" />
                        <span>Cancelar</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Rótulo / Nome do Acesso <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={credRotulo}
                          onChange={(e) => setCredRotulo(e.target.value)}
                          placeholder="Ex: Painel Admin - Diretor / Servidor SSH"
                          required
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          E-mail ou Usuário de Login
                        </label>
                        <input
                          type="text"
                          value={credUsuario}
                          onChange={(e) => setCredUsuario(e.target.value)}
                          placeholder="Ex: admin@empresa.com.br"
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between pl-1">
                          <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            Senha <span className="text-red-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setCredSenha(generateSecurePassword(14))}
                            className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <SparklesIcon className="w-3 h-3" />
                            <span>Gerar Senha Segura</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={credSenha}
                          onChange={(e) => setCredSenha(e.target.value)}
                          placeholder="Senha de acesso"
                          required
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs font-mono focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Observação Técnica (Opcional)
                        </label>
                        <input
                          type="text"
                          value={credObs}
                          onChange={(e) => setCredObs(e.target.value)}
                          placeholder="Ex: Requer 2FA no celular do cliente"
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => setIsAddCredOpen(false)} className="px-4 py-2 rounded-full text-xs text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">Cancelar</button>
                      <button type="submit" className="px-5 py-2 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs shadow-sm hover:opacity-90 flex items-center gap-1.5 cursor-pointer">
                        <SaveIcon className="w-3.5 h-3.5" />
                        <span>{editandoCredId ? 'Salvar Alterações' : 'Cadastrar Acesso'}</span>
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Cards de Acessos Apple Style */}
              {credenciaisList.length === 0 ? (
                <div className="rounded-3xl p-10 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] text-center space-y-2">
                  <p className="text-sm font-bold text-[#0a0a0c] dark:text-white">Nenhum acesso cadastrado</p>
                  <p className="text-xs text-slate-500">Adicione credenciais para documentar os acessos desta empresa.</p>
                </div>
              ) : credenciaisViewMode === 'cards' ? (
                <div className="grid grid-cols-1 gap-3.5">
                  {credenciaisList.map((cred) => {
                    const isRevelada = Boolean(senhasReveladas[cred.id]);
                    const copiado = copiadoId === cred.id;

                    return (
                      <div
                        key={cred.id}
                        className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] space-y-3 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 flex items-center justify-center text-[#4d7c0f] dark:text-[#84cc16] font-bold text-xs border border-[#4d7c0f]/20">
                              <AppleKeyIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-[#0a0a0c] dark:text-white">{cred.rotulo}</h3>
                              {cred.ultima_alteracao && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Atualizado em {new Date(cred.ultima_alteracao).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-center">
                            <button
                              onClick={() => handleEditarCredencial(cred)}
                              className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 transition-all cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleExcluirCredencial(cred.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Excluir"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Usuário / E-mail:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-zinc-200 select-all">
                                {cred.usuario_email || 'Não informado'}
                              </span>
                            </div>
                            {cred.usuario_email && (
                              <button
                                onClick={() => handleCopiarTexto(cred.usuario_email, cred.id + '_u')}
                                className="text-[10px] font-semibold text-slate-500 hover:text-black dark:hover:text-white cursor-pointer"
                              >
                                {copiado ? 'Copiado!' : 'Copiar'}
                              </button>
                            )}
                          </div>

                          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Senha:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-zinc-200 select-all">
                                {isRevelada ? cred.senha : '••••••••••••'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleVerSenha(cred)}
                                className="text-slate-400 hover:text-black dark:hover:text-white p-1 cursor-pointer"
                                title={isRevelada ? 'Ocultar' : 'Visualizar senha'}
                              >
                                {isRevelada ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleCopiarTexto(cred.senha, cred.id + '_s')}
                                className="text-[10px] font-semibold text-slate-500 hover:text-black dark:hover:text-white cursor-pointer"
                              >
                                Copiar
                              </button>
                            </div>
                          </div>
                        </div>

                        {cred.observacao && (
                          <p className="text-[11px] text-slate-500 italic bg-black/[0.01] dark:bg-white/[0.02] p-2.5 rounded-xl border border-black/5 dark:border-white/5">
                            {cred.observacao}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Visualização em Lista / Tabela Keychain */
                <div className="rounded-3xl border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
                  <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-3 border-b border-black/5 dark:border-white/6 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 bg-black/[0.01] dark:bg-white/[0.02]">
                    <div className="col-span-3">Rótulo do Acesso</div>
                    <div className="col-span-3">Login / E-mail</div>
                    <div className="col-span-3">Senha Protegida</div>
                    <div className="col-span-2">Observação</div>
                    <div className="col-span-1 text-right">Ações</div>
                  </div>

                  <div className="divide-y divide-black/5 dark:divide-white/6">
                    {credenciaisList.map((cred) => {
                      const isRevelada = Boolean(senhasReveladas[cred.id]);
                      const copiadoU = copiadoId === cred.id + '_u';
                      const copiadoS = copiadoId === cred.id + '_s';

                      return (
                        <div key={cred.id} className="p-4 sm:px-5 sm:py-3.5 flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                          {/* Rótulo */}
                          <div className="lg:col-span-3 flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-lg bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10 flex items-center justify-center text-xs flex-shrink-0 border border-[#4d7c0f]/20">
                              <AppleKeyIcon className="w-3.5 h-3.5 text-[#4d7c0f] dark:text-[#84cc16]" />
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-[#0a0a0c] dark:text-white block truncate">{cred.rotulo}</span>
                              {cred.ultima_alteracao && (
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {new Date(cred.ultima_alteracao).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Login / E-mail */}
                          <div className="lg:col-span-3 flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold text-slate-800 dark:text-zinc-200 select-all truncate">
                              {cred.usuario_email || 'Não informado'}
                            </span>
                            {cred.usuario_email && (
                              <button
                                type="button"
                                onClick={() => handleCopiarTexto(cred.usuario_email, cred.id + '_u')}
                                className="text-[10px] text-slate-400 hover:text-black dark:hover:text-white"
                              >
                                {copiadoU ? 'Copiado!' : 'Copiar'}
                              </button>
                            )}
                          </div>

                          {/* Senha */}
                          <div className="lg:col-span-3 flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-800 dark:text-zinc-200 select-all">
                              {isRevelada ? cred.senha : '••••••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleVerSenha(cred)}
                              className="text-slate-400 hover:text-black dark:hover:text-white p-0.5"
                              title={isRevelada ? 'Ocultar' : 'Visualizar senha'}
                            >
                              {isRevelada ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopiarTexto(cred.senha, cred.id + '_s')}
                              className="text-[10px] text-slate-400 hover:text-black dark:hover:text-white"
                            >
                              {copiadoS ? 'Copiado!' : 'Copiar'}
                            </button>
                          </div>

                          {/* Obs */}
                          <div className="lg:col-span-2 min-w-0">
                            <span className="text-[11px] text-slate-500 italic truncate block">
                              {cred.observacao || '-'}
                            </span>
                          </div>

                          {/* Ações */}
                          <div className="lg:col-span-1 flex items-center justify-end gap-1.5 w-full lg:w-auto">
                            <button
                              type="button"
                              onClick={() => handleEditarCredencial(cred)}
                              className="px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-black/10 cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExcluirCredencial(cred.id)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded-full cursor-pointer"
                              title="Excluir"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 3: CONFIGURAÇÃO DO SERVIDOR & CHECKLIST */}
          {/* ============================================================================== */}
          {activeTab === 'servidor' && (
            <div className="space-y-4">
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] flex items-center justify-between gap-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                    Checklist de Setup do Servidor
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Validação de portas, DNS, SSL e diretrizes técnicas para operação contínua.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddReqOpen(true)}
                  className="px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  + Novo Requisito
                </button>
              </div>

              {/* Form Novo Requisito */}
              <AnimatePresence>
                {isAddReqOpen && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleAdicionarRequisito}
                    className="rounded-3xl p-6 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-zinc-900/90 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">Adicionar Requisito Customizado</h3>
                      <button type="button" onClick={() => setIsAddReqOpen(false)} className="text-slate-400 hover:text-black dark:hover:text-white p-1 cursor-pointer">
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={novoReqTitulo}
                        onChange={(e) => setNovoReqTitulo(e.target.value)}
                        placeholder="Título do requisito"
                        required
                        className="px-4 py-2 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                      />
                      <input
                        type="text"
                        value={novoReqObs}
                        onChange={(e) => setNovoReqObs(e.target.value)}
                        placeholder="Observação técnica (opcional)"
                        className="px-4 py-2 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setIsAddReqOpen(false)} className="px-4 py-1.5 text-xs text-slate-500">Cancelar</button>
                      <button type="submit" disabled={loadingChecklist} className="px-4 py-1.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs">
                        Adicionar
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Lista de Itens do Checklist */}
              <div className="space-y-2.5">
                {checklistFiltrado.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-4 border transition-all flex items-start gap-3.5 ${
                      item.concluido
                        ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                        : 'border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(item.concluido)}
                      onChange={() => handleToggleChecklist(item)}
                      className="w-5 h-5 accent-[#4d7c0f] dark:accent-[#84cc16] cursor-pointer rounded mt-0.5"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${item.concluido ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-[#0a0a0c] dark:text-white'}`}>
                          {item.titulo}
                        </span>
                        {item.categoria && (
                          <span className="text-[9px] uppercase font-mono px-2 py-0.2 rounded-full bg-black/5 dark:bg-white/10 text-slate-500">
                            {item.categoria}
                          </span>
                        )}
                      </div>

                      {item.descricao && (
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {item.descricao}
                        </p>
                      )}

                      <input
                        type="text"
                        defaultValue={item.observacao || ''}
                        onBlur={(e) => handleSalvarObsChecklist(item, e.target.value)}
                        placeholder="Adicionar nota técnica sobre este requisito..."
                        className="w-full text-[11px] bg-transparent border-b border-black/10 dark:border-white/10 pb-0.5 focus:outline-none focus:border-[#4d7c0f] dark:focus:border-[#84cc16] font-mono mt-1 text-slate-700 dark:text-zinc-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 4: ANOTAÇÕES & PEDIDOS */}
          {/* ============================================================================== */}
          {activeTab === 'observacoes' && (
            <div className="space-y-4">
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] flex items-center justify-between gap-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                    Anotações & Pedidos Especiais
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Histórico de observações técnicas e resoluções gravadas no encerramento de chamados.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddObsOpen(true)}
                  className="px-4 py-2.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black text-xs font-bold shadow-sm"
                >
                  + Nova Anotação
                </button>
              </div>

              {/* Form Nova Anotação */}
              <AnimatePresence>
                {isAddObsOpen && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleSalvarObservacao}
                    className="rounded-3xl p-6 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-zinc-900/90 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-zinc-300">Nova Anotação Técnica</h3>
                      <button type="button" onClick={() => setIsAddObsOpen(false)} className="text-slate-400 hover:text-black dark:hover:text-white p-1 cursor-pointer">
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={novaObsTitulo}
                      onChange={(e) => setNovaObsTitulo(e.target.value)}
                      placeholder="Título da anotação (ex: Particularidade no Horário)"
                      className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                    />
                    <textarea
                      rows={3}
                      value={novaObsConteudo}
                      onChange={(e) => setNovaObsConteudo(e.target.value)}
                      placeholder="Conteúdo detalhado da anotação..."
                      required
                      className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none leading-relaxed"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setIsAddObsOpen(false)} className="px-4 py-1.5 text-xs text-slate-500 cursor-pointer">Cancelar</button>
                      <button type="submit" disabled={loadingObs} className="px-4 py-1.5 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black font-bold text-xs cursor-pointer">
                        Salvar Anotação
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Lista de Anotações */}
              {(!empresa.observacoes || empresa.observacoes.length === 0) ? (
                <div className="rounded-3xl p-10 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] text-center space-y-2">
                  <p className="text-sm font-bold text-[#0a0a0c] dark:text-white">Nenhuma anotação cadastrada</p>
                  <p className="text-xs text-slate-500">Adicione observações ou encerre atendimentos para preencher esta lista.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {empresa.observacoes.map((obs) => (
                    <div
                      key={obs.id}
                      className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-[#0a0a0c] dark:text-white">{obs.titulo}</h4>
                          {obs.tipo === 'suporte' && (
                            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                              Resolução de Suporte
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoverObservacao(obs.id)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Remover anotação"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {obs.conteudo}
                      </p>
                      <div className="text-[10px] text-slate-400 font-mono pt-1">
                        Registrado por {obs.autor_email} em {new Date(obs.created_at).toLocaleString('pt-BR')}
                      </div>
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
            <div className="space-y-4">
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] shadow-sm">
                <h2 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                  Histórico de Atendimentos ({chamadosEmpresa.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registro cronológico dos chamados técnicos abertos para esta empresa.
                </p>
              </div>

              {chamadosEmpresa.length === 0 ? (
                <div className="rounded-3xl p-10 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] text-center text-xs text-slate-500">
                  Nenhum atendimento realizado para esta empresa ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {chamadosEmpresa.map((ch) => (
                    <div
                      key={ch.id}
                      className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            ch.status === 'finalizado'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            {ch.status}
                          </span>
                          <strong className="text-xs text-[#0a0a0c] dark:text-white">{ch.motivo || 'Sem motivo'}</strong>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Técnico: {ch.tecnico_email} • Início: {new Date(ch.iniciado_em).toLocaleString('pt-BR')}
                        </p>
                        {ch.colaborador_solicitante && (
                          <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                            Solicitante: <strong>{ch.colaborador_solicitante}</strong>
                          </p>
                        )}
                        {ch.observacoes && (
                          <p className="text-[11px] text-slate-600 dark:text-zinc-400 italic">
                            Solução: {ch.observacoes}
                          </p>
                        )}
                      </div>

                      <div className="text-right font-mono self-end sm:self-center">
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block tabular-nums">
                          {formatarTempo(ch.duracao_segundos)}
                        </span>
                        <span className="text-[10px] text-slate-400">Duração</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* Modal Imersivo de Finalização de Suporte */}
      <SupportCompletionModal
        isOpen={isFinalizarModalOpen}
        chamado={chamadoAtivo}
        onClose={() => setIsFinalizarModalOpen(false)}
        onFinalizado={() => {
          verificarChamadoAtivo();
          onUpdated();
        }}
        userEmail={userEmail}
      />

    </div>
  );
}
