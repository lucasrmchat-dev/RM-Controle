#!/usr/bin/env bash
# Ensaio da troca: roda o RM Controle em http://localhost:3200 usando o banco de São Paulo.
# Roda numa cópia temporária do projeto, para não mexer no .next do `npm run dev` de sempre (porta 3000).
# As variáveis do processo valem mais que o .env.local, então só o Supabase muda; o resto continua igual.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
COPIA="${TMPDIR:-/tmp}/rm-controle-teste-sp"

read -rsp "Chave secreta do projeto NOVO (RM Controle SP > Settings > API Keys > service_role): " CHAVE; echo

echo "Preparando a cópia em $COPIA..."
rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$RAIZ/" "$COPIA/"
ln -sfn "$RAIZ/node_modules" "$COPIA/node_modules"

echo "Abrindo em http://localhost:3200 (Ctrl-C para parar)"
cd "$COPIA"
NEXT_PUBLIC_SUPABASE_URL="https://wwkfsdibzmquqhjykooo.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3a2ZzZGliem1xdXFoanlrb29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMjQzMzgsImV4cCI6MjEwODkwMDMzOH0.RQllNiCQFekrVmGHiXHhdnQTQtyIDqGtiVzh2hM4tQc" \
SUPABASE_SERVICE_ROLE_KEY="$CHAVE" \
PATH="/opt/homebrew/bin:$PATH" \
  npx next dev -p 3200
