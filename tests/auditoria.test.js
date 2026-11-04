// Auditoria: registros feitos pelo servidor (nome, e-mail, IP real e navegador da requisição), leitura por dia.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { db, supabase as mockSupabase } from './mocks/supabase.js';
import { __definirSupabaseAdmin } from '../src/lib/server/integracaoSuporte.js';
import { ORG_PLATAFORMA } from '../src/lib/server/organizacao.js';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session.js';
import { GET as lerAuditoria, POST as registrar } from '../src/app/api/auditoria/route.js';
import { descreverLog, limitesDoDia, resumoNavegador, termoDeBusca, validarEventoAuditoria } from '../src/lib/auditoria.js';

__definirSupabaseAdmin(mockSupabase);

const A = crypto.randomUUID();
const B = crypto.randomUUID();
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

beforeEach(() => {
  db.reset();
  db.tables.organizacoes = [
    { id: ORG_PLATAFORMA, nome: 'RM Controle', tipo: 'plataforma', status: 'ativa', limites: {} },
    { id: A, nome: 'Clínica A', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
    { id: B, nome: 'Clínica B', tipo: 'assinante', pai_id: ORG_PLATAFORMA, status: 'ativa', limites: {} },
  ];
  db.tables.sessoes_suporte = [];
  db.tables.rm_admins_proprietarios = [];
  db.tables.equipe_usuarios = [
    { id: crypto.randomUUID(), email: 'ana@a.com', nome: 'Ana Souza', papel: 'administrador', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'bia@a.com', nome: 'Bia Lima', papel: 'suporte', ativo: true, organizacao_id: A },
    { id: crypto.randomUUID(), email: 'caio@b.com', nome: 'Caio', papel: 'administrador', ativo: true, organizacao_id: B },
  ];
  db.tables.auditoria_logs = [];
});

const como = async (email, url, metodo = 'GET', body, cabecalhos = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken({ email, role: 'suporte' })}`, ...cabecalhos },
    body: body ? JSON.stringify(body) : undefined,
  });
const ler = async (r) => ({ status: r.status, ...(await r.json()) });

test('regras: validação do evento, dias no fuso, busca segura, navegador e descrição', () => {
  assert.throws(() => validarEventoAuditoria({ acao: 'DROP TABLE' }), /inválida/);
  const ev = validarEventoAuditoria({ acao: 'cancelou_suporte_tecnico', empresaId: 'x', detalhes: { empresa_nome: 'DV', ip: '1.1.1.1', usuario_nome: 'Falso', lista: [1], modulo: 'Fila de Suporte' } });
  assert.equal(ev.empresa_id, null);
  assert.equal(ev.detalhes.ip, undefined, 'IP nunca vem do navegador');
  assert.equal(ev.detalhes.usuario_nome, undefined, 'nome nunca vem do navegador');
  assert.equal(ev.detalhes.lista, undefined);
  assert.equal(ev.detalhes.modulo, 'Demandas');
  // Brasil (UTC-3): o dia 28 começa às 03:00 UTC
  assert.deepEqual(limitesDoDia('2026-10-28', 180), { de: '2026-10-28T03:00:00.000Z', ate: '2026-10-29T03:00:00.000Z' });
  assert.throws(() => limitesDoDia('28/10/2026'), /Dia/);
  assert.equal(termoDeBusca('ana,(x)*%'), 'ana  x');
  assert.equal(resumoNavegador(CHROME_MAC), 'Chrome 130 · macOS');
  const v = descreverLog({ acao: 'finalizou_suporte_tecnico', usuario_nome: 'Ana Souza', usuario_email: 'ana@a.com', detalhes: { empresa_nome: 'DV Protec', motivo: 'Dúvida', status_resolucao: 'sem_resposta', duracao_segundos: 600, ip: '200.1.2.3', navegador: 'Chrome 130 · macOS', modulo: 'Fila de Suporte' } });
  assert.equal(v.acao, 'Concluiu demanda');
  assert.equal(v.modulo, 'Demandas');
  assert.equal(v.empresa, 'DV Protec');
  assert.match(v.descricao, /Motivo: Dúvida · Desfecho: sem retorno do cliente · Tempo: 10 min/);
  assert.equal(v.ip, '200.1.2.3');
  assert.equal(descreverLog({ acao: 'x', ip_origem: 'Rede Local / Cliente Seguro', detalhes: { ip: '9.9.9.9' } }).ip, '9.9.9.9', 'IP falso antigo é ignorado');
});

test('POST registra com nome, e-mail, IP real e navegador do servidor, na empresa da pessoa', async () => {
  const r = await ler(
    await registrar(
      await como('bia@a.com', '/api/auditoria', 'POST', { acao: 'adicionou_chamado_na_fila', detalhes: { empresa_nome: 'DV Protec', modulo: 'Fila de Suporte', ip: '6.6.6.6' }, usuarioEmail: 'ana@a.com' }, {
        'x-real-ip': '177.10.20.30',
        'x-forwarded-for': '177.10.20.30, 10.0.0.1',
        'user-agent': CHROME_MAC,
      })
    )
  );
  assert.equal(r.ok, true);
  const [log] = db.tables.auditoria_logs;
  assert.equal(log.usuario_email, 'bia@a.com', 'quem fez vem da sessão, não do corpo');
  assert.equal(log.usuario_nome, 'Bia Lima');
  assert.equal(log.organizacao_id, A);
  assert.equal(log.ip_origem, '177.10.20.30');
  assert.equal(log.detalhes.ip, '177.10.20.30');
  assert.equal(log.detalhes.ip_cadeia, '177.10.20.30, 10.0.0.1');
  assert.equal(log.detalhes.navegador, 'Chrome 130 · macOS');
  assert.equal(log.detalhes.modulo, 'Demandas');
  assert.equal((await registrar(await como('bia@a.com', '/api/auditoria', 'POST', { acao: '' }))).status, 400);
});

test('GET: só administradores, por dia, com busca e paginação; outra empresa não aparece', async () => {
  const em = (iso) => new Date(iso).toISOString();
  db.tables.auditoria_logs = [
    { id: crypto.randomUUID(), organizacao_id: A, usuario_email: 'bia@a.com', usuario_nome: 'Bia Lima', acao: 'cancelou_suporte_tecnico', detalhes: { empresa_nome: 'DV Protec', modulo: 'Demandas', ip: '177.1.1.1' }, created_at: em('2026-10-28T12:00:00Z') },
    { id: crypto.randomUUID(), organizacao_id: A, usuario_email: 'ana@a.com', usuario_nome: 'Ana Souza', acao: 'chat_assumiu', detalhes: { modulo: 'Chat' }, created_at: em('2026-10-28T15:00:00Z') },
    { id: crypto.randomUUID(), organizacao_id: A, usuario_email: 'ana@a.com', usuario_nome: 'Ana Souza', acao: 'chat_assumiu', detalhes: { modulo: 'Chat' }, created_at: em('2026-10-29T02:30:00Z') },
    { id: crypto.randomUUID(), organizacao_id: A, usuario_email: 'ana@a.com', usuario_nome: 'Ana Souza', acao: 'chat_resolveu', detalhes: { modulo: 'Chat' }, created_at: em('2026-10-27T12:00:00Z') },
    { id: crypto.randomUUID(), organizacao_id: B, usuario_email: 'caio@b.com', usuario_nome: 'Caio', acao: 'chat_assumiu', detalhes: { modulo: 'Chat' }, created_at: em('2026-10-28T13:00:00Z') },
  ];
  assert.equal((await lerAuditoria(await como('bia@a.com', '/api/auditoria?dia=2026-10-28&fuso=180'))).status, 403, 'quem não é administrador não lê');

  const dia = await ler(await lerAuditoria(await como('ana@a.com', '/api/auditoria?dia=2026-10-28&fuso=180')));
  assert.equal(dia.total, 3, 'inclui 23:30 do dia 28 no Brasil; exclui o dia 27 e a outra empresa');
  const busca = await ler(await lerAuditoria(await como('ana@a.com', '/api/auditoria?dia=2026-10-28&fuso=180&busca=dv%20protec')));
  assert.equal(busca.total, 1);
  const porIp = await ler(await lerAuditoria(await como('ana@a.com', '/api/auditoria?dia=2026-10-28&fuso=180&busca=177.1')));
  assert.equal(porIp.total, 1);
  const pagina = await ler(await lerAuditoria(await como('ana@a.com', '/api/auditoria?dia=2026-10-28&fuso=180&porPagina=10&pagina=2')));
  assert.equal(pagina.registros.length, 0);

  const resumo = await ler(await lerAuditoria(await como('ana@a.com', '/api/auditoria?resumo=1&ate=2026-10-28&dias=3&fuso=180')));
  assert.deepEqual(resumo.dias, { '2026-10-26': 0, '2026-10-27': 1, '2026-10-28': 3 });
});

test('histórico: toda ação mostra empresa ou descrição (chat, empresa cadastrada, plataforma)', () => {
  const chat = descreverLog({ acao: 'chat_resolveu', detalhes: { contato_nome: 'Maria Souza', canal: 'Lucas' } });
  assert.equal(chat.descricao, 'Contato: Maria Souza · Canal: Lucas');
  const cadastro = descreverLog({ acao: 'cadastrou_empresa_manual', detalhes: { nome: 'Mefa Construções', tipo_cliente: 'existente' } });
  assert.equal(cadastro.empresa, 'Mefa Construções');
  const plataforma = descreverLog({ acao: 'plataforma_criou_empresa', detalhes: { empresa: 'Hanilton Advocacia', tipo: 'assinante' } });
  assert.equal(plataforma.empresa, 'Hanilton Advocacia');
  const colaborador = descreverLog({ acao: 'adicionou_colaborador_empresa', detalhes: { nome: 'Felipe', cargo: 'Solicitante' } });
  assert.match(colaborador.descricao, /Nome: Felipe/);
});

test('histórico: completa conversa e empresa antigas só na hora de mostrar', async () => {
  const { enriquecerRegistros } = await import('../src/lib/server/auditoriaEnriquecer.js');
  const tabelas = {
    conversas: [{ id: 'c1', contato_id: 'p1', canal_id: 'k1' }],
    contatos: [{ id: 'p1', nome: 'Maria Souza', telefone: '5585' }],
    canais: [{ id: 'k1', nome: 'Lucas' }],
    empresas: [{ id: 'e1', nome: 'Polysite' }],
  };
  const db = { from: (t) => ({ select: () => ({ in: async () => ({ data: tabelas[t] }) }) }) };
  const r = await enriquecerRegistros(db, [
    { acao: 'chat_visualizou', detalhes: { conversa_id: 'c1' } },
    { acao: 'atualizou_dados_empresa', empresa_id: 'e1', detalhes: {} },
    { acao: 'chat_resolveu', detalhes: { conversa_id: 'c1', contato_nome: 'Já gravado' } },
  ]);
  assert.equal(r[0].detalhes.contato_nome, 'Maria Souza');
  assert.equal(r[0].detalhes.canal, 'Lucas');
  assert.equal(r[1].detalhes.empresa_nome, 'Polysite');
  assert.equal(r[2].detalhes.contato_nome, 'Já gravado');
});
