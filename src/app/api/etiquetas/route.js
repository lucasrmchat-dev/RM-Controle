import { TIPOS_ETIQUETA, validarEtiquetas } from '@/lib/etiquetas';
import { etiquetasDaEmpresa } from '@/lib/server/etiquetas';
import { contextoDaRequisicao } from '@/lib/server/organizacao';

export const dynamic = 'force-dynamic';

/**
 * Etiquetas cadastradas da empresa (Configurações › Etiquetas).
 *  GET                         { chat: [...], demandas: [...] } — toda a equipe lê
 *  PUT { tipo, etiquetas }     substitui a lista (chat | demandas) — só administradores
 * Na primeira leitura, a lista nasce com as etiquetas que já estavam em uso (contatos/grupos e demandas),
 * para nada se perder quando as etiquetas passaram a ser só as cadastradas.
 */
const json = (corpo, status = 200) =>
  Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  try {
    const [chat, demandas] = await Promise.all([
      etiquetasDaEmpresa(ctx.db, 'chat'),
      etiquetasDaEmpresa(ctx.db, 'demandas'),
    ]);
    return json({ ok: true, chat, demandas });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 500);
  }
}

export async function PUT(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const body = (await request.json().catch(() => null)) || {};
  if (!TIPOS_ETIQUETA[body.tipo])
    return json({ ok: false, mensagem: 'Tipo de etiqueta inválido.' }, 400);
  let lista;
  try {
    lista = validarEtiquetas(body.etiquetas);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  const { error } = await ctx.db
    .from('sistema_config')
    .upsert(
      {
        chave: TIPOS_ETIQUETA[body.tipo].chave,
        valor: lista,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chave' },
    );
  if (error) return json({ ok: false, mensagem: 'Não foi possível salvar as etiquetas.' }, 500);
  return json({ ok: true, tipo: body.tipo, etiquetas: lista });
}
