
// Auxiliar para identificar chamados gerados por feedbacks/relatos internos
export function isChamadoFeedback(c) {
  if (!c) return false;
  if (c.feedback_id) return true;
  const emp = (c.empresa_nome || '').toLowerCase().trim();
  if (emp.startsWith('rm controle (')) return true;
  if (emp === 'rm controle (fila de demandas)') return true;
  if (emp === 'rm controle (feedbacks)') return true;
  const obs = (c.observacao_inicial || c.observacoes || c.descricao || '').trim();
  if (obs.startsWith('[SUGESTAO') || obs.startsWith('[BUG') || obs.startsWith('[IDEIA') || obs.includes('[Módulo:') || obs.includes('[MODULO:')) return true;
  const motivo = (c.motivo || '').toLowerCase().trim();
  const cats = Array.isArray(c.categorias) ? c.categorias : motivo.split(',').map((s) => s.trim());
  if (cats.some((cat) => {
    const k = (cat || '').toLowerCase().trim();
    return k === 'feedback' || k === 'feedback / bug rm' || k === 'ideias';
  }) && emp.includes('rm controle')) return true;
  return false;
}

import { triggerSupportNotification, stopSupportNotificationLoop, registrarFonteChamadosAtivos } from './audioNotifications';
import { supabase, isSupabaseConfigured } from './supabase';
import { logAuditoria } from './security';
import { resolverPapel, ADMINS_PROPRIETARIOS } from './roles';

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
// PREFERÊNCIA GLOBAL DE VISUALIZAÇÃO (CARDS VS. LISTA)
// ==============================================================================
export function getDefaultViewMode() {
  if (typeof window === 'undefined') return 'list';
  return localStorage.getItem('rm_default_view_mode') || 'list';
}

export function setDefaultViewMode(mode) {
  if (typeof window === 'undefined') return;
  const valid = mode === 'cards' || mode === 'grid' ? 'cards' : 'list';
  localStorage.setItem('rm_default_view_mode', valid);
  window.dispatchEvent(new CustomEvent('rm_default_view_mode_updated', { detail: valid }));
}

// Auxiliar para remoção de acentos em buscas inteligentes
export function removerAcentos(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}


// ==============================================================================
// SENHA PADRÃO DE REDEFINIÇÃO / CONTINGÊNCIA (CONFIGURAÇÕES GERAIS)
// ==============================================================================
// A senha padrão fica cifrada no Supabase; no navegador só em memória de sessão (some ao fechar a aba)
export function getSenhaPadraoRedefinicao() {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem('rm_senha_padrao_cache') || localStorage.getItem('rm_senha_padrao_redefinicao') || '';
  } catch (e) {
    return '';
  }
}

function guardarSenhaPadraoSessao(senha) {
  // Passos independentes: a remoção do texto puro não pode depender do cache de sessão funcionar
  try {
    localStorage.removeItem('rm_senha_padrao_redefinicao'); // não persiste mais em texto puro
  } catch (e) {}
  try {
    sessionStorage.setItem('rm_senha_padrao_cache', senha);
  } catch (e) {}
  window.dispatchEvent(new Event('senha_padrao_updated'));
}

export function setSenhaPadraoRedefinicao(novaSenha) {
  if (typeof window === 'undefined') return;
  const anterior = getSenhaPadraoRedefinicao();
  const nova = (novaSenha || '').trim();
  guardarSenhaPadraoSessao(nova);
  persistirConfigGlobal('senha_padrao', nova, () => guardarSenhaPadraoSessao(anterior));
}

// ==============================================================================
// CONFIGURAÇÕES GLOBAIS COMPARTILHADAS (Supabase via /api/configuracoes)
// As telas leem a cópia local na hora; a fonte oficial é o banco.
// ==============================================================================
function podeFalarComServidor() {
  return typeof window !== 'undefined' && Boolean(window.location) && isSupabaseConfigured;
}

/** Erros de sincronização viram aviso visível (AppProviders mostra o toast). */
export function avisarFalhaSync(mensagem) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rm_sync_erro', { detail: mensagem }));
  }
}

function podeUsarTabelas() {
  return Boolean(isSupabaseConfigured && supabase);
}

// Executa uma escrita em segundo plano; se o banco recusar, desfaz a mudança local e avisa
function persistirEmSegundoPlano(promessaFn, desfazer, acao) {
  if (!podeUsarTabelas()) return;
  Promise.resolve()
    .then(promessaFn)
    .then((res) => {
      if (res?.error) throw new Error(res.error.message);
      return res;
    })
    .catch((e) => {
      desfazer?.();
      avisarFalhaSync(`${acao}: ${e.message}`);
    });
}

async function salvarConfiguracaoGlobal(chave, valor) {
  if (!podeFalarComServidor()) return valor;
  const res = await fetch('/api/configuracoes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chave, valor }),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) throw new Error(json.mensagem || 'Sem conexão com o servidor.');
  return json.valor ?? valor;
}

// Grava local na hora; se o servidor recusar, desfaz e avisa (nada fica "salvo só aqui")
function persistirConfigGlobal(chave, valor, desfazer) {
  salvarConfiguracaoGlobal(chave, valor).catch((e) => {
    desfazer();
    avisarFalhaSync(`Não foi possível salvar para a equipe: ${e.message}`);
  });
}

function aplicarConfigGlobalLocal(chave, valor) {
  if (chave === 'departamentos') {
    setLocalData('categorias_demandas', valor);
    window.dispatchEvent(new Event('categorias_demandas_updated'));
    window.dispatchEvent(new Event('departamentos_updated'));
  } else if (chave === 'configuracoes_suporte') {
    setLocalData('configuracoes_suporte', { ...DEFAULT_CONFIG_SUPORTE, ...valor });
    window.dispatchEvent(new Event('config_suporte_updated'));
  } else if (chave === 'servidor_config_padrao') {
    setLocalData('servidor_config_padrao', valor);
    window.dispatchEvent(new Event('servidor_config_updated'));
  } else if (chave === 'servidores_urls') {
    aplicarServidoresConfigLocal({ ...DEFAULT_SERVIDORES_CONFIG, ...valor });
  } else if (chave === 'senha_padrao') {
    guardarSenhaPadraoSessao(valor);
  }
}

function valorLocalParaMigrar(chave) {
  if (typeof window === 'undefined') return undefined;
  const ler = (k) => {
    try {
      const bruto = localStorage.getItem('rm_' + k);
      return bruto ? JSON.parse(bruto) : undefined;
    } catch (e) {
      return undefined;
    }
  };
  if (chave === 'departamentos') return ler('categorias_demandas');
  if (chave === 'configuracoes_suporte') return ler('configuracoes_suporte');
  if (chave === 'servidor_config_padrao') return ler('servidor_config_padrao');
  if (chave === 'senha_padrao') return localStorage.getItem('rm_senha_padrao_redefinicao') || undefined;
  return undefined;
}

/** Baixa as configurações da equipe e, na primeira vez, envia o que só existia neste navegador. */
export async function sincronizarConfiguracoesGlobais() {
  if (!podeFalarComServidor()) return;
  const res = await fetch('/api/configuracoes', { cache: 'no-store' }).catch(() => null);
  if (!res || !res.ok) return;
  const { config = {}, ausentes = [] } = await res.json().catch(() => ({}));
  Object.entries(config).forEach(([chave, valor]) => aplicarConfigGlobalLocal(chave, valor));
  for (const chave of ausentes) {
    const local = valorLocalParaMigrar(chave);
    if (local === undefined || local === null || local === '') continue;
    try {
      await salvarConfiguracaoGlobal(chave, local);
      if (chave === 'senha_padrao') guardarSenhaPadraoSessao(local);
    } catch (e) {
      console.warn(`Migração de "${chave}" para o Supabase não concluída:`, e.message);
    }
  }
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

export function getLocalData(key, defaultVal) {
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

export function setLocalData(key, val) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('rm_' + key, JSON.stringify(val));
  } catch (e) {
    console.error('Erro ao gravar localStorage:', e);
  }
}

// ==============================================================================
// SINCRONIZAÇÃO CONFIÁVEL COM O SUPABASE (FILA DE DEMANDAS)
// O supabase-js NÃO lança exceção em erro de banco/RLS: ele retorna { error }.
// Por isso todo resultado precisa ser verificado explicitamente.
// ==============================================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCloudId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

function isErroColunaInexistente(error) {
  if (!error) return false;
  const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return error.code === 'PGRST204' || error.code === '42703' || msg.includes('column');
}

// Insere um chamado tentando primeiro as colunas estendidas e recuando para as colunas
// base caso o schema remoto ainda não tenha recebido a migração.
// Insere registrando o envio em andamento: quem concluir/cancelar a demanda nesse meio-tempo
// aguarda o UUID oficial em vez de criar uma segunda linha na nuvem.
async function inserirChamadoNuvem(payloadBase, extras = {}, localId = null) {
  const execucao = (async () => {
    const r = await inserirChamadoNuvemBruto(payloadBase, extras);
    if (localId && r.data?.id) registrarIdMigrado(localId, r.data.id);
    return r;
  })();
  if (localId) insercoesEmAndamento.set(localId, execucao.then((r) => r.data?.id || null, () => null));
  try {
    return await execucao;
  } finally {
    if (localId) insercoesEmAndamento.delete(localId);
  }
}

async function inserirChamadoNuvemBruto(payloadBase, extras = {}) {
  const { etiquetas } = extras;
  const tentativas = [
    { ...payloadBase, ...extras },
    etiquetas !== undefined ? { ...payloadBase, etiquetas } : null,
    payloadBase,
  ].filter(Boolean);

  let ultimoErro = null;
  for (const payload of tentativas) {
    const { data, error } = await supabase.from('suporte_chamados').insert([payload]).select().maybeSingle();
    if (!error) return { data, error: null };
    ultimoErro = error;
    // Só tenta a próxima variação quando o problema for coluna inexistente; outros erros (RLS, rede) são definitivos
    if (!isErroColunaInexistente(error)) break;
  }
  return { data: null, error: ultimoErro };
}

// ------------------------------------------------------------------------------
// Consistência entre a fila local e a nuvem
// ------------------------------------------------------------------------------

// Versão das alterações locais: um sync que começou ANTES de uma ação do usuário
// (concluir, cancelar, assumir...) não pode sobrescrever o resultado dela ao terminar.
let versaoMutacoesLocais = 0;
export function registrarMutacaoLocal() {
  versaoMutacoesLocais += 1;
}

// Inserts em andamento: ID provisório -> Promise com o UUID oficial (ou null se falhar)
const insercoesEmAndamento = new Map();

function registrarIdMigrado(localId, cloudId) {
  const mapa = getLocalData('chamados_ids_migrados', {});
  mapa[localId] = cloudId;
  const chaves = Object.keys(mapa);
  // Mantém só os mais recentes para não crescer indefinidamente
  if (chaves.length > 300) chaves.slice(0, chaves.length - 300).forEach((k) => delete mapa[k]);
  setLocalData('chamados_ids_migrados', mapa);
}

/** UUID oficial de um chamado (aguarda o insert se ele ainda estiver em andamento). */
export async function resolverIdNuvem(id) {
  if (isCloudId(id)) return id;
  if (insercoesEmAndamento.has(id)) {
    const cloudId = await insercoesEmAndamento.get(id);
    if (cloudId) return cloudId;
  }
  return getLocalData('chamados_ids_migrados', {})[id] || null;
}

/** Índice do chamado na lista, aceitando o ID provisório antigo (ex.: modal aberto antes da troca). */
export function encontrarIndiceChamado(lista, id) {
  const direto = lista.findIndex((c) => c && c.id === id);
  if (direto !== -1) return direto;
  const migrado = getLocalData('chamados_ids_migrados', {})[id];
  return migrado ? lista.findIndex((c) => c && c.id === migrado) : -1;
}

/**
 * Atualiza um chamado na nuvem e CONFIRMA que a linha foi alterada.
 * Colunas opcionais (de migrações) são removidas e a atualização é repetida se o schema não as tiver.
 */
/**
 * Garante que o navegador tem uma sessão válida no banco (as regras de segurança dependem dela).
 * Sem isso, a escrita é recusada em silêncio pelo banco e a pessoa só vê "não foi possível".
 */
export async function garantirSessaoBanco() {
  if (!isSupabaseConfigured || !supabase) return { ok: true };
  try {
    const { data } = await supabase.auth.getSession();
    let sessao = data?.session || null;
    const expiraEmMs = sessao?.expires_at ? sessao.expires_at * 1000 - Date.now() : 0;
    if (!sessao || expiraEmMs < 60000) {
      const { data: renovada, error } = await supabase.auth.refreshSession();
      sessao = error ? null : renovada?.session || null;
    }
    if (!sessao) return { ok: false, erro: 'Sua conexão com o banco expirou. Saia e entre novamente para continuar.' };
    return { ok: true, email: (sessao.user?.email || '').toLowerCase() };
  } catch (e) {
    return { ok: false, erro: 'Não foi possível confirmar sua conexão com o banco. Verifique a internet.' };
  }
}

async function atualizarChamadoNuvem(id, campos, colunasOpcionais = [], statusPermitidos = null) {
  if (!isSupabaseConfigured || !supabase) return { ok: true, cloudId: id };
  const sessao = await garantirSessaoBanco();
  if (!sessao.ok) return { ok: false, cloudId: null, erro: sessao.erro };
  const cloudId = await resolverIdNuvem(id);
  if (!cloudId) return { ok: false, cloudId: null, erro: 'A demanda ainda não foi sincronizada com a nuvem.' };
  let payload = { ...campos };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let consulta = supabase.from('suporte_chamados').update(payload).eq('id', cloudId);
    // Atualização condicional: só aplica se a demanda ainda estiver no status esperado
    if (statusPermitidos) consulta = consulta.in('status', statusPermitidos);
    const { data, error } = await consulta.select('id');
    if (!error && Array.isArray(data) && data.length > 0) return { ok: true, cloudId };
    if (error && isErroColunaInexistente(error) && colunasOpcionais.some((c) => c in payload)) {
      payload = Object.fromEntries(Object.entries(payload).filter(([k]) => !colunasOpcionais.includes(k)));
      continue;
    }
    // Nenhuma linha alterada: descobre o motivo real para mostrar uma mensagem que ajude
    if (!error && statusPermitidos) {
      const { data: atual } = await supabase.from('suporte_chamados').select('status, atendente').eq('id', cloudId).maybeSingle();
      if (!atual) return { ok: false, cloudId, erro: 'Esta demanda foi removida ou você não tem permissão para vê-la.' };
      if (!statusPermitidos.includes(atual.status)) {
        const quem = atual.atendente ? ` por ${atual.atendente}` : '';
        return {
          ok: false,
          cloudId,
          erro: atual.status === 'em_andamento' ? `Outra pessoa já assumiu esta demanda${quem}.` : 'Esta demanda já foi concluída ou cancelada.',
        };
      }
    }
    return {
      ok: false,
      cloudId,
      erro: error?.message || 'O banco recusou a alteração. Saia e entre novamente; se continuar, confirme seu acesso em Equipe & Senhas.',
    };
  }
  return { ok: false, cloudId, erro: 'Falha ao atualizar a demanda.' };
}

// Chamados encerrados (concluídos ou cancelados) neste navegador: nunca voltam para a fila ativa
function getChamadosEncerradosIds() {
  return new Set(getLocalData('chamados_encerrados_ids', []));
}

function registrarChamadoEncerrado(...ids) {
  const lista = getLocalData('chamados_encerrados_ids', []);
  ids.filter(Boolean).forEach((id) => {
    if (!lista.includes(id)) lista.push(id);
  });
  setLocalData('chamados_encerrados_ids', lista.slice(-500));
}

function desfazerChamadoEncerrado(...ids) {
  setLocalData('chamados_encerrados_ids', getLocalData('chamados_encerrados_ids', []).filter((x) => !ids.includes(x)));
}

// Troca o ID provisório local pelo UUID oficial, eliminando cópias que o polling já tenha trazido
function substituirIdLocalChamado(localId, cloudId) {
  registrarIdMigrado(localId, cloudId);
  registrarMutacaoLocal();
  if (getChamadosEncerradosIds().has(localId)) registrarChamadoEncerrado(cloudId);
  const lista = getLocalData('chamados_suporte', []);
  const idx = lista.findIndex((c) => c && c.id === localId);
  if (idx === -1) return;
  const atualizado = { ...lista[idx], id: cloudId, sync_estado: 'sincronizado', sync_erro: null };
  const semDuplicatas = lista.filter((c, i) => i === idx || (c && c.id !== cloudId));
  const novoIdx = semDuplicatas.findIndex((c) => c && c.id === localId);
  semDuplicatas[novoIdx] = atualizado;
  setLocalData('chamados_suporte', semDuplicatas);
}

function marcarChamadoSyncPendente(localId, erro) {
  const lista = getLocalData('chamados_suporte', []);
  const idx = lista.findIndex((c) => c && c.id === localId);
  if (idx === -1) return;
  lista[idx] = { ...lista[idx], sync_estado: 'pendente', sync_erro: erro?.message || 'Falha ao sincronizar' };
  setLocalData('chamados_suporte', lista);
}

// Lista de chamados cancelados neste navegador: impede que um polling em andamento os traga de volta
function getChamadosCanceladosIds() {
  return new Set(getLocalData('chamados_cancelados_ids', []));
}

function registrarChamadoCancelado(id) {
  const lista = getLocalData('chamados_cancelados_ids', []);
  if (!lista.includes(id)) {
    lista.push(id);
    setLocalData('chamados_cancelados_ids', lista.slice(-300));
  }
}

function desfazerRegistroCancelado(id) {
  setLocalData('chamados_cancelados_ids', getLocalData('chamados_cancelados_ids', []).filter((x) => x !== id));
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

  // Modelo compartilhado pela equipe: grava no Supabase e troca o ID provisório pelo oficial
  persistirEmSegundoPlano(
    async () => {
      const res = await supabase
        .from('servidor_checklist_template')
        .insert([{ titulo: novoItem.titulo, descricao: novoItem.descricao, categoria: novoItem.categoria, obrigatorio: novoItem.obrigatorio }])
        .select('id')
        .single();
      if (!res.error && res.data?.id) {
        const atual = getLocalData('server_checklist_template', []);
        setLocalData('server_checklist_template', atual.map((i) => (i.id === novoItem.id ? { ...i, id: res.data.id } : i)));
      }
      return res;
    },
    () => setLocalData('server_checklist_template', getLocalData('server_checklist_template', []).filter((i) => i.id !== novoItem.id)),
    'O requisito não foi salvo para a equipe'
  );
  return novoItem;
}

export function removeServerChecklistTemplateItem(itemId) {
  const anterior = getLocalData('server_checklist_template', []);
  setLocalData('server_checklist_template', anterior.filter((i) => i.id !== itemId));
  if (isCloudId(itemId)) {
    persistirEmSegundoPlano(
      () => supabase.from('servidor_checklist_template').delete().eq('id', itemId),
      () => setLocalData('server_checklist_template', anterior),
      'O requisito não foi removido para a equipe'
    );
  }
  return true;
}

/** Baixa o modelo de checklist da equipe; na primeira vez, envia itens que só existiam aqui. */
export async function fetchServerChecklistTemplate() {
  if (!podeUsarTabelas()) return getServerChecklistTemplate();
  const { data, error } = await supabase
    .from('servidor_checklist_template')
    .select('id, titulo, descricao, categoria, obrigatorio, created_at')
    .order('created_at');
  if (error || !Array.isArray(data)) return getServerChecklistTemplate();
  let lista = data;
  const titulos = new Set(data.map((i) => (i.titulo || '').toLowerCase().trim()));
  const legados = getLocalData('server_checklist_template', []).filter(
    (i) => i && !isCloudId(i.id) && !String(i.id).includes('mock') && i.titulo && !titulos.has(i.titulo.toLowerCase().trim())
  );
  if (legados.length > 0) {
    const { data: enviados } = await supabase
      .from('servidor_checklist_template')
      .insert(legados.map((i) => ({ titulo: i.titulo, descricao: i.descricao || '', categoria: i.categoria || 'Infraestrutura', obrigatorio: i.obrigatorio !== false })))
      .select('id, titulo, descricao, categoria, obrigatorio, created_at');
    if (Array.isArray(enviados)) lista = [...data, ...enviados];
  }
  setLocalData('server_checklist_template', lista.map((i) => ({ ...i, descricao: i.descricao || '' })));
  return getServerChecklistTemplate();
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

  persistirEmSegundoPlano(
    async () => {
      const res = await supabase.from('suporte_motivos').insert([{ nome: novoMotivo.nome, descricao: novoMotivo.descricao }]).select('id').single();
      if (!res.error && res.data?.id) {
        const atual = getLocalData('motivos_suporte', []);
        setLocalData('motivos_suporte', atual.map((m) => (m.id === novoMotivo.id ? { ...m, id: res.data.id } : m)));
      }
      return res;
    },
    () => setLocalData('motivos_suporte', getLocalData('motivos_suporte', []).filter((m) => m.id !== novoMotivo.id)),
    'O motivo não foi salvo para a equipe'
  );
  return novoMotivo;
}

export function removeMotivoSuporte(id) {
  const anterior = getLocalData('motivos_suporte', DEFAULT_MOTIVOS_SUPORTE);
  setLocalData('motivos_suporte', anterior.filter((m) => m.id !== id));
  if (isCloudId(id)) {
    // Desativa em vez de apagar: chamados antigos continuam com o nome do motivo
    persistirEmSegundoPlano(
      () => supabase.from('suporte_motivos').update({ ativo: false }).eq('id', id),
      () => setLocalData('motivos_suporte', anterior),
      'O motivo não foi removido para a equipe'
    );
  }
  return true;
}

/** Baixa o catálogo de motivos da equipe; na primeira vez, envia motivos que só existiam aqui. */
export async function fetchMotivosSuporte() {
  if (!podeUsarTabelas()) return getMotivosSuporte();
  const { data, error } = await supabase.from('suporte_motivos').select('id, nome, descricao, ativo').order('nome');
  if (error || !Array.isArray(data)) return getMotivosSuporte();
  let lista = data;
  const nomes = new Set(data.map((m) => (m.nome || '').toLowerCase().trim()));
  const legados = getLocalData('motivos_suporte', []).filter(
    (m) => m && !isCloudId(m.id) && m.nome && !nomes.has(m.nome.toLowerCase().trim())
  );
  if (legados.length > 0) {
    const { data: enviados } = await supabase
      .from('suporte_motivos')
      .insert(legados.map((m) => ({ nome: m.nome.trim(), descricao: m.descricao || '' })))
      .select('id, nome, descricao, ativo');
    if (Array.isArray(enviados)) lista = [...data, ...enviados];
  }
  setLocalData('motivos_suporte', lista.filter((m) => m.ativo !== false).map((m) => ({ id: m.id, nome: m.nome, descricao: m.descricao || '' })));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('motivos_updated'));
  return getMotivosSuporte();
}

// ==============================================================================
// GESTÃO DE CATEGORIAS DE DEMANDAS / SUPORTE
// ==============================================================================
// GESTÃO DE DEPARTAMENTOS / CATEGORIAS DE DEMANDAS
// ==============================================================================
export const DEFAULT_DEPARTAMENTOS = [
  'Suporte',
  'Financeiro',
  'Automação',
  'Implantação',
  'Dúvidas Gerais',
  'Feedback',
  'Feedback / Bug RM',
  'Lembretes',
];
export const DEPARTAMENTO_LEMBRETES = 'Lembretes';
export const DEFAULT_CATEGORIAS_DEMANDAS = DEFAULT_DEPARTAMENTOS;


// ==============================================================================
// SEPARAÇÃO RIGOROSA: DEPARTAMENTOS (SETORES) VS MOTIVOS (DIAGNÓSTICOS)
// ==============================================================================
export function inferirDepartamentoPorMotivo(motivo = '') {
  const m = (motivo || '').toLowerCase().trim();
  if (m.includes('fluxo') || m.includes('automaç') || m.includes('automac') || m.includes('ia') || m.includes('bot') || m.includes('inteligente')) {
    return 'Automação';
  }
  if (m.includes('financeiro') || m.includes('pagamento') || m.includes('meta') || m.includes('cobrança') || m.includes('fatura')) {
    return 'Financeiro';
  }
  if (m.includes('implantaç') || m.includes('implantac') || m.includes('setup') || m.includes('onboarding')) {
    return 'Implantação';
  }
  if (m.includes('feedback') || m.includes('bug') || m.includes('melhoria')) {
    return 'Feedback';
  }
  if (m.includes('dúvida') || m.includes('duvida') || m.includes('treinamento')) {
    return 'Dúvidas Gerais';
  }
  return 'Suporte';
}

export function sanitizarCategoriasDemanda(categorias, motivo = '') {
  const depsValidos = getDepartamentos();
  const depsValidosLower = new Set(depsValidos.map((d) => d.toLowerCase().trim()));
  // Adiciona variações sem acento
  depsValidos.forEach((d) => depsValidosLower.add(removerAcentos(d).toLowerCase().trim()));

  const rawList = Array.isArray(categorias) ? categorias : (categorias ? [categorias] : []);
  
  // Lista de motivos conhecidos que NUNCA devem ser tratados como departamento
  const motivosNomesLower = new Set(
    (DEFAULT_MOTIVOS_SUPORTE || []).map((m) => m.nome.toLowerCase().trim())
  );
  (DEFAULT_MOTIVOS_SUPORTE || []).forEach((m) => motivosNomesLower.add(removerAcentos(m.nome).toLowerCase().trim()));
  motivosNomesLower.add('alteracao no fluxo inteligente');
  motivosNomesLower.add('alteração no fluxo inteligente');
  motivosNomesLower.add('duvida operacional / treinamento');
  motivosNomesLower.add('dúvida operacional / treinamento');
  motivosNomesLower.add('redefinicao de senha / acesso');
  motivosNomesLower.add('redefinição de senha / acesso');
  motivosNomesLower.add('desconexao / queda de instancia');
  motivosNomesLower.add('desconexão / queda de instância');
  motivosNomesLower.add('servidor vps indisponivel / reinicio');
  motivosNomesLower.add('servidor vps indisponível / reinício');
  motivosNomesLower.add('bloqueio ou limite na api meta');

  const filtrados = rawList.filter((c) => {
    if (!c) return false;
    const cNorm = c.toLowerCase().trim();
    const cSemAcento = removerAcentos(c).toLowerCase().trim();
    // Rejeita terminantemente se for um motivo diagnosticado
    if (motivosNomesLower.has(cNorm) || motivosNomesLower.has(cSemAcento)) return false;
    return depsValidosLower.has(cNorm) || depsValidosLower.has(cSemAcento);
  });

  if (filtrados.length > 0) return filtrados;
  // Se não restou nenhum departamento legítimo, infere o departamento correto com base no motivo
  return [inferirDepartamentoPorMotivo(motivo)];
}

export function getDepartamentos() {
  const deps = getLocalData('categorias_demandas', DEFAULT_DEPARTAMENTOS);
  let alterou = false;
  if (!deps.some((d) => d.toLowerCase().trim() === 'feedback')) {
    deps.push('Feedback');
    alterou = true;
  }
  if (!deps.some((d) => d.toLowerCase().trim() === DEPARTAMENTO_LEMBRETES.toLowerCase())) {
    deps.push(DEPARTAMENTO_LEMBRETES);
    alterou = true;
  }
  if (alterou) setLocalData('categorias_demandas', deps);
  return deps;
}

export function setDepartamentos(departamentos) {
  const anteriores = getLocalData('categorias_demandas', DEFAULT_DEPARTAMENTOS);
  const aplicar = (lista) => {
    setLocalData('categorias_demandas', lista);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('categorias_demandas_updated'));
      window.dispatchEvent(new Event('departamentos_updated'));
    }
  };
  aplicar(departamentos);
  persistirConfigGlobal('departamentos', departamentos, () => aplicar(anteriores));
}

export function addDepartamento(nome) {
  if (!nome || !nome.trim()) throw new Error('Nome do departamento é obrigatório.');
  const nomeTrim = nome.trim();
  const deps = getDepartamentos();
  if (deps.some((d) => d.toLowerCase() === nomeTrim.toLowerCase())) {
    throw new Error('Este departamento já está cadastrado.');
  }
  const novos = [...deps, nomeTrim];
  setDepartamentos(novos);
  return novos;
}

export function removeDepartamento(nome) {
  const deps = getDepartamentos();
  const novos = deps.filter((d) => d.toLowerCase() !== nome.toLowerCase());
  setDepartamentos(novos);
  return novos;
}

// Aliases para compatibilidade total
export function getCategoriasDemandas() {
  return getDepartamentos();
}
export function setCategoriasDemandas(categorias) {
  return setDepartamentos(categorias);
}
export function addCategoriaDemanda(nome) {
  return addDepartamento(nome);
}
export function removeCategoriaDemanda(nome) {
  return removeDepartamento(nome);
}

// ==============================================================================
// SISTEMA DE CHAMADOS & FILA DE SUPORTE (INICIAR, FILA, ASSUMIR, FINALIZAR & TIMER)
// ==============================================================================
export async function iniciarSuporte({ 
  empresa_id, 
  empresa_nome, 
  chamado_id = null,
  motivo = '',
  categorias = [],
  prioridade = 'normal',
  descricao = '',
  solicitante = '',
  solicitante_nome = '',
  userEmail = 'admin@rmcontrole.com' 
}) {
  const agora = new Date().toISOString();
  const agoraMs = new Date(agora).getTime();
  const chamados = getLocalData('chamados_suporte', []);
  const categoriasValidas = Array.isArray(categorias)
    ? (categorias.length > 0 ? categorias : ['Suporte'])
    : (categorias ? [categorias] : ['Suporte']);

  // Se já existe um ID específico (ex: item que estava 'pendente' ou 'aguardando_visualizacao')
  if (chamado_id) {
    const idx = encontrarIndiceChamado(chamados, chamado_id);
    if (idx !== -1) {
      const anterior = chamados[idx];
      const inicioEsperaMs = new Date(anterior.tempo_espera_inicio || anterior.created_at || agora).getTime();
      const esperaSegs = Math.max(0, Math.floor((agoraMs - inicioEsperaMs) / 1000));

      chamados[idx] = {
        ...anterior,
        status: 'em_andamento',
        categorias: (Array.isArray(categorias) && categorias.length > 0) ? categorias : (anterior.categorias || ['Suporte']),
        tecnico_email: userEmail,
        tecnico_nome: getNomeTecnico(userEmail),
        tempo_espera_fim: agora,
        tempo_espera_segundos: esperaSegs,
        tempo_ativo_inicio: agora,
        iniciado_em: agora,
        solicitante_nome: solicitante_nome || solicitante || anterior.solicitante_nome || anterior.solicitante || 'Colaborador',
      };
      setLocalData('chamados_suporte', chamados);

      // Propaga o início para a nuvem; sem isso o próximo sync devolvia o chamado para "aguardando"
      registrarMutacaoLocal();
      const res = await atualizarChamadoNuvem(chamados[idx].id, {
        status: 'em_andamento', tecnico_email: userEmail, atendente: getNomeTecnico(userEmail), iniciado_em: agora,
      });
      if (!res.ok) console.warn('Erro ao iniciar chamado no Supabase:', res.erro);

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

// Permite múltiplas demandas em andamento para a mesma empresa
  // if (jaEmAndamento) return jaEmAndamento;

  const novoChamado = {
    id: 'chamado_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    empresa_id,
    empresa_nome,
    categorias: categoriasValidas,
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
    sync_estado: isSupabaseConfigured && supabase ? 'enviando' : 'local',
  };

  chamados.unshift(novoChamado);
  setLocalData('chamados_suporte', chamados);
  window.dispatchEvent(new Event('suporte_updated'));

  // Sincroniza em tempo real com o Supabase
  if (isSupabaseConfigured && supabase) {
    const localId = novoChamado.id;
    try {
      const { data: dbSaved, error } = await inserirChamadoNuvem({
        empresa_id: isCloudId(empresa_id) ? empresa_id : resolverEmpresaIdPorNome(empresa_nome),
        empresa_nome: empresa_nome || 'Empresa',
        tecnico_email: userEmail,
        atendente: getNomeTecnico(userEmail),
        colaborador_solicitante: (solicitante_nome || solicitante || 'Colaborador').trim(),
        status: 'em_andamento',
        observacoes: descricao || '',
        motivo: categoriasValidas.join(', '),
        iniciado_em: agora,
      }, {}, localId);
      if (error) throw error;
      if (dbSaved?.id) {
        novoChamado.id = dbSaved.id;
        novoChamado.sync_estado = 'sincronizado';
        substituirIdLocalChamado(localId, dbSaved.id);
      }
    } catch (e) {
      console.warn('Erro ao inserir chamado ativo no Supabase:', e);
      novoChamado.sync_estado = 'pendente';
      novoChamado.sync_erro = e?.message || 'Falha ao sincronizar';
      marcarChamadoSyncPendente(localId, e);
    }
  }

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

/**
 * O campo datetime-local entrega "AAAA-MM-DDTHH:mm" sem fuso. Gravado assim, o banco
 * (timestamptz) lê como UTC e o prazo volta 3h adiantado. Aqui vira ISO com o fuso local.
 */
export function prazoParaIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Data (AAAA-MM-DD) e hora (HH:mm) locais de um prazo, para agenda e lembretes. */
export function partesLocaisPrazo(valor) {
  const d = valor ? new Date(valor) : null;
  if (!d || Number.isNaN(d.getTime())) return { data: null, hora: '09:00' };
  const dois = (n) => String(n).padStart(2, '0');
  return {
    data: `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`,
    hora: `${dois(d.getHours())}:${dois(d.getMinutes())}`,
  };
}

export async function adicionarChamadoFila({
  empresa_id,
  empresa_nome,
  solicitante_nome = '',
  solicitante_email = '',
  solicitante_telefone = '',
  categorias = [],
  etiquetas = [],
  feedback_id = null,
  is_demanda_interna = false,
  atribuido_a = null,
  observacao_inicial = '',
  prazo_limite = null,
  is_lembrete = false,
  iniciarAgora = false,
  tempo_escalonamento_minutos = 15,
  userEmail = 'admin@rmcontrole.com',
}) {
  const agora = new Date().toISOString();
  const agoraMs = Date.now();
  prazo_limite = prazoParaIso(prazo_limite);
  const chamados = getLocalData('chamados_suporte', []);
  let categoriasValidas = Array.isArray(categorias)
    ? (categorias.length > 0 ? categorias : ['Suporte'])
    : (categorias ? [categorias] : ['Suporte']);
  // Lembretes operacionais vivem no departamento próprio para poderem ser filtrados na fila
  if (is_lembrete && !categoriasValidas.some((c) => (c || '').toLowerCase().trim() === DEPARTAMENTO_LEMBRETES.toLowerCase())) {
    categoriasValidas = [...categoriasValidas, DEPARTAMENTO_LEMBRETES];
  }

  // Campos que só existem no schema após a migração de colunas estendidas (opcionais no insert)
  const extrasNuvem = {
    etiquetas: Array.isArray(etiquetas) ? etiquetas : [],
    prazo_limite: prazo_limite || null,
    is_lembrete: Boolean(is_lembrete),
    criador_email: userEmail,
  };
  const syncInicial = isSupabaseConfigured && supabase ? 'enviando' : 'local';

  // Prevenção apenas contra duplo-clique imediato (menos de 1.5s com exatamente a mesma observação e mesmo solicitante)
  const solicitanteFinalCheck = (solicitante_nome || '').trim().toLowerCase();
  const obsFinalCheck = (observacao_inicial || '').trim();
  if (obsFinalCheck || solicitanteFinalCheck) {
    const cliqueDuplo = chamados.find((c) => {
      if (!c) return false;
      const mesmaEmpresa = (c.empresa_id && c.empresa_id === empresa_id) ||
        (c.empresa_nome && empresa_nome && c.empresa_nome.toLowerCase().trim() === empresa_nome.toLowerCase().trim());
      if (!mesmaEmpresa) return false;
      const mesmoSol = (c.solicitante_nome || '').toLowerCase().trim() === solicitanteFinalCheck;
      const mesmaObs = (c.observacao_inicial || c.observacoes || '').trim() === obsFinalCheck;
      const diff = Math.abs(Date.now() - new Date(c.created_at || c.tempo_espera_inicio || 0).getTime());
      return mesmaEmpresa && mesmoSol && mesmaObs && diff < 1500;
    });
    if (cliqueDuplo) {
      return cliqueDuplo;
    }
  }

  if (iniciarAgora) {
    const novoChamado = {
      id: 'chamado_' + agoraMs + '_' + Math.random().toString(36).substr(2, 5),
      empresa_id,
      empresa_nome,
      categorias: categoriasValidas,
      etiquetas: Array.isArray(etiquetas) ? etiquetas : [],
      feedback_id: feedback_id || null,
      is_demanda_interna: is_demanda_interna || Boolean(empresa_nome && empresa_nome.includes('RM Controle')),
      tecnico_email: userEmail,
      tecnico_nome: getNomeTecnico(userEmail),
      criador_email: userEmail,
      criador_nome: getNomeTecnico(userEmail),
      atribuido_a: userEmail,
      atribuido_nome: getNomeTecnico(userEmail),
      atribuido_por_email: userEmail,
      atribuido_em: agora,
      solicitante_nome: (solicitante_nome || '').trim(),
      solicitante_email: solicitante_email.trim(),
      solicitante_telefone: solicitante_telefone.trim(),
      observacao_inicial: observacao_inicial.trim(),
      prazo_limite: prazo_limite || null,
      is_lembrete: Boolean(is_lembrete),
      sync_estado: syncInicial,
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
    window.dispatchEvent(new Event('suporte_updated'));

    // Sincroniza em tempo real com o Supabase
    if (isSupabaseConfigured && supabase) {
      const localId = novoChamado.id;
      try {
        const { data: dbSaved, error } = await inserirChamadoNuvem({
          empresa_id: isCloudId(empresa_id) ? empresa_id : resolverEmpresaIdPorNome(empresa_nome),
          empresa_nome: empresa_nome || 'Empresa',
          tecnico_email: userEmail,
          atendente: getNomeTecnico(userEmail),
          colaborador_solicitante: (solicitante_nome || 'Colaborador').trim(),
          status: 'em_andamento',
          observacoes: observacao_inicial ? observacao_inicial.trim() : '',
          motivo: categoriasValidas.join(', '),
          iniciado_em: agora,
        }, { ...extrasNuvem, atribuido_a: userEmail }, localId);
        if (error) throw error;
        if (dbSaved?.id) {
          novoChamado.id = dbSaved.id;
          novoChamado.sync_estado = 'sincronizado';
          substituirIdLocalChamado(localId, dbSaved.id);
        }
      } catch (e) {
        console.warn('Erro ao inserir suporte_chamados direto no Supabase:', e);
        novoChamado.sync_estado = 'pendente';
        novoChamado.sync_erro = e?.message || 'Falha ao sincronizar';
        marcarChamadoSyncPendente(localId, e);
      }
    }

    await logAuditoria({
      empresaId: empresa_id,
      usuarioEmail: userEmail,
      acao: 'iniciou_suporte_tecnico',
      detalhes: { empresa_nome, modulo: 'Fila de Suporte' },
    });
    // O prazo aparece na Agenda a partir da própria demanda (AgendaView), sem evento duplicado
    window.dispatchEvent(new Event('suporte_updated'));
    return novoChamado;
  }

  const isFilaGeral = !atribuido_a || atribuido_a === 'geral' || atribuido_a === '';
  const tecnicoDesignado = isFilaGeral ? null : atribuido_a;
  const statusInicial = 'aguardando_visualizacao';

  const novoChamado = {
    id: 'chamado_' + agoraMs + '_' + Math.random().toString(36).substr(2, 5),
    empresa_id,
    empresa_nome,
    categorias: categoriasValidas,
    etiquetas: Array.isArray(etiquetas) ? etiquetas : [],
    feedback_id: feedback_id || null,
    is_demanda_interna: is_demanda_interna || Boolean(empresa_nome && empresa_nome.includes('RM Controle')),
    is_fila_geral: isFilaGeral,
    tecnico_email: tecnicoDesignado,
    tecnico_nome: tecnicoDesignado ? getNomeTecnico(tecnicoDesignado) : 'Fila Geral (Aguardando Atendente)',
    criador_email: userEmail,
    criador_nome: getNomeTecnico(userEmail),
    atribuido_a: isFilaGeral ? 'geral' : tecnicoDesignado,
    atribuido_nome: isFilaGeral ? 'Fila Geral (Todos)' : getNomeTecnico(tecnicoDesignado),
    atribuido_por_email: userEmail,
    atribuido_em: agora,
    tempo_escalonamento_minutos: Number(tempo_escalonamento_minutos) || 15,
    escalonado_notificado: false,
    solicitante_nome: (solicitante_nome || '').trim(),
    solicitante_email: solicitante_email.trim(),
    solicitante_telefone: solicitante_telefone.trim(),
    observacao_inicial: observacao_inicial.trim(),
    prazo_limite: prazo_limite || null,
    is_lembrete: Boolean(is_lembrete),
    sync_estado: syncInicial,
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
  window.dispatchEvent(new Event('suporte_updated'));

  // Sincroniza imediatamente na nuvem (Supabase) para que apareça em tempo real para toda a equipe
  if (isSupabaseConfigured && supabase) {
    const localId = novoChamado.id;
    try {
      const { data: dbSaved, error } = await inserirChamadoNuvem({
        empresa_id: isCloudId(empresa_id) ? empresa_id : resolverEmpresaIdPorNome(empresa_nome),
        empresa_nome: empresa_nome || 'Empresa',
        // 'geral' marca a Fila Geral sem ambiguidade. Antes gravava o e-mail de quem criou, e os outros
        // colaboradores interpretavam como "atribuída a outra pessoa" e nunca recebiam o alerta sonoro.
        tecnico_email: tecnicoDesignado || 'geral',
        atendente: tecnicoDesignado ? getNomeTecnico(tecnicoDesignado) : 'Fila Geral (Aguardando Atendente)',
        colaborador_solicitante: (solicitante_nome || 'Colaborador da Empresa').trim(),
        status: statusInicial,
        observacoes: observacao_inicial ? observacao_inicial.trim() : '',
        motivo: categoriasValidas.join(', '),
        iniciado_em: agora,
      }, { ...extrasNuvem, atribuido_a: isFilaGeral ? 'geral' : tecnicoDesignado }, localId);
      if (error) throw error;
      if (dbSaved?.id) {
        novoChamado.id = dbSaved.id;
        novoChamado.sync_estado = 'sincronizado';
        substituirIdLocalChamado(localId, dbSaved.id);
      }
    } catch (e) {
      console.warn('Erro ao inserir suporte_chamados na nuvem do Supabase:', e);
      novoChamado.sync_estado = 'pendente';
      novoChamado.sync_erro = e?.message || 'Falha ao sincronizar';
      marcarChamadoSyncPendente(localId, e);
    }
  }

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


export async function atualizarEtiquetasChamado(chamadoId, novasEtiquetas, userEmail = 'admin@rmcontrole.com') {
  if (!chamadoId) return null;
  const chamados = getLocalData('chamados_suporte', []);
  const idx = encontrarIndiceChamado(chamados, chamadoId);
  if (idx === -1) return null;

  const etiquetasLimpas = Array.from(new Set(
    (Array.isArray(novasEtiquetas) ? novasEtiquetas : [])
      .map((t) => (t || '').trim().replace(/^#/, ''))
      .filter(Boolean)
  ));

  chamados[idx].etiquetas = etiquetasLimpas;
  registrarMutacaoLocal();
  setLocalData('chamados_suporte', chamados);

  const res = await atualizarChamadoNuvem(chamados[idx].id, { etiquetas: etiquetasLimpas });
  if (!res.ok) console.warn('Aviso ao sincronizar etiquetas no Supabase:', res.erro);

  await logAuditoria({
    empresaId: chamados[idx].empresa_id,
    usuarioEmail: userEmail,
    acao: 'atualizou_etiquetas_chamado',
    detalhes: { chamadoId, etiquetas: etiquetasLimpas },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return chamados[idx];
}

/**
 * Troca a descrição de uma demanda guardando as versões anteriores (quem escreveu e quando).
 * `descricao_historico` lista TODAS as versões, da primeira à atual.
 */
export async function editarDescricaoChamado(chamadoId, novoTexto, userEmail = 'admin@rmcontrole.com') {
  const texto = String(novoTexto || '').trim().slice(0, 4000);
  const chamados = getLocalData('chamados_suporte', []);
  const idx = encontrarIndiceChamado(chamados, chamadoId);
  if (idx === -1) throw new Error('Demanda não encontrada.');
  const atual = chamados[idx];
  const anterior = (atual.observacao_inicial || '').trim();
  if (texto === anterior) return atual;

  const versoes = Array.isArray(atual.descricao_historico) ? [...atual.descricao_historico] : [];
  // Primeira edição: a descrição da abertura vira a versão 1
  if (versoes.length === 0 && anterior) {
    versoes.push({
      texto: anterior,
      autor_email: atual.criador_email || '',
      autor_nome: atual.criador_nome || (atual.criador_email ? getNomeTecnico(atual.criador_email) : ''),
      em: atual.created_at || atual.tempo_espera_inicio || null,
    });
  }
  versoes.push({ texto, autor_email: userEmail, autor_nome: getNomeTecnico(userEmail), em: new Date().toISOString() });
  const historico = versoes.slice(-30);

  const res = await atualizarChamadoNuvem(atual.id, { observacoes: texto, descricao_historico: historico }, ['descricao_historico']);
  if (!res.ok) throw new Error(res.erro || 'Não foi possível salvar a descrição.');

  const lista = getLocalData('chamados_suporte', []);
  const i = encontrarIndiceChamado(lista, chamadoId);
  if (i !== -1) {
    lista[i] = { ...lista[i], observacao_inicial: texto, descricao_historico: historico };
    registrarMutacaoLocal();
    setLocalData('chamados_suporte', lista);
  }

  await logAuditoria({
    empresaId: atual.empresa_id,
    usuarioEmail: userEmail,
    acao: 'editou_descricao_chamado',
    detalhes: { chamadoId, empresa_nome: atual.empresa_nome, anterior, nova: texto },
  });

  window.dispatchEvent(new Event('suporte_updated'));
  return i !== -1 ? lista[i] : atual;
}

export function adiarAlertaChamado(chamadoId, minutos = 15, userEmail = 'admin@rmcontrole.com') {
  if (!chamadoId) return null;
  const chamados = getLocalData('chamados_suporte', []);
  const idx = chamados.findIndex((c) => c.id === chamadoId);
  if (idx === -1) return null;

  const agora = Date.now();
  const adiadoAte = new Date(agora + minutos * 60 * 1000).toISOString();

  chamados[idx].adiado_ate = adiadoAte;
  chamados[idx].adiado_por = userEmail;
  chamados[idx].adiado_minutos = minutos;

  setLocalData('chamados_suporte', chamados);

  try {
    stopSupportNotificationLoop();
  } catch (e) {}

  window.dispatchEvent(new Event('suporte_updated'));
  return chamados[idx];
}

export function cancelarAdiarAlertaChamado(chamadoId, userEmail = 'admin@rmcontrole.com') {
  if (!chamadoId) return null;
  const chamados = getLocalData('chamados_suporte', []);
  const idx = chamados.findIndex((c) => c.id === chamadoId);
  if (idx === -1) return null;

  delete chamados[idx].adiado_ate;
  delete chamados[idx].adiado_por;
  delete chamados[idx].adiado_minutos;

  setLocalData('chamados_suporte', chamados);
  window.dispatchEvent(new Event('suporte_updated'));
  return chamados[idx];
}

export function marcarChamadoEscalonado(chamadoId) {
  if (!chamadoId) return null;
  const chamados = getLocalData('chamados_suporte', []);
  const idx = chamados.findIndex((c) => c.id === chamadoId);
  if (idx === -1) return null;

  chamados[idx].escalonado_notificado = true;
  setLocalData('chamados_suporte', chamados);
  window.dispatchEvent(new Event('suporte_updated'));
  return chamados[idx];
}

/**
 * "Sem resposta do cliente": a demanda NÃO é encerrada. Volta para a fila como "Aguardando cliente"
 * (status 'pendente'), mantém o responsável e guarda o tempo de atendimento já gasto
 * (duracao_segundos), que é somado quando o atendimento for retomado e concluído.
 */
export async function aguardarRetornoCliente({ chamado_id, tempo_ativo_segundos = 0, userEmail = 'admin@rmcontrole.com' }) {
  const chamados = getLocalData('chamados_suporte', []);
  const idx = encontrarIndiceChamado(chamados, chamado_id);
  if (idx === -1) throw new Error('Demanda não encontrada.');
  const chamadosAntes = chamados.map((c) => ({ ...c }));
  const anterior = chamados[idx];
  const agora = new Date().toISOString();
  const acumulado = Math.max(0, Math.floor((anterior.duracao_acumulada_segundos || 0) + (tempo_ativo_segundos || 0)));

  chamados[idx] = {
    ...anterior,
    status: 'pendente',
    aguardando_cliente_desde: agora,
    duracao_acumulada_segundos: acumulado,
    iniciado_em: agora,
    tempo_ativo_inicio: null,
    tempo_ativo_segundos: 0,
  };
  registrarMutacaoLocal();
  setLocalData('chamados_suporte', chamados);
  window.dispatchEvent(new Event('suporte_updated'));

  const res = await atualizarChamadoNuvem(
    anterior.id,
    { status: 'pendente', duracao_segundos: acumulado, iniciado_em: agora },
    ['duracao_segundos'],
    ['em_andamento']
  );
  if (!res.ok) {
    registrarMutacaoLocal();
    setLocalData('chamados_suporte', chamadosAntes);
    window.dispatchEvent(new Event('suporte_updated'));
    throw new Error(`Não foi possível colocar a demanda em espera: ${res.erro}`);
  }

  await logAuditoria({
    empresaId: anterior.empresa_id,
    usuarioEmail: userEmail,
    acao: 'aguardando_retorno_cliente',
    detalhes: { empresa_nome: anterior.empresa_nome, tempo_acumulado_segundos: acumulado, modulo: 'Fila de Suporte' },
  });
  window.dispatchEvent(new Event('suporte_updated'));
  return chamados[idx];
}

export async function assumirSuporte({ chamado_id, userEmail = 'admin@rmcontrole.com' }) {
  const chamados = getLocalData('chamados_suporte', []);
  const idx = encontrarIndiceChamado(chamados, chamado_id);
  if (idx === -1) return null;
  const chamadosAntes = chamados.map((c) => ({ ...c }));

  const anterior = chamados[idx];
  const agora = new Date().toISOString();
  const agoraMs = new Date(agora).getTime();
  const inicioEsperaMs = new Date(anterior.tempo_espera_inicio || anterior.created_at || agora).getTime();
  const esperaSegundos = Math.max(0, Math.floor((agoraMs - inicioEsperaMs) / 1000));

  chamados[idx] = {
    ...anterior,
    tecnico_email: userEmail,
    tecnico_nome: getNomeTecnico(userEmail),
    atendente: getNomeTecnico(userEmail),
    atribuido_a: userEmail,
    atribuido_nome: getNomeTecnico(userEmail),
    status: 'em_andamento',
    tempo_espera_fim: agora,
    tempo_espera_segundos: esperaSegundos,
    tempo_ativo_inicio: agora,
    iniciado_em: agora,
  };

  registrarMutacaoLocal();
  setLocalData('chamados_suporte', chamados);
  window.dispatchEvent(new Event('suporte_updated'));

  // Só assume se a demanda ainda estiver aguardando: evita dois colaboradores assumirem a mesma
  const res = await atualizarChamadoNuvem(
    anterior.id,
    { status: 'em_andamento', tecnico_email: userEmail, atendente: getNomeTecnico(userEmail), iniciado_em: agora, atribuido_a: userEmail },
    ['atribuido_a'],
    ['aguardando_visualizacao', 'pendente', 'em_andamento']
  );
  if (!res.ok) {
    registrarMutacaoLocal();
    setLocalData('chamados_suporte', chamadosAntes);
    window.dispatchEvent(new Event('suporte_updated'));
    throw new Error(`Não foi possível assumir esta demanda: ${res.erro}`);
  }

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

// Última leitura da fila na nuvem (para o diagnóstico de visibilidade)
let ultimaLeituraNuvem = null;
export function getUltimaLeituraFilaNuvem() {
  return ultimaLeituraNuvem;
}

/**
 * Compara o que o banco tem com o que este usuário recebeu. Retorna null quando está tudo certo,
 * ou { ocultas, motivo } quando há demandas abertas que o banco não está entregando para ele.
 */
export async function diagnosticarVisibilidadeFila() {
  if (typeof window === 'undefined' || !window.location || !isSupabaseConfigured) return null;
  const leitura = ultimaLeituraNuvem;
  if (!leitura) return null;
  const res = await fetch('/api/fila/diagnostico', { cache: 'no-store' }).catch(() => null);
  if (!res || !res.ok) return null;
  const d = await res.json().catch(() => null);
  if (!d?.ok) return null;
  const ocultas = d.ativosNoBanco - leitura.quantidade;
  if (ocultas <= 0) return null;

  let motivo;
  if (!d.proprietario && !d.naEquipe) {
    motivo = `o e-mail ${d.email} não está cadastrado em Equipe & Senhas. O banco só mostra demandas para membros da equipe — peça ao administrador para cadastrar este e-mail exatamente igual.`;
  } else if (d.naEquipe && !d.ativo) {
    motivo = 'seu acesso está desativado em Equipe & Senhas.';
  } else {
    const { data } = supabase ? await supabase.auth.getSession() : { data: null };
    motivo = data?.session
      ? 'a regra de segurança do banco está bloqueando a leitura. Confirme que a migração migration_supabase_completa.sql foi executada.'
      : 'sua conexão com o banco expirou. Saia e entre novamente.';
  }
  return { ocultas, total: d.ativosNoBanco, motivo };
}

export async function fetchChamadosFila() {
  if (isSupabaseConfigured && supabase) {
    try {
      // Reenvia demandas que falharam ao sincronizar antes de ler a nuvem
      await reenviarChamadosPendentes();

      const versaoInicial = versaoMutacoesLocais;
      const { data, error } = await supabase
        .from('suporte_chamados')
        .select('*')
        .in('status', ['aguardando_visualizacao', 'em_andamento', 'pendente'])
        .is('finalizado_em', null)
        .order('iniciado_em', { ascending: false });

      // Alguém concluiu/cancelou/assumiu/criou durante a consulta: este resultado já nasceu velho
      // e devolveria à fila uma demanda recém-concluída. O próximo ciclo traz o estado certo.
      if (versaoMutacoesLocais !== versaoInicial) return getChamadosSuporte();

      // Conjuntos de exclusão lidos DEPOIS da consulta, para refletir ações feitas durante ela
      const historicoLocal = getLocalData('historico_chamados', []);
      const historicoIds = new Set((historicoLocal || []).map((h) => h.id));
      const canceladosIds = getChamadosCanceladosIds();
      const encerradosIds = getChamadosEncerradosIds();
      const idsMigrados = getLocalData('chamados_ids_migrados', {});

      if (!error && Array.isArray(data)) {
        // Quantas demandas abertas a nuvem entregou para ESTE usuário (comparado no diagnóstico)
        ultimaLeituraNuvem = { quantidade: data.length, em: Date.now(), erro: null };
        // Exclui estritamente chamados já finalizados, cancelados ou registrados no histórico
        const activeData = data.filter((d) => {
          if (!d || !d.id) return false;
          if (d.status === 'finalizado' || d.status === 'concluido' || d.status === 'cancelado') return false;
          if (d.finalizado_em) return false;
          if (historicoIds.has(d.id)) return false;
          if (canceladosIds.has(d.id)) return false;
          if (encerradosIds.has(d.id)) return false;
          if (isChamadoFeedback(d)) return false;
          return true;
        });

        const cloudIds = new Set(activeData.map((d) => d.id));
        const localAnterior = getLocalData('chamados_suporte', []);
        const localTagMap = new Map((localAnterior || []).map((c) => [c.id, c.etiquetas]));

        const cloudChamados = activeData.map((d) => {
          const cats = d.motivo ? d.motivo.split(',').map((s) => s.trim()).filter(Boolean) : ['Suporte'];
          const rawTags = Array.isArray(d.etiquetas) 
            ? d.etiquetas 
            : (typeof d.etiquetas === 'string' ? d.etiquetas.replaceAll('{', '').replaceAll('}', '').replaceAll('"', '').split(',').map((s) => s.trim()).filter(Boolean) : []);
          const finalTags = rawTags.length > 0 ? rawTags : (localTagMap.get(d.id) || []);

          const localMatch = (localAnterior || []).find((c) => c.id === d.id);
          const dataCriacao = d.created_at || localMatch?.created_at || localMatch?.tempo_espera_inicio || d.iniciado_em || new Date().toISOString();
          const inicioEspera = localMatch?.tempo_espera_inicio || d.created_at || dataCriacao;
          const fimEspera = d.status === 'em_andamento'
            ? (localMatch?.tempo_espera_fim || d.iniciado_em || new Date().toISOString())
            : null;

          let esperaSegundos = localMatch?.tempo_espera_segundos || 0;
          if (!esperaSegundos && d.status === 'em_andamento' && inicioEspera && fimEspera) {
            const msDiff = new Date(fimEspera).getTime() - new Date(inicioEspera).getTime();
            if (msDiff > 0) {
              esperaSegundos = Math.max(1, Math.floor(msDiff / 1000));
            }
          }

          const inicioAtivo = d.status === 'em_andamento'
            ? (localMatch?.tempo_ativo_inicio || d.iniciado_em || dataCriacao)
            : null;

          let ativoSegundos = localMatch?.tempo_ativo_segundos || 0;
          if (d.status === 'em_andamento' && inicioAtivo) {
            const msDiffAtivo = Date.now() - new Date(inicioAtivo).getTime();
            ativoSegundos = Math.max(1, Math.floor(msDiffAtivo / 1000));
          }

          return {
            id: d.id,
            empresa_id: d.empresa_id || resolverEmpresaIdPorNome(d.empresa_nome),
            empresa_nome: d.empresa_nome,
            solicitante_nome: d.colaborador_solicitante || 'Colaborador da Empresa',
            tecnico_email: d.tecnico_email === 'geral' ? '' : (d.tecnico_email || ''),
            tecnico_nome: d.atendente || getNomeTecnico(d.tecnico_email),
            criador_email: d.criador_email || localMatch?.criador_email || '',
            criador_nome: d.criador_nome || localMatch?.criador_nome || (d.criador_email ? getNomeTecnico(d.criador_email) : ''),
            atribuido_a: d.atribuido_a || localMatch?.atribuido_a || (d.status === 'aguardando_visualizacao' ? (d.tecnico_email || 'geral') : d.tecnico_email),
            atribuido_nome: d.atribuido_nome || localMatch?.atribuido_nome || (d.atribuido_a && d.atribuido_a !== 'geral' ? getNomeTecnico(d.atribuido_a) : (d.status === 'em_andamento' ? (d.atendente || getNomeTecnico(d.tecnico_email)) : 'Fila Geral (Todos)')),
            observacao_inicial: d.observacoes || '',
            status: d.status,
            categorias: cats,
            etiquetas: finalTags,
            created_at: dataCriacao,
            tempo_espera_inicio: inicioEspera,
            tempo_espera_fim: fimEspera,
            tempo_espera_segundos: esperaSegundos,
            tempo_ativo_inicio: inicioAtivo,
            tempo_ativo_fim: null,
            tempo_ativo_segundos: ativoSegundos,
            iniciado_em: d.iniciado_em,
            finalizado_em: null,
            // Campos operacionais preservados mesmo quando o schema remoto ainda não tem as colunas
            is_lembrete: Boolean(d.is_lembrete ?? localMatch?.is_lembrete ?? cats.some((cat) => cat.toLowerCase() === DEPARTAMENTO_LEMBRETES.toLowerCase())),
            prazo_limite: d.prazo_limite || localMatch?.prazo_limite || null,
            descricao_historico: Array.isArray(d.descricao_historico) && d.descricao_historico.length ? d.descricao_historico : localMatch?.descricao_historico || [],
            // Nuvem primeiro: é o que todos os colaboradores enxergam
            is_fila_geral: d.atribuido_a
              ? d.atribuido_a === 'geral'
              : (d.tecnico_email === 'geral' || (localMatch?.is_fila_geral ?? false)),
            atribuido_por_email: localMatch?.atribuido_por_email || d.criador_email || '',
            motivo: d.motivo || '',
            duracao_acumulada_segundos: d.status === 'pendente' || d.status === 'em_andamento' ? (d.duracao_segundos || localMatch?.duracao_acumulada_segundos || 0) : 0,
            aguardando_cliente_desde: d.status === 'pendente' ? (d.iniciado_em || localMatch?.aguardando_cliente_desde || null) : null,
            atribuido_em: localMatch?.atribuido_em || dataCriacao,
            tempo_escalonamento_minutos: localMatch?.tempo_escalonamento_minutos || 15,
            escalonado_notificado: Boolean(localMatch?.escalonado_notificado),
            sync_estado: 'sincronizado',
          };
        });

        // Mantém chamados locais estritamente se forem mock ou offline (IDs sem hífen UUID) e NÃO estiverem concluídos
        const local = getLocalData('chamados_suporte', []);
        const localMocks = local.filter((c) => {
          if (!c || !c.id) return false;
          if (cloudIds.has(c.id)) return false;
          if (c.id.includes('-')) return false;
          if (c.status === 'finalizado' || c.status === 'concluido' || c.status === 'cancelado') return false;
          if (c.finalizado_em) return false;
          if (historicoIds.has(c.id)) return false;
          if (canceladosIds.has(c.id)) return false;
          if (encerradosIds.has(c.id)) return false;
          // Já recebeu o UUID oficial: a cópia válida é a da nuvem
          if (idsMigrados[c.id]) return false;

          const normSol = (v) => {
            const n = (v || '').toLowerCase().trim();
            return n === 'colaborador' || n === 'colaborador da empresa' ? '' : n;
          };
          const mesmaDemanda = (d, janelaMs) => {
            const mesmaEmpresa = (d.empresa_nome || '').toLowerCase().trim() === (c.empresa_nome || '').toLowerCase().trim();
            const mesmoSolicitante = normSol(d.solicitante_nome) === normSol(c.solicitante_nome);
            const mesmaObs = (d.observacao_inicial || '').trim() === (c.observacao_inicial || '').trim();
            const diff = Math.abs(new Date(d.iniciado_em || d.created_at || 0).getTime() - new Date(c.created_at || c.tempo_espera_inicio || 0).getTime());
            return mesmaEmpresa && mesmoSolicitante && mesmaObs && diff < janelaMs;
          };

          // Envio em andamento: some só se a nuvem já tiver exatamente a mesma demanda
          if (c.sync_estado === 'enviando' || insercoesEmAndamento.has(c.id)) {
            return !cloudChamados.some((d) => mesmaDemanda(d, 10000));
          }
          if (c.sync_estado === 'pendente' || c.sync_estado === 'local') return true;
          // Dados de demonstração nunca são enviados para a nuvem
          if (c.is_mock || String(c.id).includes('mock')) return isMockDataEnabled();

          // Demanda antiga, criada antes desta correção, que só existe neste navegador
          // (era a causa de cada colaborador ver uma lista diferente). Se a nuvem já tem a
          // mesma demanda, descarta a cópia; senão, agenda o envio para todos verem.
          if (cloudChamados.some((d) => mesmaDemanda(d, 24 * 60 * 60 * 1000))) return false;
          c.sync_estado = 'pendente';
          return true;
        });

        const merged = [...cloudChamados, ...localMocks];
        setLocalData('chamados_suporte', merged);
        return merged;
      }
    } catch (e) {
      console.warn('Erro ao sincronizar chamados da fila com o Supabase:', e);
    }
  }
  return getChamadosSuporte();
}

// Tenta novamente enviar demandas criadas enquanto a nuvem estava indisponível
let reenvioEmAndamento = false;
async function reenviarChamadosPendentes() {
  if (reenvioEmAndamento || !isSupabaseConfigured || !supabase) return;
  const pendentes = getLocalData('chamados_suporte', []).filter((c) => c && c.sync_estado === 'pendente' && !isCloudId(c.id));
  if (pendentes.length === 0) return;
  reenvioEmAndamento = true;
  try {
    for (const c of pendentes) {
      const { data, error } = await inserirChamadoNuvem({
        empresa_id: isCloudId(c.empresa_id) ? c.empresa_id : resolverEmpresaIdPorNome(c.empresa_nome),
        empresa_nome: c.empresa_nome || 'Empresa',
        tecnico_email: c.tecnico_email || (c.is_fila_geral ? 'geral' : c.criador_email) || 'geral',
        atendente: c.tecnico_nome || getNomeTecnico(c.tecnico_email || c.criador_email),
        colaborador_solicitante: (c.solicitante_nome || 'Colaborador da Empresa').trim(),
        status: c.status === 'em_andamento' ? 'em_andamento' : 'aguardando_visualizacao',
        observacoes: c.observacao_inicial || c.observacoes || '',
        motivo: (c.categorias || ['Suporte']).join(', '),
        iniciado_em: c.iniciado_em || c.created_at,
      }, {
        etiquetas: c.etiquetas || [],
        prazo_limite: c.prazo_limite || null,
        is_lembrete: Boolean(c.is_lembrete),
        criador_email: c.criador_email || null,
        atribuido_a: c.atribuido_a || null,
      }, c.id);
      if (!error && data?.id) substituirIdLocalChamado(c.id, data.id);
      else if (error) marcarChamadoSyncPendente(c.id, error);
    }
  } finally {
    reenvioEmAndamento = false;
  }
}

// O loop do alerta sonoro consulta exatamente a lista que a Fila exibe
registrarFonteChamadosAtivos(() => getChamadosSuporte().filter((c) => !isChamadoFeedback(c)));

/**
 * Baixa tudo que é compartilhado pela equipe (configurações, catálogos, colaboradores, soluções
 * e agenda). Na primeira execução em cada navegador também envia ao Supabase o que antes só
 * existia localmente. Cada parte falha de forma independente.
 */
let sincronizacaoEmAndamento = null;
export function sincronizarDadosCompartilhados() {
  if (sincronizacaoEmAndamento) return sincronizacaoEmAndamento;
  sincronizacaoEmAndamento = Promise.allSettled([
    sincronizarConfiguracoesGlobais(),
    fetchMotivosSuporte(),
    fetchServerChecklistTemplate(),
    fetchColaboradoresEmpresas(),
    fetchSolucoesSuporte(),
    fetchAgendaEventos(),
  ]).finally(() => {
    sincronizacaoEmAndamento = null;
  });
  return sincronizacaoEmAndamento;
}

// Mesma lista que a Fila exibe (o contador do menu mostrava itens que a fila escondia)
export function getFilaChamados() {
  return getChamadosSuporte().filter((c) => !isChamadoFeedback(c));
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
  userEmail = 'admin@rmcontrole.com',
  tempo_ativo_segundos = null,
  tempo_ativo_inicio = null,
  finalizado_em = null,
  status_resolucao = 'resolvido',
  // O modal de conclusão cataloga a solução com título e código próprios; evita duplicar na base
  catalogarSolucao = true,
}) {
  const chamados = getLocalData('chamados_suporte', []);
  const historicoAntes = getLocalData('historico_chamados', []);
  // Aceita o ID provisório: o modal pode ter sido aberto antes de a demanda receber o UUID oficial
  const idx = encontrarIndiceChamado(chamados, chamado_id);
  if (idx === -1) {
    const jaConcluido = historicoAntes.find((h) => h.id === chamado_id || h.id === getLocalData('chamados_ids_migrados', {})[chamado_id]);
    if (jaConcluido) return jaConcluido; // segundo clique / outra aba: já está concluído
    throw new Error('Esta demanda não está mais na fila (pode ter sido concluída ou cancelada por outro colaborador).');
  }
  const chamadosAntes = chamados.map((c) => ({ ...c }));

  const chamado = chamados[idx];
  const finalizadoEm = finalizado_em || new Date().toISOString();
  const agoraMs = new Date(finalizadoEm).getTime();

  let esperaSegs = chamado.tempo_espera_segundos || 0;
  if (!chamado.tempo_espera_fim && chamado.tempo_espera_inicio) {
    esperaSegs = Math.max(0, Math.floor((agoraMs - new Date(chamado.tempo_espera_inicio).getTime()) / 1000));
  }

  const inicioAtivoFinal = tempo_ativo_inicio || chamado.tempo_ativo_inicio || chamado.iniciado_em || finalizadoEm;
  const ativoInicioMs = new Date(inicioAtivoFinal).getTime();
  const ativoSegs = typeof tempo_ativo_segundos === 'number' && tempo_ativo_segundos >= 0
    ? tempo_ativo_segundos
    : Math.max(1, Math.floor((agoraMs - ativoInicioMs) / 1000));

  const chamadoFinalizado = {
    ...chamado,
    status: 'concluido',
    status_resolucao: status_resolucao || 'resolvido',
    categorias: sanitizarCategoriasDemanda(chamado.categorias, motivo || chamado.motivo),
    motivo: motivo || chamado.motivo || (status_resolucao === 'sem_resposta' ? 'Sem resposta do cliente' : 'Atendimento Geral'),
    solicitante_nome: colaborador_solicitante || chamado.solicitante_nome || 'Colaborador',
    resolucao: observacoes || '',
    observacoes: observacoes || '',
    tempo_ativo_inicio: inicioAtivoFinal,
    iniciado_em: inicioAtivoFinal,
    finalizado_em: finalizadoEm,
    tempo_espera_segundos: esperaSegs,
    tempo_ativo_segundos: ativoSegs,
    duracao_segundos: ativoSegs,
    atendente_nome: atendente || chamado.tecnico_nome || getNomeTecnico(userEmail),
    tecnico_email: chamado.tecnico_email || userEmail,
    tecnico_nome: chamado.tecnico_nome || getNomeTecnico(userEmail),
  };

  // 1. Atualização otimista: sai da fila na hora e não volta por causa de um sync atrasado
  chamados.splice(idx, 1);
  registrarChamadoEncerrado(chamado.id, chamado_id);
  registrarMutacaoLocal();
  setLocalData('chamados_suporte', chamados);
  setLocalData('historico_chamados', [chamadoFinalizado, ...historicoAntes].slice(0, 500));
  window.dispatchEvent(new Event('suporte_updated'));

  // 2. Confirma na nuvem para que a demanda feche para toda a equipe
  if (isSupabaseConfigured && supabase) {
    const payload = {
      empresa_id: isCloudId(chamado.empresa_id) ? chamado.empresa_id : null,
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

    let resultado;
    const cloudId = await resolverIdNuvem(chamado.id);
    if (cloudId) {
      resultado = await atualizarChamadoNuvem(cloudId, payload);
    } else {
      // Demanda que nunca chegou à nuvem (sem conexão): registra direto como finalizada
      const { data, error } = await inserirChamadoNuvemBruto(payload);
      resultado = { ok: !error, cloudId: data?.id || null, erro: error?.message };
    }

    if (!resultado.ok) {
      // 3. Reverte: a demanda continua aberta para os outros, então não pode sumir só aqui
      desfazerChamadoEncerrado(chamado.id, chamado_id);
      registrarMutacaoLocal();
      setLocalData('chamados_suporte', chamadosAntes);
      setLocalData('historico_chamados', historicoAntes);
      window.dispatchEvent(new Event('suporte_updated'));
      console.warn('Falha ao concluir chamado no Supabase:', resultado.erro);
      throw new Error(`Não foi possível concluir no servidor: ${resultado.erro} A demanda continua na fila.`);
    }

    if (resultado.cloudId && resultado.cloudId !== chamadoFinalizado.id) {
      registrarChamadoEncerrado(resultado.cloudId);
      chamadoFinalizado.id = resultado.cloudId;
      setLocalData('historico_chamados', [chamadoFinalizado, ...historicoAntes].slice(0, 500));
    }
  }

  try {
    stopSupportNotificationLoop();
  } catch (e) {}

  // Se o chamado for vinculado a feedback ou demanda interna RM Controle, conclui o feedback correspondente
  try {
    const feedbackId = chamado.feedback_id;
    let feedbacks = getLocalData('feedbacks_lista', []);
    let fbEncontrado = null;
    if (feedbackId) {
      fbEncontrado = feedbacks.find((f) => f.id === feedbackId);
    } else if (chamado.empresa_nome && chamado.empresa_nome.includes('RM Controle') && chamado.motivo) {
      // Casamento restrito e exato por título/motivo para evitar alterar feedbacks não relacionados
      const motNorm = (chamado.motivo || '').trim().toLowerCase();
      fbEncontrado = feedbacks.find((f) => (f.titulo || '').trim().toLowerCase() === motNorm);
    }

    if (fbEncontrado) {
      fbEncontrado.status = 'resolvido';
      fbEncontrado.resolvido_em = finalizadoEm;
      fbEncontrado.resolucao = observacoes || 'Demanda técnica concluída com sucesso na fila de suporte';
      setLocalData('feedbacks_lista', feedbacks);

      if (isSupabaseConfigured && supabase && fbEncontrado.id) {
        supabase
          .from('feedbacks')
          .update({ status: 'resolvido', updated_at: finalizadoEm })
          .eq('id', fbEncontrado.id)
          .then(() => {})
          .catch(() => {});
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('feedbacks_updated'));
      }
    }
  } catch (errFb) {
    console.warn('Erro ao atualizar status do feedback na conclusão do chamado:', errFb);
  }

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

  // Cataloga automaticamente o procedimento adotado na base de "Como Resolver Chamados"
  if (catalogarSolucao && chamadoFinalizado.observacoes && chamadoFinalizado.observacoes.trim()) {
    try {
      await addSolucaoSuporte({
        empresa_id: chamadoFinalizado.empresa_id || null,
        empresa_nome: chamadoFinalizado.empresa_nome || 'Global',
        titulo: `${chamadoFinalizado.motivo || 'Atendimento'} (${chamadoFinalizado.empresa_nome || 'Empresa'})`,
        erro_codigo: '',
        contexto: `Procedimento registrado na conclusão do chamado por ${chamadoFinalizado.atendente_nome || chamadoFinalizado.tecnico_nome || 'atendente'}.`,
        tipo_erro: chamadoFinalizado.motivo || 'Suporte Geral',
        solucao_passos: chamadoFinalizado.observacoes.trim(),
        tags: [chamadoFinalizado.motivo, chamadoFinalizado.empresa_nome, 'suporte_finalizado'],
        userEmail,
      });
    } catch (e) {
      console.warn('Erro ao catalogar solução em finalizarSuporte:', e);
    }
  }

  window.dispatchEvent(new Event('suporte_updated'));
  return chamadoFinalizado;
}

export async function cancelarSuporte({ chamado_id, userEmail = 'admin@rmcontrole.com' }) {
  const chamadosAntes = getLocalData('chamados_suporte', []);
  const historicoAntes = getLocalData('historico_chamados', []);
  const idxAtivo = encontrarIndiceChamado(chamadosAntes, chamado_id);
  const anteriorChamado = idxAtivo !== -1 ? chamadosAntes[idxAtivo] : null;
  const idReal = anteriorChamado?.id || getLocalData('chamados_ids_migrados', {})[chamado_id] || chamado_id;
  const histItem = historicoAntes.find((c) => c.id === idReal || c.id === chamado_id) || null;
  const ids = [...new Set([chamado_id, idReal])];

  // 1. Remoção otimista: some da fila e do histórico imediatamente
  ids.forEach(registrarChamadoCancelado);
  registrarChamadoEncerrado(...ids);
  registrarMutacaoLocal();
  setLocalData('chamados_suporte', chamadosAntes.filter((c) => !ids.includes(c.id)));
  setLocalData('historico_chamados', historicoAntes.filter((c) => !ids.includes(c.id)));
  window.dispatchEvent(new Event('suporte_updated'));

  const empresaId = anteriorChamado?.empresa_id || histItem?.empresa_id || null;
  const empresaNome = anteriorChamado?.empresa_nome || histItem?.empresa_nome || '';

  // 2. Persiste na nuvem. O cancelamento é um UPDATE de status (permitido para a equipe de suporte);
  //    o DELETE é restrito a administradores pela RLS e falhava silenciosamente, fazendo a demanda voltar.
  const cloudId = isSupabaseConfigured && supabase ? await resolverIdNuvem(idReal) : null;
  if (cloudId) {
    registrarChamadoCancelado(cloudId);
    registrarChamadoEncerrado(cloudId);
    const agora = new Date().toISOString();
    let confirmado = false;
    let ultimoErro = null;

    const upd = await supabase
      .from('suporte_chamados')
      .update({ status: 'cancelado', finalizado_em: agora })
      .eq('id', cloudId)
      .select('id');
    if (!upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
      confirmado = true;
    } else {
      ultimoErro = upd.error;
      const del = await supabase.from('suporte_chamados').delete().eq('id', cloudId).select('id');
      if (!del.error && Array.isArray(del.data) && del.data.length > 0) confirmado = true;
      else ultimoErro = del.error || ultimoErro;
    }

    if (!confirmado) {
      // Nenhuma linha afetada: pode já ter sido removida por outro colaborador
      const { data: aindaExiste } = await supabase
        .from('suporte_chamados')
        .select('id, status')
        .eq('id', cloudId)
        .maybeSingle();
      if (aindaExiste && aindaExiste.status !== 'cancelado') {
        // 3. Reverte a remoção otimista e informa o motivo
        [...ids, cloudId].forEach(desfazerRegistroCancelado);
        desfazerChamadoEncerrado(...ids, cloudId);
        registrarMutacaoLocal();
        setLocalData('chamados_suporte', chamadosAntes);
        setLocalData('historico_chamados', historicoAntes);
        window.dispatchEvent(new Event('suporte_updated'));
        console.warn('Falha ao cancelar chamado no Supabase:', ultimoErro);
        throw new Error('Não foi possível cancelar no servidor — seu usuário não tem permissão para alterar esta demanda. A demanda foi mantida na fila.');
      }
    }
  }

  try {
    stopSupportNotificationLoop();
  } catch (e) {}

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'cancelou_suporte_tecnico',
    detalhes: { chamado_id, empresa_nome: empresaNome, modulo: 'Fila de Suporte' },
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

// Colaboradores ficam numa chave própria: a lista de empresas é recarregada do banco
// a todo momento e apagava os colaboradores que eram guardados dentro dela.
const CHAVE_COLABORADORES = 'empresa_colaboradores';

function salvarColaboradoresLocal(empresaId, lista) {
  const mapa = getLocalData(CHAVE_COLABORADORES, {});
  mapa[empresaId] = lista;
  setLocalData(CHAVE_COLABORADORES, mapa);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('colaboradores_updated'));
}

export async function addColaboradorEmpresa(empresaId, { nome, cargo = '', email = '', telefone = '' }, userEmail = 'admin@rmcontrole.com') {
  if (!nome || !nome.trim()) throw new Error('Nome do colaborador é obrigatório.');

  let novoColaborador = {
    id: 'colab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    nome: nome.trim(),
    cargo: cargo.trim(),
    email: email.trim(),
    telefone: telefone.trim(),
    created_at: new Date().toISOString(),
  };

  if (podeUsarTabelas() && isCloudId(empresaId)) {
    const { data, error } = await supabase
      .from('empresa_colaboradores')
      .insert([{ empresa_id: empresaId, nome: novoColaborador.nome, cargo: novoColaborador.cargo, email: novoColaborador.email, telefone: novoColaborador.telefone, created_by: userEmail }])
      .select('id, nome, cargo, email, telefone, created_at')
      .single();
    if (error) throw new Error(`Não foi possível salvar o colaborador: ${error.message}`);
    novoColaborador = data;
  }

  salvarColaboradoresLocal(empresaId, [...getColaboradoresEmpresa(empresaId), novoColaborador]);

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'adicionou_colaborador_empresa',
    detalhes: { nome: novoColaborador.nome, cargo, email, modulo: 'Colaboradores da Empresa' },
  });

  return novoColaborador;
}

export function getColaboradoresEmpresa(empresaId) {
  if (!empresaId) return [];
  const mapa = getLocalData(CHAVE_COLABORADORES, {});
  if (Array.isArray(mapa[empresaId])) return mapa[empresaId];
  // Formato antigo (dentro da empresa)
  const emp = getLocalData('empresas_reais', []).find((e) => e.id === empresaId);
  return emp?.colaboradores || [];
}

/** Baixa os colaboradores de todas as empresas; na primeira vez, envia os que só existiam aqui. */
export async function fetchColaboradoresEmpresas() {
  if (!podeUsarTabelas()) return getLocalData(CHAVE_COLABORADORES, {});
  const { data, error } = await supabase.from('empresa_colaboradores').select('id, empresa_id, nome, cargo, email, telefone, created_at').order('nome');
  if (error || !Array.isArray(data)) return getLocalData(CHAVE_COLABORADORES, {});

  const mapa = {};
  data.forEach((c) => {
    (mapa[c.empresa_id] ||= []).push(c);
  });

  // Migração: colaboradores locais (formato novo ou antigo) de empresas que já estão na nuvem
  const legadosPorEmpresa = { ...getLocalData(CHAVE_COLABORADORES, {}) };
  getLocalData('empresas_reais', []).forEach((e) => {
    if (Array.isArray(e.colaboradores) && e.colaboradores.length) legadosPorEmpresa[e.id] = [...(legadosPorEmpresa[e.id] || []), ...e.colaboradores];
  });
  const envio = [];
  Object.entries(legadosPorEmpresa).forEach(([empresaId, lista]) => {
    if (!isCloudId(empresaId)) return;
    const existentes = new Set((mapa[empresaId] || []).map((c) => (c.nome || '').toLowerCase().trim()));
    (lista || []).forEach((c) => {
      const chave = (c?.nome || '').toLowerCase().trim();
      if (c && !isCloudId(c.id) && chave && !existentes.has(chave)) {
        existentes.add(chave);
        envio.push({ empresa_id: empresaId, nome: c.nome, cargo: c.cargo || '', email: c.email || '', telefone: c.telefone || '' });
      }
    });
  });
  if (envio.length > 0) {
    const { data: enviados } = await supabase.from('empresa_colaboradores').insert(envio).select('id, empresa_id, nome, cargo, email, telefone, created_at');
    (enviados || []).forEach((c) => (mapa[c.empresa_id] ||= []).push(c));
  }

  setLocalData(CHAVE_COLABORADORES, mapa);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('colaboradores_updated'));
  return mapa;
}

export async function deleteColaboradorEmpresa(empresaId, colaboradorId, userEmail = 'admin@rmcontrole.com') {
  if (!empresaId || !colaboradorId) return false;
  if (podeUsarTabelas() && isCloudId(colaboradorId)) {
    const { data, error } = await supabase.from('empresa_colaboradores').delete().eq('id', colaboradorId).select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(`Não foi possível remover o colaborador: ${error?.message || 'sem permissão'}`);
    }
  }
  salvarColaboradoresLocal(empresaId, getColaboradoresEmpresa(empresaId).filter((c) => c.id !== colaboradorId));
  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'removeu_colaborador_empresa',
    detalhes: { colaborador_id: colaboradorId, modulo: 'Colaboradores da Empresa' },
  });
  return true;
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
  const chamadosAtivos = getLocalData('chamados_suporte', []);
  const idsAtivosNaFila = new Set(
    chamadosAtivos
      .filter((c) => c && (c.status === 'em_andamento' || c.status === 'aguardando_visualizacao' || c.status === 'pendente'))
      .map((c) => c.id)
  );

  const concluidosFila = chamadosAtivos.filter(
    (c) => c.status === 'concluido' || c.status === 'finalizado'
  );

  const mapa = new Map();
  // 1. Coloca chamados finalizados locais da fila
  concluidosFila.forEach((c) => mapa.set(c.id, c));
  // 2. Coloca e sobrepõe com histórico oficial, garantindo que chamados ativos jamais entrem no histórico
  historico.forEach((c) => {
    if (!idsAtivosNaFila.has(c.id) && (c.status === 'concluido' || c.status === 'finalizado')) {
      mapa.set(c.id, c);
    }
  });

  return Array.from(mapa.values())
    .map((c) => ({
      ...c,
      status: 'finalizado',
      tecnico_nome: c.tecnico_nome || getNomeTecnico(c.tecnico_email, c.atendente_nome),
      atendente_nome: c.atendente_nome || c.tecnico_nome || getNomeTecnico(c.tecnico_email),
    }))
    .sort(
      (a, b) =>
        new Date(b.finalizado_em || b.created_at || b.iniciado_em || 0) -
        new Date(a.finalizado_em || a.created_at || a.iniciado_em || 0)
    );
}

// Sincroniza e busca todos os chamados finalizados do Supabase (para exibir atendimentos de todos os usuários)
export async function fetchHistoricoChamados() {
  let dbChamados = [];
  if (isSupabaseConfigured && supabase) {
    try {
      // Busca todos os chamados finalizados ou que possuam resolução/observação técnica preenchida
      const { data, error } = await supabase
        .from('suporte_chamados')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        const localHistMap = new Map((getLocalData('historico_chamados', []) || []).map((h) => [h.id, h]));
        const canceladosIds = getChamadosCanceladosIds();
        dbChamados = data.filter((d) => d && d.status !== 'cancelado' && !canceladosIds.has(d.id)).map((d) => {
          const localItem = localHistMap.get(d.id);
          // Extrai categorias do motivo ou do localItem
          // Separa rigorosamente departamentos (categorias) dos motivos diagnosticados
          let rawCats = [];
          if (Array.isArray(d.categorias) && d.categorias.length > 0) {
            rawCats = d.categorias;
          } else if (localItem && Array.isArray(localItem.categorias) && localItem.categorias.length > 0) {
            rawCats = localItem.categorias;
          } else if (d.etiquetas && Array.isArray(d.etiquetas)) {
            const depEtq = d.etiquetas.find((etq) => typeof etq === 'string' && etq.startsWith('dep:'));
            if (depEtq) rawCats = [depEtq.replace('dep:', '')];
          }
          const cats = sanitizarCategoriasDemanda(rawCats, d.motivo);

          return {
            id: d.id,
            empresa_id: d.empresa_id || resolverEmpresaIdPorNome(d.empresa_nome),
            empresa_nome: d.empresa_nome,
            tecnico_email: d.tecnico_email,
            tecnico_nome: d.atendente || getNomeTecnico(d.tecnico_email),
            atendente_nome: d.atendente || getNomeTecnico(d.tecnico_email),
            solicitante_nome: d.colaborador_solicitante || localItem?.solicitante_nome || '',
            status: 'finalizado',
            motivo: (d.motivo || '').trim() || 'Atendimento Geral',
            categorias: cats,
            observacoes: d.observacoes || '',
            resolucao: d.observacoes || '',
            iniciado_em: d.iniciado_em,
            finalizado_em: d.finalizado_em || d.iniciado_em || d.created_at,
            duracao_segundos: d.duracao_segundos || 0,
            tempo_ativo_segundos: d.duracao_segundos || 0,
            created_at: d.created_at || d.iniciado_em,
            prazo_limite: d.prazo_limite || localItem?.prazo_limite || null,
          };
        });
      }
    } catch (e) {
      console.warn('Erro ao buscar suporte_chamados no Supabase:', e);
    }
  }

  // Lista de IDs ativos na fila para blindar o histórico contra chamados ativos
  const chamadosAtivos = getLocalData('chamados_suporte', []);
  const idsAtivosNaFila = new Set(
    chamadosAtivos
      .filter((c) => c && (c.status === 'em_andamento' || c.status === 'aguardando_visualizacao' || c.status === 'pendente'))
      .map((c) => c.id)
  );

  // Mescla com historico local preservando unicidade e GARANTINDO que chamados ativos NUNCA entrem no histórico
  const localHist = getLocalData('historico_chamados', []);
  const mapa = new Map();
  // Dados do banco Supabase têm prioridade
  dbChamados.forEach((c) => {
    if (!idsAtivosNaFila.has(c.id) && (c.status === 'finalizado' || c.status === 'concluido')) {
      mapa.set(c.id, c);
    }
  });
  // Mantém locais apenas se não forem ativos
  localHist.forEach((c) => {
    if (!mapa.has(c.id) && !idsAtivosNaFila.has(c.id) && (c.status === 'finalizado' || c.status === 'concluido')) {
      mapa.set(c.id, c);
    }
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
  categorias = [],
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
    solicitante_nome: (solicitante_nome || '').trim(),
    status: 'concluido',
    categorias: sanitizarCategoriasDemanda(categorias, motivo),
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

  // Cataloga automaticamente o procedimento adotado na base de "Como Resolver Chamados"
  if (novoChamado.observacoes && novoChamado.observacoes.trim()) {
    try {
      await addSolucaoSuporte({
        empresa_id: novoChamado.empresa_id || null,
        empresa_nome: novoChamado.empresa_nome || 'Global',
        titulo: `${novoChamado.motivo || 'Atendimento'} (${novoChamado.empresa_nome || 'Empresa'})`,
        erro_codigo: '',
        contexto: `Procedimento registrado em atendimento por ${novoChamado.atendente_nome || 'atendente'}.`,
        tipo_erro: novoChamado.motivo || 'Suporte Geral',
        solucao_passos: novoChamado.observacoes.trim(),
        tags: [novoChamado.motivo, novoChamado.empresa_nome, 'suporte_finalizado'],
        userEmail,
      });
    } catch (e) {
      console.warn('Erro ao catalogar solução em registrarSuporteRetroativo:', e);
    }
  }

  window.dispatchEvent(new Event('suporte_updated'));
  return novoChamado;
}

/**
 * Demanda em atendimento da empresa. Com `userEmail`, prefere a que está com essa pessoa
 * (e a iniciada por último): uma empresa pode ter mais de uma demanda aberta ao mesmo tempo.
 */
export function getChamadoAtivo(empresa_id = null, userEmail = null) {
  const ativos = getLocalData('chamados_suporte', []).filter(
    (c) => c && c.status === 'em_andamento' && (!empresa_id || c.empresa_id === empresa_id)
  );
  if (!ativos.length) return null;
  const recentes = [...ativos].sort(
    (a, b) => new Date(b.tempo_ativo_inicio || b.iniciado_em || 0).getTime() - new Date(a.tempo_ativo_inicio || a.iniciado_em || 0).getTime()
  );
  const email = (userEmail || '').toLowerCase();
  return (email && recentes.find((c) => (c.tecnico_email || '').toLowerCase() === email)) || recentes[0];
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
  tempo_saudavel_minutos: 10,
  tempo_intermediario_minutos: 20,
  tempo_critico_minutos: 30,
};

export function getConfiguracoesSuporte() {
  return getLocalData('configuracoes_suporte', DEFAULT_CONFIG_SUPORTE);
}

export function setConfiguracoesSuporte(config) {
  const atual = getConfiguracoesSuporte();
  const novo = { ...atual, ...config };
  setLocalData('configuracoes_suporte', novo);
  window.dispatchEvent(new Event('config_suporte_updated'));
  persistirConfigGlobal('configuracoes_suporte', novo, () => {
    setLocalData('configuracoes_suporte', atual);
    window.dispatchEvent(new Event('config_suporte_updated'));
  });
  return novo;
}

export function getChamadosSuporte({ empresa_id = null, status = 'todos' } = {}) {
  let chamados = getLocalData('chamados_suporte', []);
  const historico = getLocalData('historico_chamados', []);
  const historicoIds = new Set((historico || []).map((h) => h.id));
  const canceladosIds = getChamadosCanceladosIds();
  const encerradosIds = getChamadosEncerradosIds();

  // Purga estritamente qualquer chamado que já foi concluído ou arquivado no histórico
  chamados = chamados.filter((c) => {
    if (!c || !c.id) return false;
    if (canceladosIds.has(c.id)) return false;
    if (encerradosIds.has(c.id)) return false;
    if (c.status === 'concluido' || c.status === 'finalizado' || c.status === 'cancelado') return false;
    if (c.finalizado_em) return false;
    if (historicoIds.has(c.id)) return false;
    return true;
  });

  if (empresa_id) {
    chamados = chamados.filter((c) => c.empresa_id === empresa_id);
  }
  if (status && status !== 'todos') {
    chamados = chamados.filter((c) => c.status === status);
  }
  return chamados;
}

export function getMetricasSuporte({ periodo = '7d', dataInicio = null, dataFim = null, categoria = null } = {}) {
  const chamadosAtivos = getLocalData('chamados_suporte', []);
  const historicoChamados = getLocalData('historico_chamados', []);

  // Lista de IDs ativos na fila para garantir que nenhum ativo seja contabilizado como finalizado
  const idsAtivosNaFila = new Set(
    chamadosAtivos
      .filter((c) => c && (c.status === 'em_andamento' || c.status === 'aguardando_visualizacao' || c.status === 'pendente'))
      .map((c) => c.id)
  );

  // Mescla sem duplicidade usando Map
  const mapa = new Map();

  // 1. Histórico de chamados finalizados (exclui qualquer chamado ativo na fila)
  historicoChamados.forEach((c) => {
    if (!c || !c.id || idsAtivosNaFila.has(c.id)) return;
    mapa.set(c.id, { ...c, status: 'finalizado' });
  });

  // 2. Chamados da fila ativa têm precedência: preservam seu status ativo real
  chamadosAtivos.forEach((c) => {
    if (!c || !c.id) return;
    const isAtivo = c.status === 'em_andamento' || c.status === 'aguardando_visualizacao' || c.status === 'pendente';
    if (isAtivo) {
      mapa.set(c.id, { ...c, status: c.status });
    } else if (c.status === 'finalizado' || c.status === 'concluido') {
      mapa.set(c.id, { ...c, status: 'finalizado' });
    }
  });

  let chamados = Array.from(mapa.values());
  const hoje = new Date();

  // Filtro por Categoria se especificado (inclui verificação ampla em categorias e motivo)
  if (categoria && categoria !== 'todas') {
    const catLower = categoria.toLowerCase().trim();
    chamados = chamados.filter((c) => {
      const cats = Array.isArray(c.categorias) && c.categorias.length > 0
        ? c.categorias
        : (c.categoria ? [c.categoria] : (c.motivo ? c.motivo.split(',').map((s) => s.trim()) : ['Suporte']));
      return cats.some((cat) => (cat || '').toLowerCase().trim() === catLower || (cat || '').toLowerCase().includes(catLower));
    });
  }

  // Guardamos todos os chamados finalizados (sem corte do período mensal) para que a evolução dos 7 dias da semana nunca zere na virada do mês
  const todosFinalizadosSemana = chamados.filter((c) => c.status === 'finalizado' || c.status === 'concluido');

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
    const cEmail = (c.tecnico_email || c.atribuido_a || '').toLowerCase().trim();
    let colKey = null;

    if (cEmail && colaboradoresStats[cEmail]) {
      colKey = cEmail;
    } else {
      for (const email of Object.keys(colaboradoresStats)) {
        if (cEmail && (email === cEmail || email.includes(cEmail) || cEmail.includes(email))) {
          colKey = email;
          break;
        }
      }
      if (!colKey) {
        const cNome = removerAcentos((c.tecnico_nome || c.atendente || c.atendente_nome || '').toLowerCase().trim());
        if (cNome) {
          for (const [email, stat] of Object.entries(colaboradoresStats)) {
            const statNome = removerAcentos((stat.nome || '').toLowerCase().trim());
            if (statNome && (statNome === cNome || statNome.includes(cNome) || cNome.includes(statNome))) {
              colKey = email;
              break;
            }
          }
        }
      }
    }

    const atendenteFinalKey = colKey || cEmail || (c.tecnico_nome ? c.tecnico_nome.toLowerCase().trim() : null);
    if (!atendenteFinalKey) return;

    if (!colaboradoresStats[atendenteFinalKey]) {
      const nomeAmigavel = c.tecnico_nome || c.atendente_nome || (cEmail ? cEmail.split('@')[0] : 'Colaborador');
      colaboradoresStats[atendenteFinalKey] = {
        id: 'usr_' + Math.random().toString(36).substr(2, 6),
        nome: nomeAmigavel,
        email: cEmail || atendenteFinalKey,
        papel: 'suporte',
        total_chamados: 0,
        resolvidos: 0,
        em_andamento: 0,
        duracao_total_segundos: 0,
      };
    }

    colaboradoresStats[atendenteFinalKey].total_chamados += 1;
    const isResolvido = c.status === 'finalizado' || c.status === 'concluido';
    if (isResolvido) {
      colaboradoresStats[atendenteFinalKey].resolvidos += 1;
      colaboradoresStats[atendenteFinalKey].duracao_total_segundos += (c.duracao_segundos || c.tempo_ativo_segundos || 0);
    } else {
      colaboradoresStats[atendenteFinalKey].em_andamento += 1;
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

    // Usa todosFinalizadosSemana para manter os dias da semana anteriores visíveis mesmo quando o filtro estiver no 'Mês Atual'
    const count = todosFinalizadosSemana.filter((c) => {
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

export async function addEmpresaCredencial(empresaId, { rotulo, nome_usuario = '', usuario_email = '', senha = '', observacao = '', is_principal = false }, userEmail = 'admin@rmcontrole.com') {

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
            rotulo: (rotulo || '').trim() || null,
            nome_usuario: (nome_usuario || '').trim() || null,
            observacao: (observacao || '').trim() || null,
            is_principal: Boolean(is_principal),
            email_administrador: (usuario_email || '').trim() || null,
            senha_suporte: (senha || '').trim(),
            ultima_alteracao: new Date().toISOString(),
          }
        ])
        // Só o ID: a coluna da senha é cifrada e não pode ser lida de volta
        .select('id')
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
  let emp = empresas.find((e) => String(e.id) === String(empresaId));

  if (!emp && isMockDataEnabled()) {
    const mockEmp = DEFAULT_EMPRESAS_MOCK.find((e) => String(e.id) === String(empresaId));
    if (mockEmp) {
      emp = JSON.parse(JSON.stringify(mockEmp));
      empresas.unshift(emp);
    }
  }

  const novaCred = {
    id: credId,
    rotulo: (rotulo || 'Acesso Suporte').trim(),
    nome_usuario: (nome_usuario || '').trim(),
    usuario_email: (usuario_email || '').trim(),
    senha: (senha || '').trim(),
    observacao: (observacao || '').trim(),
    is_principal: Boolean(is_principal),
    ultima_alteracao: new Date().toISOString(),
  };

  if (emp) {
    if (!emp.credenciais_lista) {
      emp.credenciais_lista = [];
      if (emp.credenciais) {
        emp.credenciais_lista.push({
          id: 'cred_principal_legado',
          rotulo: 'Acesso Principal',
          usuario_email: emp.credenciais.email_administrador || '',
          senha: emp.credenciais.senha_suporte || '',
          is_principal: true,
          observacao: 'Acesso Padrão',
          ultima_alteracao: new Date().toISOString(),
        });
      }
    }
    
    // Se nova credencial for principal, remove flag das outras
    if (novaCred.is_principal) {
      emp.credenciais_lista.forEach(c => c.is_principal = false);
    }

    emp.credenciais_lista.push(novaCred);

    // Se tiver nome do colaborador, sincroniza automaticamente na lista de colaboradores da empresa
    const nomeColab = (nome_usuario || rotulo || '').trim();
    if (nomeColab && nomeColab.toLowerCase() !== 'acesso principal' && nomeColab.toLowerCase() !== 'painel admin') {
      if (!emp.colaboradores) emp.colaboradores = [];
      const jaExiste = emp.colaboradores.some(c => c.nome.toLowerCase().trim() === nomeColab.toLowerCase());
      if (!jaExiste) {
        emp.colaboradores.push({
          id: 'colab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          nome: nomeColab,
          email: (usuario_email || '').trim(),
          cargo: 'Colaborador',
          created_at: new Date().toISOString(),
        });
      }
    }

    setLocalData('empresas_reais', empresas);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('credenciais_updated'));
      window.dispatchEvent(new Event('empresas_updated'));
      window.dispatchEvent(new Event('suporte_updated'));
    }
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
      if (dados.usuario_email !== undefined) updateData.email_administrador = dados.usuario_email.trim() || null;
      if (dados.senha !== undefined) updateData.senha_suporte = dados.senha.trim();
      if (dados.rotulo !== undefined) updateData.rotulo = dados.rotulo.trim() || null;
      if (dados.nome_usuario !== undefined) updateData.nome_usuario = dados.nome_usuario.trim() || null;
      if (dados.observacao !== undefined) updateData.observacao = dados.observacao.trim() || null;
      if (dados.is_principal !== undefined) updateData.is_principal = Boolean(dados.is_principal);

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
        nome_usuario: dados.nome_usuario !== undefined ? dados.nome_usuario.trim() : (emp.credenciais_lista[idx].nome_usuario || ''),
        usuario_email: dados.usuario_email !== undefined ? dados.usuario_email.trim() : (emp.credenciais_lista[idx].usuario_email || ''),
        senha: dados.senha !== undefined ? dados.senha.trim() : (emp.credenciais_lista[idx].senha || ''),
        rotulo: dados.rotulo !== undefined ? dados.rotulo.trim() : emp.credenciais_lista[idx].rotulo,
        observacao: dados.observacao !== undefined ? dados.observacao.trim() : emp.credenciais_lista[idx].observacao,
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
  administrador: ['empresas', 'fila', 'dashboard', 'feedbacks', 'agenda', 'configuracoes', 'canais', 'servidores', 'auditoria'],
  suporte: ['empresas', 'fila', 'dashboard', 'feedbacks', 'agenda', 'configuracoes'],
  vendas: ['empresas', 'fila', 'dashboard', 'feedbacks', 'agenda', 'configuracoes'],
};

// Mesma regra do servidor (src/lib/roles.js): lista de administradores + papel em Equipe & Senhas
export function resolveUserRole(email) {
  return resolverPapel(email, getEquipeUsuarios());
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

export async function fetchEquipeUsuarios() {
  if (isSupabaseConfigured && supabase) {
    try {
      // Colunas explícitas: a senha (hash) não é legível pelo navegador
      const { data, error } = await supabase
        .from('equipe_usuarios')
        .select('id, nome, email, papel, ativo, departamentos, departamentos_bloqueados, primeiro_acesso_concluido, primeiro_acesso_data, created_at');

      if (!error && Array.isArray(data)) {
        // A equipe é EXATAMENTE o que está no banco. Antes a lista local (e uma lista fixa no código)
        // era misturada aqui: a tela mostrava Maria, Pedro e Rayane como cadastrados, mas o banco
        // não os conhecia — e por isso eles não viam nenhuma demanda.
        const local = getLocalData('equipe_usuarios', []);
        const anteriores = new Map(local.filter((u) => u?.email).map((u) => [u.email.toLowerCase().trim(), u]));
        const map = new Map();
        data.forEach((u) => {
          if (!u.email) return;
          const email = u.email.toLowerCase().trim();
          const { senha: _descartada, ...prev } = anteriores.get(email) || {};
          map.set(email, {
            ...prev,
            id: u.id,
            nome: u.nome || prev.nome || email.split('@')[0],
            email: u.email,
            papel: u.papel || prev.papel || 'suporte',
            departamentos: u.departamentos || prev.departamentos,
            departamentos_bloqueados: u.departamentos_bloqueados || prev.departamentos_bloqueados,
            ativo: u.ativo !== false,
            primeiro_acesso_concluido: u.primeiro_acesso_concluido === true,
            primeiro_acesso_data: u.primeiro_acesso_data || null,
            criado_em: u.created_at || prev.criado_em || new Date().toISOString(),
          });
        });
        const merged = Array.from(map.values());
        setLocalData('equipe_usuarios', merged);
        setLocalData('equipe_sincronizada_nuvem', true);
        return merged;
      }
    } catch (e) {
      console.warn('Erro ao sincronizar equipe_usuarios do Supabase:', e);
    }
  }
  return getEquipeUsuarios();
}

// Sem senhas: este arquivo vai para o navegador. Senhas ficam só no Supabase (hash bcrypt).
export const DEFAULT_EQUIPE_REAL = [
  { id: 'usr_1', nome: 'Lucas Amorim', email: 'admin@rmcontrole.com', papel: 'administrador', empresa_nome: 'RM Controle (Geral)', criado_em: '2026-01-01T00:00:00.000Z' },
  { id: 'usr_maria', nome: 'Maria', email: 'maria@rmchat.com', papel: 'suporte', empresa_nome: 'Todas as Empresas', criado_em: '2026-01-01T00:00:00.000Z' },
  { id: 'usr_rayane', nome: 'Rayane Nunes', email: 'rayane@rmchat.com', papel: 'suporte', empresa_nome: 'Todas as Empresas', criado_em: '2026-01-01T00:00:00.000Z' },
  { id: 'usr_pedro', nome: 'Pedro Alvarez', email: 'pedro@rmchat.com', papel: 'suporte', empresa_nome: 'Todas as Empresas', criado_em: '2026-01-01T00:00:00.000Z' },
  { id: 'usr_teste', nome: 'teste', email: 'teste@rmchat.com', papel: 'suporte', empresa_nome: 'Todas as Empresas', criado_em: '2026-01-01T00:00:00.000Z' },
];

export function getEquipeUsuarios() {
  let rawList = getLocalData('equipe_usuarios', DEFAULT_EQUIPE_REAL);

  // Com o banco já sincronizado, a lista local é espelho dele: nada de completar com a lista fixa
  const espelhoDoBanco = isSupabaseConfigured && getLocalData('equipe_sincronizada_nuvem', false);

  // Remove contas genéricas de mock se mock estiver desligado
  if (!isMockDataEnabled() && !espelhoDoBanco) {
    rawList = rawList.filter((u) => {
      const nomeLower = (u.nome || '').toLowerCase().trim();
      const emailLower = (u.email || '').toLowerCase().trim();
      if (u.id === 'usr_2' || u.id === 'usr_3') return false;
      if (nomeLower.startsWith('equipe de suporte') || nomeLower.startsWith('equipe comercial')) return false;
      if (emailLower === 'suporte@rmcontrole.com' || emailLower === 'vendas@rmcontrole.com') return false;
      return true;
    });

    // Assegura que toda a equipe principal (Lucas, Maria, Rayane, Pedro) esteja preservada
    const map = new Map();
    DEFAULT_EQUIPE_REAL.forEach((def) => map.set((def.email || '').toLowerCase().trim(), def));
    rawList.forEach((u) => {
      if (u.email) {
        const key = u.email.toLowerCase().trim();
        const base = map.get(key) || {};
        map.set(key, { ...base, ...u, empresa_nome: u.empresa_nome || base.empresa_nome || 'Todas as Empresas' });
      }
    });
    rawList = Array.from(map.values());
    setLocalData('equipe_usuarios', rawList);
  }

  // Remove senhas que versões antigas guardaram no navegador
  if (rawList.some((u) => u && u.senha !== undefined)) {
    rawList = rawList.map(({ senha, ...resto }) => resto);
    setLocalData('equipe_usuarios', rawList);
  }
  return rawList.map((u) => {
    const emailNorm = (u.email || '').toLowerCase().trim();
    // Apenas os administradores proprietários são fixados; os demais usam o papel cadastrado
    if (ADMINS_PROPRIETARIOS.includes(emailNorm)) {
      return { ...u, papel: 'administrador' };
    }
    return u;
  });
}

// Equipe é gerenciada pelo servidor (/api/equipe): ele cria o login já confirmado e grava a
// senha como hash. O navegador nunca recebe nem guarda senhas da equipe.
async function chamarApiEquipe(metodo, corpo) {
  const res = await fetch('/api/equipe', {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) throw new Error(json.mensagem || 'Sem conexão com o servidor.');
  return json;
}

function atualizarEquipeLocal(transformar) {
  const lista = transformar(getEquipeUsuarios());
  setLocalData('equipe_usuarios', lista);
  window.dispatchEvent(new Event('equipe_updated'));
  window.dispatchEvent(new Event('user_role_updated'));
  return lista;
}

export async function addEquipeUsuario({ nome, email, senha = '', papel = 'suporte', departamentos }) {
  if (!email || !email.trim()) throw new Error('E-mail é obrigatório.');
  const emailLimpo = email.trim().toLowerCase();
  const senhaFinal = (senha || '').trim() || getSenhaPadraoRedefinicao();
  if (!senhaFinal) throw new Error('Informe a senha inicial do membro.');
  if (getEquipeUsuarios().some((u) => (u.email || '').toLowerCase().trim() === emailLimpo)) {
    throw new Error('Já existe um membro cadastrado com este e-mail.');
  }

  let novo = {
    id: 'usr_' + Date.now(),
    nome: (nome || '').trim() || emailLimpo.split('@')[0],
    email: emailLimpo,
    papel: papel || 'suporte',
    criado_em: new Date().toISOString(),
  };
  if (podeFalarComServidor()) {
    const { membro } = await chamarApiEquipe('POST', { nome: novo.nome, email: emailLimpo, senha: senhaFinal, papel: novo.papel, departamentos });
    const { senha: _ignorada, ...membroSemSenha } = membro || {};
    novo = { ...novo, ...membroSemSenha, criado_em: membro?.created_at || novo.criado_em };
  }

  atualizarEquipeLocal((lista) => [...lista, novo]);
  await logAuditoria({
    usuarioEmail: emailLimpo,
    acao: 'cadastrou_novo_usuario',
    detalhes: { nome: novo.nome, email: emailLimpo, papel: novo.papel, modulo: 'Gestão de Usuários' },
  });
  return novo;
}

export async function updateEquipeUsuario(id, dados) {
  const usuarios = getEquipeUsuarios();
  const atual = usuarios.find((u) => u.id === id);
  if (!atual) return true;

  const { senha, ...semSenha } = dados || {};
  let atualizado = { ...atual, ...semSenha, papel: dados.papel || atual.papel || 'suporte' };
  if (podeFalarComServidor()) {
    const corpo = { id: isCloudId(id) ? id : undefined, email: atual.email, ...semSenha };
    if (senha && senha.trim()) corpo.senha = senha.trim();
    const { membro } = await chamarApiEquipe('PATCH', corpo);
    const { senha: _ignorada, ...membroSemSenha } = membro || {};
    atualizado = { ...atualizado, ...membroSemSenha };
  }
  atualizarEquipeLocal((lista) => lista.map((u) => (u.id === id ? atualizado : u)));

  // Mudou o próprio papel? O servidor é a autoridade; recarrega a sessão no próximo ciclo
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('equipe_updated'));
  return true;
}

export async function deleteEquipeUsuario(id) {
  const usuario = getEquipeUsuarios().find((u) => u.id === id);
  if (!usuario) return true;
  if (podeFalarComServidor()) {
    await chamarApiEquipe('DELETE', { id: isCloudId(id) ? id : undefined, email: usuario.email });
  }
  atualizarEquipeLocal((lista) => lista.filter((u) => u.id !== id));
  return true;
}

// ==============================================================================
// GESTÃO DE PRIMEIRO ACESSO / SETUP INICIAL (ONBOARDING)
// ==============================================================================
export async function isPrimeiroAcessoPendente(userEmail) {
  if (!userEmail) return false;
  const emailNorm = userEmail.toLowerCase().trim();

  // 1. Checa flag direta e individual no localStorage
  const localFlag = localStorage.getItem(`rm_primeiro_acesso_concluido_${emailNorm}`);
  if (localFlag === 'true') {
    return false;
  }

  // 2. Checa no registro da equipe local
  const equipe = getEquipeUsuarios();
  const membro = equipe.find((u) => (u.email || '').toLowerCase().trim() === emailNorm);
  if (membro && membro.primeiro_acesso_concluido === true) {
    localStorage.setItem(`rm_primeiro_acesso_concluido_${emailNorm}`, 'true');
    return false;
  }

  // 3. Checa no Supabase se configurado
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('equipe_usuarios')
        .select('primeiro_acesso_concluido')
        .eq('email', emailNorm)
        .maybeSingle();

      if (!error && data && data.primeiro_acesso_concluido === true) {
        localStorage.setItem(`rm_primeiro_acesso_concluido_${emailNorm}`, 'true');
        return false;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.primeiro_acesso_concluido === true) {
        localStorage.setItem(`rm_primeiro_acesso_concluido_${emailNorm}`, 'true');
        return false;
      }
    } catch (e) {
      console.warn('Aviso ao checar primeiro acesso no Supabase:', e);
    }
  }

  // Se nenhum registro marcou como concluído, é o primeiro acesso!
  return true;
}

export async function concluirPrimeiroAcesso(userEmail, {
  novaSenha = '',
  audioConfig = null,
  viewMode = 'list',
} = {}) {
  if (!userEmail) return false;
  const emailNorm = userEmail.toLowerCase().trim();
  const agora = new Date().toISOString();

  // 0. Nova senha: só o servidor grava, e sempre na conta da sessão atual (nunca por e-mail vindo do navegador)
  if (isSupabaseConfigured && novaSenha && novaSenha.trim()) {
    const res = await fetch('/api/auth/senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novaSenha: novaSenha.trim() }),
    }).catch(() => null);
    const dados = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !dados.ok) {
      throw new Error(dados.mensagem || 'Não foi possível salvar a nova senha. Verifique sua conexão.');
    }
  }

  // 1. Salva flags no localStorage
  localStorage.setItem(`rm_primeiro_acesso_concluido_${emailNorm}`, 'true');
  localStorage.setItem(`rm_primeiro_acesso_data_${emailNorm}`, agora);

  // 2. Aplica configurações de áudio se fornecidas
  if (audioConfig) {
    const { setAudioConfig } = await import('./audioNotifications');
    setAudioConfig(audioConfig);
  }

  // 3. Aplica modo de visualização padrão
  if (viewMode) {
    setDefaultViewMode(viewMode);
  }

  // 4. Se novaSenha fornecida, remove resíduos do storage (LGPD)
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`rm_user_password_${emailNorm}`);
    } catch (e) {}
  }

  // 5. Atualiza equipe_usuarios local
  let equipe = getEquipeUsuarios();
  const idx = equipe.findIndex((u) => (u.email || '').toLowerCase().trim() === emailNorm);
  if (idx !== -1) {
    equipe[idx] = {
      ...equipe[idx],
      primeiro_acesso_concluido: true,
      primeiro_acesso_data: agora,
    };
  } else {
    equipe.push({
      id: 'usr_' + Date.now(),
      nome: getNomeTecnico(userEmail),
      email: emailNorm,
      papel: resolverPapel(emailNorm, []),
      primeiro_acesso_concluido: true,
      primeiro_acesso_data: agora,
      criado_em: agora,
    });
  }
  setLocalData('equipe_usuarios', equipe);

  // 6. Se Supabase configurado, persiste na tabela equipe_usuarios e no Auth
  if (isSupabaseConfigured && supabase) {
    try {
      const authUpdates = {
        data: {
          primeiro_acesso_concluido: true,
          primeiro_acesso_data: agora,
        },
      };
      try {
        await supabase.auth.updateUser(authUpdates);
      } catch (authErr) {
        console.warn('Aviso ao atualizar senha no Supabase Auth:', authErr);
      }

      const updateDb = {
        primeiro_acesso_concluido: true,
        primeiro_acesso_data: agora,
      };
      await supabase
        .from('equipe_usuarios')
        .update(updateDb)
        .eq('email', emailNorm);
    } catch (e) {
      console.warn('Aviso ao registrar primeiro acesso no Supabase:', e);
    }
  }

  // 6. Registra auditoria LGPD
  await logAuditoria({
    usuarioEmail: emailNorm,
    acao: 'concluiu_primeiro_acesso_onboarding',
    detalhes: {
      email: emailNorm,
      viewMode,
      audioModo: audioConfig?.modoRepeticao,
      modulo: 'Setup Inicial do Usuário (Onboarding)',
    },
  });

  window.dispatchEvent(new Event('primeiro_acesso_concluido'));
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
/**
 * Credenciais das empresas já decifradas pelo banco (senhas ficam cifradas com AES-256).
 * Só administrador e suporte recebem a senha; vendas recebe o restante.
 * Antes da migração (função inexistente) cai na leitura direta antiga.
 */
async function lerCredenciaisNuvem(empresaId = null) {
  const res = await supabase.rpc('rm_credenciais_empresas', { p_empresa_id: empresaId });
  if (!res.error) return { data: res.data || [], error: null };
  const funcaoInexistente = res.error.code === 'PGRST202' || /function|could not find/i.test(res.error.message || '');
  if (!funcaoInexistente) return { data: [], error: res.error };
  let consulta = supabase.from('empresa_credenciais').select('*');
  if (empresaId) consulta = consulta.eq('empresa_id', empresaId);
  return consulta;
}

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
      // 1. Busca direta das empresas com RLS ativo (robusta e imune a falhas de relacionamentos filhos)
      const { data: dbEmpresas, error: errEmp } = await supabase
        .from('empresas')
        .select('*')
        .order('created_at', { ascending: false });

      if (!errEmp && dbEmpresas && dbEmpresas.length > 0) {
        // Busca paralela e tolerante a falhas das tabelas filhas
        const [resCanais, resCreds, resObs, resCheck, resCat] = await Promise.allSettled([
          supabase.from('empresa_canais').select('*'),
          lerCredenciaisNuvem(),
          supabase.from('empresa_observacoes').select('*'),
          supabase.from('empresa_checklist').select('*'),
          supabase.from('canais_catalogo').select('*'),
        ]);

        const canaisAll = resCanais.status === 'fulfilled' && resCanais.value.data ? resCanais.value.data : [];
        const credsAll = resCreds.status === 'fulfilled' && resCreds.value.data ? resCreds.value.data : [];
        const obsAll = resObs.status === 'fulfilled' && resObs.value.data ? resObs.value.data : [];
        const checkAll = resCheck.status === 'fulfilled' && resCheck.value.data ? resCheck.value.data : [];
        const catAll = resCat.status === 'fulfilled' && resCat.value.data ? resCat.value.data : [];

        const catMap = new Map();
        catAll.forEach((c) => catMap.set(c.id, c));

        empresas = dbEmpresas.map((emp) => {
          const empCanais = canaisAll.filter((c) => c.empresa_id === emp.id);
          const empCreds = credsAll.filter((c) => c.empresa_id === emp.id);
          const empObs = obsAll.filter((c) => c.empresa_id === emp.id);
          const empCheck = checkAll.filter((c) => c.empresa_id === emp.id);

          const principalCred = empCreds[0] || null;
          const emailAdm = principalCred?.email_administrador || principalCred?.usuario_email || emp.email_administrador || '';

          return {
            ...emp,
            is_mock: false,
            servidor_alocado: emp.servidor_alocado || 'servidor_1',
            email_administrador: emailAdm,
            credenciais: principalCred ? {
              id: principalCred.id,
              email_administrador: emailAdm,
              senha_suporte: principalCred.senha_suporte || principalCred.senha || '',
            } : (emailAdm ? { email_administrador: emailAdm, senha_suporte: '' } : null),
            canais: empCanais.map((c) => {
              const cat = catMap.get(c.canal_id);
              return {
                id: c.id,
                canal_id: c.canal_id,
                nome: c.nome || cat?.nome || 'Canal de Comunicação',
                tipo: c.tipo || cat?.tipo || 'api',
                identificador_numero: c.identificador_numero || '',
                status: c.status || 'ativo',
                observacao: c.observacao || '',
              };
            }),
            observacoes: empObs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
            credenciais_lista: empCreds.map((cr) => ({
              id: cr.id,
              rotulo: cr.rotulo || cr.nome_usuario || 'Acesso',
              nome_usuario: cr.nome_usuario || '',
              is_principal: Boolean(cr.is_principal),
              usuario_email: cr.email_administrador || cr.usuario_email || '',
              email_administrador: cr.email_administrador || cr.usuario_email || '',
              senha: cr.senha_suporte || cr.senha || '',
              senha_suporte: cr.senha_suporte || cr.senha || '',
              observacao: cr.observacao || '',
              ultima_alteracao: cr.ultima_alteracao || cr.created_at,
            })),
            checklist: empCheck.map((chk) => ({
              id: chk.id,
              titulo: chk.titulo,
              descricao: chk.descricao || '',
              categoria: chk.categoria || 'Infraestrutura',
              concluido: !!chk.concluido,
              observacao: chk.observacao || '',
            })),
          };
        });

        if (empresas.length > 0) {
          setLocalData('empresas_reais', empresas);
        }
      } else if (errEmp) {
        console.warn('Aviso ao consultar empresas no Supabase:', errEmp);
      }
    } catch (e) {
      console.warn('Recorrendo ao armazenamento local para listar empresas:', e);
    }
  }

  // O Supabase é a fonte oficial da verdade; não reinserir dados legados repetidamente.

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
// ------------------------------------------------------------------------------
// Tipo de cliente: "novo" (implantação começa agora, setup em 0%) ou "existente"
// (já era cliente antes do RM Controle, setup em 100%) + data de início do cliente
// ------------------------------------------------------------------------------
export const TIPOS_CLIENTE = {
  novo: 'Cliente novo',
  existente: 'Cliente já existente',
};

function normalizarTipoCliente(tipo) {
  return tipo === 'existente' ? 'existente' : 'novo';
}

function normalizarDataCliente(data) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(String(data))) return hoje;
  return String(data) > hoje ? hoje : String(data);
}

function itensChecklistIniciais(templateChecklist, tipoCliente) {
  const existente = tipoCliente === 'existente';
  return templateChecklist.map((item) => ({
    titulo: item.titulo,
    concluido: existente,
    observacao: existente ? 'Cliente já implantado antes do RM Controle' : '',
  }));
}

// Insere empresas tentando as colunas novas (tipo_cliente, cliente_desde) e recuando se o schema não as tiver
async function inserirEmpresasNuvem(linhas) {
  let resultado = await supabase.from('empresas').insert(linhas).select();
  if (resultado.error && isErroColunaInexistente(resultado.error)) {
    const semExtras = linhas.map(({ tipo_cliente, cliente_desde, ...resto }) => resto);
    resultado = await supabase.from('empresas').insert(semExtras).select();
  }
  return resultado;
}

export async function createEmpresa({
  nome,
  formato_atendimento = 'colaborativo',
  servidor_alocado = 'servidor_1',
  email_administrador = '',
  senha_suporte = '',
  canaisIniciais = [],
  tipo_cliente = 'novo',
  cliente_desde = null,
  userEmail = 'admin@rmcontrole.com'
}) {
  const trimmedNome = (nome || '').trim();
  if (!trimmedNome) throw new Error('O nome da empresa é obrigatório.');
  const tipoCliente = normalizarTipoCliente(tipo_cliente);
  const clienteDesde = normalizarDataCliente(cliente_desde);

  const templateChecklist = getServerChecklistTemplate();
  let empresaId = null;
  let createdDbEmpresa = null;

  // Avisos de etapas complementares que falharam (a empresa em si foi criada)
  const avisos = [];

  // 1. Com Supabase configurado a empresa SÓ existe se o banco gravar. Antes, qualquer erro
  //    inesperado (inclusive "empresa já cadastrada") era engolido e o app criava uma empresa
  //    apenas neste navegador, invisível para o resto da equipe.
  if (isSupabaseConfigured && supabase) {
    // Validação anti-duplicação: impede cadastrar duas empresas com o mesmo nome
    const { data: existente, error: erroBusca } = await supabase
      .from('empresas')
      .select('id, nome')
      .ilike('nome', trimmedNome)
      .limit(1);
    if (erroBusca) throw new Error(`Não foi possível verificar empresas existentes: ${erroBusca.message}`);
    if (existente && existente.length > 0) {
      throw new Error(`A empresa "${trimmedNome}" já está cadastrada no sistema.`);
    }

    const { data: dbLista, error: dbErr } = await inserirEmpresasNuvem([
      {
        nome: trimmedNome,
        formato_atendimento: formato_atendimento || 'colaborativo',
        servidor_alocado: servidor_alocado || 'servidor_1',
        ativo: true,
        tipo_cliente: tipoCliente,
        cliente_desde: clienteDesde,
      },
    ]);
    const dbEmp = Array.isArray(dbLista) ? dbLista[0] : dbLista;
    if (dbErr || !dbEmp?.id) {
      throw new Error(`Falha ao cadastrar empresa no Supabase: ${dbErr?.message || 'o banco não retornou a empresa criada'}`);
    }
    createdDbEmpresa = dbEmp;
    empresaId = dbEmp.id;

    // Acesso do administrador: só o que a pessoa informou (nada de e-mail ou senha inventados).
    // O banco cifra a senha.
    const emailAdm = (email_administrador || '').trim();
    const senhaSup = (senha_suporte || '').trim();
    if (emailAdm || senhaSup) {
      const { error: erroCred } = await supabase.from('empresa_credenciais').insert([
        {
          empresa_id: empresaId,
          rotulo: 'Acesso do Administrador',
          email_administrador: emailAdm || null,
          senha_suporte: senhaSup,
          is_principal: true,
          ultima_alteracao: new Date().toISOString(),
        },
      ]);
      if (erroCred) avisos.push(`acesso do administrador não salvo (${erroCred.message})`);
    }

    // Checklist de setup (0% para cliente novo, 100% para já existente)
    if (templateChecklist && templateChecklist.length > 0) {
      const chkInserts = itensChecklistIniciais(templateChecklist, tipoCliente).map((item) => ({ empresa_id: empresaId, ...item }));
      const { error: erroChk } = await supabase.from('empresa_checklist').insert(chkInserts);
      if (erroChk) avisos.push(`checklist de setup não criado (${erroChk.message})`);
    }

    // Canais iniciais válidos
    const canaisInserts = (canaisIniciais || [])
      .filter((c) => isCloudId(c.canal_id))
      .map((c) => ({
        empresa_id: empresaId,
        canal_id: c.canal_id,
        identificador_numero: c.identificador_numero || '',
        status: c.status || 'ativo',
        observacao: c.observacao || '',
      }));
    if (canaisInserts.length > 0) {
      const { error: erroCanais } = await supabase.from('empresa_canais').insert(canaisInserts);
      if (erroCanais) avisos.push(`canais não vinculados (${erroCanais.message})`);
    }
  }

  if (!empresaId) {
    // Apenas sem Supabase configurado (modo local/demonstração)
    empresaId = 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  const novaEmpresa = {
    id: empresaId,
    nome: trimmedNome,
    formato_atendimento: 'colaborativo',
    servidor_alocado,
    ativo: true,
    is_mock: false,
    tipo_cliente: tipoCliente,
    cliente_desde: clienteDesde,
    created_at: createdDbEmpresa?.created_at || new Date().toISOString(),
    canais: canaisIniciais,
    observacoes: [],
    credenciais_lista: ((email_administrador || '').trim() || (senha_suporte || '').trim())
      ? [
          {
            id: 'cred_' + Date.now(),
            rotulo: 'Acesso do Administrador',
            usuario_email: (email_administrador || '').trim(),
            senha: (senha_suporte || '').trim(),
            is_principal: true,
            observacao: '',
            ultima_alteracao: new Date().toISOString(),
          },
        ]
      : [],
    checklist: templateChecklist.map((item) => ({
      id: 'chk_inst_' + Math.random().toString(36).substr(2, 7),
      titulo: item.titulo,
      descricao: item.descricao,
      categoria: item.categoria,
      ...itensChecklistIniciais([item], tipoCliente)[0],
    })),
  };

  const empresasReais = getLocalData('empresas_reais', []);
  empresasReais.unshift(novaEmpresa);
  setLocalData('empresas_reais', empresasReais);

  await logAuditoria({
    empresaId: novaEmpresa.id,
    usuarioEmail: userEmail,
    acao: 'cadastrou_empresa_manual',
    detalhes: { nome: trimmedNome, servidor_alocado, tipo_cliente: tipoCliente, cliente_desde: clienteDesde, modulo: 'Gestão de Empresas' },
  });

  novaEmpresa.avisos = avisos;
  return novaEmpresa;
}

export async function createEmpresasEmMassa(items, { formato_atendimento = 'colaborativo', servidor_alocado = 'servidor_1', tipo_cliente = 'novo', cliente_desde = null, userEmail = 'admin@rmcontrole.com' } = {}) {
  const tipoCliente = normalizarTipoCliente(tipo_cliente);
  const clienteDesde = normalizarDataCliente(cliente_desde);
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
        // Antes o servidor escolhido não era gravado: os demais colaboradores viam tudo no Servidor 1
        servidor_alocado: servidor_alocado || 'servidor_1',
        ativo: true,
        tipo_cliente: tipoCliente,
        cliente_desde: clienteDesde,
      }));

      const { data: dbEmpresas, error } = await inserirEmpresasNuvem(inserts);

      if (error) {
        console.error('Erro ao cadastrar empresas em lote no Supabase:', error);
        throw new Error('Falha ao cadastrar empresas no Supabase: ' + error.message);
      }

      if (dbEmpresas && dbEmpresas.length > 0) {
        for (let i = 0; i < dbEmpresas.length; i++) {
          const emp = dbEmpresas[i];
          const infoOriginal = empresasNormalizadas[i] || {};
          const emailAdm = (infoOriginal.email_administrador || '').trim();
          const senhaSup = (infoOriginal.senha_suporte || '').trim();

          try {
            if (emailAdm || senhaSup) {
              await supabase.from('empresa_credenciais').insert([
                {
                  empresa_id: emp.id,
                  rotulo: 'Acesso do Administrador',
                  email_administrador: emailAdm || null,
                  senha_suporte: senhaSup,
                  is_principal: true,
                  ultima_alteracao: new Date().toISOString(),
                }
              ]);
            }
            if (templateChecklist.length > 0) {
              const chkInserts = itensChecklistIniciais(templateChecklist, tipoCliente).map((item) => ({
                empresa_id: emp.id,
                ...item,
              }));
              await supabase.from('empresa_checklist').insert(chkInserts);
            }
          } catch (e) {
            console.warn('Etapa complementar da empresa em lote não concluída:', e);
          }

          const novaObj = {
            id: emp.id,
            nome: emp.nome,
            formato_atendimento: 'colaborativo',
            servidor_alocado,
            ativo: true,
            is_mock: false,
            tipo_cliente: tipoCliente,
            cliente_desde: clienteDesde,
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
              ...itensChecklistIniciais([item], tipoCliente)[0],
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
      // Com Supabase configurado, nunca cai no cadastro só local (ficaria invisível para a equipe)
      console.warn('Erro ao inserir empresas em massa no Supabase:', e);
      throw e.message?.includes('Supabase') ? e : new Error(`Falha ao cadastrar empresas no Supabase: ${e.message}`);
    }
  }

  for (const empItem of empresasNormalizadas) {
    const emailAdm = (empItem.email_administrador || '').trim();
    const senhaSup = (empItem.senha_suporte || '').trim();

    const nova = {
      id: 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      nome: empItem.nome,
      formato_atendimento: 'colaborativo',
      servidor_alocado,
      ativo: true,
      is_mock: false,
      tipo_cliente: tipoCliente,
      cliente_desde: clienteDesde,
      created_at: new Date().toISOString(),
      canais: [],
      observacoes: [],
      credenciais_lista: (emailAdm || senhaSup)
        ? [
            {
              id: 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              rotulo: 'Acesso do Administrador',
              usuario_email: emailAdm,
              senha: senhaSup,
              is_principal: true,
              observacao: '',
              ultima_alteracao: new Date().toISOString(),
            },
          ]
        : [],
      checklist: templateChecklist.map((item) => ({
        id: 'chk_inst_' + Math.random().toString(36).substr(2, 7),
        titulo: item.titulo,
        descricao: item.descricao,
        categoria: item.categoria,
        ...itensChecklistIniciais([item], tipoCliente)[0],
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
          checklist:empresa_checklist(*)
        `)
        .eq('id', id)
        .single();

      if (!error && data) {
        // Credenciais vêm da função que decifra (a coluna da senha não é legível diretamente)
        const { data: credenciais } = await lerCredenciaisNuvem(id);
        data.credenciais = credenciais || [];
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
    const updatePayload = {
      updated_at: new Date().toISOString(),
    };
    if (dados.nome !== undefined) updatePayload.nome = dados.nome;
    if (dados.formato_atendimento !== undefined) updatePayload.formato_atendimento = dados.formato_atendimento;
    if (dados.servidor_alocado !== undefined) updatePayload.servidor_alocado = dados.servidor_alocado;
    if (dados.ativo !== undefined) updatePayload.ativo = dados.ativo;
    if (dados.tipo_cliente !== undefined) updatePayload.tipo_cliente = normalizarTipoCliente(dados.tipo_cliente);
    if (dados.cliente_desde !== undefined) updatePayload.cliente_desde = normalizarDataCliente(dados.cliente_desde);

    // Antes o erro era ignorado: a tela confirmava a troca de servidor mesmo quando o banco recusava,
    // e os demais colaboradores continuavam vendo o valor antigo.
    const { data, error } = await supabase.from('empresas').update(updatePayload).eq('id', id).select('id');
    if (error) {
      if (isErroColunaInexistente(error) && ('tipo_cliente' in updatePayload || 'cliente_desde' in updatePayload)) {
        throw new Error('O banco ainda não tem os campos "tipo de cliente" e "cliente desde". Rode a migração supabase/migration_consistencia_empresas.sql.');
      }
      throw new Error(`Não foi possível salvar a empresa no servidor: ${error.message}`);
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('O servidor não confirmou a alteração da empresa (sem permissão para editar empresas).');
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

/**
 * Exclusão definitiva de empresa. No banco quem decide é o servidor (/api/empresas/excluir):
 * confere a senha de quem está excluindo, o nome digitado e registra a auditoria.
 */
export async function excluirEmpresa(id, { senha, confirmacaoNome }) {
  if (isSupabaseConfigured && supabase && isCloudId(id)) {
    let resposta;
    try {
      resposta = await fetch('/api/empresas/excluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ empresaId: id, senha, confirmacaoNome }),
      });
    } catch {
      throw new Error('Sem conexão com o servidor. Tente de novo.');
    }
    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !json.ok) throw new Error(json.mensagem || 'Não foi possível excluir a empresa.');
  }

  setLocalData('empresas_reais', getLocalData('empresas_reais', []).filter((e) => e.id !== id));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('empresas_updated'));
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
  if (isSupabaseConfigured && supabase && isCloudId(itemId)) {
    const updateData = {};
    if (concluido !== undefined) {
      updateData.concluido = concluido;
      updateData.concluido_em = concluido ? new Date().toISOString() : null;
      updateData.concluido_por = userEmail;
    }
    if (observacao !== undefined) updateData.observacao = observacao;
    const { data, error } = await supabase.from('empresa_checklist').update(updateData).eq('id', itemId).select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(`Não foi possível atualizar o checklist: ${error?.message || 'sem permissão'}`);
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

// ==============================================================================
// BASE DE CONHECIMENTO & SOLUÇÕES DE SUPORTE ("COMO RESOLVER CHAMADOS")
// ==============================================================================
const DEFAULT_SOLUCOES = [];

// Procedimentos Padrão Reais do RM Controle (Base de Conhecimento Autêntica)
export const PROCEDIMENTOS_PADRAO_SUPORTE = [
  {
    id: 'proc_login_desbloqueio',
    titulo: 'Redefinição de Senha e Liberação de Acesso de Operador',
    modulo: 'Acessos & Segurança',
    tipo: 'Acesso e Permissão',
    erro_codigo: 'AUTH_LOCK_01',
    tags: ['login', 'senha', 'bloqueio', 'acesso', 'permissao'],
    contexto: 'Usuário não consegue logar ou teve acesso bloqueado por tentativas incorretas.',
    solucao_passos: '1. Acesse o painel de Acessos Técnicos da empresa.\n2. Localize a credencial do operador ou crie uma nova com cargo correto.\n3. Clique em redefinir senha e defina uma senha forte ou use a senha padrão da empresa.\n4. Solicite ao operador efetuar login na URL do servidor alocado correspondente.\n5. Se o erro persistir, verifique se a conta não está desativada no cadastro geral.',
    created_at: '2026-09-01T10:00:00Z',
    is_mock: false,
  },
  {
    id: 'proc_qrcode_reconexao',
    titulo: 'Reconexão e Pareamento de Canal WhatsApp / QR Code',
    modulo: 'Canais de Atendimento',
    tipo: 'Instância Desconectada',
    erro_codigo: 'WABA_DISC_02',
    tags: ['whatsapp', 'qrcode', 'desconectado', 'pareamento', 'instancia'],
    contexto: 'Canal WhatsApp desconectou do aparelho ou a sessão foi expirada pelo Meta.',
    solucao_passos: '1. No menu lateral, acesse Canais de Atendimento da empresa.\n2. Localize a instância afetada e clique em Reiniciar Instância.\n3. Aguarde 5 segundos até o QR Code ser gerado na tela.\n4. No celular do cliente, abra o WhatsApp > Aparelhos Conectados > Conectar um aparelho.\n5. Aponte a câmera para o QR Code até o status mudar para Conectado.',
    created_at: '2026-09-02T11:00:00Z',
    is_mock: false,
  },
  {
    id: 'proc_gateway_timeout',
    titulo: 'Falha de Conexão com Gateway / Timeout de API',
    modulo: 'Infraestrutura & Rede',
    tipo: 'Timeout de API',
    erro_codigo: 'NET_TIMEOUT_504',
    tags: ['timeout', 'api', 'gateway', 'servidor', 'lentidao', 'rede'],
    contexto: 'Mensagens ou requisições retornando timeout 504 no servidor.',
    solucao_passos: '1. Verifique se o Servidor Alocado (Servidor 1 ou 2) está online clicando no link direto em nova aba.\n2. Em Configurações do Servidor, verifique o checklist de monitoramento de portas.\n3. Teste o endpoint de health check do gateway.\n4. Se necessário, acione o reinício do serviço de fila Redis/RabbitMQ.\n5. Oriente o operador a reenviar as mensagens pendentes após a estabilização.',
    created_at: '2026-09-03T12:00:00Z',
    is_mock: false,
  },
  {
    id: 'proc_impressora_spooler',
    titulo: 'Erro de Impressão, Comunicação com Spooler ou Etiqueta',
    modulo: 'Periféricos & PDV',
    tipo: 'Impressão e Hardware',
    erro_codigo: 'PRINT_ERR_04',
    tags: ['impressora', 'spooler', 'etiqueta', 'pdv', 'fiscal', 'driver'],
    contexto: 'Documentos, cupons ou etiquetas travados na fila de impressão do sistema.',
    solucao_passos: '1. No computador do operador, pressione Windows + R e digite services.msc.\n2. Localize o serviço "Spooler de Impressão" e selecione "Reiniciar".\n3. Na pasta C:\\Windows\\System32\\spool\\PRINTERS, exclua arquivos temporários com a impressora pausada.\n4. Reinicie o Spooler e reabra a aplicação de impressão.\n5. Imprima uma página de teste para confirmar a comunicação física USB ou de rede.',
    created_at: '2026-09-04T14:00:00Z',
    is_mock: false,
  },
  {
    id: 'proc_db_sync_cache',
    titulo: 'Sincronização de Banco de Dados e Limpeza de Cache Local',
    modulo: 'Banco de Dados',
    tipo: 'Sincronização',
    erro_codigo: 'DB_SYNC_05',
    tags: ['banco', 'cache', 'sincronizacao', 'dados', 'atualizacao'],
    contexto: 'Dados alterados no sistema não refletem no painel do suporte ou na tela da empresa.',
    solucao_passos: '1. No navegador do cliente, execute uma limpeza profunda de cache com Ctrl + Shift + R (ou Cmd + Shift + R no Mac).\n2. Verifique se há pendências no armazenamento local (localStorage/IndexedDB).\n3. Em Configurações Gerais, clique em sincronizar dados.\n4. Verifique a latência de conexão com o banco de dados principal.\n5. Confirme se as atualizações foram persistidas na tabela de auditoria.',
    created_at: '2026-09-05T15:00:00Z',
    is_mock: false,
  }
];

export function getSolucoesSuporte({ empresa_id = null, query = '', tag = '', tipo = '' } = {}) {
  let base = getLocalData('solucoes_suporte', []);
  if (!Array.isArray(base)) base = [];

  // 1. Extração dinâmica das resoluções REAIS cadastradas nos chamados (suporte_chamados e historico_chamados)
  const historicoChamados = getLocalData('historico_chamados', []) || [];
  const chamadosAtivos = getLocalData('chamados_suporte', []) || [];
  const todosChamados = [...historicoChamados, ...chamadosAtivos];

  const chamadosComResolucao = todosChamados.filter((c) => {
    if (!c) return false;
    const textoResolucao = (c.observacoes || c.resolucao || '').trim();
    return Boolean(textoResolucao);
  });

  const solucoesDeChamados = chamadosComResolucao.map((c) => {
    const passos = (c.observacoes || c.resolucao || '').trim();
    const tituloFinal = c.motivo ? c.motivo.trim() : 'Procedimento Técnico Real';
    return {
      id: 'sol_chamado_' + c.id,
      chamado_id: c.id,
      empresa_id: c.empresa_id || null,
      empresa_nome: c.empresa_nome || 'Empresa',
      titulo: tituloFinal,
      erro_codigo: '',
      tipo_erro: c.motivo || 'Suporte Concluído',
      solucao_passos: passos,
      contexto: `Resolução aplicada por ${c.atendente || c.tecnico_nome || 'atendente'} no chamado de ${c.empresa_nome || 'cliente'}.`,
      tags: Array.isArray(c.etiquetas) && c.etiquetas.length > 0 ? c.etiquetas : [c.motivo, c.empresa_nome].filter(Boolean),
      autor_email: c.tecnico_email || '',
      created_at: c.finalizado_em || c.iniciado_em || c.created_at || new Date().toISOString(),
      is_user_created: true,
      is_mock: false,
    };
  });

  // 2. Mescla procedimentos criados manualmente e procedimentos oriundos dos chamados
  let todas = [...solucoesDeChamados, ...base.filter((s) => s.is_user_created)];

  // Apenas inclui mocks se o usuário explicitamente ativou dados simulados (Mock Dev)
  if (isMockDataEnabled()) {
    todas = [...todas, ...PROCEDIMENTOS_PADRAO_SUPORTE];
  }

  // 3. Deduplicação estrita por título e texto do procedimento
  const vistas = new Set();
  const baseDeduplicada = [];
  for (const s of todas) {
    if (!s) continue;
    const chave = `${(s.titulo || '').toLowerCase().trim()}___${(s.solucao_passos || '').toLowerCase().trim()}`;
    if (!vistas.has(chave)) {
      vistas.add(chave);
      baseDeduplicada.push(s);
    }
  }
  todas = baseDeduplicada;

  // BANCO GLOBAL DE SOLUÇÕES: Todas as empresas têm acesso a todas as soluções cadastradas
  // Se empresa_id for informado, marcamos is_empresa_atual para priorizar na ordenação, mas NUNCA ocultamos procedimentos de outros clientes
  todas = todas.map((s) => ({
    ...s,
    is_empresa_atual: empresa_id ? Boolean(s.empresa_id === empresa_id) : true,
  }));

  // Ordenação inteligente: prioriza os procedimentos da empresa aberta atualmente no topo, seguidos por todos os demais procedimentos por data
  todas.sort((a, b) => {
    if (empresa_id) {
      if (a.is_empresa_atual && !b.is_empresa_atual) return -1;
      if (!a.is_empresa_atual && b.is_empresa_atual) return 1;
    }
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  // Filtro por Tipo de Demanda / Erro
  if (tipo && tipo !== 'todos') {
    const t = tipo.toLowerCase().trim();
    todas = todas.filter((s) => (s.tipo_erro || s.tipo || '').toLowerCase().trim().includes(t));
  }

  // Filtro por Tag
  if (tag && tag !== 'todas') {
    const tg = tag.toLowerCase().trim();
    todas = todas.filter((s) => s.tags?.some((t) => (t || '').toLowerCase().trim() === tg));
  }

  // Busca textual Inteligente insensível a acentuação e maiúsculas/minúsculas
  if (query && query.trim()) {
    const q = removerAcentos(query);
    todas = todas.filter((s) => {
      const matchTitulo = removerAcentos(s.titulo || '').includes(q);
      const matchCodigo = removerAcentos(s.erro_codigo || '').includes(q);
      const matchContexto = removerAcentos(s.contexto || '').includes(q);
      const matchPassos = removerAcentos(s.solucao_passos || '').includes(q);
      const matchEmpresa = removerAcentos(s.empresa_nome || '').includes(q);
      const matchTags = s.tags?.some((t) => removerAcentos(t || '').includes(q));
      return matchTitulo || matchCodigo || matchContexto || matchPassos || matchEmpresa || matchTags;
    });
  }

  return todas;
}

function linhaSolucao(s) {
  return {
    empresa_id: isCloudId(s.empresa_id) ? s.empresa_id : null,
    empresa_nome: s.empresa_nome || 'Global',
    titulo: s.titulo,
    erro_codigo: s.erro_codigo || '',
    contexto: s.contexto || '',
    tipo_erro: s.tipo_erro || 'Suporte Geral',
    solucao_passos: s.solucao_passos,
    tags: Array.isArray(s.tags) ? s.tags : [],
    autor_email: s.autor_email || null,
  };
}

/** Baixa a base de soluções da equipe; na primeira vez, envia as soluções criadas só aqui. */
export async function fetchSolucoesSuporte() {
  if (!podeUsarTabelas()) return getLocalData('solucoes_suporte', []);
  const { data, error } = await supabase.from('solucoes_suporte').select('*').order('created_at', { ascending: false }).limit(2000);
  if (error || !Array.isArray(data)) return getLocalData('solucoes_suporte', []);
  let lista = data;
  const assinatura = (x) => `${(x.titulo || '').toLowerCase().trim()}|${(x.solucao_passos || '').toLowerCase().trim()}`;
  const existentes = new Set(data.map(assinatura));
  const legados = getLocalData('solucoes_suporte', []).filter(
    (x) => x && x.is_user_created && !isCloudId(x.id) && x.titulo && x.solucao_passos && !existentes.has(assinatura(x))
  );
  if (legados.length > 0) {
    const { data: enviados } = await supabase.from('solucoes_suporte').insert(legados.map(linhaSolucao)).select('*');
    if (Array.isArray(enviados)) lista = [...enviados, ...data];
  }
  setLocalData('solucoes_suporte', lista.map((x) => ({ ...x, is_user_created: true, tags: x.tags || [] })));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('solucoes_updated'));
  return getLocalData('solucoes_suporte', []);
}

export async function addSolucaoSuporte({
  empresa_id = null,
  empresa_nome = 'Global',
  titulo,
  erro_codigo = '',
  contexto = '',
  tipo_erro = 'Suporte Geral',
  solucao_passos,
  tags = [],
  userEmail = 'admin@rmcontrole.com'
}) {
  if (!titulo || !titulo.trim()) throw new Error('O título do problema/solução é obrigatório.');
  if (!solucao_passos || !solucao_passos.trim()) throw new Error('O passo a passo da solução é obrigatório.');

  const solucoes = getLocalData('solucoes_suporte', DEFAULT_SOLUCOES);
  const tagsLimpos = Array.isArray(tags) 
    ? tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
    : String(tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

  const nova = {
    id: 'sol_usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    is_user_created: true,
    empresa_id: empresa_id || null,
    empresa_nome: (empresa_nome || 'Global').trim(),
    titulo: titulo.trim(),
    erro_codigo: (erro_codigo || '').trim().toUpperCase(),
    contexto: (contexto || '').trim(),
    tipo_erro: (tipo_erro || 'Suporte Geral').trim(),
    solucao_passos: solucao_passos.trim(),
    tags: tagsLimpos,
    autor_email: userEmail,
    created_at: new Date().toISOString(),
  };

  // Verifica duplicidade exata antes de adicionar
  const duplicada = solucoes.find(
    (s) => (s.empresa_id === nova.empresa_id) &&
           (s.titulo.toLowerCase().trim() === nova.titulo.toLowerCase().trim()) &&
           (s.solucao_passos.toLowerCase().trim() === nova.solucao_passos.toLowerCase().trim())
  );

  if (duplicada) {
    duplicada.erro_codigo = nova.erro_codigo || duplicada.erro_codigo;
    duplicada.contexto = nova.contexto || duplicada.contexto;
    setLocalData('solucoes_suporte', solucoes);
    window.dispatchEvent(new Event('solucoes_updated'));
    return duplicada;
  }

  // Base compartilhada: grava no Supabase antes de confirmar
  if (podeUsarTabelas()) {
    const { data, error } = await supabase
      .from('solucoes_suporte')
      .insert([linhaSolucao(nova)])
      .select('id, created_at')
      .single();
    if (error) throw new Error(`Não foi possível salvar a solução para a equipe: ${error.message}`);
    nova.id = data.id;
    nova.created_at = data.created_at;
  }

  solucoes.unshift(nova);
  setLocalData('solucoes_suporte', solucoes);

  await logAuditoria({
    empresaId: empresa_id,
    usuarioEmail: userEmail,
    acao: 'adicionou_solucao_base_conhecimento',
    detalhes: { titulo: nova.titulo, erro_codigo: nova.erro_codigo, modulo: 'Base de Conhecimento' },
  });

  window.dispatchEvent(new Event('solucoes_updated'));
  return nova;
}

export async function deleteSolucaoSuporte(id, userEmail = 'admin@rmcontrole.com') {
  if (podeUsarTabelas() && isCloudId(id)) {
    const { data, error } = await supabase.from('solucoes_suporte').delete().eq('id', id).select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(`Não foi possível excluir a solução: ${error?.message || 'apenas o autor ou um administrador pode excluir'}`);
    }
  }
  let solucoes = getLocalData('solucoes_suporte', DEFAULT_SOLUCOES);
  solucoes = solucoes.filter((s) => s.id !== id);
  setLocalData('solucoes_suporte', solucoes);

  await logAuditoria({
    empresaId: null,
    usuarioEmail: userEmail,
    acao: 'excluiu_solucao_base_conhecimento',
    detalhes: { id, modulo: 'Base de Conhecimento' },
  });

  window.dispatchEvent(new Event('solucoes_updated'));
  return true;
}

// ==============================================================================
// CONFIGURAÇÕES DO SERVIDOR: PADRÃO GLOBAL VS PERSONALIZADO POR EMPRESA
// ==============================================================================
export const CONFIG_SERVIDOR_PADRAO_GLOBAL = {
  versao_stack: 'RM Stack v3.4 (Ubuntu 22.04 LTS)',
  portas_padrao: [
    { servico: 'SSH Seguro (Hardened)', porta: '2222', protocolo: 'TCP' },
    { servico: 'HTTP / HTTPS (Let\'s Encrypt)', porta: '80 / 443', protocolo: 'TCP' },
    { servico: 'Engine Mensageria (API)', porta: '8080', protocolo: 'TCP' },
    { servico: 'PostgreSQL Database', porta: '5432', protocolo: 'TCP (Interno)' },
    { servico: 'Redis Cache & Queue', porta: '6379', protocolo: 'TCP (Interno)' },
  ],
  diretrizes_obrigatorias: [
    'Firewall UFW ativado bloqueando todas as portas exceto 2222, 80 e 443 externamente.',
    'Autenticação SSH restrita exclusivamente a chaves Ed25519 (senha desabilitada).',
    'Fail2ban ativo com banimento automático de 24h após 5 tentativas inválidas.',
    'Docker Compose com restart: unless-stopped e isolamento de rede virtual.',
    'Dump automatizado do banco de dados diário às 03:00 com criptografia AES-256.',
  ],
  recursos_minimos_vps: '4 vCPU, 8 GB RAM, 80 GB SSD NVMe, 1 Gbps Link.',
};


export function getServidorConfigPadrao() {
  return getLocalData('servidor_config_padrao', CONFIG_SERVIDOR_PADRAO_GLOBAL);
}

export function setServidorConfigPadrao(config) {
  const anterior = getServidorConfigPadrao();
  setLocalData('servidor_config_padrao', config);
  window.dispatchEvent(new Event('servidor_config_updated'));
  persistirConfigGlobal('servidor_config_padrao', config, () => {
    setLocalData('servidor_config_padrao', anterior);
    window.dispatchEvent(new Event('servidor_config_updated'));
  });
}

// Itens fixos que versões antigas colocavam em todo servidor (nunca cadastrados pela equipe)
const ID_CHECKLIST_SERVIDOR_LEGADO = /^chk_srv_\d+$/;
function semItensLegados(lista) {
  return (Array.isArray(lista) ? lista : []).filter((i) => i && !ID_CHECKLIST_SERVIDOR_LEGADO.test(String(i.id || '')));
}

// Checklist inicial do servidor: só o que a equipe cadastrou no modelo (Configurações › Servidores)
function checklistServidorInicial() {
  const modelo = isMockDataEnabled() ? getServerChecklistTemplate() : getLocalData('server_checklist_template', []);
  return (modelo || []).map((item) => ({
    id: item.id,
    titulo: item.titulo,
    desc: item.descricao || item.desc || '',
    obrigatorio: item.obrigatorio !== false,
    concluido: false,
    concluido_em: null,
    responsavel: null,
  }));
}

export function getEmpresaServidorDetalhes(empresaId) {
  if (!empresaId) return null;
  const key = 'servidor_empresa_' + empresaId;
  const dados = getLocalData(key, {
    servidor_alocado: 'servidor_1',
    ip_personalizado: '',
    porta_ssh: '2222',
    observacoes_infra: '',
    peculiaridades: '',
    config_personalizada: '',
    checklist_implementacao: checklistServidorInicial(),
  });
  return { ...dados, checklist_implementacao: semItensLegados(dados.checklist_implementacao) };
}

const CAMPOS_SERVIDOR_EMPRESA = ['ip_personalizado', 'porta_ssh', 'observacoes_infra', 'peculiaridades', 'config_personalizada', 'checklist_implementacao'];

function linhaServidorEmpresa(empresaId, dados, userEmail) {
  const linha = { empresa_id: empresaId, updated_at: new Date().toISOString(), updated_by: userEmail || null };
  CAMPOS_SERVIDOR_EMPRESA.forEach((c) => {
    if (dados[c] !== undefined) linha[c] = dados[c];
  });
  return linha;
}

/** Baixa os detalhes do servidor da empresa (IP, porta, observações, checklist de implementação). */
export async function fetchEmpresaServidorDetalhes(empresaId) {
  if (!podeUsarTabelas() || !isCloudId(empresaId)) return getEmpresaServidorDetalhes(empresaId);
  const key = 'servidor_empresa_' + empresaId;
  const { data, error } = await supabase.from('empresa_servidor').select('*').eq('empresa_id', empresaId).maybeSingle();
  if (error) return getEmpresaServidorDetalhes(empresaId);

  if (data) {
    const atual = getEmpresaServidorDetalhes(empresaId);
    const daNuvem = {};
    CAMPOS_SERVIDOR_EMPRESA.forEach((c) => {
      if (data[c] !== undefined && data[c] !== null) daNuvem[c] = data[c];
    });
    // Lista vazia vinda do banco é válida (a equipe removeu tudo); só usa a local se o banco não tiver o campo
    if (!Array.isArray(daNuvem.checklist_implementacao)) {
      daNuvem.checklist_implementacao = atual.checklist_implementacao;
    }
    daNuvem.checklist_implementacao = semItensLegados(daNuvem.checklist_implementacao);
    setLocalData(key, { ...atual, ...daNuvem, atualizado_por: data.updated_by, atualizado_em: data.updated_at });
  } else if (typeof window !== 'undefined' && localStorage.getItem('rm_' + key)) {
    // Primeira vez: o que estava só neste navegador vira o registro da equipe
    await supabase.from('empresa_servidor').upsert(linhaServidorEmpresa(empresaId, getEmpresaServidorDetalhes(empresaId), null), { onConflict: 'empresa_id' });
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('servidor_empresa_updated'));
  return getEmpresaServidorDetalhes(empresaId);
}

export async function updateEmpresaServidorDetalhes(empresaId, dados, userEmail = 'admin@rmcontrole.com') {
  if (!empresaId) throw new Error('ID da empresa é obrigatório.');
  const key = 'servidor_empresa_' + empresaId;
  const anterior = getEmpresaServidorDetalhes(empresaId);
  const atualizado = { ...anterior, ...dados };
  setLocalData(key, atualizado);

  // Compartilhado com a equipe: só confirma se o banco gravou
  if (podeUsarTabelas() && isCloudId(empresaId)) {
    const { data, error } = await supabase
      .from('empresa_servidor')
      .upsert(linhaServidorEmpresa(empresaId, atualizado, userEmail), { onConflict: 'empresa_id' })
      .select('empresa_id');
    if (error || !Array.isArray(data) || data.length === 0) {
      setLocalData(key, anterior);
      window.dispatchEvent(new Event('servidor_empresa_updated'));
      throw new Error(`Não foi possível salvar a configuração do servidor: ${error?.message || 'sem permissão'}`);
    }
  }

  await logAuditoria({
    empresaId,
    usuarioEmail: userEmail,
    acao: 'atualizou_configuracoes_servidor',
    detalhes: { modulo: 'Configuração do Servidor', campos: Object.keys(dados) },
  });

  window.dispatchEvent(new Event('servidor_empresa_updated'));
  return atualizado;
}

export async function toggleServidorChecklistItem(empresaId, itemId, userEmail = 'admin@rmcontrole.com') {
  // Parte do estado mais recente da equipe para não desfazer a alteração de um colega
  const dados = await fetchEmpresaServidorDetalhes(empresaId);
  const checklist = dados.checklist_implementacao.map((item) => {
    if (item.id === itemId) {
      const novoStatus = !item.concluido;
      return {
        ...item,
        concluido: novoStatus,
        concluido_em: novoStatus ? new Date().toISOString() : null,
        responsavel: novoStatus ? getNomeTecnico(userEmail) : null,
      };
    }
    return item;
  });

  dados.checklist_implementacao = checklist;
  return updateEmpresaServidorDetalhes(empresaId, dados, userEmail);
}

export async function addEmpresaChecklistItem(empresaId, { titulo, desc = '' }, userEmail = 'admin@rmcontrole.com') {
  if (!empresaId || !titulo || !titulo.trim()) return null;
  // Parte do estado mais recente da equipe para não desfazer a alteração de um colega
  const dados = await fetchEmpresaServidorDetalhes(empresaId);
  const novoItem = {
    id: 'chk_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    titulo: titulo.trim(),
    desc: desc.trim(),
    obrigatorio: true,
    concluido: false,
    concluido_em: null,
    responsavel: null,
  };
  dados.checklist_implementacao = [...(dados.checklist_implementacao || []), novoItem];
  return updateEmpresaServidorDetalhes(empresaId, dados, userEmail);
}

export async function deleteEmpresaChecklistItem(empresaId, itemId, userEmail = 'admin@rmcontrole.com') {
  if (!empresaId || !itemId) return null;
  // Parte do estado mais recente da equipe para não desfazer a alteração de um colega
  const dados = await fetchEmpresaServidorDetalhes(empresaId);
  dados.checklist_implementacao = (dados.checklist_implementacao || []).filter((i) => i.id !== itemId);
  return updateEmpresaServidorDetalhes(empresaId, dados, userEmail);
}


// ==============================================================================
// GESTÃO DE FEEDBACKS & RELATO DE BUGS
// ==============================================================================
export function getFeedbacks() {
  return getLocalData('feedbacks_lista', []);
}

// Status alterados localmente e ainda não confirmados pelo servidor (expiram em 60s)
const FEEDBACK_PENDENTE_TTL_MS = 60000;

function extrairModuloFeedback(descricao = '') {
  const match = /^\[Módulo: ([^\]]+)\]\s*/.exec(descricao || '');
  return match ? { modulo: match[1], descricao: descricao.slice(match[0].length) } : { modulo: null, descricao };
}

export async function fetchFeedbacks() {
  if (typeof window !== 'undefined') {
    // Remove o antigo mapa de "overrides" locais, que impedia ver o status alterado por outros colaboradores
    try {
      localStorage.removeItem('rm_feedbacks_status_override');
      localStorage.removeItem('rm_rm_feedbacks_status_override');
    } catch (e) {}
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        const local = getLocalData('feedbacks_lista', []);
        const localById = new Map((local || []).map((f) => [f.id, f]));
        const pendentes = getLocalData('feedbacks_status_pendente', {});
        const agoraMs = Date.now();

        // A nuvem é a fonte da verdade do status; só um status local ainda não confirmado (recente) prevalece
        const merged = data.map((cloudItem) => {
          const localItem = localById.get(cloudItem.id);
          const { modulo, descricao } = extrairModuloFeedback(cloudItem.descricao);
          const pend = pendentes[cloudItem.id];
          const pendValido = pend && agoraMs - new Date(pend.em).getTime() < FEEDBACK_PENDENTE_TTL_MS;
          return {
            ...cloudItem,
            descricao,
            modulo_afetado: modulo || localItem?.modulo_afetado || 'Geral',
            status: (pendValido && pend.status) || cloudItem.status || 'em_analise',
          };
        });

        // Mantém apenas feedbacks locais que nunca chegaram à nuvem (IDs provisórios)
        const cloudIds = new Set(data.map((d) => d.id));
        const onlyLocal = (local || []).filter((f) => f.id && !cloudIds.has(f.id) && !isCloudId(f.id));

        const finalLista = [...merged, ...onlyLocal];
        setLocalData('feedbacks_lista', finalLista);
        return finalLista;
      }
      if (error) console.warn('Erro ao buscar feedbacks do Supabase:', error);
    } catch (e) {
      console.warn('Erro ao buscar feedbacks do Supabase:', e);
    }
  }
  return getFeedbacks();
}

export async function createFeedback({
  titulo,
  descricao,
  modulo_afetado = 'Fila de Demandas',
  empresa_nome = 'RM Controle',
  tipo = 'bug',
  prioridade = 'normal',
  imagem_base64 = null,
  autor_email = 'admin@rmcontrole.com',
  autor_nome = 'Colaborador',
}) {
  if (!titulo || !titulo.trim()) throw new Error('Título do feedback é obrigatório.');
  if (!descricao || !descricao.trim()) throw new Error('Descrição do feedback é obrigatória.');

  const agora = new Date().toISOString();
  const novoFeedback = {
    id: 'fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    titulo: titulo.trim(),
    descricao: descricao.trim(),
    empresa_nome: 'RM Controle',
    modulo_afetado: modulo_afetado || 'Geral',
    tipo,
    prioridade,
    imagem_url: imagem_base64 || null,
    autor_email,
    autor_nome,
    status: 'em_analise',
    created_at: agora,
  };

  const lista = getFeedbacks();
  lista.unshift(novoFeedback);
  setLocalData('feedbacks_lista', lista);

  // 1. Grava no Supabase se configurado
  if (isSupabaseConfigured && supabase) {
    try {
      const payload = {
        titulo: novoFeedback.titulo,
        descricao: `[Módulo: ${novoFeedback.modulo_afetado}] ${novoFeedback.descricao}`,
        empresa_nome: 'RM Controle',
        tipo: novoFeedback.tipo,
        prioridade: novoFeedback.prioridade,
        imagem_url: novoFeedback.imagem_url,
        autor_email,
        autor_nome,
        status: 'em_analise',
        created_at: agora,
      };
      const { data: dbSaved, error } = await supabase.from('feedbacks').insert([payload]).select().maybeSingle();
      if (error) console.warn('Aviso ao salvar feedback no Supabase:', error);
      if (dbSaved?.id) {
        const localId = novoFeedback.id;
        novoFeedback.id = dbSaved.id;
        const atual = getLocalData('feedbacks_lista', []);
        setLocalData('feedbacks_lista', atual.map((f) => (f.id === localId ? { ...f, id: dbSaved.id } : f)));
      }
    } catch (e) {
      console.warn('Aviso ao salvar feedback no Supabase:', e);
    }
  }

  // 2. Feedbacks permanecem exclusivamente na aba Feedbacks (não poluem a Fila de Demandas)


  await logAuditoria({
    usuarioEmail: autor_email,
    acao: 'registrou_feedback_ou_bug',
    detalhes: { titulo: novoFeedback.titulo, tipo, prioridade, modulo: 'Feedbacks' },
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('feedbacks_updated'));
  }

  return novoFeedback;
}

export async function updateFeedbackStatus(feedbackId, newStatus, userEmail = 'admin@rmcontrole.com') {
  const feedbacks = getLocalData('feedbacks_lista', []);
  const idx = feedbacks.findIndex((f) => f.id === feedbackId);
  const agora = new Date().toISOString();
  const fbAnterior = idx !== -1 ? feedbacks[idx] : null;

  if (idx !== -1) {
    feedbacks[idx] = {
      ...feedbacks[idx],
      status: newStatus,
      updated_at: agora,
      ...(newStatus === 'resolvido' ? { finalizado_em: agora } : {}),
    };
    setLocalData('feedbacks_lista', feedbacks);
  }

  if (isSupabaseConfigured && supabase) {
    const pendentes = getLocalData('feedbacks_status_pendente', {});
    pendentes[feedbackId] = { status: newStatus, em: agora };
    setLocalData('feedbacks_status_pendente', pendentes);

    let res;
    if (isCloudId(feedbackId)) {
      res = await supabase.from('feedbacks').update({ status: newStatus }).eq('id', feedbackId).select('id');
    } else if (fbAnterior?.titulo) {
      // Feedback criado offline: localiza pelo título exato
      res = await supabase.from('feedbacks').update({ status: newStatus }).eq('titulo', fbAnterior.titulo).select('id');
    }

    const pendentesAtuais = getLocalData('feedbacks_status_pendente', {});
    delete pendentesAtuais[feedbackId];
    setLocalData('feedbacks_status_pendente', pendentesAtuais);

    const confirmado = res && !res.error && Array.isArray(res.data) && res.data.length > 0;
    if (res && !confirmado) {
      // Reverte o status local para não exibir algo que os outros colaboradores não verão
      if (fbAnterior) {
        const lista = getLocalData('feedbacks_lista', []);
        const i = lista.findIndex((f) => f.id === feedbackId);
        if (i !== -1) {
          lista[i] = fbAnterior;
          setLocalData('feedbacks_lista', lista);
        }
      }
      console.warn('Falha ao atualizar status do feedback no Supabase:', res.error);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('feedbacks_updated'));
      throw new Error('Não foi possível salvar o novo status no servidor. Verifique sua conexão e tente de novo.');
    }
  }

  await logAuditoria({
    usuarioEmail: userEmail,
    acao: 'atualizou_status_feedback',
    detalhes: { feedbackId, novo_status: newStatus },
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('feedbacks_updated'));
  }
  return true;
}

// ==============================================================================
// GESTÃO DA AGENDA DE REUNIÕES & INTEGRAÇÃO GOOGLE CALENDAR
// ==============================================================================

export const AGENDA_CONFIG_DEFAULT = {
  calendarId: 'suporte@rmchat.com.br',
  urlIcal: 'https://calendar.google.com/calendar/ical/suporte%40rmchat.com.br/public/basic.ics',
  urlEmbed: 'https://calendar.google.com/calendar/embed?src=suporte%40rmchat.com.br&ctz=America%2FFortaleza',
  minutosAntecedencia: 15,
  notificarEscopo: 'proprias',
  somHabilitado: true,
  visualizacaoPadrao: 'nativa',
};

export function getAgendaConfig() {
  if (typeof window === 'undefined') return AGENDA_CONFIG_DEFAULT;
  const raw = localStorage.getItem('rm_agenda_config');
  if (!raw) return AGENDA_CONFIG_DEFAULT;
  try {
    return { ...AGENDA_CONFIG_DEFAULT, ...JSON.parse(raw) };
  } catch (e) {
    return AGENDA_CONFIG_DEFAULT;
  }
}

export function setAgendaConfig(newConfig) {
  if (typeof window === 'undefined') return;
  const current = getAgendaConfig();
  const updated = { ...current, ...newConfig };
  localStorage.setItem('rm_agenda_config', JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('rm_agenda_config_updated', { detail: updated }));
}

export const DEFAULT_AGENDA_EVENTOS = [
  {
    id: 'evt_1',
    titulo: 'Reunião de Equipe Semanal',
    empresa: 'RM Controle / Geral',
    data: new Date().toISOString().split('T')[0],
    hora_inicio: '11:00',
    hora_fim: '12:00',
    responsavel_email: 'admin@rmcontrole.com',
    responsavel_nome: 'Lucas Amorim (Administrador)',
    link_reuniao: 'https://meet.google.com/rm-equipe',
    status: 'agendada',
    tipo: 'equipe',
    observacoes: 'Alinhamento geral de demandas e prioridades operacionais da semana.',
  },
  {
    id: 'evt_2',
    titulo: 'Treinamento com MOR Marcas',
    empresa: 'MOR Marcas',
    data: new Date().toISOString().split('T')[0],
    hora_inicio: '15:00',
    hora_fim: '16:00',
    responsavel_email: 'suporte@rmchat.com.br',
    responsavel_nome: 'Pedro Alvarez',
    link_reuniao: 'https://meet.google.com/mor-treina',
    status: 'agendada',
    tipo: 'cliente',
    observacoes: 'Treinamento prático sobre fluxos de atendimento e automação.',
  },
  {
    id: 'evt_3',
    titulo: 'Reunião com Rafael Rezende',
    empresa: 'Rezende Soluções',
    data: new Date().toISOString().split('T')[0],
    hora_inicio: '17:00',
    hora_fim: '18:00',
    responsavel_email: 'admin@rmcontrole.com',
    responsavel_nome: 'Lucas Amorim (Administrador)',
    link_reuniao: 'https://meet.google.com/rezende-call',
    status: 'agendada',
    tipo: 'cliente',
    observacoes: 'Alinhamento sobre migração de instâncias e validação de QR Code.',
  },
  {
    id: 'evt_4',
    titulo: 'Migração para API Oficial Meta',
    empresa: 'Hospital Gastrovitta',
    data: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    hora_inicio: '14:00',
    hora_fim: '15:00',
    responsavel_email: 'rayane@rmchat.com',
    responsavel_nome: 'Rayane Nunes',
    link_reuniao: 'https://meet.google.com/gastro-meta',
    status: 'agendada',
    tipo: 'implantacao',
    observacoes: 'Migração do número principal para Cloud API oficial Meta.',
  },
];

export function getAgendaEventos() {
  if (isMockDataEnabled()) {
    return getLocalData('agenda_eventos', DEFAULT_AGENDA_EVENTOS);
  }
  const lista = getLocalData('agenda_eventos', []);
  // Se o modo mock estiver desligado, não injeta reuniões fictícias
  return lista.filter((e) => !e.is_mock && !['evt_1', 'evt_2', 'evt_3', 'evt_4'].includes(e.id));
}

export function saveAgendaEventos(eventos) {
  setLocalData('agenda_eventos', eventos);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('agenda_eventos_updated'));
  }
}

const CAMPOS_AGENDA = ['titulo', 'empresa', 'data', 'hora_inicio', 'hora_fim', 'responsavel_email', 'responsavel_nome', 'link_reuniao', 'status', 'tipo', 'observacoes', 'chamado_id'];

function linhaAgenda(evento) {
  const linha = {};
  CAMPOS_AGENDA.forEach((c) => {
    if (evento[c] !== undefined) linha[c] = evento[c];
  });
  return linha;
}

// Eventos importados do Google Agenda pessoal ficam só no navegador de quem importou
const ehEventoPessoal = (e) => e?.origem === 'google_calendar';

/** Baixa a agenda da equipe; na primeira vez, envia os eventos criados só neste navegador. */
export async function fetchAgendaEventos() {
  if (!podeUsarTabelas()) return getAgendaEventos();
  const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('agenda_eventos').select('*').gte('data', desde).order('data');
  if (error || !Array.isArray(data)) return getAgendaEventos();

  const locais = getLocalData('agenda_eventos', []);
  const idsMock = new Set(['evt_1', 'evt_2', 'evt_3', 'evt_4']);
  const legados = locais.filter((e) => e && !isCloudId(e.id) && !ehEventoPessoal(e) && !e.is_mock && !idsMock.has(e.id) && e.titulo && e.data);
  let lista = data;
  if (legados.length > 0) {
    const { data: enviados } = await supabase.from('agenda_eventos').insert(legados.map((e) => ({ ...linhaAgenda(e), criado_por: e.responsavel_email || null }))).select('*');
    if (Array.isArray(enviados)) lista = [...data, ...enviados];
  }
  saveAgendaEventos([...lista, ...locais.filter(ehEventoPessoal)]);
  return getAgendaEventos();
}

export async function addAgendaEvento(eventoData) {
  const eventos = getAgendaEventos();
  let novo = {
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    titulo: (eventoData.titulo || 'Nova Reunião').trim(),
    empresa: (eventoData.empresa || 'Cliente Geral').trim(),
    data: eventoData.data || new Date().toISOString().split('T')[0],
    hora_inicio: eventoData.hora_inicio || '09:00',
    hora_fim: eventoData.hora_fim || '10:00',
    responsavel_email: (eventoData.responsavel_email || 'admin@rmcontrole.com').trim().toLowerCase(),
    responsavel_nome: eventoData.responsavel_nome || getNomeTecnico(eventoData.responsavel_email),
    link_reuniao: (eventoData.link_reuniao || '').trim(),
    status: eventoData.status || 'agendada',
    tipo: eventoData.tipo || 'cliente',
    observacoes: (eventoData.observacoes || '').trim(),
    chamado_id: eventoData.chamado_id || null,
    created_at: new Date().toISOString(),
  };
  if (podeUsarTabelas()) {
    const { data, error } = await supabase
      .from('agenda_eventos')
      .insert([{ ...linhaAgenda(novo), criado_por: novo.responsavel_email }])
      .select('*')
      .single();
    if (error) throw new Error(`Não foi possível salvar o evento para a equipe: ${error.message}`);
    novo = { ...novo, ...data };
  }
  eventos.push(novo);
  saveAgendaEventos(eventos);
  return novo;
}

export async function updateAgendaEvento(id, dados) {
  const eventos = getAgendaEventos();
  const idx = eventos.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const atualizado = { ...eventos[idx], ...dados, updated_at: new Date().toISOString() };
  if (podeUsarTabelas() && isCloudId(id)) {
    const { data, error } = await supabase
      .from('agenda_eventos')
      .update({ ...linhaAgenda(dados), updated_at: atualizado.updated_at })
      .eq('id', id)
      .select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(`Não foi possível atualizar o evento: ${error?.message || 'sem permissão'}`);
    }
  }
  eventos[idx] = atualizado;
  saveAgendaEventos(eventos);
  return eventos[idx];
}

export async function deleteAgendaEvento(id) {
  if (podeUsarTabelas() && isCloudId(id)) {
    const { data, error } = await supabase.from('agenda_eventos').delete().eq('id', id).select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      throw new Error(`Não foi possível excluir o evento: ${error?.message || 'apenas quem criou, o responsável ou um administrador pode excluir'}`);
    }
  }
  const eventos = getAgendaEventos();
  saveAgendaEventos(eventos.filter((e) => e.id !== id));
  return true;
}

export function parseIcalEvents(icsContent) {
  if (!icsContent || typeof icsContent !== 'string') return [];
  const events = [];
  const lines = icsContent.split(/\r?\n/);
  let current = null;

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (current && (current.titulo || current.SUMMARY)) {
        const titulo = current.SUMMARY || current.titulo || 'Reunião';
        let data = '';
        let hora_inicio = '09:00';
        let hora_fim = '10:00';

        if (current.DTSTART) {
          const raw = current.DTSTART.replace(/.*:/, '').trim();
          if (raw.endsWith('Z') && raw.length >= 15 && raw.includes('T')) {
            const yr = parseInt(raw.slice(0, 4), 10);
            const mo = parseInt(raw.slice(4, 6), 10) - 1;
            const da = parseInt(raw.slice(6, 8), 10);
            const hr = parseInt(raw.slice(9, 11), 10);
            const mi = parseInt(raw.slice(11, 13), 10);
            const se = parseInt(raw.slice(13, 15), 10);
            const utcDate = new Date(Date.UTC(yr, mo, da, hr, mi, se));
            data = `${utcDate.getFullYear()}-${String(utcDate.getMonth() + 1).padStart(2, '0')}-${String(utcDate.getDate()).padStart(2, '0')}`;
            hora_inicio = `${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`;
          } else {
            if (raw.length >= 8) {
              data = raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
            }
            if (raw.includes('T') && raw.length >= 13) {
              const timePart = raw.split('T')[1];
              hora_inicio = timePart.slice(0, 2) + ':' + timePart.slice(2, 4);
            }
          }
        }
        if (current.DTEND) {
          const raw = current.DTEND.replace(/.*:/, '').trim();
          if (raw.endsWith('Z') && raw.length >= 15 && raw.includes('T')) {
            const yr = parseInt(raw.slice(0, 4), 10);
            const mo = parseInt(raw.slice(4, 6), 10) - 1;
            const da = parseInt(raw.slice(6, 8), 10);
            const hr = parseInt(raw.slice(9, 11), 10);
            const mi = parseInt(raw.slice(11, 13), 10);
            const se = parseInt(raw.slice(13, 15), 10);
            const utcDate = new Date(Date.UTC(yr, mo, da, hr, mi, se));
            hora_fim = `${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`;
          } else if (raw.includes('T') && raw.length >= 13) {
            const timePart = raw.split('T')[1];
            hora_fim = timePart.slice(0, 2) + ':' + timePart.slice(2, 4);
          }
        }

        const desc = current.DESCRIPTION || '';
        const loc = current.LOCATION || '';
        const combined = desc + ' ' + loc;
        const matchMeet = combined.match(/https?:\/\/(meet\.google\.com\/[a-z0-9-]+|zoom\.us\/[a-z0-9/?=]+|teams\.microsoft\.com\/[^\s]+)/i);

        events.push({
          id: current.UID ? 'gcal_' + current.UID.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) : 'gcal_' + Date.now() + Math.random().toString(36).slice(2, 6),
          titulo,
          empresa: loc && !loc.includes('http') ? loc : (titulo.includes('-') ? titulo.split('-')[0].trim() : (titulo.includes('com') ? titulo.split('com')[1].trim() : 'Google Agenda')),
          data: data || new Date().toISOString().split('T')[0],
          hora_inicio,
          hora_fim,
          responsavel_email: 'suporte@rmchat.com.br',
          responsavel_nome: 'Equipe de Suporte',
          link_reuniao: matchMeet ? matchMeet[0] : (current.URL || ''),
          status: 'agendada',
          tipo: 'google_calendar',
          observacoes: desc ? desc.slice(0, 200) : 'Sincronizado do Google Agenda',
          origem: 'google_calendar',
        });
      }
      current = null;
    } else if (current) {
      const colIdx = line.indexOf(':');
      if (colIdx > 0) {
        const key = line.slice(0, colIdx).split(';')[0];
        const val = line.slice(colIdx + 1);
        if (key === 'SUMMARY') current.SUMMARY = val.split('\,').join(',').split('\n').join(' ').trim();
        else if (key === 'DESCRIPTION') current.DESCRIPTION = val.split('\,').join(',').split('\n').join(' ').trim();
        else if (key === 'LOCATION') current.LOCATION = val.split('\,').join(',').trim();
        else if (key === 'DTSTART') current.DTSTART = line;
        else if (key === 'DTEND') current.DTEND = line;
        else if (key === 'UID') current.UID = val.trim();
        else if (key === 'URL') current.URL = val.trim();
      }
    }
  }
  return events;
}

// Configuração Global de URLs de Acesso aos Servidores (Servidor 1 e Servidor 2)
export const DEFAULT_SERVIDORES_CONFIG = {
  servidor_1_nome: 'Servidor 1',
  servidor_1_url: '',
  servidor_2_nome: 'Servidor 2',
  servidor_2_url: '',
};

// Endereços fictícios que versões antigas gravavam como padrão: nunca devem ser abertos
const URLS_SERVIDOR_FICTICIAS = new Set(['https://app1.rmcontrole.com.br', 'https://app2.rmcontrole.com.br']);

export function getServidoresConfig() {
  const salvo = { ...DEFAULT_SERVIDORES_CONFIG, ...getLocalData('rm_servidores_config', DEFAULT_SERVIDORES_CONFIG) };
  for (const n of [1, 2]) {
    if (URLS_SERVIDOR_FICTICIAS.has(String(salvo[`servidor_${n}_url`] || '').replace(/\/$/, ''))) salvo[`servidor_${n}_url`] = '';
  }
  return salvo;
}

function aplicarServidoresConfigLocal(config) {
  setLocalData('rm_servidores_config', config);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('rm_servidores_config_updated'));
  }
}

/** Busca as URLs compartilhadas (Supabase) e atualiza a cópia local usada pelas telas. */
export async function fetchServidoresConfig() {
  if (typeof window === 'undefined') return getServidoresConfig();
  try {
    await sincronizarConfiguracoesGlobais();
  } catch (e) {}
  return getServidoresConfig();
}

/**
 * Salva as URLs para TODA a equipe. Antes ficava só no localStorage de quem salvou,
 * e cada colaborador via um link diferente.
 */
export async function setServidoresConfig(config) {
  const anterior = getServidoresConfig();
  const novo = { ...anterior, ...config };
  aplicarServidoresConfigLocal(novo);
  try {
    const salvo = await salvarConfiguracaoGlobal('servidores_urls', novo);
    aplicarServidoresConfigLocal({ ...DEFAULT_SERVIDORES_CONFIG, ...salvo });
    return getServidoresConfig();
  } catch (e) {
    aplicarServidoresConfigLocal(anterior);
    throw new Error(`As URLs não foram salvas: ${e.message}`);
  }
}
export function getHistoricoCompletoEmpresa(empresaId, empresaNome = '') {
  if (!empresaId) return [];
  const historico = getLocalData('historico_chamados', []) || [];
  const ativos = getLocalData('chamados_suporte', []) || [];
  // O vínculo é pelo ID da empresa. Demandas antigas sem ID (criadas digitando o nome)
  // entram pelo nome, desde que não estejam vinculadas a OUTRA empresa.
  const nomeAlvo = normalizarNomeEmpresa(empresaNome);
  const pertence = (c) => {
    if (!c) return false;
    const idDemanda = c.empresa_id || c.empresa?.id;
    if (idDemanda) return idDemanda === empresaId;
    return Boolean(nomeAlvo) && normalizarNomeEmpresa(c.empresa_nome) === nomeAlvo;
  };

  const filtrados = [...historico.filter(pertence), ...ativos.filter(pertence)];

  const mapa = new Map();
  filtrados.forEach((c) => {
    if (c && c.id && !mapa.has(c.id)) {
      mapa.set(c.id, c);
    }
  });

  return Array.from(mapa.values()).sort((a, b) => {
    const dataB = new Date(b.finalizado_em || b.iniciado_em || b.created_at || 0).getTime();
    const dataA = new Date(a.finalizado_em || a.iniciado_em || a.created_at || 0).getTime();
    return dataB - dataA;
  });
}

function normalizarNomeEmpresa(nome) {
  return removerAcentos(String(nome || '')).toLowerCase().trim().replace(/\s+/g, ' ');
}

/** ID oficial da empresa pelo nome (para demandas abertas sem a empresa selecionada da lista). */
export function resolverEmpresaIdPorNome(nome) {
  const alvo = normalizarNomeEmpresa(nome);
  if (!alvo) return null;
  const empresa = (getLocalData('empresas_reais', []) || []).find((e) => isCloudId(e?.id) && normalizarNomeEmpresa(e.nome) === alvo);
  return empresa?.id || null;
}

export async function reatribuirChamadoSuporte(chamadoId, novoTecnicoEmail, novoTecnicoNome = null, alteradoPor = 'admin@rmcontrole.com') {
  if (!chamadoId) throw new Error('ID do chamado é obrigatório.');
  const chamados = getLocalData('chamados_suporte', []);
  const idx = encontrarIndiceChamado(chamados, chamadoId);
  if (idx === -1) throw new Error('Esta demanda não está mais na fila.');
  const chamadosAntes = chamados.map((c) => ({ ...c }));

  const isFilaGeral = novoTecnicoEmail === 'geral' || !novoTecnicoEmail;
  const tecnicoNomeFinal = isFilaGeral ? 'Fila Geral (Todos)' : (novoTecnicoNome || getNomeTecnico(novoTecnicoEmail));
  const anteriorTecnico = chamados[idx].tecnico_nome || chamados[idx].atendente || chamados[idx].tecnico_email || 'Fila Geral';

  chamados[idx] = {
    ...chamados[idx],
    tecnico_email: isFilaGeral ? null : novoTecnicoEmail,
    tecnico_nome: tecnicoNomeFinal,
    atendente: tecnicoNomeFinal,
    atribuido_a: isFilaGeral ? 'geral' : novoTecnicoEmail,
    atribuido_nome: tecnicoNomeFinal,
    is_fila_geral: isFilaGeral,
    historico_reatribuicoes: [
      ...(chamados[idx].historico_reatribuicoes || []),
      {
        de: anteriorTecnico,
        para: tecnicoNomeFinal,
        por: alteradoPor,
        em: new Date().toISOString(),
      },
    ],
    updated_at: new Date().toISOString(),
  };

  registrarMutacaoLocal();
  setLocalData('chamados_suporte', chamados);

  // Antes enviava "updated_at", coluna que não existe: o banco recusava tudo e a troca
  // de responsável ficava só neste navegador. tecnico_email é NOT NULL: Fila Geral usa 'geral'.
  const res = await atualizarChamadoNuvem(
    chamados[idx].id,
    {
      tecnico_email: isFilaGeral ? 'geral' : novoTecnicoEmail,
      atendente: isFilaGeral ? 'Fila Geral (Aguardando Atendente)' : tecnicoNomeFinal,
      atribuido_a: isFilaGeral ? 'geral' : novoTecnicoEmail,
    },
    ['atribuido_a']
  );
  if (!res.ok) {
    registrarMutacaoLocal();
    setLocalData('chamados_suporte', chamadosAntes);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('suporte_updated'));
    throw new Error(`Não foi possível reatribuir no servidor: ${res.erro}`);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('suporte_updated'));
  }

  return chamados[idx];
}

export function existeEmpresaComTermo(search) {
  if (!search || !search.trim()) return true;
  const q = removerAcentos(search.toLowerCase().trim());
  const empresasReais = getLocalData('empresas_reais', []) || [];
  const mockEmpresas = isMockDataEnabled() ? (DEFAULT_EMPRESAS_MOCK || []) : [];
  const todas = [...empresasReais, ...mockEmpresas];
  return todas.some((emp) => {
    if (!emp) return false;
    const nome = removerAcentos((emp.nome || '').toLowerCase().trim());
    return nome.includes(q);
  });
}
