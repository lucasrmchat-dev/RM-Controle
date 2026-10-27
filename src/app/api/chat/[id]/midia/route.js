import { consumirLimite } from '@/lib/server/protecao';
import { enviarMidiaNaConversa } from '@/lib/server/canais/index';
import { bloqueioSemAssumir, carregarConversa, juntarDetalhes, prepararMensagem } from '@/lib/server/canais/chat';
import { LIMITE_ENVIO, mimeBase, tipoDoArquivo } from '@/lib/server/canais/midia';
import { avisarAoVivo } from '@/lib/server/canais/aoVivo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Envia um arquivo na conversa (formulário multipart):
 *  arquivo   foto, vídeo, documento ou áudio gravado (até 4 MB)
 *  legenda   texto opcional (não vale para áudio)
 *  segundos  duração do áudio gravado
 *  assinar   "false" para não assinar a legenda
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request, { params }) {
  const r = await carregarConversa(request, params.id);
  if (r.erro) return r.erro;
  const { ctx, perm, conversa } = r;
  if (conversa.status === 'resolvida') return json({ ok: false, mensagem: 'Reabra a conversa para responder.' }, 409);
  const bloqueio = await bloqueioSemAssumir(ctx.db, perm, conversa);
  if (bloqueio) return json({ ok: false, mensagem: bloqueio, precisa_assumir: true }, 409);
  if (!(await consumirLimite(`chat_midia_${perm.email}`, 30, 60))) return json({ ok: false, mensagem: 'Muitos arquivos seguidos. Aguarde um instante.' }, 429);
  if (Number(request.headers.get('content-length') || 0) > LIMITE_ENVIO + 64 * 1024) return json({ ok: false, mensagem: 'Arquivo grande demais (máximo de 4 MB).' }, 413);

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  if (!arquivo || typeof arquivo.arrayBuffer !== 'function') return json({ ok: false, mensagem: 'Escolha um arquivo.' }, 400);
  if (arquivo.size > LIMITE_ENVIO) return json({ ok: false, mensagem: 'Arquivo grande demais (máximo de 4 MB).' }, 413);
  const mime = mimeBase(arquivo.type);
  const tipo = tipoDoArquivo(mime);
  if (!tipo) return json({ ok: false, mensagem: 'Formato não aceito. Envie foto, vídeo MP4, áudio, PDF, Word, Excel, PowerPoint, TXT, CSV ou ZIP.' }, 400);

  try {
    const mensagem = await enviarMidiaNaConversa(ctx.db, {
      conversa,
      tipo,
      arquivo: { dados: Buffer.from(await arquivo.arrayBuffer()), mime, nome: arquivo.name || null },
      legenda: String(form.get('legenda') || ''),
      segundos: Math.min(Number(form.get('segundos')) || 0, 3600) || null,
      autor: { email: perm.email, nome: perm.nome },
      assinar: form.get('assinar') !== 'false',
    });
    const [{ data }, { data: canal }] = await Promise.all([ctx.db.from('conversas').select('*').eq('id', conversa.id).single(), ctx.db.from('canais').select('*').eq('id', conversa.canal_id).maybeSingle()]);
    await avisarAoVivo(conversa.organizacao_id || null);
    return json({ ok: true, mensagem: prepararMensagem(mensagem, perm, canal), conversa: (await juntarDetalhes(ctx.db, [data]))[0] });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 502);
  }
}
