import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { normalizarEmail } from '@/lib/roles';
import { googleConfigurado, criarState, urlConectar, urlPublica } from '@/lib/server/googleAgenda';

export const dynamic = 'force-dynamic';

const COOKIE_OAUTH = 'rm_google_oauth';

// "Conectar Google Agenda": manda a pessoa logada para a tela de autorização do Google.
// O state assinado + o cookie de uso único amarram a volta do Google a esta pessoa (contra CSRF).
export async function GET(request) {
  const voltar = (motivo) => NextResponse.redirect(new URL(`/?google_agenda=erro&motivo=${motivo}`, request.url));
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return voltar('sessao');
  const email = normalizarEmail(sessao.sub);
  if (!(await obterAcessoServidor(email)).liberado) return voltar('acesso');
  if (!googleConfigurado()) return voltar('nao_configurado');

  const nonce = crypto.randomBytes(16).toString('base64url');
  const destino = urlConectar({
    state: criarState(email, nonce),
    redirectUri: `${urlPublica(request)}/api/google/agenda/oauth/callback`,
    loginHint: request.nextUrl.searchParams.get('conta') || undefined,
  });
  const res = NextResponse.redirect(destino);
  res.cookies.set(COOKIE_OAUTH, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/google/agenda/oauth',
    maxAge: 600,
  });
  return res;
}
