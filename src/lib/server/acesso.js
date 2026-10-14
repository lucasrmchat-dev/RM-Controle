/**
 * Controle de acesso no servidor: credenciais e papel do usuário.
 * O papel é sempre recalculado a partir do banco (equipe_usuarios), então uma mudança de papel
 * em Equipe & Senhas vale na próxima requisição, sem depender do que foi gravado no cookie.
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { resolverPapel, normalizarEmail } from '@/lib/roles';

let clienteAnon = null;
function getSupabaseAnon() {
  if (clienteAnon) return clienteAnon;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return null;
  clienteAnon = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  return clienteAnon;
}

// Permite injetar clientes simulados nos testes
export function __definirSupabaseAnon(cliente) {
  clienteAnon = cliente;
}

async function buscarMembroEquipe(email) {
  const db = getSupabaseAdmin();
  if (!db) return { disponivel: false, membro: null };
  const { data, error } = await db
    .from('equipe_usuarios')
    .select('email, papel, ativo, senha')
    .eq('email', normalizarEmail(email))
    .maybeSingle();
  if (error) return { disponivel: false, membro: null };
  return { disponivel: true, membro: data || null };
}

/** Papel atual do usuário segundo o cadastro da equipe e a lista de administradores. */
export async function obterPapelServidor(email) {
  const { membro } = await buscarMembroEquipe(email);
  return resolverPapel(email, membro ? [membro] : [], process.env.RM_ADMIN_EMAILS);
}

/**
 * Confere e-mail e senha. Aceita a conta do Supabase Auth ou a senha cadastrada em Equipe & Senhas
 * (mesmas duas formas aceitas pela tela de login).
 * @returns {Promise<{ ok: boolean, motivo?: string }>}
 */
export async function verificarCredenciais(email, senha) {
  const emailNorm = normalizarEmail(email);
  if (!emailNorm || !senha) return { ok: false, motivo: 'credenciais_invalidas' };

  const anon = getSupabaseAnon();
  const { disponivel, membro } = await buscarMembroEquipe(emailNorm);

  if (!anon && !disponivel) {
    // Sem banco configurado: só permitido em desenvolvimento local
    return process.env.NODE_ENV === 'production'
      ? { ok: false, motivo: 'servidor_nao_configurado' }
      : { ok: true };
  }

  if (membro && membro.ativo === false) return { ok: false, motivo: 'usuario_inativo' };

  if (anon) {
    const { data, error } = await anon.auth.signInWithPassword({ email: emailNorm, password: senha });
    if (!error && data?.user) {
      // 'local' encerra só esta verificação; o padrão (global) derrubaria a sessão do usuário no navegador
      await anon.auth.signOut({ scope: 'local' }).catch(() => {});
      return { ok: true };
    }
  }

  if (membro?.senha && membro.senha === senha) return { ok: true };

  return { ok: false, motivo: 'credenciais_invalidas' };
}
