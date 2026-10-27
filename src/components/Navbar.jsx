'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { BrandMark } from './BrandMark';
import PerfilPainel from './PerfilPainel';
import CentralNotificacoes from './CentralNotificacoes';
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
} from '@/lib/storage';
import { contarConversasNovas } from '@/lib/canais';
import { permissoesEfetivas, podeVerDemanda } from '@/lib/perfis';
import { ROTULOS_PAPEL } from '@/lib/roles';
import { SupportQueueIcon, CalendarIcon, BuildingIcon } from './Icons';

// Mola única do cabeçalho: tudo se move junto, como uma peça só
const MOLA = { type: 'spring', bounce: 0.2, duration: 0.55 };
const ROTULO = { type: 'spring', bounce: 0, duration: 0.38 };

const IconeDashboard = () => (
  <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect width="7" height="9" x="3" y="3" rx="1.5" />
    <rect width="7" height="5" x="14" y="3" rx="1.5" />
    <rect width="7" height="9" x="14" y="12" rx="1.5" />
    <rect width="7" height="5" x="3" y="16" rx="1.5" />
  </svg>
);
const IconeFeedbacks = () => (
  <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconeRetroativo = () => (
  <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/** Dispara uma ação da Fila de Demandas (o componente da fila escuta e abre o que for preciso). */
const acaoFila = (acao) => window.dispatchEvent(new CustomEvent('rm_fila_acao', { detail: acao }));

// Linha central do cabeçalho (top 12px + metade dos 54px de altura)
const CENTRO_CABECALHO = 39;
const VOO = { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };

const centro = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/**
 * As ações da fila no cabeçalho. Ao aparecer, cada botão começa exatamente onde está o botão
 * equivalente da página e desliza até aqui (os da página ficam ocultos enquanto isso).
 */
// forwardRef: o AnimatePresence em modo popLayout precisa medir este elemento ao sair
const IlhaAcoesFila = React.forwardRef(function IlhaAcoesFila({ classeIlha, comRotulo }, refExterno) {
  const ref = useRef(null);
  const juntarRefs = (el) => {
    ref.current = el;
    if (typeof refExterno === 'function') refExterno(el);
    else if (refExterno) refExterno.current = el;
  };
  // O React (modo estrito, em desenvolvimento) roda o efeito duas vezes; a segunda anularia o voo
  const voou = useRef(false);
  useLayoutEffect(() => {
    if (voou.current) return;
    voou.current = true;
    ref.current?.querySelectorAll('[data-acao]').forEach((el) => {
      const origem = document.querySelector(`#fila-acoes-topo [data-acao-fila="${el.dataset.acao}"]`);
      if (!origem || !el.animate) return;
      const de = centro(origem);
      const para = centro(el);
      el.animate([{ transform: `translate(${de.x - para.x}px, ${de.y - para.y}px)` }, { transform: 'translate(0, 0)' }], VOO);
    });
  }, []);

  const botao =
    'h-10 px-3 rounded-full flex items-center gap-2 text-[13px] font-medium text-[#1d1d1f] dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.1] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7c0f]/40';
  return (
    <motion.div
      ref={juntarRefs}
      key="acoes-fila"
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
      transition={{ opacity: { duration: 0.2 }, layout: MOLA }}
      style={{ borderRadius: 999 }}
      className={`${classeIlha} h-[54px] flex items-center gap-1 px-1.5`}
    >
      <button type="button" data-acao="empresas" onClick={() => acaoFila('empresas')} title="Ver empresas" className={botao}>
        <BuildingIcon className="w-[15px] h-[15px]" />
        {comRotulo && 'Empresas'}
      </button>
      <button type="button" data-acao="retroativo" onClick={() => acaoFila('retroativo')} title="Registrar suporte retroativo" className={botao}>
        <IconeRetroativo />
        {comRotulo && 'Retroativo'}
      </button>
      <button
        type="button"
        data-acao="nova"
        onClick={() => acaoFila('nova')}
        className="h-10 pl-3 pr-4 rounded-full flex items-center gap-1.5 text-[13px] font-semibold bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 hover:opacity-90 cursor-pointer transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7c0f]/40"
      >
        <span className="text-[17px] leading-none -mt-px">+</span>
        Nova demanda
      </button>
    </motion.div>
  );
});

/** Avisa a fila se os botões do topo estão no cabeçalho; ao voltar, envia de onde cada um parte. */
function anunciarEncaixe(encaixado, origens = null) {
  window.__rmFilaAcoesNoCabecalho = encaixado;
  window.dispatchEvent(new CustomEvent('rm_fila_acoes_cabecalho', { detail: { encaixado, origens } }));
}

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
  acoesFila = false,
}) {
  const [perfilAberto, setPerfilAberto] = useState(false);
  // Cabeçalho recolhido (computador): a ilha encolhe para símbolo, sino e conta, e a tela ganha a altura toda
  const [recolhido, setRecolhido] = useState(false);
  // Recolhido, a ilha sobe e some (como a barra de menus do Mac em tela cheia); o mouse no topo traz de volta
  const [revelado, setRevelado] = useState(false);
  const esconder = useRef(null);
  const revelar = () => {
    clearTimeout(esconder.current);
    setRevelado(true);
  };
  const agendarEsconder = () => {
    clearTimeout(esconder.current);
    esconder.current = setTimeout(() => setRevelado(false), 650);
  };
  const preferenciaLida = useRef(false);
  useEffect(() => {
    try {
      if (localStorage.getItem('rm_cabecalho_recolhido') === 'sim') setRecolhido(true);
    } catch {}
    preferenciaLida.current = true;
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--rm-cabecalho', recolhido ? '0px' : '78px');
    if (!preferenciaLida.current) return;
    try {
      localStorage.setItem('rm_cabecalho_recolhido', recolhido ? 'sim' : 'nao');
    } catch {}
  }, [recolhido]);
  const [totalFila, setTotalFila] = useState(0);
  const [totalReunioesHoje, setTotalReunioesHoje] = useState(0);
  // Conversas do Chat com mensagens novas e notificações não lidas (aparecem também com o cabeçalho recolhido)
  const [totalChat, setTotalChat] = useState(0);
  const [notificacoesNovas, setNotificacoesNovas] = useState(0);
  const [userRole, setUserRole] = useState('administrador');
  const [encaixado, setEncaixado] = useState(false);
  const encaixadoRef = useRef(false);
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

  // Chat: a tela do Chat avisa na hora; fora dela, consulta a cada 30 s
  useEffect(() => {
    if (!getAbasPermitidas(userEmail).includes('chat')) return undefined;
    const aoContar = (e) => setTotalChat(Number(e.detail) || 0);
    window.addEventListener('rm_chat_contagem', aoContar);
    const consultar = () =>
      document.visibilityState === 'visible' &&
      fetchConversas('abertas')
        .then((r) => setTotalChat(contarConversasNovas(r.conversas, r.config)))
        .catch(() => {});
    consultar();
    const t = setInterval(consultar, 30000);
    return () => {
      clearInterval(t);
      window.removeEventListener('rm_chat_contagem', aoContar);
    };
  }, [userEmail]);

  useEffect(() => {
    checarEstado();
    const eventos = ['suporte_updated', 'user_role_updated', 'equipe_updated', 'agenda_eventos_updated', 'perfis_updated'];
    eventos.forEach((ev) => window.addEventListener(ev, checarEstado));
    return () => eventos.forEach((ev) => window.removeEventListener(ev, checarEstado));
  }, []);

  // Rolagem: na fila, quando os botões do topo da página chegam à linha do cabeçalho, eles passam
  // para a ilha ao lado (e voltam ao descer). Só troca estado ao cruzar a linha, então rolar não re-renderiza.
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const topo = acoesFila ? document.getElementById('fila-acoes-topo') : null;
      let novo = false;
      if (topo) {
        const { y } = centro(topo);
        novo = encaixadoRef.current ? y <= CENTRO_CABECALHO + 6 : y <= CENTRO_CABECALHO;
      }
      if (novo === encaixadoRef.current) return;
      // Ao desencaixar, guarda onde cada botão estava no cabeçalho para a volta partir dali
      let origens = null;
      if (!novo) {
        origens = {};
        document.querySelectorAll('header [data-acao]').forEach((el) => {
          origens[el.dataset.acao] = centro(el);
        });
      }
      encaixadoRef.current = novo;
      setEncaixado(novo);
      anunciarEncaixe(novo, topo ? origens : null);
    };
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRolar);
    return () => {
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [acoesFila, activeTab]);

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
    {
      id: 'chat',
      label: 'Chat',
      curto: 'Chat',
      badge: totalChat || null,
      icon: (
        <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 9h10M7 13h6" />
          <path d="M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 3.5V6a1 1 0 0 1 1-1z" />
        </svg>
      ),
    },
    { id: 'fila', label: 'Fila de Demandas', curto: 'Fila', badge: totalFila || null, icon: <SupportQueueIcon className="w-[17px] h-[17px]" /> },
    { id: 'agenda', label: 'Agenda', curto: 'Agenda', badge: totalReunioesHoje || null, icon: <CalendarIcon className="w-[17px] h-[17px]" /> },
    { id: 'comercial', label: 'Comercial', curto: 'Comercial', icon: <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-6 4 3 6-9M14 5h6v6" /></svg> },
    { id: 'dashboard', label: 'Dashboard', curto: 'Métricas', icon: <IconeDashboard /> },
    { id: 'feedbacks', label: 'Feedbacks', curto: 'Feedbacks', icon: <IconeFeedbacks /> },
    {
      id: 'conexoes',
      label: 'Canais',
      curto: 'Canais',
      icon: (
        <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 8 19.4L3 21z" />
          <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2L9 9.5z" />
        </svg>
      ),
    },
    {
      id: 'plataforma',
      label: getGestaoAtual()?.nivel === 'revenda' ? 'Revenda' : 'Plataforma',
      curto: getGestaoAtual()?.nivel === 'revenda' ? 'Revenda' : 'Plataforma',
      icon: (
        <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M17.5 14v7M14 17.5h7" />
        </svg>
      ),
    },
  ];
  const permitidas = getAbasPermitidas(userEmail);
  const permAtual = getPermissoesAtuais(userEmail);
  // Acesso real (sem a simulação de "Ver o sistema como"), para decidir quem pode simular
  const permReal = permissoesEfetivas({ email: userEmail, equipe: getEquipeUsuarios(), perfis: getPerfisAcesso() });
  const rotuloAcesso = permAtual.perfil?.nome || (permAtual.administrador ? 'Administrador' : ROTULOS_PAPEL[userRole] || 'Suporte Técnico');
  const abas = todasAsAbas.filter((t) => permitidas.includes(t.id));
  const podeConfigurar = permitidas.includes('configuracoes');

  const irPara = (tabId) => {
    setPerfilAberto(false);
    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };


  const mostrarAcoes = acoesFila && encaixado && !recolhido;
  const ilhaEscondida = recolhido && !revelado && !perfilAberto;
  // Com as ações encaixadas, as abas inativas viram só ícone para abrir espaço
  const rotulosCompletos = largura >= 1024 && !mostrarAcoes;
  const acoesComRotulo = largura >= 1280;

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
      mostrarDemo={showMockData}
      onDemo={setShowMockData}
      onSair={() => {
        setPerfilAberto(false);
        onLogout();
      }}
    />
  );

  const ilha =
    'pointer-events-auto bg-white/80 dark:bg-[#232326]/80 backdrop-blur-2xl backdrop-saturate-150 border border-black/[0.07] dark:border-white/[0.11] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.75)]';

  return (
    <>
      {/* ============================================================================== */}
      {/* COMPUTADOR: ilha centralizada; na fila, recebe as ações ao lado ao rolar       */}
      {/* ============================================================================== */}
      <header className="hidden md:flex fixed top-3 inset-x-0 z-40 justify-center px-4 lg:px-6 pointer-events-none">
        {/* Recolhido: faixa sensível no topo e puxador que trazem a ilha de volta */}
        {recolhido && (
          <>
            <div className="pointer-events-auto fixed top-0 left-1/2 -translate-x-1/2 w-[320px] h-[10px]" onMouseEnter={revelar} aria-hidden="true" />
            {(() => {
              // Avisos que não podem sumir com o cabeçalho recolhido
              const avisos = [
                ...abas.filter((t) => t.badge).map((t) => ({ id: t.id, icone: t.icon, valor: t.badge, rotulo: t.label, cor: t.id === 'fila' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-zinc-300' })),
                ...(notificacoesNovas ? [{ id: 'notificacoes', valor: notificacoesNovas, rotulo: 'Notificações', cor: 'text-rose-600 dark:text-rose-400', sino: true }] : []),
              ];
              return (
                <motion.button
                  type="button"
                  onClick={() => {
                    // Clicar no puxador já expande o cabeçalho de vez
                    setRevelado(false);
                    setRecolhido(false);
                  }}
                  onMouseEnter={revelar}
                  aria-label={`Expandir o cabeçalho${avisos.length ? ` (${avisos.map((a) => `${a.rotulo}: ${a.valor}`).join(', ')})` : ''}`}
                  title="Clique para expandir o cabeçalho"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: ilhaEscondida ? 1 : 0, y: ilhaEscondida ? 0 : -8 }}
                  transition={MOLA}
                  className={`pointer-events-auto fixed top-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center cursor-pointer ${
                    avisos.length ? 'h-7 px-2.5 gap-2.5 rounded-full bg-white/90 dark:bg-[#232326]/90 backdrop-blur-xl ring-1 ring-black/[0.07] dark:ring-white/[0.1] shadow-[0_6px_20px_-8px_rgba(0,0,0,0.3)]' : 'w-16 h-4'
                  }`}
                >
                  {avisos.length ? (
                    avisos.map((a) => (
                      <span key={a.id} className={`flex items-center gap-1 text-[11.5px] font-semibold tabular-nums ${a.cor}`}>
                        {a.sino ? (
                          <svg className="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                          </svg>
                        ) : (
                          <span className="[&_svg]:w-[13px] [&_svg]:h-[13px] flex">{a.icone}</span>
                        )}
                        {a.valor > 99 ? '99+' : a.valor}
                      </span>
                    ))
                  ) : (
                    <span className="w-10 h-[5px] rounded-full bg-black/20 dark:bg-white/25" />
                  )}
                </motion.button>
              );
            })()}
          </>
        )}
        <LayoutGroup>
          <motion.div
            animate={{ y: ilhaEscondida ? -80 : 0 }}
            transition={MOLA}
            onMouseEnter={recolhido ? revelar : undefined}
            onMouseLeave={recolhido ? agendarEsconder : undefined}
            onFocusCapture={recolhido ? revelar : undefined}
            className="flex items-center justify-center gap-2 w-full max-w-[1720px]"
          >
            <motion.div
              layout
              transition={MOLA}
              style={{ borderRadius: 999 }}
              className={`${ilha} ${recolhido ? 'h-[48px]' : 'h-[54px]'} flex items-center gap-1 pl-1.5 pr-1.5`}
            >
              {/* Marca: só o símbolo */}
              <motion.button
                layout="position"
                transition={MOLA}
                type="button"
                onClick={() => irPara('fila')}
                aria-label="RM Controle — ir para a Fila de Demandas"
                className="h-10 w-10 flex items-center justify-center rounded-full cursor-pointer flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7c0f]/40"
              >
                <BrandMark size={recolhido ? 34 : 36} />
              </motion.button>

              {/* Abas (recolhido: só os ícones) */}
              <motion.nav layout="position" transition={MOLA} aria-label="Seções" className="flex items-center gap-0.5 ml-1">
                {abas.map((tab) => {
                  const ativa = activeTab === tab.id;
                  const comRotulo = !recolhido && (ativa || rotulosCompletos);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => irPara(tab.id)}
                      aria-current={ativa ? 'page' : undefined}
                      title={tab.label}
                      className={`relative h-10 rounded-full flex items-center text-[13px] font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7c0f]/40 ${comRotulo ? 'px-3.5' : 'px-2.5'} ${
                        ativa ? 'text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'
                      }`}
                    >
                      {ativa && (
                        <motion.span
                          layoutId="aba-ativa"
                          transition={MOLA}
                          className="absolute inset-0 rounded-full bg-black/[0.06] dark:bg-white/[0.12]"
                        />
                      )}
                      <span className={`relative ${ativa ? 'text-[#4d7c0f] dark:text-[#a3e635]' : ''}`}>{tab.icon}</span>
                      <AnimatePresence initial={false}>
                        {comRotulo && (
                          <motion.span
                            key="rotulo"
                            initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                            animate={{ opacity: 1, width: 'auto', marginLeft: 8 }}
                            exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                            transition={ROTULO}
                            className="relative overflow-hidden whitespace-nowrap"
                          >
                            {tab.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {tab.badge && (
                        <span
                          className={`relative ml-1.5 min-w-[18px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums flex items-center justify-center ${
                            tab.id === 'fila' ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300' : 'bg-black/[0.06] dark:bg-white/[0.12] text-slate-600 dark:text-zinc-300'
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </motion.nav>

              {/* Notificações, recolher/expandir e conta */}
              <motion.div layout="position" transition={MOLA} className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                <CentralNotificacoes embutido onAbrirAba={(aba) => (aba === 'fila' || permitidas.includes(aba)) && irPara(aba)} />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setPerfilAberto(false);
                    setRevelado(false);
                    setRecolhido((v) => !v);
                  }}
                  aria-label={recolhido ? 'Expandir o cabeçalho' : 'Recolher o cabeçalho'}
                  aria-expanded={!recolhido}
                  title={recolhido ? 'Expandir o cabeçalho' : 'Recolher o cabeçalho (tela cheia)'}
                  className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7c0f]/40"
                >
                  <motion.svg animate={{ rotate: recolhido ? 180 : 0 }} transition={MOLA} className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 14l5-5 5 5" />
                    <path d="M5 19h14" />
                  </motion.svg>
                </motion.button>

                <div className="relative" ref={perfilRef}>
                  <button
                    type="button"
                    onClick={() => setPerfilAberto((v) => !v)}
                    aria-expanded={perfilAberto}
                    aria-label="Sua conta"
                    className={`h-10 flex items-center gap-2 rounded-full cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7c0f]/40 ${
                      perfilAberto ? 'bg-black/[0.06] dark:bg-white/[0.12]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.08]'
                    } px-1`}
                  >
                    <span className="w-8 h-8 rounded-full bg-[#1d1d1f] dark:bg-[#f5f5f7] text-white dark:text-[#1d1d1f] flex items-center justify-center text-[12px] font-semibold">
                      {iniciais}
                    </span>
                  </button>
                  <AnimatePresence>{perfilAberto && largura >= 768 && painel('popover')}</AnimatePresence>
                </div>
              </motion.div>
            </motion.div>

            {/* Ações da fila que "encaixam" ao lado da ilha quando as do topo saem de vista */}
            <AnimatePresence mode="popLayout">
              {mostrarAcoes && <IlhaAcoesFila key="acoes-fila" classeIlha={ilha} comRotulo={acoesComRotulo} />}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      </header>

      {/* Espaço reservado para o cabeçalho fixo */}
      <div className="hidden md:block transition-[height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ height: 'var(--rm-cabecalho, 78px)' }} aria-hidden="true" />

      {/* ============================================================================== */}
      {/* CELULAR: barra superior simples + dock inferior                                 */}
      {/* ============================================================================== */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-white/85 dark:bg-[#1c1c1f]/85 backdrop-blur-2xl border-b border-black/[0.06] dark:border-white/[0.1] px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark size={30} />
          <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">RM Controle</span>
        </div>
        <button
          type="button"
          onClick={() => setPerfilAberto(true)}
          aria-label="Sua conta"
          className="w-9 h-9 rounded-full bg-[#1d1d1f] dark:bg-[#f5f5f7] text-white dark:text-[#1d1d1f] flex items-center justify-center text-[12px] font-semibold cursor-pointer"
        >
          {iniciais}
        </button>
      </header>
      <div className="md:hidden h-14" aria-hidden="true" />

      {/* Folha da conta no celular */}
      <AnimatePresence>
        {perfilAberto && largura < 768 && (
          <>
            <motion.div
              key="veu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[59] bg-black/40"
              onClick={() => setPerfilAberto(false)}
            />
            {painel('sheet')}
          </>
        )}
      </AnimatePresence>

      <nav className="md:hidden fixed bottom-2.5 inset-x-2.5 z-50 bg-white/85 dark:bg-[#232326]/85 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.11] shadow-[0_12px_36px_rgba(0,0,0,0.16)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.7)] rounded-[26px] p-1.5 flex items-center justify-between">
        {abas.map((tab) => {
          const ativa = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => irPara(tab.id)}
              aria-current={ativa ? 'page' : undefined}
              className={`relative flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-[20px] cursor-pointer ${
                ativa ? 'text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              {ativa && <motion.span layoutId="dock-ativo" transition={MOLA} className="absolute inset-0 rounded-[20px] bg-black/[0.06] dark:bg-white/[0.12]" />}
              <span className={`relative ${ativa ? 'text-[#4d7c0f] dark:text-[#a3e635]' : ''}`}>
                {tab.icon}
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </span>
              <span className="relative text-[10px] font-medium">{tab.curto}</span>
            </motion.button>
          );
        })}
      </nav>

    </>
  );
}
