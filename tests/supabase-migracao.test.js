// Testes da migração para o Supabase: dados compartilhados, legado local, equipe, login e proteções.
// Executar: node --import ./tests/mocks/setup.js --test tests/supabase-migracao.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { __definirSupabaseAnon, verificarCredenciais } from '../src/lib/server/acesso.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import * as rotaConfig from '../src/app/api/configuracoes/route.js';
import * as rotaEquipe from '../src/app/api/equipe/route.js';
import { POST as rotaLogin } from '../src/app/api/auth/login/route.js';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';
__definirSupabaseAdmin(mockSupabase);
__definirSupabaseAnon({
  auth: {
    async signInWithPassword({ email, password }) {
      const u = db.authUsers.find((x) => x.email === email && x.password === password);
      return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'Invalid login credentials' } };
    },
    async signOut() {
      return { error: null };
    },
  },
});

const storage = await import('../src/lib/storage.js');
const ADMIN = 'lucas@rmchat.com';

// ---------------------------------------------------------------- "navegador" falando com as rotas reais
let usuarioLogado = ADMIN;
let respostaCloudflare = { success: true };
globalThis.window.location = { origin: 'http://localhost' };
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('challenges.cloudflare.com')) return { json: async () => respostaCloudflare };
  const rotas = { '/api/configuracoes': rotaConfig, '/api/equipe': rotaEquipe };
  const rota = rotas[String(url).split('?')[0]];
  const headers = { 'Content-Type': 'application/json' };
  if (usuarioLogado) headers.Cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken({ email: usuarioLogado, role: 'suporte' })}`;
  const metodo = (opts.method || 'GET').toUpperCase();
  return rota[metodo](new NextRequest(`http://localhost${url}`, { method: metodo, headers, body: opts.body }));
};

const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const trocarDeNavegador = () => {
  localStorage.clear();
  globalThis.sessionStorage?.clear?.();
};

function funcoesDoBanco() {
  db.segredos = {};
  // Simula pgcrypto/Vault: o valor guardado nunca é o texto puro
  db.rpcs.rm_gravar_segredo = ({ p_chave, p_valor }) => { db.segredos[p_chave] = Buffer.from(`cifrado:${p_valor}`).toString('base64'); };
  db.rpcs.rm_ler_segredo = ({ p_chave }) => (db.segredos[p_chave] ? Buffer.from(db.segredos[p_chave], 'base64').toString().replace('cifrado:', '') : null);
  db.limites = {};
  db.rpcs.rm_consumir_limite = ({ p_chave, p_max }) => (db.limites[p_chave] = (db.limites[p_chave] || 0) + 1) <= p_max;
  db.rpcs.rm_verificar_senha_equipe = ({ p_email, p_senha }) =>
    db.tables.equipe_usuarios.some((u) => u.email === p_email && u.senha === `$2b$10$${p_senha}`);
  db.rpcs.rm_credenciais_empresas = ({ p_empresa_id }) =>
    db.tables.empresa_credenciais
      .filter((c) => !p_empresa_id || c.empresa_id === p_empresa_id)
      .map(({ senha_cifrada, ...c }) => ({ ...c, senha_suporte: senha_cifrada ? senha_cifrada.replace('aes:', '') : null }));
}

beforeEach(() => {
  db.reset();
  trocarDeNavegador();
  funcoesDoBanco();
  usuarioLogado = ADMIN;
  respostaCloudflare = { success: true };
  delete process.env.TURNSTILE_SECRET_KEY;
  db.tables.equipe_usuarios = [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'maria@rmchat.com', nome: 'Maria', papel: 'suporte', ativo: true, senha: '$2b$10$maria-segura' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', email: 'carla@rmchat.com', nome: 'Carla', papel: 'vendas', ativo: true, senha: '$2b$10$carla-segura' },
  ];
});

// ---------------------------------------------------------------- configurações globais
test('departamentos salvos pelo administrador valem para toda a equipe', async () => {
  const avisos = [];
  globalThis.window.addEventListener('rm_sync_erro', (e) => avisos.push(e.detail));
  storage.setDepartamentos(['Suporte', 'Financeiro', 'Jurídico']);
  await esperar(30);
  assert.deepEqual(avisos, []);
  assert.deepEqual(db.tables.sistema_config.find((c) => c.chave === 'departamentos').valor, ['Suporte', 'Financeiro', 'Jurídico']);

  trocarDeNavegador();
  usuarioLogado = 'maria@rmchat.com';
  await storage.sincronizarConfiguracoesGlobais();
  assert.ok(storage.getDepartamentos().includes('Jurídico'));
});

test('suporte não altera departamentos: a mudança é desfeita na tela e o erro é avisado', async () => {
  usuarioLogado = 'maria@rmchat.com';
  const avisos = [];
  globalThis.window.addEventListener('rm_sync_erro', (e) => avisos.push(e.detail));
  const antes = storage.getDepartamentos();
  storage.setDepartamentos(['Só Eu']);
  await esperar();
  assert.deepEqual(storage.getDepartamentos(), antes);
  assert.match(avisos.at(-1), /não pode alterar/);
});

test('senha padrão: guardada cifrada, nunca em texto puro no navegador, e invisível para vendas', async () => {
  storage.setSenhaPadraoRedefinicao('NovaSenha#2026');
  await esperar();
  assert.ok(db.segredos.senha_padrao && !db.segredos.senha_padrao.includes('NovaSenha'));
  assert.equal(localStorage.getItem('rm_senha_padrao_redefinicao'), null);
  assert.equal(JSON.stringify(db.tables.sistema_config).includes('NovaSenha'), false);

  usuarioLogado = 'carla@rmchat.com';
  const { config } = await (await fetch('/api/configuracoes')).json();
  assert.equal(config.senha_padrao, undefined);
});

test('primeira sincronização envia ao Supabase o que só existia neste navegador', async () => {
  localStorage.setItem('rm_categorias_demandas', JSON.stringify(['Suporte', 'Departamento Antigo']));
  localStorage.setItem('rm_senha_padrao_redefinicao', 'SenhaAntiga#123');
  await storage.sincronizarConfiguracoesGlobais();
  assert.deepEqual(db.tables.sistema_config.find((c) => c.chave === 'departamentos').valor, ['Suporte', 'Departamento Antigo']);
  assert.ok(db.segredos.senha_padrao);
  assert.equal(localStorage.getItem('rm_senha_padrao_redefinicao'), null, 'texto puro removido do navegador');
});

// ---------------------------------------------------------------- detalhes do servidor
const EMPRESA = 'bbbbbbbb-0000-4000-8000-000000000001';

test('detalhes do servidor da empresa são compartilhados e o legado local é migrado', async () => {
  localStorage.setItem(`rm_servidor_empresa_${EMPRESA}`, JSON.stringify({ ip_personalizado: '10.0.0.5', porta_ssh: '22', checklist_implementacao: [{ id: 'c1', titulo: 'DNS', concluido: true }] }));
  await storage.fetchEmpresaServidorDetalhes(EMPRESA);
  assert.equal(db.tables.empresa_servidor[0].ip_personalizado, '10.0.0.5');

  await storage.updateEmpresaServidorDetalhes(EMPRESA, { porta_ssh: '2200' }, ADMIN);
  trocarDeNavegador();
  const visto = await storage.fetchEmpresaServidorDetalhes(EMPRESA);
  assert.equal(visto.porta_ssh, '2200');
  assert.equal(visto.checklist_implementacao[0].titulo, 'DNS');
});

test('detalhes do servidor recusados pelo banco são desfeitos e geram erro', async () => {
  db.columns.empresa_servidor = ['empresa_id']; // força erro de gravação
  await assert.rejects(() => storage.updateEmpresaServidorDetalhes(EMPRESA, { ip_personalizado: 'x' }, ADMIN));
  assert.notEqual(storage.getEmpresaServidorDetalhes(EMPRESA).ip_personalizado, 'x');
});

// ---------------------------------------------------------------- colaboradores
test('colaboradores ficam no Supabase e não somem quando a lista de empresas recarrega', async () => {
  await storage.addColaboradorEmpresa(EMPRESA, { nome: 'João Contato' }, ADMIN);
  localStorage.setItem('rm_empresas_reais', JSON.stringify([{ id: EMPRESA, nome: 'X' }])); // recarga do banco
  assert.equal(storage.getColaboradoresEmpresa(EMPRESA)[0].nome, 'João Contato');
  trocarDeNavegador();
  await storage.fetchColaboradoresEmpresas();
  assert.equal(storage.getColaboradoresEmpresa(EMPRESA)[0].nome, 'João Contato');
});

test('colaboradores antigos guardados dentro da empresa são migrados', async () => {
  localStorage.setItem('rm_empresas_reais', JSON.stringify([{ id: EMPRESA, nome: 'X', colaboradores: [{ id: 'colab_1', nome: 'Ana Antiga' }] }]));
  await storage.fetchColaboradoresEmpresas();
  assert.equal(db.tables.empresa_colaboradores[0].nome, 'Ana Antiga');
});

// ---------------------------------------------------------------- catálogos
test('motivo novo ganha ID oficial; motivos antigos locais são migrados', async () => {
  const m = storage.addMotivoSuporte({ nome: 'Integração Webhook' });
  await esperar();
  assert.ok(storage.getMotivosSuporte().some((x) => x.nome === 'Integração Webhook' && x.id !== m.id));
  trocarDeNavegador();
  localStorage.setItem('rm_motivos_suporte', JSON.stringify([{ id: 'mot_9', nome: 'Motivo Só Local' }]));
  await storage.fetchMotivosSuporte();
  assert.ok(db.tables.suporte_motivos.some((x) => x.nome === 'Motivo Só Local'));
  assert.ok(storage.getMotivosSuporte().some((x) => x.nome === 'Integração Webhook'));
});

test('modelo de checklist de servidores é compartilhado', async () => {
  storage.addServerChecklistTemplateItem({ titulo: 'Backup diário' });
  await esperar();
  trocarDeNavegador();
  await storage.fetchServerChecklistTemplate();
  assert.equal(storage.getServerChecklistTemplate()[0].titulo, 'Backup diário');
});

test('base de soluções: salva para a equipe e migra as soluções locais', async () => {
  await storage.addSolucaoSuporte({ titulo: 'Reconectar QR', solucao_passos: 'Passo 1', userEmail: ADMIN });
  localStorage.setItem('rm_solucoes_suporte', JSON.stringify([{ id: 'sol_usr_1', is_user_created: true, titulo: 'Antiga', solucao_passos: 'Faz X' }]));
  await storage.fetchSolucoesSuporte();
  assert.deepEqual(db.tables.solucoes_suporte.map((x) => x.titulo).sort(), ['Antiga', 'Reconectar QR']);
});

test('agenda: eventos da equipe vão para o Supabase; os importados do Google pessoal ficam locais', async () => {
  await storage.addAgendaEvento({ titulo: 'Reunião cliente', data: '2026-10-20', responsavel_email: ADMIN });
  const lista = storage.getAgendaEventos();
  storage.saveAgendaEventos([...lista, { id: 'g1', origem: 'google_calendar', titulo: 'Dentista', data: '2026-10-21' }]);
  await storage.fetchAgendaEventos();
  assert.equal(db.tables.agenda_eventos.length, 1);
  assert.ok(storage.getAgendaEventos().some((e) => e.titulo === 'Dentista'), 'evento pessoal preservado localmente');
  trocarDeNavegador();
  await storage.fetchAgendaEventos();
  assert.deepEqual(storage.getAgendaEventos().map((e) => e.titulo), ['Reunião cliente']);
});

// ---------------------------------------------------------------- equipe e senhas
test('equipe: o administrador cria o membro pelo servidor; nenhuma senha fica no navegador', async () => {
  await storage.addEquipeUsuario({ nome: 'Novo', email: 'novo@rmchat.com', senha: 'SenhaForte#1', papel: 'suporte' });
  assert.ok(db.authUsers.some((u) => u.email === 'novo@rmchat.com'), 'login criado já confirmado');
  assert.ok(db.tables.equipe_usuarios.some((u) => u.email === 'novo@rmchat.com'));
  assert.equal(localStorage.getItem('rm_equipe_usuarios').includes('SenhaForte'), false);
  assert.equal(JSON.stringify(storage.getEquipeUsuarios()).includes('"senha"'), false);
});

test('equipe: suporte não gerencia membros; admin não remove o próprio acesso; remover revoga o login', async () => {
  usuarioLogado = 'maria@rmchat.com';
  await assert.rejects(() => storage.addEquipeUsuario({ email: 'x@rmchat.com', senha: 'SenhaForte#1' }), /administradores/);
  usuarioLogado = ADMIN;
  const resp = await fetch('/api/equipe', { method: 'DELETE', body: JSON.stringify({ email: ADMIN }) });
  assert.ok(resp.status === 400 || resp.status === 404);
  db.authUsers.push({ id: 'auth-maria', email: 'maria@rmchat.com', password: 'x' });
  await fetch('/api/equipe', { method: 'DELETE', body: JSON.stringify({ email: 'maria@rmchat.com' }) });
  assert.equal(db.authUsers.some((u) => u.email === 'maria@rmchat.com'), false);
});

test('senhas antigas de demonstração não estão mais no código enviado ao navegador', () => {
  assert.equal(JSON.stringify(storage.DEFAULT_EQUIPE_REAL).includes('senha'), false);
});

test('login confere a senha pelo hash no banco e cria a conta de login que faltava', async () => {
  assert.equal((await verificarCredenciais('maria@rmchat.com', 'errada')).ok, false);
  assert.equal((await verificarCredenciais('maria@rmchat.com', 'maria-segura')).ok, true);
  assert.ok(db.authUsers.some((u) => u.email === 'maria@rmchat.com' && u.password === 'maria-segura'));
});

// ---------------------------------------------------------------- captcha e força bruta
function login(body, ip = '200.0.0.1') {
  return rotaLogin(new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  }));
}

test('captcha configurado: login sem verificação é recusado; com verificação válida entra', async () => {
  process.env.TURNSTILE_SECRET_KEY = 'segredo-teste';
  assert.equal((await login({ email: 'maria@rmchat.com', password: 'maria-segura' })).status, 400);
  respostaCloudflare = { success: false };
  assert.equal((await login({ email: 'maria@rmchat.com', password: 'maria-segura', captchaToken: 'falso' })).status, 400);
  respostaCloudflare = { success: true };
  assert.equal((await login({ email: 'maria@rmchat.com', password: 'maria-segura', captchaToken: 'ok' })).status, 200);
});

test('força bruta: mesma conta bloqueada após 8 tentativas, mesmo vindo de IPs diferentes', async () => {
  for (let i = 0; i < 8; i++) await login({ email: 'maria@rmchat.com', password: `chute${i}` }, `10.0.${i}.1`);
  const bloqueado = await login({ email: 'maria@rmchat.com', password: 'maria-segura' }, '10.9.9.9');
  assert.equal(bloqueado.status, 429);
});

test('limite por IP: rede bloqueada após 10 tentativas', async () => {
  for (let i = 0; i < 10; i++) await login({ email: `pessoa${i}@x.com`, password: 'x' }, '66.66.66.66');
  assert.equal((await login({ email: 'outra@x.com', password: 'x' }, '66.66.66.66')).status, 429);
});

// ---------------------------------------------------------------- empresas e credenciais
test('cadastro de empresa duplicada ou recusada pelo banco gera erro e não cria empresa só local', async () => {
  db.tables.empresas = [{ id: EMPRESA, nome: 'Já Existe' }];
  await assert.rejects(() => storage.createEmpresa({ nome: 'Já Existe', userEmail: ADMIN }), /já está cadastrada/);
  db.columns.empresas = ['nada'];
  await assert.rejects(() => storage.createEmpresa({ nome: 'Nova', userEmail: ADMIN }), /Falha ao cadastrar/);
  assert.equal((JSON.parse(localStorage.getItem('rm_empresas_reais') || '[]')).length, 0);
});

test('credenciais das empresas são lidas pela função que decifra', async () => {
  db.tables.empresas = [{ id: EMPRESA, nome: 'Cliente', created_at: new Date().toISOString() }];
  db.tables.empresa_credenciais = [{ id: 'cccccccc-0000-4000-8000-000000000001', empresa_id: EMPRESA, email_administrador: 'adm@cliente.com', senha_cifrada: 'aes:SegredoDoCliente' }];
  const lista = await storage.getEmpresas({ pageSize: 10 });
  const empresas = Array.isArray(lista) ? lista : lista.items;
  assert.equal(empresas[0].credenciais_lista[0].senha, 'SegredoDoCliente');
});
