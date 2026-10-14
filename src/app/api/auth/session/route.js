import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterPapelServidor } from '@/lib/server/acesso';

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
    return NextResponse.json({
      authenticated: true,
      user: {
        email: payload.sub,
        role: await obterPapelServidor(payload.sub),
      },
    });
  } catch (err) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
