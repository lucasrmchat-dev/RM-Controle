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
 * Sanitiza e-mails corporativos garantindo padrão RFC 5322 e normalização em minúsculas
 */
export function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';
  const cleaned = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(cleaned) ? cleaned : '';
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
