-- Limpeza: tabela antiga public.colaboradores_empresa (sobra de uma versão anterior).
-- O sistema usa public.empresa_colaboradores; nada no código lê ou grava a tabela antiga.
-- Segurança da limpeza:
--   * só apaga se a tabela estiver VAZIA; com qualquer linha, recusa e nada muda;
--   * sem CASCADE: se algo ainda depender dela (visão, chave estrangeira), o banco recusa.
-- Pode ser rodado de novo sem problema (sem a tabela, não faz nada).
BEGIN;

DO $$
DECLARE v_linhas BIGINT;
BEGIN
  IF to_regclass('public.colaboradores_empresa') IS NULL THEN
    RAISE NOTICE 'Tabela colaboradores_empresa não existe: nada a fazer.';
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*) FROM public.colaboradores_empresa' INTO v_linhas;
  IF v_linhas > 0 THEN
    RAISE EXCEPTION 'colaboradores_empresa tem % linha(s). Nada foi apagado; confira esses dados antes.', v_linhas;
  END IF;
  DROP TABLE public.colaboradores_empresa;
  RAISE NOTICE 'Tabela colaboradores_empresa (vazia) removida.';
END $$;

COMMIT;
