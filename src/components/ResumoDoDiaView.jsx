'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, animate, useReducedMotion } from 'framer-motion';
import { fetchConversas, fetchDaily, fetchHistoricoChamados, fetchPedidosTratativa, getAbasPermitidas, getAgendaEventos, getEquipeUsuarios, getFilaChamados, getHistoricoChamados, getNomeTecnico, getPermissoesAtuais } from '@/lib/storage';
import { podeVerDemanda } from '@/lib/perfis';
import { chamadoEhDe, STATUS_ABERTOS, textoPrazo } from '@/lib/pedidosTratativa';
import { desempenhoDe, frasePrincipal, haQuanto, minutosDesde, primeiroNome, rankingDeResolucoes, saudacaoDaHora } from '@/lib/resumoDoDia';
import { naoRespondida } from './ChatFerramentas';

// ------------------------------------------------------------------------------
// Início: o resumo do dia. A RM Controle cumprimenta a pessoa e mostra, numa tela só, o que importa agora:
// demandas, conversas esperando, agenda, metas da semana e como ela está em relação à equipe.
// ------------------------------------------------------------------------------
const MOLA = { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 };
const VIDRO = 'rounded-[28px] bg-white/75 dark:bg-white/[0.055] backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.09] shadow-[0_24px_70px_-44px_rgba(0,0,0,0.35)] dark:shadow-[0_30px_90px_-40px_rgba(0,0,0,0.8)]';
const TEXTO2 = 'text-slate-500 dark:text-zinc-400';
const BTN = 'h-9 px-4 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/10 dark:hover:bg-white/[0.16] text-[#1d1d1f] dark:text-white';

const irParaAba = (aba) => window.dispatchEvent(new CustomEvent('rm_ir_para_aba', { detail: { aba } }));
const abrirConversa = (id) => {
  window.__rmChatAbrirPendente = id;
  irParaAba('chat');
  window.dispatchEvent(new CustomEvent('rm_chat_abrir', { detail: { conversaId: id } }));
};

const dataLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Número que sobe até o valor (sem animação se a pessoa prefere menos movimento). */
function Numero({ valor, className = '' }) {
  const reduzir = useReducedMotion();
  const [v, setV] = useState(reduzir ? valor : 0);
  useEffect(() => {
    if (reduzir) {
      setV(valor);
      return undefined;
    }
    const c = animate(0, valor, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [valor, reduzir]);
  return <span className={`tabular-nums ${className}`}>{v}</span>;
}

function Anel({ fracao, tamanho = 84, traco = 7, children }) {
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90" aria-hidden="true">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={traco} stroke="currentColor" className="text-black/[0.07] dark:text-white/10" />
        <motion.circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={traco} strokeLinecap="round" stroke="rgb(var(--rm-acento-vivo))" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, fracao)) }} transition={{ type: 'spring', bounce: 0, duration: 1.2 }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Cartao({ titulo, aside, children, className = '', atraso = 0 }) {
  return (
    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...MOLA, delay: atraso }} className={`${VIDRO} p-5 sm:p-6 ${className}`}>
      <header className="flex items-baseline gap-3 mb-3.5">
        <h3 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">{titulo}</h3>
        {aside && <span className={`ml-auto text-[12.5px] ${TEXTO2}`}>{aside}</span>}
      </header>
      {children}
    </motion.section>
  );
}

const Vazio = ({ texto }) => <p className={`py-6 text-center text-[13.5px] ${TEXTO2}`}>{texto}</p>;

function Indicador({ rotulo, valor, detalhe, aba, destaque, atraso }) {
  return (
    <motion.button
      type="button"
      onClick={() => irParaAba(aba)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOLA, delay: atraso }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      className={`${VIDRO} text-left p-5 sm:p-6 cursor-pointer`}
    >
      <p className={`text-[13px] ${TEXTO2} flex items-center gap-2`}>
        {destaque && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
        {rotulo}
      </p>
      <p className="mt-2 text-[56px] leading-none font-semibold tracking-[-0.04em] text-[#1d1d1f] dark:text-white">
        <Numero valor={valor} />
      </p>
      <p className={`mt-3 text-[12.5px] ${TEXTO2} truncate`}>{detalhe}</p>
    </motion.button>
  );
}

export default function ResumoDoDiaView({ userEmail }) {
  const [agora, setAgora] = useState(Date.now());
  const [chamados, setChamados] = useState(() => getFilaChamados() || []);
  const [conversas, setConversas] = useState(undefined); // undefined: carregando · null: não deu para carregar
  const [pedidos, setPedidos] = useState([]);
  const [daily, setDaily] = useState(null);
  const [historico, setHistorico] = useState(() => getHistoricoChamados() || []);
  const [eventos, setEventos] = useState(() => getAgendaEventos() || []);
  const [carregou, setCarregou] = useState(false);

  const abas = getAbasPermitidas(userEmail);
  const perm = useMemo(() => getPermissoesAtuais(userEmail), [userEmail]);
  const nome = primeiroNome(getNomeTecnico(userEmail));

  const carregar = useCallback(async () => {
    setChamados(getFilaChamados() || []);
    setEventos(getAgendaEventos() || []);
    const permitidas = getAbasPermitidas(userEmail);
    const [conv, ped, dai, his] = await Promise.allSettled([
      permitidas.includes('chat') ? fetchConversas('abertas') : Promise.reject(new Error('sem chat')),
      permitidas.includes('fila') ? fetchPedidosTratativa() : Promise.reject(new Error('sem fila')),
      permitidas.includes('daily') ? fetchDaily() : Promise.reject(new Error('sem daily')),
      Promise.resolve(fetchHistoricoChamados({ usarCache: true })),
    ]);
    setConversas(conv.status === 'fulfilled' ? conv.value.conversas || [] : null);
    setPedidos(ped.status === 'fulfilled' ? ped.value.pedidos || [] : []);
    setDaily(dai.status === 'fulfilled' ? dai.value : null);
    if (his.status === 'fulfilled') setHistorico(Array.isArray(his.value) ? his.value : his.value?.items || getHistoricoChamados() || []);
    setAgora(Date.now());
    setCarregou(true);
  }, [userEmail]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    window.addEventListener('suporte_updated', carregar);
    window.addEventListener('agenda_eventos_updated', carregar);
    return () => {
      clearInterval(t);
      window.removeEventListener('suporte_updated', carregar);
      window.removeEventListener('agenda_eventos_updated', carregar);
    };
  }, [carregar]);

  // ---- Demandas
  const visiveis = useMemo(() => chamados.filter((c) => podeVerDemanda(perm, c)), [chamados, perm]);
  const minhas = useMemo(() => visiveis.filter((c) => ['em_andamento', 'pendente'].includes(c.status) && chamadoEhDe(c, userEmail)).sort((a, b) => minutosDesde(b.iniciado_em, agora) - minutosDesde(a.iniciado_em, agora)), [visiveis, userEmail, agora]);
  const naFila = useMemo(() => visiveis.filter((c) => c.status === 'aguardando_visualizacao').sort((a, b) => minutosDesde(b.tempo_espera_inicio || b.created_at, agora) - minutosDesde(a.tempo_espera_inicio || a.created_at, agora)), [visiveis, agora]);
  const aguardandoCliente = minhas.filter((c) => c.status === 'pendente').length;
  const emAtendimento = minhas.filter((c) => c.status === 'em_andamento');
  const maisAntigaFila = naFila[0] ? haQuanto(minutosDesde(naFila[0].tempo_espera_inicio || naFila[0].created_at, agora)) : null;

  // ---- Chat: esperando resposta há mais de 15 minutos (as conversas que a pessoa vê)
  const email = String(userEmail || '').toLowerCase();
  const perdidas = useMemo(
    () =>
      (conversas || [])
        .filter((c) => c.status !== 'resolvida' && naoRespondida(c) && minutosDesde(c.ultima_entrada_cliente_em, agora) >= 15 && (!c.responsavel_email || String(c.responsavel_email).toLowerCase() === email))
        .sort((a, b) => minutosDesde(b.ultima_entrada_cliente_em, agora) - minutosDesde(a.ultima_entrada_cliente_em, agora)),
    [conversas, agora, email]
  );
  const ativas = (conversas || []).filter((c) => c.status !== 'resolvida' && String(c.responsavel_email || '').toLowerCase() === email).length;

  // ---- Agenda de hoje
  const hoje = dataLocal(new Date(agora));
  const reunioesHoje = useMemo(() => eventos.filter((e) => e.data === hoje && e.status !== 'cancelada').sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio))), [eventos, hoje]);
  const horaAgora = new Date(agora).toTimeString().slice(0, 5);
  const proxima = reunioesHoje.find((e) => String(e.hora_fim || e.hora_inicio) >= horaAgora);

  // ---- Pedidos de tratativa para a pessoa
  const pedidosParaMim = pedidos.filter((p) => STATUS_ABERTOS.includes(p.status) && p.chamado && chamadoEhDe(p.chamado, userEmail));

  // ---- Metas da semana
  const metas = daily?.metas || [];
  const metasFeitas = metas.filter((m) => m.concluida_em).length;
  const metasAbertas = metas.filter((m) => !m.concluida_em);

  // ---- Desempenho no mês
  const desempenho = useMemo(() => {
    const inicioMes = new Date(new Date(agora).getFullYear(), new Date(agora).getMonth(), 1).getTime();
    const ranking = rankingDeResolucoes(historico, inicioMes);
    return desempenhoDe(ranking, [userEmail, getNomeTecnico(userEmail)], Math.max((getEquipeUsuarios() || []).length, 0));
  }, [historico, agora, userEmail]);
  const maiorTotal = Math.max(1, ...desempenho.ranking.map((r) => r.total));
  const meuIdx = desempenho.posicao - 1;
  const tomCor = { lider: 'text-emerald-600 dark:text-emerald-400', bem: 'text-emerald-600 dark:text-emerald-400', alerta: 'text-amber-600 dark:text-amber-400', neutro: 'text-slate-600 dark:text-zinc-300', sem_dados: 'text-slate-500 dark:text-zinc-400' }[desempenho.tom];

  const data = new Date(agora);
  const dataTexto = data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const frase = frasePrincipal({ minhas: minhas.length, fila: naFila.length, perdidas: perdidas.length, reunioes: reunioesHoje.length, pedidos: pedidosParaMim.length });

  return (
    <div className="relative text-[#1d1d1f] dark:text-white pb-24">
      {/* Fundo vivo, no mesmo clima do Modo foco */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-0" aria-hidden="true">
        <motion.div className="absolute -top-44 -left-40 w-[680px] h-[680px] rounded-full blur-[130px] opacity-60 dark:opacity-100" style={{ background: 'rgb(var(--rm-acento-medio) / 0.3)' }} animate={{ x: [0, 90, 0], y: [0, 60, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute -bottom-52 -right-36 w-[620px] h-[620px] rounded-full blur-[140px] bg-violet-500/15 dark:bg-violet-500/25" animate={{ x: [0, -70, 0], y: [0, -50, 0] }} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="relative z-[1] max-w-[1180px] mx-auto pt-4 sm:pt-[72px]">
        {/* Saudação */}
        <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={MOLA} className="px-1 sm:px-0">
          <p className={`text-[13px] font-medium tracking-[0.08em] uppercase ${TEXTO2}`}>{dataTexto}</p>
          <h1 className="mt-2 text-[44px] sm:text-[68px] leading-[1.02] font-semibold tracking-[-0.045em]">
            {saudacaoDaHora(data.getHours())}
            {nome ? `, ${nome}` : ''}.
          </h1>
          <p className="mt-4 max-w-[760px] text-[18px] sm:text-[21px] leading-snug text-slate-600 dark:text-zinc-300">{carregou || minhas.length || naFila.length ? frase : 'Preparando o seu dia…'}</p>
        </motion.header>

        {/* Números do dia */}
        <div className="mt-9 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Indicador rotulo="Com você" valor={minhas.length} detalhe={aguardandoCliente ? `${aguardandoCliente} aguardando o cliente` : `${emAtendimento.length} em atendimento`} aba="fila" atraso={0.05} />
          <Indicador rotulo="Na fila" valor={naFila.length} detalhe={maisAntigaFila ? `a mais antiga espera ${maisAntigaFila.replace('há ', '')}` : 'ninguém esperando'} aba="fila" destaque={naFila.length > 0} atraso={0.1} />
          {abas.includes('chat') && <Indicador rotulo="Conversas esperando" valor={perdidas.length} detalhe={ativas ? `${ativas} ${ativas === 1 ? 'conversa' : 'conversas'} com você` : 'resposta há mais de 15 min'} aba="chat" destaque={perdidas.length > 0} atraso={0.15} />}
          <Indicador rotulo="Reuniões hoje" valor={reunioesHoje.length} detalhe={proxima ? `próxima às ${proxima.hora_inicio}` : reunioesHoje.length ? 'todas já aconteceram' : 'nada marcado'} aba="agenda" atraso={0.2} />
        </div>

        <div className="mt-4 sm:mt-5 grid lg:grid-cols-[1.4fr_1fr] gap-4 sm:gap-5 items-start">
          {/* Coluna principal */}
          <div className="space-y-4 sm:space-y-5 min-w-0">
            {pedidosParaMim.length > 0 && (
              <Cartao titulo="Pedidos de tratativa" aside="o gestor espera a sua resposta" atraso={0.1} className="!bg-amber-500/[0.1] dark:!bg-amber-400/[0.1] !ring-amber-500/25">
                <ul className="space-y-2.5">
                  {pedidosParaMim.slice(0, 3).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[14.5px] font-semibold">{p.chamado.empresa_nome}</span>
                      <span className={`text-[12.5px] ${TEXTO2}`}>{primeiroNome(p.solicitante_nome) || 'O gestor'} pediu · {textoPrazo(p.prazo_em)}</span>
                      <button type="button" onClick={() => irParaAba('fila')} className={`${BTN} ml-auto`}>Responder</button>
                    </li>
                  ))}
                </ul>
              </Cartao>
            )}

            <Cartao titulo="Seu foco agora" aside={minhas.length ? `${minhas.length} com você` : null} atraso={0.15}>
              {minhas.length === 0 ? (
                <Vazio texto="Nenhuma demanda com você. Que tal pegar uma da fila?" />
              ) : (
                <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                  {minhas.slice(0, 4).map((c) => {
                    const min = minutosDesde(c.status === 'pendente' ? c.aguardando_cliente_desde || c.iniciado_em : c.tempo_ativo_inicio || c.iniciado_em, agora);
                    return (
                      <li key={c.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold tracking-tight truncate">{c.empresa_nome}</p>
                          <p className={`text-[13px] truncate ${TEXTO2}`}>{c.observacao_inicial || 'Sem descrição'}</p>
                        </div>
                        <span className={`text-[12.5px] whitespace-nowrap ${c.status === 'pendente' ? 'text-violet-600 dark:text-violet-300' : min >= 480 ? 'text-rose-600 dark:text-rose-400' : TEXTO2}`}>{c.status === 'pendente' ? 'aguardando cliente' : haQuanto(min).replace('há ', '')}</span>
                        <button type="button" onClick={() => irParaAba('fila')} className={BTN}>Abrir</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Cartao>

            <Cartao titulo="Esperando alguém assumir" aside={naFila.length ? `${naFila.length} na fila` : null} atraso={0.2}>
              {naFila.length === 0 ? (
                <Vazio texto="A fila está limpa. Bom trabalho, equipe." />
              ) : (
                <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                  {naFila.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold tracking-tight truncate">{c.empresa_nome}</p>
                        <p className={`text-[13px] truncate ${TEXTO2}`}>{c.observacao_inicial || 'Sem descrição'}</p>
                      </div>
                      <span className="text-[12.5px] whitespace-nowrap text-amber-600 dark:text-amber-400">{haQuanto(minutosDesde(c.tempo_espera_inicio || c.created_at, agora)).replace('há ', '')}</span>
                      <button type="button" onClick={() => irParaAba('fila')} className={BTN}>Ver</button>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>

            {abas.includes('chat') && (
              <Cartao titulo="Conversas esperando resposta" aside={perdidas.length ? `${perdidas.length}` : null} atraso={0.25}>
                {conversas === undefined ? (
                  <Vazio texto="Carregando as conversas…" />
                ) : conversas === null ? (
                  <Vazio texto="Não deu para carregar as conversas agora." />
                ) : perdidas.length === 0 ? (
                  <Vazio texto="Nenhum cliente esperando há mais de 15 minutos." />
                ) : (
                  <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                    {perdidas.slice(0, 4).map((c) => (
                      <li key={c.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold tracking-tight truncate">{c.contato?.nome || c.contato?.telefone || 'Contato'}</p>
                          <p className={`text-[13px] truncate ${TEXTO2}`}>{c.ultima_mensagem_texto || 'Mensagem'}</p>
                        </div>
                        <span className="text-[12.5px] whitespace-nowrap text-rose-600 dark:text-rose-400">{haQuanto(minutosDesde(c.ultima_entrada_cliente_em, agora)).replace('há ', '')}</span>
                        <button type="button" onClick={() => abrirConversa(c.id)} className={BTN}>Responder</button>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            )}
          </div>

          {/* Coluna lateral */}
          <div className="space-y-4 sm:space-y-5 min-w-0">
            <Cartao titulo="Agenda de hoje" aside={reunioesHoje.length ? `${reunioesHoje.length} ${reunioesHoje.length === 1 ? 'reunião' : 'reuniões'}` : null} atraso={0.2}>
              {reunioesHoje.length === 0 ? (
                <Vazio texto="Sem reuniões hoje. O dia é seu." />
              ) : (
                <ol className="relative">
                  {reunioesHoje.slice(0, 5).map((e, i) => {
                    const passou = String(e.hora_fim || e.hora_inicio) < horaAgora;
                    const agoraMesmo = !passou && String(e.hora_inicio) <= horaAgora;
                    return (
                      <li key={e.id || i} className={`flex gap-4 py-2.5 ${passou ? 'opacity-45' : ''}`}>
                        <span className="w-[46px] text-[14px] font-semibold tabular-nums pt-px">{e.hora_inicio}</span>
                        <span className={`mt-[7px] w-2 h-2 rounded-full flex-shrink-0 ${agoraMesmo ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-black/25 dark:bg-white/30'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14.5px] font-medium leading-snug">{e.titulo}</p>
                          <p className={`text-[12.5px] truncate ${TEXTO2}`}>{agoraMesmo ? 'acontecendo agora' : e.empresa || e.hora_fim ? `até ${e.hora_fim || ''}${e.empresa ? ` · ${e.empresa}` : ''}` : ''}</p>
                        </div>
                        {e.link_reuniao && !passou && (
                          <a href={e.link_reuniao} target="_blank" rel="noopener noreferrer" className={`${BTN} !h-8 !px-3 self-center`}>Entrar</a>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </Cartao>

            {abas.includes('daily') && (
              <Cartao titulo="Metas da semana" aside="Daily" atraso={0.25}>
                {!daily ? (
                  <Vazio texto="Sem metas cadastradas nesta semana." />
                ) : (
                  <div className="flex items-start gap-5">
                    <Anel fracao={metas.length ? metasFeitas / metas.length : 0}>
                      <span className="text-[17px] font-semibold tabular-nums">{metasFeitas}/{metas.length}</span>
                    </Anel>
                    <ul className="flex-1 min-w-0 space-y-1.5 pt-1">
                      {metasAbertas.slice(0, 3).map((m) => (
                        <li key={m.id} className="flex items-start gap-2 text-[13.5px] leading-snug">
                          <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-black/30 dark:bg-white/35 flex-shrink-0" />
                          <span className="min-w-0">{m.texto}</span>
                        </li>
                      ))}
                      {metas.length > 0 && metasAbertas.length === 0 && <li className="text-[13.5px] text-emerald-600 dark:text-emerald-400">Todas as metas foram cumpridas. Excelente!</li>}
                      {metas.length === 0 && <li className={`text-[13.5px] ${TEXTO2}`}>Nenhuma meta cadastrada.</li>}
                    </ul>
                  </div>
                )}
              </Cartao>
            )}

            <Cartao titulo="Seu desempenho" aside="este mês" atraso={0.3}>
              <p className="text-[34px] leading-none font-semibold tracking-[-0.03em]">
                {desempenho.tom === 'sem_dados' ? '—' : `${desempenho.posicao}º`}
                {desempenho.tom !== 'sem_dados' && <span className={`ml-2 text-[15px] font-medium tracking-normal ${TEXTO2}`}>de {desempenho.participantes}</span>}
              </p>
              <p className={`mt-3 text-[14px] leading-snug ${tomCor}`}>{desempenho.texto}</p>
              {desempenho.ranking.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {desempenho.ranking.slice(0, 5).map((r, i) => {
                    const sou = i === meuIdx;
                    return (
                      <li key={r.chave} className="flex items-center gap-3 text-[12.5px]">
                        <span className={`w-[76px] truncate ${sou ? 'font-semibold' : TEXTO2}`}>{sou ? 'Você' : primeiroNome(r.nome) || r.nome}</span>
                        <span className="flex-1 h-[6px] rounded-full bg-black/[0.07] dark:bg-white/10 overflow-hidden">
                          <motion.span className={`block h-full rounded-full ${sou ? 'bg-[#1d1d1f] dark:bg-white' : 'bg-black/30 dark:bg-white/35'}`} initial={{ width: 0 }} animate={{ width: `${Math.max(4, (r.total / maiorTotal) * 100)}%` }} transition={{ type: 'spring', bounce: 0, duration: 1, delay: 0.4 + i * 0.06 }} />
                        </span>
                        <span className="w-6 text-right tabular-nums">{r.total}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Cartao>
          </div>
        </div>
      </div>
    </div>
  );
}
