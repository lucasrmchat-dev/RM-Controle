'use client';

/**
 * Fotos dos contatos no navegador: junta os pedidos de vários avatares (50 ms) numa chamada só ao
 * servidor e guarda os links por 50 minutos (o link vale 1 hora). Assim uma lista com 30 contatos faz
 * 1 requisição, e não 30.
 */
const VALIDADE_MS = 50 * 60 * 1000;
const guardadas = new Map(); // id → { url, em }
const esperando = new Map(); // id → [resolver]
let agendado = null;

function buscarLote() {
  agendado = null;
  const ids = [...esperando.keys()].slice(0, 60);
  const pedidos = ids.map((id) => [id, esperando.get(id)]);
  ids.forEach((id) => esperando.delete(id));
  if (esperando.size) agendado = setTimeout(buscarLote, 0);
  fetch(`/api/chat/fotos?ids=${ids.join(',')}`, { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { fotos: {} }))
    .catch(() => ({ fotos: {} }))
    .then(({ fotos = {} }) => {
      for (const [id, resolvers] of pedidos) {
        const url = fotos[id] || null;
        if (url) guardadas.set(id, { url, em: Date.now() });
        resolvers.forEach((r) => r(url));
      }
    });
}

/** Link da foto do contato (ou null). `renovar`: ignora o guardado (foto trocada). */
export function linkDaFoto(id, { renovar = false } = {}) {
  const g = guardadas.get(id);
  if (!renovar && g && Date.now() - g.em < VALIDADE_MS) return Promise.resolve(g.url);
  return new Promise((resolver) => {
    if (!esperando.has(id)) esperando.set(id, []);
    esperando.get(id).push(resolver);
    if (!agendado) agendado = setTimeout(buscarLote, 50);
  });
}

/** Link já guardado (para mostrar sem esperar). */
export const fotoGuardada = (id) => {
  const g = guardadas.get(id);
  return g && Date.now() - g.em < VALIDADE_MS ? g.url : null;
};
