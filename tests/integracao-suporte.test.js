// Testes da API de Suporte Automático e da correção dos alertas sonoros.
// Executar: node --import ./tests/mocks/setup.js --test tests/integracao-suporte.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { calcularSimilaridade, buscarEmpresaSemelhante } from '../src/lib/empresaMatcher.js';
import { __definirSupabaseAdmin, CONFIG_CHAVE } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { POST as buscar } from '../src/app/api/integracoes/suporte/empresas/buscar/route.js';
import { POST as criarChamado } from '../src/app/api/integracoes/suporte/chamados/route.js';
import { GET as lerConfig, PUT as salvarConfig, POST as acaoConfig } from '../src/app/api/integracoes/suporte/config/route.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

const EMPRESAS = [
  { id: 'e1', nome: 'Rocha e Vargas', ativo: true },
  { id: 'e2', nome: 'Transportes Silva', ativo: true },
  { id: 'e3', nome: 'Padaria Pão Quente', ativo: true },
  { id: 'e4', nome: 'Empresa Desativada', ativo: false },
];

let TOKEN = '';

async function req(url, { method = 'POST', body, token = TOKEN, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  return new NextRequest(`http://localhost${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// O papel vem do servidor (lista de proprietários / Equipe & Senhas), não do cookie
const EMAIL_POR_PAPEL = { administrador: 'lucas@rmchat.com', suporte: 'maria@rmchat.com' };
async function cookieDe(role) {
  return `${SESSION_COOKIE_NAME}=${await createSessionToken({ email: EMAIL_POR_PAPEL[role], role })}`;
}

beforeEach(async () => {
  db.reset();
  db.tables.empresas = EMPRESAS.map((e) => ({ ...e }));
  db.tables.equipe_usuarios = [{ email: 'maria@rmchat.com', papel: 'suporte', ativo: true }];
  const admin = await cookieDe('administrador');
  const r = await acaoConfig(await req('/api/integracoes/suporte/config', { body: { acao: 'gerar_token' }, token: null, cookie: admin }));
  TOKEN = (await r.json()).token;
  await salvarConfig(await req('/api/integracoes/suporte/config', { method: 'PUT', body: { ativo: true }, token: null, cookie: admin }));
});

// ---------------------------------------------------------------- correspondência
test('correspondência: palavra-chave parcial encontra o nome completo', () => {
  const s = calcularSimilaridade('Vargas', 'Rocha e Vargas');
  assert.ok(s >= 60 && s < 90, `esperado entre 60 e 90, veio ${s}`);
  assert.equal(calcularSimilaridade('rocha & vargas', 'Rocha e Vargas'), 100);
  assert.ok(calcularSimilaridade('Rocha Varga', 'Rocha e Vargas') >= 90, 'tolera erro de digitação');
  assert.ok(calcularSimilaridade('Clínica Odonto', 'Padaria Pão Quente') < 60);
});

test('correspondência: duas empresas igualmente prováveis exigem confirmação', () => {
  const r = buscarEmpresaSemelhante('Vargas', [
    { id: '1', nome: 'Vargas Transportes' },
    { id: '2', nome: 'Vargas Logística' },
  ], { limiarAutomatico: 70 });
  assert.equal(r.decisao, 'confirmar');
  assert.equal(r.sugestoes.length, 2);
});

// ---------------------------------------------------------------- autenticação
test('API recusa sem token, com token errado e com integração desativada', async () => {
  assert.equal((await buscar(await req('/x', { body: { nome: 'Vargas' }, token: null }))).status, 401);
  assert.equal((await buscar(await req('/x', { body: { nome: 'Vargas' }, token: 'rmc_errado' }))).status, 401);
  db.tables.sistema_config[0].valor.ativo = false;
  assert.equal((await buscar(await req('/x', { body: { nome: 'Vargas' } }))).status, 403);
});

test('configuração exige administrador e nunca expõe o hash do token', async () => {
  assert.equal((await lerConfig(await req('/c', { method: 'GET', token: null }))).status, 401);
  assert.equal((await lerConfig(await req('/c', { method: 'GET', token: null, cookie: await cookieDe('suporte') }))).status, 403);
  const r = await lerConfig(await req('/c', { method: 'GET', token: null, cookie: await cookieDe('administrador') }));
  const { config } = await r.json();
  assert.equal(config.token_configurado, true);
  assert.equal(config.token_hash, undefined);
  assert.ok(!JSON.stringify(db.tables.sistema_config).includes(TOKEN), 'token não é armazenado em texto');
});

test('limites inválidos são recusados', async () => {
  const r = await salvarConfig(await req('/c', {
    method: 'PUT', token: null, cookie: await cookieDe('administrador'),
    body: { limiar_sugestao: 80, limiar_automatico: 70 },
  }));
  assert.equal(r.status, 400);
});

// ---------------------------------------------------------------- fluxo completo
test('buscar: nome parcial devolve sugestões para o cliente confirmar', async () => {
  const r = await buscar(await req('/x', { body: { nome: 'Vargas' } }));
  const json = await r.json();
  assert.equal(json.decisao, 'confirmar');
  assert.equal(json.sugestoes[0].nome, 'Rocha e Vargas');
});

test('buscar: empresas desativadas não são sugeridas', async () => {
  const json = await (await buscar(await req('/x', { body: { nome: 'Empresa Desativada' } }))).json();
  assert.equal(json.decisao, 'nao_encontrado');
});

test('chamado com empresa_id confirmada entra pendente na Fila Geral com descrição e solicitante', async () => {
  const r = await criarChamado(await req('/x', {
    body: { empresa_id: 'e1', descricao: 'Instância desconectou', solicitante_nome: 'Maria Souza', origem: 'WhatsApp' },
  }));
  assert.equal(r.status, 201);
  const [ch] = db.tables.suporte_chamados;
  assert.equal(ch.empresa_nome, 'Rocha e Vargas');
  assert.equal(ch.status, 'aguardando_visualizacao');
  assert.equal(ch.observacoes, 'Instância desconectou');
  assert.equal(ch.colaborador_solicitante, 'Maria Souza');
  assert.equal(ch.tecnico_email, 'geral');
  assert.equal(db.tables.auditoria_logs.length, 1);
});

test('chamado com nome exato é criado direto; nome ambíguo não cria e devolve sugestões', async () => {
  const direto = await criarChamado(await req('/x', {
    body: { empresa_nome: 'transportes silva', descricao: 'Dúvida no fluxo', solicitante_nome: 'João' },
  }));
  assert.equal(direto.status, 201);

  const parcial = await (await criarChamado(await req('/x', {
    body: { empresa_nome: 'Vargas', descricao: 'Outra coisa', solicitante_nome: 'Ana' },
  }))).json();
  assert.equal(parcial.criado, false);
  assert.equal(parcial.decisao, 'confirmar');
  assert.equal(db.tables.suporte_chamados.length, 1);
});

test('empresa não encontrada: rejeita por padrão, cria se configurado', async () => {
  const body = { empresa_nome: 'Empresa Inexistente XPTO', descricao: 'Ajuda', solicitante_nome: 'Carlos' };
  const rejeitado = await (await criarChamado(await req('/x', { body }))).json();
  assert.equal(rejeitado.decisao, 'nao_encontrado');
  assert.equal(db.tables.suporte_chamados.length, 0);

  db.tables.sistema_config[0].valor.quando_nao_encontrar = 'criar_com_nome_informado';
  const criado = await criarChamado(await req('/x', { body }));
  assert.equal(criado.status, 201);
  assert.equal(db.tables.suporte_chamados[0].empresa_nome, 'Empresa Inexistente XPTO');
});

test('reenvio idêntico não duplica a demanda', async () => {
  const body = { empresa_id: 'e2', descricao: 'Mesmo pedido', solicitante_nome: 'João' };
  await criarChamado(await req('/x', { body }));
  const segunda = await (await criarChamado(await req('/x', { body }))).json();
  assert.equal(segunda.duplicado, true);
  assert.equal(db.tables.suporte_chamados.length, 1);
});

test('campos obrigatórios ausentes retornam 400 com mensagem clara', async () => {
  const r = await criarChamado(await req('/x', { body: { empresa_id: 'e1', solicitante_nome: 'X' } }));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).erro, 'descricao_obrigatoria');
});

test('schema sem colunas estendidas: cria com as colunas base', async () => {
  db.columns.suporte_chamados = [
    'empresa_id', 'empresa_nome', 'tecnico_email', 'atendente', 'colaborador_solicitante',
    'status', 'observacoes', 'motivo', 'iniciado_em',
  ];
  const r = await criarChamado(await req('/x', { body: { empresa_id: 'e3', descricao: 'Pedido', solicitante_nome: 'Bia' } }));
  assert.equal(r.status, 201);
});

// ---------------------------------------------------------------- alerta sonoro
test('alerta sonoro: demanda da Fila Geral criada por outro colaborador toca e respeita repetição/escopo', async () => {
  let tons = 0;
  // O módulo de áudio guarda o AudioContext em cache: o contador é global para valer entre testes
  globalThis.__contarTom = () => tons++;
  globalThis.window.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { globalThis.__contarTom?.(); return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createBiquadFilter() { return { type: '', frequency: { setValueAtTime() {} }, Q: { setValueAtTime() {} }, connect() {} }; }
  };
  const { triggerSupportNotification, setAudioConfig, stopSupportNotificationLoop } = await import('../src/lib/audioNotifications.js');

  // Linha como chega da nuvem após a correção: técnico 'geral', criada pela Maria
  const chamado = { id: 'c1', tecnico_email: 'geral', is_fila_geral: true, atribuido_por_email: 'maria@rmcontrole.com', categorias: ['Suporte'] };

  setAudioConfig({ habilitado: true, escopo: 'selecionados', departamentosSelecionados: ['Suporte'], modoRepeticao: 'uma_vez', tipoSom: 'harmonico' });
  triggerSupportNotification({ chamado, userEmail: 'joao@rmcontrole.com' });
  assert.ok(tons > 0, 'deve tocar para o colega');

  tons = 0;
  setAudioConfig({ escopo: 'atribuidos' });
  triggerSupportNotification({ chamado, userEmail: 'joao@rmcontrole.com' });
  assert.equal(tons, 0, 'escopo "apenas atribuídas a mim" silencia a Fila Geral');

  tons = 0;
  setAudioConfig({ escopo: 'selecionados', departamentosSelecionados: ['Financeiro'] });
  triggerSupportNotification({ chamado, userEmail: 'joao@rmcontrole.com' });
  assert.equal(tons, 0, 'departamento não monitorado não toca');

  tons = 0;
  setAudioConfig({ escopo: 'selecionados', departamentosSelecionados: ['Suporte'] });
  triggerSupportNotification({ chamado, userEmail: 'maria@rmcontrole.com' });
  assert.equal(tons, 0, 'não toca para quem criou');
  stopSupportNotificationLoop();
});

test('alerta sonoro: repetição para quando a demanda não está (ou deixa de estar) na fila exibida', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  let tons = 0;
  // O módulo de áudio guarda o AudioContext em cache: o contador é global para valer entre testes
  globalThis.__contarTom = () => tons++;
  globalThis.window.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { globalThis.__contarTom?.(); return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createBiquadFilter() { return { type: '', frequency: { setValueAtTime() {} }, Q: { setValueAtTime() {} }, connect() {} }; }
  };
  const audio = await import('../src/lib/audioNotifications.js');
  const chamado = { id: 'fantasma', status: 'aguardando_visualizacao', tecnico_email: 'geral', is_fila_geral: true, atribuido_por_email: 'maria@rmcontrole.com', categorias: ['Suporte'] };
  audio.setAudioConfig({ habilitado: true, escopo: 'selecionados', departamentosSelecionados: ['Suporte'], modoRepeticao: 'intermitente', tipoSom: 'harmonico' });

  // 1. Demanda fantasma: tocou uma vez, mas não está na fila exibida → a repetição para
  let filaExibida = [];
  audio.registrarFonteChamadosAtivos(() => filaExibida);
  audio.triggerSupportNotification({ chamado, userEmail: 'joao@rmcontrole.com' });
  const aposPrimeiroToque = tons;
  assert.ok(aposPrimeiroToque > 0);
  t.mock.timers.tick(1100 * 5);
  assert.equal(tons, aposPrimeiroToque, 'não repete para demanda que não aparece na fila');

  // 2. Demanda real: repete enquanto pendente e para quando alguém assume
  filaExibida = [chamado];
  audio.triggerSupportNotification({ chamado, userEmail: 'joao@rmcontrole.com' });
  t.mock.timers.tick(1100 * 3);
  const durantePendencia = tons;
  assert.ok(durantePendencia > aposPrimeiroToque * 2, 'repete enquanto pendente');
  filaExibida = [{ ...chamado, status: 'em_andamento' }];
  t.mock.timers.tick(1100 * 5);
  assert.equal(tons, durantePendencia, 'para quando a demanda é assumida');

  // 3. Mesmo pendente para sempre, a repetição para sozinha depois de 10 minutos
  filaExibida = [chamado];
  audio.triggerSupportNotification({ chamado, userEmail: 'joao@rmcontrole.com' });
  t.mock.timers.tick(11 * 60 * 1000);
  const aposLimite = tons;
  t.mock.timers.tick(1100 * 5);
  assert.equal(tons, aposLimite, 'não toca indefinidamente');
  audio.stopSupportNotificationLoop();
});
