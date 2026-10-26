// Validação SQL real e isolada. Executar com RM_PGLITE_MODULE apontando para @electric-sql/pglite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulo = process.env.RM_PGLITE_MODULE;
test('SQL real: criação, idempotência, ordenação, movimentação e rollback transacional', { skip: !modulo }, async () => {
 const { PGlite } = await import(pathToFileURL(modulo).href);
 const db = new PGlite();
 try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE public.sistema_config(chave text PRIMARY KEY, valor jsonb);");
  const sql = await readFile(new URL('../supabase/migration_comercial_webhooks.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql); // reaplicação segura
  const config = { departamentos: ['Comercial'], pipelines: [{ id: 'vendas', etapas: [{ id: 'qualificacao' }, { id: 'proposta' }] }, { id: 'expansao', etapas: [{ id: 'diagnostico' }] }] };
  await db.query('INSERT INTO public.sistema_config VALUES ($1,$2)', ['comercial', config]);
  const { rows } = await db.query("INSERT INTO comercial_integracoes(nome,tenant_id,pipeline_id,departamento,etapa_inicial_id,token_hash,token_prefixo,ativo,criado_por) VALUES('Teste','1','vendas','Comercial','qualificacao','hash','prefixo',true,'admin@example.test') RETURNING id");
  const id = rows[0].id;
  const dados = { externo_id: '1:9902', nome: 'Exemplo', email: '', telefone: '559999009900', ocorrido_em: '2026-01-02T10:00:00Z', evento: 'UpdateOnTicket' };
  const chamar = async (evento, hash, d = dados, etapa = null, segredo = 'hash') => (await db.query('SELECT rm_receber_lead_comercial($1,$2,$3,$4,$5,$6) AS r', [id, segredo, evento, hash, d, etapa])).rows[0].r;
  const criada = await chamar('e1', 'h1'); assert.equal(criada.criado, true); assert.equal(criada.etapa_id, 'qualificacao');
  assert.equal((await chamar('e1', 'h1')).repetido, true);
  assert.equal((await chamar('e1', 'outro')).codigo, 'evento_conflitante');
  assert.equal((await chamar('e2', 'h2', { ...dados, ocorrido_em: '2026-01-03T10:00:00Z' }, 'proposta')).etapa_id, 'proposta');
  assert.equal((await chamar('e3', 'h3', { ...dados, ocorrido_em: '2026-01-04T10:00:00Z' })).etapa_id, 'proposta', 'sem regra não volta para qualificação');
  assert.equal((await chamar('e4', 'h4', dados, 'qualificacao')).ignorado, true);
  assert.equal((await chamar('e5', 'h5', { ...dados, ocorrido_em: '2026-01-05T10:00:00Z' }, 'ganho')).etapa_id, 'ganho');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM comercial_leads')).rows[0].n, 1);
  assert.equal((await chamar('e6', 'h6', dados, null, 'revogado')).codigo, 'token_invalido');
  await assert.rejects(chamar('erro', 'h7', { ...dados, ocorrido_em: '2026-01-06T10:00:00Z' }, 'inexistente'));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM comercial_webhook_eventos WHERE evento_id='erro'")).rows[0].n, 0, 'rollback inclui o recibo para permitir nova tentativa');
  assert.equal((await db.query('SELECT comercial_etapa_id FROM comercial_leads')).rows[0].comercial_etapa_id, 'ganho');
  await db.query("UPDATE comercial_leads SET comercial_pipeline_id='expansao', comercial_etapa_id='diagnostico'");
  assert.equal((await chamar('e8', 'h8', { ...dados, ocorrido_em: '2026-01-08T10:00:00Z' })).etapa_id, 'diagnostico', 'sem regra preserva transferência manual para outra pipeline');
  const permissoes = await db.query("SELECT has_table_privilege('authenticated','comercial_integracoes','SELECT') AS ler_token, has_function_privilege('anon','rm_receber_lead_comercial(uuid,text,text,text,jsonb,text)','EXECUTE') AS enviar_anon");
  assert.equal(permissoes.rows[0].ler_token, false); assert.equal(permissoes.rows[0].enviar_anon, false);
 } finally { await db.close(); }
});
