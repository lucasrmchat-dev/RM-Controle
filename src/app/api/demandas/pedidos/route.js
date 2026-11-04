import { permissaoDoChat, semModulo } from '@/lib/server/canais/chat';
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { criarPedido, listarPedidos } from '@/lib/server/pedidosTratativa';

export const dynamic = 'force-dynamic';

/**
 * Pedidos de tratativa das demandas (o gestor pede que o responsável trate uma demanda).
 *  GET   pedidos abertos e os encerrados nas últimas 24 h
 *  POST  { chamado_id, mensagem?, prazo_minutos?, acao_prazo? }  só gestor ou administrador
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function acesso(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const bloqueio = semModulo(perm, 'fila', 'às Demandas');
  if (bloqueio) return { erro: json({ ok: false, mensagem: bloqueio }, 403) };
  return { ctx, perm };
}

export async function GET(request) {
  const r = await acesso(request);
  if (r.erro) return r.erro;
  try {
    return json({ ok: true, pedidos: await listarPedidos(r.ctx.db) });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 500);
  }
}

export async function POST(request) {
  const r = await acesso(request);
  if (r.erro) return r.erro;
  const corpo = await request.json().catch(() => ({}));
  const res = await criarPedido(r.ctx.db, r.perm, corpo);
  return res.mensagem ? json({ ok: false, mensagem: res.mensagem }, res.status) : json({ ok: true, pedido: res.pedido });
}
