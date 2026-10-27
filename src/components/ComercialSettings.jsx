'use client';
import { useEffect, useState } from 'react';
import ComercialWebhooksSettings from './ComercialWebhooksSettings';
import { fetchConfigComercial, salvarConfigComercial, getCategoriasDemandas } from '@/lib/storage';
import { CONFIG_COMERCIAL_PADRAO, DESFECHOS_COMERCIAIS } from '@/lib/comercial';
import { classeCampo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';
const novoId = () => crypto.randomUUID();

export default function ComercialSettings() {
  const [config, setConfig] = useState(CONFIG_COMERCIAL_PADRAO);
  const [departamentos, setDepartamentos] = useState(getCategoriasDemandas);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [leituraOk, setLeituraOk] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setLeituraOk(false);
    setErro('');
    fetchConfigComercial()
      .then((c) => {
        if (ativo) {
          setConfig(c);
          setLeituraOk(true);
        }
      })
      .catch((e) => {
        if (ativo) setErro(e.message);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    const atualizar = () => setDepartamentos(getCategoriasDemandas());
    window.addEventListener('departamentos_updated', atualizar);
    return () => {
      ativo = false;
      window.removeEventListener('departamentos_updated', atualizar);
    };
  }, [tentativa]);
  const mudarPipeline = (id, campos) =>
    setConfig((c) => ({
      ...c,
      pipelines: c.pipelines.map((p) => (p.id === id ? { ...p, ...campos } : p)),
    }));
  const salvar = async () => {
    if (salvando || !leituraOk) return;
    setSalvando(true);
    setErro('');
    try {
      setConfig(await salvarConfigComercial(config));
      showToast('Configuração comercial salva para a equipe.', 'success');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro p-5 sm:p-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Comercial e pipelines</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
          Escolha quais departamentos alimentam o Comercial e desenhe as etapas do acompanhamento.
        </p>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {erro}
        </p>
      )}
      {carregando ? (
        <div
          role="status"
          aria-label="Carregando configuração comercial"
          className="h-32 rounded-2xl bg-black/5 dark:bg-white/10 animate-pulse"
        />
      ) : !leituraOk ? (
        <button onClick={() => setTentativa((n) => n + 1)} className="underline cursor-pointer">
          Tentar novamente
        </button>
      ) : (
        <fieldset disabled={salvando} className="space-y-8 disabled:opacity-60">
          <div>
            <h3 className="font-semibold">Departamentos do Comercial</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 mb-4">
              A seleção vale também para reuniões já cadastradas. As permissões do perfil continuam
              sendo respeitadas.
            </p>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...departamentos, ...config.departamentos])].map((d) => (
                <label
                  key={d}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/15 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={config.departamentos.includes(d)}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        departamentos: e.target.checked
                          ? [...c.departamentos, d]
                          : c.departamentos.filter((x) => x !== d),
                      }))
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
            {!config.departamentos.length && (
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-3">
                Selecione ao menos um departamento para começar o acompanhamento.
              </p>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Pipelines</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                  Novas reuniões começam na primeira etapa da primeira pipeline. Depois, podem ser
                  movidas para outra pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    pipelines: [
                      ...c.pipelines,
                      {
                        id: novoId(),
                        nome: '',
                        etapas: [{ id: novoId(), nome: 'Primeiro contato' }],
                      },
                    ],
                  }))
                }
                className="shrink-0 text-sm font-medium px-4 py-2 rounded-full border border-black/10 dark:border-white/15 cursor-pointer"
              >
                + Pipeline
              </button>
            </div>
            {config.pipelines.map((p, pi) => (
              <div
                key={p.id}
                className="border border-black/10 dark:border-white/15 rounded-2xl p-4 sm:p-5 space-y-4"
              >
                <label className="block text-xs font-medium">
                  Nome da pipeline {pi + 1}
                  <input
                    aria-label={`Nome da pipeline ${pi + 1}`}
                    value={p.nome}
                    onChange={(e) => mudarPipeline(p.id, { nome: e.target.value })}
                    maxLength={80}
                    placeholder="Ex.: Novos negócios"
                    className={`${classeCampo} mt-2`}
                  />
                </label>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {p.etapas.map((e, i) => (
                    <label key={e.id} className="block text-xs text-slate-500 dark:text-zinc-400">
                      Etapa {i + 1}
                      <input
                        aria-label={`Etapa ${i + 1} de ${p.nome || `pipeline ${pi + 1}`}`}
                        value={e.nome}
                        maxLength={80}
                        onChange={(ev) =>
                          mudarPipeline(p.id, {
                            etapas: p.etapas.map((x) =>
                              x.id === e.id ? { ...x, nome: ev.target.value } : x,
                            ),
                          })
                        }
                        className={`${classeCampo} mt-1.5`}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      mudarPipeline(p.id, { etapas: [...p.etapas, { id: novoId(), nome: '' }] })
                    }
                    className="text-sm font-medium px-3 py-2 rounded-full border border-dashed border-black/20 dark:border-white/20 cursor-pointer"
                  >
                    + Etapa
                  </button>
                  {DESFECHOS_COMERCIAIS.map((e) => (
                    <span
                      key={e.id}
                      className="text-sm px-3 py-2 rounded-full bg-black/5 dark:bg-white/10"
                    >
                      {e.nome} · fixo
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={salvar}
              type="button"
              className="px-5 py-3 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-sm font-medium cursor-pointer"
            >
              {salvando ? 'Salvando…' : 'Salvar configuração'}
            </button>
          </div>
        </fieldset>
      )}
      {leituraOk && <ComercialWebhooksSettings config={config} />}
    </section>
  );
}
