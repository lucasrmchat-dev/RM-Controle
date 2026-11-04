'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, animate, useReducedMotion } from 'framer-motion';
import { fetchConversas, fetchDaily, fetchHistoricoChamados, fetchPedidosTratativa, getAbasPermitidas, getAgendaEventos, getEquipeUsuarios, getFilaChamados, getHistoricoChamados, getNomeTecnico, getPermissoesAtuais } from '@/lib/storage';
import { podeVerDemanda } from '@/lib/perfis';
import { chamadoEhDe, STATUS_ABERTOS, textoPrazo } from '@/lib/pedidosTratativa';
import { EVENTO_NOTIFICACOES, listarNotificacoes, marcarLida, marcarTodasLidas } from '@/lib/notificacoes';
import { desempenhoDe, frasePrincipal, haQuanto, minutosDesde, primeiroNome, rankingDeResolucoes, saudacaoDaHora } from '@/lib/resumoDoDia';
import { naoRespondida } from './ChatFerramentas';

// ------------------------------------------------------------------------------
// Início: o resumo do dia. Pensado para entender em segundos: o que é urgente vem primeiro e em destaque,
// o que é contexto fica menor e mais abaixo. Em tela larga vira três colunas (urgente | fila e conversas | contexto),
// para caber sem rolar; em telas menores as colunas empilham.
// ------------------------------------------------------------------------------
const MOLA = { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 };
const VIDRO = 'rounded-[24px] bg-white/75 dark:bg-white/[0.055] backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.09] shadow-[0_20px_60px_-44px_rgba(0,0,0,0.35)] dark:shadow-[0_26px_80px_-40px_rgba(0,0,0,0.8)]';
const TEXTO2 = 'text-slate-500 dark:text-zinc-400';
const BTN = 'h-8 px-3.5 rounded-full text-[12.5px] font-medium whitespace-nowrap cursor-pointer transition-colors bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/10 dark:hover:bg-white/[0.16] text-[#1d1d1f] dark:text-white';
const LIMITE = 3;

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
    const c = animate(0, valor, { duration: 0.8, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [valor, reduzir]);
  return <span className={`tabular-nums ${className}`}>{v}</span>;
}

function Anel({ fracao, tamanho = 64, traco = 6, children }) {
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90" aria-hidden="true">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={traco} stroke="currentColor" className="text-black/[0.07] dark:text-white/10" />
        <motion.circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={traco} strokeLinecap="round" stroke="rgb(var(--rm-acento-vivo))" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, fracao)) }} transition={{ type: 'spring', bounce: 0, duration: 1.2 }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Cartao({ titulo, aside, children, className = '', atraso = 0, tom }) {
  const anel = tom === 'alerta' ? '!ring-rose-500/30' : tom === 'aviso' ? '!ring-amber-500/30' : '';
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...MOLA, delay: atraso }} className={`${VIDRO} ${anel} p-4 sm:p-5 ${className}`}>
      <header className="flex items-baseline gap-3 mb-2.5">
        <h3 className="text-[14.5px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">{titulo}</h3>
        {aside && <span className={`ml-auto text-[12px] ${TEXTO2}`}>{aside}</span>}
      </header>
      {children}
    </motion.section>
  );
}

const Vazio = ({ texto }) => <p className={`py-4 text-center text-[13px] ${TEXTO2}`}>{texto}</p>;

/** Linha padrão: o que é, uma linha de contexto, um tempo colorido e uma ação. */
function Linha({ titulo, sub, chip, chipCor = TEXTO2, acao, onAcao }) {
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold tracking-tight truncate">{titulo}</p>
        <p className={`text-[12.5px] truncate ${TEXTO2}`}>{sub}</p>
      </div>
      {chip && <span className={`text-[12px] font-medium whitespace-nowrap ${chipCor}`}>{chip}</span>}
      <button type="button" onClick={onAcao} className={BTN}>{acao}</button>
    </li>
  );
}

const Mais = ({ total, mostrados, aba }) =>
  total > mostrados ? (
    <button type="button" onClick={() => irParaAba(aba)} className={`mt-2 text-[12.5px] ${TEXTO2} hover:text-[#1d1d1f] dark:hover:text-white hover:underline cursor-pointer`}>
      + {total - mostrados} a mais · ver todas
    </button>
  ) : null;

function Indicador({ rotulo, valor, detalhe, aba, tom = 'neutro', atraso }) {
  const cor = tom === 'alerta' ? 'text-rose-600 dark:text-rose-400' : tom === 'aviso' ? 'text-amber-600 dark:text-amber-400' : 'text-[#1d1d1f] dark:text-white';
  const anel = tom === 'alerta' ? 'ring-rose-500/30' : tom === 'aviso' ? 'ring-amber-500/30' : '';
  return (
    <motion.button
      type="button"
      onClick={() => irParaAba(aba)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOLA, delay: atraso }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      className={`${VIDRO} ${anel} text-left px-4 py-3.5 sm:px-5 sm:py-4 cursor-pointer`}
    >
      <div className="flex items-baseline gap-3">
        <span className={`text-[42px] leading-none font-semibold tracking-[-0.04em] ${cor}`}>
          <Numero valor={valor} />
        </span>
        <span className="text-[13.5px] font-medium leading-tight">{rotulo}</span>
      </div>
      <p className={`mt-2 text-[12px] ${tom === 'neutro' ? TEXTO2 : cor} truncate`}>{detalhe}</p>
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
  const [notifs, setNotifs] = useState(() => listarNotificacoes());
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
    const lerNotifs = () => setNotifs(listarNotificacoes());
    window.addEventListener('suporte_updated', carregar);
    window.addEventListener('agenda_eventos_updated', carregar);
    window.addEventListener(EVENTO_NOTIFICACOES, lerNotifs);
    return () => {
      clearInterval(t);
      window.removeEventListener('suporte_updated', carregar);
      window.removeEventListener('agenda_eventos_updated', carregar);
      window.removeEventListener(EVENTO_NOTIFICACOES, lerNotifs);
    };
  }, [carregar]);

  // ---- Demandas
  const visiveis = useMemo(() => chamados.filter((c) => podeVerDemanda(perm, c)), [chamados, perm]);
  const minhas = useMemo(() => visiveis.filter((c) => ['em_andamento', 'pendente'].includes(c.status) && chamadoEhDe(c, userEmail)).sort((a, b) => (a.status === 'pendente') - (b.status === 'pendente') || minutosDesde(b.iniciado_em, agora) - minutosDesde(a.iniciado_em, agora)), [visiveis, userEmail, agora]);
  const naFila = useMemo(() => visiveis.filter((c) => c.status === 'aguardando_visualizacao').sort((a, b) => minutosDesde(b.tempo_espera_inicio || b.created_at, agora) - minutosDesde(a.tempo_espera_inicio || a.created_at, agora)), [visiveis, agora]);
  const aguardandoCliente = minhas.filter((c) => c.status === 'pendente').length;
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
  const minhasConversas = (conversas || []).filter((c) => c.status !== 'resolvida' && String(c.responsavel_email || '').toLowerCase() === email).length;

  // ---- Agenda de hoje: o que ainda vem; o que já passou só conta
  const hoje = dataLocal(new Date(agora));
  const horaAgora = new Date(agora).toTimeString().slice(0, 5);
  const reunioesHoje = useMemo(() => eventos.filter((e) => e.data === hoje && e.status !== 'cancelada').sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio))), [eventos, hoje]);
  const restantes = reunioesHoje.filter((e) => String(e.hora_fim || e.hora_inicio) >= horaAgora);
  const jaPassaram = reunioesHoje.length - restantes.length;
  const proxima = restantes[0];

  // ---- Pedidos de tratativa para a pessoa
  const pedidosParaMim = pedidos.filter((p) => STATUS_ABERTOS.includes(p.status) && p.chamado && chamadoEhDe(p.chamado, userEmail));

  // ---- Avisos (a central de notificações)
  const naoLidas = notifs.filter((n) => !n.lida);

  // ---- Metas da semana
  const metas = daily?.metas || [];
  const metasFeitas = metas.filter((m) => m.concluida_em).length;
  const metasAbertas = metas.filter((m) => !m.concluida_em);

  // ---- Desempenho no mês
  const desempenho = useMemo(() => {
    const inicioMes = new Date(new Date(agora).getFullYear(), new Date(agora).getMonth(), 1).getTime();
    return desempenhoDe(rankingDeResolucoes(historico, inicioMes), [userEmail, getNomeTecnico(userEmail)], Math.max((getEquipeUsuarios() || []).length, 0));
  }, [historico, agora, userEmail]);
  const maiorTotal = Math.max(1, ...desempenho.ranking.map((r) => r.total));
  const meuIdx = desempenho.posicao - 1;
  const tomCor = { lider: 'text-emerald-600 dark:text-emerald-400', bem: 'text-emerald-600 dark:text-emerald-400', alerta: 'text-amber-600 dark:text-amber-400', neutro: 'text-slate-600 dark:text-zinc-300', sem_dados: TEXTO2 }[desempenho.tom];
  // Ranking enxuto: os três primeiros e, se a pessoa estiver fora deles, ela também
  const rankingMostrado = desempenho.ranking.map((r, i) => ({ ...r, i })).filter((r) => r.i < 3 || r.i === meuIdx);

  const data = new Date(agora);
  const dataTexto = data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const frase = frasePrincipal({ minhas: minhas.length, fila: naFila.length, perdidas: perdidas.length, reunioes: restantes.length, pedidos: pedidosParaMim.length });
  const maisAntigaConversa = perdidas[0] ? haQuanto(minutosDesde(perdidas[0].ultima_entrada_cliente_em, agora)).replace('há ', '') : null;

  const abrirNotificacao = (n) => {
    marcarLida(n.id);
    if (n.aba) irParaAba(n.aba);
    if (n.alvo?.conversaId) {
      window.__rmChatAbrirPendente = n.alvo.conversaId;
      window.dispatchEvent(new CustomEvent('rm_chat_abrir', { detail: { conversaId: n.alvo.conversaId } }));
    }
  };

  return (
    <div className="relative text-[#1d1d1f] dark:text-white pb-16">
      {/* Fundo vivo, no mesmo clima do Modo foco (cobre a janela inteira) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
        <motion.div className="absolute -top-44 -left-40 w-[720px] h-[720px] rounded-full blur-[130px] opacity-60 dark:opacity-100" style={{ background: 'rgb(var(--rm-acento-medio) / 0.3)' }} animate={{ x: [0, 90, 0], y: [0, 60, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute -bottom-52 -right-36 w-[680px] h-[680px] rounded-full blur-[140px] bg-violet-500/15 dark:bg-violet-500/25" animate={{ x: [0, -70, 0], y: [0, -50, 0] }} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute top-1/3 -right-48 w-[520px] h-[520px] rounded-full blur-[130px] bg-amber-400/10" animate={{ x: [0, -40, 0], y: [0, 40, 0] }} transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="relative z-[1] max-w-[1680px] mx-auto pt-4 sm:pt-[68px]">
        {/* Saudação: curta, e só o que mais importa na frase */}
        <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={MOLA} className="px-1 sm:px-0">
          <p className={`text-[12px] font-medium tracking-[0.08em] uppercase ${TEXTO2}`}>{dataTexto}</p>
          <h1 className="mt-1.5 text-[38px] sm:text-[54px] leading-[1.03] font-semibold tracking-[-0.045em]">
            {saudacaoDaHora(data.getHours())}
            {nome ? `, ${nome}` : ''}.
          </h1>
          <p className="mt-2.5 max-w-[880px] text-[16.5px] sm:text-[18.5px] leading-snug text-slate-600 dark:text-zinc-300">{carregou || minhas.length || naFila.length ? frase : 'Preparando o seu dia…'}</p>
        </motion.header>

        {/* Os quatro números: a cor diz se precisa de atenção */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Indicador rotulo="com você" valor={minhas.length} detalhe={minhas.length ? (aguardandoCliente ? `${aguardandoCliente} esperando o cliente` : 'em atendimento agora') : 'nada pendente com você'} aba="fila" atraso={0.03} />
          {abas.includes('chat') && <Indicador rotulo="conversas esperando" valor={perdidas.length} detalhe={perdidas.length ? `a mais antiga: ${maisAntigaConversa}` : 'tudo respondido'} aba="chat" tom={perdidas.length ? 'alerta' : 'neutro'} atraso={0.06} />}
          <Indicador rotulo="na fila" valor={naFila.length} detalhe={naFila.length ? `a mais antiga: ${maisAntigaFila.replace('há ', '')}` : 'ninguém esperando'} aba="fila" tom={naFila.length ? 'aviso' : 'neutro'} atraso={0.09} />
          <Indicador rotulo="reuniões pela frente" valor={restantes.length} detalhe={proxima ? `próxima às ${proxima.hora_inicio}` : jaPassaram ? 'as de hoje já acabaram' : 'nada marcado'} aba="agenda" atraso={0.12} />
        </div>

        {/* Três colunas em tela larga: 1) urgente · 2) fila e conversas · 3) contexto */}
        <div className="mt-4 grid lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.05fr)_minmax(0,0.85fr)] gap-3 sm:gap-4 items-start">
          <div className="space-y-3 sm:space-y-4 min-w-0">
            {pedidosParaMim.length > 0 && (
              <Cartao titulo="Pedidos de tratativa" aside="o gestor espera você" tom="aviso" atraso={0.08} className="!bg-amber-500/[0.1] dark:!bg-amber-400/[0.1]">
                <ul>
                  {pedidosParaMim.slice(0, LIMITE).map((p) => (
                    <Linha key={p.id} titulo={p.chamado.empresa_nome} sub={`${primeiroNome(p.solicitante_nome) || 'O gestor'} pediu${p.mensagem ? `: “${p.mensagem}”` : ''}`} chip={textoPrazo(p.prazo_em)} chipCor="text-amber-700 dark:text-amber-300" acao="Responder" onAcao={() => irParaAba('fila')} />
                  ))}
                </ul>
              </Cartao>
            )}

            <Cartao titulo="Seu foco agora" aside={minhas.length ? `${minhas.length} com você` : null} atraso={0.1}>
              {minhas.length === 0 ? (
                <Vazio texto="Nada com você. Que tal pegar uma da fila?" />
              ) : (
                <>
                  <ul>
                    {minhas.slice(0, LIMITE).map((c) => {
                      const min = minutosDesde(c.status === 'pendente' ? c.aguardando_cliente_desde || c.iniciado_em : c.tempo_ativo_inicio || c.iniciado_em, agora);
                      const espera = c.status === 'pendente';
                      return <Linha key={c.id} titulo={c.empresa_nome} sub={c.observacao_inicial || 'Sem descrição'} chip={espera ? 'esperando cliente' : haQuanto(min).replace('há ', '')} chipCor={espera ? 'text-violet-600 dark:text-violet-300' : min >= 480 ? 'text-rose-600 dark:text-rose-400' : TEXTO2} acao="Abrir" onAcao={() => irParaAba('fila')} />;
                    })}
                  </ul>
                  <Mais total={minhas.length} mostrados={LIMITE} aba="fila" />
                </>
              )}
            </Cartao>
          </div>

          <div className="space-y-3 sm:space-y-4 min-w-0">
            {abas.includes('chat') && (
              <Cartao titulo="Conversas esperando resposta" aside={perdidas.length ? `${minhasConversas} com você` : null} tom={perdidas.length ? 'alerta' : undefined} atraso={0.12}>
                {conversas === undefined ? (
                  <Vazio texto="Carregando as conversas…" />
                ) : conversas === null ? (
                  <Vazio texto="Não deu para carregar as conversas agora." />
                ) : perdidas.length === 0 ? (
                  <Vazio texto="Nenhum cliente esperando há mais de 15 minutos." />
                ) : (
                  <>
                    <ul>
                      {perdidas.slice(0, LIMITE).map((c) => (
                        <Linha key={c.id} titulo={c.contato?.nome || c.contato?.telefone || 'Contato'} sub={c.ultima_mensagem_texto || 'Mensagem'} chip={haQuanto(minutosDesde(c.ultima_entrada_cliente_em, agora)).replace('há ', '')} chipCor="text-rose-600 dark:text-rose-400" acao="Responder" onAcao={() => abrirConversa(c.id)} />
                      ))}
                    </ul>
                    <Mais total={perdidas.length} mostrados={LIMITE} aba="chat" />
                  </>
                )}
              </Cartao>
            )}

            <Cartao titulo="Esperando alguém assumir" aside={naFila.length ? `${naFila.length} na fila` : null} tom={naFila.length ? 'aviso' : undefined} atraso={0.14}>
              {naFila.length === 0 ? (
                <Vazio texto="A fila está limpa. Bom trabalho, equipe." />
              ) : (
                <>
                  <ul>
                    {naFila.slice(0, LIMITE).map((c) => (
                      <Linha key={c.id} titulo={c.empresa_nome} sub={c.observacao_inicial || 'Sem descrição'} chip={haQuanto(minutosDesde(c.tempo_espera_inicio || c.created_at, agora)).replace('há ', '')} chipCor="text-amber-600 dark:text-amber-400" acao="Ver" onAcao={() => irParaAba('fila')} />
                    ))}
                  </ul>
                  <Mais total={naFila.length} mostrados={LIMITE} aba="fila" />
                </>
              )}
            </Cartao>
          </div>

          <div className="space-y-3 sm:space-y-4 min-w-0 lg:col-span-2 xl:col-span-1">
            <Cartao titulo="Agenda" aside={jaPassaram ? `${jaPassaram} já ${jaPassaram === 1 ? 'aconteceu' : 'aconteceram'}` : null} atraso={0.16}>
              {restantes.length === 0 ? (
                <Vazio texto={reunioesHoje.length ? 'Sem mais reuniões hoje.' : 'Sem reuniões hoje. O dia é seu.'} />
              ) : (
                <ol>
                  {restantes.slice(0, 4).map((e, i) => {
                    const agoraMesmo = String(e.hora_inicio) <= horaAgora;
                    return (
                      <li key={e.id || i} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span className={`w-[44px] text-[13.5px] font-semibold tabular-nums ${agoraMesmo ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{e.hora_inicio}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-medium leading-snug truncate">{e.titulo}</p>
                          {agoraMesmo && <p className="text-[12px] text-emerald-600 dark:text-emerald-400">acontecendo agora</p>}
                        </div>
                        {e.link_reuniao && <a href={e.link_reuniao} target="_blank" rel="noopener noreferrer" className={BTN}>Entrar</a>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </Cartao>

            <Cartao titulo="Avisos" aside={naoLidas.length ? `${naoLidas.length} ${naoLidas.length === 1 ? 'nova' : 'novas'}` : null} atraso={0.18}>
              {naoLidas.length === 0 ? (
                <Vazio texto="Nenhum aviso novo." />
              ) : (
                <>
                  <ul>
                    {naoLidas.slice(0, LIMITE).map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => abrirNotificacao(n)} className="w-full text-left flex items-start gap-2.5 py-2 first:pt-0 cursor-pointer group">
                          <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium leading-snug truncate group-hover:underline">{n.titulo}</span>
                            {n.detalhe && <span className={`block text-[12px] truncate ${TEXTO2}`}>{n.detalhe}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex items-center gap-3 text-[12.5px]">
                    {naoLidas.length > LIMITE && <span className={TEXTO2}>+ {naoLidas.length - LIMITE} no sino</span>}
                    <button type="button" onClick={() => marcarTodasLidas()} className={`ml-auto ${TEXTO2} hover:text-[#1d1d1f] dark:hover:text-white hover:underline cursor-pointer`}>
                      Marcar todos como lidos
                    </button>
                  </div>
                </>
              )}
            </Cartao>

            <Cartao titulo="Seu mês" aside={desempenho.tom === 'sem_dados' ? null : `${desempenho.posicao}º de ${desempenho.participantes}`} atraso={0.2}>
              <p className={`text-[13px] leading-snug ${tomCor}`}>{desempenho.texto}</p>
              {rankingMostrado.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {rankingMostrado.map((r) => {
                    const sou = r.i === meuIdx;
                    return (
                      <li key={r.chave} className="flex items-center gap-3 text-[12px]">
                        <span className={`w-[64px] truncate ${sou ? 'font-semibold' : TEXTO2}`}>{sou ? 'Você' : primeiroNome(r.nome) || r.nome}</span>
                        <span className="flex-1 h-[5px] rounded-full bg-black/[0.07] dark:bg-white/10 overflow-hidden">
                          <motion.span className={`block h-full rounded-full ${sou ? 'bg-[#1d1d1f] dark:bg-white' : 'bg-black/30 dark:bg-white/35'}`} initial={{ width: 0 }} animate={{ width: `${Math.max(4, (r.total / maiorTotal) * 100)}%` }} transition={{ type: 'spring', bounce: 0, duration: 1, delay: 0.3 + r.i * 0.05 }} />
                        </span>
                        <span className="w-6 text-right tabular-nums">{r.total}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Cartao>

            {abas.includes('daily') && daily && metas.length > 0 && (
              <Cartao titulo="Metas da semana" aside="Daily" atraso={0.22}>
                <div className="flex items-center gap-4">
                  <Anel fracao={metasFeitas / metas.length}>
                    <span className="text-[14px] font-semibold tabular-nums">{metasFeitas}/{metas.length}</span>
                  </Anel>
                  <ul className="flex-1 min-w-0 space-y-1">
                    {metasAbertas.slice(0, 2).map((m) => (
                      <li key={m.id} className="text-[12.5px] leading-snug truncate">{m.texto}</li>
                    ))}
                    {metasAbertas.length === 0 && <li className="text-[12.5px] text-emerald-600 dark:text-emerald-400">Todas cumpridas. Excelente!</li>}
                    {metasAbertas.length > 2 && <li className={`text-[12px] ${TEXTO2}`}>+ {metasAbertas.length - 2} pendentes</li>}
                  </ul>
                </div>
              </Cartao>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
