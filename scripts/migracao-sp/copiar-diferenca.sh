#!/usr/bin/env bash
# Depois da troca: traz do projeto antigo as linhas criadas ou alteradas desde a recarga
# (mensagens que chegaram durante a janela, conversas atualizadas etc.).
# Uso: ./scripts/migracao-sp/copiar-diferenca.sh "2026-10-30 11:40:00+00"
# Cada linha encontrada substitui a de mesmo id no projeto novo; tudo numa transação.
set -euo pipefail
cd "$(dirname "$0")/../.."
DESDE="${1:?Informe a data/hora da recarga, ex.: \"2026-10-30 11:40:00+00\"}"

PG=/opt/homebrew/opt/libpq/bin
ORIGEM="host=aws-0-us-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.lsjjlaiiftuenaqgvgvb sslmode=require"
DESTINO="host=aws-1-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.wwkfsdibzmquqhjykooo sslmode=require"

echo "Ao digitar, nada aparece na tela. É normal: depois é só apertar Enter."
read -rsp "1) Senha do banco do projeto ANTIGO (RM Controle): " SENHA_ORIGEM; echo
read -rsp "2) Senha do banco do projeto NOVO (RM Controle SP): " SENHA_DESTINO; echo
origem()  { PGPASSWORD="$SENHA_ORIGEM"  "$PG/psql" "$ORIGEM"  "$@"; }
destino() { PGPASSWORD="$SENHA_DESTINO" "$PG/psql" "$DESTINO" "$@"; }

DIR="$(mktemp -d "${TMPDIR:-/tmp}/rm-diferenca.XXXXXX")"
trap 'rm -rf "$DIR"' EXIT

# Tabelas do public com coluna id e ao menos uma coluna de data: "tabela|col1,col2"
TABELAS=$(origem -tAc "select c.table_name || '|' || string_agg(quote_ident(c.column_name), ',')
  from information_schema.columns c
  where c.table_schema = 'public' and c.data_type like 'timestamp%'
    and exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = c.table_name and i.column_name = 'id')
  group by c.table_name order by 1")

CARGA="$DIR/carga.sql"
echo "SET session_replication_role = replica;" > "$CARGA"
TOTAL=0
for LINHA in $TABELAS; do
  T="${LINHA%%|*}"; COLS="${LINHA#*|}"
  FILTRO="greatest($COLS) >= '$DESDE'"
  N=$(origem -tAc "select count(*) from public.\"$T\" where $FILTRO")
  [ "$N" = "0" ] && continue
  echo "  $T: $N"
  TOTAL=$((TOTAL + N))
  origem -qc "\\copy (select * from public.\"$T\" where $FILTRO) to '$DIR/$T.csv' with csv"
  cat >> "$CARGA" <<SQL
CREATE TEMP TABLE "d_$T" (LIKE public."$T");
\\copy "d_$T" from '$DIR/$T.csv' with csv
DELETE FROM public."$T" WHERE id IN (SELECT id FROM "d_$T");
INSERT INTO public."$T" SELECT * FROM "d_$T";
SQL
done

if [ "$TOTAL" = "0" ]; then echo "Nada novo desde $DESDE."; exit 0; fi
destino --quiet --single-transaction -v ON_ERROR_STOP=1 -f "$CARGA" >/dev/null
echo "Pronto: $TOTAL linhas trazidas. Pode voltar ao Claude."
