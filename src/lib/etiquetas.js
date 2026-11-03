/**
 * Etiquetas cadastradas da empresa (Configurações › Etiquetas). Duas listas separadas:
 *  - chat: etiquetas de contatos e grupos (Chat, ações em massa, envios em massa, Fluxo Inteligente);
 *  - demandas: etiquetas da Fila de Demandas.
 * Só se atribui o que está cadastrado (escolhe da lista), para não nascer etiqueta "na louca".
 * Ficam em sistema_config (chaves abaixo), separadas por empresa. Regras puras: navegador e servidor.
 */

export const TIPOS_ETIQUETA = {
  chat: {
    chave: 'etiquetas_chat',
    rotulo: 'Chat (contatos e grupos)',
    descricao:
      'Usadas em contatos e grupos do Chat, nas ações e envios em massa e nas condições do Fluxo Inteligente.',
  },
  demandas: {
    chave: 'etiquetas_demandas',
    rotulo: 'Fila de Demandas',
    descricao: 'Usadas para classificar as demandas da fila.',
  },
};

export const ETIQUETA_MAX = 30;
const LIMITE = 200;

const limpar = (t) =>
  String(t ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .slice(0, ETIQUETA_MAX);
const chave = (t) =>
  limpar(t)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Lista válida: nomes de até 30 caracteres, sem repetir (ignorando maiúsculas e acentos), até 200. */
export function validarEtiquetas(valor) {
  if (!Array.isArray(valor)) throw new Error('Lista de etiquetas inválida.');
  const vistos = new Set();
  const lista = [];
  for (const item of valor) {
    const nome = limpar(typeof item === 'object' && item ? item.nome : item);
    if (!nome) continue;
    if (vistos.has(chave(nome))) continue;
    vistos.add(chave(nome));
    lista.push(nome);
  }
  if (lista.length > LIMITE) throw new Error(`No máximo ${LIMITE} etiquetas por lista.`);
  return lista;
}

/** A etiqueta está cadastrada? Devolve o nome como foi cadastrado (com as maiúsculas de lá) ou null. */
export function etiquetaCadastrada(lista, nome) {
  const alvo = chave(nome);
  if (!alvo) return null;
  return (lista || []).find((t) => chave(t) === alvo) || null;
}

/** Etiquetas já usadas (para cadastrar automaticamente na primeira vez, sem perder nada). */
export function etiquetasEmUso(linhas, { ignorar = (t) => t.startsWith('dep:') } = {}) {
  const usadas = [];
  for (const l of linhas || []) {
    const tags = Array.isArray(l?.etiquetas) ? l.etiquetas : [];
    for (const t of tags) if (typeof t === 'string' && limpar(t) && !ignorar(t)) usadas.push(t);
  }
  const porChave = new Map();
  for (const t of usadas) if (!porChave.has(chave(t))) porChave.set(chave(t), limpar(t));
  const unicas = [...porChave.values()].slice(0, LIMITE);
  return validarEtiquetas(unicas).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
