'use client';

import { DESFECHOS_COMERCIAIS } from '@/lib/comercial';
import {
  acaoEmMassaChat,
  fetchConfigComercial,
  getCategoriasDemandas,
  getEquipeUsuarios,
} from '@/lib/storage';
import { useEffect, useState } from 'react';
import {
  ErroRodape,
  ModalEtapas,
  Spinner,
  classeBotaoPrimario,
  classeBotaoTexto,
} from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';

/**
 * Ações em massa nas conversas marcadas na lista do Chat (contatos e grupos): resolver, transferir,
 * etiquetas e atendente padrão (no contato ou grupo) e status de lead (etapa do processo comercial).
 * O servidor confere a permissão de cada conversa; as que a pessoa não pode ver são ignoradas.
 */
const ACOES = [
  {
    id: 'resolver',
    rotulo: 'Resolver',
    descricao: 'Fecha as conversas (voltam se o cliente escrever de novo).',
  },
  {
    id: 'transferir_atendente',
    rotulo: 'Transferir para atendente',
    descricao: 'Passa as conversas para uma pessoa da equipe.',
  },
  {
    id: 'transferir_departamento',
    rotulo: 'Transferir para departamento',
    descricao: 'Muda o departamento das conversas.',
  },
  {
    id: 'etiqueta_adicionar',
    rotulo: 'Adicionar etiqueta',
    descricao: 'No contato ou grupo: vale para as próximas conversas também.',
  },
  {
    id: 'etiqueta_remover',
    rotulo: 'Remover etiqueta',
    descricao: 'Tira a etiqueta do contato ou grupo.',
  },
  {
    id: 'atendente_padrao',
    rotulo: 'Atendente padrão',
    descricao: 'Toda conversa nova do contato ou grupo já cai com essa pessoa.',
    admin: true,
  },
  {
    id: 'lead',
    rotulo: 'Status de lead',
    descricao: 'Coloca o contato numa etapa do processo comercial (ou tira).',
    comercial: true,
  },
];

export default function ChatAcoesEmMassa({ aberto, onFechar, ids, eu, temComercial, onFeito }) {
  const [acao, setAcao] = useState('resolver');
  const [email, setEmail] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [config, setConfig] = useState(null);
  const [pipelineId, setPipelineId] = useState('');
  const [etapaId, setEtapaId] = useState('');
  const [removerLead, setRemoverLead] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const acoes = ACOES.filter(
    (a) => (!a.admin || eu?.admin) && (!a.comercial || temComercial || eu?.admin),
  );
  const pessoas = (getEquipeUsuarios() || []).filter((u) => u.ativo !== false && u.email);
  const departamentos = getCategoriasDemandas() || [];
  const processo = (config?.pipelines || []).find((p) => p.id === pipelineId);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    if (acao === 'lead' && !config)
      fetchConfigComercial()
        .then(setConfig)
        .catch(() => setConfig({ departamentos: [], pipelines: [] }));
  }, [aberto, acao, config]);

  const pronto =
    acao === 'resolver' ||
    acao === 'transferir_atendente' ||
    acao === 'transferir_departamento' ||
    acao === 'atendente_padrao' ||
    (acao.startsWith('etiqueta_') && etiqueta.trim()) ||
    (acao === 'lead' && (removerLead || (pipelineId && etapaId)));

  const aplicar = async () => {
    setEnviando(true);
    setErro('');
    try {
      const r = await acaoEmMassaChat({
        ids,
        acao,
        email,
        departamento,
        etiqueta: etiqueta.trim(),
        ...(acao === 'lead'
          ? removerLead
            ? { remover: true }
            : { pipeline_id: pipelineId, etapa_id: etapaId }
          : {}),
      });
      const partes = [
        `Feito em ${r.feitas} ${acao.startsWith('etiqueta_') || acao === 'atendente_padrao' || acao === 'lead' ? (r.feitas === 1 ? 'contato' : 'contatos') : r.feitas === 1 ? 'conversa' : 'conversas'}`,
      ];
      if (r.ignoradas) partes.push(`${r.ignoradas} sem permissão ficaram de fora`);
      showToast(`${partes.join(' · ')}.`, 'success');
      onFeito?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const escolhaPessoa = (vazio) => (
    <select value={email} onChange={(e) => setEmail(e.target.value)} className={classeCampo}>
      <option value="">{vazio}</option>
      {pessoas.map((p) => (
        <option key={p.email} value={p.email}>
          {p.nome || p.email}
        </option>
      ))}
    </select>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-[560px]"
      idTitulo="chat-acoes-massa"
      titulo={`Ações em ${ids.length} ${ids.length === 1 ? 'conversa' : 'conversas'}`}
      subtitulo="Vale para contatos e grupos marcados na lista."
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onFechar} className={classeBotaoTexto}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={aplicar}
              disabled={enviando || !pronto || !ids.length}
              className={classeBotaoPrimario}
            >
              {enviando && <Spinner />}
              Aplicar
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ação">
          {acoes.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={acao === a.id}
              onClick={() => {
                setAcao(a.id);
                setEmail('');
                setErro('');
              }}
              className={`text-left rounded-2xl px-3.5 py-2.5 ring-1 transition-colors cursor-pointer ${acao === a.id ? 'ring-2 ring-rm-acento-medio bg-rm-acento-medio/[0.06]' : 'ring-black/[0.08] dark:ring-white/[0.1] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
            >
              <span className="block text-[13.5px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {a.rotulo}
              </span>
              <span className="block text-[11.5px] leading-snug text-slate-500 dark:text-zinc-400 mt-0.5">
                {a.descricao}
              </span>
            </button>
          ))}
        </div>

        {acao === 'transferir_atendente' && (
          <label className="block">
            <span className={classeRotulo}>Para quem</span>
            {escolhaPessoa('Ninguém (volta para a fila)')}
          </label>
        )}
        {acao === 'transferir_departamento' && (
          <label className="block">
            <span className={classeRotulo}>Departamento</span>
            <select
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
              className={classeCampo}
            >
              <option value="">Todos os departamentos</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        {acao.startsWith('etiqueta_') && (
          <label className="block">
            <span className={classeRotulo}>Etiqueta</span>
            <input
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              maxLength={30}
              placeholder="Ex.: Suporte RM"
              className={classeCampo}
            />
          </label>
        )}
        {acao === 'atendente_padrao' && (
          <label className="block">
            <span className={classeRotulo}>Atendente padrão</span>
            {escolhaPessoa('Nenhum (tirar o atendente padrão)')}
          </label>
        )}
        {acao === 'lead' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input
                type="checkbox"
                checked={removerLead}
                onChange={(e) => setRemoverLead(e.target.checked)}
                className="accent-[rgb(var(--rm-acento-medio))]"
              />
              Tirar do processo comercial
            </label>
            {!removerLead &&
              (config === null ? (
                <p className="text-[13px] text-slate-500">Carregando os processos comerciais…</p>
              ) : !config.pipelines?.length ? (
                <p className="text-[13px] text-slate-500 dark:text-zinc-400">
                  Nenhum processo comercial ainda. Crie em Configurações › Comercial.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={classeRotulo}>Processo comercial</span>
                    <select
                      value={pipelineId}
                      onChange={(e) => {
                        setPipelineId(e.target.value);
                        setEtapaId('');
                      }}
                      className={classeCampo}
                    >
                      <option value="">Escolha…</option>
                      {config.pipelines.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={classeRotulo}>Etapa</span>
                    <select
                      value={etapaId}
                      onChange={(e) => setEtapaId(e.target.value)}
                      disabled={!processo}
                      className={classeCampo}
                    >
                      <option value="">Escolha…</option>
                      {[...(processo?.etapas || []), ...DESFECHOS_COMERCIAIS].map((et) => (
                        <option key={et.id} value={et.id}>
                          {et.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
          </div>
        )}
      </div>
    </ModalEtapas>
  );
}
