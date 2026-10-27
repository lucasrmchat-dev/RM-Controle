-- ==============================================================================
-- RM CONTROLE — DAILY (ticket #21)
-- Reuniões diárias da equipe (quantas quiser por dia): resumo e atualizações da ClickMassa,
-- escritos durante ou depois da reunião, e as metas da semana (com responsável e "feito").
-- Rode depois de migration_multiempresa.sql. Pode ser executado de novo sem perder dados.
-- ==============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_reunioes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  titulo TEXT NOT NULL DEFAULT 'Daily',
  resumo TEXT,
  atualizacoes_clickmassa TEXT,
  participantes TEXT[] NOT NULL DEFAULT '{}',
  criado_por TEXT,
  atualizado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_reunioes_data_idx ON public.daily_reunioes (organizacao_id, data DESC);

CREATE TABLE IF NOT EXISTS public.daily_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  -- Segunda-feira da semana da meta
  semana DATE NOT NULL,
  texto TEXT NOT NULL,
  responsavel_email TEXT,
  responsavel_nome TEXT,
  concluida_em TIMESTAMPTZ,
  concluida_por TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_metas_semana_idx ON public.daily_metas (organizacao_id, semana);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_reunioes', 'daily_metas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS rm_org_imutavel ON public.%I', t);
    EXECUTE format('CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel()', t);
    -- Navegador só lê (equipe da empresa); quem grava é o servidor, que confere o módulo Daily
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rm_select ON public.%I', t);
    EXECUTE format('CREATE POLICY rm_select ON public.%I FOR SELECT TO authenticated USING (organizacao_id = public.rm_org_atual() AND public.rm_eh_equipe())', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
