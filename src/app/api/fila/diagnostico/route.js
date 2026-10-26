import { obterAcessoServidor } from '@/lib/server/acesso';
import { contextoDaRequisicao } from '@/lib/server/organizacao';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico de visibilidade da fila: quantas demandas abertas existem de fato no banco
 * (contadas pelo servidor, sem RLS, só da empresa de quem pergunta) e a situação de acesso do usuário.
 * O navegador compara com o que recebeu; se receber menos, mostra o motivo provável.
 */
export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;

  const { count, error } = await ctx.db
    .from('suporte_chamados')
    .select('id', { count: 'exact', head: true })
    .in('status', ['aguardando_visualizacao', 'em_andamento', 'pendente'])
    .is('finalizado_em', null);
  if (error) return Response.json({ ok: false, mensagem: error.message }, { status: 500 });

  const acesso = await obterAcessoServidor(ctx.email);
  return Response.json({
    ok: true,
    email: ctx.email,
    ativosNoBanco: count || 0,
    papel: ctx.papel,
    naEquipe: acesso.naEquipe,
    ativo: acesso.ativo,
    proprietario: acesso.proprietario,
  });
}
