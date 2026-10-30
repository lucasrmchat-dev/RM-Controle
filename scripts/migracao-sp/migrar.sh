#!/usr/bin/env bash
# Copia o RM Controle (Oregon) para o RM Controle SP (São Paulo): estrutura, dados, logins,
# a chave de dados do Vault e os arquivos do Chat. Pede só as senhas, sem mostrar na tela;
# nada sensível é gravado em disco (os arquivos exportados ficam numa pasta temporária apagada ao final).
set -euo pipefail
cd "$(dirname "$0")/../.."

PG=/opt/homebrew/opt/libpq/bin
[ -x "$PG/pg_dump" ] || { echo "pg_dump não encontrado. Rode: brew install libpq"; exit 1; }

ORIGEM="host=aws-0-us-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.lsjjlaiiftuenaqgvgvb sslmode=require"
DESTINO="host=aws-1-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.wwkfsdibzmquqhjykooo sslmode=require"

# A chave secreta do projeto antigo já está no .env.local (o mesmo que o app usa).
CHAVE_ORIGEM=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'")
grep -q '^NEXT_PUBLIC_SUPABASE_URL=https://lsjjlaiiftuenaqgvgvb.supabase.co' .env.local \
  || { echo "O .env.local não aponta para o projeto antigo. Nada foi feito."; exit 1; }

echo "Ao digitar ou colar, nada aparece na tela. É normal: depois é só apertar Enter."
echo

# ./migrar.sh --so-arquivos: copia só os arquivos do Chat que ainda faltam no projeto novo.
if [ "${1:-}" = "--so-arquivos" ]; then
  read -rsp "Chave secreta do projeto NOVO (Settings > API Keys > service_role): " CHAVE_DESTINO; echo
  CHAVE_ORIGEM="$CHAVE_ORIGEM" CHAVE_DESTINO="$CHAVE_DESTINO" /opt/homebrew/bin/node scripts/migracao-sp/copiar-arquivos.mjs
  exit
fi

read -rsp "1) Senha do banco do projeto ANTIGO (RM Controle): " SENHA_ORIGEM; echo
read -rsp "2) Senha do banco do projeto NOVO (RM Controle SP): " SENHA_DESTINO; echo
read -rsp "3) Chave secreta do projeto NOVO (Settings > API Keys > service_role): " CHAVE_DESTINO; echo
echo

origem()  { PGPASSWORD="$SENHA_ORIGEM"  "$@" "$ORIGEM"; }
destino() { PGPASSWORD="$SENHA_DESTINO" "$@" "$DESTINO"; }

# Confere as senhas antes de começar.
origem  "$PG/psql" -tAc "select 1" >/dev/null 2>&1 || { echo "Senha do projeto ANTIGO não confere. Nada foi feito."; exit 1; }
destino "$PG/psql" -tAc "select 1" >/dev/null 2>&1 || { echo "Senha do projeto NOVO não confere. Nada foi feito."; exit 1; }

DIR="$(mktemp -d "${TMPDIR:-/tmp}/rm-migracao.XXXXXX")"
trap 'rm -rf "$DIR"' EXIT

EXISTENTES=$(destino "$PG/psql" -tAc "select count(*) from pg_tables where schemaname = 'public'")

# ./migrar.sh --recarregar-dados: na hora da troca. Mantém a estrutura do projeto novo (com as correções
# de segurança) e troca só os dados e os logins pelos mais recentes do projeto antigo.
if [ "${1:-}" = "--recarregar-dados" ]; then
  [ "$EXISTENTES" != "0" ] || { echo "O projeto novo está vazio. Rode sem --recarregar-dados."; exit 1; }

  echo "1/3 Exportando logins e dados do projeto antigo..."
  origem "$PG/pg_dump" --data-only --no-owner --quote-all-identifiers \
    --table=auth.users --table=auth.identities -f "$DIR/logins.sql" 2>/dev/null
  origem "$PG/pg_dump" --data-only --no-owner --quote-all-identifiers --schema=public -f "$DIR/dados.sql" 2>/dev/null

  echo "2/3 Trocando os dados do projeto novo (tudo ou nada)..."
  destino "$PG/psql" --quiet --single-transaction -v ON_ERROR_STOP=1 \
    -c "SET session_replication_role = replica" \
    -c "DO \$\$ DECLARE t text; BEGIN
          FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE format('DELETE FROM public.%I', t);
          END LOOP;
        END \$\$" \
    -c "DELETE FROM auth.refresh_tokens; DELETE FROM auth.sessions; DELETE FROM auth.mfa_factors;
        DELETE FROM auth.identities; DELETE FROM auth.users" \
    -f "$DIR/logins.sql" -f "$DIR/dados.sql" >/dev/null

  if [ -n "$CHAVE_DESTINO" ]; then
    echo "3/3 Copiando os arquivos do Chat que faltam..."
    CHAVE_ORIGEM="$CHAVE_ORIGEM" CHAVE_DESTINO="$CHAVE_DESTINO" /opt/homebrew/bin/node scripts/migracao-sp/copiar-arquivos.mjs
  else
    echo "3/3 Arquivos do Chat pulados (sem chave). Depois rode: ./scripts/migracao-sp/migrar.sh --so-arquivos"
  fi
  MODO_RECARGA=1
elif [ "$EXISTENTES" != "0" ]; then
  # Cópia completa: o destino precisa estar vazio, nada é sobrescrito.
  echo "O projeto novo já tem $EXISTENTES tabelas. Para trazer só os dados novos, use --recarregar-dados."
  exit 1
fi

if [ -z "${MODO_RECARGA:-}" ]; then

echo "1/6 Exportando a estrutura..."
origem "$PG/pg_dump" --schema=public --schema-only --no-owner --quote-all-identifiers -f "$DIR/estrutura_bruta.sql"
# O schema public já existe no projeto novo e não pertence ao usuário postgres.
# Os privilégios padrão ficam de fora para manter o "não expor tabelas novas automaticamente" do projeto novo.
grep -v -E '^(CREATE SCHEMA "public"|COMMENT ON SCHEMA "public"|ALTER DEFAULT PRIVILEGES)|ON SCHEMA "public"' \
  "$DIR/estrutura_bruta.sql" > "$DIR/estrutura.sql"

echo "2/6 Exportando logins e dados..."
origem "$PG/pg_dump" --data-only --no-owner --quote-all-identifiers \
  --table=auth.users --table=auth.identities -f "$DIR/logins.sql"
origem "$PG/pg_dump" --data-only --no-owner --quote-all-identifiers --schema=public -f "$DIR/dados.sql"

echo "3/6 Criando a estrutura no projeto novo..."
destino "$PG/psql" --quiet --single-transaction -v ON_ERROR_STOP=1 -f "$DIR/estrutura.sql"

echo "4/6 Copiando logins e dados..."
# replica: não dispara triggers (senhas já vêm cifradas) nem confere chaves estrangeiras durante a carga.
destino "$PG/psql" --quiet --single-transaction -v ON_ERROR_STOP=1 \
  -c "SET session_replication_role = replica" -f "$DIR/logins.sql" -f "$DIR/dados.sql"

echo "5/6 Copiando a chave de dados do Vault..."
# Cada projeto cifra o Vault com a própria chave, então o valor é lido aberto na origem e cadastrado de novo.
# Passa só por variável e pela entrada do psql (nunca na linha de comando nem em disco).
JA_TEM=$(destino "$PG/psql" -tAc "select count(*) from vault.secrets where name = 'rm_chave_dados'")
if [ "$JA_TEM" = "0" ]; then
  VALOR=$(origem "$PG/psql" -tAc "select encode(convert_to(decrypted_secret, 'UTF8'), 'base64') from vault.decrypted_secrets where name = 'rm_chave_dados'" | tr -d '\n')
  [ -n "$VALOR" ] || { echo "Chave rm_chave_dados não encontrada no projeto antigo."; exit 1; }
  printf "select vault.create_secret(convert_from(decode('%s', 'base64'), 'UTF8'), 'rm_chave_dados');\n" "$VALOR" \
    | destino "$PG/psql" --quiet -v ON_ERROR_STOP=1 -tA >/dev/null
  unset VALOR
fi

echo "6/6 Copiando os arquivos do Chat..."
CHAVE_ORIGEM="$CHAVE_ORIGEM" CHAVE_DESTINO="$CHAVE_DESTINO" /opt/homebrew/bin/node scripts/migracao-sp/copiar-arquivos.mjs
fi

echo
echo "Conferência:"
CONFERIR="select
  (select count(*) from pg_tables where schemaname = 'public') || ' tabelas',
  (select count(*) from pg_policies where schemaname = 'public') || ' políticas',
  (select count(*) from auth.users) || ' logins',
  (select count(*) from public.mensagens) || ' mensagens',
  (select count(*) from public.empresas) || ' empresas'"
printf 'Antigo: '; origem  "$PG/psql" -tA -F ' | ' -c "$CONFERIR"
printf 'Novo:   '; destino "$PG/psql" -tA -F ' | ' -c "$CONFERIR"
echo
echo "Pronto! Pode voltar ao Claude."
