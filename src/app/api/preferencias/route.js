import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { consumirLimite } from '@/lib/server/protecao';
import { validarPreferencias } from '@/lib/preferenciasConta';

export const dynamic = 'force-dynamic';

/**
 * Preferências da pessoa (cor, tema, avisos na tela, modo de visualização, sons), guardadas na conta.
 *  GET  → { ok, preferencias: {…} | null, atualizado_em }
 *  PUT  { preferencias: {…} } → grava (só chaves conhecidas)
 * O e-mail vem da sessão: cada pessoa lê e grava só as suas.
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
const tabelaAusente = (e) => /usuario_preferencias|does not exist|schema cache/i.test(String(e?.message || ''));

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  const { data, error } = await ctx.dbGlobal.from('usuario_preferencias').select('preferencias, atualizado_em').eq('email', ctx.email).maybeSingle();
  // Sem a tabela instalada (migração ainda não rodou): responde como "sem nada guardado" e a tela segue só com o navegador
  if (error) return tabelaAusente(error) ? json({ ok: true, preferencias: null, atualizado_em: null, indisponivel: true }) : json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, preferencias: data ? validarPreferencias(data.preferencias) : null, atualizado_em: data?.atualizado_em || null });
}

export async function PUT(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  if (!(await consumirLimite(`preferencias_${ctx.email}`, 60, 60))) return json({ ok: false, mensagem: 'Muitas gravações seguidas. Tente de novo em instantes.' }, 429);
  const corpo = await request.json().catch(() => ({}));
  const preferencias = validarPreferencias(corpo.preferencias);
  const { error } = await ctx.dbGlobal.from('usuario_preferencias').upsert({ email: ctx.email, preferencias, atualizado_em: new Date().toISOString() }, { onConflict: 'email' });
  if (error) return tabelaAusente(error) ? json({ ok: true, indisponivel: true }) : json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true });
}
