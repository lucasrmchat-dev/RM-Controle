/**
 * Sugestões de solução a partir do relato da demanda.
 * Pega as palavras que importam do relato e mostra os procedimentos do banco que mais combinam.
 * Função pura (navegador e testes).
 */

const IGNORAR = new Set(
  'para com sem uma uns umas dos das nos nas que por mais mas como foi estao esta esse essa isso aqui ali ele ela eles elas tem ter nao sim pra ate ainda muito pouco quando onde porque pois seu sua meu minha cliente favor ajuda problema'.split(
    ' ',
  ),
);

const semAcento = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Palavras do relato que valem a busca (sem acento, 4+ letras, sem as comuns, sem repetir). */
export function palavrasDoRelato(relato) {
  const achadas = semAcento(relato).match(/[a-z0-9_-]{4,}/g) || [];
  return [...new Set(achadas.filter((p) => !IGNORAR.has(p)))].slice(0, 12);
}

/** Procedimentos que mais combinam com o relato (título e código pesam mais que o texto). */
export function sugerirSolucoes(relato, solucoes = [], max = 3) {
  const palavras = palavrasDoRelato(relato);
  if (!palavras.length) return [];
  const pontuadas = [];
  for (const s of solucoes || []) {
    const titulo = semAcento(`${s.titulo || ''} ${s.erro_codigo || ''} ${(s.tags || []).join(' ')}`);
    const corpo = semAcento(`${s.contexto || ''} ${s.solucao_passos || ''}`);
    let pontos = 0;
    for (const p of palavras) {
      if (titulo.includes(p)) pontos += 3;
      else if (corpo.includes(p)) pontos += 1;
    }
    if (pontos >= 2) pontuadas.push({ ...s, pontos });
  }
  return pontuadas.sort((a, b) => b.pontos - a.pontos).slice(0, max);
}
