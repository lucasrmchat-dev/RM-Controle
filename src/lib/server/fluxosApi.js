/**
 * Acesso às rotas do Fluxo Inteligente: pessoa logada, ativa, com o módulo "Fluxo Inteligente"
 * (e a empresa com o módulo contratado). Banco preso à empresa.
 */
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { permissaoDoChat, semModulo } from '@/lib/server/canais/chat';

export const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
export const tabelaAusente = (e) => /fluxo|does not exist|schema cache/i.test(String(e?.message || ''));
export const semMigracao = () => json({ ok: false, mensagem: 'O Fluxo Inteligente ainda não foi instalado no banco. Rode supabase/migration_fluxos.sql no Supabase.' }, 503);
export const erroDoBanco = (error) => (tabelaAusente(error) ? semMigracao() : json({ ok: false, mensagem: error.message }, 500));

export async function acessoFluxos(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const bloqueio = semModulo(perm, 'fluxos', 'ao Fluxo Inteligente');
  if (bloqueio) return { erro: json({ ok: false, mensagem: bloqueio }, 403) };
  return { ctx, perm };
}

/** Linha da lista (sem o desenho inteiro). */
export const resumoFluxo = (f) => ({
  id: f.id,
  nome: f.nome,
  descricao: f.descricao || '',
  ativo: Boolean(f.ativo),
  gatilhos: f.gatilhos || [],
  blocos: Array.isArray(f.definicao?.nos) ? f.definicao.nos.length : 0,
  versao: f.versao || 1,
  atualizado_em: f.atualizado_em,
  atualizado_por: f.atualizado_por || f.criado_por || '',
});
