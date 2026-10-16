/**
 * Correspondência aproximada de nomes de empresas (sem dependências, roda no servidor e no navegador).
 *
 * Combina duas medidas e usa a maior:
 *  1. Por palavras: cada palavra digitada é comparada com as palavras do nome cadastrado
 *     (tolerando erros de digitação e prefixos). "Vargas" encontra "Rocha e Vargas".
 *  2. Texto inteiro: similaridade de bigramas (Dice) para nomes digitados "colados" ou abreviados.
 *
 * O resultado é uma similaridade de 0 a 100.
 */

// Palavras que não identificam a empresa
const PALAVRAS_IGNORADAS = new Set([
  'e', 'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'em', 'the', 'and',
  'ltda', 'me', 'epp', 'eireli', 'sa', 's', 'cia', 'mei', 'inc', 'llc',
]);

export function normalizarNome(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function palavrasSignificativas(texto) {
  const todas = normalizarNome(texto).split(' ').filter(Boolean);
  const uteis = todas.filter((p) => !PALAVRAS_IGNORADAS.has(p));
  // Se o nome só tiver palavras "ignoráveis" (ex.: "S.A."), usa todas para não ficar vazio
  return uteis.length > 0 ? uteis : todas;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

function similaridadePalavra(digitada, cadastrada) {
  if (digitada === cadastrada) return 1;
  const base = 1 - levenshtein(digitada, cadastrada) / Math.max(digitada.length, cadastrada.length);
  // Palavra digitada pela metade ("Varg" → "Vargas") ainda é um bom sinal
  const prefixo = digitada.length >= 3 && cadastrada.startsWith(digitada) ? 0.9 : 0;
  return Math.max(base, prefixo);
}

function bigramas(texto) {
  const s = texto.replace(/ /g, '');
  const mapa = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    mapa.set(bg, (mapa.get(bg) || 0) + 1);
  }
  return mapa;
}

function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigramas(a);
  const bb = bigramas(b);
  let total = 0;
  ba.forEach((v) => (total += v));
  bb.forEach((v) => (total += v));
  if (total === 0) return 0;
  let comuns = 0;
  ba.forEach((v, k) => (comuns += Math.min(v, bb.get(k) || 0)));
  return (2 * comuns) / total;
}

/** Similaridade de 0 a 100 entre o nome digitado e o nome cadastrado. */
export function calcularSimilaridade(digitado, cadastrado) {
  const nd = normalizarNome(digitado);
  const nc = normalizarNome(cadastrado);
  if (!nd || !nc) return 0;
  if (nd === nc) return 100;

  const pd = palavrasSignificativas(digitado);
  const pc = palavrasSignificativas(cadastrado);

  // Qualidade: quão bem cada palavra digitada aparece no nome cadastrado
  const cobertas = new Set();
  let somaQualidade = 0;
  pd.forEach((p) => {
    let melhor = 0;
    let melhorIdx = -1;
    pc.forEach((c, idx) => {
      const sim = similaridadePalavra(p, c);
      if (sim > melhor) {
        melhor = sim;
        melhorIdx = idx;
      }
    });
    somaQualidade += melhor;
    if (melhor >= 0.8 && melhorIdx >= 0) cobertas.add(melhorIdx);
  });
  const qualidade = somaQualidade / pd.length;

  // Cobertura: quanto do nome cadastrado foi mencionado (pesado pelo tamanho das palavras)
  const totalLetras = pc.reduce((acc, c) => acc + c.length, 0) || 1;
  const letrasCobertas = [...cobertas].reduce((acc, idx) => acc + pc[idx].length, 0);
  const cobertura = letrasCobertas / totalLetras;

  const porPalavras = qualidade * (0.7 + 0.3 * cobertura);
  const textoInteiro = dice(pd.join(' '), pc.join(' '));

  return Math.round(Math.max(porPalavras, textoInteiro) * 100);
}

/**
 * Decide o que fazer com o nome digitado.
 * @returns {{ decisao: 'confirmado'|'confirmar'|'nao_encontrado', empresa: object|null, sugestoes: object[] }}
 *  - confirmado:     similaridade >= limiarAutomatico e sem empate com outra empresa → pode criar direto
 *  - confirmar:      há empresas entre limiarSugestao e limiarAutomatico (ou empate) → cliente escolhe
 *  - nao_encontrado: nada acima de limiarSugestao → pedir o nome de novo
 */
export function buscarEmpresaSemelhante(nomeDigitado, empresas, {
  limiarSugestao = 60,
  limiarAutomatico = 90,
  maxSugestoes = 5,
} = {}) {
  const ranking = (empresas || [])
    .filter((e) => e && e.id && e.nome)
    .map((e) => ({ id: e.id, nome: e.nome, similaridade: calcularSimilaridade(nomeDigitado, e.nome) }))
    .filter((e) => e.similaridade >= limiarSugestao)
    .sort((a, b) => b.similaridade - a.similaridade || a.nome.localeCompare(b.nome, 'pt-BR'));

  const sugestoes = ranking.slice(0, Math.max(1, maxSugestoes));
  const [primeira, segunda] = ranking;

  if (!primeira) return { decisao: 'nao_encontrado', empresa: null, sugestoes: [] };

  // Só cria automaticamente se a melhor opção for clara: duas empresas acima do limiar automático
  // empatadas (ex.: "Vargas Transportes" e "Vargas Logística" para "Vargas") exigem confirmação.
  const empate = segunda && segunda.similaridade >= limiarAutomatico && segunda.similaridade >= primeira.similaridade - 2;
  if (primeira.similaridade >= limiarAutomatico && !empate) {
    return { decisao: 'confirmado', empresa: primeira, sugestoes };
  }
  return { decisao: 'confirmar', empresa: null, sugestoes };
}
