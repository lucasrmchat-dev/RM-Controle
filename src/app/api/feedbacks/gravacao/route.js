import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { consumirLimite } from '@/lib/server/protecao';
import { isValidUUID } from '@/lib/sanitize';
import { LIMITE_GRAVACAO, formatoAceito, gravacoesDoFeedback, linkDeEnvio } from '@/lib/server/gravacoesFeedback';

export const dynamic = 'force-dynamic';

/**
 * Gravações dos feedbacks (ticket #22). Só feedbacks da empresa da pessoa.
 *  GET ?feedback=<id>                         gravações com links temporários
 *  POST { feedback, mime, tamanho }             link de envio de uso único (o navegador envia direto ao Storage)
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function feedbackDaEmpresa(ctx, id) {
  if (!isValidUUID(id)) return null;
  const { data } = await ctx.db.from('feedbacks').select('id').eq('id', id).maybeSingle();
  return data;
}

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const fb = await feedbackDaEmpresa(ctx, new URL(request.url).searchParams.get('feedback'));
  if (!fb) return json({ ok: false, mensagem: 'Feedback não encontrado.' }, 404);
  return json({ ok: true, gravacoes: await gravacoesDoFeedback({ organizacaoId: ctx.org?.id, feedbackId: fb.id }) });
}

export async function POST(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  if (!(await consumirLimite(`feedback_gravacao_${ctx.email}`, 20, 600))) return json({ ok: false, mensagem: 'Muitas gravações seguidas. Aguarde alguns minutos.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  const fb = await feedbackDaEmpresa(ctx, body.feedback);
  if (!fb) return json({ ok: false, mensagem: 'Feedback não encontrado.' }, 404);
  if (!formatoAceito(body.mime)) return json({ ok: false, mensagem: 'Formato de gravação não aceito.' }, 400);
  const tamanho = Number(body.tamanho);
  if (!tamanho || tamanho > LIMITE_GRAVACAO) return json({ ok: false, mensagem: 'A gravação passou de 50 MB. Grave um trecho menor.' }, 400);
  try {
    return json({ ok: true, ...(await linkDeEnvio({ organizacaoId: ctx.org?.id, feedbackId: fb.id, mime: body.mime })) });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, e.status || 500);
  }
}
