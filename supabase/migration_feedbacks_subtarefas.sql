-- Feedbacks: número do ticket, prazo geral, subtarefas e histórico de etapas (área de desenvolvimento).
-- Subtarefas: [{ id, titulo, prazo, criada_em, criada_por, concluida_em }]
-- Histórico:  [{ etapa, por, em }]
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS prazo DATE;
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS subtarefas JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS historico JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Número do ticket (#1, #2, ...): os existentes são numerados pela data de criação
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS numero INTEGER;
CREATE SEQUENCE IF NOT EXISTS public.feedbacks_numero_seq;
WITH ordem AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) + COALESCE((SELECT max(numero) FROM public.feedbacks), 0) AS n
  FROM public.feedbacks WHERE numero IS NULL
)
UPDATE public.feedbacks f SET numero = ordem.n FROM ordem WHERE f.id = ordem.id;
SELECT setval('public.feedbacks_numero_seq', GREATEST(COALESCE((SELECT max(numero) FROM public.feedbacks), 0), 1), (SELECT count(*) > 0 FROM public.feedbacks WHERE numero IS NOT NULL));
ALTER TABLE public.feedbacks ALTER COLUMN numero SET DEFAULT nextval('public.feedbacks_numero_seq');
CREATE UNIQUE INDEX IF NOT EXISTS feedbacks_numero_uk ON public.feedbacks (numero);
GRANT USAGE, SELECT ON SEQUENCE public.feedbacks_numero_seq TO authenticated;
