-- Preferências da pessoa (cor do sistema, tema, avisos na tela, modo de visualização, sons), guardadas na CONTA:
-- valem em qualquer navegador ou computador em que ela entrar.
-- É da PESSOA (e-mail da sessão), não de uma empresa: por isso não tem organizacao_id (o suporte da plataforma,
-- ao entrar na empresa de um cliente, continua com as próprias preferências). Só o servidor lê e grava
-- (a tela passa por /api/preferencias, que usa o e-mail da sessão: ninguém lê nem grava a de outra pessoa).
-- Pode ser rodado de novo sem problema.
BEGIN;

CREATE TABLE IF NOT EXISTS public.usuario_preferencias (
  email TEXT PRIMARY KEY,
  preferencias JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Navegador não lê nem grava (nenhuma política = nenhum acesso); o servidor usa a service role
ALTER TABLE public.usuario_preferencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuario_preferencias FROM anon, authenticated;
GRANT ALL ON public.usuario_preferencias TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
