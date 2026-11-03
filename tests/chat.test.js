// Chat: quem vê cada conversa, responder, assumir, resolver, transferir, notas e respostas rápidas.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { cifrarSegredos, hashToken } from '../src/lib/server/canais/cofre.js';
import { preencherResposta } from '../src/lib/canais.js';
import { GET as listar, POST as iniciar } from '../src/app/api/chat/route.js';
import { GET as abrir, POST as agir } from '../src/app/api/chat/[id]/route.js';
import { GET as listarRespostas, POST as criarResposta, DELETE as apagarResposta } from '../src/app/api/chat/respostas/route.js';

__definirSupabaseAdmin(mockSupabase);

const A = crypto.randomUUID();
const B = crypto.randomUUID();
const PERFIL_VENDAS = crypto.randomUUID();
let canal, contato, convVendas, convFinanceiro, convOutra, enviados;

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
  db.tables.perfis_acesso = [{ id: PERFIL_VENDAS, organizacao_id: A, nome: 'Vendas', administrador: false, todos_departamentos: false, departamentos: ['Vendas'], modulos: ['chat', 'fila'] }];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana Souza', papel: 'administrador', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'bia@a.com', nome: 'Bia Lima', papel: 'suporte', ativo: true, organizacao_id: A, perfil_id: PERFIL_VENDAS },
    { id: crypto.randomUUID(), email: 'caio@b.com', nome: 'Caio', papel: 'administrador', ativo: true, organizacao_id: B },
  ];
  canal = { id: crypto.randomUUID(), organizacao_id: A, nome: 'Comercial', tipo: 'whatsapp_qr', provedor: 'evolution', status: 'conectado', ativo: true, config: {}, credenciais_cifradas: cifrarSegredos({ url: 'https://evo.exemplo.com', apikey: 'chave' }), webhook_token_hash: hashToken('t') };
  const canalB = { id: crypto.randomUUID(), organizacao_id: B, nome: 'B', tipo: 'whatsapp_qr', provedor: 'evolution', status: 'conectado', ativo: true, config: {} };
  db.tables.canais = [canal, canalB];
  contato = { id: crypto.randomUUID(), organizacao_id: A, telefone: '5585999990000', nome: 'Carla Mendes' };
  const contatoB = { id: crypto.randomUUID(), organizacao_id: B, telefone: '5585911110000', nome: 'Outro' };
  db.tables.contatos = [contato, contatoB];
  const agora = new Date().toISOString();
  convVendas = { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: contato.id, status: 'aguardando', departamento: 'Vendas', nao_lidas: 2, ultima_mensagem_em: agora, ultima_entrada_cliente_em: agora };
  convFinanceiro = { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: crypto.randomUUID(), status: 'aguardando', departamento: 'Financeiro', nao_lidas: 1, ultima_mensagem_em: agora };
  convOutra = { id: crypto.randomUUID(), organizacao_id: B, canal_id: canalB.id, contato_id: contatoB.id, status: 'aguardando', departamento: null, nao_lidas: 1, ultima_mensagem_em: agora };
  db.tables.conversas = [convVendas, convFinanceiro, convOutra];
  db.tables.mensagens = [{ id: crypto.randomUUID(), organizacao_id: A, conversa_id: convVendas.id, direcao: 'entrada', tipo: 'texto', conteudo: 'Oi, quero um orçamento', status: 'recebida', criado_em: agora }];
  db.tables.respostas_rapidas = [];
  enviados = [];
  globalThis.fetch = async (url, op) => {
    enviados.push({ url: String(url), corpo: op?.body ? JSON.parse(op.body) : null });
    return new Response(JSON.stringify({ key: { id: `EVO-${enviados.length}` } }), { status: 200 });
  };
});

const como = async (email, url, metodo = 'GET', body) =>
  new NextRequest(`http://localhost${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` }, body: body ? JSON.stringify(body) : undefined });
const ler = async (r) => ({ status: r.status, ...(await r.json()) });

test('cada pessoa vê só as conversas do seu departamento; outra empresa, nada', async () => {
  const ana = await ler(await listar(await como('ana@a.com', '/api/chat')));
  assert.deepEqual(ana.conversas.map((c) => c.departamento).sort(), ['Financeiro', 'Vendas'], 'administrador vê todas da empresa');
  assert.equal(ana.conversas.find((c) => c.id === convVendas.id).contato.nome, 'Carla Mendes');
  assert.equal(JSON.stringify(ana).includes('credenciais_cifradas'), false, 'canal sem segredos');

  const bia = await ler(await listar(await como('bia@a.com', '/api/chat')));
  assert.deepEqual(bia.conversas.map((c) => c.id), [convVendas.id]);

  // Conversa de outro departamento (ou de outra empresa) responde como inexistente
  assert.equal((await abrir(await como('bia@a.com', `/api/chat/${convFinanceiro.id}`), { params: { id: convFinanceiro.id } })).status, 404);
  assert.equal((await abrir(await como('ana@a.com', `/api/chat/${convOutra.id}`), { params: { id: convOutra.id } })).status, 404);
  assert.equal((await agir(await como('ana@a.com', `/api/chat/${convOutra.id}`, 'POST', { acao: 'enviar', texto: 'invasão' }), { params: { id: convOutra.id } })).status, 404);
  assert.equal(enviados.length, 0);

  // Transferida para a Bia, ela passa a ver mesmo sendo do Financeiro
  await agir(await como('ana@a.com', `/api/chat/${convFinanceiro.id}`, 'POST', { acao: 'transferir', responsavel_email: 'bia@a.com' }), { params: { id: convFinanceiro.id } });
  const depois = await ler(await listar(await como('bia@a.com', '/api/chat')));
  assert.equal(depois.conversas.length, 2);
});

test('perfil sem o módulo Chat não acessa', async () => {
  db.tables.perfis_acesso[0].modulos = ['fila'];
  assert.equal((await listar(await como('bia@a.com', '/api/chat'))).status, 403);
  assert.equal((await abrir(await como('bia@a.com', `/api/chat/${convVendas.id}`), { params: { id: convVendas.id } })).status, 403);
});

test('responder envia pelo WhatsApp, assume a conversa e zera as não lidas', async () => {
  await agir(await como('bia@a.com', `/api/chat/${convVendas.id}`, 'POST', { acao: 'assumir' }), { params: { id: convVendas.id } });
  const r = await ler(await agir(await como('bia@a.com', `/api/chat/${convVendas.id}`, 'POST', { acao: 'enviar', texto: 'Olá, Carla!' }), { params: { id: convVendas.id } }));
  assert.equal(r.status, 200, r.mensagem);
  assert.deepEqual(enviados[0].corpo, { number: '5585999990000', text: '*Bia Lima:*\nOlá, Carla!' }, 'sai assinada por padrão');
  assert.equal(r.mensagem.conteudo, 'Olá, Carla!');
  assert.equal(r.mensagem.status, 'enviada');
  assert.equal(r.mensagem.autor_nome, 'Bia Lima');
  assert.equal(r.conversa.responsavel_email, 'bia@a.com');
  assert.equal(r.conversa.status, 'em_atendimento');
  assert.equal(r.conversa.nao_lidas, 0);

  const lista = await ler(await abrir(await como('bia@a.com', `/api/chat/${convVendas.id}`), { params: { id: convVendas.id } }));
  assert.equal(lista.mensagens.filter((m) => m.tipo !== 'sistema').length, 2);
});

test('nota interna não vai para o WhatsApp; assumir, resolver e reabrir deixam registro', async () => {
  const id = convVendas.id;
  await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'assumir' }), { params: { id } });
  const nota = await ler(await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'nota', texto: 'Cliente VIP' }), { params: { id } }));
  assert.equal(nota.mensagem.direcao, 'nota');
  assert.equal(enviados.length, 0);

  const assumida = await ler(await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'assumir' }), { params: { id } }));
  assert.equal(assumida.conversa.responsavel_nome, 'Ana Souza');
  const resolvida = await ler(await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'resolver' }), { params: { id } }));
  assert.equal(resolvida.conversa.status, 'resolvida');
  assert.equal((await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'enviar', texto: 'oi' }), { params: { id } })).status, 409, 'resolvida não responde');

  const abertas = await ler(await listar(await como('ana@a.com', '/api/chat')));
  assert.equal(abertas.conversas.some((c) => c.id === id), false);
  const resolvidas = await ler(await listar(await como('ana@a.com', '/api/chat?aba=resolvidas')));
  assert.equal(resolvidas.conversas[0].id, id);

  const reaberta = await ler(await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'reabrir' }), { params: { id } }));
  assert.equal(reaberta.conversa.status, 'em_atendimento');
  const sistema = db.tables.mensagens.filter((m) => m.tipo === 'sistema').map((m) => m.conteudo);
  assert.deepEqual(sistema, ['Ana Souza assumiu a conversa', 'Ana Souza resolveu a conversa', 'Ana Souza reabriu a conversa']);
});

test('transferir para departamento devolve à fila; marcar como lida', async () => {
  const id = convVendas.id;
  await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'assumir' }), { params: { id } });
  const r = await ler(await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'transferir', departamento: 'Financeiro', responsavel_email: '' }), { params: { id } }));
  assert.equal(r.conversa.departamento, 'Financeiro');
  assert.equal(r.conversa.responsavel_email, null);
  assert.equal(r.conversa.status, 'aguardando');
  assert.equal((await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'transferir', responsavel_email: 'caio@b.com' }), { params: { id } })).status, 400, 'pessoa de outra empresa');
  await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'lida' }), { params: { id } });
  assert.equal(db.tables.conversas.find((c) => c.id === id).nao_lidas, 0);
});

test('nova conversa manda a primeira mensagem e abre com quem iniciou', async () => {
  const r = await ler(await iniciar(await como('bia@a.com', '/api/chat', 'POST', { canal_id: canal.id, telefone: '(85) 98888-1111', texto: 'Oi, tudo bem?' })));
  assert.equal(r.status, 201, r.mensagem);
  assert.equal(r.conversa.responsavel_email, 'bia@a.com');
  assert.equal(r.conversa.contato.telefone, '5585988881111');
  assert.equal(enviados[0].corpo.number, '5585988881111');
});

test('respostas rápidas: pessoais só do autor; da equipe só por administrador; variáveis', async () => {
  assert.equal((await criarResposta(await como('bia@a.com', '/api/chat/respostas', 'POST', { atalho: 'oi', texto: 'x', alcance: 'empresa' }))).status, 400);
  const minha = await ler(await criarResposta(await como('bia@a.com', '/api/chat/respostas', 'POST', { atalho: '/Bom Dia', texto: 'Bom dia, {primeiro_nome}! Aqui é {atendente}.' })));
  assert.equal(minha.resposta.atalho, 'bom_dia');
  await criarResposta(await como('ana@a.com', '/api/chat/respostas', 'POST', { atalho: 'horario', texto: 'Atendemos das 8h às 18h.', alcance: 'empresa' }));
  assert.deepEqual((await ler(await listarRespostas(await como('ana@a.com', '/api/chat/respostas')))).respostas.map((r) => r.atalho), ['horario']);
  assert.deepEqual((await ler(await listarRespostas(await como('bia@a.com', '/api/chat/respostas')))).respostas.map((r) => r.atalho).sort(), ['bom_dia', 'horario']);
  const daEquipe = db.tables.respostas_rapidas.find((r) => r.atalho === 'horario');
  assert.equal((await apagarResposta(await como('bia@a.com', '/api/chat/respostas', 'DELETE', { id: daEquipe.id }))).status, 403);
  assert.equal(preencherResposta(minha.resposta.texto, { contato: { nome: 'Carla Mendes' }, atendente: 'Bia Lima' }), 'Bom dia, Carla! Aqui é Bia.');
});

test('mídia: enviar foto pela tela, abrir só com permissão, formato perigoso recusado', async () => {
  const { POST: enviarArquivo } = await import('../src/app/api/chat/[id]/midia/route.js');
  const { GET: abrirArquivo } = await import('../src/app/api/chat/arquivo/route.js');
  const formulario = async (email, arquivo, extra = {}) => {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return new NextRequest(`http://localhost/api/chat/${convVendas.id}/midia`, { method: 'POST', headers: { Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` }, body: fd });
  };
  await agir(await como('bia@a.com', `/api/chat/${convVendas.id}`, 'POST', { acao: 'assumir' }), { params: { id: convVendas.id } });
  const foto = new File([Buffer.from('ffd8ffe0', 'hex')], 'print.jpg', { type: 'image/jpeg' });
  const r = await ler(await enviarArquivo(await formulario('bia@a.com', foto, { legenda: 'Segue o print' }), { params: { id: convVendas.id } }));
  assert.equal(r.status, 200, r.mensagem);
  assert.equal(r.mensagem.tipo, 'imagem');
  assert.match(r.mensagem.midia.caminho, new RegExp(`^${A}/${convVendas.id}/.+\\.jpg$`), 'pasta da empresa');
  assert.match(enviados[0].url, /sendMedia/);
  assert.equal(enviados[0].corpo.caption, '*Bia Lima:*\nSegue o print');
  assert.equal(enviados[0].corpo.mediatype, 'image');

  const abrir = async (email) => abrirArquivo(await como(email, `/api/chat/arquivo?m=${r.mensagem.id}`));
  assert.equal((await abrir('bia@a.com')).status, 302);
  assert.equal((await abrir('caio@b.com')).status, 404, 'outra empresa não abre');
  // Conversa passa para o Financeiro: a Bia (Vendas) deixa de abrir o arquivo
  db.tables.conversas.find((c) => c.id === convVendas.id).departamento = 'Financeiro';
  db.tables.conversas.find((c) => c.id === convVendas.id).responsavel_email = null;
  assert.equal((await abrir('bia@a.com')).status, 404);

  db.tables.conversas.find((c) => c.id === convVendas.id).responsavel_email = 'ana@a.com';
  const html = new File(['<script>alert(1)</script>'], 'x.html', { type: 'text/html' });
  assert.equal((await enviarArquivo(await formulario('ana@a.com', html), { params: { id: convVendas.id } })).status, 400);
});

test('mídia recebida: o arquivo é baixado da Evolution e guardado na pasta da empresa', async () => {
  const { POST: receber } = await import('../src/app/api/canais/webhook/[id]/route.js');
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('getBase64FromMediaMessage') ? { base64: Buffer.from('OggS').toString('base64'), mimetype: 'audio/ogg; codecs=opus' } : {}), { status: 200 });
  const aviso = { event: 'messages.upsert', data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false, id: 'AUD1' }, pushName: 'Carla', message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 7 } } } };
  const res = await receber(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify(aviso) }), { params: { id: canal.id } });
  assert.equal(res.status, 200);
  const msg = db.tables.mensagens.find((m) => m.id_externo === 'AUD1');
  assert.equal(msg.tipo, 'audio');
  assert.equal(msg.midia.segundos, 7);
  assert.match(msg.midia.caminho, /\.ogg$/);
  assert.equal(msg.midia.mime, 'audio/ogg');
});

test('ações na mensagem: responder citando, reagir, editar no prazo, apagar para mim e para todos, favoritar, fixar', async () => {
  const id = convVendas.id;
  const agir2 = async (email, corpo) => ler(await agir(await como(email, `/api/chat/${id}`, 'POST', corpo), { params: { id } }));
  const cliente = db.tables.mensagens[0];
  cliente.id_externo = 'CLI-1';
  // A Bia acompanha conversas que colegas do departamento assumiram
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat_acesso_usuarios', valor: { 'bia@a.com': { verOutros: true } } }];
  await agir2('ana@a.com', { acao: 'assumir' });

  // Responder citando a mensagem do cliente
  const resp = await agir2('ana@a.com', { acao: 'enviar', texto: 'Claro!', responde_a: cliente.id, assinar: false });
  assert.equal(resp.status, 200, resp.mensagem);
  assert.equal(enviados.at(-1).corpo.quoted.key.id, 'CLI-1');
  const minha = db.tables.mensagens.find((m) => m.id === resp.mensagem.id);
  assert.equal(minha.responde_a, cliente.id);
  assert.equal(resp.mensagem.acoes.editar, true, 'acabou de enviar: dá para editar');

  // Reagir
  await agir2('ana@a.com', { acao: 'reagir', mensagem_id: cliente.id, emoji: '❤️' });
  assert.match(enviados.at(-1).url, /sendReaction/);
  assert.equal(enviados.at(-1).corpo.reaction, '❤️');
  assert.equal(db.tables.mensagens.filter((m) => m.tipo === 'reacao' && m.responde_a === cliente.id).length, 1);

  // Editar (até 15 minutos)
  const editada = await agir2('ana@a.com', { acao: 'editar', mensagem_id: minha.id, texto: 'Claro, pode sim!', assinar: false });
  assert.equal(editada.mensagem.conteudo, 'Claro, pode sim!');
  assert.match(enviados.at(-1).url, /updateMessage/);
  assert.equal(minha.conteudo_original, 'Claro!');
  minha.criado_em = new Date(Date.now() - 20 * 60000).toISOString();
  assert.equal((await agir2('ana@a.com', { acao: 'editar', mensagem_id: minha.id, texto: 'tarde demais' })).status, 400);
  assert.equal((await agir2('ana@a.com', { acao: 'editar', mensagem_id: cliente.id, texto: 'não é minha' })).status, 400, 'mensagem do cliente não se edita');

  // Favoritar é de cada pessoa
  await agir2('bia@a.com', { acao: 'favoritar', mensagem_id: cliente.id, valor: true });
  const lerComo = async (email) => ler(await abrir(await como(email, `/api/chat/${id}`), { params: { id } }));
  assert.equal((await lerComo('bia@a.com')).mensagens.find((m) => m.id === cliente.id).favorita, true);
  assert.equal((await lerComo('ana@a.com')).mensagens.find((m) => m.id === cliente.id).favorita, false);

  // Resposta traz a citada
  assert.equal((await lerComo('ana@a.com')).mensagens.find((m) => m.id === minha.id).citada.conteudo, 'Oi, quero um orçamento');

  // Fixar (até 3) aparece para todos
  await agir2('ana@a.com', { acao: 'fixar', mensagem_id: cliente.id, valor: true });
  assert.deepEqual((await lerComo('bia@a.com')).fixadas.map((m) => m.id), [cliente.id]);

  // Apagar para mim: só some para quem apagou
  await agir2('bia@a.com', { acao: 'apagar', mensagem_id: minha.id, para: 'mim' });
  assert.equal((await lerComo('bia@a.com')).mensagens.some((m) => m.id === minha.id), false);
  assert.equal((await lerComo('ana@a.com')).mensagens.some((m) => m.id === minha.id), true);

  // Apagar para todos: vai para o WhatsApp; só administrador vê o texto original
  await agir2('ana@a.com', { acao: 'apagar', mensagem_id: minha.id, para: 'todos' });
  assert.match(enviados.at(-1).url, /deleteMessageForEveryone/);
  assert.ok(minha.apagada_em);
  assert.equal((await lerComo('ana@a.com')).mensagens.find((m) => m.id === minha.id).conteudo, 'Claro, pode sim!');
  db.tables.mensagens.find((m) => m.id === minha.id).apagada_para = [];
  assert.equal((await lerComo('bia@a.com')).mensagens.find((m) => m.id === minha.id).conteudo, null);

  // Mensagem de outra conversa: não encontrada
  const outra = { id: crypto.randomUUID(), organizacao_id: A, conversa_id: convFinanceiro.id, direcao: 'entrada', tipo: 'texto', conteudo: 'x', status: 'recebida', criado_em: new Date().toISOString() };
  db.tables.mensagens.push(outra);
  assert.equal((await agir2('ana@a.com', { acao: 'favoritar', mensagem_id: outra.id, valor: true })).status, 404);
});

test('edição e "apagar para todos" feitos pelo cliente no WhatsApp chegam na tela', async () => {
  const { POST: receber } = await import('../src/app/api/canais/webhook/[id]/route.js');
  db.tables.mensagens[0].id_externo = 'CLI-2';
  const enviar = (corpo) => receber(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify(corpo) }), { params: { id: canal.id } });
  await enviar({ event: 'messages.upsert', data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false, id: 'P1' }, message: { protocolMessage: { key: { id: 'CLI-2' }, type: 'MESSAGE_EDIT', editedMessage: { conversation: 'Quero dois orçamentos' } } } } });
  assert.equal(db.tables.mensagens[0].conteudo, 'Quero dois orçamentos');
  assert.equal(db.tables.mensagens[0].conteudo_original, 'Oi, quero um orçamento');
  await enviar({ event: 'messages.upsert', data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false, id: 'P2' }, message: { protocolMessage: { key: { id: 'CLI-2' }, type: 'REVOKE' } } } });
  assert.ok(db.tables.mensagens[0].apagada_em);
  assert.equal(db.tables.mensagens.length, 1, 'mensagens de protocolo não viram mensagens');
});

test('auditoria: visualização registrada uma vez, ações ficam na linha do tempo, só administrador consulta', async () => {
  const { GET: auditoria } = await import('../src/app/api/chat/[id]/auditoria/route.js');
  db.tables.auditoria_logs = [];
  const id = convVendas.id;
  await abrir(await como('bia@a.com', `/api/chat/${id}?abrir=1`), { params: { id } });
  db.tables.auditoria_logs.forEach((l) => (l.created_at = new Date().toISOString()));
  await abrir(await como('bia@a.com', `/api/chat/${id}?abrir=1`), { params: { id } });
  await abrir(await como('bia@a.com', `/api/chat/${id}`), { params: { id } });
  assert.equal(db.tables.auditoria_logs.filter((l) => l.acao === 'chat_visualizou').length, 1, 'uma visualização a cada 10 minutos');
  await agir(await como('bia@a.com', `/api/chat/${id}`, 'POST', { acao: 'assumir' }), { params: { id } });
  await agir(await como('bia@a.com', `/api/chat/${id}`, 'POST', { acao: 'resolver' }), { params: { id } });
  assert.equal((await auditoria(await como('bia@a.com', `/api/chat/${id}/auditoria`), { params: { id } })).status, 403);
  const r = await ler(await auditoria(await como('ana@a.com', `/api/chat/${id}/auditoria`), { params: { id } }));
  assert.deepEqual(r.eventos.map((e) => e.acao).sort(), ['chat_assumiu', 'chat_iniciou', 'chat_resolveu', 'chat_visualizou']);
  assert.ok(r.eventos.every((e) => e.acao === 'chat_iniciou' || e.quem === 'Bia Lima'));
  assert.ok(db.tables.auditoria_logs.every((l) => l.organizacao_id === A), 'auditoria presa à empresa');
});

test('excluir a conversa inteira: só administrador; apaga arquivos e fica na auditoria', async () => {
  db.tables.auditoria_logs = [];
  const id = convVendas.id;
  db.arquivos = { [`chat-midia/${A}/${id}/x.jpg`]: { dados: 'x' }, [`chat-midia/${A}/outra/y.jpg`]: { dados: 'y' } };
  assert.equal((await agir(await como('bia@a.com', `/api/chat/${id}`, 'POST', { acao: 'excluir' }), { params: { id } })).status, 403);
  const r = await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'excluir' }), { params: { id } });
  assert.equal(r.status, 200);
  assert.equal(db.tables.conversas.some((c) => c.id === id), false);
  assert.deepEqual(Object.keys(db.arquivos), [`chat-midia/${A}/outra/y.jpg`], 'só os arquivos desta conversa');
  const log = db.tables.auditoria_logs.find((l) => l.acao === 'chat_excluiu');
  assert.equal(log.usuario_email, 'ana@a.com');
  assert.equal(log.detalhes.conversa_id, id);
});

test('assumir antes de responder: sem assumir não envia, nem nota, nem arquivo, nem reação (grupos ficam de fora)', async () => {
  const id = convVendas.id;
  const r = await ler(await agir(await como('bia@a.com', `/api/chat/${id}`, 'POST', { acao: 'enviar', texto: 'oi' }), { params: { id } }));
  assert.equal(r.status, 409);
  assert.equal(r.precisa_assumir, true);
  assert.equal((await agir(await como('bia@a.com', `/api/chat/${id}`, 'POST', { acao: 'nota', texto: 'x' }), { params: { id } })).status, 409);
  assert.equal(enviados.length, 0);
  await agir(await como('bia@a.com', `/api/chat/${id}`, 'POST', { acao: 'assumir' }), { params: { id } });
  assert.equal((await agir(await como('bia@a.com', `/api/chat/${id}`, 'POST', { acao: 'enviar', texto: 'oi', assinar: false }), { params: { id } })).status, 200);
  // Com outra pessoa: a Ana (administradora) também precisa assumir
  const outra = await ler(await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'enviar', texto: 'oi' }), { params: { id } }));
  assert.match(outra.mensagem, /Bia Lima/);
});

test('grupo: participante salvo com o número de verdade, menção vira nome e envio menciona de verdade', async () => {
  const { POST: receber } = await import('../src/app/api/canais/webhook/[id]/route.js');
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat', valor: { grupos: 'aba' } }];
  db.tables.participantes_grupo = [];
  globalThis.fetch = async (url, op) => {
    enviados.push({ url: String(url), corpo: op?.body ? JSON.parse(op.body) : null });
    return new Response(JSON.stringify(String(url).includes('findGroupInfos') ? { subject: 'Equipe Comercial' } : { key: { id: `EVO-${enviados.length}`, remoteJid: '120363999@g.us' } }), { status: 200 });
  };
  const aviso = (id, key, message, pushName) => receber(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '120363999@g.us', id, ...key }, pushName, message } }) }), { params: { id: canal.id } });
  await aviso('G1', { participant: '279619886420042@lid', participantAlt: '558598887777@s.whatsapp.net' }, { conversation: 'Bom dia!' }, 'Maria Albano');
  await aviso('G2', { participant: '11111@lid' }, { extendedTextMessage: { text: 'Fala com a @279619886420042', contextInfo: { mentionedJid: ['279619886420042@lid'] } } }, 'Pedro');

  const grupo = db.tables.contatos.find((c) => c.telefone === '120363999@g.us');
  assert.equal(grupo.nome, 'Equipe Comercial');
  const maria = db.tables.contatos.find((c) => c.nome === 'Maria Albano');
  assert.equal(maria.telefone, '5585998887777', 'contato com o número de verdade (com o 9º dígito)');
  assert.equal(db.tables.contatos.some((c) => c.telefone?.includes('279619886420042') || c.telefone?.includes('11111')), false, 'código interno nunca vira contato');
  assert.equal(db.tables.mensagens.find((m) => m.id_externo === 'G2').conteudo, 'Fala com a @Maria Albano');

  // Enviar mencionando a Maria pelo nome: o WhatsApp recebe o número e a lista de mencionados
  const conversaGrupo = db.tables.conversas.find((c) => c.contato_id === grupo.id);
  const id = conversaGrupo.id;
  const r = await ler(await agir(await como('ana@a.com', `/api/chat/${id}`, 'POST', { acao: 'enviar', texto: 'Oi @Maria Albano, tudo certo', assinar: false, mencoes: [{ jid: '279619886420042@lid', nome: 'Maria Albano' }] }), { params: { id } }));
  assert.equal(r.status, 200, r.mensagem);
  const envio = enviados.find((e) => e.url.includes('sendText'));
  // Grupo novo (participante pelo código …@lid): a menção vai pelo código, como o celular faz
  assert.equal(envio.corpo.text, 'Oi @279619886420042, tudo certo');
  assert.deepEqual(envio.corpo.mentioned, ['279619886420042@lid']);
  assert.equal(r.mensagem.conteudo, 'Oi @Maria Albano, tudo certo', 'a tela guarda com o nome');

  // Grupo fechado: a próxima interação reabre a mesma conversa (sem criar outra vazia)
  Object.assign(conversaGrupo, { status: 'resolvida', resolvida_em: new Date().toISOString(), responsavel_email: null, responsavel_nome: null });
  await aviso('G3', { participant: '279619886420042@lid' }, { conversation: 'Voltei!' }, 'Maria Albano');
  const doGrupo = db.tables.conversas.filter((c) => c.contato_id === grupo.id);
  assert.equal(doGrupo.length, 1, 'continua uma conversa só');
  assert.equal(doGrupo[0].status, 'aguardando', 'sem responsável, volta pendente');
  assert.equal(doGrupo[0].resolvida_em, null);
  assert.equal(db.tables.mensagens.find((m) => m.id_externo === 'G3').conversa_id, id, 'a mensagem fica na conversa reaberta');
  assert.ok(db.tables.mensagens.some((m) => m.conversa_id === id && m.tipo === 'sistema' && /reaberta/.test(m.conteudo)));
  // Com responsável: também volta para Pendentes, sem responsável (a fila toda vê)
  Object.assign(doGrupo[0], { status: 'resolvida', responsavel_email: 'ana@a.com', responsavel_nome: 'Ana Souza' });
  await aviso('G4', { participant: '279619886420042@lid' }, { conversation: 'Mais uma' }, 'Maria Albano');
  assert.equal(db.tables.conversas.filter((c) => c.contato_id === grupo.id).length, 1);
  assert.equal(doGrupo[0].status, 'aguardando');
  assert.equal(doGrupo[0].responsavel_email, null);
  // Mensagem da própria equipe (celular ou eco de envio) entra na fechada sem reabrir
  Object.assign(doGrupo[0], { status: 'resolvida', resolvida_em: new Date().toISOString() });
  await aviso('G5', { fromMe: true }, { conversation: 'mandei pelo celular' }, 'Ana');
  assert.equal(db.tables.conversas.filter((c) => c.contato_id === grupo.id).length, 1);
  assert.equal(doGrupo[0].status, 'resolvida', 'mensagem nossa não reabre');
  assert.equal(db.tables.mensagens.find((m) => m.id_externo === 'G5').conversa_id, id);

  // Conversa com uma pessoa: a mesma conversa fechada volta para Pendentes, com o histórico (sem conversa nova)
  const pessoa = (idMsg, message) => receber(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '5585997776666@s.whatsapp.net', id: idMsg }, pushName: 'Bruno', message } }) }), { params: { id: canal.id } });
  await pessoa('P1', { conversation: 'Oi, preciso de ajuda' });
  const conversaPessoa = db.tables.conversas.find((c) => c.id === db.tables.mensagens.find((m) => m.id_externo === 'P1').conversa_id);
  Object.assign(conversaPessoa, { status: 'resolvida', resolvida_em: new Date().toISOString(), responsavel_email: 'ana@a.com', responsavel_nome: 'Ana Souza' });
  await pessoa('P2', { conversation: 'Voltei com outra dúvida' });
  assert.equal(db.tables.conversas.filter((c) => c.contato_id === conversaPessoa.contato_id).length, 1, 'não nasce conversa nova');
  assert.equal(db.tables.mensagens.find((m) => m.id_externo === 'P2').conversa_id, conversaPessoa.id);
  assert.equal(conversaPessoa.status, 'aguardando');
  assert.equal(conversaPessoa.responsavel_email, null);
  assert.ok(db.tables.mensagens.some((m) => m.conversa_id === conversaPessoa.id && m.tipo === 'sistema' && /cliente mandou nova mensagem/.test(m.conteudo)));
});

test('busca de mensagens respeita o período e quem pode ver; lista de contatos sem grupos', async () => {
  const { GET: buscar } = await import('../src/app/api/chat/busca/route.js');
  const { GET: contatos } = await import('../src/app/api/chat/contatos/route.js');
  const velha = { id: crypto.randomUUID(), organizacao_id: A, conversa_id: convVendas.id, direcao: 'entrada', tipo: 'texto', conteudo: 'orçamento antigo', status: 'recebida', criado_em: new Date(Date.now() - 60 * 864e5).toISOString() };
  const doFinanceiro = { id: crypto.randomUUID(), organizacao_id: A, conversa_id: convFinanceiro.id, direcao: 'entrada', tipo: 'texto', conteudo: 'segundo orçamento', status: 'recebida', criado_em: new Date().toISOString() };
  db.tables.mensagens.push(velha, doFinanceiro);
  const em30 = await ler(await buscar(await como('ana@a.com', '/api/chat/busca?q=orçamento&dias=30')));
  assert.deepEqual(em30.resultados.map((m) => m.conteudo).sort(), ['Oi, quero um orçamento', 'segundo orçamento']);
  const em90 = await ler(await buscar(await como('ana@a.com', '/api/chat/busca?q=orçamento&dias=90')));
  assert.equal(em90.resultados.length, 3);
  const bia = await ler(await buscar(await como('bia@a.com', '/api/chat/busca?q=orçamento&dias=90')));
  assert.equal(bia.resultados.some((m) => m.conteudo === 'segundo orçamento'), false, 'Financeiro não aparece para Vendas');
  assert.equal((await buscar(await como('ana@a.com', '/api/chat/busca?q=o'))).status, 400);

  db.tables.contatos.push({ id: crypto.randomUUID(), organizacao_id: A, telefone: '120363@g.us', nome: 'Grupo X' });
  const lista = await ler(await contatos(await como('bia@a.com', '/api/chat/contatos?lista=1')));
  assert.deepEqual(lista.contatos.map((c) => c.nome), ['Carla Mendes']);
});

test('vigia do chat: avisa conversa nova na fila e mensagem nas minhas (inclusive a aberta); não avisa grupo', async () => {
  const { analisarConversas } = await import('../src/lib/vigiaChat.js');
  const c = (id, extra) => ({ id, status: 'aguardando', nao_lidas: 1, contato: { nome: id, telefone: '5585999990000' }, ...extra });
  const inicio = analisarConversas(null, [c('a')], { email: 'eu@a.com' });
  assert.equal(inicio.avisos.length, 0, 'primeira leitura só registra');
  const r = analisarConversas(inicio.proximo, [c('a', { nao_lidas: 2 }), c('b'), c('g', { contato: { nome: 'G', telefone: '1203@g.us' } }), c('m', { responsavel_email: 'eu@a.com', nao_lidas: 0 }), c('x', { responsavel_email: 'outro@a.com' })], { email: 'eu@a.com', abertaId: null });
  assert.deepEqual(r.avisos.map((a) => a.titulo), ['Na fila de a', 'Nova conversa: b']);
  const r2 = analisarConversas(r.proximo, [c('m', { responsavel_email: 'eu@a.com', nao_lidas: 3 }), c('b', { nao_lidas: 4 })], { email: 'eu@a.com' });
  assert.deepEqual(r2.avisos.map((a) => a.titulo), ['Mensagem de m', 'Na fila de b']);
  // Conversa aberta na tela: chega já lida (não lidas 0), mas a mensagem do cliente é nova → avisa
  const aberta = (em) => c('m', { responsavel_email: 'eu@a.com', nao_lidas: 0, ultima_entrada_cliente_em: em });
  const r3 = analisarConversas(analisarConversas(r2.proximo, [aberta('2026-10-27T10:00:00Z')], { email: 'eu@a.com' }).proximo, [aberta('2026-10-27T10:01:00Z')], { email: 'eu@a.com' });
  assert.deepEqual(r3.avisos.map((a) => a.titulo), ['Mensagem de m']);
  const { chatEsperando } = await import('../src/lib/vigiaChat.js');
  assert.equal(chatEsperando([aberta('2026-10-27T10:01:00Z')], { email: 'eu@a.com' }), false, 'lida: a repetição para');
  assert.equal(chatEsperando([c('b')], { email: 'eu@a.com' }), true);
});

test('menção a quem nunca escreveu: atualiza a lista do grupo e mostra o nome (ou o número), nunca o código', async () => {
  const { POST: receber } = await import('../src/app/api/canais/webhook/[id]/route.js');
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat', valor: { grupos: 'aba' } }];
  db.tables.participantes_grupo = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const corpo = u.includes('/group/participants/')
      ? { participants: [{ id: '255619407855624@lid', phoneNumber: '558499990000@s.whatsapp.net', admin: null }, { id: '333444555666777@lid', phoneNumber: '558477776666@s.whatsapp.net', admin: 'admin' }] }
      : u.includes('/chat/findContacts/')
        ? [{ remoteJid: '333444555666777@lid', pushName: 'Matheus Prado' }]
        : u.includes('findGroupInfos')
          ? { subject: 'Expert Turismo' }
          : {};
    return new Response(JSON.stringify(corpo), { status: 200 });
  };
  const aviso = (id, texto, mencoes) =>
    receber(
      new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' },
        body: JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '120363777@g.us', participant: '444@lid', id }, pushName: 'Pedro', message: { extendedTextMessage: { text: texto, contextInfo: { mentionedJid: mencoes } } } } }),
      }),
      { params: { id: canal.id } }
    );
  await aviso('M1', '@255619407855624 tem como tentar? @333444555666777', ['255619407855624@lid', '333444555666777@lid']);
  const msg = db.tables.mensagens.find((m) => m.id_externo === 'M1');
  assert.equal(msg.conteudo, '@(84) 99999-0000 tem como tentar? @Matheus Prado');
  const conversa = db.tables.conversas.find((c) => c.id === msg.conversa_id);
  assert.equal(conversa.ultima_mensagem_texto.startsWith('@(84) 99999-0000'), true);
});

test('fotos em lote: uma chamada traz as fotos permitidas; contato de outro departamento fica de fora', async () => {
  const { GET: fotos } = await import('../src/app/api/chat/fotos/route.js');
  const outro = { id: crypto.randomUUID(), organizacao_id: A, telefone: '5585911112222', nome: 'Do Financeiro', foto_url: `${A}/contatos/f2.jpg` };
  contato.foto_url = `${A}/contatos/f1.jpg`;
  db.tables.contatos.push(outro);
  convFinanceiro.contato_id = outro.id;
  db.arquivos = { [`chat-midia/${A}/contatos/f1.jpg`]: { dados: 'x' }, [`chat-midia/${A}/contatos/f2.jpg`]: { dados: 'y' } };
  const ana = await ler(await fotos(await como('ana@a.com', `/api/chat/fotos?ids=${contato.id},${outro.id}`)));
  assert.deepEqual(Object.keys(ana.fotos).sort(), [contato.id, outro.id].sort());
  const bia = await ler(await fotos(await como('bia@a.com', `/api/chat/fotos?ids=${contato.id},${outro.id}`)));
  assert.deepEqual(Object.keys(bia.fotos), [contato.id], 'Vendas não recebe a foto de contato do Financeiro');
});

test('grupo: quem escreve só com o código interno vira contato pelo número da lista; participantes com nome também', async () => {
  const { POST: receber } = await import('../src/app/api/canais/webhook/[id]/route.js');
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat', valor: { grupos: 'aba' } }];
  db.tables.participantes_grupo = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const corpo = u.includes('/group/participants/')
      ? { participants: [{ id: '111222333444555@lid', phoneNumber: '558481393870@s.whatsapp.net' }, { id: '999888777666555@lid', phoneNumber: '558399133015@s.whatsapp.net' }, { id: '123123123123123@lid', phoneNumber: '558477770000@s.whatsapp.net' }] }
      : u.includes('/chat/findContacts/')
        ? [{ remoteJid: '999888777666555@lid', pushName: 'Rayane' }]
        : u.includes('findGroupInfos')
          ? { subject: 'Equipe Comercial' }
          : {};
    return new Response(JSON.stringify(corpo), { status: 200 });
  };
  await receber(
    new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' },
      body: JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '120363555@g.us', participant: '111222333444555@lid', id: 'P1' }, pushName: 'Pedro Alvarez', message: { conversation: 'Aqui é 13' } } }),
    }),
    { params: { id: canal.id } }
  );
  const nomes = db.tables.contatos.filter((c) => !c.telefone.endsWith('@g.us')).map((c) => `${c.nome} ${c.telefone}`).sort();
  assert.ok(nomes.includes('Pedro Alvarez 5584981393870'), `quem escreveu, pelo número da lista: ${nomes.join(' | ')}`);
  assert.ok(nomes.includes('Rayane 5583999133015'), `participante com nome conhecido vira contato: ${nomes.join(' | ')}`);
  assert.equal(nomes.some((c) => c.includes('5584977770000')), false, 'sem nome conhecido não vira contato');
  assert.equal(db.tables.contatos.some((c) => /111222333444555|999888777666555/.test(c.telefone)), false, 'código interno nunca vira telefone');
});

test('acesso ao chat por pessoa: ver tickets de colegas e controle de canais (o canal vale mais que o departamento)', async () => {
  const { PUT: salvarAcesso } = await import('../src/app/api/chat/acesso/route.js');
  const canal2 = { id: crypto.randomUUID(), organizacao_id: A, nome: 'Suporte', tipo: 'whatsapp_qr', provedor: 'evolution', status: 'conectado', ativo: true, config: {} };
  db.tables.canais.push(canal2);
  const assumidaPorAna = { ...convVendas, id: crypto.randomUUID(), contato_id: crypto.randomUUID(), status: 'em_atendimento', responsavel_email: 'ana@a.com', responsavel_nome: 'Ana Souza' };
  const doCanal2 = { ...convVendas, id: crypto.randomUUID(), contato_id: crypto.randomUUID(), canal_id: canal2.id };
  db.tables.conversas.push(assumidaPorAna, doCanal2);
  db.tables.sistema_config = [];
  const ids = async () => (await ler(await listar(await como('bia@a.com', '/api/chat')))).conversas.map((c) => c.id).sort();

  // Padrão: vê as pendentes do departamento, não as que colegas assumiram
  assert.deepEqual(await ids(), [convVendas.id, doCanal2.id].sort());
  assert.equal((await abrir(await como('bia@a.com', `/api/chat/${assumidaPorAna.id}`), { params: { id: assumidaPorAna.id } })).status, 404);

  // Só administrador configura
  assert.equal((await salvarAcesso(await como('bia@a.com', '/api/chat/acesso', 'PUT', { email: 'bia@a.com', verOutros: true }))).status, 403);
  await salvarAcesso(await como('ana@a.com', '/api/chat/acesso', 'PUT', { email: 'bia@a.com', verOutros: true }));
  assert.deepEqual(await ids(), [convVendas.id, doCanal2.id, assumidaPorAna.id].sort());

  // Controle de canais: só o canal liberado, mesmo sendo do mesmo departamento
  await salvarAcesso(await como('ana@a.com', '/api/chat/acesso', 'PUT', { email: 'bia@a.com', verOutros: true, controleCanais: true, canais: [canal.id, crypto.randomUUID()] }));
  assert.deepEqual(await ids(), [convVendas.id, assumidaPorAna.id].sort());
  const salvo = db.tables.sistema_config.find((c) => c.chave === 'chat_acesso_usuarios').valor['bia@a.com'];
  assert.deepEqual(salvo.canais, [canal.id], 'canal que não é da empresa é descartado');

  // Na lista para liberar, só canais ativos
  const { GET: lerAcesso } = await import('../src/app/api/chat/acesso/route.js');
  canal2.ativo = false;
  const lista = (await ler(await lerAcesso(await como('ana@a.com', '/api/chat/acesso?email=bia@a.com')))).canais.map((c) => c.id);
  assert.ok(lista.includes(canal.id));
  assert.equal(lista.includes(canal2.id), false, 'canal inativo não aparece');
});

test('@todos no grupo menciona todos os participantes', async () => {
  const grupo = { id: crypto.randomUUID(), organizacao_id: A, telefone: '120363888@g.us', nome: 'Equipe' };
  db.tables.contatos.push(grupo);
  const conv = { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: grupo.id, status: 'aguardando', departamento: null, nao_lidas: 0 };
  db.tables.conversas.push(conv);
  db.tables.participantes_grupo = [];
  const r = await ler(await agir(await como('ana@a.com', `/api/chat/${conv.id}`, 'POST', { acao: 'enviar', texto: 'Bom dia @todos', assinar: false, mencoes: [{ jid: 'todos', nome: 'todos' }] }), { params: { id: conv.id } }));
  assert.equal(r.status, 200, r.mensagem);
  const envio = enviados.find((e) => e.url.includes('sendText'));
  assert.equal(envio.corpo.mentionsEveryOne, true);
  assert.equal(envio.corpo.text, 'Bom dia @todos');
});

test('contatos: criar sem duplicar (9º dígito), editar contato sem conversa; nova conversa com departamento', async () => {
  const { POST: contatos, PATCH: editarContato } = await import('../src/app/api/chat/contatos/route.js');
  const novo = await ler(await contatos(await como('bia@a.com', '/api/chat/contatos', 'POST', { acao: 'criar', nome: 'Jose', telefone: '+55 84 9814-3510' })));
  assert.equal(novo.status, 201, novo.mensagem);
  assert.equal(db.tables.contatos.find((c) => c.id === novo.contato.id).telefone, '5584998143510');
  const repetido = await ler(await contatos(await como('bia@a.com', '/api/chat/contatos', 'POST', { acao: 'criar', nome: 'José', telefone: '5584998143510' })));
  assert.equal(repetido.ja_existia, true);
  const editado = await ler(await editarContato(await como('bia@a.com', '/api/chat/contatos', 'PATCH', { id: novo.contato.id, nome: 'José Silva' })));
  assert.equal(editado.contato.nome, 'José Silva', 'contato sem conversa é da empresa toda');

  const r = await ler(await iniciar(await como('bia@a.com', '/api/chat', 'POST', { canal_id: canal.id, telefone: '5584998143510', texto: 'Olá', departamento: 'Vendas' })));
  assert.equal(r.status, 201, r.mensagem);
  assert.equal(r.conversa.departamento, 'Vendas');
});

test('abrir conversa sem mensagem: nada vai ao cliente e quem abriu fica responsável', async () => {
  enviados.length = 0;
  const r = await ler(await iniciar(await como('bia@a.com', '/api/chat', 'POST', { canal_id: canal.id, telefone: '(84) 99555-1234', sem_mensagem: true, departamento: 'Vendas' })));
  assert.equal(r.status, 201, r.mensagem);
  assert.equal(enviados.length, 0, 'nenhuma mensagem enviada');
  assert.equal(r.conversa.responsavel_email, 'bia@a.com');
  assert.equal(r.conversa.departamento, 'Vendas');
  assert.equal(r.conversa.contato.telefone, '5584995551234');
});

test('canal marcado para não receber grupos: o mesmo grupo aparece uma vez só e mensagens de grupo dele são ignoradas', async () => {
  const { POST: receber } = await import('../src/app/api/canais/webhook/[id]/route.js');
  const segundo = { ...canal, id: crypto.randomUUID(), nome: 'Comercial 2', config: {}, webhook_token_hash: hashToken('t2') };
  db.tables.canais.push(segundo);
  const grupo = { id: crypto.randomUUID(), organizacao_id: A, telefone: '120363777@g.us', nome: 'Equipe' };
  db.tables.contatos.push(grupo);
  const agora = new Date().toISOString();
  db.tables.conversas.push(
    { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: grupo.id, status: 'aguardando', departamento: null, nao_lidas: 1, ultima_mensagem_em: agora },
    { id: crypto.randomUUID(), organizacao_id: A, canal_id: segundo.id, contato_id: grupo.id, status: 'aguardando', departamento: null, nao_lidas: 1, ultima_mensagem_em: agora }
  );
  const grupos = async () => (await ler(await listar(await como('ana@a.com', '/api/chat')))).conversas.filter((c) => c.contato?.telefone === grupo.telefone);
  assert.equal((await grupos()).length, 2);

  const { PATCH } = await import('../src/app/api/canais/route.js');
  const r = await ler(await PATCH(await como('ana@a.com', '/api/canais', 'PATCH', { id: segundo.id, ignorarGrupos: true })));
  assert.equal(r.canal.config.ignorarGrupos, true);
  assert.ok(enviados.some((e) => e.url.includes('/settings/set/') && e.corpo.groupsIgnore === true), 'avisa o WhatsApp para não mandar grupos');
  const depois = await grupos();
  assert.deepEqual(depois.map((c) => c.canal_id), [canal.id]);
  assert.equal(db.tables.conversas.filter((c) => c.contato_id === grupo.id).length, 2, 'histórico guardado');

  // Mensagem de grupo que ainda chegue pelo canal marcado é ignorada
  const antes = db.tables.mensagens.length;
  await receber(new NextRequest(`http://localhost/api/canais/webhook/${segundo.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't2' }, body: JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: grupo.telefone, id: 'G-1', participant: '5585988887777@s.whatsapp.net' }, pushName: 'Zé', message: { conversation: 'oi grupo' } } }) }), { params: { id: segundo.id } });
  assert.equal(db.tables.mensagens.length, antes);

  // Bia (sem administrador) não pode mudar canal
  assert.equal((await PATCH(await como('bia@a.com', '/api/canais', 'PATCH', { id: segundo.id, ignorarGrupos: false }))).status, 403);
});

test('mesclar canais: só do mesmo número e desconectado; conversas passam e a aberta do mesmo contato vira uma só', async () => {
  const { POST: acaoCanal } = await import('../src/app/api/canais/[id]/route.js');
  canal.numero = '5585999991824';
  const antigo = { ...canal, id: crypto.randomUUID(), nome: 'Antigo', status: 'desconectado', ativo: false, numero: '558599991824', config: {}, webhook_token_hash: hashToken('t3') };
  const outroNumero = { ...antigo, id: crypto.randomUUID(), nome: 'Outro', numero: '5585911112222', webhook_token_hash: hashToken('t4') };
  db.tables.canais.push(antigo, outroNumero);
  const ontem = new Date(Date.now() - 86400000).toISOString();
  const outro = { id: crypto.randomUUID(), organizacao_id: A, telefone: '5585977776666', nome: 'Davi' };
  db.tables.contatos.push(outro);
  const velhaMesmoContato = { id: crypto.randomUUID(), organizacao_id: A, canal_id: antigo.id, contato_id: contato.id, status: 'em_atendimento', responsavel_email: 'ana@a.com', departamento: 'Vendas', nao_lidas: 1, ultima_mensagem_em: ontem, criado_em: ontem };
  const velhaOutro = { id: crypto.randomUUID(), organizacao_id: A, canal_id: antigo.id, contato_id: outro.id, status: 'resolvida', nao_lidas: 0, ultima_mensagem_em: ontem };
  db.tables.conversas.push(velhaMesmoContato, velhaOutro);
  db.tables.mensagens.push({ id: crypto.randomUUID(), organizacao_id: A, conversa_id: velhaMesmoContato.id, direcao: 'entrada', tipo: 'texto', conteudo: 'mensagem antiga', status: 'recebida', criado_em: ontem });
  db.tables.auditoria_logs = [];
  const pedir = async (email, corpo) => ler(await acaoCanal(await como(email, `/api/canais/${canal.id}`, 'POST', corpo), { params: { id: canal.id } }));

  assert.equal((await pedir('bia@a.com', { acao: 'mesclar', origem: antigo.id })).status, 403, 'só administrador');
  assert.match((await pedir('ana@a.com', { acao: 'mesclar', origem: outroNumero.id })).mensagem, /mesmo número/);
  antigo.status = 'conectado';
  antigo.ativo = true;
  assert.match((await pedir('ana@a.com', { acao: 'mesclar', origem: antigo.id })).mensagem, /Desconecte ou desative/);
  // Desativado, mesmo constando conectado: mescla e desliga a conexão antiga
  antigo.ativo = false;

  const r = await pedir('ana@a.com', { acao: 'mesclar', origem: antigo.id });
  assert.equal(r.ok, true);
  assert.deepEqual([r.movidas, r.juntadas], [1, 1]);
  assert.equal(db.tables.conversas.some((c) => c.canal_id === antigo.id), false, 'canal antigo vazio');
  assert.equal(db.tables.conversas.some((c) => c.id === velhaMesmoContato.id), false);
  assert.equal(db.tables.conversas.find((c) => c.id === velhaOutro.id).canal_id, canal.id);
  const juntada = db.tables.conversas.find((c) => c.id === convVendas.id);
  assert.equal(juntada.nao_lidas, 3);
  assert.equal(juntada.criado_em, ontem, 'a conversa começa quando começou a antiga');
  assert.deepEqual(db.tables.mensagens.filter((m) => m.conversa_id === convVendas.id).map((m) => m.conteudo).sort(), ['Oi, quero um orçamento', 'mensagem antiga']);
  assert.equal(db.tables.canais.some((c) => c.id === antigo.id), false, 'o canal antigo some depois de mesclar');
  assert.ok(enviados.some((e) => e.url.includes(`/instance/delete/`)), 'remove a conexão antiga do WhatsApp');
  const mescla = db.tables.auditoria_logs.find((l) => l.acao === 'canal_mesclou');
  assert.equal(mescla.detalhes.canal_id, canal.id, 'a mescla fica no histórico do canal novo');
  assert.deepEqual([mescla.detalhes.de, mescla.detalhes.movidas, mescla.detalhes.juntadas], ['Antigo', 1, 1]);
  const { GET: historico } = await import('../src/app/api/canais/[id]/route.js');
  const h = await ler(await historico(await como('ana@a.com', `/api/canais/${canal.id}`), { params: { id: canal.id } }));
  assert.equal(h.historico[0].acao, 'canal_mesclou');
  assert.equal(db.tables.auditoria_logs.some((l) => l.acao === 'chat_mesclou' && l.detalhes.de_conversa_id === velhaMesmoContato.id), true);
});

test('canais inativos: desativar marca a data; depois do prazo, sem conversas é excluído e com conversas sai da lista', async () => {
  const { GET: listarCanais, PATCH, PUT } = await import('../src/app/api/canais/route.js');
  db.tables.auditoria_logs = [];
  db.tables.sistema_config = [];
  const vazio = { ...canal, id: crypto.randomUUID(), nome: 'Vazio', status: 'desconectado', webhook_token_hash: hashToken('t5'), config: {} };
  const comConversa = { ...canal, id: crypto.randomUUID(), nome: 'Com conversa', status: 'desconectado', webhook_token_hash: hashToken('t6'), config: {} };
  db.tables.canais.push(vazio, comConversa);
  db.tables.conversas.push({ id: crypto.randomUUID(), organizacao_id: A, canal_id: comConversa.id, contato_id: contato.id, status: 'resolvida', nao_lidas: 0 });

  for (const c of [vazio, comConversa]) {
    const r = await ler(await PATCH(await como('ana@a.com', '/api/canais', 'PATCH', { id: c.id, ativo: false })));
    assert.equal(r.canal.ativo, false);
    assert.ok(r.canal.config.desativado_em, 'guarda quando foi desativado');
  }
  assert.equal(db.tables.auditoria_logs.filter((l) => l.acao === 'canal_desativou').length, 2, 'desativar entra no histórico');

  // Ainda dentro do prazo: continuam na lista (aba Inativos)
  let lista = await ler(await listarCanais(await como('ana@a.com', '/api/canais')));
  assert.equal(lista.limpezaDias, 60);
  assert.ok(lista.canais.some((c) => c.id === vazio.id) && lista.canais.some((c) => c.id === comConversa.id));

  // Passaram 61 dias
  const velho = new Date(Date.now() - 61 * 86400000).toISOString();
  db.tables.canais.filter((c) => [vazio.id, comConversa.id].includes(c.id)).forEach((c) => (c.config = { ...c.config, desativado_em: velho }));
  lista = await ler(await listarCanais(await como('ana@a.com', '/api/canais')));
  assert.equal(db.tables.canais.some((c) => c.id === vazio.id), false, 'sem conversas: excluído');
  assert.equal(db.tables.canais.find((c) => c.id === comConversa.id).config.arquivado, true, 'com conversas: arquivado, conversas guardadas');
  assert.equal(lista.canais.some((c) => c.id === comConversa.id), false, 'arquivado some da lista');
  assert.equal(db.tables.conversas.some((c) => c.canal_id === comConversa.id), true);

  // Prazo configurável (0 = nunca)
  assert.equal((await ler(await PUT(await como('ana@a.com', '/api/canais', 'PUT', { limpezaDias: 0 })))).limpezaDias, 0);
  assert.equal((await PUT(await como('ana@a.com', '/api/canais', 'PUT', { limpezaDias: 7 }))).status, 400);
  assert.equal((await PUT(await como('bia@a.com', '/api/canais', 'PUT', { limpezaDias: 30 }))).status, 403);
});

test('devolver para a fila (Kanban: Ativos → Pendentes): só quem está com a conversa ou administrador', async () => {
  const agir2 = async (email, corpo) => ler(await agir(await como(email, `/api/chat/${convVendas.id}`, 'POST', corpo), { params: { id: convVendas.id } }));
  assert.equal((await agir2('bia@a.com', { acao: 'assumir' })).ok, true);
  assert.equal(db.tables.conversas.find((c) => c.id === convVendas.id).responsavel_email, 'bia@a.com');
  const r = await agir2('bia@a.com', { acao: 'devolver' });
  assert.equal(r.ok, true);
  const conv = db.tables.conversas.find((c) => c.id === convVendas.id);
  assert.deepEqual([conv.responsavel_email, conv.status], [null, 'aguardando']);
  // Com outra pessoa: quem não está com ela nem a enxerga (sem "ver tickets de outros"); o administrador devolve
  await agir2('ana@a.com', { acao: 'assumir' });
  assert.equal((await agir2('bia@a.com', { acao: 'devolver' })).status, 404);
  assert.equal((await agir2('ana@a.com', { acao: 'devolver' })).ok, true);
});

test('ticket #23: ao abrir, a conversa traz os atendimentos anteriores do contato (se ligado e visíveis)', async () => {
  const antiga = { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: contato.id, status: 'resolvida', departamento: 'Vendas', criado_em: '2026-09-01T10:00:00Z', resolvida_em: '2026-09-02T10:00:00Z', responsavel_nome: 'Ana Souza' };
  const deOutroDepto = { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: contato.id, status: 'resolvida', departamento: 'Financeiro', criado_em: '2026-08-01T10:00:00Z' };
  convVendas.criado_em = '2026-10-20T10:00:00Z';
  db.tables.conversas.push(antiga, deOutroDepto);
  const abrirComo = async (email) => ler(await abrir(await como(email, `/api/chat/${convVendas.id}?abrir=1`), { params: { id: convVendas.id } }));
  const ana = await abrirComo('ana@a.com');
  assert.deepEqual(ana.anteriores.map((t) => t.id), [antiga.id, deOutroDepto.id], 'administrador vê todas, da mais recente para a mais antiga');
  assert.equal(ana.anteriores[0].canal, 'Comercial');
  const bia = await abrirComo('bia@a.com');
  assert.deepEqual(bia.anteriores.map((t) => t.id), [antiga.id], 'só as que a pessoa pode ver (departamento)');
  // As mensagens do atendimento anterior abrem pela própria conversa
  assert.equal((await abrir(await como('bia@a.com', `/api/chat/${antiga.id}`), { params: { id: antiga.id } })).status, 200);
  // Desligado nas configurações: não traz
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat', valor: { grupos: 'desligado', historicoAnterior: false } }];
  assert.deepEqual((await abrirComo('ana@a.com')).anteriores, []);
});

test('ticket #22: assinatura obrigatória assina no servidor mesmo que a tela peça sem assinatura', async () => {
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat', valor: { assinaturaObrigatoria: true } }];
  const enviar = async (corpo) => ler(await agir(await como('ana@a.com', `/api/chat/${convVendas.id}`, 'POST', corpo), { params: { id: convVendas.id } }));
  await enviar({ acao: 'assumir' });
  const r = await enviar({ acao: 'enviar', texto: 'Olá', assinar: false });
  assert.equal(r.ok, true);
  const envio = enviados.find((e) => e.url.includes('sendText'));
  assert.match(envio.corpo.text, /^\*Ana Souza:\*\nOlá$/);
});

test('ações em massa: resolver, transferir, etiquetas, atendente padrão e lead; só conversas que a pessoa vê', async () => {
  const { POST: emMassa } = await import('../src/app/api/chat/massa/route.js');
  const massa = async (email, corpo) => ler(await emMassa(await como(email, '/api/chat/massa', 'POST', corpo)));
  const contatoFin = { id: convFinanceiro.contato_id, organizacao_id: A, telefone: '5585988887777', nome: 'Grupo Suporte' };
  db.tables.contatos.push(contatoFin);

  // Etiqueta no contato e no grupo (vale para as próximas conversas); repetida não duplica
  let r = await massa('ana@a.com', { ids: [convVendas.id, convFinanceiro.id], acao: 'etiqueta_adicionar', etiqueta: 'Suporte RM' });
  assert.equal(r.status, 200, r.mensagem);
  assert.deepEqual(contato.etiquetas, ['Suporte RM']);
  assert.deepEqual(contatoFin.etiquetas, ['Suporte RM']);
  await massa('ana@a.com', { ids: [convVendas.id], acao: 'etiqueta_adicionar', etiqueta: 'suporte rm' });
  assert.deepEqual(contato.etiquetas, ['Suporte RM']);
  await massa('ana@a.com', { ids: [convVendas.id], acao: 'etiqueta_remover', etiqueta: 'SUPORTE RM' });
  assert.deepEqual(contato.etiquetas, []);

  // Bia (perfil Vendas) só vê a conversa de Vendas: a do Financeiro e a de outra empresa ficam de fora
  r = await massa('bia@a.com', { ids: [convVendas.id, convFinanceiro.id, convOutra.id], acao: 'transferir_departamento', departamento: 'Suporte' });
  assert.equal(r.feitas, 1);
  assert.equal(r.ignoradas, 2);
  assert.equal(convVendas.departamento, 'Suporte');
  assert.equal(convFinanceiro.departamento, 'Financeiro');
  assert.equal(convOutra.departamento, null);

  // Atendente padrão: só administrador
  assert.equal((await massa('bia@a.com', { ids: [convVendas.id], acao: 'atendente_padrao', email: 'ana@a.com' })).status, 403);
  r = await massa('ana@a.com', { ids: [convVendas.id], acao: 'atendente_padrao', email: 'bia@a.com' });
  assert.equal(r.status, 200, r.mensagem);
  assert.equal(contato.responsavel_padrao_email, 'bia@a.com');

  // Transferir para atendente e resolver em massa
  r = await massa('ana@a.com', { ids: [convVendas.id, convFinanceiro.id], acao: 'transferir_atendente', email: 'ana@a.com' });
  assert.equal(r.feitas, 2);
  assert.equal(convFinanceiro.responsavel_email, 'ana@a.com');
  r = await massa('ana@a.com', { ids: [convVendas.id, convFinanceiro.id], acao: 'resolver' });
  assert.equal(r.feitas, 2);
  assert.ok([convVendas, convFinanceiro].every((c) => c.status === 'resolvida'));
  assert.ok(db.tables.mensagens.some((m) => m.conversa_id === convVendas.id && /resolveu a conversa \(ação em massa\)/.test(m.conteudo)));

  // O cliente escreve de novo: a conversa volta já com o atendente padrão (Bia), não para Pendentes
  const { POST: receberWebhook } = await import('../src/app/api/canais/webhook/[id]/route.js');
  await receberWebhook(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false, id: 'MASSA1' }, pushName: 'Carla', message: { conversation: 'voltei' } } }) }), { params: Promise.resolve({ id: canal.id }) });
  assert.equal(convVendas.status, 'em_atendimento');
  assert.equal(convVendas.responsavel_email, 'bia@a.com');

  // Status de lead: etapa do processo comercial, um lead por contato; tirar apaga só o do Chat
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'comercial', valor: { departamentos: ['Vendas'], pipelines: [{ id: 'p1', nome: 'Vendas novas', etapas: [{ id: 'e1', nome: 'Qualificação' }, { id: 'e2', nome: 'Proposta' }] }] } }];
  db.tables.comercial_leads = [];
  assert.equal((await massa('ana@a.com', { ids: [convVendas.id], acao: 'lead', pipeline_id: 'p1', etapa_id: 'nao-existe' })).status, 400);
  r = await massa('ana@a.com', { ids: [convVendas.id], acao: 'lead', pipeline_id: 'p1', etapa_id: 'e1' });
  assert.equal(r.status, 200, r.mensagem);
  assert.equal(db.tables.comercial_leads.length, 1);
  assert.equal(db.tables.comercial_leads[0].contato_id, contato.id);
  assert.equal(db.tables.comercial_leads[0].organizacao_id, A);
  assert.equal(db.tables.comercial_leads[0].departamento, 'Vendas');
  await massa('ana@a.com', { ids: [convVendas.id], acao: 'lead', pipeline_id: 'p1', etapa_id: 'e2' });
  assert.equal(db.tables.comercial_leads.length, 1, 'não duplica o lead');
  assert.equal(db.tables.comercial_leads[0].comercial_etapa_id, 'e2');
  db.tables.comercial_leads.push({ id: crypto.randomUUID(), organizacao_id: A, integracao_id: crypto.randomUUID(), contato_id: contato.id, externo_id: '9902', comercial_etapa_id: 'e1' });
  r = await massa('ana@a.com', { ids: [convVendas.id], acao: 'lead', remover: true });
  assert.equal(r.feitas, 1);
  assert.equal(db.tables.comercial_leads.length, 1, 'o lead do webhook continua');
  assert.notEqual(db.tables.comercial_leads[0].integracao_id, null);

  // Sem conversas ou ação desconhecida
  assert.equal((await massa('ana@a.com', { ids: [], acao: 'resolver' })).status, 400);
  assert.equal((await massa('ana@a.com', { ids: [convVendas.id], acao: 'apagar_tudo' })).status, 400);
});
