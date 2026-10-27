/**
 * Ações sobre uma mensagem do Chat: reagir, editar, apagar (para mim / para todos), favoritar e fixar.
 * Mesmas regras do WhatsApp: editar até 15 minutos e apagar para todos até 2 dias depois do envio.
 * A API oficial da Meta não permite editar nem apagar mensagens já enviadas.
 */
import { assinarMensagem } from '@/lib/canais';
import { normalizarEmail } from '@/lib/roles';
import { chavePadrao, provedorDo, segredosDo } from './index';

export const PRAZO_EDITAR_MS = 15 * 60 * 1000;
export const PRAZO_APAGAR_MS = 2 * 24 * 60 * 60 * 1000;
export const LIMITE_FIXADAS = 3;

const SEM_MIGRACAO = /chave_externa|editada_em|apagada_|favorita_por|fixada_|conteudo_original|PGRST204|column/i;
export const mensagemDeMigracao = (e) => (SEM_MIGRACAO.test(e?.message || '') ? 'Para usar esta ação, rode supabase/migration_chat_acoes.sql no Supabase.' : null);

/** O que dá para fazer com esta mensagem (a tela usa para mostrar só as opções possíveis). */
export function acoesPossiveis(m, { canal, agora = Date.now() } = {}) {
  const enviadaPelaEquipe = m.direcao === 'saida' && Boolean(m.id_externo) && !m.apagada_em && !['pendente', 'falhou'].includes(m.status);
  const idade = agora - new Date(m.criado_em).getTime();
  const qr = canal?.tipo === 'whatsapp_qr';
  return {
    editar: qr && enviadaPelaEquipe && m.tipo === 'texto' && idade < PRAZO_EDITAR_MS,
    apagarParaTodos: qr && enviadaPelaEquipe && idade < PRAZO_APAGAR_MS,
    reagir: Boolean(m.id_externo) && !m.apagada_em && ['entrada', 'saida'].includes(m.direcao),
  };
}

async function contexto(db, conversa, mensagemId) {
  const { data: m } = await db.from('mensagens').select('*').eq('id', mensagemId).maybeSingle();
  if (!m || m.conversa_id !== conversa.id) throw Object.assign(new Error('Mensagem não encontrada.'), { status: 404 });
  const [{ data: canal }, { data: contato }] = await Promise.all([db.from('canais').select('*').eq('id', conversa.canal_id).maybeSingle(), db.from('contatos').select('telefone').eq('id', conversa.contato_id).maybeSingle()]);
  return { m, canal, telefone: contato?.telefone, chave: m.chave_externa || chavePadrao(contato?.telefone, m.direcao === 'saida') };
}

const erro = (texto, status = 400) => Object.assign(new Error(texto), { status });

export async function reagirMensagem(db, { conversa, mensagemId, emoji, autor }) {
  const { m, canal, telefone, chave } = await contexto(db, conversa, mensagemId);
  if (!acoesPossiveis(m, { canal }).reagir) throw erro('Não dá para reagir a esta mensagem.');
  if (!canal?.ativo || canal.status !== 'conectado') throw erro('O canal desta conversa não está conectado.', 409);
  const valor = String(emoji || '').slice(0, 16);
  const r = await provedorDo(canal).reagir(canal, segredosDo(canal), { chave, idExterno: m.id_externo, telefone, emoji: valor });
  // Uma reação da equipe por mensagem (a confirmação que volta do WhatsApp substitui esta)
  const { data: anteriores } = await db.from('mensagens').select('id, autor_nome').eq('responde_a', m.id).eq('tipo', 'reacao').eq('direcao', 'saida');
  for (const x of anteriores || []) await db.from('mensagens').delete().eq('id', x.id);
  if (!valor) return null;
  const { data } = await db
    .from('mensagens')
    .insert([{ conversa_id: conversa.id, direcao: 'saida', tipo: 'reacao', conteudo: valor, status: 'enviada', responde_a: m.id, id_externo: r.idExterno, autor_email: autor.email, autor_nome: null }])
    .select('*')
    .single();
  return data;
}

export async function editarMensagem(db, { conversa, mensagemId, texto, autor, assinar = false }) {
  const { m, canal, telefone, chave } = await contexto(db, conversa, mensagemId);
  if (!acoesPossiveis(m, { canal }).editar) throw erro(canal?.tipo === 'whatsapp_oficial' ? 'A API oficial não permite editar mensagens.' : 'O WhatsApp só deixa editar mensagens de texto nos primeiros 15 minutos.');
  const novo = String(texto || '').trim();
  if (!novo) throw erro('Escreva o novo texto.');
  if (novo.length > 4096) throw erro('Mensagem longa demais (máximo de 4.096 caracteres).');
  if (novo === m.conteudo) return m;
  await provedorDo(canal).editar(canal, segredosDo(canal), { telefone, chave, idExterno: m.id_externo, texto: assinar ? assinarMensagem(novo, autor.nome) : novo });
  const campos = { conteudo: novo, editada_em: new Date().toISOString(), ...(m.conteudo_original ? {} : { conteudo_original: m.conteudo }) };
  const { error } = await db.from('mensagens').update(campos).eq('id', m.id);
  if (error) throw erro(mensagemDeMigracao(error) || error.message, 500);
  return { ...m, ...campos };
}

export async function apagarMensagem(db, { conversa, mensagemId, para, autor }) {
  const { m, canal, chave } = await contexto(db, conversa, mensagemId);
  if (para === 'todos') {
    if (!acoesPossiveis(m, { canal }).apagarParaTodos) throw erro(canal?.tipo === 'whatsapp_oficial' ? 'A API oficial não permite apagar mensagens já enviadas.' : 'Só dá para apagar para todos as mensagens da equipe, até 2 dias depois do envio.');
    await provedorDo(canal).apagarParaTodos(canal, segredosDo(canal), { chave, idExterno: m.id_externo });
    const campos = { apagada_em: new Date().toISOString(), apagada_por: autor.email };
    const { error } = await db.from('mensagens').update(campos).eq('id', m.id);
    if (error) throw erro(mensagemDeMigracao(error) || error.message, 500);
    return { ...m, ...campos };
  }
  // Só para mim: some da tela de quem apagou; o cliente e o restante da equipe continuam vendo
  const lista = [...new Set([...(m.apagada_para || []), normalizarEmail(autor.email)])];
  const { error } = await db.from('mensagens').update({ apagada_para: lista }).eq('id', m.id);
  if (error) throw erro(mensagemDeMigracao(error) || error.message, 500);
  return { ...m, apagada_para: lista };
}

export async function favoritarMensagem(db, { conversa, mensagemId, valor, autor }) {
  const { m } = await contexto(db, conversa, mensagemId);
  const eu = normalizarEmail(autor.email);
  const atual = (m.favorita_por || []).filter((e) => e !== eu);
  const lista = valor ? [...atual, eu] : atual;
  const { error } = await db.from('mensagens').update({ favorita_por: lista }).eq('id', m.id);
  if (error) throw erro(mensagemDeMigracao(error) || error.message, 500);
  return { ...m, favorita_por: lista };
}

export async function fixarMensagem(db, { conversa, mensagemId, valor, autor }) {
  const { m } = await contexto(db, conversa, mensagemId);
  if (valor && !m.fixada_em) {
    const { data: fixadas, error: e } = await db.from('mensagens').select('id').eq('conversa_id', conversa.id).not('fixada_em', 'is', null);
    if (e) throw erro(mensagemDeMigracao(e) || e.message, 500);
    if ((fixadas || []).length >= LIMITE_FIXADAS) throw erro(`Dá para fixar até ${LIMITE_FIXADAS} mensagens por conversa. Desafixe uma antes.`);
  }
  const campos = valor ? { fixada_em: new Date().toISOString(), fixada_por: autor.nome } : { fixada_em: null, fixada_por: null };
  const { error } = await db.from('mensagens').update(campos).eq('id', m.id);
  if (error) throw erro(mensagemDeMigracao(error) || error.message, 500);
  return { ...m, ...campos };
}
