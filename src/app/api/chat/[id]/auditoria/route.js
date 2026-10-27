import { auditoriaDaConversa, carregarConversa } from '@/lib/server/canais/chat';

export const dynamic = 'force-dynamic';

/** Auditoria da conversa (administradores): quem iniciou, viu, assumiu, transferiu, resolveu, editou ou apagou. */
export async function GET(request, { params }) {
  const r = await carregarConversa(request, params.id);
  if (r.erro) return r.erro;
  if (!r.perm.administrador) return Response.json({ ok: false, mensagem: 'Só administradores veem a auditoria.' }, { status: 403 });
  return Response.json({ ok: true, eventos: await auditoriaDaConversa(r.ctx.db, r.conversa) }, { headers: { 'Cache-Control': 'no-store' } });
}
