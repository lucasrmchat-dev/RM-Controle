// Chat: conversas fixadas por pessoa (alfinete), no topo da lista.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { POST as fixar } from '../src/app/api/chat/fixar/route.js';
import { lerFixadas } from '../src/lib/server/canais/chat.js';
import { escopo } from '../src/lib/server/organizacao.js';

__definirSupabaseAdmin(mockSupabase);

const A = crypto.randomUUID();
const B = crypto.randomUUID();
const C1 = crypto.randomUUID();
const C2 = crypto.randomUUID();
const CB = crypto.randomUUID();

beforeEach(() => {
  db.reset();
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
    { id: B, nome: 'Clínica B', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.perfis_acesso = [];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana', papel: 'administrador', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'bia@a.com', nome: 'Bia', papel: 'administrador', ativo: true, organizacao_id: A },
  ];
  db.tables.conversas = [
    { id: C1, organizacao_id: A, status: 'aberta' },
    { id: C2, organizacao_id: A, status: 'resolvida' },
    { id: CB, organizacao_id: B, status: 'aberta' },
  ];
  db.tables.sistema_config = [];
});

const pedir = async (email, corpo) =>
  fixar(new NextRequest('http://localhost/api/chat/fixar', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` }, body: JSON.stringify(corpo) }));
const ler = async (r) => ({ status: r.status, ...(await r.json()) });

test('fixar: a mais recente no topo, cada pessoa com as suas, desafixar, outra empresa não', async () => {
  assert.deepEqual((await ler(await pedir('ana@a.com', { conversa_id: C1 }))).fixadas, [C1]);
  assert.deepEqual((await ler(await pedir('ana@a.com', { conversa_id: C2, fixar: true }))).fixadas, [C2, C1], 'resolvidas também podem ser fixadas');
  assert.deepEqual((await ler(await pedir('ana@a.com', { conversa_id: C1, fixar: true }))).fixadas, [C1, C2], 'fixar de novo leva ao topo');
  assert.deepEqual(await lerFixadas(escopo(mockSupabase, A), 'bia@a.com'), [], 'as fixadas da Ana não são da Bia');
  assert.deepEqual((await ler(await pedir('ana@a.com', { conversa_id: C2, fixar: false }))).fixadas, [C1]);
  assert.equal((await pedir('ana@a.com', { conversa_id: CB })).status, 404, 'conversa de outra empresa');
  assert.equal((await pedir('ana@a.com', { conversa_id: 'x' })).status, 400);
  assert.ok(db.tables.sistema_config.every((l) => l.organizacao_id === A));
});
