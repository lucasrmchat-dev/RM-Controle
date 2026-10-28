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
    id: '2026-10-28-avisos-na-tela',
    data: '2026-10-28',
    titulo: 'Avisos na tela: mensagens do WhatsApp, demandas e reuniões onde você estiver',
    resumo: 'Quando chega uma mensagem, demanda ou reunião, um aviso aparece na tela em qualquer aba, no estilo que você escolher, e a tela pode piscar em volta.',
    itens: [
      'Cinco estilos: na ilha do cabeçalho (a pílula cresce), abaixo do sino, no canto inferior, numa faixa discreta no rodapé ou numa aba fina na borda direita. Ou só no sino.',
      'Escolha do que ser avisado (Chat, Fila de Demandas, Agenda, Outros), por quanto tempo o aviso fica (4 a 20 segundos ou até fechar) e quantos aparecem juntos (1, 2 ou 3, com “+N no sino”).',
      'Piscar a tela: um brilho nas bordas, sem cobrir o que você está fazendo, com cor à escolha e repetição (uma vez, três vezes ou até você mexer no computador).',
      'Tudo em Configurações › Aparência › Avisos na tela, com botões para testar na hora.',
      'Ao abrir o sistema, o que já estava pendente fica só no sino; os avisos aparecem para o que chega enquanto você trabalha.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-28-novos-toques',
    data: '2026-10-28',
    titulo: 'Seis toques novos, organizados por intensidade',
    resumo: 'Os toques de notificação agora vêm em três grupos (Tranquilos, Médios e Intensos), com seis opções novas.',
    itens: [
      'Tranquilos: Gota e Brisa (novos), além do Sino suave.',
      'Médios: Pop e Xilofone (novos), além de Mensagem, Harmônico e Chime de agenda.',
      'Intensos: Sirene e Alarme (novos), além de Alerta dinâmico e Urgente.',
      'Escolha em Configurações › Alertas Sonoros, para o Chat, a Fila de Demandas e as Reuniões; ao clicar, você já ouve.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-28-atualizacao-seguranca-next',
    data: '2026-10-28',
    titulo: 'Atualização de segurança da plataforma',
    resumo: 'A base do sistema (Next.js) foi atualizada para a versão com todas as correções de segurança conhecidas.',
    itens: [
      'Corrige falhas publicadas no Next.js, incluindo as de execução remota de código e de desvio de proteção de rotas.',
      'Nada muda no uso do sistema.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-28-sla-prazo-avisos-proprietario',
    data: '2026-10-28',
    titulo: 'SLA pelo prazo, avisos sem enxurrada e proprietário na equipe',
    resumo: 'Demandas com prazo mostram quanto falta (e não há quanto tempo começaram), os avisos de tempo estourado vão para o sino sem encher a tela, e o dono do sistema pode aparecer na equipe.',
    itens: [
      'Demanda com prazo: o cartão mostra “para o prazo” com o tempo que falta, fica laranja na última hora e vermelho quando vence.',
      'Demanda com prazo no futuro não dispara mais o alerta de tempo decorrido; o aviso é o do prazo chegando.',
      'Ao entrar no sistema, os alertas de “passou do tempo” não aparecem mais um por um na tela: ficam no sino, um por demanda, sem repetir.',
      'Com a tela aberta, o alerta novo aparece num aviso só (ex.: “3 demandas da equipe passaram do tempo limite”).',
      'Em Servidores e equipe, o proprietário do sistema pode “Aparecer como membro” da empresa, com selo Proprietário; o acesso total continua travado e o login não muda.',
    ],
    modulo: 'Fila de Demandas',
    tickets: [],
  },
  {
    id: '2026-10-28-historico-atendimentos',
    data: '2026-10-28',
    titulo: 'Histórico dos atendimentos anteriores na conversa',
    resumo: 'Quando o cliente volta a escrever depois de uma conversa resolvida, dá para ver as conversas (tickets) anteriores dele dentro da conversa nova.',
    itens: [
      'No topo da conversa, o botão “Ver atendimento anterior” traz as mensagens do atendimento passado, com a data, o canal e quem atendeu.',
      'Clique de novo para ir voltando aos atendimentos mais antigos; uma linha marca onde começa o atendimento atual.',
      'Cada pessoa só vê os atendimentos que já poderia ver (departamento e canais).',
      'Administradores ligam ou desligam em Configurações › Chat e grupos › Conversas (vem ligado).',
    ],
    modulo: 'Chat',
    tickets: ['#23', '224b35a4-8573-46a3-9608-f3d5a37c1ddd'],
  },
  {
    id: '2026-10-28-gravador-celular-assinatura',
    data: '2026-10-28',
    titulo: 'Gravador nos feedbacks, celular sem zoom automático e assinatura obrigatória',
    resumo: 'Grave a tela ou a sua voz ao enviar um feedback, use o sistema no celular sem a tela “puxar” e, se quiser, torne obrigatória a assinatura nas mensagens do Chat.',
    itens: [
      'Ao enviar um feedback, use “Gravar a tela” (com o microfone, para explicar) ou “Gravar áudio”; até 5 minutos e 3 gravações.',
      'As gravações aparecem no detalhe do feedback, prontas para assistir.',
      'No celular, tocar num campo não dá mais zoom na tela, e o botão de enviar feedback não sai da tela.',
      'Em Configurações › Chat e grupos › Conversas, ligue “Assinatura obrigatória”: toda mensagem para o cliente leva o nome de quem enviou, sem como desligar.',
    ],
    modulo: 'Geral',
    tickets: ['#22', '066e10d9-c24a-4e4e-b277-6cdddd2fd3fb'],
  },
  {
    id: '2026-10-27-chat-busca-unica-arrastar',
    data: '2026-10-27',
    titulo: 'Busca única no Chat e arrastar conversas no Kanban',
    resumo: 'Uma busca só encontra conversas (nome, número ou última mensagem) e, logo abaixo, as mensagens, como no WhatsApp. No Kanban, arraste a conversa para mudar de etapa.',
    itens: [
      'Digite no campo de busca: primeiro aparecem as Conversas, depois as Mensagens (com o período escolhido).',
      'Kanban: arraste de Pendentes para Ativos para assumir, de Ativos para Pendentes para devolver à fila, para Resolvidas para resolver, e de Resolvidas de volta para reabrir.',
      'Devolver à fila fica registrado na linha do tempo da conversa.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-notificacoes-e-kanban-chat',
    data: '2026-10-27',
    titulo: 'Notificações marcadas uma a uma e Chat abrindo na aba certa',
    resumo: 'Cada notificação pode ser marcada como lida sem abrir, e abrir um aviso do Chat leva à aba e à coluna onde a conversa está.',
    itens: [
      'Passe o mouse numa notificação: ✓ marca como lida, × apaga. Fechar o painel não marca mais tudo como lido.',
      'Abrir um aviso do Chat leva para Pendentes, Ativos, Grupos ou Resolvidas, conforme onde a conversa está.',
      'No Kanban do Chat, a coluna da conversa aberta vem para a vista: Pendentes no centro, Ativos à esquerda, Resolvidas à direita.',
      'Em telas menores, o Kanban do Chat desliza coluna por coluna.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-canais-inativos-historico',
    data: '2026-10-27',
    titulo: 'Canais ativos e inativos, histórico e mescla que limpa o canal antigo',
    resumo: 'Canais desativados ficam numa aba própria, cada canal tem um histórico do que foi feito e, ao mesclar, o canal antigo sai da lista.',
    itens: [
      'Em Canais, use as abas Ativos e Inativos; desativar leva o canal para Inativos, de onde ele pode ser mesclado ao canal novo do mesmo número.',
      'Ao mesclar, as conversas passam para o canal novo, o canal antigo é removido e a mescla fica registrada no histórico do canal novo.',
      'Botão Histórico em cada canal: quem criou, editou, conectou, desconectou, reiniciou, ativou, desativou ou mesclou, e quando.',
      'Canais inativos há mais de 30, 60 ou 90 dias (você escolhe, ou nunca) saem da lista: sem conversas são excluídos; com conversas, as conversas continuam guardadas.',
    ],
    modulo: 'Canais',
    tickets: [],
  },
  {
    id: '2026-10-27-cores-e-kanban',
    data: '2026-10-27',
    titulo: 'Cores do sistema e Kanban da Fila por estado',
    resumo: 'Escolha a cor do RM Controle (WhatsApp, Verde RM, Azul, Roxo, Rosa, Laranja ou Grafite) e veja a Fila de Demandas em Kanban por estado.',
    itens: [
      'Em Configurações › Aparência, escolha a cor do sistema; ela muda o destaque e os fundos no claro e no escuro, na hora.',
      'A nova cor padrão é a do Chat (verde-azulado do WhatsApp), aplicada em todas as telas.',
      'Kanban da Fila com três colunas: Aguardando atendente, Em atendimento e Aguardando cliente.',
      'Arraste o cartão para Em atendimento para assumir ou retomar, e para Aguardando cliente para pôr à espera do retorno.',
      'Para ver só as de alguém, use o filtro de técnicos.',
      'Kanban também pode ser a visualização padrão do sistema (Configurações › Aparência).',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-27-cabecalho-capsula',
    data: '2026-10-27',
    titulo: 'Cabeçalho mais limpo, telas sem títulos repetidos e notificações organizadas',
    resumo: 'O cabeçalho mostra direto as abas (Chat, Fila de Demandas, Dashboard) e, ao passar o mouse, a cápsula se abre com as outras opções. As telas ficaram mais enxutas e as notificações, mais fáceis de ler.',
    itens: [
      'Passe o mouse em Chat para ver Canais, em Fila de Demandas para ver Agenda e em Dashboard para ver Daily e Comercial.',
      'A lista que abre ao passar o mouse não some mais no caminho até a opção, e mostra sempre o nome de cada aba.',
      'Feedbacks agora fica no menu da sua conta, entre Configurações gerais e Sair.',
      'As telas não repetem mais o nome e a explicação: o nome já está no cabeçalho.',
      'Na Fila, Ver empresas, Suporte retroativo e Nova demanda ficam sempre no mesmo lugar, sem animação ao rolar.',
      'Notificações: filtros por Chat, Demandas e Agenda, um aviso só por conversa, e abrir a conversa tira os avisos dela.',
      'Novidades do sistema chegam num aviso só (ex.: “3 novidades no RM Controle”), e o painel de notificações tem fundo sólido e filtros inteiros.',
      'Clicar num aviso do Chat abre a conversa certa.',
      'O som passa a funcionar desde o primeiro clique na página, e dá para ligar o aviso de mensagens de grupos.',
      'Alertas sonoros: Chat, Fila de Demandas e Reuniões com as mesmas opções, cada um com a sua configuração.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-27-daily',
    data: '2026-10-27',
    titulo: 'Daily: resumo das reuniões e metas da semana',
    resumo: 'Nova tela Daily, em Gestão, para registrar as reuniões diárias da equipe e acompanhar as metas da semana.',
    itens: [
      'Crie quantas dailies quiser por dia e escreva o resumo durante ou depois da reunião; tudo salva sozinho.',
      'Cada daily tem um espaço para as atualizações da ClickMassa e a lista de quem participou.',
      'Metas da semana com responsável, marcação de concluída e barra de progresso.',
      'Navegue pelas semanas anteriores para rever o que foi combinado.',
    ],
    modulo: 'Geral',
    tickets: ['#21', '87ed950f-35bf-4d0d-aa4a-c7182c401449'],
  },
  {
    id: '2026-10-27-cabecalho-categorias',
    data: '2026-10-27',
    titulo: 'Cabeçalho organizado por categorias, sempre no mesmo lugar',
    resumo: 'As abas agora ficam em Atendimento, Demandas, Agenda e Gestão, e o cabeçalho fica sempre no topo, no centro, dentro da linha de título de cada tela.',
    itens: [
      'Clique numa categoria para abrir a primeira aba dela (Atendimento abre o Chat); passe o mouse para ver as outras.',
      'O cabeçalho não se move: mesma posição em todas as telas e ao rolar; cada tela deixa o meio da linha de título livre para ele.',
      'Na Fila, ao rolar, Empresas, Retroativo e Nova demanda aparecem ao lado do cabeçalho, sem tirá-lo do lugar.',
      'Não existe mais recolher ou expandir, e o Chat ocupa exatamente a altura da tela.',
      'No celular, o dock mostra as categorias e abre a lista de abas de cada uma.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-27-modulos-por-empresa',
    data: '2026-10-27',
    titulo: 'Módulos contratados por empresa',
    resumo: 'Ao provisionar uma empresa em Configurações › Plataforma, escolha quais módulos ela contratou.',
    itens: [
      'Só os módulos marcados aparecem para a empresa, inclusive para os administradores dela.',
      'Os perfis de acesso continuam escolhendo, dentro desses módulos, o que cada pessoa vê.',
      'O servidor também recusa o uso de módulos fora do plano.',
    ],
    modulo: 'Geral',
    tickets: [],
  },
  {
    id: '2026-10-27-chat-ajustes',
    data: '2026-10-27',
    titulo: 'Chat mais estável ao enviar e ao abrir conversas',
    resumo: 'Mensagens enviadas não aparecem mais duplicadas por um instante, e a conversa abre com as mensagens perto do campo de digitar.',
    itens: [
      'O balão provisório (com o reloginho) some assim que a mensagem gravada aparece, nunca os dois juntos.',
      'Poucas mensagens ficam embaixo, como no WhatsApp.',
      'O campo de digitar abre com uma linha só, sem ficar enorme até clicar.',
      'Mesclar canais aceita o canal antigo desativado, e a conexão antiga é desligada na mescla.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-mesclar-canais',
    data: '2026-10-27',
    titulo: 'Mesclar canais e filtrar o Chat por departamento',
    resumo: 'Refez a conexão de um número? Agora dá para trazer o histórico do canal antigo para o novo, e o Chat filtra por departamento e por canal.',
    itens: [
      'Em Canais, o botão Mesclar aparece quando há outro canal do mesmo número: as conversas antigas passam para o canal novo, sem perder mensagens.',
      'Se o mesmo cliente tinha conversa aberta nos dois, vira uma conversa só, com todo o histórico.',
      'O canal antigo fica desativado e vazio, pronto para ser excluído.',
      'Em Chat › Filtros avançados, escolha um departamento (ou "Sem departamento") e um canal.',
    ],
    modulo: 'Canais',
    tickets: [],
  },
  {
    id: '2026-10-27-som-por-modulo',
    data: '2026-10-27',
    titulo: 'Som próprio para Chat, Fila e Reuniões',
    resumo: 'Cada módulo agora tem seu próprio toque, repetição e liga/desliga, e o Chat avisa mesmo com a conversa aberta na tela.',
    itens: [
      'Em Configurações › Alertas Sonoros, escolha o toque e a repetição do Chat e das Reuniões; a Fila de Demandas segue com a configuração completa.',
      'Mensagem nova na conversa aberta também toca: dá para estar longe do computador e ainda ser avisado.',
      'A repetição do Chat para sozinha quando tudo foi lido; a das reuniões, quando você mexe no computador.',
      'Dois toques novos: Mensagem e Chime de Agenda.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-grupos-por-canal',
    data: '2026-10-27',
    titulo: 'Grupos sem duplicar e canais por pessoa',
    resumo: 'Quando o mesmo grupo está em dois números da empresa, você escolhe por qual número ele chega, e fica mais claro quais canais cada pessoa atende.',
    itens: [
      'Em Canais › Editar, marque "Não receber grupos deste número" e o grupo aparece uma vez só no Chat.',
      'O histórico dos grupos desse número fica guardado e volta se você desmarcar.',
      'Em Servidores e equipe › editar membro, escolha os canais que a pessoa atende (aparece quando ela tem o módulo Chat).',
    ],
    modulo: 'Chat',
    tickets: [],
  },
  {
    id: '2026-10-27-chat-ao-vivo',
    data: '2026-10-27',
    titulo: 'Mensagens do WhatsApp chegam na hora',
    resumo: 'A tela do Chat agora atualiza no instante em que o cliente escreve, sem esperar a atualização automática.',
    itens: [
      'Mensagens recebidas aparecem na conversa e na lista em cerca de um segundo.',
      'O som e o contador do cabeçalho também avisam na hora, mesmo fora da tela do Chat.',
      'Envios, transferências e ações da equipe aparecem na hora para os colegas.',
    ],
    modulo: 'Chat',
    tickets: [],
  },
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
