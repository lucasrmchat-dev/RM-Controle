import { NextResponse } from 'next/server';
import { globalRateLimiter } from './lib/rateLimit';
import { verifySessionToken, SESSION_COOKIE_NAME } from './lib/session';

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // 1. Obtenção do IP do cliente para Proteção DDoS e Rate Limiting
  const forwarded = request.headers.get('x-forwarded-for');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

  // 2. Rate Limiting Geral (150 requisições por minuto por IP)
  const globalCheck = globalRateLimiter.check(`global_${clientIp}`, 150, 60000);
  if (!globalCheck.success) {
    return new NextResponse(
      JSON.stringify({ error: 'Limite de tráfego excedido. Aguarde alguns instantes.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil(globalCheck.resetMs / 1000).toString(),
        },
      }
    );
  }

  // 2.1 API pública de integração (suporte automático): limite próprio por IP contra força bruta do token
  if (pathname.startsWith('/api/integracoes/suporte/') && !pathname.endsWith('/config')) {
    const integracaoCheck = globalRateLimiter.check(`integracao_${clientIp}`, 60, 60000);
    if (!integracaoCheck.success) {
      return new NextResponse(
        JSON.stringify({ ok: false, erro: 'limite_excedido', mensagem: 'Muitas requisições. Tente novamente em instantes.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil(integracaoCheck.resetMs / 1000).toString(),
          },
        }
      );
    }
  }

  // 3. Validação de Rotas Protegidas de API
  // APIs internas que exigem sessão ativa (ex: /api/calendar)
  if (pathname.startsWith('/api/calendar')) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionPayload = await verifySessionToken(sessionCookie);

    if (!sessionPayload) {
      return new NextResponse(
        JSON.stringify({ error: 'Acesso não autorizado. Sessão inválida ou expirada.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 4. Cabeçalhos de Segurança Estritos (Security Headers - OWASP & LGPD)
  const headers = response.headers;

  // Previne clickjacking
  headers.set('X-Frame-Options', 'DENY');

  // Previne MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // Controle de Referrer para não vazar caminhos sensíveis
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Desativa APIs sensíveis do navegador não utilizadas pela aplicação
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()'
  );

  // Força HTTPS com HSTS rigoroso (2 anos + includeSubDomains + preload)
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // Proteção contra XSS em navegadores legados
  headers.set('X-XSS-Protection', '1; mode=block');

  // Content Security Policy (CSP) robusta
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com data:;
    img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://calendar.google.com;
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
  `.replace(/\s{2,}/g, ' ').trim();

  headers.set('Content-Security-Policy', cspHeader);

  // 5. Configuração Restrita de CORS
  const origin = request.headers.get('origin');
  if (origin) {
    const allowedHost = request.headers.get('host');
    if (origin.includes(allowedHost) || origin.includes('localhost') || origin.includes('rmcontrole')) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas exceto arquivos estáticos de build e imagens
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
