-- Equipe: quem não é administrador não altera o PRÓPRIO acesso pelo navegador.
-- A regra antiga (rm_equipe_protege_papel) já barrava papel, e-mail e "ativo", mas cada pessoa
-- ainda podia limpar os próprios departamentos bloqueados ou se dar um perfil (até um de administrador)
-- e passar a ver conversas e demandas de outros departamentos.
-- O servidor (Equipe & Senhas, service role) continua alterando tudo normalmente.
-- Pode ser rodado de novo sem problema.
BEGIN;

CREATE OR REPLACE FUNCTION public.rm_equipe_protege_papel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.rm_eh_admin() THEN
    IF NEW.papel IS DISTINCT FROM OLD.papel
       OR NEW.ativo IS DISTINCT FROM OLD.ativo
       OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email)
       OR NEW.perfil_id IS DISTINCT FROM OLD.perfil_id
       OR NEW.departamentos IS DISTINCT FROM OLD.departamentos
       OR NEW.departamentos_bloqueados IS DISTINCT FROM OLD.departamentos_bloqueados THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar papel, perfil, departamentos, e-mail ou status de membros' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rm_equipe_protege_papel ON public.equipe_usuarios;
CREATE TRIGGER trg_rm_equipe_protege_papel BEFORE UPDATE ON public.equipe_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.rm_equipe_protege_papel();

REVOKE EXECUTE ON FUNCTION public.rm_equipe_protege_papel() FROM PUBLIC, anon, authenticated;

COMMIT;
