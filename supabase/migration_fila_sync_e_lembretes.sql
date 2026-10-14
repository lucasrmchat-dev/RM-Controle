-- ==============================================================================
-- MIGRAÇÃO SUPABASE: SINCRONIZAÇÃO CONFIÁVEL DA FILA, LEMBRETES E FEEDBACKS
-- Idempotente. O app funciona sem ela (recua para as colunas base), mas com ela
-- etiquetas, prazos e lembretes passam a ser compartilhados com toda a equipe.
-- ==============================================================================

-- 1. Colunas estendidas da fila de demandas
ALTER TABLE IF EXISTS public.suporte_chamados ADD COLUMN IF NOT EXISTS etiquetas TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE IF EXISTS public.suporte_chamados ADD COLUMN IF NOT EXISTS prazo_limite TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.suporte_chamados ADD COLUMN IF NOT EXISTS is_lembrete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.suporte_chamados ADD COLUMN IF NOT EXISTS criador_email TEXT;
ALTER TABLE IF EXISTS public.suporte_chamados ADD COLUMN IF NOT EXISTS atribuido_a TEXT;

-- 2. Garante que o status 'cancelado' é aceito (cancelamento é feito por UPDATE, não DELETE)
ALTER TABLE IF EXISTS public.suporte_chamados DROP CONSTRAINT IF EXISTS suporte_chamados_status_check;
ALTER TABLE IF EXISTS public.suporte_chamados
  ADD CONSTRAINT suporte_chamados_status_check
  CHECK (status IN ('aguardando_visualizacao', 'em_andamento', 'finalizado', 'cancelado', 'pendente'));

-- 3. Feedbacks precisam estar no Realtime para o status mudar ao vivo para todos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feedbacks')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND tablename = 'feedbacks'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedbacks;
  END IF;
END $$;

-- 4. Força o PostgREST a recarregar o schema (novas colunas visíveis imediatamente)
NOTIFY pgrst, 'reload schema';
