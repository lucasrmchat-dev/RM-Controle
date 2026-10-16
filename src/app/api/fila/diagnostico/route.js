import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico de visibilidade da fila: quantas demandas abertas existem de fato no banco
 * (contadas pelo servidor, sem RLS) e a situação de acesso do usuário logado.
 * O navegador compara com o que recebeu; se receber menos, mostra o motivo provável.
 */
export async function GET(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao) return Response.json({ ok: false, mensagem: 'Sessão expirada.' }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });

  const { count, error } = await db
    .from('suporte_chamados')
    .select('id', { count: 'exact', head: true })
    .in('status', ['aguardando_visualizacao', 'em_andamento', 'pendente'])
    .is('finalizado_em', null);
  if (error) return Response.json({ ok: false, mensagem: error.message }, { status: 500 });

  const acesso = await obterAcessoServidor(sessao.sub);
  return Response.json({
    ok: true,
    email: sessao.sub,
    ativosNoBanco: count || 0,
    papel: acesso.papel,
    naEquipe: acesso.naEquipe,
    ativo: acesso.ativo,
    proprietario: acesso.proprietario,
  });
}
