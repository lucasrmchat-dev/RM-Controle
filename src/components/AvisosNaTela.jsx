'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EVENTO_NOVA, marcarLida } from '@/lib/notificacoes';
import { CORES_FLASH, EVENTO_AVISOS_CONFIG, deveMostrar, lerAvisos } from '@/lib/avisosTela';
import { EVENTO_FOCO, efeitosDoFoco, focoSilenciaAvisos } from '@/lib/modoFoco';

// ------------------------------------------------------------------------------
// Avisos na tela (Configurações › Aparência): a notificação que acabou de chegar aparece num dos estilos
// escolhidos, some sozinha (ou fica até fechar) e, se ligado, a tela pisca em volta do conteúdo.
// Duas instâncias: local="cabecalho" (ilha e sino, presa à pílula) e local="tela" (canto, faixa, lateral e flash).
// ------------------------------------------------------------------------------
const MOLA = { type: 'spring', bounce: 0.22, duration: 0.5 };
const CARENCIA_MS = 5000; // ao abrir o sistema, o que já estava pendente não pula na tela (fica no sino)
const inicio = typeof window !== 'undefined' ? Date.now() : 0;

const COR_TIPO = {
  chat: 'bg-[#00a884]',
  demanda: 'bg-[#1d1d1f] dark:bg-white',
  sla: 'bg-rose-500',
  prazo: 'bg-amber-500',
  reuniao: 'bg-sky-500',
  feedback: 'bg-rm-acento',
  sistema: 'bg-rm-acento',
};
const ROTULO_TIPO = { chat: 'WhatsApp', demanda: 'Fila', sla: 'Fila · tempo', prazo: 'Fila · prazo', reuniao: 'Agenda', feedback: 'Feedback', sistema: 'Sistema' };

/** Fila de avisos visíveis, respeitando duração e máximo. */
const APOS_SAIR_MS = 4000;

function useAvisos(ativo) {
  const [config, setConfig] = useState(() => lerAvisos());
  const [visiveis, setVisiveis] = useState([]);
  const [extras, setExtras] = useState(0);
  const timers = useRef(new Map());
  // Mouse em cima de um aviso: o tempo para; ao sair, ainda ficam APOS_SAIR_MS para clicar
  const pausado = useRef(false);
  const visiveisRef = useRef([]);
  visiveisRef.current = visiveis;

  const fechar = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setVisiveis((l) => l.filter((n) => n.id !== id));
    // Fechou/abriu o aviso que estava sob o mouse: o cartão some sem "mouse saiu"; os outros voltam a contar
    if (pausado.current) {
      pausado.current = false;
      if (lerAvisos().duracao)
        visiveisRef.current
          .filter((n) => n.id !== id)
          .forEach((n) => {
            clearTimeout(timers.current.get(n.id));
            timers.current.set(n.id, setTimeout(() => fechar(n.id), APOS_SAIR_MS));
          });
    }
  }, []);

  useEffect(() => {
    const aoConfig = (e) => setConfig(e.detail || lerAvisos());
    window.addEventListener(EVENTO_AVISOS_CONFIG, aoConfig);
    return () => window.removeEventListener(EVENTO_AVISOS_CONFIG, aoConfig);
  }, []);

  useEffect(() => {
    if (!ativo) return undefined;
    const aoNova = (e) => {
      const n = e.detail;
      const atual = lerAvisos();
      if (!n?.teste && (Date.now() - inicio < CARENCIA_MS || focoSilenciaAvisos())) return;
      if (!deveMostrar(n, atual)) return;
      setVisiveis((l) => {
        const sem = l.filter((x) => x.id !== n.id && !(n.grupo && x.grupo === n.grupo));
        const nova = [n, ...sem];
        if (nova.length > atual.maximo) {
          setExtras((q) => q + (nova.length - atual.maximo));
          nova.slice(atual.maximo).forEach((x) => clearTimeout(timers.current.get(x.id)));
        }
        return nova.slice(0, atual.maximo);
      });
      if (atual.duracao && !pausado.current) timers.current.set(n.id, setTimeout(() => fechar(n.id), atual.duracao * 1000));
    };
    window.addEventListener(EVENTO_NOVA, aoNova);
    return () => window.removeEventListener(EVENTO_NOVA, aoNova);
  }, [ativo, fechar]);

  useEffect(() => {
    if (!visiveis.length) setExtras(0);
  }, [visiveis.length]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  const pausar = useCallback(() => {
    pausado.current = true;
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
  }, []);
  const retomar = useCallback(() => {
    pausado.current = false;
    if (!lerAvisos().duracao) return;
    visiveisRef.current.forEach((n) => {
      clearTimeout(timers.current.get(n.id));
      timers.current.set(n.id, setTimeout(() => fechar(n.id), APOS_SAIR_MS));
    });
  }, [fechar]);
  return { config, visiveis, extras, fechar, pausar, retomar };
}

function Cartao({ n, onAbrir, onFechar, onPausar, onRetomar, compacto = false }) {
  return (
    <div className="group relative flex items-start gap-2.5 text-left" onMouseEnter={onPausar} onMouseLeave={onRetomar}>
      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${COR_TIPO[n.tipo] || COR_TIPO.sistema}`} aria-hidden="true" />
      <button type="button" onClick={() => onAbrir(n)} className="min-w-0 flex-1 text-left cursor-pointer">
        {!compacto && <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">{ROTULO_TIPO[n.tipo] || 'Aviso'}</span>}
        <span className="block text-[13px] font-semibold leading-snug text-[#1d1d1f] dark:text-white truncate">{n.titulo}</span>
        {n.detalhe && <span className={`block text-[12px] leading-snug text-slate-500 dark:text-zinc-400 ${compacto ? 'truncate' : 'line-clamp-2'}`}>{n.detalhe}</span>}
      </button>
      <button type="button" onClick={() => onFechar(n.id)} aria-label="Fechar aviso" className="w-6 h-6 -mr-1 rounded-full flex items-center justify-center text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.1] cursor-pointer flex-shrink-0">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

const Mais = ({ extras, onSino }) =>
  extras > 0 ? (
    <button type="button" onClick={onSino} className="w-full text-center text-[11.5px] font-medium text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white cursor-pointer py-1">
      +{extras} no sino
    </button>
  ) : null;

const CAIXA = 'bg-white/95 dark:bg-rm-elevado-escuro/95 backdrop-blur-xl ring-1 ring-black/[0.08] dark:ring-white/[0.12] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.35)]';

/** Brilho em volta da tela (não cobre o centro, onde a pessoa trabalha). */
function FlashTela() {
  const [pulso, setPulso] = useState(0);
  const [cor, setCor] = useState(CORES_FLASH[0].valor);
  const repetir = useRef(null);
  useEffect(() => {
    const parar = () => {
      clearInterval(repetir.current);
      repetir.current = null;
    };
    const aoNova = (e) => {
      const n = e.detail;
      const config = lerAvisos();
      if (!config.flash || (!n?.teste && (Date.now() - inicio < CARENCIA_MS || focoSilenciaAvisos())) || !deveMostrar({ ...n }, { ...config, estilo: 'ilha' })) return;
      setCor((CORES_FLASH.find((c) => c.id === config.flashCor) || CORES_FLASH[0]).valor);
      setPulso((p) => p + 1);
      if (config.flashRepeticao === 'intermitente' && !repetir.current) {
        // Repete até a pessoa mexer no computador
        repetir.current = setInterval(() => setPulso((p) => p + 1), config.flashIntervalo * 1000);
        const mexeu = () => {
          parar();
          window.removeEventListener('pointerdown', mexeu, true);
          window.removeEventListener('keydown', mexeu, true);
        };
        setTimeout(() => {
          window.addEventListener('pointerdown', mexeu, true);
          window.addEventListener('keydown', mexeu, true);
        }, 800);
      }
    };
    window.addEventListener(EVENTO_NOVA, aoNova);
    return () => {
      window.removeEventListener(EVENTO_NOVA, aoNova);
      parar();
    };
  }, []);
  const vezes = lerAvisos().flashRepeticao === 'tres' ? 3 : 1;
  return (
    <AnimatePresence>
      {pulso > 0 && (
        <motion.div
          key={pulso}
          aria-hidden="true"
          className="fixed inset-0 z-[48] pointer-events-none"
          style={{ boxShadow: `inset 0 0 90px 28px ${cor}` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: Array.from({ length: vezes }).flatMap(() => [0.85, 0]) }}
          transition={{ duration: 0.9 * vezes, ease: 'easeInOut' }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * local="cabecalho": estilos "ilha" e "sino", dentro do posicionamento da pílula (larguraIlha em px).
 * local="tela": estilos "canto", "faixa" e "lateral", e o flash.
 */
export default function AvisosNaTela({ local, onAbrirAba, larguraIlha = 0 }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const medir = () => setMobile(window.innerWidth < 640);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  // Modo foco com o cabeçalho recolhido: ilha e sino aparecem no canto
  const [recolhido, setRecolhido] = useState(false);
  useEffect(() => {
    setRecolhido(efeitosDoFoco().recolher);
    const aoFoco = (e) => setRecolhido(Boolean(e.detail?.recolher));
    window.addEventListener(EVENTO_FOCO, aoFoco);
    return () => window.removeEventListener(EVENTO_FOCO, aoFoco);
  }, []);
  const config0 = lerAvisos();
  // No celular, ilha e sino viram canto (o cabeçalho é outro)
  const estiloEfetivo = (estilo) => ((mobile || recolhido) && (estilo === 'ilha' || estilo === 'sino') ? 'canto' : estilo);
  const ativo = local === 'cabecalho' ? !mobile && !recolhido && ['ilha', 'sino'].includes(config0.estilo) : true;
  const { config, visiveis, extras, fechar, pausar, retomar } = useAvisos(ativo);
  const estilo = estiloEfetivo(config.estilo);

  const abrir = (n) => {
    marcarLida(n.id);
    fechar(n.id);
    if (n.aba) onAbrirAba?.(n.aba);
    if (n.alvo?.conversaId) {
      window.__rmChatAbrirPendente = n.alvo.conversaId;
      window.dispatchEvent(new CustomEvent('rm_chat_abrir', { detail: { conversaId: n.alvo.conversaId } }));
    }
  };
  const abrirSino = () => document.querySelector('[aria-label^="Notificações"]')?.click();

  if (local === 'cabecalho') {
    if (mobile || recolhido) return null;
    if (estilo === 'ilha') {
      // A pílula "cresce" para baixo: um fundo do tamanho dela que se estica e mostra os avisos
      return (
        <AnimatePresence>
          {visiveis.length > 0 && (
            <motion.div
              key="ilha"
              initial={{ opacity: 0, scaleY: 0.6 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0.6, transition: { duration: 0.18 } }}
              transition={MOLA}
              style={{ width: larguraIlha || 'var(--rm-ilha-largura)', transformOrigin: 'top center' }}
              className={`absolute left-0 top-0 -z-10 pt-[54px] px-3 pb-2.5 rounded-[26px] ${CAIXA} pointer-events-auto`}
              role="status"
              aria-live="polite"
            >
              <div className="space-y-2.5">
                {visiveis.map((n) => (
                  <motion.div key={n.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Cartao n={n} onAbrir={abrir} onFechar={fechar} onPausar={pausar} onRetomar={retomar} compacto />
                  </motion.div>
                ))}
                <Mais extras={extras} onSino={abrirSino} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      );
    }
    if (estilo === 'sino') {
      return (
        <div className="absolute right-0 top-[calc(100%+10px)] w-[320px] space-y-2 pointer-events-auto" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {visiveis.map((n) => (
              <motion.div key={n.id} layout initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 20 }} transition={MOLA} className={`rounded-2xl p-3 ${CAIXA}`}>
                <Cartao n={n} onAbrir={abrir} onFechar={fechar} onPausar={pausar} onRetomar={retomar} />
              </motion.div>
            ))}
          </AnimatePresence>
          {extras > 0 && visiveis.length > 0 && (
            <div className={`rounded-full ${CAIXA}`}>
              <Mais extras={extras} onSino={abrirSino} />
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  // local === 'tela'
  const flash = <FlashTela />;
  if (estilo === 'canto') {
    return (
      <>
        {flash}
        <div className="fixed z-[47] right-3 sm:right-6 bottom-[96px] sm:bottom-6 w-[min(340px,calc(100vw-24px))] space-y-2" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {visiveis.map((n) => (
              <motion.div key={n.id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 30 }} transition={MOLA} className={`rounded-2xl p-3.5 ${CAIXA}`}>
                <Cartao n={n} onAbrir={abrir} onFechar={fechar} onPausar={pausar} onRetomar={retomar} />
              </motion.div>
            ))}
          </AnimatePresence>
          {extras > 0 && visiveis.length > 0 && (
            <div className={`rounded-full ${CAIXA}`}>
              <Mais extras={extras} onSino={abrirSino} />
            </div>
          )}
        </div>
      </>
    );
  }
  if (estilo === 'faixa') {
    const n = visiveis[0];
    return (
      <>
        {flash}
        <div className="fixed z-[47] left-1/2 -translate-x-1/2 bottom-[96px] sm:bottom-5 w-[min(560px,calc(100vw-24px))]" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            {n && (
              <motion.div key={n.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={MOLA} className={`rounded-full pl-4 pr-2 py-2 flex items-center gap-2 ${CAIXA}`}>
                <div className="min-w-0 flex-1">
                  <Cartao n={n} onAbrir={abrir} onFechar={fechar} onPausar={pausar} onRetomar={retomar} compacto />
                </div>
                {visiveis.length + extras > 1 && (
                  <button type="button" onClick={abrirSino} className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400 whitespace-nowrap px-2 cursor-pointer">
                    +{visiveis.length - 1 + extras}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </>
    );
  }
  if (estilo === 'lateral') {
    return (
      <>
        {flash}
        <div className="fixed z-[47] right-0 top-1/2 -translate-y-1/2 w-[min(290px,calc(100vw-24px))] space-y-2" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {visiveis.map((n) => (
              <motion.div key={n.id} layout initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }} transition={MOLA} className={`rounded-l-2xl p-3 border-l-4 ${CAIXA}`} style={{ borderLeftColor: 'rgb(var(--rm-acento-medio))' }}>
                <Cartao n={n} onAbrir={abrir} onFechar={fechar} onPausar={pausar} onRetomar={retomar} compacto />
              </motion.div>
            ))}
          </AnimatePresence>
          {extras > 0 && visiveis.length > 0 && (
            <div className={`rounded-l-full ${CAIXA}`}>
              <Mais extras={extras} onSino={abrirSino} />
            </div>
          )}
        </div>
      </>
    );
  }
  return flash;
}
