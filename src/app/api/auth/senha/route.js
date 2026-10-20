import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { validarSenhaEntrada, validatePasswordStrength } from '@/lib/sanitize';
import { consumirLimite } from '@/lib/server/protecao';
import { verificarCredenciais, garantirContaAuth } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { normalizarEmail } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Troca da PRÓPRIA senha. Quem é a pessoa vem só do cookie de sessão assinado:
// o navegador não informa e-mail nem id, então não há como alterar a senha de outra conta.
// Senhas de outros membros continuam sendo trocadas apenas por administradores em /api/equipe.
export async function POST(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return NextResponse.json({ ok: false, mensagem: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });
  const email = normalizarEmail(sessao.sub);

  if (!(await consumirLimite(`troca_senha_${email}`, 5, 15 * 60))) {
    return NextResponse.json({ ok: false, mensagem: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, mensagem: 'Requisição inválida.' }, { status: 400 });
  }

  const novaSenha = validarSenhaEntrada(body.novaSenha);
  const forca = validatePasswordStrength(novaSenha);
  if (!novaSenha || !forca.valid) {
    return NextResponse.json({ ok: false, mensagem: forca.message || 'Senha inválida.' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, mensagem: 'Não foi possível alterar a senha agora.' }, { status: 503 });

  const { data: membro } = await db
    .from('equipe_usuarios')
    .select('id, nome, papel, ativo, primeiro_acesso_concluido')
    .eq('email', email)
    .maybeSingle();
  if (membro && membro.ativo === false) {
    return NextResponse.json({ ok: false, mensagem: 'Seu acesso está desativado.' }, { status: 403 });
  }

  // Fora do primeiro acesso, exige a senha atual (protege contra sessão esquecida aberta)
  if (membro?.primeiro_acesso_concluido === true) {
    const senhaAtual = validarSenhaEntrada(body.senhaAtual);
    if (!senhaAtual || !(await verificarCredenciais(email, senhaAtual)).ok) {
      return NextResponse.json({ ok: false, mensagem: 'A senha atual não confere.' }, { status: 403 });
    }
  }

  const conta = await garantirContaAuth(email, novaSenha, { name: membro?.nome || '', papel: membro?.papel || 'suporte' });
  if (!conta.ok) return NextResponse.json({ ok: false, mensagem: 'Não foi possível alterar a senha agora.' }, { status: 500 });

  if (membro?.id) {
    // Filtro pelo id do próprio registro: atualiza exatamente uma linha (o banco grava como hash)
    const { error } = await db.from('equipe_usuarios').update({ senha: novaSenha }).eq('id', membro.id);
    if (error) return NextResponse.json({ ok: false, mensagem: 'Não foi possível alterar a senha agora.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
