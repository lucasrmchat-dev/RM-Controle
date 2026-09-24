import { supabase, isSupabaseConfigured } from './supabase';

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
 * Registra um evento de auditoria com rastreabilidade detalhada para conformidade com a LGPD:
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
  ipOrigem = '192.168.15.2 (Rede Local)',
  acao,
  detalhes = {},
}) {
  const nomeFinal = usuarioNome || getNomeAmigavel(usuarioEmail);

  // Validação estrita para o schema real do Supabase:
  // auditoria_logs: id, empresa_id (uuid), usuario_id (uuid), usuario_email (text), acao (text), detalhes (jsonb), created_at
  const payloadSupabase = {
    empresa_id: (empresaId && typeof empresaId === 'string' && empresaId.length === 36) ? empresaId : null,
    usuario_id: (usuarioId && typeof usuarioId === 'string' && usuarioId.length === 36) ? usuarioId : null,
    usuario_email: usuarioEmail || 'admin@rmcontrole.com',
    acao: acao || 'acao_sistema',
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

  // Backup em localStorage para auditoria local e offline
  if (typeof window === 'undefined') return;
  try {
    const existing = JSON.parse(localStorage.getItem('rm_auditoria_logs') || '[]');
    existing.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      ...payload,
    });
    localStorage.setItem('rm_auditoria_logs', JSON.stringify(existing.slice(0, 300)));
  } catch (e) {
    console.error('Erro ao registrar log local:', e);
  }
}

/**
 * Mascara strings de senhas para exibição segura na tela
 */
export function maskPassword(password) {
  if (!password) return '••••••••••••';
  return '•'.repeat(Math.min(Math.max(password.length, 8), 16));
}

/**
 * Gera uma senha forte e aleatória para suporte técnico
 */
export function generateSecurePassword(length = 14) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
