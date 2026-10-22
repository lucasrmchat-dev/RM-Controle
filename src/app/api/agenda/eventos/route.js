import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { normalizarEmail } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Agenda da equipe lida pelo servidor: não depende da sessão do banco no navegador (que pode expirar
// e fazer a tela ficar parada com dados antigos). Quem pede precisa estar logado e ativo na equipe.
export async function GET(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return NextResponse.json({ ok: false, mensagem: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });
  const acesso = await obterAcessoServidor(normalizarEmail(sessao.sub));
  if (!acesso.liberado) return NextResponse.json({ ok: false, mensagem: 'Seu acesso está desativado.' }, { status: 403 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, mensagem: 'Banco indisponível.' }, { status: 503 });
  const desde = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await db.from('agenda_eventos').select('*').gte('data', desde).order('data').limit(5000);
  if (error) return NextResponse.json({ ok: false, mensagem: 'Não foi possível ler a agenda.' }, { status: 500 });
  return NextResponse.json({ ok: true, eventos: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
