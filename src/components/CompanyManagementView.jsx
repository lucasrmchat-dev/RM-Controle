'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  assumirSuporte,
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
  LightBulbIcon,
  ExternalLinkIcon
} from './Icons';
import SupportCompletionModal from './SupportCompletionModal';
import KnowledgeBaseTab from './KnowledgeBaseModal';
import ConfirmModal from './ConfirmModal';
import { showToast } from './ToastNotification';
import {
  getHistoricoCompletoEmpresa,
  getServidorConfigPadrao,
  getServidoresConfig,
  fetchServidoresConfig,
  TIPOS_CLIENTE,
  getColaboradoresEmpresa,
  getEmpresaServidorDetalhes,
  fetchEmpresaServidorDetalhes,
  updateEmpresaServidorDetalhes,
  toggleServidorChecklistItem,
  addEmpresaChecklistItem,
  deleteEmpresaChecklistItem,
  getSolucoesSuporte,
  addSolucaoSuporte,
  deleteSolucaoSuporte
} from '@/lib/storage';
import RegisterSupportModal from './RegisterSupportModal';
import AcessoEmpresaFoco from './AcessoEmpresaFoco';
import ExcluirEmpresaModal from './ExcluirEmpresaModal';
import EmpresaRecorrencias from './EmpresaRecorrencias';
import EmpresaContratos from './EmpresaContratos';
import { fetchChamadosFila, fetchHistoricoChamados, getPermissoesAtuais } from '@/lib/storage';
import { podeVerDemanda } from '@/lib/perfis';
import { sugerirSolucoes } from '@/lib/sugestoesSolucao';
import EncaixeCabecalho, { ACOES_TITULO, LINHA_TITULO } from './EncaixeCabecalho';

// Visual do Modo foco (mesmas pílulas e botão principal da tela de Demandas)
const SUAVE_FOCO = 'bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15';
const PRINCIPAL_FOCO = 'h-14 px-8 rounded-full text-[16px] font-semibold text-white shadow-[0_14px_40px_-10px_rgb(var(--rm-acento-medio)/0.8)] cursor-pointer disabled:opacity-60 inline-flex items-center gap-2';
const FUNDO_PRINCIPAL_FOCO = { background: 'linear-gradient(135deg, rgb(var(--rm-acento-medio)), rgb(var(--rm-acento)))' };

export default function CompanyManagementView({ empresa, onBack, onUpdated, userEmail, voltarRotulo = 'Voltar para a lista de empresas' }) {
  const [historicoCarregando, setHistoricoCarregando] = useState(true);
  const [historicoErro, setHistoricoErro] = useState('');
  const [, atualizarHistorico] = useState(0);
  const [activeTab, setActiveTab] = useState('cockpit'); // 'como_resolver' | 'canais' | 'credenciais' | 'servidor' | 'observacoes' | 'chamados'
  const [catalogoCanais, setCatalogoCanais] = useState([]);
  const [servidoresConfig, setServidoresConfigState] = useState(getServidoresConfig() || {});
  const [isRegistrarModalOpen, setIsRegistrarModalOpen] = useState(false);
  const [solucoesCount, setSolucoesCount] = useState(0);
  const [isEditServidoresModalOpen, setIsEditServidoresModalOpen] = useState(false);
  const [servidor1UrlInput, setServidor1UrlInput] = useState('');
  const [servidor2UrlInput, setServidor2UrlInput] = useState('');
  const [excluirAberto, setExcluirAberto] = useState(false);
  const [cockpitMobileTab, setCockpitMobileTab] = useState('acessos'); // 'acessos' | 'como_resolver' | 'empresa'
  // Vindo da lista de Demandas: a demanda que trouxe a pessoa (relato, assumir) e o painel de acesso já aberto
  const [demandaAlvo, setDemandaAlvo] = useState(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem('rm_demanda_empresa') || 'null');
      return d && d.empresa_id === empresa?.id ? d.chamado : null;
    } catch {
      return null;
    }
  });
  const [painelAcesso, setPainelAcesso] = useState(Boolean(demandaAlvo));
  const [assumindoAlvo, setAssumindoAlvo] = useState(false);

  // Garante que ao abrir a tela de suporte de uma empresa, a aba padrão seja sempre "Como Resolver Chamado"
  useEffect(() => {
    setActiveTab('cockpit');
    // Vindo da Linha do atendimento (Demandas): já abre na aba ou na ação escolhida lá
    try {
      const destino = JSON.parse(sessionStorage.getItem('rm_destino_empresa') || 'null');
      if (!destino) return;
      sessionStorage.removeItem('rm_destino_empresa');
      if (destino.empresa_id !== empresa?.id) return;
      if (destino.aba) setActiveTab(destino.aba);
      if (destino.acao === 'nova_demanda') setTimeout(() => window.dispatchEvent(new Event('rm_empresa_nova_demanda')), 0);
      if (destino.acao === 'registrar') setTimeout(() => setIsRegistrarModalOpen(true), 0);
    } catch {}
  }, [empresa?.id]);
  useEffect(() => {
    const abrir = () => handleAbrirModalIniciarSuporte();
    window.addEventListener('rm_empresa_nova_demanda', abrir);
    return () => window.removeEventListener('rm_empresa_nova_demanda', abrir);
  });

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

  // Detalhes do servidor vêm do Supabase (compartilhados pela equipe) e se atualizam quando alguém altera
  useEffect(() => {
    if (!empresa?.id) return undefined;
    let ativo = true;
    setServidorDetalhes(getEmpresaServidorDetalhes(empresa.id));
    fetchEmpresaServidorDetalhes(empresa.id).then((d) => ativo && setServidorDetalhes(d));
    const atualizar = () => setServidorDetalhes(getEmpresaServidorDetalhes(empresa.id));
    window.addEventListener('servidor_empresa_updated', atualizar);
    return () => {
      ativo = false;
      window.removeEventListener('servidor_empresa_updated', atualizar);
    };
  }, [empresa?.id]);

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
  const [mostrandoNotaFixa, setMostrandoNotaFixa] = useState(false);
  const [novaNotaFixa, setNovaNotaFixa] = useState('');
  const [tempoSuporteSegundos, setTempoSuporteSegundos] = useState(0);
  const [isFinalizarModalOpen, setIsFinalizarModalOpen] = useState(false);

  // Formato de Atendimento e Servidor Alocado
  const [formatoSelecionado, setFormatoSelecionado] = useState(empresa?.formato_atendimento || 'colaborativo');
  const [servidorSelecionado, setServidorSelecionado] = useState(empresa?.servidor_alocado || 'servidor_1');
  const [empresaNomeEditInput, setEmpresaNomeEditInput] = useState(empresa?.nome || '');
  const [isEditingNomeInline, setIsEditingNomeInline] = useState(false);
  const [salvandoEmpresaServidor, setSalvandoEmpresaServidor] = useState(false);
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

  useEffect(() => {
    let ativo = true;
    setHistoricoCarregando(true);
    setHistoricoErro('');
    Promise.all([fetchChamadosFila(), fetchHistoricoChamados()])
      .catch(() => { if (ativo) setHistoricoErro('Não foi possível atualizar o histórico. Reabra a empresa para tentar novamente.'); })
      .finally(() => { if (ativo) { atualizarHistorico((v) => v + 1); setHistoricoCarregando(false); } });
    const atualizar = () => atualizarHistorico((v) => v + 1);
    const eventos = ['suporte_updated', 'perfis_updated', 'user_role_updated'];
    eventos.forEach((e) => window.addEventListener(e, atualizar));
    return () => { ativo = false; eventos.forEach((e) => window.removeEventListener(e, atualizar)); };
  }, [empresa.id]);

  const verificarChamadoAtivo = () => {
    const ativo = getChamadoAtivo(empresa.id, userEmail);
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
      setEmpresaNomeEditInput(empresa?.nome || '');
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
          setConfirmDialog(null);
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
  const handleSalvarUrlsServidores = async (e) => {
    e?.preventDefault?.();
    const atual = getServidoresConfig() || {};
    const novo = {
      ...atual,
      servidor_1_url: servidor1UrlInput.trim(),
      servidor_2_url: servidor2UrlInput.trim(),
    };
    try {
      const salvo = await setServidoresConfig(novo);
      setServidoresConfigState(salvo);
      setIsEditServidoresModalOpen(false);
      showToast('Links dos servidores atualizados para toda a equipe.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // URLs dos servidores são compartilhadas pela equipe (Supabase)
  useEffect(() => {
    const atualizar = () => setServidoresConfigState(getServidoresConfig() || {});
    window.addEventListener('rm_servidores_config_updated', atualizar);
    fetchServidoresConfig();
    return () => window.removeEventListener('rm_servidores_config_updated', atualizar);
  }, []);

  const [trocandoServidor, setTrocandoServidor] = useState(false);
  const handleTrocarAlocacaoServidor = async (novoServidor) => {
    const anterior = empresa.servidor_alocado || 'servidor_1';
    if (novoServidor === anterior || trocandoServidor) return;
    const nomeNovo = novoServidor === 'servidor_2' ? (servidoresConfig?.servidor_2_nome || 'Servidor 2') : (servidoresConfig?.servidor_1_nome || 'Servidor 1');
    setTrocandoServidor(true);
    // Otimista com reversão: muda na hora e volta se o servidor recusar
    setServidorSelecionado(novoServidor);
    empresa.servidor_alocado = novoServidor;
    try {
      await updateEmpresa(empresa.id, { servidor_alocado: novoServidor }, userEmail);
      showToast(`${empresa.nome} agora está no ${nomeNovo}.`, 'success');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('empresas_updated'));
      onUpdated?.();
    } catch (err) {
      setServidorSelecionado(anterior);
      empresa.servidor_alocado = anterior;
      showToast(err.message, 'error');
    } finally {
      setTrocandoServidor(false);
    }
  };

  // Tipo de cliente (novo / já existente) e data de início
  const [tipoClienteEdit, setTipoClienteEdit] = useState(empresa?.tipo_cliente || '');
  const [clienteDesdeEdit, setClienteDesdeEdit] = useState(empresa?.cliente_desde || (empresa?.created_at || '').slice(0, 10));
  const [salvandoTipoCliente, setSalvandoTipoCliente] = useState(false);
  useEffect(() => {
    setTipoClienteEdit(empresa?.tipo_cliente || '');
    setClienteDesdeEdit(empresa?.cliente_desde || (empresa?.created_at || '').slice(0, 10));
  }, [empresa?.id, empresa?.tipo_cliente, empresa?.cliente_desde]);

  const handleSalvarTipoCliente = async () => {
    if (!tipoClienteEdit) {
      showToast('Escolha se é um cliente novo ou já existente.', 'error');
      return;
    }
    setSalvandoTipoCliente(true);
    try {
      await updateEmpresa(empresa.id, { tipo_cliente: tipoClienteEdit, cliente_desde: clienteDesdeEdit }, userEmail);
      empresa.tipo_cliente = tipoClienteEdit;
      empresa.cliente_desde = clienteDesdeEdit;
      // Cliente já existente: o setup já foi feito antes do RM Controle, então o checklist fica 100%
      if (tipoClienteEdit === 'existente') {
        const pendentes = (empresa.checklist || []).filter((c) => !c.concluido);
        for (const item of pendentes) {
          await toggleChecklistItem(empresa.id, item.id, { concluido: true }, userEmail);
          item.concluido = true;
        }
        // Checklist de implementação do servidor: também já foi feito antes do RM Controle
        const atual = await fetchEmpresaServidorDetalhes(empresa.id);
        const itens = atual?.checklist_implementacao || [];
        if (itens.some((i) => !i.concluido)) {
          const agora = new Date().toISOString();
          const salvo = await updateEmpresaServidorDetalhes(
            empresa.id,
            {
              checklist_implementacao: itens.map((i) =>
                i.concluido ? i : { ...i, concluido: true, concluido_em: agora, responsavel: 'Cliente já existente' }
              ),
            },
            userEmail
          );
          setServidorDetalhes(salvo);
        }
      }
      showToast(`${TIPOS_CLIENTE[tipoClienteEdit]} salvo para ${empresa.nome}.`, 'success');
      onUpdated?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoTipoCliente(false);
    }
  };

  const handleTornarCredencialPrincipal = async (credId) => {
    try {
      await updateEmpresaCredencial(empresa.id, credId, { is_principal: true }, userEmail);
      showToast('Credencial definida como Acesso Principal!', 'success');
      recarregarCredenciais();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSalvarNomeInline = async (e) => {
    e?.preventDefault?.();
    const novoNome = (empresaNomeEditInput || '').trim();
    if (!novoNome) {
      showToast('O nome da empresa é obrigatório.', 'error');
      return;
    }
    try {
      setSalvandoEmpresaServidor(true);
      await updateEmpresa(empresa.id, { nome: novoNome }, userEmail);
      empresa.nome = novoNome;
      setEmpresaNomeEditInput(novoNome);
      setIsEditingNomeInline(false);
      showToast('Nome da empresa atualizado com sucesso!', 'success');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('empresas_updated'));
        window.dispatchEvent(new Event('suporte_updated'));
      }
      onUpdated?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoEmpresaServidor(false);
    }
  };

  const handleSalvarEdicaoEmpresaServidor = async (e) => {
    e?.preventDefault?.();
    const novoNome = (empresaNomeEditInput || empresa.nome || '').trim();
    if (!novoNome) {
      showToast('O nome da empresa é obrigatório.', 'error');
      return;
    }

    try {
      setSalvandoEmpresaServidor(true);
      await updateEmpresa(empresa.id, {
        nome: novoNome,
        servidor_alocado: servidorSelecionado,
        formato_atendimento: formatoSelecionado,
      }, userEmail);

      empresa.nome = novoNome;
      empresa.servidor_alocado = servidorSelecionado;
      empresa.formato_atendimento = formatoSelecionado;
      showToast('Nome da empresa e servidor atualizados com sucesso!', 'success');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('empresas_updated'));
        window.dispatchEvent(new Event('suporte_updated'));
      }
      onUpdated?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvandoEmpresaServidor(false);
    }
  };

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
  const chamadosEmpresa = getHistoricoCompletoEmpresa(empresa.id, empresa.nome);

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
      onUpdated?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('suporte_updated'));
        window.dispatchEvent(new Event('empresas_updated'));
        window.dispatchEvent(new Event('credenciais_updated'));
      }
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
    setCredRotulo(c.rotulo || '');
    // Antes o nome não era carregado e ao salvar a edição ele era apagado
    setCredNomeUsuario(c.nome_usuario || '');
    setCredUsuario(c.usuario_email || '');
    setCredSenha(c.senha || '');
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

  // Cartão da empresa: servidor, acesso principal, último atendimento e avisos fixos
  const servidorEhDois = (empresa.servidor_alocado || 'servidor_1') === 'servidor_2';
  const nomeServidorDaEmpresa = servidorEhDois ? servidoresConfig?.servidor_2_nome || 'Servidor 2' : servidoresConfig?.servidor_1_nome || 'Servidor 1';
  const urlServidorDaEmpresa = servidorEhDois ? servidoresConfig?.servidor_2_url : servidoresConfig?.servidor_1_url;
  const acessoPrincipal = credenciaisList.find((c) => c.is_principal) || credenciaisList[0] || null;
  const ultimoAtendimento = [...chamadosEmpresa]
    .filter((c) => c.finalizado_em || c.status === 'concluido')
    .sort((a, b) => new Date(b.finalizado_em || b.iniciado_em || b.created_at || 0) - new Date(a.finalizado_em || a.iniciado_em || a.created_at || 0))[0];
  const notasFixas = (empresa.observacoes || []).filter((o) => o.titulo === 'Nota fixa');
  const relatoAtivo = String(chamadoAtivo?.observacao_inicial || '').trim();
  const sugestoesDoRelato = relatoAtivo ? sugerirSolucoes(relatoAtivo, getSolucoesSuporte({ empresa_id: empresa.id }), 3) : [];

  // Um clique: copia a senha do acesso principal (para colar no login do cliente) e abre o servidor
  const abrirServidorDaEmpresa = async () => {
    if (acessoPrincipal?.senha) {
      navigator.clipboard?.writeText(acessoPrincipal.senha).catch(() => {});
      showToast('Senha copiada. Cole no login do servidor.');
      Promise.resolve(logVisualizacaoSenha(empresa.id, userEmail, { rotulo: acessoPrincipal.rotulo })).catch(() => {});
    }
    // A aba abre ainda no clique (sem bloqueio de pop-up) e só depois recebe o endereço oficial da equipe
    const janela = window.open('about:blank', '_blank');
    if (janela) janela.opener = null;
    const atual = await fetchServidoresConfig().catch(() => null);
    const urlFinal = (servidorEhDois ? atual?.servidor_2_url : atual?.servidor_1_url) || urlServidorDaEmpresa;
    if (janela) janela.location.href = urlFinal;
    else window.open(urlFinal, '_blank', 'noopener,noreferrer');
  };

  const handleSalvarNotaFixa = async (e) => {
    e.preventDefault();
    if (!novaNotaFixa.trim()) return;
    try {
      await addEmpresaObservacao(empresa.id, { titulo: 'Nota fixa', conteudo: novaNotaFixa.trim() }, userEmail);
      setNovaNotaFixa('');
      setMostrandoNotaFixa(false);
      onUpdated();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Tela cheia no visual do Modo foco: sem rolagem da página por trás; Esc volta (se não houver janela aberta)
  useEffect(() => {
    const html = document.documentElement;
    const antes = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      [html.style.overflow, document.body.style.overflow] = antes;
    };
  }, []);
  useEffect(() => {
    try {
      sessionStorage.removeItem('rm_demanda_empresa');
    } catch {}
  }, []);
  useEffect(() => {
    const esc = (e) => {
      if (e.key !== 'Escape' || e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (isRegistrarModalOpen || isFinalizarModalOpen || modalIniciarDemandaOpen || isEditServidoresModalOpen || excluirAberto || confirmDialog) return;
      onBack?.();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });

  // A demanda que trouxe a pessoa até aqui e ainda não foi assumida
  const demandaPendente = !chamadoAtivo && demandaAlvo && ['aguardando_visualizacao', 'pendente'].includes(demandaAlvo.status) ? demandaAlvo : null;
  const relatoDaDemanda = relatoAtivo || String(demandaPendente?.observacao_inicial || demandaPendente?.descricao || demandaPendente?.observacoes || '').trim();
  const demandaEmFoco = chamadoAtivo || demandaPendente;
  const categoriasFoco = (Array.isArray(demandaEmFoco?.categorias) && demandaEmFoco.categorias.length ? demandaEmFoco.categorias : String(demandaEmFoco?.motivo || '').split(',').map((x) => x.trim())).filter(Boolean);
  const metaFoco = [
    categoriasFoco.length && categoriasFoco.join(', '),
    (demandaEmFoco?.colaborador_solicitante || demandaEmFoco?.solicitante_nome) && `pedido por ${demandaEmFoco.colaborador_solicitante || demandaEmFoco.solicitante_nome}`,
    demandaEmFoco?.criador_email && `aberta por ${getNomeTecnico(demandaEmFoco.criador_email)}`,
    chamadoAtivo?.tecnico_email && `responsável: ${getNomeTecnico(chamadoAtivo.tecnico_email, chamadoAtivo.tecnico_nome)}`,
    chamadoAtivo?.prazo_limite && `prazo ${new Date(chamadoAtivo.prazo_limite).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
  ].filter(Boolean).join(' · ');

  const assumirDemanda = async () => {
    setAssumindoAlvo(true);
    try {
      await assumirSuporte({ chamado_id: demandaPendente.id, userEmail: userEmail || 'admin@rmcontrole.com' });
      setDemandaAlvo(null);
      verificarChamadoAtivo();
    } catch (err) {
      showToast(err?.message || 'Não foi possível assumir a demanda.', 'error');
    } finally {
      setAssumindoAlvo(false);
    }
  };

  const abasFoco = [
    { id: 'cockpit', label: 'Atendimento' },
    { id: 'canais', label: 'Canais', count: empresa.canais?.length || 0 },
    { id: 'credenciais', label: 'Acessos e senhas', count: credenciaisList.length },
    { id: 'servidor', label: 'Servidor', count: `${concluidosChecklist}/${totalChecklist}` },
    { id: 'recorrencias', label: 'Problemas recorrentes' },
    { id: 'contrato', label: 'Contrato' },
    { id: 'chamados', label: 'Histórico', count: chamadosEmpresa.length },
  ];

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[45] overflow-y-auto overscroll-none bg-rm-fundo dark:bg-[#0b0d12] text-[#1d1d1f] dark:text-white [scrollbar-width:thin]">
          {/* Fundo vivo: as mesmas luzes suaves do Modo foco */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
            <motion.div className="absolute -top-40 -left-40 w-[620px] h-[620px] rounded-full blur-[120px] opacity-50 dark:opacity-100" style={{ background: 'rgb(var(--rm-acento-medio) / 0.35)' }} animate={{ x: [0, 80, 0], y: [0, 50, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
            <motion.div className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full blur-[130px] bg-violet-500/15 dark:bg-violet-500/25" animate={{ x: [0, -60, 0], y: [0, -40, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
          </div>

          <div className="relative max-w-[1040px] mx-auto px-4 sm:px-8 pt-6 sm:pt-[84px] lg:pt-[92px] pb-20">
            {/* Barra de cima */}
            <div className="flex items-center gap-4">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold tracking-wide uppercase text-black/45 dark:text-white/50">{chamadoAtivo ? 'Em atendimento' : demandaPendente ? 'Demanda da vez' : 'Empresa'}</p>
                <p className="text-[15px] font-medium truncate">{chamadoAtivo ? <span className="tabular-nums">⏱ {formatarTempo(tempoSuporteSegundos)}</span> : empresa.nome}</p>
              </div>
              <button type="button" onClick={onBack} className={`ml-auto h-10 px-4 rounded-full ${SUAVE_FOCO} text-[13px] font-medium cursor-pointer whitespace-nowrap`}>
                {voltarRotulo} <kbd className="hidden sm:inline ml-1.5 px-1.5 py-0.5 rounded-md bg-black/[0.06] dark:bg-white/10 text-[10.5px] font-medium text-black/45 dark:text-white/60 font-sans">Esc</kbd>
              </button>
            </div>

            {toast.text && (
              <div className={`mt-4 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-sm ${toast.type === 'error' ? 'bg-red-500/10 text-red-700 border border-red-500/30 dark:text-red-300' : 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 dark:text-emerald-300'}`}>
                <span>{toast.text}</span>
              </div>
            )}

            {/* A empresa e a demanda da vez, como o cartão do Modo foco */}
            <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} className="mt-4 rounded-[32px] bg-white/80 dark:bg-white/[0.06] backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/10 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.35)] dark:shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] p-6 sm:p-10">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-black/[0.05] dark:bg-white/10">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Empresa ativa
                </span>
                <span className="h-7 px-3 rounded-full bg-black/[0.035] dark:bg-white/[0.06] text-black/60 dark:text-white/70 inline-flex items-center">{nomeServidorDaEmpresa}</span>
                <span className="h-7 px-3 rounded-full bg-black/[0.035] dark:bg-white/[0.06] text-black/60 dark:text-white/70 inline-flex items-center">{empresa.tipo_cliente ? TIPOS_CLIENTE[empresa.tipo_cliente] : 'Tipo de cliente não informado'}</span>
                <button type="button" onClick={() => setActiveTab('servidor')} className="h-7 px-2 text-black/50 dark:text-white/55 hover:text-black dark:hover:text-white hover:underline cursor-pointer">Alterar</button>
                {empresa.is_mock && <span className="text-[10px] font-mono text-black/40 dark:text-white/40">Mock Dev</span>}
              </div>

              {isEditingNomeInline ? (
                <form onSubmit={handleSalvarNomeInline} className="mt-5 flex flex-wrap items-center gap-2 max-w-xl">
                  <input type="text" value={empresaNomeEditInput} onChange={(e) => setEmpresaNomeEditInput(e.target.value)} className="flex-1 min-w-0 h-12 px-4 rounded-2xl bg-white dark:bg-white/[0.07] ring-1 ring-black/[0.1] dark:ring-white/[0.14] text-[17px] font-semibold outline-none focus:ring-2 focus:ring-rm-acento-medio" autoFocus />
                  <button type="submit" disabled={salvandoEmpresaServidor} className="h-12 px-5 rounded-full bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] text-[14px] font-semibold cursor-pointer">Salvar</button>
                  <button type="button" onClick={() => { setEmpresaNomeEditInput(empresa.nome); setIsEditingNomeInline(false); }} className={`h-12 px-5 rounded-full ${SUAVE_FOCO} text-[14px] font-medium cursor-pointer`}>Cancelar</button>
                </form>
              ) : (
                <div className="mt-5 sm:mt-6 flex items-start gap-3">
                  <h2 className="text-[30px] sm:text-[46px] font-semibold tracking-[-0.03em] leading-[1.05] break-words min-w-0">{empresaNomeEditInput || empresa.nome}</h2>
                  <button type="button" onClick={() => setIsEditingNomeInline(true)} className="mt-1 sm:mt-2 p-2 rounded-full text-black/35 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0" title="Editar nome da empresa">
                    <EditIcon className="w-4 h-4" />
                  </button>
                </div>
              )}

              {demandaEmFoco ? (
                <>
                  {relatoDaDemanda ? (
                    <p className="mt-4 text-[17px] sm:text-[20px] leading-relaxed text-black/75 dark:text-white/80 whitespace-pre-wrap break-words">{relatoDaDemanda}</p>
                  ) : (
                    <p className="mt-4 text-[18px] text-black/35 dark:text-white/40">Demanda sem relato. Use a pesquisa de soluções.</p>
                  )}
                  {metaFoco && <p className="mt-4 text-[13.5px] text-black/45 dark:text-white/50">{metaFoco}</p>}
                </>
              ) : (
                <p className="mt-4 text-[17px] text-black/45 dark:text-white/50">Nenhum atendimento em andamento nesta empresa.</p>
              )}

              {painelAcesso && (
                <div className="mt-6">
                  <AcessoEmpresaFoco empresa={empresa} chamado={demandaEmFoco} userEmail={userEmail} onConsegui={() => setPainelAcesso(false)} onFechar={() => setPainelAcesso(false)} />
                </div>
              )}

              {/* Botões: um principal e o resto em pílulas suaves */}
              <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-2.5">
                {chamadoAtivo ? (
                  <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => { verificarChamadoAtivo(); setIsFinalizarModalOpen(true); }} className={PRINCIPAL_FOCO} style={FUNDO_PRINCIPAL_FOCO}>✓ Concluir chamado</motion.button>
                ) : demandaPendente ? (
                  <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} disabled={assumindoAlvo} onClick={assumirDemanda} className={PRINCIPAL_FOCO} style={FUNDO_PRINCIPAL_FOCO}>{assumindoAlvo ? 'Assumindo…' : '▶ Assumir e começar'}</motion.button>
                ) : (
                  <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={handleAbrirModalIniciarSuporte} className={PRINCIPAL_FOCO} style={FUNDO_PRINCIPAL_FOCO}>▶ Iniciar atendimento</motion.button>
                )}
                {urlServidorDaEmpresa ? (
                  <button type="button" onClick={abrirServidorDaEmpresa} className={`h-12 px-5 rounded-full ${SUAVE_FOCO} text-[14px] font-medium cursor-pointer`}>Entrar no servidor ↗</button>
                ) : (
                  <span className="text-[12.5px] text-black/45 dark:text-white/50 max-w-[16rem] leading-snug">Link do {nomeServidorDaEmpresa} ainda não configurado (Configurações Gerais › Servidores).</span>
                )}
                <button type="button" onClick={() => setPainelAcesso((v) => !v)} className={`h-12 px-5 rounded-full ${SUAVE_FOCO} text-[14px] font-medium cursor-pointer`}>{painelAcesso ? 'Fechar acesso' : 'Acesso e senha'}</button>
                {demandaEmFoco && (
                  <button type="button" onClick={handleAbrirModalIniciarSuporte} className={`h-12 px-5 rounded-full ${SUAVE_FOCO} text-[14px] font-medium cursor-pointer`}>+ Nova demanda</button>
                )}
                <button type="button" onClick={() => setIsRegistrarModalOpen(true)} className={`h-12 px-5 rounded-full ${SUAVE_FOCO} text-[14px] font-medium cursor-pointer`}>+ Registrar suporte</button>
                {chamadoAtivo && (
                  <button type="button" onClick={handleCancelarChamado} className="h-12 px-5 rounded-full text-black/60 hover:text-rose-600 dark:text-white/70 dark:hover:text-rose-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-[14px] font-medium cursor-pointer">Cancelar atendimento</button>
                )}
              </div>

              {/* Os números e o último atendimento, em uma linha de texto */}
              <p className="mt-6 text-[12.5px] text-black/45 dark:text-white/50">
                {empresa.canais?.length || 0} canais ativos · {credenciaisList.length} acessos técnicos · {chamadosEmpresa.length} chamados ·{' '}
                {totalChecklist > 0 ? `servidor ${pctChecklist}% configurado` : 'servidor sem lista de configuração'} ·{' '}
                {ultimoAtendimento
                  ? `último atendimento em ${new Date(ultimoAtendimento.finalizado_em || ultimoAtendimento.iniciado_em || ultimoAtendimento.created_at).toLocaleDateString('pt-BR')} (${ultimoAtendimento.motivo || ultimoAtendimento.observacao_inicial || 'sem motivo registrado'})`
                  : 'ainda sem atendimento'}
              </p>

              {/* Avisos fixos: a lista só aparece quando existe aviso; sem aviso, fica só o "+ Aviso" */}
              {notasFixas.length > 0 && (
                <ul className="mt-3 text-[13px] space-y-1.5 border-l-2 border-black/15 dark:border-white/20 pl-3">
                  {notasFixas.map((n) => (
                    <li key={n.id} className="flex items-start justify-between gap-2">
                      <span className="whitespace-pre-wrap">{n.conteudo}</span>
                      <button type="button" onClick={() => handleRemoverObservacao(n.id)} className="text-black/35 hover:text-rose-500 cursor-pointer flex-shrink-0" title="Remover aviso">×</button>
                    </li>
                  ))}
                </ul>
              )}
              {mostrandoNotaFixa ? (
                <form onSubmit={handleSalvarNotaFixa} className="mt-3 flex items-center gap-2 text-[13px]">
                  <input autoFocus value={novaNotaFixa} onChange={(e) => setNovaNotaFixa(e.target.value)} placeholder="Ligar antes das 9h" className="flex-1 min-w-0 h-10 px-4 rounded-full bg-white dark:bg-white/[0.07] ring-1 ring-black/[0.1] dark:ring-white/[0.14] outline-none focus:ring-2 focus:ring-rm-acento-medio" />
                  <button type="submit" className="h-10 px-4 rounded-full bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] font-semibold cursor-pointer">Salvar</button>
                  <button type="button" onClick={() => { setMostrandoNotaFixa(false); setNovaNotaFixa(''); }} className="h-10 px-3 text-black/50 dark:text-white/55 cursor-pointer">Cancelar</button>
                </form>
              ) : (
                <button type="button" onClick={() => setMostrandoNotaFixa(true)} className="mt-3 block text-[13px] font-medium text-black/45 dark:text-white/50 hover:text-black dark:hover:text-white hover:underline cursor-pointer">+ Aviso</button>
              )}
            </motion.article>

            {/* Seções da empresa: pílulas suaves, a ativa em preto (como o seletor do Modo foco) */}
            <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {abasFoco.map((tab) => {
                const ativa = activeTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`h-11 px-5 rounded-full text-[14px] font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors ${ativa ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] font-semibold' : `${SUAVE_FOCO} text-black/70 dark:text-white/75`}`}>
                    {tab.label}
                    {tab.count !== undefined && <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${ativa ? 'bg-white/20 dark:bg-black/15' : 'bg-black/[0.06] dark:bg-white/10 text-black/55 dark:text-white/60'}`}>{tab.count}</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 items-start">

        {/* COLUNA DIREITA: CONTEÚDO DINÂMICO EM ABAS (~65%) */}
        <div className="space-y-5">

          {/* ============================================================================== */}
          {/* ABA 1: CANAIS DE ATENDIMENTO (REDESENHADA, LUXUOSA E SEM ÍCONES DE WHATSAPP) */}
          {/* ============================================================================== */}
          {activeTab === 'canais' && (
            <div className="space-y-4">
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
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
                  <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.09]">
                    <button
                      type="button"
                      onClick={() => handleChangeCanaisViewMode('grid')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                        canaisViewMode === 'grid'
                          ? 'bg-white dark:bg-rm-campo-escuro text-[#0a0a0c] dark:text-white shadow-xs'
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
                          ? 'bg-white dark:bg-rm-campo-escuro text-[#0a0a0c] dark:text-white shadow-xs'
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
                    className="rounded-3xl p-6 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-rm-cartao-escuro/90 space-y-4 shadow-sm"
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
                                  ? 'border-black dark:border-white bg-white dark:bg-rm-campo-escuro shadow-sm'
                                  : 'border-black/8 dark:border-white/10 bg-white/50 dark:bg-rm-cartao-escuro/50 text-slate-600 dark:text-zinc-400'
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
                            className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs font-mono focus:outline-none"
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
                            className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none"
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
                <div className="rounded-3xl p-10 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro text-center space-y-2">
                  <p className="text-sm font-bold text-[#0a0a0c] dark:text-white">Nenhum canal conectado ainda</p>
                  <p className="text-xs text-slate-500">Vincule a primeira instância ou canal de mensageria da empresa.</p>
                </div>
              ) : canaisViewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {empresa.canais.map((c) => (
                    <div key={c.canal_id} className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro flex items-start justify-between gap-3 shadow-sm hover:shadow-md transition-all">
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
                          <p className="text-[11px] text-slate-500 italic bg-black/[0.02] dark:bg-white/[0.04] p-2.5 rounded-xl border border-black/5 dark:border-white/[0.09]">
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
                <div className="rounded-3xl border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro overflow-hidden shadow-sm">
                  <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 border-b border-black/5 dark:border-white/[0.09] text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-400 bg-black/[0.01] dark:bg-white/[0.02]">
                    <div className="col-span-4">Canal / Categoria</div>
                    <div className="col-span-4">Identificador / Número</div>
                    <div className="col-span-3">Observação Técnica</div>
                    <div className="col-span-1 text-right">Ação</div>
                  </div>

                  <div className="divide-y divide-black/5 dark:divide-white/[0.09]">
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
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                    Acessos e Senhas Técnicas ({credenciaisList.length})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Chaves de acesso criptografadas, com registro de quem visualizou na auditoria.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
                  {/* Alternador de Visualização Cards / Lista */}
                  <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.09]">
                    <button
                      type="button"
                      onClick={() => handleChangeCredenciaisViewMode('cards')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                        credenciaisViewMode === 'cards'
                          ? 'bg-white dark:bg-rm-campo-escuro text-[#0a0a0c] dark:text-white shadow-xs'
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
                          ? 'bg-white dark:bg-rm-campo-escuro text-[#0a0a0c] dark:text-white shadow-xs'
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
                    className="rounded-3xl p-6 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-rm-cartao-escuro/90 space-y-4 shadow-sm"
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
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none"
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
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none"
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
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none font-mono"
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
                            className="text-[10px] text-rm-acento dark:text-rm-acento-escuro font-semibold hover:underline flex items-center gap-1 cursor-pointer"
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
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs font-mono focus:outline-none"
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
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none"
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
                <div className="rounded-3xl p-10 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro text-center space-y-2">
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
                        className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro space-y-3 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 dark:border-white/[0.09] pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-rm-acento/10 dark:bg-rm-acento-escuro/10 flex items-center justify-center text-rm-acento dark:text-rm-acento-escuro font-bold text-xs border border-rm-acento/20">
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
                          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.09] flex items-center justify-between">
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

                          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.09] flex items-center justify-between">
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
                          <p className="text-[11px] text-slate-500 italic bg-black/[0.01] dark:bg-white/[0.02] p-2.5 rounded-xl border border-black/5 dark:border-white/[0.09]">
                            {cred.observacao}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Visualização em Lista / Tabela Keychain */
                <div className="rounded-3xl border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro overflow-hidden shadow-sm">
                  <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-3 border-b border-black/5 dark:border-white/[0.09] text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-400 bg-black/[0.01] dark:bg-white/[0.02]">
                    <div className="col-span-3">Rótulo do Acesso</div>
                    <div className="col-span-2">Nome Usuário</div>
                    <div className="col-span-3">Login / E-mail</div>
                    <div className="col-span-2">Senha Protegida</div>
                    <div className="col-span-2 text-right">Ações</div>
                  </div>

                  <div className="divide-y divide-black/5 dark:divide-white/[0.09]">
                    {credenciaisList.map((cred) => {
                      const isRevelada = Boolean(senhasReveladas[cred.id]);
                      const copiadoU = copiadoId === cred.id + '_u';
                      const copiadoS = copiadoId === cred.id + '_s';

                      return (
                        <div key={cred.id} className="p-4 sm:px-5 sm:py-3.5 flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                          {/* Rótulo */}
                          <div className="lg:col-span-3 flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-lg bg-rm-acento/10 dark:bg-rm-acento-escuro/10 flex items-center justify-center text-xs flex-shrink-0 border border-rm-acento/20">
                              <AppleKeyIcon className="w-3.5 h-3.5 text-rm-acento dark:text-rm-acento-escuro" />
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

              {/* 1. PERFIL: EM QUAL SERVIDOR ESTÁ E SE É CLIENTE NOVO OU JÁ EXISTENTE */}
              <div className="rounded-3xl p-6 sm:p-7 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro shadow-sm">
                <div className="mb-5">
                  <h3 className="text-base sm:text-lg font-bold text-[#0a0a0c] dark:text-white">Servidor e tipo de cliente</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Define onde este cliente roda e se a implantação começa agora ou já foi feita antes do RM Controle.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <span id="perfil-servidor" className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Servidor alocado</span>
                    <div role="radiogroup" aria-labelledby="perfil-servidor" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]">
                      {['servidor_1', 'servidor_2'].map((srv) => {
                        const ativo = (empresa.servidor_alocado || 'servidor_1') === srv;
                        return (
                          <button
                            key={srv}
                            type="button"
                            role="radio"
                            aria-checked={ativo}
                            disabled={trocandoServidor}
                            onClick={() => handleTrocarAlocacaoServidor(srv)}
                            className={`py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                              ativo
                                ? 'bg-white dark:bg-rm-campo-escuro text-[#1d1d1f] dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                            }`}
                          >
                            {srv === 'servidor_2' ? (servidoresConfig?.servidor_2_nome || 'Servidor 2') : (servidoresConfig?.servidor_1_nome || 'Servidor 1')}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-400">A troca é salva na hora para toda a equipe.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span id="perfil-tipo" className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Tipo de cliente</span>
                      {!empresa.tipo_cliente && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">Não informado</span>
                      )}
                    </div>
                    <div role="radiogroup" aria-labelledby="perfil-tipo" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]">
                      {[['novo', 'Cliente novo'], ['existente', 'Já existente']].map(([valor, rotulo]) => (
                        <button
                          key={valor}
                          type="button"
                          role="radio"
                          aria-checked={tipoClienteEdit === valor}
                          onClick={() => setTipoClienteEdit(valor)}
                          className={`py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                            tipoClienteEdit === valor
                              ? 'bg-white dark:bg-rm-campo-escuro text-[#1d1d1f] dark:text-white shadow-sm'
                              : 'text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                          }`}
                        >
                          {rotulo}
                        </button>
                      ))}
                    </div>

                    <AnimatePresence initial={false}>
                      {tipoClienteEdit === 'novo' && (
                        <motion.label
                          key="data-cadastro"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center justify-between gap-2 overflow-hidden pt-1"
                        >
                          <span className="text-xs text-slate-500 dark:text-zinc-400">Data de cadastro</span>
                          <input
                            type="date"
                            value={clienteDesdeEdit || ''}
                            max={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => setClienteDesdeEdit(e.target.value)}
                            className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro text-xs font-mono text-[#1d1d1f] dark:text-white"
                          />
                        </motion.label>
                      )}
                    </AnimatePresence>

                    {tipoClienteEdit === 'existente' && empresa.tipo_cliente !== 'existente' && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                        Ao salvar, os checklists de setup e de implementação do servidor ficam 100% concluídos.
                      </p>
                    )}

                    {(tipoClienteEdit !== (empresa.tipo_cliente || '') || (tipoClienteEdit === 'novo' && clienteDesdeEdit !== (empresa.cliente_desde || (empresa.created_at || '').slice(0, 10)))) && (
                      <button
                        type="button"
                        onClick={handleSalvarTipoCliente}
                        disabled={salvandoTipoCliente}
                        className="w-full py-2.5 rounded-xl bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 text-xs font-bold disabled:opacity-60 cursor-pointer"
                      >
                        {salvandoTipoCliente ? 'Salvando…' : 'Salvar tipo de cliente'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              
              {/* 2. CHECKLIST OBRIGATÓRIO DE IMPLEMENTAÇÃO DE SERVIDOR NOVO (100% DINÂMICO & CUSTOMIZÁVEL) */}
              <div className="rounded-3xl p-6 sm:p-7 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-black/[0.05] dark:border-white/[0.09]">
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
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-rm-acento dark:to-rm-acento-escuro transition-all duration-500"
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
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                        />
                        <input
                          type="text"
                          value={novoChecklistDesc}
                          onChange={(e) => setNovoChecklistDesc(e.target.value)}
                          placeholder="Orientações técnicas (opcional)"
                          className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none"
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
                          className="px-5 py-1.5 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-xs"
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
                            : 'border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro hover:bg-black/[0.015]'
                        }`}
                      >
                        <div
                          className="flex items-start gap-3.5 flex-1 min-w-0 cursor-pointer select-none"
                          onClick={async () => {
                            try {
                              await toggleServidorChecklistItem(empresa.id, item.id, userEmail);
                              showToast(item.concluido ? `Item desmarcado` : `Requisito "${item.titulo}" validado!`, 'success');
                            } catch (err) {
                              showToast(err.message, 'error');
                            } finally {
                              setServidorDetalhes(getEmpresaServidorDetalhes(empresa.id));
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(item.concluido)}
                            onChange={() => {}}
                            className="w-5 h-5 accent-rm-acento dark:accent-rm-acento-escuro cursor-pointer rounded mt-0.5 pointer-events-none"
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
                                try {
                                  await deleteEmpresaChecklistItem(empresa.id, item.id, userEmail);
                                  showToast('Requisito removido do checklist.', 'info');
                                } catch (err) {
                                  showToast(err.message, 'error');
                                } finally {
                                  setServidorDetalhes(getEmpresaServidorDetalhes(empresa.id));
                                  setConfirmDialog(null);
                                }
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
              <div className="rounded-3xl p-6 sm:p-7 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-black/[0.05] dark:border-white/[0.09]">
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
                      className="rounded-3xl p-5 border border-black/10 dark:border-white/15 bg-slate-50/90 dark:bg-rm-cartao-escuro/90 space-y-3"
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
                        className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none"
                      />
                      <textarea
                        rows={3}
                        value={novaObsConteudo}
                        onChange={(e) => setNovaObsConteudo(e.target.value)}
                        placeholder="Conteúdo detalhado da anotação..."
                        required
                        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs focus:outline-none leading-relaxed"
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
                        <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-black/[0.03] dark:border-white/[0.09]">
                          {obs.autor_email} • {new Date(obs.created_at || Date.now()).toLocaleString('pt-BR')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Ação destrutiva separada do resto, com confirmação por nome e senha */}
              <div className="rounded-3xl p-6 sm:p-7 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[#0a0a0c] dark:text-white">Excluir empresa</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Remove a empresa e o que está guardado nela. Pede sua senha e fica registrado na auditoria.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExcluirAberto(true)}
                  className="h-10 px-4 rounded-full text-[13px] font-semibold border border-red-600/30 text-red-600 dark:text-red-400 dark:border-red-400/30 hover:bg-red-600 hover:text-white hover:border-transparent dark:hover:bg-red-500 dark:hover:text-white transition-colors cursor-pointer flex-shrink-0"
                >
                  Excluir empresa…
                </button>
              </div>

            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 5: HISTÓRICO DE SUPORTE */}
          {/* ============================================================================== */}
          {/* Quem pode gravar ou excluir é decidido pelo banco (suporte e administradores gravam; só administradores excluem) */}
          {activeTab === 'contrato' && <EmpresaContratos empresa={empresa} userEmail={userEmail} />}

          {activeTab === 'recorrencias' && (
            <EmpresaRecorrencias chamados={chamadosEmpresa.filter((c) => podeVerDemanda(getPermissoesAtuais(userEmail), c))} carregando={historicoCarregando} erro={historicoErro} />
          )}

          {activeTab === 'chamados' && (
            <div className="space-y-4">
              <div className="rounded-3xl p-6 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro shadow-sm">
                <h2 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                  Histórico de Atendimentos ({chamadosEmpresa.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registro cronológico dos chamados técnicos abertos para esta empresa.
                </p>
              </div>

              {chamadosEmpresa.length === 0 ? (
                <div className="rounded-3xl p-10 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro text-center text-xs text-slate-500">
                  Nenhum atendimento registrado para esta empresa ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {chamadosEmpresa.map((ch) => {
                    const isAtivo = ch.status === 'em_andamento' || (!ch.finalizado_em && ch.status !== 'concluido' && ch.status !== 'finalizado');
                    
                    // Cálculo preciso de duração
                    let segs = ch.duracao_segundos || ch.tempo_ativo_segundos;
                    if (!segs && ch.finalizado_em && (ch.iniciado_em || ch.created_at)) {
                      segs = Math.max(1, Math.floor((new Date(ch.finalizado_em).getTime() - new Date(ch.iniciado_em || ch.created_at).getTime()) / 1000));
                    }

                    const duracaoFormatada = (() => {
                      if (isAtivo) return 'Atendimento Ativo';
                      if (!segs || segs <= 0) return '< 1 min';
                      const hrs = Math.floor(segs / 3600);
                      const mins = Math.floor((segs % 3600) / 60);
                      const s = segs % 60;
                      if (hrs > 0) return `${hrs}h ${mins}m ${s > 0 ? `${s}s` : ''}`;
                      if (mins > 0) return `${mins}m ${s > 0 ? `${s}s` : ''}`;
                      return `${s}s`;
                    })();

                    return (
                      <div
                        key={ch.id}
                        className="rounded-3xl p-5 border border-black/8 dark:border-white/10 bg-white dark:bg-rm-cartao-escuro shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${
                              isAtivo
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 animate-pulse'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                            }`}>
                              {isAtivo ? 'Em Andamento' : 'Finalizado'}
                            </span>
                            <strong className="text-sm text-[#0a0a0c] dark:text-white">
                              {ch.motivo || 'Atendimento Geral'}
                            </strong>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-zinc-400 font-mono pt-1">
                            <div>
                              <span>Início: </span>
                              <strong className="text-slate-700 dark:text-zinc-200">
                                {new Date(ch.iniciado_em || ch.created_at || Date.now()).toLocaleString('pt-BR')}
                              </strong>
                            </div>
                            <div>
                              <span>Término: </span>
                              <strong className="text-slate-700 dark:text-zinc-200">
                                {ch.finalizado_em ? new Date(ch.finalizado_em).toLocaleString('pt-BR') : 'Em andamento'}
                              </strong>
                            </div>
                            <div>
                              <span>Atendente: </span>
                              <strong className="text-slate-700 dark:text-zinc-200">
                                {ch.atendente_nome || ch.tecnico_nome || ch.atendente || ch.tecnico_email || 'Suporte'}
                              </strong>
                            </div>
                            {(ch.colaborador_solicitante || ch.solicitante_nome) && (
                              <div>
                                <span>Solicitante: </span>
                                <strong className="text-slate-700 dark:text-zinc-200">
                                  {ch.colaborador_solicitante || ch.solicitante_nome}
                                </strong>
                              </div>
                            )}
                          </div>

                          {ch.observacao_inicial && <p className="text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-wrap pt-2"><span className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Relato do problema</span>{ch.observacao_inicial}</p>}
                          {(ch.observacoes || ch.resolucao) && (
                            <p className="text-xs text-slate-600 dark:text-zinc-300 italic pt-1 border-t border-black/[0.04] dark:border-white/[0.09]">
                              Resolução: &ldquo;{ch.observacoes || ch.resolucao}&rdquo;
                            </p>
                          )}
                        </div>

                        {/* Tempo de Duração em Destaque */}
                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/6 dark:border-white/[0.11] flex-shrink-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                            Tempo de Duração
                          </span>
                          <span className={`text-sm font-bold font-mono tabular-nums ${
                            isAtivo ? 'text-amber-600 dark:text-amber-400 animate-pulse' : 'text-rm-acento dark:text-rm-acento-escuro'
                          }`}>
                            {duracaoFormatada}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============================================================================== */}
          {/* ABA 5: COMO RESOLVER CHAMADO (BASE DE CONHECIMENTO OPERACIONAL) */}
          {/* ============================================================================== */}
          {/* ============================================================================== */}
          {/* COCKPIT: UMA COLUNA SÓ, "COMO RESOLVER CHAMADOS" (SUGESTÕES DO RELATO NO TOPO)  */}
          {/* A lista completa de acessos e senhas fica na aba de credenciais.                */}
          {/* ============================================================================== */}
          {(activeTab === 'como_resolver' || activeTab === 'cockpit') && (
            <div className="w-full space-y-4">
              {sugestoesDoRelato.length > 0 && (
                <div className="rounded-2xl p-4 border border-black/10 dark:border-white/12 bg-white dark:bg-rm-cartao-escuro">
                  <h3 className="text-sm font-bold text-[#0a0a0c] dark:text-white mb-1">Sugestões para esta demanda</h3>
                  <div className="divide-y divide-black/[0.06] dark:divide-white/[0.11]">
                    {sugestoesDoRelato.map((sol) => (
                      <div key={sol.id} className="py-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-[#0a0a0c] dark:text-white">{sol.titulo}</strong>
                          <button type="button" onClick={() => handleCopiarTexto(sol.solucao_passos, `sug_${sol.id}`)} className="text-slate-400 hover:text-black dark:hover:text-white p-1 cursor-pointer flex-shrink-0" title="Copiar passos">
                            {copiadoId === `sug_${sol.id}` ? <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <p className="text-slate-600 dark:text-zinc-300 whitespace-pre-wrap line-clamp-4">{sol.solucao_passos}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <KnowledgeBaseTab
                empresa={empresa}
                userEmail={userEmail}
                hideListWhenEmpty={true}
              />
            </div>
          )}

        </div>

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal para Edição das URLs dos Servidores 1 e 2 */}
      {isEditServidoresModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border border-black/10 dark:border-white/12 bg-white dark:bg-rm-cartao-escuro p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/6 dark:border-white/[0.11]">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">
                  Configurar Links dos Servidores
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Defina os links dos ambientes de produção para abertura em nova aba.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditServidoresModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-black dark:hover:text-white hover:bg-black/5"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarUrlsServidores} className="space-y-4 pt-1">
              {/* Servidor 1 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>URL do Servidor 1 (Principal)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://acesso.suaempresa.com.br"
                  value={servidor1UrlInput}
                  onChange={(e) => setServidor1UrlInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-rm-cartao-escuro text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento"
                />
              </div>

              {/* Servidor 2 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  <span>URL do Servidor 2 (Secundário)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://acesso2.suaempresa.com.br"
                  value={servidor2UrlInput}
                  onChange={(e) => setServidor2UrlInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-rm-cartao-escuro text-xs font-mono text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/6 dark:border-white/[0.11]">
                <button
                  type="button"
                  onClick={() => setIsEditServidoresModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-black/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-rm-acento/20 hover:opacity-95 transition-all cursor-pointer"
                >
                  Salvar Links
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal Global de Cadastro / Edição de Credencial Técnica (Renderizado via Portal com blur em toda a tela) */}
      {isAddCredOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border border-black/10 dark:border-white/15 bg-white dark:bg-rm-cartao-escuro p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/6 dark:border-white/[0.11]">
              <div>
                <h3 className="text-base font-bold text-[#0a0a0c] dark:text-white">
                  {editandoCredId ? 'Editar Credencial Técnica' : 'Novo Acesso de Suporte'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Cadastre o rótulo do serviço, usuário/e-mail e senha técnica.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddCredOpen(false);
                  setEditandoCredId(null);
                }}
                className="p-1 rounded-full text-slate-400 hover:text-black dark:hover:text-white hover:bg-black/5"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaCredencial} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Rótulo / Serviço <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={credRotulo}
                  onChange={(e) => setCredRotulo(e.target.value)}
                  placeholder="Ex: Painel Admin, Colaborador - João, Servidor SSH"
                  required
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs text-[#0a0a0c] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Nome do Colaborador (Opcional)
                  </label>
                  <input
                    type="text"
                    value={credNomeUsuario}
                    onChange={(e) => setCredNomeUsuario(e.target.value)}
                    placeholder="Ex: João Silva, Gerente"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs text-[#0a0a0c] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Usuário / E-mail de Login
                  </label>
                  <input
                    type="text"
                    value={credUsuario}
                    onChange={(e) => setCredUsuario(e.target.value)}
                    placeholder="joao@empresa.com ou admin"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs font-mono text-[#0a0a0c] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Senha Técnica <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCredSenha(generateSecurePassword(14))}
                    className="text-[10px] text-rm-acento dark:text-rm-acento-escuro font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <SparklesIcon className="w-3 h-3" />
                    <span>Gerar Senha Segura</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={credSenha}
                  onChange={(e) => setCredSenha(e.target.value)}
                  placeholder="Digite a senha..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs font-mono text-[#0a0a0c] dark:text-white focus:outline-none focus:ring-2 focus:ring-rm-acento"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Observações / Instruções de Acesso
                </label>
                <textarea
                  value={credObs}
                  onChange={(e) => setCredObs(e.target.value)}
                  rows={2}
                  placeholder="Ex: Acesso via VPN necessária, porta 2222, etc."
                  className="w-full px-3.5 py-2 rounded-2xl bg-black/[0.02] dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 text-xs text-[#0a0a0c] dark:text-white focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/6 dark:border-white/[0.11]">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddCredOpen(false);
                    setEditandoCredId(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-black/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md shadow-rm-acento/20 hover:opacity-95 transition-all cursor-pointer"
                >
                  {editandoCredId ? 'Salvar Alterações' : 'Cadastrar Acesso'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>,
        document.body
      )}

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
              className="w-full max-w-lg rounded-[28px] bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 p-6 sm:p-7 shadow-2xl space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7] relative"
            >
              <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.11] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-rm-acento dark:bg-rm-acento-escuro"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rm-acento dark:text-rm-acento-escuro">
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
                            ? 'bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 border-rm-acento dark:border-rm-acento-escuro shadow-xs'
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-rm-acento/20 font-medium"
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-rm-acento/20 font-medium"
                />
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.11]">
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
                  className="px-6 py-2 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
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
              className="w-full max-w-lg rounded-[28px] bg-white dark:bg-rm-cartao-escuro border border-black/10 dark:border-white/15 p-6 sm:p-7 shadow-2xl space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7] relative"
            >
              <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] dark:border-white/[0.11] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-rm-acento dark:bg-rm-acento-escuro"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rm-acento dark:text-rm-acento-escuro">
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
                            ? 'bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 border-rm-acento dark:border-rm-acento-escuro shadow-xs'
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-rm-acento/20 font-medium"
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-rm-acento/20 font-medium"
                />
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.11]">
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
                  className="px-6 py-2 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 font-bold text-xs shadow-md hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <PlayIcon className="w-3.5 h-3.5" />
                  <span>Iniciar Atendimento Agora</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      <ExcluirEmpresaModal
        aberto={excluirAberto}
        onFechar={() => setExcluirAberto(false)}
        empresa={empresa}
        onExcluida={() => {
          setExcluirAberto(false);
          onUpdated?.();
          onBack?.();
        }}
      />

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

    </>
  );
}
