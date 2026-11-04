// Resumo do dia: regras puras (saudação, ranking de resoluções e recados de desempenho). A tela só desenha.

export const saudacaoDaHora = (hora) => (hora < 5 ? 'Boa noite' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite');

/** Primeiro nome, sem "(Administrador)" e sem e-mail. */
export function primeiroNome(nome) {
  const limpo = String(nome || '').replace(/\(.*?\)/g, '').trim();
  if (!limpo || limpo.includes('@')) return '';
  return limpo.split(/\s+/)[0];
}

const minusculo = (t) => String(t || '').toLowerCase().trim();

/** Quem atendeu a demanda (e-mail quando existe, senão o nome). */
const quemFez = (c) => minusculo(c.tecnico_email && c.tecnico_email !== 'geral' ? c.tecnico_email : c.tecnico_nome || c.atendente);

/**
 * Ranking de demandas concluídas desde uma data. Só entram demandas concluídas (não as canceladas).
 * @returns {{ chave: string, nome: string, total: number }[]} do primeiro para o último
 */
export function rankingDeResolucoes(historico = [], desdeMs = 0) {
  const mapa = new Map();
  for (const c of historico) {
    if (!c || !['finalizado', 'resolvido', 'concluido'].includes(c.status)) continue;
    const fim = new Date(c.finalizado_em || c.finalizadoEm || 0).getTime();
    if (!fim || fim < desdeMs) continue;
    const chave = quemFez(c);
    if (!chave) continue;
    const atual = mapa.get(chave) || { chave, nome: c.tecnico_nome || c.atendente || chave, total: 0 };
    atual.total += 1;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Onde a pessoa está no ranking e o que dizer a ela. `equipe`: quantas pessoas atendem no sistema
 * (quem não concluiu nada ainda também conta, para o "último lugar" fazer sentido).
 * tom: 'lider' | 'bem' | 'neutro' | 'alerta' | 'sem_dados'
 */
export function desempenhoDe(ranking, chavesMinhas = [], equipe = 0) {
  const minhas = new Set(chavesMinhas.map(minusculo).filter(Boolean));
  const idx = ranking.findIndex((r) => minhas.has(r.chave) || [...minhas].some((m) => r.chave.includes(m) || m.includes(r.chave)));
  const meu = idx >= 0 ? ranking[idx] : null;
  const participantes = Math.max(equipe, ranking.length, meu ? 0 : ranking.length + 1);
  const total = meu ? meu.total : 0;
  const posicao = meu ? idx + 1 : ranking.length + 1;
  const outros = ranking.filter((_, i) => i !== idx).map((r) => r.total).sort((a, b) => a - b);
  const mediana = outros.length ? outros[Math.floor(outros.length / 2)] : 0;
  const base = { posicao, participantes, total, mediana, ranking };
  if (participantes < 2 || (!ranking.length)) return { ...base, tom: 'sem_dados', titulo: 'Ainda sem comparação', texto: 'Conforme a equipe concluir demandas, você vai ver aqui como está em relação aos colegas.' };
  if (posicao === 1 && total > 0) return { ...base, tom: 'lider', titulo: 'Você está em 1º lugar', texto: `Foram ${total} ${total === 1 ? 'demanda concluída' : 'demandas concluídas'} neste mês. Continue assim, muito bem!` };
  // Último e bem abaixo dos colegas: provavelmente não está registrando tudo no sistema
  if (posicao === participantes && participantes >= 3 && total < mediana * 0.5) {
    return { ...base, tom: 'alerta', titulo: `Você está em ${posicao}º de ${participantes}`, texto: `Você concluiu ${total} neste mês; a mediana da equipe é ${mediana}. Será que ficou algum atendimento sem registrar? Cadastre os chamados e use mais a RM Controle: é assim que o seu trabalho aparece.` };
  }
  if (posicao <= Math.ceil(participantes / 2)) return { ...base, tom: 'bem', titulo: `Você está em ${posicao}º de ${participantes}`, texto: `${total} ${total === 1 ? 'demanda concluída' : 'demandas concluídas'} neste mês. Bom ritmo, siga em frente.` };
  return { ...base, tom: 'neutro', titulo: `Você está em ${posicao}º de ${participantes}`, texto: `${total} ${total === 1 ? 'demanda concluída' : 'demandas concluídas'} neste mês. Dá para subir: foque nas que estão com você.` };
}

/** A frase do topo: só o que mais importa (no máximo `max` itens, do mais para o menos urgente). */
export function frasePrincipal({ minhas = 0, fila = 0, perdidas = 0, reunioes = 0, pedidos = 0 } = {}, max = 3) {
  const pedaco = (n, um, varios) => (n ? `${n} ${n === 1 ? um : varios}` : null);
  const partes = [
    pedaco(pedidos, 'pedido de tratativa para você', 'pedidos de tratativa para você'),
    pedaco(perdidas, 'conversa esperando resposta', 'conversas esperando resposta'),
    pedaco(minhas, 'demanda com você', 'demandas com você'),
    pedaco(reunioes, 'reunião pela frente', 'reuniões pela frente'),
    pedaco(fila, 'na fila sem responsável', 'na fila sem responsável'),
  ]
    .filter(Boolean)
    .slice(0, max);
  if (!partes.length) return 'Está tudo em dia por aqui. Aproveite para respirar.';
  const ultima = partes.pop();
  return `${partes.length ? `${partes.join(', ')} e ` : ''}${ultima}.`.replace(/^./, (c) => c.toUpperCase());
}

/** Minutos desde um instante (ISO). */
export const minutosDesde = (iso, agora = Date.now()) => {
  const t = new Date(iso || 0).getTime();
  return t ? Math.max(0, Math.floor((agora - t) / 60000)) : 0;
};

/** "há 2 h", "há 35 min", "há 3 dias". */
export function haQuanto(minutos) {
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 1440) return `há ${Math.floor(minutos / 60)} h`;
  const d = Math.floor(minutos / 1440);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}
