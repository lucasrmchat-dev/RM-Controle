import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { fixarConversa, permissaoDoChat, semModulo } from '@/lib/server/canais/chat';
import { consumirLimite } from '@/lib/server/protecao';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/** POST { conversa_id, fixar: true|false }: fixa ou desafixa a conversa no topo da lista de quem pediu. */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const bloqueio = semModulo(perm, 'chat', 'ao Chat');
  if (bloqueio) return json({ ok: false, mensagem: bloqueio }, 403);
  if (!(await consumirLimite(`chat_fixar_${perm.email}`, 60, 60))) return json({ ok: false, mensagem: 'Muitas alterações seguidas. Aguarde um instante.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.conversa_id)) return json({ ok: false, mensagem: 'Conversa inválida.' }, 400);
  // Só conversas que existem na empresa da pessoa
  const { data: conversa } = await ctx.db.from('conversas').select('id').eq('id', body.conversa_id).maybeSingle();
  if (!conversa) return json({ ok: false, mensagem: 'Conversa não encontrada.' }, 404);
  try {
    const fixadas = await fixarConversa(ctx.db, perm.email, conversa.id, body.fixar !== false);
    return json({ ok: true, fixadas });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 500);
  }
}
