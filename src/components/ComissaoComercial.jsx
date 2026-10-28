'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { calcularMes, diaDaSemana, formatarPct, formatarReal, porVendedor, regrasDoVendedor } from '@/lib/comissao';
import { relatorioComissaoXlsx } from '@/lib/relatorioComissao';
import { editarVenda, excluirVenda, fetchComissao, ocultarMinhasVendas, registrarVenda } from '@/lib/storage';
import ConfirmModal from './ConfirmModal';
import { showToast } from './ToastNotification';

// ------------------------------------------------------------------------------
// Comercial › Comissão: o controle de atividade e comissão da planilha, montado sozinho a partir das
// reuniões (marcadas e feitas) e das vendas. Resumo do mês, evolução no ano, ranking da equipe, dia a dia,
// vendas do mês e o relatório em .xlsx no mesmo formato.
// ------------------------------------------------------------------------------
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const iniciais = (nome) =>
  String(nome || '?')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
const campo = 'w-full h-10 px-3 rounded-xl bg-white dark:bg-rm-campo-escuro border border-black/[0.1] dark:border-white/[0.12] text-sm outline-none focus:border-rm-acento-medio focus:ring-2 focus:ring-rm-acento-medio/20';

/** Janela de registrar/editar venda (também usada ao marcar Ganho no processo comercial). */
export function VendaModal({ venda = null, inicial = {}, vendedores = [], gestor = false, eu, regras, onFechar, onSalva, textoPular = null, onPular }) {
  const base = venda || inicial;
  const [f, setF] = useState({
    empresa: base.empresa || '',
    contato: base.contato || '',
    data: String(base.data || hojeIso()).slice(0, 10),
    vendedor_email: base.vendedor_email || eu,
    mensalidade: base.mensalidade ?? '',
    adicionais: base.adicionais ?? '',
    observacoes: base.observacoes || '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
  const total = num(f.mensalidade) + num(f.adicionais);
  const regra = regras ? regrasDoVendedor(regras, f.vendedor_email) : null;
  const mudar = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const r = venda ? await editarVenda(venda.id, f) : await registrarVenda({ ...f, origem_tipo: inicial.origem_tipo, origem_id: inicial.origem_id });
      onSalva(r.venda);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onPointerDown={(e) => e.target === e.currentTarget && onFechar()}>
      <motion.form initial={{ scale: 0.96, y: 8, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} onSubmit={salvar} className="w-full max-w-lg rounded-3xl bg-white dark:bg-rm-cartao-escuro shadow-2xl p-6 space-y-4 text-[#1d1d1f] dark:text-zinc-100 max-h-[92vh] overflow-y-auto">
        <div>
          <h2 className="text-lg font-semibold">{venda ? 'Editar venda' : inicial.origem_tipo ? 'Venda fechada 🎉' : 'Registrar venda'}</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Use o nome da empresa (não o da pessoa): fica fácil conferir depois no financeiro.</p>
        </div>
        <label className="block text-xs font-medium">
          Empresa (cliente)
          <input value={f.empresa} onChange={mudar('empresa')} required autoFocus placeholder="Ex.: FAMA Serviços" className={`${campo} mt-1.5`} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs font-medium">
            Contato
            <input value={f.contato} onChange={mudar('contato')} placeholder="Quem participou" className={`${campo} mt-1.5`} />
          </label>
          <label className="block text-xs font-medium">
            Data da venda
            <input type="date" value={f.data} onChange={mudar('data')} required className={`${campo} mt-1.5`} />
          </label>
        </div>
        {gestor && (
          <label className="block text-xs font-medium">
            Vendedor
            <select value={f.vendedor_email} onChange={mudar('vendedor_email')} className={`${campo} mt-1.5`}>
              {vendedores.map((v) => (
                <option key={v.email} value={v.email}>
                  {v.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium">
            Mensalidade (R$)
            <input inputMode="decimal" value={f.mensalidade} onChange={mudar('mensalidade')} placeholder="0,00" className={`${campo} mt-1.5 tabular-nums`} />
          </label>
          <label className="block text-xs font-medium">
            Adicionais (setup, canais extras)
            <input inputMode="decimal" value={f.adicionais} onChange={mudar('adicionais')} placeholder="0,00" className={`${campo} mt-1.5 tabular-nums`} />
          </label>
        </div>
        <div className="rounded-2xl bg-rm-acento-medio/[0.08] px-4 py-3 flex items-center justify-between text-sm">
          <span>
            Total do contrato <strong className="tabular-nums">{formatarReal(total)}</strong>
          </span>
          {regra && <span className="text-rm-acento dark:text-rm-acento-vivo font-semibold">+ {formatarReal(regra.valor_venda)} de comissão</span>}
        </div>
        <label className="block text-xs font-medium">
          Observações
          <textarea value={f.observacoes} onChange={mudar('observacoes')} rows={2} className={`${campo} mt-1.5 h-auto py-2`} />
        </label>
        {erro && <p className="text-sm text-rose-600">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {textoPular && (
            <button type="button" onClick={onPular} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer mr-auto">
              {textoPular}
            </button>
          )}
          <button type="button" onClick={onFechar} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !f.empresa.trim()} className="h-10 px-5 rounded-full text-sm font-semibold bg-rm-acento-medio text-white cursor-pointer disabled:opacity-50">
            {salvando ? 'Salvando…' : venda ? 'Salvar' : 'Registrar venda'}
          </button>
        </div>
      </motion.form>
    </div>,
    document.body
  );
}

function Kpi({ rotulo, valor, detalhe, cor = '' }) {
  return (
    <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro p-4">
      <p className="text-xs text-slate-500 dark:text-zinc-400">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{detalhe}</p>}
    </div>
  );
}

function Taxa({ rotulo, valor, texto, explicacao }) {
  return (
    <div className="min-w-0" title={explicacao}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-zinc-400">{rotulo}</span>
        <span className="text-sm font-semibold tabular-nums">{texto}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
        <motion.div className="h-full rounded-full bg-rm-acento-medio" initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.round((valor || 0) * 100))}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.8 }} />
      </div>
    </div>
  );
}

const Nomes = ({ lista }) =>
  lista.length ? (
    <span className="flex flex-wrap gap-1">
      {lista.map((x, i) => (
        <span key={`${x.id || x.nome}-${i}`} className="px-1.5 py-0.5 rounded-md text-[11px] bg-black/[0.05] dark:bg-white/[0.08] whitespace-nowrap">
          {x.nome || x.empresa}
        </span>
      ))}
    </span>
  ) : null;

export default function ComissaoComercial({ mes, onMes }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [vendedor, setVendedor] = useState('__todos__');
  const [todosDias, setTodosDias] = useState(false);
  const [vendaAberta, setVendaAberta] = useState(null); // { venda } | { nova: true }
  const [excluindo, setExcluindo] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchComissao(mes);
      setDados(r);
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  }, [mes]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  // Reuniões e vendas mudam em outras telas (agenda, processo comercial)
  useEffect(() => {
    const atualizar = () => carregar();
    window.addEventListener('agenda_eventos_updated', atualizar);
    window.addEventListener('comercial_vendas_updated', atualizar);
    return () => {
      window.removeEventListener('agenda_eventos_updated', atualizar);
      window.removeEventListener('comercial_vendas_updated', atualizar);
    };
  }, [carregar]);

  const equipe = dados?.vendedores || [];
  const sozinho = equipe.length <= 1;
  const alvo = sozinho ? equipe[0]?.email || dados?.eu : vendedor === '__todos__' ? null : vendedor;
  const resultado = useMemo(() => (dados ? calcularMes({ mes, vendedor: alvo, eventos: dados.eventos, vendas: dados.vendas, regras: dados.regras }) : null), [dados, mes, alvo]);
  const ranking = useMemo(() => (dados && !sozinho ? porVendedor({ mes, vendedores: equipe, eventos: dados.eventos, vendas: dados.vendas, regras: dados.regras }) : []), [dados, mes, sozinho, equipe]);
  const anual = useMemo(() => {
    if (!dados) return [];
    if (!alvo) return dados.anual.map((m) => m.totais.comissao);
    return dados.anualPorVendedor?.[alvo] || Array(12).fill(0);
  }, [dados, alvo]);
  const maiorAno = Math.max(1, ...anual);
  const hoje = hojeIso();
  const nomeVendedor = alvo ? equipe.find((v) => v.email === alvo)?.nome : 'Toda a equipe';
  const podeMexer = (v) => dados?.gestor || String(v.vendedor_email).toLowerCase() === dados?.eu;

  const baixar = () => {
    try {
      const lista = alvo ? equipe.filter((v) => v.email === alvo) : equipe;
      const bytes = relatorioComissaoXlsx({ mes, vendedores: lista, eventos: dados.eventos, vendas: dados.vendas, regras: dados.regras });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Comissao_${(alvo ? nomeVendedor : 'Equipe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_')}_${mes}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  if (erro) return <p className="p-6 rounded-2xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm">{erro}</p>;
  if (!dados || !resultado) return <div className="h-72 rounded-3xl animate-pulse bg-black/5 dark:bg-white/10" />;
  const t = resultado.totais;
  const regraAlvo = regrasDoVendedor(dados.regras, alvo || dados.eu);
  const dias = todosDias ? resultado.dias : resultado.dias.filter((d) => d.marcadas.length || d.feitas.length || d.vendas.length || d.data === hoje);

  return (
    <div className="space-y-5">
      {/* Barra: vendedor, privacidade, relatório e nova venda */}
      <div className="flex flex-wrap items-center gap-2">
        {!sozinho && (
          <div className="flex flex-wrap gap-1.5">
            {[{ email: '__todos__', nome: 'Toda a equipe' }, ...equipe].map((v) => (
              <button
                key={v.email}
                type="button"
                onClick={() => setVendedor(v.email)}
                className={`h-9 pl-1.5 pr-3.5 rounded-full text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                  vendedor === v.email ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' : 'bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.1] hover:ring-black/20'
                }`}
              >
                <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${vendedor === v.email ? 'bg-white/20' : 'bg-rm-acento-medio/15 text-rm-acento dark:text-rm-acento-vivo'}`}>{v.email === '__todos__' ? '∑' : iniciais(v.nome)}</span>
                {v.nome}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dados.podeOcultar && (
            <label className="h-9 px-3 rounded-full text-xs font-medium flex items-center gap-2 bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.1] cursor-pointer" title="Os gestores continuam vendo">
              <input
                type="checkbox"
                checked={dados.ocultei}
                onChange={async (e) => {
                  try {
                    await ocultarMinhasVendas(e.target.checked);
                    carregar();
                  } catch (err) {
                    showToast(err.message, 'error');
                  }
                }}
                className="accent-[rgb(var(--rm-acento-medio))]"
              />
              Não mostrar minhas vendas para outros vendedores
            </label>
          )}
          <button type="button" onClick={baixar} className="h-9 px-4 rounded-full text-sm font-semibold bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.08] dark:ring-white/[0.1] hover:ring-black/20 cursor-pointer flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7 10l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            Relatório do mês (.xlsx)
          </button>
          <button type="button" onClick={() => setVendaAberta({ nova: true })} className="h-9 px-4 rounded-full text-sm font-semibold bg-rm-acento-medio text-white cursor-pointer">
            + Registrar venda
          </button>
        </div>
      </div>
      {dados.aviso && <p className="px-4 py-3 rounded-2xl bg-amber-500/12 text-amber-800 dark:text-amber-300 text-sm">{dados.aviso}</p>}

      {/* Destaque: quanto vai receber */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_2fr] gap-4">
        <motion.div
          key={`${mes}-${alvo}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[0_20px_50px_-20px_rgb(var(--rm-acento-medio)/0.7)]"
          style={{ background: 'linear-gradient(135deg, rgb(var(--rm-acento-medio)), rgb(var(--rm-acento)))' }}
        >
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10" aria-hidden="true" />
          <div className="absolute -right-4 bottom-[-60px] w-32 h-32 rounded-full bg-white/10" aria-hidden="true" />
          <p className="relative text-sm font-medium text-white/80">
            Total a receber · {MESES[Number(mes.slice(5, 7)) - 1]} · {nomeVendedor}
          </p>
          <p className="relative mt-2 text-[40px] leading-none font-bold tabular-nums tracking-tight">{formatarReal(t.comissao)}</p>
          <p className="relative mt-3 text-sm text-white/85">
            {t[regraAlvo.pagar_por === 'feita' ? 'feitas' : 'marcadas']} reuniões {regraAlvo.pagar_por === 'feita' ? 'feitas' : 'marcadas'} × {formatarReal(regraAlvo.valor_reuniao)} + {t.vendas} {t.vendas === 1 ? 'venda' : 'vendas'} × {formatarReal(regraAlvo.valor_venda)}
          </p>
          <div className="relative mt-5 grid grid-cols-3 gap-3 text-white">
            {[
              ['Comparec.', formatarPct(resultado.taxas.comparecimento)],
              ['Conversão', formatarPct(resultado.taxas.conversao)],
              ['Ticket médio', formatarReal(resultado.taxas.ticket)],
            ].map(([r, v]) => (
              <div key={r} className="rounded-2xl bg-white/12 px-3 py-2">
                <p className="text-[11px] text-white/75">{r}</p>
                <p className="text-sm font-semibold tabular-nums truncate">{v}</p>
              </div>
            ))}
          </div>
        </motion.div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 content-start">
          <Kpi rotulo="Reuniões marcadas" valor={t.marcadas} detalhe="agendadas no mês" />
          <Kpi rotulo="Reuniões feitas" valor={t.feitas} detalhe="realizadas no mês" />
          <Kpi rotulo="Vendas" valor={t.vendas} detalhe={t.vendas ? `${formatarReal(t.mensalidade)} em mensalidades` : 'nenhuma ainda'} cor="text-emerald-600 dark:text-emerald-400" />
          <Kpi rotulo="Contratos" valor={formatarReal(t.contratos)} detalhe={t.adicionais ? `${formatarReal(t.adicionais)} em adicionais` : 'mensalidade + adicionais'} />
          <div className="col-span-2 xl:col-span-4 rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Taxa rotulo="Comparecimento · feitas ÷ marcadas" valor={resultado.taxas.comparecimento} texto={formatarPct(resultado.taxas.comparecimento)} explicacao="Mostra quantos leads realmente aparecem" />
            <Taxa rotulo="Conversão · vendas ÷ feitas" valor={resultado.taxas.conversao} texto={formatarPct(resultado.taxas.conversao)} explicacao="Mostra a eficiência na reunião" />
          </div>
        </div>
      </div>

      {/* Evolução no ano */}
      <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Comissão no ano · {mes.slice(0, 4)}</h3>
          <span className="text-sm text-slate-500 dark:text-zinc-400 tabular-nums">Total {formatarReal(anual.reduce((s, v) => s + v, 0))}</span>
        </div>
        <div className="mt-4 grid grid-cols-12 gap-1.5 sm:gap-3 items-end h-36">
          {anual.map((v, i) => {
            const m = `${mes.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`;
            const atual = m === mes;
            return (
              <button key={m} type="button" onClick={() => onMes?.(m)} title={`${MESES[i]}: ${formatarReal(v)}`} className="h-full flex flex-col justify-end items-center gap-1.5 cursor-pointer group">
                <span className={`text-[10px] tabular-nums ${atual ? 'font-semibold text-rm-acento dark:text-rm-acento-vivo' : 'text-slate-400'} hidden sm:block`}>{v ? formatarReal(v).replace(',00', '') : ''}</span>
                <motion.span
                  className={`w-full rounded-t-lg ${atual ? 'bg-rm-acento-medio' : 'bg-rm-acento-medio/25 group-hover:bg-rm-acento-medio/50'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(v ? 6 : 2, (v / maiorAno) * 100)}%` }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.7, delay: i * 0.02 }}
                />
                <span className={`text-[11px] ${atual ? 'font-semibold' : 'text-slate-500 dark:text-zinc-400'}`}>{MESES_CURTOS[i]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Ranking da equipe */}
      {!sozinho && vendedor === '__todos__' && (
        <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="font-semibold">Equipe no mês</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Clique num vendedor para ver o dia a dia dele.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 dark:text-zinc-400">
                <tr className="text-left">
                  {['Vendedor', 'Marcadas', 'Feitas', 'Vendas', 'Comparec.', 'Conversão', 'Contratos', 'Comissão'].map((h) => (
                    <th key={h} className="px-5 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {ranking.map((p, i) => {
                  const maior = ranking[0]?.totais.comissao || 1;
                  return (
                    <tr key={p.email} onClick={() => setVendedor(p.email)} className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5 font-medium">
                          <span className="w-7 text-xs text-slate-400 tabular-nums">{i + 1}º</span>
                          <span className="w-8 h-8 rounded-full bg-rm-acento-medio/15 text-rm-acento dark:text-rm-acento-vivo text-[11px] font-bold flex items-center justify-center">{iniciais(p.nome)}</span>
                          {p.nome}
                        </span>
                      </td>
                      <td className="px-5 py-3 tabular-nums">{p.totais.marcadas}</td>
                      <td className="px-5 py-3 tabular-nums">{p.totais.feitas}</td>
                      <td className="px-5 py-3 tabular-nums">{p.totais.vendas}</td>
                      <td className="px-5 py-3 tabular-nums">{formatarPct(p.taxas.comparecimento)}</td>
                      <td className="px-5 py-3 tabular-nums">{formatarPct(p.taxas.conversao)}</td>
                      <td className="px-5 py-3 tabular-nums">{formatarReal(p.totais.contratos)}</td>
                      <td className="px-5 py-3 min-w-[180px]">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{formatarReal(p.totais.comissao)}</span>
                          <span className="flex-1 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden">
                            <span className="block h-full rounded-full bg-rm-acento-medio" style={{ width: `${Math.round((p.totais.comissao / maior) * 100)}%` }} />
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Dia a dia (como a planilha) */}
      <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro overflow-hidden">
        <div className="p-5 pb-3 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h3 className="font-semibold">Dia a dia</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Marcadas pela data em que foram agendadas; feitas pela data da reunião.</p>
          </div>
          <button type="button" onClick={() => setTodosDias((v) => !v)} className="h-8 px-3 rounded-full text-xs font-medium bg-black/[0.05] dark:bg-white/[0.08] cursor-pointer">
            {todosDias ? 'Só dias com atividade' : 'Mostrar todos os dias'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead className="text-xs text-slate-500 dark:text-zinc-400 bg-black/[0.02] dark:bg-white/[0.03]">
              <tr className="text-left">
                {['Data', 'Marcadas', 'Feitas', 'Vendas', 'Mensalidade', 'Adicionais', 'Total contrato', 'Comissão'].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {dias.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma atividade neste mês.
                  </td>
                </tr>
              )}
              {dias.map((d) => {
                const fds = ['sáb.', 'dom.'].includes(diaDaSemana(d.data));
                return (
                  <tr key={d.data} className={`${d.data === hoje ? 'bg-rm-acento-medio/[0.06]' : fds ? 'bg-black/[0.015] dark:bg-white/[0.02] text-slate-500' : ''} align-top`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium tabular-nums">{d.data.slice(8, 10)}/{d.data.slice(5, 7)}</span> <span className="text-xs text-slate-400">{d.dia}</span>
                      {d.data === hoje && <span className="ml-1.5 text-[10px] font-bold uppercase text-rm-acento dark:text-rm-acento-vivo">hoje</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-start gap-2">
                        <span className="tabular-nums font-semibold w-5">{d.marcadas.length || ''}</span>
                        <Nomes lista={d.marcadas} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-start gap-2">
                        <span className="tabular-nums font-semibold w-5">{d.feitas.length || ''}</span>
                        <Nomes lista={d.feitas} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-start gap-2">
                        <span className="tabular-nums font-semibold w-5 text-emerald-600 dark:text-emerald-400">{d.vendas.length || ''}</span>
                        <Nomes lista={d.vendas} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{d.mensalidade ? formatarReal(d.mensalidade) : ''}</td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{d.adicionais ? formatarReal(d.adicionais) : ''}</td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{d.total ? formatarReal(d.total) : ''}</td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap font-semibold">{d.comissao ? formatarReal(d.comissao) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-sm font-semibold bg-black/[0.03] dark:bg-white/[0.04]">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 tabular-nums">{t.marcadas}</td>
                <td className="px-4 py-3 tabular-nums">{t.feitas}</td>
                <td className="px-4 py-3 tabular-nums">{t.vendas}</td>
                <td className="px-4 py-3 tabular-nums">{formatarReal(t.mensalidade)}</td>
                <td className="px-4 py-3 tabular-nums">{formatarReal(t.adicionais)}</td>
                <td className="px-4 py-3 tabular-nums">{formatarReal(t.contratos)}</td>
                <td className="px-4 py-3 tabular-nums text-rm-acento dark:text-rm-acento-vivo">{formatarReal(t.comissao)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Vendas do mês */}
      <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro overflow-hidden">
        <div className="p-5 pb-3 flex items-center justify-between">
          <h3 className="font-semibold">Vendas do mês</h3>
          <span className="text-sm text-slate-500 dark:text-zinc-400">{resultado.vendas.length} {resultado.vendas.length === 1 ? 'venda' : 'vendas'}</span>
        </div>
        {resultado.vendas.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500 dark:text-zinc-400">Nenhuma venda ainda. Marque “Ganho” numa oportunidade do processo comercial ou use “+ Registrar venda”.</p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {resultado.vendas.map((v) => (
              <li key={v.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-14 text-sm tabular-nums text-slate-500">
                  {String(v.data).slice(8, 10)}/{String(v.data).slice(5, 7)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{v.empresa}</span>
                  <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{[v.contato, v.vendedor_nome, v.origem_tipo === 'reuniao' ? 'da reunião' : v.origem_tipo === 'lead' ? 'do lead' : null].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-sm tabular-nums text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                  {formatarReal(v.mensalidade)}
                  {Number(v.adicionais) ? ` + ${formatarReal(v.adicionais)}` : ''}
                </span>
                <span className="w-28 text-right font-semibold tabular-nums">{formatarReal((Number(v.mensalidade) || 0) + (Number(v.adicionais) || 0))}</span>
                {podeMexer(v) && (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => setVendaAberta({ venda: v })} className="h-8 px-3 rounded-full text-xs font-medium bg-black/[0.05] dark:bg-white/[0.08] cursor-pointer">
                      Editar
                    </button>
                    <button type="button" onClick={() => setExcluindo(v)} className="h-8 px-3 rounded-full text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 cursor-pointer">
                      Excluir
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {vendaAberta && (
        <VendaModal
          venda={vendaAberta.venda || null}
          inicial={vendaAberta.nova ? { vendedor_email: alvo || dados.eu } : {}}
          vendedores={dados.todosVendedores || equipe}
          gestor={dados.gestor}
          eu={dados.eu}
          regras={dados.regras}
          onFechar={() => setVendaAberta(null)}
          onSalva={() => {
            setVendaAberta(null);
            showToast('Venda salva.', 'success');
            carregar();
          }}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(excluindo)}
        title="Excluir venda?"
        message={excluindo ? `A venda de “${excluindo.empresa}” sai da comissão e dos relatórios.` : ''}
        confirmText="Excluir"
        variant="danger"
        onClose={() => setExcluindo(null)}
        onConfirm={async () => {
          try {
            await excluirVenda(excluindo.id);
            showToast('Venda excluída.', 'success');
            carregar();
          } catch (e) {
            showToast(e.message, 'error');
          }
          setExcluindo(null);
        }}
      />
    </div>
  );
}
