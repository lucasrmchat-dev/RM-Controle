'use client';
import { useEffect, useRef, useState } from 'react';
const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
export default function SeletorMes({ valor, onMudar }) {
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(Number(valor.slice(0, 4)));
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (!ref.current?.contains(e.target)) setAberto(false);
    };
    const tecla = (e) => {
      if (e.key === 'Escape') {
        setAberto(false);
        ref.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={() => {
          setAno(Number(valor.slice(0, 4)));
          setAberto(!aberto);
        }}
        className="h-11 px-4 rounded-xl bg-white dark:bg-rm-elevado-escuro border border-black/10 dark:border-white/15 text-sm font-medium cursor-pointer"
      >
        {MESES[Number(valor.slice(5)) - 1]} de {valor.slice(0, 4)} <span aria-hidden="true">⌄</span>
      </button>
      {aberto && (
        <div
          role="dialog"
          aria-label="Escolher mês"
          className="absolute top-full left-0 mt-2 z-30 w-72 max-w-[calc(100vw-3rem)] rounded-2xl bg-white dark:bg-rm-elevado-escuro border border-black/10 dark:border-white/15 shadow-xl p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              aria-label="Ano anterior"
              onClick={() => setAno(ano - 1)}
              className="w-9 h-9 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              ‹
            </button>
            <span className="font-semibold tabular-nums">{ano}</span>
            <button
              type="button"
              aria-label="Próximo ano"
              onClick={() => setAno(ano + 1)}
              className="w-9 h-9 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MESES.map((m, i) => {
              const chave = `${ano}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  type="button"
                  key={m}
                  aria-pressed={chave === valor}
                  onClick={() => {
                    onMudar(chave);
                    setAberto(false);
                    ref.current?.querySelector('button')?.focus();
                  }}
                  className={`h-10 rounded-xl text-xs cursor-pointer ${chave === valor ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-black' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
