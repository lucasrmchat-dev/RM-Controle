import { createHash } from 'node:crypto';
import { contextoDaRequisicao } from '@/lib/server/organizacao';
export const hashWebhook = (valor) => createHash('sha256').update(valor).digest('hex');
export const CAMPOS_INTEGRACAO =
  'id,nome,pipeline_id,departamento,etapa_inicial_id,regras,ativo,token_prefixo,created_at,updated_at';
export function erroWebhook(e) {
  return Response.json(
    {
      ok: false,
      mensagem: e?.status
        ? e.message
        : 'Não foi possível acessar os webhooks. Aplique migration_comercial_webhooks.sql no Supabase e tente novamente.',
    },
    { status: e?.status || 503 },
  );
}
export function falha(status, message) {
  return Object.assign(new Error(message), { status });
}
// Administrador da empresa assinante; o banco fica preso a ela (integrações e eventos só dela)
export async function adminWebhook(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) throw falha(ctx.erro.status, (await ctx.erro.json().catch(() => ({}))).mensagem || 'Acesso negado.');
  if (!ctx.admin) throw falha(403, 'Apenas administradores podem configurar webhooks.');
  return { db: ctx.db, email: ctx.email };
}
// O campo Token Autenticação pode ser enviado como Authorization direto ou Bearer.
// Cabeçalhos alternativos mantêm a mesma exigência de segredo, nunca pela URL.
export function extrairTokenWebhook(request) {
  const valores = ['authorization', 'x-webhook-token', 'x-api-key', 'token']
    .map((h) => request.headers.get(h)?.trim())
    .filter(Boolean)
    .map((v) => v.replace(/^Bearer\s+/i, ''));
  if (!valores.length || new Set(valores).size !== 1 || !/^[a-zA-Z0-9_-]{1,200}$/.test(valores[0]))
    return null;
  return valores[0];
}

export async function lerJsonWebhook(request) {
  const reader = request.body?.getReader();
  if (!reader) throw falha(400, 'Envie um JSON.');
  const decoder = new TextDecoder();
  let texto = '';
  let tamanho = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > 262144) {
        await reader.cancel();
        throw falha(413, 'O webhook excede 256 KB.');
      }
      texto += decoder.decode(value, { stream: true });
    }
    texto += decoder.decode();
    const json = JSON.parse(texto);
    if (!json || Array.isArray(json) || typeof json !== 'object') throw new Error();
    return json;
  } catch (e) {
    if (e.status) throw e;
    throw falha(400, 'JSON inválido.');
  } finally {
    reader.releaseLock();
  }
}
export const canonical = (valor) => {
  if (Array.isArray(valor)) return `[${valor.map(canonical).join(',')}]`;
  if (valor && typeof valor === 'object')
    return `{${Object.keys(valor)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(valor[k])}`)
      .join(',')}}`;
  return JSON.stringify(valor);
};
