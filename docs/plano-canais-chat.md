# Plano: Canais e Chat (WhatsApp) no RM Controle

Objetivo: substituir o RM Chat com atendimento por WhatsApp dentro do RM Controle, multiempresa desde o
primeiro dia, começando no plano gratuito (Supabase em Oregon) e pronto para a mudança a São Paulo no Pro.

## 1. Arquitetura

```
WhatsApp (QR)  ──► Evolution API (Docker: no Mac nos testes, num servidor depois) ──┐
                                                                                    ├─► /api/canais/webhook/... ─► banco (Supabase) ─► Realtime ─► tela do Chat
WhatsApp (Meta) ─► API oficial (Cloud API da Meta) ─────────────────────────────────┘
tela do Chat ─► /api/chat/... ─► conector do canal ─► Evolution ou Meta ─► cliente
```

**Conector genérico** (`src/lib/server/canais/`): toda a tela e o banco falam com uma interface só;
cada provedor implementa as mesmas funções. Trocar Evolution por Baileys próprio no futuro = escrever um provedor novo.

| Função | Evolution (QR) | Meta (oficial) |
|---|---|---|
| conectar | cria a instância e devolve o QR | confere as credenciais e o número |
| situação | conectado / aguardando QR / desconectado | qualidade, limite de envio, verificação |
| desconectar / reiniciar | logout / restart da instância | — / renova o webhook |
| enviar texto, mídia | sim | só dentro da janela de 24h |
| enviar template | — | sim (fora da janela) |
| listar templates | — | sim, com variáveis |
| ler o aviso (webhook) | transforma no formato padrão | transforma no formato padrão |

## 2. Banco (todas as tabelas com empresa dona + RLS, como o resto do sistema)

- **canais**: nome, tipo (`whatsapp_qr` | `whatsapp_oficial`), provedor, número, situação, departamento padrão,
  credenciais **cifradas** (token da Meta, id do número, id da conta; instância e chave da Evolution), token do webhook (só o hash).
- **contatos**: telefone (único por empresa), nome, foto, etiquetas, empresa cliente ligada (opcional).
- **conversas**: canal, contato, situação (aguardando / em atendimento / resolvida), responsável, departamento,
  etapa do kanban, última mensagem, **última mensagem do cliente** (base da janela de 24h), não lidas.
- **mensagens**: conversa, direção, tipo (texto, imagem, áudio, vídeo, documento, figurinha, localização, template,
  nota interna), conteúdo, arquivo, situação (enviada → entregue → lida / falhou), id externo (evita duplicar),
  resposta a outra mensagem, quem enviou. Índice por conversa e data; arquivamento das antigas mais tarde.
- **respostas_rapidas**: atalho (`/bomdia`), texto com variáveis, alcance (pessoal / departamento / empresa).
- **templates_whatsapp**: cópia dos templates aprovados na Meta, com categoria e variáveis.
- **Mídia**: Supabase Storage, pasta por empresa, link temporário para abrir. No gratuito (1 GB): imagens comprimidas,
  limite por arquivo e mídia baixada só quando alguém abre a conversa.

## 3. Regras da Meta (API oficial)

- **Janela de 24h**: texto livre só até 24h depois da última mensagem do cliente. A tela mostra o tempo restante;
  fechada a janela, o campo de texto vira "escolher template".
- **Templates**: criados e aprovados no Gerenciador do WhatsApp; o sistema lista e preenche as variáveis.
- Assinatura dos avisos (`X-Hub-Signature-256`) conferida com a chave secreta do app de cada canal.
- Limite de envio e qualidade do número aparecem no card do canal (como no RM Chat).

## 4. Segurança e LGPD

- Credenciais cifradas (AES-256-GCM); nunca voltam inteiras para o navegador.
- Avisos (webhooks) só aceitos com assinatura/token válidos; limite de requisições por canal e por IP.
- Endereço da Evolution validado (sem rede interna); toda mídia conferida por tipo e tamanho.
- Mensagens exibidas sempre como texto (nada de HTML do cliente na tela).
- Cada pessoa só vê as conversas permitidas pelo perfil/departamento — conferido no banco.
- Auditoria de quem leu/transferiu/exportou; guarda configurável (ex.: apagar mídia com mais de 12 meses).

## 5. Telas

**Canais** (à direita de Feedbacks): cards por canal com situação ao vivo, número, provedor;
"Adicionar canal" › WhatsApp QR Code | WhatsApp Oficial; QR que se atualiza sozinho; Desconectar; Reiniciar; Editar.

**Chat** (à esquerda da Fila): visual de WhatsApp com papel de parede de desenhos (arte própria), três visualizações:
- **Lista** (padrão): conversas à esquerda, conversa no centro, ficha do contato à direita
- **Cards** e **Kanban** (colunas por situação ou etapas da empresa)
Na conversa: balões, ✓✓ de entregue/lida, separadores de dia, responder mensagem, prévia de mídia, player de áudio,
emojis, respostas rápidas com `/`, anexos, gravar áudio, notas internas, transferir, etiquetas, "abrir demanda".

## 6. Fases

| Fase | Entrega |
|---|---|
| 1 | Tabelas + conector genérico + **Canais** (Evolution e Meta): conectar, QR, situação, desconectar; receber e enviar **texto** |
| 2 | **Chat** em lista: conversas ao vivo, enviar texto, emojis, respostas rápidas, janela de 24h e templates |
| 3 | **Mídia**: receber e enviar imagem, áudio, documento; gravar áudio |
| 4 | Cards e kanban, atribuição e transferência, etiquetas, notas, ligação com Empresas e Fila, notificações |
| 5 | **API pública documentada** (como `/v1/api/external/...` do RM Chat) com chave por empresa |
| 6 | Guarda/LGPD automática e métricas do chat no Dashboard |

## 7. O que depende de você

- Fase 1 (QR): instalar o **Docker Desktop** no Mac e ter um **número de teste** (nunca o principal).
- Fase 1 (oficial): app na Meta com o número, token permanente, chave secreta do app (passo a passo já enviado).
- Antes de clientes reais: servidor 24h para a Evolution, Supabase/Vercel Pro e mudança para São Paulo.
