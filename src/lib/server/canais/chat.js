/**
 * Chat: quem vê cada conversa e as ações de atendimento. Mesma regra da RLS do banco
 * (supabase/migration_canais_chat.sql): administrador vê todas; os demais, as dos seus departamentos,
 * as sem departamento e as que estão com eles.
 */
import { modulosDaEmpresa } from '@/lib/plataforma';
import { permissoesEfetivas, podeVerDepartamento } from '@/lib/perfis';
import { normalizarEmail } from '@/lib/roles';
import { canalPublico } from '@/lib/server/canais/index';
import { ACESSO_CHAT_PADRAO, CHAVE_ACESSO_CHAT, ehGrupo, nomePeloEmail, trocarMencoes, validarAcessoChat } from '@/lib/canais';
import { nomesDoGrupo } from '@/lib/server/canais/grupos';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { acoesPossiveis } from '@/lib/server/canais/acoes';
import { isValidUUID } from '@/lib/sanitize';

const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

/** Sessão + permissão do Chat. Devolve { erro } (resposta pronta) ou { ctx, perm }. */
/** Mensagem de bloqueio quando a pessoa não tem o módulo (plano da empresa ou perfil), ou null. */
export function semModulo(perm, modulo, nome) {
  if (Array.isArray(perm.contratados) && !perm.contratados.includes(modulo)) return `Este módulo não faz parte do plano da sua empresa.`;
  return perm.modulos.includes(modulo) ? null : `Seu perfil não tem acesso ${nome}.`;
}

export async function acessoAoChat(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const bloqueio = semModulo(perm, 'chat', 'ao Chat');
  if (bloqueio) return { erro: json({ ok: false, mensagem: bloqueio }, 403) };
  return { ctx, perm };
}

/** Conversa que a pessoa pode ver (outra conversa responde como inexistente, sem revelar que existe). */
export async function carregarConversa(request, id) {
  const r = await acessoAoChat(request);
  if (r.erro) return r;
  if (!isValidUUID(id)) return { erro: json({ ok: false, mensagem: 'Conversa inválida.' }, 400) };
  const { data: conversa } = await r.ctx.db.from('conversas').select('*').eq('id', id).maybeSingle();
  if (!conversa || !podeVerConversa(r.perm, conversa)) return { erro: json({ ok: false, mensagem: 'Conversa não encontrada.' }, 404) };
  return { ...r, conversa };
}

/** A pessoa vê este contato? (administrador, ou se vê ao menos uma conversa dele) */
export async function podeVerContato(db, perm, contatoId) {
  if (!isValidUUID(contatoId)) return false;
  if (perm.administrador) {
    const { data } = await db.from('contatos').select('id').eq('id', contatoId).maybeSingle();
    return Boolean(data);
  }
  const [{ data }, { data: existe }] = await Promise.all([db.from('conversas').select('*').eq('contato_id', contatoId), db.from('contatos').select('id').eq('id', contatoId).maybeSingle()]);
  // Contato sem nenhuma conversa (da agenda ou dos grupos): é da empresa toda
  if (existe && !(data || []).length) return true;
  return (data || []).some((c) => podeVerConversa(perm, c));
}

const MEMORIA_PERM_MS = process.env.NODE_ENV === 'production' ? 10000 : 0;
const memoriaPerm = new Map();

/** Permissão da pessoa no Chat (memória de 10 s por servidor: várias chamadas da mesma tela usam a mesma). */
export async function permissaoDoChat(db, email) {
  const chave = `${db.organizacaoId || 'legado'}:${normalizarEmail(email)}`;
  const guardada = memoriaPerm.get(chave);
  if (MEMORIA_PERM_MS && guardada && Date.now() - guardada.em < MEMORIA_PERM_MS) return guardada.perm;
  const perm = await permissaoDoBanco(db, email);
  if (MEMORIA_PERM_MS) {
    if (memoriaPerm.size > 2000) memoriaPerm.clear();
    memoriaPerm.set(chave, { em: Date.now(), perm });
  }
  return perm;
}

async function permissaoDoBanco(db, email) {
  const alvo = normalizarEmail(email);
  const [equipe, perfis, acesso, org] = await Promise.all([
    db.from('equipe_usuarios').select('*'),
    db.from('perfis_acesso').select('*'),
    db.from('sistema_config').select('valor').eq('chave', CHAVE_ACESSO_CHAT).maybeSingle(),
    // Módulos que a empresa contratou valem para todos, inclusive administradores
    db.organizacaoId ? db.from('organizacoes').select('tipo, limites').eq('id', db.organizacaoId).maybeSingle() : { data: null },
  ]);
  const linhas = (equipe.data || []).map(({ senha, ...resto }) => resto);
  const contratados = modulosDaEmpresa(org.data);
  const perm = { ...permissoesEfetivas({ email: alvo, equipe: linhas, perfis: perfis.data || [], adminsExtras: process.env.RM_ADMIN_EMAILS, modulosDaEmpresa: contratados }), contratados };
  const membro = linhas.find((u) => normalizarEmail(u.email) === alvo);
  const chat = { ...ACESSO_CHAT_PADRAO, ...validarAcessoChat(acesso.data?.valor?.[alvo] || {}) };
  return { ...perm, email: alvo, nome: membro?.nome || nomePeloEmail(alvo), chat };
}

/**
 * Canal liberado para a pessoa (Servidores e equipe › Chat do WhatsApp › canais liberados).
 * Com o controle ligado vale para todos, inclusive administradores: só os canais marcados aparecem
 * nas listas e seletores. Desligado, todos os canais.
 */
export const canalLiberado = (perm, canalId) => !perm?.chat?.controleCanais || (perm.chat.canais || []).includes(canalId);

export function podeVerConversa(perm, conversa) {
  if (!conversa) return false;
  if (perm.administrador) return true;
  if (normalizarEmail(conversa.responsavel_email) === perm.email) return true;
  const acesso = perm.chat || ACESSO_CHAT_PADRAO;
  // Controle de canais: só os canais liberados à pessoa (vale mais que o departamento)
  if (acesso.controleCanais && !acesso.canais.includes(conversa.canal_id)) return false;
  // Conversa que um colega já assumiu: só com "ver tickets de outros usuários dos seus departamentos"
  if (conversa.responsavel_email && !acesso.verOutros) return false;
  if (!String(conversa.departamento || '').trim()) return true;
  return podeVerDepartamento(perm, conversa.departamento);
}

/** Conversas visíveis com contato e canal (sem segredos). `aba`: abertas | resolvidas */
// todos: administrador com "(Admin) Visualizar todos" ligado no Chat vê também os canais não liberados
export async function listarConversas(db, perm, { aba = 'abertas', todos = false } = {}) {
  let q = db.from('conversas').select('*');
  q = aba === 'resolvidas' ? q.eq('status', 'resolvida') : q.neq('status', 'resolvida');
  const { data, error } = await q.order('ultima_mensagem_em', { ascending: false, nullsFirst: false }).limit(aba === 'resolvidas' ? 100 : 300);
  if (error) throw new Error(error.message);
  const visiveis = (data || []).filter((c) => podeVerConversa(perm, c) && (todos && perm.administrador ? true : canalLiberado(perm, c.canal_id)));
  // Grupos de um canal marcado para não receber grupos ficam de fora (o mesmo grupo segue no outro número)
  const lista = (await juntarDetalhes(db, visiveis)).filter((c) => !(c.canal?.ignorarGrupos && ehGrupo(c.contato?.telefone)));
  return trocarMencoesNasPrevias(db, lista);
}

/** Prévia "@279619886420042" → "@Maria" (ou o número) nos grupos da lista, numa consulta só. */
async function trocarMencoesNasPrevias(db, conversas) {
  const alvos = conversas.filter((c) => ehGrupo(c.contato?.telefone) && /@\d{6,}/.test(c.ultima_mensagem_texto || ''));
  if (!alvos.length) return conversas;
  const { data } = await db
    .from('participantes_grupo')
    .select('grupo_id, jid, telefone, nome')
    .in('grupo_id', [...new Set(alvos.map((c) => c.contato_id))])
    .then((r) => r, () => ({ data: [] }));
  const porGrupo = new Map();
  for (const p of data || []) {
    const rotulo = p.nome || (p.telefone ? formatarTelefone(p.telefone) : null);
    if (!rotulo) continue;
    if (!porGrupo.has(p.grupo_id)) porGrupo.set(p.grupo_id, new Map());
    porGrupo.get(p.grupo_id).set(String(p.jid).split('@')[0], rotulo);
  }
  return conversas.map((c) => (porGrupo.has(c.contato_id) ? { ...c, ultima_mensagem_texto: trocarMencoes(c.ultima_mensagem_texto, porGrupo.get(c.contato_id)) } : c));
}

export async function juntarDetalhes(db, conversas) {
  if (!conversas.length) return [];
  const contatoIds = [...new Set(conversas.map((c) => c.contato_id))];
  const canalIds = [...new Set(conversas.map((c) => c.canal_id))];
  const [contatos, canais] = await Promise.all([
    db.from('contatos').select('id, telefone, nome, foto_url, etiquetas, empresa_id').in('id', contatoIds),
    db.from('canais').select('*').in('id', canalIds),
  ]);
  const porContato = new Map((contatos.data || []).map((c) => [c.id, c]));
  const porCanal = new Map((canais.data || []).map((c) => [c.id, canalPublico(c)]));
  return conversas.map((c) => {
    const canal = porCanal.get(c.canal_id);
    const contato = porContato.get(c.contato_id);
    return { ...c, contato: contato ? { ...contato, foto_url: undefined, tem_foto: Boolean(contato.foto_url) } : null, canal: canal ? { id: canal.id, nome: canal.nome, tipo: canal.tipo, status: canal.status, ativo: canal.ativo, ignorarGrupos: Boolean(canal.config?.ignorarGrupos) } : null };
  });
}

/**
 * Mensagem como a tela recebe: favorita da própria pessoa, ações possíveis e, se apagada para todos,
 * sem o conteúdo (só administradores veem o texto original, para histórico da empresa).
 */
export function prepararMensagem(m, perm, canal) {
  const { favorita_por, apagada_para, chave_externa, ...resto } = m;
  const apagada = Boolean(m.apagada_em);
  return {
    ...resto,
    favorita: (favorita_por || []).includes(perm.email),
    ...(apagada && !perm.administrador ? { conteudo: null, midia: null, conteudo_original: null } : {}),
    ...(!perm.administrador ? { conteudo_original: null } : {}),
    acoes: acoesPossiveis(m, { canal }),
  };
}

const resumoCitada = (m, perm) => ({ id: m.id, direcao: m.direcao, tipo: m.tipo, autor_nome: m.autor_nome, conteudo: m.apagada_em && !perm.administrador ? null : m.conteudo, apagada: Boolean(m.apagada_em) });

/**
 * Mensagens de uma conversa, as mais recentes (em ordem de envio). `antes`: carrega as anteriores a esta data.
 * Junto vêm as fixadas da conversa e o resumo das mensagens citadas nas respostas.
 */
export async function listarMensagens(db, conversa, { antes = null, limite = 60, perm, canal } = {}) {
  let q = db.from('mensagens').select('*').eq('conversa_id', conversa.id);
  if (antes) q = q.lt('criado_em', antes);
  // Em paralelo: a página de mensagens, o contato (para saber se é grupo) e as fixadas
  const [{ data, error }, { data: contato }, { data: fixadas }] = await Promise.all([
    q.order('criado_em', { ascending: false }).limit(limite),
    db.from('contatos').select('telefone').eq('id', conversa.contato_id).maybeSingle(),
    // Sem a migração das ações, a coluna não existe: segue sem fixadas
    db.from('mensagens').select('*').eq('conversa_id', conversa.id).not('fixada_em', 'is', null).then((x) => x, () => ({ data: [] })),
  ]);
  if (error) throw new Error(error.message);
  const brutas = (data || []).reverse();
  const visiveis = brutas.filter((m) => !(m.apagada_para || []).includes(perm.email));

  // Citadas que não estão nesta página
  const porId = new Map(brutas.map((m) => [m.id, m]));
  const faltam = [...new Set(visiveis.filter((m) => m.responde_a && m.tipo !== 'reacao' && !porId.has(m.responde_a)).map((m) => m.responde_a))];
  // Em paralelo: as mensagens citadas fora da página e (no grupo) os nomes para as menções
  const [{ data: extras }, nomes] = await Promise.all([
    faltam.length ? db.from('mensagens').select('*').in('id', faltam) : { data: [] },
    ehGrupo(contato?.telefone) ? nomesDoGrupo(db, conversa.contato_id) : null,
  ]);
  (extras || []).forEach((m) => porId.set(m.id, m));
  const mensagens = visiveis.map((m) => {
    const p = prepararMensagem(nomes && m.conteudo ? { ...m, conteudo: trocarMencoes(m.conteudo, nomes) } : m, perm, canal);
    const c = m.responde_a && m.tipo !== 'reacao' ? porId.get(m.responde_a) : null;
    return c ? { ...p, citada: resumoCitada(c, perm) } : p;
  });

  return {
    mensagens,
    temMais: (data || []).length === limite,
    fixadas: (fixadas || []).filter((m) => !(m.apagada_para || []).includes(perm.email)).sort((a, b) => new Date(a.fixada_em) - new Date(b.fixada_em)).map((m) => prepararMensagem(m, perm, canal)),
  };
}

/** Registro na própria conversa ("Lucas assumiu", "Transferida para Financeiro"...). */
export async function registrarSistema(db, conversaId, texto, autor) {
  await db.from('mensagens').insert([{ conversa_id: conversaId, direcao: 'nota', tipo: 'sistema', conteudo: texto, status: 'enviada', autor_email: autor?.email || null, autor_nome: autor?.nome || null }]);
}

// ------------------------------------------------------------------------------
// Respostas rápidas
// ------------------------------------------------------------------------------
export function podeVerResposta(perm, r) {
  if (r.alcance === 'pessoal') return normalizarEmail(r.autor_email) === perm.email;
  if (r.alcance === 'departamento') return perm.administrador || !r.departamento || podeVerDepartamento(perm, r.departamento);
  return true;
}

export function validarResposta(valor, { admin }) {
  const atalho = String(valor?.atalho || '').trim().toLowerCase().replace(/^\//, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  if (!/^[a-z0-9_-]{1,30}$/.test(atalho)) throw new Error('Atalho com até 30 letras, números, - ou _ (ex.: bomdia).');
  const texto = String(valor?.texto || '').trim();
  if (!texto) throw new Error('Escreva o texto da resposta.');
  if (texto.length > 4000) throw new Error('Texto longo demais (máximo de 4.000 caracteres).');
  const alcance = ['pessoal', 'departamento', 'empresa'].includes(valor?.alcance) ? valor.alcance : 'pessoal';
  if (alcance !== 'pessoal' && !admin) throw new Error('Só administradores criam respostas para a equipe toda.');
  const departamento = alcance === 'departamento' ? String(valor?.departamento || '').trim().slice(0, 60) : null;
  if (alcance === 'departamento' && !departamento) throw new Error('Escolha o departamento.');
  return { atalho, texto, alcance, departamento };
}


// ------------------------------------------------------------------------------
// Auditoria da conversa (tabela auditoria_logs, imutável): quem viu, assumiu, transferiu, fechou, excluiu
// ------------------------------------------------------------------------------
export const ACOES_AUDITORIA_CHAT = ['chat_iniciou', 'chat_visualizou', 'chat_assumiu', 'chat_transferiu', 'chat_resolveu', 'chat_reabriu', 'chat_apagou_mensagem', 'chat_editou_mensagem', 'chat_excluiu', 'chat_mesclou', 'chat_devolveu', 'chat_enviou_meet'];
const JANELA_VISUALIZACAO_MS = 10 * 60 * 1000;

export async function auditarChat(db, perm, acao, conversa, extra = {}) {
  // Quem é o contato e por qual canal: o histórico precisa dizer de que conversa se trata
  const quem = await db
    .from('contatos')
    .select('nome, telefone')
    .eq('id', conversa.contato_id)
    .maybeSingle()
    .then((r) => r.data, () => null);
  const canal = conversa.canal_id
    ? await db.from('canais').select('nome').eq('id', conversa.canal_id).maybeSingle().then((r) => r.data, () => null)
    : null;
  const nomes = { ...(quem?.nome || quem?.telefone ? { contato_nome: quem.nome || quem.telefone } : {}), ...(canal?.nome ? { canal: canal.nome } : {}) };
  await db
    .from('auditoria_logs')
    .insert([{ usuario_email: perm.email, usuario_nome: perm.nome, operador_nome: perm.nome, acao, detalhes: { modulo: 'Chat', conversa_id: conversa.id, contato_id: conversa.contato_id, ...nomes, ...extra } }])
    .then(
      () => {},
      () => {}
    );
}

/** Abriu a conversa: registra no máximo uma visualização por pessoa a cada 10 minutos. */
export async function registrarVisualizacao(db, perm, conversa) {
  const desde = new Date(Date.now() - JANELA_VISUALIZACAO_MS).toISOString();
  const { data } = await db
    .from('auditoria_logs')
    .select('id')
    .eq('acao', 'chat_visualizou')
    .eq('usuario_email', perm.email)
    .eq('detalhes->>conversa_id', conversa.id)
    .gt('created_at', desde)
    .limit(1)
    .then((r) => r, () => ({ data: [] }));
  if ((data || []).length) return;
  await auditarChat(db, perm, 'chat_visualizou', conversa);
}

/** Linha do tempo da conversa, da mais recente para a mais antiga. */
export async function auditoriaDaConversa(db, conversa) {
  // Filtra pela conversa no próprio banco (índice auditoria_chat_conversa_idx)
  const daConversa = (id) =>
    db
      .from('auditoria_logs')
      .select('*')
      .eq('detalhes->>conversa_id', id)
      .in('acao', ACOES_AUDITORIA_CHAT)
      .order('created_at', { ascending: false })
      .limit(500)
      .then((r) => r.data || [], () => []);
  let data = await daConversa(conversa.id);
  // Conversas de um canal antigo que foram juntadas a esta: a história delas continua aqui
  const juntadas = data.filter((l) => l.acao === 'chat_mesclou' && l.detalhes?.de_conversa_id).map((l) => l.detalhes.de_conversa_id);
  if (juntadas.length) data = [...data, ...(await Promise.all(juntadas.slice(0, 10).map(daConversa))).flat()];
  const eventos = (data || []).map((l) => ({ id: l.id, acao: l.acao, quem: l.usuario_nome || l.usuario_email, email: l.usuario_email, em: l.created_at, detalhes: l.detalhes }));
  // Início da conversa: mensagem do cliente (ou "Nova conversa" pela equipe, já registrada como chat_iniciou)
  if (!eventos.some((e) => e.acao === 'chat_iniciou')) eventos.push({ id: 'inicio', acao: 'chat_iniciou', quem: 'Cliente (mensagem no WhatsApp)', em: conversa.criado_em });
  return eventos.sort((a, b) => new Date(b.em) - new Date(a.em));
}

/**
 * Responder, mandar arquivo, reagir ou escrever nota exige ter assumido a conversa (como no RM Chat).
 * Grupos ficam de fora: não têm um responsável único. Devolve a mensagem de erro, ou null se pode.
 */
export async function bloqueioSemAssumir(db, perm, conversa) {
  if (conversa.responsavel_email && conversa.responsavel_email === perm.email) return null;
  const { data: contato } = await db.from('contatos').select('telefone').eq('id', conversa.contato_id).maybeSingle();
  if (ehGrupo(contato?.telefone)) return null;
  return conversa.responsavel_email ? `Esta conversa está com ${conversa.responsavel_nome || 'outra pessoa'}. Assuma a conversa para responder.` : 'Assuma a conversa para responder.';
}

// ------------------------------------------------------------------------------
// Conversas fixadas: de cada pessoa (cada um fixa as suas), guardadas em sistema_config
// na chave chat_fixadas:<email>, da mais recente para a mais antiga. Sem limite prático.
// ------------------------------------------------------------------------------
const MAX_FIXADAS = 1000;
const chaveFixadas = (email) => `chat_fixadas:${String(email || '').toLowerCase()}`;

export async function lerFixadas(db, email) {
  const { data } = await db
    .from('sistema_config')
    .select('valor')
    .eq('chave', chaveFixadas(email))
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  return Array.isArray(data?.valor) ? data.valor.filter((id) => typeof id === 'string') : [];
}

/** Fixa (no topo da lista) ou desafixa uma conversa para esta pessoa. Devolve a lista nova. */
export async function fixarConversa(db, email, conversaId, fixar) {
  const atuais = (await lerFixadas(db, email)).filter((id) => id !== conversaId);
  const lista = (fixar ? [conversaId, ...atuais] : atuais).slice(0, MAX_FIXADAS);
  const { error } = await db.from('sistema_config').upsert({ chave: chaveFixadas(email), valor: lista, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new Error('Não foi possível fixar a conversa.');
  return lista;
}
