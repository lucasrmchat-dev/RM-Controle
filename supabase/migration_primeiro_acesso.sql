-- ==============================================================================
-- MIGRAÇÃO SUPABASE: REGISTRO DE PRIMEIRO ACESSO / ONBOARDING DOS COLABORADORES
-- Em conformidade com LGPD (Art. 6º, I e VII - Segurança e Transparência) e RLS
-- ==============================================================================

-- 1. Adiciona as colunas de controle de primeiro acesso na tabela equipe_usuarios
ALTER TABLE IF EXISTS public.equipe_usuarios
ADD COLUMN IF NOT EXISTS primeiro_acesso_concluido BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS primeiro_acesso_data TIMESTAMPTZ DEFAULT NULL;

-- 2. Cria índice para otimizar checagens frequentes na autenticação
CREATE INDEX IF NOT EXISTS idx_equipe_primeiro_acesso 
ON public.equipe_usuarios (email, primeiro_acesso_concluido);

-- 3. Garante que o Row Level Security (RLS) permaneça ativo
ALTER TABLE public.equipe_usuarios ENABLE ROW LEVEL SECURITY;

-- 4. Política de Leitura: Usuários autenticados podem ler seu próprio registro de equipe
DROP POLICY IF EXISTS "Usuários podem visualizar seu próprio registro de equipe" ON public.equipe_usuarios;
CREATE POLICY "Usuários podem visualizar seu próprio registro de equipe"
ON public.equipe_usuarios
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (
    email = auth.jwt() ->> 'email' OR
    (auth.jwt() -> 'user_metadata' ->> 'papel') = 'administrador'
  )
);

-- 5. Política de Atualização: O próprio usuário pode atualizar suas preferências e primeiro acesso
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio primeiro acesso e perfil" ON public.equipe_usuarios;
CREATE POLICY "Usuários podem atualizar seu próprio primeiro acesso e perfil"
ON public.equipe_usuarios
FOR UPDATE
USING (
  auth.role() = 'authenticated' AND (
    email = auth.jwt() ->> 'email' OR
    (auth.jwt() -> 'user_metadata' ->> 'papel') = 'administrador'
  )
)
WITH CHECK (
  auth.role() = 'authenticated' AND (
    email = auth.jwt() ->> 'email' OR
    (auth.jwt() -> 'user_metadata' ->> 'papel') = 'administrador'
  )
);
