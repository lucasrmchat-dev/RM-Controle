// Preferências da pessoa guardadas na conta (cor, tema, avisos na tela, modo de visualização e sons).
// Regras puras, usadas pelo navegador e pelo servidor. Cada preferência é um texto guardado no navegador
// (localStorage) com uma destas chaves; a conta guarda uma cópia para valer em qualquer dispositivo.

export const CHAVES_FIXAS = ['rm_paleta', 'rm_theme', 'rm_avisos_tela', 'rm_default_view_mode'];
const PADRAO_SOM = /^rm_som_[a-z0-9_]{1,40}$/;
export const MAX_CHAVES = 40;
export const MAX_TEXTO = 4000;

export const ehChaveDePreferencia = (chave) => CHAVES_FIXAS.includes(chave) || PADRAO_SOM.test(String(chave));

/** Só chaves conhecidas, valores em texto e com limite de tamanho (o servidor nunca grava o que não conhece). */
export function validarPreferencias(valor) {
  const saida = {};
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return saida;
  for (const [chave, texto] of Object.entries(valor)) {
    if (Object.keys(saida).length >= MAX_CHAVES) break;
    if (!ehChaveDePreferencia(chave) || typeof texto !== 'string' || texto.length > MAX_TEXTO) continue;
    saida[chave] = texto;
  }
  return saida;
}

/** Lê do armazenamento do navegador (ou de um igual, nos testes) só o que é preferência. */
export function lerPreferenciasLocais(armazenamento) {
  const saida = {};
  try {
    for (let i = 0; i < armazenamento.length; i += 1) {
      const chave = armazenamento.key(i);
      if (!ehChaveDePreferencia(chave)) continue;
      const texto = armazenamento.getItem(chave);
      if (typeof texto === 'string') saida[chave] = texto;
    }
  } catch {}
  return validarPreferencias(saida);
}

/** Chaves cujo valor na conta é diferente do que está neste navegador. */
export function diferencas(local, conta) {
  return Object.keys(conta).filter((chave) => local[chave] !== conta[chave]);
}

/** O que a conta passa a ter: o que já tinha, mais o que só existe neste navegador (a conta manda onde as duas têm). */
export function mesclar(local, conta) {
  return { ...local, ...conta };
}

/** Texto estável para comparar se algo mudou desde o último envio. */
export const assinatura = (prefs) => JSON.stringify(Object.keys(prefs).sort().map((k) => [k, prefs[k]]));
