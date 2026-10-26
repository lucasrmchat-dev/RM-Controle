import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { organizacaoAtual, perfilDeGestao } from '@/lib/server/organizacao';

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
    // Empresa em que a pessoa está (e se está dentro de outra para dar suporte) e se gerencia outras empresas
    const db = getSupabaseAdmin();
    const org = db ? await organizacaoAtual(db, payload.sub).catch(() => null) : null;
    if (org?.bloqueada) {
      return NextResponse.json({ authenticated: false, bloqueado: true, motivo: 'O acesso da sua empresa está suspenso. Fale com o fornecedor do sistema.' }, { status: 403 });
    }
    const gestao = db && org && !org.legado ? await perfilDeGestao(db, payload.sub).catch(() => null) : null;
    return NextResponse.json({
      authenticated: true,
      user: {
        email: payload.sub,
        role: org?.suporte ? 'administrador' : acesso.papel,
      },
      organizacao: org && !org.legado ? { id: org.id, nome: org.nome, tipo: org.tipo, suporte: Boolean(org.suporte), limites: org.limites || {} } : null,
      gestao: gestao ? { nivel: gestao.nivel } : null,
    });
  } catch (err) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
