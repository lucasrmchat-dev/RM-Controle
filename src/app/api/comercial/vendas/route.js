import { validarVenda } from '@/lib/comissao';
import { isValidUUID } from '@/lib/sanitize';
import { consumirLimite } from '@/lib/server/protecao';
import { acessoComercial, avisoMigracaoVendas, json, semTabelaVendas } from '@/lib/server/comercialEquipe';

export const dynamic = 'force-dynamic';

/**
 * Vendas do comercial.
 *  POST { empresa, data, vendedor_email, mensalidade, adicionais, contato?, observacoes?, origem_tipo?, origem_id? }
 *  PATCH { id, ...campos }   DELETE { id }
 * Vendedor lança e mexe nas próprias vendas; administrador e gestor do comercial, nas de todos.
 */
async function preparar(request) {
  const a = await acessoComercial(request);
  if (a.erro) return a;
  if (!(await consumirLimite(`vendas_${a.eu}`, 60, 60))) return { erro: json({ ok: false, mensagem: 'Muitas alterações seguidas. Aguarde um instante.' }, 429) };
  return { ...a, body: (await request.json().catch(() => null)) || {} };
}
const erroBanco = (error, padrao) => json({ ok: false, mensagem: semTabelaVendas(error) ? avisoMigracaoVendas : padrao }, semTabelaVendas(error) ? 503 : 500);

function campos(a, body, atual = null) {
  const venda = validarVenda({ ...(atual || {}), ...body, vendedor_email: body.vendedor_email ?? atual?.vendedor_email ?? a.eu });
  if (!a.gestor && venda.vendedor_email !== a.eu) throw new Error('Você só pode lançar vendas suas.');
  const vendedor = a.vendedores.find((v) => v.email === venda.vendedor_email);
  if (!vendedor) throw new Error('Escolha um vendedor da equipe do comercial.');
  return { ...venda, vendedor_nome: vendedor.nome };
}

export async function POST(request) {
  const a = await preparar(request);
  if (a.erro) return a.erro;
  let linha;
  try {
    linha = campos(a, a.body);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  const { data, error } = await a.ctx.db.from('comercial_vendas').insert([{ ...linha, criado_por: a.eu, atualizado_por: a.eu }]).select('*').single();
  if (error) return erroBanco(error, 'Não foi possível registrar a venda.');
  return json({ ok: true, venda: data }, 201);
}

async function carregar(a) {
  if (!isValidUUID(a.body.id)) return { erro: json({ ok: false, mensagem: 'Venda inválida.' }, 400) };
  const { data, error } = await a.ctx.db.from('comercial_vendas').select('*').eq('id', a.body.id).maybeSingle();
  if (error) return { erro: erroBanco(error, 'Não foi possível ler a venda.') };
  if (!data) return { erro: json({ ok: false, mensagem: 'Venda não encontrada.' }, 404) };
  if (!a.gestor && String(data.vendedor_email).toLowerCase() !== a.eu) return { erro: json({ ok: false, mensagem: 'Só quem vendeu (ou um gestor) mexe nesta venda.' }, 403) };
  return { venda: data };
}

export async function PATCH(request) {
  const a = await preparar(request);
  if (a.erro) return a.erro;
  const c = await carregar(a);
  if (c.erro) return c.erro;
  let linha;
  try {
    const { id, ...resto } = a.body;
    linha = campos(a, resto, c.venda);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  delete linha.origem_tipo;
  delete linha.origem_id;
  const { data, error } = await a.ctx.db.from('comercial_vendas').update({ ...linha, atualizado_por: a.eu, atualizado_em: new Date().toISOString() }).eq('id', c.venda.id).select('*').single();
  if (error) return erroBanco(error, 'Não foi possível salvar a venda.');
  return json({ ok: true, venda: data });
}

export async function DELETE(request) {
  const a = await preparar(request);
  if (a.erro) return a.erro;
  const c = await carregar(a);
  if (c.erro) return c.erro;
  const { error } = await a.ctx.db.from('comercial_vendas').delete().eq('id', c.venda.id);
  if (error) return erroBanco(error, 'Não foi possível excluir a venda.');
  return json({ ok: true });
}
