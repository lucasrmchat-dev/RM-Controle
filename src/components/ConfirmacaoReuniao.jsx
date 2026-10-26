'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandMark } from './BrandMark';

/**
 * Tela do cliente (sem login) para confirmar, remarcar ou cancelar uma reunião.
 * Fala só com /api/publico/reuniao; não carrega nada do sistema interno.
 */
const MOLA = { type: 'spring', bounce: 0.2, duration: 0.5 };
const EASE = [0.16, 1, 0.3, 1];

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function partesData(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  if (!a) return null;
  const data = new Date(a, m - 1, d);
  return { semana: DIAS[data.getDay()], dia: d, mes: MESES[m - 1], ano: a };
}

// Arquivo .ics para o cliente salvar na agenda dele (gerado aqui, sem servidor)
function linkCalendario(r) {
  const [a, m, d] = r.data.split('-');
  const h = (t) => String(t || '').replace(':', '') + '00';
  const fim = r.hora_fim || r.hora_inicio;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RM Controle//Reunião//PT',
    'BEGIN:VEVENT',
    `DTSTART;TZID=America/Fortaleza:${a}${m}${d}T${h(r.hora_inicio)}`,
    `DTEND;TZID=America/Fortaleza:${a}${m}${d}T${h(fim)}`,
    `SUMMARY:${r.titulo.replace(/[,;\n]/g, ' ')}`,
    r.link_reuniao ? `URL:${r.link_reuniao}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

const RESULTADOS = {
  confirmada: { titulo: 'Presença confirmada', texto: 'Obrigado! Está tudo certo, esperamos você no horário marcado.', cor: 'bg-[#4d7c0f] dark:bg-[#84cc16]' },
  remarcar: { titulo: 'Pedido de novo horário enviado', texto: 'A equipe vai falar com você pelo WhatsApp para combinar um horário melhor.', cor: 'bg-violet-500' },
  cancelada: { titulo: 'Reunião cancelada', texto: 'Avisamos a equipe. Se quiser marcar outra vez, é só responder a mensagem no WhatsApp.', cor: 'bg-rose-500' },
};

function Icone({ tipo }) {
  if (tipo === 'confirmada')
    return (
      <motion.path d="M7 12.5l3.2 3.2L17 8.8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.2, ease: EASE }} />
    );
  if (tipo === 'cancelada') return <motion.path d="M8 8l8 8M16 8l-8 8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.2 }} />;
  return <motion.path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.2 }} />;
}

export default function ConfirmacaoReuniao({ token }) {
  const [estado, setEstado] = useState('carregando'); // carregando | pronto | invalido | erro
  const [reuniao, setReuniao] = useState(null);
  const [acaoAberta, setAcaoAberta] = useState(null); // remarcar | cancelar
  const [recado, setRecado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [mudando, setMudando] = useState(false);

  useEffect(() => {
    fetch(`/api/publico/reuniao?t=${encodeURIComponent(token)}`, { cache: 'no-store', credentials: 'omit' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          setReuniao(json.reuniao);
          setEstado('pronto');
        } else setEstado(res.status === 404 ? 'invalido' : 'erro');
      })
      .catch(() => setEstado('erro'));
  }, [token]);

  const responder = async (acao) => {
    setEnviando(true);
    setAviso('');
    try {
      const res = await fetch('/api/publico/reuniao', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, acao, mensagem: recado }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.mensagem || 'Não foi possível enviar. Tente de novo.');
      setReuniao(json.reuniao);
      setAcaoAberta(null);
      setRecado('');
      setMudando(false);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const data = reuniao ? partesData(reuniao.data) : null;
  const respondida = reuniao && RESULTADOS[reuniao.situacao] && !mudando;
  const bloqueada = reuniao && (reuniao.passou || reuniao.situacao === 'cancelada_pela_equipe');

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-5 py-10 bg-[radial-gradient(ellipse_at_top,rgba(163,230,53,0.12),transparent_60%)]">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="w-full max-w-[440px]">
        <div className="flex justify-center mb-8">
          <BrandMark size={44} />
        </div>

        <AnimatePresence mode="wait">
          {estado === 'carregando' && (
            <motion.div key="carregando" exit={{ opacity: 0 }} className="h-[420px] rounded-[32px] bg-white/70 dark:bg-white/[0.04] ring-1 ring-black/[0.05] dark:ring-white/[0.08] animate-pulse" />
          )}

          {(estado === 'invalido' || estado === 'erro') && (
            <motion.section key="invalido" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center rounded-[32px] bg-white dark:bg-[#1c1c1f] ring-1 ring-black/[0.06] dark:ring-white/[0.08] px-8 py-12 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]">
              <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{estado === 'invalido' ? 'Link expirado' : 'Algo deu errado'}</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-500 dark:text-zinc-400">
                {estado === 'invalido' ? 'Este link não está mais disponível. Se precisar de ajuda, responda a mensagem que você recebeu no WhatsApp.' : 'Não conseguimos carregar sua reunião agora. Tente de novo em instantes.'}
              </p>
            </motion.section>
          )}

          {estado === 'pronto' && reuniao && (
            <motion.section key="reuniao" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="rounded-[32px] bg-white dark:bg-[#1c1c1f] ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] dark:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] overflow-hidden">
              {/* Data em destaque */}
              <div className="px-8 pt-9 pb-7 text-center">
                <p className="text-[14px] text-slate-500 dark:text-zinc-400">{reuniao.cliente ? `Olá, ${reuniao.cliente}. Sua reunião é` : 'Sua reunião é'}</p>
                {data && (
                  <>
                    <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#4d7c0f] dark:text-[#a3e635]">{data.semana}</p>
                    <p className="mt-1 text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums">{data.dia}</p>
                    <p className="mt-1 text-[17px] font-medium">
                      de {data.mes}, {reuniao.hora_inicio}
                      {reuniao.hora_fim ? ` – ${reuniao.hora_fim}` : ''}
                    </p>
                  </>
                )}
                <div className="mt-6 pt-6 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <h1 className="text-[19px] font-semibold tracking-[-0.015em] leading-snug">{reuniao.titulo}</h1>
                  {reuniao.responsavel && <p className="mt-1 text-[14px] text-slate-500 dark:text-zinc-400">com {reuniao.responsavel}</p>}
                </div>
              </div>

              <div className="px-6 pb-7">
                <AnimatePresence mode="wait">
                  {bloqueada ? (
                    <motion.p key="bloqueada" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-[14px] text-slate-500 dark:text-zinc-400 py-2">
                      {reuniao.situacao === 'cancelada_pela_equipe' ? 'Esta reunião foi cancelada pela equipe.' : 'Esta reunião já aconteceu.'}
                    </motion.p>
                  ) : respondida ? (
                    <motion.div key={`resultado-${reuniao.situacao}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={MOLA} className="text-center">
                      <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={MOLA} className={`mx-auto w-14 h-14 rounded-full ${RESULTADOS[reuniao.situacao].cor} text-white flex items-center justify-center`}>
                        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <Icone tipo={reuniao.situacao} />
                        </svg>
                      </motion.span>
                      <h2 className="mt-4 text-[18px] font-semibold">{RESULTADOS[reuniao.situacao].titulo}</h2>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{RESULTADOS[reuniao.situacao].texto}</p>
                      {reuniao.situacao === 'confirmada' && (
                        <div className="mt-5 flex flex-col gap-2">
                          {reuniao.link_reuniao && (
                            <a href={reuniao.link_reuniao} target="_blank" rel="noopener noreferrer" className="h-12 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[15px] font-semibold flex items-center justify-center">
                              Entrar na reunião
                            </a>
                          )}
                          <a href={linkCalendario(reuniao)} download="reuniao.ics" className="h-12 rounded-full ring-1 ring-black/[0.12] dark:ring-white/[0.15] text-[15px] font-medium flex items-center justify-center hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                            Salvar na minha agenda
                          </a>
                        </div>
                      )}
                      <button type="button" onClick={() => setMudando(true)} className="mt-5 text-[13.5px] text-slate-500 dark:text-zinc-400 underline underline-offset-4 decoration-black/20 dark:decoration-white/25 hover:text-[#1d1d1f] dark:hover:text-white cursor-pointer">
                        Mudou de ideia? Alterar resposta
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div key="acoes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        disabled={enviando}
                        onClick={() => responder('confirmar')}
                        className="w-full h-[52px] rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[16px] font-semibold shadow-[0_10px_30px_-10px_rgba(77,124,15,0.6)] cursor-pointer disabled:opacity-60"
                      >
                        Confirmar presença
                      </motion.button>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          ['remarcar', 'Remarcar'],
                          ['cancelar', 'Não poderei ir'],
                        ].map(([id, rotulo]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setAcaoAberta((v) => (v === id ? null : id))}
                            aria-expanded={acaoAberta === id}
                            className={`h-12 rounded-full text-[15px] font-medium cursor-pointer transition-colors ${acaoAberta === id ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'}`}
                          >
                            {rotulo}
                          </button>
                        ))}
                      </div>
                      <AnimatePresence initial={false}>
                        {acaoAberta && (
                          <motion.div key={acaoAberta} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                            <div className="pt-3">
                              <label htmlFor="recado" className="block text-[13.5px] font-medium mb-1.5">
                                {acaoAberta === 'remarcar' ? 'Qual dia e horário ficam melhores?' : 'Quer deixar um recado? (opcional)'}
                              </label>
                              <textarea
                                id="recado"
                                value={recado}
                                onChange={(e) => setRecado(e.target.value)}
                                maxLength={500}
                                rows={3}
                                placeholder={acaoAberta === 'remarcar' ? 'Ex.: quinta à tarde, depois das 15h' : 'Ex.: surgiu um imprevisto'}
                                className="w-full rounded-2xl px-4 py-3 text-[15px] bg-black/[0.03] dark:bg-white/[0.05] ring-1 ring-black/[0.08] dark:ring-white/[0.1] outline-none focus:ring-2 focus:ring-[#4d7c0f]/40 resize-none"
                              />
                              <button
                                type="button"
                                disabled={enviando}
                                onClick={() => responder(acaoAberta)}
                                className={`mt-2.5 w-full h-12 rounded-full text-[15px] font-semibold text-white cursor-pointer disabled:opacity-60 ${acaoAberta === 'cancelar' ? 'bg-rose-600' : 'bg-[#1d1d1f] dark:bg-white dark:text-[#1d1d1f]'}`}
                              >
                                {acaoAberta === 'remarcar' ? 'Pedir novo horário' : 'Cancelar reunião'}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {mudando && (
                        <button type="button" onClick={() => setMudando(false)} className="w-full pt-2 text-[13.5px] text-slate-500 dark:text-zinc-400 cursor-pointer">
                          Manter minha resposta
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                {aviso && (
                  <p role="alert" className="mt-3 text-center text-[13.5px] text-rose-600 dark:text-rose-400">
                    {aviso}
                  </p>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <p className="mt-8 text-center text-[12px] text-slate-400 dark:text-zinc-500">Este link é pessoal. Não compartilhe.</p>
      </motion.div>
    </main>
  );
}
