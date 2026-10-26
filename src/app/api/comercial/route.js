import {
  CONFIG_COMERCIAL_PADRAO,
  DESFECHOS_COMERCIAIS,
  validarConfigComercial,
} from '@/lib/comercial';
import { permissoesEfetivas, podeVerDepartamento } from '@/lib/perfis';
import { isValidUUID } from '@/lib/sanitize';
import { obterAcessoServidor } from '@/lib/server/acesso';
import { contextoDaRequisicao } from '@/lib/server/organizacao';

export const dynamic = 'force-dynamic';
const json = (corpo, status = 200) => Response.json(corpo, { status });
async function contexto(request) {
  // Banco preso à empresa de quem está logado: reuniões, leads e configuração são da assinante
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx;
  const { db } = ctx;
  const sessao = { sub: ctx.email };
  const [membros, perfis, configuracao] = await Promise.all([
    db
      .from('equipe_usuarios')
      .select('email, papel, ativo, perfil_id, departamentos_bloqueados')
      .eq('email', sessao.sub),
    db.from('perfis_acesso').select('*'),
    db.from('sistema_config').select('valor').eq('chave', 'comercial').maybeSingle(),
  ]);
  if (membros.error || perfis.error || configuracao.error)
    return {
      erro: json(
        { ok: false, mensagem: 'Não foi possível verificar o acesso e a configuração comercial.' },
        503,
      ),
    };
  const perm = permissoesEfetivas({
    email: sessao.sub,
    equipe: membros.data || [],
    perfis: perfis.data || [],
    adminsExtras: process.env.RM_ADMIN_EMAILS,
  });
  if (!perm.modulos.includes('comercial'))
    return { erro: json({ ok: false, mensagem: 'Seu perfil não tem acesso ao Comercial.' }, 403) };
  const config = validarConfigComercial(configuracao.data?.valor || CONFIG_COMERCIAL_PADRAO);
  return { db, perm, config };
}
const elegivel = (evento, perm, config) =>
  podeVerDepartamento(perm, evento.departamento) &&
  config.departamentos.some(
    (d) =>
      d.trim().toLowerCase() ===
      String(evento.departamento || '')
        .trim()
        .toLowerCase(),
  ) &&
  !evento.chamado_id &&
  evento.origem !== 'fila_demandas' &&
  !evento.is_mock;

export async function GET(request) {
  const { erro, db, perm, config } = await contexto(request);
  if (erro) return erro;
  const mes = new URL(request.url).searchParams.get('mes');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || ''))
    return json({ ok: false, mensagem: 'Mês inválido.' }, 400);
  const [ano, numeroMes] = mes.split('-').map(Number);
  const fim = `${mes}-${new Date(ano, numeroMes, 0).getDate()}`;
  const eventos = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await db
      .from('agenda_eventos')
      .select('*')
      .gte('data', `${mes}-01`)
      .lte('data', fim)
      .order('data')
      .order('id')
      .range(inicio, inicio + 999);
    if (error)
      return json({ ok: false, mensagem: 'Não foi possível carregar as reuniões do mês.' }, 500);
    eventos.push(...(data || []).filter((e) => elegivel(e, perm, config)));
    if ((data || []).length < 1000) break;
  }
  const leads = [];
  let avisoLeads = '';
  for (let inicio = 0; config.departamentos.length; inicio += 1000) {
    const { data, error } = await db
      .from('comercial_leads')
      .select('*')
      .in('departamento', config.departamentos)
      .order('created_at')
      .order('id')
      .range(inicio, inicio + 999);
    if (error) {
      avisoLeads =
        'Leads indisponíveis. Verifique a atualização migration_comercial_webhooks.sql no Supabase.';
      break;
    }
    leads.push(
      ...(data || []).filter(
        (e) =>
          elegivel(e, perm, config) &&
          (!['ganho', 'perda'].includes(e.comercial_etapa_id) ||
            String(e.updated_at).startsWith(mes)),
      ),
    );
    if ((data || []).length < 1000) break;
  }
  return json({ ok: true, eventos, leads, config, aviso_leads: avisoLeads });
}

export async function PATCH(request) {
  const { erro, db, perm, config } = await contexto(request);
  if (erro) return erro;
  const body = await request.json().catch(() => ({}));
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Reunião inválida.' }, 400);
  const lead = body.tipo === 'lead';
  const tabela = lead ? 'comercial_leads' : 'agenda_eventos';
  const { data: evento, error: erroLeitura } = await db
    .from(tabela)
    .select('*')
    .eq('id', body.id)
    .maybeSingle();
  if (erroLeitura) return json({ ok: false, mensagem: 'Não foi possível ler a reunião.' }, 503);
  if (!evento) return json({ ok: false, mensagem: 'Reunião não encontrada.' }, 404);
  if (!elegivel(evento, perm, config))
    return json(
      { ok: false, mensagem: 'Esta reunião não está disponível para seu perfil no Comercial.' },
      403,
    );
  const pipeline = config.pipelines.find((p) => p.id === body.pipelineId);
  if (
    !pipeline ||
    ![...pipeline.etapas, ...DESFECHOS_COMERCIAIS].some((e) => e.id === body.etapaId)
  )
    return json({ ok: false, mensagem: 'Pipeline ou etapa inválida.' }, 400);
  const campos = {
    comercial_pipeline_id: pipeline.id,
    comercial_etapa_id: body.etapaId,
    updated_at: new Date().toISOString(),
  };
  if (lead) {
    campos.ultima_ocorrencia_em = campos.updated_at;
    if (body.responsavel_email !== undefined) {
      const email = String(body.responsavel_email || '')
        .trim()
        .toLowerCase();
      if (email) {
        const acesso = await obterAcessoServidor(email);
        // O responsável precisa ser da MESMA empresa (a consulta abaixo já é presa a ela)
        const { data: membro } = await db
          .from('equipe_usuarios')
          .select('nome')
          .eq('email', email)
          .maybeSingle();
        if (!acesso.liberado || !(membro || acesso.proprietario))
          return json({ ok: false, mensagem: 'Escolha um colaborador ativo da equipe.' }, 400);
        campos.responsavel_email = email;
        campos.responsavel_nome = membro?.nome || email;
      } else {
        campos.responsavel_email = null;
        campos.responsavel_nome = null;
      }
    }
  }
  const { data, error } = await db
    .from(tabela)
    .update(campos)
    .eq('id', evento.id)
    .select('*')
    .single();
  if (error)
    return json(
      {
        ok: false,
        mensagem: /column|schema cache/i.test(error.message)
          ? `Aplique a atualização ${lead ? 'migration_comercial_webhooks.sql' : 'migration_comercial_pipeline.sql'} no Supabase para salvar as etapas.`
          : 'Não foi possível salvar a etapa.',
      },
      500,
    );
  return json({ ok: true, evento: data });
}
