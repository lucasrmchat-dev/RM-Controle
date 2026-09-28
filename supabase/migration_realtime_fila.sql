-- ==============================================================================
-- MIGRAÇÃO SUPABASE: SINCRONIZAÇÃO EM TEMPO REAL DA FILA DE DEMANDAS
-- Habilita WebSockets gratuitos do Supabase Realtime para todos os colaboradores
-- ==============================================================================

-- 1. Atualiza a restrição de status para incluir chamados em espera e na fila
ALTER TABLE IF EXISTS public.suporte_chamados 
DROP CONSTRAINT IF EXISTS suporte_chamados_status_check;

ALTER TABLE IF EXISTS public.suporte_chamados 
ADD CONSTRAINT suporte_chamados_status_check 
CHECK (status IN ('aguardando_visualizacao', 'em_andamento', 'finalizado', 'cancelado', 'pendente'));

-- 2. Configura a réplica completa para enviar todas as colunas nas atualizações
ALTER TABLE IF EXISTS public.suporte_chamados REPLICA IDENTITY FULL;

-- 3. Habilita o canal Supabase Realtime (postgres_changes) para a tabela suporte_chamados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'suporte_chamados'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.suporte_chamados;
  END IF;
END $$;

-- 4. Garante que todos os operadores autenticados possam ler, criar e atualizar chamados
ALTER TABLE public.suporte_chamados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_sup_cham_all" ON public.suporte_chamados;
CREATE POLICY "rls_sup_cham_all" 
ON public.suporte_chamados 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);
