import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL do iCal (.ics) não informada.' }, { status: 400 });
  }

  // Validação básica de URL permitindo apenas URLs do Google Calendar ou iCal válidos
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('calendar.google.com') && !parsed.pathname.endsWith('.ics')) {
      return NextResponse.json({ error: 'URL inválida. Forneça uma URL do Google Agenda ou arquivo .ics válido.' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RMControle/1.0; +https://rmcontrole.com)',
        'Accept': 'text/calendar, text/plain, */*',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Google Calendar respondeu com código ${res.status}. Verifique se o endereço é público ou se a chave secreta é válida.` },
        { status: res.status }
      );
    }

    const icsText = await res.text();
    return new Response(icsText, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Falha na conexão com o servidor da agenda.' },
      { status: 500 }
    );
  }
}
