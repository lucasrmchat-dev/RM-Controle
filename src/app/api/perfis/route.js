import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { normalizarEmail } from '@/lib/roles';
import { isValidUUID } from '@/lib/sanitize';
import { MODULOS } from '@/lib/perfis';

export const dynamic = 'force-dynamic';

const COLUNAS = 'id, nome, descricao, administrador, modulos, todos_departamentos, departamentos, created_at, updated_at';
const IDS_MODULOS = MODULOS.map((m) => m.id);

const json = (corpo, status = 200) => Response.json(corpo, { status });

async function autenticar(request, { exigirAdmin = false } = {}) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return { erro: json({ ok: false, mensagem: 'Sessão expirada.' }, 401) };
  const acesso = await obterAcessoServidor(normalizarEmail(sessao.sub));
  if (!acesso.liberado) return { erro: json({ ok: false, mensagem: 'Seu acesso está desativado.' }, 403) };
  if (exigirAdmin && !(acesso.proprietario || acesso.papel === 'administrador')) {
    return { erro: json({ ok: false, mensagem: 'Apenas administradores gerenciam os perfis de acesso.' }, 403) };
  }
  const db = getSupabaseAdmin();
  if (!db) return { erro: json({ ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.' }, 503) };
  return { db };
}

const tabelaAusente = (error) => /perfis_acesso|relation .* does not exist|schema cache/i.test(error?.message || '');
const AVISO_MIGRACAO = 'Rode o script supabase/migration_perfis_acesso.sql no Supabase para usar perfis de acesso.';

/** Valida e normaliza os campos de um perfil. */
function camposPerfil(body, parcial = false) {
  const campos = {};
  if (!parcial || body.nome !== undefined) {
    const nome = String(body.nome || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!nome) return { erro: 'Dê um nome ao perfil.' };
    campos.nome = nome;
  }
  if (body.descricao !== undefined) campos.descricao = String(body.descricao || '').trim().slice(0, 200);
  if (body.administrador !== undefined) campos.administrador = Boolean(body.administrador);
  if (body.modulos !== undefined) {
    if (!Array.isArray(body.modulos)) return { erro: 'Módulos inválidos.' };
    campos.modulos = [...new Set(body.modulos.map(String).filter((m) => IDS_MODULOS.includes(m)))];
  }
  if (body.todos_departamentos !== undefined) campos.todos_departamentos = Boolean(body.todos_departamentos);
  if (body.departamentos !== undefined) {
    if (!Array.isArray(body.departamentos) || body.departamentos.length > 100) return { erro: 'Departamentos inválidos.' };
    campos.departamentos = [...new Set(body.departamentos.map((d) => String(d).trim().slice(0, 60)).filter(Boolean))];
  }
  if (!parcial && !campos.administrador && !(campos.modulos || []).length) return { erro: 'Escolha pelo menos um módulo.' };
  return { campos };
}

/** Perfil "Administrador" vira papel administrador no banco (as regras de segurança usam o papel). */
async function sincronizarPapelDosMembros(db, perfilId, administrador) {
  await db.from('equipe_usuarios').update({ papel: administrador ? 'administrador' : 'suporte' }).eq('perfil_id', perfilId);
}

export async function GET(request) {
  const { erro, db } = await autenticar(request);
  if (erro) return erro;
  const { data, error } = await db.from('perfis_acesso').select(COLUNAS).order('nome');
  if (error) return tabelaAusente(error) ? json({ ok: true, perfis: [], migracao_pendente: true, mensagem: AVISO_MIGRACAO }) : json({ ok: false, mensagem: error.message }, 500);
  // Quantos membros usam cada perfil (para a tela de perfis)
  const { data: membros } = await db.from('equipe_usuarios').select('perfil_id');
  const uso = {};
  (membros || []).forEach((m) => m.perfil_id && (uso[m.perfil_id] = (uso[m.perfil_id] || 0) + 1));
  return json({ ok: true, perfis: (data || []).map((p) => ({ ...p, membros: uso[p.id] || 0 })) });
}

export async function POST(request) {
  const { erro, db } = await autenticar(request, { exigirAdmin: true });
  if (erro) return erro;
  const body = (await request.json().catch(() => null)) || {};
  const { campos, erro: erroCampos } = camposPerfil(body);
  if (erroCampos) return json({ ok: false, mensagem: erroCampos }, 400);
  const { data, error } = await db.from('perfis_acesso').insert([campos]).select(COLUNAS).single();
  if (error) {
    if (tabelaAusente(error)) return json({ ok: false, mensagem: AVISO_MIGRACAO }, 503);
    if (/duplicate|unique/i.test(error.message)) return json({ ok: false, mensagem: 'Já existe um perfil com esse nome.' }, 409);
    return json({ ok: false, mensagem: error.message }, 500);
  }
  return json({ ok: true, perfil: data }, 201);
}

export async function PATCH(request) {
  const { erro, db } = await autenticar(request, { exigirAdmin: true });
  if (erro) return erro;
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Perfil inválido.' }, 400);
  const { campos, erro: erroCampos } = camposPerfil(body, true);
  if (erroCampos) return json({ ok: false, mensagem: erroCampos }, 400);
  const { data, error } = await db
    .from('perfis_acesso')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select(COLUNAS)
    .maybeSingle();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return json({ ok: false, mensagem: 'Já existe um perfil com esse nome.' }, 409);
    return json({ ok: false, mensagem: error.message }, 500);
  }
  if (!data) return json({ ok: false, mensagem: 'Perfil não encontrado.' }, 404);
  if (campos.administrador !== undefined) await sincronizarPapelDosMembros(db, data.id, data.administrador);
  return json({ ok: true, perfil: data });
}

export async function DELETE(request) {
  const { erro, db } = await autenticar(request, { exigirAdmin: true });
  if (erro) return erro;
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Perfil inválido.' }, 400);
  // Quem tinha o perfil volta ao acesso padrão (suporte), nunca fica com acesso de administrador sobrando
  await db.from('equipe_usuarios').update({ perfil_id: null, papel: 'suporte' }).eq('perfil_id', body.id);
  const { error } = await db.from('perfis_acesso').delete().eq('id', body.id);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true });
}
