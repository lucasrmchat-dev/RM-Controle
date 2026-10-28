import { gatilhosDe, problemasDoFluxo, validarDefinicao } from '@/lib/fluxos';
import { acessoFluxos, erroDoBanco, json, resumoFluxo } from '@/lib/server/fluxosApi';
import { consumirLimite } from '@/lib/server/protecao';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Um fluxo.
 *  GET                                                    fluxo completo (com o desenho)
 *  PATCH { nome?, descricao?, ativo?, definicao? }        salva (o editor salva sozinho)
 *  DELETE                                                 exclui (e as execuções)
 * Ativar exige o fluxo sem problemas (gatilho ligado, mensagens com texto...).
 */
async function carregar(request, contexto) {
  const a = await acessoFluxos(request);
  if (a.erro) return a;
  const { id } = await contexto.params;
  if (!isValidUUID(id)) return { erro: json({ ok: false, mensagem: 'Fluxo inválido.' }, 400) };
  const { data, error } = await a.ctx.db.from('fluxos').select('*').eq('id', id).maybeSingle();
  if (error) return { erro: erroDoBanco(error) };
  if (!data) return { erro: json({ ok: false, mensagem: 'Fluxo não encontrado.' }, 404) };
  return { ...a, fluxo: data };
}

export async function GET(request, contexto) {
  const r = await carregar(request, contexto);
  if (r.erro) return r.erro;
  return json({ ok: true, fluxo: { ...resumoFluxo(r.fluxo), definicao: r.fluxo.definicao } });
}

export async function PATCH(request, contexto) {
  const r = await carregar(request, contexto);
  if (r.erro) return r.erro;
  const { ctx, perm, fluxo } = r;
  if (!(await consumirLimite(`fluxos_salvar_${perm.email}`, 240, 60))) return json({ ok: false, mensagem: 'Muitas alterações seguidas. Aguarde um instante.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  const campos = { atualizado_por: perm.email, atualizado_em: new Date().toISOString() };
  try {
    if (body.nome !== undefined) {
      const nome = String(body.nome || '').trim().slice(0, 120);
      if (!nome) return json({ ok: false, mensagem: 'Dê um nome ao fluxo.' }, 400);
      campos.nome = nome;
    }
    if (body.descricao !== undefined) campos.descricao = String(body.descricao || '').trim().slice(0, 500);
    if (body.definicao !== undefined) {
      campos.definicao = validarDefinicao(body.definicao);
      campos.gatilhos = gatilhosDe(campos.definicao);
      campos.versao = (fluxo.versao || 1) + 1;
    }
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  if (body.ativo !== undefined) {
    const ativo = Boolean(body.ativo);
    if (ativo) {
      const problemas = problemasDoFluxo(campos.definicao || fluxo.definicao);
      if (problemas.length) return json({ ok: false, mensagem: `Antes de ativar: ${problemas[0]}`, problemas }, 400);
    }
    campos.ativo = ativo;
  }
  const { data, error } = await ctx.db.from('fluxos').update(campos).eq('id', fluxo.id).select('*').single();
  if (error) return erroDoBanco(error);
  return json({ ok: true, fluxo: { ...resumoFluxo(data), definicao: data.definicao } });
}

export async function DELETE(request, contexto) {
  const r = await carregar(request, contexto);
  if (r.erro) return r.erro;
  const { error } = await r.ctx.db.from('fluxos').delete().eq('id', r.fluxo.id);
  if (error) return erroDoBanco(error);
  return json({ ok: true });
}
