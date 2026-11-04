-- Pedido de tratativa: o gestor pede que o responsável por uma demanda a resolva (concluir, cancelar ou pôr em
-- espera) ou explique, com prazo opcional. Se o prazo vence sem resposta, o sistema conclui ou cancela sozinho
-- (o gestor escolhe qual ao pedir). Só o servidor lê e grava (a tela passa por /api/demandas/pedidos).
--  aberto      = esperando o responsável
--  respondido  = o responsável respondeu com uma explicação (a demanda continua aberta)
--  concluido / cancelado / em_espera = o responsável tratou a demanda (valor lido da situação da demanda)
--  expirado    = o prazo venceu e o sistema concluiu ou cancelou a demanda sozinho
--  retirado    = o gestor desistiu do pedido
-- Pode ser rodado de novo sem problema.
BEGIN;

CREATE TABLE IF NOT EXISTS public.demanda_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id UUID NOT NULL DEFAULT public.rm_org_atual() REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  chamado_id UUID NOT NULL REFERENCES public.suporte_chamados(id) ON DELETE CASCADE,
  solicitante_email TEXT NOT NULL,
  solicitante_nome TEXT,
  responsavel_email TEXT NOT NULL,
  responsavel_nome TEXT,
  mensagem TEXT,
  -- o que o sistema faz sozinho se o prazo vencer: concluir ou cancelar (sem prazo, nunca vence)
  acao_prazo TEXT CHECK (acao_prazo IN ('concluir', 'cancelar')),
  prazo_em TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'respondido', 'concluido', 'cancelado', 'em_espera', 'expirado', 'retirado')),
  resposta TEXT,
  respondido_em TIMESTAMPTZ,
  encerrado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demanda_pedidos_org_idx ON public.demanda_pedidos (organizacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS demanda_pedidos_aberto_idx ON public.demanda_pedidos (status, prazo_em);
CREATE INDEX IF NOT EXISTS demanda_pedidos_chamado_idx ON public.demanda_pedidos (chamado_id);

-- A demanda precisa ser da mesma empresa da linha; a empresa nunca muda
DROP TRIGGER IF EXISTS rm_org_do_pai ON public.demanda_pedidos;
CREATE TRIGGER rm_org_do_pai BEFORE INSERT OR UPDATE ON public.demanda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_do_pai('suporte_chamados', 'chamado_id');
DROP TRIGGER IF EXISTS rm_org_imutavel ON public.demanda_pedidos;
CREATE TRIGGER rm_org_imutavel BEFORE UPDATE ON public.demanda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.rm_org_imutavel();

-- Navegador não lê nem grava (nenhuma política = nenhum acesso); o servidor usa a service role
ALTER TABLE public.demanda_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demanda_pedidos FROM anon, authenticated;
GRANT ALL ON public.demanda_pedidos TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
