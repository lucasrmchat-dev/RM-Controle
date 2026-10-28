'use client';

import { useEffect, useState } from 'react';
import { REGRAS_PADRAO, VISIBILIDADES, formatarReal } from '@/lib/comissao';
import { fetchComissao, salvarRegrasComissao } from '@/lib/storage';
import { showToast } from './ToastNotification';

// ------------------------------------------------------------------------------
// Configurações › Comercial › Comissão e vendas: quanto vale cada reunião e cada venda (geral e por vendedor)
// e quem vê as vendas de quem. Administradores e gestores do comercial alteram; os demais só consultam.
// ------------------------------------------------------------------------------
const campo = 'w-full h-10 px-3 rounded-xl bg-white dark:bg-rm-campo-escuro border border-black/[0.1] dark:border-white/[0.12] text-sm outline-none focus:border-rm-acento-medio focus:ring-2 focus:ring-rm-acento-medio/20 disabled:opacity-60';
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

function Segmentos({ valor, opcoes, onMudar, desativado }) {
  return (
    <div className="inline-flex p-0.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.06]">
      {opcoes.map(([id, rot]) => (
        <button key={id} type="button" disabled={desativado} onClick={() => onMudar(id)} className={`h-9 px-4 rounded-[10px] text-sm font-medium cursor-pointer disabled:cursor-default ${valor === id ? 'bg-white dark:bg-rm-elevado-escuro shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}>
          {rot}
        </button>
      ))}
    </div>
  );
}

export default function ComissaoSettings() {
  const [regras, setRegras] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [pode, setPode] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetchComissao(mesAtual())
      .then((r) => {
        setRegras({ ...REGRAS_PADRAO, ...r.regras });
        setVendedores(r.todosVendedores || r.vendedores || []);
        setPode(Boolean(r.gestor));
      })
      .catch((e) => setErro(e.message));
  }, []);

  if (erro) return <p className="p-6 rounded-2xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm">{erro}</p>;
  if (!regras) return <div className="h-64 rounded-3xl animate-pulse bg-black/5 dark:bg-white/10" />;

  const mudar = (campos) => setRegras((r) => ({ ...r, ...campos }));
  const mudarVendedor = (email, campos) =>
    setRegras((r) => {
      const atual = { ...(r.por_vendedor?.[email] || {}), ...campos };
      Object.keys(atual).forEach((k) => (atual[k] === '' || atual[k] === undefined) && delete atual[k]);
      const por = { ...(r.por_vendedor || {}) };
      if (Object.keys(atual).length) por[email] = atual;
      else delete por[email];
      return { ...r, por_vendedor: por };
    });
  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await salvarRegrasComissao(regras);
      setRegras({ ...REGRAS_PADRAO, ...r.regras });
      showToast('Regras de comissão salvas.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Comissão e vendas</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Quanto vale cada reunião e cada venda, e quem vê as vendas de quem. A comissão do mês se calcula sozinha em Comercial › Comissão e vendas.</p>
        {!pode && <p className="mt-3 px-4 py-2.5 rounded-xl bg-amber-500/12 text-amber-800 dark:text-amber-300 text-sm">Só administradores e gestores do comercial alteram estas regras. Você pode consultá-las.</p>}
      </div>

      <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro p-5 space-y-5">
        <h3 className="font-semibold">Regra geral</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block text-xs font-medium">
            Valor por reunião (R$)
            <input inputMode="decimal" disabled={!pode} value={regras.valor_reuniao} onChange={(e) => mudar({ valor_reuniao: e.target.value })} className={`${campo} mt-1.5 tabular-nums`} />
          </label>
          <div className="text-xs font-medium">
            Pagar reunião por
            <div className="mt-1.5">
              <Segmentos desativado={!pode} valor={regras.pagar_por} onMudar={(v) => mudar({ pagar_por: v })} opcoes={[['marcada', 'Marcada'], ['feita', 'Feita']]} />
            </div>
            <p className="mt-1 font-normal text-slate-500 dark:text-zinc-400">{regras.pagar_por === 'feita' ? 'Só reuniões que aconteceram.' : 'Toda reunião agendada, mesmo que aconteça outro dia.'}</p>
          </div>
          <label className="block text-xs font-medium">
            Valor por venda fechada (R$)
            <input inputMode="decimal" disabled={!pode} value={regras.valor_venda} onChange={(e) => mudar({ valor_venda: e.target.value })} className={`${campo} mt-1.5 tabular-nums`} />
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro overflow-hidden">
        <div className="p-5 pb-3">
          <h3 className="font-semibold">Por vendedor</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Deixe em branco para usar a regra geral. Vendedores são todos da equipe com acesso ao Comercial.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="text-xs text-slate-500 dark:text-zinc-400 text-left">
              <tr>
                <th className="px-5 py-2 font-medium">Vendedor</th>
                <th className="px-3 py-2 font-medium">Por reunião</th>
                <th className="px-3 py-2 font-medium">Paga por</th>
                <th className="px-3 py-2 font-medium">Por venda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {vendedores.map((v) => {
                const p = regras.por_vendedor?.[v.email] || {};
                return (
                  <tr key={v.email}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{v.nome}</span>
                      <span className="block text-xs text-slate-500 dark:text-zinc-400">{v.email}</span>
                    </td>
                    <td className="px-3 py-2.5 w-36">
                      <input inputMode="decimal" disabled={!pode} value={p.valor_reuniao ?? ''} placeholder={formatarReal(regras.valor_reuniao)} onChange={(e) => mudarVendedor(v.email, { valor_reuniao: e.target.value })} className={`${campo} tabular-nums`} />
                    </td>
                    <td className="px-3 py-2.5 w-44">
                      <select disabled={!pode} value={p.pagar_por || ''} onChange={(e) => mudarVendedor(v.email, { pagar_por: e.target.value })} className={campo}>
                        <option value="">Regra geral ({regras.pagar_por === 'feita' ? 'feita' : 'marcada'})</option>
                        <option value="marcada">Marcada</option>
                        <option value="feita">Feita</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 w-36">
                      <input inputMode="decimal" disabled={!pode} value={p.valor_venda ?? ''} placeholder={formatarReal(regras.valor_venda)} onChange={(e) => mudarVendedor(v.email, { valor_venda: e.target.value })} className={`${campo} tabular-nums`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro p-5 space-y-3">
        <div>
          <h3 className="font-semibold">Quem vê as vendas</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Administradores e perfis com “Comercial: gestor da equipe” sempre veem tudo. Isto vale para os demais vendedores.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {VISIBILIDADES.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={!pode}
              onClick={() => mudar({ visibilidade: v.id })}
              className={`text-left rounded-2xl p-4 border cursor-pointer disabled:cursor-default transition-colors ${regras.visibilidade === v.id ? 'border-rm-acento-medio ring-2 ring-rm-acento-medio/25 bg-rm-acento-medio/[0.05]' : 'border-black/[0.08] dark:border-white/[0.12] hover:border-black/20'}`}
            >
              <span className="flex items-center gap-2 font-semibold text-sm">
                <span className={`w-4 h-4 rounded-full border-2 ${regras.visibilidade === v.id ? 'border-rm-acento-medio bg-rm-acento-medio shadow-[inset_0_0_0_2px_white]' : 'border-slate-300'}`} />
                {v.rotulo}
              </span>
              <span className="block mt-1.5 text-xs text-slate-500 dark:text-zinc-400">{v.descricao}</span>
            </button>
          ))}
        </div>
      </section>

      {pode && (
        <div className="flex justify-end">
          <button type="button" onClick={salvar} disabled={salvando} className="h-11 px-6 rounded-full text-sm font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer disabled:opacity-60">
            {salvando ? 'Salvando…' : 'Salvar regras'}
          </button>
        </div>
      )}
    </div>
  );
}
