/**
 * Integração de Suporte Automático (somente servidor).
 *
 * Outra plataforma (ex.: chatbot de atendimento) chama a API do RM Controle para:
 *   1. identificar a empresa pelo nome digitado pelo cliente (correspondência aproximada);
 *   2. abrir uma demanda pendente na Fila de Demandas com descrição e solicitante.
 *
 * A configuração fica em public.sistema_config (chave CONFIG_CHAVE) e é lida com a service role,
 * que nunca é exposta ao navegador. O token de acesso é guardado apenas como hash SHA-256.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { buscarEmpresaSemelhante } from '@/lib/empresaMatcher';

export const CONFIG_CHAVE = 'integracao_suporte_automatico';

export const CONFIG_PADRAO = {
  ativo: false,
  limiar_sugestao: 60,
  limiar_automatico: 90,
  max_sugestoes: 5,
  departamento_padrao: 'Suporte',
  // 'rejeitar': responde nao_encontrado para o bot pedir o nome de novo
  // 'criar_com_nome_informado': abre a demanda mesmo assim, com o nome que o cliente digitou
  quando_nao_encontrar: 'rejeitar',
  token_hash: null,
  token_prefixo: null,
  token_gerado_em: null,
};

let clienteAdmin = null;

export function getSupabaseAdmin() {
  if (clienteAdmin) return clienteAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  if (!clienteAdmin) {
    clienteAdmin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return clienteAdmin;
}

// Permite injetar um cliente simulado nos testes
export function __definirSupabaseAdmin(cliente) {
  clienteAdmin = cliente;
}

export class ErroIntegracao extends Error {
  constructor(status, codigo, mensagem, extras = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extras = extras;
  }
}

function exigirCliente() {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new ErroIntegracao(503, 'servidor_nao_configurado', 'Integração indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.');
  }
  return db;
}

// ------------------------------------------------------------------------------
// Configuração
// ------------------------------------------------------------------------------
export async function carregarConfig() {
  const db = exigirCliente();
  const { data, error } = await db.from('sistema_config').select('valor').eq('chave', CONFIG_CHAVE).maybeSingle();
  if (error) throw new ErroIntegracao(500, 'erro_config', `Não foi possível ler a configuração: ${error.message}`);
  return { ...CONFIG_PADRAO, ...(data?.valor || {}) };
}

async function gravarConfig(config) {
  const db = exigirCliente();
  const { error } = await db
    .from('sistema_config')
    .upsert({ chave: CONFIG_CHAVE, valor: config, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new ErroIntegracao(500, 'erro_config', `Não foi possível salvar a configuração: ${error.message}`);
  return config;
}

function limitar(valor, min, max, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Valida e salva apenas os campos editáveis (o token tem fluxo próprio). */
export async function salvarConfig(parcial = {}) {
  const atual = await carregarConfig();
  const limiarSugestao = limitar(parcial.limiar_sugestao ?? atual.limiar_sugestao, 1, 100, 60);
  const limiarAutomatico = limitar(parcial.limiar_automatico ?? atual.limiar_automatico, 1, 100, 90);
  if (limiarAutomatico < limiarSugestao) {
    throw new ErroIntegracao(400, 'limiares_invalidos', 'O limite para criar automaticamente precisa ser maior ou igual ao limite para sugerir empresas.');
  }
  const novo = {
    ...atual,
    ativo: parcial.ativo !== undefined ? Boolean(parcial.ativo) : atual.ativo,
    limiar_sugestao: limiarSugestao,
    limiar_automatico: limiarAutomatico,
    max_sugestoes: limitar(parcial.max_sugestoes ?? atual.max_sugestoes, 1, 10, 5),
    departamento_padrao: String(parcial.departamento_padrao ?? atual.departamento_padrao ?? 'Suporte').trim().slice(0, 60) || 'Suporte',
    quando_nao_encontrar: ['rejeitar', 'criar_com_nome_informado'].includes(parcial.quando_nao_encontrar)
      ? parcial.quando_nao_encontrar
      : atual.quando_nao_encontrar,
  };
  return gravarConfig(novo);
}

export function configPublica(config) {
  const { token_hash, ...resto } = config;
  return { ...resto, token_configurado: Boolean(token_hash) };
}

// ------------------------------------------------------------------------------
// Token de acesso
// ------------------------------------------------------------------------------
function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Gera um novo token (invalida o anterior). O valor em texto só é devolvido nesta chamada. */
export async function gerarNovoToken() {
  const atual = await carregarConfig();
  const token = `rmc_${randomBytes(24).toString('base64url')}`;
  await gravarConfig({
    ...atual,
    token_hash: hashToken(token),
    token_prefixo: token.slice(0, 8),
    token_gerado_em: new Date().toISOString(),
  });
  return token;
}

export function extrairToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get('x-api-key') || '').trim();
}

/** Garante integração ativa e token válido; devolve a configuração. */
export async function autenticarIntegracao(request) {
  const token = extrairToken(request);
  if (!token) throw new ErroIntegracao(401, 'token_ausente', 'Envie o token no cabeçalho "Authorization: Bearer <token>".');
  const config = await carregarConfig();
  if (!config.token_hash) throw new ErroIntegracao(401, 'token_invalido', 'Token inválido.');
  const recebido = Buffer.from(hashToken(token), 'hex');
  const esperado = Buffer.from(config.token_hash, 'hex');
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
    throw new ErroIntegracao(401, 'token_invalido', 'Token inválido.');
  }
  if (!config.ativo) {
    throw new ErroIntegracao(403, 'integracao_desativada', 'A integração de suporte automático está desativada no RM Controle.');
  }
  return config;
}

// ------------------------------------------------------------------------------
// Empresas
// ------------------------------------------------------------------------------
async function listarEmpresas() {
  const db = exigirCliente();
  const { data, error } = await db.from('empresas').select('*');
  if (error) throw new ErroIntegracao(500, 'erro_empresas', `Não foi possível consultar as empresas: ${error.message}`);
  return (data || []).filter((e) => e && e.ativo !== false && e.is_mock !== true);
}

export async function identificarEmpresa(nome, config) {
  const texto = String(nome || '').trim();
  if (texto.length < 2) {
    throw new ErroIntegracao(400, 'nome_invalido', 'Informe o nome da empresa (mínimo de 2 caracteres).');
  }
  const empresas = await listarEmpresas();
  return buscarEmpresaSemelhante(texto.slice(0, 120), empresas, {
    limiarSugestao: config.limiar_sugestao,
    limiarAutomatico: config.limiar_automatico,
    maxSugestoes: config.max_sugestoes,
  });
}

// ------------------------------------------------------------------------------
// Criação da demanda
// ------------------------------------------------------------------------------
function textoLimpo(valor, max) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isErroColuna(error) {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return error?.code === 'PGRST204' || error?.code === '42703' || msg.includes('column');
}

/**
 * Abre a demanda na Fila Geral com status pendente (aguardando_visualizacao).
 * Aceita empresa_id (já confirmada pelo cliente) ou empresa_nome (passa pela correspondência).
 */
export async function criarChamadoIntegracao(body, config) {
  const descricao = textoLimpo(body?.descricao, 2000);
  const solicitante = textoLimpo(body?.solicitante_nome, 120);
  if (!descricao) throw new ErroIntegracao(400, 'descricao_obrigatoria', 'Informe "descricao" com o resumo do que o cliente precisa.');
  if (!solicitante) throw new ErroIntegracao(400, 'solicitante_obrigatorio', 'Informe "solicitante_nome" com o nome do contato.');

  const db = exigirCliente();
  let empresa = null;
  let correspondencia = null;

  if (body?.empresa_id) {
    const { data, error } = await db.from('empresas').select('id, nome').eq('id', String(body.empresa_id)).maybeSingle();
    if (error || !data) throw new ErroIntegracao(404, 'empresa_nao_encontrada', 'Nenhuma empresa cadastrada com este empresa_id.');
    empresa = { id: data.id, nome: data.nome, similaridade: 100 };
  } else if (body?.empresa_nome) {
    correspondencia = await identificarEmpresa(body.empresa_nome, config);
    if (correspondencia.decisao === 'confirmado') {
      empresa = correspondencia.empresa;
    } else if (correspondencia.decisao === 'confirmar') {
      // Não cria: o cliente precisa escolher uma das empresas sugeridas e reenviar com empresa_id
      return { criado: false, ...correspondencia };
    } else if (config.quando_nao_encontrar === 'criar_com_nome_informado') {
      empresa = { id: null, nome: textoLimpo(body.empresa_nome, 120), similaridade: 0 };
    } else {
      return { criado: false, ...correspondencia };
    }
  } else {
    throw new ErroIntegracao(400, 'empresa_obrigatoria', 'Informe "empresa_id" ou "empresa_nome".');
  }

  // Evita duplicar quando a outra plataforma reenvia a mesma requisição (retry/clique duplo)
  const doisMinutosAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recentes } = await db
    .from('suporte_chamados')
    .select('id, empresa_nome, observacoes, colaborador_solicitante, status, created_at')
    .eq('empresa_nome', empresa.nome)
    .gte('created_at', doisMinutosAtras);
  const duplicado = (recentes || []).find(
    (c) => c.observacoes === descricao && c.colaborador_solicitante === solicitante && c.status !== 'cancelado'
  );
  if (duplicado) {
    return { criado: true, duplicado: true, chamado_id: duplicado.id, empresa, decisao: 'confirmado' };
  }

  const agora = new Date().toISOString();
  const base = {
    empresa_id: empresa.id,
    empresa_nome: empresa.nome,
    tecnico_email: 'geral',
    atendente: 'Fila Geral (Aguardando Atendente)',
    colaborador_solicitante: solicitante,
    status: 'aguardando_visualizacao',
    observacoes: descricao,
    motivo: config.departamento_padrao || 'Suporte',
    iniciado_em: agora,
  };
  const extras = {
    etiquetas: ['Suporte Automático'],
    criador_email: 'integracao@rmcontrole',
    atribuido_a: 'geral',
  };

  let resultado = await db.from('suporte_chamados').insert([{ ...base, ...extras }]).select('id').maybeSingle();
  if (resultado.error && isErroColuna(resultado.error)) {
    resultado = await db.from('suporte_chamados').insert([base]).select('id').maybeSingle();
  }
  if (resultado.error || !resultado.data?.id) {
    throw new ErroIntegracao(500, 'erro_criar_chamado', `Não foi possível abrir a demanda: ${resultado.error?.message || 'sem retorno do banco'}`);
  }

  // Auditoria é melhor-esforço: não impede a criação da demanda
  try {
    await db.from('auditoria_logs').insert([{
      empresa_id: empresa.id,
      usuario_email: 'integracao@rmcontrole',
      usuario_nome: 'Suporte Automático (API)',
      acao: 'integracao_abriu_demanda',
      detalhes: {
        chamado_id: resultado.data.id,
        empresa_nome: empresa.nome,
        similaridade: empresa.similaridade,
        origem: textoLimpo(body?.origem, 60) || null,
        id_externo: textoLimpo(body?.id_externo, 120) || null,
        modulo: 'Fila de Suporte',
      },
    }]);
  } catch (e) {}

  return { criado: true, duplicado: false, chamado_id: resultado.data.id, empresa, decisao: correspondencia?.decisao || 'confirmado' };
}

/** Converte qualquer erro em resposta JSON padronizada. */
export function respostaErro(err) {
  if (err instanceof ErroIntegracao) {
    return Response.json({ ok: false, erro: err.codigo, mensagem: err.message, ...err.extras }, { status: err.status });
  }
  console.error('Erro inesperado na integração de suporte:', err);
  return Response.json({ ok: false, erro: 'erro_interno', mensagem: 'Erro interno ao processar a requisição.' }, { status: 500 });
}
