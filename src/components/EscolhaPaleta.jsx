'use client';

import React, { useEffect, useState } from 'react';
import { PALETAS, aplicarPaleta, lerPaleta } from '@/lib/paletas';

/** Prévia pequena de uma paleta: metade clara, metade escura, com o destaque de cada modo. */
function Previa({ amostra }) {
  const [acentoClaro, acentoEscuro, fundoClaro, fundoEscuro, cartaoEscuro] = amostra;
  return (
    <span className="flex h-14 w-full rounded-xl overflow-hidden ring-1 ring-black/[0.08] dark:ring-white/[0.1]" aria-hidden="true">
      <span className="flex-1 flex flex-col justify-between p-2" style={{ background: fundoClaro }}>
        <span className="h-2 w-10 rounded-full bg-white shadow-sm" />
        <span className="h-3 w-8 rounded-full" style={{ background: acentoClaro }} />
      </span>
      <span className="flex-1 flex flex-col justify-between p-2" style={{ background: fundoEscuro }}>
        <span className="h-2 w-10 rounded-full" style={{ background: cartaoEscuro }} />
        <span className="h-3 w-8 rounded-full" style={{ background: acentoEscuro }} />
      </span>
    </span>
  );
}

/** Cor do sistema (Configurações › Aparência). Vale na hora, no claro e no escuro, neste navegador. */
export default function EscolhaPaleta() {
  const [atual, setAtual] = useState('whatsapp');
  useEffect(() => {
    setAtual(lerPaleta());
    const aoMudar = (e) => setAtual(e.detail);
    window.addEventListener('rm_paleta_atualizada', aoMudar);
    return () => window.removeEventListener('rm_paleta_atualizada', aoMudar);
  }, []);

  return (
    <div className="rounded-3xl p-6 sm:p-7 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-sm space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">Cor do sistema</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
          Muda o destaque e os fundos de todas as telas, no modo claro e no escuro. Vale na hora e fica salva neste navegador.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" role="radiogroup" aria-label="Cor do sistema">
        {PALETAS.map((p) => {
          const sel = atual === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => aplicarPaleta(p.id)}
              className={`text-left p-2.5 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${sel ? 'border-rm-acento dark:border-rm-acento-escuro' : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.15] dark:hover:border-white/[0.2]'}`}
            >
              <Previa amostra={p.amostra} />
              <span className="flex items-center justify-between gap-2 px-0.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[#1d1d1f] dark:text-white">{p.nome}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-zinc-400 truncate">{p.descricao}</span>
                </span>
                {sel && (
                  <span className="w-5 h-5 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
