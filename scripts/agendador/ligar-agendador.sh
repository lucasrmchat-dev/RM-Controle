#!/usr/bin/env bash
# Liga (ou atualiza) o agendador dos envios em massa no banco de São Paulo.
# Pede o endereço do sistema e o CRON_SECRET sem mostrar na tela; depois o psql pede a senha do banco.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL="/opt/homebrew/opt/libpq/bin/psql"
POOLER="host=aws-1-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.wwkfsdibzmquqhjykooo sslmode=require"

read -rp "Endereço do RM Controle (ex.: https://seu-dominio.com.br): " URL
URL="${URL%/}"
if [[ ! "$URL" =~ ^https:// ]]; then echo "Use o endereço completo, começando com https://"; exit 1; fi

read -rsp "CRON_SECRET (o mesmo da Vercel; deixe vazio para gerar um novo): " SEGREDO; echo
if [[ -z "$SEGREDO" ]]; then
  SEGREDO="$(openssl rand -base64 48 | tr -d '\n')"
  printf '%s' "$SEGREDO" | pbcopy
  echo "Gerei um CRON_SECRET novo e copiei para a área de transferência."
  echo "Cole agora na Vercel (Settings › Environment Variables › CRON_SECRET, Production) e faça um Redeploy."
  read -rp "Tecle Enter quando tiver colado na Vercel..." _
fi

# O segredo vai pelo canal de entrada do psql (não aparece na lista de processos)
{
  printf '\\set cron_secret %s\n' "$SEGREDO"
  printf '\\set app_url %s\n' "$URL"
  cat "$RAIZ/scripts/agendador/agendador.sql"
} | "$PSQL" "$POOLER" -v ON_ERROR_STOP=1 -f -
echo "Pronto: o agendador chama $URL/api/envios/processar a cada minuto."
