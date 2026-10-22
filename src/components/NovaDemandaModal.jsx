'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getEmpresaById, getEmpresaCredenciais, getNomeTecnico } from '@/lib/storage';
import { CalendarioMes, SeletorHorario, isoDoDia, rotuloData } from './SeletoresTempo';
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
  classeBotaoTexto,
} from './FormularioEtapas';
import { BuildingIcon, CalendarIcon, PlayIcon, UserIcon, XMarkIcon } from './Icons';

// Como descrever a demanda: o relato do cliente (para quem atender interpretar) ou o que já se sabe que precisa ser feito
const TIPOS_DESCRICAO = {
  relato: {
    rotulo: 'Relato do cliente',
    curto: 'Relato',
    campo: 'O que o cliente relatou',
    exemplo: 'Ex.: “as mensagens pararam de chegar no número do comercial desde hoje cedo”.',
    prefixo: 'Relato do cliente: ',
  },
  fazer: {
    rotulo: 'O que precisa ser feito',
    curto: 'O que fazer',
    campo: 'O que precisa ser feito',
    exemplo: 'Ex.: reconectar o número do WhatsApp do comercial e reenviar as mensagens da fila.',
    prefixo: '',
  },
  nenhum: { rotulo: 'Sem descrição', curto: 'Sem texto' },
};

const DESTINOS = [
  { id: 'fila', titulo: 'Fila', detalhe: 'Qualquer pessoa assume' },
  { id: 'mim', titulo: 'Eu', detalhe: 'Começo a atender agora' },
  { id: 'outra', titulo: 'Outra pessoa', detalhe: 'Abre direto para alguém' },
];

/**
 * Formulário de nova demanda em 3 colunas: empresa e quem pediu → sobre a demanda → quem atende e prazo.
 * No celular, uma etapa abaixo da outra. Quem cria de fato é o pai (onEnviar), que recebe tudo organizado.
 */
export default function NovaDemandaModal({
  aberto,
  onFechar,
  empresas = [],
  empresaInicial = null,
  categorias = [],
  etiquetasSugeridas = [],
  equipe = [],
  userEmail = '',
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
  const [tipoDescricao, setTipoDescricao] = useState('relato'); // 'relato' | 'fazer' | 'nenhum'
  const [prazoAberto, setPrazoAberto] = useState(false);
  const [prazoData, setPrazoData] = useState(isoDoDia(new Date()));
  const [prazoHora, setPrazoHora] = useState('18:00');
  const [destino, setDestino] = useState('fila'); // 'fila' | 'mim' | 'outra'
  const [pessoa, setPessoa] = useState(null); // { email, nome } quando destino = 'outra'
  const [lembrete, setLembrete] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setEmpresa(empresaInicial || null);
    setDadosEmpresa(dadosNovaEmpresaIniciais());
    setSolicitante(null);
    setCats(categorias.includes('Suporte') ? ['Suporte'] : categorias.slice(0, 1));
    setEtiquetas([]);
    setTagTexto('');
    setDescricao('');
    setTipoDescricao('relato');
    setPrazoAberto(false);
    setPrazoData(isoDoDia(new Date()));
    setPrazoHora('18:00');
    setLembrete(false);
    setDestino('fila');
    setPessoa(null);
    setErro('');
    setEnviando(false);
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

  // Para quem pode abrir: equipe ativa, sem a própria pessoa (para ela existe "Eu")
  const pessoas = useMemo(() => {
    const eu = String(userEmail || '').toLowerCase();
    return (equipe || [])
      .filter((u) => u?.email && u.ativo !== false && u.email.toLowerCase() !== eu)
      .map((u) => ({ id: u.email.toLowerCase(), email: u.email.toLowerCase(), nome: u.nome || getNomeTecnico(u.email) }));
  }, [equipe, userEmail]);

  const tagsSugeridas = useMemo(() => {
    const q = normalizarBusca(tagTexto.replace(/^#/, ''));
    return etiquetasSugeridas.filter((t) => !etiquetas.includes(t) && (!q || normalizarBusca(t).includes(q))).slice(0, 6);
  }, [etiquetasSugeridas, etiquetas, tagTexto]);

  const adicionarTag = (t) => {
    const limpa = String(t || '').trim().replace(/^#/, '');
    if (limpa && !etiquetas.includes(limpa)) setEtiquetas((e) => [...e, limpa]);
    setTagTexto('');
  };

  const enviar = async () => {
    if (enviando) return;
    if (!empresa) return setErro('Escolha a empresa da demanda.');
    if (empresa.isNova && !dadosEmpresa.tipo_cliente) return setErro('Empresa nova: informe se é cliente novo ou se já era cliente.');
    if (!cats.length) return setErro('Escolha ao menos um departamento.');
    if (destino === 'outra' && !pessoa) return setErro('Escolha para quem a demanda vai.');
    setErro('');
    setEnviando(true);
    try {
      await onEnviar(
        {
          empresa,
          novaEmpresa: empresa.isNova ? dadosEmpresa : null,
          solicitante,
          categorias: cats,
          etiquetas,
          // O relato vai marcado, para quem pegar saber que são palavras do cliente
          observacao: tipoDescricao === 'nenhum' || !descricao.trim() ? '' : `${TIPOS_DESCRICAO[tipoDescricao].prefixo}${descricao.trim()}`,
          // Data e hora locais; quem grava converte para o fuso certo
          prazo: prazoAberto ? `${prazoData}T${prazoHora}` : null,
          lembrete: prazoAberto && lembrete,
        },
        { paraMim: destino === 'mim', atribuirA: destino === 'outra' ? pessoa : null }
      );
    } catch (e) {
      setErro(e?.message || 'Não foi possível abrir a demanda.');
    } finally {
      setEnviando(false);
    }
  };

  const rotuloEnviar =
    destino === 'mim' ? 'Abrir e começar a atender' : destino === 'outra' ? (pessoa ? `Abrir para ${pessoa.nome.split(' ')[0]}` : 'Abrir para…') : 'Abrir na fila';

  const rodape = (
    <>
      <ErroRodape erro={erro} />
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
        <button type="button" onClick={onFechar} disabled={enviando} className={`${classeBotaoTexto} sm:mr-auto`}>
          Cancelar
        </button>
        <button type="button" onClick={enviar} disabled={enviando} className={classeBotaoPrimario}>
          {enviando ? <Spinner /> : destino === 'mim' ? <PlayIcon className="w-3 h-3 fill-current" /> : null}
          {rotuloEnviar}
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-[1320px]"
      idTitulo="nova-demanda-titulo"
      titulo="Nova demanda"
      subtitulo="Empresa e quem pediu, o que precisa ser feito, e quem atende."
      rodape={rodape}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-x-10">
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
        <div className="lg:pl-12 lg:border-l border-black/[0.06] dark:border-white/[0.11]">
          <Etapa
            numero={3}
            titulo="Departamento"
            descricao="Quem é responsável por esta demanda."
            estado={!etapa1Ok ? 'travada' : cats.length ? 'concluida' : 'ativa'}
          >
            <Pilulas
              rotuloId="nd-dep"
              opcoes={categorias}
              selecionadas={cats}
              onAlternar={(c) => setCats((atual) => (atual.includes(c) ? (atual.length > 1 ? atual.filter((x) => x !== c) : atual) : [...atual, c]))}
            />
          </Etapa>

          <Etapa
            numero={4}
            titulo="Sobre a demanda"
            descricao="Conte o que o cliente disse ou o que já se sabe que precisa ser feito."
            estado={!etapa1Ok ? 'travada' : tipoDescricao === 'nenhum' || descricao.trim() ? 'concluida' : 'ativa'}
            fimDeColuna
          >
            <div className="space-y-5">
              <div>
                <div role="radiogroup" aria-label="Como descrever a demanda" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]">
                  {Object.entries(TIPOS_DESCRICAO).map(([id, t]) => {
                    const ativo = tipoDescricao === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        onClick={() => setTipoDescricao(id)}
                        title={t.rotulo}
                        className={`min-h-9 py-1.5 px-2 rounded-xl text-[12.5px] leading-tight font-medium cursor-pointer transition-colors ${
                          ativo ? 'bg-white dark:bg-[#3a3a3f] text-[#1d1d1f] dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'
                        }`}
                      >
                        {t.curto}
                      </button>
                    );
                  })}
                </div>
                {tipoDescricao === 'nenhum' ? (
                  <p className="mt-3 text-[12.5px] text-slate-500 dark:text-zinc-400">A demanda abre só com a empresa e o departamento. Dá para escrever a descrição depois, na própria demanda.</p>
                ) : (
                  <div className="mt-3">
                    <label htmlFor="nd-descricao" className={classeRotulo}>
                      {TIPOS_DESCRICAO[tipoDescricao].campo}
                    </label>
                    <textarea
                      id="nd-descricao"
                      rows={4}
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder={TIPOS_DESCRICAO[tipoDescricao].exemplo}
                      className={`${classeCampo} h-auto py-3 leading-relaxed resize-none`}
                    />
                  </div>
                )}
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

            </div>
          </Etapa>
        </div>

        {/* COLUNA 3: quem atende e prazo */}
        <div className="lg:pl-10 lg:border-l border-black/[0.06] dark:border-white/[0.11]">
          <Etapa numero={5} titulo="Quem atende" descricao="Deixe na fila, pegue para você ou mande direto para alguém." estado={destino === 'outra' && !pessoa ? 'ativa' : 'concluida'}>
            <div role="radiogroup" aria-label="Quem atende" className="grid grid-cols-3 gap-2">
              {DESTINOS.map((d) => {
                const ativo = destino === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setDestino(d.id)}
                    className={`text-left rounded-2xl px-3 py-2.5 ring-1 transition-colors cursor-pointer ${
                      ativo ? 'ring-2 ring-[#1d1d1f] dark:ring-white bg-black/[0.03] dark:bg-white/[0.06]' : 'ring-black/[0.1] dark:ring-white/[0.12] hover:ring-black/25 dark:hover:ring-white/25'
                    }`}
                  >
                    <span className="block text-[13px] font-semibold">{d.titulo}</span>
                    <span className="block text-[11.5px] leading-snug text-slate-500 dark:text-zinc-400">{d.detalhe}</span>
                  </button>
                );
              })}
            </div>
            <Expandir aberto={destino === 'outra'}>
              <div className="mt-3">
                {pessoa ? (
                  <Escolhido icone={<UserIcon className="w-4 h-4" />} titulo={pessoa.nome} detalhe={pessoa.email} onTrocar={() => setPessoa(null)} />
                ) : (
                  <Combobox
                    id="nd-pessoa"
                    placeholder="Buscar alguém da equipe"
                    textoVazio={pessoas.length ? 'Ninguém da equipe com esse nome.' : 'Nenhum colaborador cadastrado em Servidores & Equipe.'}
                    opcoes={pessoas}
                    onEscolher={setPessoa}
                    renderOpcao={(p) => (
                      <span className="block min-w-0">
                        <span className="block text-sm font-medium truncate">{p.nome}</span>
                        <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{p.email}</span>
                      </span>
                    )}
                  />
                )}
                {!pessoa && <p className="mt-1.5 text-[12px] text-slate-500 dark:text-zinc-400">Só colaboradores já cadastrados na equipe.</p>}
              </div>
            </Expandir>
          </Etapa>

          <Etapa
            numero={6}
            titulo={<>Prazo <span className="font-normal text-slate-500 dark:text-zinc-400">· opcional</span></>}
            descricao={prazoAberto ? `Até ${rotuloData(prazoData)}, às ${prazoHora}` : 'Para demandas com data para ficar pronta.'}
            estado={prazoAberto ? 'concluida' : 'ativa'}
            ultima
          >
            {!prazoAberto ? (
              <button
                type="button"
                onClick={() => setPrazoAberto(true)}
                className="h-10 px-4 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] inline-flex items-center gap-2 cursor-pointer"
              >
                <CalendarIcon className="w-4 h-4" /> Definir prazo
              </button>
            ) : (
              <div className="space-y-3">
                <CalendarioMes valor={prazoData} onMudar={setPrazoData} />
                <div>
                  <span id="nd-prazo-hora" className={classeRotulo}>Até às</span>
                  <SeletorHorario valor={prazoHora} onMudar={setPrazoHora} rotuloId="nd-prazo-hora" />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={lembrete} onChange={(e) => setLembrete(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-[#4d7c0f]" />
                  <span>
                    <span className="block text-[13px] font-medium">Marcar como lembrete</span>
                    <span className="block text-xs text-slate-500 dark:text-zinc-400">Aparece em destaque na fila e na Agenda da equipe.</span>
                  </span>
                </label>
                <button type="button" onClick={() => setPrazoAberto(false)} className="text-[12.5px] font-medium text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white cursor-pointer">
                  Remover prazo
                </button>
              </div>
            )}
          </Etapa>
        </div>
      </div>
    </ModalEtapas>
  );
}
