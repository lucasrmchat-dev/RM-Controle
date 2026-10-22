-- Perfis de acesso personalizados (Configurações › Perfis de acesso).
-- Cada perfil define quais módulos a pessoa usa e quais departamentos ela enxerga.
-- O membro recebe um perfil em Servidores & Equipe; sem perfil, continua com o papel atual.
CREATE TABLE IF NOT EXISTS public.perfis_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  administrador BOOLEAN NOT NULL DEFAULT false,      -- acesso total, inclusive Configurações Avançadas
  modulos TEXT[] NOT NULL DEFAULT '{}',              -- fila, empresas, agenda, dashboard, feedbacks, configuracoes
  todos_departamentos BOOLEAN NOT NULL DEFAULT false, -- inclui departamentos criados no futuro
  departamentos TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS perfis_acesso_nome_uk ON public.perfis_acesso (lower(nome));

ALTER TABLE public.equipe_usuarios
  ADD COLUMN IF NOT EXISTS perfil_id UUID REFERENCES public.perfis_acesso(id) ON DELETE SET NULL;

-- Leitura para a equipe (cada navegador calcula o que mostrar); gravação só pelo servidor (service role)
ALTER TABLE public.perfis_acesso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perfis_acesso_leitura ON public.perfis_acesso;
CREATE POLICY perfis_acesso_leitura ON public.perfis_acesso FOR SELECT TO authenticated USING (public.rm_eh_equipe());
GRANT SELECT ON public.perfis_acesso TO authenticated;
GRANT ALL ON public.perfis_acesso TO service_role;
REVOKE ALL ON public.perfis_acesso FROM anon;

-- A coluna nova também precisa ser legível pelo navegador (equipe_usuarios usa permissão por coluna)
GRANT SELECT (perfil_id) ON public.equipe_usuarios TO authenticated;
