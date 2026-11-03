/**
 * Envios em massa: regras puras (navegador e servidor). Uma mensagem para vários contatos e grupos,
 * com um intervalo entre uma mensagem e outra para diminuir o risco de bloqueio do número (QR Code).
 */

export const INTERVALO_MIN = 5;
export const INTERVALO_MAX = 3600;
export const INTERVALO_PADRAO = 60;
export const MENSAGEM_MAX = 4096;
export const DESTINOS_MAX = 1000;

export const STATUS_ENVIO = {
  agendado: { rotulo: 'Agendado' },
  enviando: { rotulo: 'Enviando' },
  pausado: { rotulo: 'Pausado' },
  concluido: { rotulo: 'Concluído' },
  cancelado: { rotulo: 'Cancelado' },
};

/**
 * Risco estimado de bloqueio pelo intervalo entre as mensagens, em %. Quanto menor o intervalo, maior;
 * cresce de verdade abaixo de 1 minuto e nunca chega a zero (o WhatsApp não garante nada no QR Code).
 * 5 s ≈ 79% · 15 s ≈ 53% · 30 s ≈ 31% · 60 s ≈ 11% · 2 min ≈ 4% · 5 min ou mais ≈ 3%.
 */
export function riscoDoIntervalo(segundos) {
  const s = Math.max(INTERVALO_MIN, Number(segundos) || INTERVALO_MIN);
  return Math.round(3 + 92 * Math.exp(-s / 25));
}

/** Faixa do risco, para cor e texto: baixo, moderado, alto ou muito alto. */
export function nivelDoRisco(risco) {
  if (risco >= 60) return { id: 'muito_alto', rotulo: 'Risco muito alto' };
  if (risco >= 30) return { id: 'alto', rotulo: 'Risco alto' };
  if (risco >= 10) return { id: 'moderado', rotulo: 'Risco moderado' };
  return { id: 'baixo', rotulo: 'Risco baixo' };
}

/** Tempo total aproximado do envio (sem contar a variação aleatória), em segundos. */
export const duracaoEstimada = (quantidade, segundos) =>
  Math.max(0, (Number(quantidade) || 0) - 1) * (Number(segundos) || 0);

/** "1 h 20 min", "3 min", "40 s" */
export function formatarDuracao(totalSegundos) {
  const s = Math.round(Number(totalSegundos) || 0);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/**
 * Espera até a próxima mensagem: o intervalo escolhido com uma variação aleatória de até +40%
 * (nunca menos que o escolhido), para os disparos não terem um ritmo de robô.
 */
export const proximaEspera = (segundos, sorteio = Math.random()) =>
  Math.round(segundos * (1 + 0.4 * sorteio) * 1000);

/** Troca {{nome}} e {{primeiro_nome}} pelo nome do contato ou grupo (sem nome: fica vazio). */
export function preencherMensagem(texto, contato) {
  const nome = String(contato?.nome || '').trim();
  const primeiro = nome.split(/\s+/)[0] || '';
  return String(texto || '')
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, primeiro)
    .replace(/\{\{\s*nome\s*\}\}/gi, nome)
    .replace(/[ \t]+([,.!?])/g, '$1')
    .trim();
}

/** Confere o pedido de um envio novo. Devolve os campos limpos ou lança o erro em português. */
export function validarEnvio(body, { agora = new Date() } = {}) {
  const nome = String(body?.nome || '')
    .trim()
    .slice(0, 80);
  const mensagem = String(body?.mensagem || '').trim();
  const intervalo = Math.round(Number(body?.intervalo_segundos));
  const ids = [...new Set(Array.isArray(body?.contatos) ? body.contatos.map(String) : [])];
  if (!mensagem) throw new Error('Escreva a mensagem.');
  if (mensagem.length > MENSAGEM_MAX)
    throw new Error(`Mensagem longa demais (máximo de ${MENSAGEM_MAX} caracteres).`);
  if (!Number.isFinite(intervalo) || intervalo < INTERVALO_MIN || intervalo > INTERVALO_MAX) {
    throw new Error(`O intervalo precisa ficar entre ${INTERVALO_MIN} segundos e 1 hora.`);
  }
  if (!ids.length) throw new Error('Escolha ao menos um contato ou grupo.');
  if (ids.length > DESTINOS_MAX)
    throw new Error(`No máximo ${DESTINOS_MAX} contatos e grupos por envio.`);
  let agendadoPara = agora;
  if (body?.agendado_para) {
    const quando = new Date(body.agendado_para);
    if (Number.isNaN(quando.getTime())) throw new Error('Data e horário inválidos.');
    if (quando.getTime() < agora.getTime() - 60_000)
      throw new Error('Escolha uma data e horário no futuro.');
    if (quando.getTime() > agora.getTime() + 180 * 86_400_000)
      throw new Error('Agende para no máximo 6 meses à frente.');
    agendadoPara = quando;
  }
  return {
    nome:
      nome ||
      `Envio de ${agendadoPara.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    mensagem,
    intervalo,
    contatos: ids,
    agendadoPara,
  };
}
