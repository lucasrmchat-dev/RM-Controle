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
    .select('id, email, papel, ativo, senha, nome')
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

const BCRYPT_RE = /^\$2[abxy]\$/;

/** Confere a senha da equipe pelo hash bcrypt no banco (sem nunca trazer o hash para comparar aqui). */
async function senhaEquipeConfere(membro, email, senha) {
  if (!membro?.senha) return false;
  if (BCRYPT_RE.test(membro.senha)) {
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc('rm_verificar_senha_equipe', { p_email: email, p_senha: senha });
    return !error && data === true;
  }
  // Banco ainda não migrado (senha em texto puro): comparação direta, só até rodar a migração
  return membro.senha === senha;
}

async function localizarUsuarioAuth(admin, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const achado = (data?.users || []).find((u) => normalizarEmail(u.email) === email);
    if (achado) return achado;
    if ((data?.users || []).length < 200) return null;
  }
  return null;
}

/**
 * Garante que existe uma conta de login (Supabase Auth) com esta senha, já confirmada.
 * Substitui o antigo signUp feito pelo navegador, que exigia confirmação por e-mail.
 */
export async function garantirContaAuth(email, senha, metadados = {}) {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, erro: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY.' };
  const emailNorm = normalizarEmail(email);
  const { error } = await admin.auth.admin.createUser({
    email: emailNorm,
    password: senha,
    email_confirm: true,
    user_metadata: metadados,
  });
  if (!error) return { ok: true };
  const existente = await localizarUsuarioAuth(admin, emailNorm);
  if (!existente) return { ok: false, erro: error.message };
  const { error: erroAtualizar } = await admin.auth.admin.updateUserById(existente.id, {
    password: senha,
    email_confirm: true,
    user_metadata: { ...(existente.user_metadata || {}), ...metadados },
  });
  return erroAtualizar ? { ok: false, erro: erroAtualizar.message } : { ok: true };
}

export async function removerContaAuth(email) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const existente = await localizarUsuarioAuth(admin, normalizarEmail(email));
  if (existente) await admin.auth.admin.deleteUser(existente.id).catch(() => {});
}

/**
 * Confere e-mail e senha. Aceita a conta do Supabase Auth ou a senha de Equipe & Senhas (hash bcrypt).
 * Quando só uma das duas confere, sincroniza a outra para o próximo login funcionar nos dois lados.
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

  let authConfere = false;
  if (anon) {
    const { data, error } = await anon.auth.signInWithPassword({ email: emailNorm, password: senha });
    if (!error && data?.user) {
      authConfere = true;
      // 'local' encerra só esta verificação; o padrão (global) derrubaria a sessão do usuário no navegador
      await anon.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }

  const equipeConfere = authConfere ? false : await senhaEquipeConfere(membro, emailNorm, senha);
  if (!authConfere && !equipeConfere) return { ok: false, motivo: 'credenciais_invalidas' };

  // Sincronização: senha de Equipe & Senhas confere mas a conta de login não existe/está diferente
  if (equipeConfere) {
    await garantirContaAuth(emailNorm, senha, { name: membro?.nome || '', papel: membro?.papel || 'suporte' });
  } else if (membro && !(await senhaEquipeConfere(membro, emailNorm, senha))) {
    // Login pelo Supabase Auth: mantém a senha de Equipe & Senhas igual (o banco grava como hash)
    const db = getSupabaseAdmin();
    if (db) await db.from('equipe_usuarios').update({ senha }).eq('id', membro.id);
  }

  return { ok: true };
}
