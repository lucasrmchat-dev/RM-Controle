import { randomBytes } from 'node:crypto';
import { isValidUUID } from '@/lib/sanitize';
import {
  CAMPOS_INTEGRACAO,
  adminWebhook,
  erroWebhook,
  falha,
  hashWebhook,
  lerJsonWebhook,
} from '@/lib/server/webhooksComercial';
import { validarIntegracaoComercial } from '@/lib/webhooksComercial';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const { db } = await adminWebhook(request);
    const { data, error } = await db
      .from('comercial_integracoes')
      .select(CAMPOS_INTEGRACAO)
      .order('created_at');
    if (error) throw error;
    const { data: recentes, error: erroEventos } = await db
      .from('comercial_webhook_eventos')
      .select(
        'id,integracao_id,evento,externo_id,recebido_em,etapa_anterior,etapa_destino,resultado',
      )
      .order('recebido_em', { ascending: false })
      .limit(30);
    if (erroEventos) throw erroEventos;
    return Response.json(
      { ok: true, integracoes: data || [], recentes: recentes || [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return erroWebhook(e);
  }
}
export async function POST(request) {
  try {
    const { db, email } = await adminWebhook(request);
    const body = await lerJsonWebhook(request);
    if (body.id && !isValidUUID(body.id)) throw falha(400, 'Integração inválida.');
    if (body.acao === 'girar_token') {
      if (!body.id) throw falha(400, 'Escolha uma integração.');
      const token = `rmwh_${randomBytes(32).toString('base64url')}`;
      const { data, error } = await db
        .from('comercial_integracoes')
        .update({
          token_hash: hashWebhook(token),
          token_prefixo: token.slice(0, 10),
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.id)
        .select(CAMPOS_INTEGRACAO)
        .single();
      if (error) throw error;
      return Response.json(
        { ok: true, integracao: data, token },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const { data: config, error: erroConfig } = await db
      .from('sistema_config')
      .select('valor')
      .eq('chave', 'comercial')
      .maybeSingle();
    if (erroConfig) throw erroConfig;
    let campos;
    try {
      campos = validarIntegracaoComercial(
        body,
        config?.valor || { departamentos: [], pipelines: [] },
      );
    } catch (e) {
      throw falha(400, e.message);
    }
    const token = body.id ? null : `rmwh_${randomBytes(32).toString('base64url')}`;
    const consulta = body.id
      ? db
          .from('comercial_integracoes')
          .update({ ...campos, updated_at: new Date().toISOString() })
          .eq('id', body.id)
      : db.from('comercial_integracoes').insert([
          {
            ...campos,
            token_hash: hashWebhook(token),
            token_prefixo: token.slice(0, 10),
            criado_por: email,
          },
        ]);
    const { data, error } = await consulta.select(CAMPOS_INTEGRACAO).single();
    if (error) throw error;
    return Response.json(
      { ok: true, integracao: data, ...(token ? { token } : {}) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return erroWebhook(e);
  }
}
