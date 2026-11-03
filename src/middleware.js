import { NextResponse } from 'next/server';
import { globalRateLimiter } from './lib/rateLimit';

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // 1. Obtenção do IP do cliente para Proteção DDoS e Rate Limiting
  const forwarded = request.headers.get('x-forwarded-for');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

  // 2. Rate Limiting Geral (150 requisições por minuto por IP).
  // Avisos do WhatsApp ficam de fora: um servidor da Evolution manda TODAS as mensagens de um único IP.
  // Eles têm limite próprio por canal e só são aceitos com token/assinatura válidos (api/canais/webhook).
  const ehAvisoWhatsapp = pathname.startsWith('/api/canais/webhook/');
  const globalCheck = ehAvisoWhatsapp ? { success: true } : globalRateLimiter.check(`global_${clientIp}`, 150, 60000);
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

  // 2.2 Página pública de confirmação de reunião (clientes sem login): limite próprio por IP
  if (pathname.startsWith('/api/publico/') || pathname.startsWith('/r/')) {
    const publicoCheck = globalRateLimiter.check(`publico_${clientIp}`, 40, 60000);
    if (!publicoCheck.success) {
      return new NextResponse(JSON.stringify({ ok: false, mensagem: 'Muitas tentativas. Aguarde um minuto.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(publicoCheck.resetMs / 1000).toString() },
      });
    }
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
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
    // Microfone e captura de tela só para o próprio sistema (áudio no Chat, gravador dos Feedbacks); o resto continua bloqueado
    'camera=(), microphone=(self), display-capture=(self), geolocation=(), browsing-topics=(), payment=()'
  );

  // Força HTTPS com HSTS rigoroso (2 anos + includeSubDomains + preload)
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // Proteção contra XSS em navegadores legados
  headers.set('X-XSS-Protection', '1; mode=block');

  // Content Security Policy (CSP) robusta
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://challenges.cloudflare.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com data:;
    img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co;
    media-src 'self' blob: https://*.supabase.co;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://calendar.google.com https://challenges.cloudflare.com;
    frame-src https://challenges.cloudflare.com;
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
  `.replace(/\s{2,}/g, ' ').trim();

  headers.set('Content-Security-Policy', cspHeader);

  // 5. Configuração Restrita de CORS: só o próprio site (endereço exato; antes bastava "conter" o nome,
  // e rmcontrole.qualquercoisa.com passava). Em desenvolvimento, também o localhost.
  const origin = request.headers.get('origin');
  if (origin) {
    let hostDaOrigem = '';
    try {
      hostDaOrigem = new URL(origin).host;
    } catch {}
    const mesmoSite = Boolean(hostDaOrigem) && hostDaOrigem === request.headers.get('host');
    const localDev = process.env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostDaOrigem);
    if (mesmoSite || localDev) {
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
