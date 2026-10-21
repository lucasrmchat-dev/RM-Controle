import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { normalizarEmail } from '@/lib/roles';
import {
  lerState,
  trocarCodigo,
  registrarConexao,
  registrarFalhaConexao,
  registrarErroSincronizacao,
  carregarContasConectadas,
  sincronizarConta,
  sincronizarTodas,
  urlPublica,
} from '@/lib/server/googleAgenda';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COOKIE_OAUTH = 'rm_google_oauth';

// Volta do Google depois que a pessoa autorizou (ou recusou) o acesso à agenda.
export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const ir = (status, motivo = '') => {
    const res = NextResponse.redirect(new URL(`/?google_agenda=${status}${motivo ? `&motivo=${motivo}` : ''}`, request.url));
    res.cookies.set(COOKIE_OAUTH, '', { path: '/api/google/agenda/oauth', maxAge: 0 });
    return res;
  };

  if (params.get('error')) return ir('erro', params.get('error') === 'access_denied' ? 'recusado' : 'google');
  const emailSistema = lerState(params.get('state'), request.cookies.get(COOKIE_OAUTH)?.value);
  if (!emailSistema) return ir('erro', 'expirou');
  // Quem voltou precisa ser a mesma pessoa que iniciou (a sessão continua valendo)
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub || normalizarEmail(sessao.sub) !== emailSistema) return ir('erro', 'sessao');

  try {
    const redirectUri = `${urlPublica(request)}/api/google/agenda/oauth/callback`;
    const { emailGoogle, refreshToken } = await trocarCodigo(params.get('code'), redirectUri);
    const { data: membro } = await getSupabaseAdmin().from('equipe_usuarios').select('nome').eq('email', emailSistema).maybeSingle();
    await registrarConexao({ emailSistema, nome: membro?.nome || '', emailGoogle, refreshToken });
  } catch (e) {
    console.warn('Google Agenda: falha ao conectar', e.message);
    await registrarFalhaConexao(emailSistema, e.message).catch(() => {});
    return ir('erro', e.codigo === 'escopo' ? 'escopo' : 'google');
  }

  // Primeira importação já na volta, só desta pessoa: ela chega na Agenda com os eventos do Google.
  // Se falhar, o motivo fica visível em Configurações › Agenda.
  try {
    const conta = (await carregarContasConectadas()).find((c) => c.conectado_por === emailSistema && c.principal);
    if (!conta) throw new Error('A conexão não foi encontrada logo após ser gravada. Tente conectar de novo.');
    await sincronizarConta(conta);
  } catch (e) {
    console.warn('Google Agenda: primeira importação falhou', e.message);
    await registrarErroSincronizacao(emailSistema, `Conectado, mas a primeira importação falhou: ${e.message}`).catch(() => {});
    return ir('conectado', 'importacao');
  }
  // Abre o canal de avisos em tempo real (só no site publicado, com https)
  await sincronizarTodas({ renovarCanais: true, urlBase: urlPublica(request) }).catch(() => {});
  return ir('conectado');
}
