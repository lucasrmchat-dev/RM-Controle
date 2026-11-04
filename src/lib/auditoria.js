/**
 * Auditoria: o que cada ação registrada significa, em que módulo aconteceu e como descrevê-la.
 *
 * Os registros (tabela auditoria_logs, imutável) são gravados SEMPRE pelo servidor: é ele que sabe
 * quem é a pessoa (sessão), o nome dela na equipe, o IP real de onde veio a ação e o navegador.
 * O navegador só diz o que aconteceu (POST /api/auditoria); nunca quem fez nem de onde.
 */

// tom: cor do selo da ação na tela
const A = (rotulo, modulo, tom = 'neutro') => ({ rotulo, modulo, tom });

export const ACOES_AUDITORIA = {
  // Demandas
  adicionou_chamado_na_fila: A('Abriu demanda', 'Demandas', 'azul'),
  iniciou_suporte_tecnico: A('Iniciou atendimento', 'Demandas', 'azul'),
  assumiu_suporte_tecnico: A('Assumiu demanda', 'Demandas', 'azul'),
  aguardando_retorno_cliente: A('Pôs aguardando o cliente', 'Demandas', 'ambar'),
  finalizou_suporte_tecnico: A('Concluiu demanda', 'Demandas', 'verde'),
  cancelou_suporte_tecnico: A('Cancelou demanda', 'Demandas', 'vermelho'),
  reatribuiu_chamado: A('Transferiu demanda', 'Demandas', 'azul'),
  editou_descricao_chamado: A('Editou a descrição da demanda', 'Demandas'),
  atualizou_etiquetas_chamado: A('Alterou etiquetas da demanda', 'Demandas'),
  excluiu_historico_chamado: A('Excluiu demanda do histórico', 'Demandas', 'vermelho'),
  registrou_suporte_retroativo: A('Registrou suporte retroativo', 'Demandas'),
  integracao_abriu_demanda: A('Demanda aberta pela integração', 'Demandas', 'azul'),
  // Empresas
  cadastrou_empresa_manual: A('Cadastrou empresa', 'Empresas', 'roxo'),
  cadastrou_empresas_em_massa: A('Importou empresas', 'Empresas', 'roxo'),
  cadastrou_empresas_massa: A('Importou empresas', 'Empresas', 'roxo'),
  atualizou_dados_empresa: A('Alterou dados da empresa', 'Empresas'),
  excluiu_empresa: A('Excluiu empresa', 'Empresas', 'vermelho'),
  adicionou_colaborador_empresa: A('Adicionou colaborador', 'Empresas'),
  removeu_colaborador_empresa: A('Removeu colaborador', 'Empresas', 'vermelho'),
  adicionou_observacao: A('Adicionou observação', 'Empresas'),
  removeu_observacao: A('Removeu observação', 'Empresas', 'vermelho'),
  adicionou_canal_empresa: A('Vinculou canal à empresa', 'Empresas'),
  removeu_canal_empresa: A('Desvinculou canal da empresa', 'Empresas', 'vermelho'),
  atualizou_configuracoes_servidor: A('Alterou dados do servidor', 'Servidor da empresa'),
  atualizou_checklist_item: A('Alterou item do checklist', 'Servidor da empresa'),
  adicionou_requisito_checklist: A('Adicionou item ao checklist', 'Servidor da empresa'),
  // Credenciais
  visualizou_senha_suporte: A('Viu uma senha', 'Credenciais', 'ambar'),
  adicionou_credencial_suporte: A('Cadastrou acesso', 'Credenciais', 'verde'),
  alterou_credencial_suporte: A('Alterou acesso', 'Credenciais', 'ambar'),
  alterou_credenciais_suporte: A('Alterou acesso', 'Credenciais', 'ambar'),
  removeu_credencial_suporte: A('Removeu acesso', 'Credenciais', 'vermelho'),
  // Base de soluções e feedbacks
  adicionou_solucao_base_conhecimento: A('Adicionou solução', 'Base de soluções'),
  excluiu_solucao_base_conhecimento: A('Excluiu solução', 'Base de soluções', 'vermelho'),
  registrou_feedback_ou_bug: A('Enviou feedback', 'Feedbacks'),
  atualizou_feedback: A('Editou feedback', 'Feedbacks'),
  atualizou_status_feedback: A('Mudou o status de um feedback', 'Feedbacks'),
  // Equipe e acesso
  cadastrou_novo_usuario: A('Cadastrou pessoa na equipe', 'Equipe', 'roxo'),
  concluiu_primeiro_acesso_onboarding: A('Concluiu o primeiro acesso', 'Equipe'),
  // Chat
  chat_iniciou: A('Iniciou conversa', 'Chat', 'azul'),
  chat_visualizou: A('Abriu conversa', 'Chat'),
  chat_assumiu: A('Assumiu conversa', 'Chat', 'azul'),
  chat_transferiu: A('Transferiu conversa', 'Chat', 'azul'),
  chat_devolveu: A('Devolveu conversa para a fila', 'Chat', 'ambar'),
  chat_resolveu: A('Resolveu conversa', 'Chat', 'verde'),
  chat_reabriu: A('Reabriu conversa', 'Chat'),
  chat_apagou_mensagem: A('Apagou mensagem', 'Chat', 'vermelho'),
  chat_editou_mensagem: A('Editou mensagem', 'Chat', 'ambar'),
  chat_excluiu: A('Excluiu conversa', 'Chat', 'vermelho'),
  chat_mesclou: A('Juntou conversas', 'Chat'),
  chat_enviou_meet: A('Enviou reunião do Meet', 'Chat', 'azul'),
  // Canais
  canal_criou: A('Criou canal', 'Canais', 'verde'),
  canal_editou: A('Editou canal', 'Canais'),
  canal_conectou: A('Conectou canal', 'Canais', 'verde'),
  canal_desconectou: A('Desconectou canal', 'Canais', 'vermelho'),
  canal_reiniciou: A('Reiniciou canal', 'Canais', 'ambar'),
  canal_ativou: A('Ativou canal', 'Canais', 'verde'),
  canal_desativou: A('Desativou canal', 'Canais', 'ambar'),
  canal_mesclou: A('Mesclou canais', 'Canais'),
  // Plataforma
  plataforma_entrou_suporte: A('Entrou na empresa como suporte', 'Plataforma', 'ambar'),
};

/** Nome amigável de uma ação desconhecida: "algo_feito" → "Algo feito". */
const rotuloGenerico = (acao) => {
  const t = String(acao || 'ação').replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const MODULOS_ANTIGOS = { 'Fila de Suporte': 'Demandas', 'Suporte em Tempo Real': 'Demandas', 'Credenciais & Acessos': 'Credenciais', 'Checklist do Servidor': 'Servidor da empresa' };

/** Campos de detalhes que viram a descrição (na ordem), com o rótulo de cada um. */
const CAMPOS_DESCRICAO = [
  ['descricao', null],
  ['contato_nome', 'Contato'],
  ['canal', 'Canal'],
  ['motivo', 'Motivo'],
  ['status_resolucao', 'Desfecho'],
  ['atribuido_a', 'Para'],
  ['para', 'Para'],
  ['de', 'De'],
  ['rotulo', 'Acesso'],
  ['titulo', 'Título'],
  ['nome', 'Nome'],
  ['cargo', 'Cargo'],
  ['papel', 'Papel'],
  ['novo_status', 'Novo status'],
  ['quantidade', 'Quantidade'],
];
// Nestas ações o "nome" guardado é o da própria empresa
const ACOES_COM_NOME_DA_EMPRESA = new Set(['cadastrou_empresa_manual', 'atualizou_dados_empresa', 'excluiu_empresa']);
const DESFECHOS = { resolvido: 'resolvido', nao_resolvido: 'não resolvido', sem_resposta: 'sem retorno do cliente' };

/** Como mostrar um registro: ação, módulo, descrição, empresa, IP, navegador e tom do selo. */
export function descreverLog(log) {
  const d = log?.detalhes && typeof log.detalhes === 'object' ? log.detalhes : {};
  const conhecida = ACOES_AUDITORIA[log?.acao];
  const modulo = conhecida?.modulo || MODULOS_ANTIGOS[d.modulo] || d.modulo || 'Sistema';
  const partes = [];
  for (const [campo, rotulo] of CAMPOS_DESCRICAO) {
    if (campo === 'nome' && ACOES_COM_NOME_DA_EMPRESA.has(log?.acao)) continue;
    let v = d[campo];
    if (v === undefined || v === null || v === '' || typeof v === 'object') continue;
    if (campo === 'status_resolucao') v = DESFECHOS[v] || v;
    partes.push(rotulo ? `${rotulo}: ${v}` : String(v));
  }
  if (typeof d.duracao_segundos === 'number' && d.duracao_segundos > 0) partes.push(`Tempo: ${Math.max(1, Math.round(d.duracao_segundos / 60))} min`);
  return {
    acao: conhecida?.rotulo || rotuloGenerico(log?.acao),
    modulo,
    tom: conhecida?.tom || 'neutro',
    descricao: partes.join(' · '),
    empresa: log?.empresa_nome || d.empresa_nome || d.empresa || (ACOES_COM_NOME_DA_EMPRESA.has(log?.acao) ? d.nome : '') || '',
    ip: log?.ip_origem && !/rede local|cliente seguro/i.test(log.ip_origem) ? log.ip_origem : d.ip || '',
    navegador: d.navegador || '',
    nome: log?.usuario_nome || log?.operador_nome || '',
    email: log?.usuario_email || '',
  };
}

// ------------------------------------------------------------------------------
// Registro vindo do navegador (POST /api/auditoria): só o "o quê", validado
// ------------------------------------------------------------------------------
const ACAO_VALIDA = /^[a-z][a-z0-9_]{1,59}$/;
const LIMITE_DETALHES = 4000;

/** Detalhes planos e curtos (texto, número, booleano); o resto é descartado. Campos de identidade e rede são do servidor. */
function limparDetalhes(detalhes) {
  const fora = new Set(['ip', 'ip_origem', 'navegador', 'usuario_nome', 'usuario_email', 'operador_nome', 'rede']);
  const saida = {};
  if (!detalhes || typeof detalhes !== 'object') return saida;
  for (const [chave, valor] of Object.entries(detalhes).slice(0, 30)) {
    if (fora.has(chave) || !/^[a-z][a-z0-9_]{0,39}$/i.test(chave)) continue;
    if (typeof valor === 'string') saida[chave] = valor.slice(0, 500);
    else if (typeof valor === 'number' && Number.isFinite(valor)) saida[chave] = valor;
    else if (typeof valor === 'boolean') saida[chave] = valor;
  }
  return JSON.stringify(saida).length > LIMITE_DETALHES ? {} : saida;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida o pedido de registro. Lança Error com mensagem para a pessoa. */
export function validarEventoAuditoria(body) {
  const acao = String(body?.acao || '').trim();
  if (!ACAO_VALIDA.test(acao)) throw new Error('Ação de auditoria inválida.');
  const detalhes = limparDetalhes(body?.detalhes);
  return {
    acao,
    empresa_id: UUID.test(String(body?.empresaId || '')) ? body.empresaId : null,
    detalhes: { ...detalhes, modulo: ACOES_AUDITORIA[acao]?.modulo || MODULOS_ANTIGOS[detalhes.modulo] || detalhes.modulo || 'Sistema' },
  };
}

// ------------------------------------------------------------------------------
// Dias (no fuso de quem consulta)
// ------------------------------------------------------------------------------
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Início e fim do dia `YYYY-MM-DD` no fuso de quem consulta (`fuso` = Date#getTimezoneOffset, em minutos). */
export function limitesDoDia(dia, fuso = 0) {
  if (!DIA.test(String(dia || ''))) throw new Error('Dia inválido.');
  const [a, m, d] = dia.split('-').map(Number);
  const desloc = Math.max(-840, Math.min(840, Number(fuso) || 0)) * 60000;
  const de = Date.UTC(a, m - 1, d) + desloc;
  if (Number.isNaN(de)) throw new Error('Dia inválido.');
  return { de: new Date(de).toISOString(), ate: new Date(de + 86400000).toISOString() };
}

/** Termo de busca seguro para o filtro do banco (sem os caracteres que mudam a consulta). */
export const termoDeBusca = (texto) => String(texto || '').replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 60);

/** Resumo do navegador a partir do User-Agent: "Chrome 130 · macOS". */
export function resumoNavegador(ua) {
  const s = String(ua || '');
  if (!s) return '';
  const nav =
    (/Edg\/(\d+)/.exec(s) && `Edge ${/Edg\/(\d+)/.exec(s)[1]}`) ||
    (/OPR\/(\d+)/.exec(s) && `Opera ${/OPR\/(\d+)/.exec(s)[1]}`) ||
    (/Chrome\/(\d+)/.exec(s) && `Chrome ${/Chrome\/(\d+)/.exec(s)[1]}`) ||
    (/Firefox\/(\d+)/.exec(s) && `Firefox ${/Firefox\/(\d+)/.exec(s)[1]}`) ||
    (/Version\/(\d+).*Safari/.exec(s) && `Safari ${/Version\/(\d+).*Safari/.exec(s)[1]}`) ||
    'Navegador';
  const so = /iPhone|iPad/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : '';
  return so ? `${nav} · ${so}` : nav;
}
