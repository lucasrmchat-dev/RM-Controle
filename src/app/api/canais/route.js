import { contextoDaRequisicao, mensagemLimite } from '@/lib/server/organizacao';
import { validarUrlWebhook } from '@/lib/server/whatsappAgenda';
import { cifrarSegredos, hashToken, novoToken } from '@/lib/server/canais/cofre';
import { canalPublico, enderecoWebhook, provedorDo, segredosDo, servidorQrDaPlataforma } from '@/lib/server/canais/index';
import { validarCanal } from '@/lib/canais';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Canais de WhatsApp da empresa.
 *  GET              lista (sem segredos)                      — qualquer pessoa da equipe
 *  POST             cria (segredos cifrados)                  — administradores
 *  PATCH { id, … }  nome, departamento padrão, ativo           — administradores
 *  DELETE { id }    exclui (só sem conversas; senão, desative) — administradores
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const { data, error } = await ctx.db.from('canais').select('*').order('criado_em');
  if (error) return json({ ok: false, mensagem: /canais/.test(error.message) ? 'Rode supabase/migration_canais_chat.sql no Supabase.' : error.message }, 500);
  return json({ ok: true, canais: (data || []).map(canalPublico), admin: ctx.admin, servidorQr: Boolean(servidorQrDaPlataforma()) });
}

export async function POST(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const body = (await request.json().catch(() => null)) || {};
  let dados;
  try {
    dados = validarCanal({ ...body, servidorDaPlataforma: Boolean(servidorQrDaPlataforma()) });
    if (dados.canal.provedor === 'evolution' && dados.segredos.url) dados.segredos.url = validarUrlWebhook(dados.segredos.url).replace(/\/$/, '');
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  // Token do webhook: a Meta usa como "token de verificação"; a Evolution recebe no cabeçalho ao conectar
  const token = novoToken();
  const { data, error } = await ctx.db
    .from('canais')
    .insert([{ ...dados.canal, credenciais_cifradas: cifrarSegredos(dados.segredos), webhook_token_hash: hashToken(token), criado_por: ctx.email }])
    .select('*')
    .single();
  if (error) {
    const limite = mensagemLimite(error);
    return json({ ok: false, mensagem: limite || error.message }, limite ? 403 : 500);
  }
  // Oficial: confere token e número na hora (e já mostra nome verificado e qualidade)
  if (data.provedor === 'meta') {
    try {
      const r = await provedorDo(data).situacao(data, segredosDo(data));
      await ctx.db.from('canais').update({ status: r.status, numero: r.numero, config: r.config, atualizado_em: new Date().toISOString() }).eq('id', data.id);
      Object.assign(data, { status: r.status, numero: r.numero, config: r.config });
    } catch (e) {
      await ctx.db.from('canais').update({ status: 'erro', status_detalhe: e.message.slice(0, 300) }).eq('id', data.id);
      Object.assign(data, { status: 'erro', status_detalhe: e.message });
    }
  }
  return json(
    {
      ok: true,
      canal: canalPublico(data),
      // Mostrado UMA vez: dados para colar no painel da Meta (Webhook › Callback URL e Verify token)
      ...(data.provedor === 'meta' ? { webhook: { url: enderecoWebhook(request, data.id), token_verificacao: token } } : {}),
    },
    201
  );
}

export async function PATCH(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Canal inválido.' }, 400);
  const campos = { atualizado_em: new Date().toISOString() };
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim().slice(0, 80);
    if (nome.length < 2) return json({ ok: false, mensagem: 'Nome muito curto.' }, 400);
    campos.nome = nome;
  }
  if (body.departamento_padrao !== undefined) campos.departamento_padrao = String(body.departamento_padrao || '').trim().slice(0, 60) || null;
  if (body.ativo !== undefined) campos.ativo = Boolean(body.ativo);
  const { data, error } = await ctx.db.from('canais').update(campos).eq('id', body.id).select('*').maybeSingle();
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  if (!data) return json({ ok: false, mensagem: 'Canal não encontrado.' }, 404);
  return json({ ok: true, canal: canalPublico(data) });
}

export async function DELETE(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Canal inválido.' }, 400);
  const { data: canal } = await ctx.db.from('canais').select('*').eq('id', body.id).maybeSingle();
  if (!canal) return json({ ok: false, mensagem: 'Canal não encontrado.' }, 404);
  const { count } = await ctx.db.from('conversas').select('id', { count: 'exact', head: true }).eq('canal_id', canal.id);
  if (count > 0) return json({ ok: false, mensagem: 'Este canal tem conversas guardadas. Desative-o em vez de excluir, para não perder o histórico.' }, 409);
  await provedorDo(canal).remover(canal, segredosDo(canal)).catch(() => {});
  const { error } = await ctx.db.from('canais').delete().eq('id', canal.id);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true });
}
