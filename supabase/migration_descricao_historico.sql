-- Histórico de versões da descrição das demandas (Fila de Demandas → Editar descrição).
-- Cada item: { texto, autor_email, autor_nome, em }. Sem esta coluna a edição funciona,
-- mas as versões anteriores ficam só no navegador de quem editou.
ALTER TABLE public.suporte_chamados
  ADD COLUMN IF NOT EXISTS descricao_historico JSONB NOT NULL DEFAULT '[]'::jsonb;
