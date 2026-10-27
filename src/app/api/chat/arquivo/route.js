import { acessoAoChat, podeVerContato, podeVerConversa } from '@/lib/server/canais/chat';
import { linkTemporario } from '@/lib/server/canais/midia';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Abre um arquivo do Chat por um link temporário, depois de conferir a permissão:
 *  ?m=<mensagem>[&baixar=1]   arquivo da mensagem
 *  ?c=<contato>               foto do contato
 */
export async function GET(request) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const { ctx, perm } = r;
  const p = new URL(request.url).searchParams;
  const naoAchou = () => new Response('Arquivo não encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  let caminho = null;
  let baixar = null;

  if (p.get('m')) {
    if (!isValidUUID(p.get('m'))) return naoAchou();
    const { data: msg } = await ctx.db.from('mensagens').select('conversa_id, midia').eq('id', p.get('m')).maybeSingle();
    if (!msg?.midia?.caminho) return naoAchou();
    const { data: conversa } = await ctx.db.from('conversas').select('*').eq('id', msg.conversa_id).maybeSingle();
    if (!podeVerConversa(perm, conversa)) return naoAchou();
    caminho = msg.midia.caminho;
    if (p.get('baixar')) baixar = msg.midia.nome || caminho.split('/').pop();
  } else if (p.get('c')) {
    if (!(await podeVerContato(ctx.db, perm, p.get('c')))) return naoAchou();
    const { data: contato } = await ctx.db.from('contatos').select('foto_url').eq('id', p.get('c')).maybeSingle();
    caminho = contato?.foto_url && !/^https?:/.test(contato.foto_url) ? contato.foto_url : null;
  }
  if (!caminho) return naoAchou();
  try {
    return new Response(null, { status: 302, headers: { Location: await linkTemporario(caminho, { baixar }), 'Cache-Control': 'private, max-age=240' } });
  } catch {
    return naoAchou();
  }
}
