import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { dispararMensagensRecebidas, processarPerguntasVencidas } from '@/lib/server/fluxos';
import { escopoDoRegistro } from '@/lib/server/organizacao';
import { configDoChat, provedorDo, registrarEventos, segredosDo } from '@/lib/server/canais/index';
import { avisarAoVivo } from '@/lib/server/canais/aoVivo';
import { consumirLimite } from '@/lib/server/protecao';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';
// Fotos, áudios e documentos recebidos são baixados durante o aviso
export const maxDuration = 60;

/**
 * Avisos do WhatsApp (Evolution ou Meta) para UM canal. Sem login: quem prova a origem é o token
 * (Evolution, no cabeçalho) ou a assinatura com a chave secreta do app (Meta). Sem prova, nada é lido.
 * A empresa vem do próprio canal; tudo é gravado preso a ela.
 */
const LIMITE_CORPO = 512 * 1024;

async function carregarCanal(id) {
  if (!isValidUUID(id)) return null;
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db.from('canais').select('*').eq('id', id).maybeSingle();
  return data ? { canal: data, db } : null;
}

// Verificação do webhook no painel da Meta
export async function GET(request, contexto) {
  const params = await contexto.params;
  const r = await carregarCanal(params.id);
  const p = new URL(request.url).searchParams;
  if (!r || r.canal.provedor !== 'meta' || p.get('hub.mode') !== 'subscribe') return new Response('não encontrado', { status: 404 });
  if (!provedorDo(r.canal).verificarAssinatura(r.canal, p.get('hub.verify_token'))) return new Response('token inválido', { status: 403 });
  return new Response(p.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request, contexto) {
  const params = await contexto.params;
  const r = await carregarCanal(params.id);
  if (!r) return new Response(null, { status: 404 });
  const { canal, db } = r;
  if (!(await consumirLimite(`webhook_canal_${canal.id}`, 3000, 60))) return new Response(null, { status: 429 });
  if (Number(request.headers.get('content-length') || 0) > LIMITE_CORPO) return new Response(null, { status: 413 });

  const corpoBruto = await request.text();
  if (corpoBruto.length > LIMITE_CORPO) return new Response(null, { status: 413 });
  const provedor = provedorDo(canal);
  if (!provedor.autenticarAviso(canal, { headers: request.headers, corpoBruto, segredos: segredosDo(canal) })) {
    return new Response(null, { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!canal.ativo) return new Response(null, { status: 200 }); // canal desativado: confirma e ignora

  try {
    const dbEmpresa = escopoDoRegistro(db, canal);
    const { recebidas, ...resumo } = await registrarEventos(dbEmpresa, canal, provedor.lerAviso(payload, canal), { config: await configDoChat(dbEmpresa) });
    if (resumo.mensagens || resumo.status || resumo.conexao) await avisarAoVivo(canal.organizacao_id);
    // Fluxo Inteligente: roda depois de responder ao provedor (o aviso não espera os fluxos).
    // Todo aviso também confere o prazo das perguntas que estão esperando resposta.
    {
      const tarefa = () =>
        (recebidas?.length ? dispararMensagensRecebidas(dbEmpresa, recebidas) : Promise.resolve())
          .then(() => processarPerguntasVencidas(dbEmpresa))
          .then(() => (recebidas?.length ? avisarAoVivo(canal.organizacao_id) : null))
          .catch((e) => console.error('[fluxos] falha nos fluxos do aviso', canal.id, e.message));
      // Fora de uma requisição de verdade (testes, scripts) não há "depois": roda agora
      try {
        after(tarefa);
      } catch {
        await tarefa();
      }
    }
    return Response.json({ ok: true, ...resumo });
  } catch (e) {
    console.error('[canais] falha ao gravar aviso', canal.id, e.message);
    // 500 faz o provedor tentar de novo (os dois reenviam avisos que falharam)
    return new Response(null, { status: 500 });
  }
}
