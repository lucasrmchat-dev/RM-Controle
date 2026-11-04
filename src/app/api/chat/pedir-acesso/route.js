import { consumirLimite } from '@/lib/server/protecao';
import { acessoAoChat, canalLiberado, podeVerConversa } from '@/lib/server/canais/chat';
import { enviarTextoNaConversa } from '@/lib/server/canais/index';
import { ehGrupo } from '@/lib/canais';
import { isValidUUID } from '@/lib/sanitize';
import { MENSAGEM_PEDIR_ACESSO } from '@/lib/pedirAcesso';

export const dynamic = 'force-dynamic';

/**
 * Pedir o acesso ao cliente (tela de entrada na empresa, quando a equipe não consegue logar).
 *  GET  ?empresa_id=&chamado_id=   para onde o pedido iria: { destino: { nome, grupo } | null }
 *  POST { empresa_id, chamado_id } manda a mensagem pronta ao grupo de WhatsApp ligado à empresa
 *                                  (ou, sem grupo, à conversa de onde a demanda nasceu)
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function destinoDoPedido(db, perm, { empresaId, chamadoId }) {
  const visivel = (c) => c && podeVerConversa(perm, c) && canalLiberado(perm, c.canal_id);
  const comContato = async (conversa) => {
    const { data: contato } = await db.from('contatos').select('id, nome, telefone').eq('id', conversa.contato_id).maybeSingle();
    return { conversa, contato };
  };
  // 1) O grupo de WhatsApp ligado à empresa (a conversa mais recente dele)
  if (isValidUUID(empresaId)) {
    const { data: contatos } = await db.from('contatos').select('id, telefone').eq('empresa_id', empresaId);
    const grupos = (contatos || []).filter((c) => ehGrupo(c.telefone)).map((c) => c.id);
    if (grupos.length) {
      const { data: conversas } = await db.from('conversas').select('*').in('contato_id', grupos).order('ultima_mensagem_em', { ascending: false }).limit(10);
      const achada = (conversas || []).find(visivel);
      if (achada) return comContato(achada);
    }
  }
  // 2) A conversa de onde a demanda nasceu
  if (isValidUUID(chamadoId)) {
    const { data: chamado } = await db.from('suporte_chamados').select('chat_conversa_id').eq('id', chamadoId).maybeSingle();
    if (chamado?.chat_conversa_id) {
      const { data: conversa } = await db.from('conversas').select('*').eq('id', chamado.chat_conversa_id).maybeSingle();
      if (visivel(conversa)) return comContato(conversa);
    }
  }
  return null;
}

export async function GET(request) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const p = new URL(request.url).searchParams;
  const destino = await destinoDoPedido(r.ctx.db, r.perm, { empresaId: p.get('empresa_id'), chamadoId: p.get('chamado_id') });
  return json({ ok: true, destino: destino ? { nome: destino.contato?.nome || destino.contato?.telefone || 'conversa', grupo: ehGrupo(destino.contato?.telefone) } : null });
}

export async function POST(request) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const { ctx, perm } = r;
  const corpo = (await request.json().catch(() => null)) || {};
  if (!(await consumirLimite(`pedir_acesso_${ctx.db.organizacaoId || 'x'}_${corpo.empresa_id || corpo.chamado_id}`, 3, 600))) return json({ ok: false, mensagem: 'O pedido já foi enviado há pouco. Aguarde a resposta do cliente.' }, 429);
  const destino = await destinoDoPedido(ctx.db, perm, { empresaId: corpo.empresa_id, chamadoId: corpo.chamado_id });
  if (!destino) return json({ ok: false, mensagem: 'Esta empresa não tem um grupo de WhatsApp ligado. Peça o acesso pelo Chat.' }, 404);
  try {
    // Sai com o nome de quem pediu e sem assumir a conversa (a fila do grupo continua como estava)
    await enviarTextoNaConversa(ctx.db, { conversa: destino.conversa, texto: MENSAGEM_PEDIR_ACESSO, autor: { email: perm.email, nome: perm.nome }, assinar: true, assumir: false });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  await ctx.db
    .from('auditoria_logs')
    .insert([{ usuario_email: perm.email, usuario_nome: perm.nome, operador_nome: perm.nome, acao: 'pediu_acesso_cliente', detalhes: { modulo: 'Demandas', conversa_id: destino.conversa.id, contato_nome: destino.contato?.nome || '' } }])
    .then(() => {}, () => {});
  return json({ ok: true, destino: { nome: destino.contato?.nome || 'conversa', grupo: ehGrupo(destino.contato?.telefone) } });
}
