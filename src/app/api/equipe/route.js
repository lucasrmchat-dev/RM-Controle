import { garantirContaAuth, removerContaAuth } from '@/lib/server/acesso';
import { contextoDaRequisicao, mensagemLimite } from '@/lib/server/organizacao';
import { PAPEIS_VALIDOS, normalizarEmail, listaAdministradores } from '@/lib/roles';
import { sanitizeEmail, isValidUUID, SENHA_MAX } from '@/lib/sanitize';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Gestão da equipe pelo servidor: cria a conta de login já confirmada e grava a senha
// (o banco converte em hash bcrypt). O navegador nunca recebe nem guarda senhas da equipe.
const COLUNAS_BASE = 'id, nome, email, papel, ativo, departamentos, departamentos_bloqueados, primeiro_acesso_concluido, primeiro_acesso_data, created_at';
// perfil_id só existe depois de rodar supabase/migration_perfis_acesso.sql
let temColunaPerfil = true;
const colunasPublicas = () => (temColunaPerfil ? `${COLUNAS_BASE}, perfil_id` : COLUNAS_BASE);
const colunaPerfilAusente = (error) => /perfil_id/.test(error?.message || '');

/** Executa a consulta; se a coluna perfil_id ainda não existir, repete sem ela. */
async function comColunas(consulta) {
  let r = await consulta(colunasPublicas());
  if (r.error && temColunaPerfil && colunaPerfilAusente(r.error)) {
    temColunaPerfil = false;
    r = await consulta(colunasPublicas());
  }
  return r;
}

function json(corpo, status = 200) {
  return Response.json(corpo, { status });
}

// Administrador da empresa em que está; o banco fica preso a ela (só a própria equipe)
async function exigirAdmin(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx;
  return { ...ctx, sessao: { sub: ctx.email } };
}

// Localiza UM membro por id (uuid) ou e-mail exato; qualquer outro formato é recusado
async function buscarMembroAlvo(db, body, colunas) {
  if (body.id !== undefined && body.id !== null && body.id !== '') {
    if (!isValidUUID(body.id)) return null;
    return (await db.from('equipe_usuarios').select(colunas).eq('id', body.id).maybeSingle()).data;
  }
  const email = sanitizeEmail(body.email);
  if (!email) return null;
  return (await db.from('equipe_usuarios').select(colunas).eq('email', email).maybeSingle()).data;
}

function validarSenha(senha) {
  if (!senha) return null;
  if (typeof senha !== 'string') return 'Senha inválida.';
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha.length > SENHA_MAX) return `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
  if (/[\u0000-\u001F\u007F]/.test(senha)) return 'A senha não pode conter quebras de linha ou caracteres invisíveis.';
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
  if (body.perfil_id !== undefined) {
    if (body.perfil_id !== null && body.perfil_id !== '' && !isValidUUID(body.perfil_id)) return { erro: 'Perfil inválido.' };
    campos.perfil_id = body.perfil_id || null;
  }
  return { campos };
}

/** Com perfil, o papel do banco acompanha o perfil (as regras de segurança usam o papel). */
async function aplicarPerfil(db, campos) {
  // Tirou o perfil: volta ao papel informado (ou suporte), nunca herda o "administrador" do perfil antigo
  if (campos.perfil_id === null) {
    if (campos.papel === undefined) campos.papel = 'suporte';
    return null;
  }
  if (!campos.perfil_id) return null;
  const { data: perfil } = await db.from('perfis_acesso').select('id, administrador').eq('id', campos.perfil_id).maybeSingle();
  if (!perfil) return 'Perfil não encontrado.';
  campos.papel = perfil.administrador ? 'administrador' : 'suporte';
  return null;
}

/**
 * Proprietários do sistema (lista fixa/ambiente + tabela rm_admins_proprietarios desta empresa).
 * Eles têm acesso total sempre; como membros, podem ter nome, departamentos e vínculos editados,
 * mas nunca ser desativados, rebaixados ou removidos (isso trancaria o dono para fora).
 */
async function proprietariosDaEmpresa(ctx) {
  const lista = new Set(listaAdministradores(process.env.RM_ADMIN_EMAILS));
  if (ctx.org?.id) {
    const { data } = await ctx.dbGlobal.from('rm_admins_proprietarios').select('email').eq('organizacao_id', ctx.org.id).then((r) => r, () => ({ data: [] }));
    (data || []).forEach((p) => p.email && lista.add(normalizarEmail(p.email)));
  }
  return lista;
}

export async function GET(request) {
  const ctx = await exigirAdmin(request);
  const { erro, db } = ctx;
  if (erro) return erro;
  // ?proprietario=1: a tela pergunta se quem está logado é proprietário e se já aparece como membro
  if (new URL(request.url).searchParams.get('proprietario')) {
    const donos = await proprietariosDaEmpresa(ctx);
    const eu = normalizarEmail(ctx.email);
    const { data: meu } = await ctx.dbGlobal.from('equipe_usuarios').select('id, organizacao_id').eq('email', eu).maybeSingle();
    return json({ ok: true, email: eu, proprietario: donos.has(eu), vinculado: Boolean(meu), podeVincular: donos.has(eu) && !meu && !ctx.org?.suporte, proprietarios: [...donos] });
  }
  const { data, error } = await comColunas((cols) => db.from('equipe_usuarios').select(cols).order('nome'));
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, equipe: data });
}

export async function POST(request) {
  const ctx = await exigirAdmin(request);
  const { erro, db, dbGlobal } = ctx;
  if (erro) return erro;
  const body = (await request.json().catch(() => null)) || {};

  // Proprietário passa a aparecer como membro desta empresa (Servidores e equipe).
  // Não mexe no login: a senha guardada aqui é aleatória e é atualizada no próximo login com a senha real.
  if (body.acao === 'vincular_proprietario') {
    const eu = normalizarEmail(ctx.email);
    const donos = await proprietariosDaEmpresa(ctx);
    if (!donos.has(eu)) return json({ ok: false, mensagem: 'Só proprietários do sistema usam esta opção.' }, 403);
    if (ctx.org?.suporte) return json({ ok: false, mensagem: 'Saia do modo suporte e faça isso na sua própria empresa.' }, 400);
    const { data: jaExiste } = await dbGlobal.from('equipe_usuarios').select('id').eq('email', eu).maybeSingle();
    if (jaExiste) return json({ ok: false, mensagem: 'Você já está cadastrado como membro.' }, 409);
    const nome = String(body.nome || '').trim().slice(0, 120) || eu.split('@')[0];
    const { data, error } = await comColunas((cols) =>
      db.from('equipe_usuarios').insert([{ nome, email: eu, senha: crypto.randomBytes(24).toString('base64url'), papel: 'administrador', ativo: true }]).select(cols).single()
    );
    if (error) {
      const limite = mensagemLimite(error);
      return json({ ok: false, mensagem: limite || error.message }, limite ? 403 : 500);
    }
    return json({ ok: true, membro: data }, 201);
  }

  const email = sanitizeEmail(body.email);
  if (!email) return json({ ok: false, mensagem: 'Informe um e-mail válido (apenas letras, números e . _ + -).' }, 400);
  const erroSenha = !body.senha ? 'Informe a senha inicial.' : validarSenha(body.senha);
  if (erroSenha) return json({ ok: false, mensagem: erroSenha }, 400);
  const { campos, erro: erroCampos } = camposEditaveis({ papel: 'suporte', ...body });
  if (erroCampos) return json({ ok: false, mensagem: erroCampos }, 400);
  const erroPerfil = await aplicarPerfil(db, campos);
  if (erroPerfil) return json({ ok: false, mensagem: erroPerfil }, 400);

  // O e-mail identifica a pessoa em TODO o sistema: conferir em todas as empresas antes de mexer no login
  // (senão a senha de alguém de outra empresa seria trocada)
  const { data: existente } = await dbGlobal.from('equipe_usuarios').select('id').eq('email', email).maybeSingle();
  if (existente || listaAdministradores(process.env.RM_ADMIN_EMAILS).has(email)) {
    return json({ ok: false, mensagem: 'Este e-mail já está cadastrado no sistema. Use outro e-mail.' }, 409);
  }

  const conta = await garantirContaAuth(email, body.senha, { name: campos.nome || '', papel: campos.papel });
  if (!conta.ok) return json({ ok: false, mensagem: `Não foi possível criar o login: ${conta.erro}` }, 500);

  const { data, error } = await comColunas((cols) =>
    db
      .from('equipe_usuarios')
      .insert([{ nome: campos.nome || email.split('@')[0], email, senha: body.senha, ativo: true, ...campos }])
      .select(cols)
      .single()
  );
  if (error) {
    // O login já criado sem o cadastro correspondente não pode ficar sobrando
    await removerContaAuth(email);
    const limite = mensagemLimite(error);
    return json({ ok: false, mensagem: limite || error.message }, limite ? 403 : 500);
  }
  return json({ ok: true, membro: data }, 201);
}

export async function PATCH(request) {
  const ctx = await exigirAdmin(request);
  const { erro, db } = ctx;
  if (erro) return erro;
  const body = (await request.json().catch(() => null)) || {};
  const atual = await buscarMembroAlvo(db, body, 'id, email, nome, papel');
  if (!atual) return json({ ok: false, mensagem: 'Membro não encontrado.' }, 404);

  const { campos, erro: erroCampos } = camposEditaveis(body);
  if (erroCampos) return json({ ok: false, mensagem: erroCampos }, 400);
  // Proprietário: acesso total sempre (papel, perfil e "ativo" não mudam); o resto é editável
  const ehDono = (await proprietariosDaEmpresa(ctx)).has(normalizarEmail(atual.email));
  if (ehDono) {
    if (campos.ativo === false) return json({ ok: false, mensagem: 'O proprietário do sistema não pode ser desativado.' }, 400);
    // A senha do dono (o login dele) só ele mesmo troca
    if (body.senha && normalizarEmail(ctx.email) !== normalizarEmail(atual.email)) return json({ ok: false, mensagem: 'Só o próprio proprietário troca a senha dele.' }, 403);
    delete campos.papel;
    delete campos.perfil_id;
    delete campos.ativo;
  }
  const erroPerfil = await aplicarPerfil(db, campos);
  if (erroPerfil) return json({ ok: false, mensagem: erroPerfil }, 400);
  const erroSenha = validarSenha(body.senha);
  if (erroSenha) return json({ ok: false, mensagem: erroSenha }, 400);
  if (body.senha) {
    const conta = await garantirContaAuth(atual.email, body.senha, { name: campos.nome || atual.nome, papel: campos.papel || atual.papel });
    if (!conta.ok) return json({ ok: false, mensagem: `Não foi possível atualizar o login: ${conta.erro}` }, 500);
    campos.senha = body.senha;
  }

  const { data, error } = await comColunas((cols) => db.from('equipe_usuarios').update(campos).eq('id', atual.id).select(cols).single());
  if (error) {
    const limite = mensagemLimite(error);
    return json({ ok: false, mensagem: limite || error.message }, limite ? 403 : 500);
  }
  return json({ ok: true, membro: data });
}

export async function DELETE(request) {
  const ctx = await exigirAdmin(request);
  const { erro, db, sessao } = ctx;
  if (erro) return erro;
  const body = (await request.json().catch(() => null)) || {};
  const atual = await buscarMembroAlvo(db, body, 'id, email');
  if (!atual) return json({ ok: false, mensagem: 'Membro não encontrado.' }, 404);
  if (normalizarEmail(atual.email) === normalizarEmail(sessao.sub)) {
    return json({ ok: false, mensagem: 'Você não pode remover o próprio acesso.' }, 400);
  }
  // Remover apagaria também o login do dono do sistema
  if ((await proprietariosDaEmpresa(ctx)).has(normalizarEmail(atual.email))) {
    return json({ ok: false, mensagem: 'O proprietário do sistema não pode ser removido da equipe.' }, 400);
  }
  const { error } = await db.from('equipe_usuarios').delete().eq('id', atual.id);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  // Remove também o login: sem isso a pessoa continuaria entrando no Supabase
  await removerContaAuth(atual.email);
  return json({ ok: true });
}
