import { supabase, isSupabaseConfigured } from './supabase';
import { sanitizeString, sanitizeEmail } from './sanitize';

/**
 * Converte e-mail em nome amigável se não fornecido
 */
function getNomeAmigavel(email) {
  if (!email) return 'Operador do Sistema';
  if (email.toLowerCase().includes('admin')) return 'Lucas Amorim (Administrador)';
  if (email.toLowerCase().includes('suporte')) return 'Equipe de Suporte Técnico';
  if (email.toLowerCase().includes('vendas')) return 'Equipe Comercial & Vendas';
  const namePart = email.split('@')[0];
  return namePart
    .split(/[._-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

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
 * Registra um evento de auditoria com rastreabilidade detalhada para conformidade com a LGPD (Art. 37):
 * - Nome do operador e e-mail
 * - Endereço IP do cliente/máquina
 * - Empresa afetada
 * - Módulo e funcionalidade alterada
 */
export async function logAuditoria({
  empresaId = null,
  usuarioId = null,
  usuarioEmail = 'admin@rmcontrole.com',
  usuarioNome = null,
  ipOrigem = 'Rede Local / Cliente Seguro',
  acao,
  detalhes = {},
}) {
  const nomeFinal = sanitizeString(usuarioNome || getNomeAmigavel(usuarioEmail));
  const emailLimpo = sanitizeEmail(usuarioEmail) || 'admin@rmcontrole.com';
  const acaoLimpa = sanitizeString(acao || 'acao_sistema');

  // Payload estrito e sanitizado para o Supabase
  const payloadSupabase = {
    empresa_id: (empresaId && typeof empresaId === 'string' && empresaId.length === 36) ? empresaId : null,
    usuario_id: (usuarioId && typeof usuarioId === 'string' && usuarioId.length === 36) ? usuarioId : null,
    usuario_email: emailLimpo,
    usuario_nome: nomeFinal,
    operador_nome: nomeFinal,
    ip_origem: sanitizeString(ipOrigem),
    acao: acaoLimpa,
    detalhes: {
      ...detalhes,
      usuario_nome: nomeFinal,
      ip_origem: ipOrigem,
    },
  };

  try {
    if (isSupabaseConfigured && supabase) {
      await supabase.from('auditoria_logs').insert([payloadSupabase]);
    }
  } catch (err) {
    console.warn('Falha ao persistir log de auditoria no Supabase:', err);
  }

  // Backup em memória / storage local para auditoria offline com privacidade
  if (typeof window === 'undefined') return;
  try {
    const existing = JSON.parse(localStorage.getItem('rm_auditoria_logs') || '[]');
    existing.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      empresa_id: payloadSupabase.empresa_id,
      usuario_email: maskEmail(emailLimpo), // Minimização de PII no storage local
      operador_nome: nomeFinal,
      acao: acaoLimpa,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('rm_auditoria_logs', JSON.stringify(existing.slice(0, 300)));
  } catch (e) {
    // Falha silenciosa
  }
}
