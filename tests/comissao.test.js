// Comissão comercial (regras da planilha de controle de atividade), vendas e visibilidade entre vendedores.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { GET as lerComissao, PUT as salvarComissao } from '../src/app/api/comercial/comissao/route.js';
import { POST as criarVenda, PATCH as editarVenda, DELETE as excluirVenda } from '../src/app/api/comercial/vendas/route.js';
import { calcularMes, calcularAno, diaLocal, validarRegras, vendedoresVisiveis } from '../src/lib/comissao.js';
import { relatorioComissaoXlsx } from '../src/lib/relatorioComissao.js';

__definirSupabaseAdmin(mockSupabase);

const A = crypto.randomUUID();
const B = crypto.randomUUID();
const PERFIL_VENDEDOR = crypto.randomUUID();
const PERFIL_GESTOR = crypto.randomUUID();
const CONFIG = { departamentos: ['Comercial'], pipelines: [{ id: 'vendas', nome: 'Vendas', etapas: [{ id: 'q', nome: 'Qualificação' }] }] };

beforeEach(() => {
  db.reset();
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
    { id: B, nome: 'Clínica B', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.perfis_acesso = [
    { id: PERFIL_VENDEDOR, organizacao_id: A, nome: 'Vendedor', administrador: false, todos_departamentos: true, modulos: ['comercial', 'agenda'] },
    { id: PERFIL_GESTOR, organizacao_id: A, nome: 'Gestor', administrador: false, todos_departamentos: true, modulos: ['comercial', 'comercial_gestao'] },
  ];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana', papel: 'suporte', ativo: true, organizacao_id: A, perfil_id: PERFIL_VENDEDOR },
    { id: crypto.randomUUID(), email: 'bia@a.com', nome: 'Bia', papel: 'suporte', ativo: true, organizacao_id: A, perfil_id: PERFIL_VENDEDOR },
    { id: crypto.randomUUID(), email: 'gil@a.com', nome: 'Gil', papel: 'suporte', ativo: true, organizacao_id: A, perfil_id: PERFIL_GESTOR },
    { id: crypto.randomUUID(), email: 'sup@a.com', nome: 'Suporte', papel: 'suporte', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'caio@b.com', nome: 'Caio', papel: 'administrador', ativo: true, organizacao_id: B },
  ];
  db.tables.sistema_config = [{ organizacao_id: A, chave: 'comercial', valor: CONFIG }];
  db.tables.agenda_eventos = [
    { id: crypto.randomUUID(), organizacao_id: A, titulo: 'Demo', participante_nome: 'Pamela', departamento: 'Comercial', data: '2026-10-05', status: 'concluida', responsavel_email: 'ana@a.com', created_at: '2026-10-01T13:00:00Z' },
    { id: crypto.randomUUID(), organizacao_id: A, titulo: 'Demo', participante_nome: 'Mateus', departamento: 'Comercial', data: '2026-10-06', status: 'agendada', responsavel_email: 'bia@a.com', created_at: '2026-10-01T15:00:00Z' },
    { id: crypto.randomUUID(), organizacao_id: A, titulo: 'Suporte', departamento: 'Suporte', data: '2026-10-06', status: 'concluida', responsavel_email: 'ana@a.com', created_at: '2026-10-01T15:00:00Z' },
  ];
  db.tables.comercial_vendas = [];
});

const como = async (email, url, metodo = 'GET', body) =>
  new NextRequest(`http://localhost${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` }, body: body ? JSON.stringify(body) : undefined });
const ler = async (r) => ({ status: r.status, ...(await r.json()) });

test('cálculo igual ao da planilha: 2 marcadas + 1 venda = R$ 350; feita paga quando a regra é "feita"', () => {
  const regras = validarRegras({ valor_reuniao: 25, pagar_por: 'marcada', valor_venda: 300 });
  const eventos = [
    { id: '1', participante_nome: 'Pamela', status: 'concluida', data: '2026-07-01', created_at: '2026-07-01T12:00:00Z', responsavel_email: 'lucas@a.com' },
    { id: '2', participante_nome: 'Mateus', status: 'cancelada', data: '2026-07-03', created_at: '2026-07-01T14:00:00Z', responsavel_email: 'lucas@a.com' },
  ];
  const vendas = [{ id: 'v', data: '2026-07-01', empresa: 'Alice', mensalidade: 937, adicionais: 400, vendedor_email: 'lucas@a.com' }];
  const r = calcularMes({ mes: '2026-07', vendedor: 'lucas@a.com', eventos, vendas, regras });
  const dia1 = r.dias[0];
  assert.deepEqual(dia1.marcadas.map((x) => x.nome), ['Pamela', 'Mateus'], 'cancelada conta como marcada');
  assert.deepEqual(dia1.feitas.map((x) => x.nome), ['Pamela']);
  assert.equal(dia1.total, 1337);
  assert.equal(dia1.comissao, 350);
  assert.equal(r.dias.length, 31);
  assert.equal(r.totais.contratos, 1337);
  assert.equal(r.taxas.comparecimento, 0.5);
  assert.equal(r.taxas.conversao, 1);
  const porFeita = calcularMes({ mes: '2026-07', eventos, vendas, regras: validarRegras({ ...regras, pagar_por: 'feita' }) });
  assert.equal(porFeita.totais.comissao, 325);
  // Regra própria do vendedor
  const proprio = calcularMes({ mes: '2026-07', eventos, vendas, regras: validarRegras({ ...regras, por_vendedor: { 'LUCAS@a.com': { valor_venda: 500 } } }) });
  assert.equal(proprio.totais.comissao, 550);
  assert.equal(diaLocal('2026-10-28T02:30:00Z'), '2026-10-27', 'dia no fuso do Brasil');
  assert.equal(calcularAno({ ano: '2026', eventos, vendas, regras })[6].totais.comissao, 350);
  // Visibilidade
  const vend = [{ email: 'ana@a.com' }, { email: 'bia@a.com' }];
  assert.deepEqual(vendedoresVisiveis({ eu: 'ana@a.com', gestor: false, regras: { visibilidade: 'proprias' }, vendedores: vend }), ['ana@a.com']);
  assert.deepEqual(vendedoresVisiveis({ eu: 'ana@a.com', gestor: false, regras: { visibilidade: 'escolha' }, vendedores: vend, privacidade: { 'bia@a.com': true } }), ['ana@a.com']);
  assert.deepEqual(vendedoresVisiveis({ eu: 'ana@a.com', gestor: true, regras: { visibilidade: 'proprias' }, vendedores: vend }), ['ana@a.com', 'bia@a.com']);
});

test('vendas: vendedor lança as próprias; gestor lança por todos; visibilidade e privacidade valem no servidor', async () => {
  const venda = async (email, corpo) => ler(await criarVenda(await como(email, '/api/comercial/vendas', 'POST', corpo)));
  const ok = await venda('ana@a.com', { empresa: 'FAMA Serviços', data: '2026-10-05', mensalidade: '937,00', adicionais: 400, origem_tipo: 'reuniao', origem_id: 'x' });
  assert.equal(ok.status, 201, ok.mensagem);
  assert.equal(ok.venda.vendedor_email, 'ana@a.com');
  assert.equal(ok.venda.vendedor_nome, 'Ana');
  assert.equal(Number(ok.venda.mensalidade), 937);
  assert.equal((await venda('ana@a.com', { empresa: 'X', data: '2026-10-05', vendedor_email: 'bia@a.com' })).status, 400, 'não lança venda por outro');
  assert.equal((await venda('gil@a.com', { empresa: 'Mefa Construções', data: '2026-10-06', vendedor_email: 'bia@a.com', mensalidade: 297 })).status, 201, 'gestor lança por outro');
  assert.equal((await venda('sup@a.com', { empresa: 'X', data: '2026-10-06' })).status, 403, 'sem o módulo Comercial');

  // Todos veem (padrão): Ana vê a venda da Bia; vendedores da equipe incluem quem não tem reunião
  let r = await ler(await lerComissao(await como('ana@a.com', '/api/comercial/comissao?mes=2026-10')));
  assert.equal(r.vendas.length, 2);
  assert.deepEqual(r.vendedores.map((v) => v.nome), ['Ana', 'Bia', 'Gil']);
  assert.equal(r.eventos.length, 2, 'só reuniões dos departamentos do comercial');

  // Cada um vê só as suas
  assert.equal((await salvarComissao(await como('ana@a.com', '/api/comercial/comissao', 'PUT', { regras: { visibilidade: 'proprias' } }))).status, 403, 'vendedor não muda regras');
  assert.equal((await salvarComissao(await como('gil@a.com', '/api/comercial/comissao', 'PUT', { regras: { valor_reuniao: 30, pagar_por: 'feita', valor_venda: 250, visibilidade: 'proprias' } }))).status, 200);
  r = await ler(await lerComissao(await como('ana@a.com', '/api/comercial/comissao?mes=2026-10')));
  assert.deepEqual(r.vendas.map((v) => v.empresa), ['FAMA Serviços']);
  assert.deepEqual(r.vendedores.map((v) => v.email), ['ana@a.com']);
  assert.equal(r.regras.valor_reuniao, 30);
  const gestor = await ler(await lerComissao(await como('gil@a.com', '/api/comercial/comissao?mes=2026-10')));
  assert.equal(gestor.vendas.length, 2, 'gestor vê tudo');

  // Cada vendedor escolhe: a Bia esconde as dela
  await salvarComissao(await como('gil@a.com', '/api/comercial/comissao', 'PUT', { regras: { visibilidade: 'escolha' } }));
  assert.equal((await ler(await salvarComissao(await como('bia@a.com', '/api/comercial/comissao', 'PUT', { ocultar: true })))).ocultei, true);
  r = await ler(await lerComissao(await como('ana@a.com', '/api/comercial/comissao?mes=2026-10')));
  assert.deepEqual(r.vendas.map((v) => v.empresa), ['FAMA Serviços']);
  assert.equal(r.podeOcultar, true);
  const bia = await ler(await lerComissao(await como('bia@a.com', '/api/comercial/comissao?mes=2026-10')));
  assert.equal(bia.vendas.some((v) => v.empresa === 'Mefa Construções'), true, 'ela continua vendo as próprias');

  // Editar e excluir: só a dona ou o gestor
  const id = ok.venda.id;
  assert.equal((await editarVenda(await como('bia@a.com', '/api/comercial/vendas', 'PATCH', { id, adicionais: 0 }))).status, 403);
  const editada = await ler(await editarVenda(await como('ana@a.com', '/api/comercial/vendas', 'PATCH', { id, adicionais: 0 })));
  assert.equal(Number(editada.venda.adicionais), 0);
  assert.equal((await excluirVenda(await como('gil@a.com', '/api/comercial/vendas', 'DELETE', { id }))).status, 200);
  assert.ok(db.tables.comercial_vendas.every((v) => v.organizacao_id === A));
  assert.equal((await lerComissao(await como('caio@b.com', '/api/comercial/comissao?mes=2026-10'))).status, 200);
});

test('relatório .xlsx: arquivo zip válido com uma aba por vendedor e a aba Equipe', () => {
  const bytes = relatorioComissaoXlsx({
    mes: '2026-10',
    vendedores: [{ email: 'ana@a.com', nome: 'Ana' }, { email: 'bia@a.com', nome: 'Bia & Cia <teste>' }],
    eventos: [{ id: '1', participante_nome: 'Pamela', status: 'concluida', data: '2026-10-05', created_at: '2026-10-01T12:00:00Z', responsavel_email: 'ana@a.com' }],
    vendas: [{ id: 'v', data: '2026-10-05', empresa: 'FAMA', mensalidade: 937, adicionais: 400, vendedor_email: 'ana@a.com' }],
    regras: validarRegras({}),
  });
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b, 'começa com PK (zip)');
  const texto = Buffer.from(bytes).toString('utf8');
  assert.match(texto, /\[Content_Types\]\.xml/);
  assert.match(texto, /sheet3\.xml/, 'Equipe + 2 vendedores');
  assert.match(texto, /Bia &amp; Cia &lt;teste&gt;/, 'texto escapado');
  assert.match(texto, /FAMA/);
});
