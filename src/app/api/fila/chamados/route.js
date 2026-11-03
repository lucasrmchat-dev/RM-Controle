import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Demandas abertas lidas pelo servidor: reserva para quando a sessão do banco no navegador expira.
// Sem isso, a leitura direta falhava em silêncio e a Fila ficava parada com demandas já concluídas
// por colegas. Quem pede precisa estar logado e ativo, e só recebe as demandas da empresa em que está
// (a mesma regra do banco: toda a equipe da empresa lê as demandas; departamentos são filtrados na tela).
export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const { data, error } = await ctx.db
    .from('suporte_chamados')
    .select('*')
    .in('status', ['aguardando_visualizacao', 'em_andamento', 'pendente'])
    .is('finalizado_em', null)
    .order('iniciado_em', { ascending: false });
  if (error)
    return NextResponse.json(
      { ok: false, mensagem: 'Não foi possível ler as demandas.' },
      { status: 500 },
    );
  return NextResponse.json(
    { ok: true, chamados: data || [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
