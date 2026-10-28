import { consumirLimite } from '@/lib/server/protecao';
import { avisarAoVivo } from '@/lib/server/canais/aoVivo';
import { configDoChat, enviarTextoNaConversa } from '@/lib/server/canais/index';
import { isValidUUID } from '@/lib/sanitize';
import { auditarChat, bloqueioSemAssumir, carregarConversa, juntarDetalhes, listarMensagens, podeVerConversa, prepararMensagem, registrarSistema, registrarVisualizacao } from '@/lib/server/canais/chat';
import { apagarArquivosDaConversa } from '@/lib/server/canais/midia';
import { apagarMensagem, editarMensagem, favoritarMensagem, fixarMensagem, reagirMensagem } from '@/lib/server/canais/acoes';

export const dynamic = 'force-dynamic';

/**
 * Uma conversa.
 *  GET ?antes=ISO                               mensagens (as 60 mais recentes, ou anteriores a `antes`)
 *  POST { acao: 'enviar', texto, assinar }      responde o cliente pelo WhatsApp (assume a conversa se estava na fila);
 *                                               assinar (padrão): o cliente recebe *Nome:* na primeira linha
 *  POST { acao: 'nota', texto }                 nota interna (o cliente não vê)
 *  POST { acao: 'assumir' | 'resolver' | 'reabrir' | 'lida' }
 *  POST { acao: 'transferir', departamento?, responsavel_email? }
 *  POST { acao: 'reagir', mensagem_id, emoji }        emoji vazio tira a reação
 *  POST { acao: 'editar', mensagem_id, texto, assinar } até 15 minutos (QR Code)
 *  POST { acao: 'apagar', mensagem_id, para: 'mim' | 'todos' }
 *  POST { acao: 'favoritar' | 'fixar', mensagem_id, valor }
 *  POST { acao: 'excluir' }                           apaga a conversa inteira e os arquivos (administradores)
 *  GET ?abrir=1                                       primeira abertura: registra a visualização na auditoria
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

const carregar = (request, params) => carregarConversa(request, params.id);

export async function GET(request, contexto) {
  const params = await contexto.params;
  const r = await carregar(request, params);
  if (r.erro) return r.erro;
  const busca = new URL(request.url).searchParams;
  const antes = busca.get('antes');
  const { db } = r.ctx;
  // Em paralelo: auditoria, canal e detalhes; as mensagens só esperam o canal
  const canalP = db.from('canais').select('*').eq('id', r.conversa.canal_id).maybeSingle().then((x) => x.data);
  const [, [conversa], lista, anteriores] = await Promise.all([
    busca.get('abrir') ? registrarVisualizacao(db, r.perm, r.conversa) : null,
    juntarDetalhes(db, [r.conversa]),
    canalP.then((canal) => listarMensagens(db, r.conversa, { antes: antes && !Number.isNaN(Date.parse(antes)) ? antes : null, perm: r.perm, canal })),
    // Ao abrir: atendimentos anteriores do mesmo contato (ticket #23), se a empresa deixou ligado
    busca.get('abrir') ? atendimentosAnteriores(db, r.perm, r.conversa) : null,
  ]);
  return json({ ok: true, conversa, ...lista, ...(anteriores ? { anteriores } : {}) });
}

/** Conversas anteriores do mesmo contato (qualquer canal) que a pessoa pode ver, da mais recente para a mais antiga. */
async function atendimentosAnteriores(db, perm, conversa) {
  const config = await configDoChat(db);
  if (!config.historicoAnterior) return [];
  const { data } = await db.from('conversas').select('*').eq('contato_id', conversa.contato_id).neq('id', conversa.id).lt('criado_em', conversa.criado_em).order('criado_em', { ascending: false }).limit(30);
  const visiveis = (data || []).filter((c) => podeVerConversa(perm, c)).slice(0, 20);
  if (!visiveis.length) return [];
  const { data: canais } = await db.from('canais').select('id, nome').in('id', [...new Set(visiveis.map((c) => c.canal_id))]);
  const nomeCanal = new Map((canais || []).map((c) => [c.id, c.nome]));
  return visiveis.map((c) => ({ id: c.id, criado_em: c.criado_em, resolvida_em: c.resolvida_em || null, status: c.status, responsavel_nome: c.responsavel_nome || null, canal: nomeCanal.get(c.canal_id) || null }));
}

// Depois de uma ação que deu certo, as telas da empresa atualizam na hora
export async function POST(request, contexto) {
  const aviso = {};
  const resposta = await processar(request, await contexto.params, aviso);
  if (resposta.ok && aviso.org !== undefined) await avisarAoVivo(aviso.org);
  return resposta;
}

async function processar(request, params, aviso) {
  const r = await carregar(request, params);
  if (r.erro) return r.erro;
  const { ctx, perm, conversa } = r;
  aviso.org = conversa.organizacao_id || null;
  const { db } = ctx;
  if (!(await consumirLimite(`chat_${perm.email}`, 120, 60))) return json({ ok: false, mensagem: 'Muitas ações seguidas. Aguarde um instante.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  const autor = { email: perm.email, nome: perm.nome };
  const atualizar = async (campos) => {
    const { data } = await db.from('conversas').update(campos).eq('id', conversa.id).select('*').single();
    return (await juntarDetalhes(db, [data || { ...conversa, ...campos }]))[0];
  };

  try {
    // Responder, nota interna e reagir só depois de assumir a conversa
    if (['enviar', 'nota', 'reagir'].includes(body.acao) && conversa.status !== 'resolvida') {
      const bloqueio = await bloqueioSemAssumir(db, perm, conversa);
      if (bloqueio) return json({ ok: false, mensagem: bloqueio, precisa_assumir: true }, 409);
    }

    if (body.acao === 'enviar') {
      if (conversa.status === 'resolvida') return json({ ok: false, mensagem: 'Reabra a conversa para responder.' }, 409);
      const mensagem = await enviarTextoNaConversa(db, {
        conversa,
        texto: body.texto,
        autor,
        // Assinatura obrigatória (Configurações › Chat): o servidor assina mesmo que a tela peça o contrário
        assinar: body.assinar !== false || (await configDoChat(db)).assinaturaObrigatoria,
        respondeA: isValidUUID(body.responde_a) ? body.responde_a : null,
        mencoes: Array.isArray(body.mencoes) ? body.mencoes.slice(0, 50).map((m) => ({ jid: String(m?.jid || '').slice(0, 80), nome: String(m?.nome || '').slice(0, 120) })) : [],
      });
      const [{ data }, { data: canal }] = await Promise.all([db.from('conversas').select('*').eq('id', conversa.id).single(), db.from('canais').select('*').eq('id', conversa.canal_id).maybeSingle()]);
      return json({ ok: true, mensagem: prepararMensagem(mensagem, perm, canal), conversa: (await juntarDetalhes(db, [data]))[0] });
    }

    if (body.acao === 'nota') {
      const texto = String(body.texto || '').trim().slice(0, 4000);
      if (!texto) return json({ ok: false, mensagem: 'Escreva a nota.' }, 400);
      const { data: mensagem, error } = await db
        .from('mensagens')
        .insert([{ conversa_id: conversa.id, direcao: 'nota', tipo: 'texto', conteudo: texto, status: 'enviada', autor_email: autor.email, autor_nome: autor.nome }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return json({ ok: true, mensagem: prepararMensagem(mensagem, perm, null) });
    }

    if (body.acao === 'lida') {
      if (conversa.nao_lidas) await db.from('conversas').update({ nao_lidas: 0 }).eq('id', conversa.id);
      return json({ ok: true });
    }

    if (body.acao === 'assumir') {
      if (conversa.status === 'resolvida') return json({ ok: false, mensagem: 'Reabra a conversa para assumir.' }, 409);
      if (conversa.responsavel_email === autor.email) return json({ ok: true, conversa: (await juntarDetalhes(db, [conversa]))[0] });
      const salvo = await atualizar({ responsavel_email: autor.email, responsavel_nome: autor.nome, status: conversa.status === 'aguardando' ? 'em_atendimento' : conversa.status });
      await registrarSistema(db, conversa.id, `${autor.nome} assumiu a conversa`, autor);
      await auditarChat(db, perm, 'chat_assumiu', conversa);
      return json({ ok: true, conversa: salvo });
    }

    // Devolver para a fila (Kanban: arrastar de Ativos para Pendentes): só quem está com ela ou administrador
    if (body.acao === 'devolver') {
      if (conversa.status === 'resolvida') return json({ ok: false, mensagem: 'Reabra a conversa antes.' }, 409);
      if (conversa.responsavel_email && conversa.responsavel_email !== autor.email && !perm.administrador) return json({ ok: false, mensagem: `Esta conversa está com ${conversa.responsavel_nome || 'outra pessoa'}.` }, 403);
      if (!conversa.responsavel_email) return json({ ok: true, conversa: (await juntarDetalhes(db, [conversa]))[0] });
      const salvo = await atualizar({ responsavel_email: null, responsavel_nome: null, status: 'aguardando' });
      await registrarSistema(db, conversa.id, `${autor.nome} devolveu a conversa para a fila`, autor);
      await auditarChat(db, perm, 'chat_devolveu', conversa);
      return json({ ok: true, conversa: salvo });
    }

    if (body.acao === 'resolver') {
      const salvo = await atualizar({ status: 'resolvida', resolvida_em: new Date().toISOString(), nao_lidas: 0 });
      await registrarSistema(db, conversa.id, `${autor.nome} resolveu a conversa`, autor);
      await auditarChat(db, perm, 'chat_resolveu', conversa);
      return json({ ok: true, conversa: salvo });
    }

    if (body.acao === 'reabrir') {
      if (conversa.status !== 'resolvida') return json({ ok: true, conversa: (await juntarDetalhes(db, [conversa]))[0] });
      const { data: aberta } = await db.from('conversas').select('id').eq('canal_id', conversa.canal_id).eq('contato_id', conversa.contato_id).neq('status', 'resolvida').maybeSingle();
      if (aberta) return json({ ok: false, mensagem: 'Este contato já tem outra conversa aberta neste canal.', conversa_aberta: aberta.id }, 409);
      const salvo = await atualizar({ status: 'em_atendimento', resolvida_em: null, responsavel_email: autor.email, responsavel_nome: autor.nome });
      await registrarSistema(db, conversa.id, `${autor.nome} reabriu a conversa`, autor);
      await auditarChat(db, perm, 'chat_reabriu', conversa);
      return json({ ok: true, conversa: salvo });
    }

    if (body.acao === 'transferir') {
      const campos = {};
      let texto = '';
      if (body.departamento !== undefined) {
        campos.departamento = String(body.departamento || '').trim().slice(0, 60) || null;
        texto = `Transferida para ${campos.departamento || 'todos os departamentos'}`;
      }
      if (body.responsavel_email !== undefined) {
        const email = String(body.responsavel_email || '').trim().toLowerCase();
        if (email) {
          const { data: membro } = await db.from('equipe_usuarios').select('email, nome, ativo').eq('email', email).maybeSingle();
          if (!membro || membro.ativo === false) return json({ ok: false, mensagem: 'Pessoa não encontrada na equipe.' }, 400);
          Object.assign(campos, { responsavel_email: membro.email, responsavel_nome: membro.nome || membro.email.split('@')[0] });
          texto = `${texto ? `${texto} · ` : 'Transferida para '}${campos.responsavel_nome}`;
        } else {
          // Volta para a fila do departamento
          Object.assign(campos, { responsavel_email: null, responsavel_nome: null, status: conversa.status === 'resolvida' ? 'resolvida' : 'aguardando' });
          texto = texto || 'Devolvida para a fila';
        }
      }
      if (!texto) return json({ ok: false, mensagem: 'Escolha o departamento ou a pessoa.' }, 400);
      const salvo = await atualizar(campos);
      await registrarSistema(db, conversa.id, `${texto} por ${autor.nome}`, autor);
      await auditarChat(db, perm, 'chat_transferiu', conversa, { para: texto });
      return json({ ok: true, conversa: salvo });
    }

    if (['reagir', 'editar', 'apagar', 'favoritar', 'fixar'].includes(body.acao)) {
      if (!isValidUUID(body.mensagem_id)) return json({ ok: false, mensagem: 'Mensagem inválida.' }, 400);
      const base = { conversa, mensagemId: body.mensagem_id, autor };
      const feito =
        body.acao === 'reagir'
          ? await reagirMensagem(db, { ...base, emoji: body.emoji })
          : body.acao === 'editar'
            ? await editarMensagem(db, { ...base, texto: body.texto, assinar: body.assinar !== false || (await configDoChat(db)).assinaturaObrigatoria })
            : body.acao === 'apagar'
              ? await apagarMensagem(db, { ...base, para: body.para === 'todos' ? 'todos' : 'mim' })
              : body.acao === 'favoritar'
                ? await favoritarMensagem(db, { ...base, valor: Boolean(body.valor) })
                : await fixarMensagem(db, { ...base, valor: Boolean(body.valor) });
      if (body.acao === 'apagar' && body.para === 'todos') await auditarChat(db, perm, 'chat_apagou_mensagem', conversa, { mensagem_id: body.mensagem_id });
      if (body.acao === 'editar') await auditarChat(db, perm, 'chat_editou_mensagem', conversa, { mensagem_id: body.mensagem_id });
      if (body.acao === 'fixar') await registrarSistema(db, conversa.id, `${autor.nome} ${body.valor ? 'fixou' : 'desafixou'} uma mensagem`, autor);
      const { data: canal } = await db.from('canais').select('*').eq('id', conversa.canal_id).maybeSingle();
      return json({ ok: true, mensagem: feito ? prepararMensagem(feito, perm, canal) : null });
    }

    if (body.acao === 'excluir') {
      if (!perm.administrador) return json({ ok: false, mensagem: 'Só administradores podem excluir conversas.' }, 403);
      const { count } = await db.from('mensagens').select('id', { count: 'exact', head: true }).eq('conversa_id', conversa.id);
      await apagarArquivosDaConversa(conversa.organizacao_id, conversa.id);
      const { error } = await db.from('conversas').delete().eq('id', conversa.id);
      if (error) throw new Error(`Não foi possível excluir: ${error.message}`);
      // O registro fica na auditoria (imutável) mesmo com a conversa apagada
      await auditarChat(db, perm, 'chat_excluiu', conversa, { mensagens: count || 0 });
      return json({ ok: true });
    }

    return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, e.status || 502);
  }
}
