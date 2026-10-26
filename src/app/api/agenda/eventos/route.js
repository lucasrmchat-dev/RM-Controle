import { NextResponse } from 'next/server';
import { contextoDaRequisicao } from '@/lib/server/organizacao';

export const dynamic = 'force-dynamic';

// Agenda da equipe lida pelo servidor: não depende da sessão do banco no navegador (que pode expirar
// e fazer a tela ficar parada com dados antigos). Quem pede precisa estar logado e ativo, e só recebe
// as reuniões da empresa em que está.
export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await ctx.db.from('agenda_eventos').select('*').gte('data', desde).order('data').limit(5000);
  if (error) return NextResponse.json({ ok: false, mensagem: 'Não foi possível ler a agenda.' }, { status: 500 });
  return NextResponse.json({ ok: true, eventos: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
