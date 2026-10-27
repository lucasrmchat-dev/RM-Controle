/**
 * Paletas de cor do sistema (Configurações › Visualização). Cada uma define o destaque e os fundos,
 * no modo claro e no escuro. As cores viram variáveis CSS (globals.css) usadas pelas classes rm-*.
 * Fica neste navegador (como o tema claro/escuro).
 */
export const CHAVE_PALETA = 'rm_paleta';
export const PALETA_PADRAO = 'whatsapp';

// amostra: [destaque claro, destaque escuro, fundo claro, fundo escuro, cartão escuro] (para os botões de escolha)
export const PALETAS = [
  { id: 'whatsapp', nome: 'WhatsApp', descricao: 'Verde-azulado, como o Chat', amostra: ['#008069', '#00a884', '#f0f2f5', '#0b141a', '#111b21'] },
  { id: 'verde', nome: 'Verde RM', descricao: 'O verde-limão original', amostra: ['#4d7c0f', '#84cc16', '#f5f5f7', '#141416', '#1e1e21'] },
  { id: 'azul', nome: 'Azul', descricao: 'Azul sereno', amostra: ['#2563eb', '#60a5fa', '#f3f6fb', '#0b1220', '#121b2e'] },
  { id: 'roxo', nome: 'Roxo', descricao: 'Violeta', amostra: ['#7c3aed', '#a78bfa', '#f6f4fb', '#110e1a', '#1a1526'] },
  { id: 'rosa', nome: 'Rosa', descricao: 'Rosa vibrante', amostra: ['#db2777', '#f472b6', '#fbf4f8', '#160d13', '#21141c'] },
  { id: 'laranja', nome: 'Laranja', descricao: 'Laranja quente', amostra: ['#c2410c', '#fb923c', '#faf6f2', '#17110c', '#221911'] },
  { id: 'grafite', nome: 'Grafite', descricao: 'Neutro, sem cor', amostra: ['#3f3f46', '#d4d4d8', '#f5f5f7', '#121214', '#1c1c1f'] },
];
const IDS = PALETAS.map((p) => p.id);

export function lerPaleta() {
  try {
    const v = localStorage.getItem(CHAVE_PALETA);
    return IDS.includes(v) ? v : PALETA_PADRAO;
  } catch {
    return PALETA_PADRAO;
  }
}

export function aplicarPaleta(id) {
  const valida = IDS.includes(id) ? id : PALETA_PADRAO;
  document.documentElement.dataset.paleta = valida;
  try {
    localStorage.setItem(CHAVE_PALETA, valida);
  } catch {}
  window.dispatchEvent(new CustomEvent('rm_paleta_atualizada', { detail: valida }));
}

// Roda antes da primeira pintura (layout.js), junto com o tema, para não piscar a cor errada
export const SCRIPT_PALETA_INICIAL = `(function(){try{var p=localStorage.getItem('${CHAVE_PALETA}');document.documentElement.dataset.paleta=${JSON.stringify(IDS)}.indexOf(p)>=0?p:'${PALETA_PADRAO}';}catch(e){document.documentElement.dataset.paleta='${PALETA_PADRAO}';}})();`;
