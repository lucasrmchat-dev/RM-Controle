import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { permissaoDoChat, semModulo } from '@/lib/server/canais/chat';
import { consumirLimite } from '@/lib/server/protecao';
import { isValidUUID } from '@/lib/sanitize';
import { semanaDe, somarDias, validarMeta, validarReuniao } from '@/lib/daily';

export const dynamic = 'force-dynamic';

/**
 * Daily (ticket #21). Quem tem o módulo Daily lê e escreve; só a empresa da pessoa.
 *  GET ?semana=YYYY-MM-DD                          reuniões e metas da semana
 *  POST { acao: 'criar_reuniao', data, titulo }      nova daily (quantas quiser por dia)
 *  POST { acao: 'editar_reuniao', id, ... }          resumo, atualizações da ClickMassa, título, data, participantes
 *  POST { acao: 'excluir_reuniao', id }
 *  POST { acao: 'criar_meta', semana, texto, responsavel_email }
 *  POST { acao: 'editar_meta', id, texto?, responsavel_email?, concluida? }
 *  POST { acao: 'excluir_meta', id }
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function acesso(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const bloqueio = semModulo(perm, 'daily', 'ao Daily');
  if (bloqueio) return { erro: json({ ok: false, mensagem: bloqueio }, 403) };
  return { ctx, perm };
}

const tabelaAusente = (e) => /daily_|does not exist|schema cache/i.test(String(e?.message || ''));
const semMigracao = () => json({ ok: false, mensagem: 'O Daily ainda não foi instalado no banco. Rode supabase/migration_daily.sql no Supabase.' }, 503);

export async function GET(request) {
  const a = await acesso(request);
  if (a.erro) return a.erro;
  const semana = semanaDe(new URL(request.url).searchParams.get('semana'));
  const { db } = a.ctx;
  const [reunioes, metas] = await Promise.all([
    db.from('daily_reunioes').select('*').gte('data', semana).lte('data', somarDias(semana, 6)).order('data', { ascending: false }).order('criado_em', { ascending: false }),
    db.from('daily_metas').select('*').eq('semana', semana).order('ordem', { ascending: true }).order('criado_em', { ascending: true }),
  ]);
  if (reunioes.error || metas.error) return tabelaAusente(reunioes.error || metas.error) ? semMigracao() : json({ ok: false, mensagem: (reunioes.error || metas.error).message }, 500);
  return json({ ok: true, semana, reunioes: reunioes.data || [], metas: metas.data || [], eu: { email: a.perm.email, nome: a.perm.nome } });
}

export async function POST(request) {
  const a = await acesso(request);
  if (a.erro) return a.erro;
  const { ctx, perm } = a;
  const { db } = ctx;
  if (!(await consumirLimite(`daily_${perm.email}`, 120, 60))) return json({ ok: false, mensagem: 'Muitas alterações seguidas. Aguarde um instante.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  const agora = new Date().toISOString();
  const resultado = (r) => (r.error ? (tabelaAusente(r.error) ? semMigracao() : json({ ok: false, mensagem: r.error.message }, 500)) : null);
  try {
    if (body.acao === 'criar_reuniao') {
      const campos = validarReuniao({ data: body.data || agora.slice(0, 10), titulo: body.titulo, resumo: body.resumo, atualizacoes_clickmassa: body.atualizacoes_clickmassa, participantes: body.participantes });
      const r = await db.from('daily_reunioes').insert([{ ...campos, criado_por: perm.email, atualizado_por: perm.email }]).select('*').single();
      return resultado(r) || json({ ok: true, reuniao: r.data });
    }
    if (body.acao === 'editar_reuniao' || body.acao === 'excluir_reuniao') {
      if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Daily inválida.' }, 400);
      if (body.acao === 'excluir_reuniao') {
        const r = await db.from('daily_reunioes').delete().eq('id', body.id);
        return resultado(r) || json({ ok: true });
      }
      const campos = validarReuniao(body, { parcial: true });
      const r = await db.from('daily_reunioes').update({ ...campos, atualizado_por: perm.email, atualizado_em: agora }).eq('id', body.id).select('*').maybeSingle();
      if (!r.error && !r.data) return json({ ok: false, mensagem: 'Daily não encontrada.' }, 404);
      return resultado(r) || json({ ok: true, reuniao: r.data });
    }
    if (body.acao === 'criar_meta') {
      const campos = validarMeta(body);
      const nome = campos.responsavel_email ? await nomeDaEquipe(db, campos.responsavel_email) : null;
      const r = await db.from('daily_metas').insert([{ ...campos, responsavel_nome: nome, ordem: Date.now() % 2147483647, criado_por: perm.email }]).select('*').single();
      return resultado(r) || json({ ok: true, meta: r.data });
    }
    if (body.acao === 'editar_meta' || body.acao === 'excluir_meta') {
      if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Meta inválida.' }, 400);
      if (body.acao === 'excluir_meta') {
        const r = await db.from('daily_metas').delete().eq('id', body.id);
        return resultado(r) || json({ ok: true });
      }
      const campos = validarMeta(body, { parcial: true });
      if (campos.responsavel_email !== undefined) campos.responsavel_nome = campos.responsavel_email ? await nomeDaEquipe(db, campos.responsavel_email) : null;
      if (body.concluida !== undefined) Object.assign(campos, body.concluida ? { concluida_em: agora, concluida_por: perm.email } : { concluida_em: null, concluida_por: null });
      const r = await db.from('daily_metas').update(campos).eq('id', body.id).select('*').maybeSingle();
      if (!r.error && !r.data) return json({ ok: false, mensagem: 'Meta não encontrada.' }, 404);
      return resultado(r) || json({ ok: true, meta: r.data });
    }
    return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
}

async function nomeDaEquipe(db, email) {
  const { data } = await db.from('equipe_usuarios').select('nome').eq('email', email).maybeSingle();
  return data?.nome || null;
}
