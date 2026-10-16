// Testes: tipo de cliente (novo/existente), troca de servidor e URLs compartilhadas.
// Executar: node --import ./tests/mocks/setup.js --test tests/empresas-servidores.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { GET as lerConfiguracoes, PUT as salvarConfiguracao } from '../src/app/api/configuracoes/route.js';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';
__definirSupabaseAdmin(mockSupabase);

const { createEmpresa, createEmpresasEmMassa, updateEmpresa, addServerChecklistTemplateItem } = await import('../src/lib/storage.js');
const USER = 'lucas@rmchat.com';

beforeEach(() => {
  db.reset();
  localStorage.clear();
  db.tables.equipe_usuarios = [{ email: 'maria@rmchat.com', papel: 'suporte', ativo: true }];
  addServerChecklistTemplateItem({ titulo: 'Domínio configurado' });
  addServerChecklistTemplateItem({ titulo: 'Canais conectados' });
});

const checklistDe = (empresaId) => db.tables.empresa_checklist.filter((c) => c.empresa_id === empresaId);

// ---------------------------------------------------------------- tipo de cliente
test('cliente novo: checklist de setup começa em 0% e a data é gravada', async () => {
  const emp = await createEmpresa({ nome: 'Padaria Nova', tipo_cliente: 'novo', cliente_desde: '2026-10-10', userEmail: USER });
  const linha = db.tables.empresas[0];
  assert.equal(linha.tipo_cliente, 'novo');
  assert.equal(linha.cliente_desde, '2026-10-10');
  const chk = checklistDe(emp.id);
  assert.ok(chk.length > 0);
  assert.ok(chk.every((c) => c.concluido === false));
});

test('cliente já existente: checklist de setup nasce em 100%', async () => {
  const emp = await createEmpresa({ nome: 'Transportes Antigos', tipo_cliente: 'existente', cliente_desde: '2023-05-02', userEmail: USER });
  const chk = checklistDe(emp.id);
  assert.ok(chk.length > 0);
  assert.ok(chk.every((c) => c.concluido === true));
  assert.equal(db.tables.empresas[0].cliente_desde, '2023-05-02');
  assert.ok(emp.checklist.every((c) => c.concluido), 'cópia local também em 100%');
});

test('data futura é corrigida para hoje', async () => {
  await createEmpresa({ nome: 'Futura', tipo_cliente: 'novo', cliente_desde: '2099-01-01', userEmail: USER });
  assert.equal(db.tables.empresas[0].cliente_desde, new Date().toISOString().slice(0, 10));
});

test('cadastro em lote grava o servidor escolhido e o tipo de cliente (antes ia tudo para o Servidor 1)', async () => {
  await createEmpresasEmMassa(['Alfa', 'Beta'], { servidor_alocado: 'servidor_2', tipo_cliente: 'existente', userEmail: USER });
  assert.deepEqual(db.tables.empresas.map((e) => e.servidor_alocado), ['servidor_2', 'servidor_2']);
  assert.ok(db.tables.empresa_checklist.every((c) => c.concluido === true));
});

test('banco sem as colunas novas: cadastro continua funcionando', async () => {
  db.columns.empresas = ['nome', 'formato_atendimento', 'servidor_alocado', 'ativo'];
  await createEmpresa({ nome: 'Sem Migração', tipo_cliente: 'novo', userEmail: USER });
  assert.equal(db.tables.empresas.length, 1);
});

// ---------------------------------------------------------------- troca de servidor
test('trocar servidor grava na nuvem para todos', async () => {
  const emp = await createEmpresa({ nome: 'Troca', tipo_cliente: 'novo', userEmail: USER });
  await updateEmpresa(emp.id, { servidor_alocado: 'servidor_2' }, USER);
  assert.equal(db.tables.empresas[0].servidor_alocado, 'servidor_2');
});

test('troca de servidor recusada pelo banco gera erro (antes a tela confirmava mesmo assim)', async () => {
  const emp = await createEmpresa({ nome: 'Recusada', tipo_cliente: 'novo', userEmail: USER });
  db.rls.updateAllowed = false;
  await assert.rejects(() => updateEmpresa(emp.id, { servidor_alocado: 'servidor_2' }, USER), /não confirmou/);
  assert.equal(db.tables.empresas[0].servidor_alocado, 'servidor_1');
});

// ---------------------------------------------------------------- URLs dos servidores
async function req(method, email, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (email) headers.Cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}`;
  return new NextRequest('http://localhost/api/configuracoes', { method, headers, body: body ? JSON.stringify(body) : undefined });
}
const salvarServidores = async (email, valor) => salvarConfiguracao(await req('PUT', email, { chave: 'servidores_urls', valor }));

test('URLs dos servidores: administrador salva e qualquer colaborador lê o mesmo link', async () => {
  const salvar = await salvarServidores(USER, { servidor_1_url: 'https://s1.minhaempresa.com.br/', servidor_2_url: 'https://s2.minhaempresa.com.br' });
  assert.equal(salvar.status, 200);
  const lido = await (await lerConfiguracoes(await req('GET', 'maria@rmchat.com'))).json();
  assert.equal(lido.config.servidores_urls.servidor_1_url, 'https://s1.minhaempresa.com.br');
  assert.equal(lido.config.servidores_urls.servidor_2_url, 'https://s2.minhaempresa.com.br');
});

test('URLs dos servidores: suporte não altera, sem sessão não lê, URL inválida é recusada', async () => {
  assert.equal((await salvarServidores('maria@rmchat.com', { servidor_1_url: 'https://x.com' })).status, 403);
  assert.equal((await lerConfiguracoes(await req('GET', null))).status, 401);
  assert.equal((await salvarServidores(USER, { servidor_1_url: 'javascript:alert(1)' })).status, 400);
});
