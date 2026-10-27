/**
 * Segredos dos canais (token da Meta, chave da Evolution...): AES-256-GCM com chave derivada do
 * segredo do servidor. O banco guarda só o texto cifrado, e o navegador nem lê a coluna.
 */
import crypto from 'crypto';

function chave() {
  const base = process.env.CANAIS_CHAVE || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'rm_dev_local';
  return crypto.createHash('sha256').update(`rm_canais:${base}`).digest();
}

export function cifrarSegredos(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj || {}), 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), dados].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decifrarSegredos(texto) {
  try {
    const [versao, iv, tag, dados] = String(texto || '').split('.');
    if (versao !== 'v1') return {};
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]).toString('utf8'));
  } catch {
    return {};
  }
}

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const novoToken = () => crypto.randomBytes(32).toString('base64url');

/** Compara em tempo constante (não revela quantos caracteres acertou). */
export function iguais(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
