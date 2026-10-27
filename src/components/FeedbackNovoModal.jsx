'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createFeedback, getNomeTecnico } from '@/lib/storage';
import { MODULOS_FEEDBACK, TIPOS_FEEDBACK } from '@/lib/feedbacks';
import { ModalEtapas, Etapa, ErroRodape, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { classeCampo } from './NovaEmpresaCampos';
import { BugIcon, LightBulbIcon, SparklesIcon, XMarkIcon, EditIcon } from './Icons';

const ICONES_TIPO = {
  bug: BugIcon,
  melhoria: EditIcon,
  ideia: LightBulbIcon,
  novidade: SparklesIcon,
};

const PRIORIDADES = [
  { id: 'normal', rotulo: 'Normal' },
  { id: 'alta', rotulo: 'Alta' },
  { id: 'critica', rotulo: 'Impede o trabalho' },
];

const TEXTOS = {
  bug: { titulo: 'Ex.: A demanda não some da fila depois de cancelada', descricao: 'O que você fez, o que aconteceu e o que esperava que acontecesse.' },
  melhoria: { titulo: 'Ex.: Mostrar quem está atendendo no card da fila', descricao: 'O que existe hoje e como ficaria melhor.' },
  ideia: { titulo: 'Ex.: Avisar o cliente quando a demanda for concluída', descricao: 'Que problema a ideia resolve e para quem.' },
  novidade: { titulo: 'Ex.: Agora dá para criar subtarefas nos feedbacks', descricao: 'O que mudou e como usar.' },
};

// Reduz o print no navegador antes de enviar (cabe no banco sem perder legibilidade)
function comprimirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo?.type?.startsWith('image/')) return reject(new Error('Escolha uma imagem (PNG, JPG ou WebP).'));
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    leitor.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
      img.onload = () => {
        const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

function CartaoOpcao({ ativo, onClick, icone: Icone, titulo, descricao }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={`w-full flex items-center gap-3 text-left rounded-2xl px-3.5 py-3 ring-1 transition-all cursor-pointer ${
        ativo ? 'ring-2 ring-[#1d1d1f] dark:ring-white bg-black/[0.03] dark:bg-white/[0.06]' : 'ring-black/[0.1] dark:ring-white/[0.12] hover:ring-black/25 dark:hover:ring-white/25'
      }`}
    >
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${ativo ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300'}`}>
        <Icone className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold leading-tight">{titulo}</span>
        <span className="block text-[12px] leading-snug text-slate-500 dark:text-zinc-400 mt-0.5">{descricao}</span>
      </span>
    </button>
  );
}

/**
 * Enviar um feedback em etapas: tipo → módulo → o que aconteceu → print e prioridade.
 * Quem é do desenvolvimento também pode publicar uma "Novidade" (vai direto para Atualizações).
 */
export default function FeedbackNovoModal({ aberto, onFechar, userEmail, podePublicarNovidade = false, onEnviado }) {
  const [tipo, setTipo] = useState(null);
  const [modulo, setModulo] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState('normal');
  const [imagem, setImagem] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const arquivoRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    setTipo(null);
    setModulo(null);
    setTitulo('');
    setDescricao('');
    setPrioridade('normal');
    setImagem(null);
    setErro('');
  }, [aberto]);

  const tipos = Object.entries(TIPOS_FEEDBACK).filter(([id]) => id !== 'novidade' || podePublicarNovidade);
  const textos = TEXTOS[tipo || 'ideia'];
  const etapa1 = Boolean(tipo);
  const etapa2 = etapa1 && Boolean(modulo);
  const etapa3 = etapa2 && titulo.trim().length > 2 && descricao.trim().length > 2;

  const anexar = async (arquivo) => {
    setErro('');
    try {
      setImagem(await comprimirImagem(arquivo));
    } catch (e) {
      setErro(e.message);
    }
  };

  // Colar um print direto (Cmd+V) também anexa
  useEffect(() => {
    if (!aberto) return;
    const colar = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) anexar(item.getAsFile());
    };
    window.addEventListener('paste', colar);
    return () => window.removeEventListener('paste', colar);
  }, [aberto]);

  const enviar = async () => {
    if (!tipo) return setErro('Escolha o tipo do feedback.');
    if (!modulo) return setErro('Escolha onde no sistema isso acontece.');
    if (titulo.trim().length < 3) return setErro('Dê um título curto ao feedback.');
    if (descricao.trim().length < 3) return setErro('Conte um pouco mais na descrição.');
    setEnviando(true);
    setErro('');
    try {
      const fb = await createFeedback({
        titulo,
        descricao,
        modulo_afetado: modulo,
        tipo,
        prioridade: tipo === 'novidade' ? 'normal' : prioridade,
        imagem_base64: imagem,
        autor_email: userEmail,
        autor_nome: getNomeTecnico(userEmail),
      });
      onEnviado?.(fb);
      onFechar();
    } catch (e) {
      setErro(e.message || 'Não foi possível enviar o feedback.');
    } finally {
      setEnviando(false);
    }
  };

  const rodape = (
    <>
      <ErroRodape erro={erro} />
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
        <button type="button" onClick={onFechar} disabled={enviando} className={`${classeBotaoTexto} sm:mr-auto`}>
          Cancelar
        </button>
        <button type="button" onClick={enviar} disabled={enviando} className={classeBotaoPrimario}>
          {enviando && <Spinner />}
          {tipo === 'novidade' ? 'Publicar novidade' : 'Enviar feedback'}
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-[1080px]"
      idTitulo="novo-feedback-titulo"
      titulo={tipo === 'novidade' ? 'Nova novidade' : 'Novo feedback'}
      subtitulo="Conte o que encontrou ou o que imaginou. A equipe de desenvolvimento acompanha cada envio."
      rodape={rodape}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-10">
        <div>
          <Etapa numero={1} titulo="O que você quer enviar?" estado={etapa1 ? 'concluida' : 'ativa'}>
            <div role="radiogroup" aria-label="Tipo do feedback" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-2">
              {tipos.map(([id, t]) => (
                <CartaoOpcao key={id} ativo={tipo === id} onClick={() => setTipo(id)} icone={ICONES_TIPO[id]} titulo={t.rotulo} descricao={t.descricao} />
              ))}
            </div>
          </Etapa>
          <Etapa numero={2} titulo="Em que parte do sistema?" estado={!etapa1 ? 'travada' : etapa2 ? 'concluida' : 'ativa'} fimDeColuna="md">
            <div role="radiogroup" aria-label="Parte do sistema" className="flex flex-wrap gap-2">
              {MODULOS_FEEDBACK.map((m) => {
                const ativo = modulo === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setModulo(m)}
                    className={`h-9 px-3.5 rounded-full text-[13px] font-medium border transition-all cursor-pointer ${
                      ativo
                        ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent'
                        : 'bg-white dark:bg-white/[0.04] border-black/[0.12] dark:border-white/[0.14] text-slate-700 dark:text-zinc-300 hover:border-black/25 dark:hover:border-white/25'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </Etapa>
        </div>

        <div className="md:pl-10 md:border-l border-black/[0.06] dark:border-white/[0.11]">
          <Etapa numero={3} titulo="Conte para a gente" descricao={textos.descricao} estado={!etapa2 ? 'travada' : etapa3 ? 'concluida' : 'ativa'}>
            <label htmlFor="fb-titulo" className="block text-[13px] font-medium mb-1.5">
              Título
            </label>
            <input id="fb-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} placeholder={textos.titulo} className={classeCampo} />
            <label htmlFor="fb-descricao" className="block text-[13px] font-medium mt-4 mb-1.5">
              Descrição
            </label>
            <textarea
              id="fb-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              maxLength={4000}
              className={`${classeCampo} h-auto py-3 resize-y leading-relaxed`}
            />
          </Etapa>

          <Etapa numero={4} titulo="Print e prioridade" descricao="Opcional, mas ajuda muito a entender." estado={!etapa3 ? 'travada' : 'concluida'} ultima>
            {imagem ? (
              <div className="relative rounded-2xl overflow-hidden ring-1 ring-black/[0.1] dark:ring-white/[0.14] bg-black/[0.03]">
                <img src={imagem} alt="Print anexado" className="w-full max-h-[200px] object-contain" />
                <button
                  type="button"
                  onClick={() => setImagem(null)}
                  aria-label="Remover print"
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  if (e.dataTransfer.files?.[0]) anexar(e.dataTransfer.files[0]);
                }}
                className={`w-full rounded-2xl border border-dashed px-4 py-6 text-center transition-colors cursor-pointer ${
                  arrastando ? 'border-rm-acento bg-rm-acento/[0.05]' : 'border-black/[0.18] dark:border-white/[0.2] hover:border-black/35 dark:hover:border-white/35'
                }`}
              >
                <span className="block text-[13.5px] font-medium">Arraste, cole (⌘V) ou clique para anexar</span>
                <span className="block text-[12px] text-slate-500 dark:text-zinc-400 mt-1">PNG, JPG ou WebP. A imagem é reduzida antes do envio.</span>
              </button>
            )}
            <input ref={arquivoRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && anexar(e.target.files[0])} />

            {tipo !== 'novidade' && (
              <>
                <p className="text-[13px] font-medium mt-4 mb-1.5">Prioridade</p>
                <div role="radiogroup" aria-label="Prioridade" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={prioridade === p.id}
                      onClick={() => setPrioridade(p.id)}
                      className={`min-h-9 py-1.5 px-2 rounded-xl text-[12.5px] leading-tight font-medium cursor-pointer transition-colors ${
                        prioridade === p.id ? 'bg-white dark:bg-rm-campo-escuro text-[#1d1d1f] dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'
                      }`}
                    >
                      {p.rotulo}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Etapa>
        </div>
      </div>
    </ModalEtapas>
  );
}
