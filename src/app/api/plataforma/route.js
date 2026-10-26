import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { garantirContaAuth, removerContaAuth } from '@/lib/server/acesso';
import { consumirLimite, ipDaRequisicao } from '@/lib/server/protecao';
import { escopo, mensagemLimite, perfilDeGestao, podeGerir, ORG_PLATAFORMA } from '@/lib/server/organizacao';
import { listaAdministradores, normalizarEmail } from '@/lib/roles';
import { isValidUUID, sanitizeEmail, SENHA_MAX } from '@/lib/sanitize';
import { validarContrato, validarLimites, validarOrganizacao } from '@/lib/plataforma';

export const dynamic = 'force-dynamic';

/**
 * Painel da plataforma (dono do RM Controle e revendas).
 *  GET                                     empresas que a pessoa gerencia, com uso, limites e contrato
 *  POST { acao: 'criar', ... }             nova revenda ou assinante + contrato + primeiro administrador
 *       { acao: 'editar', id, ... }        dados e limites
 *       { acao: 'status', id, status }     ativa | suspensa | cancelada
 *       { acao: 'contrato', id, ... }      novo contrato (o anterior é encerrado)
 *       { acao: 'entrar_suporte', id }     abre a empresa por 2 horas, com registro na auditoria DELA
 *       { acao: 'sair_suporte' }
 * Tudo conferido no servidor: revenda só mexe nas assinantes dela; ninguém mexe na plataforma.
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
const HORAS_SUPORTE = 2;

async function contexto(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return { erro: json({ ok: false, mensagem: 'Sessão expirada.' }, 401) };
  const db = getSupabaseAdmin();
  if (!db) return { erro: json({ ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.' }, 503) };
  const email = normalizarEmail(sessao.sub);
  const { error: semTabela } = await db.from('organizacoes').select('id').limit(1);
  if (semTabela) return { erro: json({ ok: false, mensagem: 'Rode supabase/migration_multiempresa.sql no Supabase para usar o painel da plataforma.' }, 503) };
  const gestao = await perfilDeGestao(db, email);
  if (!gestao) return { erro: json({ ok: false, mensagem: 'Seu acesso não gerencia outras empresas.' }, 403) };
  return { db, email, gestao };
}

// Registro na auditoria da empresa afetada: a assinante vê quem da plataforma mexeu nela (LGPD)
async function auditar(db, orgId, email, acao, detalhes, request) {
  await escopo(db, orgId)
    .from('auditoria_logs')
    .insert([{ usuario_email: email, usuario_nome: email, operador_nome: email, ip_origem: ipDaRequisicao(request), acao, detalhes: { modulo: 'Plataforma', ...detalhes } }])
    .then(() => {}, () => {});
}

async function carregarOrg(db, id) {
  if (!isValidUUID(id)) return null;
  const { data } = await db.from('organizacoes').select('*').eq('id', id).maybeSingle();
  return data || null;
}

const contar = async (consulta) => (await consulta).count || 0;

export async function GET(request) {
  const { erro, db, gestao, email } = await contexto(request);
  if (erro) return erro;
  let consulta = db.from('organizacoes').select('*').neq('tipo', 'plataforma').order('criado_em');
  if (gestao.nivel === 'revenda') consulta = consulta.eq('pai_id', gestao.orgId);
  const { data: orgs, error } = await consulta;
  if (error) return json({ ok: false, mensagem: error.message }, 500);

  const ids = (orgs || []).map((o) => o.id);
  const { data: contratos } = ids.length
    ? await db.from('contratos_organizacao').select('*').in('cliente_id', ids).neq('status', 'encerrado').order('criado_em', { ascending: false })
    : { data: [] };
  const organizacoes = await Promise.all(
    (orgs || []).map(async (o) => ({
      ...o,
      uso: {
        usuarios: await contar(db.from('equipe_usuarios').select('id', { count: 'exact', head: true }).eq('organizacao_id', o.id).eq('ativo', true)),
        empresas: await contar(db.from('empresas').select('id', { count: 'exact', head: true }).eq('organizacao_id', o.id)),
        ...(o.tipo === 'revenda' ? { assinantes: await contar(db.from('organizacoes').select('id', { count: 'exact', head: true }).eq('pai_id', o.id).neq('status', 'cancelada')) } : {}),
      },
      contrato: (contratos || []).find((c) => c.cliente_id === o.id) || null,
    }))
  );
  const { data: sessao } = await db.from('sessoes_suporte').select('organizacao_id, expira_em').eq('email', email).maybeSingle();
  return json({ ok: true, gestao: { nivel: gestao.nivel }, organizacoes, suporte: sessao && new Date(sessao.expira_em) > new Date() ? sessao : null });
}

function validarSenhaInicial(senha) {
  if (typeof senha !== 'string' || senha.length < 8) return 'A senha inicial precisa ter pelo menos 8 caracteres.';
  if (senha.length > SENHA_MAX || /[\u0000-\u001F\u007F]/.test(senha)) return 'Senha inicial inválida.';
  return null;
}

export async function POST(request) {
  const { erro, db, email, gestao } = await contexto(request);
  if (erro) return erro;
  if (!(await consumirLimite(`plataforma_${email}`, 60, 60))) return json({ ok: false, mensagem: 'Muitas ações seguidas. Aguarde um minuto.' }, 429);
  const body = (await request.json().catch(() => null)) || {};

  try {
    // ---------------------------------------------------------------- criar
    if (body.acao === 'criar') {
      const dados = validarOrganizacao(body);
      if (gestao.nivel === 'revenda' && dados.tipo !== 'assinante') return json({ ok: false, mensagem: 'Revendas criam apenas empresas assinantes.' }, 403);
      let paiId = gestao.nivel === 'revenda' ? gestao.orgId : ORG_PLATAFORMA;
      if (gestao.nivel === 'plataforma' && dados.tipo === 'assinante' && body.pai_id) {
        const pai = await carregarOrg(db, body.pai_id);
        if (!pai || !['plataforma', 'revenda'].includes(pai.tipo)) return json({ ok: false, mensagem: 'Revenda não encontrada.' }, 400);
        paiId = pai.id;
      }
      const limites = validarLimites(body.limites, dados.tipo);
      const contrato = body.contrato ? validarContrato(body.contrato) : null;

      // Primeiro administrador da nova empresa (obrigatório: alguém precisa entrar)
      const adminEmail = sanitizeEmail(body.admin?.email);
      if (!adminEmail) return json({ ok: false, mensagem: 'Informe o e-mail do administrador da nova empresa.' }, 400);
      const erroSenha = validarSenhaInicial(body.admin?.senha);
      if (erroSenha) return json({ ok: false, mensagem: erroSenha }, 400);
      const { data: jaExiste } = await db.from('equipe_usuarios').select('id').eq('email', adminEmail).maybeSingle();
      if (jaExiste || listaAdministradores(process.env.RM_ADMIN_EMAILS).has(adminEmail)) {
        return json({ ok: false, mensagem: 'Este e-mail já é usado por alguém no sistema. Use outro e-mail para o administrador.' }, 409);
      }

      const { data: org, error: erroOrg } = await db
        .from('organizacoes')
        .insert([{ ...dados, pai_id: paiId, limites, criado_por: email }])
        .select('*')
        .single();
      if (erroOrg) return json({ ok: false, mensagem: mensagemLimite(erroOrg) || erroOrg.message }, mensagemLimite(erroOrg) ? 403 : 400);

      const conta = await garantirContaAuth(adminEmail, body.admin.senha, { name: body.admin?.nome || '', papel: 'administrador' });
      if (!conta.ok) {
        await db.from('organizacoes').delete().eq('id', org.id);
        return json({ ok: false, mensagem: `Não foi possível criar o login do administrador: ${conta.erro}` }, 500);
      }
      const { error: erroAdmin } = await escopo(db, org.id)
        .from('equipe_usuarios')
        .insert([{ nome: String(body.admin?.nome || adminEmail.split('@')[0]).trim().slice(0, 120), email: adminEmail, senha: body.admin.senha, papel: 'administrador', ativo: true, primeiro_acesso_concluido: false }]);
      if (erroAdmin) {
        await removerContaAuth(adminEmail);
        await db.from('organizacoes').delete().eq('id', org.id);
        return json({ ok: false, mensagem: mensagemLimite(erroAdmin) || `Não foi possível cadastrar o administrador: ${erroAdmin.message}` }, 400);
      }
      if (contrato) {
        await db.from('contratos_organizacao').insert([{ ...contrato, fornecedor_id: paiId, cliente_id: org.id, limites, criado_por: email }]);
      }
      await auditar(db, org.id, email, 'plataforma_criou_empresa', { empresa: org.nome, tipo: org.tipo, administrador: adminEmail }, request);
      return json({ ok: true, organizacao: org }, 201);
    }

    // ------------------------------------------------------------ sair do suporte
    if (body.acao === 'sair_suporte') {
      const { data: sessao } = await db.from('sessoes_suporte').select('organizacao_id').eq('email', email).maybeSingle();
      await db.from('sessoes_suporte').delete().eq('email', email);
      if (sessao) await auditar(db, sessao.organizacao_id, email, 'plataforma_saiu_suporte', {}, request);
      return json({ ok: true });
    }

    // Demais ações: sempre sobre uma empresa que a pessoa pode gerir
    const org = await carregarOrg(db, body.id);
    if (!org || !podeGerir(gestao, org)) return json({ ok: false, mensagem: 'Empresa não encontrada.' }, 404);

    if (body.acao === 'editar') {
      const dados = validarOrganizacao({ ...org, ...body }, { exigirTipo: false });
      const campos = { ...dados, atualizado_em: new Date().toISOString() };
      if (body.limites !== undefined) campos.limites = validarLimites(body.limites, org.tipo);
      const { data, error } = await db.from('organizacoes').update(campos).eq('id', org.id).select('*').single();
      if (error) return json({ ok: false, mensagem: error.message }, 400);
      await auditar(db, org.id, email, 'plataforma_editou_empresa', { limites: campos.limites }, request);
      return json({ ok: true, organizacao: data });
    }

    if (body.acao === 'status') {
      if (!['ativa', 'suspensa', 'cancelada'].includes(body.status)) return json({ ok: false, mensagem: 'Situação inválida.' }, 400);
      const motivo = String(body.motivo || '').trim().slice(0, 300) || null;
      const { data, error } = await db.from('organizacoes').update({ status: body.status, motivo_status: motivo, atualizado_em: new Date().toISOString() }).eq('id', org.id).select('*').single();
      if (error) return json({ ok: false, mensagem: error.message }, 400);
      // Revenda suspensa: as assinantes dela continuam (são clientes finais); a revenda só perde o painel
      await auditar(db, org.id, email, `plataforma_${body.status === 'ativa' ? 'reativou' : body.status === 'suspensa' ? 'suspendeu' : 'cancelou'}_empresa`, { motivo }, request);
      return json({ ok: true, organizacao: data });
    }

    if (body.acao === 'contrato') {
      const contrato = validarContrato(body.contrato);
      const limites = body.limites !== undefined ? validarLimites(body.limites, org.tipo) : org.limites;
      await db.from('contratos_organizacao').update({ status: 'encerrado', fim: contrato.inicio, atualizado_em: new Date().toISOString() }).eq('cliente_id', org.id).neq('status', 'encerrado');
      const { data, error } = await db
        .from('contratos_organizacao')
        .insert([{ ...contrato, fornecedor_id: org.pai_id, cliente_id: org.id, limites, criado_por: email }])
        .select('*')
        .single();
      if (error) return json({ ok: false, mensagem: error.message }, 400);
      // O plano do contrato vira o limite efetivo da empresa
      await db.from('organizacoes').update({ limites, atualizado_em: new Date().toISOString() }).eq('id', org.id);
      await auditar(db, org.id, email, 'plataforma_registrou_contrato', { plano: contrato.plano, valor_mensal: contrato.valor_mensal, limites }, request);
      return json({ ok: true, contrato: data });
    }

    if (body.acao === 'entrar_suporte') {
      if (org.tipo !== 'assinante') return json({ ok: false, mensagem: 'Só é possível entrar em empresas assinantes.' }, 400);
      const motivo = String(body.motivo || '').trim().slice(0, 300);
      if (motivo.length < 3) return json({ ok: false, mensagem: 'Diga o motivo do acesso. Ele fica registrado para a empresa.' }, 400);
      const expira = new Date(Date.now() + HORAS_SUPORTE * 3600 * 1000).toISOString();
      const { error } = await db.from('sessoes_suporte').upsert({ email, organizacao_id: org.id, motivo, inicio: new Date().toISOString(), expira_em: expira }, { onConflict: 'email' });
      if (error) return json({ ok: false, mensagem: error.message }, 500);
      await auditar(db, org.id, email, 'plataforma_entrou_suporte', { motivo, expira_em: expira }, request);
      return json({ ok: true, expira_em: expira });
    }

    return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
}
