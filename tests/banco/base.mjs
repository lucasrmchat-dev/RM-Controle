// Monta um Postgres parecido com o Supabase e aplica as migrações do RM Controle em ordem.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
const REPO = new URL('../../supabase/', import.meta.url).pathname;

export const STUBS = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), email text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt() ->> 'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (name text primary key, secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT name, secret AS decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(p_secret text, p_name text, p_desc text) RETURNS void LANGUAGE sql AS $$ INSERT INTO vault.secrets VALUES (p_name, p_secret) $$;
CREATE PUBLICATION supabase_realtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

export async function novoBanco(arquivos, { parar = true } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(STUBS);
  for (const arq of arquivos) {
    let sql = fs.readFileSync(REPO + arq, 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;/, '').replace(/^NOTIFY pgrst.*$/gm, '');
    try {
      await db.exec(sql);
      console.log('ok  ', arq);
    } catch (e) {
      console.log('ERRO', arq, '→', e.message);
      if (parar) throw e;
    }
  }
  return db;
}
