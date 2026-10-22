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
  cifrar,
  decifrar,
  criarState,
  lerState,
  trocarCodigo,
  registrarConexao,
  desconectar,
  listarAgendasDisponiveis,
  salvarAgendasEscolhidas,
  CHAVE_CONFIG,
} from '../src/lib/server/googleAgenda.js';
import { POST as webhook } from '../src/app/api/google/agenda/webhook/route.js';
import { POST as eventoRota } from '../src/app/api/google/agenda/evento/route.js';
import { GET as lerAgenda } from '../src/app/api/agenda/eventos/route.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

process.env.GOOGLE_OAUTH_CLIENT_ID = 'cliente.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'segredo-cliente';
process.env.GOOGLE_AGENDA_WEBHOOK_TOKEN = 'segredo-webhook';
const REFRESH = 'refresh-do-lucas';

const CONTA = { email_sistema: 'lucas@rmchat.com', email_google: 'lucas.amorim@rmchat.com.br', calendar_id: 'lucas.amorim@rmchat.com.br', nome: 'Lucas', principal: true };
const uuid = () => crypto.randomUUID();

/** Google Agenda falso: guarda eventos por agenda e só aceita o refresh token conectado. */
function googleFalso() {
  const agendas = { [CONTA.email_google]: new Map(), 'suporte@rmchat.com.br': new Map() };
  const chamadas = [];
  let seq = 0;
  const resposta = (status, json) => ({ ok: status < 400, status, json: async () => json });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    chamadas.push(`${opts.method || 'GET'} ${u.pathname}`);
    if (u.href.startsWith('https://oauth2.googleapis.com/revoke')) return resposta(200, {});
    if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
      const corpo = new URLSearchParams(opts.body.toString());
      if (corpo.get('client_secret') !== 'segredo-cliente') return resposta(401, { error: 'invalid_client' });
      if (corpo.get('grant_type') === 'authorization_code') {
        const idToken = ['x', Buffer.from(JSON.stringify({ email: 'Lucas.Amorim@rmchat.com.br' })).toString('base64url'), 'y'].join('.');
        return resposta(200, { access_token: 'tok', refresh_token: REFRESH, id_token: idToken, scope: 'openid email https://www.googleapis.com/auth/calendar.events', expires_in: 3600 });
      }
      if (corpo.get('refresh_token') !== REFRESH) return resposta(400, { error: 'invalid_grant' });
      return resposta(200, { access_token: 'tok-lucas', expires_in: 3600 });
    }
    if (u.pathname === '/calendar/v3/channels/stop') return { ok: true, status: 204, json: async () => null };
    if (u.pathname === '/calendar/v3/users/me/calendarList') {
      return resposta(200, {
        items: [
          { id: CONTA.email_google, summary: 'Lucas Amorim', primary: true, accessRole: 'owner' },
          { id: 'suporte@rmchat.com.br', summary: 'Pedro Alvarez', accessRole: 'writer', backgroundColor: '#e67c73' },
          { id: 'pt-br.brazilian#holiday@group.v.calendar.google.com', summary: 'Feriados', accessRole: 'reader' },
        ],
      });
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
  db.tables.sistema_config = [
    { chave: CHAVE_CONFIG, valor: { canais: {} } },
    { chave: 'google_agenda_tokens', valor: { [CONTA.email_sistema]: { email_google: CONTA.email_google, nome: 'Lucas', token: cifrar(REFRESH) } } },
  ];
  db.tables.equipe_usuarios = [
    { id: uuid(), email: 'lucas@rmchat.com', nome: 'Lucas', papel: 'administrador', ativo: true },
    { id: uuid(), email: 'maria@rmchat.com', nome: 'Maria', papel: 'suporte', ativo: true },
    { id: uuid(), email: 'pedro@rmchat.com', nome: 'Pedro Alvarez', papel: 'suporte', ativo: true },
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
    { id: idSoSistema, titulo: 'Criado no sistema', data: hoje, hora_inicio: '16:00', hora_fim: '17:00', responsavel_email: 'lucas@rmchat.com', status: 'agendada', google_calendar_id: CONTA.email_google },
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

test('editar e remarcar no sistema atualiza o Google; cancelar remove de lá', async () => {
  const g = googleFalso();
  const hoje = new Date().toISOString().slice(0, 10);
  const id = uuid();
  db.tables.agenda_eventos.push({ id, titulo: 'Call', data: hoje, hora_inicio: '10:00', hora_fim: '11:00', responsavel_email: 'lucas@rmchat.com', responsavel_nome: 'Lucas', status: 'agendada' });

  // Sem agenda escolhida, vai para a agenda padrão (aqui, a única conectada)
  await espelharEvento(id, g.fetchImpl);
  const linha = db.tables.agenda_eventos.find((l) => l.id === id);
  const gid = linha.google_event_id;
  assert.equal(linha.google_calendar_id, CONTA.email_google);
  assert.ok(g.agendas[CONTA.email_google].has(gid));

  Object.assign(linha, { titulo: 'Call remarcada', hora_inicio: '15:00', hora_fim: '15:30', responsavel_email: 'maria@rmchat.com', responsavel_nome: 'Maria' });
  await espelharEvento(id, g.fetchImpl);
  const noGoogle = g.agendas[CONTA.email_google].get(gid);
  assert.equal(noGoogle.summary, 'Call remarcada');
  assert.equal(noGoogle.start.dateTime, `${hoje}T15:00:00`);
  assert.match(noGoogle.description, /Responsável: Maria/, 'responsável escrito na descrição do Google');
  assert.equal(noGoogle.extendedProperties.private.rm_responsavel_email, 'maria@rmchat.com');

  linha.status = 'cancelada';
  await espelharEvento(id, g.fetchImpl);
  assert.ok(!g.agendas[CONTA.email_google].has(gid));
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

test('token do Google é guardado criptografado e o state só vale para a mesma pessoa', () => {
  const c = cifrar('segredo');
  assert.ok(!c.includes('segredo'));
  assert.equal(decifrar(c), 'segredo');
  // Altera o 1º caractere da etiqueta de autenticação (sempre carrega bits reais, ao contrário do último)
  const [iv, tag, dados] = c.split('.');
  const tagAdulterada = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
  assert.equal(decifrar([iv, tagAdulterada, dados].join('.')), null, 'adulterado não decifra');

  const state = criarState('lucas@rmchat.com', 'nonce-1');
  assert.equal(lerState(state, 'nonce-1'), 'lucas@rmchat.com');
  assert.equal(lerState(state, 'outro-nonce'), null, 'cookie de outra aba/pessoa');
  const [corpo] = state.split('.');
  const forjado = Buffer.from(JSON.stringify({ e: 'admin@rmchat.com', n: 'nonce-1', x: Date.now() + 60000 })).toString('base64url');
  assert.equal(lerState(`${forjado}.${state.split('.')[1]}`, 'nonce-1'), null, 'assinatura não confere');
  assert.ok(corpo);
});

test('conectar: troca o código, identifica a conta Google e guarda o token cifrado; desconectar apaga', async () => {
  db.tables.sistema_config = [];
  const g = googleFalso();
  const { emailGoogle, refreshToken } = await trocarCodigo('codigo', 'http://localhost/cb', g.fetchImpl);
  assert.equal(emailGoogle, 'lucas.amorim@rmchat.com.br');
  await registrarConexao({ emailSistema: 'lucas@rmchat.com', nome: 'Lucas', emailGoogle, refreshToken });

  const conexoes = db.tables.sistema_config.find((r) => r.chave === 'google_agenda_tokens').valor;
  assert.ok(!JSON.stringify(conexoes).includes(REFRESH), 'refresh token nunca em texto puro');
  assert.equal(conexoes['lucas@rmchat.com'].email_google, 'lucas.amorim@rmchat.com.br');

  // Outra gravação da configuração (ex.: sincronização) não apaga a conexão recém-feita
  await sincronizarTodas({ fetchImpl: g.fetchImpl });
  assert.ok(db.tables.sistema_config.find((r) => r.chave === 'google_agenda_tokens').valor['lucas@rmchat.com']);

  await desconectar('lucas@rmchat.com', g.fetchImpl);
  assert.ok(g.chamadas.some((c) => c.startsWith('POST /revoke')), 'revoga no Google');
  assert.deepEqual(db.tables.sistema_config.find((r) => r.chave === 'google_agenda_tokens').valor, {});
});

test('agenda compartilhada (suporte@) é da equipe: o responsável vem de cada reunião e volta do Google', async () => {
  const g = googleFalso();
  const hoje = new Date().toISOString().slice(0, 10);
  g.agendas['suporte@rmchat.com.br'].set('p1', {
    id: 'p1', iCalUID: 'p1@google', summary: 'Reunião Quinzenal', start: { dateTime: `${hoje}T14:00:00-03:00` }, end: { dateTime: `${hoje}T14:45:00-03:00` }, updated: new Date().toISOString(),
  });

  const disponiveis = await listarAgendasDisponiveis('lucas@rmchat.com', g.fetchImpl);
  assert.deepEqual(disponiveis.map((a) => a.id), ['suporte@rmchat.com.br'], 'só agendas editáveis e sem a principal');
  await assert.rejects(salvarAgendasEscolhidas('lucas@rmchat.com', ['outra@x.com'], g.fetchImpl));
  await salvarAgendasEscolhidas('lucas@rmchat.com', ['suporte@rmchat.com.br'], g.fetchImpl);

  await sincronizarTodas({ fetchImpl: g.fetchImpl });
  const daEquipe = db.tables.agenda_eventos.find((l) => l.google_event_id === 'p1');
  assert.equal(daEquipe.google_calendar_id, 'suporte@rmchat.com.br');
  assert.equal(daEquipe.responsavel_email, null, 'agenda compartilhada não tem dono');

  // Reunião criada no sistema para o Pedro, na agenda da equipe
  const id = uuid();
  db.tables.agenda_eventos.push({ id, titulo: 'Onboarding cliente', data: hoje, hora_inicio: '16:00', hora_fim: '17:00', responsavel_email: 'pedro@rmchat.com', responsavel_nome: 'Pedro Alvarez', empresa: 'Padaria Sol', google_calendar_id: 'suporte@rmchat.com.br', status: 'agendada' });
  await espelharEvento(id, g.fetchImpl);
  const linha = db.tables.agenda_eventos.find((l) => l.id === id);
  const noGoogle = g.agendas['suporte@rmchat.com.br'].get(linha.google_event_id);
  assert.match(noGoogle.description, /Responsável: Pedro Alvarez/);
  assert.match(noGoogle.description, /Empresa: Padaria Sol/);

  // Ida e volta: alguém edita o título no Google; o responsável continua o do sistema e a descrição não duplica
  noGoogle.summary = 'Onboarding cliente (remarcado)';
  noGoogle.updated = new Date(Date.now() + 1000).toISOString();
  await sincronizarTodas({ fetchImpl: g.fetchImpl });
  const depois = db.tables.agenda_eventos.find((l) => l.id === id);
  assert.equal(depois.titulo, 'Onboarding cliente (remarcado)');
  assert.equal(depois.responsavel_email, 'pedro@rmchat.com');
  assert.equal(depois.empresa, 'Padaria Sol');
  assert.ok(!/RM Controle/.test(depois.observacoes || ''), 'bloco do RM Controle não vira observação');
});

test('reuniões antigas da agenda da equipe perdem o dono herdado da agenda', async () => {
  const g = googleFalso();
  const hoje = new Date().toISOString().slice(0, 10);
  const atualizado = '2026-01-01T00:00:00Z';
  g.agendas['suporte@rmchat.com.br'].set('v1', {
    id: 'v1', iCalUID: 'v1@google', summary: 'Reunião com Gilliard', start: { dateTime: `${hoje}T11:00:00-03:00` }, end: { dateTime: `${hoje}T12:00:00-03:00` }, updated: atualizado,
  });
  await salvarAgendasEscolhidas('lucas@rmchat.com', ['suporte@rmchat.com.br'], g.fetchImpl);
  // Linha importada no modelo antigo: dono = quem foi atribuído à agenda inteira
  db.tables.agenda_eventos.push({
    id: uuid(), titulo: 'Reunião com Gilliard', data: hoje, hora_inicio: '11:00', hora_fim: '12:00', origem: 'google',
    responsavel_email: 'pedro@rmchat.com', responsavel_nome: 'Pedro Alvarez',
    google_event_id: 'v1', google_calendar_id: 'suporte@rmchat.com.br', google_atualizado_em: atualizado,
  });
  await sincronizarTodas({ fetchImpl: g.fetchImpl });
  const linha = db.tables.agenda_eventos.find((l) => l.google_event_id === 'v1');
  assert.equal(linha.responsavel_email, null);
  assert.equal(db.tables.agenda_eventos.filter((l) => l.google_event_id === 'v1').length, 1);
});

test('agenda lida pelo servidor: só com login, e traz os eventos da equipe', async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  db.tables.agenda_eventos.push({ id: uuid(), titulo: 'Reunião da equipe', data: hoje, hora_inicio: '10:00', hora_fim: '11:00' });
  const semLogin = await lerAgenda(new NextRequest('http://localhost/api/agenda/eventos'));
  assert.equal(semLogin.status, 401);
  const cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken({ email: 'maria@rmchat.com', role: 'suporte' })}`;
  const r = await lerAgenda(new NextRequest('http://localhost/api/agenda/eventos', { headers: { Cookie: cookie } }));
  const json = await r.json();
  assert.equal(r.status, 200);
  assert.ok(json.eventos.some((e) => e.titulo === 'Reunião da equipe'));
});
