# Plano de lançamento (30 dias)

Roteiro montado em 29–30/10/2026 na conversa "Instalar plugins Claude Code" (Claude Code no Mac do
Lucas). A conversa completa, com a apresentação visual do plano e as 7 perguntas e respostas, fica no
Mac do Lucas em:
`~/.claude/projects/-Users-lucasamorim-Documents-GitHub-RM-Controle/25f2c0f0-738d-486c-bce0-0ffc2c725ee4.jsonl`
(sessão `session_01JEgAiw9818aYumbnW8daGR`). Se precisar do texto original, leia esse arquivo.

Decisões do Lucas nas 7 perguntas: WhatsApp Cloud API (Meta) junto com a Evolution; preferir
opções gratuitas; mostrar opções e custos de cada canal de alerta; descobrir os riscos na varredura;
só o Lucas opera o sistema por ~30 dias.

Situação em 03/11/2026 (✅ feito · ⏳ em andamento · ⬜ falta):

## Fase 0 — Base e migração
- ✅ Banco migrado para São Paulo (30/10), segredos trocados, captcha (Turnstile) no login.
- ✅ Backup diário pelo GitHub Actions apontando para o banco SP.
- ✅ CLAUDE.md do projeto.
- ✅ Variáveis da Vercel (SESSION_SECRET, Turnstile, GOOGLE_TOKENS_KEY, CANAIS_CHAVE…).
- ⬜ Comunicado à equipe sobre a troca (confirmar com o Lucas).
- ⬜ Ligar a proteção contra senhas vazadas no Supabase (Authentication › Password) — exige plano Pro.

## Fase 1 — Segurança e LGPD
- ✅ Varredura de segurança e correções (PRs #3 a #5): isolamento entre empresas nas rotas com
  chave mestra, proteção do papel da equipe, auditoria com autor.
- ✅ Senhas com hash (bcrypt) e credenciais das empresas clientes cifradas (Vault).
- ⬜ Documentos da LGPD: política de privacidade, termos de uso, contrato de operador com os
  clientes e plano de resposta a incidentes.

## Fase 2 — Velocidade para 100 clientes
- ⬜ Índices, RLS mais rápido (consultas com `rm_org_atual()`), teste de carga.

## Fase 3 — WhatsApp oficial
- ⬜ Verificação da empresa na Meta (começar já, demora).
- ⬜ Ativar o adaptador da Cloud API (`src/lib/server/canais/meta.js`) junto com a Evolution.
- ⬜ Tirar a Evolution do Mac: servidor na Magalu Cloud (~R$ 93/mês) quando o piloto começar.

## Fase 4 — Alertas
- ⬜ Sentry (erros), Better Stack (sistema fora do ar) e Telegram (aviso no celular).

## Antes do primeiro cliente pagante
- ⬜ Supabase Pro e Vercel Pro (o plano Hobby proíbe uso comercial).
- ⬜ Pausar o banco antigo de Oregon (1–2 semanas depois de 30/10 estável).

## Entregas de produto feitas fora do plano (03/11)
Chat (resolvida volta para Pendentes, erros de envio, ações em massa), Fluxo Inteligente (grupos,
Pergunta, etiquetas), envios em massa com controle de risco, etiquetas cadastradas, canais liberados
e edição de empresa e usuários pela Plataforma. Detalhes em `docs/HISTORICO.md`.
