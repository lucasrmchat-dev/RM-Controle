-- ==============================================================================
-- RM CONTROLE — AÇÕES NAS MENSAGENS DO CHAT
-- Responder, editar, apagar (para mim / para todos), favoritar e fixar.
-- Rode depois de migration_canais_chat.sql. Pode ser executado de novo sem perder dados.
-- Só acrescenta colunas: nada existente é alterado ou apagado.
-- ==============================================================================
BEGIN;

ALTER TABLE public.mensagens
  -- Chave da mensagem no WhatsApp (remoteJid, participante...): necessária para editar, apagar e reagir
  ADD COLUMN IF NOT EXISTS chave_externa JSONB,
  -- Edição: o texto anterior fica guardado (histórico da empresa)
  ADD COLUMN IF NOT EXISTS editada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conteudo_original TEXT,
  -- Apagada para todos (pela equipe ou pelo cliente)
  ADD COLUMN IF NOT EXISTS apagada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apagada_por TEXT,
  -- Apagada só para algumas pessoas da equipe ("apagar para mim")
  ADD COLUMN IF NOT EXISTS apagada_para TEXT[] NOT NULL DEFAULT '{}',
  -- Favorita de cada pessoa (estrela) e fixada no topo da conversa (para toda a equipe)
  ADD COLUMN IF NOT EXISTS favorita_por TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fixada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fixada_por TEXT;

CREATE INDEX IF NOT EXISTS mensagens_fixadas_idx ON public.mensagens (conversa_id) WHERE fixada_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS mensagens_responde_idx ON public.mensagens (responde_a) WHERE responde_a IS NOT NULL;

COMMIT;
NOTIFY pgrst, 'reload schema';
