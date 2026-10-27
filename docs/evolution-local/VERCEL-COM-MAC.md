# Site publicado (Vercel) usando a Evolution do seu Mac

Enquanto não há um servidor (VPS), o site da Vercel pode usar a Evolution que roda no Docker do Mac,
por um túnel do **ngrok** (endereço https fixo e gratuito). Funciona **só com o Mac ligado**, o Docker
aberto e o túnel rodando. Para clientes de verdade, use uma VPS.

```
Vercel ──(https, túnel ngrok)──► Docker do Mac (Evolution) ──(avisos, internet)──► Vercel
```

## 1. Uma vez só

1. Crie uma conta grátis em ngrok.com.
2. No painel do ngrok: **Domains › New Domain**. Ele dá um endereço fixo, algo como `nome-aleatorio.ngrok-free.app`. Anote.
3. No Terminal, instale o ngrok e conecte com a sua conta. O token fica em **Your Authtoken** no painel; cole só no Terminal, nunca em chat.

   ```bash
   brew install ngrok
   ```

   ```bash
   ngrok config add-authtoken SEU_TOKEN
   ```

4. Na Vercel: **Settings › Environment Variables** (Production), crie:
   - `EVOLUTION_URL` = `https://nome-aleatorio.ngrok-free.app`
   - `EVOLUTION_API_KEY` = a chave do arquivo `docs/evolution-local/.env` (o que vem depois do `=`)

   **Não** crie `CANAIS_WEBHOOK_BASE` na Vercel (ela é só para testes locais).
5. Faça um novo deploy (Deployments › ⋯ › Redeploy) para as variáveis valerem.

## 2. Cada vez que for usar

1. Abra o Docker Desktop e ligue a Evolution:

   ```bash
   docker compose -f docs/evolution-local/docker-compose.yml up -d
   ```

2. Ligue o túnel (deixe a janela aberta):

   ```bash
   ngrok http --url=nome-aleatorio.ngrok-free.app 8080
   ```

3. Evite que o Mac durma enquanto estiver usando (em outra janela do Terminal):

   ```bash
   caffeinate -dims
   ```

## 3. Apontar o canal para o site publicado

No **site publicado**: Canais › seu número › **Reiniciar**. Isso faz a Evolution mandar os avisos
para a Vercel (não precisa ler o QR de novo: é a mesma Evolution).

Para voltar a testar no `localhost:3000`, clique em **Reiniciar** pelo localhost: os avisos voltam para o Mac.
Os dois usam o mesmo banco, então as conversas aparecem nos dois lugares.

## Limites

- Mac desligado, dormindo, Docker fechado ou túnel parado = nenhuma mensagem chega (a Evolution
  costuma recuperar as mensagens do intervalo quando volta).
- O plano grátis do ngrok tem limite mensal de tráfego e de requisições: suficiente para testes, não para clientes.
- A Evolution fica acessível pela internet, protegida pela chave (`EVOLUTION_API_KEY`). Não compartilhe a chave
  nem o endereço do túnel.
