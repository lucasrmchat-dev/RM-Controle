import { isValidUUID } from '@/lib/sanitize';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { consumirLimite, ipDaRequisicao } from '@/lib/server/protecao';
import {
  canonical,
  erroWebhook,
  extrairTokenWebhook,
  falha,
  hashWebhook,
  lerJsonWebhook,
} from '@/lib/server/webhooksComercial';
import { etapaPorRegras, normalizarTicketRM } from '@/lib/webhooksComercial';
export const dynamic = 'force-dynamic';
export async function POST(request, contexto) {
  const params = await contexto.params;
  try {
    if (!isValidUUID(params.id)) throw falha(404, 'Webhook não encontrado.');
    if (!(await consumirLimite(`webhook_comercial_ip_${ipDaRequisicao(request)}`, 180, 60)))
      throw falha(429, 'Muitas chamadas. Tente novamente em um minuto.');
    const token = extrairTokenWebhook(request);
    if (!token) throw falha(401, 'Token de autenticação ausente ou inválido.');
    const db = getSupabaseAdmin();
    if (!db) throw falha(503, 'Banco indisponível.');
    const hash = hashWebhook(token);
    const { data: integracao, error } = await db
      .from('comercial_integracoes')
      .select('*')
      .eq('id', params.id)
      .eq('token_hash', hash)
      .maybeSingle();
    if (error) throw error;
    if (!integracao) throw falha(401, 'Token inválido.');
    if (!integracao.ativo) throw falha(403, 'Integração desativada.');
    const payload = await lerJsonWebhook(request);
    if (payload.ticket?.isGroup === true)
      return Response.json({ ok: true, ignorado: true, motivo: 'grupo' });
    let dados;
    try {
      dados = normalizarTicketRM(payload);
    } catch (e) {
      throw falha(422, e.message);
    }
    const etapa = etapaPorRegras(payload, integracao.regras || []);
    const payloadHash = hashWebhook(canonical(payload));
    const eventoId = String(request.headers.get('x-webhook-id') || payload.eventId || payloadHash);
    if (!eventoId || eventoId.length > 200) throw falha(422, 'Identificador de evento inválido.');
    const { data: resultado, error: erroRpc } = await db.rpc('rm_receber_lead_comercial', {
      p_integracao: integracao.id,
      p_token_hash: hash,
      p_evento_id: eventoId,
      p_hash: payloadHash,
      p_dados: dados,
      p_etapa: etapa,
    });
    if (erroRpc) throw erroRpc;
    if (!resultado?.ok)
      throw falha(
        resultado?.codigo === 'evento_conflitante' ? 409 : 401,
        resultado?.codigo === 'evento_conflitante'
          ? 'Este identificador de evento já foi usado com outro conteúdo.'
          : 'Token inválido ou integração desativada.',
      );
    return Response.json(resultado);
  } catch (e) {
    return erroWebhook(e);
  }
}
