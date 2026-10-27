// Canais de WhatsApp: leitura dos avisos (Evolution e Meta), janela de 24h, segredos, webhook e envio.
// Executar: node --import ./tests/mocks/setup.js --test tests/canais.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { eventosDaEvolution, eventosDaMeta, janelaAtendimento, podeEnviarTextoLivre, validarCanal } from '../src/lib/canais.js';
import { cifrarSegredos, decifrarSegredos, hashToken } from '../src/lib/server/canais/cofre.js';
import { GET as verificarWebhook, POST as receberWebhook } from '../src/app/api/canais/webhook/[id]/route.js';
import { GET as listarCanais, POST as criarCanal } from '../src/app/api/canais/route.js';
import { POST as acaoCanal } from '../src/app/api/canais/[id]/route.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

// ------------------------------------------------------------------------------ leitura dos avisos
test('Evolution: texto, legenda de foto, enviada pelo celular; grupo marcado; status ignorado', () => {
  const ev = eventosDaEvolution({
    event: 'messages.upsert',
    instance: 'rmc_x',
    data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false, id: 'A1' }, pushName: 'Ana', message: { conversation: 'Oi, tudo bem?' }, messageTimestamp: 1761500000 },
  });
  assert.equal(ev.length, 1);
  assert.deepEqual({ ...ev[0], em: undefined }, { tipo: 'mensagem', idExterno: 'A1', telefone: '5585999990000', nome: 'Ana', grupo: false, participante: null, deMim: false, tipoMensagem: 'texto', texto: 'Oi, tudo bem?', em: undefined, chave: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false } });
  assert.equal(ev[0].em, new Date(1761500000 * 1000).toISOString());

  const foto = eventosDaEvolution({ event: 'MESSAGES_UPSERT', data: { key: { remoteJid: '85988887777@s.whatsapp.net', fromMe: true, id: 'B2' }, message: { imageMessage: { caption: 'segue o print', mimetype: 'image/jpeg' } } } })[0];
  assert.equal(foto.tipoMensagem, 'imagem');
  assert.equal(foto.texto, 'segue o print');
  assert.equal(foto.deMim, true);
  assert.equal(foto.nome, null);
  assert.equal(foto.telefone, '5585988887777', 'número sem 55 ganha o código do Brasil');

  const [g] = eventosDaEvolution({ event: 'messages.upsert', data: { key: { remoteJid: '1203630@g.us', participant: '5585977776666@s.whatsapp.net', id: 'G' }, pushName: 'Rita', message: { conversation: 'grupo' } } });
  assert.equal(g.grupo, true);
  assert.equal(g.telefone, '1203630@g.us');
  assert.equal(g.nome, null, 'o pushName é de quem escreveu, não do grupo');
  assert.deepEqual(g.participante, { nome: 'Rita', telefone: '5585977776666' });
  assert.equal(eventosDaEvolution({ event: 'messages.upsert', data: { key: { remoteJid: 'status@broadcast', id: 'S' }, message: { conversation: 'x' } } }).length, 0);

  assert.deepEqual(eventosDaEvolution({ event: 'messages.update', data: { keyId: 'A1', status: 'READ' } }), [{ tipo: 'status', idExterno: 'A1', status: 'lida' }]);
  assert.deepEqual(eventosDaEvolution({ event: 'connection.update', data: { state: 'open', wuid: '5585977776666@s.whatsapp.net' } }), [{ tipo: 'conexao', status: 'conectado', numero: '5585977776666', detalhe: null }]);
  assert.deepEqual(eventosDaEvolution({ event: 'qrcode.updated', data: { qrcode: { base64: 'data:image/png;base64,QR' } } }), [{ tipo: 'conexao', status: 'aguardando_qr', qr: 'data:image/png;base64,QR' }]);
});

test('Meta: mensagens e status do número certo; outro número do mesmo app é ignorado', () => {
  const aviso = (phoneId) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: phoneId },
      contacts: [{ wa_id: '5585999990000', profile: { name: 'Bruno' } }],
      messages: [{ from: '5585999990000', id: 'wamid.1', timestamp: '1761500000', type: 'text', text: { body: 'Quero um orçamento' } }],
      statuses: [{ id: 'wamid.ENV', status: 'delivered' }],
    } }] }],
  });
  const ev = eventosDaMeta(aviso('111'), '111');
  assert.equal(ev.length, 2);
  assert.equal(ev[0].texto, 'Quero um orçamento');
  assert.equal(ev[0].nome, 'Bruno');
  assert.deepEqual(ev[1], { tipo: 'status', idExterno: 'wamid.ENV', status: 'entregue', erro: null });
  assert.equal(eventosDaMeta(aviso('222'), '111').length, 0);
});

test('janela de 24h da API oficial', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  const conv = (horas) => ({ ultima_entrada_cliente_em: new Date(agora - horas * 3600000).toISOString() });
  assert.equal(janelaAtendimento(conv(23), agora).aberta, true);
  assert.equal(janelaAtendimento(conv(25), agora).aberta, false);
  assert.equal(janelaAtendimento({}, agora).aberta, false, 'cliente nunca escreveu');
  assert.equal(podeEnviarTextoLivre({ tipo: 'whatsapp_oficial' }, conv(30), agora), false);
  assert.equal(podeEnviarTextoLivre({ tipo: 'whatsapp_qr' }, conv(30), agora), true, 'QR Code não tem janela');
});

test('validação do canal e segredos cifrados', () => {
  assert.throws(() => validarCanal({ tipo: 'x' }), /tipo/);
  assert.throws(() => validarCanal({ tipo: 'whatsapp_qr', nome: 'Com' }), /Evolution/);
  assert.throws(() => validarCanal({ tipo: 'whatsapp_oficial', nome: 'Oficial', phone_number_id: 'abc' }), /ID do número/);
  assert.throws(() => validarCanal({ tipo: 'whatsapp_oficial', nome: 'Oficial', phone_number_id: '1234567', token: 'x'.repeat(30), app_secret: 'curta' }), /32 letras/);
  const ok = validarCanal({ tipo: 'whatsapp_oficial', nome: 'Oficial', phone_number_id: '1234567', token: 'EAAB' + 'x'.repeat(40), app_secret: 'a'.repeat(32) });
  assert.equal(ok.canal.provedor, 'meta');
  assert.equal('token' in ok.canal, false, 'segredos ficam separados dos dados do canal');

  const cifrado = cifrarSegredos({ token: 'segredo' });
  assert.equal(cifrado.includes('segredo'), false);
  assert.deepEqual(decifrarSegredos(cifrado), { token: 'segredo' });
  assert.deepEqual(decifrarSegredos(cifrado.slice(0, -4) + 'AAAA'), {}, 'adulterado não abre');
});

// ------------------------------------------------------------------------------ webhook e envio
const A = crypto.randomUUID();
const SEGREDO_APP = 'b'.repeat(32);
let canalQr;
let canalMeta;
let enviados;

beforeEach(() => {
  db.reset();
  db.unicos = { mensagens: [['organizacao_id', 'id_externo']], contatos: [['organizacao_id', 'telefone']] };
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.equipe_usuarios = [{ id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana', papel: 'administrador', ativo: true, organizacao_id: A }];
  canalQr = { id: crypto.randomUUID(), organizacao_id: A, nome: 'Comercial', tipo: 'whatsapp_qr', provedor: 'evolution', status: 'conectado', ativo: true, config: {}, departamento_padrao: 'Vendas', credenciais_cifradas: cifrarSegredos({ url: 'https://evo.exemplo.com', apikey: 'chave' }), webhook_token_hash: hashToken('tok-evo') };
  canalMeta = { id: crypto.randomUUID(), organizacao_id: A, nome: 'Oficial', tipo: 'whatsapp_oficial', provedor: 'meta', status: 'conectado', ativo: true, config: { phone_number_id: '111' }, credenciais_cifradas: cifrarSegredos({ token: 'EAAB', app_secret: SEGREDO_APP }), webhook_token_hash: hashToken('verifica-meta') };
  db.tables.canais = [canalQr, canalMeta];
  db.tables.contatos = [];
  db.tables.conversas = [];
  db.tables.mensagens = [];
  enviados = [];
  globalThis.fetch = async (url, op) => {
    enviados.push({ url: String(url), corpo: op?.body ? JSON.parse(op.body) : null, headers: op?.headers });
    if (String(url).includes('graph.facebook.com')) return new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), { status: 200 });
    return new Response(JSON.stringify({ key: { id: 'EVO-OUT' } }), { status: 200 });
  };
});

const aviso = (canal, corpo, headers = {}) =>
  new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(corpo) });
const msgEvo = (id, texto) => ({ event: 'messages.upsert', data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false, id }, pushName: 'Ana Cliente', message: { conversation: texto } } });

test('webhook Evolution: sem o token certo, nada é gravado', async () => {
  assert.equal((await receberWebhook(aviso(canalQr, msgEvo('M1', 'oi')), { params: { id: canalQr.id } })).status, 401);
  assert.equal((await receberWebhook(aviso(canalQr, msgEvo('M1', 'oi'), { 'x-rm-token': 'errado' }), { params: { id: canalQr.id } })).status, 401);
  assert.equal(db.tables.mensagens.length, 0);
  assert.equal((await receberWebhook(aviso(canalQr, msgEvo('M1', 'oi')), { params: { id: 'nao-e-uuid' } })).status, 404);
});

test('webhook Evolution: contato, conversa e mensagem na empresa do canal, sem duplicar', async () => {
  const r = await receberWebhook(aviso(canalQr, msgEvo('M1', 'Bom dia!'), { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  assert.equal(r.status, 200);
  assert.equal(db.tables.contatos[0].nome, 'Ana Cliente');
  assert.equal(db.tables.contatos[0].organizacao_id, A);
  const conversa = db.tables.conversas[0];
  assert.equal(conversa.organizacao_id, A);
  assert.equal(conversa.departamento, 'Vendas', 'departamento padrão do canal');
  assert.equal(conversa.nao_lidas, 1);
  assert.equal(conversa.ultima_mensagem_texto, 'Bom dia!');
  assert.ok(conversa.ultima_entrada_cliente_em);
  assert.equal(db.tables.mensagens[0].direcao, 'entrada');

  // Mesmo aviso de novo (o provedor reenvia): nada duplica
  await receberWebhook(aviso(canalQr, msgEvo('M1', 'Bom dia!'), { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  assert.equal(db.tables.mensagens.length, 1);
  // Segunda mensagem: mesma conversa
  await receberWebhook(aviso(canalQr, msgEvo('M2', 'Tem horário hoje?'), { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  assert.equal(db.tables.conversas.length, 1);
  assert.equal(db.tables.conversas[0].nao_lidas, 2);

  // Conexão: número e situação do canal atualizados
  await receberWebhook(aviso(canalQr, { event: 'connection.update', data: { state: 'close' } }, { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  assert.equal(db.tables.canais[0].status, 'desconectado');
});

test('webhook Meta: assinatura obrigatória e verificação do painel', async () => {
  const corpo = { entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '111' }, contacts: [{ wa_id: '5585977776666', profile: { name: 'Carla' } }], messages: [{ from: '5585977776666', id: 'wamid.IN', timestamp: '1761500000', type: 'text', text: { body: 'Olá' } }] } }] }] };
  const bruto = JSON.stringify(corpo);
  const assinatura = 'sha256=' + crypto.createHmac('sha256', SEGREDO_APP).update(bruto).digest('hex');
  const req = (sig) => new NextRequest(`http://localhost/api/canais/webhook/${canalMeta.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, body: bruto });
  assert.equal((await receberWebhook(req(null), { params: { id: canalMeta.id } })).status, 401);
  assert.equal((await receberWebhook(req('sha256=' + 'f'.repeat(64)), { params: { id: canalMeta.id } })).status, 401);
  assert.equal((await receberWebhook(req(assinatura), { params: { id: canalMeta.id } })).status, 200);
  assert.equal(db.tables.mensagens[0].conteudo, 'Olá');

  const verificar = (token) => verificarWebhook(new NextRequest(`http://localhost/api/canais/webhook/${canalMeta.id}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=123`), { params: { id: canalMeta.id } });
  assert.equal((await verificar('errado')).status, 403);
  const ok = await verificar('verifica-meta');
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '123');
});

const comSessao = async (url, metodo, body) =>
  new NextRequest(`http://localhost${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email: 'ana@a.com', role: 'administrador' })}` }, body: body ? JSON.stringify(body) : undefined });

test('lista de canais nunca devolve segredos', async () => {
  const r = await (await listarCanais(await comSessao('/api/canais', 'GET'))).json();
  assert.equal(r.canais.length, 2);
  const texto = JSON.stringify(r);
  assert.equal(texto.includes('credenciais_cifradas'), false);
  assert.equal(texto.includes('webhook_token_hash'), false);
});

test('envio de teste pelo QR Code e janela fechada na API oficial', async () => {
  const r = await acaoCanal(await comSessao(`/api/canais/${canalQr.id}`, 'POST', { acao: 'testar', telefone: '(85) 99999-0000', texto: 'Teste' }), { params: { id: canalQr.id } });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.equal(enviados[0].url, `https://evo.exemplo.com/message/sendText/rmc_${canalQr.id.replace(/-/g, '')}`);
  assert.deepEqual(enviados[0].corpo, { number: '5585999990000', text: 'Teste' });
  assert.equal(enviados[0].headers.apikey, 'chave');
  const msg = db.tables.mensagens.find((m) => m.direcao === 'saida');
  assert.equal(msg.status, 'enviada');
  assert.equal(msg.id_externo, 'EVO-OUT');
  assert.equal(msg.autor_email, 'ana@a.com');
  assert.equal(db.tables.conversas[0].status, 'em_atendimento', 'responder assume a conversa');

  const fechada = await acaoCanal(await comSessao(`/api/canais/${canalMeta.id}`, 'POST', { acao: 'testar', telefone: '85988887777', texto: 'Oi' }), { params: { id: canalMeta.id } });
  assert.equal(fechada.status, 502);
  assert.match((await fechada.json()).mensagem, /24 horas/);
  assert.equal(enviados.length, 1, 'nada foi enviado para a Meta');
});

test('criar canal oficial: valida, guarda o segredo cifrado e mostra o token de verificação uma vez', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ display_phone_number: '+55 85 3333-4444', verified_name: 'RM', quality_rating: 'GREEN' }), { status: 200 });
  const r = await criarCanal(await comSessao('/api/canais', 'POST', { tipo: 'whatsapp_oficial', nome: 'Atendimento', phone_number_id: '987654321', token: 'EAAB' + 'y'.repeat(40), app_secret: 'c'.repeat(32) }));
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.canal.status, 'conectado');
  assert.equal(j.canal.numero, '558533334444');
  assert.equal(j.canal.config.qualidade, 'Alta');
  assert.match(j.webhook.url, /\/api\/canais\/webhook\//);
  assert.ok(j.webhook.token_verificacao.length > 30);
  const salvo = db.tables.canais.find((c) => c.nome === 'Atendimento');
  assert.equal(salvo.organizacao_id, A);
  assert.equal(salvo.credenciais_cifradas.includes('EAAB'), false, 'token da Meta só cifrado no banco');
  assert.equal(salvo.webhook_token_hash, hashToken(j.webhook.token_verificacao));
});

test('QR pelo servidor da plataforma: cliente só informa o nome, sem segredos guardados no canal', () => {
  const r = validarCanal({ tipo: 'whatsapp_qr', nome: 'Comercial', servidorDaPlataforma: true });
  assert.deepEqual(r.segredos, {});
  assert.equal(r.canal.config.servidor, 'plataforma');
  assert.throws(() => validarCanal({ tipo: 'whatsapp_qr', nome: 'Comercial' }), /Evolution/, 'sem servidor da plataforma, exige o próprio');
  const proprio = validarCanal({ tipo: 'whatsapp_qr', nome: 'Comercial', evolution_url: 'https://evo.x.com/', evolution_apikey: 'k', servidorDaPlataforma: true });
  assert.equal(proprio.segredos.url, 'https://evo.x.com');
});

test('9º dígito: o mesmo celular nos dois formatos cai no mesmo contato e na mesma conversa', async () => {
  const envio = await acaoCanal(await comSessao(`/api/canais/${canalQr.id}`, 'POST', { acao: 'testar', telefone: '(84) 99814-3514', texto: 'Oi' }), { params: { id: canalQr.id } });
  assert.equal(envio.status, 200);
  // O WhatsApp responde identificando o número no formato antigo, sem o 9
  const resposta = { event: 'messages.upsert', data: { key: { remoteJid: '558498143514@s.whatsapp.net', fromMe: false, id: 'R9' }, pushName: 'Hanilton Jr.', message: { conversation: 'Tudo' } } };
  await receberWebhook(aviso(canalQr, resposta, { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  assert.equal(db.tables.contatos.length, 1);
  assert.equal(db.tables.contatos[0].telefone, '5584998143514');
  assert.equal(db.tables.contatos[0].nome, 'Hanilton Jr.');
  assert.equal(db.tables.conversas.length, 1);

  // Contato antigo gravado sem o 9 passa para a forma certa
  db.tables.contatos = [{ id: crypto.randomUUID(), organizacao_id: A, telefone: '558591112222', nome: 'Antigo' }];
  db.tables.conversas = [];
  await receberWebhook(aviso(canalQr, { ...resposta, data: { ...resposta.data, key: { ...resposta.data.key, remoteJid: '5585991112222@s.whatsapp.net', id: 'R10' } } }, { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  assert.equal(db.tables.contatos.length, 1);
  assert.equal(db.tables.contatos[0].telefone, '5585991112222');
});

test('assinatura: o cliente recebe *Nome:* e a tela guarda o texto puro', async () => {
  const { enviarTextoParaNumero } = await import('../src/lib/server/canais/index.js');
  const msg = await enviarTextoParaNumero(db.escopo ? db : mockSupabase, { canal: canalQr, telefone: '85999990000', texto: 'Bom dia', autor: { email: 'ana@a.com', nome: 'Ana Souza' }, assinar: true });
  assert.equal(enviados.at(-1).corpo.text, '*Ana Souza:*\nBom dia');
  assert.equal(msg.conteudo, 'Bom dia');
});

test('grupos: desligado não grava; ligado grava com o nome do grupo e quem escreveu', async () => {
  const msgGrupo = (id) => ({ event: 'messages.upsert', data: { key: { remoteJid: '120363111@g.us', participant: '5585977776666@s.whatsapp.net', id }, pushName: 'Rita', message: { conversation: 'Bom dia, grupo' } } });
  await receberWebhook(aviso(canalQr, msgGrupo('G1'), { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  assert.equal(db.tables.mensagens.length, 0, 'padrão: grupos desligados');

  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat', valor: { grupos: 'aba' } }];
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('findGroupInfos') ? { subject: 'Equipe Clínica' } : {}), { status: 200 });
  await receberWebhook(aviso(canalQr, msgGrupo('G2'), { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  globalThis.fetch = fetchAntes;
  assert.equal(db.tables.contatos[0].telefone, '120363111@g.us');
  assert.equal(db.tables.contatos[0].nome, 'Equipe Clínica');
  assert.equal(db.tables.mensagens[0].autor_nome, 'Rita');
});

test('reação fica presa à mensagem reagida; trocar substitui e vazia remove', async () => {
  const enviar = (corpo) => receberWebhook(aviso(canalQr, corpo, { 'x-rm-token': 'tok-evo' }), { params: { id: canalQr.id } });
  await enviar(msgEvo('ALVO', 'Segue a figurinha'));
  const reacao = (id, emoji) => ({ event: 'messages.upsert', data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: true, id }, message: { reactionMessage: { key: { id: 'ALVO' }, text: emoji } } } });
  await enviar(reacao('RX1', '❤️'));
  const alvo = db.tables.mensagens.find((m) => m.id_externo === 'ALVO');
  let reacoes = db.tables.mensagens.filter((m) => m.tipo === 'reacao');
  assert.equal(reacoes.length, 1);
  assert.equal(reacoes[0].responde_a, alvo.id);
  assert.equal(reacoes[0].conteudo, '❤️');
  await enviar(reacao('RX2', '👍'));
  reacoes = db.tables.mensagens.filter((m) => m.tipo === 'reacao');
  assert.deepEqual(reacoes.map((r) => r.conteudo), ['👍'], 'a nova substitui a anterior');
  await enviar(reacao('RX3', ''));
  assert.equal(db.tables.mensagens.filter((m) => m.tipo === 'reacao').length, 0, 'reação removida');
  assert.equal(db.tables.conversas[0].ultima_mensagem_texto, 'Segue a figurinha', 'reação não vira a última mensagem');
});
