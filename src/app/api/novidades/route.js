import { contextoDaRequisicao, escopo, ORG_LEGADO, ORG_PLATAFORMA } from '@/lib/server/organizacao';
import { ehDesenvolvimentoServidor } from '@/lib/server/desenvolvimento';
import { NOVIDADES } from '@/lib/novidades';

export const dynamic = 'force-dynamic';

/**
 * Publicação das novidades (notas de versão). O texto vem do código (lib/novidades.js);
 * aqui fica só quem publicou e quando. Qualquer membro lê; só a área de desenvolvimento publica.
 */
const CHAVE = 'novidades_publicacao';
const json = (corpo, status = 200) => Response.json(corpo, { status });

// As novidades são do produto (valem para todas as assinantes): a publicação fica na configuração da plataforma.
// Quem publica é a área de desenvolvimento da empresa em que a pessoa está.
async function autenticar(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx;
  return { ...ctx, dbPlataforma: ctx.org.legado ? ctx.dbGlobal : escopo(ctx.dbGlobal, ORG_PLATAFORMA) };
}

// Publicar vale para todas as assinantes: só a equipe da casa (plataforma ou RM Chat), na própria empresa.
// Administrador de uma assinante cliente, ou alguém da casa em modo suporte, não publica.
const ehDaCasa = (org) => org.legado || (!org.suporte && [ORG_PLATAFORMA, ORG_LEGADO].includes(org.id));

async function lerPublicacao(db) {
  const { data, error } = await db.from('sistema_config').select('valor').eq('chave', CHAVE).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.valor && typeof data.valor === 'object' ? data.valor : {};
}

export async function GET(request) {
  const { erro, db, dbPlataforma, email, org } = await autenticar(request);
  if (erro) return erro;
  try {
    const [publicacao, dev] = await Promise.all([lerPublicacao(dbPlataforma), ehDesenvolvimentoServidor(db, email)]);
    return json({ ok: true, publicacao, desenvolvimento: dev && ehDaCasa(org) });
  } catch (e) {
    return json({ ok: false, mensagem: `Não foi possível ler as novidades: ${e.message}` }, 500);
  }
}

export async function POST(request) {
  const { erro, db, dbPlataforma, email, org } = await autenticar(request);
  if (erro) return erro;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!NOVIDADES.some((n) => n.id === id)) return json({ ok: false, mensagem: 'Novidade desconhecida.' }, 400);
  if (!ehDaCasa(org) || !(await ehDesenvolvimentoServidor(db, email))) {
    return json({ ok: false, mensagem: 'Só a área de desenvolvimento publica novidades.' }, 403);
  }
  try {
    const publicacao = await lerPublicacao(dbPlataforma);
    publicacao[id] = { publicada: Boolean(body.publicar), por: email, em: new Date().toISOString() };
    const { error } = await dbPlataforma.from('sistema_config').upsert({ chave: CHAVE, valor: publicacao, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
    if (error) throw new Error(error.message);
    return json({ ok: true, publicacao });
  } catch (e) {
    return json({ ok: false, mensagem: `Não foi possível salvar: ${e.message}` }, 500);
  }
}
