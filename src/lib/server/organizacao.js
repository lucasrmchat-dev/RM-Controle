/**
 * Multiempresa no servidor: em que empresa (organização) a requisição está trabalhando
 * e um acesso ao banco PRESO a ela.
 *
 * Toda rota usa `contextoDaRequisicao(request)` e recebe `db` já com escopo:
 *  - select / update / delete ganham `organizacao_id = <empresa>` automaticamente
 *  - insert / upsert gravam a empresa em cada linha (e ninguém troca a empresa num update)
 *  - segredos (rm_ler_segredo / rm_gravar_segredo) ficam separados por empresa
 * Assim o isolamento não depende de cada consulta lembrar de filtrar.
 * O banco confere de novo pelas regras de acesso (RLS) — são duas camadas.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { listaAdministradores, normalizarEmail, resolverPapel } from '@/lib/roles';

export const ORG_PLATAFORMA = '00000000-0000-4000-8000-000000000001';
// Empresa que recebeu os dados de antes da migração multiempresa (RM Chat)
export const ORG_LEGADO = '00000000-0000-4000-8000-000000000002';

/** Tabelas cujas linhas pertencem a uma empresa (mesma lista da migration_multiempresa.sql). */
export const TABELAS_DA_EMPRESA = new Set([
  'empresas', 'empresa_canais', 'empresa_observacoes', 'empresa_checklist', 'empresa_colaboradores',
  'empresa_credenciais', 'empresa_servidor', 'empresa_anexos', 'empresa_contratos',
  'equipe_usuarios', 'perfis_acesso', 'sistema_config', 'auditoria_logs',
  'suporte_chamados', 'suporte_motivos', 'solucoes_suporte', 'feedbacks',
  'agenda_eventos', 'agenda_confirmacoes', 'whatsapp_envios',
  'canais_catalogo', 'checklist_catalogo', 'servidor_checklist_template',
  'comercial_integracoes', 'comercial_leads', 'comercial_webhook_eventos',
]);

// Upserts cuja chave de conflito passou a incluir a empresa
const CONFLITOS = { sistema_config: { chave: 'organizacao_id,chave' } };
const SEGREDOS = new Set(['rm_ler_segredo', 'rm_gravar_segredo']);

const comEmpresa = (linhas, org) => (Array.isArray(linhas) ? linhas.map((l) => ({ ...l, organizacao_id: org })) : { ...linhas, organizacao_id: org });
const semEmpresa = (valores) => {
  if (!valores || typeof valores !== 'object') return valores;
  const { organizacao_id, ...resto } = valores;
  return resto;
};

/**
 * Acesso ao banco preso a uma empresa. `org` nulo/legado (banco ainda sem a migração) devolve o
 * acesso normal, para o sistema continuar funcionando até a migração ser aplicada.
 */
export function escopo(db, org) {
  if (!db || !org) return db;
  return {
    organizacaoId: org,
    global: db,
    from(tabela) {
      if (!TABELAS_DA_EMPRESA.has(tabela)) return db.from(tabela);
      return {
        select: (...args) => db.from(tabela).select(...args).eq('organizacao_id', org),
        insert: (linhas, opcoes) => db.from(tabela).insert(comEmpresa(linhas, org), opcoes),
        upsert: (linhas, opcoes = {}) => {
          const conflito = CONFLITOS[tabela]?.[opcoes.onConflict] || opcoes.onConflict;
          return db.from(tabela).upsert(comEmpresa(linhas, org), { ...opcoes, ...(conflito ? { onConflict: conflito } : {}) });
        },
        update: (valores, opcoes) => db.from(tabela).update(semEmpresa(valores), opcoes).eq('organizacao_id', org),
        delete: (opcoes) => db.from(tabela).delete(opcoes).eq('organizacao_id', org),
      };
    },
    rpc(nome, args = {}) {
      if (SEGREDOS.has(nome) && args.p_chave) return db.rpc(nome, { ...args, p_chave: `${org}:${args.p_chave}` });
      return db.rpc(nome, args);
    },
  };
}

const tabelaAusente = (error) => /organizacoes|sessoes_suporte|does not exist|schema cache|organizacao_id/i.test(error?.message || '');

/**
 * Em que empresa esta pessoa está trabalhando agora (mesma regra de public.rm_org_atual()).
 * @returns {Promise<{ id, nome, tipo, status, limites, pai_id, suporte: boolean, origem: string, legado?: boolean } | null>}
 */
export async function organizacaoAtual(db, email) {
  const alvo = normalizarEmail(email);
  const { data: org0, error: erroOrg } = await db.from('organizacoes').select('id').limit(1);
  // Banco ainda sem a migração multiempresa: tudo continua como uma empresa só
  if (erroOrg && tabelaAusente(erroOrg)) return { id: null, nome: 'RM Chat', tipo: 'assinante', status: 'ativa', limites: {}, suporte: false, origem: null, legado: true };
  void org0;

  const [{ data: membro }, { data: dono }] = await Promise.all([
    db.from('equipe_usuarios').select('organizacao_id, papel, ativo').eq('email', alvo).maybeSingle(),
    db.from('rm_admins_proprietarios').select('organizacao_id').eq('email', alvo).maybeSingle(),
  ]);
  const proprietario = Boolean(dono) || listaAdministradores(process.env.RM_ADMIN_EMAILS).has(alvo);
  const origem = (membro && membro.ativo !== false ? membro.organizacao_id : null) || dono?.organizacao_id || (proprietario ? ORG_LEGADO : null);
  if (!origem) return null;

  let atual = origem;
  let suporte = false;
  const { data: sessao } = await db.from('sessoes_suporte').select('organizacao_id, expira_em').eq('email', alvo).maybeSingle();
  if (sessao && new Date(sessao.expira_em).getTime() > Date.now() && sessao.organizacao_id !== origem) {
    const { data: pode } = await db.rpc('rm_pode_gerir_org', { p_email: alvo, p_alvo: sessao.organizacao_id });
    if (pode === true || proprietario) {
      atual = sessao.organizacao_id;
      suporte = true;
    }
  }
  const { data: org } = await db.from('organizacoes').select('id, nome, tipo, status, limites, pai_id').eq('id', atual).maybeSingle();
  if (!org) return null;
  if (org.status !== 'ativa' && !proprietario && !suporte) return { ...org, bloqueada: true, suporte, origem };
  return { ...org, suporte, origem, proprietario };
}

const json = (corpo, status) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Contexto de toda rota da equipe: sessão válida, pessoa ativa e banco preso à empresa dela.
 * @returns {Promise<{ erro?: Response, email, papel, admin, org, db, dbGlobal }>}
 */
export async function contextoDaRequisicao(request, { exigirAdmin = false } = {}) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return { erro: json({ ok: false, mensagem: 'Sessão expirada.' }, 401) };
  const email = normalizarEmail(sessao.sub);
  const dbGlobal = getSupabaseAdmin();
  if (!dbGlobal) return { erro: json({ ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.' }, 503) };

  const org = await organizacaoAtual(dbGlobal, email);
  if (!org) return { erro: json({ ok: false, mensagem: 'Seu acesso não está ligado a nenhuma empresa.' }, 403) };
  if (org.bloqueada) return { erro: json({ ok: false, mensagem: 'O acesso da sua empresa está suspenso. Fale com o fornecedor do sistema.' }, 403) };

  const { data: membro } = org.legado
    ? await dbGlobal.from('equipe_usuarios').select('papel, ativo').eq('email', email).maybeSingle()
    : await dbGlobal.from('equipe_usuarios').select('papel, ativo, organizacao_id').eq('email', email).maybeSingle();
  if (membro && membro.ativo === false) return { erro: json({ ok: false, mensagem: 'Seu acesso está desativado.' }, 403) };
  const papel = org.suporte ? 'administrador' : resolverPapel(email, membro ? [{ email, ...membro }] : [], process.env.RM_ADMIN_EMAILS);
  if (!papel) return { erro: json({ ok: false, mensagem: 'Seu acesso está desativado.' }, 403) };
  const admin = papel === 'administrador';
  if (exigirAdmin && !admin) return { erro: json({ ok: false, mensagem: 'Apenas administradores podem fazer isso.' }, 403) };

  return { email, papel, admin, org, db: org.legado ? dbGlobal : escopo(dbGlobal, org.id), dbGlobal };
}

/** Acesso ao banco preso à empresa dona de um registro (rotas sem sessão: webhooks, links públicos). */
export function escopoDoRegistro(dbGlobal, registro) {
  return registro?.organizacao_id ? escopo(dbGlobal, registro.organizacao_id) : dbGlobal;
}

/** Erro de limite do plano vindo do banco → mensagem para a pessoa. */
export function mensagemLimite(error) {
  const m = /Limite do plano atingido: (\d+) de (\d+) \(([a-z_]+)\)/.exec(error?.message || '');
  if (!m) return null;
  const nomes = { usuarios: 'usuários', empresas: 'empresas clientes', assinantes: 'empresas assinantes', numeros_whatsapp: 'números de WhatsApp' };
  return `Seu plano permite até ${m[2]} ${nomes[m[3]] || m[3]}. Fale com o fornecedor do sistema para ampliar.`;
}

// ------------------------------------------------------------------------------
// Empresa da requisição em andamento (para módulos com acesso ao banco compartilhado, ex.: Google Agenda)
// ------------------------------------------------------------------------------
const empresaEmAndamento = new AsyncLocalStorage();

/** Executa `fn` com o banco preso à empresa `org` para os módulos que usam `bancoDaEmpresaAtual()`. */
export const executarNaEmpresa = (org, fn) => (org ? empresaEmAndamento.run(org, fn) : fn());

/** Banco com escopo da empresa da requisição em andamento (sem empresa: acesso normal). */
export function bancoDaEmpresaAtual(dbGlobal) {
  const org = empresaEmAndamento.getStore();
  return org ? escopo(dbGlobal, org) : dbGlobal;
}

/** Empresas que têm uma configuração salva (ex.: Google Agenda conectado), para tarefas agendadas. */
export async function empresasComConfiguracao(dbGlobal, chave) {
  const { data, error } = await dbGlobal.from('sistema_config').select('organizacao_id, valor').eq('chave', chave);
  // Banco ainda sem a migração multiempresa: uma empresa só (sem filtro)
  if (error) return [{ organizacao_id: null, valor: null }];
  return data || [];
}

/**
 * Roda a rota inteira dentro da empresa de quem está logado (para módulos que usam `bancoDaEmpresaAtual`).
 * Sem sessão, a própria rota recusa; empresa suspensa é barrada aqui.
 */
export async function naEmpresaDaSessao(request, fn) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const dbGlobal = getSupabaseAdmin();
  if (!sessao?.sub || !dbGlobal) return fn();
  const org = await organizacaoAtual(dbGlobal, sessao.sub);
  if (!org) return json({ ok: false, mensagem: 'Seu acesso não está ligado a nenhuma empresa.' }, 403);
  if (org.bloqueada) return json({ ok: false, mensagem: 'O acesso da sua empresa está suspenso.' }, 403);
  return executarNaEmpresa(org.legado ? null : org.id, fn);
}

/**
 * A pessoa gerencia outras empresas? Donos da plataforma e administradores da plataforma: todas.
 * Administradores de uma revenda: as assinantes dela. Os demais: nenhuma.
 * @returns {Promise<{ nivel: 'plataforma'|'revenda', orgId: string } | null>}
 */
export async function perfilDeGestao(dbGlobal, email) {
  const alvo = normalizarEmail(email);
  if (listaAdministradores(process.env.RM_ADMIN_EMAILS).has(alvo)) return { nivel: 'plataforma', orgId: ORG_PLATAFORMA, dono: true };
  const { data: dono } = await dbGlobal.from('rm_admins_proprietarios').select('email').eq('email', alvo).maybeSingle();
  if (dono) return { nivel: 'plataforma', orgId: ORG_PLATAFORMA, dono: true };
  const { data: membro, error } = await dbGlobal.from('equipe_usuarios').select('organizacao_id, papel, ativo').eq('email', alvo).maybeSingle();
  if (error || !membro || membro.ativo === false || membro.papel !== 'administrador' || !membro.organizacao_id) return null;
  const { data: org } = await dbGlobal.from('organizacoes').select('id, tipo, status').eq('id', membro.organizacao_id).maybeSingle();
  if (!org || org.status !== 'ativa' || !['plataforma', 'revenda'].includes(org.tipo)) return null;
  return { nivel: org.tipo, orgId: org.id, dono: false };
}

/** Quem gerencia (perfilDeGestao) pode mexer nesta organização? */
export function podeGerir(gestao, org) {
  if (!gestao || !org) return false;
  if (gestao.nivel === 'plataforma') return org.tipo !== 'plataforma';
  return org.tipo === 'assinante' && org.pai_id === gestao.orgId;
}
