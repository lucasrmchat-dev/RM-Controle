// Fluxo Inteligente: motor, API, gatilho do WhatsApp (webhook) e gatilho da agenda.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { cifrarSegredos, hashToken } from '../src/lib/server/canais/cofre.js';
import { GET as listarFluxos, POST as criarFluxos } from '../src/app/api/fluxos/route.js';
import { GET as lerFluxo, PATCH as salvarFluxo, DELETE as excluirFluxo } from '../src/app/api/fluxos/[id]/route.js';
import { POST as disparar } from '../src/app/api/fluxos/disparar/route.js';
import { verificarSlaDemandas } from '../src/lib/server/fluxos.js';
import { GET as destinoPedido, POST as pedirAcesso } from '../src/app/api/chat/pedir-acesso/route.js';
import { MENSAGEM_PEDIR_ACESSO } from '../src/lib/pedirAcesso.js';
import { POST as receberWebhook } from '../src/app/api/canais/webhook/[id]/route.js';
import {
  ajustarCanais, dadosDaDemanda, efeitosSimulados, executarFluxo, exportarFluxo, gatilhoCasa, gatilhosDe, lerArquivoFluxo, novoBloco, preencher, problemasDoFluxo, validarDefinicao,
} from '../src/lib/fluxos.js';

__definirSupabaseAdmin(mockSupabase);

const A = crypto.randomUUID();
const B = crypto.randomUUID();
const PERFIL_SO_CHAT = crypto.randomUUID();
let canal, enviados;

beforeEach(() => {
  db.reset();
  db.unicos = { mensagens: [['conversa_id', 'id_externo']], contatos: [['organizacao_id', 'telefone']] };
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
    { id: B, nome: 'Clínica B', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.perfis_acesso = [{ id: PERFIL_SO_CHAT, organizacao_id: A, nome: 'Só chat', administrador: false, todos_departamentos: true, modulos: ['chat'] }];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana Souza', papel: 'administrador', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'bia@a.com', nome: 'Bia Lima', papel: 'suporte', ativo: true, organizacao_id: A, perfil_id: PERFIL_SO_CHAT },
    { id: crypto.randomUUID(), email: 'caio@b.com', nome: 'Caio', papel: 'administrador', ativo: true, organizacao_id: B },
  ];
  canal = { id: crypto.randomUUID(), organizacao_id: A, nome: 'Comercial', tipo: 'whatsapp_qr', provedor: 'evolution', status: 'conectado', ativo: true, config: {}, credenciais_cifradas: cifrarSegredos({ url: 'https://evo.exemplo.com', apikey: 'chave' }), webhook_token_hash: hashToken('t') };
  db.tables.canais = [canal];
  db.tables.contatos = [];
  db.tables.conversas = [];
  db.tables.mensagens = [];
  db.tables.sistema_config = [];
  db.tables.fluxos = [];
  db.tables.fluxo_execucoes = [];
  db.tables.fluxo_esperas = [];
  db.tables.agenda_eventos = [];
  enviados = [];
  globalThis.fetch = async (url, op) => {
    enviados.push({ url: String(url), corpo: op?.body ? JSON.parse(op.body) : null });
    return new Response(JSON.stringify({ key: { id: `EVO-${enviados.length}` } }), { status: 200 });
  };
});

const como = async (email, url, metodo = 'GET', body) =>
  new NextRequest(`http://localhost${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` }, body: body ? JSON.stringify(body) : undefined });
const ler = async (r) => ({ status: r.status, ...(await r.json()) });

/** gatilho de mensagem → condição (contém "preço") → Sim: enviar · Não: nada */
function desenhoBoasVindas({ origem = 'todas', canais = [] } = {}) {
  const g = { ...novoBloco('gatilho_mensagem', 0, 0), id: 'g1', config: { canais, origem, filtro: 'qualquer', texto: '' } };
  const c = { ...novoBloco('condicao', 300, 0), id: 'c1', config: { combinar: 'todas', regras: [{ campo: 'mensagem.texto', operador: 'contem', valor: 'preço' }] } };
  const m = { ...novoBloco('enviar_mensagem', 600, 0), id: 'm1', config: { destino: 'conversa', texto: 'Olá {{contato.nome}}, já te mando a tabela!' } };
  return { versao: 1, nos: [g, c, m], ligacoes: [{ id: 'l1', de: 'g1', saida: 'proximo', para: 'c1' }, { id: 'l2', de: 'c1', saida: 'sim', para: 'm1' }] };
}

test('motor: validação, variáveis, condição, gatilhos, círculo, exportar/importar e problemas', async () => {
  assert.throws(() => validarDefinicao({ nos: [{ id: 'x', tipo: 'rodar_codigo' }] }), /desconhecido/);
  const limpo = validarDefinicao({ nos: [{ id: 'g', tipo: 'gatilho_mensagem', config: { origem: 'grupo', __proto__x: 1, f: () => 1 } }, { id: 'm', tipo: 'enviar_mensagem' }], ligacoes: [{ de: 'm', para: 'g' }, { de: 'g', para: 'm', saida: 'xyz' }, { de: 'g', para: 'm' }] });
  assert.equal(limpo.ligacoes.length, 1, 'nada entra no gatilho; ligação repetida sai');
  assert.equal(limpo.ligacoes[0].saida, 'proximo');
  assert.equal(limpo.nos[0].config.f, null, 'função não passa');
  assert.deepEqual(gatilhosDe(limpo), ['gatilho_mensagem']);
  assert.equal(preencher('Oi {{contato.nome}} ({{conversa.grupo}}) {{nao.existe}}!', { contato: { nome: 'Ana' }, conversa: { grupo: false } }), 'Oi Ana (não) !');

  const ev = (texto, extra = {}) => ({ tipo: 'mensagem_recebida', dados: { mensagem: { texto }, contato: { nome: 'Carla', telefone: '5585' }, conversa: { id: 'cv', grupo: false, ...extra }, canal: { id: 'k1' } } });
  const g = (config) => ({ tipo: 'gatilho_mensagem', config: { canais: [], origem: 'todas', filtro: 'qualquer', texto: '', ...config } });
  assert.equal(gatilhoCasa(g({ origem: 'grupo' }), ev('oi')), false);
  assert.equal(gatilhoCasa(g({ origem: 'grupo' }), ev('oi', { grupo: true })), true);
  assert.equal(gatilhoCasa(g({ canais: ['k2'] }), ev('oi')), false);
  assert.equal(gatilhoCasa(g({ filtro: 'palavras', texto: 'preço, orçamento' }), ev('Quero um ORCAMENTO')), true, 'sem acento e sem maiúsculas');
  assert.equal(gatilhoCasa(g({ so_sem_responsavel: true }), ev('oi', { responsavel_email: 'x@a.com' })), false);
  assert.equal(gatilhoCasa({ tipo: 'gatilho_reuniao_status', config: { status: 'concluida' } }, { tipo: 'reuniao_status', dados: { reuniao: { status: 'cancelada' } } }), false);

  const enviadas = [];
  const sim = await executarFluxo({ definicao: desenhoBoasVindas(), evento: ev('Qual o preço?'), efeitos: efeitosSimulados({ aoEnviar: (t) => enviadas.push(t) }) });
  assert.equal(sim.casou, true);
  assert.deepEqual(sim.passos.map((p) => p.no), ['g1', 'c1', 'm1']);
  assert.deepEqual(enviadas, ['Olá Carla, já te mando a tabela!']);
  const nao = await executarFluxo({ definicao: desenhoBoasVindas(), evento: ev('bom dia'), efeitos: efeitosSimulados() });
  assert.deepEqual(nao.passos.map((p) => p.saida), ['proximo', 'nao']);

  // Círculo: variável → variável → ... para no limite
  const circulo = { nos: [{ id: 'g', tipo: 'gatilho_mensagem', config: {} }, { id: 'a', tipo: 'variavel', config: { nome: 'x', valor: '1' } }, { id: 'b', tipo: 'variavel', config: { nome: 'y', valor: '2' } }], ligacoes: [{ de: 'g', para: 'a' }, { de: 'a', para: 'b' }, { de: 'b', para: 'a' }] };
  const r = await executarFluxo({ definicao: validarDefinicao(circulo), evento: ev('x'), efeitos: efeitosSimulados(), maxPassos: 20 });
  assert.equal(r.status, 'parou');

  // Bloco que precisa de reunião num gatilho de mensagem: erro claro
  const semReuniao = validarDefinicao({ nos: [{ id: 'g', tipo: 'gatilho_mensagem' }, { id: 's', tipo: 'reuniao_status' }], ligacoes: [{ de: 'g', para: 's' }] });
  const e = await executarFluxo({ definicao: semReuniao, evento: ev('x'), efeitos: efeitosSimulados() });
  assert.equal(e.status, 'erro');
  assert.match(e.passos.at(-1).erro, /reunião/);

  // Exportar → importar noutra empresa: canais que não existem saem
  const arquivo = JSON.stringify(exportarFluxo({ nome: 'Boas-vindas', definicao: desenhoBoasVindas({ canais: ['canal-de-la'] }) }));
  const lido = lerArquivoFluxo(arquivo);
  assert.equal(lido.nome, 'Boas-vindas');
  assert.equal(ajustarCanais(lido.definicao, ['outro']), 1);
  assert.deepEqual(lido.definicao.nos[0].config.canais, []);
  assert.throws(() => lerArquivoFluxo('{"nos": "x"'), /JSON|Unexpected|Expected/);

  assert.match(problemasDoFluxo({ nos: [], ligacoes: [] })[0], /gatilho/);
  assert.deepEqual(problemasDoFluxo(desenhoBoasVindas()), []);
});

test('API: criar, salvar, ativar (só sem problemas), listar, duplicar, importar, excluir; perfil e empresa', async () => {
  const pedir = async (email, corpo) => ler(await criarFluxos(await como(email, '/api/fluxos', 'POST', corpo)));
  const novo = await pedir('ana@a.com', { acao: 'criar', nome: 'Boas-vindas', descricao: 'Responde quem pergunta preço' });
  assert.equal(novo.status, 201);
  assert.equal(novo.fluxo.ativo, false);
  const id = novo.fluxo.id;
  const params = { params: Promise.resolve({ id }) };
  const patch = async (corpo, email = 'ana@a.com') => ler(await salvarFluxo(await como(email, `/api/fluxos/${id}`, 'PATCH', corpo), params));

  const ativarVazio = await patch({ ativo: true });
  assert.equal(ativarVazio.status, 400);
  assert.match(ativarVazio.mensagem, /gatilho/);
  const salvo = await patch({ definicao: desenhoBoasVindas() });
  assert.deepEqual(salvo.fluxo.gatilhos, ['gatilho_mensagem']);
  assert.equal(salvo.fluxo.versao, 2);
  assert.equal((await patch({ ativo: true })).fluxo.ativo, true);

  const lista = await ler(await listarFluxos(await como('ana@a.com', '/api/fluxos')));
  assert.equal(lista.fluxos.length, 1);
  assert.equal(lista.fluxos[0].blocos, 3);
  assert.equal(lista.fluxos[0].definicao, undefined, 'lista sem o desenho');
  assert.equal((await ler(await lerFluxo(await como('ana@a.com', `/api/fluxos/${id}`), params))).fluxo.definicao.nos.length, 3);

  const copia = await pedir('ana@a.com', { acao: 'duplicar', id });
  assert.equal(copia.fluxo.nome, 'Boas-vindas (cópia)');
  assert.equal(copia.fluxo.ativo, false, 'cópia nasce desligada');

  const importado = await pedir('ana@a.com', { acao: 'importar', arquivo: exportarFluxo({ nome: 'De outra empresa', definicao: desenhoBoasVindas({ canais: [crypto.randomUUID()] }) }) });
  assert.equal(importado.status, 201);
  assert.match(importado.aviso, /canais/);

  // Perfil sem o módulo e outra empresa
  assert.equal((await listarFluxos(await como('bia@a.com', '/api/fluxos'))).status, 403);
  assert.equal((await lerFluxo(await como('caio@b.com', `/api/fluxos/${id}`), params)).status, 404);
  assert.ok(db.tables.fluxos.every((f) => f.organizacao_id === A));

  assert.equal((await excluirFluxo(await como('ana@a.com', `/api/fluxos/${id}`, 'DELETE'), params)).status, 200);
  assert.equal(db.tables.fluxos.some((f) => f.id === id), false);
});

test('WhatsApp: mensagem recebida dispara o fluxo ativo, responde sem assumir a conversa e registra a execução', async () => {
  db.tables.fluxos = [
    { id: crypto.randomUUID(), organizacao_id: A, nome: 'Boas-vindas', ativo: true, definicao: desenhoBoasVindas({ origem: 'contato' }), gatilhos: ['gatilho_mensagem'] },
    { id: crypto.randomUUID(), organizacao_id: A, nome: 'Desligado', ativo: false, definicao: desenhoBoasVindas(), gatilhos: ['gatilho_mensagem'] },
    { id: crypto.randomUUID(), organizacao_id: B, nome: 'De outra empresa', ativo: true, definicao: desenhoBoasVindas(), gatilhos: ['gatilho_mensagem'] },
  ];
  const aviso = (id, texto, jid = '5585999990000@s.whatsapp.net', extra = {}) => ({ event: 'messages.upsert', data: { key: { remoteJid: jid, fromMe: false, id, ...extra }, pushName: 'Carla', message: { conversation: texto } } });
  const receber = (corpo) => receberWebhook(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify(corpo) }), { params: Promise.resolve({ id: canal.id }) });

  const res = await receber(aviso('M1', 'Qual o preço do plano?'));
  assert.equal(res.status, 200);
  const corpo = await res.json();
  assert.equal(corpo.recebidas, undefined, 'o provedor não recebe os dados das mensagens');
  const saida = enviados.filter((e) => e.url.includes('sendText'));
  assert.equal(saida.length, 1, 'só o fluxo ativo da empresa respondeu');
  assert.equal(saida[0].corpo.text, 'Olá Carla, já te mando a tabela!');
  const conversa = db.tables.conversas[0];
  assert.equal(conversa.responsavel_email ?? null, null, 'o fluxo não assume a conversa');
  const exec = db.tables.fluxo_execucoes;
  assert.equal(exec.length, 1);
  assert.equal(exec[0].status, 'ok');
  assert.equal(exec[0].organizacao_id, A);

  // Sem "preço": segue por Não e não envia; mensagem enviada pela própria empresa não dispara
  await receber(aviso('M2', 'bom dia'));
  await receber(aviso('M3', 'qual o preço?', '5585999990000@s.whatsapp.net', { fromMe: true }));
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 1);

  // Mensagem que chega e não dispara: fica registrada com o motivo (para quem testa o fluxo)
  db.tables.fluxos = [{ id: crypto.randomUUID(), organizacao_id: A, nome: 'Só grupos', ativo: true, definicao: desenhoBoasVindas({ origem: 'grupo' }), gatilhos: ['gatilho_mensagem'] }];
  db.tables.fluxo_execucoes = [];
  await receber(aviso('M4', 'oi, tudo bem?'));
  const naoDisparou = db.tables.fluxo_execucoes;
  assert.equal(naoDisparou.length, 1);
  assert.equal(naoDisparou[0].status, 'ignorado');
  assert.match(naoDisparou[0].resumo, /contato.*só para grupos/);
  assert.match(naoDisparou[0].passos[0].resultado, /Carla.*oi, tudo bem/);
  assert.equal(naoDisparou[0].organizacao_id, A);
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 1, 'nada foi enviado');
});

test('Agenda: reunião realizada dispara o fluxo (dados do banco), uma vez por situação', async () => {
  const reuniao = { id: crypto.randomUUID(), organizacao_id: A, titulo: 'Apresentação', empresa: 'DV Protec', data: '2026-10-28', hora_inicio: '14:00', status: 'concluida', tipo: 'cliente', observacoes: '', cliente_telefone: '5585988887777', created_at: new Date().toISOString() };
  db.tables.agenda_eventos = [reuniao];
  const def = validarDefinicao({
    nos: [
      { id: 'g', tipo: 'gatilho_reuniao_status', config: { status: 'concluida' } },
      { id: 'n', tipo: 'reuniao_anotar', config: { texto: 'Enviado pós-reunião para {{reuniao.empresa}}' } },
      { id: 'm', tipo: 'enviar_mensagem', config: { destino: 'cliente_reuniao', texto: 'Obrigado pela reunião, {{reuniao.empresa}}!' } },
    ],
    ligacoes: [{ de: 'g', para: 'n' }, { de: 'n', para: 'm' }],
  });
  db.tables.fluxos = [{ id: crypto.randomUUID(), organizacao_id: A, nome: 'Pós-reunião', ativo: true, definicao: def, gatilhos: gatilhosDe(def) }];
  const avisar = async (email, corpo) => ler(await disparar(await como(email, '/api/fluxos/disparar', 'POST', corpo)));

  assert.equal((await avisar('caio@b.com', { tipo: 'reuniao_status', evento_id: reuniao.id })).status, 404, 'reunião de outra empresa');
  assert.equal((await avisar('bia@a.com', { tipo: 'reuniao_status', evento_id: reuniao.id })).ok, true, 'qualquer pessoa da equipe avisa');
  assert.match(reuniao.observacoes, /Pós-reunião.*DV Protec/);
  const msg = enviados.find((e) => e.url.includes('sendText'));
  assert.equal(msg.corpo.number, '5585988887777');
  assert.equal(msg.corpo.text, 'Obrigado pela reunião, DV Protec!');
  assert.equal((await avisar('bia@a.com', { tipo: 'reuniao_status', evento_id: reuniao.id })).ignorado, true, 'repetido: ignorado');
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 1);
});

test('Processo comercial: move a reunião para a etapa que a empresa criou; etapa que sumiu dá erro claro', async () => {
  const reuniao = { id: crypto.randomUUID(), organizacao_id: A, titulo: 'Demo', empresa: 'DV', data: '2026-10-28', status: 'concluida', tipo: 'cliente', created_at: new Date().toISOString() };
  db.tables.agenda_eventos = [reuniao];
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'comercial', valor: { departamentos: [], pipelines: [{ id: 'vendas', nome: 'Vendas', etapas: [{ id: 'qualificacao', nome: 'Qualificação' }, { id: 'negociacao', nome: 'Negociação' }] }] } }];
  const def = (etapa) =>
    validarDefinicao({
      nos: [
        { id: 'g', tipo: 'gatilho_reuniao_status', config: { status: 'concluida' } },
        { id: 'p', tipo: 'comercial_etapa', config: { processo_id: 'vendas', processo_nome: 'Vendas', etapa_id: etapa, etapa_nome: etapa } },
      ],
      ligacoes: [{ de: 'g', para: 'p' }],
    });
  assert.deepEqual(problemasDoFluxo(def('negociacao')), []);
  assert.match(problemasDoFluxo(validarDefinicao({ nos: [{ id: 'g', tipo: 'gatilho_reuniao_status' }, { id: 'p', tipo: 'comercial_etapa' }], ligacoes: [{ de: 'g', para: 'p' }] })).join(), /processo/);

  db.tables.fluxos = [{ id: crypto.randomUUID(), organizacao_id: A, nome: 'Pós-demo', ativo: true, definicao: def('negociacao'), gatilhos: ['gatilho_reuniao_status'] }];
  const avisar = async () => ler(await disparar(await como('ana@a.com', '/api/fluxos/disparar', 'POST', { tipo: 'reuniao_status', evento_id: reuniao.id })));
  await avisar();
  assert.equal(reuniao.comercial_pipeline_id, 'vendas');
  assert.equal(reuniao.comercial_etapa_id, 'negociacao');
  assert.match(db.tables.fluxo_execucoes.at(-1).passos.at(-1).resultado, /Negociação em Vendas/);

  // Etapa apagada nas configurações: a execução registra o erro e não mexe na reunião
  reuniao.status = 'cancelada';
  db.tables.fluxos[0].definicao = def('etapa-apagada');
  db.tables.fluxos[0].definicao.nos[0].config.status = 'cancelada';
  await avisar();
  assert.equal(db.tables.fluxo_execucoes.at(-1).status, 'erro');
  assert.match(db.tables.fluxo_execucoes.at(-1).passos.at(-1).erro, /não existe mais/);
  assert.equal(reuniao.comercial_etapa_id, 'negociacao');

  // Simulado: "Agendar reunião" antes do bloco vira a reunião a mover
  const encadeado = validarDefinicao({
    nos: [
      { id: 'g', tipo: 'gatilho_mensagem' },
      { id: 'r', tipo: 'reuniao_criar', config: { titulo: 'Conversa com {{contato.nome}}' } },
      { id: 'p', tipo: 'comercial_etapa', config: { processo_id: 'vendas', processo_nome: 'Vendas', etapa_id: 'qualificacao', etapa_nome: 'Qualificação' } },
    ],
    ligacoes: [{ de: 'g', para: 'r' }, { de: 'r', para: 'p' }],
  });
  const r = await executarFluxo({ definicao: encadeado, evento: { tipo: 'mensagem_recebida', dados: { mensagem: { texto: 'oi' }, contato: { nome: 'Carla' }, conversa: { id: 'c' } } }, efeitos: efeitosSimulados() });
  assert.equal(r.status, 'ok');
  assert.match(r.passos.at(-1).resultado, /Qualificação em Vendas/);
});

test('Grupos: mensagem de um participante dispara o fluxo "só grupos" e a resposta vai no próprio grupo', async () => {
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'chat', valor: { grupos: 'aba' } }];
  db.tables.participantes_grupo = [];
  db.tables.fluxos = [{ id: crypto.randomUUID(), organizacao_id: A, nome: 'Grupo suporte', ativo: true, definicao: desenhoBoasVindas({ origem: 'grupo' }), gatilhos: ['gatilho_mensagem'] }];
  globalThis.fetch = async (url, op) => {
    enviados.push({ url: String(url), corpo: op?.body ? JSON.parse(op.body) : null });
    return new Response(JSON.stringify(String(url).includes('findGroupInfos') ? { subject: 'Suporte RM' } : { key: { id: `EVO-${enviados.length}`, remoteJid: '120363111@g.us' } }), { status: 200 });
  };
  const receber = (corpo) => receberWebhook(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify(corpo) }), { params: Promise.resolve({ id: canal.id }) });
  const doGrupo = (id, texto, extra = {}) => ({ event: 'messages.upsert', data: { key: { remoteJid: '120363111@g.us', fromMe: false, id, participant: '558598887777@s.whatsapp.net', ...extra }, pushName: 'Maria', message: { conversation: texto } } });

  assert.equal((await receber(doGrupo('G1', 'qual o preço do plano?'))).status, 200);
  const exec = db.tables.fluxo_execucoes;
  assert.equal(exec.length, 1, exec.map((e) => e.resumo).join(' | '));
  assert.equal(exec[0].status, 'ok');
  const envio = enviados.find((e) => e.url.includes('sendText'));
  assert.ok(envio, 'respondeu');
  assert.equal(envio.corpo.number, '120363111@g.us', 'a resposta vai no grupo');

  // A própria equipe escrevendo no grupo (número conectado) não dispara, mas fica registrado com o motivo
  db.tables.fluxo_execucoes = [];
  await receber(doGrupo('G2', 'qual o preço?', { fromMe: true }));
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 1);
  assert.equal(db.tables.fluxo_execucoes.length, 1);
  assert.equal(db.tables.fluxo_execucoes[0].status, 'ignorado');
  assert.match(db.tables.fluxo_execucoes[0].resumo, /próprio número do canal/);
  // A resposta que o próprio fluxo mandou (eco do envio) não vira registro
  const idDaResposta = db.tables.mensagens.find((m) => m.autor_email === 'fluxo@rmcontrole')?.id_externo;
  assert.ok(idDaResposta, 'a resposta do fluxo foi gravada');
  await receber(doGrupo(idDaResposta, 'Olá Maria, já te mando a tabela!', { fromMe: true }));
  assert.equal(db.tables.fluxo_execucoes.length, 1, 'eco da resposta do fluxo não registra');
});

test('Condição "tem a etiqueta": compara a etiqueta inteira do contato ou grupo, sem acento nem maiúscula', async () => {
  const { regraCasa } = await import('../src/lib/fluxos.js');
  const ctx = { contato: { etiquetas: ['Suporte RM', 'Cliente VIP'] } };
  assert.equal(regraCasa({ campo: 'contato.etiquetas', operador: 'tem_item', valor: 'suporte rm' }, ctx), true);
  assert.equal(regraCasa({ campo: 'contato.etiquetas', operador: 'tem_item', valor: 'Suporte' }, ctx), false, 'parte do nome não conta');
  assert.equal(regraCasa({ campo: 'contato.etiquetas', operador: 'nao_tem_item', valor: 'Financeiro' }, ctx), true);
  assert.equal(regraCasa({ campo: 'contato.etiquetas', operador: 'nao_tem_item', valor: 'cliente vip' }, ctx), false);
  assert.equal(regraCasa({ campo: 'contato.etiquetas', operador: 'tem_item', valor: 'Suporte RM' }, { contato: {} }), false, 'sem etiquetas');
  assert.equal(regraCasa({ campo: 'contato.etiquetas', operador: 'contem', valor: 'vip' }, ctx), true, 'contém olha o texto das etiquetas');
});

test('Pergunta: pergunta na conversa, espera, continua pela resposta (sem recomeçar o fluxo) e pelo prazo vencido', async () => {
  const { processarPerguntasVencidas } = await import('../src/lib/server/fluxos.js');
  const { escopo } = await import('../src/lib/server/organizacao.js');
  const g = { ...novoBloco('gatilho_mensagem', 0, 0), id: 'g1', config: { canais: [], origem: 'todas', filtro: 'qualquer', texto: '' } };
  const p = { ...novoBloco('pergunta', 300, 0), id: 'p1', config: { texto: 'Oi {{contato.nome}}, qual a sua dúvida?', variavel: 'duvida', minutos: 30 } };
  const c = { ...novoBloco('condicao', 600, 0), id: 'c1', config: { combinar: 'todas', regras: [{ campo: 'var.duvida', operador: 'contem', valor: 'boleto' }] } };
  const boleto = { ...novoBloco('enviar_mensagem', 900, 0), id: 'm1', config: { destino: 'conversa', texto: 'Segue o boleto, {{contato.nome}}.' } };
  const outra = { ...novoBloco('enviar_mensagem', 900, 200), id: 'm2', config: { destino: 'conversa', texto: 'Vou chamar alguém da equipe.' } };
  const semResposta = { ...novoBloco('enviar_mensagem', 600, 300), id: 'm3', config: { destino: 'conversa', texto: 'Como ninguém respondeu, encerro por aqui.' } };
  const definicao = {
    versao: 1,
    nos: [g, p, c, boleto, outra, semResposta],
    ligacoes: [
      { id: 'l1', de: 'g1', saida: 'proximo', para: 'p1' },
      { id: 'l2', de: 'p1', saida: 'respondeu', para: 'c1' },
      { id: 'l3', de: 'c1', saida: 'sim', para: 'm1' },
      { id: 'l4', de: 'c1', saida: 'nao', para: 'm2' },
      { id: 'l5', de: 'p1', saida: 'sem_resposta', para: 'm3' },
    ],
  };
  db.tables.fluxos = [{ id: crypto.randomUUID(), organizacao_id: A, nome: 'Triagem', ativo: true, definicao, gatilhos: ['gatilho_mensagem'] }];
  const aviso = (id, texto) => ({ event: 'messages.upsert', data: { key: { remoteJid: '5585999990000@s.whatsapp.net', fromMe: false, id }, pushName: 'Carla', message: { conversation: texto } } });
  const receber = (corpo) => receberWebhook(new NextRequest(`http://localhost/api/canais/webhook/${canal.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rm-token': 't' }, body: JSON.stringify(corpo) }), { params: Promise.resolve({ id: canal.id }) });
  const textos = () => enviados.filter((e) => e.url.includes('sendText')).map((e) => e.corpo.text);

  await receber(aviso('Q1', 'olá'));
  assert.deepEqual(textos(), ['Oi Carla, qual a sua dúvida?']);
  assert.equal(db.tables.fluxo_esperas.length, 1, 'ficou esperando a resposta');
  assert.equal(db.tables.fluxo_esperas[0].organizacao_id, A);
  assert.equal(db.tables.fluxo_esperas[0].variavel, 'duvida');

  // A resposta continua o fluxo pela saída "Respondeu" e não começa outra pergunta
  await receber(aviso('Q2', 'preciso da segunda via do boleto'));
  assert.deepEqual(textos(), ['Oi Carla, qual a sua dúvida?', 'Segue o boleto, Carla.']);
  assert.equal(db.tables.fluxo_esperas.length, 0);
  assert.ok(db.tables.fluxo_execucoes.some((e) => e.gatilho === 'pergunta_respondida' && e.status === 'ok'));

  // Nova conversa com o fluxo: pergunta de novo; ninguém responde e o prazo vence
  await receber(aviso('Q3', 'oi de novo'));
  assert.equal(textos().length, 3);
  db.tables.fluxo_esperas[0].expira_em = new Date(Date.now() - 1000).toISOString();
  assert.equal(await processarPerguntasVencidas(escopo(mockSupabase, A), { forcar: true }), 1);
  assert.equal(textos().at(-1), 'Como ninguém respondeu, encerro por aqui.');
  assert.equal(db.tables.fluxo_esperas.length, 0);
  assert.ok(db.tables.fluxo_execucoes.some((e) => e.gatilho === 'pergunta_sem_resposta'));
});

test('Demandas: criada, em andamento, fechada (o servidor confere no banco) e SLA a cada minuto, uma vez por demanda', async () => {
  const agora = Date.now();
  const chamado = { id: crypto.randomUUID(), organizacao_id: A, empresa_nome: 'Polysite', status: 'aguardando_visualizacao', categorias: ['Suporte'], motivo: 'Suporte', observacao_inicial: 'Impressora parada', colaborador_solicitante: 'Felipe', tecnico_email: 'geral', created_at: new Date(agora - 45 * 60000).toISOString(), iniciado_em: null };
  const velho = { ...chamado, id: crypto.randomUUID(), created_at: new Date(agora - 30 * 3600000).toISOString() };
  const outroDepto = { ...chamado, id: crypto.randomUUID(), categorias: ['Financeiro'], motivo: 'Financeiro' };
  db.tables.suporte_chamados = [chamado, velho, outroDepto];
  const aviso = (texto) => ({ tipo: 'enviar_mensagem', config: { destino: 'numero', telefone: '5585911112222', texto } });
  const def = validarDefinicao({
    nos: [
      { id: 'g1', tipo: 'gatilho_demanda_criada', config: { departamento: 'Suporte' } },
      { id: 'm1', ...aviso('Nova de {{demanda.empresa}}: {{demanda.relato}}') },
      { id: 'g2', tipo: 'gatilho_demanda_sla', config: { em: 'aguardando', minutos: 30, departamento: 'Suporte' } },
      { id: 'm2', ...aviso('Parada há {{demanda.minutos}} min: {{demanda.empresa}}') },
      { id: 'g3', tipo: 'gatilho_demanda_fechada', config: { resultado: 'cancelada' } },
      { id: 'm3', ...aviso('Cancelada: {{demanda.empresa}}') },
    ],
    ligacoes: [{ de: 'g1', para: 'm1' }, { de: 'g2', para: 'm2' }, { de: 'g3', para: 'm3' }],
  });
  db.tables.fluxos = [{ id: crypto.randomUUID(), organizacao_id: A, nome: 'Avisos de demanda', ativo: true, definicao: def, gatilhos: gatilhosDe(def) }];
  const textos = () => enviados.filter((e) => e.url.includes('sendText')).map((e) => e.corpo.text);
  const avisar = async (email, corpo) => ler(await disparar(await como(email, '/api/fluxos/disparar', 'POST', corpo)));

  // dados da demanda
  const d = dadosDaDemanda(chamado, { agora }).demanda;
  assert.deepEqual([d.estado, d.minutos, d.departamento, d.responsavel], ['aguardando', 45, 'Suporte', '']);

  // criada: confere no banco e respeita o departamento do gatilho
  assert.equal((await avisar('caio@b.com', { tipo: 'demanda_criada', chamado_id: chamado.id })).status, 404, 'demanda de outra empresa');
  assert.equal((await avisar('bia@a.com', { tipo: 'demanda_criada', chamado_id: outroDepto.id })).ok, true);
  assert.deepEqual(textos(), [], 'outro departamento não dispara');
  assert.equal((await avisar('bia@a.com', { tipo: 'demanda_criada', chamado_id: chamado.id })).ok, true);
  assert.deepEqual(textos(), ['Nova de Polysite: Impressora parada']);
  // aviso de "em andamento" para demanda que não está em andamento não faz nada
  await avisar('bia@a.com', { tipo: 'demanda_andamento', chamado_id: chamado.id });
  assert.equal(textos().length, 1);

  // SLA: dispara só a demanda que passou de 30 min no departamento certo (a antiga demais e a de outro departamento ficam de fora), uma vez
  assert.equal((await verificarSlaDemandas(mockSupabase)).disparos, 1);
  assert.match(textos()[1], /^Parada há 45 min: Polysite$/);
  assert.equal((await verificarSlaDemandas(mockSupabase)).disparos, 0, 'não repete a cada minuto');

  // fechada: só cancelada (o gatilho pede isso) e só se o banco confirma
  chamado.status = 'finalizado';
  await avisar('bia@a.com', { tipo: 'demanda_fechada', chamado_id: chamado.id });
  assert.equal(textos().length, 2, 'concluída não casa com “só canceladas”');
  chamado.status = 'cancelado';
  await avisar('ana@a.com', { tipo: 'demanda_fechada', chamado_id: chamado.id });
  assert.equal(textos().at(-1), 'Cancelada: Polysite');
});

test('Demandas criadas de uma conversa de grupo: responde no grupo, avisa o solicitante e o grupo da empresa', async () => {
  const empresaId = crypto.randomUUID();
  const grupo = { id: crypto.randomUUID(), organizacao_id: A, nome: 'RM | Polysite', telefone: '120363000000@g.us', empresa_id: empresaId };
  const conversa = { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: grupo.id, status: 'aberta', responsavel_email: null, departamento: '', ultima_mensagem_em: new Date().toISOString() };
  db.tables.contatos = [grupo];
  db.tables.conversas = [conversa];
  db.tables.empresa_colaboradores = [{ id: crypto.randomUUID(), organizacao_id: A, empresa_id: empresaId, nome: 'Felipe Souza', telefone: '5585977776666' }];
  const chamado = { id: crypto.randomUUID(), organizacao_id: A, empresa_id: empresaId, empresa_nome: 'Polysite', status: 'aguardando_visualizacao', categorias: ['Suporte'], observacao_inicial: 'Sem internet', colaborador_solicitante: 'Felipe Souza', tecnico_email: 'geral', created_at: new Date().toISOString(), chat_conversa_id: conversa.id };
  const deSistema = { ...chamado, id: crypto.randomUUID(), chat_conversa_id: null };
  db.tables.suporte_chamados = [chamado, deSistema];
  const msg = (destino, texto) => ({ tipo: 'enviar_mensagem', config: { destino, texto, telefone: '' } });
  const def = validarDefinicao({
    nos: [
      { id: 'g', tipo: 'gatilho_demanda_criada', config: { origem: 'grupo' } },
      { id: 'a', ...msg('conversa', 'Recebemos, {{contato.nome}}: {{demanda.relato}}') },
      { id: 'b', ...msg('solicitante', 'Oi {{demanda.solicitante}}, abrimos sua demanda') },
      { id: 'c', ...msg('grupo_empresa', 'Demanda aberta para {{demanda.empresa}}') },
    ],
    ligacoes: [{ de: 'g', para: 'a' }, { de: 'a', para: 'b' }, { de: 'b', para: 'c' }],
  });
  db.tables.fluxos = [{ id: crypto.randomUUID(), organizacao_id: A, nome: 'Boas-vindas', ativo: true, definicao: def, gatilhos: gatilhosDe(def) }];
  const avisar = async (corpo) => ler(await disparar(await como('bia@a.com', '/api/fluxos/disparar', 'POST', corpo)));

  // Criada na tela de demandas: o gatilho “de um grupo” não dispara
  await avisar({ tipo: 'demanda_criada', chamado_id: deSistema.id });
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 0);
  // Criada de uma conversa de grupo: responde no grupo, avisa o solicitante e o grupo da empresa
  await avisar({ tipo: 'demanda_criada', chamado_id: chamado.id });
  const textos = enviados.filter((e) => e.url.includes('sendText')).map((e) => [e.corpo.number, e.corpo.text]);
  assert.deepEqual(textos, [
    ['120363000000@g.us', 'Recebemos, RM | Polysite: Sem internet'],
    ['5585977776666', 'Oi Felipe Souza, abrimos sua demanda'],
    ['120363000000@g.us', 'Demanda aberta para Polysite'],
  ]);
});

test('Entrada na empresa: não conseguiu acessar manda o pedido pronto no grupo ligado à empresa (ou diz que não há grupo)', async () => {
  const empresaId = crypto.randomUUID();
  const grupo = { id: crypto.randomUUID(), organizacao_id: A, nome: 'RM | Polysite', telefone: '120363111@g.us', empresa_id: empresaId };
  const conversa = { id: crypto.randomUUID(), organizacao_id: A, canal_id: canal.id, contato_id: grupo.id, status: 'aberta', responsavel_email: null, departamento: '', ultima_mensagem_em: new Date().toISOString(), criado_em: new Date().toISOString() };
  db.tables.contatos = [grupo];
  db.tables.conversas = [conversa];
  db.tables.auditoria_logs = [];
  const url = `/api/chat/pedir-acesso?empresa_id=${empresaId}&chamado_id=`;

  const antes = await ler(await destinoPedido(await como('bia@a.com', url)));
  assert.deepEqual([antes.destino.nome, antes.destino.grupo], ['RM | Polysite', true]);
  const r = await ler(await pedirAcesso(await como('bia@a.com', '/api/chat/pedir-acesso', 'POST', { empresa_id: empresaId })));
  assert.equal(r.ok, true);
  const envio = enviados.find((e) => e.url.includes('sendText'));
  assert.equal(envio.corpo.number, '120363111@g.us');
  assert.ok(envio.corpo.text.includes(MENSAGEM_PEDIR_ACESSO), 'a mensagem pronta vai inteira');
  assert.equal(db.tables.auditoria_logs.at(-1).acao, 'pediu_acesso_cliente');

  // Empresa sem grupo ligado (e demanda sem conversa): nada é enviado
  const outra = crypto.randomUUID();
  assert.equal((await ler(await destinoPedido(await como('bia@a.com', `/api/chat/pedir-acesso?empresa_id=${outra}&chamado_id=`)))).destino, null);
  const sem = await ler(await pedirAcesso(await como('bia@a.com', '/api/chat/pedir-acesso', 'POST', { empresa_id: outra })));
  assert.equal(sem.status, 404);
  assert.equal(enviados.filter((e) => e.url.includes('sendText')).length, 1);
});
