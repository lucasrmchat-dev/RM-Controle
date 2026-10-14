import { autenticarIntegracao, criarChamadoIntegracao, respostaErro } from '@/lib/server/integracaoSuporte';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integracoes/suporte/chamados
 * Body: {
 *   "empresa_id": "uuid"            (quando o cliente já confirmou a empresa)  OU
 *   "empresa_nome": "Vargas",       (passa pela correspondência aproximada)
 *   "descricao": "Resumo do que o cliente precisa",
 *   "solicitante_nome": "Nome do contato",
 *   "origem": "Chatbot WhatsApp",   (opcional)
 *   "id_externo": "conversa-123"    (opcional, para rastreio)
 * }
 * 201 → demanda criada | 200 com criado=false → precisa confirmar empresa ou empresa não encontrada
 */
export async function POST(request) {
  try {
    const config = await autenticarIntegracao(request);
    const body = await request.json().catch(() => ({}));
    const resultado = await criarChamadoIntegracao(body, config);
    return Response.json({ ok: true, ...resultado }, { status: resultado.criado && !resultado.duplicado ? 201 : 200 });
  } catch (err) {
    return respostaErro(err);
  }
}
