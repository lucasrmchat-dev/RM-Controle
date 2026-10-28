import { supabase, isSupabaseConfigured } from './supabase';
import { sanitizeString, sanitizeEmail } from './sanitize';

/**
 * Mascara e-mails para proteção de privacidade (LGPD Art. 6º, III - Minimização)
 * Ex: usuario@empresa.com -> u***o@empresa.com
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '***@***.***';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  return `${user[0]}${'*'.repeat(Math.min(user.length - 2, 5))}${user.slice(-1)}@${domain}`;
}

/**
 * Mascara strings de senhas para exibição segura na tela
 */
export function maskPassword(password) {
  if (!password) return '••••••••••••';
  return '•'.repeat(Math.min(Math.max(password.length, 8), 16));
}

/**
 * Gera uma senha forte e aleatória para suporte técnico com entropia elevada
 */
export function generateSecurePassword(length = 14) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pass = '';
  // Utiliza crypto segura nativa quando disponível
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const values = new Uint32Array(length);
    window.crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      pass += chars[values[i] % chars.length];
    }
    return pass;
  }
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Registra uma ação na auditoria da empresa.
 *
 * Quem fez (nome e e-mail), o IP real e o navegador são preenchidos pelo SERVIDOR (POST /api/auditoria),
 * a partir da sessão e da requisição: o navegador só informa o que aconteceu. Por isso `usuarioEmail`,
 * `usuarioNome` e `ipOrigem` são ignorados (ficam na assinatura para as chamadas antigas).
 * Sem Supabase (modo local de demonstração), guarda uma cópia mínima no navegador.
 */
export async function logAuditoria({ empresaId = null, usuarioEmail = null, acao, detalhes = {} }) {
  const acaoLimpa = sanitizeString(acao || 'acao_sistema').slice(0, 60);
  if (typeof window === 'undefined') return;

  if (isSupabaseConfigured && supabase) {
    try {
      await fetch('/api/auditoria', {
        method: 'POST',
        credentials: 'same-origin',
        // keepalive: o registro chega mesmo se a pessoa trocar de tela ou fechar a aba logo em seguida
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: acaoLimpa, empresaId, detalhes }),
      });
    } catch (err) {
      console.warn('Falha ao registrar na auditoria:', err);
    }
    return;
  }

  try {
    const existing = JSON.parse(localStorage.getItem('rm_auditoria_logs') || '[]');
    existing.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      empresa_id: empresaId,
      usuario_email: maskEmail(sanitizeEmail(usuarioEmail) || ''), // Minimização de dados no armazenamento local
      acao: acaoLimpa,
      detalhes: { modulo: detalhes?.modulo, empresa_nome: detalhes?.empresa_nome },
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('rm_auditoria_logs', JSON.stringify(existing.slice(0, 300)));
  } catch (e) {
    // Falha silenciosa
  }
}
