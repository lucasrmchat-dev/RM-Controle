-- Endurece as funções do schema public (aplicado primeiro no RM Controle SP).
-- 1. Remove funções antigas sem uso (uma delas trazia uma chave de criptografia fixa no código).
-- 2. Remove o gatilho antigo de senha da equipe, que transformava senha vazia num hash e
--    impedia o gatilho novo (rm_equipe_hash_senha) de manter a senha anterior.
-- 3. Ninguém de fora (anon) executa funções; usuários logados só as que as políticas de RLS usam.
-- 4. search_path fixo em todas as funções que ainda não tinham.

-- 1 e 2
DROP TRIGGER IF EXISTS trg_equipe_hash_senha_insert ON public.equipe_usuarios;
DROP FUNCTION IF EXISTS public.trg_hash_equipe_senha();
DROP FUNCTION IF EXISTS public.hash_password(text);
DROP FUNCTION IF EXISTS public.verify_password(text, text);
DROP FUNCTION IF EXISTS public.encrypt_secret(text, text);
DROP FUNCTION IF EXISTS public.decrypt_secret(text, text);
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_authenticated_user();
DROP FUNCTION IF EXISTS public.auth_user_role();
DROP FUNCTION IF EXISTS public.auth_user_email();

-- 3
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
-- Usadas pelas políticas de RLS (direto ou por uma função SECURITY INVOKER) e por storage.js.
GRANT EXECUTE ON FUNCTION
  public.rm_org_atual(),
  public.rm_papel(),
  public.rm_email_atual(),
  public.rm_eh_admin(),
  public.rm_eh_equipe(),
  public.rm_eh_operacao(),
  public.rm_departamento_permitido(text),
  public.rm_credenciais_empresas(uuid)
TO authenticated;
-- Funções novas também nascem fechadas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 4
ALTER FUNCTION public.rm_eh_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.rm_eh_equipe() SET search_path = public, pg_temp;
ALTER FUNCTION public.rm_eh_operacao() SET search_path = public, pg_temp;
ALTER FUNCTION public.rm_org_imutavel() SET search_path = public, pg_temp;
ALTER FUNCTION public.rm_preencher_observacao_inicial() SET search_path = public, pg_temp;
