// WhatsApp da agenda: mensagens, segurança do webhook, link público e lembretes.
// Executar: node --import ./tests/mocks/setup.js --test tests/whatsapp-agenda.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import {
  normalizarTelefone,
  formatarTelefone,
  validarConfigWhatsapp,
  montarCorpo,
  dadosDaReuniao,
  lembreteVencido,
  validarPreferencias,
  textoTempoAntes,
} from '../src/lib/whatsappAgenda.js';
import { validarUrlWebhook, enviarMensagem, processarLembretes } from '../src/lib/server/whatsappAgenda.js';
import { GET as lerPublico, POST as responderPublico } from '../src/app/api/publico/reuniao/route.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

test('telefone: aceita formatos comuns do Brasil e recusa lixo', () => {
  assert.equal(normalizarTelefone('(85) 99999-0000'), '5585999990000');
  assert.equal(normalizarTelefone('+55 85 3333-4444'), '558533334444');
  assert.equal(normalizarTelefone('85999990000'), '5585999990000');
  assert.equal(normalizarTelefone('123'), null);
  assert.equal(normalizarTelefone(''), null);
  assert.equal(formatarTelefone('5585999990000'), '(85) 99999-0000');
  assert.equal(textoTempoAntes(60), '1 hora');
  assert.equal(textoTempoAntes(45), '45 minutos');
  assert.equal(textoTempoAntes(1440), '1 dia');
});

test('configuração: canal decide os modos; JSON inválido e template sem nome são recusados', () => {
  const api = validarConfigWhatsapp({ canal: 'api_oficial', confirmacao: { modo: 'personalizada', template: 'conf' }, lembrete: { template: 'lemb' } });
  assert.equal(api.confirmacao.modo, 'template', 'API oficial só usa template');
  assert.throws(() => validarConfigWhatsapp({ canal: 'api_oficial', confirmacao: { template: '' }, lembrete: { template: 'x' } }), /template/);
  assert.throws(() => validarConfigWhatsapp({ canal: 'qrcode', corpo: '{ quebrado' }), /JSON/);
  assert.deepEqual(validarPreferencias({ confirmacao: 'sempre', lembrete: 'x', lembrete_minutos: 3 }), { confirmacao: 'sempre', lembrete: 'perguntar', lembrete_minutos: 60 });
});

const EVENTO = { titulo: 'Demonstração', participante_nome: 'Ana "da" Silva', responsavel_nome: 'Lucas', data: '2026-10-29', hora_inicio: '14:00', hora_fim: '14:30', cliente_telefone: '85999990000', link_reuniao: 'https://meet.google.com/abc' };

test('mensagem personalizada, template e JSON próprio (aspas do cliente não quebram o JSON)', () => {
  const dados = { ...dadosDaReuniao(EVENTO, { linkConfirmacao: 'https://x/r/t' }), telefone: '5585999990000' };
  assert.equal(dados.data_hora, 'quinta-feira, 29/10 às 14:00');

  const livre = montarCorpo(validarConfigWhatsapp({ canal: 'qrcode', confirmacao: { modo: 'personalizada', mensagem: 'Oi {cliente_nome}, {data_hora}: {link_confirmacao}' } }), 'confirmacao', dados);
  assert.deepEqual(livre.corpo, { number: '5585999990000', body: 'Oi Ana "da" Silva, quinta-feira, 29/10 às 14:00: https://x/r/t' });

  const tpl = montarCorpo(validarConfigWhatsapp({ canal: 'api_oficial', confirmacao: { template: 'confirmar_reuniao', variaveis: ['{cliente_nome}', '{hora}', 'texto fixo'] }, lembrete: { template: 'l' } }), 'confirmacao', dados);
  assert.deepEqual(tpl.corpo, { number: '5585999990000', template: 'confirmar_reuniao', language: 'pt_BR', variables: ['Ana "da" Silva', '14:00', 'texto fixo'] });

  const proprio = montarCorpo(validarConfigWhatsapp({ canal: 'qrcode', confirmacao: { modo: 'fixa', variaveis: ['{titulo}'] }, corpo: '{"to":"{telefone}","params":"{variaveis}","meta":{"tipo":"{tipo}"}}' }), 'confirmacao', dados);
  assert.deepEqual(proprio.corpo, { to: '5585999990000', params: ['Demonstração'], meta: { tipo: 'confirmacao' } });
});

test('webhook: só https público, sem credenciais na URL (protege contra acesso à rede interna)', () => {
  const prod = { permitirLocal: false };
  assert.ok(validarUrlWebhook('https://acessoapi.exemplo.com.br/w/abc', prod));
  assert.throws(() => validarUrlWebhook('http://acessoapi.exemplo.com.br/w/abc', prod), /https/);
  assert.throws(() => validarUrlWebhook('https://localhost/w', prod), /público/);
  assert.throws(() => validarUrlWebhook('https://192.168.0.10/w', prod), /público/);
  assert.throws(() => validarUrlWebhook('https://10.0.0.5/w', prod), /público/);
  assert.throws(() => validarUrlWebhook('https://169.254.169.254/latest', prod), /público/);
  assert.throws(() => validarUrlWebhook('https://user:senha@exemplo.com/w', prod), /usuário e senha/);
  assert.throws(() => validarUrlWebhook('não é url', prod), /inválido/);
});

test('lembrete sai na janela certa, uma vez, e nunca para reunião cancelada', () => {
  const ev = { ...EVENTO, lembrete_minutos: 60 };
  const inicio = new Date('2026-10-29T14:00:00-03:00').getTime();
  assert.equal(lembreteVencido(ev, inicio - 61 * 60000), false, 'cedo demais');
  assert.equal(lembreteVencido(ev, inicio - 59 * 60000), true);
  assert.equal(lembreteVencido(ev, inicio + 60000), false, 'já começou');
  assert.equal(lembreteVencido({ ...ev, lembrete_enviado_em: 'x' }, inicio - 30 * 60000), false);
  assert.equal(lembreteVencido({ ...ev, status: 'cancelada' }, inicio - 30 * 60000), false);
  assert.equal(lembreteVencido({ ...ev, confirmacao_status: 'cancelada' }, inicio - 30 * 60000), false);
});

// ------------------------------------------------------------------------------
// Fluxo completo: envio → cliente abre o link → responde
// ------------------------------------------------------------------------------
let enviados;
const fetchFalso = async (url, opcoes) => {
  enviados.push({ url, opcoes, corpo: JSON.parse(opcoes.body) });
  return { ok: true, status: 200 };
};

beforeEach(() => {
  db.reset();
  enviados = [];
  const segredos = { whatsapp_agenda_url: 'https://acessoapi.exemplo.com.br/w/teste', whatsapp_agenda_token: 'tok123' };
  db.rpcs.rm_ler_segredo = ({ p_chave }) => segredos[p_chave] || null;
  db.tables.sistema_config = [{ chave: 'whatsapp_agenda', valor: { ativo: true, canal: 'qrcode', confirmacao: { modo: 'personalizada', mensagem: '{cliente_nome}: {link_confirmacao}' }, lembrete: { modo: 'personalizada', mensagem: 'Faltam {tempo_antes}' } } }];
  db.tables.agenda_eventos = [];
  db.tables.agenda_confirmacoes = [];
  db.tables.whatsapp_envios = [];
});

const futuro = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const req = (metodo, url, body) => new NextRequest(`http://localhost${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` }, body: body ? JSON.stringify(body) : undefined });

test('confirmação: link seguro, página pública mínima e resposta do cliente', async () => {
  const evento = { id: crypto.randomUUID(), ...EVENTO, data: futuro(2), responsavel_email: 'lucas@rmchat.com' };
  db.tables.agenda_eventos.push(evento);

  const r = await enviarMensagem(mockSupabase, { evento, tipo: 'confirmacao', base: 'https://rm.exemplo.com', fetchImpl: fetchFalso });
  assert.equal(r.ok, true);
  assert.equal(enviados[0].opcoes.headers.Authorization, 'Bearer tok123');
  const link = enviados[0].corpo.body.split(': ')[1];
  assert.match(link, /^https:\/\/rm\.exemplo\.com\/r\/[A-Za-z0-9_-]{43}$/);
  const token = link.split('/r/')[1];

  // O banco guarda hash e cópia cifrada, nunca o token puro
  const conf = db.tables.agenda_confirmacoes[0];
  assert.notEqual(conf.token_hash, token);
  assert.equal(JSON.stringify(conf).includes(token), false);
  assert.equal(db.tables.agenda_eventos[0].confirmacao_status, 'enviada');

  // Reenviar mantém o mesmo link (o cliente pode usar a mensagem anterior)
  await enviarMensagem(mockSupabase, { evento, tipo: 'confirmacao', base: 'https://rm.exemplo.com', fetchImpl: fetchFalso });
  assert.equal(enviados[1].corpo.body.split(': ')[1], link);

  // Página pública: só dados mínimos
  const lido = await (await lerPublico(req('GET', `/api/publico/reuniao?t=${token}`))).json();
  assert.equal(lido.ok, true);
  assert.deepEqual(Object.keys(lido.reuniao).sort(), ['cliente', 'data', 'hora_fim', 'hora_inicio', 'link_reuniao', 'mensagem', 'passou', 'responsavel', 'situacao', 'titulo']);
  assert.equal(JSON.stringify(lido).includes('lucas@rmchat.com'), false, 'e-mail da equipe não vaza');
  assert.equal(JSON.stringify(lido).includes(evento.id), false, 'id interno não vaza');
  assert.equal(lido.reuniao.link_reuniao, null, 'link da sala só depois de confirmar');

  // Token inválido ou inventado
  assert.equal((await lerPublico(req('GET', '/api/publico/reuniao?t=abc'))).status, 404);
  assert.equal((await lerPublico(req('GET', `/api/publico/reuniao?t=${'A'.repeat(43)}`))).status, 404);

  // Cliente pede para remarcar, com recado (marcação é removida)
  const rem = await (await responderPublico(req('POST', '/api/publico/reuniao', { t: token, acao: 'remarcar', mensagem: 'Quinta <b>à tarde</b>' }))).json();
  assert.equal(rem.ok, true);
  assert.equal(db.tables.agenda_eventos[0].confirmacao_status, 'remarcar');
  assert.equal(db.tables.agenda_eventos[0].confirmacao_mensagem, 'Quinta à tarde');

  // Ação desconhecida não altera nada
  assert.equal((await responderPublico(req('POST', '/api/publico/reuniao', { t: token, acao: 'apagar' }))).status, 400);

  // Link expirado
  db.tables.agenda_confirmacoes[0].expira_em = new Date(Date.now() - 1000).toISOString();
  assert.equal((await lerPublico(req('GET', `/api/publico/reuniao?t=${token}`))).status, 404);
});

test('reunião que já passou não aceita resposta', async () => {
  const evento = { id: crypto.randomUUID(), ...EVENTO, data: futuro(1) };
  db.tables.agenda_eventos.push(evento);
  await enviarMensagem(mockSupabase, { evento, tipo: 'confirmacao', base: 'https://rm.exemplo.com', fetchImpl: fetchFalso });
  const token = enviados[0].corpo.body.split('/r/')[1];
  db.tables.agenda_eventos[0].data = '2020-01-01';
  db.tables.agenda_confirmacoes[0].expira_em = new Date(Date.now() + 3600000).toISOString();
  assert.equal((await responderPublico(req('POST', '/api/publico/reuniao', { t: token, acao: 'confirmar' }))).status, 409);
});

test('lembretes: envia o que venceu, uma vez só; desligado não envia', async () => {
  const agora = Date.now();
  const em = (min) => {
    const d = new Date(agora + min * 60000 - 3 * 3600000); // horário de Brasília
    return { data: d.toISOString().slice(0, 10), hora_inicio: d.toISOString().slice(11, 16) };
  };
  db.tables.agenda_eventos.push(
    { id: crypto.randomUUID(), ...EVENTO, ...em(40), lembrete_minutos: 60 },
    { id: crypto.randomUUID(), ...EVENTO, ...em(180), lembrete_minutos: 60 },
    { id: crypto.randomUUID(), ...EVENTO, ...em(40), lembrete_minutos: null }
  );
  const r1 = await processarLembretes(mockSupabase, { base: 'https://rm.exemplo.com', agora, fetchImpl: fetchFalso });
  assert.equal(r1.enviados, 1);
  assert.equal(enviados[0].corpo.body, 'Faltam 1 hora');
  const r2 = await processarLembretes(mockSupabase, { base: 'https://rm.exemplo.com', agora, fetchImpl: fetchFalso });
  assert.equal(r2.enviados, 0, 'não repete');

  db.tables.sistema_config[0].valor.ativo = false;
  db.tables.agenda_eventos[1].lembrete_enviado_em = null;
  db.tables.agenda_eventos.push({ id: crypto.randomUUID(), ...EVENTO, ...em(30), lembrete_minutos: 60 });
  const r3 = await processarLembretes(mockSupabase, { base: 'https://rm.exemplo.com', agora, fetchImpl: fetchFalso });
  assert.equal(r3.enviados, 0, 'envio desligado');
});
