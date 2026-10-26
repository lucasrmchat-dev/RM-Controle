-- Execute este script completo no SQL Editor do Supabase.
-- Pode ser executado novamente: não apaga nem reclassifica reuniões existentes.
BEGIN;
ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS participante_tipo text,
  ADD COLUMN IF NOT EXISTS participante_nome text,
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agenda_eventos_departamento_data_idx
  ON public.agenda_eventos (departamento, data);
CREATE INDEX IF NOT EXISTS agenda_eventos_empresa_idx
  ON public.agenda_eventos (empresa_id);

-- Faz a API reconhecer as novas colunas sem aguardar a atualização automática do cache.
NOTIFY pgrst, 'reload schema';
COMMIT;
