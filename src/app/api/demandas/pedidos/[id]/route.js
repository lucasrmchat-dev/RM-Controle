import { permissaoDoChat, semModulo } from '@/lib/server/canais/chat';
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { responderPedido, retirarPedido } from '@/lib/server/pedidosTratativa';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * PATCH { acao: 'responder', texto }   o responsável explica (o pedido fica "respondido", a demanda segue aberta)
 * PATCH { acao: 'retirar' }            quem pediu desiste do pedido
 * (concluir, cancelar e pôr em espera são feitos na própria demanda; o pedido se encerra sozinho)
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function PATCH(request, contexto) {
  const { id } = await contexto.params;
  if (!isValidUUID(id)) return json({ ok: false, mensagem: 'Pedido inválido.' }, 400);
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const bloqueio = semModulo(perm, 'fila', 'às Demandas');
  if (bloqueio) return json({ ok: false, mensagem: bloqueio }, 403);
  const corpo = await request.json().catch(() => ({}));
  const res = corpo.acao === 'retirar' ? await retirarPedido(ctx.db, perm, id) : corpo.acao === 'responder' ? await responderPedido(ctx.db, perm, id, corpo.texto) : { status: 400, mensagem: 'Ação inválida.' };
  return res.mensagem ? json({ ok: false, mensagem: res.mensagem }, res.status) : json({ ok: true });
}
