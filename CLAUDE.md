# RM Controle — guia para o Claude

Sistema de gestão de demandas, atendimento e WhatsApp, vendido como **SaaS multiempresa**.
Dono: Lucas (não é desenvolvedor de formação; explique em português simples, sem jargão,
e peça para ele só o que exige a conta dele: senhas, chaves, pagamentos, aprovações).

## Como trabalhar neste projeto

- **Mudança mínima e cirúrgica.** Leia o código em volta antes de editar, reaproveite o que já
  existe (`src/lib/*`, `src/lib/server/*`) e não refatore, renomeie ou "melhore" o que não foi pedido.
- **Imite o código vizinho:** JavaScript puro (sem TypeScript), nomes e comentários em português,
  mesma densidade de comentários. Biome: 2 espaços, linha de 100.
- **Verifique antes de dizer que terminou:** testes (`npm run test:sync`, `npm run test:banco`),
  e na interface, o navegador do app. Diga o que não foi verificado.
- **Na dúvida sobre o que o Lucas quer, pergunte**; não decida sozinho mudanças de produto ou visual.
- Texto que o usuário final lê: português simples, sem termos técnicos.

## Stack e infraestrutura (produção)

| Peça | Detalhe |
|---|---|
| App | Next.js 15.5 (App Router) + React 18, Tailwind 3, framer-motion, lucide-react |
| Hospedagem | Vercel, projeto `rm-controle` (team `team_1BlmneUtJckt2gfCYyFETwnT`), **região `gru1`**, plano **Hobby** |
| Banco | Supabase **"RM Controle SP"** — ref `wwkfsdibzmquqhjykooo`, `sa-east-1`, plano Free (Postgres 17) |
| Banco antigo | "RM Controle" (Oregon, ref `lsjjlaiiftuenaqgvgvb`) — só reserva desde 30/10/2026; não usar |
| WhatsApp | Evolution API (QR Code), hoje rodando no Mac do Lucas; adaptador da Cloud API da Meta em `src/lib/server/canais/meta.js` |
| Captcha | Cloudflare Turnstile (código pronto; ativo só com as chaves configuradas) |

Pooler do banco SP: `host=aws-1-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.wwkfsdibzmquqhjykooo sslmode=require`.

## Rodar, testar, publicar

- Node e npm ficam em `/opt/homebrew/bin` (fora do PATH do shell do Claude):
  `export PATH=/opt/homebrew/bin:$PATH`. Cliente Postgres: `/opt/homebrew/opt/libpq/bin/psql`.
- `npm run dev` (o Lucas costuma manter um rodando na porta 3000 — **não** rode `next build` nem
  apague `.next` no repositório; faça build numa cópia isolada no scratchpad, com `node_modules` linkado).
- `npm run test:sync` — testes unitários (node --test, mocks em `tests/mocks/setup.js`).
- `npm run test:banco` — isolamento entre empresas e canais num Postgres real em memória (PGlite).
- `npm audit --audit-level=high` precisa ficar limpo (o CI falha com vulnerabilidade alta).
- Ensaio contra o banco SP sem mexer no dev normal: `scripts/migracao-sp/testar-local.sh` (porta 3200).
- **Deploy:** pushes na `main` saem **BLOCKED** na Vercel (plano Hobby). Publique pelo MCP da Vercel:
  `create_deployment` com `gitSource {type: github, org: lucasrmchat-dev, repo: RM-Controle, ref: main}`,
  `target: production`. Variáveis `NEXT_PUBLIC_*` só valem depois de um novo deploy.
- **Commits sem a linha `Co-Authored-By`** enquanto o projeto estiver no Hobby.
- Commit e push só quando o Lucas pedir ou aprovar.

## Mapa do código

```
src/app/page.js            app de página única: troca de telas (abas) e carga inicial
src/app/layout.js          paleta aplicada antes da primeira pintura (SCRIPT_PALETA_INICIAL)
src/app/api/**/route.js    rotas do servidor (auth, chat, canais, agenda, fila, fluxos, comercial…)
src/app/r/                 páginas públicas curtas (ex.: confirmação de reunião)
src/middleware.js          CSP, cabeçalhos de segurança e limite de tentativas em memória
src/components/            telas (*View.jsx), modais e peças; fluxos/ = editor de automações
src/lib/storage.js         camada de dados do navegador (supabase-js com RLS + chamadas a /api)
src/lib/*.js               regras puras e reutilizáveis (perfis, roles, fluxos, comissão, paletas…)
src/lib/server/            só servidor: organizacao.js (multiempresa), acesso.js (login),
                           protecao.js (captcha e limite), googleAgenda.js, canais/ (WhatsApp)
supabase/*.sql             migrações aplicadas à mão (não há controle de versão de migração)
scripts/                   security-audit.js (CI) e migracao-sp/ (migração para São Paulo)
tests/                     testes unitários; tests/banco/ = testes no Postgres (PGlite)
docs/                      implantação, backup, webhooks comerciais, plano de canais, Evolution local
```

## Multiempresa (a regra mais importante)

Hierarquia: **Plataforma (Lucas) → Revendas → Assinantes → clientes de cada assinante.**
Um banco só; cada linha de empresa tem `organizacao_id`. Isolamento em **duas camadas**:

1. **Servidor:** toda rota usa `contextoDaRequisicao(request)` (`src/lib/server/organizacao.js`) e
   trabalha com o `ctx.db` que ele devolve — select/update/delete já filtram a empresa e insert grava
   a empresa. **Nunca** use o cliente admin global (`getSupabaseAdmin()`) numa rota sem escopo.
   Rotas sem sessão (webhooks, links públicos) resolvem a empresa pelo registro ou token
   (`escopoDoRegistro`, `naEmpresaDaSessao`, `executarNaEmpresa`).
2. **Banco (RLS):** políticas `organizacao_id = rm_org_atual()` + papel (`rm_eh_equipe`,
   `rm_eh_operacao`, `rm_eh_admin`). O navegador lê várias tabelas direto com supabase-js.

**Tabela nova de empresa** = coluna `organizacao_id uuid not null default rm_org_atual()` +
RLS ligado + políticas por empresa + trigger `rm_org_imutavel` + nome em `TABELAS_DA_EMPRESA` +
cobertura em `tests/banco/isolamento.mjs`. Suporte do dono/revenda "entra na empresa" por 2 h,
com motivo, registrado na auditoria da empresa (modelo LGPD escolhido pelo Lucas).

## Banco de dados

- Migrações novas: arquivo em `supabase/migration_<assunto>.sql`, idempotente (`IF NOT EXISTS`),
  só acrescentando quando possível. **Aplicar:** a ferramenta `apply_migration` do MCP do Supabase é
  sempre recusada neste app — abra uma aba de terminal com
  `/opt/homebrew/opt/libpq/bin/psql "<pooler SP>" --single-transaction -v ON_ERROR_STOP=1 -f <arquivo>`
  e deixe o Lucas digitar a senha. Leituras pelo MCP (`execute_sql`, `get_advisors`) funcionam.
- Funções: sempre `SET search_path = public, pg_temp` (ou com `extensions`). O schema já revoga
  EXECUTE de PUBLIC/anon/authenticated por padrão; dê `GRANT … TO authenticated` só às funções que
  as políticas de RLS chamam (hoje: rm_org_atual, rm_papel, rm_email_atual, rm_eh_admin, rm_eh_equipe,
  rm_eh_operacao, rm_departamento_permitido, rm_credenciais_empresas).
- Projeto criado com "não expor tabelas novas automaticamente": tabela nova precisa de GRANT explícito
  para `authenticated` se o navegador for lê-la.
- Depois de mudar o schema, rode `get_advisors` (security) e confira.
- Senhas das empresas clientes: `empresa_credenciais.senha_cifrada`, chave `rm_chave_dados` no Vault.
- Auditoria: `auditoria_logs` (imutável) via `POST /api/auditoria`; colunas `usuario_nome`,
  `operador_nome`, `ip_origem`.

## Segredos e variáveis (Vercel, Production)

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase SP (públicas) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta (`sb_secret_…`) — só servidor |
| `SESSION_SECRET` | assina o cookie `rm_session_token` |
| `GOOGLE_TOKENS_KEY` | cifra o token do Google Agenda |
| `CANAIS_CHAVE` | cifra credenciais dos canais (`canais.credenciais_cifradas`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | captcha do login |
| `EVOLUTION_URL`, `EVOLUTION_API_KEY` | Evolution API |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `GOOGLE_AGENDA_WEBHOOK_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` | integrações e cron |

- As chaves de cifra e de sessão são **independentes** da chave do Supabase de propósito: trocar uma
  não pode quebrar as outras. Trocar `GOOGLE_TOKENS_KEY` exige reconectar o Google Agenda;
  trocar `CANAIS_CHAVE` exige recadastrar credenciais de canais; trocar `SESSION_SECRET` desloga todos.
- Segredos nunca passam pelo chat: o Lucas cola direto no painel, ou o script pede escondido
  (`read -s`). Valor aleatório: `openssl rand -base64 48 | tr -d '\n' | pbcopy`.
- `.env.local` aponta para o banco antigo (Oregon) — não use para nada de produção.

## Interface

- **Cabeçalho:** pílula compacta, sempre fixa no topo e centralizada (`Navbar.jsx`); nunca barra
  larga, nunca muda de largura ou lugar. Páginas abrem espaço com `LINHA_TITULO` +
  `EncaixeCabecalho` (`src/components/EncaixeCabecalho.jsx`); sem título grande na página.
  Wrapper do cabeçalho `z-[49]`; elementos da página `z-40`; modais `z-50+`.
- **Cores:** sempre tokens `rm-*` da paleta (`src/lib/paletas.js`, `globals.css`, `tailwind.config.js`);
  nunca hex de acento/fundo. Exceções fixas: textos #1d1d1f/#f5f5f7 e bolhas do WhatsApp.
- Claro e escuro sempre. Animação só com transform/opacity.
- `scrollIntoView()` devolve Promise no Chrome atual: em `useEffect` use chaves
  (`() => { el.scrollIntoView() }`), senão o React quebra.
- Next 15: em rotas e páginas, `params` é Promise (`const params = await contexto.params`).

## Processo de entrega

- Toda melhoria ou correção que o usuário vê ganha uma entrada **no topo** de `NOVIDADES` em
  `src/lib/novidades.js` (id único, data AAAA-MM-DD, título, resumo, itens, módulo de
  `MODULOS_FEEDBACK`, `tickets` com os feedbacks que resolve). Texto para usuário final.
- Fluxo Inteligente (automações): bloco novo = `BLOCOS` + case em `executarFluxo` + efeitos real e
  simulado + formulário em `components/fluxos/ConfigBloco.jsx` + resumo no `EditorFluxo`.
- CI (`.github/workflows/ci.yml`): auditoria de segredos, `npm audit`, Biome e build.
- Backup diário (`.github/workflows/backup-banco.yml`, 03h): usa o segredo `SUPABASE_DB_URL` do GitHub.

## Pendências conhecidas (30/10/2026)

- Segredo `SUPABASE_DB_URL` do GitHub ainda aponta para o banco de Oregon → trocar para o SP.
- Chaves do Turnstile não configuradas (captcha desligado).
- Evolution API no Mac do Lucas → mover para servidor (plano: Magalu Cloud, ~R$ 93/mês).
- Vercel Pro e Supabase Pro antes do primeiro cliente pagante (Hobby proíbe uso comercial).
- Pausar o banco de Oregon depois de 1–2 semanas estável.
- Fase 1 do plano: varredura de segurança, auditoria das rotas com chave mestra, LGPD.
