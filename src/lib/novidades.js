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
  {
    id: '2026-10-26-canais-whatsapp',
    data: '2026-10-26',
    titulo: 'Nova aba Canais: números de WhatsApp conectados ao sistema',
    resumo: 'Administradores conectam números de WhatsApp ao RM Controle, pelo QR Code ou pela API oficial da Meta, e acompanham a situação de cada um.',
    itens: [
      'Conexão por QR Code (Evolution API) com o código que se renova sozinho até o celular ler.',
      'Conexão pela API oficial da Meta, com qualidade do número e limite de envio no card.',
      'Situação ao vivo, envio de teste, reiniciar, desconectar, desativar e excluir.',
      'Senhas e tokens ficam cifrados no servidor e não voltam para a tela.',
      'Cada número pode encaminhar as conversas novas para um departamento.',
    ],
    modulo: 'Canais',
    tickets: [],
  },
  {
    id: '2026-10-26-chat-whatsapp',
    data: '2026-10-26',
    titulo: 'Nova aba Chat: atendimento pelo WhatsApp dentro do RM Controle',
    resumo: 'As conversas dos números conectados em Canais chegam na hora, com o visual do WhatsApp, e a equipe responde sem sair do sistema.',
    itens: [
      'Fila, Minhas, Todas e Resolvidas, com busca por nome, número ou mensagem.',
      'Responder assume a conversa; também dá para assumir, transferir para um departamento ou pessoa e resolver.',
      'Respostas rápidas com / e variáveis como {primeiro_nome}, emojis e formatação do WhatsApp.',
      'Notas internas que o cliente não vê, e registro de quem assumiu, transferiu ou resolveu.',
      'Pela API oficial, o contador da janela de 24 horas aparece no topo da conversa.',
      'Cada pessoa vê só as conversas do seu departamento e as que estão com ela; a regra é conferida no servidor.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-26-chat-midia-grupos',
    data: '2026-10-26',
    titulo: 'Chat com áudio, fotos, documentos, grupos e perfil do contato',
    resumo: 'O Chat agora recebe e envia arquivos, grava áudio, mostra grupos do WhatsApp e assina as mensagens com o nome de quem atende.',
    itens: [
      'Gravar e ouvir áudios (com velocidade 1,5× e 2×), enviar fotos, vídeos e documentos pelo clipe ou colando com Ctrl+V.',
      'Fotos, áudios e documentos recebidos aparecem na conversa; a foto amplia com um clique.',
      'Assinatura: o cliente recebe o nome de quem atende em negrito no início da mensagem; dá para desligar no campo de mensagem.',
      'Grupos do WhatsApp: desligados, numa aba própria ou como conversa normal (Configurações avançadas › Chat do WhatsApp).',
      'Perfil do contato ao clicar no nome: foto, nome editável, empresa cliente ligada, etiquetas, observações e conversas anteriores.',
      'O mesmo celular com e sem o 9º dígito agora cai sempre no mesmo contato.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-26-reacoes-cabecalho-recolhivel',
    data: '2026-10-26',
    titulo: 'Reações no lugar certo, canais editáveis e cabeçalho que recolhe',
    resumo: 'Reações aparecem presas à mensagem, o topo da conversa mostra canal e departamento, e o cabeçalho pode ser recolhido para usar a tela toda.',
    itens: [
      'Reações (❤️, 👍...) aparecem embaixo da mensagem reagida, como no WhatsApp, e figurinhas aparecem sem balão.',
      'O topo da conversa mostra o canal (número) e o departamento.',
      'Em Canais, o botão Editar muda o nome e o departamento padrão de cada número.',
      'As notificações ficam no cabeçalho, ao lado da sua conta.',
      'O botão ao lado das notificações recolhe o cabeçalho: ele some e volta, só com os ícones das abas, ao passar o mouse no topo da tela.',
      'Recolhido, o topo da tela continua mostrando os avisos (Fila, Agenda, Chat e notificações); um clique ali expande o cabeçalho.',
      'A aba Chat mostra quantas conversas têm mensagens novas.',
      'Cada conversa mostra as etiquetas de canal, colaborador e departamento na lista.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-26-acoes-mensagens-chat',
    data: '2026-10-26',
    titulo: 'Ações em cada mensagem do Chat, como no WhatsApp',
    resumo: 'Passe o mouse numa mensagem para reagir, responder, copiar, editar, apagar, favoritar, fixar ou ver os dados dela.',
    itens: [
      'Reagir com emoji (o cliente vê a reação no WhatsApp) e responder citando a mensagem.',
      'Editar mensagens de texto até 15 minutos depois do envio e apagar para todos até 2 dias depois (números por QR Code).',
      'Apagar só para você, favoritar (cada pessoa tem as suas) e fixar até 3 mensagens no topo da conversa.',
      'Dados da mensagem: quem enviou, horário, situação e o texto original quando foi editada.',
      'Edições e mensagens apagadas pelo cliente também aparecem na conversa.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-26-chat-auditoria-excluir',
    data: '2026-10-26',
    titulo: 'Auditoria das conversas, exclusão e fotos automáticas no Chat',
    resumo: 'Administradores veem quem abriu, assumiu, transferiu e fechou cada conversa, e podem excluir uma conversa inteira.',
    itens: [
      'No perfil do contato (clique no nome no topo da conversa), a Auditoria mostra quem iniciou, abriu (mesmo sem responder), assumiu, transferiu, resolveu, editou ou apagou mensagens.',
      'Excluir conversa apaga as mensagens e os arquivos dela; o registro da exclusão fica na auditoria.',
      'As fotos dos contatos carregam sozinhas na lista, sem precisar abrir o perfil.',
      'O topo da conversa ficou mais limpo: canal, colaborador e departamento ficam nas etiquetas da lista.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-cabecalho-configuracoes',
    data: '2026-10-27',
    titulo: 'Cabeçalho redesenhado e Configurações organizadas por assunto',
    resumo: 'Ícones novos no cabeçalho, que agora se mantém em telas menores, e Configurações com menu por categorias.',
    itens: [
      'Ícones redesenhados e nome de cada botão ao passar o mouse, incluindo notificações e recolher.',
      'Em telas médias, o cabeçalho continua o mesmo, só com os ícones, em vez de virar a versão de celular.',
      'Configurações com menu por categorias: Geral, Atendimento, WhatsApp, Agenda e Comercial, Equipe e acesso, Integrações, Plataforma e Segurança.',
      'A Plataforma (empresas assinantes e revendas) saiu do cabeçalho e fica em Configurações.',
      'A lista de emojis das reações agora rola sem fechar.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-27-chat-pendentes-mencoes-busca',
    data: '2026-10-27',
    titulo: 'Chat: Pendentes e Ativos, menções nos grupos, busca de mensagens e contatos',
    resumo: 'O Chat ficou organizado como o RM Chat: Pendentes, Ativos, Grupos e Resolvidas, com filtros, busca em todas as mensagens e lista de contatos.',
    itens: [
      'Pendentes (clientes sem atendente), Ativos, Grupos e Resolvidas; só quem assumiu a conversa pode responder.',
      'Filtros avançados: ordem, ver as conversas de toda a equipe (administradores), só não respondidas e só não lidas, com opção de manter.',
      'Buscar em todas as mensagens escolhendo o período (7, 30, 90 dias ou 1 ano).',
      'Nos grupos, as menções aparecem com o nome da pessoa e o @ lista os participantes; na nota interna, o @ lista a equipe e as pessoas da empresa do cliente.',
      'Lista de contatos, com quem fala nos grupos salvo pelo número de verdade.',
      'Os dados do grupo mostram todos os participantes, com nome (quando o WhatsApp informa) e número.',
      'Conversa nova na fila e mensagem nova nas suas conversas tocam o som de alerta e aparecem nas notificações, só para quem pode ver a conversa.',
      'Sistema mais rápido: servidor na mesma região do banco, memória curta de permissões e índices para buscas.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-chat-kanban-mencoes',
    data: '2026-10-27',
    titulo: 'Chat em Kanban e menções de verdade nos grupos',
    resumo: 'O Chat ganhou a visão Kanban, abre em Ativos, e as menções nos grupos funcionam como no celular.',
    itens: [
      'Visão Kanban com uma coluna por fila (Ativos, Pendentes, Grupos e Resolvidas); ao abrir uma conversa, o quadro vai para o lado e "Recolher conversa" volta ao quadro.',
      'As filas aparecem na ordem Ativos, Pendentes, Grupos e Resolvidas, abrindo em Ativos.',
      'Mencionar alguém num grupo marca a pessoa de verdade no WhatsApp, com o nome dela.',
      'Menções recebidas de quem ainda não escreveu mostram o nome ou o número, nunca o código interno do WhatsApp.',
      'Quem participa dos grupos (com nome e número conhecidos) aparece na lista de contatos.',
      'As fotos dos contatos carregam numa chamada só para a tela toda, mais rápido e sem travar.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-chat-acesso-contatos-nova-conversa',
    data: '2026-10-27',
    titulo: 'Chat: acesso por pessoa, @todos, contatos editáveis e criar atendimento',
    resumo: 'Cada pessoa pode ter canais liberados e a opção de ver as conversas dos colegas; o Chat ganhou @todos, contatos editáveis e um novo criar atendimento.',
    itens: [
      'Em Servidores e equipe › editar usuário: "Visualizar tickets de outros usuários dos seus departamentos" e "Fluxo de controle de canais", com os canais liberados à pessoa.',
      '@todos menciona todos os participantes do grupo; na nota interna, chama a equipe toda.',
      'Contatos: criar contato novo, editar o nome e começar a conversa direto da lista.',
      'Criar atendimento: escolha o canal, o departamento e o contato (pela busca ou pelo número com código do país); a busca do contato é instantânea.',
      'Abrir conversa sem mensagem: abre o atendimento sem mandar nada ao cliente.',
      'Kanban com colunas ocupando a tela toda, faixa de cor e contador por fila.',
    ],
    modulo: 'Chat',
    tickets: [],
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
