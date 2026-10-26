// Feedbacks (etapas, área de desenvolvimento, subtarefas) e central de notificações.
// Executar: node --import ./tests/mocks/setup.js --test tests/feedbacks.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarConfigFeedbacks,
  ehDesenvolvimento,
  etapaDe,
  tipoFeedback,
  novaSubtarefa,
  validarSubtarefas,
  progressoSubtarefas,
  prazoVencido,
  diasAtePrazo,
} from '../src/lib/feedbacks.js';
import { definirDonoNotificacoes, notificar, listarNotificacoes, naoLidas, marcarTodasLidas, removerNotificacao, limparNotificacoes } from '../src/lib/notificacoes.js';

test('configuração: nomes vazios voltam ao padrão e departamentos são limpos', () => {
  const c = validarConfigFeedbacks({ etapas: { em_analise: '  Caixa de entrada ', resolvido: '' }, departamentos_dev: ['Automação', ' Automação', '', 'Suporte'] });
  assert.equal(c.etapas.em_analise, 'Caixa de entrada');
  assert.equal(c.etapas.resolvido, 'Concluído');
  assert.equal(c.etapas.no_roadmap, 'Planejado');
  assert.deepEqual(c.departamentos_dev, ['Automação', 'Suporte']);
  assert.deepEqual(validarConfigFeedbacks(null).departamentos_dev, []);
});

test('área de desenvolvimento: administrador sempre; demais pelo departamento', () => {
  const config = { departamentos_dev: ['Automação'] };
  assert.equal(ehDesenvolvimento({ administrador: true }, null, { departamentos_dev: [] }), true);
  // Com perfil: departamentos do perfil
  assert.equal(ehDesenvolvimento({ administrador: false, perfil: { id: 1 }, departamentos: ['automação'] }, null, config), true);
  assert.equal(ehDesenvolvimento({ administrador: false, perfil: { id: 1 }, departamentos: ['Suporte'] }, null, config), false);
  assert.equal(ehDesenvolvimento({ administrador: false, perfil: { id: 1 }, departamentos: null }, null, config), true, 'perfil com todos os departamentos');
  // Sem perfil: departamentos do cadastro do membro
  assert.equal(ehDesenvolvimento({ administrador: false, perfil: null }, { departamentos: ['Automação'] }, config), true);
  assert.equal(ehDesenvolvimento({ administrador: false, perfil: null }, { departamentos: ['Suporte'] }, config), false);
  // Nenhum departamento marcado: só administradores
  assert.equal(ehDesenvolvimento({ administrador: false, perfil: null }, { departamentos: ['Automação'] }, { departamentos_dev: [] }), false);
});

test('etapas e tipos antigos são normalizados', () => {
  assert.equal(etapaDe({ status: 'em_correcao' }), 'em_correcao');
  assert.equal(etapaDe({ status: 'xyz' }), 'em_analise');
  assert.equal(etapaDe({}), 'em_analise');
  assert.equal(tipoFeedback('sugestao'), 'ideia');
  assert.equal(tipoFeedback('outro'), 'ideia');
  assert.equal(tipoFeedback('bug'), 'bug');
});

test('subtarefas: criação, limpeza, progresso e atraso', () => {
  assert.throws(() => novaSubtarefa('   '), /Escreva/);
  const agora = new Date(2026, 9, 26, 10, 0);
  const a = novaSubtarefa('Corrigir filtro', { prazo: '2026-10-20', autor: 'ana@rmchat.com' }, agora);
  const b = { ...novaSubtarefa('Testar', {}, agora), concluida_em: agora.toISOString() };
  assert.equal(a.criada_em, agora.toISOString());
  assert.equal(a.concluida_em, null);

  const limpas = validarSubtarefas([a, b, { titulo: '' }, null, { titulo: 'x', prazo: '20/10/2026', extra: 1 }]);
  assert.equal(limpas.length, 3);
  assert.equal(limpas[2].prazo, null, 'prazo em formato inválido é descartado');
  assert.equal('extra' in limpas[2], false);

  const p = progressoSubtarefas([a, b]);
  assert.equal(p.total, 2);
  assert.equal(p.feitas, 1);
  assert.equal(p.atrasadas, 1);
  assert.equal(p.fracao, 0.5);
});

test('prazo vence no fim do dia', () => {
  const tarde = new Date(2026, 9, 26, 22, 0);
  assert.equal(prazoVencido('2026-10-26', tarde), false);
  assert.equal(prazoVencido('2026-10-25', tarde), true);
  assert.equal(prazoVencido(null, tarde), false);
  assert.equal(diasAtePrazo('2026-10-29', tarde), 3);
  assert.equal(diasAtePrazo('2026-10-24', tarde), -2);
});

test('notificações: uma por id, separadas por pessoa, limpar não traz de volta', () => {
  definirDonoNotificacoes('ana@rmchat.com');
  limparNotificacoes();
  assert.equal(notificar({ id: 'sla_1', tipo: 'sla', titulo: 'SLA estourado' }), true);
  assert.equal(notificar({ id: 'sla_1', tipo: 'sla', titulo: 'SLA estourado' }), false, 'mesmo aviso não repete');
  notificar({ id: 'prazo_1', tipo: 'prazo', titulo: 'Prazo vencido' });
  assert.equal(naoLidas(), 2);

  marcarTodasLidas();
  assert.equal(naoLidas(), 0);

  removerNotificacao('sla_1');
  assert.deepEqual(listarNotificacoes().map((n) => n.id), ['prazo_1']);
  assert.equal(notificar({ id: 'sla_1', tipo: 'sla', titulo: 'SLA estourado' }), false, 'apagada não reaparece na próxima verificação');

  definirDonoNotificacoes('pedro@rmchat.com');
  assert.equal(listarNotificacoes().length, 0, 'cada pessoa tem a sua lista');

  definirDonoNotificacoes('ana@rmchat.com');
  limparNotificacoes();
  assert.equal(listarNotificacoes().length, 0);
});

// ------------------------------------------------------------------------------
// Novidades (notas de versão) e briefing para implementar
// ------------------------------------------------------------------------------
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { NOVIDADES, novidadePublicada, feedbackDoTicket, novidadesDoFeedback, rotuloTicket } from '../src/lib/novidades.js';
import { briefingImplementacao, MODULOS_FEEDBACK } from '../src/lib/feedbacks.js';
import { GET as lerNovidades, POST as publicar } from '../src/app/api/novidades/route.js';

test('registro de novidades: ids únicos, datas válidas, textos completos', () => {
  const ids = NOVIDADES.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido em lib/novidades.js');
  for (const n of NOVIDADES) {
    assert.match(n.data, /^\d{4}-\d{2}-\d{2}$/, n.id);
    assert.ok(n.titulo && n.resumo, `${n.id} sem título ou resumo`);
    assert.ok(MODULOS_FEEDBACK.includes(n.modulo), `${n.id}: módulo "${n.modulo}" fora da lista`);
    assert.ok(Array.isArray(n.tickets), `${n.id}: tickets precisa ser lista`);
  }
});

test('ticket: rótulo, busca por id ou número e novidades que citam o ticket', () => {
  const fbs = [{ id: 'abcd-1', numero: 12 }, { id: 'efgh-2' }];
  assert.equal(rotuloTicket(fbs[0]), '#12');
  assert.equal(rotuloTicket(fbs[1]), '#EFGH');
  assert.equal(feedbackDoTicket('#12', fbs), fbs[0]);
  assert.equal(feedbackDoTicket('efgh-2', fbs), fbs[1]);
  const notas = [{ id: 'n1', tickets: ['#12'] }, { id: 'n2', tickets: ['efgh-2'] }];
  assert.deepEqual(novidadesDoFeedback(fbs[0], notas).map((n) => n.id), ['n1']);
  assert.equal(novidadePublicada({ n1: { publicada: true } }, 'n1'), true);
  assert.equal(novidadePublicada({ n1: { publicada: false } }, 'n1'), false);
  assert.equal(novidadePublicada({}, 'n1'), false);
});

test('briefing leva o relato original sem reescrever, o ticket e as subtarefas', () => {
  const fb = {
    id: 'c26f',
    titulo: 'No card não aparece usuário',
    descricao: 'no card nao aparece o usuario\nda demanda',
    tipo: 'sugestao',
    prioridade: 'alta',
    modulo_afetado: 'Fila de Demandas',
    status: 'em_correcao',
    created_at: '2026-10-26T12:00:00Z',
    prazo: '2026-10-30',
    subtarefas: [{ titulo: 'Mostrar responsável', concluida_em: '2026-10-26T13:00:00Z' }, { titulo: 'Mostrar quem pediu', prazo: '2026-10-28' }],
  };
  const t = briefingImplementacao(fb, { ticket: '#18', autor: 'Maria Albano' });
  assert.ok(t.includes('no card nao aparece o usuario\nda demanda'), 'texto original intacto');
  assert.ok(t.includes('ticket #18'));
  assert.ok(t.includes('Maria Albano'));
  assert.ok(t.includes('Prazo: 30/10/2026'));
  assert.ok(t.includes('- [x] Mostrar responsável'));
  assert.ok(t.includes('- [ ] Mostrar quem pediu (prazo 28/10/2026)'));
  assert.ok(t.includes('Etapa atual: Em andamento'));
  assert.ok(t.includes('src/lib/novidades.js'));
});

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

const requisicao = async (metodo, email, body) =>
  new NextRequest('http://localhost/api/novidades', {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` },
    body: body ? JSON.stringify(body) : undefined,
  });

test('só a área de desenvolvimento publica novidades; todos leem', async () => {
  db.reset();
  db.tables.perfis_acesso = [];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'dev@rmchat.com', nome: 'Dev', papel: 'suporte', ativo: true, departamentos: ['Automação'] },
    { id: crypto.randomUUID(), email: 'ana@rmchat.com', nome: 'Ana', papel: 'suporte', ativo: true, departamentos: ['Suporte'] },
  ];
  db.tables.sistema_config = [{ chave: 'feedbacks', valor: { departamentos_dev: ['Automação'] } }];
  const id = NOVIDADES[0].id;

  const negado = await publicar(await requisicao('POST', 'ana@rmchat.com', { id, publicar: true }));
  assert.equal(negado.status, 403);

  const desconhecida = await publicar(await requisicao('POST', 'dev@rmchat.com', { id: 'nao-existe', publicar: true }));
  assert.equal(desconhecida.status, 400);

  const ok = await publicar(await requisicao('POST', 'dev@rmchat.com', { id, publicar: true }));
  assert.equal(ok.status, 200);

  const leitura = await (await lerNovidades(await requisicao('GET', 'ana@rmchat.com'))).json();
  assert.equal(leitura.publicacao[id].publicada, true);
  assert.equal(leitura.publicacao[id].por, 'dev@rmchat.com');
  assert.equal(leitura.desenvolvimento, false);

  const doDev = await (await lerNovidades(await requisicao('GET', 'dev@rmchat.com'))).json();
  assert.equal(doDev.desenvolvimento, true);
});
