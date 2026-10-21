import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { consumirLimite } from '@/lib/server/protecao';
import { normalizarEmail } from '@/lib/roles';
import { googleConfigurado, carregarConfigGoogle, sincronizarTodas, desconectar, tokenWebhook, urlPublica } from '@/lib/server/googleAgenda';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const erro = (mensagem, status) => NextResponse.json({ ok: false, mensagem }, { status });

async function autenticar(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return { erro: erro('Sua sessão expirou. Entre novamente.', 401) };
  const email = normalizarEmail(sessao.sub);
  const acesso = await obterAcessoServidor(email);
  if (!acesso.liberado) return { erro: erro('Seu acesso está desativado.', 403) };
  return { email };
}

// Situação da integração: a minha conexão e quem da equipe já conectou (nunca devolve tokens)
export async function GET(request) {
  const quem = await autenticar(request);
  if (quem.erro) return quem.erro;
  if (!googleConfigurado()) return NextResponse.json({ ok: true, configurado: false });

  const config = await carregarConfigGoogle();
  const contas = (config.contas || []).map(({ email_sistema, email_google, nome, conectado_em }) => ({ email_sistema, email_google, nome, conectado_em }));
  return NextResponse.json({
    ok: true,
    configurado: true,
    avisos_em_tempo_real: Boolean(tokenWebhook()),
    ultima_sincronizacao: config.ultima_sincronizacao,
    minha_conta: contas.find((c) => c.email_sistema === quem.email) || null,
    meu_erro: config.erros?.[quem.email] || null,
    contas,
  });
}

export async function POST(request) {
  const quem = await autenticar(request);
  if (quem.erro) return quem.erro;
  if (!googleConfigurado()) return erro('A integração com o Google Agenda ainda não foi configurada no servidor.', 503);

  const body = await request.json().catch(() => null);

  if (body?.acao === 'sincronizar') {
    // O limite evita rajadas ao abrir a aba várias vezes
    if (!(await consumirLimite(`google_agenda_sync_${quem.email}`, 6, 60))) return NextResponse.json({ ok: true, ignorado: true });
    const config = await carregarConfigGoogle();
    const ultima = config.ultima_sincronizacao ? new Date(config.ultima_sincronizacao).getTime() : 0;
    if (!body.forcar && Date.now() - ultima < 30000) return NextResponse.json({ ok: true, recente: true });
    return NextResponse.json({ ok: true, ...(await sincronizarTodas({ renovarCanais: true, urlBase: urlPublica(request) })) });
  }

  // Cada pessoa desconecta só a própria agenda
  if (body?.acao === 'desconectar') {
    await desconectar(quem.email);
    return NextResponse.json({ ok: true });
  }

  return erro('Ação desconhecida.', 400);
}
