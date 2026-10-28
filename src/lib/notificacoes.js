/**
 * Central de notificações: histórico dos últimos avisos do sistema (nova demanda, SLA estourado,
 * prazo vencido, reunião chegando, feedback que mudou de etapa).
 * Fica no navegador de cada pessoa, separado por e-mail; quem limpa só limpa para si.
 */
const MAXIMO = 60;
const EVENTO = 'rm_notificacoes_updated';
export const EVENTO_NOVA = 'rm_notificacao_nova';

let donoAtual = '';

const chave = () => `rm_notificacoes:${donoAtual || 'anonimo'}`;

/** Define de quem são as notificações deste navegador (chamado no login). */
export function definirDonoNotificacoes(email) {
  donoAtual = String(email || '').toLowerCase().trim();
  avisar();
}

function ler() {
  if (typeof window === 'undefined') return [];
  try {
    const lista = JSON.parse(localStorage.getItem(chave()) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravar(lista) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(chave(), JSON.stringify(lista.slice(0, MAXIMO)));
  } catch {}
  avisar();
}

function avisar() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

export const EVENTO_NOTIFICACOES = EVENTO;

export function listarNotificacoes() {
  return ler().sort((a, b) => new Date(b.em) - new Date(a.em));
}

export const naoLidas = (lista = ler()) => lista.filter((n) => !n.lida).length;

/**
 * Registra uma notificação. `id` estável evita repetir o mesmo aviso (ex.: SLA da mesma demanda).
 * Uma notificação apagada com o mesmo id não volta: o id fica lembrado por 7 dias.
 * @param {{ id: string, tipo: 'demanda'|'sla'|'prazo'|'reuniao'|'feedback'|'sistema', titulo: string, detalhe?: string, aba?: string }} n
 */
export function notificar(n) {
  if (!n?.id || !n?.titulo) return false;
  let lista = ler();
  if (lista.some((x) => x.id === n.id) || foiDescartada(n.id)) return false;
  // `grupo`: um aviso só por assunto (ex.: uma conversa do Chat) — o novo substitui o anterior
  if (n.grupo) lista = lista.filter((x) => x.grupo !== n.grupo);
  // Novidades: os avisos antigos, um por novidade, dão lugar ao aviso agrupado
  if (n.grupo === 'novidades' || n.grupo === 'novidades_pendentes') {
    const prefixo = n.grupo === 'novidades' ? /^novidade_(?!pendente_)/ : /^novidade_pendente_/;
    lista = lista.filter((x) => !prefixo.test(x.id));
  }
  const nova = { id: n.id, tipo: n.tipo || 'sistema', titulo: n.titulo, detalhe: n.detalhe || '', aba: n.aba || null, grupo: n.grupo || null, alvo: n.alvo || null, em: new Date().toISOString(), lida: false };
  lista.unshift(nova);
  gravar(lista);
  // Avisos na tela (Configurações › Aparência) escutam este evento
  if (typeof window !== 'undefined' && !n.silenciosa) window.dispatchEvent(new CustomEvent(EVENTO_NOVA, { detail: nova }));
  return true;
}

/** Tira os avisos de um assunto (ex.: ao abrir a conversa do Chat, os avisos dela somem). */
export function removerGrupo(grupo) {
  if (!grupo) return;
  const lista = ler();
  const restantes = lista.filter((x) => x.grupo !== grupo);
  if (restantes.length !== lista.length) gravar(restantes);
}

/** Marca uma como lida. */
export function marcarLida(id) {
  const lista = ler();
  if (!lista.some((n) => n.id === id && !n.lida)) return;
  gravar(lista.map((n) => (n.id === id ? { ...n, lida: true } : n)));
}

export function marcarTodasLidas() {
  const lista = ler();
  if (!lista.some((n) => !n.lida)) return;
  gravar(lista.map((n) => ({ ...n, lida: true })));
}

export function removerNotificacao(id) {
  lembrarDescartada([id]);
  gravar(ler().filter((n) => n.id !== id));
}

export function limparNotificacoes() {
  lembrarDescartada(ler().map((n) => n.id));
  gravar([]);
}

// Ids descartados: impede que um aviso apagado reapareça na próxima verificação
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
const chaveDescartadas = () => `${chave()}:descartadas`;

function lerDescartadas() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(chaveDescartadas()) || '{}') || {};
  } catch {
    return {};
  }
}

function lembrarDescartada(ids) {
  if (typeof window === 'undefined' || !ids.length) return;
  const agora = Date.now();
  const mapa = Object.fromEntries(Object.entries(lerDescartadas()).filter(([, em]) => agora - em < SETE_DIAS));
  ids.forEach((id) => (mapa[id] = agora));
  try {
    localStorage.setItem(chaveDescartadas(), JSON.stringify(mapa));
  } catch {}
}

function foiDescartada(id) {
  const em = lerDescartadas()[id];
  return Boolean(em && Date.now() - em < SETE_DIAS);
}
