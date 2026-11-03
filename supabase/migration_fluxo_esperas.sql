-- Fluxo Inteligente: bloco "Pergunta". O fluxo envia a pergunta e fica esperando a resposta do
-- contato ou grupo; quando ela chega (ou o prazo vence), o fluxo continua de onde parou.
-- Cada linha é uma pergunta esperando resposta numa conversa. Só o servidor lê e grava.
-- Pode ser rodado de novo sem problema.
BEGIN;

CREATE TABLE IF NOT EXISTS public.fluxo_esperas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  fluxo_id UUID NOT NULL REFERENCES public.fluxos(id) ON DELETE CASCADE,
  conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  -- bloco "Pergunta" que está esperando e a variável que vai guardar a resposta
  no_id TEXT NOT NULL,
  variavel TEXT NOT NULL DEFAULT 'resposta',
  -- dados do fluxo no momento da pergunta (contato, conversa, variáveis), para continuar igual
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  expira_em TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Uma pergunta por fluxo e conversa: uma nova substitui a anterior
  UNIQUE (fluxo_id, conversa_id)
);
CREATE INDEX IF NOT EXISTS fluxo_esperas_conversa_idx ON public.fluxo_esperas (conversa_id);
CREATE INDEX IF NOT EXISTS fluxo_esperas_expira_idx ON public.fluxo_esperas (organizacao_id, expira_em);

-- Fluxo e conversa precisam ser da mesma empresa da espera
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.fluxo_esperas;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.fluxo_esperas
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('conversas', 'conversa_id');
DROP TRIGGER IF EXISTS rm_org_imutavel ON public.fluxo_esperas;
CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.fluxo_esperas
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel();

-- Navegador não lê nem grava (nenhuma política = nenhum acesso); o servidor usa a service role
ALTER TABLE public.fluxo_esperas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fluxo_esperas FROM anon, authenticated;
GRANT ALL ON public.fluxo_esperas TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
