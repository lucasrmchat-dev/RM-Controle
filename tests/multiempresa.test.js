// Multiempresa no servidor: banco preso à empresa, suporte, painel da plataforma e limites.
// Executar: node --import ./tests/mocks/setup.js --test tests/multiempresa.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { escopo, contextoDaRequisicao, ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { validarLimites, validarContrato, validarContratoCliente, validarOrganizacao, consumo } from '../src/lib/plataforma.js';
import { GET as lerConfig } from '../src/app/api/configuracoes/route.js';
import { POST as criarMembro } from '../src/app/api/equipe/route.js';
import { GET as listarPlataforma, POST as acaoPlataforma } from '../src/app/api/plataforma/route.js';
import { GET as lerAgenda } from '../src/app/api/agenda/eventos/route.js';

__definirSupabaseAdmin(mockSupabase);
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'mock';

const A = crypto.randomUUID(); // assinante A (direta da plataforma)
const REV = crypto.randomUUID(); // revenda
const C = crypto.randomUUID(); // assinante da revenda
const OUTRA = crypto.randomUUID(); // assinante direta, fora da revenda

beforeEach(() => {
  db.reset();
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', pai_id: null, status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
    { id: REV, nome: 'Agência', tipo: 'revenda', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: { assinantes: 5 } },
    { id: C, nome: 'Loja C', tipo: 'assinante', pai_id: REV, status: 'ativa', limites: {} },
    { id: OUTRA, nome: 'Outra', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.contratos_organizacao = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana', papel: 'administrador', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'caio@a.com', nome: 'Caio', papel: 'suporte', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'rui@agencia.com', nome: 'Rui', papel: 'administrador', ativo: true, organizacao_id: REV },
    { id: crypto.randomUUID(), email: 'cris@c.com', nome: 'Cris', papel: 'administrador', ativo: true, organizacao_id: C },
  ];
  db.tables.sistema_config = [
    { chave: 'departamentos', valor: ['Suporte A'], organizacao_id: A },
    { chave: 'departamentos', valor: ['Vendas C'], organizacao_id: C },
  ];
  db.tables.agenda_eventos = [
    { id: crypto.randomUUID(), titulo: 'Reunião da A', data: '2099-01-01', organizacao_id: A },
    { id: crypto.randomUUID(), titulo: 'Reunião da C', data: '2099-01-01', organizacao_id: C },
  ];
  db.tables.empresas = [];
  db.tables.auditoria_logs = [];
  db.rpcs.rm_pode_gerir_org = ({ p_email, p_alvo }) =>
    p_email === 'rui@agencia.com' && db.tables.organizacoes.find((o) => o.id === p_alvo)?.pai_id === REV;
});

const req = async (metodo, url, email, body) =>
  new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` },
    body: body ? JSON.stringify(body) : undefined,
  });

test('escopo: filtra leituras, carimba gravações e separa segredos por empresa', async () => {
  const chamadas = [];
  const falso = {
    from: (t) => {
      const q = { t, ops: [] };
      const cadeia = new Proxy({}, { get: (_, op) => (...args) => (q.ops.push([op, args]), cadeia) });
      chamadas.push(q);
      return cadeia;
    },
    rpc: (nome, args) => ({ nome, args }),
  };
  const e = escopo(falso, A);
  e.from('empresas').select('*');
  e.from('empresas').insert([{ nome: 'X', organizacao_id: OUTRA }]);
  e.from('empresas').update({ nome: 'Y', organizacao_id: OUTRA }).eq('id', 1);
  e.from('sistema_config').upsert({ chave: 'k', valor: 1 }, { onConflict: 'chave' });
  e.from('organizacoes').select('*');
  assert.deepEqual(chamadas[0].ops, [['select', ['*']], ['eq', ['organizacao_id', A]]]);
  assert.equal(chamadas[1].ops[0][1][0][0].organizacao_id, A, 'insert grava a empresa certa, mesmo se pedirem outra');
  assert.deepEqual(chamadas[2].ops[0], ['update', [{ nome: 'Y' }, undefined]], 'update nunca troca a empresa');
  assert.deepEqual(chamadas[2].ops[1], ['eq', ['organizacao_id', A]]);
  assert.equal(chamadas[3].ops[0][1][1].onConflict, 'organizacao_id,chave');
  assert.deepEqual(chamadas[4].ops, [['select', ['*']]], 'tabelas globais não recebem filtro');
  assert.equal(e.rpc('rm_ler_segredo', { p_chave: 'senha_padrao' }).args.p_chave, `${A}:senha_padrao`);
});

test('cada pessoa lê só a configuração e a agenda da própria empresa', async () => {
  const a = await (await lerConfig(await req('GET', '/api/configuracoes?chave=departamentos', 'ana@a.com'))).json();
  assert.deepEqual(a.config.departamentos, ['Suporte A']);
  const c = await (await lerConfig(await req('GET', '/api/configuracoes?chave=departamentos', 'cris@c.com'))).json();
  assert.deepEqual(c.config.departamentos, ['Vendas C']);
  const agenda = await (await lerAgenda(await req('GET', '/api/agenda/eventos', 'ana@a.com'))).json();
  assert.deepEqual(agenda.eventos.map((e) => e.titulo), ['Reunião da A']);
});

test('empresa suspensa: a rota recusa', async () => {
  db.tables.organizacoes.find((o) => o.id === A).status = 'suspensa';
  const r = await lerConfig(await req('GET', '/api/configuracoes', 'ana@a.com'));
  assert.equal(r.status, 403);
});

test('sessão de suporte: revenda entra na assinante dela, não em outra', async () => {
  db.tables.sessoes_suporte.push({ email: 'rui@agencia.com', organizacao_id: C, expira_em: new Date(Date.now() + 3600000).toISOString() });
  const ctx = await contextoDaRequisicao(await req('GET', '/x', 'rui@agencia.com'));
  assert.equal(ctx.org.id, C);
  assert.equal(ctx.org.suporte, true);
  assert.equal(ctx.admin, true);
  db.tables.sessoes_suporte[0].organizacao_id = OUTRA;
  const ctx2 = await contextoDaRequisicao(await req('GET', '/x', 'rui@agencia.com'));
  assert.equal(ctx2.org.id, REV, 'sem permissão na OUTRA: continua na própria');
  db.tables.sessoes_suporte[0] = { email: 'rui@agencia.com', organizacao_id: C, expira_em: new Date(Date.now() - 1000).toISOString() };
  const ctx3 = await contextoDaRequisicao(await req('GET', '/x', 'rui@agencia.com'));
  assert.equal(ctx3.org.id, REV, 'sessão expirada');
});

test('cadastro de membro: e-mail de outra empresa é recusado ANTES de mexer no login dela', async () => {
  db.authUsers.push({ id: 'u1', email: 'cris@c.com', password: 'SenhaDaCris1' });
  const r = await criarMembro(await req('POST', '/api/equipe', 'ana@a.com', { email: 'cris@c.com', senha: 'OutraSenha9', nome: 'Invasor' }));
  assert.equal(r.status, 409);
  assert.equal(db.authUsers[0].password, 'SenhaDaCris1', 'a senha da pessoa da outra empresa não mudou');
  const ok = await criarMembro(await req('POST', '/api/equipe', 'ana@a.com', { email: 'novo@a.com', senha: 'SenhaNova9', nome: 'Novo' }));
  assert.equal(ok.status, 201);
  assert.equal(db.tables.equipe_usuarios.find((u) => u.email === 'novo@a.com').organizacao_id, A);
});

test('painel: só quem gerencia acessa; revenda vê e mexe só nas assinantes dela', async () => {
  assert.equal((await listarPlataforma(await req('GET', '/api/plataforma', 'ana@a.com'))).status, 403, 'assinante comum não gerencia');
  const rev = await (await listarPlataforma(await req('GET', '/api/plataforma', 'rui@agencia.com'))).json();
  assert.deepEqual(rev.organizacoes.map((o) => o.nome), ['Loja C']);
  const dono = await (await listarPlataforma(await req('GET', '/api/plataforma', 'lucas@rmchat.com'))).json();
  assert.deepEqual(dono.organizacoes.map((o) => o.nome).sort(), ['Agência', 'Clínica A', 'Loja C', 'Outra']);

  const proibido = await acaoPlataforma(await req('POST', '/api/plataforma', 'rui@agencia.com', { acao: 'status', id: OUTRA, status: 'suspensa' }));
  assert.equal(proibido.status, 404, 'revenda não enxerga assinante de fora');
  const plataforma = await acaoPlataforma(await req('POST', '/api/plataforma', 'lucas@rmchat.com', { acao: 'status', id: ORG_PLATAFORMA, status: 'suspensa' }));
  assert.equal(plataforma.status, 404, 'ninguém suspende a plataforma');
  const revendaCriaRevenda = await acaoPlataforma(await req('POST', '/api/plataforma', 'rui@agencia.com', { acao: 'criar', nome: 'Sub', tipo: 'revenda', admin: { email: 'x@x.com', senha: 'Senha1234' } }));
  assert.equal(revendaCriaRevenda.status, 403);
});

test('criar assinante: empresa, contrato, primeiro administrador e registro na auditoria dela', async () => {
  const r = await acaoPlataforma(await req('POST', '/api/plataforma', 'rui@agencia.com', {
    acao: 'criar',
    nome: 'Padaria Nova',
    tipo: 'assinante',
    limites: { usuarios: 3, empresas: '' },
    contrato: { plano: 'Essencial', valor_mensal: '199,90', dia_vencimento: 10 },
    admin: { nome: 'Dona', email: 'dona@padaria.com', senha: 'Inicial123' },
  }));
  assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
  const { organizacao } = await r.json();
  assert.equal(organizacao.pai_id, REV, 'criada abaixo da revenda');
  assert.deepEqual(organizacao.limites, { usuarios: 3 });
  const admin = db.tables.equipe_usuarios.find((u) => u.email === 'dona@padaria.com');
  assert.equal(admin.organizacao_id, organizacao.id);
  assert.equal(admin.papel, 'administrador');
  assert.equal(admin.primeiro_acesso_concluido, false, 'troca a senha no primeiro acesso');
  assert.equal(db.tables.contratos_organizacao[0].valor_mensal, 199.9);
  assert.equal(db.tables.contratos_organizacao[0].fornecedor_id, REV);
  assert.ok(db.tables.auditoria_logs.some((l) => l.organizacao_id === organizacao.id && l.acao === 'plataforma_criou_empresa'));

  const repetido = await acaoPlataforma(await req('POST', '/api/plataforma', 'rui@agencia.com', { acao: 'criar', nome: 'Outra', tipo: 'assinante', admin: { email: 'ana@a.com', senha: 'Inicial123' } }));
  assert.equal(repetido.status, 409, 'administrador com e-mail já usado em outra empresa');
});

test('entrar para suporte exige motivo e fica registrado na empresa visitada', async () => {
  const semMotivo = await acaoPlataforma(await req('POST', '/api/plataforma', 'lucas@rmchat.com', { acao: 'entrar_suporte', id: A }));
  assert.equal(semMotivo.status, 400);
  const ok = await acaoPlataforma(await req('POST', '/api/plataforma', 'lucas@rmchat.com', { acao: 'entrar_suporte', id: A, motivo: 'Cliente pediu ajuda com a fila' }));
  assert.equal(ok.status, 200);
  assert.equal(db.tables.sessoes_suporte[0].organizacao_id, A);
  const log = db.tables.auditoria_logs.find((l) => l.acao === 'plataforma_entrou_suporte');
  assert.equal(log.organizacao_id, A, 'a assinante vê na auditoria dela');
  assert.equal(log.detalhes.motivo, 'Cliente pediu ajuda com a fila');
  await acaoPlataforma(await req('POST', '/api/plataforma', 'lucas@rmchat.com', { acao: 'sair_suporte' }));
  assert.equal(db.tables.sessoes_suporte.length, 0);
});

test('contrato novo encerra o anterior e passa a valer como limite', async () => {
  await acaoPlataforma(await req('POST', '/api/plataforma', 'lucas@rmchat.com', { acao: 'contrato', id: A, contrato: { plano: 'Básico', valor_mensal: 100 }, limites: { usuarios: 2 } }));
  await acaoPlataforma(await req('POST', '/api/plataforma', 'lucas@rmchat.com', { acao: 'contrato', id: A, contrato: { plano: 'Pro', valor_mensal: 300 }, limites: { usuarios: 10 } }));
  const contratos = db.tables.contratos_organizacao.filter((c) => c.cliente_id === A);
  assert.deepEqual(contratos.map((c) => [c.plano, c.status]), [['Básico', 'encerrado'], ['Pro', 'ativo']]);
  assert.deepEqual(db.tables.organizacoes.find((o) => o.id === A).limites, { usuarios: 10 });
});

test('regras de plano e contrato', () => {
  assert.deepEqual(validarLimites({ usuarios: '5', empresas: '', assinantes: 3 }, 'assinante'), { usuarios: 5 }, 'assinante não tem limite de assinantes');
  assert.deepEqual(validarLimites({ assinantes: 3 }, 'revenda'), { assinantes: 3 });
  assert.throws(() => validarLimites({ usuarios: -1 }, 'assinante'), /usuários/);
  assert.throws(() => validarLimites({ usuarios: 2.5 }, 'assinante'), /usuários/);
  assert.throws(() => validarContrato({ plano: '' }), /plano/);
  assert.throws(() => validarContrato({ plano: 'X', dia_vencimento: 31 }), /1 a 28/);
  assert.throws(() => validarContrato({ plano: 'X', inicio: '2026-05-01', fim: '2026-01-01' }), /depois do início/);
  assert.equal(validarContrato({ plano: 'X', valor_mensal: '1.234,5'.replace('.', '') }).valor_mensal, 1234.5);
  assert.equal(validarContratoCliente({ plano: 'Pro', renovacao: '2027-01-10', inicio: '2026-01-10', status: 'em_negociacao' }).renovacao, '2027-01-10');
  assert.throws(() => validarOrganizacao({ nome: 'A', tipo: 'assinante' }), /nome/);
  assert.throws(() => validarOrganizacao({ nome: 'Ok', tipo: 'plataforma' }), /revenda ou uma empresa assinante/);
  const c = consumo({ usuarios: 3 }, { usuarios: 3 });
  assert.equal(c[0].esgotado, true);
});
