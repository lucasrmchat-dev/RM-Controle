import { contextoDaRequisicao, mensagemLimite } from '@/lib/server/organizacao';
import { moduloContratado } from '@/lib/plataforma';
import { validarDestinoWebhook } from '@/lib/server/whatsappAgenda';
import { cifrarSegredos, hashToken, novoToken } from '@/lib/server/canais/cofre';
import { canalPublico, configDoChat, enderecoWebhook, provedorDo, segredosDo, servidorQrDaPlataforma } from '@/lib/server/canais/index';
import { canalRecebeGrupos, validarCanal } from '@/lib/canais';
import { CHAVE_LIMPEZA_CANAIS, OPCOES_LIMPEZA, diasLimpezaCanais, limparCanaisInativos, registrarHistoricoCanal } from '@/lib/server/canais/historico';
import { getNomeEquipe } from '@/lib/server/canais/equipe';
import { isValidUUID } from '@/lib/sanitize';
import { canalLiberado, permissaoDoChat } from '@/lib/server/canais/chat';

export const dynamic = 'force-dynamic';

/**
 * Canais de WhatsApp da empresa.
 *  GET              lista (sem segredos)                      — qualquer pessoa da equipe
 *  POST             cria (segredos cifrados)                  — administradores
 *  PATCH { id, … }  nome, departamento padrão, ativo, ignorarGrupos           — administradores
 *  DELETE { id }    exclui (só sem conversas; senão, desative) — administradores
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const ctx = await contextoDaRequisicao(request);
  if (ctx.erro) return ctx.erro;
  if (!moduloContratado(ctx.org, 'conexoes')) return json({ ok: false, mensagem: 'Canais não fazem parte do plano da sua empresa.' }, 403);
  // Limpeza dos inativos antigos acontece aqui mesmo (administrador abrindo a tela), sem tarefa agendada
  const dias = await diasLimpezaCanais(ctx.db);
  if (ctx.admin) await limparCanaisInativos(ctx.db, dias).catch(() => {});
  const { data, error } = await ctx.db.from('canais').select('*').order('criado_em');
  if (error) return json({ ok: false, mensagem: /canais/.test(error.message) ? 'Rode supabase/migration_canais_chat.sql no Supabase.' : error.message }, 500);
  // Arquivados (inativos há muito tempo, com conversas guardadas) não aparecem mais na lista.
  // Com canais liberados ligados na pessoa (mesmo administrador), só os canais marcados para ela.
  const perm = await permissaoDoChat(ctx.db, ctx.email);
  const visiveis = (data || []).filter((c) => !c.config?.arquivado && canalLiberado(perm, c.id));
  return json({ ok: true, canais: visiveis.map(canalPublico), admin: ctx.admin, servidorQr: Boolean(servidorQrDaPlataforma()), limpezaDias: dias });
}

export async function POST(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  if (!moduloContratado(ctx.org, 'conexoes')) return json({ ok: false, mensagem: 'Canais não fazem parte do plano da sua empresa.' }, 403);
  const body = (await request.json().catch(() => null)) || {};
  let dados;
  try {
    dados = validarCanal({ ...body, servidorDaPlataforma: Boolean(servidorQrDaPlataforma()) });
    if (dados.canal.provedor === 'evolution' && dados.segredos.url) dados.segredos.url = (await validarDestinoWebhook(dados.segredos.url)).replace(/\/$/, '');
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
  // Token do webhook: a Meta usa como "token de verificação"; a Evolution recebe no cabeçalho ao conectar
  const token = novoToken();
  const { data, error } = await ctx.db
    .from('canais')
    .insert([{ ...dados.canal, credenciais_cifradas: cifrarSegredos(dados.segredos), webhook_token_hash: hashToken(token), criado_por: ctx.email }])
    .select('*')
    .single();
  if (error) {
    const limite = mensagemLimite(error);
    return json({ ok: false, mensagem: limite || error.message }, limite ? 403 : 500);
  }
  await registrarHistoricoCanal(ctx.db, { email: ctx.email, nome: await getNomeEquipe(ctx.db, ctx.email) }, data.id, 'canal_criou', { nome: data.nome, tipo: data.tipo });
  // Oficial: confere token e número na hora (e já mostra nome verificado e qualidade)
  if (data.provedor === 'meta') {
    try {
      const r = await provedorDo(data).situacao(data, segredosDo(data));
      await ctx.db.from('canais').update({ status: r.status, numero: r.numero, config: r.config, atualizado_em: new Date().toISOString() }).eq('id', data.id);
      Object.assign(data, { status: r.status, numero: r.numero, config: r.config });
    } catch (e) {
      await ctx.db.from('canais').update({ status: 'erro', status_detalhe: e.message.slice(0, 300) }).eq('id', data.id);
      Object.assign(data, { status: 'erro', status_detalhe: e.message });
    }
  }
  return json(
    {
      ok: true,
      canal: canalPublico(data),
      // Mostrado UMA vez: dados para colar no painel da Meta (Webhook › Callback URL e Verify token)
      ...(data.provedor === 'meta' ? { webhook: { url: enderecoWebhook(request, data.id), token_verificacao: token } } : {}),
    },
    201
  );
}

export async function PATCH(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  if (!moduloContratado(ctx.org, 'conexoes')) return json({ ok: false, mensagem: 'Canais não fazem parte do plano da sua empresa.' }, 403);
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Canal inválido.' }, 400);
  const campos = { atualizado_em: new Date().toISOString() };
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim().slice(0, 80);
    if (nome.length < 2) return json({ ok: false, mensagem: 'Nome muito curto.' }, 400);
    campos.nome = nome;
  }
  if (body.departamento_padrao !== undefined) campos.departamento_padrao = String(body.departamento_padrao || '').trim().slice(0, 60) || null;
  if (body.ativo !== undefined) campos.ativo = Boolean(body.ativo);
  const { data: antes } = await ctx.db.from('canais').select('*').eq('id', body.id).maybeSingle();
  if (!antes) return json({ ok: false, mensagem: 'Canal não encontrado.' }, 404);
  const config = { ...(antes.config || {}) };
  if (body.ignorarGrupos !== undefined) config.ignorarGrupos = Boolean(body.ignorarGrupos);
  // Quando foi desativado: base da limpeza automática dos inativos
  if (body.ativo !== undefined && Boolean(body.ativo) !== antes.ativo) {
    if (body.ativo) delete config.desativado_em;
    else config.desativado_em = new Date().toISOString();
  }
  if (body.ignorarGrupos !== undefined || body.ativo !== undefined) campos.config = config;
  const { data, error } = await ctx.db.from('canais').update(campos).eq('id', body.id).select('*').maybeSingle();
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  if (!data) return json({ ok: false, mensagem: 'Canal não encontrado.' }, 404);
  // Histórico do canal: o que mudou
  const quem = { email: ctx.email, nome: await getNomeEquipe(ctx.db, ctx.email) };
  if (body.ativo !== undefined && Boolean(body.ativo) !== antes.ativo) await registrarHistoricoCanal(ctx.db, quem, data.id, body.ativo ? 'canal_ativou' : 'canal_desativou');
  const mudancas = {};
  if (campos.nome !== undefined && campos.nome !== antes.nome) mudancas.nome = { de: antes.nome, para: campos.nome };
  if (campos.departamento_padrao !== undefined && (campos.departamento_padrao || null) !== (antes.departamento_padrao || null)) mudancas.departamento = { de: antes.departamento_padrao || 'Todos', para: campos.departamento_padrao || 'Todos' };
  if (body.ignorarGrupos !== undefined && Boolean(body.ignorarGrupos) !== Boolean(antes.config?.ignorarGrupos)) mudancas.grupos = body.ignorarGrupos ? 'não recebe grupos' : 'recebe grupos';
  if (Object.keys(mudancas).length) await registrarHistoricoCanal(ctx.db, quem, data.id, 'canal_editou', { mudancas });
  // Grupos ligados/desligados neste número: avisa o WhatsApp (QR Code) para nem mandar as mensagens de grupo
  let aviso = null;
  if (body.ignorarGrupos !== undefined && Boolean(antes.config?.ignorarGrupos) !== Boolean(data.config?.ignorarGrupos) && data.provedor === 'evolution' && data.status === 'conectado') {
    await provedorDo(data)
      .ajustarGrupos(data, segredosDo(data), canalRecebeGrupos(data, await configDoChat(ctx.db)))
      .catch(() => {
        aviso = 'Salvo, mas o WhatsApp não confirmou a mudança agora. Use Reiniciar no canal se os grupos continuarem chegando.';
      });
  }
  return json({ ok: true, canal: canalPublico(data), ...(aviso ? { aviso } : {}) });
}

/** PUT { limpezaDias }: depois de quantos dias inativo o canal sai da lista (0 = nunca). Administradores. */
export async function PUT(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  const body = (await request.json().catch(() => null)) || {};
  const dias = Number(body.limpezaDias);
  if (!OPCOES_LIMPEZA.includes(dias)) return json({ ok: false, mensagem: 'Prazo inválido.' }, 400);
  const { error } = await ctx.db.from('sistema_config').upsert([{ chave: CHAVE_LIMPEZA_CANAIS, valor: { dias } }], { onConflict: 'chave' });
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, limpezaDias: dias });
}

export async function DELETE(request) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  if (!moduloContratado(ctx.org, 'conexoes')) return json({ ok: false, mensagem: 'Canais não fazem parte do plano da sua empresa.' }, 403);
  const body = (await request.json().catch(() => null)) || {};
  if (!isValidUUID(body.id)) return json({ ok: false, mensagem: 'Canal inválido.' }, 400);
  const { data: canal } = await ctx.db.from('canais').select('*').eq('id', body.id).maybeSingle();
  if (!canal) return json({ ok: false, mensagem: 'Canal não encontrado.' }, 404);
  const { count } = await ctx.db.from('conversas').select('id', { count: 'exact', head: true }).eq('canal_id', canal.id);
  if (count > 0) return json({ ok: false, mensagem: 'Este canal tem conversas guardadas. Desative-o em vez de excluir, para não perder o histórico.' }, 409);
  await provedorDo(canal).remover(canal, segredosDo(canal)).catch(() => {});
  const { error } = await ctx.db.from('canais').delete().eq('id', canal.id);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true });
}
