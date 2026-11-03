-- Auditoria: um registro gravado pelo navegador só pode estar no nome de quem está logado.
-- Antes, qualquer pessoa da equipe podia gravar direto no banco um registro em nome de um colega
-- (ex.: "a Ana excluiu a empresa X"). O app grava sempre pelo servidor (POST /api/auditoria,
-- service role), que continua livre; a regra vale só para gravações feitas direto pelo navegador.
-- Pode ser rodado de novo sem problema.
BEGIN;

DROP POLICY IF EXISTS rm_insert ON public.auditoria_logs;
CREATE POLICY rm_insert ON public.auditoria_logs FOR INSERT TO authenticated
  WITH CHECK (
    organizacao_id = public.rm_org_atual()
    AND public.rm_eh_equipe()
    AND lower(trim(coalesce(usuario_email, ''))) = public.rm_email_atual()
  );

COMMIT;
