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
  getCategoriasDemandas,
  getNomeTecnico,
  isMockDataEnabled
} from '@/lib/storage';
import { generateSecurePassword } from '@/lib/security';
import { 
  MessageChannelIcon,
  ApiCloudIcon,
  QrCodeScanIcon,
  MultichannelIcon,
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
  EditIcon,
  LightBulbIcon
} from './Icons';
import SupportCompletionModal from './SupportCompletionModal';
import KnowledgeBaseTab from './KnowledgeBaseModal';
import ConfirmModal from './ConfirmModal';
import { showToast } from './ToastNotification';
import {
  getServidorConfigPadrao,
  getEmpresaServidorDetalhes,
  updateEmpresaServidorDetalhes,
  toggleServidorChecklistItem,
  addEmpresaChecklistItem,
  deleteEmpresaChecklistItem,
  getSolucoesSuporte,
  addSolucaoSuporte,
  deleteSolucaoSuporte
} from '@/lib/storage';
import RegisterSupportModal from './RegisterSupportModal';

export default function CompanyManagementView({ empresa, onBack, onUpdated, userEmail }) {
  const [activeTab, setActiveTab] = useState('como_resolver'); // 'como_resolver' | 'canais' | 'credenciais' | 'servidor' | 'observacoes' | 'chamados'
  const [catalogoCanais, setCatalogoCanais] = useState([]);
  const [isRegistrarModalOpen, setIsRegistrarModalOpen] = useState(false);
  const [solucoesCount, setSolucoesCount] = useState(0);

  // Garante que ao abrir a tela de suporte de uma empresa, a aba padrão seja sempre "Como Resolver Chamado"
  useEffect(() => {
    setActiveTab('como_resolver');
  }, [empresa?.id]);

  useEffect(() => {
    const carregarContagemSolucoes = () => {
      const list = getSolucoesSuporte({ empresa_id: empresa.id });
      const listEmpresa = list.filter((s) => s.empresa_id === empresa.id || (s.empresa_nome && empresa.nome && s.empresa_nome.toLowerCase().trim() === empresa.nome.toLowerCase().trim()));
      setSolucoesCount(listEmpresa.length > 0 ? listEmpresa.length : list.length);
    };

    carregarContagemSolucoes();
    window.addEventListener('solucoes_updated', carregarContagemSolucoes);
    window.addEventListener('suporte_updated', carregarContagemSolucoes);
    return () => {
      window.removeEventListener('solucoes_updated', carregarContagemSolucoes);
      window.removeEventListener('suporte_updated', carregarContagemSolucoes);
    };
  }, [empresa.id, empresa.nome]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Estados de Servidor Dividido (Padrão vs Personalizado + Checklist de Implementação)
  const [servidorDetalhes, setServidorDetalhes] = useState(null);
  const [servidorIpCustom, setServidorIpCustom] = useState('');
  const [servidorPortaSsh, setServidorPortaSsh] = useState('2222');
  const [servidorPeculiaridades, setServidorPeculiaridades] = useState('');
  const [salvandoServidorDetalhes, setSalvandoServidorDetalhes] = useState(false);
  const [novoChecklistTitulo, setNovoChecklistTitulo] = useState('');
  const [novoChecklistDesc, setNovoChecklistDesc] = useState('');
  const [isAddChecklistOpen, setIsAddChecklistOpen] = useState(false);
  const [salvandoNovoChecklist, setSalvandoNovoChecklist] = useState(false);

  // Estados de Soluções & Base de Conhecimento na aba de observações
  const [kbBuscaGeral, setKbBuscaGeral] = useState(false);
  const [kbQuery, setKbQuery] = useState('');
  const [kbTagFiltro, setKbTagFiltro] = useState('');
  const [listaSolucoesTab, setListaSolucoesTab] = useState([]);
  const [isFormNovaSolucaoTab, setIsFormNovaSolucaoTab] = useState(false);
  const [novaSolucaoTitulo, setNovaSolucaoTitulo] = useState('');
  const [novaSolucaoCodigo, setNovaSolucaoCodigo] = useState('');
  const [novaSolucaoTipo, setNovaSolucaoTipo] = useState('Envio de Mensagem');
  const [novaSolucaoContexto, setNovaSolucaoContexto] = useState('');
  const [novaSolucaoPassos, setNovaSolucaoPassos] = useState('');
  const [novaSolucaoTags, setNovaSolucaoTags] = useState('');
  const [salvandoSolucaoTab, setSalvandoSolucaoTab] = useState(false);
  
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
  const [credNomeUsuario, setCredNomeUsuario] = useState('');
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

  // Iniciar Suporte com Seleção de Categorias
  const [modalIniciarDemandaOpen, setModalIniciarDemandaOpen] = useState(false);
  const [categoriasDemandaDisponiveis, setCategoriasDemandaDisponiveis] = useState([]);
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState(['Suporte']);
  const [motivoInicialDemanda, setMotivoInicialDemanda] = useState('');
  const [solicitanteInicialDemanda, setSolicitanteInicialDemanda] = useState('');

  useEffect(() => {
    setCategoriasDemandaDisponiveis(getCategoriasDemandas());
    const handleCatsUpdated = () => setCategoriasDemandaDisponiveis(getCategoriasDemandas());
    window.addEventListener('categorias_demandas_updated', handleCatsUpdated);
    return () => window.removeEventListener('categorias_demandas_updated', handleCatsUpdated);
  }, []);

  const handleAbrirModalIniciarSuporte = () => {
    setCategoriasDemandaDisponiveis(getCategoriasDemandas());
    setCategoriasSelecionadas(['Suporte']);
    setMotivoInicialDemanda('');
    setSolicitanteInicialDemanda('');
    setModalIniciarDemandaOpen(true);
  };

  const handleConfirmarIniciarSuporte = async () => {
    try {
      const cats = categoriasSelecionadas.length > 0 ? categoriasSelecionadas : ['Suporte'];
      const novo = await iniciarSuporte({
        empresa_id: empresa.id,
        empresa_nome: empresa.nome,
        categorias: cats,
        motivo: motivoInicialDemanda.trim(),
        solicitante_nome: solicitanteInicialDemanda.trim(),
        userEmail,
      });
      setChamadoAtivo(novo);
      setModalIniciarDemandaOpen(false);
      showToast('Atendimento de suporte iniciado com cronômetro em tempo real!');
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Cancelar Suporte (sem redundância)
  const handleCancelarChamado = () => {
    if (!chamadoAtivo) return;
    setConfirmDialog({
      title: 'Cancelar Atendimento de Suporte?',
      message: 'Deseja realmente cancelar este atendimento? O cronômetro e o registro em andamento serão descartados.',
      confirmText: 'Sim, Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await cancelarSuporte({ chamado_id: chamadoAtivo.id, userEmail });
          setChamadoAtivo(null);
          showToast('Chamado cancelado.', 'info');
          setConfirmDialog(null);
          onUpdated();
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });
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

  // Ícones de Canal (Puro SVG minimalista Apple, zero ícones de WhatsApp)
  const renderCanalIcon = (c) => {
    const nomeLower = (c.nome || '').toLowerCase();
    const tipo = (c.tipo || '').toLowerCase();
    if (tipo === 'api' || nomeLower.includes('api') || nomeLower.includes('cloud')) {
      return <ApiCloudIcon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />;
    }
    if (tipo === 'qrcode' || nomeLower.includes('qr') || nomeLower.includes('pareamento')) {
      return <QrCodeScanIcon className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
    }
    if (nomeLower.includes('facebook') || nomeLower.includes('messenger')) {
      return <FacebookIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    }
    if (nomeLower.includes('instagram')) {
      return <InstagramIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />;
    }
    if (nomeLower.includes('telegram')) {
      return <TelegramIcon className="w-4 h-4 text-sky-500 dark:text-sky-400" />;
    }
    return <MultichannelIcon className="w-4 h-4 text-slate-500 dark:text-zinc-400" />;
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

  const handleRemoverCanal = (canalId) => {
    setConfirmDialog({
      title: 'Remover Canal?',
      message: 'Deseja realmente desvincular este canal da empresa? As integrações associadas deixarão de operar.',
      confirmText: 'Remover Canal',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await removeCanalEmpresa(empresa.id, canalId, userEmail);
          showToast('Canal desvinculado com sucesso.', 'info');
          setConfirmDialog(null);
          onUpdated();
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });
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
          nome_usuario: credNomeUsuario,
          usuario_email: credUsuario,
          senha: credSenha,
          observacao: credObs,
        }, userEmail);
        showToast('Acesso atualizado com sucesso!');
      } else {
        await addEmpresaCredencial(empresa.id, {
          rotulo: credRotulo,
          nome_usuario: credNomeUsuario,
          usuario_email: credUsuario,
          senha: credSenha,
          observacao: credObs,
        }, userEmail);
        showToast('Novo acesso cadastrado com sucesso!');
      }

      setCredRotulo('');
      setCredNomeUsuario('');
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

  const handleExcluirCredencial = (credId) => {
    setConfirmDialog({
      title: 'Excluir Credencial de Acesso?',
      message: 'Tem certeza que deseja apagar esta credencial técnica? Esta ação é definitiva.',
      confirmText: 'Excluir Credencial',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteEmpresaCredencial(empresa.id, credId, userEmail);
          showToast('Credencial removida com sucesso!', 'info');
          setConfirmDialog(null);
          recarregarCredenciais();
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });
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
      
      {/* Barra de Retorno e Abas Integradas na Mesma Linha Imaginária */}
      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3.5 pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 flex-wrap flex-1">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-[#16161a] text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 shadow-xs transition-all self-start flex-shrink-0 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            <span>Voltar para a lista de empresas</span>
          </button>

          {/* Abas Apple Minimalistas na Mesma Linha de Voltar */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 px-0.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.06]">
            {[
              { id: 'como_resolver', label: 'Como Resolver Chamado', count: solucoesCount, highlight: true },
              { id: 'canais', label: 'Canais de Atendimento', count: empresa.canais?.length || 0 },
              { id: 'credenciais', label: 'Acessos & Senhas Técnicas', count: credenciaisList.length },
              { id: 'servidor', label: 'Configuração do Servidor', count: `${concluidosChecklist}/${totalChecklist}` },
              { id: 'chamados', label: 'Histórico de Suporte', count: chamadosEmpresa.length },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-3.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? tab.highlight 
                        ? 'bg-amber-500 text-white dark:bg-amber-500 dark:text-zinc-950 shadow-xs font-bold'
                        : 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                      : tab.highlight
                        ? 'text-amber-800 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {tab.highlight && <LightBulbIcon className="w-3.5 h-3.5" />}
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
        </div>

        {/* Ações de Suporte (Sem redundância: Concluir ou Cancelar se ativo; Iniciar se inativo) */}
        <div className="flex items-center gap-2 self-start 2xl:self-center flex-wrap flex-shrink-0">
          {!chamadoAtivo && (
            <>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAbrirModalIniciarSuporte}
                className="px-4 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-95 flex items-center gap-2 transition-all cursor-pointer"
              >
                <PlayIcon className="w-3.5 h-3.5" />
                <span>Iniciar Atendimento de Demanda</span>
              </motion.button>

              <button
                type="button"
                onClick={() => setIsRegistrarModalOpen(true)}
                className="px-3.5 py-2.5 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-800 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-[#1d1d1f] dark:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>+ Registrar Suporte</span>
              </button>
            </>
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
              className="rounded-3xl p-5 border-2 border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 space-y-3.5 shadow-md"
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

              {/* Categorias da Demanda */}
              {Array.isArray(chamadoAtivo.categorias) && chamadoAtivo.categorias.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {chamadoAtivo.categorias.map((cat, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-950 dark:text-amber-200 border border-amber-500/30"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-500/25 text-center space-y-1 shadow-xs">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 block font-medium">Tempo Decorrido:</span>
                <span className="text-3xl font-extrabold font-mono text-amber-600 dark:text-amber-400 tabular-nums block">
                  {formatarTempo(tempoSuporteSegundos)}
                </span>
                <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium mt-1">
                  Operador: <strong className="text-[#0a0a0c] dark:text-white font-bold">{getNomeTecnico(chamadoAtivo.tecnico_email, chamadoAtivo.tecnico_nome)}</strong>
                </p>
              </div>

              {/* Ações do Atendimento Ativo */}
              <div className="space-y-2 pt-1">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setIsFinalizarModalOpen(true)}
                  className="w-full py-3 rounded-2xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-[#4d7c0f]/20 hover:opacity-95 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <CheckIcon className="w-4 h-4 stroke-[2.5]" />
                  <span>Concluir Chamado</span>
                </motion.button>

                <button
                  type="button"
                  onClick={handleCancelarChamado}
                  className="w-full py-2 rounded-xl text-slate-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 text-xs font-medium hover:bg-red-500/10 transition-all cursor-pointer text-center"
                >
                  Cancelar Atendimento
                </button>
              </div>
            </motion.div>
          )}

        </div>

        {/* COLUNA DIREITA: CONTEÚDO DINÂMICO EM ABAS (~65%) */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-5">

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
                      setCredNomeUsuario('');
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Rótulo / Serviço <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={credRotulo}
                          onChange={(e) => setCredRotulo(e.target.value)}
                          placeholder="Ex: Painel Admin, Servidor SSH"
                          required
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          Nome do Usuário (Opcional)
                        </label>
                        <input
                          type="text"
                          value={credNomeUsuario}
                          onChange={(e) => setCredNomeUsuario(e.target.value)}
                          placeholder="Ex: Carlos Gerente, Atendente 01"
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          E-mail / Login (Opcional)
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
                            Senha <span className="text-slate-400 font-normal text-[11px]">(Opcional)</span>
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
                          placeholder="Opcional - preencha se houver senha cadastrada"
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
                              <span className="text-[10px] text-slate-400 block">
                                {cred.nome_usuario ? `Usuário: ${cred.nome_usuario}` : 'Login / E-mail:'}
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-zinc-200 select-all text-xs">
                                {cred.usuario_email || (cred.nome_usuario ? 'Sem e-mail vinculado' : 'Não informado')}
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
                              {cred.senha ? (
                                <span className="font-mono font-bold text-slate-800 dark:text-zinc-200 select-all">
                                  {isRevelada ? cred.senha : '••••••••••••'}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">
                                  Sem senha cadastrada
                                </span>
                              )}
                            </div>

                            {cred.senha && (
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
                            )}
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
                    <div className="col-span-2">Nome Usuário</div>
                    <div className="col-span-3">Login / E-mail</div>
                    <div className="col-span-2">Senha Protegida</div>
                    <div className="col-span-2 text-right">Ações</div>
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

                          {/* Nome Usuário */}
                          <div className="lg:col-span-2 min-w-0">
                            <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 truncate block">
                              {cred.nome_usuario || '-'}
                            </span>
                          </div>

                          {/* Login / E-mail */}
                          <div className="lg:col-span-3 flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold text-slate-800 dark:text-zinc-200 select-all truncate">
                              {cred.usuario_email || '-'}
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
                          <div className="lg:col-span-2 flex items-center gap-2">
                            {cred.senha ? (
                              <>
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
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Sem senha</span>
                            )}
                          </div>

                          {/* Ações */}
                          <div className="lg:col-span-2 flex items-center justify-end gap-1.5 w-full lg:w-auto">
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
            <div className="space-y-6">
              
              {/* 2. CHECKLIST OBRIGATÓRIO DE IMPLEMENTAÇÃO DE SERVIDOR NOVO (100% DINÂMICO & CUSTOMIZÁVEL) */}
              <div className="rounded-3xl p-6 sm:p-7 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-black/[0.05] dark:border-white/[0.06]">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 inline-block mb-1">
                      Checklist Dinâmico de Servidor
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-[#0a0a0c] dark:text-white">
                      Checklist de Implementação do Servidor Novo
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Cadastre, personalize e valide os requisitos obrigatórios para a entrega técnica e ativação do servidor deste cliente.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-center">
                    {/* Barra de Progresso */}
                    {servidorDetalhes?.checklist_implementacao && (
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 font-mono">
                          {servidorDetalhes.checklist_implementacao.filter(i => i.concluido).length} de {servidorDetalhes.checklist_implementacao.length} validados (
                          {servidorDetalhes.checklist_implementacao.length > 0 
                            ? Math.round((servidorDetalhes.checklist_implementacao.filter(i => i.concluido).length / servidorDetalhes.checklist_implementacao.length) * 100) 
                            : 0}%)
                        </span>
                        <div className="w-32 h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-[#4d7c0f] dark:to-[#84cc16] transition-all duration-500"
                            style={{
                              width: `${servidorDetalhes.checklist_implementacao.length > 0 ? Math.round((servidorDetalhes.checklist_implementacao.filter(i => i.concluido).length / servidorDetalhes.checklist_implementacao.length) * 100) : 0}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsAddChecklistOpen(!isAddChecklistOpen)}
                      className="px-3.5 py-2 rounded-full bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] text-xs font-bold text-slate-800 dark:text-zinc-200 transition-all cursor-pointer flex-shrink-0"
                    >
                      {isAddChecklistOpen ? 'Fechar' : '+ Novo Requisito'}
                    </button>
                  </div>
                </div>

                {/* Formulário para Cadastrar Novo Requisito no Checklist */}
                <AnimatePresence>
                  {isAddChecklistOpen && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!novoChecklistTitulo.trim()) {
                          showToast('Informe o título do requisito.', 'error');
                          return;
                        }
                        try {
                          setSalvandoNovoChecklist(true);
                          await addEmpresaChecklistItem(empresa.id, {
                            titulo: novoChecklistTitulo.trim(),
                            desc: novoChecklistDesc.trim(),
                          }, userEmail);
                          setServidorDetalhes(getEmpresaServidorDetalhes(empresa.id));
                          setNovoChecklistTitulo('');
                          setNovoChecklistDesc('');
                          setIsAddChecklistOpen(false);
                          showToast('Requisito adicionado ao checklist!', 'success');
                        } catch (err) {
                          showToast(err.message || 'Erro ao adicionar requisito.', 'error');
                        } finally {
                          setSalvandoNovoChecklist(false);
                        }
                      }}
                      className="rounded-3xl p-5 border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03] space-y-3"
                    >
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                        Adicionar Requisito Técnico Obrigatório
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={novoChecklistTitulo}
                          onChange={(e) => setNovoChecklistTitulo(e.target.value)}
                          placeholder="Título do requisito (ex: Certificado SSL Let's Encrypt)"
                          required
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                        />
                        <input
                          type="text"
                          value={novoChecklistDesc}
                          onChange={(e) => setNovoChecklistDesc(e.target.value)}
                          placeholder="Orientações técnicas (opcional)"
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsAddChecklistOpen(false)}
                          className="px-4 py-1.5 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={salvandoNovoChecklist}
                          className="px-5 py-1.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-xs"
                        >
                          {salvandoNovoChecklist ? 'Salvando...' : 'Salvar Requisito'}
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Lista dos Itens do Checklist com Exclusão e Validação */}
                <div className="space-y-2.5">
                  {(!servidorDetalhes?.checklist_implementacao || servidorDetalhes.checklist_implementacao.length === 0) ? (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-black/[0.08] dark:border-white/[0.1] text-xs text-slate-400">
                      Nenhum requisito cadastrado no checklist deste servidor. Adicione requisitos pelo botão acima.
                    </div>
                  ) : (
                    servidorDetalhes.checklist_implementacao.map((item, idx) => (
                      <motion.div
                        key={item.id || idx}
                        whileHover={{ scale: 1.005 }}
                        className={`rounded-2xl p-4 border transition-all flex items-start justify-between gap-3.5 ${
                          item.concluido
                            ? 'border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]'
                            : 'border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] hover:bg-black/[0.015]'
                        }`}
                      >
                        <div
                          className="flex items-start gap-3.5 flex-1 min-w-0 cursor-pointer select-none"
                          onClick={async () => {
                            await toggleServidorChecklistItem(empresa.id, item.id, userEmail);
                            setServidorDetalhes(getEmpresaServidorDetalhes(empresa.id));
                            showToast(item.concluido ? `Item desmarcado` : `Requisito "${item.titulo}" validado!`, 'success');
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(item.concluido)}
                            onChange={() => {}}
                            className="w-5 h-5 accent-[#4d7c0f] dark:accent-[#84cc16] cursor-pointer rounded mt-0.5 pointer-events-none"
                          />

                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold ${item.concluido ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-[#0a0a0c] dark:text-white'}`}>
                                {idx + 1}. {item.titulo}
                              </span>
                              {item.concluido && item.responsavel && (
                                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                  ✓ Validado por {item.responsavel}
                                </span>
                              )}
                            </div>

                            {item.desc && (
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                                {item.desc}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Botão de Excluir Requisito do Checklist */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDialog({
                              title: 'Remover Requisito do Checklist?',
                              message: `Deseja remover o requisito "${item.titulo}" do checklist desta empresa?`,
                              confirmText: 'Remover',
                              variant: 'danger',
                              onConfirm: async () => {
                                await deleteEmpresaChecklistItem(empresa.id, item.id, userEmail);
                                setServidorDetalhes(getEmpresaServidorDetalhes(empresa.id));
                                showToast('Requisito removido do checklist.', 'info');
                                setConfirmDialog(null);
                              },
                            });
                          }}
                          className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg transition-colors cursor-pointer"
                          title="Remover requisito"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {/* 3. ANOTAÇÕES PARTICULARES DA EMPRESA (CONCENTRADAS AQUI EM OPERAÇÃO & SERVIDOR) */}
              <div className="rounded-3xl p-6 sm:p-7 border border-black/8 dark:border-white/10 bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-black/[0.05] dark:border-white/[0.06]">
                  <div>
                    <h3 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                      Anotações Particulares de {empresa.nome}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Orientações internas, histórico e particularidades exclusivas desta conta.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAddObsOpen(true)}
                    className="px-4 py-2 rounded-full bg-[#09090b] dark:bg-white text-white dark:text-black text-xs font-bold shadow-sm cursor-pointer"
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
                      className="rounded-3xl p-5 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-zinc-900/90 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-zinc-300">Nova Anotação Técnica</h4>
                        <button type="button" onClick={() => setIsAddObsOpen(false)} className="text-slate-400 hover:text-black dark:hover:text-white p-1 cursor-pointer">
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={novaObsTitulo}
                        onChange={(e) => setNovaObsTitulo(e.target.value)}
                        placeholder="Título da anotação (ex: Particularidade no Horário de Almoço)"
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
                <div className="space-y-3">
                  {(!empresa.observacoes || empresa.observacoes.length === 0) ? (
                    <p className="text-xs text-slate-400 italic py-4 text-center">
                      Nenhuma anotação particular registrada ainda para esta empresa.
                    </p>
                  ) : (
                    empresa.observacoes.map((obs) => (
                      <div
                        key={obs.id}
                        className="p-4 rounded-2xl border border-black/8 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.02] space-y-2 group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-xs font-bold text-[#0a0a0c] dark:text-white">
                            {obs.titulo}
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDialog({
                                title: 'Excluir Anotação?',
                                message: `Deseja excluir a anotação "${obs.titulo}"?`,
                                confirmText: 'Excluir',
                                variant: 'danger',
                                onConfirm: async () => {
                                  await deleteEmpresaObservacao(empresa.id, obs.id, userEmail);
                                  showToast('Anotação removida.', 'info');
                                  setConfirmDialog(null);
                                  onUpdated();
                                },
                              });
                            }}
                            className="text-slate-300 hover:text-red-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                          {obs.conteudo}
                        </p>
                        <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-black/[0.03] dark:border-white/[0.04]">
                          {obs.autor_email} • {new Date(obs.created_at || Date.now()).toLocaleString('pt-BR')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

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

          {/* ============================================================================== */}
          {/* ABA 5: COMO RESOLVER CHAMADO (BASE DE CONHECIMENTO OPERACIONAL) */}
          {/* ============================================================================== */}
          {activeTab === 'como_resolver' && (
            <KnowledgeBaseTab
              empresa={empresa}
              userEmail={userEmail}
            />
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

      {/* Modal de Registro de Suporte Direto / Retroativo */}
      <RegisterSupportModal
        isOpen={isRegistrarModalOpen}
        onClose={() => setIsRegistrarModalOpen(false)}
        empresaPreSelecionada={empresa}
        userEmail={userEmail}
        onRegistered={() => {
          if (onUpdated) onUpdated();
          showToast('Atendimento registrado com sucesso!', 'success');
        }}
      />

      {/* Modal Rápido de Seleção de Categorias para Iniciar Demanda */}
      <AnimatePresence>
        {modalIniciarDemandaOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg rounded-[28px] bg-white dark:bg-[#16161a] border border-black/10 dark:border-white/15 p-6 sm:p-7 shadow-2xl space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7] relative"
            >
              <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.08] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d7c0f] dark:text-[#84cc16]">
                      Nova Demanda em Tempo Real
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">
                    Iniciar Atendimento — {empresa.nome}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Selecione as categorias correspondentes à demanda que será iniciada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalIniciarDemandaOpen(false)}
                  className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Seleção de Categorias */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Categorias da Demanda <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {categoriasDemandaDisponiveis.map((cat) => {
                    const isSelected = categoriasSelecionadas.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (categoriasSelecionadas.length > 1) {
                              setCategoriasSelecionadas(categoriasSelecionadas.filter((c) => c !== cat));
                            }
                          } else {
                            setCategoriasSelecionadas([...categoriasSelecionadas, cat]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 border-[#4d7c0f] dark:border-[#84cc16] shadow-xs'
                            : 'bg-black/[0.02] dark:bg-white/[0.04] text-slate-600 dark:text-zinc-400 border-black/[0.08] dark:border-white/[0.1] hover:border-black/20'
                        }`}
                      >
                        {isSelected && '✓ '}
                        {cat}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400">
                  Você pode selecionar múltiplas categorias para esta demanda.
                </p>
              </div>

              {/* Solicitante Opcional */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Colaborador Solicitante (Opcional)
                </label>
                <input
                  type="text"
                  value={solicitanteInicialDemanda}
                  onChange={(e) => setSolicitanteInicialDemanda(e.target.value)}
                  placeholder="Nome do solicitante na empresa..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium"
                />
              </div>

              {/* Observação / Motivo Inicial */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Observação Inicial / Motivo (Opcional)
                </label>
                <input
                  type="text"
                  value={motivoInicialDemanda}
                  onChange={(e) => setMotivoInicialDemanda(e.target.value)}
                  placeholder="Ex: Dúvida sobre conciliação, erro de conexão, etc..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium"
                />
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setModalIniciarDemandaOpen(false)}
                  className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarIniciarSuporte}
                  className="px-6 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <PlayIcon className="w-3.5 h-3.5" />
                  <span>Iniciar Atendimento Agora</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Rápido de Seleção de Categorias para Iniciar Demanda */}
      <AnimatePresence>
        {modalIniciarDemandaOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg rounded-[28px] bg-white dark:bg-[#16161a] border border-black/10 dark:border-white/15 p-6 sm:p-7 shadow-2xl space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7] relative"
            >
              <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.08] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16]"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d7c0f] dark:text-[#84cc16]">
                      Nova Demanda em Tempo Real
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">
                    Iniciar Atendimento — {empresa.nome}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Selecione as categorias correspondentes à demanda que será iniciada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalIniciarDemandaOpen(false)}
                  className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Seleção de Categorias */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Categorias da Demanda <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {categoriasDemandaDisponiveis.map((cat) => {
                    const isSelected = categoriasSelecionadas.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (categoriasSelecionadas.length > 1) {
                              setCategoriasSelecionadas(categoriasSelecionadas.filter((c) => c !== cat));
                            }
                          } else {
                            setCategoriasSelecionadas([...categoriasSelecionadas, cat]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 border-[#4d7c0f] dark:border-[#84cc16] shadow-xs'
                            : 'bg-black/[0.02] dark:bg-white/[0.04] text-slate-600 dark:text-zinc-400 border-black/[0.08] dark:border-white/[0.1] hover:border-black/20'
                        }`}
                      >
                        {isSelected && '✓ '}
                        {cat}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400">
                  Você pode selecionar múltiplas categorias para esta demanda.
                </p>
              </div>

              {/* Solicitante Opcional */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Colaborador Solicitante (Opcional)
                </label>
                <input
                  type="text"
                  value={solicitanteInicialDemanda}
                  onChange={(e) => setSolicitanteInicialDemanda(e.target.value)}
                  placeholder="Nome do solicitante na empresa..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium"
                />
              </div>

              {/* Observação / Motivo Inicial */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Observação Inicial / Motivo (Opcional)
                </label>
                <input
                  type="text"
                  value={motivoInicialDemanda}
                  onChange={(e) => setMotivoInicialDemanda(e.target.value)}
                  placeholder="Ex: Dúvida sobre conciliação, erro de conexão, etc..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 font-medium"
                />
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setModalIniciarDemandaOpen(false)}
                  className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarIniciarSuporte}
                  className="px-6 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <PlayIcon className="w-3.5 h-3.5" />
                  <span>Iniciar Atendimento Agora</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Modal de Confirmação Visual Apple / Vercel (Substitui confirm do navegador) */}
      <ConfirmModal
        isOpen={Boolean(confirmDialog)}
        title={confirmDialog?.title || 'Confirmar'}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText || 'Confirmar'}
        cancelText={confirmDialog?.cancelText || 'Cancelar'}
        variant={confirmDialog?.variant || 'danger'}
        onConfirm={confirmDialog?.onConfirm}
        onClose={() => setConfirmDialog(null)}
      />

    </div>
  );
}
