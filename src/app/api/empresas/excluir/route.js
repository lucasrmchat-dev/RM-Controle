import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { validarSenhaEntrada, isValidUUID } from '@/lib/sanitize';
import { consumirLimite, ipDaRequisicao } from '@/lib/server/protecao';
import { verificarCredenciais, obterAcessoServidor } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { normalizarEmail } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const PAPEIS_QUE_EXCLUEM = ['administrador', 'suporte'];
const STATUS_ABERTOS = ['aguardando_visualizacao', 'em_andamento', 'pendente'];

const normalizarNome = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const erro = (mensagem, status) => NextResponse.json({ ok: false, mensagem }, { status });

// Exclusão definitiva de empresa. Quem exclui vem só do cookie de sessão assinado e precisa
// confirmar a PRÓPRIA senha e o nome da empresa. A ação fica em auditoria_logs com quem criou e quem excluiu.
export async function POST(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao?.sub) return erro('Sua sessão expirou. Entre novamente.', 401);
  const email = normalizarEmail(sessao.sub);

  if (!(await consumirLimite(`excluir_empresa_${email}`, 5, 15 * 60))) {
    return erro('Muitas tentativas. Aguarde alguns minutos.', 429);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return erro('Requisição inválida.', 400);

  const empresaId = typeof body.empresaId === 'string' ? body.empresaId.trim() : '';
  if (!isValidUUID(empresaId)) return erro('Empresa inválida.', 400);

  const acesso = await obterAcessoServidor(email);
  if (!acesso.liberado) return erro('Seu acesso está desativado.', 403);
  if (!acesso.proprietario && !PAPEIS_QUE_EXCLUEM.includes(acesso.papel)) {
    return erro('Seu perfil não pode excluir empresas.', 403);
  }

  const senha = validarSenhaEntrada(body.senha);
  if (!senha || !(await verificarCredenciais(email, senha)).ok) return erro('Senha incorreta.', 403);

  const db = getSupabaseAdmin();
  if (!db) return erro('Não foi possível excluir agora.', 503);

  const { data: empresa, error: erroEmpresa } = await db.from('empresas').select('*').eq('id', empresaId).maybeSingle();
  if (erroEmpresa) return erro('Não foi possível excluir agora.', 500);
  if (!empresa) return erro('Essa empresa já não existe.', 404);

  if (normalizarNome(body.confirmacaoNome) !== normalizarNome(empresa.nome)) {
    return erro('O nome digitado não confere com o da empresa.', 400);
  }

  const { count: abertas } = await db
    .from('suporte_chamados')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .in('status', STATUS_ABERTOS);
  if (abertas > 0) {
    return erro(`Há ${abertas} demanda${abertas > 1 ? 's' : ''} em aberto desta empresa. Conclua ou cancele antes de excluir.`, 409);
  }

  // Quem cadastrou: lido antes da exclusão, porque o vínculo empresa_id do log vira NULL depois
  const { data: cadastro } = await db
    .from('auditoria_logs')
    .select('usuario_email, usuario_nome, created_at')
    .eq('empresa_id', empresaId)
    .in('acao', ['cadastrou_empresa_manual', 'cadastrou_empresas_em_massa'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: membro } = await db.from('equipe_usuarios').select('id, nome').eq('email', email).maybeSingle();

  const { error: erroExclusao } = await db.from('empresas').delete().eq('id', empresaId);
  if (erroExclusao) return erro('Não foi possível excluir a empresa.', 500);

  const ip = ipDaRequisicao(request);
  const nomeOperador = membro?.nome || email;
  await db.from('auditoria_logs').insert([
    {
      empresa_id: null,
      usuario_id: membro?.id || null,
      usuario_email: email,
      usuario_nome: nomeOperador,
      operador_nome: nomeOperador,
      ip_origem: ip,
      acao: 'excluiu_empresa',
      detalhes: {
        modulo: 'Gestão de Empresas',
        empresa_id: empresaId,
        empresa_nome: empresa.nome,
        empresa_criada_em: empresa.created_at || null,
        cadastrada_por: cadastro ? cadastro.usuario_nome || cadastro.usuario_email : null,
        cadastrada_por_email: cadastro?.usuario_email || null,
        excluida_por: nomeOperador,
        excluida_por_email: email,
        senha_confirmada: true,
        ip_origem: ip,
        // Cópia dos dados principais para consulta futura (sem credenciais)
        snapshot: {
          servidor_alocado: empresa.servidor_alocado,
          formato_atendimento: empresa.formato_atendimento,
          ativo: empresa.ativo,
        },
      },
    },
  ]);

  return NextResponse.json({ ok: true, nome: empresa.nome });
}
