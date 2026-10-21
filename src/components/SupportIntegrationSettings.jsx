'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { getCategoriasDemandas } from '@/lib/storage';
import ConfirmModal from './ConfirmModal';
import { CheckIcon, CopyIcon } from './Icons';
import { showToast } from './ToastNotification';

const API_CONFIG = '/api/integracoes/suporte/config';

const CAMPOS_EDITAVEIS = ['ativo', 'limiar_sugestao', 'limiar_automatico', 'max_sugestoes', 'departamento_padrao', 'quando_nao_encontrar'];

async function chamarApi(metodo, corpo) {
  const res = await fetch(API_CONFIG, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const erro = new Error(json.mensagem || 'Falha ao comunicar com o servidor.');
    erro.status = res.status;
    throw erro;
  }
  return json;
}

function BotaoCopiar({ texto, rotulo = 'Copiar' }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
      }}
      aria-label={`${rotulo}: ${texto}`}
      className="flex-shrink-0 px-3 py-1.5 rounded-full border border-black/10 dark:border-white/10 text-[11px] font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1.5"
    >
      {copiado ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
      <span>{copiado ? 'Copiado' : rotulo}</span>
    </button>
  );
}

function Cartao({ titulo, descricao, children, rotulo }) {
  return (
    <section className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] shadow-sm space-y-4">
      <div>
        {rotulo && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d7c0f] dark:text-[#84cc16]">{rotulo}</span>
        )}
        <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-white">{titulo}</h4>
        {descricao && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

const ROTULO_DECISAO = {
  confirmado: { texto: 'Cria automaticamente', classe: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  confirmar: { texto: 'Cliente confirma a empresa', classe: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30' },
  nao_encontrado: { texto: 'Não encontrada — pede o nome de novo', classe: 'bg-slate-500/10 text-slate-600 dark:text-zinc-300 border-slate-500/25' },
};

export default function SupportIntegrationSettings() {
  const [estado, setEstado] = useState('carregando'); // carregando | pronto | erro | sem_permissao
  const [erroCarga, setErroCarga] = useState('');
  const [salva, setSalva] = useState(null);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [tokenGerado, setTokenGerado] = useState('');
  const [confirmarToken, setConfirmarToken] = useState(false);
  const [nomeTeste, setNomeTeste] = useState('');
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState(null);
  const [origem, setOrigem] = useState('');
  const departamentos = useMemo(() => getCategoriasDemandas(), []);

  const carregar = async () => {
    setEstado('carregando');
    try {
      const { config } = await chamarApi('GET');
      setSalva(config);
      setForm(config);
      setEstado('pronto');
    } catch (e) {
      setErroCarga(e.message);
      setEstado(e.status === 401 || e.status === 403 ? 'sem_permissao' : 'erro');
    }
  };

  useEffect(() => {
    setOrigem(window.location.origin);
    carregar();
  }, []);

  const alterado = useMemo(
    () => Boolean(form && salva && CAMPOS_EDITAVEIS.some((c) => form[c] !== salva[c])),
    [form, salva]
  );
  const limiaresInvalidos = form && Number(form.limiar_automatico) < Number(form.limiar_sugestao);

  const atualizar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const handleSalvar = async () => {
    if (limiaresInvalidos) return;
    setSalvando(true);
    try {
      const corpo = Object.fromEntries(CAMPOS_EDITAVEIS.map((c) => [c, form[c]]));
      const { config } = await chamarApi('PUT', corpo);
      setSalva(config);
      setForm(config);
      showToast('Configuração do suporte automático salva.', 'success');
    } catch (e) {
      // Mantém o que foi digitado para o usuário corrigir
      showToast(e.message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  const handleGerarToken = async () => {
    try {
      const { token, config } = await chamarApi('POST', { acao: 'gerar_token' });
      setTokenGerado(token);
      setSalva((s) => ({ ...s, ...pick(config) }));
      setForm((f) => ({ ...f, ...pick(config) }));
      showToast('Novo token gerado. Copie agora — ele não será exibido novamente.', 'warning');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setConfirmarToken(false);
    }
  };

  const handleTestar = async (e) => {
    e.preventDefault();
    if (nomeTeste.trim().length < 2) return;
    setTestando(true);
    try {
      const r = await chamarApi('POST', {
        acao: 'testar',
        nome: nomeTeste,
        limiar_sugestao: form.limiar_sugestao,
        limiar_automatico: form.limiar_automatico,
      });
      setResultadoTeste(r);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setTestando(false);
    }
  };

  if (estado === 'carregando') {
    return (
      <div role="status" className="rounded-3xl p-8 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] text-xs text-slate-500 dark:text-zinc-400">
        Carregando configuração do suporte automático…
      </div>
    );
  }

  if (estado === 'sem_permissao' || estado === 'erro') {
    return (
      <div role="alert" className="p-6 rounded-3xl border border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-3">
        <h4 className="font-bold text-sm">
          {estado === 'sem_permissao' ? 'Acesso restrito ao administrador' : 'Não foi possível carregar a configuração'}
        </h4>
        <p className="text-xs leading-relaxed">{erroCarga}</p>
        {estado === 'erro' && (
          <button type="button" onClick={carregar} className="px-4 py-2 rounded-full bg-black text-white dark:bg-white dark:text-black text-xs font-bold cursor-pointer">
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  const urlBuscar = `${origem}/api/integracoes/suporte/empresas/buscar`;
  const urlChamados = `${origem}/api/integracoes/suporte/chamados`;
  const sug = Number(form.limiar_sugestao);
  const auto = Number(form.limiar_automatico);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
      {/* Estado geral */}
      <section className="rounded-3xl p-6 border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1e1e21] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-white">Suporte Automático via API</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Quando o cliente escolher “Suporte” na outra plataforma, ela identifica a empresa e abre a demanda pendente
            na Fila Geral, com o resumo do pedido e o nome do contato.
          </p>
          {!salva.token_configurado && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Gere um token abaixo antes de ativar.</p>
          )}
        </div>
        <label className="relative inline-flex items-center gap-3 cursor-pointer flex-shrink-0">
          <span className="text-xs font-semibold">{form.ativo ? 'Ativo' : 'Desativado'}</span>
          <input
            type="checkbox"
            className="sr-only peer"
            checked={Boolean(form.ativo)}
            onChange={(e) => atualizar('ativo', e.target.checked)}
            aria-label="Ativar suporte automático via API"
          />
          <span className="w-14 h-8 bg-slate-200 dark:bg-zinc-800 rounded-full relative peer-checked:bg-[#4d7c0f] dark:peer-checked:bg-[#84cc16] after:content-[''] after:absolute after:top-1 after:left-1 after:w-6 after:h-6 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-6 peer-focus-visible:ring-2 peer-focus-visible:ring-[#4d7c0f]" />
        </label>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Credenciais */}
        <Cartao rotulo="Passo 1" titulo="Endereços e token de acesso" descricao="Cadastre estes dados na outra plataforma. Todas as chamadas usam POST com JSON.">
          <div className="space-y-2.5">
            {[
              ['Identificar empresa', urlBuscar],
              ['Abrir demanda', urlChamados],
            ].map(([rotulo, url]) => (
              <div key={url} className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">{rotulo}</span>
                <div className="flex items-center gap-2 p-2 pl-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.11]">
                  <code className="text-[11px] font-mono break-all flex-1">{url}</code>
                  <BotaoCopiar texto={url} />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.11] space-y-2">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">Token (cabeçalho Authorization: Bearer …)</span>
            {tokenGerado ? (
              <div className="p-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2" role="alert">
                <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                  Copie e guarde agora. Por segurança, este token não será exibido novamente.
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-[11px] font-mono break-all flex-1">{tokenGerado}</code>
                  <BotaoCopiar texto={tokenGerado} rotulo="Copiar token" />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {salva.token_configurado
                  ? `Token ativo (${salva.token_prefixo}…), gerado em ${new Date(salva.token_gerado_em).toLocaleString('pt-BR')}.`
                  : 'Nenhum token gerado ainda.'}
              </p>
            )}
            <button
              type="button"
              onClick={() => (salva.token_configurado ? setConfirmarToken(true) : handleGerarToken())}
              className="px-4 py-2 rounded-full border border-black/10 dark:border-white/15 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              {salva.token_configurado ? 'Gerar novo token' : 'Gerar token'}
            </button>
          </div>
        </Cartao>

        {/* Limites */}
        <Cartao
          rotulo="Passo 2"
          titulo="Precisão da busca pelo nome da empresa"
          descricao="O cliente pode digitar só parte do nome (ex.: “Vargas” para “Rocha e Vargas”). Defina a partir de quanta semelhança o sistema sugere ou cria direto."
        >
          {/* Faixa visual das três zonas */}
          <div aria-hidden="true" className="space-y-1">
            <div className="h-2.5 rounded-full overflow-hidden flex">
              <div className="bg-slate-300 dark:bg-zinc-700" style={{ width: `${sug}%` }} />
              <div className="bg-amber-400" style={{ width: `${Math.max(0, auto - sug)}%` }} />
              <div className="bg-[#4d7c0f] dark:bg-[#84cc16]" style={{ width: `${100 - auto}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {[
            ['limiar_sugestao', 'Sugerir empresas a partir de', 'Abaixo disso, a empresa é tratada como não encontrada.'],
            ['limiar_automatico', 'Criar automaticamente a partir de', 'Entre os dois valores, o cliente confirma a empresa numa lista.'],
          ].map(([campo, rotulo, ajuda]) => (
            <div key={campo} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={campo} className="text-xs font-semibold">{rotulo}</label>
                <span className="text-xs font-bold font-mono tabular-nums">{form[campo]}%</span>
              </div>
              <input
                id={campo}
                type="range"
                min={1}
                max={100}
                value={form[campo]}
                onChange={(e) => atualizar(campo, Number(e.target.value))}
                aria-describedby={`${campo}_ajuda`}
                className="w-full accent-[#4d7c0f] dark:accent-[#84cc16] cursor-pointer"
              />
              <p id={`${campo}_ajuda`} className="text-[11px] text-slate-500 dark:text-zinc-400">{ajuda}</p>
            </div>
          ))}
          {limiaresInvalidos && (
            <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
              O valor para criar automaticamente precisa ser maior ou igual ao valor para sugerir.
            </p>
          )}

          {/* Teste ao vivo dos limites */}
          <form onSubmit={handleTestar} className="pt-3 border-t border-black/[0.06] dark:border-white/[0.11] space-y-2">
            <label htmlFor="nome_teste" className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
              Testar com um nome, como o cliente digitaria
            </label>
            <div className="flex gap-2">
              <input
                id="nome_teste"
                value={nomeTeste}
                onChange={(e) => setNomeTeste(e.target.value)}
                placeholder="Ex.: Vargas"
                className="flex-1 min-w-0 px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs"
              />
              <button
                type="submit"
                disabled={testando || nomeTeste.trim().length < 2}
                className="px-4 py-2 rounded-full bg-black text-white dark:bg-white dark:text-black text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                {testando ? 'Testando…' : 'Testar'}
              </button>
            </div>
            <div aria-live="polite">
              {resultadoTeste && (
                <div className="space-y-2 pt-1">
                  <span className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-bold ${ROTULO_DECISAO[resultadoTeste.decisao].classe}`}>
                    {ROTULO_DECISAO[resultadoTeste.decisao].texto}
                  </span>
                  {resultadoTeste.sugestoes.length > 0 ? (
                    <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.09] rounded-2xl border border-black/[0.06] dark:border-white/[0.11]">
                      {resultadoTeste.sugestoes.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                          <span className="truncate">{s.nome}</span>
                          <span className="font-mono font-bold tabular-nums">{s.similaridade}%</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">Nenhuma empresa acima de {sug}%.</p>
                  )}
                </div>
              )}
            </div>
          </form>
        </Cartao>

        {/* Regras da demanda */}
        <Cartao rotulo="Passo 3" titulo="Como a demanda chega na fila" descricao="Toda demanda criada pela API entra pendente na Fila Geral, com a etiqueta “Suporte Automático”, e dispara o alerta sonoro da equipe.">
          <div className="space-y-1.5">
            <label htmlFor="departamento_padrao" className="text-xs font-semibold">Departamento</label>
            <select
              id="departamento_padrao"
              value={form.departamento_padrao}
              onChange={(e) => atualizar('departamento_padrao', e.target.value)}
              className="w-full px-3 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs"
            >
              {[...new Set([form.departamento_padrao, ...departamentos])].filter(Boolean).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold mb-1.5">Se a empresa não for encontrada</legend>
            {[
              ['rejeitar', 'Pedir o nome novamente', 'A API responde “nao_encontrado” e nada é criado.'],
              ['criar_com_nome_informado', 'Abrir a demanda mesmo assim', 'Usa o nome que o cliente digitou; a equipe vincula a empresa depois.'],
            ].map(([valor, titulo, desc]) => (
              <label
                key={valor}
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-colors ${
                  form.quando_nao_encontrar === valor
                    ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/5 dark:bg-[#84cc16]/10'
                    : 'border-black/[0.06] dark:border-white/[0.11] hover:border-black/20'
                }`}
              >
                <input
                  type="radio"
                  name="quando_nao_encontrar"
                  checked={form.quando_nao_encontrar === valor}
                  onChange={() => atualizar('quando_nao_encontrar', valor)}
                  className="mt-0.5 accent-[#4d7c0f]"
                />
                <span>
                  <span className="block text-xs font-semibold">{titulo}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-zinc-400">{desc}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="max_sugestoes" className="text-xs font-semibold">Máximo de empresas sugeridas ao cliente</label>
            <input
              id="max_sugestoes"
              type="number"
              min={1}
              max={10}
              value={form.max_sugestoes}
              onChange={(e) => atualizar('max_sugestoes', Number(e.target.value))}
              className="w-24 px-3 py-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs"
            />
          </div>
        </Cartao>

        {/* Guia para a outra plataforma (divulgação progressiva) */}
        <Cartao rotulo="Passo 4" titulo="Fluxo na outra plataforma" descricao="Use quando o cliente selecionar “Suporte”.">
          <ol className="space-y-2 text-xs text-slate-600 dark:text-zinc-300 list-decimal pl-4 leading-relaxed">
            <li>Se o campo personalizado de empresa estiver vazio, pergunte o nome da empresa e chame <strong>Identificar empresa</strong>.</li>
            <li>
              <strong>confirmado</strong>: grave a empresa no campo personalizado. <strong>confirmar</strong>: mostre as sugestões e peça para o cliente escolher.
              <strong> nao_encontrado</strong>: peça o nome novamente.
            </li>
            <li>Peça um resumo do que o cliente precisa.</li>
            <li>Chame <strong>Abrir demanda</strong> com <code>empresa_id</code> (ou <code>empresa_nome</code>), <code>descricao</code> e <code>solicitante_nome</code> (nome do contato).</li>
          </ol>

          <details className="group rounded-2xl border border-black/[0.06] dark:border-white/[0.11]">
            <summary className="px-4 py-2.5 text-xs font-semibold cursor-pointer select-none">Ver exemplos de requisição e resposta</summary>
            <div className="px-4 pb-4 space-y-3 text-[11px]">
              <p className="font-semibold pt-1">1. Identificar empresa</p>
              <pre className="p-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] overflow-x-auto font-mono leading-relaxed">{`POST ${urlBuscar}
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{ "nome": "Vargas" }

→ 200
{ "ok": true, "decisao": "confirmar", "empresa": null,
  "sugestoes": [ { "id": "…", "nome": "Rocha e Vargas", "similaridade": 86 } ] }`}</pre>
              <p className="font-semibold">2. Abrir demanda</p>
              <pre className="p-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] overflow-x-auto font-mono leading-relaxed">{`POST ${urlChamados}
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{ "empresa_id": "…",
  "descricao": "Instância desconectou e não reconecta",
  "solicitante_nome": "Maria Souza",
  "origem": "WhatsApp", "id_externo": "conversa-123" }

→ 201
{ "ok": true, "criado": true, "chamado_id": "…",
  "empresa": { "id": "…", "nome": "Rocha e Vargas", "similaridade": 100 } }`}</pre>
              <p className="text-slate-500 dark:text-zinc-400">
                Enviando <code>empresa_nome</code> em vez de <code>empresa_id</code>, a demanda só é criada quando a semelhança
                passa do limite automático; caso contrário a resposta vem com <code>criado: false</code> e as sugestões.
                Reenvios idênticos em até 2 minutos não duplicam a demanda. Erros: 400 (dados faltando), 401 (token), 403 (integração desativada), 429 (excesso de requisições).
              </p>
            </div>
          </details>
        </Cartao>
      </div>

      {/* Barra de salvar */}
      <div className="sticky bottom-4 p-4 rounded-3xl bg-white/95 dark:bg-[#1e1e21]/95 backdrop-blur border border-black/[0.08] dark:border-white/[0.1] shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-slate-600 dark:text-zinc-300" aria-live="polite">
          {alterado ? 'Há alterações não salvas.' : 'Tudo salvo.'}
        </span>
        <div className="flex gap-2 self-end sm:self-auto">
          {alterado && (
            <button
              type="button"
              onClick={() => setForm(salva)}
              className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            >
              Descartar
            </button>
          )}
          <button
            type="button"
            onClick={handleSalvar}
            disabled={!alterado || salvando || limiaresInvalidos || (form.ativo && !salva.token_configurado)}
            className="px-6 py-2 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-md disabled:opacity-40 cursor-pointer transition-transform active:scale-[0.98]"
          >
            {salvando ? 'Salvando…' : 'Salvar suporte automático'}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmarToken}
        title="Gerar um novo token?"
        message="O token atual deixa de funcionar imediatamente. A outra plataforma vai parar de abrir demandas até você cadastrar o novo token nela."
        confirmText="Gerar novo token"
        cancelText="Manter o atual"
        variant="warning"
        onConfirm={handleGerarToken}
        onClose={() => setConfirmarToken(false)}
      />
    </motion.div>
  );
}

function pick(config) {
  const { token_configurado, token_prefixo, token_gerado_em } = config || {};
  return { token_configurado, token_prefixo, token_gerado_em };
}
