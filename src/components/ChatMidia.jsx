'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

// ------------------------------------------------------------------------------
// Arquivos nas mensagens do Chat (sempre abertos pelo servidor, que confere a permissão)
// ------------------------------------------------------------------------------
export const urlDoArquivo = (m, baixar = false) => `/api/chat/arquivo?m=${m.id}${baixar ? '&baixar=1' : ''}`;

const tamanho = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
};
const relogio = (s) => {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

function Ampliada({ src, nome, linkBaixar, onFechar }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] bg-[#0b0f12]/92 backdrop-blur-sm flex flex-col" onClick={onFechar} role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <div className="flex items-center justify-end gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        {linkBaixar && (
          <a href={linkBaixar} className="h-10 px-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium flex items-center gap-2">
            Baixar
          </a>
        )}
        <button type="button" onClick={onFechar} aria-label="Fechar" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 pb-10">
        <motion.img initial={{ scale: 0.96 }} animate={{ scale: 1 }} src={src} alt={nome || 'Foto'} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
      </div>
    </motion.div>,
    document.body
  );
}

function PlayerAudio({ src, segundos, minha }) {
  const audio = useRef(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(Number(segundos) || 0);
  const [velocidade, setVelocidade] = useState(1);

  const alternar = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      // Só um áudio tocando por vez na tela
      document.querySelectorAll('audio[data-chat-audio]').forEach((x) => x !== a && x.pause());
      a.play().catch(() => {});
    } else a.pause();
  };
  const trocarVelocidade = () => {
    const prox = velocidade === 1 ? 1.5 : velocidade === 1.5 ? 2 : 1;
    setVelocidade(prox);
    if (audio.current) audio.current.playbackRate = prox;
  };
  const pular = (e) => {
    const a = audio.current;
    if (!a || !duracao) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * duracao;
  };
  const progresso = duracao ? Math.min(atual / duracao, 1) : 0;

  return (
    <div className="flex items-center gap-2.5 w-[min(290px,62vw)] py-1">
      <audio
        ref={audio}
        data-chat-audio
        src={src}
        preload="metadata"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setAtual(0);
        }}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuracao(e.currentTarget.duration)}
      />
      <button type="button" onClick={alternar} aria-label={tocando ? 'Pausar áudio' : 'Ouvir áudio'} className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center cursor-pointer text-white ${minha ? 'bg-[#3d7a58] dark:bg-[#0f8f6c]' : 'bg-[#54656f] dark:bg-[#8696a0] dark:text-[#111b21]'}`}>
        {tocando ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="w-4 h-4 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-5 flex items-center cursor-pointer" onClick={pular} role="slider" aria-label="Posição do áudio" aria-valuemin={0} aria-valuemax={Math.round(duracao)} aria-valuenow={Math.round(atual)} tabIndex={0}>
          <div className="relative w-full h-[3px] rounded-full bg-black/15 dark:bg-white/20">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#00a884]" style={{ width: `${progresso * 100}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 rounded-full bg-[#00a884] shadow" style={{ left: `${progresso * 100}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-[#667781] dark:text-[#8696a0] tabular-nums -mt-0.5">
          <span>{relogio(tocando || atual ? atual : duracao)}</span>
          <button type="button" onClick={trocarVelocidade} className="mr-[54px] px-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.1] font-semibold cursor-pointer" aria-label="Velocidade do áudio">
            {velocidade}×
          </button>
        </div>
      </div>
    </div>
  );
}

const ICONE_DOC = { pdf: '#e2574c', doc: '#2b5797', docx: '#2b5797', xls: '#1e7145', xlsx: '#1e7145', csv: '#1e7145', ppt: '#d24726', pptx: '#d24726', zip: '#7a5c3e', txt: '#54656f' };

/** Conteúdo de arquivo de uma mensagem (foto, figurinha, áudio, vídeo, documento). */
export function MidiaMensagem({ m, minha }) {
  const [ampliar, setAmpliar] = useState(false);
  const fechar = useCallback(() => setAmpliar(false), []);
  const src = m.previewUrl || (m.midia?.caminho ? urlDoArquivo(m) : null);

  if (!src) {
    if (m.midia?.erro)
      return (
        <p className="text-[13px] italic text-[#667781] dark:text-[#8696a0] py-1">
          {m.midia.erro === 'grande' ? 'Arquivo grande demais para guardar. Veja no celular.' : 'Arquivo indisponível. Veja no celular.'}
        </p>
      );
    return (
      <p className="text-[13px] text-[#667781] dark:text-[#8696a0] py-1 flex items-center gap-2">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Carregando arquivo…
      </p>
    );
  }

  if (m.tipo === 'imagem' || m.tipo === 'figurinha')
    return (
      <>
        <button type="button" onClick={() => m.tipo === 'imagem' && setAmpliar(true)} className={`block -mx-1 -mt-0.5 mb-1 overflow-hidden rounded-md ${m.tipo === 'imagem' ? 'cursor-zoom-in' : 'cursor-default'}`} aria-label="Ampliar foto">
          <img src={src} alt={m.conteudo || (m.tipo === 'figurinha' ? 'Figurinha' : 'Foto')} loading="lazy" className={m.tipo === 'figurinha' ? 'w-[140px] h-[140px] object-contain' : 'max-w-[min(300px,70vw)] max-h-[340px] min-w-[120px] min-h-[80px] object-cover bg-black/5'} />
        </button>
        <AnimatePresence>{ampliar && <Ampliada src={src} nome={m.conteudo} linkBaixar={m.previewUrl ? null : urlDoArquivo(m, true)} onFechar={fechar} />}</AnimatePresence>
      </>
    );

  if (m.tipo === 'audio') return <PlayerAudio src={src} segundos={m.midia?.segundos} minha={minha} />;

  if (m.tipo === 'video')
    return (
      <video src={src} controls preload="metadata" className="block -mx-1 -mt-0.5 mb-1 max-w-[min(320px,70vw)] max-h-[360px] rounded-md bg-black">
        <track kind="captions" />
      </video>
    );

  // Documento
  const nome = m.midia?.nome || 'Documento';
  const ext = (nome.split('.').pop() || '').toLowerCase().slice(0, 4);
  return (
    <a href={m.previewUrl ? undefined : urlDoArquivo(m, true)} className="flex items-center gap-3 w-[min(300px,66vw)] -mx-1 mb-1 p-2.5 rounded-md bg-black/[0.04] dark:bg-black/20 hover:bg-black/[0.07] transition-colors" download>
      <span className="w-9 h-11 rounded-[5px] flex items-end justify-center pb-1 text-[9px] font-bold uppercase text-white flex-shrink-0" style={{ background: ICONE_DOC[ext] || '#8696a0' }}>
        {ext || 'arq'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium truncate">{nome}</span>
        <span className="block text-[11.5px] text-[#667781] dark:text-[#8696a0]">{[ext.toUpperCase(), m.midia?.tamanho ? tamanho(m.midia.tamanho) : null].filter(Boolean).join(' · ')}</span>
      </span>
      <svg className="w-5 h-5 text-[#667781] dark:text-[#8696a0] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
      </svg>
    </a>
  );
}

// ------------------------------------------------------------------------------
// Gravação de áudio
// ------------------------------------------------------------------------------
const LIMITE_GRAVACAO = 300; // 5 minutos

export function useGravadorDeAudio() {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const estado = useRef(null);

  const parar = () => {
    const e = estado.current;
    if (!e) return;
    clearInterval(e.relogio);
    e.fluxo.getTracks().forEach((t) => t.stop());
  };

  const iniciar = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este navegador não grava áudio.');
    const fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => {
      throw new Error('Libere o microfone para o RM Controle (ícone ao lado do endereço do site).');
    });
    const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const gravador = new MediaRecorder(fluxo, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const partes = [];
    gravador.ondataavailable = (ev) => ev.data.size && partes.push(ev.data);
    const inicio = Date.now();
    const relogio = setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(s);
      if (s >= LIMITE_GRAVACAO && gravador.state === 'recording') gravador.requestData();
    }, 250);
    estado.current = { fluxo, gravador, partes, inicio, relogio };
    gravador.start(1000);
    setSegundos(0);
    setGravando(true);
  };

  const cancelar = () => {
    const e = estado.current;
    if (e && e.gravador.state !== 'inactive') e.gravador.stop();
    parar();
    estado.current = null;
    setGravando(false);
  };

  /** Encerra e devolve { arquivo, segundos } pronto para enviar. */
  const concluir = () =>
    new Promise((resolver) => {
      const e = estado.current;
      if (!e) return resolver(null);
      e.gravador.onstop = () => {
        parar();
        const tipo = (e.gravador.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(e.partes, { type: tipo });
        const dur = Math.max(1, Math.round((Date.now() - e.inicio) / 1000));
        estado.current = null;
        setGravando(false);
        resolver(blob.size ? { arquivo: new File([blob], `audio.${tipo.includes('ogg') ? 'ogg' : 'webm'}`, { type: tipo }), segundos: dur } : null);
      };
      e.gravador.stop();
    });

  useEffect(() => () => cancelar(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { gravando, segundos, iniciar, cancelar, concluir, relogio: relogio(segundos), limite: LIMITE_GRAVACAO };
}

// ------------------------------------------------------------------------------
// Preparação de arquivos antes de enviar
// ------------------------------------------------------------------------------
export const LIMITE_ENVIO = 4 * 1024 * 1024;
export const ACEITOS = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';
export const tipoPeloMime = (mime) => (/^image\//.test(mime) ? 'imagem' : /^audio\//.test(mime) ? 'audio' : /^video\//.test(mime) ? 'video' : 'documento');

/** Fotos grandes viram JPEG de até 1600 px (economiza o espaço do plano e sobe rápido). */
export async function comprimirFoto(arquivo) {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type) || arquivo.size < 700 * 1024) return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const tela = document.createElement('canvas');
    tela.width = Math.round(bitmap.width * escala);
    tela.height = Math.round(bitmap.height * escala);
    tela.getContext('2d').drawImage(bitmap, 0, 0, tela.width, tela.height);
    const blob = await new Promise((r) => tela.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}

/** Janela de prévia antes de enviar um arquivo (com legenda). */
export function PreviaArquivo({ arquivo, onCancelar, onEnviar }) {
  const [legenda, setLegenda] = useState('');
  const [url, setUrl] = useState(null);
  const tipo = tipoPeloMime(arquivo.type);
  useEffect(() => {
    if (tipo !== 'imagem' && tipo !== 'video') return undefined;
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo, tipo]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCancelar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancelar]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex flex-col bg-[#e9edef] dark:bg-[#0b141a]">
      <div className="h-[60px] flex items-center gap-3 px-4">
        <button type="button" onClick={onCancelar} aria-label="Cancelar envio" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/[0.06] dark:hover:bg-white/[0.08] cursor-pointer">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span className="text-[15px] font-medium truncate">{arquivo.name}</span>
        <span className="text-[12px] text-slate-500 flex-shrink-0">{tamanho(arquivo.size)}</span>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        {tipo === 'imagem' && url ? (
          <img src={url} alt="Prévia" className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
        ) : tipo === 'video' && url ? (
          <video src={url} controls className="max-w-full max-h-full rounded-lg bg-black" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="w-20 h-24 rounded-xl bg-white dark:bg-[#202c33] shadow flex items-center justify-center text-[13px] font-bold uppercase text-slate-500">{(arquivo.name.split('.').pop() || '').slice(0, 4)}</span>
            <p className="text-[14px] text-slate-600 dark:text-[#aebac1] max-w-xs break-words">{arquivo.name}</p>
          </div>
        )}
      </div>
      <form
        className="p-3 sm:p-4 flex items-center gap-2 bg-[#f0f2f5] dark:bg-[#202c33]"
        onSubmit={(e) => {
          e.preventDefault();
          onEnviar(legenda);
        }}
      >
        {tipo !== 'audio' && <input value={legenda} onChange={(e) => setLegenda(e.target.value)} maxLength={1024} autoFocus placeholder="Legenda (opcional)" className="flex-1 h-11 rounded-full px-4 bg-white dark:bg-[#2a3942] outline-none text-[15px]" />}
        <button type="submit" className="ml-auto w-12 h-12 rounded-full bg-[#00a884] text-white flex items-center justify-center cursor-pointer" aria-label="Enviar arquivo">
          <svg className="w-5 h-5 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
          </svg>
        </button>
      </form>
    </motion.div>
  );
}
