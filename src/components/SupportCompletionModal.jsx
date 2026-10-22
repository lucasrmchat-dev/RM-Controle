'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getMotivosSuporte,
  fetchMotivosSuporte,
  getHistoricoChamados,
  addMotivoSuporte,
  getEmpresaCredenciais,
  getConfiguracoesSuporte,
  finalizarSuporte,
  aguardarRetornoCliente,
  getNomeTecnico,
  addColaboradorEmpresa,
  getColaboradoresEmpresa,
  addSolucaoSuporte,
} from '@/lib/storage';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import {
  ModalEtapas,
  Etapa,
  Combobox,
  SeletorCategoria,
  Escolhido,
  SeloNovo,
  Expandir,
  ErroRodape,
  Spinner,
  EASE,
  normalizarBusca,
  classeBotaoPrimario,
  classeBotaoSecundario,
  classeBotaoTexto,
} from './FormularioEtapas';
import { CheckIcon, ClockIcon, HourglassIcon, UserIcon } from './Icons';
import { showToast } from './ToastNotification';

const DESFECHOS = [
  { id: 'resolvido', titulo: 'Resolvido', desc: 'O problema foi solucionado. A demanda é encerrada.', cor: 'emerald' },
  { id: 'nao_resolvido', titulo: 'Não resolvido', desc: 'Não foi possível resolver. A demanda é encerrada.', cor: 'rose' },
  { id: 'sem_resposta', titulo: 'Sem resposta', desc: 'O cliente não respondeu. Volta para a fila como "Aguardando cliente", com você como responsável.', cor: 'amber' },
];

const CORES_DESFECHO = {
  emerald: 'border-emerald-600 dark:border-emerald-400 bg-emerald-500/[0.07] ring-1 ring-emerald-600/25 dark:ring-emerald-400/30',
  rose: 'border-rose-600 dark:border-rose-400 bg-rose-500/[0.06] ring-1 ring-rose-600/25 dark:ring-rose-400/30',
  amber: 'border-amber-600 dark:border-amber-400 bg-amber-500/[0.07] ring-1 ring-amber-600/25 dark:ring-amber-400/30',
};
const PONTO_DESFECHO = { emerald: 'bg-emerald-600 dark:bg-emerald-400', rose: 'bg-rose-600 dark:bg-rose-400', amber: 'bg-amber-600 dark:bg-amber-400' };

const paraInputLocal = (data) => {
  const d = data ? new Date(data) : new Date();
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const formatarTempo = (seg) => {
  const s = Math.max(0, Math.floor(seg || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(r).padStart(2, '0')}s`;
  return `${r}s`;
};

export default function SupportCompletionModal({ isOpen, chamado, onClose, onFinalizado, userEmail }) {
  const [config, setConfig] = useState({ motivo_obrigatorio: true, solucao_obrigatoria: false, colaborador_obrigatorio: false });
  const [desfecho, setDesfecho] = useState('resolvido');
  const [categorias, setCategorias] = useState([]);
  const [categoria, setCategoria] = useState(null); // { nome, nova }
  const [contatos, setContatos] = useState([]);
  const [solicitante, setSolicitante] = useState(null); // { nome, novo }
  const [tempoEspera, setTempoEspera] = useState(0);
  const [tempoSessao, setTempoSessao] = useState(0);
  const [acumulado, setAcumulado] = useState(0);
  const [ajustarTempo, setAjustarTempo] = useState(false);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [explicar, setExplicar] = useState(false);
  const [tituloProblema, setTituloProblema] = useState('');
  const [codigoErro, setCodigoErro] = useState('');
  const [passos, setPassos] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!isOpen || !chamado) return;
    const cfg = getConfiguracoesSuporte();
    setConfig(cfg);
    setDesfecho('resolvido');
    // Mais usadas primeiro, para que a escolha comum esteja sempre à vista
    const ordenarCategorias = () => {
      const uso = new Map();
      (getHistoricoChamados() || []).forEach((h) => {
        String(h?.motivo || '').split(',').map((m) => normalizarBusca(m.trim())).filter(Boolean).forEach((m) => uso.set(m, (uso.get(m) || 0) + 1));
      });
      const nomes = [...new Set(getMotivosSuporte().map((m) => (m.nome || '').trim()).filter(Boolean))];
      setCategorias(nomes.sort((a, b) => (uso.get(normalizarBusca(b)) || 0) - (uso.get(normalizarBusca(a)) || 0) || a.localeCompare(b, 'pt-BR')));
    };
    ordenarCategorias();
    // Categorias são da equipe: busca as atuais no banco (criadas por qualquer pessoa)
    fetchMotivosSuporte().then(ordenarCategorias).catch(() => {});
    setCategoria(null);

    // Contatos da empresa (colaboradores + acessos), sem nada pré-selecionado
    const vistos = new Set();
    const lista = [];
    const add = (nome, detalhe) => {
      const n = (nome || '').trim();
      if (!n || vistos.has(normalizarBusca(n)) || normalizarBusca(n) === 'painel admin') return;
      vistos.add(normalizarBusca(n));
      lista.push({ id: n, nome: n, detalhe });
    };
    if (chamado.empresa_id) {
      (getColaboradoresEmpresa(chamado.empresa_id) || []).forEach((c) => add(c.nome, c.cargo || 'Colaborador'));
      (getEmpresaCredenciais(chamado.empresa_id) || []).forEach((c) => add(c.nome_usuario || c.rotulo, c.usuario_email || 'Acesso cadastrado'));
    }
    setContatos(lista);
    // Quem abriu a demanda já informou o solicitante: vem preenchido
    const jaInformado = (chamado.solicitante_nome || '').trim();
    // Valores genéricos gravados quando ninguém foi informado não contam como solicitante
    const generico = ['colaborador da empresa', 'colaborador', 'acesso principal'].includes(normalizarBusca(jaInformado));
    setSolicitante(jaInformado && !generico ? { nome: jaInformado, detalhe: 'Informado na abertura', novo: false } : null);

    // Tempos
    const agora = Date.now();
    const inicioEspera = new Date(chamado.tempo_espera_inicio || chamado.created_at || agora).getTime();
    const fimEspera = chamado.tempo_espera_fim
      ? new Date(chamado.tempo_espera_fim).getTime()
      : chamado.tempo_ativo_inicio || chamado.iniciado_em
        ? new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em).getTime()
        : agora;
    setTempoEspera(chamado.tempo_espera_segundos || Math.max(0, Math.floor((fimEspera - inicioEspera) / 1000)));
    // Aguardando cliente: o cronômetro estava pausado, então a sessão atual não conta tempo
    const pausado = chamado.status === 'pendente';
    const inicioAtivo = pausado ? new Date(agora) : new Date(chamado.tempo_ativo_inicio || chamado.iniciado_em || agora);
    setTempoSessao(pausado ? 0 : Math.max(1, Math.floor((agora - inicioAtivo.getTime()) / 1000)));
    setAcumulado(chamado.duracao_acumulada_segundos || 0);
    setInicio(paraInputLocal(inicioAtivo));
    setFim(paraInputLocal(new Date(agora)));
    setAjustarTempo(false);

    setExplicar(Boolean(cfg.solucao_obrigatoria));
    setTituloProblema('');
    setCodigoErro('');
    setPassos('');
    setErro('');
    setEnviando(false);
  }, [isOpen, chamado?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tempoTotal = acumulado + tempoSessao;
  const semResposta = desfecho === 'sem_resposta';
  const desfechoAtual = DESFECHOS.find((d) => d.id === desfecho);

  const recalcular = (ini, fi) => {
    const a = new Date(ini).getTime();
    const b = new Date(fi).getTime();
    if (!isNaN(a) && !isNaN(b) && b >= a) setTempoSessao(Math.max(0, Math.floor((b - a) / 1000)));
  };
  const ajusteRapido = (min) => {
    const f = fim ? new Date(fim) : new Date();
    const i = new Date(f.getTime() - min * 60000);
    setInicio(paraInputLocal(i));
    setFim(paraInputLocal(f));
    setTempoSessao(min * 60);
  };

  const etapa2Ok = semResposta || !config.motivo_obrigatorio || Boolean(categoria);

  const concluir = async () => {
    if (enviando || !chamado) return;
    setErro('');

    // Sem resposta: não encerra — volta para a fila aguardando o cliente
    if (semResposta) {
      setEnviando(true);
      try {
        await aguardarRetornoCliente({ chamado_id: chamado.id, tempo_ativo_segundos: tempoSessao, userEmail });
        showToast(`${chamado.empresa_nome}: aguardando retorno do cliente. A demanda continua na fila com você.`, 'info');
        onFinalizado?.();
        onClose();
      } catch (e) {
        setErro(e?.message || 'Não foi possível colocar a demanda em espera.');
      } finally {
        setEnviando(false);
      }
      return;
    }

    const nomeCategoria = (categoria?.nome || '').trim();
    if (config.motivo_obrigatorio && !nomeCategoria) return setErro('Escolha a categoria do suporte.');
    if (config.colaborador_obrigatorio && !solicitante?.nome) return setErro('Informe quem pediu o atendimento.');
    if (config.solucao_obrigatoria && !passos.trim()) {
      setExplicar(true);
      return setErro('Explique como o problema foi resolvido.');
    }

    setEnviando(true);
    try {
      if (categoria?.nova) {
        try {
          addMotivoSuporte({ nome: nomeCategoria });
        } catch (e) {}
      }
      if (solicitante?.novo && chamado.empresa_id) {
        try {
          await addColaboradorEmpresa(chamado.empresa_id, { nome: solicitante.nome, cargo: 'Colaborador' }, userEmail);
        } catch (e) {}
      }

      const atendente = getNomeTecnico(userEmail || chamado.tecnico_email);
      await finalizarSuporte({
        chamado_id: chamado.id,
        motivo: nomeCategoria || 'Atendimento Geral',
        categorias: chamado?.categorias || [],
        observacoes: passos.trim(),
        colaborador_solicitante: solicitante?.nome || '',
        atendente,
        userEmail,
        tempo_ativo_segundos: tempoTotal,
        tempo_ativo_inicio: inicio ? new Date(inicio).toISOString() : null,
        finalizado_em: fim ? new Date(fim).toISOString() : null,
        status_resolucao: desfecho,
        catalogarSolucao: false,
      });

      // Explicação preenchida vira referência na base de soluções da equipe
      if (passos.trim()) {
        try {
          await addSolucaoSuporte({
            empresa_id: chamado.empresa_id || null,
            empresa_nome: chamado.empresa_nome || 'Global',
            titulo: tituloProblema.trim() || `${nomeCategoria || 'Atendimento'} (${chamado.empresa_nome || 'Empresa'})`,
            erro_codigo: codigoErro.trim().toUpperCase(),
            contexto: `Solução aplicada por ${atendente || 'atendente'} em atendimento.`,
            tipo_erro: nomeCategoria,
            solucao_passos: passos.trim(),
            tags: [nomeCategoria, chamado.empresa_nome, 'suporte_finalizado'].filter(Boolean),
            userEmail,
          });
        } catch (e) {
          console.warn('Erro ao salvar solução na base:', e);
        }
      }

      showToast(`Atendimento de ${chamado.empresa_nome} concluído.`, 'success');
      onFinalizado?.();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Não foi possível concluir o atendimento.');
    } finally {
      setEnviando(false);
    }
  };

  const contexto = useMemo(
    () =>
      chamado && (
        <span className="inline-flex flex-wrap items-center gap-2 text-[12px]">
          <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#4d7c0f]/10 dark:bg-[#84cc16]/15 text-[#4d7c0f] dark:text-[#84cc16] font-semibold">
            {chamado.empresa_nome}
          </span>
          {(chamado.categorias || []).slice(0, 2).map((c) => (
            <span key={c} className="inline-flex items-center h-6 px-2.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300">
              {c}
            </span>
          ))}
        </span>
      ),
    [chamado]
  );

  if (!chamado) return null;

  const rodape = (
    <>
      <ErroRodape erro={erro} />
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
        <button type="button" onClick={onClose} disabled={enviando} className={`${classeBotaoTexto} sm:mr-auto`}>
          Voltar
        </button>
        {!semResposta && (
          <button type="button" onClick={() => setExplicar((v) => !v)} aria-expanded={explicar} className={classeBotaoSecundario}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
            {explicar ? 'Ocultar explicação' : 'Explicar como resolver'}
          </button>
        )}
        <button type="button" onClick={concluir} disabled={enviando} className={classeBotaoPrimario}>
          {enviando ? <Spinner /> : semResposta ? <HourglassIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4 stroke-[2.5]" />}
          {semResposta ? 'Aguardar cliente' : desfecho === 'nao_resolvido' ? 'Encerrar sem solução' : 'Concluir atendimento'}
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={isOpen}
      onFechar={onClose}
      bloqueado={enviando}
      idTitulo="concluir-titulo"
      titulo="Finalizar atendimento"
      subtitulo="Como terminou, como classificar e quanto tempo levou."
      contexto={contexto}
      rodape={rodape}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-12">
        <div>
          {/* 1. DESFECHO */}
          <Etapa numero={1} titulo="Como terminou" estado="concluida">
            <div role="radiogroup" aria-label="Desfecho do atendimento" className="grid grid-cols-3 gap-2">
              {DESFECHOS.map((d) => {
                const ativo = desfecho === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setDesfecho(d.id)}
                    className={`h-12 px-3 rounded-xl border text-left transition-all cursor-pointer ${
                      ativo ? CORES_DESFECHO[d.cor] : 'border-black/[0.12] dark:border-white/[0.14] bg-white dark:bg-white/[0.03] hover:border-black/25 dark:hover:border-white/25'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PONTO_DESFECHO[d.cor]}`} />
                      <span className="text-[13px] sm:text-sm font-semibold leading-tight">{d.titulo}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={desfecho}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="mt-3 text-[13px] text-slate-600 dark:text-zinc-300"
              >
                {desfechoAtual?.desc}
              </motion.p>
            </AnimatePresence>
          </Etapa>

          {/* 2. CLASSIFICAÇÃO */}
          <Etapa
            numero={2}
            titulo="Classificação"
            descricao={semResposta ? 'Não é necessária para aguardar o cliente.' : 'Categoria do suporte e quem pediu.'}
            estado={semResposta ? 'travada' : etapa2Ok ? 'concluida' : 'ativa'}
            fimDeColuna
          >
            <div className="space-y-4">
              <div>
                <span id="cf-categoria" className={classeRotulo}>
                  Categoria do suporte {config.motivo_obrigatorio && <span className="text-red-600 dark:text-red-400">*</span>}
                </span>
                <SeletorCategoria rotuloId="cf-categoria" opcoes={categorias} valor={categoria} onMudar={setCategoria} />
              </div>

              <div>
                <span className={classeRotulo}>
                  Quem pediu {!config.colaborador_obrigatorio && <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>}
                </span>
                {solicitante ? (
                  <Escolhido
                    icone={<UserIcon className="w-4 h-4" />}
                    titulo={solicitante.nome}
                    detalhe={solicitante.novo ? 'Será cadastrado na empresa' : solicitante.detalhe}
                    selo={solicitante.novo && <SeloNovo />}
                    onTrocar={() => setSolicitante(null)}
                  />
                ) : (
                  <Combobox
                    id="cf-solicitante"
                    placeholder="Buscar ou digitar um nome"
                    opcoes={contatos}
                    onEscolher={(c) => setSolicitante({ ...c, novo: false })}
                    onNova={(nome) => setSolicitante({ nome, novo: true })}
                    opcaoNova={(t) => `Cadastrar “${t}” na empresa`}
                    renderOpcao={(c) => (
                      <span className="block min-w-0">
                        <span className="block text-sm font-medium truncate">{c.nome}</span>
                        {c.detalhe && <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{c.detalhe}</span>}
                      </span>
                    )}
                  />
                )}
              </div>
            </div>
          </Etapa>
        </div>

        <div className="lg:pl-12 lg:border-l border-black/[0.06] dark:border-white/[0.11]">
          {/* 3. TEMPO */}
          <Etapa numero={3} titulo="Tempo" descricao="Calculado pelo cronômetro. Ajuste se algo ficou aberto sem querer." estado="concluida" ultima={!explicar || semResposta}>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-4 rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.03]">
                <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                  <ClockIcon className="w-3.5 h-3.5" /> Esperou
                </span>
                <span className="block mt-1 text-lg font-semibold tabular-nums">{formatarTempo(tempoEspera)}</span>
              </div>
              <div className="p-4 rounded-xl border border-[#4d7c0f]/30 dark:border-[#84cc16]/30 bg-[#4d7c0f]/[0.05] dark:bg-[#84cc16]/[0.06]">
                <span className="flex items-center gap-1.5 text-xs text-[#4d7c0f] dark:text-[#84cc16]">
                  <HourglassIcon className="w-3.5 h-3.5" /> Atendimento
                </span>
                <span className="block mt-1 text-lg font-semibold tabular-nums">{formatarTempo(semResposta ? tempoSessao : tempoTotal)}</span>
                {acumulado > 0 && !semResposta && (
                  <span className="block text-[11px] text-slate-500 dark:text-zinc-400">inclui {formatarTempo(acumulado)} de antes</span>
                )}
              </div>
            </div>

            <button
              type="button"
              aria-expanded={ajustarTempo}
              onClick={() => setAjustarTempo((v) => !v)}
              className="mt-3 text-[13px] font-semibold text-[#4d7c0f] dark:text-[#84cc16] hover:underline cursor-pointer"
            >
              {ajustarTempo ? 'Fechar ajuste' : 'Ajustar horários'}
            </button>
            <Expandir aberto={ajustarTempo}>
              <div className="pt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className={classeRotulo}>Início</span>
                    <input
                      type="datetime-local"
                      value={inicio}
                      onChange={(e) => {
                        setInicio(e.target.value);
                        recalcular(e.target.value, fim);
                      }}
                      className={`${classeCampo} font-mono text-[13px]`}
                    />
                  </label>
                  <label className="block">
                    <span className={classeRotulo}>Fim</span>
                    <input
                      type="datetime-local"
                      value={fim}
                      onChange={(e) => {
                        setFim(e.target.value);
                        recalcular(inicio, e.target.value);
                      }}
                      className={`${classeCampo} font-mono text-[13px]`}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => ajusteRapido(m)}
                      className="h-8 px-3 rounded-full border border-black/[0.12] dark:border-white/[0.14] text-xs font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                    >
                      {m < 60 ? `${m} min` : '1 h'}
                    </button>
                  ))}
                </div>
              </div>
            </Expandir>
          </Etapa>

          {/* 4. EXPLICAÇÃO (opcional, só quando a pessoa quer registrar) */}
          <Expandir aberto={explicar && !semResposta}>
            <div className="pt-8">
              <Etapa numero={4} titulo="Como foi resolvido" descricao="Vira referência na base de soluções para a próxima demanda parecida." estado={passos.trim() ? 'concluida' : 'ativa'} ultima>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      aria-label="Título do problema"
                      value={tituloProblema}
                      onChange={(e) => setTituloProblema(e.target.value)}
                      placeholder="Título (ex.: falha ao emitir NFe)"
                      className={classeCampo}
                    />
                    <input
                      type="text"
                      aria-label="Código do erro"
                      value={codigoErro}
                      onChange={(e) => setCodigoErro(e.target.value)}
                      placeholder="Código do erro (opcional)"
                      className={`${classeCampo} font-mono`}
                    />
                  </div>
                  <textarea
                    aria-label="Passos da solução"
                    rows={5}
                    value={passos}
                    onChange={(e) => setPassos(e.target.value)}
                    placeholder="Passo a passo do que resolveu."
                    className={`${classeCampo} h-auto py-3 leading-relaxed resize-none`}
                  />
                </div>
              </Etapa>
            </div>
          </Expandir>
        </div>
      </div>
    </ModalEtapas>
  );
}
