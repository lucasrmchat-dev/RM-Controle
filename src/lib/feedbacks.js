/**
 * Feedbacks: regras puras (etapas, quem é da área de desenvolvimento, subtarefas e prazos).
 * Usadas no navegador e no servidor; testadas em tests/feedbacks.test.js.
 */

// Ordem do pipeline. Os ids são fixos (ficam gravados no banco); os nomes são editáveis.
export const ETAPAS_FEEDBACK = ['em_analise', 'no_roadmap', 'em_correcao', 'resolvido'];

export const NOMES_ETAPAS_PADRAO = {
  em_analise: 'Triagem',
  no_roadmap: 'Planejado',
  em_correcao: 'Em andamento',
  resolvido: 'Concluído',
};

export const CONFIG_FEEDBACKS_PADRAO = { etapas: NOMES_ETAPAS_PADRAO, departamentos_dev: [] };

export const TIPOS_FEEDBACK = {
  bug: { rotulo: 'Problema', descricao: 'Algo não funciona como deveria' },
  melhoria: { rotulo: 'Melhoria', descricao: 'Funciona, mas pode ficar melhor' },
  ideia: { rotulo: 'Ideia', descricao: 'Algo novo que ainda não existe' },
  novidade: { rotulo: 'Novidade', descricao: 'Aviso da equipe de desenvolvimento' },
};

/** Tipos antigos gravados no banco viram um dos tipos atuais. */
export function tipoFeedback(tipo) {
  if (tipo === 'bug' || tipo === 'melhoria' || tipo === 'novidade') return tipo;
  return 'ideia'; // 'ideia', 'sugestao', 'outro'
}

export const MODULOS_FEEDBACK = [
  'Fila de Demandas',
  'Agenda',
  'Comercial',
  'Dashboard',
  'Feedbacks',
  'Empresas',
  'Configurações',
  'Notificações',
  'Login e conta',
  'Geral',
];

export const etapaDe = (fb) => (ETAPAS_FEEDBACK.includes(fb?.status) ? fb.status : 'em_analise');

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

/** Valida a configuração salva por administradores (Configurações › Feedbacks). */
export function validarConfigFeedbacks(valor) {
  const etapas = {};
  for (const id of ETAPAS_FEEDBACK) {
    etapas[id] = texto(valor?.etapas?.[id], 40) || NOMES_ETAPAS_PADRAO[id];
  }
  const deps = Array.isArray(valor?.departamentos_dev) ? valor.departamentos_dev : [];
  return { etapas, departamentos_dev: [...new Set(deps.map((d) => texto(d, 60)).filter(Boolean))] };
}

const norm = (s) => String(s || '').toLowerCase().trim();

/**
 * A pessoa trabalha no desenvolvimento do sistema? Administradores sempre;
 * os demais quando atendem um departamento marcado como de desenvolvimento.
 * @param perm resultado de permissoesEfetivas
 * @param membro linha de equipe_usuarios (para quem ainda não tem perfil)
 */
export function ehDesenvolvimento(perm, membro, config = CONFIG_FEEDBACKS_PADRAO) {
  if (perm?.administrador) return true;
  const alvo = (config?.departamentos_dev || []).map(norm);
  if (!alvo.length) return false;
  let meus;
  if (perm?.perfil) {
    if (perm.departamentos === null) return true; // perfil com todos os departamentos
    meus = perm.departamentos || [];
  } else {
    meus = Array.isArray(membro?.departamentos) ? membro.departamentos : [];
  }
  return meus.some((d) => alvo.includes(norm(d)));
}

// ------------------------------------------------------------------------------
// Prazos e subtarefas
// ------------------------------------------------------------------------------
/** Prazo guardado como dia (YYYY-MM-DD); vence no fim do dia. */
export function prazoVencido(prazo, agora = new Date()) {
  if (!prazo) return false;
  const [a, m, d] = String(prazo).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return false;
  return new Date(a, m - 1, d, 23, 59, 59).getTime() < agora.getTime();
}

export function diasAtePrazo(prazo, agora = new Date()) {
  if (!prazo) return null;
  const [a, m, d] = String(prazo).slice(0, 10).split('-').map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo - hoje) / 86400000);
}

export function novaSubtarefa(titulo, { prazo = null, autor = '' } = {}, agora = new Date()) {
  const t = texto(titulo, 200);
  if (!t) throw new Error('Escreva a subtarefa.');
  return {
    id: `st_${agora.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    titulo: t,
    prazo: prazo || null,
    criada_em: agora.toISOString(),
    criada_por: autor || '',
    concluida_em: null,
  };
}

/** Limpa a lista antes de gravar (campos conhecidos, tamanhos limitados). */
export function validarSubtarefas(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((s) => s && texto(s.titulo, 200))
    .slice(0, 100)
    .map((s) => ({
      id: texto(s.id, 60) || `st_${Math.random().toString(36).slice(2, 10)}`,
      titulo: texto(s.titulo, 200),
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(String(s.prazo || '')) ? s.prazo : null,
      criada_em: s.criada_em || new Date().toISOString(),
      criada_por: texto(s.criada_por, 120),
      concluida_em: s.concluida_em || null,
    }));
}

export function progressoSubtarefas(lista = []) {
  const total = lista.length;
  const feitas = lista.filter((s) => s.concluida_em).length;
  const atrasadas = lista.filter((s) => !s.concluida_em && prazoVencido(s.prazo)).length;
  return { total, feitas, atrasadas, fracao: total ? feitas / total : 0 };
}

/**
 * Texto pronto para colar para quem vai implementar: o relato original, sem reescrever,
 * mais o contexto (ticket, autor, etapa, prazo, subtarefas) e o pedido de registrar a novidade.
 */
export function briefingImplementacao(fb, { nomesEtapas = NOMES_ETAPAS_PADRAO, ticket = '', autor = '' } = {}) {
  const tipo = TIPOS_FEEDBACK[tipoFeedback(fb.tipo)].rotulo;
  const data = fb.created_at ? new Date(fb.created_at).toLocaleDateString('pt-BR') : '';
  const prioridade = { normal: 'normal', alta: 'alta', critica: 'impede o trabalho' }[fb.prioridade] || 'normal';
  const subtarefas = Array.isArray(fb.subtarefas) ? fb.subtarefas : [];
  const linhas = [
    `Implemente o ticket ${ticket} do RM Controle.`,
    '',
    `Tipo: ${tipo} · Prioridade: ${prioridade} · Parte do sistema: ${fb.modulo_afetado || 'Geral'}`,
    `Aberto por ${autor || fb.autor_nome || fb.autor_email || 'alguém da equipe'} em ${data} · Etapa atual: ${nomesEtapas[etapaDe(fb)]}`,
  ];
  if (fb.prazo) linhas.push(`Prazo: ${String(fb.prazo).slice(0, 10).split('-').reverse().join('/')}`);
  linhas.push('', `Título: ${fb.titulo}`, '', 'Relato original (como foi escrito):', '"""', String(fb.descricao || '').trim(), '"""');
  if (subtarefas.length) {
    linhas.push('', 'Subtarefas já definidas:');
    subtarefas.forEach((s) => linhas.push(`- [${s.concluida_em ? 'x' : ' '}] ${s.titulo}${s.prazo ? ` (prazo ${s.prazo.split('-').reverse().join('/')})` : ''}`));
  }
  if (fb.imagem_url) linhas.push('', 'Há um print anexado ao ticket no sistema (copie a imagem pela estação de trabalho).');
  linhas.push('', `Ao terminar, registre a melhoria em src/lib/novidades.js citando o ticket ${ticket} (id ${fb.id}).`);
  return linhas.join('\n');
}
