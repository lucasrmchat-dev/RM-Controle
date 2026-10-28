-- ==============================================================================
-- RM CONTROLE — VENDAS E COMISSÃO DO COMERCIAL
-- Cada venda fechada (ao marcar Ganho no processo comercial ou registrada à mão): empresa, vendedor,
-- mensalidade, adicionais e data. A comissão é calculada a partir delas e das reuniões.
-- Quem lê e grava é o servidor (que aplica a visibilidade entre vendedores); o navegador não acessa direto.
-- Rode depois de migration_multiempresa.sql. Pode ser executado de novo sem perder dados.
-- ==============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.comercial_vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  -- reuniao | lead | avulsa
  origem_tipo TEXT NOT NULL DEFAULT 'avulsa',
  origem_id TEXT,
  vendedor_email TEXT NOT NULL,
  vendedor_nome TEXT,
  empresa TEXT NOT NULL,
  contato TEXT,
  mensalidade NUMERIC(12, 2) NOT NULL DEFAULT 0,
  adicionais NUMERIC(12, 2) NOT NULL DEFAULT 0,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  criado_por TEXT,
  atualizado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comercial_vendas_data_idx ON public.comercial_vendas (organizacao_id, data);
CREATE INDEX IF NOT EXISTS comercial_vendas_origem_idx ON public.comercial_vendas (organizacao_id, origem_tipo, origem_id);

DROP TRIGGER IF EXISTS rm_org_imutavel ON public.comercial_vendas;
CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.comercial_vendas FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel();
ALTER TABLE public.comercial_vendas ENABLE ROW LEVEL SECURITY;
-- Sem leitura pelo navegador: vendas e valores passam pelo servidor, que esconde as de outros vendedores quando a regra pede
DROP POLICY IF EXISTS rm_select ON public.comercial_vendas;
REVOKE ALL ON public.comercial_vendas FROM anon, authenticated;
GRANT ALL ON public.comercial_vendas TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
