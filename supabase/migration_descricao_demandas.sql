-- Corrige descrições de demandas que "sumiam".
-- Causa: versões antigas do app gravavam o texto só em "observacoes" e deixavam "observacao_inicial"
-- vazio (''). Quem lia "observacao_inicial" primeiro via a demanda como "Sem descrição".
-- Seguro para rodar mais de uma vez.

-- 1. Recupera a descrição das demandas em aberto (nas concluídas, "observacoes" é a resolução)
UPDATE public.suporte_chamados
SET observacao_inicial = observacoes
WHERE status IN ('aguardando_visualizacao', 'em_andamento', 'pendente')
  AND COALESCE(btrim(observacao_inicial), '') = ''
  AND COALESCE(btrim(observacoes), '') <> '';

-- 2. Daqui para frente, qualquer versão do app que crie a demanda só com "observacoes" é corrigida pelo banco
CREATE OR REPLACE FUNCTION public.rm_preencher_observacao_inicial()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(btrim(NEW.observacao_inicial), '') = '' AND COALESCE(btrim(NEW.observacoes), '') <> '' THEN
    NEW.observacao_inicial := NEW.observacoes;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rm_preencher_observacao_inicial ON public.suporte_chamados;
CREATE TRIGGER rm_preencher_observacao_inicial
  BEFORE INSERT ON public.suporte_chamados
  FOR EACH ROW EXECUTE FUNCTION public.rm_preencher_observacao_inicial();
