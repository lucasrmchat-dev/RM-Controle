import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { consumirLimite } from '@/lib/server/protecao';
import { normalizarEmail } from '@/lib/roles';
import {
  googleConfigurado,
  carregarConfigGoogle,
  listarContasConectadas,
  listarAgendasDisponiveis,
  salvarAgendasEscolhidas,
  listarAgendasSincronizadas,
  definirAgendaPadrao,
  diagnosticoOAuth,
  sincronizarTodas,
  desconectar,
  tokenWebhook,
  urlPublica,
} from '@/lib/server/googleAgenda';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const erro = (mensagem, status) => NextResponse.json({ ok: false, mensagem }, { status });

async function autenticar(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return { erro: erro('Sua sessão expirou. Entre novamente.', 401) };
  const email = normalizarEmail(sessao.sub);
  const acesso = await obterAcessoServidor(email);
  if (!acesso.liberado) return { erro: erro('Seu acesso está desativado.', 403) };
  return { email, admin: acesso.proprietario || acesso.papel === 'administrador' };
}

// Situação da integração: a minha conexão e quem da equipe já conectou (nunca devolve tokens)
export async function GET(request) {
  const quem = await autenticar(request);
  if (quem.erro) return quem.erro;
  if (!googleConfigurado()) return NextResponse.json({ ok: true, configurado: false });

  const config = await carregarConfigGoogle();
  const contas = await listarContasConectadas();
  const { agendas, padrao } = await listarAgendasSincronizadas();
  return NextResponse.json({
    agendas,
    agenda_padrao: padrao,
    ok: true,
    configurado: true,
    avisos_em_tempo_real: Boolean(tokenWebhook()),
    ultima_sincronizacao: config.ultima_sincronizacao,
    minha_conta: contas.find((c) => c.email_sistema === quem.email) || null,
    meu_erro: config.erros?.[quem.email] || null,
    minha_falha_conexao: config.falhas_conexao?.[quem.email] || null,
    ...(quem.admin ? { diagnostico: diagnosticoOAuth() } : {}),
    contas,
  });
}

export async function POST(request) {
  const quem = await autenticar(request);
  if (quem.erro) return quem.erro;
  if (!googleConfigurado()) return erro('A integração com o Google Agenda ainda não foi configurada no servidor.', 503);

  const body = await request.json().catch(() => null);

  if (body?.acao === 'sincronizar') {
    // O limite evita rajadas ao abrir a aba várias vezes
    if (!(await consumirLimite(`google_agenda_sync_${quem.email}`, 6, 60))) return NextResponse.json({ ok: true, ignorado: true });
    const config = await carregarConfigGoogle();
    const ultima = config.ultima_sincronizacao ? new Date(config.ultima_sincronizacao).getTime() : 0;
    if (!body.forcar && Date.now() - ultima < 30000) return NextResponse.json({ ok: true, recente: true });
    return NextResponse.json({ ok: true, ...(await sincronizarTodas({ renovarCanais: true, urlBase: urlPublica(request) })) });
  }

  // Agendas compartilhadas comigo que posso sincronizar (ex.: a do suporte@)
  if (body?.acao === 'listar_agendas') {
    try {
      return NextResponse.json({ ok: true, agendas: await listarAgendasDisponiveis(quem.email) });
    } catch (e) {
      return erro(e.message, 400);
    }
  }

  if (body?.acao === 'agenda_padrao') {
    try {
      await definirAgendaPadrao(String(body.id || ''));
      return NextResponse.json({ ok: true });
    } catch (e) {
      return erro(e.message, 400);
    }
  }

  if (body?.acao === 'salvar_agendas') {
    if (!Array.isArray(body.agendas) || body.agendas.length > 50) return erro('Lista de agendas inválida.', 400);
    try {
      const salvas = await salvarAgendasEscolhidas(quem.email, body.agendas.map((a) => String(a?.id || a || '')));
      const r = await sincronizarTodas({ renovarCanais: true, urlBase: urlPublica(request) });
      return NextResponse.json({ ok: true, agendas: salvas, erros: r.erros });
    } catch (e) {
      return erro(e.message, 400);
    }
  }

  // Cada pessoa desconecta só a própria agenda
  if (body?.acao === 'desconectar') {
    await desconectar(quem.email);
    return NextResponse.json({ ok: true });
  }

  return erro('Ação desconhecida.', 400);
}
