// Canais e Chat no Postgres real (PGlite): segredos invisíveis, navegador só lê, visibilidade por departamento.
// Executar: npm run test:banco
import { novoBanco } from './base.mjs';
import assert from 'node:assert/strict';
process.on('uncaughtException', (e) => { console.log('FALHOU:', e.message, '| consulta:', e.query || ''); process.exit(1); });

const db = await novoBanco(['schema.sql', 'setup_secure_rls.sql', 'migration_feedbacks_e_departamentos.sql', 'migration_supabase_completa.sql', 'migration_perfis_acesso.sql', 'migration_google_agenda.sql', 'migration_descricao_historico.sql', 'migration_agenda_departamento.sql', 'migration_comercial_pipeline.sql', 'migration_comercial_webhooks.sql', 'migration_relato_atendimentos.sql', 'migration_feedbacks_subtarefas.sql', 'migration_descricao_demandas.sql', 'migration_whatsapp_agenda.sql', 'migration_multiempresa.sql', 'migration_canais_chat.sql', 'migration_canais_chat.sql', 'migration_chat_acoes.sql', 'migration_chat_acoes.sql', 'migration_chat_grupos.sql', 'migration_chat_grupos.sql', 'migration_desempenho.sql', 'migration_desempenho.sql', 'migration_daily.sql', 'migration_daily.sql', 'migration_equipe_protege_acesso.sql', 'migration_equipe_protege_acesso.sql', 'migration_auditoria_autor.sql', 'migration_auditoria_autor.sql', 'migration_fluxos.sql', 'migration_fluxo_esperas.sql', 'migration_fluxo_esperas.sql', 'migration_chat_massa.sql', 'migration_chat_massa.sql', 'migration_envios_massa.sql', 'migration_envios_massa.sql', 'migration_mensagens_codigo_por_conversa.sql']);
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
// O mesmo código em OUTRA conversa (outro canal no mesmo grupo) é uma cópia legítima
await servidor(`INSERT INTO mensagens (conversa_id, direcao, conteudo, id_externo) VALUES ($1, 'entrada', 'cópia do outro canal', 'w1')`, [convVendas.id]);
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

// Ninguém além do administrador muda o próprio acesso pelo navegador (perfil e departamentos)
assert.equal((await como('ana@rmchat.com', `UPDATE equipe_usuarios SET departamentos_bloqueados = '{Vendas}' WHERE email = 'caio@rmchat.com' RETURNING id`)).length, 1, 'administrador continua alterando');
await falha('caio@rmchat.com', `UPDATE equipe_usuarios SET perfil_id = NULL WHERE email = 'caio@rmchat.com'`, /Apenas administradores/);
await falha('caio@rmchat.com', `UPDATE equipe_usuarios SET departamentos_bloqueados = '{}' WHERE email = 'caio@rmchat.com'`, /Apenas administradores/);
await falha('caio@rmchat.com', `UPDATE equipe_usuarios SET departamentos = '{Suporte,Vendas}' WHERE email = 'caio@rmchat.com'`, /Apenas administradores/);
assert.equal((await como('caio@rmchat.com', `UPDATE equipe_usuarios SET primeiro_acesso_concluido = true WHERE email = 'caio@rmchat.com' RETURNING id`)).length, 1, 'o resto do próprio cadastro continua editável');
console.log('✔ só o administrador muda perfil e departamentos de alguém');

// Auditoria pelo navegador: só no nome de quem está logado
await falha('caio@rmchat.com', `INSERT INTO auditoria_logs (usuario_email, acao) VALUES ('ana@rmchat.com', 'excluiu_empresa')`, /row-level security/);
await como('caio@rmchat.com', `INSERT INTO auditoria_logs (usuario_email, acao) VALUES ('caio@rmchat.com', 'visualizou')`);
assert.equal((await servidor(`SELECT usuario_email FROM auditoria_logs WHERE acao IN ('excluiu_empresa', 'visualizou')`)).map((r) => r.usuario_email).join(), 'caio@rmchat.com');
console.log('✔ auditoria não aceita registro em nome de outra pessoa');

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

// Daily: cada empresa vê só o seu; o navegador só lê
await servidor(`INSERT INTO daily_reunioes (titulo, resumo, organizacao_id) VALUES ('Daily', 'resumo da RM', $1)`, [RMCHAT]);
await servidor(`INSERT INTO daily_metas (semana, texto, organizacao_id) VALUES ('2026-10-26', 'meta da RM', $1)`, [RMCHAT]);
assert.equal((await como('ana@rmchat.com', `SELECT id FROM daily_reunioes`)).length, 1);
assert.equal((await como('ana@rmchat.com', `SELECT id FROM daily_metas`)).length, 1);
assert.equal((await como('bia@b.com', `SELECT id FROM daily_reunioes`)).length, 0);
assert.equal((await como('bia@b.com', `SELECT id FROM daily_metas`)).length, 0);
await falha('ana@rmchat.com', `INSERT INTO daily_reunioes (titulo) VALUES ('pelo navegador')`);
await falha('ana@rmchat.com', `UPDATE daily_metas SET texto = 'x'`);
await assert.rejects(servidor(`UPDATE daily_metas SET organizacao_id = $1`, [b.id]));
console.log('✔ Daily: separado por empresa, navegador só lê, empresa imutável');

// Pergunta do Fluxo: espera presa à empresa da conversa; o navegador não lê nem grava
const [fluxo] = await servidor(`INSERT INTO fluxos (nome, organizacao_id) VALUES ('Triagem', $1) RETURNING id`, [RMCHAT]);
await servidor(`INSERT INTO fluxo_esperas (fluxo_id, conversa_id, no_id, expira_em) VALUES ($1, $2, 'p1', now() + interval '1 hour')`, [fluxo.id, convSuporte.id]);
assert.equal((await servidor(`SELECT organizacao_id FROM fluxo_esperas`))[0].organizacao_id, RMCHAT, 'herda a empresa da conversa');
await assert.rejects(servidor(`INSERT INTO fluxo_esperas (fluxo_id, conversa_id, no_id, expira_em, organizacao_id) VALUES ($1, $2, 'p2', now(), $3)`, [fluxo.id, convVendas.id, b.id]), /mesma empresa/);
await assert.rejects(servidor(`INSERT INTO fluxo_esperas (fluxo_id, conversa_id, no_id, expira_em) VALUES ($1, $2, 'p3', now())`, [fluxo.id, convSuporte.id]), /duplicate|unique/, 'uma pergunta por fluxo e conversa');
await falha('ana@rmchat.com', `SELECT * FROM fluxo_esperas`);
await falha('ana@rmchat.com', `DELETE FROM fluxo_esperas`);
console.log('✔ Pergunta do Fluxo: espera na empresa da conversa, uma por conversa, navegador sem acesso');

// Ações em massa: atendente padrão no contato; lead do Chat sem integração, preso à empresa do contato
await servidor(`UPDATE contatos SET responsavel_padrao_email = 'caio@rmchat.com', responsavel_padrao_nome = 'Caio' WHERE id = $1`, [contato.id]);
await servidor(`INSERT INTO comercial_leads (integracao_id, contato_id, externo_id, nome, departamento, comercial_pipeline_id, comercial_etapa_id, ultima_ocorrencia_em, organizacao_id) VALUES (NULL, $1, 'chat:1', 'Carla', 'Vendas', 'p1', 'e1', now(), $2)`, [contato.id, RMCHAT]);
await assert.rejects(servidor(`INSERT INTO comercial_leads (integracao_id, contato_id, externo_id, nome, departamento, comercial_pipeline_id, comercial_etapa_id, ultima_ocorrencia_em, organizacao_id) VALUES (NULL, $1, 'chat:2', 'X', 'Vendas', 'p1', 'e1', now(), $2)`, [contato.id, RMCHAT]), /duplicate|unique/, 'um lead por contato');
await assert.rejects(servidor(`INSERT INTO comercial_leads (integracao_id, contato_id, externo_id, nome, departamento, comercial_pipeline_id, comercial_etapa_id, ultima_ocorrencia_em, organizacao_id) VALUES (NULL, $1, 'chat:3', 'X', 'Vendas', 'p1', 'e1', now(), $2)`, [contato.id, b.id]), /mesma empresa/);
console.log('✔ Ações em massa: atendente padrão no contato, lead do Chat preso à empresa do contato');

// Envios em massa: envio e destinos presos à empresa do canal e do contato; o navegador não lê nem grava
const [envio] = await servidor(`INSERT INTO envios_massa (nome, canal_id, mensagem, intervalo_segundos) VALUES ('Aviso', $1, 'Olá', 60) RETURNING id, organizacao_id`, [canal.id]);
assert.equal(envio.organizacao_id, RMCHAT, 'envio herda a empresa do canal');
await servidor(`INSERT INTO envios_massa_destinos (envio_id, contato_id) VALUES ($1, $2)`, [envio.id, contato.id]);
assert.equal((await servidor(`SELECT organizacao_id FROM envios_massa_destinos`))[0].organizacao_id, RMCHAT);
await assert.rejects(servidor(`INSERT INTO envios_massa_destinos (envio_id, contato_id) VALUES ($1, $2)`, [envio.id, contato.id]), /duplicate|unique/, 'um destino por contato');
const [contatoB] = await servidor(`INSERT INTO contatos (telefone, nome, organizacao_id) VALUES ('5585977770000', 'Da B', $1) RETURNING id`, [b.id]);
await assert.rejects(servidor(`INSERT INTO envios_massa_destinos (envio_id, contato_id) VALUES ($1, $2)`, [envio.id, contatoB.id]), /mesma empresa/, 'contato de outra empresa não entra');
await assert.rejects(servidor(`INSERT INTO envios_massa (nome, canal_id, mensagem, organizacao_id) VALUES ('X', $1, 'Oi', $2)`, [canal.id, b.id]), /mesma empresa/, 'canal de outra empresa não serve');
await assert.rejects(servidor(`INSERT INTO envios_massa (nome, canal_id, mensagem, intervalo_segundos) VALUES ('X', $1, 'Oi', 2)`, [canal.id]), /check/i, 'intervalo mínimo de 5 segundos');
await assert.rejects(servidor(`UPDATE envios_massa SET organizacao_id = $1`, [b.id]));
await falha('ana@rmchat.com', `SELECT * FROM envios_massa`);
await falha('ana@rmchat.com', `SELECT * FROM envios_massa_destinos`);
await falha('ana@rmchat.com', `DELETE FROM envios_massa`);
console.log('✔ Envios em massa: presos à empresa do canal e do contato, navegador sem acesso');

console.log('\nTODOS OS TESTES DE CANAIS PASSARAM');
