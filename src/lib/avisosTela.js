/**
 * Avisos na tela (Configurações › Aparência): como as notificações aparecem enquanto a pessoa trabalha.
 * Vale para este navegador. As notificações em si continuam no sino (lib/notificacoes).
 */
export const CHAVE_AVISOS = 'rm_avisos_tela';
export const EVENTO_AVISOS_CONFIG = 'rm_avisos_tela_config';

export const ESTILOS_AVISO = [
  { id: 'ilha', nome: 'Na ilha do cabeçalho', descricao: 'A pílula do topo cresce e mostra o aviso, como a Dynamic Island.' },
  { id: 'sino', nome: 'Abaixo do sino', descricao: 'Cartões pequenos saem logo abaixo do sino de notificações.' },
  { id: 'canto', nome: 'Canto inferior', descricao: 'Cartões empilhados no canto inferior direito.' },
  { id: 'faixa', nome: 'Faixa no rodapé', descricao: 'Uma linha discreta no centro de baixo, só com o essencial.' },
  { id: 'lateral', nome: 'Aba lateral', descricao: 'Cartões finos presos à borda direita; não cobrem o conteúdo.' },
  { id: 'desligado', nome: 'Só no sino', descricao: 'Nada aparece na tela; os avisos ficam no sino.' },
];
export const TIPOS_AVISO = [
  { id: 'chat', nome: 'Chat do WhatsApp', tipos: ['chat'] },
  { id: 'fila', nome: 'Fila de Demandas', tipos: ['demanda', 'sla', 'prazo'] },
  { id: 'agenda', nome: 'Agenda', tipos: ['reuniao'] },
  { id: 'outros', nome: 'Outros (feedbacks, novidades)', tipos: ['feedback', 'sistema'] },
];
export const DURACOES_AVISO = [4, 6, 10, 20, 0]; // 0 = até fechar
export const CORES_FLASH = [
  { id: 'acento', nome: 'Cor do sistema', valor: 'rgb(var(--rm-acento-medio))' },
  { id: 'ambar', nome: 'Âmbar', valor: '#f59e0b' },
  { id: 'vermelho', nome: 'Vermelho', valor: '#ef4444' },
  { id: 'azul', nome: 'Azul', valor: '#3b82f6' },
  { id: 'verde', nome: 'Verde', valor: '#22c55e' },
  { id: 'roxo', nome: 'Roxo', valor: '#a855f7' },
];
export const REPETICOES_FLASH = [
  { id: 'uma', nome: 'Uma vez' },
  { id: 'tres', nome: 'Três vezes' },
  { id: 'intermitente', nome: 'Repetir até eu ver' },
];
export const INTERVALOS_FLASH = [30, 60, 300];

export const AVISOS_PADRAO = {
  estilo: 'ilha',
  tipos: TIPOS_AVISO.map((t) => t.id),
  duracao: 6,
  maximo: 3,
  flash: false,
  flashCor: 'acento',
  flashRepeticao: 'uma',
  flashIntervalo: 60,
};

export function validarAvisos(v = {}) {
  const ids = TIPOS_AVISO.map((t) => t.id);
  return {
    estilo: ESTILOS_AVISO.some((e) => e.id === v.estilo) ? v.estilo : AVISOS_PADRAO.estilo,
    tipos: Array.isArray(v.tipos) ? v.tipos.filter((t) => ids.includes(t)) : AVISOS_PADRAO.tipos,
    duracao: DURACOES_AVISO.includes(Number(v.duracao)) ? Number(v.duracao) : AVISOS_PADRAO.duracao,
    maximo: [1, 2, 3].includes(Number(v.maximo)) ? Number(v.maximo) : AVISOS_PADRAO.maximo,
    flash: typeof v.flash === 'boolean' ? v.flash : AVISOS_PADRAO.flash,
    flashCor: CORES_FLASH.some((c) => c.id === v.flashCor) ? v.flashCor : AVISOS_PADRAO.flashCor,
    flashRepeticao: REPETICOES_FLASH.some((r) => r.id === v.flashRepeticao) ? v.flashRepeticao : AVISOS_PADRAO.flashRepeticao,
    flashIntervalo: INTERVALOS_FLASH.includes(Number(v.flashIntervalo)) ? Number(v.flashIntervalo) : AVISOS_PADRAO.flashIntervalo,
  };
}

export function lerAvisos() {
  if (typeof window === 'undefined') return { ...AVISOS_PADRAO };
  try {
    return validarAvisos(JSON.parse(localStorage.getItem(CHAVE_AVISOS) || '{}'));
  } catch {
    return { ...AVISOS_PADRAO };
  }
}

export function salvarAvisos(campos) {
  const novo = validarAvisos({ ...lerAvisos(), ...campos });
  try {
    localStorage.setItem(CHAVE_AVISOS, JSON.stringify(novo));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENTO_AVISOS_CONFIG, { detail: novo }));
  return novo;
}

/** A notificação deve aparecer na tela com esta configuração? */
export function deveMostrar(n, config) {
  if (!n || config.estilo === 'desligado') return false;
  const grupo = TIPOS_AVISO.find((t) => t.tipos.includes(n.tipo))?.id || 'outros';
  return config.tipos.includes(grupo);
}
