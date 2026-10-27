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
  assert.equal(lista.mensagens.length, 2);
});

test('nota interna não vai para o WhatsApp; assumir, resolver e reabrir deixam registro', async () => {
  const id = convVendas.id;
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
