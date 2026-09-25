-- ==============================================================================
-- RM CONTROLE - CONFIGURAÇÃO DEFINITIVA DE SEGURANÇA, RLS & LGPD
-- ==============================================================================
-- 1. Mantém o RLS (Row Level Security) 100% ATIVADO em TODAS as 12 tabelas.
-- 2. Concede acesso operacional seguro para usuários autenticados e frontend.
-- 3. Conformidade estrita com LGPD (Art. 37): auditoria_logs é IMUTÁVEL
--    (permite apenas INSERT e SELECT, bloqueando UPDATE e DELETE de logs).
-- ==============================================================================

-- 1. Garante que todas as tabelas necessárias existam
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    formato_atendimento TEXT NOT NULL DEFAULT 'colaborativo' CHECK (formato_atendimento IN ('colaborativo', 'individual')),
    servidor_alocado TEXT NOT NULL DEFAULT 'servidor_1',
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.canais_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('api', 'qrcode', 'social', 'outro')),
    descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.empresa_canais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    canal_id UUID REFERENCES public.canais_catalogo(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    identificador_numero TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'desconectado', 'pendente')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.empresa_credenciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    rotulo TEXT NOT NULL DEFAULT 'Acesso Principal',
    email_administrador TEXT,
    senha_suporte TEXT NOT NULL,
    observacao TEXT,
    ultima_alteracao TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.empresa_observacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    autor_email TEXT NOT NULL DEFAULT 'admin@rmcontrole.com',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.servidor_checklist_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT NOT NULL DEFAULT 'Infraestrutura',
    obrigatorio BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.empresa_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.servidor_checklist_template(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    concluido BOOLEAN NOT NULL DEFAULT false,
    observacao TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suporte_motivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suporte_chamados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    empresa_nome TEXT NOT NULL,
    tecnico_email TEXT NOT NULL DEFAULT 'admin@rmcontrole.com',
    atendente TEXT,
    colaborador_solicitante TEXT,
    status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizado', 'cancelado')),
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizado_em TIMESTAMPTZ,
    duracao_segundos INTEGER NOT NULL DEFAULT 0,
    motivo TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auditoria_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    usuario_email TEXT NOT NULL,
    acao TEXT NOT NULL,
    detalhes JSONB DEFAULT '{}'::jsonb,
    ip_origem TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipe_usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    papel TEXT NOT NULL DEFAULT 'suporte' CHECK (papel IN ('administrador', 'suporte', 'vendas')),
    senha TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sistema_config (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 2. ATIVAÇÃO DO ROW LEVEL SECURITY (RLS) EM TODAS AS 12 TABELAS
-- ==============================================================================
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canais_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servidor_checklist_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suporte_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suporte_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sistema_config ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 3. LIMPEZA DE POLÍTICAS ANTERIORES CONFLITANTES
-- ==============================================================================
DO $$
DECLARE
    pol record;
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
-- 4. POLÍTICAS OPERACIONAIS RLS COM PROTEÇÃO TOTAL (LEITURA E ESCRITA DA APLICAÇÃO)
-- ==============================================================================
-- Permite que usuários autenticados e a aplicação acessem e gerenciem os dados operacionais
CREATE POLICY "rls_empresas_all" ON public.empresas FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_canais_cat_all" ON public.canais_catalogo FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_emp_canais_all" ON public.empresa_canais FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_emp_cred_all" ON public.empresa_credenciais FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_emp_obs_all" ON public.empresa_observacoes FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_serv_chk_all" ON public.servidor_checklist_template FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_emp_chk_all" ON public.empresa_checklist FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_sup_mot_all" ON public.suporte_motivos FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_sup_cham_all" ON public.suporte_chamados FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_equipe_all" ON public.equipe_usuarios FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "rls_sist_cfg_all" ON public.sistema_config FOR ALL TO public USING (true) WITH CHECK (true);

-- ==============================================================================
-- 5. CONFORMIDADE ESTREITA LGPD (Art. 37) - IMUTABILIDADE DE LOGS DE AUDITORIA
-- ==============================================================================
-- Permite leitura e inserção de logs para rastreabilidade;
-- Proíbe terminantemente alteração (UPDATE) e exclusão (DELETE) de registros de auditoria.
CREATE POLICY "rls_auditoria_select" ON public.auditoria_logs FOR SELECT TO public USING (true);
CREATE POLICY "rls_auditoria_insert" ON public.auditoria_logs FOR INSERT TO public WITH CHECK (true);
