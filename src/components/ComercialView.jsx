'use client';

import { DESFECHOS_COMERCIAIS, posicaoComercial, resumoComercial } from '@/lib/comercial';
import { nomeParticipanteAgenda } from '@/lib/participantesAgenda';
import { podeVerDepartamento } from '@/lib/perfis';
import {
  getAgendaEventos,
  getConfigComercial,
  getEquipeUsuarios,
  getPermissoesAtuais,
  moverReuniaoComercial,
} from '@/lib/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { classeCampo } from './NovaEmpresaCampos';
import SeletorMes from './SeletorMes';
import EncaixeCabecalho, { ACOES_TITULO, LINHA_TITULO } from './EncaixeCabecalho';

const STATUS = { agendada: 'Agendada', concluida: 'Realizada', cancelada: 'Cancelada' };
export default function ComercialView({ userEmail, onAbrirAgenda }) {
  const [eventos, setEventos] = useState([]);
  const [leads, setLeads] = useState([]);
  const [avisoLeads, setAvisoLeads] = useState('');
  const [config, setConfig] = useState(getConfigComercial);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [departamento, setDepartamento] = useState('__todos__');
  const [responsavel, setResponsavel] = useState('__todos__');
  const [pipelineId, setPipelineId] = useState('');
  const [movendo, setMovendo] = useState(null);
  const travaMovimento = useRef(false);
  const [tentativa, setTentativa] = useState(0);
  const [mes, setMes] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const permissoes = getPermissoesAtuais(userEmail);
  const podeAcessar = permissoes.modulos.includes('comercial');
  useEffect(() => {
    if (!podeAcessar) return;
    let ativo = true;
    let sequencia = 0;
    const carregar = async (inicial = false) => {
      const carga = ++sequencia;
      if (inicial) setCarregando(true);
      try {
        const res = await fetch(`/api/comercial?mes=${mes}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok)
          throw new Error(json.mensagem || 'Não foi possível carregar o Comercial.');
        if (ativo && carga === sequencia) {
          setConfig(json.config);
          setEventos(json.eventos || []);
          setLeads(json.leads || []);
          setAvisoLeads(json.aviso_leads || '');
          setErro('');
        }
      } catch (e) {
        if (ativo && carga === sequencia) setErro(e.message);
      } finally {
        if (ativo && carga === sequencia) setCarregando(false);
      }
    };
    const atualizar = () => {
      // Atualização imediata ao concluir ou editar na agenda; histórico de outros meses é preservado.
      const locais = getAgendaEventos().filter((e) => String(e.data || '').startsWith(`${mes}-`));
      setEventos((lista) => {
        const porId = new Map(lista.map((e) => [e.id, e]));
        locais.forEach((e) => porId.set(e.id, e));
        return [...porId.values()];
      });
      carregar();
    };
    const atualizarConfig = () => setConfig(getConfigComercial());
    const aoFocar = () => carregar();
    carregar(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') carregar();
    }, 30000);
    window.addEventListener('agenda_eventos_updated', atualizar);
    window.addEventListener('comercial_config_updated', atualizarConfig);
    window.addEventListener('comercial_leads_updated', aoFocar);
    window.addEventListener('focus', aoFocar);
    return () => {
      ativo = false;
      clearInterval(timer);
      window.removeEventListener('agenda_eventos_updated', atualizar);
      window.removeEventListener('comercial_config_updated', atualizarConfig);
      window.removeEventListener('comercial_leads_updated', aoFocar);
      window.removeEventListener('focus', aoFocar);
    };
  }, [podeAcessar, userEmail, mes, tentativa]);

  const departamentos = config.departamentos.filter((d) => podeVerDepartamento(permissoes, d));
  const eventosVisiveis = eventos.filter((e) => podeVerDepartamento(permissoes, e.departamento));
  const baseResumo = resumoComercial(eventosVisiveis, {
    mes,
    departamentos,
    departamento: departamentos.includes(departamento) ? departamento : '__todos__',
  });
  const resumo = resumoComercial(baseResumo.reunioes, { mes, departamentos, responsavel });
  const pipeline = config.pipelines.find((p) => p.id === pipelineId) || config.pipelines[0];
  const colunas = pipeline ? [...pipeline.etapas, ...DESFECHOS_COMERCIAIS] : [];
  const leadsVisiveis = leads.filter(
    (e) =>
      podeVerDepartamento(permissoes, e.departamento) &&
      (departamento === '__todos__' || e.departamento === departamento) &&
      (responsavel === '__todos__' || (e.responsavel_email || '__sem__') === responsavel),
  );
  const pessoasFiltro = [
    ...new Map(
      [
        ...baseResumo.pessoas,
        ...leads
          .filter((e) => podeVerDepartamento(permissoes, e.departamento))
          .map((e) => ({
            email: e.responsavel_email || '',
            nome: e.responsavel_nome || e.responsavel_email || 'Sem responsável',
          })),
      ].map((p) => [p.email, p]),
    ).values(),
  ];
  const equipe = [
    ...new Map(
      [
        ...getEquipeUsuarios().filter((u) => u.ativo !== false),
        { email: userEmail, nome: userEmail },
      ]
        .filter((u) => u.email)
        .map((u) => [u.email, u]),
    ).values(),
  ];
  const cartoes = useMemo(
    () =>
      [
        ...resumo.reunioes,
        ...leadsVisiveis.map((e) => ({ ...e, _tipo: 'lead', titulo: e.nome })),
      ].map((e) => ({ evento: e, posicao: posicaoComercial(e, config) })),
    [resumo.reunioes, leadsVisiveis, config],
  );
  if (
    cartoes.some(
      (c) => c.posicao?.pipelineId === pipeline?.id && c.posicao?.etapaId === '__removida__',
    )
  )
    colunas.push({ id: '__removida__', nome: 'Etapa indisponível' });

  const mover = async (id, destinoPipeline, etapaId, responsavelEmail) => {
    if (travaMovimento.current) return;
    travaMovimento.current = true;
    setMovendo(id);
    setErro('');
    try {
      const lead = leads.some((e) => e.id === id);
      const atualizado = await moverReuniaoComercial(
        id,
        destinoPipeline,
        etapaId,
        lead
          ? {
              tipo: 'lead',
              ...(responsavelEmail !== undefined ? { responsavel_email: responsavelEmail } : {}),
            }
          : {},
      );
      if (lead) setLeads((lista) => lista.map((e) => (e.id === id ? { ...e, ...atualizado } : e)));
      setEventos((lista) => lista.map((e) => (e.id === id ? { ...e, ...atualizado } : e)));
    } catch (e) {
      setErro(e.message);
    } finally {
      travaMovimento.current = false;
      setMovendo(null);
    }
  };
  if (!podeAcessar) return null;
  return (
    <div className="space-y-7 text-[#1d1d1f] dark:text-zinc-100">
      <header className={`flex flex-wrap items-center justify-between gap-3 ${LINHA_TITULO}`}>
        {/* O nome da tela já está no cabeçalho */}
        <div className="hidden lg:block" />
        <EncaixeCabecalho />
        {permissoes.modulos.includes('agenda') && (
          <button
            type="button"
            onClick={onAbrirAgenda}
            className="self-start lg:justify-self-end rounded-full px-5 py-2.5 text-sm font-medium bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer"
          >
            Abrir agenda
          </button>
        )}
      </header>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs font-medium mb-2">Mês</p>
          <SeletorMes valor={mes} onMudar={setMes} />
        </div>
        <label className="block min-w-48 flex-1 max-w-xs text-xs font-medium">
          <span>Departamento</span>
          <select
            value={departamentos.includes(departamento) ? departamento : '__todos__'}
            onChange={(e) => setDepartamento(e.target.value)}
            className={`${classeCampo} mt-2`}
          >
            <option value="__todos__">Todos do Comercial</option>
            {departamentos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block min-w-48 flex-1 max-w-xs text-xs font-medium">
          <span>Responsável</span>
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className={`${classeCampo} mt-2`}
          >
            <option value="__todos__">Toda a equipe</option>
            {pessoasFiltro.map((p) => (
              <option key={p.email || '__sem__'} value={p.email || '__sem__'}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      {avisoLeads && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
          {avisoLeads}
        </p>
      )}
      {erro && (
        <div role="alert" className="text-sm text-rose-600 dark:text-rose-400 flex flex-wrap gap-3">
          <span>{erro}</span>
          <button
            type="button"
            onClick={() => setTentativa((n) => n + 1)}
            className="underline cursor-pointer"
          >
            Atualizar
          </button>
        </div>
      )}
      {!carregando && !config.departamentos.length && (
        <div className="rounded-2xl border border-black/10 dark:border-white/15 p-6 bg-white dark:bg-rm-elevado-escuro">
          <h2 className="font-semibold">Escolha os departamentos do Comercial</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
            Um administrador deve selecionar os departamentos em Configurações avançadas → Comercial
            e pipelines. Reuniões existentes passam a aparecer automaticamente.
          </p>
        </div>
      )}
      <div aria-busy={carregando} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['Agendadas', resumo.totais.agendada],
          ['Realizadas', resumo.totais.concluida],
          ['Canceladas', resumo.totais.cancelada],
        ].map(([rotulo, total]) => (
          <div
            key={rotulo}
            className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro p-5"
          >
            <p className="text-sm text-slate-500 dark:text-zinc-400">{rotulo}</p>
            {carregando ? (
              <div className="mt-3 h-9 w-16 rounded-lg animate-pulse bg-black/5 dark:bg-white/10" />
            ) : (
              <p className="mt-2 text-3xl font-semibold tabular-nums">{total}</p>
            )}
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro overflow-hidden">
        <div className="p-5 border-b border-black/5 dark:border-white/10">
          <h2 className="text-lg font-semibold">Por colaborador</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Cada reunião conta uma vez, para o responsável definido na agenda. Os números mostram o
            status atual.
          </p>
        </div>
        {carregando ? (
          <div
            role="status"
            aria-label="Carregando reuniões"
            className="h-32 m-5 rounded-xl animate-pulse bg-black/5 dark:bg-white/10"
          />
        ) : resumo.pessoas.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 dark:text-zinc-400">
                <tr>
                  {['Responsável', 'Agendadas', 'Realizadas', 'Canceladas'].map((t) => (
                    <th key={t} className="px-5 py-3 font-medium whitespace-nowrap">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {resumo.pessoas.map((p) => (
                  <tr key={p.email || '__sem__'}>
                    <td className="px-5 py-4 font-medium">
                      {p.nome}
                      {p.email && (
                        <span className="block font-normal text-xs text-slate-500 dark:text-zinc-400 mt-1">
                          {p.email}
                        </span>
                      )}
                    </td>
                    {['agendada', 'concluida', 'cancelada'].map((s) => (
                      <td key={s} className="px-5 py-4 tabular-nums">
                        {p[s]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-sm text-slate-500 dark:text-zinc-400">
            Nenhuma reunião para os filtros selecionados.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Pipeline</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Leads recebidos por webhook e reuniões. Leads em aberto permanecem visíveis; o mês
              filtra reuniões e leads encerrados.
            </p>
          </div>
          {pipeline && (
            <label className="text-xs font-medium">
              Pipeline
              <select
                className={`${classeCampo} mt-1.5`}
                value={pipeline.id}
                onChange={(e) => setPipelineId(e.target.value)}
              >
                {config.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!pipeline ? (
          <p className="p-6 rounded-2xl border border-dashed border-black/15 dark:border-white/20 text-sm text-slate-500 dark:text-zinc-400">
            Crie suas pipelines e etapas em Configurações avançadas → Comercial e pipelines.
          </p>
        ) : carregando ? (
          <div className="h-60 rounded-2xl animate-pulse bg-black/5 dark:bg-white/10" />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {colunas.map((etapa) => {
              const itens = cartoes.filter(
                (c) => c.posicao?.pipelineId === pipeline.id && c.posicao.etapaId === etapa.id,
              );
              return (
                <div
                  key={etapa.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/rm-reuniao');
                    if (itens.some((c) => c.evento.id === id)) return;
                    if (cartoes.some((c) => c.evento.id === id) && etapa.id !== '__removida__')
                      mover(id, pipeline.id, etapa.id);
                  }}
                  className="w-72 sm:w-80 shrink-0 snap-start rounded-2xl bg-black/[0.025] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] p-3 space-y-3"
                >
                  <div className="flex justify-between items-center px-1 py-2">
                    <h3
                      className={`text-sm font-semibold ${etapa.id === 'ganho' ? 'text-emerald-700 dark:text-emerald-300' : etapa.id === 'perda' ? 'text-rose-700 dark:text-rose-300' : ''}`}
                    >
                      {etapa.nome}
                    </h3>
                    <span className="text-xs tabular-nums text-slate-500">{itens.length}</span>
                  </div>
                  {itens.map(({ evento: e, posicao }) => (
                    <article
                      key={e.id}
                      draggable={!movendo}
                      onDragStart={(ev) => ev.dataTransfer.setData('text/rm-reuniao', e.id)}
                      aria-busy={movendo === e.id}
                      className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-elevado-escuro p-4 space-y-3"
                    >
                      <div>
                        <p className="text-xs text-slate-500 dark:text-zinc-400">
                          {e.departamento} ·{' '}
                          {e._tipo === 'lead' ? 'Lead · RM Chat' : STATUS[e.status] || 'Agendada'}
                        </p>
                        <h4 className="font-semibold text-sm mt-1 break-words">
                          {e._tipo === 'lead' ? e.nome : nomeParticipanteAgenda(e) || e.titulo}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 break-words">
                          {e._tipo === 'lead'
                            ? e.email || e.telefone || 'Recebido por webhook'
                            : e.titulo}
                        </p>
                      </div>
                      <div className="text-xs space-y-1">
                        <p>
                          {e._tipo === 'lead'
                            ? `Ticket ${e.externo_id}`
                            : `${e.data.split('-').reverse().join('/')} · ${String(e.hora_inicio || '').slice(0, 5)}`}
                        </p>
                        <p className="font-medium">
                          {e.responsavel_nome || e.responsavel_email || 'Sem responsável'}
                        </p>
                      </div>
                      {e._tipo === 'lead' && (
                        <label className="block text-xs text-slate-500 dark:text-zinc-400">
                          Responsável
                          <select
                            aria-label={`Responsável por ${e.nome}`}
                            value={e.responsavel_email || ''}
                            disabled={Boolean(movendo)}
                            onChange={(ev) =>
                              mover(e.id, posicao.pipelineId, posicao.etapaId, ev.target.value)
                            }
                            className={`${classeCampo} mt-1.5 text-xs`}
                          >
                            <option value="">Sem responsável</option>
                            {equipe.map((u) => (
                              <option key={u.email} value={u.email}>
                                {u.nome || u.email}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="block text-xs text-slate-500 dark:text-zinc-400">
                        Mover para
                        <select
                          aria-label={`Mover ${e.titulo}`}
                          disabled={Boolean(movendo)}
                          value={`${posicao.pipelineId}:${posicao.etapaId}`}
                          onChange={(ev) => {
                            const [pid, eid] = ev.target.value.split(':');
                            mover(e.id, pid, eid);
                          }}
                          className={`${classeCampo} mt-1.5 text-xs`}
                        >
                          {posicao.etapaId === '__removida__' && (
                            <option value={`${pipeline.id}:__removida__`}>Escolher etapa</option>
                          )}
                          {config.pipelines.map((p) => (
                            <optgroup key={p.id} label={p.nome}>
                              {[...p.etapas, ...DESFECHOS_COMERCIAIS].map((s) => (
                                <option key={s.id} value={`${p.id}:${s.id}`}>
                                  {s.nome}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      {movendo === e.id && (
                        <p role="status" className="text-xs">
                          Salvando etapa…
                        </p>
                      )}
                    </article>
                  ))}
                  {!itens.length && (
                    <p className="text-xs text-slate-400 dark:text-zinc-500 px-1 pb-4">
                      Nenhum cartão nesta etapa
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
