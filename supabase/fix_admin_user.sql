-- ==============================================================================
-- CORREÇÃO DO ERRO 'Database error querying schema' NO SUPABASE AUTH
-- ==============================================================================
-- O Supabase Auth (GoTrue) exige que as colunas de token nunca sejam NULL.
-- Quando inseridas via SQL puro sem esses campos, o Supabase falha com o erro 500.
-- Este comando corrige imediatamente o usuário existente:
-- ==============================================================================

UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, '')
WHERE email = 'admin@rmcontrole.com';
