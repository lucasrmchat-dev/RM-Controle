-- ==============================================================================
-- RM CONTROLE — DEMANDA CRIADA A PARTIR DE UMA MENSAGEM DO CHAT (ticket #24)
-- Guarda a conversa e a mensagem de origem, para a demanda levar de volta ao ponto exato da conversa.
-- Sem chave estrangeira: se a conversa for excluída, a demanda continua (só o atalho deixa de abrir).
-- Pode ser executado de novo sem perder dados.
-- ==============================================================================
BEGIN;
ALTER TABLE public.suporte_chamados
  ADD COLUMN IF NOT EXISTS chat_conversa_id UUID,
  ADD COLUMN IF NOT EXISTS chat_mensagem_id UUID,
  ADD COLUMN IF NOT EXISTS chat_mensagem_em TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS suporte_chamados_chat_conversa_idx ON public.suporte_chamados (chat_conversa_id) WHERE chat_conversa_id IS NOT NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
