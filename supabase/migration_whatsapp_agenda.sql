-- WhatsApp da agenda: confirmação e lembrete de reunião enviados ao cliente.
-- Execute no SQL Editor do Supabase. Pode ser executado de novo sem perder dados.
BEGIN;

-- 1. Dados da reunião visíveis para a equipe
ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS cliente_telefone TEXT,
  ADD COLUMN IF NOT EXISTS confirmacao_status TEXT,           -- enviada | confirmada | remarcar | cancelada | falhou
  ADD COLUMN IF NOT EXISTS confirmacao_enviada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmacao_respondida_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmacao_mensagem TEXT,         -- recado do cliente ao remarcar/cancelar
  ADD COLUMN IF NOT EXISTS lembrete_minutos INTEGER,
  ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS agenda_eventos_lembrete_idx
  ON public.agenda_eventos (data) WHERE lembrete_minutos IS NOT NULL AND lembrete_enviado_em IS NULL;

-- 2. Links de confirmação: só o servidor acessa (o navegador da equipe e o público nunca leem esta tabela).
--    Guarda apenas o HASH do token; o link completo só existe na mensagem enviada ao cliente.
CREATE TABLE IF NOT EXISTS public.agenda_confirmacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL UNIQUE REFERENCES public.agenda_eventos(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_cifrado TEXT NOT NULL,        -- AES-256-GCM: permite reenviar o MESMO link no lembrete
  expira_em TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agenda_confirmacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agenda_confirmacoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agenda_confirmacoes TO service_role;

-- 3. Registro de envios (diagnóstico para administradores; só o servidor grava e lê)
CREATE TABLE IF NOT EXISTS public.whatsapp_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID REFERENCES public.agenda_eventos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,                 -- confirmacao | lembrete | teste
  ok BOOLEAN NOT NULL,
  http_status INTEGER,
  erro TEXT,
  por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_envios_criado_idx ON public.whatsapp_envios (criado_em DESC);
ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_envios FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_envios TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ==============================================================================
-- 4. LEMBRETES AUTOMÁTICOS (rode depois, uma vez, com os seus valores)
-- O plano gratuito da Vercel só agenda tarefas 1x por dia. Para lembretes de 30/45/60 min,
-- o próprio Supabase chama o sistema a cada 5 minutos (extensões pg_cron e pg_net).
-- Troque SEU-DOMINIO e SEU_CRON_SECRET (o mesmo valor da variável CRON_SECRET na Vercel).
-- ==============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- SELECT cron.schedule(
--   'rm-lembretes-whatsapp',
--   '*/5 * * * *',
--   $$ SELECT net.http_post(
--        url := 'https://SEU-DOMINIO/api/agenda/lembretes',
--        headers := '{"Content-Type": "application/json", "Authorization": "Bearer SEU_CRON_SECRET"}'::jsonb,
--        body := '{}'::jsonb
--      ) $$
-- );
