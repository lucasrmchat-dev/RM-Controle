'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BLOCOS, exportarFluxo } from '@/lib/fluxos';
import { criarFluxo, duplicarFluxo, excluirFluxo, fetchFluxo, fetchFluxos, importarFluxo, salvarFluxo } from '@/lib/storage';
import EncaixeCabecalho, { ACOES_TITULO, LINHA_TITULO } from '../EncaixeCabecalho';
import ConfirmModal from '../ConfirmModal';
import { showToast } from '../ToastNotification';
import EditorFluxo from './EditorFluxo';
import { CORES_BLOCO, IconeBloco, campoClasse, rotuloClasse } from './visual';

// ------------------------------------------------------------------------------
// Fluxo Inteligente: lista dos fluxos da empresa (criar, importar, exportar, duplicar, ativar, excluir)
// e o editor visual de cada um.
// ------------------------------------------------------------------------------
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function NovoFluxo({ aberto, onFechar, onCriado }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (aberto) {
      setNome('');
      setDescricao('');
    }
  }, [aberto]);
  const criar = async (e) => {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    try {
      const r = await criarFluxo({ nome, descricao });
      onCriado(r.fluxo);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvando(false);
    }
  };
  // Portal no body: dentro da página (que tem animação com transform) o "fixed" ficava preso à área do conteúdo
  if (!montado) return null;
  return createPortal(
    <AnimatePresence>
      {aberto && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onPointerDown={(e) => e.target === e.currentTarget && onFechar()}>
          <motion.form onSubmit={criar} initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }} className="w-full max-w-md rounded-3xl bg-white dark:bg-rm-cartao-escuro shadow-2xl p-6 space-y-4">
            <div>
              <h2 className="text-[18px] font-semibold">Novo fluxo</h2>
              <p className="text-[13px] text-slate-500 dark:text-zinc-400">Dê um nome; depois é só montar os blocos.</p>
            </div>
            <label className="block">
              <span className={rotuloClasse}>Nome</span>
              <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Boas-vindas do WhatsApp" className={campoClasse} />
            </label>
            <label className="block">
              <span className={rotuloClasse}>Descrição (opcional)</span>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={3} placeholder="O que este fluxo faz" className={`${campoClasse} h-auto py-2`} />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onFechar} className="h-10 px-4 rounded-full text-[13px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
                Cancelar
              </button>
              <button type="submit" disabled={!nome.trim() || salvando} className="h-10 px-5 rounded-full text-[13px] font-semibold bg-rm-acento-medio text-white cursor-pointer disabled:opacity-50">
                {salvando ? 'Criando…' : 'Criar e abrir'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function MenuLinha({ onExportar, onDuplicar, onExcluir }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => !ref.current?.contains(e.target) && setAberto(false);
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);
  const item = (rotulo, fn, perigo) => (
    <button
      type="button"
      onClick={() => {
        setAberto(false);
        fn();
      }}
      className={`w-full text-left px-3 py-2 rounded-lg text-[13px] cursor-pointer ${perigo ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'}`}
    >
      {rotulo}
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-label="Mais ações" className="w-9 h-9 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center justify-center">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 p-1 rounded-xl bg-white dark:bg-rm-elevado-escuro shadow-xl ring-1 ring-black/[0.08] dark:ring-white/[0.1]">
          {item('Exportar JSON', onExportar)}
          {item('Duplicar', onDuplicar)}
          {item('Excluir', onExcluir, true)}
        </div>
      )}
    </div>
  );
}

export default function FluxosView() {
  const [fluxos, setFluxos] = useState(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const arquivo = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchFluxos();
      setFluxos(r.fluxos);
      setErro('');
    } catch (e) {
      setErro(e.message);
      setFluxos([]);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrir = async (id) => {
    try {
      const r = await fetchFluxo(id);
      setEditando(r.fluxo);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  const atualizarNaLista = (f) => setFluxos((l) => (l || []).map((x) => (x.id === f.id ? { ...x, ...f, definicao: undefined } : x)));

  const alternar = async (f) => {
    try {
      const r = await salvarFluxo(f.id, { ativo: !f.ativo });
      atualizarNaLista(r.fluxo);
      showToast(r.fluxo.ativo ? `“${f.nome}” ativado.` : `“${f.nome}” desativado.`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  const exportar = async (f) => {
    try {
      const { fluxo } = await fetchFluxo(f.id);
      const conteudo = JSON.stringify(exportarFluxo(fluxo), null, 2);
      const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxo-${fluxo.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  const importar = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 300 * 1024) return showToast('Arquivo grande demais para um fluxo.', 'error');
    try {
      const texto = await f.text();
      const r = await importarFluxo(JSON.parse(texto));
      showToast(r.aviso || `“${r.fluxo.nome}” importado (inativo). Confira e ative.`, r.aviso ? 'info' : 'success');
      await carregar();
    } catch (err) {
      showToast(err instanceof SyntaxError ? 'Este arquivo não é um JSON válido.' : err.message, 'error');
    }
  };
  const duplicar = async (f) => {
    try {
      await duplicarFluxo(f.id);
      showToast('Cópia criada (inativa).', 'success');
      carregar();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (fluxos || []).filter((f) => (filtro === 'todos' || (filtro === 'ativos' ? f.ativo : !f.ativo)) && (!t || `${f.nome} ${f.descricao}`.toLowerCase().includes(t)));
  }, [fluxos, busca, filtro]);
  const ativos = (fluxos || []).filter((f) => f.ativo).length;

  if (editando) {
    return (
      <EditorFluxo
        key={editando.id}
        fluxo={editando}
        onMudou={atualizarNaLista}
        onVoltar={() => {
          setEditando(null);
          carregar();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${LINHA_TITULO} flex flex-col gap-3`}>
        {/* Sem título: o nome da aba já está no cabeçalho */}
        <div className="hidden lg:block" />
        <EncaixeCabecalho />
        <div className={`flex items-center gap-2 ${ACOES_TITULO}`}>
          <span className="hidden 2xl:flex h-8 px-3 rounded-full text-[12px] font-medium bg-black/[0.05] dark:bg-white/[0.08] items-center whitespace-nowrap">{(fluxos || []).length} no total</span>
          <span className="hidden 2xl:flex h-8 px-3 rounded-full text-[12px] font-medium bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 items-center whitespace-nowrap">{ativos} ativos</span>
          <input ref={arquivo} type="file" accept="application/json,.json" className="hidden" onChange={importar} />
          <button type="button" onClick={() => arquivo.current?.click()} className="h-10 px-4 rounded-full whitespace-nowrap text-[12.5px] font-semibold ring-1 ring-black/10 dark:ring-white/15 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer">
            Importar
          </button>
          <button type="button" onClick={() => setNovo(true)} className="h-10 px-5 rounded-full whitespace-nowrap text-[12.5px] font-bold bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 shadow-md cursor-pointer">
            + Novo fluxo
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-rm-cartao-escuro shadow-sm overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou descrição" className={`${campoClasse} h-10 rounded-full px-4 sm:flex-1`} />
          <div className="flex p-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
            {[['todos', 'Todos'], ['ativos', 'Ativos'], ['inativos', 'Inativos']].map(([id, r]) => (
              <button key={id} type="button" onClick={() => setFiltro(id)} className={`h-9 px-4 rounded-full text-[12.5px] font-medium cursor-pointer ${filtro === id ? 'bg-white dark:bg-rm-elevado-escuro shadow-sm' : 'text-slate-500'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {erro ? (
          <p className="p-10 text-center text-[13.5px] text-rose-600 dark:text-rose-400">{erro}</p>
        ) : fluxos === null ? (
          <p className="p-10 text-center text-[13px] text-slate-400">Carregando…</p>
        ) : lista.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[15px] font-semibold">{fluxos.length ? 'Nenhum fluxo com este filtro' : 'Nenhum fluxo ainda'}</p>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">{fluxos.length ? '' : 'Crie o primeiro ou importe um JSON exportado de outra empresa.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.07]">
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_160px_96px] gap-4 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Nome</span>
              <span>Gatilhos</span>
              <span>Status</span>
              <span>Atualizado em</span>
              <span className="text-right">Ações</span>
            </div>
            {lista.map((f) => (
              <div key={f.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_160px_96px] gap-x-4 gap-y-2 px-5 py-3.5 items-center hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
                <button type="button" onClick={() => abrir(f.id)} className="flex items-center gap-3 min-w-0 text-left cursor-pointer">
                  <span className="w-10 h-10 rounded-xl bg-rm-acento-medio/12 text-rm-acento dark:text-rm-acento-vivo flex items-center justify-center flex-shrink-0">
                    <IconeBloco tipo="fluxo" className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold truncate">{f.nome}</span>
                    <span className="block text-[12px] text-slate-500 dark:text-zinc-400 truncate">{f.descricao || `${f.blocos} ${f.blocos === 1 ? 'bloco' : 'blocos'}`}</span>
                  </span>
                </button>
                <div className="flex flex-wrap gap-1">
                  {f.gatilhos.length === 0 && <span className="text-[12px] text-slate-400">Sem gatilho</span>}
                  {f.gatilhos.map((g) => (
                    <span key={g} className={`h-6 px-2 rounded-full text-[11px] font-medium inline-flex items-center gap-1 ${CORES_BLOCO[BLOCOS[g]?.cor]?.suave || ''}`}>
                      <IconeBloco tipo={g} className="w-3 h-3" />
                      {BLOCOS[g]?.rotulo}
                    </span>
                  ))}
                </div>
                <button type="button" onClick={() => alternar(f)} role="switch" aria-checked={f.ativo} className="flex items-center gap-2 text-[12.5px] font-medium cursor-pointer w-fit">
                  <span className={`relative w-9 h-5 rounded-full transition-colors ${f.ativo ? 'bg-emerald-500' : 'bg-black/15 dark:bg-white/20'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${f.ativo ? 'translate-x-4' : ''}`} />
                  </span>
                  {f.ativo ? 'Ativo' : 'Inativo'}
                </button>
                <span className="text-[12.5px] text-slate-500 dark:text-zinc-400 tabular-nums">{quando(f.atualizado_em)}</span>
                <div className="flex items-center justify-end gap-1">
                  <button type="button" onClick={() => abrir(f.id)} aria-label={`Editar ${f.nome}`} title="Editar" className="w-9 h-9 rounded-full text-rm-acento dark:text-rm-acento-vivo hover:bg-rm-acento/10 cursor-pointer flex items-center justify-center">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                  </button>
                  <MenuLinha onExportar={() => exportar(f)} onDuplicar={() => duplicar(f)} onExcluir={() => setExcluindo(f)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NovoFluxo
        aberto={novo}
        onFechar={() => setNovo(false)}
        onCriado={(f) => {
          setNovo(false);
          setFluxos((l) => [f, ...(l || [])]);
          setEditando(f);
        }}
      />
      <ConfirmModal
        isOpen={Boolean(excluindo)}
        title="Excluir fluxo?"
        message={excluindo ? `“${excluindo.nome}” e o histórico das execuções serão apagados. Isso não pode ser desfeito.` : ''}
        confirmText="Excluir"
        variant="danger"
        onClose={() => setExcluindo(null)}
        onConfirm={async () => {
          try {
            await excluirFluxo(excluindo.id);
            setFluxos((l) => (l || []).filter((x) => x.id !== excluindo.id));
            showToast('Fluxo excluído.', 'success');
          } catch (e) {
            showToast(e.message, 'error');
          }
          setExcluindo(null);
        }}
      />
    </div>
  );
}
