import { preencherMensagem, proximaEspera } from '@/lib/envios';
import { enviarTextoParaContato } from '@/lib/server/canais/index';
import { escopoDoRegistro } from '@/lib/server/organizacao';

/**
 * Disparo dos envios em massa. Chamado a cada minuto pelo agendador do Supabase (pg_cron) em
 * /api/envios/processar e, logo depois de criar um envio "agora", pela própria tela.
 * Cada chamada trabalha por até ~50 s: manda a próxima mensagem de cada envio na hora dela e espera
 * o intervalo (com variação aleatória) entre uma e outra. O que não couber fica para a próxima chamada.
 */

const ATIVOS = ['agendado', 'enviando'];
// Enquanto uma mensagem está saindo, o envio fica "travado" por este tempo (outra chamada não dispara junto)
const TRAVA_MS = 120_000;
const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString();

async function contarPendentes(db, envioId) {
  const { data } = await db
    .from('envios_massa_destinos')
    .select('id')
    .eq('envio_id', envioId)
    .eq('status', 'pendente')
    .limit(1);
  return (data || []).length;
}

/**
 * Manda a próxima mensagem de um envio. Devolve o horário (ms) da próxima ou null (acabou, pausou ou
 * outra chamada já pegou este disparo).
 */
export async function dispararProximo(
  dbGlobal,
  envio,
  { fetchImpl = fetch, agora = Date.now, sorteio = Math.random } = {},
) {
  const db = escopoDoRegistro(dbGlobal, envio);
  const inicio = agora();
  // Trava: só segue quem conseguir mudar o horário da próxima mensagem (evita mandar duas vezes)
  const { data: travado } = await db
    .from('envios_massa')
    .update({
      status: 'enviando',
      proximo_envio_em: iso(inicio + TRAVA_MS),
      iniciado_em: envio.iniciado_em || iso(inicio),
      atualizado_em: iso(inicio),
    })
    .eq('id', envio.id)
    .eq('proximo_envio_em', envio.proximo_envio_em)
    .in('status', ATIVOS)
    .select('*')
    .maybeSingle();
  if (!travado) return null;

  const concluir = async (campos = {}) => {
    await db
      .from('envios_massa')
      .update({
        status: 'concluido',
        concluido_em: iso(agora()),
        atualizado_em: iso(agora()),
        proximo_envio_em: iso(agora()),
        ...campos,
      })
      .eq('id', envio.id)
      .eq('status', 'enviando');
    return null;
  };

  // Número do envio precisa estar conectado; senão pausa e avisa (a pessoa retoma quando reconectar)
  const { data: canal } = travado.canal_id
    ? await db.from('canais').select('*').eq('id', travado.canal_id).maybeSingle()
    : { data: null };
  if (!canal || !canal.ativo || canal.status !== 'conectado') {
    await db
      .from('envios_massa')
      .update({
        status: 'pausado',
        proximo_envio_em: iso(agora()),
        atualizado_em: iso(agora()),
        ultimo_erro: canal
          ? `O número "${canal.nome}" não está conectado. Reconecte em Canais e retome o envio.`
          : 'O número escolhido para este envio não existe mais.',
      })
      .eq('id', envio.id)
      .eq('status', 'enviando');
    return null;
  }

  // Próximo contato ou grupo da fila (pega só se ainda estiver pendente)
  const { data: proximos } = await db
    .from('envios_massa_destinos')
    .select('*')
    .eq('envio_id', envio.id)
    .eq('status', 'pendente')
    .order('ordem', { ascending: true })
    .limit(1);
  const alvo = (proximos || [])[0];
  if (!alvo) return concluir();
  const { data: pego } = await db
    .from('envios_massa_destinos')
    .update({ status: 'enviando' })
    .eq('id', alvo.id)
    .eq('status', 'pendente')
    .select('id')
    .maybeSingle();
  if (!pego) return concluir();

  const contadores = { enviados: travado.enviados || 0, falhas: travado.falhas || 0 };
  const { data: contato } = await db
    .from('contatos')
    .select('id, nome, telefone')
    .eq('id', alvo.contato_id)
    .maybeSingle();
  try {
    if (!contato) throw new Error('Contato não encontrado.');
    const autor = {
      email: travado.criado_por_email || 'envio@rmcontrole',
      nome: travado.criado_por_nome || 'Envio em massa',
    };
    await enviarTextoParaContato(db, {
      canal,
      contato,
      texto: preencherMensagem(travado.mensagem, contato),
      autor,
      fetchImpl,
    });
    await db
      .from('envios_massa_destinos')
      .update({ status: 'enviado', enviado_em: iso(agora()), erro: null })
      .eq('id', alvo.id);
    contadores.enviados += 1;
  } catch (e) {
    const erro = String(e?.message || e).slice(0, 300);
    await db.from('envios_massa_destinos').update({ status: 'falhou', erro }).eq('id', alvo.id);
    contadores.falhas += 1;
    contadores.ultimo_erro = erro;
  }

  if (!(await contarPendentes(db, envio.id))) return concluir(contadores);
  const proxima = agora() + proximaEspera(travado.intervalo_segundos, sorteio());
  await db
    .from('envios_massa')
    .update({ ...contadores, proximo_envio_em: iso(proxima), atualizado_em: iso(agora()) })
    .eq('id', envio.id)
    .eq('status', 'enviando');
  return proxima;
}

/**
 * Roda os envios que estão na hora, por até `prazoMs`. `envioId` limita a um envio (disparo logo após criar).
 * dbGlobal: banco sem escopo (rota do agendador); cada envio trabalha preso à empresa dele.
 */
export async function processarEnvios(
  dbGlobal,
  {
    envioId = null,
    prazoMs = 50_000,
    fetchImpl = fetch,
    agora = Date.now,
    dormir = dormirPadrao,
    sorteio = Math.random,
  } = {},
) {
  const fim = agora() + prazoMs;
  let disparos = 0;
  for (let volta = 0; volta < 500; volta += 1) {
    let q = dbGlobal
      .from('envios_massa')
      .select('*')
      .in('status', ATIVOS)
      .lte('proximo_envio_em', iso(agora()));
    if (envioId) q = q.eq('id', envioId);
    const { data: prontos, error } = await q
      .order('proximo_envio_em', { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    for (const envio of prontos || []) {
      if (agora() >= fim) break;
      await dispararProximo(dbGlobal, envio, { fetchImpl, agora, sorteio }).catch((e) =>
        console.error('[envios] falha no disparo', envio.id, e.message),
      );
      disparos += 1;
    }
    // Próxima mensagem de algum envio: se cair dentro do prazo desta chamada, espera por ela
    let q2 = dbGlobal.from('envios_massa').select('proximo_envio_em').in('status', ATIVOS);
    if (envioId) q2 = q2.eq('id', envioId);
    const { data: seguintes } = await q2.order('proximo_envio_em', { ascending: true }).limit(1);
    const proxima = seguintes?.[0] ? new Date(seguintes[0].proximo_envio_em).getTime() : null;
    if (!proxima || proxima >= fim) break;
    // Nada saiu nesta volta e a próxima já venceu (travada por outra chamada): não insiste
    if (!(prontos || []).length && proxima <= agora()) break;
    const espera = proxima - agora();
    if (espera > 0) await dormir(espera);
  }
  return { disparos };
}
