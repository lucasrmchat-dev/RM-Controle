import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { correspondeCondicao, etapaPorRegras, lerVariavel, normalizarTicketRM, validarIntegracaoComercial } from '../src/lib/webhooksComercial.js';
import { hashWebhook, canonical } from '../src/lib/server/webhooksComercial.js';
import { POST as receber } from '../src/app/api/integracoes/comercial/webhook/[id]/route.js';
import { POST as salvar, GET as listar } from '../src/app/api/integracoes/comercial/config/route.js';
const id = randomUUID(); const token = 'token-apenas-do-teste';
const config = { departamentos: ['Comercial'], pipelines: [{ id: 'vendas', nome: 'Vendas', etapas: [{ id: 'qualificacao', nome: 'Qualificação' }, { id: 'proposta', nome: 'Proposta' }] }] };
const integracao = { id, nome: 'RM Chat', tenant_id: '1', pipeline_id: 'vendas', departamento: 'Comercial', etapa_inicial_id: 'qualificacao', regras: [], ativo: true, token_hash: hashWebhook(token), token_prefixo: 'token' };
const payload = () => ({ tenantId: 1, event: 'UpdateOnTicket', ticket: { id: 9902, tenantId: 1, queueId: 2, status: 'open', updatedAt: '2026-01-02T10:00:00.000Z', lastMessage: 'Quero o plano AZUL, por favor', contact: { name: 'Contato Exemplo', email: '', number: '559999009900', customFields: { cpf: '12312312311' } } } });
const condicao = (campo, operador, valores, combinacao = 'qualquer') => ({ campo, operador, valores, combinacao });
beforeEach(() => {
 db.reset(); __definirSupabaseAdmin(supabase); db.tables.comercial_integracoes = [{ ...integracao }]; db.tables.comercial_webhook_eventos = []; db.tables.sistema_config = [{ chave: 'comercial', valor: config }]; db.tables.equipe_usuarios = [{ email: 'maria@rmchat.com', papel: 'suporte', ativo: true }];
 process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock'; process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
});
test('igual e contém aceitam vários termos, com E/OU e palavras ou frases', () => {
 const p = payload();
 assert.equal(correspondeCondicao(p, condicao('ticket.lastMessage', 'igual', ['azul', 'Quero o plano azul, por favor'])), true);
 assert.equal(correspondeCondicao(p, condicao('ticket.lastMessage', 'igual', ['azul', 'verde'])), false);
 assert.equal(correspondeCondicao(p, condicao('ticket.lastMessage', 'contem', ['amarelo', 'plano azul'])), true);
 assert.equal(correspondeCondicao(p, condicao('ticket.lastMessage', 'contem', ['plano azul', 'por favor'], 'todos')), true);
 assert.equal(correspondeCondicao(p, condicao('ticket.lastMessage', 'contem', ['azul', 'verde'], 'todos')), false);
 p.ticket.lastMessage = '  OLÁ,  proposta  ';
 assert.equal(correspondeCondicao(p, condicao('ticket.lastMessage', 'igual', ['olá, proposta'])), true);
});
test('regras combinam variáveis e seguem a primeira prioridade, sem inferir perda pelo fechamento', () => {
 const regras = [{ nome: 'Proposta azul', etapa_id: 'proposta', modo: 'todas', condicoes: [condicao('ticket.lastMessage', 'contem', ['azul']), condicao('ticket.queueId', 'igual', ['2', '5'])] }, { nome: 'Aberto', etapa_id: 'qualificacao', modo: 'qualquer', condicoes: [condicao('ticket.status', 'igual', ['open'])] }];
 assert.equal(etapaPorRegras(payload(), regras), 'proposta');
 const p = payload(); p.ticket.queueId = 8;
 assert.equal(etapaPorRegras(p, regras), 'qualificacao');
 p.ticket.status = 'closed'; assert.equal(etapaPorRegras(p, regras), null);
 assert.equal(lerVariavel(p, 'ticket.constructor.prototype'), undefined);
 assert.equal(correspondeCondicao(p, condicao('ticket.ausente', 'igual', ['x'])), false);
});
test('payload RM Chat usa tenant + ticket e não armazena CPF, mensagens ou foto do contato', () => {
 const dados = normalizarTicketRM(payload());
 assert.equal(dados.externo_id, '1:9902');
 assert.equal(dados.nome, 'Contato Exemplo');
 assert.equal(JSON.stringify(dados).includes('12312312311'), false);
 assert.equal(Object.hasOwn(dados, 'lastMessage'), false);
 const incoerente = payload(); incoerente.tenantId = 2; assert.throws(() => normalizarTicketRM(incoerente), /origem/);
 const p = payload(); delete p.ticket.updatedAt; assert.throws(() => normalizarTicketRM(p), /updatedAt/);
 assert.equal(hashWebhook(canonical({ b: 1, a: { z: 2, x: 3 } })), hashWebhook(canonical({ a: { x: 3, z: 2 }, b: 1 })));
});
test('validação rejeita regras vazias, etapas inexistentes e caminhos inseguros', () => {
 assert.equal(validarIntegracaoComercial(integracao, config).etapa_inicial_id, 'qualificacao');
 for (const campo of ['__proto__.x', 'ticket.constructor', 'ticket..name']) assert.throws(() => validarIntegracaoComercial({ ...integracao, regras: [{ modo: 'todas', etapa_id: 'proposta', condicoes: [condicao(campo, 'igual', ['x'])] }] }, config));
 assert.throws(() => validarIntegracaoComercial({ ...integracao, etapa_inicial_id: 'ganho' }, config));
});
async function request(body, bearer = token, headers = {}) { return new NextRequest(`http://localhost/api/integracoes/comercial/webhook/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }); }
test('webhook autentica antes de processar e rejeita origem inconsistente e JSON grande', async () => {
 let chamadas = 0; db.rpcs.rm_receber_lead_comercial = () => { chamadas++; return { ok: true }; };
 assert.equal((await receber(await request(payload(), 'errado'), { params: { id } })).status, 401);
 const p = payload(); p.tenantId = 2;
 assert.equal((await receber(await request(p), { params: { id } })).status, 422);
 assert.equal((await receber(await request('x'.repeat(262145)), { params: { id } })).status, 413);
 assert.equal(chamadas, 0);
 db.tables.comercial_integracoes[0].ativo = false;
 assert.equal((await receber(await request(payload()), { params: { id } })).status, 403);
});
test('webhook entrega uma única operação transacional com etapa calculada e resumo mínimo', async () => {
 db.tables.comercial_integracoes[0].regras = [{ modo: 'todas', etapa_id: 'proposta', condicoes: [condicao('ticket.lastMessage', 'contem', ['verde', 'azul'])] }];
 let dados;
 db.rpcs.rm_receber_lead_comercial = (args) => { dados = args; return { ok: true, lead_id: randomUUID(), etapa_id: args.p_etapa }; };
 const r = await receber(await request(payload()), { params: { id } });
 assert.equal(r.status, 200); assert.equal((await r.json()).etapa_id, 'proposta');
 assert.equal(dados.p_etapa, 'proposta'); assert.equal(dados.p_token_hash, hashWebhook(token));
 assert.equal(JSON.stringify(dados).includes('12312312311'), false);
 assert.equal(dados.p_evento_id.length, 64);
});
async function configRequest(body, email = 'lucas@rmchat.com') { return new NextRequest('http://localhost/api/integracoes/comercial/config', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'administrador' })}` }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
test('admin cria e gira token; GET nunca devolve hash ou segredo e suporte não configura', async () => {
 assert.equal((await salvar(await configRequest(integracao, 'maria@rmchat.com'))).status, 403);
 const { id: antigo, token_hash, ...body } = integracao;
 const r = await salvar(await configRequest(body)); assert.equal(r.status, 200);
 const j = await r.json(); assert.match(j.token, /^rmwh_/); assert.equal(j.integracao.token_hash, undefined);
 const salva = db.tables.comercial_integracoes.find((x) => x.id === j.integracao.id);
 assert.equal(salva.token_hash, hashWebhook(j.token));
 const leitura = await (await listar(await configRequest())).json();
 assert.equal(JSON.stringify(leitura).includes(salva.token_hash), false); assert.equal(JSON.stringify(leitura).includes(j.token), false);
 const girada = await (await salvar(await configRequest({ id: salva.id, acao: 'girar_token' }))).json();
 assert.notEqual(girada.token, j.token); assert.equal(salva.token_hash, hashWebhook(girada.token));
});


test('webhook é criado sem tenant manual e aceita payload sem esse campo', async () => {
 const { id: anterior, tenant_id, token_hash, ...semTenant } = integracao;
 const r = await salvar(await configRequest(semTenant));
 assert.equal(r.status, 200);
 const j = await r.json();
 assert.equal(j.integracao.tenant_id, undefined);
 assert.equal(db.tables.comercial_integracoes.find((i) => i.id === j.integracao.id).tenant_id, '');
 const p = payload(); delete p.tenantId; delete p.ticket.tenantId;
 assert.equal(normalizarTicketRM(p).externo_id, '9902');
 db.rpcs.rm_receber_lead_comercial = (args) => ({ ok: true, externo_id: args.p_dados.externo_id });
 const recebido = await receber(await request(p), { params: { id } });
 assert.equal(recebido.status, 200);
 assert.equal((await recebido.json()).externo_id, '9902');
});

test('autenticação aceita token direto, Bearer e cabeçalho de token, recusando conflito ou token na URL', async () => {
 db.rpcs.rm_receber_lead_comercial = () => ({ ok: true });
 for (const headers of [{ Authorization: token }, { Authorization: `Bearer ${token}` }, { Authorization: '', token }, { Authorization: '', 'x-webhook-token': token }]) {
   assert.equal((await receber(await request(payload(), token, headers), { params: { id } })).status, 200);
 }
 assert.equal((await receber(await request(payload(), token, { token: 'diferente' }), { params: { id } })).status, 401);
 const semHeader = new NextRequest(`http://localhost/api/integracoes/comercial/webhook/${id}?token=${token}`, { method: 'POST', body: JSON.stringify(payload()) });
 assert.equal((await receber(semHeader, { params: { id } })).status, 401);
});
