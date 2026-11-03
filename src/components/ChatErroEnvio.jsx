'use client';

import { explicarErroChat, relatorioErroChat } from '@/lib/errosChat';
import { createFeedback, getNomeTecnico } from '@/lib/storage';
import { useState } from 'react';
import {
  ErroRodape,
  ModalEtapas,
  Spinner,
  classeBotaoPrimario,
  classeBotaoTexto,
} from './FormularioEtapas';
import { showToast } from './ToastNotification';

const IconeErro = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.8 3.5h1.6v5H7.2v-5zm0 6.2h1.6v1.6H7.2v-1.6z" />
  </svg>
);

/**
 * Exclamação vermelha de mensagem não enviada: ao clicar, explica o erro em linguagem simples
 * (código, o que aconteceu, o que fazer) e permite avisar a área de desenvolvimento (abre um feedback).
 */
export function BotaoErroEnvio({ m }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [avisado, setAvisado] = useState(false);
  const [erroAviso, setErroAviso] = useState('');
  const erro = explicarErroChat(m.erro);

  const avisar = async () => {
    setEnviando(true);
    setErroAviso('');
    try {
      const email = (typeof window !== 'undefined' && localStorage.getItem('rm_auth_user')) || '';
      await createFeedback({
        titulo: `[${erro.codigo}] ${erro.titulo}`,
        descricao: relatorioErroChat(erro, {
          mensagemId: m.id,
          conversaId: m.conversa_id,
          quando: m.criado_em,
          conteudo: m.conteudo,
        }),
        modulo_afetado: 'Chat',
        tipo: 'bug',
        autor_email: email,
        autor_nome: getNomeTecnico(email),
      });
      setAvisado(true);
      showToast('Pronto! O desenvolvimento recebeu o aviso em Feedbacks.', 'success');
    } catch (e) {
      setErroAviso(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
        title="Não enviada. Clique para ver o motivo."
        aria-label="Não enviada. Ver o motivo"
        className="text-rose-600 dark:text-rose-400 hover:scale-110 transition-transform cursor-pointer"
      >
        <IconeErro />
      </button>
      <ModalEtapas
        aberto={aberto}
        onFechar={() => setAberto(false)}
        bloqueado={enviando}
        largura="max-w-[480px]"
        idTitulo={`erro-envio-${m.id}`}
        titulo="Mensagem não enviada"
        subtitulo="Veja o que aconteceu e o que fazer."
        rodape={
          <>
            <ErroRodape erro={erroAviso} />
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setAberto(false)} className={classeBotaoTexto}>
                Fechar
              </button>
              <button
                type="button"
                onClick={avisar}
                disabled={enviando || avisado}
                className={classeBotaoPrimario}
              >
                {enviando && <Spinner />}
                {avisado ? 'Desenvolvimento avisado' : 'Avisar o desenvolvimento'}
              </button>
            </div>
          </>
        }
      >
        <div className="space-y-4 text-[#1d1d1f] dark:text-[#f5f5f7]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 w-9 h-9 flex-shrink-0 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <IconeErro className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-mono font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300">
                {erro.codigo}
              </span>
              <p className="mt-1.5 text-[16px] font-semibold leading-snug">{erro.titulo}</p>
              <p className="mt-1 text-[14px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                {erro.explicacao}
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-black/[0.035] dark:bg-white/[0.06] px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
              O que fazer
            </p>
            <p className="mt-1 text-[14px] leading-relaxed">{erro.oQueFazer}</p>
          </div>
          <details className="group text-[13px]">
            <summary className="cursor-pointer select-none text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]">
              Detalhes técnicos (para o desenvolvimento)
            </summary>
            <p className="mt-2 rounded-xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] px-3 py-2 font-mono text-[12px] break-words text-slate-600 dark:text-zinc-300">
              {erro.tecnico}
            </p>
          </details>
        </div>
      </ModalEtapas>
    </>
  );
}

/** Linha curta embaixo do balão: o título simples do erro, em vez do texto técnico. */
export function ResumoErroEnvio({ m }) {
  const erro = explicarErroChat(m.erro);
  return (
    <p className="text-[11.5px] text-rose-700 dark:text-rose-300 mt-1 max-w-[320px]">
      {erro.titulo} <span className="font-mono opacity-70">({erro.codigo})</span>
    </p>
  );
}
