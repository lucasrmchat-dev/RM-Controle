'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getEmpresaById, getEmpresaCredenciais } from '@/lib/storage';
import NovaEmpresaCampos, { dadosNovaEmpresaIniciais, classeCampo, classeRotulo } from './NovaEmpresaCampos';
import {
  ModalEtapas,
  Etapa,
  Combobox,
  Escolhido,
  SeloNovo,
  Expandir,
  Pilulas,
  ErroRodape,
  Spinner,
  normalizarBusca,
  classeBotaoPrimario,
  classeBotaoSecundario,
  classeBotaoTexto,
} from './FormularioEtapas';
import { BuildingIcon, CalendarIcon, PlayIcon, UserIcon, XMarkIcon } from './Icons';

/**
 * Formulário de nova demanda em 3 etapas: empresa → quem pediu → sobre a demanda.
 * No desktop as etapas ficam lado a lado (1 e 2 à esquerda, 3 à direita); no celular, uma abaixo da outra.
 * Quem cria de fato é o pai (onEnviar), que recebe tudo já organizado.
 */
export default function NovaDemandaModal({
  aberto,
  onFechar,
  empresas = [],
  empresaInicial = null,
  categorias = [],
  etiquetasSugeridas = [],
  onEnviar,
}) {
  const [empresa, setEmpresa] = useState(null);
  const [dadosEmpresa, setDadosEmpresa] = useState(dadosNovaEmpresaIniciais);
  const [colaboradores, setColaboradores] = useState([]);
  const [solicitante, setSolicitante] = useState(null); // { id?, nome, cargo?, email?, senha?, novo }
  const [cats, setCats] = useState([]);
  const [etiquetas, setEtiquetas] = useState([]);
  const [tagTexto, setTagTexto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prazoAberto, setPrazoAberto] = useState(false);
  const [prazo, setPrazo] = useState('');
  const [lembrete, setLembrete] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(null); // 'fila' | 'mim' | null

  useEffect(() => {
    if (!aberto) return;
    setEmpresa(empresaInicial || null);
    setDadosEmpresa(dadosNovaEmpresaIniciais());
    setSolicitante(null);
    setCats(categorias.includes('Suporte') ? ['Suporte'] : categorias.slice(0, 1));
    setEtiquetas([]);
    setTagTexto('');
    setDescricao('');
    setPrazoAberto(false);
    setPrazo('');
    setLembrete(false);
    setErro('');
    setEnviando(null);
  }, [aberto, empresaInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pessoas já cadastradas na empresa (acessos + colaboradores)
  useEffect(() => {
    setColaboradores([]);
    if (!empresa?.id || empresa.isNova) return undefined;
    let cancelado = false;
    const vistos = new Set();
    const base = [];
    (getEmpresaCredenciais(empresa.id) || []).forEach((cr) => {
      const nome = (cr.nome_usuario || cr.rotulo || '').trim();
      if (!nome || vistos.has(normalizarBusca(nome))) return;
      vistos.add(normalizarBusca(nome));
      base.push({ id: cr.id, nome, cargo: cr.usuario_email || 'Acesso cadastrado', email: cr.usuario_email || '' });
    });
    setColaboradores(base);
    getEmpresaById(empresa.id)
      .then((emp) => {
        if (cancelado) return;
        const extras = (emp?.colaboradores || [])
          .filter((c) => c.nome && !vistos.has(normalizarBusca(c.nome)))
          .map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo || 'Colaborador', email: c.email || '', telefone: c.telefone || '' }));
        setColaboradores([...base, ...extras]);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [empresa?.id, empresa?.isNova]);

  const etapa1Ok = Boolean(empresa) && (!empresa.isNova || Boolean(dadosEmpresa.tipo_cliente));

  const tagsSugeridas = useMemo(() => {
    const q = normalizarBusca(tagTexto.replace(/^#/, ''));
    return etiquetasSugeridas.filter((t) => !etiquetas.includes(t) && (!q || normalizarBusca(t).includes(q))).slice(0, 6);
  }, [etiquetasSugeridas, etiquetas, tagTexto]);

  const adicionarTag = (t) => {
    const limpa = String(t || '').trim().replace(/^#/, '');
    if (limpa && !etiquetas.includes(limpa)) setEtiquetas((e) => [...e, limpa]);
    setTagTexto('');
  };

  const enviar = async (paraMim) => {
    if (enviando) return;
    if (!empresa) return setErro('Escolha a empresa da demanda.');
    if (empresa.isNova && !dadosEmpresa.tipo_cliente) return setErro('Empresa nova: informe se é cliente novo ou se já era cliente.');
    if (!cats.length) return setErro('Escolha ao menos um departamento.');
    setErro('');
    setEnviando(paraMim ? 'mim' : 'fila');
    try {
      await onEnviar(
        {
          empresa,
          novaEmpresa: empresa.isNova ? dadosEmpresa : null,
          solicitante,
          categorias: cats,
          etiquetas,
          observacao: descricao.trim(),
          prazo: prazoAberto && prazo ? prazo : null,
          lembrete: prazoAberto && lembrete,
        },
        { paraMim }
      );
    } catch (e) {
      setErro(e?.message || 'Não foi possível abrir a demanda.');
    } finally {
      setEnviando(null);
    }
  };

  const rodape = (
    <>
      <ErroRodape erro={erro} />
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
        <button type="button" onClick={onFechar} disabled={Boolean(enviando)} className={`${classeBotaoTexto} sm:mr-auto`}>
          Cancelar
        </button>
        <button type="button" onClick={() => enviar(false)} disabled={Boolean(enviando)} title="Fica aguardando para qualquer pessoa da equipe assumir" className={classeBotaoSecundario}>
          {enviando === 'fila' && <Spinner />}
          Abrir na fila
        </button>
        <button type="button" onClick={() => enviar(true)} disabled={Boolean(enviando)} title="A demanda fica com você, o atendimento começa e a empresa abre" className={classeBotaoPrimario}>
          {enviando === 'mim' ? <Spinner /> : <PlayIcon className="w-3 h-3 fill-current" />}
          Abrir para mim e atender
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={Boolean(enviando)}
      idTitulo="nova-demanda-titulo"
      titulo="Nova demanda"
      subtitulo="Três passos: empresa, quem pediu e o que precisa ser feito."
      rodape={rodape}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-12">
        {/* COLUNA 1: empresa e quem pediu */}
        <div>
          <Etapa numero={1} titulo="Empresa" descricao="Busque pelo nome. Se ainda não existir, cadastre aqui mesmo." estado={etapa1Ok ? 'concluida' : 'ativa'}>
            {empresa ? (
              <Escolhido
                icone={<BuildingIcon className="w-4 h-4" />}
                titulo={empresa.nome}
                detalhe={empresa.isNova ? 'Será cadastrada ao abrir a demanda' : empresa.servidor_alocado === 'servidor_2' ? 'Servidor 2' : empresa.servidor_alocado ? 'Servidor 1' : null}
                selo={empresa.isNova && <SeloNovo>Nova</SeloNovo>}
                onTrocar={() => {
                  setEmpresa(null);
                  setSolicitante(null);
                }}
              />
            ) : (
              <Combobox
                id="nd-empresa"
                autoFocus
                placeholder="Digite o nome da empresa"
                opcoes={empresas}
                onEscolher={(e) => setEmpresa(e)}
                onNova={(nome) => {
                  setEmpresa({ id: 'temp_nova_' + Date.now(), nome, isNova: true });
                  setDadosEmpresa(dadosNovaEmpresaIniciais());
                }}
                opcaoNova={(t) => `Cadastrar “${t}” como nova empresa`}
                renderOpcao={(e) => (
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[#1d1d1f] dark:text-white truncate">{e.nome}</span>
                    {e.servidor_alocado && (
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 flex-shrink-0">{e.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}</span>
                    )}
                  </span>
                )}
              />
            )}
            <Expandir aberto={Boolean(empresa?.isNova)}>
              <div className="mt-4 p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.03]">
                <p className="text-[13px] font-semibold text-[#1d1d1f] dark:text-white mb-4">Dados da nova empresa</p>
                <NovaEmpresaCampos valor={dadosEmpresa} onChange={setDadosEmpresa} idPrefixo="nd-nova-empresa" />
              </div>
            </Expandir>
          </Etapa>

          <Etapa
            numero={2}
            titulo={<>Quem pediu <span className="font-normal text-slate-500 dark:text-zinc-400">· opcional</span></>}
            descricao="Escolha alguém da empresa ou digite um nome novo para cadastrar."
            estado={!empresa ? 'travada' : solicitante ? 'concluida' : 'ativa'}
            fimDeColuna
          >
            {solicitante ? (
              <Escolhido
                icone={<UserIcon className="w-4 h-4" />}
                titulo={solicitante.nome}
                detalhe={solicitante.novo ? 'Novo — será cadastrado na empresa' : solicitante.cargo}
                selo={solicitante.novo && <SeloNovo />}
                onTrocar={() => setSolicitante(null)}
              />
            ) : (
              <Combobox
                id="nd-solicitante"
                placeholder={colaboradores.length ? 'Buscar ou digitar um nome' : 'Digite o nome de quem pediu'}
                opcoes={colaboradores}
                onEscolher={(c) => setSolicitante({ ...c, novo: false })}
                onNova={(nome) => setSolicitante({ nome, email: '', senha: '', novo: true })}
                opcaoNova={(t) => `Cadastrar “${t}” como novo solicitante`}
                renderOpcao={(c) => (
                  <span className="block min-w-0">
                    <span className="block text-sm font-medium text-[#1d1d1f] dark:text-white truncate">{c.nome}</span>
                    {c.cargo && <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{c.cargo}</span>}
                  </span>
                )}
              />
            )}
            <Expandir aberto={Boolean(solicitante?.novo)}>
              <div className="mt-4 p-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.03]">
                <p className="text-[13px] font-medium text-[#1d1d1f]/80 dark:text-white/80">
                  Acesso de {solicitante?.nome} <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 mb-2.5">Fica em Acessos e Senhas da empresa, com o nome desta pessoa.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="email"
                    aria-label="E-mail do solicitante"
                    placeholder="E-mail"
                    autoComplete="off"
                    value={solicitante?.email || ''}
                    onChange={(e) => setSolicitante((s) => ({ ...s, email: e.target.value }))}
                    className={classeCampo}
                  />
                  <input
                    type="text"
                    aria-label="Senha do solicitante"
                    placeholder="Senha"
                    autoComplete="off"
                    spellCheck={false}
                    value={solicitante?.senha || ''}
                    onChange={(e) => setSolicitante((s) => ({ ...s, senha: e.target.value }))}
                    className={`${classeCampo} font-mono`}
                  />
                </div>
              </div>
            </Expandir>
          </Etapa>
        </div>

        {/* COLUNA 2: sobre a demanda */}
        <div className="lg:pl-12 lg:border-l border-black/[0.06] dark:border-white/[0.08]">
          <Etapa
            numero={3}
            titulo="Sobre a demanda"
            descricao="Departamento responsável e o contexto para quem for atender."
            estado={!etapa1Ok ? 'travada' : cats.length && descricao.trim() ? 'concluida' : 'ativa'}
            ultima
          >
            <div className="space-y-5">
              <div>
                <span id="nd-dep" className={classeRotulo}>
                  Departamento <span className="text-red-600 dark:text-red-400">*</span>
                </span>
                <Pilulas
                  rotuloId="nd-dep"
                  opcoes={categorias}
                  selecionadas={cats}
                  onAlternar={(c) => setCats((atual) => (atual.includes(c) ? (atual.length > 1 ? atual.filter((x) => x !== c) : atual) : [...atual, c]))}
                />
              </div>

              <div>
                <label htmlFor="nd-descricao" className={classeRotulo}>O que precisa ser feito</label>
                <textarea
                  id="nd-descricao"
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: reconectar o número do WhatsApp do comercial que caiu hoje cedo."
                  className={`${classeCampo} h-auto py-3 leading-relaxed resize-none`}
                />
              </div>

              <div>
                <label htmlFor="nd-tags" className={classeRotulo}>
                  Etiquetas <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
                </label>
                {etiquetas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {etiquetas.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[13px] text-[#1d1d1f] dark:text-white">
                        #{t}
                        <button
                          type="button"
                          aria-label={`Remover ${t}`}
                          onClick={() => setEtiquetas((e) => e.filter((x) => x !== t))}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                        >
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  id="nd-tags"
                  type="text"
                  value={tagTexto}
                  onChange={(e) => setTagTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      adicionarTag(tagTexto);
                    }
                  }}
                  placeholder="Digite e tecle Enter"
                  autoComplete="off"
                  className={classeCampo}
                />
                {tagsSugeridas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tagsSugeridas.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => adicionarTag(t)}
                        className="h-7 px-2.5 rounded-full border border-dashed border-black/[0.15] dark:border-white/[0.18] text-xs text-slate-600 dark:text-zinc-400 hover:border-solid hover:text-[#1d1d1f] dark:hover:text-white cursor-pointer"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Prazo: fechado por padrão para não poluir */}
              <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.03]">
                <button type="button" aria-expanded={prazoAberto} onClick={() => setPrazoAberto((v) => !v)} className="w-full flex items-center gap-3 px-4 h-12 text-left cursor-pointer">
                  <CalendarIcon className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                  <span className="flex-1 text-[13px] font-medium">
                    Agendar prazo <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
                  </span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${prazoAberto ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <Expandir aberto={prazoAberto}>
                  <div className="px-4 pb-4 space-y-3">
                    <input type="datetime-local" aria-label="Prazo para executar" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={`${classeCampo} font-mono text-[13px]`} />
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={lembrete} onChange={(e) => setLembrete(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-[#4d7c0f]" />
                      <span>
                        <span className="block text-[13px] font-medium">Marcar como lembrete</span>
                        <span className="block text-xs text-slate-500 dark:text-zinc-400">Aparece em destaque na fila e na Agenda da equipe.</span>
                      </span>
                    </label>
                  </div>
                </Expandir>
              </div>
            </div>
          </Etapa>
        </div>
      </div>
    </ModalEtapas>
  );
}
