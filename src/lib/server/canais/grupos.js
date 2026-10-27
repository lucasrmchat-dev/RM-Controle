/**
 * Participantes dos grupos do WhatsApp (tabela participantes_grupo, de supabase/migration_chat_grupos.sql).
 * Sem a migração, tudo aqui falha em silêncio e o chat segue funcionando (só sem nomes nas menções).
 */
import { formasDoTelefone, telefoneCanonico } from '@/lib/canais';
import { formatarTelefone } from '@/lib/whatsappAgenda';

const ATUALIZAR_LISTA_MS = 10 * 60 * 1000;
const usuarioDoJid = (jid) => String(jid || '').split('@')[0].split(':')[0];
const silencioso = (p) => Promise.resolve(p).then((r) => r, () => ({ data: null, error: { message: 'falhou' } }));

/** Guarda (ou atualiza) quem escreveu no grupo. */
export async function registrarParticipante(db, grupoId, { jid, telefone, nome } = {}) {
  if (!grupoId || !jid) return;
  const linha = { grupo_id: grupoId, jid, atualizado_em: new Date().toISOString(), ...(telefone ? { telefone: telefoneCanonico(telefone) } : {}), ...(nome ? { nome } : {}) };
  await silencioso(db.from('participantes_grupo').upsert([linha], { onConflict: 'grupo_id,jid' }));
}

/** Participantes do grupo, com nome quando se sabe (do grupo ou da agenda de contatos). */
export async function participantesDoGrupo(db, grupoId) {
  const { data } = await silencioso(db.from('participantes_grupo').select('*').eq('grupo_id', grupoId));
  const lista = data || [];
  const semNome = lista.filter((p) => !p.nome && p.telefone).map((p) => p.telefone);
  if (semNome.length) {
    const { data: contatos } = await silencioso(db.from('contatos').select('telefone, nome').in('telefone', semNome.flatMap(formasDoTelefone)));
    const porTelefone = new Map((contatos || []).filter((c) => c.nome).map((c) => [telefoneCanonico(c.telefone), c.nome]));
    lista.forEach((p) => {
      if (!p.nome && p.telefone) p.nome = porTelefone.get(p.telefone) || null;
    });
  }
  return lista;
}

/** Mapa "o que vem depois do @" → nome (pelo código do WhatsApp e pelo número, com e sem o 9º dígito). */
export async function nomesDoGrupo(db, grupoId) {
  const nomes = new Map();
  for (const p of await participantesDoGrupo(db, grupoId)) {
    const rotulo = p.nome || (p.telefone ? formatarTelefone(p.telefone) : null);
    if (!rotulo) continue;
    nomes.set(usuarioDoJid(p.jid), rotulo);
    if (p.telefone && p.nome) formasDoTelefone(p.telefone).forEach((t) => nomes.set(t, p.nome));
  }
  return nomes;
}

const ultimaSincronizacao = new Map();

/** Atualiza a lista completa pelo WhatsApp (no máximo a cada 10 minutos por grupo). */
export async function sincronizarParticipantes(db, { canal, provedor, segredos, grupo }) {
  if (!provedor?.participantes) return;
  // Também por servidor: um grupo que o WhatsApp recusa não é consultado a cada mensagem
  if (Date.now() - (ultimaSincronizacao.get(grupo.id) || 0) < ATUALIZAR_LISTA_MS) return;
  ultimaSincronizacao.set(grupo.id, Date.now());
  const { data: recente } = await silencioso(db.from('participantes_grupo').select('atualizado_em').eq('grupo_id', grupo.id).order('atualizado_em', { ascending: false }).limit(1));
  const ultima = recente?.[0]?.atualizado_em ? new Date(recente[0].atualizado_em).getTime() : 0;
  if (Date.now() - ultima < ATUALIZAR_LISTA_MS && recente?.length > 2) return;
  const lista = await provedor.participantes(canal, segredos, grupo.telefone).catch(() => []);
  if (!lista.length) return;
  // Nomes: o WhatsApp só informa de quem está na agenda ou já escreveu; os demais ficam com o número
  const nomes = provedor.nomesConhecidos ? await provedor.nomesConhecidos(canal, segredos).catch(() => new Map()) : new Map();
  const agora = new Date().toISOString();
  const linhas = lista
    .filter((p) => p.jid)
    .map((p) => {
      const nome = nomes.get(p.jid) || (p.jidTelefone && nomes.get(p.jidTelefone)) || null;
      return { grupo_id: grupo.id, jid: p.jid, admin: Boolean(p.admin), atualizado_em: agora, ...(p.telefone ? { telefone: telefoneCanonico(p.telefone) } : {}), ...(nome ? { nome } : {}) };
    });
  if (linhas.length) await silencioso(db.from('participantes_grupo').upsert(linhas, { onConflict: 'grupo_id,jid' }));
  await contatosDosParticipantes(db, grupo.id);
}

/**
 * Menções escolhidas na tela ({ jid, nome }) → texto do WhatsApp ("@Maria" vira "@5585...") e a lista
 * de quem notificar. Só vale para participantes deste grupo.
 */
export async function prepararMencoes(db, grupoId, texto, mencoes = []) {
  if (!Array.isArray(mencoes) || !mencoes.length) return { texto, mencionados: [] };
  const participantes = await participantesDoGrupo(db, grupoId);
  const porJid = new Map(participantes.map((p) => [p.jid, p]));
  let saida = String(texto);
  const mencionados = [];
  for (const m of mencoes.slice(0, 50)) {
    const p = porJid.get(m?.jid);
    if (!p) continue;
    // O WhatsApp só reconhece a menção pelo identificador que o próprio grupo usa (o código …@lid nos grupos
    // novos ou o número como está no grupo, sem acrescentar o 9º dígito), como o celular faz
    const id = usuarioDoJid(p.jid);
    const nome = String(m.nome || p.nome || '').trim();
    if (nome && saida.includes(`@${nome}`)) saida = saida.split(`@${nome}`).join(`@${id}`);
    mencionados.push(p.jid);
  }
  return { texto: saida, mencionados: [...new Set(mencionados)] };
}

/** Número de verdade de um participante (pela lista do grupo), quando a mensagem veio só com o código interno. */
export async function telefoneDoParticipante(db, grupoId, jid) {
  if (!jid) return null;
  const { data } = await silencioso(db.from('participantes_grupo').select('telefone').eq('grupo_id', grupoId).eq('jid', jid).maybeSingle());
  return data?.telefone || null;
}

/**
 * Participantes com nome e número conhecidos viram contatos da empresa (sem duplicar quem já existe,
 * nas duas formas do número). Nunca usa o código interno do WhatsApp como telefone.
 */
export async function contatosDosParticipantes(db, grupoId) {
  const lista = (await participantesDoGrupo(db, grupoId)).filter((p) => p.telefone && p.nome);
  if (!lista.length) return 0;
  const { data: existentes } = await silencioso(db.from('contatos').select('telefone').in('telefone', lista.flatMap((p) => formasDoTelefone(p.telefone))));
  const ja = new Set((existentes || []).map((c) => telefoneCanonico(c.telefone)));
  const novos = [...new Map(lista.filter((p) => !ja.has(p.telefone)).map((p) => [p.telefone, { telefone: p.telefone, nome: p.nome }])).values()];
  for (let i = 0; i < novos.length; i += 200) await silencioso(db.from('contatos').insert(novos.slice(i, i + 200)));
  return novos.length;
}
