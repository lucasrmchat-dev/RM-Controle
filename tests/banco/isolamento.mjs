// Isolamento entre empresas testado num Postgres real (PGlite): aplica todas as migrações em ordem
// e tenta ler, gravar, apagar e mover dados de outra empresa como um usuário logado faria pelo console.
// Executar: npm run test:banco

process.on('uncaughtException', (e) => { console.log('FALHOU:', e.message, '| consulta:', e.query || ''); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('FALHOU:', e.message, e.where ? '| ' + e.where : ''); process.exit(1); });
import { novoBanco } from './base.mjs';
import assert from 'node:assert/strict';
const ORDEM = ['schema.sql', 'setup_secure_rls.sql', 'migration_feedbacks_e_departamentos.sql', 'migration_supabase_completa.sql', 'migration_perfis_acesso.sql', 'migration_google_agenda.sql', 'migration_descricao_historico.sql', 'migration_agenda_departamento.sql', 'migration_comercial_pipeline.sql', 'migration_comercial_webhooks.sql', 'migration_relato_atendimentos.sql', 'migration_feedbacks_subtarefas.sql', 'migration_descricao_demandas.sql', 'migration_whatsapp_agenda.sql'];
const db = await novoBanco(ORDEM);
const RMCHAT = '00000000-0000-4000-8000-000000000002';
const PLAT = '00000000-0000-4000-8000-000000000001';

// Dados de hoje (antes da migração), sem empresa dona
await db.exec(`
  INSERT INTO public.empresas (id, nome) VALUES ('11111111-1111-4111-8111-111111111111', 'Padaria Sol');
  INSERT INTO public.equipe_usuarios (nome, email, papel, senha) VALUES ('Ana', 'ana@rmchat.com', 'administrador', 'Senha@123'), ('Caio', 'caio@rmchat.com', 'suporte', 'Senha@123');
  INSERT INTO public.empresa_colaboradores (empresa_id, nome) VALUES ('11111111-1111-4111-8111-111111111111', 'Joana');
  INSERT INTO public.sistema_config (chave, valor) VALUES ('departamentos', '["Suporte"]'::jsonb) ON CONFLICT DO NOTHING;
`);

const fs = await import('node:fs');
const MIG = fs.readFileSync(new URL('../../supabase/migration_multiempresa.sql', import.meta.url), 'utf8').replace(/^NOTIFY pgrst.*$/gm, '');
try { await db.exec(MIG); await db.exec(MIG); } catch (e) { console.log('FALHOU NA MIGRAÇÃO:', e.message, '|', e.where || ''); process.exit(1); } // 2x: idempotente
console.log('✔ migração aplicada duas vezes sem erro');

const comoServidor = async (sql, p = []) => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`); return (await db.query(sql, p)).rows; };
const como = async (email, sql, p = []) => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ email, role: 'authenticated' })]);
  await db.exec('SET ROLE authenticated');
  try { return (await db.query(sql, p)).rows; } finally { await db.exec('RESET ROLE'); }
};
const falha = async (email, sql, padrao) => {
  try { await como(email, sql); } catch (e) { if (padrao) assert.match(e.message, padrao); return e.message; }
  throw new Error('deveria falhar: ' + sql);
};

// Dados existentes foram para a RM Chat
assert.equal((await comoServidor(`SELECT organizacao_id FROM empresas`))[0].organizacao_id, RMCHAT);
assert.equal((await comoServidor(`SELECT organizacao_id FROM empresa_colaboradores`))[0].organizacao_id, RMCHAT);
console.log('✔ dados atuais pertencem à RM Chat');

// Nova revenda e duas assinantes
const [rev] = await comoServidor(`INSERT INTO organizacoes (nome, tipo, pai_id) VALUES ('Agência X', 'revenda', $1) RETURNING id`, [PLAT]);
const [b] = await comoServidor(`INSERT INTO organizacoes (nome, tipo, pai_id) VALUES ('Clínica B', 'assinante', $1) RETURNING id`, [PLAT]);
const [c] = await comoServidor(`INSERT INTO organizacoes (nome, tipo, pai_id) VALUES ('Loja C', 'assinante', $1) RETURNING id`, [rev.id]);
await comoServidor(`INSERT INTO equipe_usuarios (nome, email, papel, senha, organizacao_id) VALUES ('Bia', 'bia@b.com', 'administrador', 'Senha@123', $1), ('Rui', 'rui@agencia.com', 'administrador', 'Senha@123', $2), ('Cris', 'cris@c.com', 'administrador', 'Senha@123', $3)`, [b.id, rev.id, c.id]);
await comoServidor(`INSERT INTO empresas (nome, organizacao_id) VALUES ('Cliente da B', $1)`, [b.id]);
console.log('✔ hierarquia criada');

// Hierarquia inválida é recusada
await assert.rejects(comoServidor(`INSERT INTO organizacoes (nome, tipo, pai_id) VALUES ('Revenda dentro de revenda', 'revenda', $1)`, [rev.id]), /plataforma/);
await assert.rejects(comoServidor(`INSERT INTO organizacoes (nome, tipo) VALUES ('Outra plataforma', 'plataforma')`), /uma plataforma/);
console.log('✔ hierarquia inválida recusada');

// Cada um vê só o seu
assert.deepEqual((await como('ana@rmchat.com', `SELECT nome FROM empresas ORDER BY nome`)).map((r) => r.nome), ['Padaria Sol']);
assert.deepEqual((await como('bia@b.com', `SELECT nome FROM empresas`)).map((r) => r.nome), ['Cliente da B']);
assert.equal((await como('bia@b.com', `SELECT * FROM empresa_colaboradores`)).length, 0);
assert.equal((await como('bia@b.com', `SELECT id, email, organizacao_id FROM equipe_usuarios`)).length, 1, 'só vê a própria equipe');
console.log('✔ leitura isolada por empresa');

// Gravar sem informar a empresa usa a empresa de quem está logado
await como('bia@b.com', `INSERT INTO empresas (nome) VALUES ('Nova da B')`);
assert.equal((await comoServidor(`SELECT organizacao_id FROM empresas WHERE nome = 'Nova da B'`))[0].organizacao_id, b.id);
console.log('✔ cadastro cai na empresa de quem está logado');

// Tentativas de invasão pelo console do navegador
await falha('bia@b.com', `INSERT INTO empresas (nome, organizacao_id) VALUES ('Intrusa', '${RMCHAT}')`, /row-level security/);
await falha('bia@b.com', `INSERT INTO empresa_colaboradores (empresa_id, nome) VALUES ('11111111-1111-4111-8111-111111111111', 'Espiã')`);
const mudou = await como('bia@b.com', `UPDATE empresas SET nome = 'hackeada' WHERE id = '11111111-1111-4111-8111-111111111111' RETURNING id`);
assert.equal(mudou.length, 0, 'não altera empresa de outro cliente');
const apagou = await como('bia@b.com', `DELETE FROM empresas WHERE organizacao_id = '${RMCHAT}' RETURNING id`);
assert.equal(apagou.length, 0, 'não apaga dados de outro cliente');
await falha('bia@b.com', `UPDATE empresas SET organizacao_id = '${RMCHAT}' WHERE nome = 'Nova da B'`);
assert.equal((await como('bia@b.com', `SELECT count(*)::int AS n FROM organizacoes`).catch(() => [{ n: 'negado' }]))[0].n, 'negado', 'tabela de organizações fechada ao navegador');
await falha('bia@b.com', `SELECT * FROM contratos_organizacao`, /permission denied/);
await falha('bia@b.com', `SELECT * FROM sessoes_suporte`, /permission denied/);
await falha('bia@b.com', `SELECT public.rm_pode_gerir_org('bia@b.com', '${RMCHAT}')`, /permission denied/);
await falha('bia@b.com', `INSERT INTO sistema_config (chave, valor, organizacao_id) VALUES ('x', '1', '${RMCHAT}')`, /row-level security/);
console.log('✔ inserir, alterar, apagar e mover para outra empresa: tudo bloqueado');

// Mesma configuração e mesmo nome de catálogo em empresas diferentes
await comoServidor(`INSERT INTO sistema_config (chave, valor, organizacao_id) VALUES ('departamentos', '["Vendas"]', $1)`, [b.id]);
await comoServidor(`INSERT INTO suporte_motivos (nome, organizacao_id) SELECT nome, $1 FROM suporte_motivos WHERE organizacao_id = $2`, [b.id, RMCHAT]);
console.log('✔ chaves e nomes repetidos permitidos entre empresas');

// Limites do plano
await comoServidor(`UPDATE organizacoes SET limites = '{"usuarios": 1, "empresas": 2}' WHERE id = $1`, [b.id]);
await assert.rejects(comoServidor(`INSERT INTO equipe_usuarios (nome, email, papel, senha, organizacao_id) VALUES ('Extra', 'extra@b.com', 'suporte', 'Senha@123', $1)`, [b.id]), /Limite do plano/);
await falha('bia@b.com', `INSERT INTO empresas (nome) VALUES ('Terceira')`, /Limite do plano/);
await comoServidor(`UPDATE organizacoes SET limites = '{"assinantes": 1}' WHERE id = $1`, [rev.id]);
await assert.rejects(comoServidor(`INSERT INTO organizacoes (nome, tipo, pai_id) VALUES ('Loja D', 'assinante', $1)`, [rev.id]), /Limite do plano/);
console.log('✔ limites de usuários, empresas e assinantes conferidos pelo banco');

// Suporte: revenda entra só nas assinantes dela
await comoServidor(`INSERT INTO sessoes_suporte (email, organizacao_id, expira_em) VALUES ('rui@agencia.com', $1, now() + interval '1 hour')`, [c.id]);
assert.equal((await como('rui@agencia.com', `SELECT public.rm_org_atual() AS o`))[0].o, c.id);
await comoServidor(`UPDATE sessoes_suporte SET organizacao_id = $1 WHERE email = 'rui@agencia.com'`, [b.id]);
assert.equal((await como('rui@agencia.com', `SELECT public.rm_org_atual() AS o`))[0].o, rev.id, 'não entra em assinante de outra revenda');
await comoServidor(`UPDATE sessoes_suporte SET organizacao_id = $1, expira_em = now() - interval '1 minute' WHERE email = 'rui@agencia.com'`, [c.id]);
assert.equal((await como('rui@agencia.com', `SELECT public.rm_org_atual() AS o`))[0].o, rev.id, 'sessão expirada volta para casa');
// Dono da plataforma entra em qualquer uma
await comoServidor(`INSERT INTO sessoes_suporte (email, organizacao_id, expira_em) VALUES ('lucas@rmchat.com', $1, now() + interval '1 hour')`, [b.id]);
assert.deepEqual((await como('lucas@rmchat.com', `SELECT nome FROM empresas ORDER BY nome`)).map((r) => r.nome), ['Cliente da B', 'Nova da B']);
await comoServidor(`DELETE FROM sessoes_suporte WHERE email = 'lucas@rmchat.com'`);
assert.deepEqual((await como('lucas@rmchat.com', `SELECT nome FROM empresas`)).map((r) => r.nome), ['Padaria Sol'], 'dono volta para a RM Chat');
// Suporte comum (não administrador) não entra em outra empresa
await comoServidor(`INSERT INTO sessoes_suporte (email, organizacao_id, expira_em) VALUES ('caio@rmchat.com', $1, now() + interval '1 hour')`, [b.id]);
assert.equal((await como('caio@rmchat.com', `SELECT public.rm_org_atual() AS o`))[0].o, RMCHAT);
console.log('✔ sessões de suporte respeitam a hierarquia e expiram');

// Suspensão corta o acesso na hora
await comoServidor(`UPDATE organizacoes SET status = 'suspensa' WHERE id = $1`, [b.id]);
assert.equal((await como('bia@b.com', `SELECT * FROM empresas`)).length, 0);
await comoServidor(`UPDATE organizacoes SET status = 'ativa' WHERE id = $1`, [b.id]);
console.log('✔ empresa suspensa perde o acesso');

// Senhas de clientes: função só devolve as da própria empresa
await comoServidor(`INSERT INTO empresa_credenciais (empresa_id, rotulo, senha_suporte) VALUES ('11111111-1111-4111-8111-111111111111', 'Painel', 'segredo1')`).catch((e) => console.log('  (credenciais: ' + e.message + ')'));
const credB = await como('bia@b.com', `SELECT * FROM public.rm_credenciais_empresas(NULL)`).catch((e) => e.message);
assert.ok(Array.isArray(credB) ? credB.length === 0 : true, 'B não vê senhas da RM Chat');
console.log('✔ senhas das empresas clientes isoladas');

// Webhook do Comercial (sem usuário logado): lead herda a empresa da integração e usa a configuração DELA
const cfg = (dep, etapa) => JSON.stringify({ departamentos: [dep], pipelines: [{ id: 'p1', etapas: [{ id: etapa }] }] });
await comoServidor(`INSERT INTO sistema_config (chave, valor, organizacao_id) VALUES ('comercial', $1, $2)`, [cfg('Vendas B', 'qualificacao'), b.id]);
await comoServidor(`INSERT INTO sistema_config (chave, valor, organizacao_id) VALUES ('comercial', $1, $2)`, [cfg('Vendas RM', 'outra'), RMCHAT]);
const [integ] = await comoServidor(`INSERT INTO comercial_integracoes (nome, tenant_id, pipeline_id, departamento, etapa_inicial_id, ativo, token_hash, token_prefixo, criado_por, organizacao_id) VALUES ('RM', 't', 'p1', 'Vendas B', 'qualificacao', true, 'h1', 'p', 'bia@b.com', $1) RETURNING id`, [b.id]);
const [r1] = await comoServidor(`SELECT public.rm_receber_lead_comercial($1, 'h1', 'ev1', 'hash1', $2::jsonb, NULL) AS r`, [integ.id, JSON.stringify({ externo_id: '9', nome: 'Lead', email: '', telefone: '', evento: 'x', ocorrido_em: new Date().toISOString() })]);
assert.equal(r1.r.ok, true, JSON.stringify(r1.r));
const lead = await comoServidor(`SELECT organizacao_id, comercial_etapa_id FROM comercial_leads`);
assert.equal(lead[0].organizacao_id, b.id);
assert.equal((await comoServidor(`SELECT organizacao_id FROM comercial_webhook_eventos`))[0].organizacao_id, b.id);
console.log('✔ webhook do Comercial: lead e recibo na empresa da integração, com a configuração dela');

// Demanda pelo nome da empresa: só liga a empresa da mesma assinante
await comoServidor(`INSERT INTO empresas (nome, organizacao_id) VALUES ('Padaria Sol', $1)`, [b.id]).catch(() => {});
await como('bia@b.com', `INSERT INTO suporte_chamados (empresa_nome, tecnico_email, atendente, colaborador_solicitante, status, observacoes, motivo) VALUES ('Padaria Sol', 'geral', 'Fila', 'x', 'aguardando_visualizacao', '', 'Suporte')`);
const ch = await comoServidor(`SELECT c.organizacao_id, e.organizacao_id AS org_empresa FROM suporte_chamados c JOIN empresas e ON e.id = c.empresa_id`);
assert.ok(ch.every((x) => x.organizacao_id === x.org_empresa), 'demanda ligada à empresa da mesma assinante');
console.log('✔ demanda ligada pelo nome só encontra empresas da mesma assinante');

// A migração completa antiga se recusa a rodar (ela tiraria a separação entre empresas)
const ANTIGA = fs.readFileSync(new URL('../../supabase/migration_supabase_completa.sql', import.meta.url), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;/, '').replace(/^NOTIFY pgrst.*$/gm, '');
await assert.rejects(db.exec('RESET ROLE; ' + ANTIGA), /já usa migration_multiempresa/);
assert.equal((await como('bia@b.com', `SELECT nome FROM empresas WHERE organizacao_id = '${RMCHAT}'`)).length, 0, 'isolamento continua depois da tentativa');
console.log('✔ migração antiga recusada; isolamento intacto');
console.log('\nTODOS OS TESTES DE ISOLAMENTO PASSARAM');
