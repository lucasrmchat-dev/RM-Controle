-- ==============================================================================
-- RM CONTROLE - CONFIGURAÇÃO DEFINITIVA DE SEGURANÇA, RLS & LGPD NO SUPABASE
-- Execute este script no SQL Editor do Supabase para:
-- 1. Ativar Row Level Security (RLS) protegendo todos os dados sensíveis dos clientes.
-- 2. Garantir que apenas usuários autenticados da equipe acessem empresas e senhas.
-- 3. Sincronizar automaticamente os membros da equipe (equipe_usuarios) com o Supabase Auth.
-- 4. Blindar o banco contra acessos anônimos da internet.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ==============================================================================
ALTER TABLE IF EXISTS public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auditoria_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipe_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sistema_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suporte_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suporte_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servidor_checklist_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.canais_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checklist_catalogo ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. LIMPEZA DE POLÍTICAS ANTERIORES PARA EVITAR CONFLITOS
-- ==============================================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ==============================================================================
-- 3. POLÍTICAS DE ACESSO RESTRITO (LGPD / SIGILO MÁXIMO)
-- Apenas usuários autenticados na equipe podem acessar ou modificar dados
-- ==============================================================================

-- A) EMPRESAS (Clientes gerenciados)
CREATE POLICY "empresas_auth_select" ON public.empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY "empresas_auth_insert" ON public.empresas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "empresas_auth_update" ON public.empresas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "empresas_auth_delete" ON public.empresas FOR DELETE TO authenticated USING (true);

-- B) EMPRESA_CREDENCIAIS (Senhas e Acessos Técnicos de Clientes - SIGILO MÁXIMO)
CREATE POLICY "credenciais_auth_select" ON public.empresa_credenciais FOR SELECT TO authenticated USING (true);
CREATE POLICY "credenciais_auth_insert" ON public.empresa_credenciais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "credenciais_auth_update" ON public.empresa_credenciais FOR UPDATE TO authenticated USING (true);
CREATE POLICY "credenciais_auth_delete" ON public.empresa_credenciais FOR DELETE TO authenticated USING (true);

-- C) EMPRESA_CANAIS, CHECKLIST E OBSERVAÇÕES
CREATE POLICY "canais_auth_all" ON public.empresa_canais FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "checklist_auth_all" ON public.empresa_checklist FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "observacoes_auth_all" ON public.empresa_observacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- D) EQUIPE_USUARIOS (Dados e Senhas da Equipe)
CREATE POLICY "equipe_auth_all" ON public.equipe_usuarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- E) SUPORTE_CHAMADOS E SISTEMA_CONFIG
CREATE POLICY "chamados_auth_all" ON public.suporte_chamados FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "config_auth_all" ON public.sistema_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- F) AUDITORIA_LOGS (LGPD: Rastro de visualização e alterações)
-- Autenticados podem ler e inserir. Proibido UPDATE e DELETE para garantir integridade imutável
CREATE POLICY "auditoria_auth_select" ON public.auditoria_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auditoria_auth_insert" ON public.auditoria_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ==============================================================================
-- 4. CATÁLOGOS GLOBAIS DE SISTEMA (Modelos gerais sem dados de clientes)
-- Permite leitura de catálogo geral para a interface carregar opções
-- ==============================================================================
CREATE POLICY "catalogo_canais_select" ON public.canais_catalogo FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_canais_modify" ON public.canais_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "catalogo_checklist_select" ON public.checklist_catalogo FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_checklist_modify" ON public.checklist_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "catalogo_motivos_select" ON public.suporte_motivos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_motivos_modify" ON public.suporte_motivos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "catalogo_servidor_select" ON public.servidor_checklist_template FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_servidor_modify" ON public.servidor_checklist_template FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 5. SINCRONIZAÇÃO AUTOMÁTICA: equipe_usuarios -> auth.users
-- Permite que todos os usuários da equipe (Lucas, Maria, etc.) façam login oficial
-- no Supabase Auth com sessão autenticada (role = 'authenticated')
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sync_equipe_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_senha TEXT;
BEGIN
    v_senha := COALESCE(NEW.senha, 'RmSuporte@Padrao2026!');

    IF NEW.ativo = true AND NEW.email IS NOT NULL AND NEW.email <> '' THEN
        SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(NEW.email);

        IF v_user_id IS NULL THEN
            v_user_id := gen_random_uuid();
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
                v_user_id,
                'authenticated',
                'authenticated',
                LOWER(NEW.email),
                crypt(v_senha, gen_salt('bf')),
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('name', NEW.nome, 'papel', NEW.papel),
                now(),
                now(),
                '', '', '', '', '',
                false
            );

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
                v_user_id,
                jsonb_build_object('sub', v_user_id, 'email', LOWER(NEW.email)),
                'email',
                v_user_id::text,
                now(),
                now(),
                now()
            );
        ELSE
            UPDATE auth.users
            SET encrypted_password = crypt(v_senha, gen_salt('bf')),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                raw_user_meta_data = jsonb_build_object('name', NEW.nome, 'papel', NEW.papel),
                updated_at = now()
            WHERE id = v_user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_equipe_to_auth ON public.equipe_usuarios;
CREATE TRIGGER trg_sync_equipe_to_auth
AFTER INSERT OR UPDATE ON public.equipe_usuarios
FOR EACH ROW
EXECUTE FUNCTION public.sync_equipe_to_auth();

-- ==============================================================================
-- 6. SINCRONIZAÇÃO INICIAL DE TODOS OS USUÁRIOS JÁ EXISTENTES
-- ==============================================================================
DO $$
DECLARE
    usr RECORD;
    v_uid UUID;
    v_pwd TEXT;
BEGIN
    FOR usr IN SELECT * FROM public.equipe_usuarios WHERE ativo = true AND email IS NOT NULL LOOP
        v_pwd := COALESCE(usr.senha, 'RmSuporte@Padrao2026!');
        SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = LOWER(usr.email);

        IF v_uid IS NULL THEN
            v_uid := gen_random_uuid();
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
                v_uid,
                'authenticated',
                'authenticated',
                LOWER(usr.email),
                crypt(v_pwd, gen_salt('bf')),
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('name', usr.nome, 'papel', usr.papel),
                now(),
                now(),
                '', '', '', '', '',
                false
            );

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
                v_uid,
                jsonb_build_object('sub', v_uid, 'email', LOWER(usr.email)),
                'email',
                v_uid::text,
                now(),
                now(),
                now()
            );
        ELSE
            UPDATE auth.users
            SET encrypted_password = crypt(v_pwd, gen_salt('bf')),
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                raw_user_meta_data = jsonb_build_object('name', usr.nome, 'papel', usr.papel),
                updated_at = now()
            WHERE id = v_uid;
        END IF;
    END LOOP;
END $$;
