-- ==============================================================================
-- RM CONTROLE — MULTIEMPRESA
--   Plataforma (você) → Revendas → Empresas assinantes → Clientes de cada assinante
--
-- Rode UMA vez no SQL Editor do Supabase, depois das migrações anteriores.
-- Pode ser rodado de novo sem duplicar nada. Nenhum dado é apagado:
-- tudo o que existe hoje passa a pertencer à primeira assinante, "RM Chat".
--
-- Depois desta migração NÃO rode de novo migration_supabase_completa.sql
-- (ela recriaria as regras de acesso sem a separação por empresa; o arquivo agora se recusa a rodar).
--
-- Segurança:
--   * Cada linha de cada tabela tem a empresa dona (organizacao_id).
--   * O PRÓPRIO BANCO (RLS) só deixa cada pessoa ver e alterar linhas da sua empresa,
--     mesmo que alguém tente consultar direto pelo console do navegador.
--   * Registros "filhos" herdam a empresa do registro pai (não dá para pendurar um
--     contato numa empresa de outro cliente).
--   * Limites do plano são conferidos pelo banco no momento do cadastro.
--   * Empresa suspensa perde o acesso imediatamente.
-- ==============================================================================
BEGIN;

-- ==============================================================================
-- 1. ORGANIZAÇÕES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organizacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
  tipo TEXT NOT NULL CHECK (tipo IN ('plataforma', 'revenda', 'assinante')),
  pai_id UUID REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'suspensa', 'cancelada')),
  motivo_status TEXT,
  -- Limites efetivos do plano: { "usuarios": 5, "empresas": 200, "numeros_whatsapp": 2, "assinantes": 20 } (ausente = sem limite)
  limites JSONB NOT NULL DEFAULT '{}'::jsonb,
  documento TEXT,
  contato_nome TEXT,
  contato_email TEXT,
  contato_telefone TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por TEXT,
  atualizado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS organizacoes_pai_idx ON public.organizacoes (pai_id);

-- Plataforma (você) e a primeira assinante (os dados de hoje). Ids fixos para o código reconhecer.
INSERT INTO public.organizacoes (id, nome, tipo, pai_id) VALUES
  ('00000000-0000-4000-8000-000000000001', 'RM Controle', 'plataforma', NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizacoes (id, nome, tipo, pai_id) VALUES
  ('00000000-0000-4000-8000-000000000002', 'RM Chat', 'assinante', '00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Hierarquia válida: plataforma no topo; revenda abaixo da plataforma; assinante abaixo de plataforma ou revenda
CREATE OR REPLACE FUNCTION public.rm_validar_organizacao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_tipo_pai TEXT;
BEGIN
  IF NEW.tipo = 'plataforma' THEN
    IF NEW.pai_id IS NOT NULL THEN RAISE EXCEPTION 'A plataforma não tem organização acima dela.'; END IF;
    IF EXISTS (SELECT 1 FROM public.organizacoes WHERE tipo = 'plataforma' AND id <> NEW.id) THEN
      RAISE EXCEPTION 'Só existe uma plataforma.';
    END IF;
    RETURN NEW;
  END IF;
  SELECT tipo INTO v_tipo_pai FROM public.organizacoes WHERE id = NEW.pai_id;
  IF v_tipo_pai IS NULL THEN RAISE EXCEPTION 'Organização acima não encontrada.'; END IF;
  IF NEW.tipo = 'revenda' AND v_tipo_pai <> 'plataforma' THEN
    RAISE EXCEPTION 'Revendas ficam diretamente abaixo da plataforma.';
  END IF;
  IF NEW.tipo = 'assinante' AND v_tipo_pai NOT IN ('plataforma', 'revenda') THEN
    RAISE EXCEPTION 'Assinantes ficam abaixo da plataforma ou de uma revenda.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tipo <> OLD.tipo THEN
    RAISE EXCEPTION 'O tipo da organização não muda depois de criada.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rm_validar_organizacao ON public.organizacoes;
CREATE TRIGGER rm_validar_organizacao BEFORE INSERT OR UPDATE ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.rm_validar_organizacao();

-- Proprietários da plataforma: qual empresa abre quando entram (hoje, a RM Chat)
ALTER TABLE public.rm_admins_proprietarios
  ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES public.organizacoes(id) DEFAULT '00000000-0000-4000-8000-000000000002';
UPDATE public.rm_admins_proprietarios SET organizacao_id = '00000000-0000-4000-8000-000000000002' WHERE organizacao_id IS NULL;

-- Suporte: o dono da plataforma (ou a revenda) entra numa assinante por tempo limitado, com registro
CREATE TABLE IF NOT EXISTS public.sessoes_suporte (
  email TEXT PRIMARY KEY,
  organizacao_id UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  motivo TEXT,
  inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL
);

-- ==============================================================================
-- 2. CONTRATOS
--   contratos_organizacao: você ↔ revenda e você/revenda ↔ assinante (plano, valor, limites)
--   empresa_contratos:     assinante ↔ cliente dela (informação de negócio)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.contratos_organizacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  plano TEXT NOT NULL,
  valor_mensal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_mensal >= 0),
  dia_vencimento SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 28),
  inicio DATE NOT NULL DEFAULT current_date,
  fim DATE,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'em_atraso', 'suspenso', 'encerrado')),
  limites JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por TEXT,
  atualizado_em TIMESTAMPTZ,
  CHECK (fornecedor_id <> cliente_id)
);
CREATE INDEX IF NOT EXISTS contratos_organizacao_cliente_idx ON public.contratos_organizacao (cliente_id, status);

CREATE TABLE IF NOT EXISTS public.empresa_contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  plano TEXT NOT NULL,
  valor_mensal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_mensal >= 0),
  dia_vencimento SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 28),
  inicio DATE NOT NULL DEFAULT current_date,
  renovacao DATE,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'em_negociacao', 'em_atraso', 'encerrado')),
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por TEXT,
  atualizado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS empresa_contratos_empresa_idx ON public.empresa_contratos (empresa_id);

-- ==============================================================================
-- 3. QUEM É QUEM (funções usadas pelas regras de acesso)
-- ==============================================================================
-- A coluna da equipe vem antes das funções que a leem (as demais tabelas, na seção 4)
ALTER TABLE public.equipe_usuarios ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE RESTRICT;
UPDATE public.equipe_usuarios SET organizacao_id = '00000000-0000-4000-8000-000000000002' WHERE organizacao_id IS NULL;

CREATE OR REPLACE FUNCTION public.rm_eh_dono_plataforma()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.rm_email_atual() <> '' AND EXISTS (SELECT 1 FROM public.rm_admins_proprietarios a WHERE a.email = public.rm_email_atual())
$$;

-- Organização de origem da pessoa (sem considerar suporte)
CREATE OR REPLACE FUNCTION public.rm_org_de_origem(p_email TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    (SELECT e.organizacao_id FROM public.equipe_usuarios e WHERE lower(trim(e.email)) = lower(trim(p_email)) AND coalesce(e.ativo, true) LIMIT 1),
    (SELECT a.organizacao_id FROM public.rm_admins_proprietarios a WHERE a.email = lower(trim(p_email)))
  )
$$;

-- p_ancestral está acima de p_alvo na hierarquia (ou é a própria)?
CREATE OR REPLACE FUNCTION public.rm_org_abaixo_de(p_alvo UUID, p_ancestral UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH RECURSIVE cadeia AS (
    SELECT id, pai_id, 0 AS nivel FROM public.organizacoes WHERE id = p_alvo
    UNION ALL
    SELECT o.id, o.pai_id, c.nivel + 1 FROM public.organizacoes o JOIN cadeia c ON o.id = c.pai_id WHERE c.nivel < 6
  )
  SELECT EXISTS (SELECT 1 FROM cadeia WHERE id = p_ancestral)
$$;

-- A pessoa pode administrar (e entrar para suporte em) esta organização?
--   Donos da plataforma: todas. Administradores da plataforma: todas. Administradores de revenda: as assinantes dela.
CREATE OR REPLACE FUNCTION public.rm_pode_gerir_org(p_email TEXT, p_alvo UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_origem UUID; v_tipo TEXT; v_papel TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.rm_admins_proprietarios WHERE email = lower(trim(p_email))) THEN RETURN TRUE; END IF;
  SELECT e.organizacao_id, e.papel INTO v_origem, v_papel FROM public.equipe_usuarios e
   WHERE lower(trim(e.email)) = lower(trim(p_email)) AND coalesce(e.ativo, true) LIMIT 1;
  IF v_origem IS NULL OR v_papel <> 'administrador' THEN RETURN FALSE; END IF;
  SELECT tipo INTO v_tipo FROM public.organizacoes WHERE id = v_origem AND status = 'ativa';
  IF v_tipo = 'plataforma' THEN RETURN TRUE; END IF;
  RETURN v_tipo = 'revenda' AND p_alvo <> v_origem AND public.rm_org_abaixo_de(p_alvo, v_origem);
END $$;

-- Organização em que a pessoa está trabalhando AGORA (base de todas as regras de acesso).
-- Sessão de suporte válida > organização de origem. Organização suspensa = sem acesso.
CREATE OR REPLACE FUNCTION public.rm_org_atual()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_email TEXT := public.rm_email_atual(); v_org UUID; v_status TEXT;
BEGIN
  IF v_email = '' THEN RETURN NULL; END IF;
  SELECT s.organizacao_id INTO v_org FROM public.sessoes_suporte s WHERE s.email = v_email AND s.expira_em > now();
  IF v_org IS NOT NULL AND public.rm_pode_gerir_org(v_email, v_org) THEN RETURN v_org; END IF;
  v_org := public.rm_org_de_origem(v_email);
  IF v_org IS NULL THEN RETURN NULL; END IF;
  SELECT status INTO v_status FROM public.organizacoes WHERE id = v_org;
  IF v_status = 'ativa' OR public.rm_eh_dono_plataforma() THEN RETURN v_org; END IF;
  RETURN NULL;
END $$;

-- ==============================================================================
-- 4. EMPRESA DONA EM CADA TABELA
-- ==============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas', 'empresa_canais', 'empresa_observacoes', 'empresa_checklist', 'empresa_colaboradores',
    'empresa_credenciais', 'empresa_servidor', 'empresa_anexos', 'empresa_contratos',
    'equipe_usuarios', 'perfis_acesso', 'sistema_config', 'auditoria_logs',
    'suporte_chamados', 'suporte_motivos', 'solucoes_suporte', 'feedbacks',
    'agenda_eventos', 'agenda_confirmacoes', 'whatsapp_envios',
    'canais_catalogo', 'checklist_catalogo', 'servidor_checklist_template',
    'comercial_integracoes', 'comercial_leads', 'comercial_webhook_eventos'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organizacao_id UUID REFERENCES public.organizacoes(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I SET organizacao_id = %L WHERE organizacao_id IS NULL', t, '00000000-0000-4000-8000-000000000002');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organizacao_id SET NOT NULL', t);
    -- Quem está logado grava na própria empresa sem precisar informar; o servidor sempre informa
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organizacao_id SET DEFAULT public.rm_org_atual()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organizacao_id)', t || '_org_idx', t);
  END LOOP;
END $$;

-- Registros filhos herdam a empresa do pai (e não podem apontar para um pai de outra empresa)
CREATE OR REPLACE FUNCTION public.rm_org_do_pai()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pai_id TEXT := to_jsonb(NEW) ->> TG_ARGV[1]; v_org UUID;
BEGIN
  IF v_pai_id IS NULL THEN
    IF NEW.organizacao_id IS NULL THEN RAISE EXCEPTION 'Registro sem empresa dona (%).', TG_TABLE_NAME; END IF;
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT organizacao_id FROM public.%I WHERE id = $1::uuid', TG_ARGV[0]) INTO v_org USING v_pai_id;
  IF v_org IS NULL THEN RETURN NEW; END IF; -- a chave estrangeira acusa o pai inexistente
  IF NEW.organizacao_id IS NULL THEN
    NEW.organizacao_id := v_org;
  ELSIF NEW.organizacao_id <> v_org THEN
    RAISE EXCEPTION 'Registro não pertence à mesma empresa do registro principal.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('empresa_canais', 'empresas', 'empresa_id'),
    ('empresa_observacoes', 'empresas', 'empresa_id'),
    ('empresa_checklist', 'empresas', 'empresa_id'),
    ('empresa_colaboradores', 'empresas', 'empresa_id'),
    ('empresa_credenciais', 'empresas', 'empresa_id'),
    ('empresa_servidor', 'empresas', 'empresa_id'),
    ('empresa_anexos', 'empresas', 'empresa_id'),
    ('empresa_contratos', 'empresas', 'empresa_id'),
    ('agenda_confirmacoes', 'agenda_eventos', 'evento_id'),
    ('whatsapp_envios', 'agenda_eventos', 'evento_id'),
    ('comercial_leads', 'comercial_integracoes', 'integracao_id'),
    ('comercial_webhook_eventos', 'comercial_integracoes', 'integracao_id'),
    -- Demanda e reunião ligadas a uma empresa cliente: precisa ser da mesma assinante
    ('suporte_chamados', 'empresas', 'empresa_id'),
    ('agenda_eventos', 'empresas', 'empresa_id')
  ) AS x(tabela, pai, coluna) LOOP
    IF to_regclass('public.' || r.tabela) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS rm_org_do_pai ON public.%I', r.tabela);
    EXECUTE format('CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai(%L, %L)', r.tabela, r.pai, r.coluna);
  END LOOP;
END $$;

-- A empresa dona de uma linha nunca muda
CREATE OR REPLACE FUNCTION public.rm_org_imutavel()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id THEN
    RAISE EXCEPTION 'A empresa dona de um registro não pode ser trocada.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.column_name = 'organizacao_id' AND c.table_name NOT IN ('rm_admins_proprietarios', 'sessoes_suporte')
              AND c.table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS rm_org_imutavel ON public.%I', t);
    EXECUTE format('CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel()', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS rm_org_imutavel ON public.sessoes_suporte;

-- ==============================================================================
-- 5. NOMES ÚNICOS POR EMPRESA (duas assinantes podem ter um motivo "Suporte" cada uma)
-- ==============================================================================
-- Configurações: a chave passa a ser (empresa, chave)
DO $$
DECLARE v_pk TEXT;
BEGIN
  SELECT conname INTO v_pk FROM pg_constraint WHERE conrelid = 'public.sistema_config'::regclass AND contype = 'p';
  IF v_pk IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conname = v_pk AND c.conrelid = 'public.sistema_config'::regclass AND a.attname = 'organizacao_id'
  ) THEN
    EXECUTE format('ALTER TABLE public.sistema_config DROP CONSTRAINT %I', v_pk);
    ALTER TABLE public.sistema_config ADD PRIMARY KEY (organizacao_id, chave);
  END IF;
END $$;

-- Catálogos: restrições UNIQUE de nome viram (empresa, nome)
DO $$
DECLARE r RECORD; v_cols TEXT;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tabela, c.conkey, c.conrelid
      FROM pg_constraint c
     WHERE c.contype = 'u'
       AND c.conrelid IN (SELECT to_regclass('public.' || x) FROM unnest(ARRAY['suporte_motivos', 'canais_catalogo', 'checklist_catalogo', 'servidor_checklist_template', 'solucoes_suporte', 'empresas']) x WHERE to_regclass('public.' || x) IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) AND a.attname = 'organizacao_id')
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ') INTO v_cols FROM pg_attribute a WHERE a.attrelid = r.conrelid AND a.attnum = ANY (r.conkey);
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I UNIQUE (organizacao_id, %s)', r.tabela, r.conname || '_org', v_cols);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.perfis_acesso_nome_uk;
DO $$ BEGIN
  IF to_regclass('public.perfis_acesso') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS perfis_acesso_org_nome_uk ON public.perfis_acesso (organizacao_id, lower(nome));
  END IF;
END $$;

-- Segredos (senha padrão, webhook do WhatsApp...): chave prefixada pela empresa
UPDATE public.rm_segredos SET chave = '00000000-0000-4000-8000-000000000002:' || chave WHERE position(':' IN chave) = 0;

-- ==============================================================================
-- 6. LIMITES DO PLANO (o banco confere no cadastro)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rm_conferir_limite()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_recurso TEXT := TG_ARGV[0]; v_org UUID; v_limite INT; v_uso INT;
BEGIN
  IF TG_TABLE_NAME = 'organizacoes' THEN
    IF NEW.tipo <> 'assinante' OR NEW.pai_id IS NULL THEN RETURN NEW; END IF;
    v_org := NEW.pai_id;
  ELSE
    v_org := NEW.organizacao_id;
  END IF;
  -- Em alteração, só conta reativar um usuário (ele volta a ocupar uma vaga)
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME <> 'equipe_usuarios' THEN RETURN NEW; END IF;
    IF NOT (coalesce(OLD.ativo, true) = false AND coalesce(NEW.ativo, true) = true) THEN RETURN NEW; END IF;
  END IF;
  SELECT (limites ->> v_recurso)::INT INTO v_limite FROM public.organizacoes WHERE id = v_org;
  IF v_limite IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'organizacoes' THEN
    SELECT count(*) INTO v_uso FROM public.organizacoes WHERE pai_id = v_org AND tipo = 'assinante' AND status <> 'cancelada';
  ELSIF TG_TABLE_NAME = 'equipe_usuarios' THEN
    SELECT count(*) INTO v_uso FROM public.equipe_usuarios WHERE organizacao_id = v_org AND coalesce(ativo, true);
  ELSE
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organizacao_id = $1', TG_TABLE_NAME) INTO v_uso USING v_org;
  END IF;
  IF v_uso >= v_limite THEN
    RAISE EXCEPTION 'Limite do plano atingido: % de % (%).', v_uso, v_limite, v_recurso
      USING ERRCODE = 'P0001', HINT = 'LIMITE_PLANO:' || v_recurso;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rm_limite_usuarios ON public.equipe_usuarios;
CREATE TRIGGER rm_limite_usuarios BEFORE INSERT OR UPDATE OF ativo ON public.equipe_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.rm_conferir_limite('usuarios');
DROP TRIGGER IF EXISTS rm_limite_empresas ON public.empresas;
CREATE TRIGGER rm_limite_empresas BEFORE INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.rm_conferir_limite('empresas');
DROP TRIGGER IF EXISTS rm_limite_assinantes ON public.organizacoes;
CREATE TRIGGER rm_limite_assinantes BEFORE INSERT ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.rm_conferir_limite('assinantes');

-- ==============================================================================
-- 7. REGRAS DE ACESSO (RLS) COM A EMPRESA
--    Mesmas regras de papel de antes, sempre presas à empresa em que a pessoa está.
-- ==============================================================================
CREATE OR REPLACE FUNCTION pg_temp.rm_politicas_org(t TEXT, sel TEXT, ins TEXT, upd TEXT, del TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p RECORD; org TEXT := 'organizacao_id = public.rm_org_atual()';
BEGIN
  IF to_regclass('public.' || t) IS NULL THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
  END LOOP;
  IF sel IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_select ON public.%I FOR SELECT TO authenticated USING (%s AND (%s))', t, org, sel); END IF;
  IF ins IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s AND (%s))', t, org, ins); END IF;
  IF upd IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_update ON public.%I FOR UPDATE TO authenticated USING (%s AND (%s)) WITH CHECK (%s AND (%s))', t, org, upd, org, upd); END IF;
  IF del IS NOT NULL THEN EXECUTE format('CREATE POLICY rm_delete ON public.%I FOR DELETE TO authenticated USING (%s AND (%s))', t, org, del); END IF;
END $$;

--                            tabela                         SELECT                     INSERT                     UPDATE                     DELETE
SELECT pg_temp.rm_politicas_org('empresas',                    'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('empresa_canais',              'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas_org('empresa_observacoes',         'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas_org('empresa_checklist',           'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas_org('empresa_colaboradores',       'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas_org('empresa_credenciais',         'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas_org('empresa_servidor',            'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('empresa_anexos',              'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()');
SELECT pg_temp.rm_politicas_org('empresa_contratos',           'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('canais_catalogo',             'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('checklist_catalogo',          'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('servidor_checklist_template', 'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('suporte_motivos',             'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('suporte_chamados',            'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('feedbacks',                   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('solucoes_suporte',            'public.rm_eh_equipe()',   'public.rm_eh_operacao()', 'public.rm_eh_operacao()', 'public.rm_eh_admin() OR lower(autor_email) = public.rm_email_atual()');
SELECT pg_temp.rm_politicas_org('agenda_eventos',              'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_equipe()',   'public.rm_eh_admin() OR lower(criado_por) = public.rm_email_atual() OR lower(responsavel_email) = public.rm_email_atual()');
SELECT pg_temp.rm_politicas_org('sistema_config',              'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin()',    'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('auditoria_logs',              'public.rm_eh_admin()',    'public.rm_eh_equipe()',   NULL,                      NULL);
SELECT pg_temp.rm_politicas_org('equipe_usuarios',             'public.rm_eh_equipe()',   'public.rm_eh_admin()',    'public.rm_eh_admin() OR lower(trim(email)) = public.rm_email_atual()', 'public.rm_eh_admin()');
SELECT pg_temp.rm_politicas_org('perfis_acesso',               'public.rm_eh_equipe()',   NULL,                      NULL,                      NULL);

-- Só o servidor acessa (nenhuma política = nenhum acesso pelo navegador)
DO $$
DECLARE t TEXT; p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizacoes', 'contratos_organizacao', 'sessoes_suporte', 'agenda_confirmacoes', 'whatsapp_envios',
                           'comercial_integracoes', 'comercial_leads', 'comercial_webhook_eventos'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_contratos TO authenticated;
GRANT ALL ON public.empresa_contratos TO service_role;
REVOKE ALL ON public.empresa_contratos FROM anon;

-- A senha (hash) da equipe continua invisível para o navegador; a nova coluna é liberada
GRANT SELECT (organizacao_id) ON public.equipe_usuarios TO authenticated;
DO $$ BEGIN
  IF to_regclass('public.empresa_credenciais') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT (organizacao_id) ON public.empresa_credenciais TO authenticated';
  END IF;
END $$;

-- Funções internas: o navegador não chama
REVOKE EXECUTE ON FUNCTION public.rm_pode_gerir_org(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rm_org_de_origem(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rm_org_abaixo_de(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_pode_gerir_org(TEXT, UUID), public.rm_org_de_origem(TEXT), public.rm_org_abaixo_de(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rm_org_atual(), public.rm_eh_dono_plataforma() TO authenticated, service_role;

-- Vincular demanda à empresa cliente pelo nome: só entre as empresas da mesma assinante
-- (antes procurava em todas; com várias assinantes, ligaria a demanda à empresa de outro cliente)
CREATE OR REPLACE FUNCTION public.rm_chamado_vincular_empresa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.empresa_id IS NULL AND coalesce(NEW.empresa_nome, '') <> '' AND NEW.organizacao_id IS NOT NULL THEN
    SELECT e.id INTO NEW.empresa_id
      FROM public.empresas e
     WHERE e.organizacao_id = NEW.organizacao_id
       AND lower(trim(e.nome)) = lower(trim(NEW.empresa_nome))
     ORDER BY e.created_at
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

-- Webhook do Comercial: a configuração lida é a da assinante dona da integração
-- (antes lia a chave "comercial" sem dizer de qual empresa)
DO $do$ BEGIN
  IF to_regclass('public.comercial_integracoes') IS NOT NULL THEN
    EXECUTE $f$
CREATE OR REPLACE FUNCTION public.rm_receber_lead_comercial(p_integracao uuid, p_token_hash text, p_evento_id text, p_hash text, p_dados jsonb, p_etapa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.comercial_integracoes; l public.comercial_leads; recibo public.comercial_webhook_eventos;
 c jsonb; pipeline jsonb; destino_pipeline text; destino text; resposta jsonb; nova boolean; ocorrido timestamptz;
BEGIN
 SELECT * INTO i FROM public.comercial_integracoes WHERE id = p_integracao AND token_hash = p_token_hash AND ativo FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'codigo','token_invalido'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_integracao::text || ':' || (p_dados->>'externo_id'), 0));
 INSERT INTO public.comercial_webhook_eventos(integracao_id,evento_id,payload_hash,externo_id,evento)
 VALUES(i.id,p_evento_id,p_hash,p_dados->>'externo_id',p_dados->>'evento') ON CONFLICT DO NOTHING RETURNING * INTO recibo;
 IF NOT FOUND THEN
   SELECT * INTO recibo FROM public.comercial_webhook_eventos WHERE integracao_id=i.id AND evento_id=p_evento_id;
   IF recibo.payload_hash <> p_hash THEN RETURN jsonb_build_object('ok',false,'codigo','evento_conflitante'); END IF;
   RETURN recibo.resultado || jsonb_build_object('repetido',true);
 END IF;
 SELECT valor INTO c FROM public.sistema_config WHERE chave='comercial' AND organizacao_id = i.organizacao_id FOR SHARE;
 SELECT * INTO l FROM public.comercial_leads WHERE integracao_id=i.id AND externo_id=p_dados->>'externo_id' FOR UPDATE;
 nova := NOT FOUND; ocorrido := (p_dados->>'ocorrido_em')::timestamptz;
 destino_pipeline := CASE WHEN NOT nova AND p_etapa IS NULL THEN l.comercial_pipeline_id ELSE i.pipeline_id END;
 SELECT value INTO pipeline FROM jsonb_array_elements(c->'pipelines') WHERE value->>'id'=destino_pipeline;
 IF pipeline IS NULL OR NOT (c->'departamentos' ? i.departamento) THEN RAISE EXCEPTION 'Configuração comercial indisponível'; END IF;
 destino := COALESCE(p_etapa, CASE WHEN nova THEN i.etapa_inicial_id ELSE l.comercial_etapa_id END);
 IF destino NOT IN ('ganho','perda') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pipeline->'etapas') WHERE value->>'id'=destino) THEN RAISE EXCEPTION 'Etapa indisponível'; END IF;
 IF NOT nova AND ocorrido <= l.ultima_ocorrencia_em THEN
   resposta := jsonb_build_object('ok',true,'ignorado',true,'motivo','evento_antigo','lead_id',l.id);
 ELSE
   IF nova THEN
     INSERT INTO public.comercial_leads(integracao_id,externo_id,nome,email,telefone,departamento,comercial_pipeline_id,comercial_etapa_id,ultima_ocorrencia_em)
     VALUES(i.id,p_dados->>'externo_id',p_dados->>'nome',p_dados->>'email',p_dados->>'telefone',i.departamento,destino_pipeline,destino,ocorrido) RETURNING * INTO l;
   ELSE
     UPDATE public.comercial_leads SET nome=p_dados->>'nome',email=p_dados->>'email',telefone=p_dados->>'telefone',
       departamento=i.departamento,comercial_pipeline_id=destino_pipeline,comercial_etapa_id=destino,ultima_ocorrencia_em=ocorrido,updated_at=now()
       WHERE id=l.id;
   END IF;
   resposta := jsonb_build_object('ok',true,'criado',nova,'lead_id',l.id,'etapa_id',destino);
 END IF;
 UPDATE public.comercial_webhook_eventos SET resultado=resposta,etapa_anterior=CASE WHEN nova THEN NULL ELSE l.comercial_etapa_id END,etapa_destino=destino WHERE id=recibo.id;
 RETURN resposta;
END $$;
    $f$;
    REVOKE ALL ON FUNCTION public.rm_receber_lead_comercial(uuid,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rm_receber_lead_comercial(uuid,text,text,text,jsonb,text) TO service_role;
  END IF;
END $do$;

-- Senhas das empresas clientes: só da própria empresa
CREATE OR REPLACE FUNCTION public.rm_credenciais_empresas(p_empresa_id UUID DEFAULT NULL)
RETURNS SETOF JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.rm_eh_equipe() OR public.rm_org_atual() IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para ver credenciais' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT (to_jsonb(c) - 'senha_cifrada' - 'senha' - 'senha_suporte')
           || jsonb_build_object('senha_suporte',
                CASE WHEN public.rm_eh_operacao() THEN public.rm_decifrar(c.senha_cifrada) ELSE NULL END)
      FROM public.empresa_credenciais c
     WHERE c.organizacao_id = public.rm_org_atual()
       AND (p_empresa_id IS NULL OR c.empresa_id = p_empresa_id)
     ORDER BY c.created_at;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- CONFERÊNCIA (opcional)
-- ==============================================================================
-- Toda linha tem empresa dona (deve voltar vazio):
--   SELECT table_name FROM information_schema.columns WHERE column_name = 'organizacao_id' AND is_nullable = 'YES' AND table_schema = 'public';
-- Organizações:
--   SELECT id, nome, tipo, status FROM public.organizacoes ORDER BY criado_em;
