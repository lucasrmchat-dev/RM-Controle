import { acessoFluxos, erroDoBanco, json } from '@/lib/server/fluxosApi';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/** GET: últimas 30 execuções do fluxo (o que disparou, cada passo e o resultado). */
export async function GET(request, contexto) {
  const a = await acessoFluxos(request);
  if (a.erro) return a.erro;
  const { id } = await contexto.params;
  if (!isValidUUID(id)) return json({ ok: false, mensagem: 'Fluxo inválido.' }, 400);
  const { data, error } = await a.ctx.db.from('fluxo_execucoes').select('*').eq('fluxo_id', id).order('criado_em', { ascending: false }).limit(30);
  if (error) return erroDoBanco(error);
  return json({ ok: true, execucoes: data || [] });
}
