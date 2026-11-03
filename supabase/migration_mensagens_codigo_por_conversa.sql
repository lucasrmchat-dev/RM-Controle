-- Mensagens de grupo se perdiam quando 2 ou mais canais da mesma empresa estavam no mesmo grupo.
-- O WhatsApp entrega a mesma mensagem a cada canal com o MESMO código (id_externo). O índice único
-- era (empresa, código): só o primeiro canal gravava e os outros descartavam a cópia como "repetida".
-- Agora o código é único por conversa (cada conversa é de um canal), que é o que evita duplicar o
-- mesmo aviso reenviado. Só afrouxa a regra: nenhum dado existente é alterado.
-- Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS mensagens_externo_conversa_uk
  ON public.mensagens (conversa_id, id_externo)
  WHERE id_externo IS NOT NULL;

DROP INDEX IF EXISTS public.mensagens_externo_uk;

-- Busca por código (status, reação, edição): o índice novo começa por conversa_id e não ajuda
CREATE INDEX IF NOT EXISTS mensagens_id_externo_idx
  ON public.mensagens (id_externo)
  WHERE id_externo IS NOT NULL;
