import { after } from 'next/server';
import { ehGrupo } from '@/lib/canais';
import {
  DESTINOS_MAX,
  avaliarRisco,
  envioBloqueado,
  exigeAceite,
  TERMO_RISCO_MEDIO,
  formatarDuracao,
  intervaloSeguro,
  mensagemPersonalizada,
  validarEnvio,
} from '@/lib/envios';
import { isValidUUID } from '@/lib/sanitize';
import { canalLiberado, permissaoDoChat, semModulo } from '@/lib/server/canais/chat';
import { processarEnvios } from '@/lib/server/envios';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { consumirLimite } from '@/lib/server/protecao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Envios em massa (aba "Envios"; sub-módulo do Chat liberado no perfil de acesso).
 *  GET                      lista dos envios da empresa
 *  GET ?id=                 um envio com os contatos e grupos e a situação de cada um
 *  GET ?destinos=1          contatos e grupos que podem receber (com etiquetas, para filtrar na tela)
 *  POST { acao: 'criar', nome, canal_id, mensagem, intervalo_segundos, agendado_para?, contatos: [id…] }
 *  POST { acao: 'pausar' | 'retomar' | 'cancelar' | 'excluir', id }
 */
const json = (corpo, status = 200) =>
  Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
const CAMPOS_ENVIO =
  'id, nome, canal_id, mensagem, intervalo_segundos, status, agendado_para, proximo_envio_em, total, enviados, falhas, ultimo_erro, criado_por_nome, iniciado_em, concluido_em, criado_em';
const semTabela = (error) => /envios_massa|relation|schema cache/i.test(error?.message || '');
const FALTA_MIGRACAO =
  'Falta instalar no banco: rode supabase/migration_envios_massa.sql no Supabase.';

// Auditoria da empresa: quem criou, pausou, retomou, cancelou ou excluiu cada envio
const auditar = (db, perm, acao, envioId, extra = {}) =>
  db
    .from('auditoria_logs')
    .insert([
      {
        usuario_email: perm.email,
        usuario_nome: perm.nome,
        operador_nome: perm.nome,
        acao,
        detalhes: { modulo: 'Envios em massa', envio_id: envioId, ...extra },
      },
    ])
    .then(
      () => {},
      () => {},
    );

async function acesso(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return { erro: ctx.erro };
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const bloqueio =
    semModulo(perm, 'chat', 'ao Chat') ||
    (perm.modulos.includes('envios') ? null : 'Seu perfil não tem acesso aos envios em massa.');
  if (bloqueio) return { erro: json({ ok: false, mensagem: bloqueio }, 403) };
  return { ctx, perm };
}

// Canais que a pessoa pode usar (controle de canais do Chat vale aqui também)
const podeUsarCanal = (perm, canalId) =>
  canalLiberado(perm, canalId);

export async function GET(request) {
  const r = await acesso(request);
  if (r.erro) return r.erro;
  const { db } = r.ctx;
  const busca = new URL(request.url).searchParams;

  if (busca.get('destinos')) {
    const { data, error } = await db
      .from('contatos')
      .select('id, nome, telefone, etiquetas')
      .order('nome', { ascending: true })
      .limit(5000);
    if (error) return json({ ok: false, mensagem: 'Não foi possível ler os contatos.' }, 500);
    const destinos = (data || [])
      .filter((c) => c.telefone)
      .map((c) => ({
        id: c.id,
        nome: c.nome || '',
        telefone: ehGrupo(c.telefone) ? '' : c.telefone,
        grupo: ehGrupo(c.telefone),
        etiquetas: Array.isArray(c.etiquetas)
          ? c.etiquetas.filter((t) => !String(t).startsWith('dep:'))
          : [],
      }));
    const { data: canais } = await db
      .from('canais')
      .select('id, nome, status, ativo, tipo')
      .eq('ativo', true);
    return json({
      ok: true,
      destinos,
      canais: (canais || []).filter((k) => podeUsarCanal(r.perm, k.id)),
    });
  }

  const id = busca.get('id');
  if (id) {
    if (!isValidUUID(id)) return json({ ok: false, mensagem: 'Envio inválido.' }, 400);
    const { data: envio, error } = await db
      .from('envios_massa')
      .select(CAMPOS_ENVIO)
      .eq('id', id)
      .maybeSingle();
    if (error)
      return json(
        {
          ok: false,
          mensagem: semTabela(error) ? FALTA_MIGRACAO : 'Não foi possível ler o envio.',
        },
        semTabela(error) ? 503 : 500,
      );
    if (!envio) return json({ ok: false, mensagem: 'Envio não encontrado.' }, 404);
    const { data: linhas } = await db
      .from('envios_massa_destinos')
      .select('id, contato_id, status, erro, enviado_em, ordem')
      .eq('envio_id', id)
      .order('ordem', { ascending: true });
    const ids = [...new Set((linhas || []).map((l) => l.contato_id))];
    const { data: contatos } = ids.length
      ? await db.from('contatos').select('id, nome, telefone').in('id', ids)
      : { data: [] };
    const porId = new Map((contatos || []).map((c) => [c.id, c]));
    const destinos = (linhas || []).map((l) => {
      const c = porId.get(l.contato_id) || {};
      return {
        ...l,
        nome: c.nome || '',
        telefone: ehGrupo(c.telefone) ? '' : c.telefone || '',
        grupo: ehGrupo(c.telefone),
      };
    });
    return json({ ok: true, envio, destinos });
  }

  const { data, error } = await db
    .from('envios_massa')
    .select(CAMPOS_ENVIO)
    .order('criado_em', { ascending: false })
    .limit(100);
  if (error)
    return json(
      {
        ok: false,
        mensagem: semTabela(error) ? FALTA_MIGRACAO : 'Não foi possível ler os envios.',
      },
      semTabela(error) ? 503 : 500,
    );
  return json({ ok: true, envios: data || [] });
}

export async function POST(request) {
  const r = await acesso(request);
  if (r.erro) return r.erro;
  const { ctx, perm } = r;
  const { db } = ctx;
  if (!(await consumirLimite(`envios_${perm.email}`, 30, 60)))
    return json({ ok: false, mensagem: 'Muitas ações seguidas. Aguarde um minuto.' }, 429);
  const body = (await request.json().catch(() => null)) || {};

  if (body.acao === 'criar') {
    let dados;
    try {
      dados = validarEnvio(body);
    } catch (e) {
      return json({ ok: false, mensagem: e.message }, 400);
    }
    if (!isValidUUID(body.canal_id))
      return json({ ok: false, mensagem: 'Escolha o número que vai enviar.' }, 400);
    const { data: canal } = await db
      .from('canais')
      .select('id, nome, ativo, status')
      .eq('id', body.canal_id)
      .maybeSingle();
    if (!canal || !canal.ativo || !podeUsarCanal(perm, canal.id))
      return json({ ok: false, mensagem: 'Número não encontrado.' }, 400);
    // Só contatos e grupos da empresa (os de outra empresa nem aparecem na leitura com escopo)
    const validos = dados.contatos.filter(isValidUUID);
    const { data: existentes } = validos.length
      ? await db.from('contatos').select('id').in('id', validos)
      : { data: [] };
    const daEmpresa = new Set((existentes || []).map((c) => c.id));
    const contatos = validos.filter((id) => daEmpresa.has(id)).slice(0, DESTINOS_MAX);
    if (!contatos.length)
      return json({ ok: false, mensagem: 'Nenhum dos contatos escolhidos foi encontrado.' }, 400);

    // Probabilidade de bloqueio alta ou muito alta: não deixa enviar (só média ou baixa)
    const personalizada = mensagemPersonalizada(dados.mensagem);
    const avaliacao = avaliarRisco({
      segundos: dados.intervalo,
      quantidade: contatos.length,
      personalizada,
    });
    if (envioBloqueado(avaliacao)) {
      const seguro = intervaloSeguro({ quantidade: contatos.length, personalizada });
      return json(
        {
          ok: false,
          mensagem: `Envio bloqueado: probabilidade de bloqueio ${avaliacao.nivel.rotulo.toLowerCase()}. ${seguro ? `Use pelo menos ${formatarDuracao(seguro)} entre as mensagens ou ` : ''}escolha menos destinatários.`,
        },
        400,
      );
    }

    // Média: só com o termo de ciência do risco aceito (registrado na auditoria)
    if (exigeAceite(avaliacao) && body.aceite_risco !== true)
      return json(
        {
          ok: false,
          mensagem:
            'Probabilidade de bloqueio média: aceite o termo de ciência do risco para enviar.',
        },
        400,
      );

    const quando = dados.agendadoPara.toISOString();
    const { data: envio, error } = await db
      .from('envios_massa')
      .insert([
        {
          nome: dados.nome,
          canal_id: canal.id,
          mensagem: dados.mensagem,
          intervalo_segundos: dados.intervalo,
          status: 'agendado',
          agendado_para: quando,
          proximo_envio_em: quando,
          total: contatos.length,
          criado_por_email: perm.email,
          criado_por_nome: perm.nome,
        },
      ])
      .select(CAMPOS_ENVIO)
      .single();
    if (error)
      return json(
        {
          ok: false,
          mensagem: semTabela(error) ? FALTA_MIGRACAO : 'Não foi possível criar o envio.',
        },
        semTabela(error) ? 503 : 500,
      );
    const { error: erroDestinos } = await db.from('envios_massa_destinos').insert(
      contatos.map((contato_id, ordem) => ({
        envio_id: envio.id,
        contato_id,
        ordem,
        status: 'pendente',
      })),
    );
    if (erroDestinos) {
      await db.from('envios_massa').delete().eq('id', envio.id);
      return json({ ok: false, mensagem: 'Não foi possível guardar os contatos do envio.' }, 500);
    }
    await auditar(db, perm, 'envio_massa_criou', envio.id, {
      nome: envio.nome,
      total: contatos.length,
      intervalo: dados.intervalo,
      agendado_para: quando,
      probabilidade_bloqueio: avaliacao.nivel.rotulo,
      ...(exigeAceite(avaliacao) ? { termo_risco_aceito: TERMO_RISCO_MEDIO } : {}),
    });
    // Envio para agora: começa já, sem esperar o agendador (que continua o que não couber nesta chamada)
    if (new Date(quando).getTime() <= Date.now() + 5_000) {
      const dbGlobal = getSupabaseAdmin();
      try {
        after(() =>
          processarEnvios(dbGlobal, { envioId: envio.id, prazoMs: 50_000 }).catch((e) =>
            console.error('[envios] falha ao começar', envio.id, e.message),
          ),
        );
      } catch {
        // Fora de uma requisição de verdade (testes): o agendador começa o envio
      }
    }
    return json({ ok: true, envio });
  }

  if (!['pausar', 'retomar', 'cancelar', 'excluir'].includes(body.acao))
    return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Envio inválido.' }, 400);
  const { data: envio } = await db
    .from('envios_massa')
    .select('id, nome, status, iniciado_em, agendado_para')
    .eq('id', body.id)
    .maybeSingle();
  if (!envio) return json({ ok: false, mensagem: 'Envio não encontrado.' }, 404);
  const agora = new Date().toISOString();
  let campos;
  if (body.acao === 'pausar') {
    if (!['agendado', 'enviando'].includes(envio.status))
      return json({ ok: false, mensagem: 'Este envio não está em andamento.' }, 400);
    campos = { status: 'pausado' };
  } else if (body.acao === 'retomar') {
    if (envio.status !== 'pausado')
      return json({ ok: false, mensagem: 'Este envio não está pausado.' }, 400);
    // Agendado que ainda não começou volta para o horário marcado; os outros continuam agora
    const futuro = !envio.iniciado_em && new Date(envio.agendado_para).getTime() > Date.now();
    campos = {
      status: envio.iniciado_em ? 'enviando' : 'agendado',
      proximo_envio_em: futuro ? envio.agendado_para : agora,
      ultimo_erro: null,
    };
  } else if (body.acao === 'cancelar') {
    if (['concluido', 'cancelado'].includes(envio.status))
      return json({ ok: false, mensagem: 'Este envio já terminou.' }, 400);
    campos = { status: 'cancelado', concluido_em: agora };
  } else {
    if (envio.status === 'enviando')
      return json({ ok: false, mensagem: 'Pause ou cancele o envio antes de excluir.' }, 400);
    const { error } = await db.from('envios_massa').delete().eq('id', envio.id);
    if (error) return json({ ok: false, mensagem: 'Não foi possível excluir o envio.' }, 500);
    await auditar(db, perm, 'envio_massa_excluiu', envio.id, { nome: envio.nome });
    return json({ ok: true });
  }
  const { data: salvo, error } = await db
    .from('envios_massa')
    .update({ ...campos, atualizado_em: agora })
    .eq('id', envio.id)
    .eq('status', envio.status)
    .select(CAMPOS_ENVIO)
    .maybeSingle();
  if (error) return json({ ok: false, mensagem: 'Não foi possível atualizar o envio.' }, 500);
  if (!salvo)
    return json(
      { ok: false, mensagem: 'O envio mudou enquanto isso. Atualize a tela e tente de novo.' },
      409,
    );
  await auditar(db, perm, `envio_massa_${body.acao}`, envio.id, { nome: envio.nome });
  return json({ ok: true, envio: salvo });
}
