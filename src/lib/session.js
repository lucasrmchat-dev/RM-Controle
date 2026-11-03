import { SESSION_DURATION_SECONDS } from './sessionPolicy.js';
/**
 * Gestão Criptográfica de Sessão do RM Controle
 * Utiliza HMAC-SHA256 para assinatura de tokens em Cookies HTTP-Only com proteção SameSite=Lax/Strict e Secure.
 */

const SESSION_COOKIE_NAME = 'rm_session_token';
const DEFAULT_SECRET = 'rm_ctrl_sec_k9_f8a29b4e710d486cb7301c238e88e89f1';

// Em produção, nunca usa o segredo fixo do código (ele é público no repositório): sem SESSION_SECRET,
// deriva um segredo da SUPABASE_SERVICE_ROLE_KEY, que só existe no servidor.
let segredoDerivado = null;
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!segredoDerivado) segredoDerivado = `rm_sessao_${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
    return segredoDerivado;
  }
  return DEFAULT_SECRET;
}

/**
 * Converte Buffer para Base64 URL-safe
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Converte Base64 URL-safe para string decodificada
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Assina dados usando HMAC SHA-256
 */
async function sign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Buffer.from(signature)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Compara as assinaturas sem parar no primeiro caractere diferente (o tempo da resposta não revela
 * quanto de uma assinatura forjada estava certo). JS puro: também roda no middleware (Edge).
 */
function iguaisEmTempoConstante(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  let diferenca = x.length ^ y.length;
  for (let i = 0; i < y.length; i++) diferenca |= (x.charCodeAt(i) || 0) ^ y.charCodeAt(i);
  return diferenca === 0;
}

/**
 * Cria um token de sessão assinado e com expiração
 */
export async function createSessionToken({ email, role, userId = null }) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Date.now();
  // Validade alinhada à janela de 9 horas de inatividade.
  const payloadData = {
    sub: email,
    role: role || 'suporte',
    uid: userId,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + SESSION_DURATION_SECONDS * 1000) / 1000),
  };
  const payload = base64UrlEncode(JSON.stringify(payloadData));
  const dataToSign = `${header}.${payload}`;
  const signature = await sign(dataToSign, getSessionSecret());

  return `${dataToSign}.${signature}`;
}

/**
 * Valida o token de sessão e verifica assinatura e validade temporal
 */
export async function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const dataToSign = `${header}.${payload}`;

  try {
    const expectedSig = await sign(dataToSign, getSessionSecret());
    if (!iguaisEmTempoConstante(signature, expectedSig)) {
      return null; // Assinatura adulterada
    }

    const decodedPayload = JSON.parse(base64UrlDecode(payload));
    const nowSec = Math.floor(Date.now() / 1000);

    if (decodedPayload.exp && decodedPayload.exp < nowSec) {
      return null; // Token expirado
    }

    return decodedPayload;
  } catch (err) {
    return null;
  }
}

export { SESSION_COOKIE_NAME };
