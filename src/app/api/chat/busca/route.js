import { acessoAoChat, juntarDetalhes, podeVerConversa } from '@/lib/server/canais/chat';

export const dynamic = 'force-dynamic';

/**
 * Busca de mensagens em todas as conversas que a pessoa pode ver.
 *  GET ?q=texto&dias=7|30|90|365   (o período limita o peso da busca)
 */
const PERIODOS = [7, 30, 90, 365];
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const p = new URL(request.url).searchParams;
  const termo = String(p.get('q') || '').trim().slice(0, 100);
  if (termo.length < 2) return json({ ok: false, mensagem: 'Digite ao menos 2 letras para buscar.' }, 400);
  const dias = PERIODOS.includes(Number(p.get('dias'))) ? Number(p.get('dias')) : 30;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  // % e _ do texto são literais (não curingas)
  const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { db } = r.ctx;
  const { data, error } = await db
    .from('mensagens')
    .select('id, conversa_id, direcao, tipo, conteudo, autor_nome, criado_em, apagada_para, apagada_em')
    .ilike('conteudo', padrao)
    .gte('criado_em', desde)
    .neq('tipo', 'reacao')
    .order('criado_em', { ascending: false })
    .limit(200);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  const achadas = (data || []).filter((m) => !(m.apagada_para || []).includes(r.perm.email) && !(m.apagada_em && !r.perm.administrador));
  const ids = [...new Set(achadas.map((m) => m.conversa_id))];
  const { data: conversas } = ids.length ? await db.from('conversas').select('*').in('id', ids) : { data: [] };
  const visiveis = (conversas || []).filter((c) => podeVerConversa(r.perm, c));
  const detalhadas = new Map((await juntarDetalhes(db, visiveis)).map((c) => [c.id, c]));
  const resultados = achadas
    .filter((m) => detalhadas.has(m.conversa_id))
    .slice(0, 60)
    .map(({ apagada_para, apagada_em, ...m }) => ({ ...m, conversa: detalhadas.get(m.conversa_id) }));
  return json({ ok: true, resultados, dias });
}
