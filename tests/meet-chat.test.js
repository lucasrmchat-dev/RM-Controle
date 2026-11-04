// Chat: atalho #meet cria a reunião do Google Meet na agenda da empresa (Google simulado) e monta a mensagem.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { cifrar, CHAVE_CONFIG } from '../src/lib/server/googleAgenda.js';
import { criarMeetDaConversa, textoDoMeet } from '../src/lib/server/meetChat.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cliente.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'segredo-cliente';
const REFRESH = 'refresh-do-lucas';
const AGENDA = 'lucas.amorim@rmchat.com.br';

function googleFalso() {
  const criados = [];
  const resposta = (status, json) => ({ ok: status < 400, status, json: async () => json });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    if (u.href.startsWith('https://oauth2.googleapis.com/token')) return resposta(200, { access_token: 'tok', expires_in: 3600 });
    if (/\/calendars\/[^/]+\/events$/.test(u.pathname) && opts.method === 'POST') {
      const corpo = JSON.parse(opts.body);
      const comMeet = corpo.conferenceData?.createRequest && u.searchParams.get('conferenceDataVersion') === '1';
      const ev = { ...corpo, id: corpo.id, iCalUID: `${corpo.id}@google`, updated: new Date().toISOString(), ...(comMeet ? { hangoutLink: 'https://meet.google.com/abc-defg-hij' } : {}) };
      criados.push({ calendario: decodeURIComponent(u.pathname.split('/')[4]), ev });
      return resposta(200, ev);
    }
    return resposta(404, {});
  };
  return { criados, fetchImpl };
}

let conversa;
beforeEach(() => {
  db.reset();
  const empresa = { id: crypto.randomUUID(), nome: 'Clínica Sorriso' };
  const contato = { id: crypto.randomUUID(), nome: 'Carla', telefone: '5585999990000', empresa_id: empresa.id };
  conversa = { id: crypto.randomUUID(), contato_id: contato.id, departamento: 'Comercial', canal_id: crypto.randomUUID() };
  db.tables.empresas = [empresa];
  db.tables.contatos = [contato];
  db.tables.agenda_eventos = [];
  db.tables.sistema_config = [
    { chave: CHAVE_CONFIG, valor: { canais: {} } },
    { chave: 'google_agenda_tokens', valor: { 'lucas@rmchat.com': { email_google: AGENDA, nome: 'Lucas', token: cifrar(REFRESH) } } },
  ];
  db.tables.equipe_usuarios = [{ id: crypto.randomUUID(), email: 'lucas@rmchat.com', nome: 'Lucas', papel: 'administrador', ativo: true }];
});

const perm = { email: 'lucas@rmchat.com', nome: 'Lucas' };

test('#meet: cria o evento com Meet no Google da empresa, com cliente e empresa, e devolve o link', async () => {
  const g = googleFalso();
  const agora = new Date('2026-10-29T17:10:00Z'); // 14:10 em Brasília
  const r = await criarMeetDaConversa({ ctx: { db: mockSupabase, org: null }, perm, conversa, duracao: 60, agora, fetchImpl: g.fetchImpl });
  assert.equal(r.link, 'https://meet.google.com/abc-defg-hij');
  assert.equal(r.titulo, 'Reunião com Clínica Sorriso');
  assert.equal(g.criados.length, 1);
  assert.equal(g.criados[0].calendario, AGENDA, 'na agenda Google conectada da empresa');
  const linha = db.tables.agenda_eventos[0];
  assert.equal(linha.link_reuniao, r.link, 'o link fica na reunião da agenda');
  assert.equal(linha.data, '2026-10-29');
  assert.equal(linha.hora_inicio, '14:10');
  assert.equal(linha.hora_fim, '15:10');
  assert.equal(linha.responsavel_email, 'lucas@rmchat.com');
  assert.equal(linha.cliente_telefone, '5585999990000');
  assert.equal(linha.departamento, 'Comercial');
  const texto = textoDoMeet({ link: r.link, titulo: r.titulo, complemento: 'Combinado, vamos conversar agora!' });
  assert.match(texto, /^Combinado, vamos conversar agora!\n\n📅 \*Reunião com Clínica Sorriso\*\nEntre pelo Google Meet: https:\/\/meet\.google\.com\/abc-defg-hij$/);
});

test('#meet sem Google Agenda conectado: erro claro e nada fica na agenda', async () => {
  db.tables.sistema_config = [{ chave: CHAVE_CONFIG, valor: { canais: {} } }];
  await assert.rejects(criarMeetDaConversa({ ctx: { db: mockSupabase, org: null }, perm, conversa, fetchImpl: googleFalso().fetchImpl }), /Conecte o Google Agenda/);
  assert.equal(db.tables.agenda_eventos.length, 0);
});

test('Reunião rápida pelo Chat: nasce na hora em nome da pessoa (não do grupo), com o telefone, e fica para completar', async () => {
  const g = googleFalso();
  const grupo = { id: crypto.randomUUID(), nome: 'RM | Clínica', telefone: '120363000@g.us', empresa_id: null };
  db.tables.contatos = [grupo];
  const r = await criarMeetDaConversa({ ctx: { db: mockSupabase, org: null }, perm, conversa: { ...conversa, contato_id: grupo.id, departamento: '' }, fetchImpl: g.fetchImpl, pessoa: { nome: 'Marcos Lima', telefone: '(85) 98888-7777' } });
  assert.equal(r.titulo, 'Reunião com Marcos Lima');
  const linha = db.tables.agenda_eventos[0];
  assert.equal(linha.participante_nome, 'Marcos Lima');
  assert.equal(linha.participante_tipo, 'cliente_novo');
  assert.equal(linha.cliente_telefone, '85988887777');
  assert.equal(linha.departamento, undefined, 'sem departamento: fica para preencher na Agenda');
  assert.match(linha.observacoes, /Falta completar/);
  assert.equal(linha.link_reuniao, 'https://meet.google.com/abc-defg-hij');
});
