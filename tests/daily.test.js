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

test('ticket #22: gravações dos feedbacks só para feedbacks da empresa, com formato e tamanho conferidos', async () => {
  const { GET, POST } = await import('../src/app/api/feedbacks/gravacao/route.js');
  const meu = crypto.randomUUID();
  const deOutra = crypto.randomUUID();
  db.tables.feedbacks = [
    { id: meu, organizacao_id: A, titulo: 'Bug', descricao: 'x' },
    { id: deOutra, organizacao_id: B, titulo: 'Outro', descricao: 'y' },
  ];
  const pedir = async (email, corpo) => ler(await POST(await como(email, '/api/feedbacks/gravacao', 'POST', corpo)));
  const ok = await pedir('ana@a.com', { feedback: meu, mime: 'video/webm;codecs=vp9,opus', tamanho: 5_000_000 });
  assert.equal(ok.ok, true);
  assert.match(ok.caminho, new RegExp(`^${A}/${meu}/\\d+-tela-[0-9a-f]{8}\\.webm$`), 'pasta da empresa e do feedback');
  assert.equal(ok.pasta, 'feedback-gravacoes');
  assert.equal((await pedir('ana@a.com', { feedback: deOutra, mime: 'audio/webm', tamanho: 1000 })).status, 404, 'feedback de outra empresa');
  assert.equal((await pedir('ana@a.com', { feedback: meu, mime: 'text/html', tamanho: 1000 })).status, 400, 'formato não aceito');
  assert.equal((await pedir('ana@a.com', { feedback: meu, mime: 'audio/webm', tamanho: 60 * 1024 * 1024 })).status, 400, 'acima de 50 MB');
  // Depois do envio, aparece com link temporário
  db.arquivos = { ...(db.arquivos || {}), [`feedback-gravacoes/${ok.caminho}`]: { dados: 'x' } };
  const lista = await ler(await GET(await como('ana@a.com', `/api/feedbacks/gravacao?feedback=${meu}`)));
  assert.equal(lista.gravacoes.length, 1);
  assert.equal(lista.gravacoes[0].tipo, 'tela');
  assert.ok(lista.gravacoes[0].url.includes('/sign/'));
  assert.equal((await GET(await como('caio@b.com', `/api/feedbacks/gravacao?feedback=${meu}`))).status, 404, 'outra empresa não vê');
});

test('proprietário vira membro da empresa sem mexer no login, e não pode ser desativado, rebaixado nem removido', async () => {
  const { GET, POST, PATCH, DELETE } = await import('../src/app/api/equipe/route.js');
  db.tables.rm_admins_proprietarios = [{ email: 'lucas.rmchat@gmail.com', organizacao_id: A }];
  const dono = 'lucas.rmchat@gmail.com';
  const situacao = await ler(await GET(await como(dono, '/api/equipe?proprietario=1')));
  assert.deepEqual([situacao.proprietario, situacao.vinculado, situacao.podeVincular], [true, false, true]);

  const r = await ler(await POST(await como(dono, '/api/equipe', 'POST', { acao: 'vincular_proprietario', nome: 'Lucas Amorim' })));
  assert.equal(r.ok, true);
  const linha = db.tables.equipe_usuarios.find((u) => u.email === dono);
  assert.deepEqual([linha.organizacao_id, linha.papel, linha.ativo, linha.nome], [A, 'administrador', true, 'Lucas Amorim']);
  assert.ok(linha.senha && linha.senha.length >= 24, 'senha aleatória (o login de verdade não muda)');
  assert.equal((await POST(await como(dono, '/api/equipe', 'POST', { acao: 'vincular_proprietario' }))).status, 409);
  // Quem não é proprietário não usa a opção
  assert.equal((await POST(await como('ana@a.com', '/api/equipe', 'POST', { acao: 'vincular_proprietario' }))).status, 403);

  // Editar: nome e departamentos sim; papel, perfil e ativo não
  const ed = await ler(await PATCH(await como('ana@a.com', '/api/equipe', 'PATCH', { id: linha.id, nome: 'Lucas', departamentos: ['Suporte'], papel: 'suporte', perfil_id: PERFIL_SO_FILA })));
  assert.equal(ed.ok, true);
  const depois = db.tables.equipe_usuarios.find((u) => u.email === dono);
  assert.deepEqual([depois.nome, depois.departamentos, depois.papel, depois.perfil_id ?? null], ['Lucas', ['Suporte'], 'administrador', null]);
  assert.equal((await PATCH(await como('ana@a.com', '/api/equipe', 'PATCH', { id: linha.id, ativo: false }))).status, 400);
  assert.equal((await DELETE(await como('ana@a.com', '/api/equipe', 'DELETE', { id: linha.id }))).status, 400);
  assert.ok(db.tables.equipe_usuarios.some((u) => u.email === dono));
});

test('avisos na tela: configuração validada e filtro por tipo', async () => {
  const { validarAvisos, deveMostrar, AVISOS_PADRAO } = await import('../src/lib/avisosTela.js');
  assert.deepEqual(validarAvisos({}), AVISOS_PADRAO);
  const c = validarAvisos({ estilo: 'hack', duracao: 7, maximo: 9, tipos: ['chat', 'xyz'], flashCor: 'rosa-neon', flashIntervalo: 1 });
  assert.deepEqual([c.estilo, c.duracao, c.maximo, c.tipos, c.flashCor, c.flashIntervalo], ['ilha', 6, 3, ['chat'], 'acento', 60]);
  assert.equal(deveMostrar({ tipo: 'chat' }, c), true);
  assert.equal(deveMostrar({ tipo: 'sla' }, c), false, 'fila desmarcada');
  assert.equal(deveMostrar({ tipo: 'prazo' }, { ...c, tipos: ['fila'] }), true, 'prazo e SLA contam como Fila');
  assert.equal(deveMostrar({ tipo: 'chat' }, { ...c, estilo: 'desligado' }), false);
});
