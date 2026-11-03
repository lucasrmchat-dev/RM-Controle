/**
 * Configurações › Documentação: APIs que outros sistemas usam para falar com o RM Controle.
 * Conteúdo puro (sem tela). Mudou uma rota em src/app/api/integracoes? Atualize aqui também.
 * Os erros do Chat vêm direto de src/lib/errosChat.js (sempre iguais ao que o sistema mostra).
 */

export const APIS_EXTERNAS = [
  {
    id: 'suporte',
    titulo: 'Suporte automático',
    resumo:
      'Um chatbot ou outra plataforma abre demandas na Fila de Demandas e procura a empresa do cliente pelo nome.',
    token: {
      onde: 'Configurações › Integrações › Suporte automático (API)',
      aba: 'suporte_automatico',
      passos: [
        'Abra Suporte automático (API) e clique em “Gerar token”.',
        'Copie o token na hora: por segurança ele aparece uma única vez.',
        'Ligue a chave “Ativo” da integração.',
        'Na outra plataforma, envie o token no cabeçalho de cada chamada.',
      ],
      observacao: 'Gerar um token novo desliga o anterior na hora.',
    },
    autenticacao: 'Authorization: Bearer <token>   (ou o cabeçalho x-api-key: <token>)',
    rotas: [
      {
        metodo: 'POST',
        caminho: '/api/integracoes/suporte/empresas/buscar',
        descricao: 'Procura a empresa do cliente pelo nome (aceita nome parecido).',
        corpo: { nome: 'Vargas' },
        resposta: {
          ok: true,
          decisao: 'confirmar',
          empresa: null,
          sugestoes: [{ id: 'uuid-da-empresa', nome: 'Vargas Transportes' }],
        },
        notas: [
          'decisao = "confirmado": a empresa foi encontrada com segurança (vem em "empresa").',
          'decisao = "confirmar": há opções parecidas em "sugestoes"; peça para o cliente escolher.',
          'decisao = "nao_encontrado": nenhuma empresa parecida.',
        ],
      },
      {
        metodo: 'POST',
        caminho: '/api/integracoes/suporte/chamados',
        descricao: 'Abre uma demanda na Fila de Demandas.',
        corpo: {
          empresa_id: 'uuid-da-empresa (ou use empresa_nome)',
          descricao: 'Resumo do que o cliente precisa',
          solicitante_nome: 'Nome do contato',
          origem: 'Chatbot WhatsApp (opcional)',
          id_externo: 'conversa-123 (opcional, para rastreio)',
        },
        resposta: {
          ok: true,
          criado: true,
          duplicado: false,
          chamado_id: 'uuid-da-demanda',
          decisao: 'confirmado',
        },
        notas: [
          '201: demanda criada.',
          '200 com criado = false: a empresa precisa ser confirmada ou não foi encontrada (veja "decisao" e "sugestoes").',
          'Reenvio idêntico em até 2 minutos não duplica: volta duplicado = true com a mesma demanda.',
        ],
      },
    ],
    erros: [
      [
        '400',
        'descricao_obrigatoria / solicitante_obrigatorio / empresa_obrigatoria / nome_invalido',
        'Faltou um campo obrigatório no corpo.',
      ],
      [
        '401',
        'token_ausente / token_invalido',
        'Token não enviado, errado ou já substituído por um novo.',
      ],
      ['403', 'integracao_desativada', 'A chave “Ativo” da integração está desligada.'],
      [
        '404',
        'empresa_nao_encontrada',
        'O empresa_id informado não existe nesta empresa assinante.',
      ],
      [
        '429',
        'limite_excedido',
        'Mais de 120 chamadas por minuto do mesmo endereço; espere um minuto.',
      ],
      [
        '500 / 503',
        'erro_interno / servidor_nao_configurado',
        'Problema do nosso lado; tente de novo e, se continuar, avise o desenvolvimento.',
      ],
    ],
  },
  {
    id: 'comercial',
    titulo: 'Webhook do Comercial (RM Chat)',
    resumo:
      'O RM Chat avisa o RM Controle sobre tickets novos ou alterados, que viram oportunidades na pipeline do Comercial.',
    token: {
      onde: 'Configurações › Comercial › Processos comerciais › Webhooks do RM Chat',
      aba: 'comercial',
      passos: [
        'Em Webhooks do RM Chat, clique em “+ Novo webhook”.',
        'Escolha nome, departamento, pipeline e etapa de entrada.',
        'Clique em “Gerar webhook e token” e copie o endereço e o token (o token aparece uma única vez).',
        'No RM Chat, cole o endereço em “Webhook (novo)” e o token em “Token Autenticação”.',
      ],
      observacao:
        'Cada webhook tem endereço e token próprios. Para trocar o token, edite o webhook e gire o token.',
    },
    autenticacao:
      'Authorization: <token>  (ou Bearer <token>; também aceita os cabeçalhos token, x-webhook-token e x-api-key). Nunca coloque o token no endereço.',
    rotas: [
      {
        metodo: 'POST',
        caminho: '/api/integracoes/comercial/webhook/<id-do-webhook>',
        descricao:
          'Recebe o evento do RM Chat exatamente como ele é enviado (sem transformar o JSON).',
        corpo: {
          event: 'UpdateOnTicket',
          ticket: {
            id: 9902,
            queueId: 2,
            status: 'open',
            lastMessage: 'Quero conhecer o plano azul',
            updatedAt: '2026-10-23T15:00:00.000Z',
            contact: { name: 'Contato Exemplo', number: '559999009900', email: '' },
          },
        },
        resposta: { ok: true, criado: true, lead_id: 'uuid-do-lead', etapa_id: 'qualificacao' },
        notas: [
          'ticket.updatedAt precisa ser o horário real do evento, com fuso. Eventos mais antigos que o último são ignorados.',
          'Grupos são ignorados. Reenvios do mesmo evento não criam outro cartão.',
          'Opcional: envie X-Webhook-Id com um identificador estável do evento.',
        ],
      },
    ],
    erros: [
      [
        '200',
        'ok / ignorado / repetido',
        'Aplicado, repetido ou ignorado (evento antigo ou de grupo); veja os campos da resposta.',
      ],
      [
        '401 / 403',
        'token inválido / integração desativada',
        'Token errado, girado ou webhook pausado.',
      ],
      ['409', 'evento_conflitante', 'O mesmo X-Webhook-Id foi usado com outro conteúdo.'],
      [
        '413 / 422',
        'tamanho / campos inválidos',
        'JSON acima de 256 KB ou campos obrigatórios faltando.',
      ],
      ['429', 'limite', 'Mais de 180 chamadas por minuto do mesmo endereço; espere um minuto.'],
      ['503', 'indisponível', 'Banco ou configuração indisponível; reenvie o mesmo evento depois.'],
    ],
  },
];
