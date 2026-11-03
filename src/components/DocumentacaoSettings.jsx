'use client';

import { APIS_EXTERNAS } from '@/lib/documentacao';
import { ERROS_CHAT, ERRO_CHAT_DESCONHECIDO } from '@/lib/errosChat';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

/**
 * Configurações › Documentação (administradores): códigos de erro do Chat e APIs usadas por outros
 * sistemas (endereços, como mandar o token, exemplos e erros). Só explica: gerar token fica nas abas de cada integração.
 */

const SECOES = [
  { id: 'erros', rotulo: 'Erros do Chat' },
  { id: 'apis', rotulo: 'APIs e tokens' },
];

const json = (valor) => JSON.stringify(valor, null, 2);

function Cartao({ titulo, descricao, rotulo, children }) {
  return (
    <section className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-sm space-y-4">
      <div>
        {rotulo && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-rm-acento dark:text-rm-acento-escuro">
            {rotulo}
          </span>
        )}
        <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">{titulo}</h4>
        {descricao && (
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
            {descricao}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Codigo({ children }) {
  return (
    <pre className="rounded-2xl bg-black/[0.035] dark:bg-white/[0.06] px-4 py-3 text-[11.5px] leading-relaxed font-mono text-[#1d1d1f] dark:text-[#f5f5f7] overflow-x-auto whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

function ErrosChat() {
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const todos = [...ERROS_CHAT, ERRO_CHAT_DESCONHECIDO];
    if (!termo) return todos;
    return todos.filter((e) =>
      [e.codigo, e.titulo, e.explicacao, e.oQueFazer, e.paraDev].some((t) =>
        t.toLowerCase().includes(termo),
      ),
    );
  }, [busca]);

  return (
    <Cartao
      titulo="Códigos de erro do Chat"
      descricao="Quando uma mensagem não é enviada, a exclamação vermelha mostra um destes códigos. A equipe vê a explicação simples; o desenvolvimento usa a coluna “O que verificar”."
    >
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por código ou palavra (ex.: CHAT-101, desconectado)"
        className="w-full h-11 px-4 rounded-full border border-black/10 dark:border-white/10 bg-transparent text-sm text-[#1d1d1f] dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rm-acento/40"
      />
      <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        {lista.map((e) => (
          <li key={e.codigo} className="py-4 grid gap-1.5 sm:grid-cols-[110px_1fr] sm:gap-4">
            <span className="self-start inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-mono font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 w-fit">
              {e.codigo}
            </span>
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">{e.titulo}</p>
              <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                {e.explicacao}
              </p>
              <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                <span className="font-semibold">O que fazer: </span>
                {e.oQueFazer}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                <span className="font-semibold">O que verificar (desenvolvimento): </span>
                {e.paraDev}
              </p>
            </div>
          </li>
        ))}
        {!lista.length && (
          <li className="py-6 text-sm text-slate-500 dark:text-zinc-400">
            Nenhum erro com esse termo.
          </li>
        )}
      </ul>
    </Cartao>
  );
}

function Api({ api, origem, onIrPara }) {
  return (
    <Cartao rotulo="API" titulo={api.titulo} descricao={api.resumo}>
      <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          Como conseguir o token
        </p>
        <p className="text-xs text-slate-600 dark:text-zinc-300">{api.token.onde}</p>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-[#1d1d1f] dark:text-[#f5f5f7]">
          {api.token.passos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        {api.token.observacao && (
          <p className="text-xs text-slate-500 dark:text-zinc-400">{api.token.observacao}</p>
        )}
        <button
          type="button"
          onClick={() => onIrPara(api.token.aba)}
          className="mt-1 px-4 py-2 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-xs font-semibold hover:opacity-85 transition-opacity cursor-pointer"
        >
          Abrir onde gera o token
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          Autenticação
        </p>
        <Codigo>{api.autenticacao}</Codigo>
      </div>

      {api.rotas.map((r) => (
        <details
          key={r.caminho}
          className="group rounded-2xl border border-black/[0.08] dark:border-white/[0.1] px-4 py-3"
        >
          <summary className="cursor-pointer select-none flex items-center gap-2 text-sm text-[#1d1d1f] dark:text-white">
            <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-rm-acento/12 text-rm-acento dark:text-rm-acento-vivo">
              {r.metodo}
            </span>
            <code className="font-mono text-[12px] break-all">{r.caminho}</code>
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600 dark:text-zinc-300">{r.descricao}</p>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Endereço completo
              </p>
              <Codigo>{`${origem}${r.caminho}`}</Codigo>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Exemplo de corpo (JSON)
              </p>
              <Codigo>{json(r.corpo)}</Codigo>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                Exemplo de resposta
              </p>
              <Codigo>{json(r.resposta)}</Codigo>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-zinc-300">
              {r.notas.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </details>
      ))}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          Respostas de erro
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {api.erros.map(([status, codigo, significado]) => (
                <tr key={status + codigo}>
                  <td className="py-2 pr-3 font-mono font-semibold text-[#1d1d1f] dark:text-white whitespace-nowrap align-top">
                    {status}
                  </td>
                  <td className="py-2 pr-3 font-mono text-slate-500 dark:text-zinc-400 align-top">
                    {codigo}
                  </td>
                  <td className="py-2 text-slate-600 dark:text-zinc-300 align-top">
                    {significado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Cartao>
  );
}

export default function DocumentacaoSettings({ onIrPara }) {
  const [secao, setSecao] = useState('erros');
  const origem = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <section className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-rm-cartao-escuro shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">Documentação</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Consulta para administradores: o que significa cada código de erro e como outros
            sistemas se conectam ao RM Controle.
          </p>
        </div>
        <div
          className="inline-flex p-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06]"
          role="tablist"
        >
          {SECOES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={secao === s.id}
              onClick={() => setSecao(s.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${secao === s.id ? 'bg-white dark:bg-white/[0.14] text-[#1d1d1f] dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'}`}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
      </section>

      {secao === 'erros' ? (
        <ErrosChat />
      ) : (
        APIS_EXTERNAS.map((api) => (
          <Api key={api.id} api={api} origem={origem} onIrPara={onIrPara} />
        ))
      )}
    </motion.div>
  );
}
