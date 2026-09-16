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
