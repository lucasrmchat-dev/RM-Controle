import { naEmpresaDaSessao } from '@/lib/server/organizacao';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterPapelServidor } from '@/lib/server/acesso';
import {
  carregarConfig,
  salvarConfig,
  gerarNovoToken,
  configPublica,
  identificarEmpresa,
  respostaErro,
  ErroIntegracao,
} from '@/lib/server/integracaoSuporte';

export const dynamic = 'force-dynamic';

// Configuração da integração: exclusiva para administradores logados (cookie de sessão)
async function exigirAdministrador(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao) throw new ErroIntegracao(401, 'sessao_invalida', 'Sessão expirada. Entre novamente.');
  // Papel atual do banco, não o gravado no cookie no momento do login
  if ((await obterPapelServidor(sessao.sub)) !== 'administrador') {
    throw new ErroIntegracao(403, 'sem_permissao', 'Apenas administradores podem configurar o suporte automático.');
  }
  return sessao;
}

async function tratarGET(request) {
  try {
    await exigirAdministrador(request);
    return Response.json({ ok: true, config: configPublica(await carregarConfig()) });
  } catch (err) {
    return respostaErro(err);
  }
}

async function tratarPUT(request) {
  try {
    await exigirAdministrador(request);
    const body = await request.json().catch(() => ({}));
    return Response.json({ ok: true, config: configPublica(await salvarConfig(body)) });
  } catch (err) {
    return respostaErro(err);
  }
}

/** POST { acao: 'gerar_token' } | { acao: 'testar', nome, limiar_sugestao?, limiar_automatico? } */
async function tratarPOST(request) {
  try {
    await exigirAdministrador(request);
    const body = await request.json().catch(() => ({}));

    if (body?.acao === 'gerar_token') {
      const token = await gerarNovoToken();
      return Response.json({ ok: true, token, config: configPublica(await carregarConfig()) });
    }

    if (body?.acao === 'testar') {
      // Permite testar limites ainda não salvos
      const config = { ...(await carregarConfig()) };
      if (body.limiar_sugestao !== undefined) config.limiar_sugestao = Number(body.limiar_sugestao);
      if (body.limiar_automatico !== undefined) config.limiar_automatico = Number(body.limiar_automatico);
      return Response.json({ ok: true, ...(await identificarEmpresa(body.nome, config)) });
    }

    throw new ErroIntegracao(400, 'acao_invalida', 'Ação desconhecida.');
  } catch (err) {
    return respostaErro(err);
  }
}

// Configuração da integração da empresa de quem está logado
export const GET = (request) => naEmpresaDaSessao(request, () => tratarGET(request));

// Configuração da integração da empresa de quem está logado
export const PUT = (request) => naEmpresaDaSessao(request, () => tratarPUT(request));

// Configuração da integração da empresa de quem está logado
export const POST = (request) => naEmpresaDaSessao(request, () => tratarPOST(request));
