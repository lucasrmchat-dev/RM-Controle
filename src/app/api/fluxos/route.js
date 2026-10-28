import { ajustarCanais, definicaoVazia, gatilhosDe, lerArquivoFluxo, validarDefinicao } from '@/lib/fluxos';
import { acessoFluxos, erroDoBanco, json, resumoFluxo } from '@/lib/server/fluxosApi';
import { consumirLimite } from '@/lib/server/protecao';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Fluxo Inteligente: lista e criação.
 *  GET                                         fluxos da empresa (sem o desenho)
 *  POST { acao: 'criar', nome, descricao? }    fluxo novo, vazio e inativo
 *  POST { acao: 'importar', arquivo }          a partir de um JSON exportado (canais de outra empresa saem)
 *  POST { acao: 'duplicar', id }               cópia inativa
 */
const nomeValido = (n) => String(n || '').trim().slice(0, 120);

export async function GET(request) {
  const a = await acessoFluxos(request);
  if (a.erro) return a.erro;
  const { data, error } = await a.ctx.db.from('fluxos').select('*').order('atualizado_em', { ascending: false }).limit(500);
  if (error) return erroDoBanco(error);
  return json({ ok: true, fluxos: (data || []).map(resumoFluxo) });
}

export async function POST(request) {
  const a = await acessoFluxos(request);
  if (a.erro) return a.erro;
  const { ctx, perm } = a;
  if (!(await consumirLimite(`fluxos_${perm.email}`, 60, 60))) return json({ ok: false, mensagem: 'Muitas alterações seguidas. Aguarde um instante.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  let linha;
  let aviso = null;
  try {
    if (body.acao === 'criar') {
      const nome = nomeValido(body.nome);
      if (!nome) return json({ ok: false, mensagem: 'Dê um nome ao fluxo.' }, 400);
      linha = { nome, descricao: String(body.descricao || '').trim().slice(0, 500), definicao: definicaoVazia(), gatilhos: [] };
    } else if (body.acao === 'importar') {
      const lido = lerArquivoFluxo(body.arquivo);
      const { data: canais } = await ctx.db.from('canais').select('id');
      const removidos = ajustarCanais(lido.definicao, (canais || []).map((c) => c.id));
      if (removidos) aviso = 'Os canais de WhatsApp do arquivo não existem nesta empresa: escolha os canais nos blocos.';
      linha = { nome: nomeValido(body.nome) || lido.nome, descricao: lido.descricao, definicao: lido.definicao, gatilhos: gatilhosDe(lido.definicao) };
    } else if (body.acao === 'duplicar') {
      if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Fluxo inválido.' }, 400);
      const { data: origem, error } = await ctx.db.from('fluxos').select('*').eq('id', body.id).maybeSingle();
      if (error) return erroDoBanco(error);
      if (!origem) return json({ ok: false, mensagem: 'Fluxo não encontrado.' }, 404);
      const definicao = validarDefinicao(origem.definicao);
      linha = { nome: `${origem.nome} (cópia)`.slice(0, 120), descricao: origem.descricao, definicao, gatilhos: gatilhosDe(definicao) };
    } else {
      return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
    }
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  const { data, error } = await ctx.db
    .from('fluxos')
    .insert([{ ...linha, ativo: false, criado_por: perm.email, atualizado_por: perm.email }])
    .select('*')
    .single();
  if (error) return erroDoBanco(error);
  return json({ ok: true, fluxo: { ...resumoFluxo(data), definicao: data.definicao }, aviso }, 201);
}
