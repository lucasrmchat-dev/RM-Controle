// Preferência de aparência: 'light' | 'dark' | 'system' (segue o sistema operacional).
export const CHAVE_TEMA = 'rm_theme';

export function lerPreferenciaTema() {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

export function temaEfetivo(pref) {
  if (pref === 'system') {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref === 'dark' ? 'dark' : 'light';
}

export function aplicarTema(pref) {
  document.documentElement.classList.toggle('dark', temaEfetivo(pref) === 'dark');
}

export function salvarPreferenciaTema(pref) {
  try {
    localStorage.setItem(CHAVE_TEMA, pref);
  } catch {}
  aplicarTema(pref);
}

// Roda antes da primeira pintura (layout.js) para não piscar o tema errado
export const SCRIPT_TEMA_INICIAL = `(function(){try{var p=localStorage.getItem('${CHAVE_TEMA}');var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
