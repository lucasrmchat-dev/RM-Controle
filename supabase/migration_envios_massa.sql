-- Envios em massa (aba "Envios" no cabeçalho): uma mensagem para vários contatos e grupos do Chat,
-- na hora ou agendada, com um intervalo entre uma mensagem e outra (menos risco de bloqueio no QR Code).
--  envios_massa          = o envio (mensagem, canal, intervalo, quando começa, situação e contadores)
--  envios_massa_destinos = cada contato ou grupo do envio e a situação dele (pendente, enviado, falhou)
-- Só o servidor lê e grava (a tela passa por /api/envios). Pode ser rodado de novo sem problema.
BEGIN;

CREATE TABLE IF NOT EXISTS public.envios_massa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  canal_id UUID REFERENCES public.canais(id) ON DELETE SET NULL,
  mensagem TEXT NOT NULL,
  intervalo_segundos INTEGER NOT NULL DEFAULT 60 CHECK (intervalo_segundos BETWEEN 5 AND 3600),
  -- agendado | enviando | pausado | concluido | cancelado
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'enviando', 'pausado', 'concluido', 'cancelado')),
  agendado_para TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- quando sai a próxima mensagem (também serve de trava: só um disparo por vez em cada envio)
  proximo_envio_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  total INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  falhas INTEGER NOT NULL DEFAULT 0,
  -- por que parou ou falhou por último (ex.: número desconectado)
  ultimo_erro TEXT,
  criado_por_email TEXT,
  criado_por_nome TEXT,
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS envios_massa_org_idx ON public.envios_massa (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS envios_massa_fila_idx ON public.envios_massa (status, proximo_envio_em);

CREATE TABLE IF NOT EXISTS public.envios_massa_destinos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  envio_id UUID NOT NULL REFERENCES public.envios_massa(id) ON DELETE CASCADE,
  contato_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  -- pendente | enviando | enviado | falhou
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviando', 'enviado', 'falhou')),
  erro TEXT,
  enviado_em TIMESTAMPTZ,
  UNIQUE (envio_id, contato_id)
);
CREATE INDEX IF NOT EXISTS envios_massa_destinos_fila_idx ON public.envios_massa_destinos (envio_id, status, ordem);

-- Canal, contato e envio precisam ser da mesma empresa da linha; a empresa nunca muda
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.envios_massa;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.envios_massa
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('canais', 'canal_id');
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.envios_massa_destinos;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.envios_massa_destinos
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('envios_massa', 'envio_id');
DROP TRIGGER IF EXISTS rm_org_do_pai_contato ON public.envios_massa_destinos;
CREATE TRIGGER rm_org_do_pai_contato BEFORE INSERT OR UPDATE ON public.envios_massa_destinos
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('contatos', 'contato_id');
DROP TRIGGER IF EXISTS rm_org_imutavel ON public.envios_massa;
CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.envios_massa
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel();
DROP TRIGGER IF EXISTS rm_org_imutavel ON public.envios_massa_destinos;
CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.envios_massa_destinos
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel();

-- Navegador não lê nem grava (nenhuma política = nenhum acesso); o servidor usa a service role
ALTER TABLE public.envios_massa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.envios_massa_destinos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envios_massa, public.envios_massa_destinos FROM anon, authenticated;
GRANT ALL ON public.envios_massa, public.envios_massa_destinos TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
