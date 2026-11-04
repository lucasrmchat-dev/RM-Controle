// Pedido de tratativa: o gestor pede que o responsável por uma demanda a resolva ou explique, com prazo opcional.
// Regras puras, usadas pela tela e pelo servidor.

export const PRAZOS_PEDIDO = [
  { id: 'sem', rotulo: 'Sem prazo', minutos: null },
  { id: '30m', rotulo: '30 minutos', minutos: 30 },
  { id: '1h', rotulo: '1 hora', minutos: 60 },
  { id: '4h', rotulo: '4 horas', minutos: 240 },
  { id: '1d', rotulo: '1 dia', minutos: 1440 },
  { id: '3d', rotulo: '3 dias', minutos: 4320 },
];

export const ACOES_PRAZO = [
  { id: 'concluir', rotulo: 'Concluir sozinho', descricao: 'A demanda é concluída, registrando que o prazo venceu.' },
  { id: 'cancelar', rotulo: 'Cancelar sozinho', descricao: 'A demanda é cancelada, registrando que o prazo venceu.' },
];

export const STATUS_ABERTOS = ['aberto', 'respondido'];

export const ROTULO_STATUS_PEDIDO = {
  aberto: 'Esperando resposta',
  respondido: 'Respondido, ainda aberta',
  concluido: 'Concluída pelo responsável',
  cancelado: 'Cancelada pelo responsável',
  em_espera: 'Colocada em espera',
  expirado: 'Prazo venceu',
  retirado: 'Pedido retirado',
};

const STATUS_CONCLUIDA = ['finalizado', 'resolvido', 'concluido'];

/** Situação do pedido a partir da situação atual da demanda (a demanda manda: se foi tratada, o pedido se encerra). */
export function situacaoDoPedido(pedido, chamado) {
  if (!STATUS_ABERTOS.includes(pedido.status)) return pedido.status;
  if (!chamado || chamado.status === 'cancelado') return 'cancelado';
  if (STATUS_CONCLUIDA.includes(chamado.status)) return 'concluido';
  if (chamado.status === 'pendente') return 'em_espera';
  return pedido.status;
}

/** "vence em 2 h", "venceu há 10 min" ou "sem prazo". */
export function textoPrazo(prazoEm, agora = Date.now()) {
  if (!prazoEm) return 'sem prazo';
  const ms = new Date(prazoEm).getTime() - agora;
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60000);
  const texto = min < 60 ? `${Math.max(1, min)} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
  return ms >= 0 ? `vence em ${texto}` : `venceu há ${texto}`;
}

export const prazoEmDe = (minutos, agora = Date.now()) => (minutos ? new Date(agora + minutos * 60000).toISOString() : null);

/** A demanda está com esta pessoa? (mesma regra da tela de Demandas: e-mail, ou o nome do responsável nas contas de administração) */
export function chamadoEhDe(ch, userEmail) {
  if (!ch) return false;
  const myEmail = (userEmail || '').toLowerCase().trim();
  const chEmail = (ch.tecnico_email || '').toLowerCase().trim();
  const chNome = (ch.tecnico_nome || ch.atendente || '').toLowerCase().trim();
  if (chEmail && chEmail === myEmail) return true;
  if (chEmail.includes('admin') && (myEmail.includes('admin') || myEmail.includes('lucas'))) return true;
  if (chEmail.includes('lucas') && (myEmail.includes('lucas') || myEmail.includes('admin'))) return true;
  if (chNome.includes('lucas') && (myEmail.includes('lucas') || myEmail.includes('admin'))) return true;
  return false;
}
