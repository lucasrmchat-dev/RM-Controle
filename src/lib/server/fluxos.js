/**
 * Fluxo Inteligente no servidor: acha os fluxos ativos da empresa que respondem a um evento,
 * executa cada um com efeitos reais (WhatsApp, agenda, chat) e guarda o registro da execução.
 *
 * Sempre com o `db` preso à empresa do evento (escopo). Proteções:
 *  - cada fluxo roda no máximo 10 vezes por minuto para a mesma conversa ou reunião (evita robôs em círculo);
 *  - mensagens que a própria empresa envia nunca disparam fluxos (só as recebidas);
 *  - o que o fluxo muda na agenda não dispara outros fluxos de agenda.
 */
import { GATILHOS_DO_EVENTO, executarFluxo } from '@/lib/fluxos';
import { DESFECHOS_COMERCIAIS } from '@/lib/comercial';
import { consumirLimite } from '@/lib/server/protecao';
import { enviarTextoNaConversa, enviarTextoParaNumero } from '@/lib/server/canais/index';
import { registrarSistema } from '@/lib/server/canais/chat';

const tabelaAusente = (e) => /fluxo|does not exist|schema cache/i.test(String(e?.message || ''));

async function fluxosDoEvento(db, tipoEvento) {
  const gatilhos = GATILHOS_DO_EVENTO[tipoEvento] || [];
  if (!gatilhos.length) return [];
  const { data, error } = await db.from('fluxos').select('id, nome, definicao, gatilhos').eq('ativo', true);
  if (error) {
    if (!tabelaAusente(error)) console.error('[fluxos] falha ao ler fluxos', error.message);
    return [];
  }
  return (data || []).filter((f) => (f.gatilhos || []).some((g) => gatilhos.includes(g)));
}

/** Efeitos de verdade, em nome do fluxo. */
export function efeitosReais(db, fluxo, { fetchImpl = fetch, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const autor = { email: 'fluxo@rmcontrole', nome: `Fluxo: ${fluxo.nome}`.slice(0, 80) };
  const canalPara = async (canalId) => {
    if (canalId) {
      const { data } = await db.from('canais').select('*').eq('id', canalId).maybeSingle();
      if (data?.ativo) return data;
    }
    const { data } = await db.from('canais').select('*').eq('ativo', true).eq('status', 'conectado').limit(1);
    if (!data?.[0]) throw new Error('Nenhum canal de WhatsApp conectado para enviar.');
    return data[0];
  };
  return {
    async enviarMensagem({ destino, conversaId, telefone, canalId, texto }) {
      if (destino === 'conversa') {
        const { data: conversa } = await db.from('conversas').select('*').eq('id', conversaId).maybeSingle();
        if (!conversa) throw new Error('Conversa não encontrada.');
        await enviarTextoNaConversa(db, { conversa, texto, autor, assumir: false, fetchImpl });
        return 'Mensagem enviada na conversa';
      }
      const canal = await canalPara(canalId);
      await enviarTextoParaNumero(db, { canal, telefone, texto, autor, assumir: false, fetchImpl });
      return `Mensagem enviada para ${telefone} pelo canal ${canal.nome || ''}`.trim();
    },
    esperar,
    async atualizarReuniao(id, campos) {
      const { data, error } = await db.from('agenda_eventos').update({ status: campos.status, updated_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error || !data?.length) throw new Error('Não foi possível mudar a reunião.');
      return `Reunião marcada como ${campos.status}`;
    },
    async anotarReuniao(id, texto) {
      const { data: e } = await db.from('agenda_eventos').select('observacoes').eq('id', id).maybeSingle();
      if (!e) throw new Error('Reunião não encontrada.');
      const observacoes = [e.observacoes, `[${fluxo.nome}] ${texto}`].filter(Boolean).join('\n').slice(0, 8000);
      await db.from('agenda_eventos').update({ observacoes, updated_at: new Date().toISOString() }).eq('id', id);
      return 'Anotação feita na reunião';
    },
    async criarReuniao(r) {
      let responsavel_nome = null;
      if (r.responsavel_email) {
        const { data: m } = await db.from('equipe_usuarios').select('nome').eq('email', r.responsavel_email).maybeSingle();
        responsavel_nome = m?.nome || r.responsavel_email;
      }
      const linha = {
        titulo: r.titulo,
        empresa: r.empresa || '',
        data: r.data,
        hora_inicio: r.hora_inicio,
        hora_fim: r.hora_fim,
        responsavel_email: r.responsavel_email,
        responsavel_nome,
        status: 'agendada',
        tipo: r.tipo || 'cliente',
        observacoes: `Agendada pelo fluxo “${fluxo.nome}”.`,
        criado_por: autor.email,
      };
      let res = await db.from('agenda_eventos').insert([{ ...linha, ...(r.cliente_telefone ? { cliente_telefone: r.cliente_telefone } : {}) }]).select('id').single();
      // Banco sem a coluna do telefone do cliente: agenda sem ele
      if (res.error && /cliente_telefone|column/i.test(res.error.message || '')) res = await db.from('agenda_eventos').insert([linha]).select('id').single();
      if (res.error) throw new Error('Não foi possível agendar a reunião.');
      return { id: res.data.id, resultado: `Reunião “${r.titulo}” agendada para ${r.data.split('-').reverse().join('/')} às ${r.hora_inicio}` };
    },
    async moverNoProcesso(id, { processoId, etapaId }) {
      // Processos e etapas são os que a empresa criou (Configurações › Comercial e processos), conferidos agora
      const { data: cfg } = await db.from('sistema_config').select('valor').eq('chave', 'comercial').maybeSingle();
      const processo = (cfg?.valor?.pipelines || []).find((p) => p.id === processoId);
      const etapa = processo && [...(processo.etapas || []), ...DESFECHOS_COMERCIAIS].find((e) => e.id === etapaId);
      if (!processo || !etapa) throw new Error('Este processo comercial ou etapa não existe mais. Escolha de novo no bloco.');
      const { data, error } = await db.from('agenda_eventos').update({ comercial_pipeline_id: processo.id, comercial_etapa_id: etapa.id, updated_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error && /comercial_|column|schema cache/i.test(error.message || '')) throw new Error('Falta instalar o processo comercial no banco: rode supabase/migration_comercial_pipeline.sql no Supabase.');
      if (error || !data?.length) throw new Error(`Não foi possível mover a reunião no processo comercial${error?.message ? `: ${error.message}` : ''}.`);
      return `Reunião movida para ${etapa.nome} em ${processo.nome}`;
    },
    async atualizarConversa(id, campos) {
      if (campos.resolver) {
        await db.from('conversas').update({ status: 'resolvida', resolvida_em: new Date().toISOString(), nao_lidas: 0 }).eq('id', id);
        await registrarSistema(db, id, `${autor.nome} resolveu a conversa`, autor).catch(() => {});
        return 'Conversa resolvida';
      }
      await db.from('conversas').update({ departamento: campos.departamento }).eq('id', id);
      await registrarSistema(db, id, `${autor.nome} moveu a conversa para ${campos.departamento}`, autor).catch(() => {});
      return `Conversa movida para ${campos.departamento}`;
    },
  };
}

/** Guarda a execução (até os últimos 200 por fluxo, aproximadamente). */
async function registrarExecucao(db, fluxo, evento, r) {
  const ultimo = r.passos[r.passos.length - 1];
  const resumo = r.status === 'ok' ? `${r.passos.length} ${r.passos.length === 1 ? 'passo' : 'passos'}` : ultimo?.erro || 'Parou';
  await db
    .from('fluxo_execucoes')
    .insert([{ fluxo_id: fluxo.id, gatilho: evento.tipo, status: r.status, resumo: String(resumo).slice(0, 300), passos: r.passos.slice(0, 80) }])
    .then(() => {}, () => {});
}

/**
 * Roda os fluxos ativos que respondem ao evento. Nunca lança: um fluxo com problema não atrapalha o resto.
 * @returns {Promise<Array<{ fluxo_id, status, passos }>>}
 */
export async function dispararFluxos(db, evento, opcoes = {}) {
  const resultados = [];
  for (const fluxo of await fluxosDoEvento(db, evento.tipo)) {
    try {
      const alvo = evento.dados?.conversa?.id || evento.dados?.reuniao?.id || 'geral';
      if (!(await consumirLimite(`fluxo_${fluxo.id}_${alvo}`, 10, 60))) continue;
      const r = await executarFluxo({ definicao: fluxo.definicao, evento, efeitos: efeitosReais(db, fluxo, opcoes) });
      if (!r.casou) continue;
      await registrarExecucao(db, fluxo, evento, r);
      resultados.push({ fluxo_id: fluxo.id, status: r.status, passos: r.passos });
    } catch (e) {
      console.error('[fluxos] falha ao executar', fluxo.id, e.message);
    }
  }
  return resultados;
}

/** Mensagens recebidas pelo webhook do WhatsApp → eventos do fluxo. */
export async function dispararMensagensRecebidas(db, recebidas, opcoes = {}) {
  for (const dados of recebidas || []) {
    await dispararFluxos(db, { tipo: 'mensagem_recebida', dados }, opcoes);
  }
}

