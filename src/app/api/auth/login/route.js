import { SESSION_DURATION_SECONDS } from '@/lib/sessionPolicy';
import { NextResponse } from 'next/server';
import { sanitizeEmail, validarSenhaEntrada } from '@/lib/sanitize';
import { consumirLimite, verificarCaptcha, ipDaRequisicao } from '@/lib/server/protecao';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { verificarCredenciais, obterAcessoServidor } from '@/lib/server/acesso';
import { ROTULOS_PAPEL } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { organizacaoAtual } from '@/lib/server/organizacao';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const inicio = performance.now();
  const tempos = [];
  const medir = async (nome, tarefa) => {
    const etapa = performance.now();
    try { return await tarefa(); }
    finally { tempos.push(`${nome};dur=${(performance.now() - etapa).toFixed(1)}`); }
  };
  const responder = (corpo, opcoes) => {
    const resposta = NextResponse.json(corpo, opcoes);
    resposta.headers.set('Server-Timing', [...tempos, `total;dur=${(performance.now() - inicio).toFixed(1)}`].join(', '));
    return resposta;
  };
  try {
    // 1. Limite por IP, persistente no banco (vale entre todas as instâncias do servidor)
    const clientIp = ipDaRequisicao(request);
    if (!(await medir('limite_ip', () => consumirLimite(`login_ip_${clientIp}`, 10, 15 * 60)))) {
      return responder(
        { error: 'Muitas tentativas de login a partir desta rede. Por segurança, tente novamente em 15 minutos.' },
        { status: 429, headers: { 'Retry-After': '900' } }
      );
    }

    // Corpo pequeno e em JSON: nada de payloads gigantes ou formatos inesperados
    const tamanho = Number(request.headers.get('content-length') || 0);
    if (tamanho > 8 * 1024) {
      return responder({ error: 'Requisição inválida.' }, { status: 413 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return responder({ error: 'Requisição inválida.' }, { status: 400 });
    }
    const { email, password, honeypot, captchaToken } = body;

    // 3. Mecanismo Anti-bot Honeypot: Se o campo oculto estiver preenchido, é um bot automatizado
    if (honeypot && String(honeypot).trim() !== '') {
      // Retorno falso de sucesso ou erro neutro sem detalhar para o atacante
      return responder(
        { error: 'Credenciais inválidas.' },
        { status: 400 }
      );
    }

    // Formato estrito: só texto, e-mail sem caracteres especiais, senha sem caracteres de controle
    const emailLimpo = sanitizeEmail(email);
    const senhaLimpa = validarSenhaEntrada(password);

    if (!emailLimpo || !senhaLimpa) {
      return responder(
        { error: 'Informe um e-mail válido e a sua senha.' },
        { status: 400 }
      );
    }
    if (captchaToken !== undefined && (typeof captchaToken !== 'string' || captchaToken.length > 4096)) {
      return responder({ error: 'Requisição inválida.' }, { status: 400 });
    }

    // 3.1 Captcha (Cloudflare Turnstile), quando configurado
    const captcha = await medir('captcha', () => verificarCaptcha(captchaToken, clientIp));
    if (!captcha.ok) {
      return responder(
        { error: captcha.motivo === 'captcha_indisponivel'
            ? 'Não foi possível confirmar a verificação de segurança. Tente novamente.'
            : 'Conclua a verificação de segurança antes de entrar.' },
        { status: 400 }
      );
    }

    // 3.2 Limite por conta: impede força bruta distribuída contra um mesmo e-mail
    if (!(await medir('limite_conta', () => consumirLimite(`login_email_${emailLimpo}`, 8, 15 * 60)))) {
      return responder(
        { error: 'Muitas tentativas para esta conta. Por segurança, aguarde 15 minutos.' },
        { status: 429, headers: { 'Retry-After': '900' } }
      );
    }

    // 4. Validação real das credenciais (Supabase Auth ou senha de Equipe & Senhas)
    const credenciais = await medir('credenciais', () => verificarCredenciais(emailLimpo, senhaLimpa));
    if (!credenciais.ok) {
      // O detalhe técnico fica só no log do servidor; a pessoa recebe uma mensagem simples
      if (credenciais.motivo === 'servidor_nao_configurado') console.error('[login]', credenciais.detalhe);
      return responder(
        {
          error: credenciais.motivo === 'usuario_inativo'
            ? 'Este usuário está desativado. Fale com o administrador.'
            : credenciais.motivo === 'servidor_nao_configurado'
              ? 'O acesso está temporariamente indisponível. Tente novamente em alguns minutos.'
              : 'E-mail ou senha incorretos.',
        },
        { status: credenciais.motivo === 'servidor_nao_configurado' ? 503 : 401 }
      );
    }

    // Só proprietários e membros ATIVOS de Equipe & Senhas entram: é a mesma regra da RLS do banco.
    // Antes a pessoa entrava como "suporte" e via a fila e as empresas vazias, sem nenhum aviso.
    const acesso = await medir('acesso', () => obterAcessoServidor(emailLimpo));
    if (!acesso.liberado) {
      return responder(
        {
          error: acesso.naEquipe
            ? 'Seu acesso está desativado em Equipe & Senhas. Fale com o administrador.'
            : `O e-mail ${emailLimpo} não está cadastrado em Equipe & Senhas. Peça ao administrador para cadastrá-lo (com este mesmo e-mail).`,
        },
        { status: 403 }
      );
    }

    // Empresa da pessoa: suspensa ou cancelada não entra (a regra também vale dentro do banco)
    const dbAdmin = getSupabaseAdmin();
    const org = dbAdmin ? await medir('empresa', () => organizacaoAtual(dbAdmin, emailLimpo)) : null;
    if (org?.bloqueada) {
      return responder(
        { error: org.status === 'cancelada' ? 'O acesso da sua empresa foi encerrado.' : 'O acesso da sua empresa está suspenso. Fale com o fornecedor do sistema.' },
        { status: 403 }
      );
    }

    // Papel vem do cadastro da equipe (nunca do texto do e-mail)
    const userRole = acesso.papel;
    const userName = ROTULOS_PAPEL[userRole] || emailLimpo.split('@')[0];

    // 5. Geração de Token Criptografado HTTP-Only
    const sessionToken = await createSessionToken({
      email: emailLimpo,
      role: userRole,
    });

    const response = responder({
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
      maxAge: SESSION_DURATION_SECONDS, // 9 horas
    });

    return response;
  } catch (err) {
    // Nunca expõe stack traces detalhados ou erros internos em produção
    return responder(
      { error: 'Não foi possível entrar agora. Tente novamente em instantes.' },
      { status: 500 }
    );
  }
}
