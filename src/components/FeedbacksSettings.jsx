'use client';

import React, { useEffect, useState } from 'react';
import { fetchConfigFeedbacks, getCategoriasDemandas, getConfigFeedbacks, salvarConfigFeedbacks } from '@/lib/storage';
import { ETAPAS_FEEDBACK, NOMES_ETAPAS_PADRAO } from '@/lib/feedbacks';
import { Pilulas, Spinner } from './FormularioEtapas';
import { classeCampo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';

const PONTOS = {
  em_analise: 'bg-amber-500',
  no_roadmap: 'bg-violet-500',
  em_correcao: 'bg-sky-500',
  resolvido: 'bg-[#4d7c0f] dark:bg-[#84cc16]',
};

/** Configurações › Feedbacks: nomes das etapas do pipeline e quem forma a área de desenvolvimento. */
export default function FeedbacksSettings() {
  const [config, setConfig] = useState(getConfigFeedbacks);
  const [departamentos, setDepartamentos] = useState(getCategoriasDemandas);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetchConfigFeedbacks().then(setConfig);
    const atualizar = () => setDepartamentos(getCategoriasDemandas());
    window.addEventListener('departamentos_updated', atualizar);
    return () => window.removeEventListener('departamentos_updated', atualizar);
  }, []);

  const mudarEtapa = (id, nome) => setConfig((c) => ({ ...c, etapas: { ...c.etapas, [id]: nome } }));
  const alternarDep = (dep) =>
    setConfig((c) => ({
      ...c,
      departamentos_dev: c.departamentos_dev.includes(dep) ? c.departamentos_dev.filter((d) => d !== dep) : [...c.departamentos_dev, dep],
    }));

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      setConfig(await salvarConfigFeedbacks(config));
      showToast('Configuração de feedbacks salva para a equipe.', 'success');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1e1e21] p-5 sm:p-8 space-y-9">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Feedbacks</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-2xl">
          Defina quem trabalha nos feedbacks e como se chamam as etapas do pipeline. Todos continuam podendo enviar feedbacks e ver as novidades.
        </p>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold" id="fb-deps-dev">
          Área de desenvolvimento
        </h3>
        <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 mb-4 max-w-2xl leading-relaxed">
          Quem atende os departamentos marcados vê a visão de desenvolvimento: todos os feedbacks, o pipeline, prazos e subtarefas. Administradores sempre veem.
        </p>
        {departamentos.length ? (
          <Pilulas opcoes={departamentos} selecionadas={config.departamentos_dev} onAlternar={alternarDep} rotuloId="fb-deps-dev" cor="marca" />
        ) : (
          <p className="text-sm text-slate-500 dark:text-zinc-400">Cadastre os departamentos para escolher.</p>
        )}
        {!config.departamentos_dev.length && <p className="mt-3 text-[12.5px] text-amber-700 dark:text-amber-400">Nenhum departamento marcado: só administradores veem a visão de desenvolvimento.</p>}
      </div>

      <div>
        <h3 className="text-[15px] font-semibold">Etapas do pipeline</h3>
        <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 mb-4">Os nomes aparecem no pipeline, nos cards e nas notificações de quem enviou.</p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
          {ETAPAS_FEEDBACK.map((id, i) => (
            <li key={id}>
              <label htmlFor={`fb-etapa-${id}`} className="flex items-center gap-2 text-[12.5px] font-medium text-slate-500 dark:text-zinc-400 mb-1.5">
                <span className={`w-2 h-2 rounded-full ${PONTOS[id]}`} />
                Etapa {i + 1}
                {id === 'resolvido' && <span className="text-slate-400"> · final</span>}
              </label>
              <input id={`fb-etapa-${id}`} value={config.etapas[id]} onChange={(e) => mudarEtapa(id, e.target.value)} maxLength={40} placeholder={NOMES_ETAPAS_PADRAO[id]} className={classeCampo} />
            </li>
          ))}
        </ol>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {erro}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={salvar} disabled={salvando} className="h-11 px-5 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-sm font-medium disabled:opacity-50 cursor-pointer flex items-center gap-2">
          {salvando && <Spinner />}
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </section>
  );
}
