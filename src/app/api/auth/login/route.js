import { NextResponse } from 'next/server';
import { sanitizeEmail, sanitizeString } from '@/lib/sanitize';
import { authRateLimiter } from '@/lib/rateLimit';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { verificarCredenciais, obterPapelServidor } from '@/lib/server/acesso';
import { ROTULOS_PAPEL } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    // 1. Obtenção do IP do cliente para Rate Limiting
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    // 2. Rate Limiting Estrito: Máximo 5 tentativas de login por 15 minutos por IP
    const rateCheck = authRateLimiter.check(`login_${clientIp}`, 5, 15 * 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        {
          error: 'Muitas tentativas de login consecutivas. Por segurança, tente novamente em 15 minutos.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString(),
          },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { email, password, honeypot, antiBotToken } = body;

    // 3. Mecanismo Anti-bot Honeypot: Se o campo oculto estiver preenchido, é um bot automatizado
    if (honeypot && String(honeypot).trim() !== '') {
      // Retorno falso de sucesso ou erro neutro sem detalhar para o atacante
      return NextResponse.json(
        { error: 'Credenciais inválidas.' },
        { status: 400 }
      );
    }

    const emailLimpo = sanitizeEmail(email);
    const senhaLimpa = typeof password === 'string' ? password.trim() : '';

    if (!emailLimpo || !senhaLimpa) {
      return NextResponse.json(
        { error: 'E-mail corporativo e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    // 4. Validação real das credenciais (Supabase Auth ou senha de Equipe & Senhas)
    const credenciais = await verificarCredenciais(emailLimpo, senhaLimpa);
    if (!credenciais.ok) {
      return NextResponse.json(
        {
          error: credenciais.motivo === 'usuario_inativo'
            ? 'Este usuário está desativado. Fale com o administrador.'
            : credenciais.motivo === 'servidor_nao_configurado'
              ? 'Autenticação indisponível: servidor sem configuração do banco.'
              : 'E-mail ou senha incorretos.',
        },
        { status: credenciais.motivo === 'servidor_nao_configurado' ? 503 : 401 }
      );
    }

    // Papel vem do cadastro da equipe (nunca do texto do e-mail)
    const userRole = await obterPapelServidor(emailLimpo);
    const userName = ROTULOS_PAPEL[userRole] || emailLimpo.split('@')[0];

    // 5. Geração de Token Criptografado HTTP-Only
    const sessionToken = await createSessionToken({
      email: emailLimpo,
      role: userRole,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        email: emailLimpo,
        name: userName,
        role: userRole,
      },
    });

    // 6. Configuração Segura do Cookie HTTP-Only (LGPD & OWASP compliant)
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true, // Inacessível via document.cookie no JavaScript do cliente (previne XSS)
      secure: process.env.NODE_ENV === 'production', // Apenas HTTPS em produção
      sameSite: 'lax', // Proteção contra CSRF
      path: '/',
      maxAge: 8 * 60 * 60, // 8 horas
    });

    return response;
  } catch (err) {
    // Nunca expõe stack traces detalhados ou erros internos em produção
    return NextResponse.json(
      { error: 'Falha interna ao processar autenticação segura.' },
      { status: 500 }
    );
  }
}
