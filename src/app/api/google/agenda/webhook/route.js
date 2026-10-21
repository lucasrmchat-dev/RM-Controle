import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { googleConfigurado, carregarConfigGoogle, contaDoCanal, sincronizarConta, tokenWebhook } from '@/lib/server/googleAgenda';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const iguais = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// O Google chama este endereço sempre que algo muda numa agenda acompanhada.
// O aviso não traz o evento: só diz "mudou", então reconciliamos a agenda daquela pessoa.
export async function POST(request) {
  const segredo = tokenWebhook();
  if (!segredo || !googleConfigurado()) return new NextResponse(null, { status: 404 });
  if (!iguais(request.headers.get('x-goog-channel-token') || '', segredo)) return new NextResponse(null, { status: 403 });

  // "sync" é só a confirmação de que o canal foi aberto
  if (request.headers.get('x-goog-resource-state') === 'sync') return new NextResponse(null, { status: 200 });

  const config = await carregarConfigGoogle();
  const conta = contaDoCanal(config, request.headers.get('x-goog-channel-id'));
  if (!conta) return new NextResponse(null, { status: 200 });
  try {
    await sincronizarConta(conta);
  } catch (e) {
    console.warn('Google Agenda: falha ao reconciliar após aviso', conta.email_google, e.message);
  }
  return new NextResponse(null, { status: 200 });
}
