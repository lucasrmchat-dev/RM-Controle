-- ==============================================================================
-- CRIAÇÃO DO PRIMEIRO USUÁRIO ADMINISTRADOR NO SUPABASE AUTH (VERSÃO DEFINITIVA)
-- ==============================================================================
-- O Supabase Auth (GoTrue) exige que campos como confirmation_token, recovery_token
-- e email_change não sejam NULL. Este script inicializa todos eles como strings vazias ('').
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN
  -- 1. Remove qualquer versão anterior incompleta
  DELETE FROM auth.users WHERE email = 'admin@rmcontrole.com';

  -- 2. Cria o usuário com todos os campos de token preenchidos
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'admin@rmcontrole.com',
    crypt('RmControle@Admin2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Administrador RM Controle"}',
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    false
  );

  -- 3. Cria a identidade associada necessária pelo GoTrue
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, 'admin@rmcontrole.com')::jsonb,
    'email',
    new_user_id::text,
    now(),
    now(),
    now()
  );
END $$;
