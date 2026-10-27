'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { acaoDaily, fetchDaily, getEquipeUsuarios } from '@/lib/storage';
import { progressoMetas, semanaDe, somarDias } from '@/lib/daily';
import { showToast } from './ToastNotification';
import { Spinner } from './FormularioEtapas';
import EncaixeCabecalho, { ACOES_TITULO, LINHA_TITULO } from './EncaixeCabecalho';

// ------------------------------------------------------------------------------
// Daily (ticket #21): reuniões diárias da equipe (resumo e atualizações da ClickMassa, escritos durante
// ou depois da reunião) e as metas da semana. Tudo salva sozinho enquanto se escreve.
// ------------------------------------------------------------------------------
const hojeIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const formatarDia = (iso, opcoes) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', opcoes);
const rotuloDia = (iso) => {
  const hoje = hojeIso();
  if (iso === hoje) return 'Hoje';
  if (iso === somarDias(hoje, -1)) return 'Ontem';
  return formatarDia(iso, { weekday: 'long', day: '2-digit', month: '2-digit' });
};
const cartao = 'rounded-[22px] bg-white dark:bg-rm-cartao-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.09]';
const campoTexto =
  'w-full rounded-2xl bg-black/[0.025] dark:bg-white/[0.04] ring-1 ring-black/[0.06] dark:ring-white/[0.08] focus:ring-2 focus:ring-rm-acento/40 dark:focus:ring-rm-acento-escuro/40 px-4 py-3 text-[14px] leading-relaxed outline-none resize-y placeholder:text-slate-400 dark:placeholder:text-zinc-500';

/** Salva com atraso enquanto a pessoa escreve (e na hora ao sair do campo). */
function useSalvarDepois(salvar, atraso = 900) {
  const pendente = useRef(null);
  const timer = useRef(null);
  const agora = useCallback(() => {
    clearTimeout(timer.current);
    if (!pendente.current) return;
    const campos = pendente.current;
    pendente.current = null;
    salvar(campos);
  }, [salvar]);
  const depois = useCallback(
    (campos) => {
      pendente.current = { ...(pendente.current || {}), ...campos };
      clearTimeout(timer.current);
      timer.current = setTimeout(agora, atraso);
    },
    [agora, atraso]
  );
  useEffect(() => () => agora(), [agora]);
  return { depois, agora };
}

function EditorReuniao({ reuniao, equipe, onSalva, onExcluir }) {
  const [dados, setDados] = useState(reuniao);
  const [situacao, setSituacao] = useState('salvo');
  useEffect(() => {
    setDados(reuniao);
    setSituacao('salvo');
  }, [reuniao.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = useCallback(
    async (campos) => {
      setSituacao('salvando');
      try {
        const r = await acaoDaily({ acao: 'editar_reuniao', id: reuniao.id, ...campos });
        onSalva(r.reuniao);
        setSituacao('salvo');
      } catch (e) {
        setSituacao('erro');
        showToast(e.message, 'error');
      }
    },
    [reuniao.id, onSalva]
  );
  const { depois, agora } = useSalvarDepois(salvar);
  const mudar = (campos) => {
    setDados((d) => ({ ...d, ...campos }));
    setSituacao('editando');
    depois(campos);
  };
  const participantes = dados.participantes || [];

  return (
    <motion.div key={reuniao.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={`${cartao} p-5 sm:p-6 space-y-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={dados.titulo || ''}
          onChange={(e) => mudar({ titulo: e.target.value })}
          onBlur={agora}
          maxLength={120}
          aria-label="Título da daily"
          className="flex-1 min-w-[180px] text-[20px] font-semibold tracking-tight bg-transparent outline-none rounded-lg px-1 -mx-1 focus:bg-black/[0.03] dark:focus:bg-white/[0.05]"
        />
        <input
          type="date"
          value={dados.data}
          onChange={(e) => e.target.value && mudar({ data: e.target.value })}
          onBlur={agora}
          aria-label="Data da daily"
          className="h-9 px-3 rounded-full text-[13px] bg-black/[0.04] dark:bg-white/[0.07] outline-none cursor-pointer"
        />
        <span className={`text-[12px] font-medium ${situacao === 'erro' ? 'text-rose-600' : 'text-slate-400 dark:text-zinc-500'}`} aria-live="polite">
          {situacao === 'salvando' ? 'Salvando…' : situacao === 'editando' ? 'Editando…' : situacao === 'erro' ? 'Não salvou' : 'Salvo'}
        </span>
        <button
          type="button"
          onClick={() => window.confirm(`Excluir "${dados.titulo || 'Daily'}" de ${formatarDia(dados.data, { day: '2-digit', month: '2-digit' })}?`) && onExcluir(reuniao)}
          className="h-9 px-3 rounded-full text-[13px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
        >
          Excluir
        </button>
      </div>

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">Quem participou</h3>
        <div className="flex flex-wrap gap-1.5">
          {equipe.map((u) => {
            const marcado = participantes.includes(u.email);
            return (
              <button
                key={u.email}
                type="button"
                aria-pressed={marcado}
                onClick={() => {
                  const lista = marcado ? participantes.filter((p) => p !== u.email) : [...participantes, u.email];
                  setDados((d) => ({ ...d, participantes: lista }));
                  salvar({ participantes: lista });
                }}
                className={`h-8 px-3 rounded-full text-[12.5px] font-medium cursor-pointer transition-colors ${
                  marcado ? 'bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950' : 'bg-black/[0.04] dark:bg-white/[0.07] text-slate-600 dark:text-zinc-300 hover:bg-black/[0.08]'
                }`}
              >
                {u.nome || u.email}
              </button>
            );
          })}
        </div>
      </section>

      <label className="block">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">Resumo da daily</span>
        <textarea
          value={dados.resumo || ''}
          onChange={(e) => mudar({ resumo: e.target.value })}
          onBlur={agora}
          rows={8}
          placeholder="O que cada um fez ontem, o que fará hoje, impedimentos, decisões…"
          className={campoTexto}
        />
      </label>

      <label className="block">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">Atualizações da ClickMassa</span>
        <textarea
          value={dados.atualizacoes_clickmassa || ''}
          onChange={(e) => mudar({ atualizacoes_clickmassa: e.target.value })}
          onBlur={agora}
          rows={5}
          placeholder="Novidades, mudanças e avisos da ClickMassa comentados na reunião…"
          className={campoTexto}
        />
      </label>
    </motion.div>
  );
}

function MetasDaSemana({ semana, metas, equipe, onMudou }) {
  const [texto, setTexto] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [salvando, setSalvando] = useState(false);
  const { feitas, total, fracao } = progressoMetas(metas);

  const criar = async (e) => {
    e.preventDefault();
    if (texto.trim().length < 2) return;
    setSalvando(true);
    try {
      const r = await acaoDaily({ acao: 'criar_meta', semana, texto, responsavel_email: responsavel || null });
      onMudou((l) => [...l, r.meta]);
      setTexto('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSalvando(false);
    }
  };
  const editar = async (meta, campos) => {
    const otimista = { ...meta, ...(campos.concluida !== undefined ? { concluida_em: campos.concluida ? new Date().toISOString() : null } : {}) };
    onMudou((l) => l.map((m) => (m.id === meta.id ? otimista : m)));
    try {
      const r = await acaoDaily({ acao: 'editar_meta', id: meta.id, ...campos });
      onMudou((l) => l.map((m) => (m.id === meta.id ? r.meta : m)));
    } catch (err) {
      onMudou((l) => l.map((m) => (m.id === meta.id ? meta : m)));
      showToast(err.message, 'error');
    }
  };
  const excluir = async (meta) => {
    onMudou((l) => l.filter((m) => m.id !== meta.id));
    try {
      await acaoDaily({ acao: 'excluir_meta', id: meta.id });
    } catch (err) {
      onMudou((l) => [...l, meta]);
      showToast(err.message, 'error');
    }
  };

  return (
    <section className={`${cartao} p-5 space-y-4`} aria-labelledby="metas-titulo">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="metas-titulo" className="text-[16px] font-semibold tracking-tight">
            Metas da semana
          </h2>
          <span className="text-[12.5px] font-medium text-slate-500 dark:text-zinc-400 tabular-nums">
            {feitas} de {total}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitas} aria-label="Metas concluídas">
          <motion.div className="h-full rounded-full bg-rm-acento dark:bg-rm-acento-escuro" initial={false} animate={{ width: `${Math.round(fracao * 100)}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.5 }} />
        </div>
      </div>

      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {metas.map((m) => (
            <motion.li key={m.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="group flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <input type="checkbox" checked={Boolean(m.concluida_em)} onChange={(e) => editar(m, { concluida: e.target.checked })} aria-label={`Concluir: ${m.texto}`} className="mt-1 w-4 h-4 accent-rm-acento cursor-pointer flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className={`text-[14px] leading-snug break-words ${m.concluida_em ? 'line-through text-slate-400 dark:text-zinc-500' : ''}`}>{m.texto}</p>
                <select
                  value={m.responsavel_email || ''}
                  onChange={(e) => editar(m, { responsavel_email: e.target.value || null })}
                  aria-label="Responsável"
                  className="mt-1 max-w-full text-[12px] text-slate-500 dark:text-zinc-400 bg-transparent outline-none cursor-pointer rounded hover:text-[#1d1d1f] dark:hover:text-white"
                >
                  <option value="">Sem responsável</option>
                  {equipe.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.nome || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => excluir(m)} aria-label={`Excluir meta: ${m.texto}`} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer">
                ×
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {metas.length === 0 && <li className="px-2 py-3 text-[13px] text-slate-400 dark:text-zinc-500">Nenhuma meta para esta semana ainda.</li>}
      </ul>

      <form onSubmit={criar} className="space-y-2 pt-1 border-t border-black/[0.06] dark:border-white/[0.08]">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder="Nova meta da semana" aria-label="Nova meta" className="w-full h-10 mt-3 px-4 rounded-full bg-black/[0.03] dark:bg-white/[0.05] ring-1 ring-black/[0.06] dark:ring-white/[0.08] focus:ring-2 focus:ring-rm-acento/40 outline-none text-[14px]" />
        <div className="flex gap-2">
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} aria-label="Responsável pela nova meta" className="flex-1 min-w-0 h-9 px-3 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-[13px] outline-none cursor-pointer">
            <option value="">Sem responsável</option>
            {equipe.map((u) => (
              <option key={u.email} value={u.email}>
                {u.nome || u.email}
              </option>
            ))}
          </select>
          <button type="submit" disabled={salvando || texto.trim().length < 2} className="h-9 px-4 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[13px] font-semibold cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
            {salvando && <Spinner />}
            Adicionar
          </button>
        </div>
      </form>
    </section>
  );
}

export default function DailyView() {
  const [semana, setSemana] = useState(() => semanaDe(hojeIso()));
  const [reunioes, setReunioes] = useState(null);
  const [metas, setMetas] = useState([]);
  const [aberta, setAberta] = useState(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const equipe = useMemo(() => getEquipeUsuarios().filter((u) => u.ativo !== false && u.email), []);

  const carregar = useCallback(
    (alvo = semana) =>
      fetchDaily(alvo)
        .then((r) => {
          setReunioes(r.reunioes);
          setMetas(r.metas);
          setErro('');
          setAberta((atual) => (r.reunioes.some((x) => x.id === atual) ? atual : r.reunioes[0]?.id || null));
        })
        .catch((e) => setErro(e.message)),
    [semana]
  );
  useEffect(() => {
    setReunioes(null);
    carregar(semana);
  }, [semana]); // eslint-disable-line react-hooks/exhaustive-deps

  const nova = async () => {
    setCriando(true);
    try {
      const hoje = hojeIso();
      const data = semanaDe(hoje) === semana ? hoje : semana;
      const r = await acaoDaily({ acao: 'criar_reuniao', data, titulo: `Daily ${formatarDia(data, { day: '2-digit', month: '2-digit' })}` });
      setReunioes((l) => [r.reuniao, ...(l || [])]);
      setAberta(r.reuniao.id);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setCriando(false);
    }
  };
  const aoSalvar = useCallback((r) => {
    setReunioes((l) => (l || []).map((x) => (x.id === r.id ? r : x)));
    // Mudou de semana pela data: some desta lista
    if (semanaDe(r.data) !== semana) {
      setReunioes((l) => (l || []).filter((x) => x.id !== r.id));
      setAberta(null);
      showToast(`Daily movida para a semana de ${formatarDia(semanaDe(r.data), { day: '2-digit', month: '2-digit' })}.`, 'info');
    }
  }, [semana]);
  const excluir = async (r) => {
    try {
      await acaoDaily({ acao: 'excluir_reuniao', id: r.id });
      setReunioes((l) => (l || []).filter((x) => x.id !== r.id));
      setAberta(null);
      showToast('Daily excluída.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const fim = somarDias(semana, 6);
  const estaSemana = semana === semanaDe(hojeIso());
  const selecionada = (reunioes || []).find((r) => r.id === aberta) || null;

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      <header className={`flex flex-wrap items-center justify-between gap-3 ${LINHA_TITULO}`}>
        {/* O nome da tela já está no cabeçalho: à esquerda, a semana */}
        <div className="flex items-center gap-2 lg:h-12">
          <div className="flex items-center h-10 rounded-full bg-white dark:bg-rm-cartao-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.09]">
            <button type="button" onClick={() => setSemana((s) => somarDias(s, -7))} aria-label="Semana anterior" className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
              ‹
            </button>
            <span className="px-1 text-[13px] font-medium tabular-nums whitespace-nowrap">
              {formatarDia(semana, { day: '2-digit', month: '2-digit' })} – {formatarDia(fim, { day: '2-digit', month: '2-digit' })}
            </span>
            <button type="button" onClick={() => setSemana((s) => somarDias(s, 7))} aria-label="Próxima semana" className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
              ›
            </button>
          </div>
          {!estaSemana && (
            <button type="button" onClick={() => setSemana(semanaDe(hojeIso()))} className="h-10 px-4 rounded-full text-[13px] font-medium whitespace-nowrap ring-1 ring-black/[0.08] dark:ring-white/[0.12] cursor-pointer hover:bg-black/[0.03]">
              Esta semana
            </button>
          )}
        </div>
        <EncaixeCabecalho />
        <div className={`flex items-center gap-2 ${ACOES_TITULO}`}>
          <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={nova} disabled={criando} className="h-10 px-5 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 text-[14px] font-semibold shadow-md shadow-rm-acento/20 flex items-center gap-2 cursor-pointer disabled:opacity-60">
            {criando ? <Spinner /> : <span className="text-[18px] leading-none -mt-px">+</span>}
            Nova daily
          </motion.button>
        </div>
      </header>

      {erro && (
        <div role="alert" className="rounded-[22px] bg-amber-500/10 text-amber-800 dark:text-amber-300 px-5 py-4 text-[14px]">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {reunioes === null && !erro ? (
            <div className={`${cartao} p-10 flex justify-center text-slate-400`}>
              <Spinner />
            </div>
          ) : (reunioes || []).length === 0 ? (
            <div className={`${cartao} py-14 px-6 flex flex-col items-center text-center`}>
              <p className="text-[16px] font-semibold">Nenhuma daily nesta semana</p>
              <p className="mt-1 text-[13.5px] text-slate-500 dark:text-zinc-400 max-w-sm">Crie uma daily para registrar o resumo da reunião. Dá para escrever durante a reunião ou depois; tudo salva sozinho.</p>
            </div>
          ) : (
            <>
              {/* Dailies da semana: quantas quiser por dia */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Dailies da semana">
                {reunioes.map((r) => {
                  const ativa = r.id === aberta;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="tab"
                      aria-selected={ativa}
                      onClick={() => setAberta(r.id)}
                      className={`flex-shrink-0 text-left rounded-2xl px-4 py-2.5 ring-1 cursor-pointer transition-colors ${
                        ativa ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] ring-transparent' : 'bg-white dark:bg-rm-cartao-escuro ring-black/[0.06] dark:ring-white/[0.09] hover:ring-black/20'
                      }`}
                    >
                      <span className="block text-[11.5px] font-medium opacity-70 capitalize">{rotuloDia(r.data)}</span>
                      <span className="block text-[13.5px] font-semibold max-w-[200px] truncate">{r.titulo}</span>
                    </button>
                  );
                })}
              </div>
              {selecionada && <EditorReuniao reuniao={selecionada} equipe={equipe} onSalva={aoSalvar} onExcluir={excluir} />}
            </>
          )}
        </div>
        <MetasDaSemana semana={semana} metas={metas} equipe={equipe} onMudou={setMetas} />
      </div>
    </div>
  );
}
