import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { urlPublica } from '@/lib/server/googleAgenda';
import { processarLembretes } from '@/lib/server/whatsappAgenda';

export const dynamic = 'force-dynamic';

/**
 * Lembretes de reunião pelo WhatsApp. Chamado a cada 5 minutos pelo agendador
 * (pg_cron do Supabase ou Vercel Cron) com "Authorization: Bearer CRON_SECRET".
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
  if (!db) return Response.json({ ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });
  try {
    return Response.json({ ok: true, ...(await processarLembretes(db, { base: urlPublica(request) })) });
  } catch (e) {
    return Response.json({ ok: false, mensagem: e.message }, { status: 500 });
  }
}

export const GET = executar;
export const POST = executar;
