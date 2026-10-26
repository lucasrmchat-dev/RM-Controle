import { contextoDaRequisicao } from '@/lib/server/organizacao';
import { consumirLimite } from '@/lib/server/protecao';
import { urlPublica } from '@/lib/server/googleAgenda';
import {
  enviarMensagem,
  gravarSegredo,
  lerConfig,
  lerPreferencias,
  lerSegredo,
  salvarConfig,
  salvarPreferencias,
  validarUrlWebhook,
  SEGREDO_TOKEN,
  SEGREDO_URL,
} from '@/lib/server/whatsappAgenda';

export const dynamic = 'force-dynamic';

/**
 * WhatsApp da agenda (equipe logada):
 *  GET  configuração (o endereço do webhook nunca volta inteiro) + preferências da pessoa
 *  PUT  { tipo: 'preferencias', valor }            qualquer membro, só as próprias
 *       { tipo: 'config', valor, url?, token? }     só administradores
 *  POST { acao: 'enviar', evento_id, tipo }         envia confirmação/lembrete agora
 *       { acao: 'teste', telefone, tipo }           administradores: mensagem de exemplo
 */
const json = (corpo, status = 200) => Response.json(corpo, { status });

// Banco preso à empresa de quem está logado: webhook, mensagens e reuniões são da assinante
const autenticar = (request) => contextoDaRequisicao(request);

// Mostra só o domínio e o fim do endereço: o caminho funciona como senha
const mascarar = (url) => {
  try {
    const u = new URL(url);
    return `${u.host}/…${u.pathname.slice(-6)}`;
  } catch {
    return 'configurado';
  }
};

export async function GET(request) {
  const { erro, db, email, admin } = await autenticar(request);
  if (erro) return erro;
  const [config, preferencias, url, token] = await Promise.all([lerConfig(db), lerPreferencias(db, email), lerSegredo(db, SEGREDO_URL), admin ? lerSegredo(db, SEGREDO_TOKEN) : null]);
  return json({
    ok: true,
    config,
    preferencias,
    pronto: Boolean(config.ativo && url),
    admin,
    ...(admin ? { webhook: url ? mascarar(url) : null, tem_token: Boolean(token) } : {}),
  });
}

export async function PUT(request) {
  const { erro, db, email, admin } = await autenticar(request);
  if (erro) return erro;
  const body = await request.json().catch(() => ({}));
  try {
    if (body.tipo === 'preferencias') return json({ ok: true, preferencias: await salvarPreferencias(db, email, body.valor) });
    if (body.tipo !== 'config') return json({ ok: false, mensagem: 'Pedido inválido.' }, 400);
    if (!admin) return json({ ok: false, mensagem: 'Só administradores alteram o envio pelo WhatsApp.' }, 403);
    if (typeof body.url === 'string' && body.url.trim()) await gravarSegredo(db, SEGREDO_URL, validarUrlWebhook(body.url));
    if (typeof body.token === 'string') await gravarSegredo(db, SEGREDO_TOKEN, body.token.trim().slice(0, 500));
    const config = await salvarConfig(db, body.valor);
    const url = await lerSegredo(db, SEGREDO_URL);
    return json({ ok: true, config, webhook: url ? mascarar(url) : null, pronto: Boolean(config.ativo && url) });
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }
}

export async function POST(request) {
  const { erro, db, email, admin } = await autenticar(request);
  if (erro) return erro;
  // Freio contra disparo em massa por engano ou conta comprometida
  if (!(await consumirLimite(`whatsapp_agenda:${email}`, 40, 3600))) return json({ ok: false, mensagem: 'Muitos envios na última hora. Aguarde um pouco.' }, 429);
  const body = await request.json().catch(() => ({}));
  const base = urlPublica(request);
  const tipo = body.tipo === 'lembrete' ? 'lembrete' : 'confirmacao';

  if (body.acao === 'teste') {
    if (!admin) return json({ ok: false, mensagem: 'Só administradores enviam testes.' }, 403);
    const exemplo = {
      titulo: 'Reunião de demonstração',
      participante_nome: 'Cliente Exemplo',
      responsavel_nome: 'Equipe RM',
      data: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      hora_inicio: '14:00',
      lembrete_minutos: 60,
    };
    const r = await enviarMensagem(db, { evento: exemplo, tipo: 'teste', mensagemTeste: tipo, telefone: body.telefone, por: email, base });
    return json({ ...r, ok: r.ok }, r.ok ? 200 : 400);
  }

  if (body.acao !== 'enviar' || !body.evento_id) return json({ ok: false, mensagem: 'Pedido inválido.' }, 400);
  const { data: evento } = await db.from('agenda_eventos').select('*').eq('id', String(body.evento_id)).maybeSingle();
  if (!evento) return json({ ok: false, mensagem: 'Reunião não encontrada. Ela já foi sincronizada?' }, 404);
  const r = await enviarMensagem(db, { evento, tipo, por: email, base });
  return json(r, r.ok ? 200 : 400);
}
