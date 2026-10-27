import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { permissaoDoChat, podeVerResposta, validarResposta } from '@/lib/server/canais/chat';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Respostas rápidas do Chat (usadas com "/atalho").
 *  GET                                           as que a pessoa pode usar
 *  POST { atalho, texto, alcance, departamento } cria (alcance empresa/departamento: só administradores)
 *  DELETE { id }                                 apaga (autor ou administrador)
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function inicio(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  if (!perm.administrador && !perm.modulos.includes('chat')) return { erro: json({ ok: false, mensagem: 'Seu perfil não tem acesso ao Chat.' }, 403) };
  return { ctx, perm };
}

export async function GET(request) {
  const r = await inicio(request);
  if (r.erro) return r.erro;
  const { data, error } = await r.ctx.db.from('respostas_rapidas').select('*').order('atalho');
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, respostas: (data || []).filter((x) => podeVerResposta(r.perm, x)) });
}

export async function POST(request) {
  const r = await inicio(request);
  if (r.erro) return r.erro;
  let dados;
  try {
    dados = validarResposta(await request.json().catch(() => ({})), { admin: r.perm.administrador });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  const { data, error } = await r.ctx.db
    .from('respostas_rapidas')
    .insert([{ ...dados, autor_email: r.perm.email }])
    .select('*')
    .single();
  if (error) return json({ ok: false, mensagem: /duplicate|unique|23505/i.test(`${error.code} ${error.message}`) ? `Você já tem o atalho /${dados.atalho}.` : error.message }, 400);
  return json({ ok: true, resposta: data }, 201);
}

export async function DELETE(request) {
  const r = await inicio(request);
  if (r.erro) return r.erro;
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Resposta inválida.' }, 400);
  const { data: resposta } = await r.ctx.db.from('respostas_rapidas').select('*').eq('id', body.id).maybeSingle();
  if (!resposta || !podeVerResposta(r.perm, resposta)) return json({ ok: false, mensagem: 'Resposta não encontrada.' }, 404);
  if (!r.perm.administrador && resposta.autor_email !== r.perm.email) return json({ ok: false, mensagem: 'Só quem criou (ou um administrador) pode apagar.' }, 403);
  await r.ctx.db.from('respostas_rapidas').delete().eq('id', resposta.id);
  return json({ ok: true });
}
