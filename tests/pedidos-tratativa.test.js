import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chamadoEhDe, prazoEmDe, situacaoDoPedido, textoPrazo } from '../src/lib/pedidosTratativa.js';
import { ehGestorDemandas } from '../src/lib/perfis.js';

test('a situação da demanda encerra o pedido', () => {
  const aberto = { status: 'aberto' };
  assert.equal(situacaoDoPedido(aberto, { status: 'em_andamento' }), 'aberto');
  assert.equal(situacaoDoPedido(aberto, { status: 'finalizado' }), 'concluido');
  assert.equal(situacaoDoPedido(aberto, { status: 'cancelado' }), 'cancelado');
  assert.equal(situacaoDoPedido(aberto, { status: 'pendente' }), 'em_espera');
  assert.equal(situacaoDoPedido(aberto, null), 'cancelado', 'demanda que sumiu');
  assert.equal(situacaoDoPedido({ status: 'respondido' }, { status: 'em_andamento' }), 'respondido');
  assert.equal(situacaoDoPedido({ status: 'expirado' }, { status: 'em_andamento' }), 'expirado', 'pedido já encerrado não muda');
});

test('texto do prazo', () => {
  const agora = Date.now();
  assert.equal(textoPrazo(null), 'sem prazo');
  assert.equal(textoPrazo(new Date(agora + 2 * 3600000).toISOString(), agora), 'vence em 2 h');
  assert.equal(textoPrazo(new Date(agora - 10 * 60000).toISOString(), agora), 'venceu há 10 min');
  assert.equal(prazoEmDe(null), null);
  assert.ok(new Date(prazoEmDe(30, agora)).getTime() === agora + 30 * 60000);
});

test('a demanda é da pessoa pelo e-mail do responsável', () => {
  assert.equal(chamadoEhDe({ tecnico_email: 'ana@empresa.com' }, 'ANA@empresa.com'), true);
  assert.equal(chamadoEhDe({ tecnico_email: 'ana@empresa.com' }, 'bia@empresa.com'), false);
  assert.equal(chamadoEhDe({ tecnico_email: 'geral' }, 'bia@empresa.com'), false);
  assert.equal(chamadoEhDe(null, 'bia@empresa.com'), false);
});

test('só administrador ou o módulo de gestor pede tratativa', () => {
  assert.equal(ehGestorDemandas({ administrador: true, modulos: [] }), true);
  assert.equal(ehGestorDemandas({ administrador: false, modulos: ['fila', 'demandas_gestao'] }), true);
  assert.equal(ehGestorDemandas({ administrador: false, modulos: ['fila'] }), false);
  assert.equal(ehGestorDemandas(null), false);
});
