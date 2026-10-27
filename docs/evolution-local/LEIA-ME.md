# Evolution API no seu Mac (testes do WhatsApp por QR Code)

Use um **número de teste**, nunca o principal: conexões não oficiais podem ser bloqueadas pelo WhatsApp.

## 1. Uma vez só

1. Instale o **Docker Desktop** (docker.com › Download for Mac › Apple Silicon) e abra o app.
2. No Terminal, dentro do projeto, crie a chave da Evolution (fica só no seu Mac):

   ```bash
   echo "EVOLUTION_API_KEY=$(openssl rand -hex 24)" > docs/evolution-local/.env
   ```

3. No arquivo `.env.local` do projeto, acrescente a linha abaixo. É por ela que a Evolution, dentro do Docker, avisa o RM Controle das mensagens:

   ```
   CANAIS_WEBHOOK_BASE=http://host.docker.internal:3000
   ```

   Depois reinicie o `npm run dev`.

## 2. Ligar e desligar

```bash
docker compose -f docs/evolution-local/docker-compose.yml up -d
```

```bash
docker compose -f docs/evolution-local/docker-compose.yml down
```

Para ver a chave quando for cadastrar o canal: `cat docs/evolution-local/.env` (copie só o que vem depois do `=`).

## 3. Conectar no RM Controle

Canais › Adicionar canal › WhatsApp QR Code › endereço `http://localhost:8080` e a chave acima › Salvar › **Conectar** › leia o QR com o celular de teste
(WhatsApp › Aparelhos conectados › Conectar um aparelho). Depois, **Testar envio** para o seu próprio número.

## Quando for para produção

A Evolution precisa ficar num servidor ligado 24h, com https (ex.: `https://whatsapp.suaempresa.com.br`).
Em produção o sistema só aceita endereço https público; `localhost` funciona apenas nos testes.
