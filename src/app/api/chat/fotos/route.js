import { acessoAoChat, podeVerConversa } from '@/lib/server/canais/chat';
import { linksTemporarios } from '@/lib/server/canais/midia';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Fotos de vários contatos numa chamada só (em vez de uma requisição por avatar).
 *  GET ?ids=uuid,uuid,...   (até 60) → { fotos: { [id]: link temporário de 1 hora } }
 * Só devolve foto de contato que a pessoa pode ver (administrador: todos; demais: de conversas visíveis).
 */
export async function GET(request) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const ids = [...new Set(String(new URL(request.url).searchParams.get('ids') || '').split(',').filter(isValidUUID))].slice(0, 60);
  if (!ids.length) return Response.json({ ok: true, fotos: {} });
  const { db } = r.ctx;
  const { data: contatos } = await db.from('contatos').select('id, foto_url').in('id', ids).not('foto_url', 'is', null);
  let permitidos = new Set((contatos || []).map((c) => c.id));
  if (!r.perm.administrador && permitidos.size) {
    const { data: conversas } = await db.from('conversas').select('*').in('contato_id', [...permitidos]);
    permitidos = new Set((conversas || []).filter((c) => podeVerConversa(r.perm, c)).map((c) => c.contato_id));
  }
  const alvos = (contatos || []).filter((c) => permitidos.has(c.id) && !/^https?:/.test(c.foto_url));
  const links = await linksTemporarios(alvos.map((c) => c.foto_url), 3600).catch(() => ({}));
  const fotos = Object.fromEntries(alvos.filter((c) => links[c.foto_url]).map((c) => [c.id, links[c.foto_url]]));
  return Response.json({ ok: true, fotos }, { headers: { 'Cache-Control': 'private, no-store' } });
}
