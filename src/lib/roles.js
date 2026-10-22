/**
 * Fonte única de verdade dos papéis de acesso (servidor e navegador usam esta mesma regra).
 *
 * Ordem de decisão:
 *  1. E-mails proprietários (lista abaixo + variável RM_ADMIN_EMAILS no servidor) → administrador
 *  2. Papel cadastrado em Equipe & Senhas (equipe_usuarios.papel)
 *  3. Qualquer outro usuário → suporte (o papel com menos permissões administrativas)
 *
 * Não existe mais dedução pelo texto do e-mail (ex.: conter "admin" ou "lucas"): isso dava
 * privilégios a qualquer pessoa com esses termos no endereço e negava a quem era administrador.
 */

export const PAPEIS_VALIDOS = ['administrador', 'suporte', 'vendas'];

export const ADMINS_PROPRIETARIOS = ['admin@rmcontrole.com', 'lucas.rmchat@gmail.com', 'lucas@rmchat.com'];

export const ROTULOS_PAPEL = {
  administrador: 'Administrador',
  suporte: 'Suporte Técnico',
  vendas: 'Comercial & Vendas',
};

// Abas de Configurações Avançadas: exclusivas do administrador
export const ABAS_CONFIG_AVANCADAS = ['departamentos', 'categorias_demandas', 'canais', 'servidores', 'perfis', 'suporte_automatico', 'auditoria'];

export function normalizarEmail(email) {
  return String(email || '').toLowerCase().trim();
}

export function listaAdministradores(extra = '') {
  const doAmbiente = String(extra || '')
    .split(',')
    .map(normalizarEmail)
    .filter(Boolean);
  return new Set([...ADMINS_PROPRIETARIOS, ...doAmbiente]);
}

/**
 * @param {string} email
 * @param {Array<{email: string, papel: string, ativo?: boolean}>} equipe
 * @param {string} adminsExtras lista separada por vírgula (RM_ADMIN_EMAILS)
 */
export function resolverPapel(email, equipe = [], adminsExtras = '') {
  const alvo = normalizarEmail(email);
  if (!alvo) return 'suporte';
  if (listaAdministradores(adminsExtras).has(alvo)) return 'administrador';
  const membro = (equipe || []).find((u) => normalizarEmail(u?.email) === alvo && u?.ativo !== false);
  if (membro && PAPEIS_VALIDOS.includes(membro.papel)) return membro.papel;
  return 'suporte';
}

export function podeVerConfiguracoesAvancadas(papel) {
  return papel === 'administrador';
}

export function podeAcessarAbaConfiguracao(papel, abaId) {
  return !ABAS_CONFIG_AVANCADAS.includes(abaId) || podeVerConfiguracoesAvancadas(papel);
}
