import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { consumirLimite } from '@/lib/server/protecao';
import { abrirConversaComNumero, configDoChat, enviarTextoParaNumero } from '@/lib/server/canais/index';
import { avisarAoVivo, topicoAoVivo } from '@/lib/server/canais/aoVivo';
import { auditarChat, juntarDetalhes, listarConversas, permissaoDoChat, semModulo } from '@/lib/server/canais/chat';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Conversas do WhatsApp que a pessoa pode ver.
 *  GET ?aba=abertas|resolvidas
 *  POST { canal_id, telefone, texto, departamento? }   inicia uma conversa mandando a primeira mensagem (só canais por QR Code)
 *  POST { canal_id, telefone, departamento?, sem_mensagem: true }   só abre a conversa (nada vai ao cliente)
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  if (semModulo(perm, 'chat', 'ao Chat')) return json({ ok: false, mensagem: semModulo(perm, 'chat', 'ao Chat') }, 403);
  const aba = new URL(request.url).searchParams.get('aba') === 'resolvidas' ? 'resolvidas' : 'abertas';
  try {
    const conversas = await listarConversas(ctx.db, perm, { aba });
    return json({ ok: true, conversas, eu: { email: perm.email, nome: perm.nome, admin: perm.administrador }, config: await configDoChat(ctx.db), aoVivo: topicoAoVivo(ctx.org?.id || null) });
  } catch (e) {
    return json({ ok: false, mensagem: /conversas/.test(e.message) ? 'Rode supabase/migration_canais_chat.sql no Supabase.' : e.message }, 500);
  }
}

export async function POST(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  if (semModulo(perm, 'chat', 'ao Chat')) return json({ ok: false, mensagem: semModulo(perm, 'chat', 'ao Chat') }, 403);
  if (!(await consumirLimite(`chat_novo_${perm.email}`, 20, 60))) return json({ ok: false, mensagem: 'Muitas conversas novas seguidas. Aguarde um minuto.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.canal_id)) return json({ ok: false, mensagem: 'Escolha o canal.' }, 400);
  const { data: canal } = await ctx.db.from('canais').select('*').eq('id', body.canal_id).maybeSingle();
  if (!canal || !canal.ativo) return json({ ok: false, mensagem: 'Canal não disponível.' }, 404);
  const autor = { email: perm.email, nome: perm.nome };
  const departamento = String(body.departamento || '').trim().slice(0, 60);
  const finalizar = async (conversaId) => {
    if (departamento) await ctx.db.from('conversas').update({ departamento }).eq('id', conversaId);
    const { data } = await ctx.db.from('conversas').select('*').eq('id', conversaId).single();
    await auditarChat(ctx.db, perm, 'chat_iniciou', data);
    await avisarAoVivo(data.organizacao_id || null);
    return json({ ok: true, conversa: (await juntarDetalhes(ctx.db, [data]))[0] }, 201);
  };
  // Só abrir: não manda nada ao cliente (vale também para a API oficial)
  if (body.sem_mensagem) {
    try {
      const conversa = await abrirConversaComNumero(ctx.db, { canal, telefone: body.telefone, autor });
      return await finalizar(conversa.id);
    } catch (e) {
      return json({ ok: false, mensagem: e.message }, 400);
    }
  }
  if (canal.status !== 'conectado') return json({ ok: false, mensagem: 'Este canal não está conectado.' }, 409);
  // API oficial: primeiro contato só por template aprovado (entra com os templates)
  if (canal.tipo === 'whatsapp_oficial') return json({ ok: false, mensagem: 'Pela API oficial, a primeira mensagem precisa ser um template aprovado pela Meta.' }, 409);
  try {
    const mensagem = await enviarTextoParaNumero(ctx.db, { canal, telefone: body.telefone, texto: body.texto, autor, assinar: body.assinar !== false });
    return await finalizar(mensagem.conversa_id);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 502);
  }
}
