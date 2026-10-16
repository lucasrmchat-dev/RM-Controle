# Implantação — migração completa para o Supabase

Siga **nesta ordem**. O código novo tolera o banco antigo (recua para o comportamento anterior),
mas as proteções só valem depois do passo 1.

## 1. Banco (Supabase › SQL Editor › New query)

Cole e rode **`supabase/migration_supabase_completa.sql`** inteiro. Pode rodar de novo sem problema.

Depois, confira (cada consulta deve retornar `0` ou vazio):

```sql
SELECT count(*) FROM public.equipe_usuarios WHERE senha !~ '^\$2[abxy]\$' AND coalesce(senha,'') <> '';
SELECT count(*) FROM public.empresa_credenciais WHERE coalesce(senha,'') <> '' OR coalesce(senha_suporte,'') <> '';
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
```

> Validado em Postgres real (PGlite) com 38 verificações de RLS, criptografia e limites.

## 2. Variáveis de ambiente (Vercel › Settings › Environment Variables)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Sim** | Login, equipe, configurações globais, integração |
| `SESSION_SECRET` | Recomendada | Assinatura do cookie de sessão (gere com `openssl rand -base64 48`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Para captcha | Chave pública do Cloudflare Turnstile |
| `TURNSTILE_SECRET_KEY` | Para captcha | Chave secreta do Turnstile (o servidor confere o token) |
| `RM_ADMIN_EMAILS` | Opcional | Administradores extras, separados por vírgula (cadastre-os também em `public.rm_admins_proprietarios`) |

**Captcha:** em [dash.cloudflare.com](https://dash.cloudflare.com) › Turnstile › Add site, informe o domínio do
RM Controle, modo *Managed*. Copie as duas chaves acima. Sem elas o login funciona sem captcha.

> Definir `SESSION_SECRET` pela primeira vez encerra as sessões abertas (todos entram de novo uma vez).

## 3. Publicar o código (deploy no Vercel)

## 4. Primeiro acesso de cada colaborador

Na primeira vez que cada pessoa abrir o sistema, o que existia **só no navegador dela** (departamentos,
motivos, checklist, soluções, agenda, colaboradores, detalhes de servidor) é enviado ao Supabase
automaticamente — peça para todos entrarem uma vez, começando pelo administrador.

## 5. Senhas — ação necessária

As senhas abaixo estavam **escritas no código** enviado ao navegador e devem ser consideradas vazadas.
Se alguma conta ainda usa uma delas, troque em *Equipe & Senhas*:

- `admin@rmcontrole.com`
- `maria@`, `rayane@`, `pedro@`, `teste@rmchat.com` (senha padrão antiga)

Troque também a **senha padrão de contingência** em *Regras de Atendimento & Senha*.

## 6. Proteção contra DDoS (configuração, não código)

O código já limita tentativas (por IP e por conta, persistente no banco). Ataques volumétricos
precisam ser barrados **antes** de chegar à aplicação:

- **Vercel › Firewall:** ative *Bot Protection* e, durante um ataque, *Attack Challenge Mode*.
  Crie uma regra de *Rate Limit* para `/api/*` (ex.: 300 req/min por IP).
- **Supabase › Authentication › Rate Limits:** mantenha os limites padrão de login/cadastro.
- **Supabase › Authentication › Providers › Email:** desative *Allow new users to sign up*
  (contas agora são criadas só pelo administrador, pelo servidor).
