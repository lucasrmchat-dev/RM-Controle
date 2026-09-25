import { triggerSupportNotification, stopSupportNotificationLoop } from './audioNotifications';
import { supabase, isSupabaseConfigured } from './supabase';
import { logAuditoria } from './security';

// ==============================================================================
// CONTROLE DE DADOS SIMULADOS (MOCK DEV)
// O padrão é FALSE (dados fake desativados). O usuário ativa quando desejar em Configurações.
// ==============================================================================
export function isMockDataEnabled() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('rm_dev_mock_enabled') === 'true';
}

export function setMockDataEnabled(enabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('rm_dev_mock_enabled', enabled ? 'true' : 'false');
  window.dispatchEvent(new Event('storage_mock_updated'));
}

// ==============================================================================
// SENHA PADRÃO DE REDEFINIÇÃO / CONTINGÊNCIA (CONFIGURAÇÕES GERAIS)
// ==============================================================================
export function getSenhaPadraoRedefinicao() {
  if (typeof window === 'undefined') return 'RmSuporte@Padrao2026!';
  return localStorage.getItem('rm_senha_padrao_redefinicao') || 'RmSuporte@Padrao2026!';
}

export function setSenhaPadraoRedefinicao(novaSenha) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('rm_senha_padrao_redefinicao', novaSenha.trim());
  window.dispatchEvent(new Event('senha_padrao_updated'));
}

// ==============================================================================
// DADOS DE SEMENTE INICIAIS (SEED) PARA HOMOLOGAÇÃO / MOCK DEV
// ==============================================================================
const DEFAULT_CANAIS = [
  { id: 'canal_1', nome: 'Canal API Oficial (Meta Cloud)', tipo: 'api', descricao: 'Meta Cloud API oficial sem risco de banimento' },
  { id: 'canal_2', nome: 'Canal Pareamento QR Code', tipo: 'qrcode', descricao: 'Instância conectada via pareamento de QR Code (Evolution/Baileys)' },
  { id: 'canal_3', nome: 'Facebook Messenger', tipo: 'social', descricao: 'Página comercial integrada para atendimento' },
  { id: 'canal_4', nome: 'Instagram Direct', tipo: 'social', descricao: 'Mensagens diretas comerciais no Instagram' },
  { id: 'canal_5', nome: 'Telegram Bot', tipo: 'api', descricao: 'Automação para suporte via Telegram' },
  { id: 'canal_6', nome: 'Webchat / Widget', tipo: 'outro', descricao: 'Widget embarcado no portal web do cliente' },
];

const DEFAULT_CHECKLIST_MOCK = [
  { id: 'chk_mock_1', titulo: 'Provisionamento do Servidor VPS/Cloud', descricao: 'Instância configurada com SO Linux, portas e firewall', categoria: 'Infraestrutura', obrigatorio: true },
  { id: 'chk_mock_2', titulo: 'Configuração de Domínio e SSL/HTTPS', descricao: "DNS apontado com certificado Let's Encrypt ativo", categoria: 'Rede & SSL', obrigatorio: true },
  { id: 'chk_mock_3', titulo: 'Definição do Formato de Atendimento', descricao: 'Definido entre Formato Colaborativo ou Individual', categoria: 'Aplicação', obrigatorio: true },
  { id: 'chk_mock_4', titulo: 'Configuração dos Canais (API / QR Code)', descricao: 'Canais contratados ativados e validados com testes', categoria: 'Canais', obrigatorio: true },
  { id: 'chk_mock_5', titulo: 'Credenciais de Administrador Cadastradas', descricao: 'E-mail e senha de suporte validados para acesso', categoria: 'Suporte', obrigatorio: true },
  { id: 'chk_mock_6', titulo: 'Rotina de Backup Automático Ativada', descricao: 'Dump de banco e mídias agendados diariamente', categoria: 'Segurança & Backup', obrigatorio: true },
];

const DEFAULT_MOTIVOS_SUPORTE = [
  { id: 'mot_1', nome: 'Redefinição de Senha / Acesso', descricao: 'Cliente esqueceu ou solicitou nova senha de suporte ou admin' },
  { id: 'mot_2', nome: 'Desconexão / Queda de Instância', descricao: 'Instância de mensageria desconectada precisando de novo pareamento' },
  { id: 'mot_3', nome: 'Bloqueio ou Limite na API Meta', descricao: 'Número com limite de mensagens atingido ou falha de pagamento WABA' },
  { id: 'mot_4', nome: 'Servidor VPS Indisponível / Reinício', descricao: 'Servidor fora do ar, alta carga de CPU ou reinício de processos' },
  { id: 'mot_5', nome: 'Configuração de Novo Atendente / Fila', descricao: 'Criação de usuário para novo funcionário e vinculação à fila' },
  { id: 'mot_6', nome: 'Dúvida Operacional / Treinamento', descricao: 'Orientações de uso do painel e fluxo de conversas' },
];

const DEFAULT_EMPRESAS_MOCK = [
  {
    id: 'emp_mock_1',
    nome: 'Alpha Distribuidora',
    formato_atendimento: 'colaborativo',
    servidor_alocado: 'servidor_1',
    ativo: true,
    is_mock: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    canais: [
      { canal_id: 'canal_1', nome: 'Canal API Oficial (Meta Cloud)', tipo: 'api', identificador_numero: '+55 11 98765-4321', status: 'ativo' },
      { canal_id: 'canal_3', nome: 'Facebook Messenger', tipo: 'social', identificador_numero: 'fb/alphadistribuidora', status: 'ativo' },
    ],
    observacoes: [
      { id: 'obs_1', titulo: 'Particularidade do Atendimento', conteudo: 'Cliente solicitou fila de triagem compartilhada entre os 8 operadores.', autor_email: 'admin@rmcontrole.com', created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() }
    ],
    credenciais_lista: [
      {
        id: 'cred_mock_1',
        rotulo: 'Administrador Geral (Diretoria)',
        usuario_email: 'suporte@alphadistribuidora.com.br',
        senha: 'Alpha#Support2026!',
        observacao: 'Acesso principal ao painel',
        ultima_alteracao: new Date().toISOString()
      },
      {
        id: 'cred_mock_2',
        rotulo: 'Servidor VPS (Acesso SSH Root)',
        usuario_email: 'root@159.65.23.88',
        senha: 'Vps#RootAlpha2026!',
        observacao: 'Porta 2222',
        ultima_alteracao: new Date().toISOString()
      }
    ],
    checklist: [
      { id: 'chk_mock_1', titulo: 'Provisionamento do Servidor VPS/Cloud', concluido: true, observacao: 'VPS 4 vCPU 8GB RAM na Hetzner' },
      { id: 'chk_mock_2', titulo: 'Configuração de Domínio e SSL/HTTPS', concluido: true, observacao: 'atendimento.alphadistribuidora.com.br' },
      { id: 'chk_mock_3', titulo: 'Definição do Formato de Atendimento', concluido: true, observacao: 'Optou pelo Formato Colaborativo' },
      { id: 'chk_mock_4', titulo: 'Configuração dos Canais (API / QR Code)', concluido: true, observacao: 'API Meta Oficial ativada' },
      { id: 'chk_mock_5', titulo: 'Credenciais de Administrador Cadastradas', concluido: true, observacao: 'Entregues ao diretor' },
      { id: 'chk_mock_6', titulo: 'Rotina de Backup Automático Ativada', concluido: true, observacao: 'S3 configurado para as 03:00' }
    ]
  },
  {
    id: 'emp_mock_2',
    nome: 'Belo Horizonte Logística',
    formato_atendimento: 'individual',
    servidor_alocado: 'servidor_2',
    ativo: true,
    is_mock: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    canais: [
      { canal_id: 'canal_2', nome: 'Canal Pareamento QR Code', tipo: 'qrcode', identificador_numero: '+55 31 99123-8877', status: 'ativo' }
    ],
    observacoes: [
      { id: 'obs_2', titulo: 'Formato Individual', conteudo: 'Cada atendente visualiza exclusivamente as conversas atribuídas à sua carteira de motoristas.', autor_email: 'suporte@rmcontrole.com', created_at: new Date().toISOString() }
    ],
    credenciais_lista: [
      {
        id: 'cred_mock_3',
        rotulo: 'Acesso Administrativo',
        usuario_email: 'ti@bhlog.com.br',
        senha: 'BhLog@Support88!',
        observacao: 'Painel Web',
        ultima_alteracao: new Date().toISOString()
      }
    ],
    checklist: [
      { id: 'chk_mock_1', titulo: 'Provisionamento do Servidor VPS/Cloud', concluido: true, observacao: 'DigitalOcean droplet' },
      { id: 'chk_mock_2', titulo: 'Configuração de Domínio e SSL/HTTPS', concluido: true, observacao: 'chat.bhlog.com.br' },
      { id: 'chk_mock_3', titulo: 'Definição do Formato de Atendimento', concluido: true, observacao: 'Formato Individual para cada motorista' },
      { id: 'chk_mock_4', titulo: 'Configuração dos Canais (API / QR Code)', concluido: false, observacao: 'Aguardando cliente escanear QR Code' },
      { id: 'chk_mock_5', titulo: 'Credenciais de Administrador Cadastradas', concluido: true, observacao: 'Admin cadastrado' },
      { id: 'chk_mock_6', titulo: 'Rotina de Backup Automático Ativada', concluido: false, observacao: 'Pendente ativação do bucket' }
    ]
  }
];

function getLocalData(key, defaultVal) {
  if (typeof window === 'undefined') return defaultVal;
  try {
    const item = localStorage.getItem('rm_' + key);
    if (!item) {
      localStorage.setItem('rm_' + key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(item);
  } catch (e) {
    return defaultVal;
  }
}

function setLocalData(key, val) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('rm_' + key, JSON.stringify(val));
  } catch (e) {
    console.error('Erro ao gravar localStorage:', e);
  }
}

// ==============================================================================
// GESTÃO DO CHECKLIST GLOBAL DE SERVIDORES (CRIADO PELO ADMINISTRADOR)
// ==============================================================================
export function getServerChecklistTemplate() {
  if (isMockDataEnabled()) {
    const userCustom = getLocalData('server_checklist_template', []);
    return [...DEFAULT_CHECKLIST_MOCK, ...userCustom];
  }
  // Quando mock está DESLIGADO, retorna estritamente apenas o checklist configurado pelo admin
  return getLocalData('server_checklist_template', []);
}

export function addServerChecklistTemplateItem({ titulo, descricao = '', categoria = 'Infraestrutura', obrigatorio = true }) {
  if (!titulo || !titulo.trim()) throw new Error('O título do requisito é obrigatório.');
  const template = getLocalData('server_checklist_template', []);
  const novoItem = {
    id: 'chk_tpl_' + Date.now(),
    titulo: titulo.trim(),
    descricao: descricao.trim(),
    categoria: categoria.trim() || 'Infraestrutura',
    obrigatorio: Boolean(obrigatorio),
    created_at: new Date().toISOString(),
  };
  template.push(novoItem);
  setLocalData('server_checklist_template', template);
  return novoItem;
}

export function removeServerChecklistTemplateItem(itemId) {
  let template = getLocalData('server_checklist_template', []);
  template = template.filter((i) => i.id !== itemId);
  setLocalData('server_checklist_template', template);
  return true;
}

// ==============================================================================
// GESTÃO DE CATÁLOGO DE MOTIVOS DE SUPORTE
// ==============================================================================
export function getMotivosSuporte() {
  return getLocalData('motivos_suporte', DEFAULT_MOTIVOS_SUPORTE);
}

export function addMotivoSuporte({ nome, descricao = '' }) {
  if (!nome || !nome.trim()) throw new Error('Nome do motivo de suporte é obrigatório.');
  const motivos = getLocalData('motivos_suporte', DEFAULT_MOTIVOS_SUPORTE);
  const novoMotivo = {
    id: 'mot_' + Date.now(),
    nome: nome.trim(),
    descricao: descricao.trim(),
  };
  motivos.push(novoMotivo);
  setLocalData('motivos_suporte', motivos);
  return novoMotivo;
}

export function removeMotivoSuporte(id) {
  let motivos = getLocalData('motivos_suporte', DEFAULT_MOTIVOS_SUPORTE);
  motivos = motivos.filter((m) => m.id !== id);
  setLocalData('motivos_suporte', motivos);
  return true;
}

// ==============================================================================
// SISTEMA DE CHAMADOS & FILA DE SUPORTE (INICIAR, FILA, ASSUMIR, FINALIZAR & TIMER)
// ==============================================================================
export async function iniciarSuporte({ 
  empresa_id, 
  empresa_nome, 
  chamado_id = null,
  motivo = '',
  prioridade = 'normal',
  descricao = '',
  solicitante = '',
  solicitante_nome = '',
  userEmail = 'admin@rmcontrole.com' 
}) {
  const agora = new Date().toISOString();
  const agoraMs = new Date(agora).getTime();
  const chamados = getLocalData('chamados_suporte', []);

  // Se já existe um ID específico (ex: item que estava 'pendente' ou 'aguardando_visualizacao')
  if (chamado_id) {
    const idx = chamados.findIndex((c) => c.id === chamado_id);
    if (idx !== -1) {
      const anterior = chamados[idx];
      const inicioEsperaMs = new Date(anterior.tempo_espera_inicio || anterior.created_at || agora).getTime();
      const esperaSegs = Math.max(0, Math.floor((agoraMs - inicioEsperaMs) / 1000));

      chamados[idx] = {
        ...anterior,
        status: 'em_andamento',
        tecnico_email: userEmail,
        tecnico_nome: getNomeTecnico(userEmail),
        tempo_espera_fim: agora,
        tempo_espera_segundos: esperaSegs,
        tempo_ativo_inicio: agora,
        iniciado_em: agora,
        solicitante_nome: solicitante_nome || solicitante || anterior.solicitante_nome || anterior.solicitante || 'Colaborador',
      };
      setLocalData('chamados_suporte', chamados);

      try {
        stopSupportNotificationLoop();
      } catch (e) {}

      await logAuditoria({
        empresaId: empresa_id,
        usuarioEmail: userEmail,
        acao: 'iniciou_suporte_tecnico',
        detalhes: { empresa_nome, iniciado_em: chamados[idx].iniciado_em, espera_segundos: esperaSegs, modulo: 'Fila de Suporte' },
      });

      window.dispatchEvent(new Event('suporte_updated'));
      return chamados[idx];
    }
  }

  const jaEmAndamento = chamados.find((c) => c.empresa_id === empresa_id && c.status === 'em_andamento');
  if (jaEmAndamento) return jaEmAndamento;

  const novoChamado = {
    id: 'chamado_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    empresa_id,
    empresa_nome,
    tecnico_email: userEmail,
    tecnico_nome: getNomeTecnico(userEmail),
    status: 'em_andamento',
    solicitante_nome: solicitante_nome || solicitante || 'Colaborador',
    created_at: agora,
    tempo_espera_inicio: agora,
    tempo_espera_fim: agora,
    tempo_espera_segundos: 0,
    tempo_ativo_inicio: agora,
    tempo_ativo_fim: null,
    tempo_ativo_segundos: 0,
    iniciado_em: agora,
    finalizado_em: null,
    duracao_segundos: 0,
    observacoes: descricao || '',
  };

  chamados.unshift(novoChamado);
  setLocalData('chamados_suporte', chamados);

  try {
    stopSupportNotificationLoop();
  } catch (e) {}

  await logAuditoria({
    empresaId: empresa_id,
    usuarioEmail: userEmail,
    acao: 'iniciou_suporte_tecnico',
    detalhes: { empresa_nome, iniciado_em: novoChamado.iniciado_em, modulo: 'Fila de Suporte' },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return novoChamado;
}

export async function adicionarChamadoFila({
  empresa_id,
  empresa_nome,
  solicitante_nome = '',
  solicitante_email = '',
  solicitante_telefone = '',
  atribuido_a = null,
  observacao_inicial = '',
  iniciarAgora = false,
  userEmail = 'admin@rmcontrole.com',
}) {
  const agora = new Date().toISOString();
  const agoraMs = Date.now();
  const chamados = getLocalData('chamados_suporte', []);

  if (iniciarAgora) {
    const novoChamado = {
      id: 'chamado_' + agoraMs + '_' + Math.random().toString(36).substr(2, 5),
      empresa_id,
      empresa_nome,
      tecnico_email: userEmail,
      tecnico_nome: getNomeTecnico(userEmail),
      solicitante_nome: (solicitante_nome || 'Colaborador').trim(),
      solicitante_email: solicitante_email.trim(),
      solicitante_telefone: solicitante_telefone.trim(),
      observacao_inicial: observacao_inicial.trim(),
      status: 'em_andamento',
      created_at: agora,
      tempo_espera_inicio: agora,
      tempo_espera_fim: agora,
      tempo_espera_segundos: 0,
      tempo_ativo_inicio: agora,
      tempo_ativo_fim: null,
      tempo_ativo_segundos: 0,
      iniciado_em: agora,
      finalizado_em: null,
    };
    chamados.unshift(novoChamado);
    setLocalData('chamados_suporte', chamados);

    await logAuditoria({
      empresaId: empresa_id,
      usuarioEmail: userEmail,
      acao: 'iniciou_suporte_tecnico',
      detalhes: { empresa_nome, modulo: 'Fila de Suporte' },
    });
    window.dispatchEvent(new Event('suporte_updated'));
    return novoChamado;
  }

  const tecnicoDesignado = atribuido_a ? atribuido_a : userEmail;
  const statusInicial = 'aguardando_visualizacao';

  const novoChamado = {
    id: 'chamado_' + agoraMs + '_' + Math.random().toString(36).substr(2, 5),
    empresa_id,
    empresa_nome,
    tecnico_email: tecnicoDesignado,
    tecnico_nome: getNomeTecnico(tecnicoDesignado),
    solicitante_nome: (solicitante_nome || 'Colaborador').trim(),
    solicitante_email: solicitante_email.trim(),
    solicitante_telefone: solicitante_telefone.trim(),
    observacao_inicial: observacao_inicial.trim(),
    status: statusInicial,
    created_at: agora,
    tempo_espera_inicio: agora,
    tempo_espera_fim: null,
    tempo_espera_segundos: 0,
    tempo_ativo_inicio: null,
    tempo_ativo_fim: null,
    tempo_ativo_segundos: 0,
    iniciado_em: null,
    finalizado_em: null,
  };

  chamados.unshift(novoChamado);
  setLocalData('chamados_suporte', chamados);

  try {
    triggerSupportNotification({ chamado: novoChamado, userEmail });
  } catch (e) {}

  await logAuditoria({
    empresaId: empresa_id,
    usuarioEmail: userEmail,
    acao: 'adicionou_chamado_na_fila',
    detalhes: { empresa_nome, atribuido_a: tecnicoDesignado, modulo: 'Fila de Suporte' },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return novoChamado;
}

export async function assumirSuporte({ chamado_id, userEmail = 'admin@rmcontrole.com' }) {
  const chamados = getLocalData('chamados_suporte', []);
  const idx = chamados.findIndex((c) => c.id === chamado_id);
  if (idx === -1) return null;

  const anterior = chamados[idx];
  const agora = new Date().toISOString();
  const agoraMs = new Date(agora).getTime();
  const inicioEsperaMs = new Date(anterior.tempo_espera_inicio || anterior.created_at || agora).getTime();
  const esperaSegundos = Math.max(0, Math.floor((agoraMs - inicioEsperaMs) / 1000));

  chamados[idx] = {
    ...anterior,
    tecnico_email: userEmail,
    tecnico_nome: getNomeTecnico(userEmail),
    status: 'em_andamento',
    tempo_espera_fim: agora,
    tempo_espera_segundos: esperaSegundos,
    tempo_ativo_inicio: agora,
    iniciado_em: agora,
  };

  setLocalData('chamados_suporte', chamados);

  try {
    stopSupportNotificationLoop();
  } catch (e) {}

  await logAuditoria({
    empresaId: anterior.empresa_id,
    usuarioEmail: userEmail,
    acao: 'assumiu_suporte_tecnico',
    detalhes: {
      empresa_nome: anterior.empresa_nome,
      espera_segundos: esperaSegundos,
      modulo: 'Fila de Suporte',
    },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return chamados[idx];
}

export function getFilaChamados() {
  const chamados = getLocalData('chamados_suporte', []);
  return chamados.filter((c) => c.status === 'em_andamento' || c.status === 'pendente' || c.status === 'aguardando_visualizacao');
}

export function getChamadosResolvidosHoje() {
  const historico = getLocalData('historico_chamados', []);
  const hojeStr = new Date().toISOString().split('T')[0];
  return historico.filter((c) => (c.finalizado_em || '').startsWith(hojeStr));
}

export async function finalizarSuporte({
  chamado_id,
  motivo,
  observacoes = '',
  colaborador_solicitante = '',
  atendente = '',
  userEmail = 'admin@rmcontrole.com'
}) {
  const chamados = getLocalData('chamados_suporte', []);
  const idx = chamados.findIndex((c) => c.id === chamado_id);
  if (idx === -1) throw new Error('Chamado não encontrado.');

  const chamado = chamados[idx];
  const finalizadoEm = new Date().toISOString();
  const agoraMs = new Date(finalizadoEm).getTime();

  let esperaSegs = chamado.tempo_espera_segundos || 0;
  if (!chamado.tempo_espera_fim && chamado.tempo_espera_inicio) {
    esperaSegs = Math.max(0, Math.floor((agoraMs - new Date(chamado.tempo_espera_inicio).getTime()) / 1000));
  }

  const ativoInicioMs = new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em || finalizadoEm).getTime();
  const ativoSegs = Math.max(1, Math.floor((agoraMs - ativoInicioMs) / 1000));

  const chamadoFinalizado = {
    ...chamado,
    status: 'concluido',
    motivo: motivo || chamado.motivo || 'Atendimento Geral',
    solicitante_nome: colaborador_solicitante || chamado.solicitante_nome || 'Colaborador',
    resolucao: observacoes || '',
    observacoes: observacoes || '',
    finalizado_em: finalizadoEm,
    tempo_espera_segundos: esperaSegs,
    tempo_ativo_segundos: ativoSegs,
    duracao_segundos: ativoSegs,
    atendente_nome: atendente || chamado.tecnico_nome || getNomeTecnico(userEmail),
    tecnico_email: chamado.tecnico_email || userEmail,
    tecnico_nome: chamado.tecnico_nome || getNomeTecnico(userEmail),
  };

  chamados.splice(idx, 1);
  setLocalData('chamados_suporte', chamados);

  const historico = getLocalData('historico_chamados', []);
  historico.unshift(chamadoFinalizado);
  setLocalData('historico_chamados', historico.slice(0, 500));

  // Sincroniza com a tabela suporte_chamados no Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const isUuid = chamado.empresa_id && chamado.empresa_id.includes('-');
      if (isUuid) {
        const payload = {
          empresa_id: chamado.empresa_id,
          empresa_nome: chamado.empresa_nome,
          tecnico_email: chamadoFinalizado.tecnico_email || userEmail,
          atendente: chamadoFinalizado.atendente_nome || chamadoFinalizado.tecnico_nome,
          colaborador_solicitante: chamadoFinalizado.solicitante_nome || '',
          status: 'finalizado',
          iniciado_em: chamadoFinalizado.iniciado_em || finalizadoEm,
          finalizado_em: finalizadoEm,
          duracao_segundos: ativoSegs,
          motivo: chamadoFinalizado.motivo || 'Atendimento Geral',
          observacoes: chamadoFinalizado.observacoes || '',
        };
        const { data: dbSaved, error: errDb } = await supabase.from('suporte_chamados').insert([payload]).select().single();
        if (!errDb && dbSaved) {
          chamadoFinalizado.id = dbSaved.id;
          const hAtual = getLocalData('historico_chamados', []);
          if (hAtual.length > 0 && (hAtual[0].id === chamado.id || hAtual[0].created_at === chamadoFinalizado.created_at)) {
            hAtual[0].id = dbSaved.id;
            setLocalData('historico_chamados', hAtual);
          }
        }
      }
    } catch (errSup) {
      console.warn('Aviso ao sincronizar chamado finalizado no Supabase:', errSup);
    }
  }

  try {
    stopSupportNotificationLoop();
  } catch (e) {}

  await logAuditoria({
    empresaId: chamado.empresa_id,
    usuarioEmail: userEmail,
    acao: 'finalizou_suporte_tecnico',
    detalhes: {
      empresa_nome: chamado.empresa_nome,
      motivo,
      tempo_ativo_segundos: ativoSegs,
      tempo_espera_segundos: esperaSegs,
      modulo: 'Fila de Suporte',
    },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return chamadoFinalizado;
}

export async function cancelarSuporte({ chamado_id, userEmail = 'admin@rmcontrole.com' }) {
  const chamados = getLocalData('chamados_suporte', []);
  const idx = chamados.findIndex((c) => c.id === chamado_id);
  if (idx === -1) return null;

  const anterior = chamados[idx];
  chamados.splice(idx, 1);
  setLocalData('chamados_suporte', chamados);

  try {
    stopSupportNotificationLoop();
  } catch (e) {}

  await logAuditoria({
    empresaId: anterior.empresa_id,
    usuarioEmail: userEmail,
    acao: 'cancelou_suporte_tecnico',
    detalhes: { empresa_nome: anterior.empresa_nome, modulo: 'Fila de Suporte' },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return true;
}
export function getNomeTecnico(email, fallbackNome = null) {
  if (!email) return fallbackNome || 'Não atribuído';
  const emailNorm = email.toLowerCase().trim();
  const equipe = getEquipeUsuarios();
  const membro = equipe.find((u) => (u.email || '').toLowerCase().trim() === emailNorm);
  if (membro && membro.nome) return membro.nome;
  if (fallbackNome) return fallbackNome;
  if (emailNorm === 'admin@rmcontrole.com') return 'Lucas Amorim (Administrador)';
  const part = email.split('@')[0];
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export async function addColaboradorEmpresa(empresaId, { nome, cargo = '', email = '', telefone = '' }, userEmail = 'admin@rmcontrole.com') {
  if (!nome || !nome.trim()) throw new Error('Nome do colaborador é obrigatório.');

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  const novoColaborador = {
    id: 'colab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    nome: nome.trim(),
    cargo: cargo.trim(),
    email: email.trim(),
    telefone: telefone.trim(),
    created_at: new Date().toISOString(),
  };

  if (emp) {
    if (!emp.colaboradores) emp.colaboradores = [];
    emp.colaboradores.push(novoColaborador);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'adicionou_colaborador_empresa',
    detalhes: { nome: novoColaborador.nome, cargo, email, modulo: 'Colaboradores da Empresa' },
  });

  return novoColaborador;
}

export async function deleteHistoricoChamado(chamadoId, userEmail = 'admin@rmcontrole.com') {
  // 1. Remove do historico_chamados
  let historico = getLocalData('historico_chamados', []);
  const chamadoExcluido = historico.find((c) => c.id === chamadoId);
  historico = historico.filter((c) => c.id !== chamadoId);
  setLocalData('historico_chamados', historico);

  // 2. Remove também de chamados_suporte (garante limpeza completa de chamados finalizados legados)
  let chamados = getLocalData('chamados_suporte', []);
  chamados = chamados.filter((c) => c.id !== chamadoId);
  setLocalData('chamados_suporte', chamados);

  // 3. Remove no Supabase se configurado
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('suporte_chamados').delete().eq('id', chamadoId);
    } catch (e) {
      console.warn('Erro ao excluir chamado no Supabase:', e);
    }
  }

  await logAuditoria({
    empresaId: chamadoExcluido?.empresa_id || null,
    usuarioEmail: userEmail,
    acao: 'excluiu_historico_chamado',
    detalhes: {
      chamado_id: chamadoId,
      empresa_nome: chamadoExcluido?.empresa_nome || '',
      modulo: 'Histórico de Atendimentos',
    },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return true;
}


export function getHistoricoChamados() {
  const historico = getLocalData('historico_chamados', []);
  return historico.map((c) => ({
    ...c,
    tecnico_nome: c.tecnico_nome || getNomeTecnico(c.tecnico_email, c.atendente_nome),
  }));
}

// Sincroniza e busca todos os chamados finalizados do Supabase (para exibir atendimentos de todos os usuários)
export async function fetchHistoricoChamados() {
  let dbChamados = [];
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('suporte_chamados')
        .select('*')
        .order('finalizado_em', { ascending: false });

      if (!error && data) {
        dbChamados = data.map((d) => ({
          id: d.id,
          empresa_id: d.empresa_id,
          empresa_nome: d.empresa_nome,
          tecnico_email: d.tecnico_email,
          tecnico_nome: d.atendente || getNomeTecnico(d.tecnico_email),
          atendente_nome: d.atendente || getNomeTecnico(d.tecnico_email),
          solicitante_nome: d.colaborador_solicitante || 'Colaborador',
          status: 'concluido',
          motivo: (d.motivo || '').trim() || 'Atendimento Geral',
          observacoes: d.observacoes || '',
          resolucao: d.observacoes || '',
          iniciado_em: d.iniciado_em,
          finalizado_em: d.finalizado_em,
          duracao_segundos: d.duracao_segundos || 0,
          tempo_ativo_segundos: d.duracao_segundos || 0,
          created_at: d.created_at || d.iniciado_em,
        }));
      }
    } catch (e) {
      console.warn('Erro ao buscar suporte_chamados no Supabase:', e);
    }
  }

  // Mescla com historico local preservando unicidade
  const localHist = getLocalData('historico_chamados', []);
  const mapa = new Map();
  // Dados do banco Supabase têm prioridade
  dbChamados.forEach((c) => mapa.set(c.id, c));
  // Mantém locais
  localHist.forEach((c) => {
    if (!mapa.has(c.id)) mapa.set(c.id, c);
  });

  const merged = Array.from(mapa.values()).sort(
    (a, b) => new Date(b.finalizado_em || b.iniciado_em || 0) - new Date(a.finalizado_em || a.iniciado_em || 0)
  );

  setLocalData('historico_chamados', merged);
  return merged;
}

// Registro de Suporte Direto / Retroativo (Sem cronômetro ativo, apenas contabiliza resolução)
export async function registrarSuporteRetroativo({
  empresa_id,
  empresa_nome,
  motivo,
  observacoes = '',
  solicitante_nome = '',
  atendente = '',
  userEmail = 'admin@rmcontrole.com',
  data_atendimento = null
}) {
  if (!empresa_id) throw new Error('Selecione a empresa para registrar o suporte.');
  if (!motivo || !motivo.trim()) throw new Error('Selecione o motivo do suporte.');

  const finalizadoEm = data_atendimento ? new Date(data_atendimento).toISOString() : new Date().toISOString();
  const nomeAtendente = atendente || getNomeTecnico(userEmail);

  const novoChamado = {
    id: 'chamado_ret_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    empresa_id,
    empresa_nome: (empresa_nome || 'Empresa').trim(),
    tecnico_email: userEmail,
    tecnico_nome: nomeAtendente,
    atendente_nome: nomeAtendente,
    solicitante_nome: (solicitante_nome || 'Colaborador').trim(),
    status: 'concluido',
    motivo: motivo.trim(),
    observacoes: (observacoes || '').trim(),
    resolucao: (observacoes || '').trim(),
    iniciado_em: finalizadoEm,
    finalizado_em: finalizadoEm,
    tempo_espera_segundos: 0,
    tempo_ativo_segundos: 0,
    duracao_segundos: 0,
    retroativo: true,
    created_at: finalizadoEm,
  };

  // 1. Grava no histórico local
  const historico = getLocalData('historico_chamados', []);
  historico.unshift(novoChamado);
  setLocalData('historico_chamados', historico.slice(0, 500));

  // 2. Grava no Supabase suporte_chamados
  if (isSupabaseConfigured && supabase) {
    try {
      const isUuid = empresa_id && empresa_id.includes('-');
      if (isUuid) {
        const payload = {
          empresa_id,
          empresa_nome: novoChamado.empresa_nome,
          tecnico_email: userEmail,
          atendente: nomeAtendente,
          colaborador_solicitante: novoChamado.solicitante_nome,
          status: 'finalizado',
          iniciado_em: finalizadoEm,
          finalizado_em: finalizadoEm,
          duracao_segundos: 0,
          motivo: novoChamado.motivo,
          observacoes: novoChamado.observacoes,
        };
        const { data: dbSaved, error: errDb } = await supabase.from('suporte_chamados').insert([payload]).select().single();
        if (!errDb && dbSaved) {
          novoChamado.id = dbSaved.id;
          const histAtual = getLocalData('historico_chamados', []);
          if (histAtual.length > 0 && histAtual[0].created_at === finalizadoEm) {
            histAtual[0].id = dbSaved.id;
            setLocalData('historico_chamados', histAtual);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao salvar suporte retroativo no Supabase:', e);
    }
  }

  // 3. Auditoria LGPD
  await logAuditoria({
    empresaId: empresa_id,
    usuarioEmail: userEmail,
    acao: 'registrou_suporte_retroativo',
    detalhes: {
      empresa_nome: novoChamado.empresa_nome,
      motivo,
      atendente: nomeAtendente,
      solicitante: novoChamado.solicitante_nome,
      duracao_segundos: 0,
      modulo: 'Registro de Suporte',
    },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return novoChamado;
}

export function getChamadoAtivo(empresa_id = null) {
  const chamados = getLocalData('chamados_suporte', []);
  if (empresa_id) {
    return chamados.find((c) => c.empresa_id === empresa_id && c.status === 'em_andamento') || null;
  }
  return chamados.find((c) => c.status === 'em_andamento') || null;
}

export function getChamadosAtivos() {
  const chamados = getLocalData('chamados_suporte', []);
  return chamados.filter((c) => c.status === 'em_andamento');
}

// Configurações de Obrigatoriedade de Campos de Suporte
const DEFAULT_CONFIG_SUPORTE = {
  motivo_obrigatorio: true,
  solucao_obrigatoria: false,
  colaborador_obrigatorio: false,
  atendente_obrigatorio: false,
};

export function getConfiguracoesSuporte() {
  return getLocalData('configuracoes_suporte', DEFAULT_CONFIG_SUPORTE);
}

export function setConfiguracoesSuporte(config) {
  const atual = getConfiguracoesSuporte();
  const novo = { ...atual, ...config };
  setLocalData('configuracoes_suporte', novo);
  window.dispatchEvent(new Event('config_suporte_updated'));
  return novo;
}

export function getChamadosSuporte({ empresa_id = null, status = 'todos' } = {}) {
  let chamados = getLocalData('chamados_suporte', []);
  if (empresa_id) {
    chamados = chamados.filter((c) => c.empresa_id === empresa_id);
  }
  if (status && status !== 'todos') {
    chamados = chamados.filter((c) => c.status === status);
  }
  return chamados;
}

export function getMetricasSuporte({ periodo = '7d', dataInicio = null, dataFim = null } = {}) {
  const chamadosAtivos = getLocalData('chamados_suporte', []);
  const historicoChamados = getLocalData('historico_chamados', []);

  // Mescla sem duplicidade usando Map
  const mapa = new Map();
  chamadosAtivos.forEach((c) => {
    mapa.set(c.id, { ...c, status: c.status || 'em_andamento' });
  });
  historicoChamados.forEach((c) => {
    mapa.set(c.id, { ...c, status: 'finalizado' });
  });

  let chamados = Array.from(mapa.values());
  const hoje = new Date();

  // Filtro de período dinâmico
  if (periodo === 'hoje') {
    const hojeStr = hoje.toISOString().split('T')[0];
    chamados = chamados.filter((c) => (c.finalizado_em || c.iniciado_em || c.created_at || '').startsWith(hojeStr));
  } else if (periodo === '7d') {
    const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
    chamados = chamados.filter((c) => new Date(c.finalizado_em || c.iniciado_em || c.created_at) >= seteDiasAtras);
  } else if (periodo === '30d') {
    const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    chamados = chamados.filter((c) => new Date(c.finalizado_em || c.iniciado_em || c.created_at) >= trintaDiasAtras);
  } else if (periodo === 'mes_atual') {
    const mesAtualPrefix = hoje.toISOString().slice(0, 7);
    chamados = chamados.filter((c) => (c.finalizado_em || c.iniciado_em || c.created_at || '').startsWith(mesAtualPrefix));
  } else if (periodo === 'personalizado' && dataInicio && dataFim) {
    const inicio = new Date(dataInicio + 'T00:00:00');
    const fim = new Date(dataFim + 'T23:59:59');
    chamados = chamados.filter((c) => {
      const dt = new Date(c.finalizado_em || c.iniciado_em || c.created_at);
      return dt >= inicio && dt <= fim;
    });
  }

  const finalizados = chamados.filter((c) => c.status === 'finalizado' || c.status === 'concluido');
  const emAndamento = chamados.filter((c) => c.status === 'em_andamento' || c.status === 'aguardando_visualizacao' || c.status === 'pendente');

  // Tempo médio geral apenas para atendimentos com cronômetro real (> 0s)
  const finalizadosComTempo = finalizados.filter((c) => (c.duracao_segundos || c.tempo_ativo_segundos || 0) > 0);
  const duracaoTotalSegundos = finalizadosComTempo.reduce((acc, c) => acc + (c.duracao_segundos || c.tempo_ativo_segundos || 0), 0);
  const tempoMedioSegundos = finalizadosComTempo.length > 0 ? Math.round(duracaoTotalSegundos / finalizadosComTempo.length) : 0;

  // Distribuição por motivos reais de todos os finalizados
  const motivosCount = {};
  finalizados.forEach((c) => {
    const m = (c.motivo || '').trim() || 'Atendimento Geral';
    motivosCount[m] = (motivosCount[m] || 0) + 1;
  });

  const topMotivos = Object.entries(motivosCount)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count);

  // Métricas por empresa (empresas que mais demandam suporte)
  const empresasStats = {};
  const motivosPorEmpresa = {};

  chamados.forEach((c) => {
    const empId = c.empresa_id || c.empresa_nome || 'Empresa';
    const empNome = c.empresa_nome || 'Empresa';

    if (!empresasStats[empId]) {
      empresasStats[empId] = {
        empresa_id: c.empresa_id,
        empresa_nome: empNome,
        total_chamados: 0,
        concluidos: 0,
        em_andamento: 0,
        duracao_total: 0,
      };
      motivosPorEmpresa[empId] = {};
    }
    empresasStats[empId].total_chamados += 1;
    if (c.status === 'finalizado' || c.status === 'concluido') {
      empresasStats[empId].concluidos += 1;
      empresasStats[empId].duracao_total += (c.duracao_segundos || c.tempo_ativo_segundos || 0);
      const mot = (c.motivo || '').trim() || 'Atendimento Geral';
      motivosPorEmpresa[empId][mot] = (motivosPorEmpresa[empId][mot] || 0) + 1;
    } else {
      empresasStats[empId].em_andamento += 1;
    }
  });

  const totalGeralChamados = Math.max(1, chamados.length);
  const metricasEmpresas = Object.values(empresasStats).map((e) => {
    const motivosEmp = motivosPorEmpresa[e.empresa_id || e.empresa_nome] || {};
    const motivoMaisFrequente = Object.entries(motivosEmp).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Atendimento Geral';

    return {
      ...e,
      motivo_mais_frequente: motivoMaisFrequente,
      tempo_medio_minutos: e.concluidos > 0 ? Math.round((e.duracao_total / e.concluidos) / 60) : 0,
      percentual_do_total: Math.round((e.total_chamados / totalGeralChamados) * 100),
    };
  }).sort((a, b) => b.total_chamados - a.total_chamados);

  // Métricas por Membro da Equipe / Colaborador (Suportes realizados e resolvidos)
  const equipeUsuarios = getEquipeUsuarios();
  const colaboradoresStats = {};

  equipeUsuarios.forEach((u) => {
    const emailNorm = (u.email || '').toLowerCase().trim();
    if (!emailNorm) return;
    colaboradoresStats[emailNorm] = {
      id: u.id,
      nome: u.nome,
      email: u.email,
      papel: u.papel || 'suporte',
      total_chamados: 0,
      resolvidos: 0,
      em_andamento: 0,
      duracao_total_segundos: 0,
    };
  });

  chamados.forEach((c) => {
    const atendenteEmail = (c.atendente || c.tecnico_email || '').toLowerCase().trim();
    if (!atendenteEmail) return;

    if (!colaboradoresStats[atendenteEmail]) {
      const nomeAmigavel = c.tecnico_nome || c.atendente_nome || atendenteEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      colaboradoresStats[atendenteEmail] = {
        id: 'usr_' + Math.random().toString(36).substr(2, 6),
        nome: nomeAmigavel,
        email: atendenteEmail,
        papel: 'suporte',
        total_chamados: 0,
        resolvidos: 0,
        em_andamento: 0,
        duracao_total_segundos: 0,
      };
    }

    colaboradoresStats[atendenteEmail].total_chamados += 1;
    if (c.status === 'finalizado' || c.status === 'concluido') {
      colaboradoresStats[atendenteEmail].resolvidos += 1;
      colaboradoresStats[atendenteEmail].duracao_total_segundos += (c.duracao_segundos || c.tempo_ativo_segundos || 0);
    } else {
      colaboradoresStats[atendenteEmail].em_andamento += 1;
    }
  });

  const maxResolvidos = Math.max(1, ...Object.values(colaboradoresStats).map((col) => col.resolvidos));

  const metricasColaboradores = Object.values(colaboradoresStats).map((col) => {
    const tempoMedioSeg = col.resolvidos > 0 ? Math.round(col.duracao_total_segundos / col.resolvidos) : 0;
    const taxaResolucao = col.total_chamados > 0 ? Math.round((col.resolvidos / col.total_chamados) * 100) : 0;
    const percentualLideranca = Math.round((col.resolvidos / maxResolvidos) * 100);

    return {
      ...col,
      tempo_medio_segundos: tempoMedioSeg,
      tempo_medio_minutos: Math.round(tempoMedioSeg / 60),
      taxa_resolucao: taxaResolucao,
      percentual_lideranca: percentualLideranca,
    };
  }).sort((a, b) => {
    if (b.resolvidos !== a.resolvidos) return b.resolvidos - a.resolvidos;
    return b.total_chamados - a.total_chamados;
  });

  // Dados para o Gráfico de Linha do Tempo (Últimos 7 dias em data local)
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const evolucaoUltimos7Dias = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(hoje.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dStr = `${y}-${m}-${day}`;
    const diaNome = diasSemana[d.getDay()];

    const count = finalizados.filter((c) => {
      const dataChamado = (c.finalizado_em || c.iniciado_em || c.created_at || '').split('T')[0];
      return dataChamado === dStr;
    }).length;

    evolucaoUltimos7Dias.push({
      data: dStr,
      label: diaNome,
      chamados: count,
    });
  }

  return {
    totalChamados: chamados.length,
    finalizadosCount: finalizados.length,
    emAndamentoCount: emAndamento.length,
    tempoMedioSegundos,
    tempoMedioMinutos: Math.round(tempoMedioSegundos / 60),
    topMotivos,
    metricasEmpresas,
    metricasColaboradores,
    emAndamento,
    evolucaoUltimos7Dias,
  };
}

// ==============================================================================
// GESTÃO DE MÚLTIPLOS ACESSOS / CREDENCIAIS POR EMPRESA
// ==============================================================================
export function getEmpresaCredenciais(empresaId) {
  const empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);
  if (!emp && isMockDataEnabled()) {
    emp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
  }
  if (!emp) return [];

  if (!emp.credenciais_lista && emp.credenciais) {
    emp.credenciais_lista = [
      {
        id: 'cred_legado_1',
        rotulo: 'Acesso Principal do Administrador',
        usuario_email: emp.credenciais.email_administrador || '',
        senha: emp.credenciais.senha_suporte || '',
        observacao: 'Acesso padrão',
        ultima_alteracao: emp.credenciais.ultima_alteracao || new Date().toISOString(),
      }
    ];
  }

  return emp.credenciais_lista || [];
}

export async function addEmpresaCredencial(empresaId, { rotulo, usuario_email, senha, observacao = '' }, userEmail = 'admin@rmcontrole.com') {
  if (!senha || !senha.trim()) throw new Error('A senha é obrigatória.');

  let credId = 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

  // Schema real da tabela empresa_credenciais:
  // id (uuid), empresa_id (uuid), email_administrador (text), senha_suporte (text), ultima_alteracao (timestamptz)
  if (isSupabaseConfigured && supabase && empresaId && empresaId.length === 36) {
    try {
      const { data: dbCred, error: credErr } = await supabase
        .from('empresa_credenciais')
        .insert([
          {
            empresa_id: empresaId,
            email_administrador: (usuario_email || '').trim() || null,
            senha_suporte: senha.trim(),
            ultima_alteracao: new Date().toISOString(),
          }
        ])
        .select()
        .single();

      if (!credErr && dbCred) {
        credId = dbCred.id;
      } else if (credErr) {
        console.warn('Erro ao inserir credencial no Supabase:', credErr);
      }
    } catch (e) {
      console.warn('Erro ao inserir credencial no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  const novaCred = {
    id: credId,
    rotulo: (rotulo || 'Acesso Suporte').trim(),
    usuario_email: (usuario_email || '').trim(),
    senha: senha.trim(),
    observacao: (observacao || '').trim(),
    ultima_alteracao: new Date().toISOString(),
  };

  if (emp) {
    if (!emp.credenciais_lista) emp.credenciais_lista = [];
    emp.credenciais_lista.push(novaCred);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'adicionou_credencial_suporte',
    detalhes: { rotulo: novaCred.rotulo, usuario_email: novaCred.usuario_email, modulo: 'Credenciais & Acessos' },
  });

  return novaCred;
}

export async function updateEmpresaCredencial(empresaId, credId, dados, userEmail = 'admin@rmcontrole.com') {
  if (isSupabaseConfigured && supabase && credId && credId.length === 36) {
    try {
      const updateData = {
        ultima_alteracao: new Date().toISOString(),
      };
      if (dados.usuario_email !== undefined) updateData.email_administrador = dados.usuario_email.trim();
      if (dados.senha !== undefined) updateData.senha_suporte = dados.senha.trim();

      await supabase.from('empresa_credenciais').update(updateData).eq('id', credId);
    } catch (e) {
      console.warn('Erro ao atualizar credencial no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  if (emp && emp.credenciais_lista) {
    const idx = emp.credenciais_lista.findIndex((c) => c.id === credId);
    if (idx !== -1) {
      emp.credenciais_lista[idx] = {
        ...emp.credenciais_lista[idx],
        ...dados,
        ultima_alteracao: new Date().toISOString(),
      };
      setLocalData('empresas_reais', empresas);
    }
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'alterou_credencial_suporte',
    detalhes: { credId, rotulo: dados.rotulo, modulo: 'Credenciais & Acessos' },
  });

  return true;
}

export async function deleteEmpresaCredencial(empresaId, credId, userEmail = 'admin@rmcontrole.com') {
  if (isSupabaseConfigured && supabase && credId && credId.length === 36) {
    try {
      await supabase.from('empresa_credenciais').delete().eq('id', credId);
    } catch (e) {
      console.warn('Erro ao deletar credencial no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  if (emp && emp.credenciais_lista) {
    emp.credenciais_lista = emp.credenciais_lista.filter((c) => c.id !== credId);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'removeu_credencial_suporte',
    detalhes: { credId, modulo: 'Credenciais & Acessos' },
  });

  return true;
}

// ==============================================================================
// GESTÃO DE USUÁRIOS E PERMISSÕES POR ABA (SUPORTE, VENDAS, ADMIN)
// ==============================================================================
export const PERMISSOES_PADRAO = {
  administrador: ['empresas', 'fila', 'dashboard', 'configuracoes', 'canais', 'servidores', 'auditoria'],
  suporte: ['empresas', 'fila', 'dashboard'],
  vendas: ['empresas', 'fila', 'dashboard'],
};

export function resolveUserRole(email) {
  if (!email) return 'suporte';
  const emailNorm = email.toLowerCase().trim();
  if (emailNorm === 'admin@rmcontrole.com') return 'administrador';
  const equipe = getEquipeUsuarios();
  const membro = equipe.find((u) => (u.email || '').toLowerCase().trim() === emailNorm);
  if (membro && membro.papel) return membro.papel;
  if (emailNorm.includes('admin')) return 'administrador';
  if (emailNorm.includes('vendas') || emailNorm.includes('comercial')) return 'vendas';
  return 'suporte';
}

export function getCurrentUserRole() {
  if (typeof window === 'undefined') return 'suporte';
  const savedUser = localStorage.getItem('rm_auth_user');
  if (savedUser) {
    return resolveUserRole(savedUser);
  }
  return localStorage.getItem('rm_user_role') || 'suporte';
}

export function setCurrentUserRole(role) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('rm_user_role', role);
  window.dispatchEvent(new Event('user_role_updated'));
}

export function getAbasPermitidas(role = null) {
  const currentRole = role || getCurrentUserRole();
  return PERMISSOES_PADRAO[currentRole] || PERMISSOES_PADRAO.suporte;
}

export function getEquipeUsuarios() {
  return getLocalData('equipe_usuarios', [
    { id: 'usr_1', nome: 'Lucas Amorim (Administrador)', email: 'admin@rmcontrole.com', senha: 'RmControle@Admin2026!', papel: 'administrador', criado_em: new Date().toISOString() },
    { id: 'usr_2', nome: 'Equipe de Suporte Técnico', email: 'suporte@rmcontrole.com', senha: 'RmSuporte@Padrao2026!', papel: 'suporte', criado_em: new Date().toISOString() },
    { id: 'usr_3', nome: 'Equipe Comercial & Vendas', email: 'vendas@rmcontrole.com', papel: 'vendas', senha: 'RmVendas@Padrao2026!', criado_em: new Date().toISOString() },
  ]);
}

export async function addEquipeUsuario({ nome, email, senha = '', papel = 'suporte' }) {
  if (!email || !email.trim()) throw new Error('E-mail é obrigatório.');
  const emailLimpo = email.trim().toLowerCase();
  const senhaFinal = (senha || '').trim() || getSenhaPadraoRedefinicao();

  // 1. Cadastra no Supabase Authentication
  if (isSupabaseConfigured && supabase) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

      if (supabaseUrl && supabaseAnonKey) {
        const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
          email: emailLimpo,
          password: senhaFinal,
          options: {
            data: {
              name: (nome || '').trim(),
              papel: papel,
            },
          },
        });

        if (signUpError) {
          console.warn('Aviso no Supabase Auth ao criar usuário:', signUpError.message);
        } else {
          console.log('Usuário registrado com sucesso no Supabase Authentication:', emailLimpo);
        }
      }
    } catch (errAuth) {
      console.warn('Erro ao conectar ao Supabase Auth:', errAuth);
    }

    // 2. Insere na tabela public.equipe_usuarios no Supabase
    try {
      await supabase.from('equipe_usuarios').insert([
        {
          nome: (nome || '').trim() || emailLimpo.split('@')[0],
          email: emailLimpo,
          papel: papel || 'suporte',
          senha: senhaFinal,
          ativo: true,
        }
      ]);
    } catch (errTbl) {
      console.warn('Aviso ao inserir na tabela equipe_usuarios:', errTbl);
    }
  }

  // 3. Salva na lista de equipe local
  const usuarios = getEquipeUsuarios();
  if (usuarios.some((u) => (u.email || '').toLowerCase().trim() === emailLimpo)) {
    throw new Error('Já existe um membro cadastrado com este e-mail.');
  }

  const novo = {
    id: 'usr_' + Date.now(),
    nome: (nome || '').trim() || email.split('@')[0],
    email: emailLimpo,
    senha: senhaFinal,
    papel: papel || 'suporte',
    criado_em: new Date().toISOString(),
  };

  usuarios.push(novo);
  setLocalData('equipe_usuarios', usuarios);
  window.dispatchEvent(new Event('equipe_updated'));
  window.dispatchEvent(new Event('user_role_updated'));

  await logAuditoria({
    usuarioEmail: emailLimpo,
    acao: 'cadastrou_novo_usuario',
    detalhes: { nome: novo.nome, email: emailLimpo, papel, modulo: 'Gestão de Usuários' },
  });

  return novo;
}

export async function updateEquipeUsuario(id, dados) {
  const usuarios = getEquipeUsuarios();
  const idx = usuarios.findIndex((u) => u.id === id);
  if (idx !== -1) {
    const atual = usuarios[idx];
    const novaSenha = (dados.senha && dados.senha.trim()) ? dados.senha.trim() : atual.senha;
    const novoPapel = dados.papel || atual.papel || 'suporte';
    const emailFinal = (dados.email && dados.email.trim()) ? dados.email.trim().toLowerCase() : atual.email;

    usuarios[idx] = {
      ...atual,
      ...dados,
      email: emailFinal,
      papel: novoPapel,
      senha: novaSenha,
    };
    setLocalData('equipe_usuarios', usuarios);

    // Atualiza tabela equipe_usuarios no Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const updateDb = {
          nome: dados.nome || atual.nome,
          email: emailFinal,
          papel: novoPapel,
          updated_at: new Date().toISOString(),
        };
        if (dados.senha) updateDb.senha = novaSenha;

        await supabase.from('equipe_usuarios').update(updateDb).or(`id.eq.${id},email.eq.${atual.email}`);
      } catch (e) {}

      // Se o usuário logado for o próprio editado, atualiza seus metadados no Supabase Auth
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email?.toLowerCase().trim() === emailFinal) {
          await supabase.auth.updateUser({
            data: {
              name: dados.nome || atual.nome,
              papel: novoPapel,
            },
          });
        }
      } catch (e) {}
    }

    // Se o usuário editado for o usuário logado atualmente no navegador:
    const currentUserEmail = (localStorage.getItem('rm_auth_user') || '').toLowerCase().trim();
    if (currentUserEmail === (atual.email || '').toLowerCase().trim() || currentUserEmail === emailFinal) {
      setCurrentUserRole(novoPapel);
    }

    window.dispatchEvent(new Event('equipe_updated'));
    window.dispatchEvent(new Event('user_role_updated'));
  }
  return true;
}

export async function deleteEquipeUsuario(id) {
  let usuarios = getEquipeUsuarios();
  const usuario = usuarios.find((u) => u.id === id);

  if (isSupabaseConfigured && supabase && usuario) {
    try {
      await supabase.from('equipe_usuarios').delete().or(`id.eq.${id},email.eq.${usuario.email}`);
    } catch (e) {}
  }

  usuarios = usuarios.filter((u) => u.id !== id);
  setLocalData('equipe_usuarios', usuarios);
  window.dispatchEvent(new Event('equipe_updated'));
  return true;
}



// ==============================================================================
// GESTÃO DE CATÁLOGO DE CANAIS
// ==============================================================================
export async function getCanaisCatalogo() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('canais_catalogo')
        .select('*')
        .eq('ativo', true)
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) return data;
    } catch (e) {
      console.warn('Recorrendo aos canais locais:', e);
    }
  }
  return getLocalData('canais_catalogo', DEFAULT_CANAIS);
}

export async function createCanalCatalogo({ nome, tipo, descricao = '' }) {
  const novoCanal = {
    id: 'canal_' + Date.now(),
    nome,
    tipo,
    descricao,
    ativo: true,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('canais_catalogo')
        .insert([{ nome, tipo, descricao }])
        .select()
        .single();
      if (!error && data) return data;
    } catch (e) {
      console.warn('Erro ao inserir canal no Supabase:', e);
    }
  }

  const canais = getLocalData('canais_catalogo', DEFAULT_CANAIS);
  canais.push(novoCanal);
  setLocalData('canais_catalogo', canais);
  return novoCanal;
}

// ==============================================================================
// LISTAGEM, BUSCA APRIMORADA, FILTRO E PAGINAÇÃO DE EMPRESAS
// ==============================================================================
export async function getEmpresas({
  page = 1,
  pageSize = 10,
  search = '',
  canalTipo = 'todos',
  formato = 'todos',
  servidor = 'todos', // 'todos' | 'servidor_1' | 'servidor_2'
} = {}) {
  let empresas = [];

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select(`
          *,
          canais:empresa_canais(
            *,
            catalogo:canais_catalogo(*)
          ),
          observacoes:empresa_observacoes(*),
          credenciais:empresa_credenciais(*),
          checklist:empresa_checklist(*)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        empresas = data.map((emp) => ({
          ...emp,
          is_mock: false,
          servidor_alocado: 'servidor_1',
          canais: (emp.canais || []).map((c) => ({
            id: c.id,
            canal_id: c.canal_id,
            nome: c.catalogo?.nome || 'Canal',
            tipo: c.catalogo?.tipo || 'outro',
            identificador_numero: c.identificador_numero || '',
            status: c.status || 'ativo',
            observacao: c.observacao || '',
          })),
          observacoes: (emp.observacoes || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
          credenciais_lista: (emp.credenciais || []).map((cr) => ({
            id: cr.id,
            rotulo: 'Acesso Principal',
            usuario_email: cr.email_administrador || '',
            senha: cr.senha_suporte || '',
            observacao: '',
            ultima_alteracao: cr.ultima_alteracao || cr.created_at,
          })),
          checklist: (emp.checklist || []).map((chk) => ({
            id: chk.id,
            titulo: chk.titulo,
            descricao: '',
            categoria: 'Infraestrutura',
            concluido: !!chk.concluido,
            observacao: chk.observacao || '',
          })),
        }));

        if (empresas.length > 0) {
          setLocalData('empresas_reais', empresas);
        }
      } else if (error) {
        console.warn('Erro ao consultar empresas no Supabase:', error);
      }
    } catch (e) {
      console.warn('Recorrendo ao armazenamento local para listar empresas:', e);
    }
  }

  // AUTO-MIGRAÇÃO DE CONTINGÊNCIA
  if (isSupabaseConfigured && supabase) {
    const empresasLocais = getLocalData('empresas_reais', []);
    const empresasNaoMigradas = empresasLocais.filter(
      (loc) => !loc.is_mock && (!loc.id || !loc.id.includes('-')) && !empresas.some((db) => db.nome.toLowerCase().trim() === loc.nome.toLowerCase().trim())
    );

    if (empresasNaoMigradas.length > 0) {
      for (const leg of empresasNaoMigradas) {
        try {
          const { data: mig, error: migErr } = await supabase
            .from('empresas')
            .insert([
              {
                nome: leg.nome,
                formato_atendimento: 'colaborativo',
                ativo: leg.ativo !== false,
              }
            ])
            .select()
            .single();

          if (!migErr && mig) {
            if (leg.credenciais_lista && leg.credenciais_lista.length > 0) {
              for (const cr of leg.credenciais_lista) {
                await supabase.from('empresa_credenciais').insert([
                  {
                    empresa_id: mig.id,
                    email_administrador: cr.usuario_email || null,
                    senha_suporte: cr.senha || getSenhaPadraoRedefinicao(),
                    ultima_alteracao: new Date().toISOString(),
                  }
                ]);
              }
            }
            empresas.unshift({
              ...leg,
              id: mig.id,
              created_at: mig.created_at,
            });
          }
        } catch (e) {}
      }
    }
  }

  if (empresas.length === 0) {
    const empresasReais = getLocalData('empresas_reais', []);
    if (isMockDataEnabled()) {
      empresas = [...empresasReais, ...DEFAULT_EMPRESAS_MOCK];
    } else {
      empresas = empresasReais;
    }
  } else {
    if (isMockDataEnabled()) {
      empresas = [...empresas, ...DEFAULT_EMPRESAS_MOCK];
    }
  }

  if (!isMockDataEnabled()) {
    empresas = empresas.map((emp) => ({
      ...emp,
      checklist: (emp.checklist || []).filter((item) => !item.id.includes('mock')),
    }));
  }

  // Busca aprimorada
  if (search && search.trim() !== '') {
    const q = search.toLowerCase().trim();
    const qNumeros = q.replace(/\D/g, '');

    empresas = empresas.filter((emp) => {
      const nomeMatch = (emp.nome || '').toLowerCase().includes(q);
      const servidorMatch = (emp.servidor_alocado || '').toLowerCase().includes(q);
      
      const credsMatch = (emp.credenciais_lista || []).some((c) => 
        (c.usuario_email || '').toLowerCase().includes(q) || 
        (c.rotulo || '').toLowerCase().includes(q)
      );

      const canaisMatch = (emp.canais || []).some((c) => {
        const cNome = (c.nome || '').toLowerCase().includes(q);
        const cObs = (c.observacao || '').toLowerCase().includes(q);
        const cIdNum = (c.identificador_numero || '').replace(/\D/g, '');
        const numMatch = qNumeros.length >= 3 && cIdNum.includes(qNumeros);
        return cNome || cObs || numMatch;
      });

      return nomeMatch || servidorMatch || credsMatch || canaisMatch;
    });
  }

  if (canalTipo !== 'todos') {
    empresas = empresas.filter((emp) =>
      emp.canais?.some((c) => c.tipo === canalTipo)
    );
  }

  if (formato !== 'todos') {
    empresas = empresas.filter((emp) => emp.formato_atendimento === formato);
  }

  if (servidor !== 'todos') {
    empresas = empresas.filter((emp) => (emp.servidor_alocado || 'servidor_1') === servidor);
  }

  const total = empresas.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const paginated = empresas.slice((page - 1) * pageSize, page * pageSize);

  return {
    items: paginated,
    total,
    page,
    pageSize,
    totalPages,
  };
}

// ==============================================================================
// CADASTRO DE EMPRESAS (PERSISTÊNCIA REAL NO SUPABASE CONFORME SCHEMA)
// ==============================================================================
export async function createEmpresa({
  nome,
  formato_atendimento = 'colaborativo',
  servidor_alocado = 'servidor_1',
  email_administrador = '',
  senha_suporte = '',
  canaisIniciais = [],
  userEmail = 'admin@rmcontrole.com'
}) {
  const trimmedNome = (nome || '').trim();
  if (!trimmedNome) throw new Error('O nome da empresa é obrigatório.');

  const templateChecklist = getServerChecklistTemplate();
  let empresaId = null;
  let createdDbEmpresa = null;

  // 1. Inserção direta nas colunas reais da tabela empresas:
  // empresas: id, nome, formato_atendimento, ativo, created_at, updated_at, created_by
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: dbEmp, error: dbErr } = await supabase
        .from('empresas')
        .insert([
          {
            nome: trimmedNome,
            formato_atendimento: 'colaborativo',
            ativo: true,
          }
        ])
        .select()
        .single();

      if (dbErr) {
        console.error('Erro ao cadastrar empresa no Supabase:', dbErr);
        throw new Error('Falha ao cadastrar empresa no Supabase: ' + dbErr.message);
      } else if (dbEmp) {
        createdDbEmpresa = dbEmp;
        empresaId = dbEmp.id;

        // Inserção em empresa_credenciais (email_administrador, senha_suporte, ultima_alteracao)
        const emailAdm = (email_administrador || '').trim() || `admin@${trimmedNome.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`;
        const senhaSup = (senha_suporte || '').trim() || getSenhaPadraoRedefinicao();

        try {
          await supabase.from('empresa_credenciais').insert([
            {
              empresa_id: empresaId,
              email_administrador: emailAdm,
              senha_suporte: senhaSup,
              ultima_alteracao: new Date().toISOString(),
            }
          ]);
        } catch (cErr) {
          console.warn('Erro ao inserir credencial no Supabase:', cErr);
        }

        // Inserção em empresa_checklist (titulo, concluido, observacao)
        if (templateChecklist && templateChecklist.length > 0) {
          try {
            const chkInserts = templateChecklist.map((item) => ({
              empresa_id: empresaId,
              titulo: item.titulo,
              concluido: false,
              observacao: '',
            }));
            await supabase.from('empresa_checklist').insert(chkInserts);
          } catch (chkErr) {
            console.warn('Erro ao inserir checklist no Supabase:', chkErr);
          }
        }

        // Inserção em empresa_canais se houver canais válidos
        if (canaisIniciais && canaisIniciais.length > 0) {
          try {
            const canaisInserts = canaisIniciais
              .filter((c) => c.canal_id && c.canal_id.length === 36)
              .map((c) => ({
                empresa_id: empresaId,
                canal_id: c.canal_id,
                identificador_numero: c.identificador_numero || '',
                status: c.status || 'ativo',
                observacao: c.observacao || '',
              }));
            if (canaisInserts.length > 0) {
              await supabase.from('empresa_canais').insert(canaisInserts);
            }
          } catch (canErr) {
            console.warn('Erro ao inserir canais no Supabase:', canErr);
          }
        }
      }
    } catch (supErr) {
      console.error('Falha ao criar empresa no Supabase:', supErr);
      if (supErr.message && supErr.message.includes('Supabase:')) {
        throw supErr;
      }
    }
  }

  if (!empresaId) {
    empresaId = 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  const novaEmpresa = {
    id: empresaId,
    nome: trimmedNome,
    formato_atendimento: 'colaborativo',
    servidor_alocado,
    ativo: true,
    is_mock: false,
    created_at: createdDbEmpresa?.created_at || new Date().toISOString(),
    canais: canaisIniciais,
    observacoes: [],
    credenciais_lista: [
      {
        id: 'cred_' + Date.now(),
        rotulo: 'Acesso Principal do Administrador',
        usuario_email: email_administrador || `admin@${trimmedNome.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`,
        senha: senha_suporte || getSenhaPadraoRedefinicao(),
        observacao: 'Acesso inicial configurado no cadastro',
        ultima_alteracao: new Date().toISOString(),
      }
    ],
    checklist: templateChecklist.map((item) => ({
      id: 'chk_inst_' + Math.random().toString(36).substr(2, 7),
      titulo: item.titulo,
      descricao: item.descricao,
      categoria: item.categoria,
      concluido: false,
      observacao: '',
    })),
  };

  const empresasReais = getLocalData('empresas_reais', []);
  empresasReais.unshift(novaEmpresa);
  setLocalData('empresas_reais', empresasReais);

  await logAuditoria({
    empresaId: novaEmpresa.id,
    usuarioEmail: userEmail,
    acao: 'cadastrou_empresa_manual',
    detalhes: { nome: trimmedNome, servidor_alocado, modulo: 'Gestão de Empresas' },
  });

  return novaEmpresa;
}

export async function createEmpresasEmMassa(items, { formato_atendimento = 'colaborativo', servidor_alocado = 'servidor_1', userEmail = 'admin@rmcontrole.com' } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Lista de empresas inválida.');
  }

  const empresasNormalizadas = items
    .map((item) => {
      if (typeof item === 'string') {
        const nomeTrim = item.trim();
        return nomeTrim ? { nome: nomeTrim, email_administrador: '', senha_suporte: '' } : null;
      }
      if (item && typeof item === 'object') {
        const nomeTrim = (item.nome || '').trim();
        return nomeTrim
          ? {
              nome: nomeTrim,
              email_administrador: (item.email_administrador || item.email || '').trim(),
              senha_suporte: (item.senha_suporte || item.senha || '').trim(),
            }
          : null;
      }
      return null;
    })
    .filter(Boolean);

  if (empresasNormalizadas.length === 0) throw new Error('Nenhuma empresa válida informada.');

  const criadas = [];
  const empresasReais = getLocalData('empresas_reais', []);
  const templateChecklist = getServerChecklistTemplate();

  if (isSupabaseConfigured && supabase) {
    try {
      const inserts = empresasNormalizadas.map((emp) => ({
        nome: emp.nome,
        formato_atendimento: 'colaborativo',
        ativo: true,
      }));

      const { data: dbEmpresas, error } = await supabase.from('empresas').insert(inserts).select();

      if (error) {
        console.error('Erro ao cadastrar empresas em lote no Supabase:', error);
        throw new Error('Falha ao cadastrar empresas no Supabase: ' + error.message);
      }

      if (dbEmpresas && dbEmpresas.length > 0) {
        for (let i = 0; i < dbEmpresas.length; i++) {
          const emp = dbEmpresas[i];
          const infoOriginal = empresasNormalizadas[i] || {};
          const emailAdm = infoOriginal.email_administrador || `admin@${emp.nome.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`;
          const senhaSup = infoOriginal.senha_suporte || getSenhaPadraoRedefinicao();

          try {
            await supabase.from('empresa_credenciais').insert([
              {
                empresa_id: emp.id,
                email_administrador: emailAdm,
                senha_suporte: senhaSup,
                ultima_alteracao: new Date().toISOString(),
              }
            ]);
            if (templateChecklist.length > 0) {
              const chkInserts = templateChecklist.map((item) => ({
                empresa_id: emp.id,
                titulo: item.titulo,
                concluido: false,
                observacao: '',
              }));
              await supabase.from('empresa_checklist').insert(chkInserts);
            }
          } catch (e) {}

          const novaObj = {
            id: emp.id,
            nome: emp.nome,
            formato_atendimento: 'colaborativo',
            servidor_alocado,
            ativo: true,
            is_mock: false,
            created_at: emp.created_at || new Date().toISOString(),
            canais: [],
            observacoes: [],
            credenciais_lista: [
              {
                id: 'cred_' + Date.now(),
                rotulo: 'Acesso Principal do Administrador',
                usuario_email: emailAdm,
                senha: senhaSup,
                observacao: 'Importação em lote',
                ultima_alteracao: new Date().toISOString(),
              }
            ],
            checklist: templateChecklist.map((item) => ({
              id: 'chk_inst_' + Math.random().toString(36).substr(2, 7),
              titulo: item.titulo,
              descricao: item.descricao,
              categoria: item.categoria,
              concluido: false,
              observacao: '',
            })),
          };
          empresasReais.unshift(novaObj);
          criadas.push(novaObj);
        }

        setLocalData('empresas_reais', empresasReais);

        await logAuditoria({
          usuarioEmail: userEmail,
          acao: 'cadastrou_empresas_em_massa',
          detalhes: { quantidade: criadas.length, nomes: empresasNormalizadas.map((e) => e.nome), modulo: 'Gestão de Empresas' },
        });

        return criadas;
      }
    } catch (e) {
      console.warn('Erro ao inserir empresas em massa no Supabase:', e);
      if (e.message && e.message.includes('Supabase:')) throw e;
    }
  }

  for (const empItem of empresasNormalizadas) {
    const emailAdm = empItem.email_administrador || `admin@${empItem.nome.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`;
    const senhaSup = empItem.senha_suporte || getSenhaPadraoRedefinicao();

    const nova = {
      id: 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      nome: empItem.nome,
      formato_atendimento: 'colaborativo',
      servidor_alocado,
      ativo: true,
      is_mock: false,
      created_at: new Date().toISOString(),
      canais: [],
      observacoes: [],
      credenciais_lista: [
        {
          id: 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          rotulo: 'Acesso Principal do Administrador',
          usuario_email: emailAdm,
          senha: senhaSup,
          observacao: 'Importação em lote',
          ultima_alteracao: new Date().toISOString(),
        }
      ],
      checklist: templateChecklist.map((item) => ({
        id: 'chk_inst_' + Math.random().toString(36).substr(2, 7),
        titulo: item.titulo,
        descricao: item.descricao,
        categoria: item.categoria,
        concluido: false,
        observacao: '',
      })),
    };

    empresasReais.unshift(nova);
    criadas.push(nova);
  }

  setLocalData('empresas_reais', empresasReais);

  await logAuditoria({
    usuarioEmail: userEmail,
    acao: 'cadastrou_empresas_em_massa',
    detalhes: { quantidade: criadas.length, nomes: empresasNormalizadas.map((e) => e.nome), modulo: 'Gestão de Empresas' },
  });

  return criadas;
}

export async function getEmpresaById(id) {
  if (isSupabaseConfigured && supabase && id && id.length === 36) {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select(`
          *,
          canais:empresa_canais(
            *,
            catalogo:canais_catalogo(*)
          ),
          observacoes:empresa_observacoes(*),
          credenciais:empresa_credenciais(*),
          checklist:empresa_checklist(*)
        `)
        .eq('id', id)
        .single();

      if (!error && data) {
        return {
          ...data,
          is_mock: false,
          servidor_alocado: 'servidor_1',
          canais: (data.canais || []).map((c) => ({
            id: c.id,
            canal_id: c.canal_id,
            nome: c.catalogo?.nome || 'Canal',
            tipo: c.catalogo?.tipo || 'outro',
            identificador_numero: c.identificador_numero || '',
            status: c.status || 'ativo',
            observacao: c.observacao || '',
          })),
          observacoes: (data.observacoes || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
          credenciais_lista: (data.credenciais || []).map((cr) => ({
            id: cr.id,
            rotulo: 'Acesso Principal',
            usuario_email: cr.email_administrador || '',
            senha: cr.senha_suporte || '',
            observacao: '',
            ultima_alteracao: cr.ultima_alteracao || cr.created_at,
          })),
          checklist: (data.checklist || []).map((chk) => ({
            id: chk.id,
            titulo: chk.titulo,
            descricao: '',
            categoria: 'Infraestrutura',
            concluido: !!chk.concluido,
            observacao: chk.observacao || '',
          })),
        };
      }
    } catch (e) {
      console.warn('Recorrendo ao armazenamento local para getEmpresaById:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let encontrada = empresas.find((e) => e.id === id);
  if (!encontrada && isMockDataEnabled()) {
    encontrada = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === id);
  }
  if (!encontrada) throw new Error('Empresa não encontrada.');

  if (!isMockDataEnabled()) {
    encontrada = {
      ...encontrada,
      checklist: (encontrada.checklist || []).filter((i) => !i.id.includes('mock')),
    };
  }

  return encontrada;
}

export async function updateEmpresa(id, dados, userEmail = 'admin@rmcontrole.com') {
  if (isSupabaseConfigured && supabase && id && id.length === 36) {
    try {
      const updatePayload = {
        updated_at: new Date().toISOString(),
      };
      if (dados.nome !== undefined) updatePayload.nome = dados.nome;
      if (dados.formato_atendimento !== undefined) updatePayload.formato_atendimento = dados.formato_atendimento;
      if (dados.ativo !== undefined) updatePayload.ativo = dados.ativo;

      await supabase.from('empresas').update(updatePayload).eq('id', id);
    } catch (e) {
      console.warn('Erro ao atualizar empresa no Supabase:', e);
    }
  }

  let empresasReais = getLocalData('empresas_reais', []);
  let idx = empresasReais.findIndex((e) => e.id === id);
  
  if (idx !== -1) {
    empresasReais[idx] = {
      ...empresasReais[idx],
      ...dados,
      updated_at: new Date().toISOString(),
    };
    setLocalData('empresas_reais', empresasReais);
  } else {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === id);
    if (mockEmp) {
      const cloned = { ...mockEmp, ...dados, is_mock: false, updated_at: new Date().toISOString() };
      empresasReais.unshift(cloned);
      setLocalData('empresas_reais', empresasReais);
    }
  }

  await logAuditoria({
    empresaId: id,
    usuarioEmail: userEmail,
    acao: 'atualizou_dados_empresa',
    detalhes: { ...dados, modulo: 'Configurações da Empresa' },
  });

  return dados;
}

export async function deleteEmpresa(id, userEmail = 'admin@rmcontrole.com') {
  if (isSupabaseConfigured && supabase && id && id.length === 36) {
    try {
      await supabase.from('empresas').delete().eq('id', id);
    } catch (e) {
      console.warn('Erro ao excluir empresa no Supabase:', e);
    }
  }

  let empresasReais = getLocalData('empresas_reais', []);
  empresasReais = empresasReais.filter((e) => e.id !== id);
  setLocalData('empresas_reais', empresasReais);

  await logAuditoria({
    empresaId: id,
    usuarioEmail: userEmail,
    acao: 'excluiu_empresa',
    detalhes: { id, modulo: 'Gestão de Empresas' },
  });

  return true;
}

export async function addCanalEmpresa(empresaId, { canal_id, identificador_numero = '', observacao = '' }, userEmail = 'admin@rmcontrole.com') {
  const catalogo = await getCanaisCatalogo();
  const canalInfo = catalogo.find((c) => c.id === canal_id);
  if (!canalInfo) throw new Error('Canal não encontrado no catálogo.');

  let canalDbId = null;
  // empresa_canais: id, empresa_id, canal_id (uuid), identificador_numero, status, observacao, created_at
  if (isSupabaseConfigured && supabase && empresaId && empresaId.length === 36 && canal_id && canal_id.length === 36) {
    try {
      const { data: dbCanal, error: errCanal } = await supabase
        .from('empresa_canais')
        .insert([
          {
            empresa_id: empresaId,
            canal_id: canal_id,
            identificador_numero: (identificador_numero || '').trim(),
            status: 'ativo',
            observacao: (observacao || '').trim(),
          }
        ])
        .select()
        .single();
      if (!errCanal && dbCanal) {
        canalDbId = dbCanal.id;
      } else if (errCanal) {
        console.warn('Erro ao inserir canal no Supabase:', errCanal);
      }
    } catch (e) {
      console.warn('Erro ao inserir canal no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }
  
  const novoCanalVinculado = {
    id: canalDbId || ('can_' + Date.now()),
    canal_id,
    nome: canalInfo.nome,
    tipo: canalInfo.tipo,
    identificador_numero,
    observacao,
    status: 'ativo',
    created_at: new Date().toISOString(),
  };

  if (emp) {
    if (!emp.canais) emp.canais = [];
    const jaExiste = emp.canais.some((c) => c.canal_id === canal_id);
    if (jaExiste) throw new Error('Este canal já está adicionado a esta empresa.');
    emp.canais.push(novoCanalVinculado);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'adicionou_canal_empresa',
    detalhes: { canal: canalInfo.nome, tipo: canalInfo.tipo, identificador_numero, modulo: 'Canais de Atendimento' },
  });

  return novoCanalVinculado;
}

export async function removeCanalEmpresa(empresaId, canalId, userEmail = 'admin@rmcontrole.com') {
  if (isSupabaseConfigured && supabase && empresaId && empresaId.length === 36) {
    try {
      await supabase
        .from('empresa_canais')
        .delete()
        .eq('empresa_id', empresaId)
        .or(`canal_id.eq.${canalId},id.eq.${canalId}`);
    } catch (e) {
      console.warn('Erro ao remover canal no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  if (emp) {
    emp.canais = (emp.canais || []).filter((c) => c.canal_id !== canalId && c.id !== canalId);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'removeu_canal_empresa',
    detalhes: { canal_id: canalId, modulo: 'Canais de Atendimento' },
  });

  return true;
}

export async function addEmpresaObservacao(empresaId, { titulo = 'Nova Observação', conteudo, tipo = 'geral' }, userEmail = 'admin@rmcontrole.com') {
  if (!conteudo || !conteudo.trim()) throw new Error('O conteúdo da observação é obrigatório.');

  let obsDbId = null;

  // empresa_observacoes: id, empresa_id, titulo, conteudo, autor_email, created_at, updated_at
  if (isSupabaseConfigured && supabase && empresaId && empresaId.length === 36) {
    try {
      const { data: dbObs, error: obsErr } = await supabase
        .from('empresa_observacoes')
        .insert([
          {
            empresa_id: empresaId,
            titulo: (titulo || 'Observação').trim(),
            conteudo: conteudo.trim(),
            autor_email: userEmail,
            updated_at: new Date().toISOString(),
          }
        ])
        .select()
        .single();
      if (!obsErr && dbObs) {
        obsDbId = dbObs.id;
      } else if (obsErr) {
        console.warn('Erro ao inserir observação no Supabase:', obsErr);
      }
    } catch (e) {
      console.warn('Erro ao inserir observação no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  const novaObs = {
    id: obsDbId || ('obs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
    titulo: (titulo || 'Observação').trim(),
    conteudo: conteudo.trim(),
    autor_email: userEmail,
    tipo: 'geral',
    created_at: new Date().toISOString(),
  };

  if (emp) {
    if (!emp.observacoes) emp.observacoes = [];
    emp.observacoes.unshift(novaObs);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'adicionou_observacao',
    detalhes: { titulo: novaObs.titulo, modulo: 'Anotações & Pedidos' },
  });

  return novaObs;
}

export async function deleteEmpresaObservacao(empresaId, obsId, userEmail = 'admin@rmcontrole.com') {
  if (isSupabaseConfigured && supabase && obsId && obsId.length === 36) {
    try {
      await supabase.from('empresa_observacoes').delete().eq('id', obsId);
    } catch (e) {
      console.warn('Erro ao deletar observação no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  if (emp) {
    emp.observacoes = (emp.observacoes || []).filter((o) => o.id !== obsId);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'removeu_observacao',
    detalhes: { obsId, modulo: 'Anotações & Pedidos' },
  });

  return true;
}

export async function toggleChecklistItem(empresaId, itemId, { concluido, observacao }, userEmail = 'admin@rmcontrole.com') {
  // empresa_checklist: concluido, observacao, concluido_em, concluido_por
  if (isSupabaseConfigured && supabase && itemId && itemId.length === 36) {
    try {
      const updateData = {};
      if (concluido !== undefined) {
        updateData.concluido = concluido;
        updateData.concluido_em = concluido ? new Date().toISOString() : null;
        updateData.concluido_por = userEmail;
      }
      if (observacao !== undefined) updateData.observacao = observacao;
      await supabase.from('empresa_checklist').update(updateData).eq('id', itemId);
    } catch (e) {
      console.warn('Erro ao atualizar checklist no Supabase:', e);
    }
  }

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  const item = (emp?.checklist || []).find((i) => i.id === itemId);

  if (item) {
    if (concluido !== undefined) item.concluido = concluido;
    if (observacao !== undefined) item.observacao = observacao;
    item.atualizado_em = new Date().toISOString();
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'atualizou_checklist_item',
    detalhes: { itemId, concluido, observacao, modulo: 'Checklist do Servidor' },
  });

  return item || { concluido, observacao };
}

export async function addCustomChecklistItem(empresaId, { titulo, observacao = '' }, userEmail = 'admin@rmcontrole.com') {
  if (!titulo || !titulo.trim()) throw new Error('Título do requisito é obrigatório.');

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  const novoItem = {
    id: 'chk_cust_' + Date.now(),
    titulo: titulo.trim(),
    concluido: false,
    observacao: observacao.trim(),
    created_at: new Date().toISOString(),
  };

  if (emp) {
    if (!emp.checklist) emp.checklist = [];
    emp.checklist.push(novoItem);
    setLocalData('empresas_reais', empresas);
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'adicionou_requisito_checklist',
    detalhes: { titulo: novoItem.titulo, modulo: 'Checklist do Servidor' },
  });

  return novoItem;
}

// ==============================================================================
// AUDITORIA E LGPD COM IDENTIFICAÇÃO DETALHADA E IP
// ==============================================================================
export async function getAuditoriaLogs() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('auditoria_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (!error && data && data.length > 0) {
        return data.map((item) => ({
          ...item,
          criado_em: item.created_at || item.criado_em,
          created_at: item.created_at || item.criado_em,
          operador_nome: item.usuario_nome || item.operador_nome || 'Operador',
        }));
      }
    } catch (err) {
      console.warn('Falha ao consultar auditoria no Supabase:', err);
    }
  }

  const logsLocais = getLocalData('auditoria_logs', [
    {
      id: 'log_seed_1',
      usuario_nome: 'Lucas Amorim (Administrador)',
      operador_nome: 'Lucas Amorim (Administrador)',
      usuario_email: 'admin@rmcontrole.com',
      ip_origem: '192.168.15.2 (Rede Local)',
      acao: 'sistema_iniciado',
      empresa_nome: 'Sistema Geral',
      detalhes: { modulo: 'Inicialização & Segurança' },
      created_at: new Date().toISOString(),
      criado_em: new Date().toISOString(),
    },
  ]);

  return logsLocais.map((item) => ({
    ...item,
    criado_em: item.created_at || item.criado_em || new Date().toISOString(),
    created_at: item.created_at || item.criado_em || new Date().toISOString(),
    operador_nome: item.usuario_nome || item.operador_nome || 'Administrador',
  }));
}

export async function logVisualizacaoSenha(empresaId, userEmail = 'admin@rmcontrole.com', detalhes = {}) {
  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'visualizou_senha_suporte',
    detalhes: { 
      timestamp: new Date().toISOString(), 
      motivo: 'Atendimento e suporte técnico autorizado',
      modulo: 'Credenciais & Acessos', 
      ...detalhes 
    },
  });
}
