# Histórico do projeto com o Claude

Resumo para quem continuar o trabalho (outra conta ou outra sessão do Claude). Detalhes de cada
entrega estão nos pull requests do GitHub `lucasrmchat-dev/RM-Controle` e nas `NOVIDADES`
(`src/lib/novidades.js`). Regras de trabalho e arquitetura: `CLAUDE.md`.

## Antes (out/2026, outra conta do Claude, no Mac do Lucas)

- Base do sistema: Chat do WhatsApp (Evolution por QR Code), Fila de Demandas, Agenda e Google
  Agenda, Comercial e comissão, Daily, Feedbacks, Fluxo Inteligente, perfis de acesso.
- Multiempresa (Plataforma → Revendas → Assinantes), RLS por empresa, Turnstile no login.
- Migração do banco para São Paulo (30/10/2026), backup diário pelo GitHub Actions.
- Plano de 30 dias para colocar em produção: `docs/plano-30-dias.md` (com o que já foi feito).

## Nov/2026 (Claude Code na nuvem, branch `claude/rm-controle-security-scan-b2cl9e`)

| PR | Entrega |
|---|---|
| #3–#5 | Varredura de segurança e correções: isolamento entre empresas nas rotas, proteção do papel/acesso da equipe, autor na auditoria, limpeza de colaboradores e do admin antigo |
| #6 | Conversa resolvida volta para Pendentes quando chega mensagem nova (inclusive grupos); catálogo de erros de envio do Chat (exclamação vermelha); Configurações › Documentação |
| #7 | Fila de demandas inconsistente entre usuários (sessão do banco vencida no navegador) |
| #8 | Fluxo em grupos, registro de "não disparou", bloco Pergunta, condição por etiqueta; ações em massa no Chat |
| #9 | Mensagem do próprio número que dispararia um fluxo aparece em Execuções |
| #10 | Envios em massa (intervalo, termômetro de probabilidade, bloqueio de alta, termo na média, agendador pg_cron) e etiquetas cadastradas (Chat e Demandas) |
| #11 | Canais liberados valem em todas as telas, inclusive para administrador |
| #12 | Plataforma: editar nome da empresa e nome/e-mail/senha dos usuários; equipe lida pelo servidor |

Migrações aplicadas no banco SP nesse período (via psql pelo Lucas): `migration_equipe_protege_acesso`,
`migration_auditoria_autor`, `migration_limpar_colaboradores_empresa`, `migration_remover_admin_antigo`,
`migration_fluxo_esperas`, `migration_chat_massa`, `migration_envios_massa` + agendador
(`scripts/agendador/ligar-agendador.sh`, `CRON_SECRET` novo na Vercel em 03/11/2026).

## Como o Lucas trabalha

- Português simples, sem jargão; ele não é desenvolvedor. Pedir só o que exige a conta dele
  (senhas, chaves, aprovações). Segredos nunca pelo chat.
- Deploy: pushes na `main` ficam BLOCKED (Vercel Hobby) → publicar pelo MCP da Vercel
  (`create_deployment`) ou Redeploy no painel (às vezes pede código por e-mail).
- Migrações: arquivo em `supabase/`, o Lucas roda com psql (comando no `CLAUDE.md`).
