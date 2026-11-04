/**
 * Erros de envio do Chat: o texto técnico que o servidor grava em mensagens.erro vira um código,
 * uma explicação simples para quem atende e uma pista para a área de desenvolvimento.
 * Regras puras (navegador e testes). A ordem importa: a primeira regra que reconhece o texto vale.
 * Erro novo: acrescente uma entrada com código ainda não usado (nunca reaproveite um código).
 */

export const ERROS_CHAT = [
  {
    codigo: 'CHAT-101',
    reconhece: /respondeu 404|ERR_NGROK|endpoint .*offline|tunnel .*not found/i,
    titulo: 'Servidor do WhatsApp fora do ar',
    explicacao: 'O sistema não conseguiu alcançar o servidor que envia as mensagens do WhatsApp.',
    oQueFazer: 'Tente de novo em alguns minutos. Se continuar, avise o desenvolvimento.',
    paraDev:
      'Evolution/ngrok devolveu 404: túnel do ngrok fora do ar, EVOLUTION_URL errada ou instância do canal inexistente na Evolution. Teste a URL pública do túnel e localhost:8080.',
  },
  {
    codigo: 'CHAT-102',
    reconhece: /não respondeu em|AbortError|timed? ?out/i,
    titulo: 'O WhatsApp demorou demais para responder',
    explicacao:
      'O envio foi feito, mas o servidor do WhatsApp não respondeu a tempo. A mensagem pode não ter chegado.',
    oQueFazer: 'Confira no celular se a mensagem chegou antes de mandar de novo.',
    paraDev:
      'Tempo esgotado na chamada à Evolution/Meta (15 s). Servidor lento ou travado; ver Docker da Evolution e a latência do túnel.',
  },
  {
    codigo: 'CHAT-103',
    reconhece:
      /Não foi possível falar com a Evolution|fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET/i,
    titulo: 'Sem conexão com o servidor do WhatsApp',
    explicacao: 'O servidor do WhatsApp está desligado ou o endereço dele mudou.',
    oQueFazer: 'Avise o desenvolvimento. Enquanto isso, responda pelo celular.',
    paraDev:
      'Falha de rede até a Evolution (conexão recusada ou endereço não encontrado). Ver se o Docker da Evolution está de pé e se EVOLUTION_URL aponta para o túnel certo.',
  },
  {
    codigo: 'CHAT-104',
    reconhece: /respondeu 40[13]\b/i,
    titulo: 'Acesso do canal recusado',
    explicacao: 'O servidor do WhatsApp recusou o acesso deste número.',
    oQueFazer:
      'Avise o administrador ou o desenvolvimento: a configuração do canal precisa ser revisada.',
    paraDev:
      'HTTP 401/403: EVOLUTION_API_KEY ou token da Meta inválido/expirado, ou instância sem permissão.',
  },
  {
    codigo: 'CHAT-105',
    reconhece: /connection closed|not connected|desconectad|instance .*(close|logout)/i,
    titulo: 'Número do WhatsApp desconectado',
    explicacao:
      'O número deste canal saiu do WhatsApp (por exemplo, o celular desconectou o aparelho).',
    oQueFazer: 'Peça ao administrador para reconectar o número em Canais, lendo o QR Code de novo.',
    paraDev:
      'Instância da Evolution fechada/deslogada. Reconectar em Canais (novo QR) e conferir connectionState.',
  },
  {
    codigo: 'CHAT-106',
    reconhece:
      /"exists"\s*:\s*false|exists: false|not (on|in) whatsapp|não tem whatsapp|jid.*(invalid|não existe)/i,
    titulo: 'Este número não tem WhatsApp',
    explicacao: 'O número do cliente não está cadastrado no WhatsApp.',
    oQueFazer: 'Confira o número com o cliente (DDD e 9º dígito).',
    paraDev:
      'Evolution recusou o destinatário (exists: false). Conferir normalização do telefone (DDI 55, 9º dígito).',
  },
  {
    codigo: 'CHAT-107',
    reconhece: /respondeu 429|131056|too many|rate limit/i,
    titulo: 'Muitas mensagens em pouco tempo',
    explicacao: 'O WhatsApp pediu uma pausa por causa da quantidade de mensagens enviadas.',
    oQueFazer: 'Espere alguns minutos e tente de novo.',
    paraDev:
      'Limite de envio (HTTP 429 / Meta 131056). Ver volume de envios do canal e fluxos automáticos.',
  },
  {
    codigo: 'CHAT-108',
    reconhece: /respondeu 5\d\d/i,
    titulo: 'Erro no servidor do WhatsApp',
    explicacao: 'O servidor do WhatsApp teve um problema ao processar o envio.',
    oQueFazer: 'Tente de novo em alguns minutos. Se continuar, avise o desenvolvimento.',
    paraDev:
      'Erro 5xx da Evolution/Meta. Ver os logs do container da Evolution no horário da mensagem.',
  },
  {
    codigo: 'CHAT-201',
    reconhece: /janela de 24 horas|131047|re-?engagement/i,
    titulo: 'Prazo de 24 horas encerrado',
    explicacao:
      'Pelo WhatsApp oficial, depois de 24 horas sem mensagem do cliente só dá para enviar um modelo aprovado.',
    oQueFazer: 'Espere o cliente escrever de novo ou use um modelo de mensagem aprovado.',
    paraDev: 'Janela de atendimento da Cloud API fechada (Meta 131047). Só template aprovado.',
  },
  {
    codigo: 'CHAT-202',
    reconhece: /Meta respondeu 4\d\d/i,
    titulo: 'O WhatsApp oficial recusou a mensagem',
    explicacao: 'O WhatsApp oficial não aceitou esta mensagem.',
    oQueFazer: 'Avise o desenvolvimento com o código acima.',
    paraDev:
      'Erro 4xx da Cloud API da Meta: ver error.code/error_subcode no texto técnico e a documentação da Meta.',
  },
  {
    codigo: 'CHAT-301',
    reconhece: /grande demais|too large|respondeu 413|\bgrande\b/i,
    titulo: 'Arquivo grande demais',
    explicacao: 'O arquivo passou do tamanho que o sistema consegue enviar.',
    oQueFazer: 'Envie um arquivo menor, ou mande pelo celular.',
    paraDev: 'Limite de 4 MB no envio pela tela (corpo da Vercel) ou 16 MB no recebimento.',
  },
  {
    codigo: 'CHAT-302',
    reconhece: /grave o áudio em outro navegador|webm/i,
    titulo: 'Formato de áudio não aceito',
    explicacao: 'O WhatsApp oficial não aceita o áudio gravado por este navegador.',
    oQueFazer: 'Grave pelo Firefox ou envie um arquivo .mp3 ou .ogg.',
    paraDev: 'Cloud API não aceita audio/webm (gravação do Chrome).',
  },
  {
    codigo: 'CHAT-401',
    reconhece: /canal desta conversa não está disponível|Provedor de canal desconhecido/i,
    titulo: 'Canal indisponível',
    explicacao: 'O número usado nesta conversa foi desativado ou removido.',
    oQueFazer:
      'Peça ao administrador para reativar o canal, ou inicie a conversa por outro número.',
    paraDev: 'canal.ativo = false ou provedor inválido no registro do canal.',
  },
  {
    codigo: 'CHAT-402',
    reconhece: /Telefone inválido/i,
    titulo: 'Telefone inválido',
    explicacao: 'O número do cliente está incompleto ou em formato errado.',
    oQueFazer: 'Corrija o número com DDD (ex.: 85 99999-0000).',
    paraDev: 'normalizarTelefone devolveu nulo para o número do contato.',
  },
  {
    codigo: 'CHAT-501',
    reconhece: /Não foi possível (registrar|gravar)/i,
    titulo: 'Falha ao salvar a mensagem',
    explicacao: 'A mensagem não pôde ser salva no sistema.',
    oQueFazer: 'Tente de novo. Se continuar, avise o desenvolvimento.',
    paraDev:
      'Erro do banco ao gravar em mensagens (ver o texto técnico: RLS, coluna ou restrição).',
  },
];

export const ERRO_CHAT_DESCONHECIDO = {
  codigo: 'CHAT-000',
  titulo: 'Erro inesperado no envio',
  explicacao: 'A mensagem não foi enviada por um motivo que o sistema ainda não reconhece.',
  oQueFazer: 'Avise o desenvolvimento para que o erro seja analisado.',
  paraDev:
    'Erro fora do catálogo de src/lib/errosChat.js: analisar o texto técnico e acrescentar uma regra.',
};

/** Texto técnico gravado na mensagem → { codigo, titulo, explicacao, oQueFazer, paraDev, tecnico } */
export function explicarErroChat(tecnico) {
  const texto = String(tecnico || '').trim();
  const achado = ERROS_CHAT.find((e) => e.reconhece.test(texto)) || ERRO_CHAT_DESCONHECIDO;
  const { reconhece, ...erro } = achado;
  return { ...erro, tecnico: texto || 'Sem detalhe técnico registrado.' };
}

/** Texto do ticket que vai para a área de desenvolvimento (Feedbacks). */
export function relatorioErroChat(erro, { mensagemId, conversaId, quando, conteudo } = {}) {
  return [
    `Código: ${erro.codigo} — ${erro.titulo}`,
    `Quando: ${quando ? new Date(quando).toLocaleString('pt-BR') : 'não informado'}`,
    conversaId ? `Conversa: ${conversaId}` : null,
    mensagemId ? `Mensagem: ${mensagemId}` : null,
    conteudo ? `Trecho da mensagem: ${String(conteudo).slice(0, 200)}` : null,
    '',
    `Erro técnico: ${erro.tecnico}`,
    `O que verificar: ${erro.paraDev}`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Aviso curto para a tela quando um envio falha: o que houve e o que fazer (sem texto técnico). */
export function avisoDeFalhaDeEnvio(tecnico) {
  const erro = explicarErroChat(tecnico);
  if (erro.codigo === ERRO_CHAT_DESCONHECIDO.codigo) return String(tecnico || '').trim() || erro.titulo;
  return `${erro.titulo}. ${erro.oQueFazer}`;
}
