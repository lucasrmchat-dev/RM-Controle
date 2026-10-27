// Daily (ticket #21) e módulos contratados pela empresa.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { GET as lerDaily, POST as agirDaily } from '../src/app/api/daily/route.js';
import { GET as listarChat } from '../src/app/api/chat/route.js';
import { semanaDe, validarMeta, validarReuniao, progressoMetas } from '../src/lib/daily.js';
import { moduloContratado, validarLimites } from '../src/lib/plataforma.js';
import { permissoesEfetivas } from '../src/lib/perfis.js';

__definirSupabaseAdmin(mockSupabase);

const A = crypto.randomUUID();
const B = crypto.randomUUID();
const PERFIL_SO_FILA = crypto.randomUUID();

beforeEach(() => {
  db.reset();
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
    { id: B, nome: 'Clínica B', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: { modulos: ['fila', 'agenda'] } },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.perfis_acesso = [{ id: PERFIL_SO_FILA, organizacao_id: A, nome: 'Só fila', administrador: false, todos_departamentos: true, modulos: ['fila'] }];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana Souza', papel: 'administrador', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'bia@a.com', nome: 'Bia Lima', papel: 'suporte', ativo: true, organizacao_id: A, perfil_id: PERFIL_SO_FILA },
    { id: crypto.randomUUID(), email: 'caio@b.com', nome: 'Caio', papel: 'administrador', ativo: true, organizacao_id: B },
  ];
  db.tables.daily_reunioes = [];
  db.tables.daily_metas = [];
  db.tables.sistema_config = [];
});

const como = async (email, url, metodo = 'GET', body) =>
  new NextRequest(`http://localhost${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}` }, body: body ? JSON.stringify(body) : undefined });
const ler = async (r) => ({ status: r.status, ...(await r.json()) });

test('regras do Daily: semana começa na segunda, validações e progresso', () => {
  assert.equal(semanaDe('2026-10-27'), '2026-10-26');
  assert.equal(semanaDe('2026-11-01'), '2026-10-26', 'domingo é o fim da semana');
  assert.equal(semanaDe('2026-10-26'), '2026-10-26');
  assert.throws(() => validarReuniao({ data: '27/10/2026' }), /Data/);
  assert.equal(validarReuniao({ data: '2026-10-27', titulo: '  ' }).titulo, 'Daily');
  assert.throws(() => validarMeta({ texto: 'x' }), /meta/);
  assert.equal(validarMeta({ texto: 'Fechar 3 contratos', semana: '2026-10-29' }).semana, '2026-10-26');
  assert.deepEqual(progressoMetas([{ concluida_em: 'x' }, {}]), { feitas: 1, total: 2, fracao: 0.5 });
});

test('Daily pela API: cria reunião e metas, edita resumo, conclui meta; outra empresa não vê', async () => {
  const pedir = async (email, corpo) => ler(await agirDaily(await como(email, '/api/daily', 'POST', corpo)));
  const r = await pedir('ana@a.com', { acao: 'criar_reuniao', data: '2026-10-27', titulo: 'Daily manhã' });
  assert.equal(r.ok, true);
  const r2 = await pedir('ana@a.com', { acao: 'criar_reuniao', data: '2026-10-27', titulo: 'Daily tarde' });
  assert.equal(r2.ok, true, 'mais de uma daily no mesmo dia');
  const ed = await pedir('ana@a.com', { acao: 'editar_reuniao', id: r.reuniao.id, resumo: 'Tudo certo', atualizacoes_clickmassa: 'Nova versão do disparo' });
  assert.equal(ed.reuniao.resumo, 'Tudo certo');
  assert.equal(ed.reuniao.atualizacoes_clickmassa, 'Nova versão do disparo');
  const meta = await pedir('ana@a.com', { acao: 'criar_meta', semana: '2026-10-28', texto: 'Migrar 5 clientes', responsavel_email: 'bia@a.com' });
  assert.equal(meta.meta.semana, '2026-10-26');
  assert.equal(meta.meta.responsavel_nome, 'Bia Lima');
  const feita = await pedir('ana@a.com', { acao: 'editar_meta', id: meta.meta.id, concluida: true });
  assert.ok(feita.meta.concluida_em);
  assert.equal(feita.meta.concluida_por, 'ana@a.com');

  const semana = await ler(await lerDaily(await como('ana@a.com', '/api/daily?semana=2026-10-30')));
  assert.equal(semana.semana, '2026-10-26');
  assert.equal(semana.reunioes.length, 2);
  assert.equal(semana.metas.length, 1);
  const outra = await ler(await lerDaily(await como('ana@a.com', '/api/daily?semana=2026-11-02')));
  assert.equal(outra.reunioes.length, 0);
  assert.ok(db.tables.daily_reunioes.every((x) => x.organizacao_id === A), 'gravado na empresa da pessoa');

  // Perfil sem o módulo Daily
  assert.equal((await lerDaily(await como('bia@a.com', '/api/daily'))).status, 403);
  // Empresa que não contratou o Daily
  const caio = await ler(await lerDaily(await como('caio@b.com', '/api/daily')));
  assert.equal(caio.status, 403);
  assert.match(caio.mensagem, /plano/);
  assert.equal((await pedir('ana@a.com', { acao: 'excluir_reuniao', id: r2.reuniao.id })).ok, true);
  assert.equal(db.tables.daily_reunioes.length, 1);
});

test('módulos contratados: limitam até o administrador e o servidor recusa o que não foi contratado', async () => {
  assert.deepEqual(validarLimites({ usuarios: 5, modulos: ['chat', 'daily', 'hackear'] }, 'assinante'), { usuarios: 5, modulos: ['chat', 'daily'] });
  assert.equal(validarLimites({}, 'assinante').modulos, undefined, 'sem lista = todos');
  assert.equal(moduloContratado({ tipo: 'assinante', limites: {} }, 'chat'), true);
  assert.equal(moduloContratado({ tipo: 'assinante', limites: { modulos: ['fila'] } }, 'chat'), false);
  assert.equal(moduloContratado({ tipo: 'plataforma', limites: { modulos: [] } }, 'chat'), true);
  const admin = permissoesEfetivas({ email: 'caio@b.com', equipe: [{ email: 'caio@b.com', papel: 'administrador' }], modulosDaEmpresa: ['fila', 'agenda'] });
  assert.equal(admin.administrador, true);
  assert.ok(admin.modulos.includes('fila') && admin.modulos.includes('configuracoes'));
  assert.equal(admin.modulos.includes('chat'), false);
  assert.equal(admin.modulos.includes('daily'), false);
  const r = await ler(await listarChat(await como('caio@b.com', '/api/chat')));
  assert.equal(r.status, 403);
  assert.match(r.mensagem, /plano/);
});
