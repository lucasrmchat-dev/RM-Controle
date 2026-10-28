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

test('Comercial pode ser concedido por perfil, sem liberar automaticamente para membros sem perfil', () => {
  for (const papel of ['suporte', 'vendas']) {
    assert.equal(permissoesEfetivas({ email: 'pessoa@rmchat.com', equipe: [{ email: 'pessoa@rmchat.com', papel }] }).modulos.includes('comercial'), false);
  }
  const perfil = { ...N1, modulos: ['fila', 'comercial'] };
  assert.equal(permissoesEfetivas({ email: 'ana@rmchat.com', equipe: [{ email: 'ana@rmchat.com', perfil_id: perfil.id }], perfis: [perfil] }).modulos.includes('comercial'), true);
  assert.equal(permissoesEfetivas({ email: 'lucas@rmchat.com' }).modulos.includes('comercial'), true);
  assert.equal(permissoesEfetivas({ email: 'gestor@rmchat.com', equipe: [{ email: 'gestor@rmchat.com', papel: 'administrador' }] }).modulos.includes('comercial'), true);
});

import { resumoComercial } from '../src/lib/comercial.js';

test('Comercial conta reuniões por responsável e mês, sem duplicar crédito nem incluir prazos de demandas', () => {
  const base = { data: '2026-10-23', departamento: 'Vendas', responsavel_email: 'ANA@rmchat.com', responsavel_nome: 'Ana' };
  const eventos = [
    { ...base, id: '1', status: 'concluida' },
    { ...base, id: '2', status: 'agendada' },
    { ...base, id: '3', status: 'cancelada' },
    { ...base, id: '4', responsavel_email: null, responsavel_nome: null, status: 'concluida' },
    { ...base, id: '5', departamento: 'Suporte', status: 'concluida' },
    { ...base, id: '6', data: '2026-09-23', status: 'concluida' },
    { ...base, id: '7', chamado_id: 'prazo-1', status: 'concluida' },
    { ...base, id: '8', departamento: null, status: 'concluida' },
    { ...base, id: '9', departamento: ' Comercial ', status: 'agendada' },
  ];
  const r = resumoComercial(eventos, { mes: '2026-10', departamentos: ['Vendas', 'Comercial'] });
  assert.deepEqual(r.totais, { agendada: 2, concluida: 2, cancelada: 1 });
  assert.equal(r.pessoas.length, 2);
  assert.equal(r.pessoas.find((p) => p.email === 'ana@rmchat.com').concluida, 1);
  assert.equal(r.pessoas.find((p) => !p.email).concluida, 1);
  assert.equal(resumoComercial(eventos, { mes: '2026-10', departamento: 'Suporte', departamentos: ['Suporte'] }).totais.concluida, 1);
});

test('Comercial é salvo no perfil, respeita a simulação e pode ser revogado', async () => {
  const resposta = await criarPerfil(await req('POST', '/api/perfis', { nome: 'Gestão comercial', modulos: ['agenda', 'comercial'], todos_departamentos: false, departamentos: ['Vendas'] }));
  assert.equal(resposta.status, 201);
  const { perfil } = await resposta.json();
  assert.deepEqual(perfil.modulos, ['agenda', 'comercial']);
  const equipe = [{ email: 'maria@rmchat.com', perfil_id: perfil.id, papel: 'suporte' }];
  const perm = permissoesEfetivas({ email: 'maria@rmchat.com', equipe, perfis: [perfil] });
  assert.equal(perm.administrador, false);
  assert.equal(perm.modulos.includes('comercial'), true);
  assert.deepEqual(departamentosVisiveis(perm, ['Vendas', 'Suporte']), ['Vendas']);
  const simulado = permissoesEfetivas({ email: 'lucas@rmchat.com', perfis: [perfil], verComoPerfilId: perfil.id });
  assert.equal(simulado.modulos.includes('comercial'), true);
  await editarPerfil(await req('PATCH', '/api/perfis', { id: perfil.id, modulos: ['agenda'] }));
  const perfis = db.tables.perfis_acesso;
  assert.equal(permissoesEfetivas({ email: 'maria@rmchat.com', equipe, perfis }).modulos.includes('comercial'), false);
  assert.equal(permissoesEfetivas({ email: 'lucas@rmchat.com', perfis, verComoPerfilId: perfil.id }).modulos.includes('comercial'), false);
});

import { validarConfigComercial, posicaoComercial, DESFECHOS_COMERCIAIS } from '../src/lib/comercial.js';
import { GET as lerComercial, PATCH as moverComercial, DELETE as excluirComercial } from '../src/app/api/comercial/route.js';
import { PUT as salvarConfiguracao } from '../src/app/api/configuracoes/route.js';
const CONFIG_VENDAS = { departamentos: ['Comercial: RM Chat'], pipelines: [{ id: 'negocios', nome: 'Novos negócios', etapas: [{ id: 'contato', nome: 'Primeiro contato' }, { id: 'proposta', nome: 'Proposta' }] }] };

test('configuração comercial seleciona departamentos explicitamente e mantém Ganho/Perda fixos', () => {
  assert.deepEqual(validarConfigComercial(CONFIG_VENDAS), CONFIG_VENDAS);
  for (const id of ['ganho', 'perda']) assert.throws(() => validarConfigComercial({ ...CONFIG_VENDAS, pipelines: [{ ...CONFIG_VENDAS.pipelines[0], etapas: [{ id, nome: 'Renomeado' }] }] }), /fixos/);
  assert.throws(() => validarConfigComercial({ ...CONFIG_VENDAS, pipelines: [{ ...CONFIG_VENDAS.pipelines[0], etapas: [{ id: 'x', nome: 'Ganho' }] }] }), /fixos/);
  assert.equal(resumoComercial([{ id: 'r', data: '2026-10-23', departamento: 'Vendas', status: 'concluida' }], { mes: '2026-10', departamentos: CONFIG_VENDAS.departamentos }).reunioes.length, 0);
  const eventos = ['agendada', 'concluida', 'cancelada'].map((status, i) => ({ id: String(i), status, data: '2026-10-23', departamento: 'Comercial: RM Chat', responsavel_email: 'ANA@rmchat.com' }));
  assert.deepEqual(resumoComercial([...eventos, eventos[0]], { mes: '2026-10', departamentos: CONFIG_VENDAS.departamentos, responsavel: 'ana@rmchat.com' }).totais, { agendada: 1, concluida: 1, cancelada: 1 });
  assert.equal(resumoComercial(eventos, { departamentos: [] }).reunioes.length, 0);
});

test('pipeline mantém posição ao renomear etapas; reunião realizada não significa negócio ganho', () => {
  assert.equal(posicaoComercial({ status: 'concluida' }, CONFIG_VENDAS), null, 'reunião não entra sozinha no processo');
  assert.deepEqual(posicaoComercial({ comercial_pipeline_id: 'negocios' }, CONFIG_VENDAS), { pipelineId: 'negocios', etapaId: 'contato' }, 'sem etapa: primeira etapa do processo');
  const evento = { comercial_pipeline_id: 'negocios', comercial_etapa_id: 'proposta' };
  const renomeada = structuredClone(CONFIG_VENDAS); renomeada.pipelines[0].etapas[1].nome = 'Negociação';
  assert.deepEqual(posicaoComercial(evento, renomeada), { pipelineId: 'negocios', etapaId: 'proposta' });
  for (const { id } of DESFECHOS_COMERCIAIS) assert.equal(posicaoComercial({ ...evento, comercial_etapa_id: id }, CONFIG_VENDAS).etapaId, id);
});

test('Comercial salva etapa, preserva status e responsável e respeita módulos/departamentos no servidor', async () => {
  const perfilId = crypto.randomUUID();
  const email = 'maria@rmchat.com';
  db.tables.equipe_usuarios.find((m) => m.email === email).perfil_id = perfilId;
  db.tables.perfis_acesso.push({ id: perfilId, nome: 'Comercial', modulos: ['comercial'], departamentos: ['Comercial: RM Chat'] });
  db.tables.sistema_config = [{ chave: 'comercial', valor: CONFIG_VENDAS }];
  const id = crypto.randomUUID();
  const fora = crypto.randomUUID();
  db.tables.agenda_eventos = [{ id, data: '2026-10-23', departamento: 'Comercial: RM Chat', status: 'concluida', responsavel_email: email }, { id: fora, data: '2026-10-23', departamento: 'Suporte' }];
  const pedido = async (alvo, etapaId = 'ganho') => moverComercial(await req('PATCH', '/api/comercial', { id: alvo, pipelineId: 'negocios', etapaId }, email));
  assert.equal((await pedido(fora)).status, 403);
  assert.equal((await pedido(id, 'inventada')).status, 400);
  const salvo = await pedido(id);
  assert.equal(salvo.status, 200);
  const evento = (await salvo.json()).evento;
  assert.equal(evento.comercial_etapa_id, 'ganho');
  assert.equal(evento.status, 'concluida');
  assert.equal(evento.responsavel_email, email);
  const cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}`;
  const r = await lerComercial(new NextRequest('http://localhost/api/comercial?mes=2026-10', { headers: { Cookie: cookie } }));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).eventos.map((e) => e.id), [id]);
  db.tables.perfis_acesso.find((p) => p.id === perfilId).modulos = ['agenda'];
  assert.equal((await pedido(id)).status, 403);
});

test('só administrador altera departamentos e pipelines compartilhados', async () => {
  const request = async (email) => new NextRequest('http://localhost/api/configuracoes', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'administrador' })}` }, body: JSON.stringify({ chave: 'comercial', valor: CONFIG_VENDAS }) });
  assert.equal((await salvarConfiguracao(await request('maria@rmchat.com'))).status, 403);
  assert.equal((await salvarConfiguracao(await request('lucas@rmchat.com'))).status, 200);
  assert.deepEqual(db.tables.sistema_config.find((c) => c.chave === 'comercial').valor, CONFIG_VENDAS);
});

test('Comercial consulta mês histórico completo, sem depender da janela recente da agenda', async () => {
  db.tables.sistema_config = [{ chave: 'comercial', valor: CONFIG_VENDAS }];
  db.tables.agenda_eventos = Array.from({ length: 1002 }, (_, i) => ({ id: crypto.randomUUID(), departamento: 'Comercial: RM Chat', data: '2024-02-29', status: i % 2 ? 'concluida' : 'agendada' }));
  db.tables.agenda_eventos.push({ id: crypto.randomUUID(), departamento: 'Comercial: RM Chat', data: '2024-03-01' });
  const cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken({ email: 'lucas@rmchat.com', role: 'administrador' })}`;
  const r = await lerComercial(new NextRequest('http://localhost/api/comercial?mes=2024-02', { headers: { Cookie: cookie } }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).eventos.length, 1002);
  assert.equal((await lerComercial(new NextRequest('http://localhost/api/comercial?mes=2024-13', { headers: { Cookie: cookie } }))).status, 400);
  assert.equal((await lerComercial(new NextRequest('http://localhost/api/comercial?mes=2024-02'))).status, 401);
});

test('pipeline sem migração informa o script e não simula etapa salva', async () => {
  db.tables.sistema_config = [{ chave: 'comercial', valor: CONFIG_VENDAS }];
  const id = crypto.randomUUID();
  db.tables.agenda_eventos = [{ id, departamento: 'Comercial: RM Chat', status: 'concluida' }];
  db.columns.agenda_eventos = ['id', 'departamento', 'status', 'updated_at'];
  const r = await moverComercial(await req('PATCH', '/api/comercial', { id, pipelineId: 'negocios', etapaId: 'proposta' }));
  assert.equal(r.status, 500);
  assert.match((await r.json()).mensagem, /migration_comercial_pipeline.sql/);
  assert.equal(db.tables.agenda_eventos[0].comercial_etapa_id, undefined);
});

test('leads de webhook aparecem na pipeline sem criar reuniões e respeitam permissões e mês de encerramento', async () => {
  db.tables.sistema_config = [{ chave: 'comercial', valor: CONFIG_VENDAS }];
  db.tables.agenda_eventos = [];
  const id = crypto.randomUUID();
  db.tables.comercial_leads = [
    { id, nome: 'Lead recebido', departamento: 'Comercial: RM Chat', comercial_pipeline_id: 'negocios', comercial_etapa_id: 'contato', updated_at: '2025-01-01T10:00:00Z' },
    { id: crypto.randomUUID(), departamento: 'Comercial: RM Chat', comercial_etapa_id: 'ganho', updated_at: '2026-10-23T10:00:00Z' },
    { id: crypto.randomUUID(), departamento: 'Comercial: RM Chat', comercial_etapa_id: 'perda', updated_at: '2026-09-23T10:00:00Z' },
    { id: crypto.randomUUID(), departamento: 'Suporte', comercial_etapa_id: 'contato' },
  ];
  const cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken({ email: 'lucas@rmchat.com', role: 'administrador' })}`;
  const r = await lerComercial(new NextRequest('http://localhost/api/comercial?mes=2026-10', { headers: { Cookie: cookie } }));
  const resposta = await r.json(); assert.equal(resposta.eventos.length, 0); assert.equal(resposta.leads.length, 2);
  const mover = await moverComercial(await req('PATCH', '/api/comercial', { id, tipo: 'lead', pipelineId: 'negocios', etapaId: 'proposta', responsavel_email: 'maria@rmchat.com' }));
  assert.equal(mover.status, 200); const lead = (await mover.json()).evento;
  assert.equal(lead.comercial_etapa_id, 'proposta'); assert.equal(lead.responsavel_email, 'maria@rmchat.com'); assert.ok(lead.ultima_ocorrencia_em);
  assert.equal(db.tables.agenda_eventos.length, 0);
  assert.equal((await moverComercial(await req('PATCH', '/api/comercial', { id, tipo: 'lead', pipelineId: 'negocios', etapaId: 'proposta', responsavel_email: 'naoexiste@rmchat.com' }))).status, 400);
});

test('excluir oportunidade: lead é apagado; reunião sai do processo e continua na agenda; editar lead valida', async () => {
  db.tables.sistema_config = [{ chave: 'comercial', valor: CONFIG_VENDAS }];
  const reuniao = crypto.randomUUID();
  const lead = crypto.randomUUID();
  const fora = crypto.randomUUID();
  db.tables.agenda_eventos = [
    { id: reuniao, data: '2026-10-23', departamento: 'Comercial: RM Chat', status: 'agendada', comercial_pipeline_id: 'negocios', comercial_etapa_id: 'proposta' },
    { id: fora, data: '2026-10-23', departamento: 'Suporte' },
  ];
  db.tables.comercial_leads = [{ id: lead, nome: 'Lead', email: '', telefone: '', departamento: 'Comercial: RM Chat', comercial_pipeline_id: 'negocios', comercial_etapa_id: 'contato', updated_at: '2026-10-23T10:00:00Z' }];

  const editar = async (corpo) => moverComercial(await req('PATCH', '/api/comercial', { id: lead, tipo: 'lead', acao: 'editar_lead', ...corpo }));
  assert.equal((await editar({ nome: 'Clínica Sorriso', email: 'nao-e-email' })).status, 400);
  const ok = await editar({ nome: 'Clínica Sorriso', email: 'Contato@Sorriso.com', telefone: '(85) 99999-0000' });
  assert.equal(ok.status, 200);
  assert.equal(db.tables.comercial_leads[0].nome, 'Clínica Sorriso');
  assert.equal(db.tables.comercial_leads[0].email, 'contato@sorriso.com');
  assert.equal(db.tables.comercial_leads[0].comercial_etapa_id, 'contato', 'editar não mexe na etapa');

  const excluir = async (id, tipo) => excluirComercial(await req('DELETE', '/api/comercial', { id, tipo }));
  assert.equal((await excluir(fora, 'reuniao')).status, 403, 'fora dos departamentos do comercial');
  assert.equal((await excluir(reuniao, 'reuniao')).status, 200);
  const r = db.tables.agenda_eventos.find((e) => e.id === reuniao);
  assert.ok(r, 'a reunião continua na agenda');
  assert.equal(posicaoComercial(r, CONFIG_VENDAS), null, 'some do processo comercial');
  assert.equal((await excluir(lead, 'lead')).status, 200);
  assert.equal(db.tables.comercial_leads.length, 0);
});
