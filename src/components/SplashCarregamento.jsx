'use client';

import React, { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Abertura do sistema: o "R" do símbolo é escrito traço a traço e a perna fecha como um
// sinal de concluído. A tela só sai depois que o R termina e o carregamento acabou.
const TRACO = [0.65, 0, 0.35, 1];
const SAIDA = [0.32, 0.72, 0, 1];
const NOME = 'RM Controle';

// Linha do tempo (segundos)
const T = { circulo: 0, haste: 0.32, bojo: 0.62, check: 1.02, fim: 1.42 };
const DURACAO_INTRO = 1900;

export default function SplashCarregamento({ pronto = false, onFim }) {
  const reduzir = useReducedMotion();
  const ids = useId().replace(/:/g, '');
  const [introFeita, setIntroFeita] = useState(false);
  const saindo = pronto && introFeita;

  useEffect(() => {
    const t = setTimeout(() => setIntroFeita(true), reduzir ? 0 : DURACAO_INTRO);
    return () => clearTimeout(t);
  }, [reduzir]);

  const desenhar = (inicio, duracao, ease = TRACO) =>
    reduzir
      ? { initial: { pathLength: 1 }, animate: { pathLength: 1 } }
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { pathLength: { delay: inicio, duration: duracao, ease }, opacity: { delay: inicio, duration: 0.01 } },
        };

  return (
    <motion.div
      role="status"
      aria-label="Carregando RM Controle"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f5f5f7] dark:bg-[#141416] overflow-hidden"
      initial={false}
      animate={saindo ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 0.5, ease: SAIDA, delay: saindo ? 0.12 : 0 }}
      onAnimationComplete={() => saindo && onFim?.()}
    >
      <motion.div
        className="flex flex-col items-center"
        initial={false}
        animate={saindo ? { scale: 0.92, opacity: 0, filter: 'blur(8px)' } : { scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.45, ease: SAIDA }}
      >
        <div className="relative w-[92px] h-[92px]">
          {/* Brilho verde que acende quando o R se completa */}
          <motion.div
            aria-hidden="true"
            className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(163,230,53,0.35)_0%,rgba(163,230,53,0)_65%)] dark:bg-[radial-gradient(circle,rgba(163,230,53,0.28)_0%,rgba(163,230,53,0)_65%)]"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={reduzir ? { opacity: 0.6, scale: 1 } : { opacity: [0, 1, 0.55], scale: [0.6, 1.1, 1] }}
            transition={{ delay: T.fim - 0.05, duration: 1.1, ease: 'easeOut', times: [0, 0.35, 1] }}
          />
          {/* Onda de confirmação */}
          {!reduzir && (
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-[1.5px] border-[#a3e635]"
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
              transition={{ delay: T.fim, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          )}

          <motion.svg
            viewBox="0 0 40 40"
            width="92"
            height="92"
            fill="none"
            className="relative drop-shadow-[0_18px_30px_rgba(10,12,7,0.28)]"
            initial={reduzir ? false : { scale: 0.55, opacity: 0, filter: 'blur(10px)' }}
            animate={reduzir ? undefined : { scale: [0.55, 1, 1, 1.06, 1], opacity: 1, filter: 'blur(0px)' }}
            transition={{
              scale: { duration: T.fim + 0.5, times: [0, 0.3, 0.74, 0.84, 1], ease: ['easeOut', 'linear', 'easeOut', 'easeInOut'] },
              opacity: { duration: 0.35 },
              filter: { duration: 0.45 },
            }}
          >
            <defs>
              <linearGradient id={`fundo-${ids}`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1f2914" />
                <stop offset="1" stopColor="#0a0c07" />
              </linearGradient>
              <linearGradient id={`reflexo-${ids}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.16" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <clipPath id={`circulo-${ids}`}>
                <circle cx="20" cy="20" r="20" />
              </clipPath>
            </defs>

            <circle cx="20" cy="20" r="20" fill={`url(#fundo-${ids})`} />
            <circle cx="20" cy="20" r="19.5" stroke="#ffffff" strokeOpacity="0.09" />

            <g transform="translate(20 20) scale(0.9) translate(-20 -20) translate(-2.2 0.3)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2">
              {/* Trilho apagado: o R que vai ser escrito */}
              <g stroke="#ffffff" strokeOpacity="0.07">
                <path d="M13 11V28.5M13 11H19.5A5 5 0 0 1 19.5 21H13" />
                <path d="M17.5 21L22 27.8L31.5 12.5" />
              </g>
              <motion.path d="M13 11V28.5" stroke="#f4f2ec" {...desenhar(T.haste, 0.34)} />
              <motion.path d="M13 11H19.5A5 5 0 0 1 19.5 21H13" stroke="#f4f2ec" {...desenhar(T.bojo, 0.44)} />
              <motion.path d="M17.5 21L22 27.8L31.5 12.5" stroke="#a3e635" {...desenhar(T.check, 0.4, [0.5, 0, 0.2, 1])} />
            </g>

            {/* Reflexo que atravessa o símbolo no momento do check */}
            {!reduzir && (
              <g clipPath={`url(#circulo-${ids})`}>
                <motion.rect
                  y="-10"
                  width="16"
                  height="60"
                  fill={`url(#reflexo-${ids})`}
                  transform="rotate(20 20 20)"
                  initial={{ x: -30 }}
                  animate={{ x: 54 }}
                  transition={{ delay: T.fim + 0.02, duration: 0.85, ease: [0.4, 0, 0.2, 1] }}
                />
              </g>
            )}
          </motion.svg>
        </div>

        <div className="mt-7 h-6 flex items-center" aria-hidden="true">
          {NOME.split('').map((letra, i) => (
            <motion.span
              key={i}
              className="text-[17px] font-semibold tracking-[-0.02em] text-[#14160f] dark:text-[#f4f2ec]"
              initial={reduzir ? false : { opacity: 0, y: 8, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: T.fim + 0.08 + i * 0.025, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {letra === ' ' ? ' ' : letra}
            </motion.span>
          ))}
        </div>
        <motion.p
          className="mt-1.5 text-[12px] font-medium text-slate-500 dark:text-zinc-400"
          initial={reduzir ? false : { opacity: 0 }}
          animate={{ opacity: pronto ? 0 : [0.45, 0.9, 0.45] }}
          transition={pronto ? { duration: 0.2 } : { delay: T.fim + 0.45, duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          Preparando tudo para você
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
