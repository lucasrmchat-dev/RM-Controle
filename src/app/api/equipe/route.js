import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterPapelServidor, garantirContaAuth, removerContaAuth } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { PAPEIS_VALIDOS, normalizarEmail } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Gestão da equipe pelo servidor: cria a conta de login já confirmada e grava a senha
// (o banco converte em hash bcrypt). O navegador nunca recebe nem guarda senhas da equipe.
const COLUNAS_PUBLICAS = 'id, nome, email, papel, ativo, departamentos, departamentos_bloqueados, primeiro_acesso_concluido, primeiro_acesso_data, created_at';

function json(corpo, status = 200) {
  return Response.json(corpo, { status });
}

async function exigirAdmin(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao) return { erro: json({ ok: false, mensagem: 'Sessão expirada.' }, 401) };
  if ((await obterPapelServidor(sessao.sub)) !== 'administrador') {
    return { erro: json({ ok: false, mensagem: 'Apenas administradores podem gerenciar a equipe.' }, 403) };
  }
  const db = getSupabaseAdmin();
  if (!db) return { erro: json({ ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.' }, 503) };
  return { sessao, db };
}

function validarSenha(senha) {
  if (!senha) return null;
  if (String(senha).length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  return null;
}

function camposEditaveis(body) {
  const campos = {};
  if (body.nome !== undefined) campos.nome = String(body.nome).trim().slice(0, 120);
  if (body.papel !== undefined) {
    if (!PAPEIS_VALIDOS.includes(body.papel)) return { erro: 'Papel inválido.' };
    campos.papel = body.papel;
  }
  if (body.ativo !== undefined) campos.ativo = Boolean(body.ativo);
  if (Array.isArray(body.departamentos)) campos.departamentos = body.departamentos.map(String);
  if (Array.isArray(body.departamentos_bloqueados)) campos.departamentos_bloqueados = body.departamentos_bloqueados.map(String);
  return { campos };
}

export async function GET(request) {
  const { erro, db } = await exigirAdmin(request);
  if (erro) return erro;
  const { data, error } = await db.from('equipe_usuarios').select(COLUNAS_PUBLICAS).order('nome');
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, equipe: data });
}

export async function POST(request) {
  const { erro, db } = await exigirAdmin(request);
  if (erro) return erro;
  const body = await request.json().catch(() => ({}));
  const email = normalizarEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, mensagem: 'Informe um e-mail válido.' }, 400);
  const erroSenha = !body.senha ? 'Informe a senha inicial.' : validarSenha(body.senha);
  if (erroSenha) return json({ ok: false, mensagem: erroSenha }, 400);
  const { campos, erro: erroCampos } = camposEditaveis({ papel: 'suporte', ...body });
  if (erroCampos) return json({ ok: false, mensagem: erroCampos }, 400);

  const { data: existente } = await db.from('equipe_usuarios').select('id').eq('email', email).maybeSingle();
  if (existente) return json({ ok: false, mensagem: 'Já existe um membro cadastrado com este e-mail.' }, 409);

  const conta = await garantirContaAuth(email, body.senha, { name: campos.nome || '', papel: campos.papel });
  if (!conta.ok) return json({ ok: false, mensagem: `Não foi possível criar o login: ${conta.erro}` }, 500);

  const { data, error } = await db
    .from('equipe_usuarios')
    .insert([{ nome: campos.nome || email.split('@')[0], email, senha: body.senha, ativo: true, ...campos }])
    .select(COLUNAS_PUBLICAS)
    .single();
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, membro: data }, 201);
}

export async function PATCH(request) {
  const { erro, db } = await exigirAdmin(request);
  if (erro) return erro;
  const body = await request.json().catch(() => ({}));
  const { data: atual } = await db.from('equipe_usuarios').select('id, email, nome, papel').eq(body.id ? 'id' : 'email', body.id || normalizarEmail(body.email)).maybeSingle();
  if (!atual) return json({ ok: false, mensagem: 'Membro não encontrado.' }, 404);

  const { campos, erro: erroCampos } = camposEditaveis(body);
  if (erroCampos) return json({ ok: false, mensagem: erroCampos }, 400);
  const erroSenha = validarSenha(body.senha);
  if (erroSenha) return json({ ok: false, mensagem: erroSenha }, 400);
  if (body.senha) {
    const conta = await garantirContaAuth(atual.email, body.senha, { name: campos.nome || atual.nome, papel: campos.papel || atual.papel });
    if (!conta.ok) return json({ ok: false, mensagem: `Não foi possível atualizar o login: ${conta.erro}` }, 500);
    campos.senha = body.senha;
  }

  const { data, error } = await db.from('equipe_usuarios').update(campos).eq('id', atual.id).select(COLUNAS_PUBLICAS).single();
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, membro: data });
}

export async function DELETE(request) {
  const { erro, db, sessao } = await exigirAdmin(request);
  if (erro) return erro;
  const body = await request.json().catch(() => ({}));
  const { data: atual } = await db.from('equipe_usuarios').select('id, email').eq(body.id ? 'id' : 'email', body.id || normalizarEmail(body.email)).maybeSingle();
  if (!atual) return json({ ok: false, mensagem: 'Membro não encontrado.' }, 404);
  if (normalizarEmail(atual.email) === normalizarEmail(sessao.sub)) {
    return json({ ok: false, mensagem: 'Você não pode remover o próprio acesso.' }, 400);
  }
  const { error } = await db.from('equipe_usuarios').delete().eq('id', atual.id);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  // Remove também o login: sem isso a pessoa continuaria entrando no Supabase
  await removerContaAuth(atual.email);
  return json({ ok: true });
}
