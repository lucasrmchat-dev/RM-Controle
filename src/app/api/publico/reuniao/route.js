import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { consumirLimite, ipDaRequisicao } from '@/lib/server/protecao';
import { lerPorToken, responderPorToken, tokenValido } from '@/lib/server/whatsappAgenda';

export const dynamic = 'force-dynamic';

/**
 * Página pública de confirmação de reunião (clientes, sem login).
 * Não usa sessão nem cookies; o token do link é a única credencial e só dá acesso
 * a UMA reunião, com dados mínimos. Limites por IP e por link contra abuso.
 */
const CABECALHOS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};
const responder = (corpo, status = 200) => Response.json(corpo, { status, headers: CABECALHOS });
const INVALIDO = { ok: false, mensagem: 'Este link é inválido ou expirou.' };

export async function GET(request) {
  const ip = ipDaRequisicao(request);
  if (!(await consumirLimite(`publico_reuniao_ip:${ip}`, 60, 60))) return responder({ ok: false, mensagem: 'Muitas tentativas. Aguarde um minuto.' }, 429);
  const token = new URL(request.url).searchParams.get('t');
  if (!tokenValido(token)) return responder(INVALIDO, 404);
  const db = getSupabaseAdmin();
  if (!db) return responder({ ok: false, mensagem: 'Serviço indisponível.' }, 503);
  const reuniao = await lerPorToken(db, token);
  return reuniao ? responder({ ok: true, reuniao }) : responder(INVALIDO, 404);
}

export async function POST(request) {
  const ip = ipDaRequisicao(request);
  if (!(await consumirLimite(`publico_reuniao_ip_post:${ip}`, 15, 60))) return responder({ ok: false, mensagem: 'Muitas tentativas. Aguarde um minuto.' }, 429);
  if ((request.headers.get('content-length') | 0) > 4096) return responder({ ok: false, mensagem: 'Pedido grande demais.' }, 413);
  const body = await request.json().catch(() => ({}));
  if (!tokenValido(body.t)) return responder(INVALIDO, 404);
  // Cada link responde poucas vezes por hora (troca de ideia é normal; robô não)
  if (!(await consumirLimite(`publico_reuniao_token:${body.t.slice(0, 12)}`, 8, 3600))) return responder({ ok: false, mensagem: 'Você já respondeu várias vezes. Fale com a equipe pelo WhatsApp.' }, 429);
  const db = getSupabaseAdmin();
  if (!db) return responder({ ok: false, mensagem: 'Serviço indisponível.' }, 503);
  const r = await responderPorToken(db, body.t, String(body.acao || ''), body.mensagem);
  if (r.ok) return responder({ ok: true, reuniao: r.reuniao });
  if (r.status === 409) return responder({ ok: false, mensagem: 'Esta reunião já passou ou foi cancelada pela equipe.' }, 409);
  if (r.status === 400) return responder({ ok: false, mensagem: 'Pedido inválido.' }, 400);
  return responder(INVALIDO, r.status === 404 ? 404 : 500);
}
