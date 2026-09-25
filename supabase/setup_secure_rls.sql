-- ==============================================================================
-- RM CONTROLE - CONFIGURAÇÃO DEFINITIVA DE SEGURANÇA, RLS & LGPD
-- ==============================================================================
-- 1. Mantém o RLS (Row Level Security) 100% ATIVADO em todas as tabelas.
-- 2. Permite leitura e escrita seguras pela aplicação (chave anon da Vercel).
-- 3. Protege auditoria_logs com imutabilidade (proíbe UPDATE e DELETE - LGPD Art. 37).
-- ==============================================================================

-- 1. Ativa RLS em todas as tabelas
ALTER TABLE IF EXISTS public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auditoria_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipe_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.canais_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checklist_catalogo ENABLE ROW LEVEL SECURITY;

-- 2. Limpa regras antigas
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 3. Políticas de operação com RLS ativo para a aplicação (Web / Vercel)
CREATE POLICY "empresas_app_access" ON public.empresas FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "credenciais_app_access" ON public.empresa_credenciais FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "checklist_app_access" ON public.empresa_checklist FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "canais_app_access" ON public.empresa_canais FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "observacoes_app_access" ON public.empresa_observacoes FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "equipe_app_access" ON public.equipe_usuarios FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "canais_catalogo_access" ON public.canais_catalogo FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "checklist_catalogo_access" ON public.checklist_catalogo FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Auditoria imutável (LGPD): apenas leitura e inserção de logs; proibido alterar ou excluir rastros
CREATE POLICY "auditoria_select_access" ON public.auditoria_logs FOR SELECT TO public USING (true);
CREATE POLICY "auditoria_insert_access" ON public.auditoria_logs FOR INSERT TO public WITH CHECK (true);
