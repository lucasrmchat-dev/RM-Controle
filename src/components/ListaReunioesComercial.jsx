'use client';

import { forwardRef, useState } from 'react';
import { DESFECHOS_COMERCIAIS, posicaoComercial } from '@/lib/comercial';
import { nomeParticipanteAgenda } from '@/lib/participantesAgenda';

// ------------------------------------------------------------------------------
// Comercial › Reuniões do mês: cada reunião com todos os detalhes (cliente, data, horário, responsável,
// status, etapa no processo, contato, link, observações), filtrada por status e pessoa, com editar e excluir.
// ------------------------------------------------------------------------------
const STATUS = { agendada: 'Agendada', concluida: 'Realizada', cancelada: 'Cancelada', remarcar: 'Remarcar' };
const COR_STATUS = {
  agendada: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  concluida: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  cancelada: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  remarcar: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
};
const diaPorExtenso = (iso) => {
  const d = new Date(`${String(iso || '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);
const hora = (v) => String(v || '').slice(0, 5);

const Info = ({ rotulo, children }) =>
  children ? (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">{rotulo}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  ) : null;

const ListaReunioesComercial = forwardRef(function ListaReunioesComercial({ reunioes, filtro, onFiltro, pessoas, config, onEditar, onExcluir }, ref) {
  const [aberta, setAberta] = useState(null);
  const lista = reunioes
    .filter((e) => (filtro.status === 'todas' || (e.status || 'agendada') === filtro.status) && (!filtro.email || (e.responsavel_email || '__sem__').toLowerCase() === filtro.email.toLowerCase()))
    .sort((a, b) => `${b.data} ${b.hora_inicio}`.localeCompare(`${a.data} ${a.hora_inicio}`));
  const pessoa = filtro.email ? pessoas.find((p) => (p.email || '__sem__') === filtro.email) : null;
  const etapaDe = (e) => {
    const pos = posicaoComercial(e, config);
    if (!pos) return 'Fora do processo comercial';
    const proc = config.pipelines.find((p) => p.id === pos.pipelineId);
    const etapa = [...(proc?.etapas || []), ...DESFECHOS_COMERCIAIS].find((x) => x.id === pos.etapaId);
    return `${proc?.nome || ''} › ${etapa?.nome || 'Etapa apagada'}`;
  };

  return (
    <section ref={ref} className="scroll-mt-24 rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro overflow-hidden">
      <div className="p-5 border-b border-black/5 dark:border-white/10 flex flex-wrap items-center gap-3">
        <div className="min-w-0 mr-auto">
          <h2 className="text-lg font-semibold">Reuniões do mês</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Clique numa reunião para ver tudo. Edite ou exclua as que não forem válidas.</p>
        </div>
        {pessoa && (
          <button type="button" onClick={() => onFiltro({ ...filtro, email: null })} className="h-8 px-3 rounded-full text-xs font-medium bg-black/[0.05] dark:bg-white/[0.08] cursor-pointer">
            {pessoa.nome} ✕
          </button>
        )}
        <div className="flex p-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
          {[['todas', 'Todas'], ['agendada', 'Agendadas'], ['concluida', 'Realizadas'], ['cancelada', 'Canceladas']].map(([id, rot]) => (
            <button key={id} type="button" onClick={() => onFiltro({ ...filtro, status: id })} className={`h-8 px-3 rounded-full text-xs font-medium cursor-pointer ${filtro.status === id ? 'bg-white dark:bg-rm-cartao-escuro shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}>
              {rot}
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="p-8 text-sm text-slate-500 dark:text-zinc-400">Nenhuma reunião com estes filtros.</p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {lista.map((e) => {
            const ab = aberta === e.id;
            const status = e.status || 'agendada';
            const cliente = nomeParticipanteAgenda(e) || (e.empresa !== 'Cliente Geral' && e.empresa) || 'Cliente não informado';
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setAberta(ab ? null : e.id)}
                  aria-expanded={ab}
                  className="w-full text-left px-5 py-3.5 grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.4fr)_170px_minmax(0,1fr)_110px_20px] gap-x-4 gap-y-1 items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.03] cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{cliente}</span>
                    <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{e.titulo}</span>
                  </span>
                  <span className="text-sm tabular-nums text-slate-600 dark:text-zinc-300 col-span-2 sm:col-span-1 order-first sm:order-none">
                    {diaPorExtenso(e.data)} · {hora(e.hora_inicio)}
                  </span>
                  <span className="hidden sm:block text-sm truncate">{e.responsavel_nome || e.responsavel_email || 'Sem responsável'}</span>
                  <span className={`justify-self-start h-6 px-2.5 rounded-full text-xs font-medium inline-flex items-center ${COR_STATUS[status] || COR_STATUS.agendada}`}>{STATUS[status] || status}</span>
                  <svg className={`hidden sm:block w-4 h-4 text-slate-400 transition-transform ${ab ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
                {ab && (
                  <div className="px-5 pb-5 pt-1 bg-black/[0.015] dark:bg-white/[0.02]">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                      <Info rotulo="Cliente">{cliente}</Info>
                      <Info rotulo="Empresa">{e.empresa && e.empresa !== 'Cliente Geral' && e.empresa !== cliente ? e.empresa : null}</Info>
                      <Info rotulo="Título">{e.titulo}</Info>
                      <Info rotulo="Data e horário">{`${diaPorExtenso(e.data)} · ${hora(e.hora_inicio)}${e.hora_fim ? ` às ${hora(e.hora_fim)}` : ''}`}</Info>
                      <Info rotulo="Responsável">{[e.responsavel_nome, e.responsavel_email].filter(Boolean).join(' · ') || 'Sem responsável'}</Info>
                      <Info rotulo="Departamento">{e.departamento}</Info>
                      <Info rotulo="Status">{STATUS[status] || status}</Info>
                      <Info rotulo="Processo comercial">{etapaDe(e)}</Info>
                      <Info rotulo="Telefone do cliente">{e.cliente_telefone}</Info>
                      <Info rotulo="Tipo">{e.tipo === 'interna' ? 'Interna' : e.tipo === 'cliente' ? 'Com cliente' : e.tipo}</Info>
                      <Info rotulo="Link da reunião">
                        {e.link_reuniao ? (
                          <a href={e.link_reuniao} target="_blank" rel="noreferrer" className="text-rm-acento dark:text-rm-acento-vivo underline break-all">
                            {e.link_reuniao}
                          </a>
                        ) : null}
                      </Info>
                      <Info rotulo="Criada por">{e.criado_por}</Info>
                      <Info rotulo="Criada em">{dataHora(e.created_at)}</Info>
                      <Info rotulo="Atualizada em">{dataHora(e.updated_at)}</Info>
                    </dl>
                    {e.observacoes && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">Observações</p>
                        <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{e.observacoes}</p>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => onEditar(e)} className="h-9 px-4 rounded-full text-sm font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer">
                        Editar
                      </button>
                      <button type="button" onClick={() => onExcluir(e)} className="h-9 px-4 rounded-full text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/15 cursor-pointer">
                        Excluir reunião
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});

export default ListaReunioesComercial;
