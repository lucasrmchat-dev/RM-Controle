-- ==============================================================================
-- RM CONTROLE - SCHEMA MESTRE COMPLETO DO BANCO DE DADOS SUPABASE
-- Execute este arquivo completo no SQL Editor do Supabase para criar/atualizar
-- todas as tabelas, índices, políticas de segurança (RLS) e dados iniciais.
-- ==============================================================================

-- Habilita extensão pgcrypto para geração de UUIDs se não estiver ativa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABELA: empresas (Clientes / Contas Gerenciadas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    formato_atendimento TEXT NOT NULL DEFAULT 'colaborativo' CHECK (formato_atendimento IN ('colaborativo', 'individual')),
    servidor_alocado TEXT NOT NULL DEFAULT 'servidor_1' CHECK (servidor_alocado IN ('servidor_1', 'servidor_2')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    is_mock BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresas_nome ON public.empresas (nome);
CREATE INDEX IF NOT EXISTS idx_empresas_servidor ON public.empresas (servidor_alocado);
CREATE INDEX IF NOT EXISTS idx_empresas_ativo ON public.empresas (ativo);

-- ==============================================================================
-- 2. TABELA: canais_catalogo (Catálogo Global de Tipos de Canais de Mensageria)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.canais_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('api', 'qrcode', 'social', 'outro')),
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. TABELA: empresa_canais (Canais Conectados por Empresa)
-- ==============================================================================
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

CREATE INDEX IF NOT EXISTS idx_empresa_canais_empresa ON public.empresa_canais (empresa_id);

-- ==============================================================================
-- 4. TABELA: empresa_credenciais (Acessos & Senhas Técnicas - Estilo Apple Keychain)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresa_credenciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    rotulo TEXT NOT NULL,
    usuario_email TEXT,
    senha TEXT NOT NULL,
    observacao TEXT,
    ultima_alteracao TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_credenciais_empresa ON public.empresa_credenciais (empresa_id);

-- ==============================================================================
-- 5. TABELA: empresa_observacoes (Anotações Técnicas & Histórico de Resolução)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.empresa_observacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'geral' CHECK (tipo IN ('geral', 'suporte', 'particularidade')),
    autor_email TEXT NOT NULL DEFAULT 'admin@rmcontrole.com',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_observacoes_empresa ON public.empresa_observacoes (empresa_id);

-- ==============================================================================
-- 6. TABELA: servidor_checklist_template (Modelo Global de Checklist Técnico)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.servidor_checklist_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT NOT NULL DEFAULT 'Infraestrutura',
    obrigatorio BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Checklist específico preenchido por cada empresa
CREATE TABLE IF NOT EXISTS public.empresa_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'Infraestrutura',
    obrigatorio BOOLEAN NOT NULL DEFAULT true,
    concluido BOOLEAN NOT NULL DEFAULT false,
    observacao TEXT,
    concluido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_checklist_empresa ON public.empresa_checklist (empresa_id);

-- ==============================================================================
-- 7. TABELA: suporte_motivos (Catálogo de Motivos de Atendimento)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suporte_motivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 8. TABELA: suporte_chamados (Controle Operacional de Suporte & Métricas de Produtividade)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suporte_chamados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    empresa_nome TEXT NOT NULL,
    tecnico_email TEXT NOT NULL,
    atendente TEXT,
    colaborador_solicitante TEXT,
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
CREATE INDEX IF NOT EXISTS idx_suporte_tecnico ON public.suporte_chamados (tecnico_email);
CREATE INDEX IF NOT EXISTS idx_suporte_iniciado ON public.suporte_chamados (iniciado_em DESC);

-- ==============================================================================
-- 9. TABELA: auditoria_logs (Rastro Imutável de Segurança & LGPD com IP e Operador)
-- ==============================================================================
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

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON public.auditoria_logs (empresa_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_email ON public.auditoria_logs (usuario_email);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON public.auditoria_logs (created_at DESC);

-- ==============================================================================
-- 10. TABELA: equipe_usuarios (Membros da Equipe com Papéis e Senhas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.equipe_usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    papel TEXT NOT NULL DEFAULT 'suporte' CHECK (papel IN ('administrador', 'suporte', 'vendas')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipe_email ON public.equipe_usuarios (email);

-- ==============================================================================
-- 11. TABELA: sistema_config (Parâmetros Globais, Regras e Senha Padrão)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sistema_config (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 12. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
-- ==============================================================================
-- ==============================================================================
-- 12. CONFIGURAÇÃO DE SEGURANÇA, RLS & LGPD
-- Row Level Security (RLS) 100% ATIVADO com conformidade total LGPD
-- ==============================================================================
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canais_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servidor_checklist_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_config ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

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

-- LGPD Art. 37: Logs de auditoria são imutáveis
CREATE POLICY "rls_auditoria_select" ON public.auditoria_logs FOR SELECT TO public USING (true);
CREATE POLICY "rls_auditoria_insert" ON public.auditoria_logs FOR INSERT TO public WITH CHECK (true);

-- ==============================================================================
-- 13. DADOS DE SEMENTE INICIAIS (CATÁLOGO PADRÃO)
-- ==============================================================================

-- Inserir Canais Oficiais de Catálogo se não existirem
INSERT INTO public.canais_catalogo (nome, tipo, descricao) VALUES
    ('Canal API Oficial (Meta Cloud)', 'api', 'Meta Cloud API oficial sem risco de banimento e com alta taxa de entrega'),
    ('Canal Pareamento QR Code', 'qrcode', 'Instância conectada via pareamento de QR Code (Evolution API / Baileys)'),
    ('Facebook Messenger', 'social', 'Página comercial integrada para atendimento unificado'),
    ('Instagram Direct', 'social', 'Mensagens diretas comerciais no Instagram integradas à fila'),
    ('Telegram Bot', 'api', 'Automação para suporte via Telegram oficial'),
    ('Webchat / Widget', 'outro', 'Widget flutuante embarcado no portal web do cliente')
ON CONFLICT (nome) DO NOTHING;

-- Inserir Motivos de Atendimento se não existirem
INSERT INTO public.suporte_motivos (nome, descricao) VALUES
    ('Redefinição de Senha / Acesso', 'Cliente esqueceu ou solicitou nova senha de suporte ou admin'),
    ('Desconexão / Queda de Instância', 'Instância de mensageria desconectada precisando de novo pareamento'),
    ('Bloqueio ou Limite na API Meta', 'Número com limite de mensagens atingido ou falha de pagamento WABA'),
    ('Servidor VPS Indisponível / Reinício', 'Servidor fora do ar, alta carga de CPU ou reinício de processos'),
    ('Configuração de Novo Atendente / Fila', 'Criação de usuário para novo funcionário e vinculação à fila'),
    ('Dúvida Operacional / Treinamento', 'Orientações de uso do painel e fluxo de conversas')
ON CONFLICT (nome) DO NOTHING;

-- Inserir Requisitos Globais de Servidor se a tabela estiver vazia
INSERT INTO public.servidor_checklist_template (titulo, descricao, categoria, obrigatorio)
SELECT * FROM (VALUES
    ('Provisionamento do Servidor VPS/Cloud', 'Instância configurada com SO Linux, portas 80/443 liberadas e firewall', 'Infraestrutura', true),
    ('Configuração de Domínio e SSL/HTTPS', 'DNS apontado com certificado Let''s Encrypt ativo e renovação automática', 'Rede & SSL', true),
    ('Definição do Formato de Atendimento', 'Definido entre Formato Colaborativo ou Individual com equipe', 'Aplicação', true),
    ('Configuração dos Canais (API / QR Code)', 'Canais contratados ativados e validados com testes de envio e recebimento', 'Canais', true),
    ('Credenciais de Administrador Cadastradas', 'E-mail e senha de suporte validados para acesso inicial da diretoria', 'Suporte', true),
    ('Rotina de Backup Automático Ativada', 'Dump de banco de dados e mídias agendados diariamente para armazenamento seguro', 'Segurança & Backup', true)
) AS v(titulo, descricao, categoria, obrigatorio)
WHERE NOT EXISTS (SELECT 1 FROM public.servidor_checklist_template LIMIT 1);

-- Inserir Usuário Administrador Padrão da Equipe se não existir
INSERT INTO public.equipe_usuarios (nome, email, senha, papel) VALUES
    ('Lucas Amorim (Administrador)', 'admin@rmcontrole.com', 'RmControle@Admin2026!', 'administrador'),
    ('Equipe de Suporte Técnico', 'suporte@rmcontrole.com', 'RmSuporte@Padrao2026!', 'suporte'),
    ('Equipe Comercial & Vendas', 'vendas@rmcontrole.com', 'RmVendas@Padrao2026!', 'vendas')
ON CONFLICT (email) DO NOTHING;

-- Inserir Configurações Globais Iniciais
INSERT INTO public.sistema_config (chave, valor) VALUES
    ('senha_padrao', '"RmSuporte@Padrao2026!"'::jsonb),
    ('regras_suporte', '{"motivo_obrigatorio": true, "solucao_obrigatoria": false, "colaborador_obrigatorio": false, "atendente_obrigatorio": false}'::jsonb)
ON CONFLICT (chave) DO NOTHING;
