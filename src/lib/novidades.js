/**
 * Novidades do RM Controle: notas de versão escritas junto com cada melhoria.
 *
 * Cada entrada nasce aqui, no código, e fica "aguardando aprovação" até alguém da área de
 * desenvolvimento publicar em Feedbacks › Desenvolvimento › Novidades. Só então a equipe vê.
 *
 * Para registrar uma melhoria, adicione uma entrada NO TOPO da lista:
 *  - id: único e estável (data + assunto), nunca reutilize
 *  - data: dia da entrega (YYYY-MM-DD)
 *  - titulo: o que mudou, em linguagem de quem usa (sem termos técnicos)
 *  - resumo: uma ou duas frases dizendo por que importa
 *  - itens: o que a pessoa vai notar, um por linha
 *  - modulo: parte do sistema (mesmos nomes de MODULOS_FEEDBACK)
 *  - tickets: feedbacks atendidos (id do feedback ou número do ticket); pode ficar vazio
 */
export const NOVIDADES = [
  {
    id: '2026-10-26-contratos-clientes',
    data: '2026-10-26',
    titulo: 'Contratos dos clientes',
    resumo: 'Cada empresa cliente agora tem uma aba Contrato com o plano, o valor e a vigência do que ela contratou.',
    itens: [
      'Registre plano, valor mensal, dia de vencimento, início e renovação.',
      'Acompanhe a situação: ativo, em negociação, em atraso ou encerrado.',
      'O histórico de contratos fica guardado na ficha da empresa.',
    ],
    modulo: 'Empresas',
    tickets: [],
  },
  {
    id: '2026-10-26-whatsapp-confirmacao-reunioes',
    data: '2026-10-26',
    titulo: 'Confirmação e lembrete de reunião pelo WhatsApp',
    resumo: 'Ao agendar, dá para mandar ao cliente um link para confirmar, remarcar ou cancelar, e um lembrete antes do horário.',
    itens: [
      'Na reunião, informe o WhatsApp do cliente e escolha se ele recebe o pedido de confirmação.',
      'O cliente responde por uma página própria, sem precisar de login, e a resposta aparece na reunião e nas suas notificações.',
      'Lembrete automático 15 min, 30 min, 45 min, 1 hora, 2 horas ou 1 dia antes.',
      'Em Configurações › WhatsApp nas reuniões você escolhe se envia sempre, pergunta a cada vez ou nunca envia.',
    ],
    modulo: 'Agenda',
    tickets: [],
  },
  {
    id: '2026-10-26-descricao-demanda-fixa',
    data: '2026-10-26',
    titulo: 'A descrição da demanda não some mais',
    resumo: 'Algumas demandas perdiam a descrição depois de alguns minutos na fila. Isso foi corrigido, e as descrições afetadas foram recuperadas.',
    itens: [
      'A descrição escrita ao abrir a demanda continua lá depois que a fila atualiza.',
      'Se o sistema tiver problema ao salvar um detalhe da demanda, a descrição e o prazo não se perdem junto.',
    ],
    modulo: 'Fila de Demandas',
    tickets: [],
  },
  {
    id: '2026-10-26-estacao-feedbacks',
    data: '2026-10-26',
    titulo: 'Feedbacks com estação de trabalho e notas de versão',
    resumo: 'Cada ticket abre em tela inteira para a equipe de desenvolvimento, e as melhorias passam a ser anunciadas aqui, com texto revisado.',
    itens: [
      'Ao abrir um feedback, a equipe de desenvolvimento trabalha em tela inteira: relato original, print, etapa, prazo, subtarefas e histórico.',
      'Um botão copia o ticket já organizado para quem vai implementar.',
      'As novidades só aparecem para todos depois de aprovadas pela área de desenvolvimento.',
      'Cada novidade mostra de qual ticket ela veio, e o ticket pode ser aberto para ver como foi escrito.',
    ],
    modulo: 'Feedbacks',
    tickets: [],
  },
  {
    id: '2026-10-26-subtarefas-prazos',
    data: '2026-10-26',
    titulo: 'Subtarefas e prazos nos feedbacks',
    resumo: 'Um ticket em andamento agora mostra o que já foi feito e o que falta, com prazo para cada parte.',
    itens: [
      'Subtarefas com prazo próprio, data de criação e data de conclusão.',
      'Prazo geral para o ticket, com aviso quando estiver perto de vencer ou atrasado.',
      'O pipeline muda de etapa arrastando o card, e os nomes das etapas podem ser alterados em Configurações › Feedbacks.',
    ],
    modulo: 'Feedbacks',
    tickets: [],
  },
  {
    id: '2026-10-26-central-notificacoes',
    data: '2026-10-26',
    titulo: 'Central de notificações',
    resumo: 'Um sino no canto da tela guarda os últimos avisos do sistema para você não perder nada.',
    itens: [
      'Avisos de SLA estourado, prazo de demanda chegando ou vencido, nova demanda para você e reunião chegando.',
      'Aviso quando um feedback seu muda de etapa.',
      'Dá para apagar uma notificação ou limpar todas.',
    ],
    modulo: 'Notificações',
    tickets: [],
  },
  {
    id: '2026-10-26-card-mostra-responsavel',
    data: '2026-10-26',
    titulo: 'O card da fila mostra quem está com a demanda',
    resumo: 'Sem abrir a demanda, dá para ver quem está atendendo e quem pediu.',
    itens: ['O card mostra quem assumiu a demanda, ou que ninguém assumiu ainda.', 'Quando informado, aparece também quem pediu.'],
    modulo: 'Fila de Demandas',
    tickets: ['c26f5d08-5b34-4b77-a5ce-551c0b052f98'],
  },
];

/** Uma novidade está visível para a equipe quando foi publicada (e não ocultada depois). */
export const novidadePublicada = (publicacao, id) => Boolean(publicacao?.[id]?.publicada);

/** Novidades em ordem de entrega (mais recente primeiro). */
export function ordenarNovidades(lista = NOVIDADES) {
  return [...lista].sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

/** Acha o feedback de um ticket citado (pelo id ou pelo número). */
export function feedbackDoTicket(ticket, feedbacks = []) {
  const alvo = String(ticket);
  return feedbacks.find((f) => String(f.id) === alvo || (f.numero != null && String(f.numero) === alvo.replace(/^#/, ''))) || null;
}

/** Novidades que citam um feedback. */
export function novidadesDoFeedback(fb, lista = NOVIDADES) {
  if (!fb) return [];
  return lista.filter((n) => (n.tickets || []).some((t) => String(t) === String(fb.id) || (fb.numero != null && String(t).replace(/^#/, '') === String(fb.numero))));
}

/** Rótulo do ticket: número sequencial quando existir, senão o começo do id. */
export const rotuloTicket = (fb) => (fb?.numero != null ? `#${fb.numero}` : `#${String(fb?.id || '').slice(0, 4).toUpperCase()}`);
