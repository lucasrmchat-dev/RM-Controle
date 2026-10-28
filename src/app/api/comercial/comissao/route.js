import { calcularAno, validarRegras } from '@/lib/comissao';
import { CHAVE_PRIVACIDADE, CHAVE_REGRAS, acessoComercial, json, lerTudo, reuniaoDoComercial, semTabelaVendas } from '@/lib/server/comercialEquipe';

export const dynamic = 'force-dynamic';

/**
 * Comissão do comercial (as regras da planilha de controle de atividade).
 *  GET ?mes=YYYY-MM     reuniões e vendas do mês e o resumo do ano, só dos vendedores que a pessoa pode ver
 *  PUT { regras }       valores por reunião/venda, por vendedor e visibilidade (administrador ou gestor)
 *  PUT { ocultar }      "não mostrar minhas vendas para outros vendedores" (quando a empresa deixa cada um escolher)
 */
const CAMPOS_REUNIAO = 'id, titulo, empresa, participante_nome, departamento, data, hora_inicio, status, responsavel_email, responsavel_nome, created_at, chamado_id, origem';

export async function GET(request) {
  const a = await acessoComercial(request);
  if (a.erro) return a.erro;
  const { ctx, perm, config, regras, vendedores, gestor, eu, privacidade, visiveis } = a;
  const mes = new URL(request.url).searchParams.get('mes') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return json({ ok: false, mensagem: 'Mês inválido.' }, 400);
  const ano = mes.slice(0, 4);
  // Ano inteiro (para o resumo anual): marcadas pela data de criação e feitas pela data da reunião
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const [porData, porCriacao] = await Promise.all([
    lerTudo(() => ctx.db.from('agenda_eventos').select(CAMPOS_REUNIAO).gte('data', inicio).lte('data', fim).order('id')),
    lerTudo(() => ctx.db.from('agenda_eventos').select(CAMPOS_REUNIAO).gte('created_at', `${Number(ano) - 1}-12-31T00:00:00Z`).lte('created_at', `${Number(ano) + 1}-01-01T06:00:00Z`).order('id')),
  ]);
  if (porData.error) return json({ ok: false, mensagem: 'Não foi possível ler as reuniões.' }, 500);
  const reunioes = new Map();
  [...porData.data, ...(porCriacao.data || [])].forEach((e) => reuniaoDoComercial(e, config, perm) && reunioes.set(e.id, e));
  const eventos = [...reunioes.values()].filter((e) => visiveis.has(String(e.responsavel_email || '').toLowerCase()));

  let vendas = [];
  let aviso = '';
  const v = await lerTudo(() => ctx.db.from('comercial_vendas').select('*').gte('data', inicio).lte('data', fim).order('data'));
  if (v.error) aviso = semTabelaVendas(v.error) ? 'Vendas indisponíveis: rode supabase/migration_comercial_vendas.sql no Supabase.' : 'Não foi possível ler as vendas.';
  else vendas = v.data.filter((x) => visiveis.has(String(x.vendedor_email || '').toLowerCase()));

  const equipe = vendedores.filter((p) => visiveis.has(p.email));
  return json({
    ok: true,
    mes,
    regras,
    gestor,
    eu,
    // Só faz sentido mostrar a opção quando a empresa deixa cada vendedor escolher
    podeOcultar: regras.visibilidade === 'escolha' && !gestor,
    ocultei: Boolean(privacidade[eu]),
    vendedores: equipe,
    todosVendedores: gestor ? vendedores : equipe,
    // Ano inteiro: a tela calcula o mês escolhido e o ranking sem pedir de novo
    eventos,
    vendas,
    anual: calcularAno({ ano, eventos, vendas, regras }),
    anualPorVendedor: Object.fromEntries(equipe.map((p) => [p.email, calcularAno({ ano, vendedor: p.email, eventos, vendas, regras }).map((m) => m.totais.comissao)])),
    aviso,
  });
}

export async function PUT(request) {
  const a = await acessoComercial(request);
  if (a.erro) return a.erro;
  const { ctx, gestor, eu, regras } = a;
  const body = (await request.json().catch(() => null)) || {};
  const agora = new Date().toISOString();
  if (body.regras) {
    if (!gestor) return json({ ok: false, mensagem: 'Só administradores e gestores do comercial alteram as regras de comissão.' }, 403);
    let novas;
    try {
      novas = validarRegras(body.regras);
    } catch (e) {
      return json({ ok: false, mensagem: e.message }, 400);
    }
    const { error } = await ctx.db.from('sistema_config').upsert({ chave: CHAVE_REGRAS, valor: novas, updated_at: agora }, { onConflict: 'chave' });
    if (error) return json({ ok: false, mensagem: 'Não foi possível salvar as regras.' }, 500);
    return json({ ok: true, regras: novas });
  }
  if (body.ocultar !== undefined) {
    if (regras.visibilidade !== 'escolha') return json({ ok: false, mensagem: 'A empresa definiu quem vê as vendas; esta opção não está liberada.' }, 403);
    const { data } = await ctx.db.from('sistema_config').select('valor').eq('chave', CHAVE_PRIVACIDADE).maybeSingle();
    const valor = { ...(data?.valor || {}), [eu]: Boolean(body.ocultar) };
    if (!body.ocultar) delete valor[eu];
    const { error } = await ctx.db.from('sistema_config').upsert({ chave: CHAVE_PRIVACIDADE, valor, updated_at: agora }, { onConflict: 'chave' });
    if (error) return json({ ok: false, mensagem: 'Não foi possível salvar sua preferência.' }, 500);
    return json({ ok: true, ocultei: Boolean(body.ocultar) });
  }
  return json({ ok: false, mensagem: 'Nada para salvar.' }, 400);
}
