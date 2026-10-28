'use client';

import React, { useEffect, useRef, useState } from 'react';

// ------------------------------------------------------------------------------
// Gravador dos feedbacks (ticket #22): grava a tela (com o microfone, para narrar o problema) ou só a voz.
// As gravações ficam aqui até o feedback ser enviado; depois sobem direto para o armazenamento.
// ------------------------------------------------------------------------------
const LIMITE_SEGUNDOS = 5 * 60;
const MAXIMO = 3;

function melhorFormato(video) {
  const opcoes = video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return opcoes.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) || '';
}
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function GravadorFeedback({ gravacoes, onMudar, desabilitado = false }) {
  const [gravando, setGravando] = useState(null); // 'tela' | 'audio' | null
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState('');
  const gravador = useRef(null);
  const fluxos = useRef([]);
  const relogio = useRef(null);
  const podeTela = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const podeAudio = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

  const soltar = () => {
    clearInterval(relogio.current);
    fluxos.current.forEach((f) => f.getTracks().forEach((t) => t.stop()));
    fluxos.current = [];
  };
  useEffect(() => () => {
    if (gravador.current?.state === 'recording') gravador.current.stop();
    soltar();
  }, []);

  const parar = () => {
    if (gravador.current?.state === 'recording') gravador.current.stop();
  };

  const iniciar = async (tipo) => {
    setErro('');
    if (gravacoes.length >= MAXIMO) return setErro(`Até ${MAXIMO} gravações por feedback.`);
    try {
      let fluxo;
      if (tipo === 'tela') {
        const tela = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
        fluxos.current.push(tela);
        // Microfone junto, para narrar (se a pessoa negar, grava só a tela)
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
        if (mic) fluxos.current.push(mic);
        fluxo = new MediaStream([...tela.getVideoTracks(), ...(mic ? mic.getAudioTracks() : [])]);
        // "Parar de compartilhar" do navegador também encerra a gravação
        tela.getVideoTracks()[0]?.addEventListener('ended', parar);
      } else {
        fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
        fluxos.current.push(fluxo);
      }
      const formato = melhorFormato(tipo === 'tela');
      const rec = new MediaRecorder(fluxo, { ...(formato ? { mimeType: formato } : {}), ...(tipo === 'tela' ? { videoBitsPerSecond: 900_000 } : { audioBitsPerSecond: 64_000 }) });
      const pedacos = [];
      const inicio = Date.now();
      rec.ondataavailable = (e) => e.data?.size && pedacos.push(e.data);
      rec.onstop = () => {
        soltar();
        setGravando(null);
        const blob = new Blob(pedacos, { type: (rec.mimeType || formato || (tipo === 'tela' ? 'video/webm' : 'audio/webm')).split(';')[0] });
        if (blob.size) onMudar([...gravacoes, { id: `${Date.now()}`, tipo, blob, url: URL.createObjectURL(blob), segundos: Math.round((Date.now() - inicio) / 1000) }]);
      };
      gravador.current = rec;
      rec.start(1000);
      setGravando(tipo);
      setSegundos(0);
      relogio.current = setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= LIMITE_SEGUNDOS) parar();
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      soltar();
      setGravando(null);
      if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') setErro('Não foi possível gravar neste navegador.');
      else if (tipo === 'audio') setErro('Permita o uso do microfone para gravar o áudio.');
    }
  };

  const remover = (g) => {
    URL.revokeObjectURL(g.url);
    onMudar(gravacoes.filter((x) => x.id !== g.id));
  };

  if (!podeAudio && !podeTela) return null;

  return (
    <div className="space-y-2.5">
      {gravando ? (
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-rose-500/[0.08] ring-1 ring-rose-500/30" role="status">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-[13.5px] font-medium">{gravando === 'tela' ? 'Gravando a tela' : 'Gravando áudio'}</span>
          <span className="text-[13px] tabular-nums text-slate-500">{mmss(segundos)} / {mmss(LIMITE_SEGUNDOS)}</span>
          <button type="button" onClick={parar} className="ml-auto h-8 px-4 rounded-full bg-rose-600 text-white text-[13px] font-semibold cursor-pointer">
            Parar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {podeTela && (
            <button type="button" disabled={desabilitado} onClick={() => iniciar('tela')} className="h-9 px-3.5 rounded-full ring-1 ring-black/[0.1] dark:ring-white/[0.14] text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-50">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2.5" y="4" width="19" height="13" rx="2" />
                <path d="M8 21h8M12 17v4" />
                <circle cx="12" cy="10.5" r="2.2" fill="currentColor" stroke="none" />
              </svg>
              Gravar a tela
            </button>
          )}
          {podeAudio && (
            <button type="button" disabled={desabilitado} onClick={() => iniciar('audio')} className="h-9 px-3.5 rounded-full ring-1 ring-black/[0.1] dark:ring-white/[0.14] text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-50">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              Gravar áudio
            </button>
          )}
          <span className="self-center text-[12px] text-slate-500 dark:text-zinc-400">Até 5 minutos. Na tela, o microfone grava junto para você explicar.</span>
        </div>
      )}
      {erro && <p className="text-[12.5px] text-rose-600">{erro}</p>}
      {gravacoes.map((g) => (
        <div key={g.id} className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.12] p-2.5 space-y-2">
          {g.tipo === 'tela' ? <video src={g.url} controls className="w-full max-h-[220px] rounded-xl bg-black" /> : <audio src={g.url} controls className="w-full" />}
          <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-zinc-400">
            {g.tipo === 'tela' ? 'Gravação da tela' : 'Áudio'} · {mmss(g.segundos || 0)} · {(g.blob.size / 1024 / 1024).toFixed(1)} MB
            <button type="button" onClick={() => remover(g)} className="ml-auto h-7 px-3 rounded-full text-rose-600 hover:bg-rose-500/10 cursor-pointer font-medium">
              Remover
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
