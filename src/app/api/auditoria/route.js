import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { consumirLimite } from '@/lib/server/protecao';
import { enriquecerRegistros } from '@/lib/server/auditoriaEnriquecer';
import { limitesDoDia, termoDeBusca, validarEventoAuditoria } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

/**
 * Auditoria da empresa (tabela auditoria_logs, imutável).
 *  POST { acao, empresaId?, detalhes? }   registra uma ação feita no navegador. Quem fez (nome e e-mail),
 *                                         o IP e o navegador vêm da sessão e da requisição, não do corpo.
 *  GET ?dia=YYYY-MM-DD&fuso=180&busca=&pagina=1&porPagina=20   registros do dia (só administradores)
 *  GET ?resumo=1&ate=YYYY-MM-DD&dias=9&fuso=180               quantos registros houve em cada dia
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
const COLUNA_AUSENTE = /ip_origem|column|schema cache/i;

export async function POST(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  if (!(await consumirLimite(`auditoria_${ctx.email}`, 240, 60))) return json({ ok: false, mensagem: 'Muitos registros seguidos.' }, 429);
  let evento;
  try {
    evento = validarEventoAuditoria((await request.json().catch(() => null)) || {});
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  const { data: membro } = await ctx.db.from('equipe_usuarios').select('nome').eq('email', ctx.email).maybeSingle();
  const nome = membro?.nome || ctx.email;
  const linha = {
    usuario_email: ctx.email,
    usuario_nome: nome,
    operador_nome: nome,
    acao: evento.acao,
    empresa_id: evento.empresa_id,
    // O IP e o navegador entram em detalhes pelo db da requisição; aqui também, para bancos sem escopo
    detalhes: { ...evento.detalhes, ...(ctx.rede || {}) },
  };
  let r = await ctx.db.from('auditoria_logs').insert([{ ...linha, ip_origem: ctx.rede?.ip || null }]);
  // Bancos antigos sem a coluna ip_origem: o IP continua guardado em detalhes
  if (r.error && COLUNA_AUSENTE.test(r.error.message || '')) r = await ctx.db.from('auditoria_logs').insert([linha]);
  // empresa_id de uma empresa que não existe mais (ou ainda só local): registra sem o vínculo
  if (r.error && /foreign key|empresa_id/i.test(r.error.message || '')) r = await ctx.db.from('auditoria_logs').insert([{ ...linha, empresa_id: null }]);
  if (r.error) return json({ ok: false, mensagem: 'Não foi possível registrar na auditoria.' }, 500);
  return json({ ok: true });
}

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const p = new URL(request.url).searchParams;
  const fuso = Number(p.get('fuso')) || 0;
  try {
    if (p.get('resumo')) {
      const dias = Math.min(31, Math.max(1, Number(p.get('dias')) || 9));
      const ate = p.get('ate');
      const fim = new Date(`${ate}T00:00:00Z`);
      if (Number.isNaN(fim.getTime())) throw new Error('Dia inválido.');
      const lista = Array.from({ length: dias }, (_, i) => new Date(fim.getTime() - (dias - 1 - i) * 86400000).toISOString().slice(0, 10));
      const contagens = await Promise.all(
        lista.map(async (dia) => {
          const { de, ate: limite } = limitesDoDia(dia, fuso);
          const { count } = await ctx.db.from('auditoria_logs').select('id', { count: 'exact', head: true }).gte('created_at', de).lt('created_at', limite);
          return [dia, count || 0];
        })
      );
      return json({ ok: true, dias: Object.fromEntries(contagens) });
    }

    const { de, ate } = limitesDoDia(p.get('dia'), fuso);
    const porPagina = [10, 20, 50, 100].includes(Number(p.get('porPagina'))) ? Number(p.get('porPagina')) : 20;
    const pagina = Math.max(1, Math.min(1000, Number(p.get('pagina')) || 1));
    let consulta = ctx.db.from('auditoria_logs').select('*', { count: 'exact' }).gte('created_at', de).lt('created_at', ate);
    const termo = termoDeBusca(p.get('busca'));
    if (termo) {
      const t = `*${termo}*`;
      consulta = consulta.or(
        [`usuario_nome.ilike.${t}`, `usuario_email.ilike.${t}`, `acao.ilike.${t}`, `detalhes->>empresa_nome.ilike.${t}`, `detalhes->>modulo.ilike.${t}`, `detalhes->>ip.ilike.${t}`].join(',')
      );
    }
    const { data, count, error } = await consulta.order('created_at', { ascending: false }).range((pagina - 1) * porPagina, pagina * porPagina - 1);
    if (error) return json({ ok: false, mensagem: error.message }, 500);
    const registros = await enriquecerRegistros(ctx.db, data || []).catch(() => data || []);
    return json({ ok: true, registros, total: count || 0, pagina, porPagina });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
}
