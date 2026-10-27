/**
 * Aviso ao vivo para as telas abertas de uma empresa (Supabase Realtime, broadcast).
 * O aviso não leva conteúdo nenhum: só "mudou", e cada tela busca as novidades pelo servidor (que confere a
 * permissão). O nome do canal é derivado de um segredo do servidor, então quem não está logado não o conhece.
 */
import crypto from 'crypto';

export function topicoAoVivo(organizacaoId) {
  // Mesma chave no computador local e na Vercel (o mesmo projeto do Supabase), para os dois se entenderem
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SESSION_SECRET || 'rm';
  return `rm-chat-${crypto.createHmac('sha256', base).update(`ao-vivo:${organizacaoId || 'legado'}`).digest('hex').slice(0, 32)}`;
}

/** Avisa as telas da empresa; nunca atrasa nem derruba quem chamou (no máximo 2 segundos, erros ignorados). */
export async function avisarAoVivo(organizacaoId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 2000);
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: topicoAoVivo(organizacaoId), event: 'mudou', payload: {} }] }),
      signal: controle.signal,
    });
  } catch {
    // Sem aviso ao vivo, as telas ainda atualizam pela consulta periódica
  } finally {
    clearTimeout(limite);
  }
}
