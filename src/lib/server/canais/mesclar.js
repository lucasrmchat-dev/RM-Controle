/**
 * Mesclar canais: o histórico de um canal antigo (que deu problema e foi refeito) passa para o canal novo
 * do MESMO número. Nada se perde: as conversas mudam de canal e, quando o mesmo contato tem conversa
 * aberta nos dois, as mensagens da antiga entram na nova (a antiga, vazia, sai; a auditoria dela continua
 * na linha do tempo da nova, pelo registro "chat_mesclou").
 */
import { telefoneCanonico } from '@/lib/canais';
import { auditarChat } from './chat';

/** Motivo para não mesclar (ou null se pode). */
export function motivoParaNaoMesclar(origem, destino) {
  if (!origem || !destino) return 'Canal não encontrado.';
  if (origem.id === destino.id) return 'Escolha outro canal para mesclar.';
  if (!origem.numero || !destino.numero) return 'Só dá para mesclar canais com número conhecido (conecte o canal ao menos uma vez).';
  if (telefoneCanonico(origem.numero) !== telefoneCanonico(destino.numero)) return 'Só dá para mesclar canais do mesmo número de WhatsApp.';
  if (origem.status === 'conectado') return `Desconecte "${origem.nome}" antes de mesclar, para ele não receber mensagens durante a mudança.`;
  return null;
}

const maisRecente = (a, b) => (!a ? b : !b ? a : new Date(a) > new Date(b) ? a : b);

export async function mesclarCanais(db, perm, origem, destino) {
  const motivo = motivoParaNaoMesclar(origem, destino);
  if (motivo) throw Object.assign(new Error(motivo), { status: 400 });

  const [{ data: daOrigem, error }, { data: abertasDestino }] = await Promise.all([
    db.from('conversas').select('*').eq('canal_id', origem.id),
    db.from('conversas').select('*').eq('canal_id', destino.id).neq('status', 'resolvida'),
  ]);
  if (error) throw new Error(error.message);
  const abertaPorContato = new Map((abertasDestino || []).map((c) => [c.contato_id, c]));
  let juntadas = 0;
  let movidas = 0;

  for (const velha of daOrigem || []) {
    const nova = velha.status !== 'resolvida' ? abertaPorContato.get(velha.contato_id) : null;
    if (!nova) {
      // Sem conflito: a conversa só muda de canal (no máximo uma aberta por contato em cada canal)
      const { error: e } = await db.from('conversas').update({ canal_id: destino.id }).eq('id', velha.id);
      if (e) throw new Error(e.message);
      movidas += 1;
      continue;
    }
    // O mesmo contato tem conversa aberta nos dois: as mensagens da antiga entram na nova
    const { error: e1 } = await db.from('mensagens').update({ conversa_id: nova.id }).eq('conversa_id', velha.id);
    if (e1) throw new Error(e1.message);
    const ultima = maisRecente(nova.ultima_mensagem_em, velha.ultima_mensagem_em);
    const campos = {
      nao_lidas: (nova.nao_lidas || 0) + (velha.nao_lidas || 0),
      ultima_mensagem_em: ultima,
      ultima_mensagem_texto: ultima === velha.ultima_mensagem_em && ultima !== nova.ultima_mensagem_em ? velha.ultima_mensagem_texto : nova.ultima_mensagem_texto,
      ultima_entrada_cliente_em: maisRecente(nova.ultima_entrada_cliente_em, velha.ultima_entrada_cliente_em),
      ...(!nova.responsavel_email && velha.responsavel_email ? { responsavel_email: velha.responsavel_email, responsavel_nome: velha.responsavel_nome, status: velha.status } : {}),
      ...(!nova.departamento && velha.departamento ? { departamento: velha.departamento } : {}),
      ...(velha.criado_em && (!nova.criado_em || new Date(velha.criado_em) < new Date(nova.criado_em)) ? { criado_em: velha.criado_em } : {}),
    };
    await db.from('conversas').update(campos).eq('id', nova.id);
    await auditarChat(db, perm, 'chat_mesclou', nova, { de_conversa_id: velha.id, de_canal: origem.nome });
    const { error: e2 } = await db.from('conversas').delete().eq('id', velha.id);
    if (e2) throw new Error(e2.message);
    juntadas += 1;
  }

  // O canal antigo fica desativado e vazio (pode ser excluído depois)
  const { data: antigo } = await db
    .from('canais')
    .update({ ativo: false, config: { ...(origem.config || {}), mesclado_em: destino.id }, atualizado_em: new Date().toISOString() })
    .eq('id', origem.id)
    .select('*')
    .single();
  return { movidas, juntadas, origem: antigo || origem };
}
