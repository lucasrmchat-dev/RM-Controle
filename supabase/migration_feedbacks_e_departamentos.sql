-- ==============================================================================
-- MIGRAÇÃO SUPABASE: TABELA DE FEEDBACKS, DEPARTAMENTOS E SERVIDORES
-- ==============================================================================

-- 1. Criação da tabela de feedbacks para reporte de falhas e sugestões com prints
CREATE TABLE IF NOT EXISTS public.feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    empresa_nome TEXT NOT NULL DEFAULT 'RM Controle Interno',
    tipo TEXT NOT NULL DEFAULT 'bug',
    prioridade TEXT NOT NULL DEFAULT 'normal',
    imagem_url TEXT,
    autor_email TEXT NOT NULL,
    autor_nome TEXT,
    status TEXT NOT NULL DEFAULT 'em_analise',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON public.feedbacks (status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON public.feedbacks (created_at DESC);

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_feedbacks_all" ON public.feedbacks;
CREATE POLICY "rls_feedbacks_all" ON public.feedbacks FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Garante a coluna servidor_alocado na tabela empresas
ALTER TABLE IF EXISTS public.empresas
ADD COLUMN IF NOT EXISTS servidor_alocado TEXT NOT NULL DEFAULT 'servidor_1';

-- 3. Adiciona coluna de departamentos na tabela equipe_usuarios
ALTER TABLE IF EXISTS public.equipe_usuarios
ADD COLUMN IF NOT EXISTS departamentos TEXT[] DEFAULT ARRAY['Suporte']::TEXT[];

-- 4. Torna flexível a coluna empresa_id na tabela suporte_chamados para chamados internos/bugs
ALTER TABLE IF EXISTS public.suporte_chamados DROP CONSTRAINT IF EXISTS suporte_chamados_empresa_id_fkey;
ALTER TABLE IF EXISTS public.suporte_chamados ALTER COLUMN empresa_id DROP NOT NULL;

-- 5. Atualiza restrição de status em suporte_chamados
ALTER TABLE IF EXISTS public.suporte_chamados DROP CONSTRAINT IF EXISTS suporte_chamados_status_check;
ALTER TABLE IF EXISTS public.suporte_chamados 
ADD CONSTRAINT suporte_chamados_status_check 
CHECK (status IN ('aguardando_visualizacao', 'em_andamento', 'finalizado', 'cancelado', 'pendente'));

-- 6. Adiciona a tabela feedbacks na publicação Realtime para notificações ao vivo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'feedbacks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedbacks;
  END IF;
END $$;
