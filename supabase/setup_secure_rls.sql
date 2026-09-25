-- ==============================================================================
-- RM CONTROLE - CONFIGURAÇÃO DEFINITIVA DE SEGURANÇA, RLS & LGPD NO SUPABASE
-- Execute este script no SQL Editor do Supabase.
-- Ele cria automaticamente qualquer tabela pendente antes de aplicar as regras de RLS,
-- evitando qualquer erro de "relation does not exist".
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CRIAÇÃO DAS TABELAS SE NÃO EXISTIREM (GARANTIA DE INTEGRIDADE)
-- ==============================================================================

-- Tabela: empresas
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    formato_atendimento TEXT NOT NULL DEFAULT 'colaborativo',
    servidor_alocado TEXT NOT NULL DEFAULT 'servidor_1',
    ativo BOOLEAN NOT NULL DEFAULT true,
    is_mock BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: canais_catalogo
CREATE TABLE IF NOT EXISTS public.canais_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL,
    descricao TEXT,
    icone TEXT DEFAULT 'message-square',
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: checklist_catalogo
CREATE TABLE IF NOT EXISTS public.checklist_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'servidor',
    ordem INT NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true
);

-- Tabela: servidor_checklist_template
CREATE TABLE IF NOT EXISTS public.servidor_checklist_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'Infraestrutura',
    obrigatorio BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: empresa_canais
CREATE TABLE IF NOT EXISTS public.empresa_canais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    canal_id UUID,
    nome TEXT,
    tipo TEXT,
    identificador_numero TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    observacao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: empresa_credenciais (Sigilo LGPD)
CREATE TABLE IF NOT EXISTS public.empresa_credenciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    rotulo TEXT DEFAULT 'Acesso Principal',
    usuario_email TEXT,
    email_administrador TEXT,
    senha TEXT,
    senha_suporte TEXT,
    observacao TEXT,
    ultima_visualizacao TIMESTAMPTZ,
    ultima_alteracao TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: empresa_observacoes
CREATE TABLE IF NOT EXISTS public.empresa_observacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT DEFAULT 'Observação',
    conteudo TEXT NOT NULL,
    tipo TEXT DEFAULT 'geral',
    autor_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: empresa_checklist
CREATE TABLE IF NOT EXISTS public.empresa_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    item_catalogo_id UUID,
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'Infraestrutura',
    obrigatorio BOOLEAN NOT NULL DEFAULT true,
    concluido BOOLEAN NOT NULL DEFAULT false,
    observacao TEXT,
    concluido_em TIMESTAMPTZ,
    concluido_por TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: auditoria_logs (Rastro LGPD)
CREATE TABLE IF NOT EXISTS public.auditoria_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    usuario_id UUID,
    usuario_email TEXT NOT NULL,
    usuario_nome TEXT,
    operador_nome TEXT,
    ip_origem TEXT DEFAULT 'Rede Local / Cliente',
    acao TEXT NOT NULL,
    detalhes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: equipe_usuarios (Membros internos)
CREATE TABLE IF NOT EXISTS public.equipe_usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    papel TEXT NOT NULL DEFAULT 'suporte',
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: sistema_config
CREATE TABLE IF NOT EXISTS public.sistema_config (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: suporte_motivos
CREATE TABLE IF NOT EXISTS public.suporte_motivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: suporte_chamados (Fila e Métricas de Suporte)
CREATE TABLE IF NOT EXISTS public.suporte_chamados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    empresa_nome TEXT NOT NULL,
    tecnico_email TEXT NOT NULL,
    atendente TEXT,
    colaborador_solicitante TEXT,
    status TEXT NOT NULL DEFAULT 'em_andamento',
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizado_em TIMESTAMPTZ,
    duracao_segundos INT DEFAULT 0,
    motivo TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 2. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servidor_checklist_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canais_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_catalogo ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 3. LIMPEZA SEGURA DE TODAS AS POLÍTICAS EXISTENTES
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
-- 4. POLÍTICAS RESTRITAS PARA USUÁRIOS AUTENTICADOS (LGPD)
-- Usuários anônimos da internet não conseguem ler nem alterar
-- ==============================================================================

-- A) EMPRESAS
CREATE POLICY "empresas_auth_all" ON public.empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- B) EMPRESA_CREDENCIAIS (Senhas de Clientes - SIGILO MÁXIMO)
CREATE POLICY "credenciais_auth_all" ON public.empresa_credenciais FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- C) CANAIS, CHECKLIST E OBSERVAÇÕES DE CLIENTES
CREATE POLICY "canais_auth_all" ON public.empresa_canais FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "checklist_auth_all" ON public.empresa_checklist FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "observacoes_auth_all" ON public.empresa_observacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- D) EQUIPE E OPERACIONAL
CREATE POLICY "equipe_auth_all" ON public.equipe_usuarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chamados_auth_all" ON public.suporte_chamados FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "config_auth_all" ON public.sistema_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- E) AUDITORIA_LOGS (LGPD: Apenas leitura e inserção; proibido UPDATE ou DELETE)
CREATE POLICY "auditoria_auth_select" ON public.auditoria_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auditoria_auth_insert" ON public.auditoria_logs FOR INSERT TO authenticated WITH CHECK (true);

-- F) CATÁLOGOS GERAIS DE INTERFACE (Modelos de canais, checklists e motivos padrão)
CREATE POLICY "catalogo_canais_select" ON public.canais_catalogo FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_canais_modify" ON public.canais_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "catalogo_checklist_select" ON public.checklist_catalogo FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_checklist_modify" ON public.checklist_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "catalogo_servidor_select" ON public.servidor_checklist_template FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_servidor_modify" ON public.servidor_checklist_template FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "catalogo_motivos_select" ON public.suporte_motivos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "catalogo_motivos_modify" ON public.suporte_motivos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 5. SINCRONIZAÇÃO AUTOMÁTICA: equipe_usuarios -> auth.users
-- Permite login oficial de Maria, Lucas e equipe no Supabase Auth
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
-- 6. SINCRONIZAÇÃO INICIAL DE TODOS OS USUÁRIOS ATUAIS
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
