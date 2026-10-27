/**
 * Chat: quem vê cada conversa e as ações de atendimento. Mesma regra da RLS do banco
 * (supabase/migration_canais_chat.sql): administrador vê todas; os demais, as dos seus departamentos,
 * as sem departamento e as que estão com eles.
 */
import { permissoesEfetivas, podeVerDepartamento } from '@/lib/perfis';
import { normalizarEmail } from '@/lib/roles';
import { canalPublico } from '@/lib/server/canais/index';
import { nomePeloEmail } from '@/lib/canais';
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { acoesPossiveis } from '@/lib/server/canais/acoes';
import { isValidUUID } from '@/lib/sanitize';

const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

/** Sessão + permissão do Chat. Devolve { erro } (resposta pronta) ou { ctx, perm }. */
export async function acessoAoChat(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  if (!perm.administrador && !perm.modulos.includes('chat')) return { erro: json({ ok: false, mensagem: 'Seu perfil não tem acesso ao Chat.' }, 403) };
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
  const { data } = await db.from('conversas').select('*').eq('contato_id', contatoId);
  return (data || []).some((c) => podeVerConversa(perm, c));
}

export async function permissaoDoChat(db, email) {
  const alvo = normalizarEmail(email);
  const [equipe, perfis] = await Promise.all([db.from('equipe_usuarios').select('*'), db.from('perfis_acesso').select('*')]);
  const linhas = (equipe.data || []).map(({ senha, ...resto }) => resto);
  const perm = permissoesEfetivas({ email: alvo, equipe: linhas, perfis: perfis.data || [], adminsExtras: process.env.RM_ADMIN_EMAILS });
  const membro = linhas.find((u) => normalizarEmail(u.email) === alvo);
  return { ...perm, email: alvo, nome: membro?.nome || nomePeloEmail(alvo) };
}

export function podeVerConversa(perm, conversa) {
  if (!conversa) return false;
  if (perm.administrador) return true;
  if (normalizarEmail(conversa.responsavel_email) === perm.email) return true;
  if (!String(conversa.departamento || '').trim()) return true;
  return podeVerDepartamento(perm, conversa.departamento);
}

/** Conversas visíveis com contato e canal (sem segredos). `aba`: abertas | resolvidas */
export async function listarConversas(db, perm, { aba = 'abertas' } = {}) {
  let q = db.from('conversas').select('*');
  q = aba === 'resolvidas' ? q.eq('status', 'resolvida') : q.neq('status', 'resolvida');
  const { data, error } = await q.order('ultima_mensagem_em', { ascending: false, nullsFirst: false }).limit(aba === 'resolvidas' ? 100 : 300);
  if (error) throw new Error(error.message);
  const visiveis = (data || []).filter((c) => podeVerConversa(perm, c));
  return juntarDetalhes(db, visiveis);
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
    return { ...c, contato: contato ? { ...contato, foto_url: undefined, tem_foto: Boolean(contato.foto_url) } : null, canal: canal ? { id: canal.id, nome: canal.nome, tipo: canal.tipo, status: canal.status, ativo: canal.ativo } : null };
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
  const { data, error } = await q.order('criado_em', { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  const brutas = (data || []).reverse();
  const visiveis = brutas.filter((m) => !(m.apagada_para || []).includes(perm.email));

  // Citadas que não estão nesta página
  const porId = new Map(brutas.map((m) => [m.id, m]));
  const faltam = [...new Set(visiveis.filter((m) => m.responde_a && m.tipo !== 'reacao' && !porId.has(m.responde_a)).map((m) => m.responde_a))];
  if (faltam.length) {
    const { data: extras } = await db.from('mensagens').select('*').in('id', faltam);
    (extras || []).forEach((m) => porId.set(m.id, m));
  }
  const mensagens = visiveis.map((m) => {
    const p = prepararMensagem(m, perm, canal);
    const c = m.responde_a && m.tipo !== 'reacao' ? porId.get(m.responde_a) : null;
    return c ? { ...p, citada: resumoCitada(c, perm) } : p;
  });

  // Fixadas (sem a migração das ações, a coluna não existe: segue sem fixadas)
  const { data: fixadas } = await db.from('mensagens').select('*').eq('conversa_id', conversa.id).not('fixada_em', 'is', null).then((r) => r, () => ({ data: [] }));
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
export const ACOES_AUDITORIA_CHAT = ['chat_iniciou', 'chat_visualizou', 'chat_assumiu', 'chat_transferiu', 'chat_resolveu', 'chat_reabriu', 'chat_apagou_mensagem', 'chat_editou_mensagem', 'chat_excluiu'];
const JANELA_VISUALIZACAO_MS = 10 * 60 * 1000;

export async function auditarChat(db, perm, acao, conversa, extra = {}) {
  await db
    .from('auditoria_logs')
    .insert([{ usuario_email: perm.email, usuario_nome: perm.nome, operador_nome: perm.nome, acao, detalhes: { modulo: 'Chat', conversa_id: conversa.id, contato_id: conversa.contato_id, ...extra } }])
    .then(
      () => {},
      () => {}
    );
}

/** Abriu a conversa: registra no máximo uma visualização por pessoa a cada 10 minutos. */
export async function registrarVisualizacao(db, perm, conversa) {
  const desde = new Date(Date.now() - JANELA_VISUALIZACAO_MS).toISOString();
  const { data } = await db.from('auditoria_logs').select('id, detalhes, created_at').eq('acao', 'chat_visualizou').eq('usuario_email', perm.email).gt('created_at', desde).then((r) => r, () => ({ data: [] }));
  if ((data || []).some((l) => l.detalhes?.conversa_id === conversa.id)) return;
  await auditarChat(db, perm, 'chat_visualizou', conversa);
}

/** Linha do tempo da conversa, da mais recente para a mais antiga. */
export async function auditoriaDaConversa(db, conversa) {
  const { data } = await db.from('auditoria_logs').select('*').in('acao', ACOES_AUDITORIA_CHAT).order('created_at', { ascending: false }).limit(1000).then((r) => r, () => ({ data: [] }));
  const eventos = (data || []).filter((l) => l.detalhes?.conversa_id === conversa.id).map((l) => ({ id: l.id, acao: l.acao, quem: l.usuario_nome || l.usuario_email, email: l.usuario_email, em: l.created_at, detalhes: l.detalhes }));
  // Início da conversa: mensagem do cliente (ou "Nova conversa" pela equipe, já registrada como chat_iniciou)
  if (!eventos.some((e) => e.acao === 'chat_iniciou')) eventos.push({ id: 'inicio', acao: 'chat_iniciou', quem: 'Cliente (mensagem no WhatsApp)', em: conversa.criado_em });
  return eventos.sort((a, b) => new Date(b.em) - new Date(a.em));
}
