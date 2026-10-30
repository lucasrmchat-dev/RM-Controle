-- A rota /api/auditoria grava quem fez a ação (nome do usuário e do operador) e o IP de origem,
-- mas essas colunas nunca foram criadas: todo registro falhava e a auditoria parou em 16/10/2026.
-- Só acrescenta colunas; nada é apagado.
ALTER TABLE public.auditoria_logs
  ADD COLUMN IF NOT EXISTS usuario_nome text,
  ADD COLUMN IF NOT EXISTS operador_nome text,
  ADD COLUMN IF NOT EXISTS ip_origem text;

NOTIFY pgrst, 'reload schema';
