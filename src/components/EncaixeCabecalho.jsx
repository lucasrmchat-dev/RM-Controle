'use client';

/**
 * Espaço da ilha do cabeçalho no meio da linha de título da tela (computador, a partir de 1024px).
 * A ilha fica sempre no mesmo lugar (topo, centro da janela); este espaço tem a largura dela e fica na coluna
 * do meio de uma linha em três colunas (LINHA_TITULO), então nada da tela fica por baixo dela.
 */
export default function EncaixeCabecalho({ className = '' }) {
  return <div data-encaixe-cabecalho aria-hidden="true" className={`hidden lg:block h-12 flex-shrink-0 ${className}`} style={{ width: 'calc(var(--rm-ilha-largura, 640px) + 24px)' }} />;
}

/** Classes da linha de título: a partir de 1024px vira três colunas (título | ilha | ações), com o meio centrado. */
export const LINHA_TITULO = 'lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start lg:gap-4';
/** Classes do bloco de ações (terceira coluna), alinhado à direita. */
export const ACOES_TITULO = 'lg:justify-self-end';
