-- Executar uma vez no SQL Editor do Supabase. Não altera reuniões ou desfechos existentes.
BEGIN;
ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS comercial_pipeline_id text,
  ADD COLUMN IF NOT EXISTS comercial_etapa_id text;
CREATE INDEX IF NOT EXISTS agenda_eventos_comercial_pipeline_idx
  ON public.agenda_eventos (comercial_pipeline_id, comercial_etapa_id);
NOTIFY pgrst, 'reload schema';
COMMIT;
