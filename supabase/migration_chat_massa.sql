-- Chat: ações em massa.
--  1. Atendente padrão do contato ou grupo: toda conversa nova (ou reaberta) dele cai direto com essa pessoa.
--  2. Status de lead pelo Chat: o contato vira oportunidade numa etapa do processo comercial, como os
--     leads que chegam pelo webhook do RM Chat (que continuam iguais). Lead do Chat não tem integração.
-- Só acrescenta colunas e afrouxa uma regra; nada é apagado. Pode ser rodado de novo sem problema.
BEGIN;

-- 1. Atendente padrão
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS responsavel_padrao_email TEXT;
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS responsavel_padrao_nome TEXT;

-- 2. Lead vindo do Chat: sem integração, ligado ao contato (um lead por contato)
ALTER TABLE public.comercial_leads ALTER COLUMN integracao_id DROP NOT NULL;
ALTER TABLE public.comercial_leads ADD COLUMN IF NOT EXISTS contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS comercial_leads_contato_uk ON public.comercial_leads (organizacao_id, contato_id) WHERE contato_id IS NOT NULL;

-- Lead do Chat precisa ser da mesma empresa do contato (o de webhook continua herdando da integração)
CREATE OR REPLACE FUNCTION public.rm_lead_contato_mesma_empresa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org UUID;
BEGIN
  IF NEW.contato_id IS NULL THEN RETURN NEW; END IF;
  SELECT organizacao_id INTO v_org FROM public.contatos WHERE id = NEW.contato_id;
  IF v_org IS NOT NULL AND v_org IS DISTINCT FROM NEW.organizacao_id THEN
    RAISE EXCEPTION 'Registro não pertence à mesma empresa do registro principal.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.rm_lead_contato_mesma_empresa() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS rm_lead_contato_mesma_empresa ON public.comercial_leads;
CREATE TRIGGER rm_lead_contato_mesma_empresa BEFORE INSERT OR UPDATE ON public.comercial_leads
  FOR EACH ROW EXECUTE FUNCTION public.rm_lead_contato_mesma_empresa();

COMMIT;
NOTIFY pgrst, 'reload schema';
