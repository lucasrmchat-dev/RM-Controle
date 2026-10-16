import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const payload = await verifySessionToken(token);
    if (!payload || !payload.sub) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Recalcula o papel a cada consulta: alterações em Equipe & Senhas valem sem novo login
    // e cookies emitidos pela regra antiga (baseada no texto do e-mail) são corrigidos.
    const acesso = await obterAcessoServidor(payload.sub);
    // Removido ou desativado em Equipe & Senhas: a sessão deixa de valer (o banco já não mostra nada)
    if (!acesso.liberado) {
      return NextResponse.json(
        {
          authenticated: false,
          bloqueado: true,
          motivo: acesso.naEquipe
            ? 'Seu acesso foi desativado em Equipe & Senhas. Fale com o administrador.'
            : `O e-mail ${payload.sub} não está cadastrado em Equipe & Senhas. Peça ao administrador para cadastrá-lo.`,
        },
        { status: 403 }
      );
    }
    return NextResponse.json({
      authenticated: true,
      user: {
        email: payload.sub,
        role: acesso.papel,
      },
    });
  } catch (err) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
