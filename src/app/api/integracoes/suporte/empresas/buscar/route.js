import { autenticarIntegracao, identificarEmpresa, respostaErro } from '@/lib/server/integracaoSuporte';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integracoes/suporte/empresas/buscar
 * Body: { "nome": "Vargas" }
 * Retorna a decisão (confirmado | confirmar | nao_encontrado) e as empresas sugeridas.
 */
export async function POST(request) {
  try {
    const config = await autenticarIntegracao(request);
    const body = await request.json().catch(() => ({}));
    const resultado = await identificarEmpresa(body?.nome ?? body?.empresa_nome, config);
    return Response.json({ ok: true, ...resultado });
  } catch (err) {
    return respostaErro(err);
  }
}
