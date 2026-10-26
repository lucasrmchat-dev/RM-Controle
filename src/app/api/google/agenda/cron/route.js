import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { googleConfigurado, sincronizarTodasEmpresas, urlPublica } from '@/lib/server/googleAgenda';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tarefa diária (vercel.json): renova os canais de aviso do Google e reconcilia todas as agendas,
// cobrindo qualquer aviso que tenha se perdido. A Vercel envia "Authorization: Bearer CRON_SECRET".
export async function GET(request) {
  const segredo = process.env.CRON_SECRET;
  const recebido = request.headers.get('authorization') || '';
  const esperado = `Bearer ${segredo}`;
  if (!segredo || recebido.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
    return new NextResponse(null, { status: 401 });
  }
  if (!googleConfigurado()) return NextResponse.json({ ok: true, configurado: false });
  // Cada empresa que conectou o Google Agenda é sincronizada com as próprias contas
  const empresas = await sincronizarTodasEmpresas({ renovarCanais: true, urlBase: urlPublica(request) });
  return NextResponse.json({ ok: true, empresas });
}
