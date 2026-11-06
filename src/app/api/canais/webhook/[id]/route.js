import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';
import { dispararMensagensRecebidas, processarPerguntasVencidas, registrarMensagensDaEquipe } from '@/lib/server/fluxos';
import { escopoDoRegistro } from '@/lib/server/organizacao';
import { configDoChat, provedorDo, registrarEventos, segredosDo } from '@/lib/server/canais/index';
import { avisarAoVivo } from '@/lib/server/canais/aoVivo';
import { consumirLimite } from '@/lib/server/protecao';
import { isValidUUID } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';
// Fotos, áudios e documentos recebidos são baixados durante o aviso
export const maxDuration = 30;

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

// ------------------------------------------------------------------------------
// Proteções (depois da enxurrada de 05/11/2026, em que milhares de reenvios da Evolution derrubaram o banco):
//  1) canal desativado: responde 200 na hora, sem ler nada;
//  2) cache do canal por 15 s (um aviso a mais não vira uma consulta a mais);
//  3) no máximo MAX_SIMULTANEOS avisos ao mesmo tempo por servidor: o excesso recebe 503 imediato e a
//     Evolution tenta de novo, com espera crescente (ela está configurada para isso);
//  4) disjuntor: com o banco falhando em sequência, responde 503 na hora por alguns segundos, em vez de
//     segurar cada aviso até o tempo limite (o que alimentava ainda mais reenvios);
//  5) limite por canal menor (600 por minuto).
// ------------------------------------------------------------------------------
const MAX_SIMULTANEOS = 8;
const LIMITE_POR_MINUTO = 600;
const PAUSA_DO_DISJUNTOR_MS = 15000;
const FALHAS_PARA_ABRIR = 4;
let simultaneos = 0;
let falhasSeguidas = 0;
let disjuntorAbertoAte = 0;
const cacheCanais = new Map();
const rapido = (status, espera) => new Response(null, { status, headers: espera ? { 'Retry-After': String(espera) } : undefined });

async function canalEmCache(id) {
  const guardado = cacheCanais.get(id);
  if (guardado && Date.now() - guardado.em < 15000) return guardado.r;
  const r = await carregarCanal(id);
  if (cacheCanais.size > 200) cacheCanais.clear();
  if (r) cacheCanais.set(id, { em: Date.now(), r });
  return r;
}

export async function POST(request, contexto) {
  if (Date.now() < disjuntorAbertoAte) return rapido(503, 15);
  if (simultaneos >= MAX_SIMULTANEOS) return rapido(503, 5);
  simultaneos += 1;
  try {
    return await tratarAviso(request, contexto);
  } finally {
    simultaneos -= 1;
  }
}

/** Marca o resultado do banco: falhas em sequência abrem o disjuntor; um sucesso fecha. */
function registrarResultado(ok) {
  if (ok) {
    falhasSeguidas = 0;
    return;
  }
  falhasSeguidas += 1;
  if (falhasSeguidas >= FALHAS_PARA_ABRIR) disjuntorAbertoAte = Date.now() + PAUSA_DO_DISJUNTOR_MS;
}

async function tratarAviso(request, contexto) {
  const params = await contexto.params;
  let r;
  try {
    r = await canalEmCache(params.id);
  } catch (e) {
    registrarResultado(false);
    return rapido(503, 10);
  }
  if (!r) return new Response(null, { status: 404 });
  const { canal, db } = r;
  // Canal desativado: confirma e ignora, sem tocar no banco nem ler o corpo
  if (!canal.ativo) return new Response(null, { status: 200 });
  if (!(await consumirLimite(`webhook_canal_${canal.id}`, LIMITE_POR_MINUTO, 60))) return rapido(429, 30);
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

  try {
    const dbEmpresa = escopoDoRegistro(db, canal);
    const { recebidas, daEquipe, ...resumo } = await registrarEventos(dbEmpresa, canal, provedor.lerAviso(payload, canal), { config: await configDoChat(dbEmpresa) });
    if (resumo.mensagens || resumo.status || resumo.conexao) await avisarAoVivo(canal.organizacao_id);
    // Fluxo Inteligente: roda depois de responder ao provedor (o aviso não espera os fluxos).
    // Todo aviso também confere o prazo das perguntas que estão esperando resposta.
    {
      const tarefa = () =>
        (recebidas?.length ? dispararMensagensRecebidas(dbEmpresa, recebidas) : Promise.resolve())
          .then(() => registrarMensagensDaEquipe(dbEmpresa, daEquipe))
          .then(() => (recebidas?.length ? processarPerguntasVencidas(dbEmpresa) : null))
          .then(() => (recebidas?.length ? avisarAoVivo(canal.organizacao_id) : null))
          .catch((e) => console.error('[fluxos] falha nos fluxos do aviso', canal.id, e.message));
      // Fora de uma requisição de verdade (testes, scripts) não há "depois": roda agora
      try {
        after(tarefa);
      } catch {
        await tarefa();
      }
    }
    registrarResultado(true);
    return Response.json({ ok: true, ...resumo });
  } catch (e) {
    registrarResultado(false);
    console.error('[canais] falha ao gravar aviso', canal.id, e.message);
    // 503 faz o provedor tentar de novo mais tarde (a Evolution espera cada vez mais entre as tentativas)
    return rapido(503, 10);
  }
}
