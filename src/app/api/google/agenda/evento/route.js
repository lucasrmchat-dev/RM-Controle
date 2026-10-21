import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { isValidUUID } from '@/lib/sanitize';
import { normalizarEmail } from '@/lib/roles';
import { googleConfigurado, espelharEvento, excluirEvento } from '@/lib/server/googleAgenda';

export const dynamic = 'force-dynamic';

const erro = (mensagem, status) => NextResponse.json({ ok: false, mensagem }, { status });

// Leva ao Google uma criação/edição feita no sistema, ou exclui nos dois lados.
export async function POST(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return erro('Sua sessão expirou. Entre novamente.', 401);
  const email = normalizarEmail(sessao.sub);
  const acesso = await obterAcessoServidor(email);
  if (!acesso.liberado) return erro('Seu acesso está desativado.', 403);

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!isValidUUID(id)) return erro('Evento inválido.', 400);
  if (!googleConfigurado()) return NextResponse.json({ ok: true, configurado: false });

  if (body.acao === 'excluir') {
    const { data: linha } = await getSupabaseAdmin().from('agenda_eventos').select('*').eq('id', id).maybeSingle();
    if (!linha) return NextResponse.json({ ok: true });
    // Mesma regra do banco: administrador, quem criou ou o responsável
    const admin = acesso.proprietario || acesso.papel === 'administrador';
    if (!admin && normalizarEmail(linha.criado_por) !== email && normalizarEmail(linha.responsavel_email) !== email) {
      return erro('Apenas quem criou, o responsável ou um administrador pode excluir este evento.', 403);
    }
    try {
      await excluirEvento(linha);
      return NextResponse.json({ ok: true, excluido: true });
    } catch (e) {
      return erro(e.message, 502);
    }
  }

  try {
    return NextResponse.json(await espelharEvento(id, fetch, { gerarMeet: body.gerar_meet === true }));
  } catch (e) {
    return erro(`Salvo no sistema, mas não foi possível atualizar o Google Agenda: ${e.message}`, 502);
  }
}
