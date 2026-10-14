// Testes de permissões: papéis, acesso às Configurações Avançadas, login e APIs protegidas.
// Executar: node --import ./tests/mocks/setup.js --test tests/permissoes.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import {
  resolverPapel,
  podeVerConfiguracoesAvancadas,
  podeAcessarAbaConfiguracao,
  ABAS_CONFIG_AVANCADAS,
} from '../src/lib/roles.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { __definirSupabaseAnon } from '../src/lib/server/acesso.js';
import { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { POST as login } from '../src/app/api/auth/login/route.js';
import { GET as sessao } from '../src/app/api/auth/session/route.js';
import { GET as lerConfigIntegracao } from '../src/app/api/integracoes/suporte/config/route.js';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';
__definirSupabaseAdmin(mockSupabase);

// Contas do Supabase Auth simuladas
const contasAuth = new Map([['lucas@rmchat.com', 'SenhaDoLucas#1']]);
const sessoesEncerradas = [];
__definirSupabaseAnon({
  auth: {
    async signInWithPassword({ email, password }) {
      return contasAuth.get(email) === password
        ? { data: { user: { email } }, error: null }
        : { data: { user: null }, error: { message: 'Invalid login credentials' } };
    },
    async signOut(opts) {
      sessoesEncerradas.push(opts);
      return { error: null };
    },
  },
});

const EQUIPE = [
  { email: 'maria@rmchat.com', papel: 'suporte', senha: 'maria123', ativo: true },
  { email: 'pedro@rmchat.com', papel: 'suporte', senha: 'pedro123', ativo: true },
  { email: 'carla@rmchat.com', papel: 'vendas', senha: 'carla123', ativo: true },
  { email: 'gestora@rmchat.com', papel: 'administrador', senha: 'gestora123', ativo: true },
  { email: 'ex@rmchat.com', papel: 'administrador', senha: 'ex123', ativo: false },
];

let ipSeq = 0;
function requisicao(url, { method = 'POST', body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${++ipSeq % 250}` };
  if (cookie) headers.Cookie = cookie;
  return new NextRequest(`http://localhost${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function cookieDe(email, role) {
  return `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role })}`;
}

beforeEach(() => {
  db.reset();
  db.tables.equipe_usuarios = EQUIPE.map((u) => ({ ...u }));
});

// ---------------------------------------------------------------- regra de papéis
test('papéis: proprietários são administradores, demais seguem o cadastro da equipe', () => {
  assert.equal(resolverPapel('lucas@rmchat.com', EQUIPE), 'administrador');
  assert.equal(resolverPapel('LUCAS@RMCHAT.COM ', EQUIPE), 'administrador');
  assert.equal(resolverPapel('admin@rmcontrole.com', []), 'administrador');
  assert.equal(resolverPapel('gestora@rmchat.com', EQUIPE), 'administrador');
  assert.equal(resolverPapel('maria@rmchat.com', EQUIPE), 'suporte');
  assert.equal(resolverPapel('carla@rmchat.com', EQUIPE), 'vendas');
});

test('papéis: o texto do e-mail não dá privilégios (antes "admin…" e "…lucas…" viravam administrador)', () => {
  assert.equal(resolverPapel('admin.falso@gmail.com', EQUIPE), 'suporte');
  assert.equal(resolverPapel('lucas.silva@outra.com', EQUIPE), 'suporte');
  assert.equal(resolverPapel('vendas@qualquer.com', EQUIPE), 'suporte');
});

test('papéis: usuário desativado perde o papel de administrador', () => {
  assert.equal(resolverPapel('ex@rmchat.com', EQUIPE), 'suporte');
});

test('papéis: administradores extras via RM_ADMIN_EMAILS', () => {
  assert.equal(resolverPapel('socio@rmchat.com', [], 'socio@rmchat.com, outro@x.com'), 'administrador');
});

test('Configurações Avançadas: só administrador acessa; suporte e vendas ficam nas básicas', () => {
  assert.equal(podeVerConfiguracoesAvancadas('administrador'), true);
  for (const papel of ['suporte', 'vendas']) {
    assert.equal(podeVerConfiguracoesAvancadas(papel), false, papel);
    for (const aba of ABAS_CONFIG_AVANCADAS) {
      assert.equal(podeAcessarAbaConfiguracao(papel, aba), false, `${papel} não pode abrir ${aba}`);
    }
    for (const aba of ['visualizacao', 'audio', 'agenda', 'regras_suporte']) {
      assert.equal(podeAcessarAbaConfiguracao(papel, aba), true, `${papel} pode abrir ${aba}`);
    }
  }
  for (const aba of ABAS_CONFIG_AVANCADAS) assert.equal(podeAcessarAbaConfiguracao('administrador', aba), true);
});

// ---------------------------------------------------------------- login
test('login: senha errada é recusada (antes qualquer senha era aceita)', async () => {
  const r = await login(requisicao('/api/auth/login', { body: { email: 'maria@rmchat.com', password: 'chute' } }));
  assert.equal(r.status, 401);
  const invasor = await login(requisicao('/api/auth/login', { body: { email: 'admin@hacker.com', password: 'x' } }));
  assert.equal(invasor.status, 401);
});

test('login: aceita Supabase Auth e senha de Equipe & Senhas, com o papel do cadastro', async () => {
  const lucas = await login(requisicao('/api/auth/login', { body: { email: 'lucas@rmchat.com', password: 'SenhaDoLucas#1' } }));
  assert.equal(lucas.status, 200);
  assert.equal((await lucas.json()).user.role, 'administrador');
  assert.deepEqual(sessoesEncerradas.at(-1), { scope: 'local' }, 'não derruba a sessão do navegador');

  const carla = await login(requisicao('/api/auth/login', { body: { email: 'carla@rmchat.com', password: 'carla123' } }));
  assert.equal(carla.status, 200);
  const cookie = carla.headers.get('set-cookie').match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))[1];
  assert.equal((await verifySessionToken(cookie)).role, 'vendas');
});

test('login: usuário desativado não entra', async () => {
  const r = await login(requisicao('/api/auth/login', { body: { email: 'ex@rmchat.com', password: 'ex123' } }));
  assert.equal(r.status, 401);
});

// ---------------------------------------------------------------- cenário do print
test('sessão antiga do Lucas gravada como "suporte" passa a ser reconhecida como administrador', async () => {
  const cookieAntigo = await cookieDe('lucas@rmchat.com', 'suporte');
  const s = await (await sessao(requisicao('/api/auth/session', { method: 'GET', cookie: cookieAntigo }))).json();
  assert.equal(s.user.role, 'administrador');

  const cfg = await lerConfigIntegracao(requisicao('/api/integracoes/suporte/config', { method: 'GET', cookie: cookieAntigo }));
  assert.equal(cfg.status, 200, 'Lucas abre a configuração do Suporte Automático');
});

test('API de configuração avançada recusa suporte e vendas, mesmo com cookie adulterado para "administrador"', async () => {
  for (const email of ['maria@rmchat.com', 'carla@rmchat.com']) {
    const cookie = await cookieDe(email, 'administrador');
    const r = await lerConfigIntegracao(requisicao('/api/integracoes/suporte/config', { method: 'GET', cookie }));
    assert.equal(r.status, 403, email);
  }
});

test('rebaixar um administrador em Equipe & Senhas vale na próxima requisição', async () => {
  const cookie = await cookieDe('gestora@rmchat.com', 'administrador');
  assert.equal((await lerConfigIntegracao(requisicao('/c', { method: 'GET', cookie }))).status, 200);
  db.tables.equipe_usuarios.find((u) => u.email === 'gestora@rmchat.com').papel = 'suporte';
  assert.equal((await lerConfigIntegracao(requisicao('/c', { method: 'GET', cookie }))).status, 403);
});
