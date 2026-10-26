# Cópia diária do banco

Todo dia às 03:00 (Brasília) o GitHub copia o banco do Supabase e guarda a cópia por 30 dias.
A cópia é cifrada (AES-256) com uma senha que só você tem: quem abrir o repositório não consegue ler.

O arquivo de cada dia tem:

- `sistema.dump`: todas as tabelas, regras de acesso, funções e dados do RM Controle
- `logins.dump`: as contas de login (Supabase Auth)
- `chave_dados.txt`: a chave que cifra as senhas das empresas clientes
- `gerada_em.txt`: data e hora da cópia

## Configurar (uma vez)

1. **Endereço do banco.** No Supabase: botão **Connect** (no topo) › aba **Connection string** › **Session pooler**.
   Copie o endereço e troque `[YOUR-PASSWORD]` pela senha do banco.
   Use o *Session pooler* (porta 5432): o GitHub não alcança a conexão direta.
2. **Senha da cifra.** Crie uma senha longa (20 caracteres ou mais) e guarde num gerenciador de senhas.
   Sem ela, nenhuma cópia abre — nem por mim, nem pelo GitHub.
3. No GitHub: repositório **RM-Controle** › **Settings** › **Secrets and variables** › **Actions** › **New repository secret**:
   - `SUPABASE_DB_URL`: o endereço do passo 1
   - `BACKUP_PASSPHRASE`: a senha do passo 2
4. Teste agora: aba **Actions** › **💾 Cópia diária do banco** › **Run workflow**. Em 1 ou 2 minutos deve aparecer verde,
   com o arquivo em *Artifacts*.

Recomendado: deixe o repositório **privado** (Settings › General › Danger Zone › Change visibility).

## Restaurar

Baixe o arquivo em Actions › execução do dia › Artifacts, e num computador com o cliente do Postgres 17:

```bash
gpg -d rm-controle-banco.tar.gz.gpg > copia.tar.gz
tar -xzf copia.tar.gz
pg_restore --clean --if-exists --no-owner -d "ENDERECO_DO_BANCO_DESTINO" copia/sistema.dump
pg_restore --data-only --no-owner -d "ENDERECO_DO_BANCO_DESTINO" copia/logins.dump
```

Num projeto Supabase **novo** (por exemplo, a mudança para São Paulo), antes de restaurar rode as migrações da pasta
`supabase/` e grave a chave de `chave_dados.txt` no cofre do projeto novo com o nome `rm_chave_dados`
(SQL Editor: `select vault.create_secret('VALOR', 'rm_chave_dados');`) — assim as senhas das empresas continuam abrindo.
