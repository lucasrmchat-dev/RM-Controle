/**
 * Limitador de Taxa de Requisições (Rate Limiter) em Memória para Proteção contra Força-Bruta e DDoS
 * Projetado para Edge e Node.js runtimes com janelas de tempo deslizantes por IP.
 */

class MemoryRateLimiter {
  constructor() {
    this.requests = new Map();
    // Limpeza automática periódica para evitar vazamento de memória (Memory Leak)
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => this.cleanup(), 60000);
      // Não impede o processo Node de encerrar (testes, builds)
      timer?.unref?.();
    }
  }

  /**
   * Checa se o IP excedeu o limite na janela informada
   * @param {string} key - Identificador único (normalmente IP do cliente)
   * @param {number} limit - Máximo de requisições permitidas na janela
   * @param {number} windowMs - Tamanho da janela em milissegundos
   * @returns {{ success: boolean, limit: number, remaining: number, resetMs: number }}
   */
  check(key, limit = 60, windowMs = 60000) {
    const now = Date.now();
    const record = this.requests.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      // Janela expirou, reinicia contador
      record.count = 1;
      record.resetTime = now + windowMs;
      this.requests.set(key, record);
      return {
        success: true,
        limit,
        remaining: limit - 1,
        resetMs: windowMs,
      };
    }

    record.count += 1;
    this.requests.set(key, record);

    if (record.count > limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        resetMs: Math.max(0, record.resetTime - now),
      };
    }

    return {
      success: true,
      limit,
      remaining: limit - record.count,
      resetMs: Math.max(0, record.resetTime - now),
    };
  }

  /**
   * Remove entradas antigas da memória
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// Instâncias globais especializadas
export const globalRateLimiter = new MemoryRateLimiter();
export const authRateLimiter = new MemoryRateLimiter(); // Mais rigoroso para rotas de login
