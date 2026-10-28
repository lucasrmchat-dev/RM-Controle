'use client';

import React, { useEffect, useState } from 'react';
import { getSomDoModulo, playNotificationTone, setSomDoModulo } from '@/lib/audioNotifications';

// Agrupados pela intensidade: tranquilos, médios e intensos
export const TOQUES = [
  { id: 'gota', nome: 'Gota', grupo: 'Tranquilos' },
  { id: 'brisa', nome: 'Brisa', grupo: 'Tranquilos' },
  { id: 'sino', nome: 'Sino suave', grupo: 'Tranquilos' },
  { id: 'mensagem', nome: 'Mensagem', grupo: 'Médios' },
  { id: 'pop', nome: 'Pop', grupo: 'Médios' },
  { id: 'xilofone', nome: 'Xilofone', grupo: 'Médios' },
  { id: 'harmonico', nome: 'Harmônico', grupo: 'Médios' },
  { id: 'reuniao', nome: 'Chime de agenda', grupo: 'Médios' },
  { id: 'dinamico', nome: 'Alerta dinâmico', grupo: 'Intensos' },
  { id: 'sirene', nome: 'Sirene', grupo: 'Intensos' },
  { id: 'alarme', nome: 'Alarme', grupo: 'Intensos' },
  { id: 'incisivo', nome: 'Urgente', grupo: 'Intensos' },
];
const GRUPOS_TOQUE = ['Tranquilos', 'Médios', 'Intensos'];
const REPETICOES = [
  { id: 'uma_vez', nome: 'Uma vez' },
  { id: 'intermitente', nome: 'Sem parar' },
  { id: 'intervalo', nome: 'A cada intervalo' },
];
const MODULOS = [
  { id: 'chat', titulo: 'Chat do WhatsApp', descricao: 'Conversa nova na fila e mensagem nova nas suas conversas, inclusive a que está aberta na tela.', repete: 'Repetindo, para quando não houver mais nada sem ler.' },
  { id: 'fila', titulo: 'Fila de Demandas', descricao: 'Demanda nova entrando na fila.', repete: 'Repetindo, para quando a demanda for assumida.' },
  { id: 'reunioes', titulo: 'Reuniões', descricao: 'Lembrete antes das reuniões da agenda (a antecedência fica em Google Agenda & Alertas).', repete: 'Repetindo, para quando você mexer no mouse ou no teclado.' },
];
const ESCOPOS_FILA = [
  { id: 'departamentos', nome: 'Meus departamentos' },
  { id: 'atribuidos', nome: 'Só as atribuídas a mim' },
  { id: 'selecionados', nome: 'Departamentos escolhidos' },
];

const pilula = (ativo) =>
  `h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
    ativo ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'bg-black/[0.04] dark:bg-white/[0.07] text-slate-600 dark:text-zinc-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.12]'
  }`;

function Interruptor({ ligado, onMudar, rotulo }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => onMudar(!ligado)} className={`relative w-11 h-6 rounded-full flex-shrink-0 cursor-pointer transition-colors ${ligado ? 'bg-rm-acento dark:bg-rm-acento-escuro' : 'bg-black/15 dark:bg-white/20'}`}>
      <span className={`absolute top-[2px] w-5 h-5 rounded-full bg-white shadow transition-all ${ligado ? 'left-[22px]' : 'left-[2px]'}`} />
    </button>
  );
}

function Linha({ titulo, children }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] gap-2 sm:gap-4 sm:items-center">
      <span className="text-[12px] font-semibold text-slate-500 dark:text-zinc-400">{titulo}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function CartaoModulo({ modulo, departamentos }) {
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
  const selecionados = som.departamentosSelecionados || [];

  return (
    <section className="rounded-[22px] bg-white dark:bg-rm-cartao-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-5 space-y-4" aria-label={modulo.titulo}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{modulo.titulo}</h3>
          <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 mt-0.5">{modulo.descricao}</p>
        </div>
        <Interruptor ligado={som.habilitado} onMudar={(v) => mudar({ habilitado: v })} rotulo={`Som de ${modulo.titulo}`} />
      </div>

      {som.habilitado && (
        <div className="space-y-3 pt-1">
          <Linha titulo="Toque">
            <div className="w-full space-y-1.5">
              {GRUPOS_TOQUE.map((g) => (
                <div key={g} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-[74px] text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-zinc-500">{g}</span>
                  {TOQUES.filter((t) => t.grupo === g).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={som.tipoSom === t.id}
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
              ))}
              <button type="button" onClick={() => playNotificationTone(som.tipoSom)} className="h-8 px-3 rounded-full text-[12.5px] font-medium text-rm-acento dark:text-rm-acento-vivo hover:bg-rm-acento/10 cursor-pointer">
                ▶ Ouvir o escolhido
              </button>
            </div>
          </Linha>
          <Linha titulo="Repetição">
            {REPETICOES.map((r) => (
              <button key={r.id} type="button" aria-pressed={som.modoRepeticao === r.id} onClick={() => mudar({ modoRepeticao: r.id })} className={pilula(som.modoRepeticao === r.id)}>
                {r.nome}
              </button>
            ))}
          </Linha>
          {som.modoRepeticao === 'intervalo' && (
            <Linha titulo={`A cada ${som.intervaloSegundos || 30} s`}>
              <input type="range" min="5" max="120" step="5" value={som.intervaloSegundos || 30} onChange={(e) => mudar({ intervaloSegundos: parseInt(e.target.value, 10) })} aria-label="Intervalo da repetição em segundos" className="w-full max-w-[320px] accent-rm-acento dark:accent-rm-acento-escuro" />
            </Linha>
          )}
          {som.modoRepeticao !== 'uma_vez' && <p className="text-[12px] text-slate-400 dark:text-zinc-500 sm:pl-[136px]">{modulo.repete} Para sozinha depois de 10 minutos.</p>}

          {modulo.id === 'chat' && (
            <Linha titulo="Grupos">
              <Interruptor ligado={Boolean(som.grupos)} onMudar={(v) => mudar({ grupos: v })} rotulo="Avisar mensagens de grupos" />
              <span className="text-[12.5px] text-slate-500 dark:text-zinc-400">Avisar também mensagens de grupos</span>
            </Linha>
          )}

          {modulo.id === 'fila' && (
            <>
              <Linha titulo="Avisar de">
                {ESCOPOS_FILA.map((e) => (
                  <button key={e.id} type="button" aria-pressed={som.escopo === e.id} onClick={() => mudar({ escopo: e.id })} className={pilula(som.escopo === e.id)}>
                    {e.nome}
                  </button>
                ))}
              </Linha>
              {som.escopo === 'selecionados' && (
                <Linha titulo="Departamentos">
                  {departamentos.map((d) => {
                    const marcado = selecionados.includes(d);
                    return (
                      <button key={d} type="button" aria-pressed={marcado} onClick={() => mudar({ departamentosSelecionados: marcado ? selecionados.filter((x) => x !== d) : [...selecionados, d] })} className={pilula(marcado)}>
                        {d}
                      </button>
                    );
                  })}
                </Linha>
              )}
              <Linha titulo="Minhas demandas">
                <Interruptor ligado={Boolean(som.notificarCriador)} onMudar={(v) => mudar({ notificarCriador: v })} rotulo="Tocar também quando eu cadastrar a demanda" />
                <span className="text-[12.5px] text-slate-500 dark:text-zinc-400">Tocar também quando eu mesmo cadastrar</span>
              </Linha>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Som de cada módulo: as mesmas opções em todos, cada um com a sua configuração (neste navegador, salva na hora). */
export default function SonsModulos({ departamentos = [] }) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-500 dark:text-zinc-400 px-1">Cada módulo tem o seu toque e a sua repetição. As escolhas valem para este navegador e são salvas na hora.</p>
      {MODULOS.map((m) => (
        <CartaoModulo key={m.id} modulo={m} departamentos={departamentos} />
      ))}
    </div>
  );
}
