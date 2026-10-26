# Webhooks de entrada — Comercial / RM Chat

1. Aplique `supabase/migration_comercial_webhooks.sql` no SQL Editor do Supabase.
2. Em Configurações avançadas → Comercial e pipelines, salve seus departamentos e pipelines. Crie uma etapa “Qualificação” se desejar esse nome.
3. Em Webhooks do RM Chat, clique em “Novo webhook”, informe um nome, o departamento, a pipeline e a etapa de entrada. Não é necessário informar tenantId.
4. Clique em “Gerar webhook e token”. Copie o endereço e o token mostrado uma única vez. O endereço publicado precisa ser acessível ao RM Chat; localhost é apenas para testes locais.
5. No RM Chat, cole o endereço gerado no campo **Webhook (novo)** e o token gerado no campo **Token Autenticação**. Envie o JSON original do evento, sem transformação. Os campos **URL** e **Token** da API do RM Chat servem para chamadas à API dele; não são os dados de destino do webhook da RM Controle. O receptor aceita Authorization direto ou Bearer, além dos cabeçalhos token, x-webhook-token e x-api-key. Não coloque o token na URL.

## Exemplo mínimo (dados de exemplo)

```json
{
  "event": "UpdateOnTicket",
  "ticket": {
    "id": 9902,
    "queueId": 2,
    "status": "open",
    "lastMessage": "Quero conhecer o plano azul",
    "updatedAt": "2026-10-23T15:00:00.000Z",
    "contact": { "name": "Contato Exemplo", "number": "559999009900", "email": "" }
  }
}
```

`ticket.updatedAt` deve ser o horário real do evento, incluindo fuso. Eventos anteriores ou com o mesmo horário do último evento aplicado são reconhecidos e ignorados. Grupos são ignorados. A URL e o token identificam a integração. `tenantId` não é exigido na configuração nem no payload; se estiver no JSON do RM Chat, é usado automaticamente apenas para distinguir a origem dos tickets. Sem ele, o próprio `ticket.id` identifica o lead dentro da integração. Reenvios não criam outro cartão.

## Regras e múltiplos termos

Cada condição possui uma variável (caminho no JSON), comparação e lista de termos, um por linha:

- **É igual a / qualquer termo**: texto inteiro igual a qualquer palavra ou frase cadastrada.
- **Contém / qualquer termo (OU)**: basta conter um dos termos.
- **Contém / todos os termos (E)**: deve conter todos, em qualquer ordem.

É possível acrescentar várias condições e exigir **todas (E)** ou **qualquer uma (OU)**. A primeira regra correspondente, de cima para baixo, determina a etapa. Maiúsculas, acentos e espaços repetidos são normalizados. “Contém” compara trechos, portanto “azul” também corresponde a “azulejo”.

Exemplo: `ticket.lastMessage` contém qualquer um de `azul`, `plano azul`, `quero uma demonstração` **E** `ticket.queueId` é igual a `2` ou `5` → etapa Proposta.

Outras variáveis: `ticket.status`, `ticket.userId`, `ticket.closingReasonId`, `ticket.contact.leadStatusId`, `ticket.channel`, `event`, `ticket.contact.customFields.interesse`. Use campos escalares (texto, número ou booleano); para arrays, um caminho como `ticket.contact.tags.0.name` identifica um item.

Sem correspondência: novo lead entra na etapa inicial; lead existente mantém a etapa e a pipeline. Um ticket fechado não significa Ganho ou Perda automaticamente: configure a regra desejada.

## Idempotência e respostas

O hash do JSON com chaves ordenadas identifica reenvios. Se o emissor fornecer um identificador estável, envie `X-Webhook-Id`; o mesmo identificador com conteúdo diferente retorna 409.

- 200: aplicado, repetido ou ignorado por ser antigo/grupo (consulte os campos JSON da resposta).
- 401/403: token inválido, revogado, ausente ou integração pausada.
- 409: identificador de evento reutilizado com outro conteúdo.
- 413/422: payload acima de 256 KB ou campos obrigatórios inválidos.
- 429: limite de chamadas; aguarde um minuto.
- 503: banco/configuração indisponível; repita com o mesmo evento após corrigir.

O recibo e a movimentação são transacionais: em falha, ambos são revertidos para permitir nova tentativa. O token é armazenado apenas como hash. Mensagens, fotos e campos pessoais extras (como CPF) não são gravados: servem apenas à comparação em memória. O histórico registra evento, ticket e etapas, sem o payload original.

Os leads aparecem na pipeline separadamente das reuniões e não aumentam contagens de reuniões. Leads em aberto permanecem visíveis; o filtro de mês inclui os leads encerrados atualizados naquele mês. É possível definir um responsável e mover o cartão manualmente. Eventos antigos não desfazem uma movimentação manual posterior. A tela consulta novidades a cada 30 segundos enquanto está visível.
