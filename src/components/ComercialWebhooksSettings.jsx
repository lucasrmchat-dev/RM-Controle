'use client';
import { DESFECHOS_COMERCIAIS } from '@/lib/comercial';
import { CAMPOS_WEBHOOK } from '@/lib/webhooksComercial';
import { useCallback, useEffect, useRef, useState } from 'react';
import { classeCampo } from './NovaEmpresaCampos';
const API = '/api/integracoes/comercial/config';
const condicaoNova = () => ({
  campo: 'ticket.lastMessage',
  operador: 'contem',
  combinacao: 'qualquer',
  ui_id: crypto.randomUUID(),
  valores: [''],
});
const prepararForm = (i) => ({
  ...i,
  regras: i.regras.map((r) => ({
    ...r,
    ui_id: crypto.randomUUID(),
    condicoes: r.condicoes.map((c) => ({ ...c, ui_id: crypto.randomUUID() })),
  })),
});
const classeBotao =
  'px-4 py-2 rounded-full border border-black/10 dark:border-white/15 text-sm cursor-pointer disabled:opacity-50';
async function api(body) {
  const r = await fetch(API, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.mensagem || 'Não foi possível carregar os webhooks.');
  return j;
}
export default function ComercialWebhooksSettings({ config }) {
  const [lista, setLista] = useState([]);
  const [recentes, setRecentes] = useState([]);
  const [form, setForm] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [token, setToken] = useState('');
  const conexao = useRef(null);
  useEffect(() => {
    if (token)
      conexao.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
  }, [token]);
  const [origem, setOrigem] = useState('');
  const [pronto, setPronto] = useState(false);
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const j = await api();
      setLista(j.integracoes);
      setRecentes(j.recentes);
      setPronto(true);
    } catch (e) {
      setErro(e.message);
      setPronto(false);
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    setOrigem(window.location.origin);
    carregar();
  }, [carregar]);
  const mudar = (campos) => setForm((f) => ({ ...f, ...campos }));
  const regraMudar = (i, campos) =>
    mudar({ regras: form.regras.map((r, j) => (j === i ? { ...r, ...campos } : r)) });
  const condicaoMudar = (i, j, campos) =>
    regraMudar(i, {
      condicoes: form.regras[i].condicoes.map((c, k) => (k === j ? { ...c, ...campos } : c)),
    });
  const salvar = async (girar = false) => {
    if (salvando) return;
    setSalvando(true);
    setErro('');
    try {
      const j = await api(girar ? { acao: 'girar_token', id: form.id } : form);
      setForm(prepararForm(j.integracao));
      setToken(j.token || '');
      setLista((l) => [...l.filter((x) => x.id !== j.integracao.id), j.integracao]);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };
  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      setErro('Selecione o texto e copie manualmente.');
    }
  };
  const pipeline = config.pipelines.find((p) => p.id === form?.pipeline_id);
  const etapas = [...(pipeline?.etapas || []), ...DESFECHOS_COMERCIAIS];
  return (
    <section className="border-t border-black/10 dark:border-white/15 pt-8 space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Webhooks do RM Chat</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Receba leads e mova as etapas conforme os dados dos tickets.
          </p>
        </div>
        <button
          type="button"
          disabled={
            !pronto || carregando || !config.pipelines.length || !config.departamentos.length
          }
          className={classeBotao}
          onClick={() => {
            setToken('');
            setForm({
              nome: '',
              ativo: true,
              pipeline_id: config.pipelines[0]?.id,
              departamento: config.departamentos[0],
              etapa_inicial_id: config.pipelines[0]?.etapas[0]?.id,
              regras: [],
            });
          }}
        >
          + Novo webhook
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-zinc-400">
        Escolha um nome e onde os leads devem entrar. Clique em “Gerar webhook e token” e copie os
        dois dados para o RM Chat. As regras abaixo definem as próximas etapas.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {erro}
        </p>
      )}
      {carregando ? (
        <div
          role="status"
          aria-label="Carregando webhooks"
          className="h-20 animate-pulse rounded-xl bg-black/5 dark:bg-white/10"
        />
      ) : !pronto ? (
        <button type="button" className={classeBotao} onClick={carregar}>
          Tentar novamente
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {lista.map((i) => (
            <button
              type="button"
              key={i.id}
              className={classeBotao}
              onClick={() => {
                setToken('');
                setForm(prepararForm(i));
              }}
            >
              {i.nome} · {i.ativo ? 'Ativa' : 'Pausada'}
            </button>
          ))}
        </div>
      )}
      {form && (
        <fieldset
          disabled={salvando}
          className="rounded-2xl border border-black/10 dark:border-white/15 p-4 sm:p-6 space-y-5 disabled:opacity-60"
        >
          {form.id && (
            <div
              ref={conexao}
              className="space-y-3 rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.025] dark:bg-white/[0.04] p-4 scroll-mt-24"
            >
              <p className="font-semibold text-sm">1. Cole em “Webhook (novo)” no RM Chat</p>
              <div className="flex flex-wrap gap-2">
                <code className="text-xs break-all flex-1">
                  {origem}/api/integracoes/comercial/webhook/{form.id}
                </code>
                <button
                  type="button"
                  className={classeBotao}
                  onClick={() => copiar(`${origem}/api/integracoes/comercial/webhook/${form.id}`)}
                >
                  Copiar URL
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                No RM Chat, cole esta URL no campo “Webhook (novo)”. Os eventos serão enviados para
                a RM Controle.
              </p>
              {origem.includes('localhost') && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Você está no localhost. Para receber eventos do RM Chat, copie a URL pela versão
                  publicada do sistema.
                </p>
              )}
              {token ? (
                <div className="rounded-xl p-3 bg-amber-500/10 space-y-2">
                  <p className="text-xs font-medium">
                    2. Cole este token em “Token Autenticação” no RM Chat. Copie agora: ele não será
                    exibido novamente.
                  </p>
                  <code className="block text-xs break-all select-all">{token}</code>
                  <button type="button" className={classeBotao} onClick={() => copiar(token)}>
                    Copiar token de autenticação
                  </button>
                  <button type="button" className={classeBotao} onClick={() => setToken('')}>
                    Ocultar
                  </button>
                </div>
              ) : (
                <details>
                  <summary className="text-xs cursor-pointer">Substituir token de acesso</summary>
                  <p className="text-xs mt-2">
                    O token atual deixará de funcionar. Atualize o RM Chat após gerar o novo.
                  </p>
                  <button
                    type="button"
                    className={`${classeBotao} mt-2`}
                    onClick={() => salvar(true)}
                  >
                    Gerar novo token e invalidar o anterior
                  </button>
                </details>
              )}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-xs font-medium">
              Nome do webhook
              <input
                value={form.nome}
                maxLength={80}
                onChange={(e) => mudar({ nome: e.target.value })}
                className={`${classeCampo} mt-2`}
                placeholder="Ex.: RM Chat — Novos negócios"
              />
            </label>
            <label className="text-xs font-medium">
              Departamento
              <select
                value={form.departamento}
                onChange={(e) => mudar({ departamento: e.target.value })}
                className={`${classeCampo} mt-2`}
              >
                {config.departamentos.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Pipeline
              <select
                value={form.pipeline_id}
                onChange={(e) => {
                  const p = config.pipelines.find((p) => p.id === e.target.value);
                  mudar({
                    pipeline_id: p.id,
                    etapa_inicial_id: p.etapas[0].id,
                    regras: form.regras.map((r) => ({ ...r, etapa_id: p.etapas[0].id })),
                  });
                }}
                className={`${classeCampo} mt-2`}
              >
                {config.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Etapa de entrada
              <select
                value={form.etapa_inicial_id}
                onChange={(e) => mudar({ etapa_inicial_id: e.target.value })}
                className={`${classeCampo} mt-2`}
              >
                {pipeline?.etapas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => mudar({ ativo: e.target.checked })}
              />
              Receber eventos desta integração
            </label>
          </div>
          <div>
            <h4 className="font-semibold text-sm">Regras de movimentação</h4>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              A primeira regra correspondente vence. Sem correspondência, um lead novo entra na
              etapa inicial; um existente mantém sua etapa. Comparações ignoram maiúsculas, acentos
              e espaços repetidos.
            </p>
          </div>
          {form.regras.map((r, i) => (
            <div
              key={r.ui_id}
              className="rounded-xl bg-black/[0.025] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">Regra {i + 1}</span>
                <input
                  aria-label={`Nome da regra ${i + 1}`}
                  value={r.nome}
                  onChange={(e) => regraMudar(i, { nome: e.target.value })}
                  placeholder="Nome da regra"
                  className={`${classeCampo} flex-1 min-w-40`}
                />
                <button
                  type="button"
                  disabled={!i}
                  className={classeBotao}
                  onClick={() => {
                    const regras = [...form.regras];
                    [regras[i - 1], regras[i]] = [regras[i], regras[i - 1]];
                    mudar({ regras });
                  }}
                >
                  ↑ Prioridade
                </button>
                <button
                  type="button"
                  className={classeBotao}
                  onClick={() => mudar({ regras: form.regras.filter((_, j) => j !== i) })}
                >
                  Remover regra
                </button>
              </div>
              <label className="block text-xs font-medium">
                Aplicar quando
                <select
                  value={r.modo}
                  onChange={(e) => regraMudar(i, { modo: e.target.value })}
                  className={`${classeCampo} mt-1`}
                >
                  <option value="todas">Todas as condições corresponderem (E)</option>
                  <option value="qualquer">Qualquer condição corresponder (OU)</option>
                </select>
              </label>
              {r.condicoes.map((c, j) => (
                <div
                  key={c.ui_id}
                  className="grid sm:grid-cols-2 gap-3 border-t border-black/10 dark:border-white/10 pt-3"
                >
                  <label className="text-xs">
                    Variável
                    <input
                      aria-label={`Variável da condição ${j + 1} da regra ${i + 1}`}
                      value={c.campo}
                      onChange={(e) => condicaoMudar(i, j, { campo: e.target.value })}
                      className={`${classeCampo} mt-1 font-mono`}
                      placeholder="ticket.lastMessage"
                    />
                  </label>
                  <label className="text-xs">
                    Comparação
                    <select
                      value={c.operador}
                      onChange={(e) =>
                        condicaoMudar(i, j, { operador: e.target.value, combinacao: 'qualquer' })
                      }
                      className={`${classeCampo} mt-1`}
                    >
                      <option value="igual">É igual a</option>
                      <option value="contem">Contém</option>
                    </select>
                  </label>
                  <label className="text-xs">
                    Palavras ou frases — uma por linha
                    <textarea
                      aria-label={`Termos da condição ${j + 1} da regra ${i + 1}`}
                      rows={3}
                      value={c.valores.join('\n')}
                      onChange={(e) => condicaoMudar(i, j, { valores: e.target.value.split('\n') })}
                      className={`${classeCampo} h-auto py-2 mt-1`}
                      placeholder={'azul\nquero uma demonstração\npreciso de uma proposta'}
                    />
                  </label>
                  <div className="space-y-3">
                    <label className="block text-xs">
                      Comparar com
                      <select
                        value={c.combinacao}
                        disabled={c.operador === 'igual'}
                        onChange={(e) => condicaoMudar(i, j, { combinacao: e.target.value })}
                        className={`${classeCampo} mt-1`}
                      >
                        <option value="qualquer">Qualquer termo (OU)</option>
                        <option value="todos">Todos os termos (E)</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={r.condicoes.length === 1}
                      className={classeBotao}
                      onClick={() =>
                        regraMudar(i, { condicoes: r.condicoes.filter((_, k) => k !== j) })
                      }
                    >
                      Remover condição
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 items-end">
                <button
                  type="button"
                  className={classeBotao}
                  onClick={() => regraMudar(i, { condicoes: [...r.condicoes, condicaoNova()] })}
                >
                  + Condição
                </button>
                <label className="flex-1 min-w-40 text-xs font-medium">
                  Mover para
                  <select
                    value={r.etapa_id}
                    onChange={(e) => regraMudar(i, { etapa_id: e.target.value })}
                    className={`${classeCampo} mt-1`}
                  >
                    {etapas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-500 dark:text-zinc-400 break-words">
            Variáveis frequentes: {CAMPOS_WEBHOOK.join(', ')}. Também aceita outros caminhos do
            JSON, como ticket.contact.customFields.interesse.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={classeBotao}
              onClick={() =>
                mudar({
                  regras: [
                    ...form.regras,
                    {
                      nome: '',
                      ui_id: crypto.randomUUID(),
                      etapa_id: form.etapa_inicial_id,
                      modo: 'todas',
                      condicoes: [condicaoNova()],
                    },
                  ],
                })
              }
            >
              + Regra
            </button>
            <button
              type="button"
              onClick={() => salvar()}
              className="px-5 py-2 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-black text-sm cursor-pointer"
            >
              {salvando ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Gerar webhook e token'}
            </button>
          </div>
        </fieldset>
      )}
      {recentes.length > 0 && (
        <details>
          <summary className="text-sm font-medium cursor-pointer">
            Últimos eventos recebidos
          </summary>
          <div className="mt-3 space-y-2">
            {recentes.map((e) => (
              <p key={e.id} className="text-xs text-slate-500 dark:text-zinc-400">
                {new Date(e.recebido_em).toLocaleString('pt-BR')} · Ticket {e.externo_id} ·{' '}
                {e.resultado?.ignorado
                  ? 'Evento antigo ignorado'
                  : e.resultado?.criado
                    ? 'Lead criado'
                    : 'Lead atualizado'}{' '}
                · {e.evento}
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
