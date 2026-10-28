/**
 * Modo foco (Demandas): o que fica silenciado enquanto a pessoa está focada.
 *
 * - apenas: só a tela de foco; sons, avisos e cabeçalho seguem como estão
 * - parcial: a pessoa escolhe (silenciar sons, esconder avisos na tela, recolher o cabeçalho)
 * - total: silencia tudo e recolhe o cabeçalho
 *
 * Os efeitos valem para a aba do navegador (sessionStorage), sobrevivem a ir à empresa e voltar, e
 * acabam ao sair do foco. As notificações continuam chegando no sino.
 */
export const EVENTO_FOCO = 'rm_foco_mudou';
const CHAVE_EFEITOS = 'rm_foco_efeitos';
const CHAVE_PREFERENCIA = 'rm_foco_preferencia';

export const MODOS_FOCO = [
  { id: 'apenas', titulo: 'Apenas modo foco', descricao: 'A tela especial para executar as tarefas, sem mexer nos sons e notificações do sistema.' },
  { id: 'parcial', titulo: 'Modo foco parcial', descricao: 'Você escolhe o que pausar: sons, avisos na tela e se o cabeçalho recolhe.' },
  { id: 'total', titulo: 'Modo foco total', descricao: 'Pausa sons e avisos e recolhe o cabeçalho. Só você e a tarefa.' },
];

export const PARCIAL_PADRAO = { silenciarSom: true, silenciarAvisos: false, recolher: false };

const SEM_EFEITO = { modo: 'apenas', silenciarSom: false, silenciarAvisos: false, recolher: false };

/** Efeitos de cada modo (no parcial, as escolhas da pessoa). */
export function efeitosDoModo(modo, parcial = PARCIAL_PADRAO) {
  if (modo === 'total') return { modo, silenciarSom: true, silenciarAvisos: true, recolher: true };
  if (modo === 'parcial') return { modo, silenciarSom: Boolean(parcial.silenciarSom), silenciarAvisos: Boolean(parcial.silenciarAvisos), recolher: Boolean(parcial.recolher) };
  return { ...SEM_EFEITO };
}

/** Efeitos em vigor agora (sem foco aberto: nenhum). */
export function efeitosDoFoco() {
  if (typeof window === 'undefined') return SEM_EFEITO;
  try {
    const e = JSON.parse(sessionStorage.getItem(CHAVE_EFEITOS) || 'null');
    return e ? { ...SEM_EFEITO, ...e } : SEM_EFEITO;
  } catch {
    return SEM_EFEITO;
  }
}

/** Liga (objeto de efeitos) ou desliga (null) os efeitos do foco e avisa o cabeçalho, sons e avisos. */
export function definirEfeitosDoFoco(efeitos) {
  if (typeof window === 'undefined') return;
  try {
    if (efeitos) sessionStorage.setItem(CHAVE_EFEITOS, JSON.stringify(efeitos));
    else sessionStorage.removeItem(CHAVE_EFEITOS);
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENTO_FOCO, { detail: efeitos ? { ...SEM_EFEITO, ...efeitos } : SEM_EFEITO }));
}

export const focoSilenciaSom = () => efeitosDoFoco().silenciarSom;
export const focoSilenciaAvisos = () => efeitosDoFoco().silenciarAvisos;
export const focoRecolheCabecalho = () => efeitosDoFoco().recolher;

/** Última escolha da pessoa (modo e opções do parcial), lembrada neste navegador. */
export function lerPreferenciaFoco() {
  const padrao = { modo: 'apenas', parcial: { ...PARCIAL_PADRAO } };
  if (typeof window === 'undefined') return padrao;
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIA) || 'null');
    if (!p) return padrao;
    return {
      modo: MODOS_FOCO.some((m) => m.id === p.modo) ? p.modo : 'apenas',
      parcial: { ...PARCIAL_PADRAO, ...(p.parcial || {}) },
    };
  } catch {
    return padrao;
  }
}

export function salvarPreferenciaFoco(preferencia) {
  try {
    localStorage.setItem(CHAVE_PREFERENCIA, JSON.stringify(preferencia));
  } catch {}
}
