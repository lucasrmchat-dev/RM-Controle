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

/** Faixa da probabilidade de bloqueio (0 a 100) para mostrar à pessoa, sem números. */
export function nivelDoRisco(pontos) {
  if (pontos >= 70) return { id: 'muito_alto', rotulo: 'Muito alta' };
  if (pontos >= 45) return { id: 'alto', rotulo: 'Alta' };
  if (pontos >= 20) return { id: 'medio', rotulo: 'Média' };
  return { id: 'baixo', rotulo: 'Baixa' };
}

/**
 * Probabilidade estimada de bloqueio do número pelo envio todo: junta o intervalo e a quantidade de
 * destinatários. É uma estimativa para orientar (o WhatsApp não divulga as regras), de propósito cautelosa.
 *  - Intervalo curto pesa mais quanto mais mensagens houver (3 mensagens rápidas preocupam pouco; 300, muito).
 *  - Volume pesa sozinho: muitas mensagens iguais no mesmo dia chamam atenção mesmo com intervalo longo.
 * Ex.: 3 grupos a cada 60 s → baixo · 100 contatos a cada 60 s → médio · 500 a cada 30 s → alto ·
 * 500 a cada 10 s → muito alto. Nunca chega a zero.
 * @returns {{ pontos: number, nivel: {id, rotulo}, motivos: string[], recomendacoes: string[] }}
 */
export function avaliarRisco({ segundos, quantidade = 0, personalizada = false } = {}) {
  const s = Math.max(INTERVALO_MIN, Number(segundos) || INTERVALO_MIN);
  const n = Math.max(0, Number(quantidade) || 0);
  const peloIntervalo = riscoDoIntervalo(s) * Math.min(1, 0.3 + n / 40);
  const peloVolume = 40 * (1 - Math.exp(-n / 300));
  const pontos = Math.round(Math.min(98, Math.max(3, peloIntervalo + peloVolume)));
  const nivel = nivelDoRisco(pontos);

  const motivos = [];
  const recomendacoes = [];
  if (s < 20)
    motivos.push(`Tempo entre as mensagens muito curto (${s} s): parece disparo automático.`);
  else if (s < 60) motivos.push(`Tempo entre as mensagens curto (${s} s).`);
  if (n > 200)
    motivos.push(`Muitos destinatários (${n}): volume alto para um número só no mesmo dia.`);
  else if (n > 50) motivos.push(`Lista grande (${n} destinatários).`);
  if (n > 50 && !personalizada) motivos.push('A mesma mensagem idêntica para todos.');
  if (!motivos.length)
    motivos.push(
      n
        ? 'Poucos destinatários e tempo confortável entre as mensagens.'
        : 'Escolha os destinatários para ver a estimativa completa.',
    );

  if (s < 60 && n > 10) recomendacoes.push('Aumente o intervalo para 60 segundos ou mais.');
  if (n > 100) recomendacoes.push('Divida em envios menores (até 100 por vez) em dias diferentes.');
  if (!personalizada && n > 10)
    recomendacoes.push(
      'Personalize com o nome do contato: mensagens diferentes chamam menos atenção.',
    );
  if (n > 50)
    recomendacoes.push('Prefira quem já conversou com este número; desconhecidos denunciam mais.');
  recomendacoes.push(
    'No QR Code o risco nunca é zero: evite números novos e mensagens só com link.',
  );
  return { pontos, nivel, motivos, recomendacoes };
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

// Probabilidade alta ou muito alta não deixa enviar: só média ou baixa (tela e servidor)
export const NIVEIS_BLOQUEADOS = ['alto', 'muito_alto'];
export const envioBloqueado = (avaliacao) => NIVEIS_BLOQUEADOS.includes(avaliacao?.nivel?.id);

/** Menor intervalo (de 5 em 5 s) que deixa a probabilidade em média ou baixa para esta quantidade. */
export function intervaloSeguro({ quantidade = 0, personalizada = false } = {}) {
  for (let s = INTERVALO_MIN; s <= INTERVALO_MAX; s += 5) {
    if (!envioBloqueado(avaliarRisco({ segundos: s, quantidade, personalizada }))) return s;
  }
  return null;
}

/** Mensagem com o nome do contato (cada um recebe um texto diferente). */
export const mensagemPersonalizada = (texto) =>
  /\{\{\s*(primeiro_)?nome\s*\}\}/i.test(String(texto || ''));

// Probabilidade média: só envia quem aceitar o termo (fica registrado na auditoria). Baixa: envia com a ressalva.
export const exigeAceite = (avaliacao) => avaliacao?.nivel?.id === 'medio';
export const TERMO_RISCO_MEDIO =
  'Estou ciente de que a probabilidade de bloqueio deste envio é média. O WhatsApp por QR Code não foi feito para disparos em massa e o número pode ser bloqueado a qualquer momento. Assumo o risco e a responsabilidade por este envio.';
export const RESSALVA_RISCO_BAIXO =
  'Probabilidade baixa, mas não zero: o WhatsApp por QR Code não foi feito para disparos em massa. Use com moderação e só para quem espera a sua mensagem.';
