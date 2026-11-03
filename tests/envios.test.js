// Envios em massa: risco pelo intervalo, criação (só quem tem o sub-módulo), disparo com intervalo,
// grupos, conversas que não enchem a fila, pausa quando o número cai e trava contra envio duplicado.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { cifrarSegredos, hashToken } from '../src/lib/server/canais/cofre.js';
import { avaliarRisco, envioBloqueado, intervaloSeguro, duracaoEstimada, formatarDuracao, nivelDoRisco, preencherMensagem, proximaEspera, riscoDoIntervalo, validarEnvio } from '../src/lib/envios.js';
import { dispararProximo, processarEnvios } from '../src/lib/server/envios.js';
import { GET as lerEnvios, POST as agirEnvios } from '../src/app/api/envios/route.js';
import { POST as processarRota } from '../src/app/api/envios/processar/route.js';

__definirSupabaseAdmin(mockSupabase);

const A = crypto.randomUUID();
const B = crypto.randomUUID();
const PERFIL_ENVIOS = crypto.randomUUID();
let canal, carla, grupo, contatoB, enviados;

beforeEach(() => {
  db.reset();
  db.unicos = { mensagens: [['organizacao_id', 'id_externo']], contatos: [['organizacao_id', 'telefone']] };
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
    { id: B, nome: 'Clínica B', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.sistema_config = [];
  db.tables.auditoria_logs = [];
  db.tables.participantes_grupo = [];
  db.tables.perfis_acesso = [{ id: PERFIL_ENVIOS, organizacao_id: A, nome: 'Marketing', administrador: false, todos_departamentos: true, departamentos: [], modulos: ['chat', 'envios'] }];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana Souza', papel: 'administrador', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'bia@a.com', nome: 'Bia Lima', papel: 'suporte', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'duda@a.com', nome: 'Duda', papel: 'suporte', ativo: true, organizacao_id: A, perfil_id: PERFIL_ENVIOS },
  ];
  canal = { id: crypto.randomUUID(), organizacao_id: A, nome: 'Comercial', tipo: 'whatsapp_qr', provedor: 'evolution', status: 'conectado', ativo: true, config: {}, credenciais_cifradas: cifrarSegredos({ url: 'https://evo.exemplo.com', apikey: 'chave' }), webhook_token_hash: hashToken('t') };
  db.tables.canais = [canal];
  carla = { id: crypto.randomUUID(), organizacao_id: A, telefone: '5585999990000', nome: 'Carla Mendes', etiquetas: ['VIP'] };
  grupo = { id: crypto.randomUUID(), organizacao_id: A, telefone: '120363000000000001@g.us', nome: 'Grupo Clientes', etiquetas: ['VIP'] };
  contatoB = { id: crypto.randomUUID(), organizacao_id: B, telefone: '5585911110000', nome: 'Da outra empresa' };
  db.tables.contatos = [carla, grupo, contatoB];
  // A Carla já teve atendimento (fechado); o grupo nunca conversou
  db.tables.conversas = [{ id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: carla.id, status: 'resolvida', resolvida_em: '2026-10-01T10:00:00Z', ultima_mensagem_em: '2026-10-01T10:00:00Z' }];
  db.tables.mensagens = [];
  db.tables.envios_massa = [];
  db.tables.envios_massa_destinos = [];
  enviados = [];
  globalThis.fetch = async (url, op) => {
    enviados.push({ url: String(url), corpo: op?.body ? JSON.parse(op.body) : null, em: relogio.agora });
    return new Response(JSON.stringify({ key: { id: `EVO-${enviados.length}` } }), { status: 200 });
  };
});

// Relógio de mentira: esperar só avança o tempo
const relogio = { agora: Date.parse('2026-11-03T12:00:00Z') };
const agora = () => relogio.agora;
const dormir = async (ms) => {
  relogio.agora += ms;
};

const como = async (email, url, metodo = 'GET', body) =>
  new NextRequest(`http://localhost${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` }, body: body ? JSON.stringify(body) : undefined });
const ler = async (r) => ({ status: r.status, ...(await r.json()) });
const criar = async (email, corpo) => ler(await agirEnvios(await como(email, '/api/envios', 'POST', { acao: 'criar', canal_id: canal.id, mensagem: 'Oi {{primeiro_nome}}, novidade!', intervalo_segundos: 30, ...corpo })));

test('risco: cai conforme o intervalo aumenta, mas nunca chega a zero', () => {
  const valores = [5, 10, 15, 30, 60, 120, 300, 3600].map(riscoDoIntervalo);
  for (let i = 1; i < valores.length; i += 1) assert.ok(valores[i] <= valores[i - 1], 'quanto maior o intervalo, menor o risco');
  assert.ok(valores[0] >= 75, `5 s é risco alto (${valores[0]}%)`);
  assert.ok(valores.at(-1) > 0, 'nunca zera');
  assert.equal(riscoDoIntervalo(0), riscoDoIntervalo(5), 'abaixo do mínimo conta como o mínimo');
  // Probabilidade do envio todo: intervalo e quantidade juntos, mostrada por nível (sem números)
  const nivel = (segundos, quantidade, personalizada = false) => avaliarRisco({ segundos, quantidade, personalizada }).nivel.id;
  assert.equal(nivel(60, 3), 'baixo', '3 grupos a cada 1 min');
  assert.equal(nivel(5, 3), 'medio', 'poucos, mas rápido demais');
  assert.equal(nivel(60, 100), 'medio');
  assert.equal(nivel(30, 500), 'alto');
  assert.equal(nivel(10, 500), 'muito_alto');
  assert.ok(avaliarRisco({ segundos: 3600, quantidade: 1 }).pontos > 0, 'nunca zera');
  for (const s of [5, 30, 120]) assert.ok(avaliarRisco({ segundos: s, quantidade: 500 }).pontos >= avaliarRisco({ segundos: s, quantidade: 20 }).pontos, 'mais destinatários, mais risco');
  const r = avaliarRisco({ segundos: 10, quantidade: 400 });
  assert.ok(r.motivos.some((m) => /muito curto/.test(m)) && r.motivos.some((m) => /Muitos destinatários/.test(m)));
  assert.ok(r.recomendacoes.some((m) => /60 segundos/.test(m)) && r.recomendacoes.some((m) => /envios menores/.test(m)));
  assert.equal(nivelDoRisco(10).rotulo, 'Baixa');
  // Alta ou muito alta bloqueia; o intervalo seguro deixa em média ou baixa
  assert.equal(envioBloqueado(avaliarRisco({ segundos: 30, quantidade: 500 })), true);
  assert.equal(envioBloqueado(avaliarRisco({ segundos: 60, quantidade: 3 })), false);
  for (const n of [10, 100, 500, 1000]) {
    const s = intervaloSeguro({ quantidade: n });
    assert.ok(s && !envioBloqueado(avaliarRisco({ segundos: s, quantidade: n })), `${n} destinatários: ${s} s libera`);
    if (s > 5) assert.ok(envioBloqueado(avaliarRisco({ segundos: s - 5, quantidade: n })), 'é o menor que libera');
  }
  assert.ok(proximaEspera(30, 0) === 30_000 && proximaEspera(30, 1) === 42_000, 'variação só para mais (até +40%)');
  assert.equal(formatarDuracao(duracaoEstimada(121, 30)), '1 h');
  assert.equal(preencherMensagem('Oi {{primeiro_nome}}, tudo bem? ({{nome}})', { nome: 'Carla Mendes' }), 'Oi Carla, tudo bem? (Carla Mendes)');
  assert.equal(preencherMensagem('Oi {{primeiro_nome}}, tudo bem?', { nome: '' }), 'Oi, tudo bem?');
  assert.throws(() => validarEnvio({ mensagem: 'x', intervalo_segundos: 2, contatos: ['a'] }), /entre 5 segundos/);
  assert.throws(() => validarEnvio({ mensagem: '', intervalo_segundos: 30, contatos: ['a'] }), /Escreva a mensagem/);
  assert.throws(() => validarEnvio({ mensagem: 'x', intervalo_segundos: 30, contatos: [] }), /ao menos um/);
  assert.throws(() => validarEnvio({ mensagem: 'x', intervalo_segundos: 30, contatos: ['a'], agendado_para: '2020-01-01T10:00:00Z' }), /futuro/);
});

test('só quem tem o sub-módulo "Chat: envios em massa" cria; contato de outra empresa não entra', async () => {
  assert.equal((await criar('bia@a.com', { contatos: [carla.id] })).status, 403, 'suporte sem o sub-módulo');
  const r = await criar('duda@a.com', { nome: 'Promoção', contatos: [carla.id, grupo.id, contatoB.id], agendado_para: new Date(Date.now() + 86_400_000).toISOString() });
  assert.equal(r.status, 200, r.mensagem);
  assert.equal(r.envio.total, 2);
  assert.equal(r.envio.status, 'agendado');
  assert.deepEqual(db.tables.envios_massa_destinos.map((d) => d.contato_id), [carla.id, grupo.id]);
  assert.ok(db.tables.envios_massa_destinos.every((d) => d.organizacao_id === A));
  assert.equal(db.tables.auditoria_logs.at(-1).acao, 'envio_massa_criou');

  // A lista para escolher traz contatos e grupos com etiquetas (só da empresa)
  const d = await ler(await lerEnvios(await como('duda@a.com', '/api/envios?destinos=1')));
  assert.deepEqual(d.destinos.map((x) => x.id).sort(), [carla.id, grupo.id].sort());
  assert.equal(d.destinos.find((x) => x.id === grupo.id).grupo, true);
  assert.deepEqual(d.canais.map((k) => k.id), [canal.id]);
  assert.equal(JSON.stringify(d).includes('credenciais'), false);
});

test('probabilidade alta não deixa criar o envio (o servidor confere, não só a tela)', async () => {
  const muitos = Array.from({ length: 60 }, (_, i) => ({ id: crypto.randomUUID(), organizacao_id: A, telefone: `55859990${String(i).padStart(4, '0')}`, nome: `Contato ${i}` }));
  db.tables.contatos.push(...muitos);
  const r = await criar('ana@a.com', { contatos: muitos.map((c) => c.id), intervalo_segundos: 5 });
  assert.equal(r.status, 400);
  assert.match(r.mensagem, /Envio bloqueado/);
  assert.match(r.mensagem, /Use pelo menos/);
  assert.equal(db.tables.envios_massa.length, 0);
  // No limite (média): só com o termo aceito, que fica na auditoria
  const seguro = intervaloSeguro({ quantidade: 60, personalizada: true });
  const corpo = { contatos: muitos.map((c) => c.id), intervalo_segundos: seguro, agendado_para: new Date(Date.now() + 3_600_000).toISOString() };
  const semAceite = await criar('ana@a.com', corpo);
  assert.equal(semAceite.status, 400);
  assert.match(semAceite.mensagem, /aceite o termo/);
  assert.equal((await criar('ana@a.com', { ...corpo, aceite_risco: true })).status, 200);
  const log = db.tables.auditoria_logs.at(-1);
  assert.equal(log.detalhes.probabilidade_bloqueio, 'Média');
  assert.match(log.detalhes.termo_risco_aceito, /Assumo o risco/);
  assert.equal(log.usuario_email, 'ana@a.com');
});

test('dispara um por vez respeitando o intervalo; grupo recebe; conversas não voltam para a fila', async () => {
  const r = await criar('ana@a.com', { contatos: [carla.id, grupo.id] });
  assert.equal(r.status, 200, r.mensagem);
  // O envio "agora" começa no horário em que foi criado (relógio real); o relógio de mentira parte dele
  relogio.agora = Date.parse(r.envio.proximo_envio_em) + 1000;
  const inicio = relogio.agora;
  await processarEnvios(mockSupabase, { agora, dormir, sorteio: () => 0, fetchImpl: fetch });

  const textos = enviados.filter((e) => e.url.includes('sendText'));
  assert.equal(textos.length, 2);
  assert.equal(textos[0].corpo.text, 'Oi Carla, novidade!');
  assert.equal(textos[0].corpo.number, '5585999990000');
  assert.equal(textos[1].corpo.number, '120363000000000001@g.us', 'grupo recebe pelo identificador do grupo');
  assert.ok(textos[1].em - textos[0].em >= 30_000, 'esperou o intervalo entre as mensagens');
  assert.ok(textos[0].em - inicio < 1000);

  const envio = db.tables.envios_massa[0];
  assert.equal(envio.status, 'concluido');
  assert.equal(envio.enviados, 2);
  assert.equal(envio.falhas, 0);
  assert.ok(db.tables.envios_massa_destinos.every((d) => d.status === 'enviado'));
  // Conversa fechada continua fechada; o grupo ganhou uma conversa já fechada (nada novo em Pendentes)
  assert.ok(db.tables.conversas.every((c) => c.status === 'resolvida'));
  assert.equal(db.tables.conversas.filter((c) => c.contato_id === grupo.id).length, 1);
  assert.equal(db.tables.mensagens.filter((m) => m.direcao === 'saida').length, 2, 'fica no histórico do Chat');
});

test('número desconectado pausa o envio com aviso; retomar continua de onde parou', async () => {
  const r = await criar('ana@a.com', { contatos: [carla.id, grupo.id] });
  relogio.agora = Date.parse(r.envio.proximo_envio_em) + 1000;
  canal.status = 'desconectado';
  await processarEnvios(mockSupabase, { agora, dormir, sorteio: () => 0 });
  let envio = db.tables.envios_massa[0];
  assert.equal(envio.status, 'pausado');
  assert.match(envio.ultimo_erro, /não está conectado/);
  assert.equal(enviados.length, 0);

  canal.status = 'conectado';
  const retomado = await ler(await agirEnvios(await como('ana@a.com', '/api/envios', 'POST', { acao: 'retomar', id: envio.id })));
  assert.equal(retomado.status, 200, retomado.mensagem);
  relogio.agora = Date.parse(retomado.envio.proximo_envio_em) + 1000;
  await processarEnvios(mockSupabase, { agora, dormir, sorteio: () => 0 });
  envio = db.tables.envios_massa[0];
  assert.equal(envio.status, 'concluido');
  assert.equal(envio.enviados, 2);

  // Terminado não pode ser excluído enquanto envia, mas concluído pode
  assert.equal((await ler(await agirEnvios(await como('ana@a.com', '/api/envios', 'POST', { acao: 'excluir', id: envio.id })))).status, 200);
  assert.equal(db.tables.envios_massa.length, 0);
});

test('pausado no meio não manda mais nada; duas chamadas ao mesmo tempo não mandam em dobro', async () => {
  const r = await criar('ana@a.com', { contatos: [carla.id, grupo.id] });
  relogio.agora = Date.parse(r.envio.proximo_envio_em) + 1000;
  const foto = { ...db.tables.envios_massa[0] };
  // Duas chamadas com a mesma "foto" do envio: só uma consegue a trava
  await Promise.all([dispararProximo(mockSupabase, foto, { agora, sorteio: () => 0 }), dispararProximo(mockSupabase, foto, { agora, sorteio: () => 0 })]);
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 1);

  const pausa = await ler(await agirEnvios(await como('ana@a.com', '/api/envios', 'POST', { acao: 'pausar', id: foto.id })));
  assert.equal(pausa.status, 200, pausa.mensagem);
  relogio.agora += 3_600_000;
  await processarEnvios(mockSupabase, { agora, dormir, sorteio: () => 0 });
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 1, 'pausado não envia');
});

test('agendador: sem o CRON_SECRET certo, nada roda', async () => {
  process.env.CRON_SECRET = 'segredo-do-agendador';
  const pedir = (auth) => new NextRequest('http://localhost/api/envios/processar', { method: 'POST', headers: auth ? { Authorization: auth } : {} });
  assert.equal((await processarRota(pedir())).status, 401);
  assert.equal((await processarRota(pedir('Bearer errado'))).status, 401);
  assert.equal((await processarRota(pedir('Bearer segredo-do-agendador'))).status, 200);
});
