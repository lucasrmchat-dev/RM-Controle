/**
 * Proteções contra abuso no servidor: captcha (Cloudflare Turnstile) e limite de tentativas.
 *
 * O limite de tentativas usa o Supabase (rm_consumir_limite): vale para TODAS as instâncias
 * serverless do Vercel. O limitador em memória do middleware continua como primeira barreira,
 * mas sozinho ele é contornável porque cada instância tem a própria memória.
 */
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { authRateLimiter } from '@/lib/rateLimit';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function ipDaRequisicao(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') || '127.0.0.1');
}

/** true quando o captcha está configurado (TURNSTILE_SECRET_KEY) e deve ser exigido. */
export function captchaExigido() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** Confere o token do Turnstile na Cloudflare. Sem chave configurada, não bloqueia. */
export async function verificarCaptcha(token, ip, fetchImpl = fetch) {
  if (!captchaExigido()) return { ok: true, ignorado: true };
  if (!token) return { ok: false, motivo: 'captcha_ausente' };
  try {
    const corpo = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: String(token), remoteip: ip || '' });
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', body: corpo });
    const json = await res.json();
    return json.success ? { ok: true } : { ok: false, motivo: 'captcha_invalido' };
  } catch (e) {
    // Falha de rede com a Cloudflare: recusa (fail-closed) para não abrir brecha
    return { ok: false, motivo: 'captcha_indisponivel' };
  }
}

/**
 * Consome uma tentativa do limite `chave`. Retorna false quando excedeu.
 * Usa o banco; se a função ainda não existir (antes da migração), cai no limitador em memória.
 */
export async function consumirLimite(chave, max, janelaSegundos) {
  const db = getSupabaseAdmin();
  if (db) {
    const { data, error } = await db.rpc('rm_consumir_limite', { p_chave: chave, p_max: max, p_janela_segundos: janelaSegundos });
    if (!error && typeof data === 'boolean') return data;
  }
  return authRateLimiter.check(chave, max, janelaSegundos * 1000).success;
}
