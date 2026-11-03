import crypto from 'node:crypto';
import { processarEnvios } from '@/lib/server/envios';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Envios em massa: chamado a cada minuto pelo agendador do Supabase (pg_cron + pg_net) com
 * "Authorization: Bearer CRON_SECRET". Manda as mensagens que estão na hora, respeitando o intervalo.
 */
function autorizado(request) {
  const segredo = process.env.CRON_SECRET;
  const enviado = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!segredo || !enviado) return false;
  const a = Buffer.from(segredo);
  const b = Buffer.from(enviado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function executar(request) {
  if (!autorizado(request)) return Response.json({ ok: false }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db)
    return Response.json(
      { ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 },
    );
  try {
    return Response.json({ ok: true, ...(await processarEnvios(db, { prazoMs: 50_000 })) });
  } catch (e) {
    return Response.json({ ok: false, mensagem: e.message }, { status: 500 });
  }
}

export const GET = executar;
export const POST = executar;
