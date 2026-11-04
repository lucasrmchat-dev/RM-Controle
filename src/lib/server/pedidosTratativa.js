import { ACOES_PRAZO, STATUS_ABERTOS, situacaoDoPedido } from '@/lib/pedidosTratativa';
import { ehGestorDemandas } from '@/lib/perfis';
import { escopoDoRegistro } from '@/lib/server/organizacao';
import { isValidUUID } from '@/lib/sanitize';

const email = (e) => String(e || '').toLowerCase().trim();
const ABERTAS = ['aguardando_visualizacao', 'em_andamento', 'pendente'];

async function auditar(db, perm, acao, detalhes) {
  await db
    .from('auditoria_logs')
    .insert([{ usuario_email: perm.email, usuario_nome: perm.nome, operador_nome: perm.nome, acao, detalhes: { modulo: 'Demandas', ...detalhes } }])
    .then(
      () => {},
      () => {}
    );
}

const resumoChamado = (c) =>
  c ? { id: c.id, empresa_nome: c.empresa_nome, status: c.status, observacao_inicial: c.observacao_inicial || '', tecnico_email: c.tecnico_email, tecnico_nome: c.atendente || c.tecnico_nome || null, categorias: c.categorias || [] } : null;

/**
 * Pedidos abertos e os encerrados nas últimas 24 h, já com um resumo da demanda.
 * Quem manda é a situação da demanda: se ela foi concluída, cancelada ou posta em espera, o pedido se encerra aqui.
 */
export async function listarPedidos(db) {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from('demanda_pedidos')
    .select('*')
    .or(`status.in.(aberto,respondido),encerrado_em.gte.${desde}`)
    .order('criado_em', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const pedidos = data || [];
  const ids = [...new Set(pedidos.map((p) => p.chamado_id))];
  const { data: chamados } = ids.length ? await db.from('suporte_chamados').select('*').in('id', ids) : { data: [] };
  const porId = new Map((chamados || []).map((c) => [c.id, c]));
  const saida = [];
  for (const p of pedidos) {
    const chamado = porId.get(p.chamado_id);
    const situacao = situacaoDoPedido(p, chamado);
    if (situacao !== p.status) {
      await db.from('demanda_pedidos').update({ status: situacao, encerrado_em: new Date().toISOString() }).eq('id', p.id).then(() => {}, () => {});
    }
    saida.push({ ...p, status: situacao, chamado: resumoChamado(chamado) });
  }
  return saida;
}

export async function criarPedido(db, perm, corpo) {
  if (!ehGestorDemandas(perm)) return { status: 403, mensagem: 'Só gestor ou administrador pode pedir a tratativa de uma demanda.' };
  if (!isValidUUID(corpo.chamado_id)) return { status: 400, mensagem: 'Demanda inválida.' };
  const { data: chamado } = await db.from('suporte_chamados').select('*').eq('id', corpo.chamado_id).maybeSingle();
  if (!chamado || !ABERTAS.includes(chamado.status)) return { status: 404, mensagem: 'Essa demanda não está mais aberta.' };
  const responsavel = email(chamado.tecnico_email);
  if (!responsavel || responsavel === 'geral') return { status: 400, mensagem: 'Essa demanda ainda não tem responsável. Você mesmo pode assumir ou cancelar.' };
  if (responsavel === email(perm.email)) return { status: 400, mensagem: 'Essa demanda é sua: trate direto.' };
  const { data: aberto } = await db.from('demanda_pedidos').select('id').eq('chamado_id', chamado.id).in('status', STATUS_ABERTOS).limit(1);
  if (aberto?.length) return { status: 409, mensagem: 'Já existe um pedido de tratativa aberto para essa demanda.' };
  const minutos = Number(corpo.prazo_minutos) || null;
  if (minutos && (minutos < 5 || minutos > 60 * 24 * 30)) return { status: 400, mensagem: 'Prazo inválido.' };
  const acao = minutos ? (ACOES_PRAZO.some((a) => a.id === corpo.acao_prazo) ? corpo.acao_prazo : null) : null;
  if (minutos && !acao) return { status: 400, mensagem: 'Escolha o que fazer se o prazo vencer.' };
  const { data: membro } = await db.from('equipe_usuarios').select('nome').eq('email', responsavel).maybeSingle();
  const novo = {
    chamado_id: chamado.id,
    solicitante_email: email(perm.email),
    solicitante_nome: perm.nome || null,
    responsavel_email: responsavel,
    responsavel_nome: membro?.nome || chamado.atendente || null,
    mensagem: String(corpo.mensagem || '').trim().slice(0, 500) || null,
    acao_prazo: acao,
    prazo_em: minutos ? new Date(Date.now() + minutos * 60000).toISOString() : null,
  };
  const { data, error } = await db.from('demanda_pedidos').insert([novo]).select('*').single();
  if (error) return { status: 500, mensagem: error.message };
  await auditar(db, perm, 'pediu_tratativa', { chamado_id: chamado.id, empresa_nome: chamado.empresa_nome, responsavel: novo.responsavel_nome || responsavel, prazo_em: novo.prazo_em, acao_prazo: acao });
  return { status: 200, pedido: { ...data, chamado: resumoChamado(chamado) } };
}

export async function responderPedido(db, perm, id, texto) {
  const { data: pedido } = await db.from('demanda_pedidos').select('*').eq('id', id).maybeSingle();
  if (!pedido || !STATUS_ABERTOS.includes(pedido.status)) return { status: 404, mensagem: 'Esse pedido já foi encerrado.' };
  const resposta = String(texto || '').trim().slice(0, 500);
  if (!resposta) return { status: 400, mensagem: 'Escreva a explicação.' };
  await db.from('demanda_pedidos').update({ status: 'respondido', resposta, respondido_em: new Date().toISOString() }).eq('id', id);
  await auditar(db, perm, 'respondeu_tratativa', { chamado_id: pedido.chamado_id, resposta });
  return { status: 200 };
}

export async function retirarPedido(db, perm, id) {
  const { data: pedido } = await db.from('demanda_pedidos').select('*').eq('id', id).maybeSingle();
  if (!pedido || !STATUS_ABERTOS.includes(pedido.status)) return { status: 404, mensagem: 'Esse pedido já foi encerrado.' };
  if (email(pedido.solicitante_email) !== email(perm.email) && !perm.administrador) return { status: 403, mensagem: 'Só quem fez o pedido pode retirá-lo.' };
  await db.from('demanda_pedidos').update({ status: 'retirado', encerrado_em: new Date().toISOString() }).eq('id', id);
  return { status: 200 };
}

/**
 * Chamada a cada minuto pelo agendador: pedidos com prazo vencido e sem tratativa concluem ou cancelam a demanda sozinhos.
 */
export async function vencerPedidos(dbGlobal) {
  const { data: vencidos, error } = await dbGlobal
    .from('demanda_pedidos')
    .select('*')
    .in('status', STATUS_ABERTOS)
    .not('prazo_em', 'is', null)
    .lte('prazo_em', new Date().toISOString())
    .limit(100);
  if (error) return { erro: error.message, tratados: 0 };
  let tratados = 0;
  for (const pedido of vencidos || []) {
    try {
      const db = escopoDoRegistro(dbGlobal, pedido);
      const agora = new Date().toISOString();
      const { data: chamado } = await db.from('suporte_chamados').select('*').eq('id', pedido.chamado_id).maybeSingle();
      // A demanda já foi tratada (ou sumiu): o pedido só se encerra
      if (!chamado || !ABERTAS.includes(chamado.status)) {
        await db.from('demanda_pedidos').update({ status: situacaoDoPedido(pedido, chamado), encerrado_em: agora }).eq('id', pedido.id);
        continue;
      }
      const nota = `Pedido de tratativa de ${pedido.solicitante_nome || pedido.solicitante_email}: o prazo venceu sem resposta e a demanda foi ${pedido.acao_prazo === 'concluir' ? 'concluída' : 'cancelada'} automaticamente.`;
      const ativo = chamado.iniciado_em ? Math.max(0, Math.floor((Date.now() - new Date(chamado.iniciado_em).getTime()) / 1000)) : null;
      const mudanca =
        pedido.acao_prazo === 'concluir'
          ? { status: 'finalizado', finalizado_em: agora, ...(ativo !== null && chamado.status === 'em_andamento' ? { duracao_segundos: ativo } : {}), observacoes: [chamado.observacoes, nota].filter(Boolean).join('\n') }
          : { status: 'cancelado', finalizado_em: agora };
      const { error: erroUpd } = await db.from('suporte_chamados').update(mudanca).eq('id', chamado.id);
      if (erroUpd) throw new Error(erroUpd.message);
      await db.from('demanda_pedidos').update({ status: 'expirado', encerrado_em: agora }).eq('id', pedido.id);
      await db
        .from('auditoria_logs')
        .insert([{ usuario_email: pedido.solicitante_email, usuario_nome: pedido.solicitante_nome, operador_nome: 'Sistema', acao: 'tratativa_vencida', detalhes: { modulo: 'Demandas', chamado_id: chamado.id, empresa_nome: chamado.empresa_nome, responsavel: pedido.responsavel_nome || pedido.responsavel_email, acao_prazo: pedido.acao_prazo } }])
        .then(() => {}, () => {});
      tratados += 1;
    } catch (e) {
      console.error('[pedidos] vencer', pedido.id, e.message);
    }
  }
  return { tratados };
}
