// Perfis de acesso: regra de visibilidade (módulos e departamentos) e rotas do servidor.
// Executar: node --import ./tests/mocks/setup.js --test tests/perfis.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { permissoesEfetivas, podeVerDemanda, departamentosVisiveis } from '../src/lib/perfis.js';
import { GET as listarPerfis, POST as criarPerfil, PATCH as editarPerfil, DELETE as apagarPerfil } from '../src/app/api/perfis/route.js';
import { PATCH as editarMembro } from '../src/app/api/equipe/route.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

const DEPS = ['Suporte', 'Implantação', 'Financeiro', 'Comercial'];
const N1 = { id: crypto.randomUUID(), nome: 'Suporte N1', administrador: false, modulos: ['fila', 'agenda'], todos_departamentos: false, departamentos: ['Suporte'] };
const GESTOR = { id: crypto.randomUUID(), nome: 'Gestor', administrador: true, modulos: [], todos_departamentos: true, departamentos: [] };

test('perfil restrito: só os módulos e departamentos dele', () => {
  const equipe = [{ email: 'ana@rmchat.com', papel: 'suporte', perfil_id: N1.id }];
  const p = permissoesEfetivas({ email: 'ana@rmchat.com', equipe, perfis: [N1, GESTOR] });
  assert.equal(p.administrador, false);
  assert.deepEqual(p.modulos, ['fila', 'agenda']);
  assert.deepEqual(departamentosVisiveis(p, DEPS), ['Suporte']);
  assert.equal(podeVerDemanda(p, { categorias: ['Suporte'] }), true);
  assert.equal(podeVerDemanda(p, { categorias: ['Financeiro'] }), false, 'criou para outro departamento: não vê depois');
  assert.equal(podeVerDemanda(p, { motivo: 'suporte, Comercial' }), true, 'demandas antigas usam o texto de motivo');
});

test('perfil administrador, proprietário e membro sem perfil', () => {
  const equipe = [
    { email: 'gestor@rmchat.com', papel: 'administrador', perfil_id: GESTOR.id },
    { email: 'velho@rmchat.com', papel: 'suporte', departamentos_bloqueados: ['Financeiro'] },
  ];
  const gestor = permissoesEfetivas({ email: 'gestor@rmchat.com', equipe, perfis: [N1, GESTOR] });
  assert.equal(gestor.administrador, true);
  assert.equal(podeVerDemanda(gestor, { categorias: ['Financeiro'] }), true);

  const dono = permissoesEfetivas({ email: 'lucas@rmchat.com', equipe, perfis: [N1] });
  assert.equal(dono.administrador, true, 'proprietário sempre tem acesso total');

  const semPerfil = permissoesEfetivas({ email: 'velho@rmchat.com', equipe, perfis: [N1] });
  assert.ok(semPerfil.modulos.includes('dashboard'), 'sem perfil: acesso de hoje');
  assert.equal(podeVerDemanda(semPerfil, { categorias: ['Financeiro'] }), false, 'bloqueio antigo continua valendo');

  // Administrador simulando um perfil
  const simulando = permissoesEfetivas({ email: 'lucas@rmchat.com', equipe, perfis: [N1], verComoPerfilId: N1.id });
  assert.equal(simulando.administrador, false);
  assert.deepEqual(simulando.modulos, ['fila', 'agenda']);
  // Quem não é administrador não consegue simular
  const tentativa = permissoesEfetivas({ email: 'velho@rmchat.com', equipe, perfis: [N1, GESTOR], verComoPerfilId: GESTOR.id });
  assert.equal(tentativa.administrador, false);
});

// ------------------------------------------------------------------------------
// Rotas
// ------------------------------------------------------------------------------
const cookie = async (email, role) => `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role })}`;
const req = async (metodo, url, body, email = 'lucas@rmchat.com', role = 'administrador') =>
  new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: await cookie(email, role) },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  db.reset();
  db.tables.perfis_acesso = [];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'maria@rmchat.com', nome: 'Maria', papel: 'suporte', ativo: true },
    { id: crypto.randomUUID(), email: 'pedro@rmchat.com', nome: 'Pedro', papel: 'suporte', ativo: true },
  ];
});

test('só administrador cria perfil; dados são validados', async () => {
  const negado = await criarPerfil(await req('POST', '/api/perfis', { nome: 'X', modulos: ['fila'] }, 'maria@rmchat.com', 'suporte'));
  assert.equal(negado.status, 403);

  const semModulo = await criarPerfil(await req('POST', '/api/perfis', { nome: 'Vazio', modulos: [] }));
  assert.equal(semModulo.status, 400);

  const ok = await criarPerfil(await req('POST', '/api/perfis', { nome: '  Suporte   N1 ', modulos: ['fila', 'inexistente'], departamentos: ['Suporte'] }));
  assert.equal(ok.status, 201);
  const { perfil } = await ok.json();
  assert.equal(perfil.nome, 'Suporte N1');
  assert.deepEqual(perfil.modulos, ['fila'], 'módulo desconhecido é descartado');

  const lista = await (await listarPerfis(await req('GET', '/api/perfis', null, 'maria@rmchat.com', 'suporte'))).json();
  assert.equal(lista.perfis.length, 1, 'qualquer membro da equipe lê os perfis');
});

test('perfil administrador vira papel administrador no banco; excluir o perfil tira esse acesso', async () => {
  const { perfil: gestor } = await (await criarPerfil(await req('POST', '/api/perfis', { nome: 'Gestor', administrador: true }))).json();
  const maria = db.tables.equipe_usuarios.find((u) => u.email === 'maria@rmchat.com');

  const r = await editarMembro(await req('PATCH', '/api/equipe', { id: maria.id, perfil_id: gestor.id }));
  assert.equal(r.status, 200);
  assert.equal(maria.papel, 'administrador');
  assert.equal(maria.perfil_id, gestor.id);

  // Perfil deixa de ser administrador: membros acompanham
  await editarPerfil(await req('PATCH', '/api/perfis', { id: gestor.id, administrador: false, modulos: ['fila'] }));
  assert.equal(maria.papel, 'suporte');

  await editarPerfil(await req('PATCH', '/api/perfis', { id: gestor.id, administrador: true }));
  assert.equal(maria.papel, 'administrador');
  await apagarPerfil(await req('DELETE', '/api/perfis', { id: gestor.id }));
  assert.equal(maria.perfil_id, null);
  assert.equal(maria.papel, 'suporte', 'sem perfil, não sobra acesso de administrador');
});

test('tirar o perfil de um membro não deixa papel de administrador herdado', async () => {
  const { perfil: gestor } = await (await criarPerfil(await req('POST', '/api/perfis', { nome: 'Gestor', administrador: true }))).json();
  const pedro = db.tables.equipe_usuarios.find((u) => u.email === 'pedro@rmchat.com');
  await editarMembro(await req('PATCH', '/api/equipe', { id: pedro.id, perfil_id: gestor.id }));
  assert.equal(pedro.papel, 'administrador');
  await editarMembro(await req('PATCH', '/api/equipe', { id: pedro.id, perfil_id: null }));
  assert.equal(pedro.papel, 'suporte');
});
