-- Preserva o problema relatado separado do procedimento adotado (observacoes).
ALTER TABLE public.suporte_chamados
  ADD COLUMN IF NOT EXISTS observacao_inicial text,
  ADD COLUMN IF NOT EXISTS categorias text[],
  ADD COLUMN IF NOT EXISTS status_resolucao text;

-- Nas demandas abertas o campo antigo ainda contém o relato. Nos atendimentos
-- encerrados ele pode conter a resolução, por isso não se presume que seja o problema.
UPDATE public.suporte_chamados
SET observacao_inicial = observacoes
WHERE observacao_inicial IS NULL
  AND status IN ('aguardando_visualizacao', 'em_andamento', 'pendente');
