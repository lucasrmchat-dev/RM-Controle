/**
 * Comercial no servidor: quem é vendedor, quem é gestor, regras de comissão e quem pode ver o quê.
 */
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { permissaoDoChat } from '@/lib/server/canais/chat';
import { CONFIG_COMERCIAL_PADRAO, validarConfigComercial } from '@/lib/comercial';
import { REGRAS_PADRAO, validarRegras, vendedoresVisiveis } from '@/lib/comissao';
import { ehGestorComercial, permissoesEfetivas, podeVerDepartamento } from '@/lib/perfis';
import { normalizarEmail } from '@/lib/roles';

export const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
export const CHAVE_REGRAS = 'comercial_comissao';
export const CHAVE_PRIVACIDADE = 'comercial_privacidade';
export const semTabelaVendas = (e) => /comercial_vendas|does not exist|schema cache/i.test(String(e?.message || ''));
export const avisoMigracaoVendas = 'Para registrar vendas, rode supabase/migration_comercial_vendas.sql no Supabase.';

async function valorConfig(db, chave) {
  const { data } = await db.from('sistema_config').select('valor').eq('chave', chave).maybeSingle();
  return data?.valor ?? null;
}

/** Acesso ao Comercial: pessoa logada com o módulo; traz configuração, regras e a equipe de vendas. */
export async function acessoComercial(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  if (!perm.modulos.includes('comercial')) return { erro: json({ ok: false, mensagem: 'Seu perfil não tem acesso ao Comercial.' }, 403) };
  const [cfg, regrasSalvas, privacidade, equipe, perfis] = await Promise.all([
    valorConfig(ctx.db, 'comercial'),
    valorConfig(ctx.db, CHAVE_REGRAS),
    valorConfig(ctx.db, CHAVE_PRIVACIDADE),
    ctx.db.from('equipe_usuarios').select('*'),
    ctx.db.from('perfis_acesso').select('*'),
  ]);
  let config;
  try {
    config = validarConfigComercial(cfg || CONFIG_COMERCIAL_PADRAO);
  } catch {
    config = CONFIG_COMERCIAL_PADRAO;
  }
  const regras = validarRegras(regrasSalvas || REGRAS_PADRAO);
  const membros = (equipe.data || []).map(({ senha, ...m }) => m).filter((m) => m.ativo !== false && m.email);
  // Vendedores: todos da equipe com acesso ao Comercial (não só quem já tem reunião)
  const vendedores = membros
    .filter((m) => permissoesEfetivas({ email: m.email, equipe: membros, perfis: perfis.data || [], adminsExtras: process.env.RM_ADMIN_EMAILS }).modulos.includes('comercial'))
    .map((m) => ({ email: normalizarEmail(m.email), nome: m.nome || m.email }));
  const eu = normalizarEmail(ctx.email);
  if (!vendedores.some((v) => v.email === eu)) vendedores.push({ email: eu, nome: perm.nome || ctx.email });
  vendedores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const gestor = ehGestorComercial(perm);
  const priv = privacidade && typeof privacidade === 'object' ? privacidade : {};
  const visiveis = new Set(vendedoresVisiveis({ eu, gestor, regras, vendedores, privacidade: priv }));
  return { ctx, perm, config, regras, vendedores, gestor, eu, privacidade: priv, visiveis };
}

/** Reunião que conta para o Comercial (departamento do comercial, visível para a pessoa, não é prazo de demanda). */
export const reuniaoDoComercial = (e, config, perm) =>
  !e.chamado_id &&
  e.origem !== 'fila_demandas' &&
  !e.is_mock &&
  config.departamentos.some((d) => d.trim().toLowerCase() === String(e.departamento || '').trim().toLowerCase()) &&
  podeVerDepartamento(perm, e.departamento);

/** Lê todas as linhas de uma consulta, de 1000 em 1000. */
export async function lerTudo(montar) {
  const linhas = [];
  for (let inicio = 0; inicio < 20000; inicio += 1000) {
    const { data, error } = await montar().range(inicio, inicio + 999);
    if (error) return { data: linhas, error };
    linhas.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  return { data: linhas, error: null };
}
