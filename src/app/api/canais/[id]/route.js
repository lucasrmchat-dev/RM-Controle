import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { moduloContratado } from '@/lib/plataforma';
import { consumirLimite } from '@/lib/server/protecao';
import { hashToken, novoToken } from '@/lib/server/canais/cofre';
import { canalPublico, configDoChat, enderecoWebhook, enviarTextoParaNumero, provedorDo, segredosDo } from '@/lib/server/canais/index';
import { getNomeEquipe } from '@/lib/server/canais/equipe';
import { isValidUUID } from '@/lib/sanitize';
import { canalRecebeGrupos } from '@/lib/canais';
import { mesclarCanais } from '@/lib/server/canais/mesclar';
import { avisarAoVivo } from '@/lib/server/canais/aoVivo';

export const dynamic = 'force-dynamic';

/**
 * Ações num canal (administradores):
 *  { acao: 'conectar' }                 Evolution: cria a instância e devolve o QR · Meta: confere token e número
 *  { acao: 'situacao' }                 situação atual (a tela consulta enquanto mostra o QR)
 *  { acao: 'desconectar' } | { acao: 'reiniciar' }
 *  { acao: 'testar', telefone, texto }  envia uma mensagem de teste (abre a conversa)
 *  { acao: 'novo_token' }               Meta: novo token de verificação do webhook (mostrado uma vez)
 *  { acao: 'mesclar', origem }          traz para este canal o histórico de um canal antigo do mesmo número
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request, { params }) {
  const ctx = await contextoDaRequisicao(request, { exigirAdmin: true });
  if (ctx.erro) return ctx.erro;
  if (!moduloContratado(ctx.org, 'conexoes')) return json({ ok: false, mensagem: 'Canais não fazem parte do plano da sua empresa.' }, 403);
  if (!isValidUUID(params.id)) return json({ ok: false, mensagem: 'Canal inválido.' }, 400);
  if (!(await consumirLimite(`canais_acao_${ctx.email}`, 60, 60))) return json({ ok: false, mensagem: 'Muitas ações seguidas. Aguarde um minuto.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  const { db } = ctx;
  const { data: canal } = await db.from('canais').select('*').eq('id', params.id).maybeSingle();
  if (!canal) return json({ ok: false, mensagem: 'Canal não encontrado.' }, 404);
  const provedor = provedorDo(canal);
  const segredos = segredosDo(canal);
  const atualizar = async (campos) => {
    const { data } = await db.from('canais').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', canal.id).select('*').single();
    return data;
  };

  try {
    if (body.acao === 'conectar') {
      const token = novoToken();
      const r = await provedor.conectar(canal, segredos, { urlWebhook: enderecoWebhook(request, canal.id), tokenWebhook: token, receberGrupos: canalRecebeGrupos(canal, await configDoChat(db)) });
      const campos = { status: r.status, status_detalhe: null, config: { ...canal.config, ...(r.config || {}) }, qr_codigo: r.qr || null, qr_atualizado_em: r.qr ? new Date().toISOString() : null };
      // Evolution: o token novo vai junto na configuração do webhook da instância
      if (canal.provedor === 'evolution') campos.webhook_token_hash = hashToken(token);
      if (r.numero) campos.numero = r.numero;
      const salvo = await atualizar(campos);
      return json({ ok: true, canal: canalPublico(salvo), qr: r.qr || null });
    }

    if (body.acao === 'situacao') {
      const r = await provedor.situacao(canal, segredos);
      // Enquanto não conecta, mantém o QR mais recente (a Evolution troca a cada ~40s e avisa pelo webhook)
      const campos = { status: r.status === 'desconectado' && canal.status === 'aguardando_qr' ? 'aguardando_qr' : r.status, ...(r.numero ? { numero: r.numero } : {}), ...(r.config ? { config: r.config } : {}) };
      if (r.status === 'conectado') campos.qr_codigo = null;
      const salvo = await atualizar(campos);
      return json({ ok: true, canal: canalPublico(salvo), qr: salvo.status === 'aguardando_qr' ? salvo.qr_codigo : null });
    }

    if (body.acao === 'desconectar' || body.acao === 'reiniciar') {
      // Reiniciar também atualiza o aviso (webhook) com os eventos mais novos que o sistema usa
      if (body.acao === 'reiniciar' && provedor.atualizarAviso) {
        const token = novoToken();
        await provedor.atualizarAviso(canal, segredos, { urlWebhook: enderecoWebhook(request, canal.id), tokenWebhook: token });
        await atualizar({ webhook_token_hash: hashToken(token) });
      }
      const r = await provedor[body.acao](canal, segredos);
      const salvo = await atualizar({ status: r.status, qr_codigo: null });
      return json({ ok: true, canal: canalPublico(salvo) });
    }

    if (body.acao === 'testar') {
      const autor = { email: ctx.email, nome: await getNomeEquipe(db, ctx.email) };
      const msg = await enviarTextoParaNumero(db, { canal, telefone: body.telefone, texto: body.texto || 'Teste do RM Controle ✅', autor });
      return json({ ok: true, mensagem: msg });
    }

    if (body.acao === 'mesclar') {
      if (!isValidUUID(body.origem)) return json({ ok: false, mensagem: 'Escolha o canal antigo.' }, 400);
      const { data: origem } = await db.from('canais').select('*').eq('id', body.origem).maybeSingle();
      try {
        const r = await mesclarCanais(db, { email: ctx.email, nome: await getNomeEquipe(db, ctx.email) }, origem, canal);
        await avisarAoVivo(canal.organizacao_id || null);
        return json({ ok: true, movidas: r.movidas, juntadas: r.juntadas, origem: canalPublico(r.origem) });
      } catch (e) {
        return json({ ok: false, mensagem: e.message }, e.status || 500);
      }
    }

    if (body.acao === 'novo_token' && canal.provedor === 'meta') {
      const token = novoToken();
      await atualizar({ webhook_token_hash: hashToken(token) });
      return json({ ok: true, webhook: { url: enderecoWebhook(request, canal.id), token_verificacao: token } });
    }

    return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
  } catch (e) {
    if (body.acao === 'conectar' || body.acao === 'situacao') await atualizar({ status: 'erro', status_detalhe: String(e.message).slice(0, 300) }).catch(() => {});
    return json({ ok: false, mensagem: e.message }, 502);
  }
}
