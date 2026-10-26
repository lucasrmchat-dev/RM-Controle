'use client';
import { useEffect, useMemo, useState } from 'react';
import { analisarRecorrencias, relatoDoAtendimento } from '@/lib/recorrencias';
import { classeCampo } from './NovaEmpresaCampos';

const isoLocal = (data) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
function limites(periodo) {
  const agora = new Date();
  const inicio = new Date(agora);
  if (periodo === 'ano') inicio.setFullYear(inicio.getFullYear() - 1);
  else inicio.setDate(inicio.getDate() - (periodo === 'semana' ? 6 : periodo === 'mes' ? 29 : 0));
  return { inicio: isoLocal(inicio), fim: isoLocal(agora) };
}
export default function EmpresaRecorrencias({ chamados, carregando = false, erro = '' }) {
  const [periodo, setPeriodo] = useState('mes');
  const [datas, setDatas] = useState(() => limites('mes'));
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [visiveis, setVisiveis] = useState(20);
  useEffect(() => setVisiveis(20), [datas.inicio, datas.fim, busca, categoria]);
  const resumo = useMemo(() => analisarRecorrencias(chamados, { ...datas, busca, categoria }), [chamados, datas, busca, categoria]);
  const invalido = datas.inicio > datas.fim;
  return <section className="space-y-6">
    <div><h2 className="text-xl font-semibold tracking-tight">Problemas recorrentes</h2><p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Acompanhe o que se repete nos atendimentos concluídos desta empresa.</p></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Período das ocorrências">
      {[['hoje','Hoje'],['semana','7 dias'],['mes','30 dias'],['ano','12 meses'],['personalizado','Personalizado']].map(([id,nome]) => <button key={id} onClick={() => {setPeriodo(id); if(id !== 'personalizado') setDatas(limites(id));}} aria-pressed={periodo === id} className={`px-4 py-2 rounded-full text-sm font-medium cursor-pointer ${periodo === id ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' : 'bg-black/[0.04] dark:bg-white/[0.06]'}`}>{nome}</button>)}
    </div>
    {periodo === 'personalizado' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">{[['inicio','De'],['fim','Até']].map(([id,nome]) => <label key={id} className="text-xs font-medium space-y-2 block"><span>{nome}</span><input type="date" value={datas[id]} onChange={(e) => setDatas({...datas,[id]:e.target.value})} className={classeCampo}/></label>)}</div>}
    {invalido && <p role="alert" className="text-sm text-rose-600">A data final deve ser igual ou posterior à inicial.</p>}
    {erro && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
    {carregando ? <div role="status" aria-label="Carregando histórico" className="space-y-4">{[1,2,3].map((n) => <div key={n} className="h-24 rounded-2xl animate-pulse bg-black/[0.04] dark:bg-white/[0.06]"/>)}</div> : !invalido && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[['Atendimentos no período',resumo.totalPeriodo],['Com relato registrado',resumo.totalPeriodo-resumo.semRelato],['Sem relato registrado',resumo.semRelato]].map(([label,total]) => <div key={label} className="p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.12]"><p className="text-xs text-slate-500 dark:text-zinc-400">{label}</p><p className="text-3xl font-semibold tabular-nums mt-2">{total}</p></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3"><h3 className="text-sm font-semibold">Por categoria do suporte</h3><button onClick={() => setCategoria('')} className="text-xs underline cursor-pointer">Ver todas as categorias</button>{resumo.categorias.map((c) => <button key={c.nome} onClick={() => setCategoria(categoria === c.nome ? '' : c.nome)} aria-pressed={categoria === c.nome} className={`w-full flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm text-left cursor-pointer ${categoria === c.nome ? 'ring-1 ring-black/30 dark:ring-white/30' : ''} bg-black/[0.03] dark:bg-white/[0.04]`}><span>{c.nome}</span><strong className="tabular-nums">{c.total}</strong></button>)}</div>
        <div><h3 className="text-sm font-semibold">Termos no relato</h3><p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400 mt-2">Cada número indica quantos atendimentos mencionam o termo. Selecione para consultar os relatos; palavras iguais podem ter causas diferentes.</p><div className="flex flex-wrap gap-2 mt-4">{resumo.termos.map((t) => <button key={t.termo} onClick={() => setBusca(t.termo)} className="rounded-full border border-black/[0.1] dark:border-white/[0.14] px-3 py-2 text-xs cursor-pointer">{t.termo} <strong className="ml-2 tabular-nums">{t.total}</strong></button>)}</div></div>
      </div>
      <div className="space-y-3"><label htmlFor="rec-busca" className="text-sm font-semibold block">Buscar no relato do problema</label><div className="flex gap-2"><input id="rec-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: mensagens, senha, desconexão…" className={classeCampo}/>{busca && <button onClick={() => setBusca('')} className="text-xs px-3 cursor-pointer">Limpar</button>}</div>
      <p className="text-xs text-slate-500 dark:text-zinc-400">{resumo.atendimentos.length} atendimento(s){categoria ? ` · ${categoria}` : ''}</p>
      {!resumo.atendimentos.length && <p className="py-8 text-sm text-slate-500 dark:text-zinc-400">Nenhum atendimento encontrado para este período e filtros.</p>}
      {resumo.atendimentos.slice(0, visiveis).map((c) => <details key={c.id} className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] p-4 sm:p-5"><summary className="cursor-pointer text-sm font-medium"><span>{c.motivo || 'Sem categoria'}</span><span className="block text-xs font-normal text-slate-500 dark:text-zinc-400 mt-1">{new Date(c.finalizado_em || c.created_at).toLocaleString('pt-BR')} · {c.tecnico_nome || c.atendente_nome || c.tecnico_email || 'Sem atendente'}</span></summary><p className="mt-4 text-xs font-medium text-slate-500 dark:text-zinc-400">Relato do problema</p><p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{relatoDoAtendimento(c) || 'Relato não registrado neste atendimento.'}</p>{(c.resolucao || c.observacoes) && <><p className="mt-4 text-xs font-medium text-slate-500 dark:text-zinc-400">Procedimento adotado</p><p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{c.resolucao || c.observacoes}</p></>}</details>)}
      {resumo.atendimentos.length > visiveis && <button onClick={() => setVisiveis((n) => n + 20)} className="text-sm font-medium px-4 py-2 rounded-full border border-black/10 dark:border-white/15 cursor-pointer">Mostrar mais atendimentos</button>}
      </div>
    </>}
  </section>;
}
