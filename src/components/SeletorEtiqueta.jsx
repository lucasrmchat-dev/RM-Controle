'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaCadastrada } from '@/lib/etiquetas';
import { fetchEtiquetasCadastradas } from '@/lib/storage';

/**
 * Etiquetas cadastradas da empresa (Configurações › Etiquetas), por tipo: 'chat' ou 'demandas'.
 * Lê uma vez e acompanha quando alguém salva a lista em outra tela.
 */
export function useEtiquetasCadastradas(tipo) {
  const [lista, setLista] = useState(null);
  useEffect(() => {
    let vivo = true;
    fetchEtiquetasCadastradas()
      .then((r) => vivo && setLista(r[tipo] || []))
      .catch(() => vivo && setLista([]));
    const mudou = (e) => setLista(e.detail?.[tipo] || []);
    window.addEventListener('rm-etiquetas', mudou);
    return () => {
      vivo = false;
      window.removeEventListener('rm-etiquetas', mudou);
    };
  }, [tipo]);
  return lista;
}

/**
 * Botão "+ etiqueta" que abre a lista das cadastradas (com busca). Não cria etiqueta nova:
 * só escolhe do cadastro, para ninguém inventar etiqueta sem critério.
 */
export default function SeletorEtiqueta({
  tipo,
  usadas = [],
  onEscolher,
  rotulo = '+ etiqueta',
  className = '',
}) {
  const cadastradas = useEtiquetasCadastradas(tipo);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const caixa = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (caixa.current && !caixa.current.contains(e.target)) setAberto(false);
    };
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const opcoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (cadastradas || []).filter(
      (t) => !etiquetaCadastrada(usadas, t) && (!termo || t.toLowerCase().includes(termo)),
    );
  }, [cadastradas, usadas, busca]);

  const escolher = (t) => {
    setAberto(false);
    setBusca('');
    onEscolher?.(t);
  };

  return (
    <div ref={caixa} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="h-7 rounded-full px-3 bg-rm-fundo dark:bg-rm-elevado-escuro text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-rm-acento dark:hover:text-rm-acento-vivo cursor-pointer transition-colors"
      >
        {rotulo}
      </button>
      {aberto && (
        <div className="absolute z-50 left-0 mt-1.5 w-[220px] rounded-2xl bg-white dark:bg-rm-elevado-escuro shadow-[0_12px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/5 dark:ring-white/10 p-1.5">
          {(cadastradas || []).length > 6 && (
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar etiqueta"
              aria-label="Buscar etiqueta"
              className="w-full h-8 mb-1 rounded-xl px-2.5 bg-rm-fundo dark:bg-black/20 outline-none text-[13px]"
            />
          )}
          <div className="max-h-[220px] overflow-y-auto">
            {cadastradas === null && (
              <p className="px-2.5 py-2 text-[12.5px] text-slate-500">Carregando…</p>
            )}
            {cadastradas !== null &&
              opcoes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => escolher(t)}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-rm-acento-medio/10 cursor-pointer"
                >
                  {t}
                </button>
              ))}
            {cadastradas !== null && !opcoes.length && (
              <p className="px-2.5 py-2 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">
                {(cadastradas || []).length
                  ? 'Nenhuma outra etiqueta cadastrada.'
                  : 'Nenhuma etiqueta cadastrada. Um administrador cadastra em Configurações › Etiquetas.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
