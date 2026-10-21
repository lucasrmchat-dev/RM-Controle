import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { consumirLimite } from '@/lib/server/protecao';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { normalizarEmail } from '@/lib/roles';
import { isValidEmail } from '@/lib/security';
import {
  googleConfigurado,
  credenciaisServico,
  carregarConfigGoogle,
  salvarConfigGoogle,
  sincronizarTodas,
  testarConta,
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

function clienteIdServico() {
  try {
    return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_id || null : null;
  } catch {
    return null;
  }
}

// Situação da integração e vínculo de cada pessoa da equipe com a conta Google
export async function GET(request) {
  const quem = await autenticar(request);
  if (quem.erro) return quem.erro;
  if (!googleConfigurado()) return NextResponse.json({ ok: true, configurado: false });

  const config = await carregarConfigGoogle();
  const resposta = {
    ok: true,
    configurado: true,
    avisos_em_tempo_real: Boolean(tokenWebhook()),
    ultima_sincronizacao: config.ultima_sincronizacao,
    erros: config.erros || {},
    contas: config.contas || [],
  };
  if (quem.admin) {
    const { data: equipe } = await getSupabaseAdmin().from('equipe_usuarios').select('nome, email, ativo').order('nome');
    resposta.equipe = (equipe || []).filter((m) => m.ativo !== false).map((m) => ({ nome: m.nome, email: normalizarEmail(m.email) }));
    resposta.conta_servico = credenciaisServico()?.email || null;
    resposta.client_id = clienteIdServico();
  }
  return NextResponse.json(resposta);
}

export async function POST(request) {
  const quem = await autenticar(request);
  if (quem.erro) return quem.erro;
  if (!googleConfigurado()) return erro('A integração com o Google Agenda ainda não foi configurada no servidor.', 503);

  const body = await request.json().catch(() => null);
  const acao = body?.acao;

  if (acao === 'sincronizar') {
    // Qualquer pessoa da equipe pode puxar as novidades; o limite evita rajadas ao abrir a aba várias vezes
    if (!(await consumirLimite(`google_agenda_sync_${quem.email}`, 6, 60))) {
      return NextResponse.json({ ok: true, ignorado: true });
    }
    const config = await carregarConfigGoogle();
    const ultima = config.ultima_sincronizacao ? new Date(config.ultima_sincronizacao).getTime() : 0;
    if (!body.forcar && Date.now() - ultima < 30000) return NextResponse.json({ ok: true, recente: true });
    const r = await sincronizarTodas({ renovarCanais: true, urlBase: urlPublica(request) });
    return NextResponse.json({ ok: true, ...r });
  }

  if (!quem.admin) return erro('Apenas administradores alteram a integração com o Google Agenda.', 403);

  if (acao === 'salvar_contas') {
    if (!Array.isArray(body.contas) || body.contas.length > 200) return erro('Lista de contas inválida.', 400);
    const { data: equipe } = await getSupabaseAdmin().from('equipe_usuarios').select('nome, email');
    const nomes = new Map((equipe || []).map((m) => [normalizarEmail(m.email), m.nome]));
    const contas = [];
    for (const c of body.contas) {
      const emailSistema = normalizarEmail(c?.email_sistema);
      const emailGoogle = normalizarEmail(c?.email_google);
      if (!emailSistema || !nomes.has(emailSistema)) continue;
      if (!emailGoogle) continue;
      if (!isValidEmail(emailGoogle)) return erro(`E-mail Google inválido: ${emailGoogle}`, 400);
      contas.push({ email_sistema: emailSistema, email_google: emailGoogle, nome: nomes.get(emailSistema) || '', ativo: c.ativo !== false });
    }
    const atual = await carregarConfigGoogle();
    await salvarConfigGoogle({ ...atual, contas });
    return NextResponse.json({ ok: true, contas });
  }

  if (acao === 'testar') {
    const emailGoogle = normalizarEmail(body.email_google);
    if (!isValidEmail(emailGoogle)) return erro('E-mail Google inválido.', 400);
    try {
      await testarConta(emailGoogle);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return erro(e.message, 400);
    }
  }

  return erro('Ação desconhecida.', 400);
}
