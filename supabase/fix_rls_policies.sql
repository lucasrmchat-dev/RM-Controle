-- ==============================================================================
-- CORREÇÃO DEFINITIVA DE RLS (ROW LEVEL SECURITY) - RM CONTROLE
-- Execute este script no SQL Editor do seu projeto Supabase para liberar
-- a inserção, edição e exclusão de empresas e registros sem bloqueio de RLS.
-- ==============================================================================

-- 1. Desabilita o Row Level Security (RLS) nas tabelas operacionais do sistema
ALTER TABLE IF EXISTS public.empresas DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_credenciais DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_checklist DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_canais DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_observacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auditoria_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipe_usuarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sistema_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suporte_chamados DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suporte_motivos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servidor_checklist_template DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.canais_catalogo DISABLE ROW LEVEL SECURITY;

-- 2. Limpa políticas antigas restritivas e cria políticas permissivas totais (caso o RLS venha a ser reativado)
DO $$
DECLARE
    tbl text;
    pol record;
BEGIN
    FOR tbl IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        -- Remove qualquer política restritiva anterior
        FOR pol IN 
            SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
        END LOOP;

        -- Garante política irrestrita para anon e authenticated
        EXECUTE format('CREATE POLICY "Acesso irrestrito %I" ON public.%I FOR ALL TO public USING (true) WITH CHECK (true)', tbl, tbl);
    END LOOP;
END $$;
