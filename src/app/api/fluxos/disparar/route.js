import { after } from 'next/server';
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { consumirLimite } from '@/lib/server/protecao';
import { dispararFluxos } from '@/lib/server/fluxos';
import { dadosDaReuniao } from '@/lib/fluxos';
import { json } from '@/lib/server/fluxosApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * A agenda avisa que algo mudou numa reunião: POST { tipo: 'reuniao_agendada' | 'reuniao_status', evento_id }.
 * Qualquer pessoa da equipe que mexe na agenda pode avisar; o servidor confere a reunião NO BANCO (da empresa
 * da pessoa) e usa o que está lá, nunca o que o navegador diz. Cada aviso vale uma vez por reunião e situação.
 */
export async function POST(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const body = (await request.json().catch(() => null)) || {};
  if (!['reuniao_agendada', 'reuniao_status'].includes(body.tipo)) return json({ ok: false, mensagem: 'Evento desconhecido.' }, 400);
  const id = String(body.evento_id || '').slice(0, 80);
  if (!id) return json({ ok: false, mensagem: 'Reunião inválida.' }, 400);
  const { data: evento } = await ctx.db.from('agenda_eventos').select('*').eq('id', id).maybeSingle();
  if (!evento) return json({ ok: false, mensagem: 'Reunião não encontrada.' }, 404);
  if (body.tipo === 'reuniao_agendada' && Date.now() - new Date(evento.created_at || 0).getTime() > 15 * 60 * 1000) return json({ ok: true, ignorado: true });
  // Clique duplo / aviso repetido: uma vez por reunião e situação a cada 30 segundos
  if (!(await consumirLimite(`fluxo_evento_${body.tipo}_${evento.id}_${evento.status}`, 1, 30))) return json({ ok: true, ignorado: true });
  const tarefa = () => dispararFluxos(ctx.db, { tipo: body.tipo, dados: dadosDaReuniao(evento) }).catch((e) => console.error('[fluxos] agenda', e.message));
  try {
    after(tarefa);
  } catch {
    await tarefa();
  }
  return json({ ok: true });
}
