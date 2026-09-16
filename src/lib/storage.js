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
  { id: 'canal_1', nome: 'WhatsApp API Oficial', tipo: 'api', descricao: 'Meta Cloud API oficial sem risco de banimento' },
  { id: 'canal_2', nome: 'WhatsApp QR Code', tipo: 'qrcode', descricao: 'Conexão via escaneamento de QR Code (Evolution/Baileys)' },
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
  { id: 'mot_2', nome: 'Desconexão / Queda de QR Code', descricao: 'Instância de WhatsApp desconectada precisando de novo pareamento' },
  { id: 'mot_3', nome: 'Bloqueio ou Limite na API Meta', descricao: 'Número bloqueado, limite de mensagens atingido ou falha de pagamento WABA' },
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
      { canal_id: 'canal_1', nome: 'WhatsApp API Oficial', tipo: 'api', identificador_numero: '+55 11 98765-4321', status: 'ativo' },
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
      { canal_id: 'canal_2', nome: 'WhatsApp QR Code', tipo: 'qrcode', identificador_numero: '+55 31 99123-8877', status: 'ativo' }
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
// SISTEMA DE CHAMADOS DE SUPORTE (INICIAR, FINALIZAR, TIMER & MÉTRICAS)
// ==============================================================================
export async function iniciarSuporte({ empresa_id, empresa_nome, userEmail = 'admin@rmcontrole.com' }) {
  const chamados = getLocalData('chamados_suporte', []);
  const jaEmAndamento = chamados.find((c) => c.empresa_id === empresa_id && c.status === 'em_andamento');
  if (jaEmAndamento) return jaEmAndamento;

  const novoChamado = {
    id: 'chamado_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    empresa_id,
    empresa_nome,
    tecnico_email: userEmail,
    status: 'em_andamento',
    iniciado_em: new Date().toISOString(),
    finalizado_em: null,
    duracao_segundos: 0,
    motivo: '',
    observacoes: '',
  };

  chamados.unshift(novoChamado);
  setLocalData('chamados_suporte', chamados);

  await logAuditoria({
    empresaId: empresa_id,
    usuarioEmail: userEmail,
    acao: 'iniciou_suporte_tecnico',
    detalhes: { empresa_nome, iniciado_em: novoChamado.iniciado_em, modulo: 'Suporte em Tempo Real' },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return novoChamado;
}

export async function finalizarSuporte({ chamado_id, motivo, observacoes = '', duracao_segundos = null, userEmail = 'admin@rmcontrole.com' }) {
  if (!motivo || !motivo.trim()) throw new Error('Selecione ou informe o motivo do suporte.');
  
  const chamados = getLocalData('chamados_suporte', []);
  const idx = chamados.findIndex((c) => c.id === chamado_id);
  if (idx === -1) throw new Error('Chamado não encontrado.');

  const chamado = chamados[idx];
  const finalizadoEm = new Date();
  const iniciadoEm = new Date(chamado.iniciado_em);
  const duracaoCalculada = Math.max(1, Math.round((finalizadoEm.getTime() - iniciadoEm.getTime()) / 1000));
  const duracaoFinal = (duracao_segundos !== null && duracao_segundos > 0) ? duracao_segundos : duracaoCalculada;

  chamados[idx] = {
    ...chamado,
    status: 'finalizado',
    finalizado_em: finalizadoEm.toISOString(),
    duracao_segundos: duracaoFinal,
    motivo: motivo.trim(),
    observacoes: observacoes.trim(),
  };

  setLocalData('chamados_suporte', chamados);

  // REQUISITO: Observações feitas no fechamento vão automaticamente para a aba "Anotações e Pedidos" da empresa!
  if (observacoes && observacoes.trim()) {
    try {
      await addEmpresaObservacao(chamado.empresa_id, {
        titulo: `Resolução de Atendimento (${motivo.trim()})`,
        conteudo: observacoes.trim(),
        tipo: 'suporte',
      }, userEmail);
    } catch (e) {
      console.warn('Falha ao adicionar anotação do suporte:', e);
    }
  }

  await logAuditoria({
    empresaId: chamado.empresa_id,
    usuarioEmail: userEmail,
    acao: 'finalizou_suporte_tecnico',
    detalhes: {
      empresa_nome: chamado.empresa_nome,
      duracao_segundos: duracaoFinal,
      motivo: motivo.trim(),
      modulo: 'Suporte em Tempo Real',
    },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return chamados[idx];
}

export function getChamadoAtivo(empresa_id = null) {
  const chamados = getLocalData('chamados_suporte', []);
  if (empresa_id) {
    return chamados.find((c) => c.empresa_id === empresa_id && c.status === 'em_andamento') || null;
  }
  return chamados.find((c) => c.status === 'em_andamento') || null;
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

export function getMetricasSuporte() {
  const chamados = getLocalData('chamados_suporte', []);
  const finalizados = chamados.filter((c) => c.status === 'finalizado');
  const emAndamento = chamados.filter((c) => c.status === 'em_andamento');

  // Tempo médio geral
  const duracaoTotalSegundos = finalizados.reduce((acc, c) => acc + (c.duracao_segundos || 0), 0);
  const tempoMedioSegundos = finalizados.length > 0 ? Math.round(duracaoTotalSegundos / finalizados.length) : 0;

  // Distribuição por motivos
  const motivosCount = {};
  finalizados.forEach((c) => {
    const m = c.motivo || 'Outro';
    motivosCount[m] = (motivosCount[m] || 0) + 1;
  });

  const topMotivos = Object.entries(motivosCount)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count);

  // Métricas por empresa
  const empresasStats = {};
  chamados.forEach((c) => {
    if (!empresasStats[c.empresa_id]) {
      empresasStats[c.empresa_id] = {
        empresa_id: c.empresa_id,
        empresa_nome: c.empresa_nome || 'Empresa',
        total_chamados: 0,
        concluidos: 0,
        em_andamento: 0,
        duracao_total: 0,
      };
    }
    empresasStats[c.empresa_id].total_chamados += 1;
    if (c.status === 'finalizado') {
      empresasStats[c.empresa_id].concluidos += 1;
      empresasStats[c.empresa_id].duracao_total += (c.duracao_segundos || 0);
    } else {
      empresasStats[c.empresa_id].em_andamento += 1;
    }
  });

  const metricasEmpresas = Object.values(empresasStats).map((e) => ({
    ...e,
    tempo_medio_minutos: e.concluidos > 0 ? Math.round((e.duracao_total / e.concluidos) / 60) : 0,
  })).sort((a, b) => b.total_chamados - a.total_chamados);

  // Dados para o Gráfico de Linha do Tempo (Últimos 7 dias)
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const hoje = new Date();
  const evolucaoUltimos7Dias = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(hoje.getDate() - i);
    const dStr = d.toISOString().split('T')[0];
    const diaNome = diasSemana[d.getDay()];

    const count = chamados.filter((c) => {
      const dataChamado = (c.iniciado_em || '').split('T')[0];
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
  if (!rotulo || !rotulo.trim()) throw new Error('O rótulo/identificador do acesso é obrigatório.');
  if (!senha || !senha.trim()) throw new Error('A senha é obrigatória.');

  let empresas = getLocalData('empresas_reais', []);
  let emp = empresas.find((e) => e.id === empresaId);

  // Se for empresa mock sendo editada, clona para empresas_reais
  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === empresaId);
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  const novaCred = {
    id: 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    rotulo: rotulo.trim(),
    usuario_email: usuario_email.trim(),
    senha: senha.trim(),
    observacao: observacao.trim(),
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
  administrador: ['empresas', 'dashboard', 'canais', 'servidores', 'auditoria'],
  suporte: ['empresas', 'dashboard', 'servidores', 'auditoria'],
  vendas: ['empresas', 'dashboard'],
};

export function getCurrentUserRole() {
  if (typeof window === 'undefined') return 'administrador';
  return localStorage.getItem('rm_user_role') || 'administrador';
}

export function setCurrentUserRole(role) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('rm_user_role', role);
  window.dispatchEvent(new Event('user_role_updated'));
}

export function getAbasPermitidas(role = null) {
  const currentRole = role || getCurrentUserRole();
  const customPerms = getLocalData('custom_role_permissions', PERMISSOES_PADRAO);
  return customPerms[currentRole] || PERMISSOES_PADRAO[currentRole] || PERMISSOES_PADRAO.administrador;
}

export function getEquipeUsuarios() {
  return getLocalData('equipe_usuarios', [
    { id: 'usr_1', nome: 'Lucas Amorim (Administrador)', email: 'admin@rmcontrole.com', senha: 'RmControle@Admin2026!', papel: 'administrador', criado_em: new Date().toISOString() },
    { id: 'usr_2', nome: 'Equipe de Suporte Técnico', email: 'suporte@rmcontrole.com', senha: 'RmSuporte@Padrao2026!', papel: 'suporte', criado_em: new Date().toISOString() },
    { id: 'usr_3', nome: 'Equipe Comercial & Vendas', email: 'vendas@rmcontrole.com', papel: 'vendas', senha: 'RmVendas@Padrao2026!', criado_em: new Date().toISOString() },
  ]);
}

export function addEquipeUsuario({ nome, email, senha = '', papel = 'suporte' }) {
  if (!email || !email.trim()) throw new Error('E-mail é obrigatório.');
  const usuarios = getEquipeUsuarios();
  const novo = {
    id: 'usr_' + Date.now(),
    nome: (nome || '').trim() || email.split('@')[0],
    email: email.trim(),
    senha: (senha || '').trim() || getSenhaPadraoRedefinicao(),
    papel,
    criado_em: new Date().toISOString(),
  };
  usuarios.push(novo);
  setLocalData('equipe_usuarios', usuarios);
  return novo;
}

export function updateEquipeUsuario(id, dados) {
  const usuarios = getEquipeUsuarios();
  const idx = usuarios.findIndex((u) => u.id === id);
  if (idx !== -1) {
    usuarios[idx] = { ...usuarios[idx], ...dados };
    setLocalData('equipe_usuarios', usuarios);
  }
  return true;
}

export function deleteEquipeUsuario(id) {
  let usuarios = getEquipeUsuarios();
  usuarios = usuarios.filter((u) => u.id !== id);
  setLocalData('equipe_usuarios', usuarios);
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

      if (!error && data && data.length > 0) {
        empresas = data.map((emp) => ({
          ...emp,
          is_mock: false,
          servidor_alocado: emp.servidor_alocado || 'servidor_1',
          canais: (emp.canais || []).map((c) => ({
            canal_id: c.canal_id,
            nome: c.catalogo?.nome || 'Canal',
            tipo: c.catalogo?.tipo || 'outro',
            identificador_numero: c.identificador_numero,
            status: c.status,
            observacao: c.observacao,
          })),
          observacoes: emp.observacoes || [],
          credenciais_lista: emp.credenciais?.map((cr) => ({
            id: cr.id,
            rotulo: 'Acesso Principal',
            usuario_email: cr.email_administrador,
            senha: cr.senha_suporte,
            ultima_alteracao: cr.ultima_alteracao,
          })) || [],
          checklist: emp.checklist || [],
        }));
      }
    } catch (e) {
      console.warn('Recorrendo ao armazenamento local para listar empresas:', e);
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

  // Se o mock estiver desligado, limpa qualquer resquício de itens mock do checklist
  if (!isMockDataEnabled()) {
    empresas = empresas.map((emp) => ({
      ...emp,
      checklist: (emp.checklist || []).filter((item) => !item.id.includes('mock')),
    }));
  }

  // BUSCA APRIMORADA: Nome de Empresa, Nome de Colaborador/Acesso, Telefone/WhatsApp
  if (search && search.trim() !== '') {
    const q = search.toLowerCase().trim();
    const qNumeros = q.replace(/\D/g, '');

    empresas = empresas.filter((emp) => {
      const nomeMatch = (emp.nome || '').toLowerCase().includes(q);
      const servidorMatch = (emp.servidor_alocado || '').toLowerCase().includes(q);
      
      // Busca em Colaboradores e Acessos
      const credsMatch = (emp.credenciais_lista || []).some((c) => 
        (c.usuario_email || '').toLowerCase().includes(q) || 
        (c.rotulo || '').toLowerCase().includes(q)
      );

      // Busca em Telefones e Canais
      const canaisMatch = (emp.canais || []).some((c) => {
        const cNome = (c.nome || '').toLowerCase().includes(q);
        const cId = (c.identificador_numero || '').toLowerCase().includes(q);
        const cIdNumeros = (c.identificador_numero || '').replace(/\D/g, '');
        const telMatch = qNumeros.length >= 3 && cIdNumeros.includes(qNumeros);
        return cNome || cId || telMatch;
      });

      // Busca em Observações
      const obsMatch = (emp.observacoes || []).some((o) => 
        (o.titulo || '').toLowerCase().includes(q) || 
        (o.conteudo || '').toLowerCase().includes(q)
      );

      return nomeMatch || servidorMatch || credsMatch || canaisMatch || obsMatch;
    });
  }

  // Filtro de Canal
  if (canalTipo && canalTipo !== 'todos') {
    empresas = empresas.filter((emp) => {
      return (emp.canais || []).some((c) => c.tipo === canalTipo);
    });
  }

  // Filtro de Formato
  if (formato && formato !== 'todos') {
    empresas = empresas.filter((emp) => emp.formato_atendimento === formato);
  }

  // Filtro de Servidor Alocado (Servidor 1 vs Servidor 2)
  if (servidor && servidor !== 'todos') {
    empresas = empresas.filter((emp) => (emp.servidor_alocado || 'servidor_1') === servidor);
  }

  const total = empresas.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = empresas.slice(startIndex, endIndex);

  return {
    items: paginatedItems,
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
}

// ==============================================================================
// CADASTRO DE EMPRESAS
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

  const novaEmpresa = {
    id: 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    nome: trimmedNome,
    formato_atendimento,
    servidor_alocado,
    ativo: true,
    is_mock: false,
    created_at: new Date().toISOString(),
    canais: canaisIniciais,
    observacoes: [],
    credenciais_lista: (email_administrador || senha_suporte) ? [
      {
        id: 'cred_' + Date.now(),
        rotulo: 'Acesso Principal do Administrador',
        usuario_email: email_administrador || `admin@${trimmedNome.toLowerCase().replace(/\s+/g, '')}.com.br`,
        senha: senha_suporte || getSenhaPadraoRedefinicao(),
        observacao: 'Acesso inicial',
        ultima_alteracao: new Date().toISOString(),
      }
    ] : [],
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
    detalhes: { nome: trimmedNome, formato_atendimento, servidor_alocado, modulo: 'Gestão de Empresas' },
  });

  return novaEmpresa;
}

export async function createEmpresasEmMassa(nomes, { formato_atendimento = 'colaborativo', servidor_alocado = 'servidor_1', userEmail = 'admin@rmcontrole.com' } = {}) {
  if (!Array.isArray(nomes) || nomes.length === 0) {
    throw new Error('Lista de empresas inválida.');
  }

  const nomesLimpos = nomes.map((n) => (typeof n === 'string' ? n.trim() : '')).filter((n) => n.length > 0);
  if (nomesLimpos.length === 0) throw new Error('Nenhum nome válido informado.');

  const criadas = [];
  const empresasReais = getLocalData('empresas_reais', []);
  const templateChecklist = getServerChecklistTemplate();

  for (const nome of nomesLimpos) {
    const nova = {
      id: 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      nome,
      formato_atendimento,
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
          usuario_email: `admin@${nome.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`,
          senha: getSenhaPadraoRedefinicao(),
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
    detalhes: { quantidade: criadas.length, nomes: nomesLimpos, modulo: 'Gestão de Empresas' },
  });

  return criadas;
}

export async function getEmpresaById(id) {
  let empresas = getLocalData('empresas_reais', []);
  let encontrada = empresas.find((e) => e.id === id);
  if (!encontrada && isMockDataEnabled()) {
    encontrada = DEFAULT_EMPRESAS_MOCK.find((e) => e.id === id);
  }
  if (!encontrada) throw new Error('Empresa não encontrada.');

  // Se mock estiver desligado, garante que não há checklist fake
  if (!isMockDataEnabled()) {
    encontrada = {
      ...encontrada,
      checklist: (encontrada.checklist || []).filter((i) => !i.id.includes('mock')),
    };
  }

  return encontrada;
}

export async function updateEmpresa(id, dados, userEmail = 'admin@rmcontrole.com') {
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
    // Se for uma empresa mock sendo editada, clona para empresas_reais
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

// ==============================================================================
// GESTÃO DE CANAIS POR EMPRESA
// ==============================================================================
export async function addCanalEmpresa(empresaId, { canal_id, identificador_numero = '', observacao = '' }, userEmail = 'admin@rmcontrole.com') {
  const catalogo = await getCanaisCatalogo();
  const canalInfo = catalogo.find((c) => c.id === canal_id);
  if (!canalInfo) throw new Error('Canal não encontrado no catálogo.');

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
    emp.canais = (emp.canais || []).filter((c) => c.canal_id !== canalId);
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

// ==============================================================================
// GESTÃO DE OBSERVAÇÕES
// ==============================================================================
export async function addEmpresaObservacao(empresaId, { titulo = 'Nova Observação', conteudo, tipo = 'manual' }, userEmail = 'admin@rmcontrole.com') {
  if (!conteudo || !conteudo.trim()) throw new Error('O conteúdo da observação é obrigatório.');

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
    id: 'obs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    titulo: titulo.trim() || 'Observação',
    conteudo: conteudo.trim(),
    autor_email: userEmail,
    tipo, // 'manual' | 'suporte'
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
    detalhes: { titulo: novaObs.titulo, tipo, modulo: 'Anotações & Pedidos' },
  });

  return novaObs;
}

export async function deleteEmpresaObservacao(empresaId, obsId, userEmail = 'admin@rmcontrole.com') {
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

// ==============================================================================
// CHECKLIST DO SERVIDOR DA EMPRESA
// ==============================================================================
export async function toggleChecklistItem(empresaId, itemId, { concluido, observacao }, userEmail = 'admin@rmcontrole.com') {
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
  const logsLocais = getLocalData('auditoria_logs', [
    {
      id: 'log_seed_1',
      usuario_nome: 'Lucas Amorim',
      usuario_email: 'admin@rmcontrole.com',
      ip_origem: '192.168.15.2 (Local)',
      acao: 'sistema_iniciado',
      empresa_nome: 'Sistema Geral',
      detalhes: { modulo: 'Inicialização & Segurança' },
      created_at: new Date().toISOString(),
    },
  ]);

  return logsLocais;
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
