-- ==============================================================================
-- RM CONTROLE — MIGRAÇÃO COMPLETA PARA O SUPABASE (dados, RLS e criptografia)
--
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo inteiro › Run.
-- É idempotente (pode rodar de novo sem duplicar nada) e substitui os arquivos
-- migration_fila_sync_e_lembretes.sql e migration_consistencia_empresas.sql.
--
-- O que faz:
--   1. Funções de papel (administrador / suporte / vendas) usadas pela RLS
--   2. Colunas que o app usa e o banco ainda não tinha
--   3. Tabelas novas para tudo que ficava só no navegador
--   4. Criptografia: senhas da equipe em bcrypt; senhas das empresas e senha
--      padrão cifradas (AES-256) com chave guardada no Supabase Vault
--   5. Limite de tentativas persistente (anti força bruta / abuso)
--   6. RLS revisada em TODAS as tabelas + bloqueio de colunas sensíveis
--   7. Dados iniciais e Realtime
-- ==============================================================================

-- 0. EXTENSÕES ------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- Se o pgcrypto foi instalado em outro esquema (ex.: public), move para "extensions"
DO $$ BEGIN
  IF (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto') <> 'extensions' THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

-- ==============================================================================
-- 1. PAPÉIS DE ACESSO (mesma regra de src/lib/roles.js)
-- ==============================================================================
-- Administradores proprietários (sempre administradores, mesmo fora de Equipe & Senhas)
CREATE TABLE IF NOT EXISTS public.rm_admins_proprietarios (
  email TEXT PRIMARY KEY
);
INSERT INTO public.rm_admins_proprietarios (email) VALUES
  ('admin@rmcontrole.com'), ('lucas.rmchat@gmail.com'), ('lucas@rmchat.com')
ON CONFLICT (email) DO NOTHING;

-- Colunas de equipe usadas pelo app (garantidas antes das funções que as leem)
ALTER TABLE public.equipe_usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.equipe_usuarios ADD COLUMN IF NOT EXISTS departamentos TEXT[] DEFAULT ARRAY['Suporte']::TEXT[];
ALTER TABLE public.equipe_usuarios ADD COLUMN IF NOT EXISTS departamentos_bloqueados TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.equipe_usuarios ADD COLUMN IF NOT EXISTS primeiro_acesso_concluido BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.equipe_usuarios ADD COLUMN IF NOT EXISTS primeiro_acesso_data TIMESTAMPTZ;
ALTER TABLE public.equipe_usuarios ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.rm_email_atual()
RETURNS TEXT LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$ SELECT lower(trim(coalesce(auth.jwt() ->> 'email', ''))) $$;

CREATE OR REPLACE FUNCTION public.rm_papel()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.rm_email_atual() = '' THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.rm_admins_proprietarios a WHERE a.email = public.rm_email_atual()) THEN 'administrador'
    ELSE (
      SELECT e.papel FROM public.equipe_usuarios e
      WHERE lower(trim(e.email)) = public.rm_email_atual() AND coalesce(e.ativo, true)
      LIMIT 1
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.rm_eh_equipe()   RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT public.rm_papel() IS NOT NULL $$;
CREATE OR REPLACE FUNCTION public.rm_eh_admin()    RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT public.rm_papel() = 'administrador' $$;
CREATE OR REPLACE FUNCTION public.rm_eh_operacao() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT public.rm_papel() IN ('administrador', 'suporte') $$;

-- ==============================================================================
-- 2. COLUNAS QUE O APP USA
-- ==============================================================================
-- Empresas: tipo de cliente ('novo' = setup 0%, 'existente' = setup 100%) e data
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS servidor_alocado TEXT NOT NULL DEFAULT 'servidor_1';
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS tipo_cliente TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cliente_desde DATE;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresas_tipo_cliente_check') THEN
    ALTER TABLE public.empresas ADD CONSTRAINT empresas_tipo_cliente_check
      CHECK (tipo_cliente IS NULL OR tipo_cliente IN ('novo', 'existente'));
  END IF;
END $$;
UPDATE public.empresas SET cliente_desde = created_at::date WHERE cliente_desde IS NULL;

-- Fila de demandas
ALTER TABLE public.suporte_chamados ALTER COLUMN empresa_id DROP NOT NULL;
ALTER TABLE public.suporte_chamados DROP CONSTRAINT IF EXISTS suporte_chamados_empresa_id_fkey;
ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS atendente TEXT;
ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS colaborador_solicitante TEXT;
ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS etiquetas TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS prazo_limite TIMESTAMPTZ;
ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS is_lembrete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS criador_email TEXT;
ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS atribuido_a TEXT;
ALTER TABLE public.suporte_chamados DROP CONSTRAINT IF EXISTS suporte_chamados_status_check;
ALTER TABLE public.suporte_chamados ADD CONSTRAINT suporte_chamados_status_check
  CHECK (status IN ('aguardando_visualizacao', 'em_andamento', 'finalizado', 'cancelado', 'pendente'));
ALTER TABLE public.suporte_chamados REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_suporte_chamados_status ON public.suporte_chamados (status);
CREATE INDEX IF NOT EXISTS idx_suporte_chamados_created ON public.suporte_chamados (created_at DESC);

-- Credenciais das empresas (o app já usou dois formatos de coluna; ficam ambos)
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS rotulo TEXT DEFAULT 'Acesso Principal';
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS email_administrador TEXT;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS nome_usuario TEXT;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS senha TEXT;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS senha_suporte TEXT;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS senha_cifrada BYTEA;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS is_principal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.empresa_credenciais ADD COLUMN IF NOT EXISTS ultima_alteracao TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.empresa_credenciais ALTER COLUMN senha DROP NOT NULL;
ALTER TABLE public.empresa_credenciais ALTER COLUMN senha_suporte DROP NOT NULL;

-- Checklist da empresa
ALTER TABLE public.empresa_checklist ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ;
ALTER TABLE public.empresa_checklist ADD COLUMN IF NOT EXISTS concluido_por TEXT;
ALTER TABLE public.empresa_checklist ADD COLUMN IF NOT EXISTS observacao TEXT;

-- Feedbacks
ALTER TABLE IF EXISTS public.feedbacks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ==============================================================================
-- 3. TABELAS NOVAS (antes ficavam só no navegador de cada colaborador)
-- ==============================================================================
-- Parâmetros globais (departamentos, regras de atendimento, URLs dos servidores...)
CREATE TABLE IF NOT EXISTS public.sistema_config (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detalhes do servidor de cada empresa (IP, porta, observações e checklist de implementação)
CREATE TABLE IF NOT EXISTS public.empresa_servidor (
  empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  ip_personalizado TEXT DEFAULT '',
  porta_ssh TEXT DEFAULT '2222',
  observacoes_infra TEXT DEFAULT '',
  peculiaridades TEXT DEFAULT '',
  config_personalizada TEXT DEFAULT '',
  checklist_implementacao JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Garante todas as colunas mesmo se a tabela já existia com outro formato
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS ip_personalizado TEXT DEFAULT '';
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS porta_ssh TEXT DEFAULT '2222';
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS observacoes_infra TEXT DEFAULT '';
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS peculiaridades TEXT DEFAULT '';
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS config_personalizada TEXT DEFAULT '';
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS checklist_implementacao JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.empresa_servidor ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Remove os 10 itens padrão que eram injetados sem terem sido pedidos (ids chk_srv_*);
-- itens cadastrados pela equipe são mantidos
UPDATE public.empresa_servidor
   SET checklist_implementacao = coalesce((
         SELECT jsonb_agg(item) FROM jsonb_array_elements(checklist_implementacao) item
          WHERE coalesce(item ->> 'id', '') NOT LIKE 'chk_srv_%'
       ), '[]'::jsonb)
 WHERE checklist_implementacao::text LIKE '%chk_srv_%';

-- Colaboradores (contatos) de cada empresa
CREATE TABLE IF NOT EXISTS public.empresa_colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cargo TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_empresa_colaboradores_empresa ON public.empresa_colaboradores (empresa_id);

-- Base de soluções ("Como resolver chamados")
CREATE TABLE IF NOT EXISTS public.solucoes_suporte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  empresa_nome TEXT DEFAULT 'Global',
  titulo TEXT NOT NULL,
  erro_codigo TEXT DEFAULT '',
  contexto TEXT DEFAULT '',
  tipo_erro TEXT DEFAULT 'Suporte Geral',
  solucao_passos TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  autor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_solucoes_created ON public.solucoes_suporte (created_at DESC);

-- Agenda da equipe (eventos importados do Google Agenda pessoal continuam só no navegador)
CREATE TABLE IF NOT EXISTS public.agenda_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  empresa TEXT DEFAULT '',
  data DATE NOT NULL,
  hora_inicio TEXT DEFAULT '09:00',
  hora_fim TEXT DEFAULT '10:00',
  responsavel_email TEXT,
  responsavel_nome TEXT,
  link_reuniao TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'agendada',
  tipo TEXT DEFAULT 'cliente',
  observacoes TEXT DEFAULT '',
  chamado_id TEXT,
  criado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agenda_data ON public.agenda_eventos (data);

-- Catálogos que o app já usava localmente
CREATE TABLE IF NOT EXISTS public.suporte_motivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
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

-- Toda demanda fica vinculada pelo ID da empresa: quem abrir a demanda digitando o nome
-- (ou pela integração) ganha o ID automaticamente, e as antigas sem ID são corrigidas agora.
CREATE OR REPLACE FUNCTION public.rm_chamado_vincular_empresa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.empresa_id IS NULL AND coalesce(NEW.empresa_nome, '') <> '' THEN
    SELECT e.id INTO NEW.empresa_id
      FROM public.empresas e
     WHERE lower(trim(e.nome)) = lower(trim(NEW.empresa_nome))
     ORDER BY e.created_at
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rm_chamado_vincular_empresa ON public.suporte_chamados;
CREATE TRIGGER trg_rm_chamado_vincular_empresa BEFORE INSERT OR UPDATE OF empresa_nome, empresa_id ON public.suporte_chamados
  FOR EACH ROW EXECUTE FUNCTION public.rm_chamado_vincular_empresa();
UPDATE public.suporte_chamados c
   SET empresa_id = e.id
  FROM public.empresas e
 WHERE c.empresa_id IS NULL AND lower(trim(c.empresa_nome)) = lower(trim(e.nome));
CREATE INDEX IF NOT EXISTS idx_suporte_chamados_empresa ON public.suporte_chamados (empresa_id);

-- ==============================================================================
-- 4. CRIPTOGRAFIA
-- ==============================================================================
-- 4.1 Chave AES-256 gerada aleatoriamente e guardada no Supabase Vault (fora das tabelas)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'rm_chave_dados') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'rm_chave_dados',
      'Chave de cifragem das senhas de empresas e da senha padrão (RM Controle)'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rm_cifrar(p_texto TEXT)
RETURNS BYTEA LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_chave TEXT;
BEGIN
  IF p_texto IS NULL OR p_texto = '' THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_chave FROM vault.decrypted_secrets WHERE name = 'rm_chave_dados';
  RETURN extensions.pgp_sym_encrypt(p_texto, v_chave, 'cipher-algo=aes256');
END $$;

CREATE OR REPLACE FUNCTION public.rm_decifrar(p_dado BYTEA)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_chave TEXT;
BEGIN
  IF p_dado IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_chave FROM vault.decrypted_secrets WHERE name = 'rm_chave_dados';
  RETURN extensions.pgp_sym_decrypt(p_dado, v_chave);
END $$;

-- 4.2 Senhas das empresas: o app grava normalmente; o banco cifra e apaga o texto puro
CREATE OR REPLACE FUNCTION public.rm_credencial_cifrar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_texto TEXT;
BEGIN
  v_texto := coalesce(nullif(NEW.senha_suporte, ''), nullif(NEW.senha, ''));
  IF v_texto IS NOT NULL THEN
    NEW.senha_cifrada := public.rm_cifrar(v_texto);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.senha_cifrada := OLD.senha_cifrada; -- atualização sem senha mantém a atual
  END IF;
  NEW.senha_suporte := NULL;
  NEW.senha := NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rm_credencial_cifrar ON public.empresa_credenciais;
CREATE TRIGGER trg_rm_credencial_cifrar BEFORE INSERT OR UPDATE ON public.empresa_credenciais
  FOR EACH ROW EXECUTE FUNCTION public.rm_credencial_cifrar();
-- Cifra as senhas já existentes (o UPDATE dispara o trigger acima)
UPDATE public.empresa_credenciais
   SET senha_suporte = coalesce(nullif(senha_suporte, ''), senha)
 WHERE coalesce(nullif(senha_suporte, ''), nullif(senha, '')) IS NOT NULL;

-- Leitura das credenciais já decifradas. Senha só para administrador e suporte; vendas vê o resto.
CREATE OR REPLACE FUNCTION public.rm_credenciais_empresas(p_empresa_id UUID DEFAULT NULL)
RETURNS SETOF JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.rm_eh_equipe() THEN
    RAISE EXCEPTION 'Sem permissão para ver credenciais' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT (to_jsonb(c) - 'senha_cifrada' - 'senha' - 'senha_suporte')
           || jsonb_build_object('senha_suporte',
                CASE WHEN public.rm_eh_operacao() THEN public.rm_decifrar(c.senha_cifrada) ELSE NULL END)
      FROM public.empresa_credenciais c
     WHERE p_empresa_id IS NULL OR c.empresa_id = p_empresa_id
     ORDER BY c.created_at;
END $$;

-- 4.3 Senhas da equipe: bcrypt (irreversível). O app grava em texto e o banco transforma em hash.
CREATE OR REPLACE FUNCTION public.rm_equipe_hash_senha()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.senha IS NOT NULL AND NEW.senha <> '' AND NEW.senha !~ '^\$2[abxy]\$' THEN
    NEW.senha := extensions.crypt(NEW.senha, extensions.gen_salt('bf', 10));
  ELSIF TG_OP = 'UPDATE' AND (NEW.senha IS NULL OR NEW.senha = '') THEN
    NEW.senha := OLD.senha;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rm_equipe_hash_senha ON public.equipe_usuarios;
CREATE TRIGGER trg_rm_equipe_hash_senha BEFORE INSERT OR UPDATE ON public.equipe_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.rm_equipe_hash_senha();
-- Converte as senhas atuais (em texto puro) para hash
UPDATE public.equipe_usuarios SET senha = senha WHERE senha IS NOT NULL AND senha <> '' AND senha !~ '^\$2[abxy]\$';

-- Conferência de senha pelo servidor do RM Controle (nunca exposta ao navegador)
CREATE OR REPLACE FUNCTION public.rm_verificar_senha_equipe(p_email TEXT, p_senha TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.equipe_usuarios
     WHERE lower(trim(email)) = lower(trim(p_email))
       AND coalesce(ativo, true)
       AND senha ~ '^\$2[abxy]\$'
       AND senha = extensions.crypt(p_senha, senha)
  )
$$;

-- Ninguém além do próprio administrador altera papel, e-mail ou status (bloqueia autopromoção)
CREATE OR REPLACE FUNCTION public.rm_equipe_protege_papel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.rm_eh_admin() THEN
    IF NEW.papel IS DISTINCT FROM OLD.papel
       OR NEW.ativo IS DISTINCT FROM OLD.ativo
       OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email) THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar papel, e-mail ou status de membros' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rm_equipe_protege_papel ON public.equipe_usuarios;
CREATE TRIGGER trg_rm_equipe_protege_papel BEFORE UPDATE ON public.equipe_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.rm_equipe_protege_papel();

-- 4.4 Segredos globais (ex.: senha padrão de contingência), cifrados
CREATE TABLE IF NOT EXISTS public.rm_segredos (
  chave TEXT PRIMARY KEY,
  valor BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.rm_gravar_segredo(p_chave TEXT, p_valor TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.rm_segredos (chave, valor, updated_at) VALUES (p_chave, public.rm_cifrar(p_valor), now())
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()
$$;
CREATE OR REPLACE FUNCTION public.rm_ler_segredo(p_chave TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.rm_decifrar(valor) FROM public.rm_segredos WHERE chave = p_chave $$;

-- ==============================================================================
-- 5. LIMITE DE TENTATIVAS PERSISTENTE (vale entre todas as instâncias do servidor)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.rm_rate_limits (
  chave TEXT PRIMARY KEY,
  contador INT NOT NULL,
  janela_inicio TIMESTAMPTZ NOT NULL
);
CREATE OR REPLACE FUNCTION public.rm_consumir_limite(p_chave TEXT, p_max INT, p_janela_segundos INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_contador INT;
BEGIN
  INSERT INTO public.rm_rate_limits AS r (chave, contador, janela_inicio)
  VALUES (p_chave, 1, now())
  ON CONFLICT (chave) DO UPDATE SET
    contador = CASE WHEN r.janela_inicio < now() - make_interval(secs => p_janela_segundos) THEN 1 ELSE r.contador + 1 END,
    janela_inicio = CASE WHEN r.janela_inicio < now() - make_interval(secs => p_janela_segundos) THEN now() ELSE r.janela_inicio END
  RETURNING contador INTO v_contador;
  IF random() < 0.01 THEN
    DELETE FROM public.rm_rate_limits WHERE janela_inicio < now() - interval '1 day';
  END IF;
  RETURN v_contador <= p_max;
END $$;

-- Funções internas: só o servidor (service_role) pode executar
REVOKE EXECUTE ON FUNCTION public.rm_cifrar(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rm_decifrar(BYTEA) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rm_verificar_senha_equipe(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rm_gravar_segredo(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rm_ler_segredo(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rm_consumir_limite(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_verificar_senha_equipe(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rm_gravar_segredo(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rm_ler_segredo(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rm_consumir_limite(TEXT, INT, INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rm_credenciais_empresas(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rm_credenciais_empresas(UUID) TO authenticated, service_role;

-- ==============================================================================
-- 6. RLS (Row Level Security) EM TODAS AS TABELAS
--    equipe   = qualquer membro ativo     | operacao = administrador ou suporte
--    admin    = só administrador          | sem política = só o servidor (service_role)
-- ==============================================================================
CREATE OR REPLACE FUNCTION pg_temp.rm_politicas(t TEXT, sel TEXT, ins TEXT, upd TEXT, del TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p RECORD;
BEGIN
  IF to_regclass('public.' || t) IS NULL THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
  END LOOP;
  IF sel IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_select ON public.%I FOR SELECT TO authenticated USING (%s)', t, sel); END IF;
  IF ins IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t, ins); END IF;
  IF upd IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t, upd, upd); END IF;
  IF del IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_delete ON public.%I FOR DELETE TO authenticated USING (%s)', t, del); END IF;
END $$;

--                        tabela                         SELECT                     INSERT                     UPDATE                     DELETE
SELECT pg_temp.rm_politicas('empresas',                    'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('empresa_canais',              'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas('empresa_observacoes',         'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas('empresa_checklist',           'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas('empresa_colaboradores',       'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas('empresa_credenciais',         'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas('empresa_servidor',            'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('canais_catalogo',             'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('checklist_catalogo',          'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('servidor_checklist_template', 'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('suporte_motivos',             'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('suporte_chamados',            'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('feedbacks',                   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas('solucoes_suporte',            'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_admin() OR lower(autor_email) = public.rm_email_atual()');
SELECT pg_temp.rm_politicas('agenda_eventos',              'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_admin() OR lower(criado_por) = public.rm_email_atual() OR lower(responsavel_email) = public.rm_email_atual()');
SELECT pg_temp.rm_politicas('sistema_config',              'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
-- Auditoria é imutável: membros registram, só administradores leem, ninguém altera nem apaga
SELECT pg_temp.rm_politicas('auditoria_logs',              'public.rm_eh_admin()',    'public.rm_eh_equipe()',   NULL,                      NULL);
-- Equipe: todos veem os colegas (sem a senha); cada um atualiza o próprio registro; o resto é do admin
SELECT pg_temp.rm_politicas('equipe_usuarios',             'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin() OR lower(trim(email)) = public.rm_email_atual()', 'public.rm_eh_admin()');
-- Tabelas internas: só o servidor acessa
SELECT pg_temp.rm_politicas('rm_segredos',                 NULL, NULL, NULL, NULL);
SELECT pg_temp.rm_politicas('rm_rate_limits',              NULL, NULL, NULL, NULL);
SELECT pg_temp.rm_politicas('rm_admins_proprietarios',     NULL, NULL, NULL, NULL);
SELECT pg_temp.rm_politicas('empresa_anexos',              'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');

-- Permissões das tabelas novas (a RLS acima decide QUAIS linhas cada papel acessa)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.empresa_servidor, public.empresa_colaboradores, public.solucoes_suporte,
  public.agenda_eventos, public.suporte_motivos, public.servidor_checklist_template, public.sistema_config
TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
-- Tabelas internas: nem usuários logados têm acesso direto
REVOKE ALL ON public.rm_segredos, public.rm_rate_limits, public.rm_admins_proprietarios FROM authenticated;

-- Visitantes não autenticados (anon) não acessam nenhuma tabela
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- Colunas sensíveis invisíveis para o navegador, mesmo para quem pode ver a linha
DO $$
DECLARE v_cols TEXT;
BEGIN
  REVOKE SELECT ON public.equipe_usuarios FROM authenticated;
  SELECT string_agg(quote_ident(column_name), ', ') INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'equipe_usuarios' AND column_name <> 'senha';
  EXECUTE format('GRANT SELECT (%s) ON public.equipe_usuarios TO authenticated', v_cols);

  REVOKE SELECT ON public.empresa_credenciais FROM authenticated;
  SELECT string_agg(quote_ident(column_name), ', ') INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'empresa_credenciais'
     AND column_name NOT IN ('senha', 'senha_suporte', 'senha_cifrada');
  EXECUTE format('GRANT SELECT (%s) ON public.empresa_credenciais TO authenticated', v_cols);
END $$;

-- ==============================================================================
-- 7. DADOS INICIAIS E TEMPO REAL
-- ==============================================================================
INSERT INTO public.suporte_motivos (nome) VALUES
  ('Redefinição de Senha / Acesso'),
  ('Desconexão / Queda de Instância'),
  ('Bloqueio ou Limite na API Meta'),
  ('Servidor VPS Indisponível / Reinício'),
  ('Configuração de Novo Atendente / Fila'),
  ('Dúvida Operacional / Treinamento')
ON CONFLICT (nome) DO NOTHING;

-- URLs dos servidores (ajuste se forem outras; um valor já salvo é mantido)
INSERT INTO public.sistema_config (chave, valor) VALUES (
  'servidores_urls',
  '{"servidor_1_nome":"Servidor 1","servidor_1_url":"https://app1.rmcontrole.com.br","servidor_2_nome":"Servidor 2","servidor_2_url":"https://app2.rmcontrole.com.br"}'::jsonb
) ON CONFLICT (chave) DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['suporte_chamados', 'feedbacks', 'empresa_servidor', 'agenda_eventos', 'sistema_config'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- CONFERÊNCIA (opcional) — rode depois para confirmar
-- ==============================================================================
-- Nenhuma senha de equipe em texto puro (deve retornar 0):
--   SELECT count(*) FROM public.equipe_usuarios WHERE senha !~ '^\$2[abxy]\$' AND coalesce(senha,'') <> '';
-- Nenhuma senha de empresa em texto puro (deve retornar 0):
--   SELECT count(*) FROM public.empresa_credenciais WHERE coalesce(senha,'') <> '' OR coalesce(senha_suporte,'') <> '';
-- Tabelas sem RLS (deve retornar vazio):
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
