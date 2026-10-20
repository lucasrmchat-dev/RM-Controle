/**
 * Módulo de Sanitização e Validação Estrita de Dados (Conformidade LGPD e Proteção OWASP)
 * Previne ataques de XSS, injeção de comandos, poluição de protótipo e SQL Injection.
 */

/**
 * Remove caracteres de controle perigosos e tags HTML de strings de entrada
 */
export function sanitizeString(input, maxLength = 2000) {
  if (typeof input !== 'string') return '';
  // Limita tamanho para evitar sobrecarga de memória (DDoS por payload gigante)
  const truncated = input.slice(0, maxLength);
  return truncated
    .replace(/[<>]/g, '') // Remove < e > diretamente para anular tags HTML
    .replace(/javascript:/gi, '') // Remove pseudo-protocolo javascript:
    .replace(/vbscript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/on\w+=/gi, '') // Remove handlers como onclick=, onload=
    .trim();
}

/**
 * Sanitiza e-mails garantindo um formato estrito e normalização em minúsculas.
 * Só aceita letras, números e . _ + - antes do @ (sem %, *, aspas, barras, # ou ?),
 * então nenhum caractere especial chega a filtros do banco como curinga ou operador.
 */
const EMAIL_ESTRITO_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9_+-])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/;

export function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';
  const cleaned = email.trim().toLowerCase();
  if (cleaned.length > 254 || cleaned.includes('..')) return '';
  return EMAIL_ESTRITO_RE.test(cleaned) ? cleaned : '';
}

// Caracteres de controle (quebra de linha, byte nulo, etc.) nunca fazem parte de uma senha digitada
const CONTROLE_RE = /[\u0000-\u001F\u007F]/;
export const SENHA_MAX = 128;

/**
 * Valida a senha recebida numa requisição (login ou troca). Símbolos como / ? # ' " ; % são
 * permitidos e seguros: a senha só trafega como parâmetro e é guardada como hash bcrypt,
 * nunca é concatenada em consulta. Recusa tipos não-texto, tamanhos absurdos e caracteres de controle.
 */
export function validarSenhaEntrada(senha) {
  if (typeof senha !== 'string') return '';
  const limpa = senha.trim();
  if (!limpa || limpa.length > SENHA_MAX || CONTROLE_RE.test(limpa)) return '';
  return limpa;
}

/**
 * Valida se uma string é um UUID v4 legítimo para consultas de banco de dados
 */
export function isValidUUID(uuid) {
  if (typeof uuid !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid.trim());
}

/**
 * Sanitiza identificadores numéricos ou de instâncias (ex: números de telefone, portas)
 */
export function sanitizePhoneOrNumber(val) {
  if (typeof val !== 'string' && typeof val !== 'number') return '';
  return String(val).replace(/[^0-9+() -]/g, '').trim();
}

/**
 * Validação segura de senhas (mínimo de complexidade exigido para operadores)
 */
export function validatePasswordStrength(password) {
  if (typeof password !== 'string') return { valid: false, message: 'Senha inválida.' };
  if (password.length > SENHA_MAX || CONTROLE_RE.test(password)) {
    return { valid: false, message: `A senha deve ter no máximo ${SENHA_MAX} caracteres, sem quebras de linha.` };
  }
  if (password.length < 8) {
    return { valid: false, message: 'A senha deve ter no mínimo 8 caracteres.' };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return { valid: false, message: 'A senha deve conter ao menos uma letra e um número.' };
  }
  return { valid: true, message: 'Senha forte e conforme.' };
}

/**
 * Previne poluição de protótipo em objetos JSON deserializados
 */
export function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    clean[key] = sanitizeObject(value);
  }
  return clean;
}
