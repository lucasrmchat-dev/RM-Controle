// Canais e Chat no Postgres real (PGlite): segredos invisíveis, navegador só lê, visibilidade por departamento.
// Executar: npm run test:banco
import { novoBanco } from './base.mjs';
import assert from 'node:assert/strict';
process.on('uncaughtException', (e) => { console.log('FALHOU:', e.message, '| consulta:', e.query || ''); process.exit(1); });

const db = await novoBanco(['schema.sql', 'setup_secure_rls.sql', 'migration_feedbacks_e_departamentos.sql', 'migration_supabase_completa.sql', 'migration_perfis_acesso.sql', 'migration_google_agenda.sql', 'migration_descricao_historico.sql', 'migration_agenda_departamento.sql', 'migration_comercial_pipeline.sql', 'migration_comercial_webhooks.sql', 'migration_relato_atendimentos.sql', 'migration_feedbacks_subtarefas.sql', 'migration_descricao_demandas.sql', 'migration_whatsapp_agenda.sql', 'migration_multiempresa.sql', 'migration_canais_chat.sql', 'migration_canais_chat.sql', 'migration_chat_acoes.sql', 'migration_chat_acoes.sql', 'migration_chat_grupos.sql', 'migration_chat_grupos.sql', 'migration_desempenho.sql', 'migration_desempenho.sql']);
console.log('✔ migração aplicada (duas vezes, sem erro)');
const RMCHAT = '00000000-0000-4000-8000-000000000002';

const servidor = async (sql, p = []) => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`); return (await db.query(sql, p)).rows; };
const como = async (email, sql, p = []) => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ email, role: 'authenticated' })]);
  await db.exec('SET ROLE authenticated');
  try { return (await db.query(sql, p)).rows; } finally { await db.exec('RESET ROLE'); }
};
const falha = async (email, sql, padrao) => {
  try { await como(email, sql); } catch (e) { if (padrao) assert.match(e.message, padrao); return; }
  throw new Error('deveria falhar: ' + sql);
};

const [b] = await servidor(`INSERT INTO organizacoes (nome, tipo, pai_id) VALUES ('Clínica B', 'assinante', '00000000-0000-4000-8000-000000000001') RETURNING id`);
const [perfilSuporte] = await servidor(`INSERT INTO perfis_acesso (nome, modulos, departamentos, organizacao_id) VALUES ('Só Suporte', '{fila}', '{Suporte}', $1) RETURNING id`, [RMCHAT]);
await servidor(`INSERT INTO equipe_usuarios (nome, email, papel, senha, organizacao_id, perfil_id) VALUES
  ('Ana', 'ana@rmchat.com', 'administrador', 'Senha@123', $1, NULL),
  ('Caio', 'caio@rmchat.com', 'suporte', 'Senha@123', $1, $3),
  ('Bia', 'bia@b.com', 'administrador', 'Senha@123', $2, NULL)`, [RMCHAT, b.id, perfilSuporte.id]);

// Canal com segredo + conversas de dois departamentos
const [canal] = await servidor(`INSERT INTO canais (nome, tipo, provedor, credenciais_cifradas, webhook_token_hash, organizacao_id) VALUES ('Comercial', 'whatsapp_qr', 'evolution', 'SEGREDO-CIFRADO', 'hash123', $1) RETURNING id`, [RMCHAT]);
const [contato] = await servidor(`INSERT INTO contatos (telefone, nome, organizacao_id) VALUES ('5585999990000', 'Cliente', $1) RETURNING id`, [RMCHAT]);
const [contato2] = await servidor(`INSERT INTO contatos (telefone, nome, organizacao_id) VALUES ('5585988880000', 'Outro', $1) RETURNING id`, [RMCHAT]);
const [convSuporte] = await servidor(`INSERT INTO conversas (canal_id, contato_id, departamento) VALUES ($1, $2, 'Suporte') RETURNING id, organizacao_id`, [canal.id, contato.id]);
const [convVendas] = await servidor(`INSERT INTO conversas (canal_id, contato_id, departamento) VALUES ($1, $2, 'Vendas') RETURNING id`, [canal.id, contato2.id]);
assert.equal(convSuporte.organizacao_id, RMCHAT, 'conversa herda a empresa do canal');
await servidor(`INSERT INTO mensagens (conversa_id, direcao, conteudo, id_externo) VALUES ($1, 'entrada', 'oi do suporte', 'w1'), ($2, 'entrada', 'oi de vendas', 'w2')`, [convSuporte.id, convVendas.id]);
console.log('✔ conversas e mensagens herdam a empresa do canal');

// Mensagem repetida do WhatsApp não duplica
await assert.rejects(servidor(`INSERT INTO mensagens (conversa_id, direcao, conteudo, id_externo) VALUES ($1, 'entrada', 'repetida', 'w1')`, [convSuporte.id]), /duplicate|unique/);
// Uma conversa aberta por contato e canal
await assert.rejects(servidor(`INSERT INTO conversas (canal_id, contato_id) VALUES ($1, $2)`, [canal.id, contato.id]), /duplicate|unique/);
console.log('✔ sem duplicar mensagem nem conversa aberta');

// Segredos do canal: invisíveis ao navegador
assert.equal((await como('ana@rmchat.com', `SELECT nome, status FROM canais`)).length, 1);
await falha('ana@rmchat.com', `SELECT credenciais_cifradas FROM canais`, /permission denied/);
await falha('ana@rmchat.com', `SELECT webhook_token_hash FROM canais`, /permission denied/);
await falha('ana@rmchat.com', `SELECT * FROM canais`, /permission denied/);
console.log('✔ credenciais e token do webhook invisíveis ao navegador (até para administrador)');

// Navegador só lê
await falha('ana@rmchat.com', `INSERT INTO mensagens (conversa_id, direcao, conteudo) VALUES ('${convSuporte.id}', 'saida', 'forjada')`, /permission denied/);
await falha('ana@rmchat.com', `UPDATE conversas SET responsavel_email = 'ana@rmchat.com'`, /permission denied/);
await falha('ana@rmchat.com', `DELETE FROM mensagens`, /permission denied/);
await falha('ana@rmchat.com', `INSERT INTO canais (nome, tipo, provedor) VALUES ('x', 'whatsapp_qr', 'evolution')`, /permission denied/);
console.log('✔ navegador não grava conversas, mensagens nem canais (só o servidor)');

// Visibilidade por departamento
assert.equal((await como('ana@rmchat.com', `SELECT id FROM conversas`)).length, 2, 'administrador vê todas');
assert.deepEqual((await como('caio@rmchat.com', `SELECT departamento FROM conversas`)).map((r) => r.departamento), ['Suporte'], 'perfil Só Suporte vê só Suporte');
assert.deepEqual((await como('caio@rmchat.com', `SELECT conteudo FROM mensagens`)).map((r) => r.conteudo), ['oi do suporte'], 'mensagens seguem a conversa');
await servidor(`UPDATE conversas SET responsavel_email = 'caio@rmchat.com' WHERE id = $1`, [convVendas.id]);
assert.equal((await como('caio@rmchat.com', `SELECT id FROM conversas`)).length, 2, 'vê também a conversa que está com ele');
console.log('✔ cada um vê os departamentos dele e as conversas que estão com ele');

// Outra empresa não vê nada
assert.equal((await como('bia@b.com', `SELECT id FROM conversas`)).length, 0);
assert.equal((await como('bia@b.com', `SELECT id FROM mensagens`)).length, 0);
assert.equal((await como('bia@b.com', `SELECT id FROM contatos`)).length, 0);
assert.equal((await como('bia@b.com', `SELECT id FROM canais`)).length, 0);
// Nem dá para pendurar conversa da empresa B num canal da RM Chat
await assert.rejects(servidor(`INSERT INTO conversas (canal_id, contato_id, organizacao_id) VALUES ($1, $2, $3)`, [canal.id, contato.id, b.id]), /mesma empresa/);
console.log('✔ outra empresa não vê nem mistura conversas');

// Limite de números de WhatsApp do plano
await servidor(`UPDATE organizacoes SET limites = '{"numeros_whatsapp": 1}' WHERE id = $1`, [RMCHAT]);
await assert.rejects(servidor(`INSERT INTO canais (nome, tipo, provedor, organizacao_id) VALUES ('Segundo', 'whatsapp_oficial', 'meta', $1)`, [RMCHAT]), /Limite do plano/);
console.log('✔ limite de números de WhatsApp conferido pelo banco');

console.log('\nTODOS OS TESTES DE CANAIS PASSARAM');
