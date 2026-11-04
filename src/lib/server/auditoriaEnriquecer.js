/**
 * Completa, só na hora de mostrar, os registros de auditoria que guardaram apenas códigos
 * (conversa, contato, empresa): acrescenta o nome do contato, o canal e o nome da empresa.
 * Nada é gravado: a tabela de auditoria continua imutável. Usa o db da requisição (já filtrado pela empresa).
 */
const ACOES_DE_CHAT = /^chat_/;

export async function enriquecerRegistros(db, registros = []) {
  const lista = registros || [];
  const conversasIds = [...new Set(lista.filter((r) => ACOES_DE_CHAT.test(r.acao) && !r.detalhes?.contato_nome && r.detalhes?.conversa_id).map((r) => r.detalhes.conversa_id))];
  const empresasIds = [...new Set(lista.filter((r) => r.empresa_id && !r.detalhes?.empresa_nome && !r.detalhes?.empresa).map((r) => r.empresa_id))];

  const porConversa = new Map();
  if (conversasIds.length) {
    const { data: conversas } = await db.from('conversas').select('id, contato_id, canal_id').in('id', conversasIds);
    const contatosIds = [...new Set((conversas || []).map((c) => c.contato_id).filter(Boolean))];
    const canaisIds = [...new Set((conversas || []).map((c) => c.canal_id).filter(Boolean))];
    const [{ data: contatos }, { data: canais }] = await Promise.all([
      contatosIds.length ? db.from('contatos').select('id, nome, telefone').in('id', contatosIds) : { data: [] },
      canaisIds.length ? db.from('canais').select('id, nome').in('id', canaisIds) : { data: [] },
    ]);
    const nomeContato = new Map((contatos || []).map((c) => [c.id, c.nome || c.telefone || '']));
    const nomeCanal = new Map((canais || []).map((c) => [c.id, c.nome || '']));
    for (const c of conversas || []) porConversa.set(c.id, { contato_nome: nomeContato.get(c.contato_id) || '', canal: nomeCanal.get(c.canal_id) || '' });
  }

  const nomeEmpresa = new Map();
  if (empresasIds.length) {
    const { data: empresas } = await db.from('empresas').select('id, nome').in('id', empresasIds);
    for (const e of empresas || []) nomeEmpresa.set(e.id, e.nome);
  }

  return lista.map((r) => {
    const extra = {};
    const chat = porConversa.get(r.detalhes?.conversa_id);
    if (chat) Object.assign(extra, Object.fromEntries(Object.entries(chat).filter(([, v]) => v)));
    if (r.empresa_id && nomeEmpresa.has(r.empresa_id)) extra.empresa_nome = nomeEmpresa.get(r.empresa_id);
    return Object.keys(extra).length ? { ...r, detalhes: { ...extra, ...(r.detalhes || {}) } } : r;
  });
}
