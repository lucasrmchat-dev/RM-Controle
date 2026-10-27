-- ==============================================================================
-- RM CONTROLE — DESEMPENHO (índices)
-- Deixa rápidas as consultas que crescem com o uso: busca de mensagens, lista e busca de contatos,
-- conversas por atendente e auditoria das conversas. Só cria índices: nenhum dado muda.
-- Pode ser executado de novo. Rode depois de migration_canais_chat.sql.
-- ==============================================================================

-- Conversas: "Ativos" por atendente e histórico do contato
CREATE INDEX IF NOT EXISTS conversas_responsavel_idx ON public.conversas (organizacao_id, responsavel_email) WHERE status <> 'resolvida';
CREATE INDEX IF NOT EXISTS conversas_contato_idx ON public.conversas (contato_id);
CREATE INDEX IF NOT EXISTS conversas_resolvidas_idx ON public.conversas (organizacao_id, ultima_mensagem_em DESC) WHERE status = 'resolvida';

-- Mensagens: busca por período e status de envio
CREATE INDEX IF NOT EXISTS mensagens_org_data_idx ON public.mensagens (organizacao_id, criado_em DESC);

-- Contatos: lista em ordem de nome
CREATE INDEX IF NOT EXISTS contatos_nome_idx ON public.contatos (organizacao_id, nome);

-- Auditoria das conversas: filtra pela conversa sem varrer a tabela
CREATE INDEX IF NOT EXISTS auditoria_chat_conversa_idx ON public.auditoria_logs ((detalhes ->> 'conversa_id'), created_at DESC) WHERE acao LIKE 'chat\_%';
CREATE INDEX IF NOT EXISTS auditoria_org_acao_idx ON public.auditoria_logs (organizacao_id, acao, created_at DESC);

-- Busca "contém" (texto de mensagens e nome de contatos): índice trigram (pg_trgm)
DO $$
BEGIN
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
  EXECUTE 'CREATE INDEX IF NOT EXISTS mensagens_conteudo_trgm_idx ON public.mensagens USING gin (conteudo extensions.gin_trgm_ops)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS contatos_nome_trgm_idx ON public.contatos USING gin (nome extensions.gin_trgm_ops)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm indisponível (%): a busca funciona, só sem o índice de texto.', SQLERRM;
END $$;

ANALYZE public.mensagens;
ANALYZE public.conversas;
ANALYZE public.contatos;
