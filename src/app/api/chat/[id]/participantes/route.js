import { carregarConversa } from '@/lib/server/canais/chat';
import { participantesDoGrupo, sincronizarParticipantes } from '@/lib/server/canais/grupos';
import { provedorDo, segredosDo } from '@/lib/server/canais/index';
import { ehGrupo } from '@/lib/canais';

export const dynamic = 'force-dynamic';

/** Participantes do grupo desta conversa (para mencionar com @). Atualiza pelo WhatsApp a cada 10 minutos. */
export async function GET(request, { params }) {
  const r = await carregarConversa(request, params.id);
  if (r.erro) return r.erro;
  const { db } = r.ctx;
  const { data: grupo } = await db.from('contatos').select('id, telefone').eq('id', r.conversa.contato_id).maybeSingle();
  if (!ehGrupo(grupo?.telefone)) return Response.json({ ok: true, participantes: [] });
  const { data: canal } = await db.from('canais').select('*').eq('id', r.conversa.canal_id).maybeSingle();
  if (canal?.ativo && canal.status === 'conectado') {
    await sincronizarParticipantes(db, { canal, provedor: provedorDo(canal), segredos: segredosDo(canal), grupo }).catch(() => {});
  }
  const proprio = String(canal?.numero || '').replace(/\D/g, '');
  const participantes = (await participantesDoGrupo(db, grupo.id))
    .filter((p) => !(proprio && p.telefone && p.telefone.endsWith(proprio.slice(-8))))
    .map((p) => ({ jid: p.jid, nome: p.nome || null, telefone: p.telefone || null, admin: Boolean(p.admin) }))
    .sort((a, b) => (a.nome ? 0 : 1) - (b.nome ? 0 : 1) || String(a.nome || a.telefone || '').localeCompare(String(b.nome || b.telefone || ''), 'pt-BR'));
  return Response.json({ ok: true, participantes }, { headers: { 'Cache-Control': 'no-store' } });
}
