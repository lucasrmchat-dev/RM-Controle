import { autenticarIntegracao, identificarEmpresa, respostaErro } from '@/lib/server/integracaoSuporte';

import { consumirLimite, ipDaRequisicao } from '@/lib/server/protecao';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integracoes/suporte/empresas/buscar
 * Body: { "nome": "Vargas" }
 * Retorna a decisão (confirmado | confirmar | nao_encontrado) e as empresas sugeridas.
 */
export async function POST(request) {
  try {
    // Limite persistente por IP (vale entre instâncias), além do limite em memória do middleware
    if (!(await consumirLimite(`integracao_${ipDaRequisicao(request)}`, 120, 60))) {
      return Response.json({ ok: false, erro: 'limite_excedido', mensagem: 'Muitas requisições. Tente novamente em instantes.' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
    const config = await autenticarIntegracao(request);
    const body = await request.json().catch(() => ({}));
    const resultado = await identificarEmpresa(body?.nome ?? body?.empresa_nome, config);
    return Response.json({ ok: true, ...resultado });
  } catch (err) {
    return respostaErro(err);
  }
}
