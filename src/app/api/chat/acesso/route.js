import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { CHAVE_ACESSO_CHAT, ACESSO_CHAT_PADRAO, validarAcessoChat } from '@/lib/canais';
import { sanitizeEmail } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Acesso de uma pessoa ao Chat (administradores):
 *  GET ?email=                                               configuração atual e canais da empresa
 *  PUT { email, verOutros, controleCanais, canais: [ids] }
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function ler(db) {
  const { data } = await db.from('sistema_config').select('valor').eq('chave', CHAVE_ACESSO_CHAT).maybeSingle();
  return data?.valor && typeof data.valor === 'object' ? data.valor : {};
}

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const email = sanitizeEmail(new URL(request.url).searchParams.get('email'));
  if (!email) return json({ ok: false, mensagem: 'E-mail inválido.' }, 400);
  const [todos, { data: canais }] = await Promise.all([ler(ctx.db), ctx.db.from('canais').select('id, nome, numero, tipo, ativo').order('nome')]);
  // Só os canais ativos aparecem para liberar; os inativos marcados continuam guardados para quando voltarem
  return json({ ok: true, acesso: { ...ACESSO_CHAT_PADRAO, ...validarAcessoChat(todos[email] || {}) }, canais: (canais || []).filter((c) => c.ativo !== false) });
}

export async function PUT(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const body = (await request.json().catch(() => null)) || {};
  const email = sanitizeEmail(body.email);
  if (!email) return json({ ok: false, mensagem: 'E-mail inválido.' }, 400);
  const acesso = validarAcessoChat(body);
  // Só canais desta empresa
  const { data: daEmpresa } = await ctx.db.from('canais').select('id');
  const validos = new Set((daEmpresa || []).map((c) => c.id));
  acesso.canais = acesso.canais.filter((id) => validos.has(id));
  const todos = await ler(ctx.db);
  todos[email] = acesso;
  const { error } = await ctx.db.from('sistema_config').upsert({ chave: CHAVE_ACESSO_CHAT, valor: todos, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, acesso });
}
