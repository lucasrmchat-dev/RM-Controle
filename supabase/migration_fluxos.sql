-- ==============================================================================
-- RM CONTROLE — FLUXO INTELIGENTE
-- Fluxos de automação montados em blocos (gatilhos, mensagens, lógica, agenda e chat) e o
-- registro de cada execução. Os fluxos são da empresa; quem lê e grava é o servidor, que confere
-- o módulo "Fluxo Inteligente". O navegador só lê (equipe da empresa).
-- Rode depois de migration_multiempresa.sql. Pode ser executado de novo sem perder dados.
-- ==============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.fluxos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT false,
  -- { versao, nos: [{ id, tipo, x, y, config }], ligacoes: [{ id, de, saida, para }] }
  definicao JSONB NOT NULL DEFAULT '{"versao":1,"nos":[],"ligacoes":[]}'::jsonb,
  -- Tipos de gatilho presentes (para achar rápido quais fluxos rodam num evento)
  gatilhos TEXT[] NOT NULL DEFAULT '{}',
  versao INTEGER NOT NULL DEFAULT 1,
  criado_por TEXT,
  atualizado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fluxos_org_idx ON public.fluxos (organizacao_id, atualizado_em DESC);
CREATE INDEX IF NOT EXISTS fluxos_gatilhos_idx ON public.fluxos USING GIN (gatilhos);

CREATE TABLE IF NOT EXISTS public.fluxo_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  fluxo_id UUID NOT NULL REFERENCES public.fluxos(id) ON DELETE CASCADE,
  gatilho TEXT NOT NULL,
  -- ok | erro | parou
  status TEXT NOT NULL DEFAULT 'ok',
  resumo TEXT,
  passos JSONB NOT NULL DEFAULT '[]'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fluxo_execucoes_fluxo_idx ON public.fluxo_execucoes (fluxo_id, criado_em DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fluxos', 'fluxo_execucoes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS rm_org_imutavel ON public.%I', t);
    EXECUTE format('CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel()', t);
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
