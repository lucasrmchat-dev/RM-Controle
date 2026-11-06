/**
 * Atrasa uma chamada até a rajada de pedidos acabar (como um "debounce"), mas nunca por mais de `maximo` ms:
 * com mensagens chegando sem parar, a tela ainda se atualiza de tempos em tempos, em vez de esperar o fim da rajada
 * (que não chegava) e ficar com o "carregando" girando.
 * Devolve uma função; `.cancelar()` descarta o que estava marcado.
 */
export function atrasarComLimite(fn, espera, maximo, { agora = () => Date.now(), marcar = setTimeout, limpar = clearTimeout } = {}) {
  let tempo = null;
  let primeiro = 0;
  const chamar = () => {
    tempo = null;
    primeiro = 0;
    fn();
  };
  const atrasada = () => {
    const t = agora();
    if (!primeiro) primeiro = t;
    if (tempo) limpar(tempo);
    // Falta pouco para estourar o máximo: não empurra mais
    const restante = Math.max(0, maximo - (t - primeiro));
    tempo = marcar(chamar, Math.min(espera, restante));
  };
  atrasada.cancelar = () => {
    if (tempo) limpar(tempo);
    tempo = null;
    primeiro = 0;
  };
  return atrasada;
}
