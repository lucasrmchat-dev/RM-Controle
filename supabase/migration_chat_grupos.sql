-- ==============================================================================
-- RM CONTROLE — PARTICIPANTES DOS GRUPOS DO WHATSAPP
-- Nome e número de quem participa de cada grupo: menções com o nome da pessoa (e não o código
-- interno do WhatsApp) e lista de participantes ao digitar @.
-- Rode depois de migration_canais_chat.sql. Pode ser executado de novo sem perder dados.
-- ==============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.participantes_grupo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  -- O grupo é um contato (telefone = identificador do grupo, ex.: 120363...@g.us)
  grupo_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  -- Identificador do participante no WhatsApp (número@s.whatsapp.net ou código@lid)
  jid TEXT NOT NULL,
  -- Número de verdade, quando o WhatsApp informa (nunca o código interno)
  telefone TEXT,
  nome TEXT,
  admin BOOLEAN NOT NULL DEFAULT false,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, jid)
);
CREATE INDEX IF NOT EXISTS participantes_grupo_org_idx ON public.participantes_grupo (organizacao_id);
CREATE INDEX IF NOT EXISTS participantes_grupo_telefone_idx ON public.participantes_grupo (organizacao_id, telefone) WHERE telefone IS NOT NULL;

-- Sempre da mesma empresa do grupo; a empresa dona não muda
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.participantes_grupo;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.participantes_grupo FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('contatos', 'grupo_id');
DROP TRIGGER IF EXISTS rm_org_imutavel ON public.participantes_grupo;
CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.participantes_grupo FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel();

-- Navegador só lê (equipe da empresa); quem grava é o servidor
ALTER TABLE public.participantes_grupo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rm_select ON public.participantes_grupo;
CREATE POLICY rm_select ON public.participantes_grupo FOR SELECT TO authenticated USING (organizacao_id = public.rm_org_atual() AND public.rm_eh_equipe());
REVOKE ALL ON public.participantes_grupo FROM anon, authenticated;
GRANT SELECT ON public.participantes_grupo TO authenticated;
GRANT ALL ON public.participantes_grupo TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
