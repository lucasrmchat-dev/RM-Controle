/**
 * Fluxo Inteligente no servidor: acha os fluxos ativos da empresa que respondem a um evento,
 * executa cada um com efeitos reais (WhatsApp, agenda, chat) e guarda o registro da execução.
 *
 * Sempre com o `db` preso à empresa do evento (escopo). Proteções:
 *  - cada fluxo roda no máximo 10 vezes por minuto para a mesma conversa ou reunião (evita robôs em círculo);
 *  - mensagens que a própria empresa envia nunca disparam fluxos (só as recebidas);
 *  - o que o fluxo muda na agenda não dispara outros fluxos de agenda.
 *
 * Bloco "Pergunta": a pergunta enviada fica em fluxo_esperas. A próxima mensagem do contato (ou de alguém
 * do grupo) na conversa continua o fluxo pela saída "Respondeu"; vencido o prazo, pela "Sem resposta"
 * (conferido a cada aviso do WhatsApp da empresa, no máximo uma vez por minuto).
 */
import { GATILHOS_DO_EVENTO, executarFluxo, gatilhoCasa } from '@/lib/fluxos';
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
    async aguardarResposta({ conversaId, noId, variavel, expiraEm, contexto }) {
      // Uma pergunta por fluxo e conversa: a nova substitui a anterior
      const { agora, ...semRelogio } = contexto || {};
      const { error } = await db
        .from('fluxo_esperas')
        .upsert([{ fluxo_id: fluxo.id, conversa_id: conversaId, no_id: noId, variavel, contexto: semRelogio, expira_em: expiraEm.toISOString(), criado_em: new Date().toISOString() }], { onConflict: 'fluxo_id,conversa_id' });
      if (error) throw new Error(/fluxo_esperas|does not exist|schema cache/i.test(error.message || '') ? 'Falta instalar a Pergunta no banco: rode supabase/migration_fluxo_esperas.sql no Supabase.' : `Não foi possível guardar a pergunta: ${error.message}`);
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

/** De onde veio a mensagem, em poucas palavras (para o registro de quando o fluxo não disparou). */
function origemDaMensagem(d = {}) {
  const quem = d.conversa?.grupo ? `grupo ${d.contato?.nome || d.contato?.telefone || ''}` : d.contato?.nome || d.contato?.telefone || 'contato';
  const texto = String(d.mensagem?.texto || '').replace(/\s+/g, ' ').trim();
  return `${quem.trim()}${d.canal?.nome ? ` · canal ${d.canal.nome}` : ''}${texto ? ` · “${texto.slice(0, 80)}${texto.length > 80 ? '…' : ''}”` : ''}`;
}

/**
 * Mensagem que chegou e NÃO disparou o fluxo: fica nas execuções com o motivo (cinza na tela).
 * Assim quem monta o fluxo vê que a mensagem chegou e por que não seguiu. De vez em quando apaga os
 * registros "não disparou" mais antigos, para a lista não crescer sem fim.
 */
async function registrarNaoDisparou(db, fluxo, evento, motivo) {
  const passos = [{ no: null, tipo: 'gatilho', rotulo: 'Mensagem recebida', resultado: origemDaMensagem(evento.dados) }, { no: null, tipo: 'gatilho', rotulo: 'Não disparou', erro: motivo }];
  await db
    .from('fluxo_execucoes')
    .insert([{ fluxo_id: fluxo.id, gatilho: evento.tipo, status: 'ignorado', resumo: String(motivo || 'Não disparou').slice(0, 300), passos }])
    .then(() => {}, () => {});
  if (Math.random() < 0.1) {
    const { data: antigos } = await db.from('fluxo_execucoes').select('id').eq('fluxo_id', fluxo.id).eq('status', 'ignorado').order('criado_em', { ascending: false }).range(200, 1199).then((x) => x, () => ({ data: [] }));
    const ids = (antigos || []).map((a) => a.id);
    if (ids.length) await db.from('fluxo_execucoes').delete().in('id', ids).then(() => {}, () => {});
  }
}

/**
 * Roda os fluxos ativos que respondem ao evento. Nunca lança: um fluxo com problema não atrapalha o resto.
 * @returns {Promise<Array<{ fluxo_id, status, passos }>>}
 */
export async function dispararFluxos(db, evento, opcoes = {}) {
  const resultados = [];
  for (const fluxo of await fluxosDoEvento(db, evento.tipo)) {
    if (opcoes.ignorar?.has(fluxo.id)) continue;
    try {
      const alvo = evento.dados?.conversa?.id || evento.dados?.reuniao?.id || 'geral';
      if (!(await consumirLimite(`fluxo_${fluxo.id}_${alvo}`, 10, 60))) {
        if (evento.tipo === 'mensagem_recebida') await registrarNaoDisparou(db, fluxo, evento, 'Mais de 10 execuções em 1 minuto nesta conversa: pausado por segurança (evita repetição sem fim).');
        continue;
      }
      const r = await executarFluxo({ definicao: fluxo.definicao, evento, efeitos: efeitosReais(db, fluxo, opcoes) });
      if (!r.casou) {
        // Só mensagens do WhatsApp: reuniões não disparadas não interessam (seriam todas as da agenda)
        if (evento.tipo === 'mensagem_recebida') await registrarNaoDisparou(db, fluxo, evento, r.motivo);
        continue;
      }
      await registrarExecucao(db, fluxo, evento, r);
      resultados.push({ fluxo_id: fluxo.id, status: r.status, passos: r.passos });
    } catch (e) {
      console.error('[fluxos] falha ao executar', fluxo.id, e.message);
    }
  }
  return resultados;
}

/**
 * Continua um fluxo parado numa Pergunta. A espera é apagada ANTES de continuar (quem apagar primeiro
 * continua; dois avisos ao mesmo tempo não continuam duas vezes).
 */
async function retomarEspera(db, espera, evento, saida, opcoes) {
  const { data: apagadas } = await db.from('fluxo_esperas').delete().eq('id', espera.id).select('id');
  if (!apagadas?.length) return null;
  const { data: fluxo } = await db.from('fluxos').select('id, nome, definicao, ativo').eq('id', espera.fluxo_id).maybeSingle();
  if (!fluxo?.ativo) return null;
  const resultado = saida === 'respondeu' ? `Resposta recebida: “${String(evento.dados?.mensagem?.texto || '').slice(0, 120)}”` : 'O prazo da pergunta venceu sem resposta';
  const r = await executarFluxo({
    definicao: fluxo.definicao,
    evento,
    efeitos: efeitosReais(db, fluxo, opcoes),
    retomar: { noId: espera.no_id, saida, contexto: espera.contexto, variavel: espera.variavel, resultado },
  });
  if (!r.casou) return null;
  await registrarExecucao(db, fluxo, { tipo: saida === 'respondeu' ? 'pergunta_respondida' : 'pergunta_sem_resposta' }, r);
  return fluxo.id;
}

/** Perguntas esperando resposta nesta conversa: a mensagem que chegou é a resposta. Devolve os fluxos que continuaram. */
async function responderPerguntas(db, dados, opcoes) {
  if (!dados?.conversa?.id) return new Set();
  const { data: esperas, error } = await db.from('fluxo_esperas').select('*').eq('conversa_id', dados.conversa.id);
  if (error || !esperas?.length) return new Set();
  const continuaram = new Set();
  for (const espera of esperas) {
    try {
      const vencida = new Date(espera.expira_em).getTime() < Date.now();
      const id = await retomarEspera(db, espera, vencida ? { tipo: 'mensagem_recebida', dados: {} } : { tipo: 'mensagem_recebida', dados }, vencida ? 'sem_resposta' : 'respondeu', opcoes);
      if (id && !vencida) continuaram.add(id);
    } catch (e) {
      console.error('[fluxos] falha ao continuar a pergunta', espera.id, e.message);
    }
  }
  return continuaram;
}

// Prazo das perguntas: conferido no máximo uma vez por minuto por empresa (em cada servidor)
const ultimaConferencia = new Map();
/** Perguntas com o prazo vencido seguem pela saída "Sem resposta". */
export async function processarPerguntasVencidas(db, { forcar = false, ...opcoes } = {}) {
  const chave = db?.organizacaoId || 'geral';
  if (!forcar && Date.now() - (ultimaConferencia.get(chave) || 0) < 60000) return 0;
  ultimaConferencia.set(chave, Date.now());
  const { data: vencidas, error } = await db.from('fluxo_esperas').select('*').lt('expira_em', new Date().toISOString()).order('expira_em').limit(20);
  if (error || !vencidas?.length) return 0;
  let n = 0;
  for (const espera of vencidas) {
    try {
      if (await retomarEspera(db, espera, { tipo: 'mensagem_recebida', dados: {} }, 'sem_resposta', opcoes)) n += 1;
    } catch (e) {
      console.error('[fluxos] falha no prazo da pergunta', espera.id, e.message);
    }
  }
  return n;
}

/** Mensagens recebidas pelo webhook do WhatsApp → eventos do fluxo (antes, respostas às perguntas pendentes). */
export async function dispararMensagensRecebidas(db, recebidas, opcoes = {}) {
  for (const dados of recebidas || []) {
    // Quem estava esperando a resposta continua; esse fluxo não começa de novo com a mesma mensagem
    const continuaram = await responderPerguntas(db, dados, opcoes);
    await dispararFluxos(db, { tipo: 'mensagem_recebida', dados }, { ...opcoes, ignorar: continuaram });
  }
}

/**
 * Mensagens do próprio número do canal (equipe, pelo RM Controle ou pelo celular) não disparam fluxos.
 * Quando uma delas DISPARARIA um fluxo ativo, fica nas execuções como "não disparou", com o motivo,
 * para quem testa entender. As enviadas pelo próprio fluxo ficam de fora (seriam ruído).
 */
export async function registrarMensagensDaEquipe(db, lista) {
  if (!lista?.length) return;
  const fluxos = await fluxosDoEvento(db, 'mensagem_recebida');
  if (!fluxos.length) return;
  for (const { idExterno, dados } of lista) {
    const evento = { tipo: 'mensagem_recebida', dados };
    const casam = fluxos.filter((f) => (f.definicao?.nos || []).some((n) => n.tipo === 'gatilho_mensagem' && gatilhoCasa(n, evento)));
    if (!casam.length) continue;
    if (idExterno) {
      const { data: m } = await db.from('mensagens').select('autor_email').eq('id_externo', idExterno).maybeSingle();
      if (String(m?.autor_email || '').startsWith('fluxo@')) continue;
    }
    for (const fluxo of casam) {
      await registrarNaoDisparou(db, fluxo, evento, 'A mensagem foi enviada pelo próprio número do canal (pelo RM Controle ou pelo celular conectado). Mensagens da equipe não disparam o fluxo; para testar, escreva de outro número.');
    }
  }
}
