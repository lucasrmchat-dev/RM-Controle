-- ==============================================================================
-- SCHEMA SUPABASE: RM CONTROLE
-- Gestão Segura de Empresas, Canais, Requisitos de Servidor e Credenciais
-- Padrão LGPD & RLS (Row Level Security) rigoroso contra vazamento de dados
-- ==============================================================================

-- 1. Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Tabela: empresas
-- Representa as empresas cadastradas no sistema
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    formato_atendimento TEXT NOT NULL DEFAULT 'colaborativo' CHECK (formato_atendimento IN ('colaborativo', 'individual')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_empresas_nome ON public.empresas (nome);
CREATE INDEX IF NOT EXISTS idx_empresas_ativo ON public.empresas (ativo);

-- ==============================================================================
-- 3. Tabela: canais_catalogo
-- Catálogo de canais gerenciados pelo Administrador do sistema
-- (ex: WhatsApp QR Code, WhatsApp API Oficial, Facebook, Instagram, etc.)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.canais_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('api', 'qrcode', 'social', 'outro')),
    descricao TEXT,
    icone TEXT DEFAULT 'message-square',
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserção inicial de canais padrão do catálogo
INSERT INTO public.canais_catalogo (nome, tipo, descricao, icone)
VALUES
    ('WhatsApp API Oficial', 'api', 'Conexão direta Meta Cloud API oficial com selo e números ilimitados', 'sparkles'),
    ('WhatsApp QR Code', 'qrcode', 'Conexão via escaneamento de QR Code / Evolution API / Baileys', 'qr-code'),
    ('Facebook Messenger', 'social', 'Integração com página comercial do Facebook', 'facebook'),
    ('Instagram Direct', 'social', 'Atendimento direto integrado com direct do Instagram', 'instagram'),
    ('Telegram Bot', 'api', 'Automação e canais via Telegram API', 'send'),
    ('Webchat / Widget', 'outro', 'Widget embarcado no site da empresa', 'globe')
ON CONFLICT (nome) DO NOTHING;

-- ==============================================================================
-- 4. Tabela: empresa_canais
-- Canais contratados / adicionados a cada empresa específica
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresa_canais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    canal_id UUID NOT NULL REFERENCES public.canais_catalogo(id) ON DELETE RESTRICT,
    identificador_numero TEXT, -- Número, ID da página ou token de referência
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pendente', 'cancelado')),
    observacao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, canal_id)
);

CREATE INDEX IF NOT EXISTS idx_empresa_canais_empresa ON public.empresa_canais (empresa_id);

-- ==============================================================================
-- 5. Tabela: empresa_observacoes
-- Campos dinâmicos de observações ilimitadas vinculadas à empresa
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresa_observacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT DEFAULT 'Observação Geral',
    conteudo TEXT NOT NULL,
    autor_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_obs_empresa ON public.empresa_observacoes (empresa_id);

-- ==============================================================================
-- 6. Tabela: empresa_credenciais
-- Armazenamento seguro de credenciais para suporte técnico
-- Isolado com RLS estrito e auditoria em conformidade com a LGPD
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresa_credenciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE UNIQUE,
    email_administrador TEXT,
    senha_suporte TEXT NOT NULL, -- Senha necessária para tarefas de suporte
    ultima_visualizacao TIMESTAMPTZ,
    ultima_alteracao TIMESTAMPTZ NOT NULL DEFAULT now(),
    alterado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_credenciais_empresa ON public.empresa_credenciais (empresa_id);

-- ==============================================================================
-- 7. Tabela: checklist_catalogo
-- Requisitos padrão de provisionamento e configuração de servidor
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.checklist_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'servidor',
    ordem INT NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.checklist_catalogo (titulo, descricao, categoria, ordem)
VALUES
    ('Provisionamento do Servidor VPS/Cloud', 'Instância configurada com SO Linux, portas e firewall', 'servidor', 1),
    ('Configuração de Domínio e SSL/HTTPS', 'DNS apontado com certificado Let''s Encrypt ativo', 'servidor', 2),
    ('Definição do Formato de Atendimento', 'Escolha entre Formato Colaborativo ou Formato Individual', 'servidor', 3),
    ('Configuração dos Canais (API / QR Code)', 'Canais ativados e validados com mensagens de teste', 'canais', 4),
    ('Credenciais de Administrador Cadastradas', 'E-mail e senha de suporte validados para acesso', 'suporte', 5),
    ('Configuração de Backup Automático', 'Rotina de dump de banco e volume de mídias ativada', 'seguranca', 6)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 8. Tabela: empresa_checklist
-- Instância dos itens de checklist da empresa com observações personalizadas
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresa_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    item_catalogo_id UUID REFERENCES public.checklist_catalogo(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    concluido BOOLEAN NOT NULL DEFAULT false,
    observacao TEXT,
    concluido_em TIMESTAMPTZ,
    concluido_por TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_checklist_empresa ON public.empresa_checklist (empresa_id);

-- ==============================================================================
-- 9. Tabela: auditoria_logs (LGPD & Compliance)
-- Rastro imutável de acesso e modificações a dados sensíveis (senhas, edições)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auditoria_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES auth.users(id),
    usuario_email TEXT NOT NULL,
    acao TEXT NOT NULL, -- 'visualizou_senha', 'alterou_senha', 'cadastrou_empresa', 'excluiu_empresa', etc.
    detalhes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON public.auditoria_logs (empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON public.auditoria_logs (usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON public.auditoria_logs (created_at DESC);

-- ==============================================================================
-- 10. SEGURANÇA E LGPD: ROW LEVEL SECURITY (RLS)
-- Sem possibilidade de vazamento de dados para acessos anônimos
-- ==============================================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canais_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para empresas: Apenas usuários autenticados
CREATE POLICY "Permitir leitura de empresas para autenticados"
    ON public.empresas FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Permitir inserção de empresas para autenticados"
    ON public.empresas FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Permitir atualização de empresas para autenticados"
    ON public.empresas FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Permitir exclusão de empresas para autenticados"
    ON public.empresas FOR DELETE
    TO authenticated
    USING (true);

-- Políticas para canais_catalogo
CREATE POLICY "Permitir leitura do catalogo de canais para autenticados"
    ON public.canais_catalogo FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Permitir gerenciamento do catalogo de canais para autenticados"
    ON public.canais_catalogo FOR ALL
    TO authenticated
    USING (true);

-- Políticas para empresa_canais
CREATE POLICY "Permitir acesso aos canais da empresa para autenticados"
    ON public.empresa_canais FOR ALL
    TO authenticated
    USING (true);

-- Políticas para empresa_observacoes
CREATE POLICY "Permitir acesso a observacoes da empresa para autenticados"
    ON public.empresa_observacoes FOR ALL
    TO authenticated
    USING (true);

-- Políticas para empresa_credenciais (DADOS CRÍTICOS / LGPD)
-- Usuários anônimos são expressamente bloqueados
CREATE POLICY "Permitir leitura de credenciais apenas para autenticados"
    ON public.empresa_credenciais FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Permitir inserção e alteração de credenciais apenas para autenticados"
    ON public.empresa_credenciais FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Permitir atualização de credenciais apenas para autenticados"
    ON public.empresa_credenciais FOR UPDATE
    TO authenticated
    USING (true);

-- Políticas para checklist
CREATE POLICY "Permitir leitura de catalogo de checklist para autenticados"
    ON public.checklist_catalogo FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Permitir gerenciamento do checklist da empresa para autenticados"
    ON public.empresa_checklist FOR ALL
    TO authenticated
    USING (true);

-- Políticas para auditoria_logs:
-- Autenticados podem registrar logs (INSERT) e visualizar seus rastros (SELECT)
-- NUNCA permitir UPDATE ou DELETE em logs de auditoria (princípio da integridade)
CREATE POLICY "Permitir inserção de logs de auditoria para autenticados"
    ON public.auditoria_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Permitir leitura de logs de auditoria para autenticados"
    ON public.auditoria_logs FOR SELECT
    TO authenticated
    USING (true);
-- ==============================================================================
-- 11. Tabela: suporte_chamados (Métricas e Atendimentos em Tempo Real)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suporte_chamados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    empresa_nome TEXT NOT NULL,
    tecnico_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizado', 'cancelado')),
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizado_em TIMESTAMPTZ,
    duracao_segundos INT DEFAULT 0,
    motivo TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suporte_empresa ON public.suporte_chamados (empresa_id);
CREATE INDEX IF NOT EXISTS idx_suporte_status ON public.suporte_chamados (status);

-- 12. Tabela: suporte_motivos (Catálogo de Motivos de Chamado)
CREATE TABLE IF NOT EXISTS public.suporte_motivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Tabela: servidor_checklist_template (Checklist Global de Servidores configurado pelo Admin)
CREATE TABLE IF NOT EXISTS public.servidor_checklist_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'Servidor',
    obrigatorio BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.suporte_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servidor_checklist_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso completo a suporte_chamados para autenticados"
    ON public.suporte_chamados FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Permitir acesso completo a suporte_motivos para autenticados"
    ON public.suporte_motivos FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Permitir acesso completo a servidor_checklist_template para autenticados"
    ON public.servidor_checklist_template FOR ALL
    TO authenticated
    USING (true);
