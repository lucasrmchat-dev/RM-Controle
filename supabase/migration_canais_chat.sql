-- ==============================================================================
-- RM CONTROLE — CANAIS E CHAT (WhatsApp por QR Code e pela API oficial da Meta)
-- Rode depois de migration_multiempresa.sql. Pode ser executado de novo sem perder dados.
--
-- Segurança:
--   * Tudo preso à empresa dona (organizacao_id + RLS), como o resto do sistema.
--   * Credenciais dos canais ficam cifradas e INVISÍVEIS para o navegador (nem a coluna é liberada).
--   * Conversas: cada pessoa vê as dos departamentos dela e as que estão com ela; administradores, todas.
--     A regra é conferida pelo banco, não só pela tela.
--   * O navegador só LÊ conversas e mensagens; enviar, assumir e transferir passam pelo servidor.
-- ==============================================================================
BEGIN;

-- 1. CANAIS -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.canais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 80),
  tipo TEXT NOT NULL CHECK (tipo IN ('whatsapp_qr', 'whatsapp_oficial')),
  provedor TEXT NOT NULL CHECK (provedor IN ('evolution', 'meta')),
  status TEXT NOT NULL DEFAULT 'desconectado' CHECK (status IN ('desconectado', 'aguardando_qr', 'conectando', 'conectado', 'erro')),
  status_detalhe TEXT,
  numero TEXT,
  departamento_padrao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  -- Dados não secretos do provedor (ids da Meta, nome da instância, qualidade do número...)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Segredos (token da Meta, chave da Evolution...): cifrados pelo servidor, nunca lidos pelo navegador
  credenciais_cifradas TEXT,
  webhook_token_hash TEXT UNIQUE,
  qr_codigo TEXT,
  qr_atualizado_em TIMESTAMPTZ,
  criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS canais_org_idx ON public.canais (organizacao_id);

-- 2. CONTATOS ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  telefone TEXT NOT NULL,
  nome TEXT,
  foto_url TEXT,
  etiquetas TEXT[] NOT NULL DEFAULT '{}',
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ,
  UNIQUE (organizacao_id, telefone)
);

-- 3. CONVERSAS --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  canal_id UUID NOT NULL REFERENCES public.canais(id) ON DELETE RESTRICT,
  contato_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'em_atendimento', 'aguardando_cliente', 'resolvida')),
  responsavel_email TEXT,
  responsavel_nome TEXT,
  departamento TEXT,
  etiquetas TEXT[] NOT NULL DEFAULT '{}',
  chamado_id UUID,
  ultima_mensagem_em TIMESTAMPTZ,
  ultima_mensagem_texto TEXT,
  -- Base da janela de 24h da API oficial: última mensagem que o CLIENTE mandou
  ultima_entrada_cliente_em TIMESTAMPTZ,
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvida_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS conversas_lista_idx ON public.conversas (organizacao_id, status, ultima_mensagem_em DESC);
-- No máximo UMA conversa aberta por contato em cada canal
CREATE UNIQUE INDEX IF NOT EXISTS conversas_aberta_uk ON public.conversas (canal_id, contato_id) WHERE status <> 'resolvida';

-- 4. MENSAGENS --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida', 'nota')),
  tipo TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'template', 'reacao', 'sistema', 'outro')),
  conteudo TEXT,
  midia JSONB,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviada', 'entregue', 'lida', 'falhou', 'recebida')),
  erro TEXT,
  id_externo TEXT,
  responde_a UUID REFERENCES public.mensagens(id) ON DELETE SET NULL,
  autor_email TEXT,
  autor_nome TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensagens_conversa_idx ON public.mensagens (conversa_id, criado_em);
-- Um aviso repetido do WhatsApp nunca duplica a mensagem
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_externo_uk ON public.mensagens (organizacao_id, id_externo) WHERE id_externo IS NOT NULL;

-- 5. RESPOSTAS RÁPIDAS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.respostas_rapidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  atalho TEXT NOT NULL CHECK (atalho ~ '^[a-z0-9_-]{1,30}$'),
  texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 4000),
  alcance TEXT NOT NULL DEFAULT 'empresa' CHECK (alcance IN ('pessoal', 'departamento', 'empresa')),
  departamento TEXT,
  autor_email TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, atalho, autor_email)
);

-- 6. REGRAS DE INTEGRIDADE ENTRE EMPRESAS ----------------------------------------
-- Conversa, mensagem e contato sempre da mesma empresa do canal/conversa (função da migração multiempresa)
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.conversas;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.conversas FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('canais', 'canal_id');
DROP TRIGGER IF EXISTS rm_org_do_contato ON public.conversas;
CREATE TRIGGER rm_org_do_contato BEFORE INSERT OR UPDATE ON public.conversas FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('contatos', 'contato_id');
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.mensagens;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.mensagens FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('conversas', 'conversa_id');
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.contatos;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('empresas', 'empresa_id');

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['canais', 'contatos', 'conversas', 'mensagens', 'respostas_rapidas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS rm_org_imutavel ON public.%I', t);
    EXECUTE format('CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel()', t);
  END LOOP;
END $$;

-- Limite do plano: números de WhatsApp conectados
DROP TRIGGER IF EXISTS rm_limite_canais ON public.canais;
CREATE TRIGGER rm_limite_canais BEFORE INSERT ON public.canais FOR EACH ROW EXECUTE FUNCTION public.rm_conferir_limite('numeros_whatsapp');

-- 7. QUEM VÊ QUAIS CONVERSAS --------------------------------------------------------
-- Departamento permitido para quem está logado: administrador vê todos; com perfil, os do perfil;
-- sem perfil, todos menos os bloqueados (mesma regra de src/lib/perfis.js). Conversa sem departamento: todos veem.
CREATE OR REPLACE FUNCTION public.rm_departamento_permitido(p_departamento TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_perfil public.perfis_acesso; v_bloqueados TEXT[]; v_perfil_id UUID;
BEGIN
  IF public.rm_eh_admin() OR p_departamento IS NULL OR btrim(p_departamento) = '' THEN RETURN TRUE; END IF;
  SELECT e.perfil_id, coalesce(e.departamentos_bloqueados, '{}') INTO v_perfil_id, v_bloqueados
    FROM public.equipe_usuarios e
   WHERE lower(trim(e.email)) = public.rm_email_atual() AND e.organizacao_id = public.rm_org_atual() AND coalesce(e.ativo, true)
   LIMIT 1;
  IF v_perfil_id IS NOT NULL THEN
    SELECT * INTO v_perfil FROM public.perfis_acesso WHERE id = v_perfil_id;
    IF FOUND THEN
      IF v_perfil.administrador OR v_perfil.todos_departamentos THEN RETURN TRUE; END IF;
      RETURN EXISTS (SELECT 1 FROM unnest(v_perfil.departamentos) d WHERE lower(trim(d)) = lower(trim(p_departamento)));
    END IF;
  END IF;
  RETURN NOT EXISTS (SELECT 1 FROM unnest(v_bloqueados) d WHERE lower(trim(d)) = lower(trim(p_departamento)));
END $$;
REVOKE EXECUTE ON FUNCTION public.rm_departamento_permitido(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rm_departamento_permitido(TEXT) TO authenticated, service_role;

-- 8. RLS ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.rm_so_leitura(t TEXT, sel TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p RECORD;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
  END LOOP;
  EXECUTE format('CREATE POLICY rm_select ON public.%I FOR SELECT TO authenticated USING (organizacao_id = public.rm_org_atual() AND public.rm_eh_equipe() AND (%s))', t, sel);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
END $$;

-- Navegador só lê; tudo que grava passa pelo servidor (que confere permissão e fala com o WhatsApp)
SELECT pg_temp.rm_so_leitura('canais', 'true');
SELECT pg_temp.rm_so_leitura('contatos', 'true');
SELECT pg_temp.rm_so_leitura('conversas', 'lower(coalesce(responsavel_email, '''')) = public.rm_email_atual() OR public.rm_departamento_permitido(departamento)');
SELECT pg_temp.rm_so_leitura('mensagens', 'EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = conversa_id)');
SELECT pg_temp.rm_so_leitura('respostas_rapidas', 'alcance <> ''pessoal'' OR lower(coalesce(autor_email, '''')) = public.rm_email_atual()');

-- Canais: o navegador lê só as colunas públicas (segredos e hash do webhook ficam de fora)
GRANT SELECT (id, organizacao_id, nome, tipo, provedor, status, status_detalhe, numero, departamento_padrao, ativo, config, qr_atualizado_em, criado_em, atualizado_em) ON public.canais TO authenticated;
GRANT SELECT ON public.contatos, public.conversas, public.mensagens, public.respostas_rapidas TO authenticated;

-- 9. TEMPO REAL: conversas e mensagens chegam na tela sem recarregar (respeitando a RLS)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversas', 'mensagens', 'canais'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
