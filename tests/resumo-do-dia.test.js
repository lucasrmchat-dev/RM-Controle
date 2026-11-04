import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desempenhoDe, frasePrincipal, haQuanto, primeiroNome, rankingDeResolucoes, saudacaoDaHora } from '../src/lib/resumoDoDia.js';

const fin = (email, nome, dia = 3) => ({ status: 'finalizado', tecnico_email: email, tecnico_nome: nome, finalizado_em: `2026-11-0${dia}T12:00:00Z` });
const mil = new Date('2026-11-01T00:00:00Z').getTime();

test('saudação pela hora', () => {
  assert.equal(saudacaoDaHora(8), 'Bom dia');
  assert.equal(saudacaoDaHora(14), 'Boa tarde');
  assert.equal(saudacaoDaHora(21), 'Boa noite');
  assert.equal(saudacaoDaHora(2), 'Boa noite');
});

test('primeiro nome sem cargo nem e-mail', () => {
  assert.equal(primeiroNome('Lucas Amorim (Administrador)'), 'Lucas');
  assert.equal(primeiroNome('suporte@rmchat.com.br'), '');
  assert.equal(primeiroNome(''), '');
});

test('ranking conta só concluídas do período', () => {
  const h = [fin('a@x.com', 'Ana'), fin('a@x.com', 'Ana'), fin('b@x.com', 'Bia'), { ...fin('b@x.com', 'Bia'), status: 'cancelado' }, { ...fin('c@x.com', 'Caio'), finalizado_em: '2026-10-01T12:00:00Z' }];
  const r = rankingDeResolucoes(h, mil);
  assert.deepEqual(r.map((x) => [x.chave, x.total]), [['a@x.com', 2], ['b@x.com', 1]]);
});

test('líder recebe elogio', () => {
  const r = rankingDeResolucoes([fin('a@x.com', 'Ana'), fin('a@x.com', 'Ana'), fin('b@x.com', 'Bia')], mil);
  const d = desempenhoDe(r, ['a@x.com'], 2);
  assert.equal(d.tom, 'lider');
  assert.equal(d.posicao, 1);
});

test('último lugar e muito abaixo dos colegas vira alerta para registrar os atendimentos', () => {
  const h = [];
  for (let i = 0; i < 10; i++) h.push(fin('a@x.com', 'Ana'), fin('b@x.com', 'Bia'), fin('c@x.com', 'Caio'));
  h.push(fin('d@x.com', 'Duda'));
  const d = desempenhoDe(rankingDeResolucoes(h, mil), ['d@x.com'], 4);
  assert.equal(d.posicao, 4);
  assert.equal(d.tom, 'alerta');
  assert.match(d.texto, /cadastre os chamados/i);
});

test('quem não concluiu nada fica em último e recebe alerta', () => {
  const h = [];
  for (let i = 0; i < 6; i++) h.push(fin('a@x.com', 'Ana'), fin('b@x.com', 'Bia'));
  const d = desempenhoDe(rankingDeResolucoes(h, mil), ['eu@x.com'], 3);
  assert.equal(d.posicao, 3);
  assert.equal(d.tom, 'alerta');
});

test('sozinho no sistema não compara', () => {
  assert.equal(desempenhoDe([], ['eu@x.com'], 1).tom, 'sem_dados');
});

test('frase do topo e tempo', () => {
  assert.equal(frasePrincipal({ minhas: 3, perdidas: 1, reunioes: 2 }), '1 conversa esperando resposta, 3 demandas com você e 2 reuniões pela frente.');
  assert.equal(frasePrincipal({ pedidos: 1, perdidas: 2, minhas: 3, reunioes: 4, fila: 5 }), '1 pedido de tratativa para você, 2 conversas esperando resposta e 3 demandas com você.', 'só os três mais importantes');
  assert.match(frasePrincipal({}), /tudo em dia/i);
  assert.equal(haQuanto(35), 'há 35 min');
  assert.equal(haQuanto(180), 'há 3 h');
  assert.equal(haQuanto(3000), 'há 2 dias');
});
