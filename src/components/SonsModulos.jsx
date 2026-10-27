'use client';

import React, { useEffect, useState } from 'react';
import { getSomDoModulo, playNotificationTone, setSomDoModulo } from '@/lib/audioNotifications';

export const TOQUES = [
  { id: 'mensagem', nome: 'Mensagem' },
  { id: 'harmonico', nome: 'Harmônico' },
  { id: 'sino', nome: 'Sino suave' },
  { id: 'dinamico', nome: 'Alerta dinâmico' },
  { id: 'reuniao', nome: 'Chime de agenda' },
  { id: 'incisivo', nome: 'Urgente' },
];
const REPETICOES = [
  { id: 'uma_vez', nome: 'Uma vez' },
  { id: 'intermitente', nome: 'Sem parar' },
  { id: 'intervalo', nome: 'A cada intervalo' },
];
const MODULOS = [
  { id: 'chat', titulo: 'Chat do WhatsApp', descricao: 'Conversa nova na fila e mensagem nova nas suas conversas, inclusive a que está aberta na tela. Repetindo, para quando não houver mais nada sem ler (ou, na conversa aberta, quando você mexer no computador).' },
  { id: 'reunioes', titulo: 'Reuniões', descricao: 'Lembrete antes das reuniões da agenda (a antecedência fica em Google Agenda & Alertas). Repetindo, para quando você mexer no mouse ou no teclado.' },
];

const pilula = (ativo) =>
  `px-3 py-1.5 rounded-full text-[11.5px] font-semibold cursor-pointer transition-all border ${
    ativo ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#3f6212] dark:text-[#bef264]' : 'border-black/[0.08] dark:border-white/[0.12] text-slate-600 dark:text-zinc-300 hover:border-black/20'
  }`;

function CartaoModulo({ modulo }) {
  const [som, setSom] = useState(() => getSomDoModulo(modulo.id));
  useEffect(() => {
    const atualizar = () => setSom(getSomDoModulo(modulo.id));
    atualizar();
    window.addEventListener('rm_audio_config_updated', atualizar);
    return () => window.removeEventListener('rm_audio_config_updated', atualizar);
  }, [modulo.id]);
  // Salva na hora: cada escolha já vale para os próximos avisos
  const mudar = (campos) => {
    setSomDoModulo(modulo.id, campos);
    setSom(getSomDoModulo(modulo.id));
  };
  return (
    <div className="rounded-3xl p-5 sm:p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">{modulo.titulo}</h4>
          <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{modulo.descricao}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={som.habilitado} onChange={(e) => mudar({ habilitado: e.target.checked })} className="sr-only peer" aria-label={`Som de ${modulo.titulo}`} />
          <div className="w-11 h-6 bg-slate-200 rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4d7c0f] dark:peer-checked:bg-[#84cc16]"></div>
        </label>
      </div>
      {som.habilitado ? (
        <>
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Toque</span>
            <div className="flex flex-wrap gap-1.5">
              {TOQUES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    mudar({ tipoSom: t.id });
                    playNotificationTone(t.id);
                  }}
                  className={pilula(som.tipoSom === t.id)}
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Repetição</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {REPETICOES.map((r) => (
                <button key={r.id} type="button" onClick={() => mudar({ modoRepeticao: r.id })} className={pilula(som.modoRepeticao === r.id)}>
                  {r.nome}
                </button>
              ))}
            </div>
            {som.modoRepeticao === 'intervalo' && (
              <label className="block pt-1">
                <span className="text-[11.5px] text-slate-600 dark:text-zinc-300">A cada {som.intervaloSegundos} segundos</span>
                <input type="range" min="5" max="120" step="5" value={som.intervaloSegundos} onChange={(e) => mudar({ intervaloSegundos: parseInt(e.target.value, 10) })} className="w-full accent-[#4d7c0f] dark:accent-[#84cc16]" />
              </label>
            )}
            {som.modoRepeticao !== 'uma_vez' && <p className="text-[11px] text-slate-400 dark:text-zinc-500">A repetição para sozinha depois de 10 minutos.</p>}
          </div>
          <button type="button" onClick={() => playNotificationTone(som.tipoSom)} className="px-4 py-1.5 rounded-full border border-black/10 dark:border-white/10 text-[11.5px] font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
            Testar som
          </button>
        </>
      ) : (
        <p className="text-[11.5px] text-slate-400 dark:text-zinc-500">Sem som. Os avisos continuam aparecendo no sino de notificações.</p>
      )}
    </div>
  );
}

/** Som de cada módulo (salva neste navegador, na hora). A Fila de Demandas tem a configuração completa abaixo. */
export default function SonsModulos() {
  return (
    <div className="space-y-3">
      <div className="px-1">
        <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">Som de cada módulo</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Cada módulo tem seu toque, sua repetição e pode ser ligado ou desligado. As escolhas valem para este navegador e são salvas na hora.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {MODULOS.map((m) => (
          <CartaoModulo key={m.id} modulo={m} />
        ))}
      </div>
    </div>
  );
}
