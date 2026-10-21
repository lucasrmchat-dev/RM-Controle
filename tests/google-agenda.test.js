// Sincronização bidirecional com o Google Agenda (Google simulado por um fetch falso).
// Executar: node --import ./tests/mocks/setup.js --test tests/google-agenda.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import {
  partesNoFuso,
  googleParaLinha,
  linhaParaGoogle,
  sincronizarTodas,
  espelharEvento,
  CHAVE_CONFIG,
} from '../src/lib/server/googleAgenda.js';
import { POST as webhook } from '../src/app/api/google/agenda/webhook/route.js';
import { POST as eventoRota } from '../src/app/api/google/agenda/evento/route.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: 'rm-sync@projeto.iam.gserviceaccount.com',
  client_id: '1234567890',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
process.env.GOOGLE_AGENDA_WEBHOOK_TOKEN = 'segredo-webhook';

const CONTA = { email_sistema: 'lucas@rmchat.com', email_google: 'lucas.amorim@rmchat.com.br', nome: 'Lucas' };
const uuid = () => crypto.randomUUID();

/** Google Agenda falso: guarda eventos por agenda e confere a assinatura do JWT. */
function googleFalso() {
  const agendas = { [CONTA.email_google]: new Map() };
  const chamadas = [];
  let seq = 0;
  const resposta = (status, json) => ({ ok: status < 400, status, json: async () => json });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    chamadas.push(`${opts.method || 'GET'} ${u.pathname}`);
    if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
      const assertion = new URLSearchParams(opts.body.toString()).get('assertion');
      const [h, c, sig] = assertion.split('.');
      const valido = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url'));
      const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
      if (!valido || !claims.sub) return resposta(400, { error: 'invalid_grant' });
      return resposta(200, { access_token: `tok-${claims.sub}`, expires_in: 3600 });
    }
    const m = u.pathname.match(/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    const agenda = agendas[decodeURIComponent(m[1])];
    const id = m[2] && decodeURIComponent(m[2]);
    const metodo = opts.method || 'GET';
    if (metodo === 'GET') return resposta(200, { items: [...agenda.values()] });
    if (metodo === 'POST') {
      const corpo = JSON.parse(opts.body);
      const ev = { ...corpo, id: `g${++seq}`, iCalUID: `g${seq}@google.com`, updated: new Date().toISOString() };
      agenda.set(ev.id, ev);
      return resposta(200, ev);
    }
    if (metodo === 'PATCH') {
      const ev = { ...agenda.get(id), ...JSON.parse(opts.body), updated: new Date().toISOString() };
      agenda.set(id, ev);
      return resposta(200, ev);
    }
    if (metodo === 'DELETE') {
      if (!agenda.has(id)) return resposta(410, { error: { message: 'Resource has been deleted' } });
      agenda.delete(id);
      return { ok: true, status: 204, json: async () => null };
    }
    return resposta(404, {});
  };
  return { agendas, chamadas, fetchImpl };
}

beforeEach(() => {
  db.reset();
  db.tables.agenda_eventos = [];
  db.tables.sistema_config = [{ chave: CHAVE_CONFIG, valor: { contas: [CONTA], canais: {} } }];
  db.tables.equipe_usuarios = [
    { id: uuid(), email: 'lucas@rmchat.com', nome: 'Lucas', papel: 'administrador', ativo: true },
    { id: uuid(), email: 'maria@rmchat.com', nome: 'Maria', papel: 'suporte', ativo: true },
  ];
});

test('horário do Google é convertido para Brasília (UTC-3)', () => {
  assert.deepEqual(partesNoFuso('2026-10-21T14:30:00Z'), { data: '2026-10-21', hora: '11:30' });
  assert.deepEqual(partesNoFuso('2026-10-22T01:00:00Z'), { data: '2026-10-21', hora: '22:00' });
});

test('evento do Google vira linha da agenda preservando o que só existe no sistema', () => {
  const ev = {
    id: 'abc',
    iCalUID: 'abc@google.com',
    summary: 'Reunião com cliente',
    description: 'Pauta<br>Item 1',
    hangoutLink: 'https://meet.google.com/xyz',
    start: { dateTime: '2026-10-21T11:00:00-03:00' },
    end: { dateTime: '2026-10-21T12:00:00-03:00' },
    updated: '2026-10-20T10:00:00Z',
  };
  const linha = googleParaLinha(ev, CONTA, { empresa: 'Facility Hotel', tipo: 'cliente' });
  assert.equal(linha.data, '2026-10-21');
  assert.equal(linha.hora_inicio, '11:00');
  assert.equal(linha.hora_fim, '12:00');
  assert.equal(linha.empresa, 'Facility Hotel');
  assert.equal(linha.tipo, 'cliente');
  assert.equal(linha.link_reuniao, 'https://meet.google.com/xyz');
  assert.equal(linha.observacoes, 'Pauta\nItem 1');
  assert.equal(linha.responsavel_email, 'lucas@rmchat.com');
  assert.equal(linha.google_calendar_id, CONTA.email_google);

  const diaTodo = googleParaLinha({ id: 'd', start: { date: '2026-10-25' }, end: { date: '2026-10-26' } }, CONTA);
  assert.equal(diaTodo.dia_inteiro, true);
  assert.equal(diaTodo.hora_inicio, '00:00');
});

test('linha do sistema vira evento do Google no fuso de Brasília', () => {
  const corpo = linhaParaGoogle({ id: 'x1', titulo: 'Implantação', data: '2026-10-21', hora_inicio: '14:00', hora_fim: '14:00', empresa: 'Padaria Sol' });
  assert.deepEqual(corpo.start, { dateTime: '2026-10-21T14:00:00', timeZone: 'America/Sao_Paulo' });
  assert.equal(corpo.end.dateTime, '2026-10-21T14:30:00', 'fim igual ao início vira 30 min');
  assert.match(corpo.description, /Empresa: Padaria Sol/);
  assert.equal(corpo.extendedProperties.private.rm_id, 'x1');
  const diaTodo = linhaParaGoogle({ id: 'x2', titulo: 'Feriado', data: '2026-12-31', dia_inteiro: true });
  assert.deepEqual(diaTodo.end, { date: '2027-01-01' });
});

test('sincronização: traz do Google, apaga o que sumiu lá e envia o que só existe no sistema', async () => {
  const g = googleFalso();
  const hoje = new Date().toISOString().slice(0, 10);
  const agenda = g.agendas[CONTA.email_google];
  agenda.set('g-novo', { id: 'g-novo', iCalUID: 'n@google', summary: 'Criado no Google', start: { dateTime: `${hoje}T13:00:00-03:00` }, end: { dateTime: `${hoje}T14:00:00-03:00` }, updated: new Date().toISOString() });
  agenda.set('g-editado', { id: 'g-editado', iCalUID: 'e@google', summary: 'Título novo', start: { dateTime: `${hoje}T09:00:00-03:00` }, end: { dateTime: `${hoje}T10:00:00-03:00` }, updated: new Date().toISOString() });

  const idSoSistema = uuid();
  const idEditado = uuid();
  const idApagado = uuid();
  db.tables.agenda_eventos.push(
    { id: idSoSistema, titulo: 'Criado no sistema', data: hoje, hora_inicio: '16:00', hora_fim: '17:00', responsavel_email: 'lucas@rmchat.com', status: 'agendada' },
    { id: idEditado, titulo: 'Título antigo', empresa: 'Mercado Bom', data: hoje, hora_inicio: '09:00', hora_fim: '10:00', responsavel_email: 'lucas@rmchat.com', google_event_id: 'g-editado', google_calendar_id: CONTA.email_google, google_atualizado_em: '2020-01-01T00:00:00Z' },
    { id: idApagado, titulo: 'Excluído no Google', data: hoje, hora_inicio: '08:00', hora_fim: '09:00', responsavel_email: 'lucas@rmchat.com', google_event_id: 'g-sumiu', google_calendar_id: CONTA.email_google }
  );

  const r = await sincronizarTodas({ fetchImpl: g.fetchImpl });
  assert.deepEqual(r.erros, {});
  const linhas = db.tables.agenda_eventos;

  assert.ok(linhas.find((l) => l.titulo === 'Criado no Google' && l.google_event_id === 'g-novo'), 'evento novo do Google entrou');
  const editado = linhas.find((l) => l.id === idEditado);
  assert.equal(editado.titulo, 'Título novo');
  assert.equal(editado.empresa, 'Mercado Bom', 'empresa (só do sistema) preservada');
  assert.ok(!linhas.find((l) => l.id === idApagado), 'apagado no Google sumiu do sistema');

  const enviado = linhas.find((l) => l.id === idSoSistema);
  assert.ok(enviado.google_event_id, 'evento do sistema ganhou id no Google');
  assert.equal(agenda.get(enviado.google_event_id).summary, 'Criado no sistema');

  // Segunda rodada não duplica nada (o evento enviado volta do Google e é reconhecido)
  const antes = linhas.length;
  await sincronizarTodas({ fetchImpl: g.fetchImpl });
  assert.equal(db.tables.agenda_eventos.length, antes);
});

test('editar no sistema atualiza o Google; trocar para alguém sem Google remove de lá', async () => {
  const g = googleFalso();
  const hoje = new Date().toISOString().slice(0, 10);
  const id = uuid();
  db.tables.agenda_eventos.push({ id, titulo: 'Call', data: hoje, hora_inicio: '10:00', hora_fim: '11:00', responsavel_email: 'lucas@rmchat.com', status: 'agendada' });

  await espelharEvento(id, g.fetchImpl);
  const linha = db.tables.agenda_eventos.find((l) => l.id === id);
  const gid = linha.google_event_id;
  assert.ok(g.agendas[CONTA.email_google].has(gid));

  linha.titulo = 'Call remarcada';
  linha.hora_inicio = '15:00';
  linha.hora_fim = '15:30';
  await espelharEvento(id, g.fetchImpl);
  assert.equal(g.agendas[CONTA.email_google].get(gid).summary, 'Call remarcada');
  assert.equal(g.agendas[CONTA.email_google].get(gid).start.dateTime, `${hoje}T15:00:00`);

  linha.responsavel_email = 'maria@rmchat.com'; // Maria não tem conta Google vinculada
  await espelharEvento(id, g.fetchImpl);
  assert.ok(!g.agendas[CONTA.email_google].has(gid));
  assert.equal(db.tables.agenda_eventos.find((l) => l.id === id).google_event_id, null);
});

test('webhook recusa token errado e ignora canal desconhecido', async () => {
  const req = (token, canal = 'c1', estado = 'exists') =>
    new NextRequest('http://localhost/api/google/agenda/webhook', {
      method: 'POST',
      headers: { 'x-goog-channel-token': token, 'x-goog-channel-id': canal, 'x-goog-resource-state': estado },
    });
  assert.equal((await webhook(req('errado'))).status, 403);
  assert.equal((await webhook(req('segredo-webhook', 'c1', 'sync'))).status, 200);
  assert.equal((await webhook(req('segredo-webhook', 'desconhecido'))).status, 200);
});

test('excluir pelo sistema: só criador, responsável ou administrador', async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const id = uuid();
  db.tables.agenda_eventos.push({ id, titulo: 'Do Lucas', data: hoje, responsavel_email: 'lucas@rmchat.com', criado_por: 'lucas@rmchat.com' });
  const cookie = async (email, role) => `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role })}`;
  const pedir = async (email, role) =>
    eventoRota(
      new NextRequest('http://localhost/api/google/agenda/evento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: await cookie(email, role) },
        body: JSON.stringify({ id, acao: 'excluir' }),
      })
    );
  const negado = await pedir('maria@rmchat.com', 'suporte');
  assert.equal(negado.status, 403);
  assert.ok(db.tables.agenda_eventos.find((l) => l.id === id));
  const ok = await pedir('lucas@rmchat.com', 'administrador');
  assert.equal(ok.status, 200);
  assert.ok(!db.tables.agenda_eventos.find((l) => l.id === id));
});
