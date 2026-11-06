'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandMark } from './BrandMark';
import PerfilPainel from './PerfilPainel';
import CentralNotificacoes from './CentralNotificacoes';
import AvisosNaTela from './AvisosNaTela';
import BuscaGlobal from './BuscaGlobal';
import { atrasarComLimite } from '@/lib/atrasar';
import { EVENTO_NOTIFICACOES, listarNotificacoes } from '@/lib/notificacoes';
import {
  getFilaChamados,
  getAbasPermitidas,
  getGestaoAtual,
  getCurrentUserRole,
  getAgendaEventos,
  getNomeTecnico,
  getPermissoesAtuais,
  getPerfisAcesso,
  getEquipeUsuarios,
  getVerComoPerfil,
  setVerComoPerfil,
  fetchConversas,
  fetchPedidosTratativa,
} from '@/lib/storage';
import { chamadoEhDe, STATUS_ABERTOS, textoPrazo } from '@/lib/pedidosTratativa';
import { contarConversasNovas } from '@/lib/canais';
import { analisarConversas, chatEsperando } from '@/lib/vigiaChat';
import { getSomDoModulo, pararSomDoModulo, tocarSomDoModulo } from '@/lib/audioNotifications';
import { notificar } from '@/lib/notificacoes';
import { permissoesEfetivas, podeVerDemanda } from '@/lib/perfis';
import { ROTULOS_PAPEL } from '@/lib/roles';
import { EVENTO_FOCO, efeitosDoFoco } from '@/lib/modoFoco';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Mola única do cabeçalho: tudo se move junto, como uma peça só
const MOLA = { type: 'spring', bounce: 0.2, duration: 0.55 };

/** Ícones das abas: todos no mesmo traço (1,75) e tamanho, no estilo dos símbolos da Apple. */
const ICONES_ABA = {
  resumo: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'],
  chat: ['M21 12a8.5 8.5 0 0 1-12.6 7.45L3 21l1.55-5.4A8.5 8.5 0 1 1 21 12z', 'M8.5 10.5h7M8.5 13.5h4.5'],
  fila: ['M3 13.5h4.2l1.6 2.5h6.4l1.6-2.5H21', 'M5.3 5.6L3 13.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5l-2.3-7.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.9 1.6z'],
  agenda: ['M8 2.8v3.4M16 2.8v3.4', 'M5 4.6h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2z', 'M3 9.6h18', 'M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01'],
  comercial: ['M3 17.5l6-6 4 4 8-8', 'M15 7.5h6v6'],
  dashboard: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M21 20H3'],
  feedbacks: ['M9 18h6', 'M10 21.5h4', 'M12 2.5a6.5 6.5 0 0 0-4 11.6c.6.5 1 1.2 1 2V16h6v-.1c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 2.5z'],
  daily: ['M9 4.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2', 'M9 3.5h6v3H9z', 'M8.5 12.5l2 2 4-4.5', 'M8.5 17.5h7'],
  fluxos: ['M4 4h5v5H4zM15 9.5h5v5h-5zM4 15h5v5H4z', 'M9 6.5h2.5a2 2 0 0 1 2 2v1M9 17.5h2.5a2 2 0 0 0 2-2v-1'],
  envios: ['M21.5 2.5 10.5 13.5', 'M21.5 2.5l-7 19-4-8-8-4z'],
  canais: ['M7.5 2.5h9a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V4a1.5 1.5 0 0 1 1.5-1.5z', 'M11 18.5h2', 'M9.5 9.5a3.5 3.5 0 0 1 5 0M10.8 11.6a1.6 1.6 0 0 1 2.4 0'],
};
const ILHA =
  'bg-white/85 dark:bg-rm-elevado-escuro/85 border border-black/[0.07] dark:border-white/[0.11] shadow-[0_8px_24px_-14px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_32px_-14px_rgba(0,0,0,0.7)]';

/** Categorias do cabeçalho: cada uma junta abas parecidas (com uma aba só, vira a própria aba). */
const GRUPOS = [
  { id: 'inicio', label: 'Início', icone: 'resumo', itens: ['resumo'] },
  { id: 'atendimento', label: 'Atendimento', icone: 'chat', itens: ['chat'] },
  { id: 'demandas', label: 'Demandas', icone: 'fila', itens: ['fila', 'agenda'] },
  { id: 'gestao', label: 'Gestão', icone: 'dashboard', itens: ['dashboard', 'daily', 'comercial'] },
  { id: 'automacao', label: 'Automação', icone: 'fluxos', itens: ['fluxos', 'envios', 'conexoes'] },
];
// Feedbacks fica no menu da conta (entre Configurações gerais e Sair)

/** Contador numa aba ou categoria (fora do Navbar: o tipo do componente não muda a cada renderização). */
const Selo = ({ valor, destaque }) =>
  valor ? (
    <span
      className={`relative min-w-[18px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums flex items-center justify-center ${
        destaque ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300' : 'bg-black/[0.06] dark:bg-white/[0.12] text-slate-600 dark:text-zinc-300'
      }`}
    >
      {valor > 99 ? '99+' : valor}
    </span>
  ) : null;

const IconeAba = ({ d }) => (
  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

/** Nome que aparece ao passar o mouse (ícones sem texto). */
const Dica = ({ texto, children }) => (
  <span className="relative group/dica inline-flex">
    {children}
    <span role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+10px)] z-50 whitespace-nowrap rounded-lg bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[11.5px] font-medium px-2.5 py-1 opacity-0 translate-y-[-2px] group-hover/dica:opacity-100 group-hover/dica:translate-y-0 transition-all duration-150 delay-150 shadow-lg">
      {texto}
    </span>
  </span>
);


// Barra do topo (computador): altura e linha central (as ações da fila encaixam ao cruzar esta linha)
const ALTURA_CABECALHO = 64;
const VOO = { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };

function useLarguraTela() {
  const [largura, setLargura] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  useEffect(() => {
    const medir = () => setLargura(window.innerWidth);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  return largura;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  userEmail,
  onLogout,
  theme,
  setTheme,
  inactivityTimeLeft,
  showMockData,
  setShowMockData,
  onBuscaAcao,
}) {
  const [perfilAberto, setPerfilAberto] = useState(false);
  // Busca única da ilha: aberta, a ilha cresce de lado (os nomes das categorias recolhem para dar lugar ao campo)
  const [buscaAberta, setBuscaAberta] = useState(false);
  const buscaAbertaRef = useRef(false);
  buscaAbertaRef.current = buscaAberta;
  const conversasBusca = useRef([]);
  const [grupoAberto, setGrupoAberto] = useState(null);
  // Modo foco com cabeçalho recolhido: a ilha sobe e some; encostar o mouse no topo traz de volta
  const [recolhido, setRecolhido] = useState(false);
  const [espiando, setEspiando] = useState(false);
  useEffect(() => {
    setRecolhido(efeitosDoFoco().recolher);
    const aoFoco = (e) => {
      setRecolhido(Boolean(e.detail?.recolher));
      setEspiando(false);
    };
    window.addEventListener(EVENTO_FOCO, aoFoco);
    return () => window.removeEventListener(EVENTO_FOCO, aoFoco);
  }, []);
  const escondido = recolhido && !espiando;
  // Espiando: some de novo quando o mouse desce para a tela (com menus da ilha fechados)
  useEffect(() => {
    if (!espiando) return undefined;
    const mover = (e) => e.clientY > 110 && !perfilAberto && !grupoAberto && setEspiando(false);
    document.addEventListener('pointermove', mover);
    return () => document.removeEventListener('pointermove', mover);
  }, [espiando, perfilAberto, grupoAberto]);
  // A ilha fica SEMPRE no mesmo lugar (topo, centro). As telas reservam o meio da linha de título com a
  // largura dela (--rm-ilha-largura, ver EncaixeCabecalho); em telas menores que 1024px há uma faixa no topo.
  const ilhaRef = useRef(null);
  useEffect(() => {
    try {
      localStorage.removeItem('rm_cabecalho_recolhido');
    } catch {}
    const raiz = document.documentElement;
    const medir = () => {
      raiz.style.setProperty('--rm-cabecalho', window.innerWidth >= 1024 ? '0px' : `${ALTURA_CABECALHO}px`);
      // Com a busca aberta a ilha cresce por cima da tela: a reserva do título não muda (nada dá um pulo)
      if (!buscaAbertaRef.current && ilhaRef.current?.offsetWidth) raiz.style.setProperty('--rm-ilha-largura', `${ilhaRef.current.offsetWidth}px`);
    };
    medir();
    window.addEventListener('resize', medir);
    const tamanho = typeof ResizeObserver !== 'undefined' && ilhaRef.current ? new ResizeObserver(medir) : null;
    if (tamanho) tamanho.observe(ilhaRef.current);
    return () => {
      window.removeEventListener('resize', medir);
      tamanho?.disconnect();
    };
  }, []);
  const [totalFila, setTotalFila] = useState(0);
  const [totalReunioesHoje, setTotalReunioesHoje] = useState(0);
  // Conversas do Chat com mensagens novas e notificações não lidas (aparecem também com o cabeçalho recolhido)
  const [totalChat, setTotalChat] = useState(0);
  const [notificacoesNovas, setNotificacoesNovas] = useState(0);
  const [userRole, setUserRole] = useState('administrador');
  const perfilRef = useRef(null);
  const largura = useLarguraTela();

  const checarEstado = () => {
    // Só conta o que o perfil da pessoa enxerga
    const perm = getPermissoesAtuais(userEmail);
    setTotalFila((getFilaChamados ? getFilaChamados() : []).filter((c) => podeVerDemanda(perm, c)).length);
    setUserRole(getCurrentUserRole());
    try {
      const hojeIso = new Date().toISOString().split('T')[0];
      setTotalReunioesHoje((getAgendaEventos() || []).filter((e) => e.data === hojeIso && e.status !== 'cancelada').length);
    } catch (e) {}
  };

  useEffect(() => {
    const contar = () => setNotificacoesNovas(listarNotificacoes().filter((n) => !n.lida).length);
    contar();
    window.addEventListener(EVENTO_NOTIFICACOES, contar);
    window.addEventListener('storage', contar);
    return () => {
      window.removeEventListener(EVENTO_NOTIFICACOES, contar);
      window.removeEventListener('storage', contar);
    };
  }, []);

  // Chat: a tela do Chat avisa na hora; fora dela, consulta a cada 20 s. Conversa nova ou mensagem nova
  // toca o som escolhido em Configurações › Sons e alertas e entra na central de notificações.
  const vigiaChat = useRef(null);
  useEffect(() => {
    if (!getAbasPermitidas(userEmail).includes('chat')) return undefined;
    const email = String(userEmail || '').toLowerCase();
    let ultimas = [];
    const processar = (conversas, config) => {
      ultimas = conversas;
      conversasBusca.current = conversas;
      setTotalChat(contarConversasNovas(conversas, config));
      const grupos = Boolean(getSomDoModulo('chat').grupos);
      const { proximo, avisos } = analisarConversas(vigiaChat.current, conversas, { email, grupos });
      vigiaChat.current = proximo;
      if (!avisos.length) return;
      // Um aviso por conversa na central; a conversa aberta na tela (e a aba visível) só toca o som
      const vendo = document.visibilityState === 'visible' ? window.__rmChatAberta : null;
      avisos
        .filter((a) => a.conversaId !== vendo)
        .forEach((a) => notificar({ id: `chat-${a.chave}`, tipo: 'chat', titulo: a.titulo, detalhe: a.detalhe, aba: 'chat', grupo: `chat-${a.conversaId}`, alvo: { conversaId: a.conversaId } }));
      // Som do Chat (Configurações › Sons e alertas). A repetição para quando não houver mais nada sem ler;
      // na conversa aberta (que já chega lida), para quando a pessoa voltar a mexer no computador
      const naAberta = avisos.some((a) => a.conversaId === window.__rmChatAberta);
      tocarSomDoModulo('chat', naAberta ? {} : { aindaPendente: () => chatEsperando(ultimas, { email, grupos: Boolean(getSomDoModulo('chat').grupos) }) });
    };
    let aoVivo = null;
    let espera = null;
    // Mensagem nova avisa na hora (aviso do servidor, sem conteúdo); a consulta a cada 20 s fica de reserva.
    // Uma única inscrição por aba do navegador: a tela do Chat, se aberta, recebe o aviso por aqui.
    const inscrever = (topico) => {
      if (aoVivo || !topico || !isSupabaseConfigured || !supabase) return;
      aoVivo = supabase
        .channel(topico)
        .on('broadcast', { event: 'mudou' }, () => {
          window.dispatchEvent(new Event('rm_chat_mudou'));
          // Rajada de avisos: consulta a cada 3 s no máximo (em vez de esperar a rajada acabar)
          espera?.();
        })
        .subscribe();
    };
    const aoReceber = (e) => {
      if (!e.detail?.conversas) return;
      processar(e.detail.conversas, e.detail.config);
      inscrever(e.detail.aoVivo);
    };
    window.addEventListener('rm_chat_conversas', aoReceber);
    const consultar = () =>
      // Com a tela do Chat aberta, ela já manda a lista (evita consultar duas vezes)
      !window.__rmChatMontado &&
      fetchConversas('abertas')
        .then((r) => {
          processar(r.conversas, r.config);
          inscrever(r.aoVivo);
        })
        .catch(() => {});
    espera = atrasarComLimite(consultar, 400, 3000);
    consultar();
    const t = setInterval(consultar, 20000);
    return () => {
      clearInterval(t);
      espera?.cancelar?.();
      if (aoVivo) supabase.removeChannel(aoVivo);
      pararSomDoModulo('chat');
      window.removeEventListener('rm_chat_conversas', aoReceber);
    };
  }, [userEmail]);

  // Pedido de tratativa para você: o gestor pediu que você trate uma demanda sua. Avisa no sino (uma vez por pedido);
  // os botões de resposta ficam na tela de Demandas.
  useEffect(() => {
    if (!getAbasPermitidas(userEmail).includes('fila')) return undefined;
    const consultar = () =>
      fetchPedidosTratativa()
        .then((r) => {
          (r.pedidos || [])
            .filter((p) => STATUS_ABERTOS.includes(p.status) && p.status === 'aberto' && chamadoEhDe(p.chamado, userEmail))
            .forEach((p) =>
              notificar({
                id: `pedido-tratativa-${p.id}`,
                tipo: 'demanda',
                titulo: `${String(p.solicitante_nome || p.solicitante_email || 'O gestor').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0]} pediu a tratativa de ${p.chamado?.empresa_nome || 'uma demanda'}`,
                detalhe: [p.mensagem, p.prazo_em ? textoPrazo(p.prazo_em) : null].filter(Boolean).join(' · '),
                aba: 'fila',
                grupo: `pedido-tratativa-${p.id}`,
              })
            );
        })
        .catch(() => {});
    consultar();
    const t = setInterval(consultar, 45000);
    return () => clearInterval(t);
  }, [userEmail]);

  useEffect(() => {
    checarEstado();
    const eventos = ['suporte_updated', 'user_role_updated', 'equipe_updated', 'agenda_eventos_updated', 'perfis_updated'];
    eventos.forEach((ev) => window.addEventListener(ev, checarEstado));
    return () => eventos.forEach((ev) => window.removeEventListener(ev, checarEstado));
  }, []);


  useEffect(() => {
    if (!perfilAberto) return undefined;
    const fora = (e) => perfilRef.current && !perfilRef.current.contains(e.target) && setPerfilAberto(false);
    const esc = (e) => e.key === 'Escape' && setPerfilAberto(false);
    document.addEventListener('mousedown', fora);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('keydown', esc);
    };
  }, [perfilAberto]);

  const nome = (userEmail && getNomeTecnico(userEmail)) || 'Você';
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const todasAsAbas = [
    { id: 'resumo', label: 'Início', curto: 'Início', descricao: 'O resumo do seu dia', icon: <IconeAba d={ICONES_ABA.resumo} /> },
    { id: 'chat', label: 'Chat', curto: 'Chat', descricao: 'Conversas do WhatsApp', badge: totalChat || null, icon: <IconeAba d={ICONES_ABA.chat} /> },
    { id: 'conexoes', label: 'Canais', curto: 'Canais', descricao: 'Números de WhatsApp conectados', icon: <IconeAba d={ICONES_ABA.canais} /> },
    { id: 'fluxos', label: 'Fluxo Inteligente', curto: 'Fluxos', descricao: 'Automações com gatilhos, regras e ações', icon: <IconeAba d={ICONES_ABA.fluxos} /> },
    { id: 'envios', label: 'Envios em massa', curto: 'Envios', descricao: 'Uma mensagem para vários contatos e grupos', icon: <IconeAba d={ICONES_ABA.envios} /> },
    { id: 'fila', label: 'Demandas', curto: 'Demandas', descricao: 'Demandas dos clientes', badge: totalFila || null, icon: <IconeAba d={ICONES_ABA.fila} /> },
    { id: 'feedbacks', label: 'Feedbacks', curto: 'Feedbacks', descricao: 'Ideias, melhorias e problemas', icon: <IconeAba d={ICONES_ABA.feedbacks} /> },
    { id: 'agenda', label: 'Agenda', curto: 'Agenda', descricao: 'Reuniões e Google Agenda', badge: totalReunioesHoje || null, icon: <IconeAba d={ICONES_ABA.agenda} /> },
    { id: 'daily', label: 'Daily', curto: 'Daily', descricao: 'Resumo das dailies e metas da semana', icon: <IconeAba d={ICONES_ABA.daily} /> },
    { id: 'dashboard', label: 'Dashboard', curto: 'Métricas', descricao: 'Métricas de atendimento', icon: <IconeAba d={ICONES_ABA.dashboard} /> },
    { id: 'comercial', label: 'Comercial', curto: 'Comercial', descricao: 'Reuniões e acompanhamento comercial', icon: <IconeAba d={ICONES_ABA.comercial} /> },
    // Plataforma (empresas assinantes e revendas) fica em Configurações, não no cabeçalho
  ];
  const permitidas = getAbasPermitidas(userEmail);
  const permAtual = getPermissoesAtuais(userEmail);
  // Acesso real (sem a simulação de "Ver o sistema como"), para decidir quem pode simular
  const permReal = permissoesEfetivas({ email: userEmail, equipe: getEquipeUsuarios(), perfis: getPerfisAcesso() });
  const rotuloAcesso = permAtual.perfil?.nome || (permAtual.administrador ? 'Administrador' : ROTULOS_PAPEL[userRole] || 'Suporte Técnico');
  const abas = todasAsAbas.filter((t) => permitidas.includes(t.id));
  const porId = new Map(abas.map((t) => [t.id, t]));
  // Categorias com o que a pessoa pode ver (vazias somem)
  const grupos = GRUPOS.map((g) => ({ ...g, abas: g.itens.map((id) => porId.get(id)).filter(Boolean) })).filter((g) => g.abas.length);
  const podeConfigurar = permitidas.includes('configuracoes');

  const irPara = (tabId) => {
    setBuscaAberta(false);
    setPerfilAberto(false);
    setGrupoAberto(null);
    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Nomes nas categorias só pela largura da janela (nunca muda sozinho com a tela aberta)
  const comNome = largura >= 1180 && !buscaAberta;


  const painel = (modo) => (
    <PerfilPainel
      modo={modo}
      nome={nome}
      email={userEmail}
      rotuloAcesso={rotuloAcesso}
      podeSimular={permReal.administrador}
      perfis={getPerfisAcesso()}
      verComo={getVerComoPerfil()}
      onVerComo={(id) => {
        setVerComoPerfil(id);
        checarEstado();
      }}
      tema={theme}
      onTema={setTheme}
      segundosRestantes={inactivityTimeLeft}
      podeConfigurar={podeConfigurar}
      onConfiguracoes={() => irPara('configuracoes')}
      podeFeedbacks={permitidas.includes('feedbacks')}
      onFeedbacks={() => irPara('feedbacks')}
      mostrarDemo={showMockData}
      onDemo={setShowMockData}
      onSair={() => {
        setPerfilAberto(false);
        onLogout();
      }}
    />
  );

  return (
    <>
      {/* ============================================================================== */}
      {/* COMPUTADOR: ilha centralizada encaixada no topo (não cobre a tela), categorias    */}
      {/* com submenu ao passar o mouse; sem recolher                                     */}
      {/* ============================================================================== */}
      <header className="hidden sm:block">
        {/* z-[49]: acima de tudo da página (a busca e os filtros da Fila usam z-40, e por virem depois na página
            cobriam a lista das categorias), mas abaixo das janelas (z-50 em diante) */}
        {recolhido && <div className="fixed top-0 inset-x-0 h-3 z-[49]" onMouseEnter={() => setEspiando(true)} aria-hidden="true" />}
        <div
          className={`fixed top-2 lg:top-4 left-1/2 -translate-x-1/2 z-[49] transition-[transform,opacity] duration-300 ease-out ${escondido ? '!-translate-y-[calc(100%+24px)] opacity-0 pointer-events-none' : ''}`}
          inert={escondido || undefined}
        >
          {/* Ilha: marca, categorias, notificações e conta */}
          {/* Avisos na tela (ilha e sino) presos à pílula */}
          {/* Com a busca aberta os avisos presos à ilha saem de cena (o painel ocupa o mesmo lugar) e voltam ao fechar */}
          <div className={`transition-opacity duration-300 ease-out ${buscaAberta ? 'opacity-0 pointer-events-none [&_*]:!pointer-events-none' : ''}`} aria-hidden={buscaAberta || undefined}>
            <AvisosNaTela local="cabecalho" onAbrirAba={(aba) => (aba === 'fila' || permitidas.includes(aba)) && irPara(aba)} />
          </div>
          <div ref={ilhaRef} data-ilha-cabecalho className={`${ILHA} h-[48px] rounded-full flex items-center gap-1 pl-1 pr-1 backdrop-blur-xl relative`}>
            <BuscaGlobal
              aberta={buscaAberta}
              onAbertaChange={(v) => {
                setBuscaAberta(v);
                if (v) setGrupoAberto(null);
              }}
              abaAtual={activeTab}
              userEmail={userEmail}
              getConversas={() => conversasBusca.current}
              onAcao={onBuscaAcao}
            />
            <button
              type="button"
              onClick={() => irPara('resumo')}
              aria-label="RM Controle — ir para o Início"
              className="h-10 w-10 flex items-center justify-center rounded-full cursor-pointer flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-acento/40"
            >
              <BrandMark size={34} />
            </button>

            <nav aria-label="Seções" className="flex items-center gap-0.5 ml-0.5">
              {grupos.map((g) => (
                <CategoriaCabecalho key={g.id} grupo={g} activeTab={activeTab} aberto={grupoAberto === g.id} onAbrir={(v) => setGrupoAberto((atual) => (v ? g.id : atual === g.id ? null : atual))} onIr={irPara} comNome={comNome} />
              ))}
            </nav>

            <span className="w-px h-6 bg-black/[0.08] dark:bg-white/[0.12] mx-1" aria-hidden="true" />
            <Dica texto="Notificações">
              <CentralNotificacoes embutido onAbrirAba={(aba) => (aba === 'fila' || permitidas.includes(aba)) && irPara(aba)} />
            </Dica>
            <div className="relative" ref={perfilRef}>
              <button
                type="button"
                onClick={() => {
                  setBuscaAberta(false);
                  setPerfilAberto((v) => !v);
                }}
                aria-expanded={perfilAberto}
                aria-label="Sua conta"
                className={`h-10 flex items-center gap-2 rounded-full cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-acento/40 ${
                  perfilAberto ? 'bg-black/[0.06] dark:bg-white/[0.12]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]'
                } px-1`}
              >
                <span className="w-8 h-8 rounded-full bg-[#1d1d1f] dark:bg-rm-fundo text-white dark:text-[#1d1d1f] flex items-center justify-center text-[12px] font-semibold">{iniciais}</span>
              </button>
              <AnimatePresence>{perfilAberto && largura >= 640 && painel('popover')}</AnimatePresence>
            </div>
          </div>

        </div>
      </header>
      {/* Avisos no canto, na faixa do rodapé, na aba lateral, e o flash ao redor da tela */}
      <AvisosNaTela local="tela" onAbrirAba={(aba) => (aba === 'fila' || permitidas.includes(aba)) && irPara(aba)} />
      {/* Telas menores que 1024px: faixa própria no topo (a linha de título não tem espaço para a ilha) */}
      <div className="hidden sm:block lg:hidden" style={{ height: ALTURA_CABECALHO }} aria-hidden="true" />

      {/* ============================================================================== */}
      {/* CELULAR: barra superior simples + dock inferior                                 */}
      {/* ============================================================================== */}
      <header className="sm:hidden fixed top-0 inset-x-0 z-40 bg-white/85 dark:bg-rm-elevado-escuro/85 backdrop-blur-2xl border-b border-black/[0.06] dark:border-white/[0.1] px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark size={30} />
          <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">RM Controle</span>
        </div>
        <div className="flex items-center gap-1">
          <CentralNotificacoes embutido onAbrirAba={(aba) => (aba === 'fila' || permitidas.includes(aba)) && irPara(aba)} />
          <button
            type="button"
            onClick={() => setPerfilAberto(true)}
            aria-label="Sua conta"
            className="w-9 h-9 rounded-full bg-[#1d1d1f] dark:bg-rm-fundo text-white dark:text-[#1d1d1f] flex items-center justify-center text-[12px] font-semibold cursor-pointer"
          >
            {iniciais}
          </button>
        </div>
      </header>
      <div className="sm:hidden h-14" aria-hidden="true" />

      {/* Folha da conta no celular */}
      <AnimatePresence>
        {perfilAberto && largura < 640 && (
          <>
            <motion.div key="veu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[59] bg-black/40" onClick={() => setPerfilAberto(false)} />
            {painel('sheet')}
          </>
        )}
      </AnimatePresence>

      {/* Dock do celular: uma posição por categoria; com mais de uma aba, abre a lista acima do dock */}
      <AnimatePresence>
        {grupoAberto && largura < 640 && (
          <>
            <motion.div key="veu-grupo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sm:hidden fixed inset-0 z-[48] bg-black/25" onClick={() => setGrupoAberto(null)} />
            <motion.div
              key="lista-grupo"
              role="menu"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={MOLA}
              className="sm:hidden fixed bottom-[86px] inset-x-2.5 z-50 rounded-[22px] bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.1] shadow-[0_16px_40px_rgba(0,0,0,0.2)] p-1.5"
            >
              {(grupos.find((g) => g.id === grupoAberto)?.abas || []).map((t) => (
                <button key={t.id} type="button" role="menuitem" onClick={() => irPara(t.id)} className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left cursor-pointer ${activeTab === t.id ? 'bg-black/[0.05] dark:bg-white/[0.08]' : ''}`}>
                  <span className={activeTab === t.id ? 'text-rm-acento dark:text-rm-acento-vivo' : 'text-slate-500 dark:text-zinc-400'}>{t.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-[#1d1d1f] dark:text-white">{t.label}</span>
                    <span className="block text-[12px] text-slate-500 dark:text-zinc-400">{t.descricao}</span>
                  </span>
                  <Selo valor={t.badge} destaque={t.id === 'fila'} />
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <nav className={`${recolhido ? 'hidden' : 'sm:hidden'} fixed bottom-2.5 inset-x-2.5 z-50 bg-white/85 dark:bg-rm-elevado-escuro/85 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.11] shadow-[0_12px_36px_rgba(0,0,0,0.16)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.7)] rounded-[26px] p-1.5 flex items-center justify-between`}>
        {grupos.map((g) => {
          const unica = g.abas.length === 1 ? g.abas[0] : null;
          const ativa = g.abas.some((t) => t.id === activeTab);
          const badge = g.abas.reduce((n, t) => n + (t.badge || 0), 0);
          return (
            <motion.button
              key={g.id}
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => (unica ? irPara(unica.id) : setGrupoAberto((v) => (v === g.id ? null : g.id)))}
              aria-current={ativa ? 'page' : undefined}
              aria-expanded={unica ? undefined : grupoAberto === g.id}
              className={`relative flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-[20px] cursor-pointer ${ativa ? 'text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400'}`}
            >
              {ativa && <motion.span layoutId="dock-ativo" transition={MOLA} className="absolute inset-0 rounded-[20px] bg-black/[0.06] dark:bg-white/[0.12]" />}
              <span className={`relative ${ativa ? 'text-rm-acento dark:text-rm-acento-vivo' : ''}`}>
                {(g.abas.find((t) => t.id === activeTab) || g.abas[0]).icon}
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">{badge > 99 ? '99+' : badge}</span>
                )}
              </span>
              <span className="relative text-[10px] font-medium">{(g.abas.find((t) => t.id === activeTab) || g.abas[0]).curto}</span>
            </motion.button>
          );
        })}
      </nav>
    </>
  );
}

/**
 * Uma categoria do cabeçalho, sem nome de categoria: o botão é a própria aba (a atual da categoria, ou a
 * primeira). Passar o mouse expande a cápsula para baixo só com as outras abas da categoria.
 * A largura do botão é a do maior nome da categoria, então a ilha nunca muda de tamanho ao trocar de aba.
 */
function CategoriaCabecalho({ grupo, activeTab, aberto, onAbrir, onIr, comNome }) {
  const atual = grupo.abas.find((t) => t.id === activeTab) || null;
  const mostrada = atual || grupo.abas[0];
  const outras = grupo.abas.filter((t) => t.id !== mostrada.id);
  const badge = grupo.abas.reduce((n, t) => n + (t.badge || 0), 0);
  const destaque = grupo.abas.some((t) => t.id === 'fila' && t.badge);
  const fechar = useRef(null);
  const raiz = useRef(null);
  const lista = useRef(null);
  const abrirRef = useRef(onAbrir);
  abrirRef.current = onAbrir;
  const entrar = () => {
    clearTimeout(fechar.current);
    if (outras.length) onAbrir(true);
  };
  useEffect(() => () => clearTimeout(fechar.current), []);
  // Aberta, a lista acompanha a posição real do mouse: só fecha quando ele está fora do botão E da lista
  // (com folga) por 0,4 s. Não depende de eventos de entrar/sair, que se perdem quando algo na tela
  // muda debaixo do cursor.
  useEffect(() => {
    if (!aberto) return undefined;
    const dentro = (x, y) =>
      [raiz.current, lista.current].some((el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8;
      });
    const mover = (e) => {
      if (dentro(e.clientX, e.clientY)) {
        clearTimeout(fechar.current);
        fechar.current = null;
      } else if (!fechar.current) {
        fechar.current = setTimeout(() => {
          fechar.current = null;
          abrirRef.current(false);
        }, 400);
      }
    };
    const esc = (e) => e.key === 'Escape' && abrirRef.current(false);
    document.addEventListener('pointermove', mover, true);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointermove', mover, true);
      window.removeEventListener('keydown', esc);
      clearTimeout(fechar.current);
      fechar.current = null;
    };
  }, [aberto]);

  const ativa = Boolean(atual);
  const nomes = (
    <span className="relative grid">
      {grupo.abas.map((t) => (
        <span key={t.id} aria-hidden={t.id !== mostrada.id} className={`[grid-area:1/1] whitespace-nowrap ${t.id === mostrada.id ? '' : 'invisible'}`}>
          {t.label}
        </span>
      ))}
    </span>
  );
  const linha = (t, principal) => {
    const aqui = t.id === activeTab;
    return (
      <button
        key={t.id}
        type="button"
        role={principal ? undefined : 'menuitem'}
        onClick={() => onIr(t.id)}
        onKeyDown={
          principal
            ? (e) => {
                if (!outras.length || e.key !== 'ArrowDown') return;
                e.preventDefault();
                onAbrir(true);
                requestAnimationFrame(() => raiz.current?.querySelector('[role="menuitem"]')?.focus());
              }
            : undefined
        }
        aria-current={aqui ? 'page' : undefined}
        aria-haspopup={principal && outras.length ? 'menu' : undefined}
        aria-expanded={principal && outras.length ? aberto : undefined}
        aria-label={comNome || !principal ? undefined : t.label}
        className={`relative h-10 w-full rounded-full flex items-center gap-2 text-[13.5px] font-medium cursor-pointer transition-[color,background-color,padding] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-acento/40 ${comNome || !principal ? 'px-3.5' : 'px-2.5 justify-center'} ${
          aqui ? 'text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.07]'
        }`}
      >
        {principal && ativa && <motion.span layoutId="aba-ativa" transition={MOLA} className="absolute inset-0 rounded-full bg-black/[0.06] dark:bg-white/[0.12]" />}
        <span className={`relative ${aqui ? 'text-rm-acento dark:text-rm-acento-vivo' : ''}`}>{t.icon}</span>
        {/* Na lista, o nome aparece sempre (mesmo com a ilha só em ícones) */}
        {principal ? (
          <motion.span className="relative overflow-hidden inline-flex" initial={false} animate={{ width: comNome ? 'auto' : 0, opacity: comNome ? 1 : 0, marginLeft: comNome ? 0 : -8 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            {nomes}
          </motion.span>
        ) : <span className="relative whitespace-nowrap">{t.label}</span>}
        {(comNome || !principal) && <span className="flex-1" />}
        <Selo valor={principal ? badge : t.badge} destaque={principal ? destaque : t.id === 'fila'} />
      </button>
    );
  };

  return (
    <div ref={raiz} className="relative" onPointerEnter={entrar}>
      {/* Dica só sem lista: com lista, ela cobriria a primeira opção */}
      {comNome || outras.length ? linha(mostrada, true) : <Dica texto={mostrada.label}>{linha(mostrada, true)}</Dica>}
      <AnimatePresence>
        {aberto && outras.length > 0 && (
          // A cápsula "cresce" para baixo: a faixa transparente no topo liga o botão à lista (o mouse não cai no vão)
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', bounce: 0, duration: 0.22 }}
            ref={lista}
            className="absolute left-0 top-full min-w-full pt-2 z-50"
          >
            <div role="menu" aria-label={grupo.label} className={`${ILHA} backdrop-blur-xl rounded-[24px] p-1 flex flex-col gap-0.5 min-w-[150px]`}>
              {outras.map((t) => linha(t, false))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
