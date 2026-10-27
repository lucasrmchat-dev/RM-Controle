'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addAgendaEvento, updateAgendaEvento, getNomeTecnico, getCategoriasDemandas, getModelosTitulosAgenda, fetchModelosTitulosAgenda, getAgendaEventos, getWhatsappAgenda, fetchWhatsappAgenda, salvarPreferenciasWhatsapp, enviarWhatsappReuniao } from '@/lib/storage';
import { LEMBRETE_OPCOES, PREFERENCIAS_PADRAO, formatarTelefone, normalizarTelefone, textoTempoAntes } from '@/lib/whatsappAgenda';
import { TIPOS_PARTICIPANTE_AGENDA, dadosParticipanteAgenda, ordenarDepartamentosAgenda } from '@/lib/participantesAgenda';
import { sugestaoTituloReuniao, resolverTituloReuniao } from '@/lib/titulosAgenda';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import {
  ModalEtapas,
  Etapa,
  Combobox,
  Escolhido,
  ErroRodape,
  Spinner,
  classeBotaoPrimario,
  classeBotaoTexto,
} from './FormularioEtapas';
import { CalendarioMes, SeletorHorario, SeletorDuracao, minutosDe, horaDe, rotuloData, isoDoDia } from './SeletoresTempo';
import { BuildingIcon, CheckIcon, UserIcon } from './Icons';
import { showToast } from './ToastNotification';

const SEM_RESPONSAVEL = { email: '', nome: 'Sem responsável', detalhe: 'Reunião da equipe' };

const IconeVideo = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="14" height="12" rx="2.5" />
    <path d="m16 10 6-3v10l-6-3" />
  </svg>
);

/**
 * Criar, editar, remarcar e cancelar reuniões. Tudo o que é salvo aqui vai para o Google Agenda
 * (na agenda escolhida), com o responsável escrito na descrição do evento.
 */
export default function AgendaEventoModal({
  aberto,
  onFechar,
  evento = null,
  dataInicial = null,
  horaInicial = null,
  equipe = [],
  empresas = [],
  userEmail,
  agendas = [],
  agendaPadrao = null,
  googleAtivo = false,
  onCancelarReuniao,
  onExcluir,
}) {
  const editando = Boolean(evento?.id);
  const [titulo, setTitulo] = useState('');
  const [mostrarSugestaoNoCampo, setMostrarSugestaoNoCampo] = useState(false);
  const [modelos, setModelos] = useState(getModelosTitulosAgenda);
  const [carregandoModelos, setCarregandoModelos] = useState(false);
  const [falhaModelos, setFalhaModelos] = useState(false);
  const [tentativaModelos, setTentativaModelos] = useState(0);
  const [empresa, setEmpresa] = useState('');
  const [clienteDigitado, setClienteDigitado] = useState('');
  const [tipoParticipante, setTipoParticipante] = useState('empresa');
  const [empresaId, setEmpresaId] = useState('');
  const [eventosAgenda, setEventosAgenda] = useState(getAgendaEventos);
  const [departamento, setDepartamento] = useState('');
  const [departamentosCadastrados, setDepartamentosCadastrados] = useState(getCategoriasDemandas);
  const [obs, setObs] = useState('');
  const [responsavel, setResponsavel] = useState(null);
  const [data, setData] = useState(isoDoDia(new Date()));
  const [inicio, setInicio] = useState('09:00');
  const [fim, setFim] = useState('09:30');
  const [agendaId, setAgendaId] = useState(null);
  const [link, setLink] = useState('');
  const [gerarMeet, setGerarMeet] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const envioEmCurso = useRef(false);
  // Aviso ao cliente pelo WhatsApp
  const [whatsapp, setWhatsapp] = useState(getWhatsappAgenda);
  const [telefone, setTelefone] = useState('');
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(false);
  const [lembreteMin, setLembreteMin] = useState(null);
  const [lembrarConfirmacao, setLembrarConfirmacao] = useState(false);
  const [lembrarLembrete, setLembrarLembrete] = useState(false);

  // Equipe + quem está usando o sistema (o administrador nem sempre está em Equipe & Senhas)
  const pessoas = useMemo(() => {
    const meuEmail = (userEmail || '').toLowerCase();
    const lista = (equipe || [])
      .filter((u) => u && u.email && u.ativo !== false)
      .map((u) => ({ id: u.email, email: u.email.toLowerCase(), nome: u.nome || u.email, detalhe: u.email.toLowerCase() === meuEmail ? 'Você' : u.email }));
    if (meuEmail && !lista.some((p) => p.email === meuEmail)) lista.unshift({ id: meuEmail, email: meuEmail, nome: getNomeTecnico(meuEmail), detalhe: 'Você' });
    return [{ ...SEM_RESPONSAVEL, id: '__sem__' }, ...lista];
  }, [equipe, userEmail]);

  const departamentos = ordenarDepartamentosAgenda([...new Set([...departamentosCadastrados, ...(departamento ? [departamento] : [])])], eventosAgenda);

  useEffect(() => {
    if (!aberto) return;
    const atualizar = () => { setDepartamentosCadastrados(getCategoriasDemandas()); setEventosAgenda(getAgendaEventos()); };
    atualizar();
    const eventos = ['categorias_demandas_updated', 'departamentos_updated', 'agenda_eventos_updated', 'storage'];
    eventos.forEach((nome) => window.addEventListener(nome, atualizar));
    return () => eventos.forEach((nome) => window.removeEventListener(nome, atualizar));
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setCarregandoModelos(true);
    setFalhaModelos(false);
    const atualizar = () => setModelos(getModelosTitulosAgenda());
    window.addEventListener('agenda_titulos_updated', atualizar);
    fetchModelosTitulosAgenda().then((lista) => { if (ativo) setModelos(lista); })
      .catch(() => { if (ativo) setFalhaModelos(true); })
      .finally(() => { if (ativo) setCarregandoModelos(false); });
    return () => { ativo = false; window.removeEventListener('agenda_titulos_updated', atualizar); };
  }, [aberto, tentativaModelos]);

  useEffect(() => {
    if (!aberto) return;
    fetchWhatsappAgenda().then((w) => w && setWhatsapp(w)).catch(() => {});
  }, [aberto]);

  const opcoesEmpresa = useMemo(() => (empresas || []).map((e) => ({ id: e.id, nome: e.nome })), [empresas]);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setEnviando(false);
    setGerarMeet(false);
    setMostrarSugestaoNoCampo(false);
    setClienteDigitado(evento?.participante_nome || '');
    {
      const prefs = { ...PREFERENCIAS_PADRAO, ...(getWhatsappAgenda()?.preferencias || {}) };
      setTelefone(evento?.cliente_telefone ? formatarTelefone(evento.cliente_telefone) : '');
      // Criando: a preferência decide; editando: só reenvia se a pessoa pedir (ou se remarcar, ver abaixo)
      setEnviarConfirmacao(!evento && prefs.confirmacao !== 'nunca');
      setLembreteMin(evento ? evento.lembrete_minutos || null : prefs.lembrete === 'sempre' ? prefs.lembrete_minutos : null);
      setLembrarConfirmacao(false);
      setLembrarLembrete(false);
    }
    setTipoParticipante(evento?.participante_tipo || 'empresa');
    setEmpresaId(evento?.empresa_id || '');
    if (evento) {
      setTitulo(evento.titulo || '');
      setEmpresa(evento.empresa && evento.empresa !== 'Cliente Geral' ? evento.empresa : '');
      setObs(evento.observacoes || '');
      setDepartamento(evento.departamento || '');
      setResponsavel(evento.responsavel_email ? pessoas.find((p) => p.email === evento.responsavel_email.toLowerCase()) || { email: evento.responsavel_email, nome: evento.responsavel_nome || evento.responsavel_email } : SEM_RESPONSAVEL);
      setData(evento.data);
      setInicio(evento.hora_inicio || '09:00');
      setFim(evento.hora_fim || horaDe(minutosDe(evento.hora_inicio || '09:00') + 30));
      setAgendaId(evento.google_calendar_id || agendaPadrao);
      setLink(evento.link_reuniao || '');
    } else {
      // Próximo horário cheio quando a reunião é para hoje
      const agora = new Date();
      const proximo = horaDe(Math.max(7 * 60, Math.ceil((agora.getHours() * 60 + agora.getMinutes() + 1) / 15) * 15));
      const ini = horaInicial || (dataInicial && dataInicial !== isoDoDia(agora) ? '09:00' : proximo);
      setTitulo('');
      setEmpresa('');
      setObs('');
      setDepartamento('');
      setResponsavel(pessoas.find((p) => p.email === (userEmail || '').toLowerCase()) || null);
      setData(dataInicial || isoDoDia(agora));
      setInicio(ini);
      setFim(horaDe(minutosDe(ini) + 30));
      setAgendaId(agendaPadrao);
      setLink('');
      setGerarMeet(Boolean(googleAtivo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, evento?.id]);

  // Mudar o início mantém a duração; o término nunca fica a menos de 15 minutos do início
  const mudarInicio = (novo) => {
    const duracao = Math.max(15, minutosDe(fim) - minutosDe(inicio));
    setInicio(novo);
    setFim(horaDe(minutosDe(novo) + duracao));
  };

  const empresaSelecionada = empresas.find((e) => empresaId ? e.id === empresaId : empresa && e.nome?.trim().toLowerCase() === empresa.trim().toLowerCase());
  const clienteFinal = tipoParticipante === 'empresa' ? (empresaSelecionada?.nome || empresa) : clienteDigitado.trim();
  const nomeLegado = editando && !evento?.participante_tipo && !evento?.empresa_id && empresa === evento?.empresa ? empresa : '';
  const sugestao = !falhaModelos && !carregandoModelos ? sugestaoTituloReuniao(departamento, clienteFinal, modelos) : '';
  const tituloFinal = resolverTituloReuniao({ titulo, departamento, cliente: clienteFinal, modelos });
  const etapa1Ok = Boolean(tituloFinal && (editando || (departamento && clienteFinal)));
  const agendaAtual = agendas.find((a) => a.id === agendaId);
  const podeGerarMeet = googleAtivo && Boolean(agendaAtual) && !/meet\.google\.com/.test(link);

  const prefsWhatsapp = { ...PREFERENCIAS_PADRAO, ...(whatsapp?.preferencias || {}) };
  const telefoneNormalizado = normalizarTelefone(telefone);
  const whatsappPronto = Boolean(whatsapp?.pronto);
  const remarcou = editando && (data !== evento?.data || inicio !== (evento?.hora_inicio || '').slice(0, 5));

  // Remarcar a reunião sugere avisar o cliente de novo
  useEffect(() => {
    if (remarcou && telefoneNormalizado && prefsWhatsapp.confirmacao !== 'nunca') setEnviarConfirmacao(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remarcou]);

  const salvar = async () => {
    if (envioEmCurso.current) return;
    if (telefone.trim() && !telefoneNormalizado) return setErro('WhatsApp do cliente inválido. Use DDD + número, ex.: (85) 99999-0000.');
    if (!editando && !departamento) return setErro('Escolha o departamento da reunião.');
    let participante;
    try { participante = dadosParticipanteAgenda({ tipo: tipoParticipante, empresa: empresaSelecionada, nome: clienteDigitado, nomeLegado }); }
    catch (e) {
      if (editando && !clienteFinal && !evento?.participante_tipo) participante = { empresa: '', empresa_id: null, participante_tipo: null, participante_nome: null };
      else return setErro(e.message);
    }
    if (!titulo.trim() && carregandoModelos) return setErro('Aguarde a sugestão de título carregar.');
    if (!titulo.trim() && falhaModelos) return setErro('Informe um título ou tente carregar a sugestão novamente.');
    if (!tituloFinal) return setErro('Dê um título para a reunião.');
    if (minutosDe(fim) - minutosDe(inicio) < 15) return setErro('A reunião precisa ter pelo menos 15 minutos.');
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) return setErro('O link da sala precisa começar com https://');
    setErro('');
    envioEmCurso.current = true;
    setEnviando(true);
    const payload = {
      titulo: tituloFinal,
      ...participante,
      departamento: departamento.trim() || null,
      data,
      hora_inicio: inicio,
      hora_fim: fim,
      responsavel_email: responsavel?.email || null,
      responsavel_nome: responsavel?.email ? responsavel.nome : null,
      link_reuniao: gerarMeet && podeGerarMeet ? '' : link.trim(),
      observacoes: obs.trim(),
      tipo: evento?.tipo || 'cliente',
      status: evento?.status === 'cancelada' ? 'agendada' : evento?.status || 'agendada',
      // Só manda os campos do WhatsApp quando usados (funciona antes da migração do banco)
      ...(telefoneNormalizado || evento?.cliente_telefone ? { cliente_telefone: telefoneNormalizado || null } : {}),
      ...(lembreteMin || evento?.lembrete_minutos ? { lembrete_minutos: telefoneNormalizado ? lembreteMin : null } : {}),
      ...(editando && evento?.lembrete_minutos && (remarcou || lembreteMin !== evento.lembrete_minutos) ? { lembrete_enviado_em: null } : {}),
    };
    try {
      const opcoes = { gerarMeet: gerarMeet && podeGerarMeet };
      const salvo = editando
        ? await updateAgendaEvento(evento.id, payload, opcoes)
        : await addAgendaEvento({ ...payload, google_calendar_id: agendaId || null, criado_por: userEmail }, opcoes);
      if (salvo?.aviso_google) showToast(salvo.aviso_google, 'warning');
      else showToast(editando ? 'Reunião atualizada.' : agendaAtual ? `Reunião agendada em "${agendaAtual.nome}".` : 'Reunião agendada.', 'success');

      // Preferências marcadas como "lembrar" valem para os próximos agendamentos
      if ((lembrarConfirmacao || lembrarLembrete) && telefoneNormalizado) {
        salvarPreferenciasWhatsapp({
          ...prefsWhatsapp,
          ...(lembrarConfirmacao ? { confirmacao: enviarConfirmacao ? 'sempre' : 'nunca' } : {}),
          ...(lembrarLembrete ? { lembrete: lembreteMin ? 'sempre' : 'nunca', lembrete_minutos: lembreteMin || prefsWhatsapp.lembrete_minutos } : {}),
        }).catch(() => {});
      }
      if (enviarConfirmacao && telefoneNormalizado && whatsappPronto && salvo?.id) {
        enviarWhatsappReuniao(salvo.id, 'confirmacao')
          .then(() => showToast('Pedido de confirmação enviado ao cliente pelo WhatsApp.', 'success'))
          .catch((e) => showToast(`A reunião foi salva, mas o WhatsApp não foi enviado: ${e.message}`, 'warning'));
      }
      onFechar();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar a reunião.');
    } finally {
      envioEmCurso.current = false;
      setEnviando(false);
    }
  };

  const rodape = (
    <>
      <ErroRodape erro={erro} />
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
        {editando && (
          <div className="flex items-center gap-1 sm:mr-auto">
            {evento.status !== 'cancelada' && (
              <button type="button" onClick={() => onCancelarReuniao?.(evento)} disabled={enviando} className={`${classeBotaoTexto} !text-rose-600 dark:!text-rose-400`}>
                Cancelar reunião
              </button>
            )}
            <button type="button" onClick={() => onExcluir?.(evento)} disabled={enviando} className={`${classeBotaoTexto} !text-slate-500`}>
              Excluir
            </button>
          </div>
        )}
        <button type="button" onClick={onFechar} disabled={enviando} className={classeBotaoTexto}>
          Fechar
        </button>
        <button type="button" onClick={salvar} disabled={enviando} className={classeBotaoPrimario}>
          {enviando ? <Spinner /> : <CheckIcon className="w-4 h-4 stroke-[2.5]" />}
          {editando ? 'Salvar alterações' : 'Agendar reunião'}
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      idTitulo="agenda-evento-titulo"
      titulo={editando ? 'Editar reunião' : 'Nova reunião'}
      subtitulo={
        googleAtivo
          ? agendaAtual
            ? `Vai para o Google Agenda em "${agendaAtual.nome}".`
            : 'Salva no RM Controle.'
          : 'Salva na agenda da equipe no RM Controle.'
      }
      rodape={rodape}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-12">
        <div>
          <Etapa numero={1} titulo="Departamento e cliente" descricao="Escolha com quem será a reunião e veja a sugestão de título." estado={etapa1Ok ? 'concluida' : 'ativa'}>
            <div className="space-y-4">
              <div>
                <label htmlFor="ag-departamento" className={classeRotulo}>Departamento {!editando && <span className="text-red-600 dark:text-red-400">*</span>}</label>
                {departamento ? (
                  <Escolhido icone={<BuildingIcon className="w-4 h-4" />} titulo={departamento} onTrocar={() => setDepartamento('')} />
                ) : (
                  <Combobox id="ag-departamento" autoFocus limiteResultados={null} placeholder="Buscar departamento" opcoes={departamentos.map((nome) => ({ id: nome, nome }))} onEscolher={(opcao) => setDepartamento(opcao.nome)} textoVazio="Nenhum departamento cadastrado com esse nome." renderOpcao={(opcao) => <span className="text-sm font-medium">{opcao.nome}</span>} />
                )}
              </div>
              <div className="space-y-3">
                <p id="ag-participante-rotulo" className={classeRotulo}>Com quem será a reunião {!editando && <span className="text-red-600 dark:text-red-400">*</span>}</p>
                <div role="radiogroup" aria-labelledby="ag-participante-rotulo" className="flex flex-wrap gap-2">
                  {TIPOS_PARTICIPANTE_AGENDA.map((opcao) => <button key={opcao.id} type="button" role="radio" aria-checked={tipoParticipante === opcao.id} onClick={() => { if (tipoParticipante === opcao.id) return; setTipoParticipante(opcao.id); setEmpresa(''); setEmpresaId(''); setClienteDigitado(''); }} className={`min-h-9 px-3 py-2 rounded-full text-xs font-medium border cursor-pointer ${tipoParticipante === opcao.id ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] border-transparent' : 'border-black/15 dark:border-white/20 text-slate-600 dark:text-zinc-300'}`}>{opcao.nome}</button>)}
                </div>
                {tipoParticipante === 'empresa' ? (
                  <div><label htmlFor="ag-empresa" className={classeRotulo}>Empresa cadastrada</label>
                  {empresa ? <Escolhido icone={<BuildingIcon className="w-4 h-4" />} titulo={empresa} onTrocar={() => { setEmpresa(''); setEmpresaId(''); }} /> : (
                    <Combobox id="ag-empresa" placeholder="Buscar empresa cadastrada" opcoes={opcoesEmpresa} onEscolher={(e) => { setEmpresa(e.nome); setEmpresaId(e.id); }} textoVazio="Empresa não encontrada. Para um cliente ainda não cadastrado, escolha Cliente novo." renderOpcao={(e) => <span className="text-sm font-medium truncate">{e.nome}</span>} />
                  )}</div>
                ) : (
                  <div>
                    <label htmlFor="ag-participante-nome" className={classeRotulo}>{tipoParticipante === 'parceiro' ? 'Nome do parceiro' : 'Nome do cliente'}</label>
                    <input id="ag-participante-nome" value={clienteDigitado} onChange={(e) => setClienteDigitado(e.target.value)} maxLength={200} placeholder={tipoParticipante === 'parceiro' ? 'Pessoa ou organização parceira' : 'Pessoa ou empresa que será atendida'} className={classeCampo} />
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">Este nome fica apenas na reunião. Não cria um cadastro de empresa.</p>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="ag-titulo" className={classeRotulo}>Título da reunião <span className="font-normal text-slate-500 dark:text-zinc-400">(personalize se quiser)</span></label>
                <input id="ag-titulo" value={titulo || (mostrarSugestaoNoCampo ? sugestao : '')} onChange={(e) => { setTitulo(e.target.value); setMostrarSugestaoNoCampo(false); }} maxLength={200} placeholder={sugestao || 'Defina departamento e cliente para ver a sugestão'} className={classeCampo} />
                {carregandoModelos && <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400" role="status">Carregando sugestão…</p>}
                {sugestao && <div className="mt-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] px-3.5 py-3 space-y-1.5"><p className="text-xs text-slate-500 dark:text-zinc-400">Sugestão do departamento</p><p className="text-sm font-medium break-words">{sugestao}</p><button type="button" onClick={() => { setTitulo(''); setMostrarSugestaoNoCampo(true); }} className="text-xs font-semibold underline underline-offset-4 cursor-pointer">Usar sugestão</button>{!titulo.trim() && <p className="text-xs text-slate-500 dark:text-zinc-400">Ao agendar, este título será usado automaticamente.</p>}</div>}
                {falhaModelos && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Não foi possível carregar a sugestão. Você pode escrever o título ou <button type="button" onClick={() => setTentativaModelos((n) => n + 1)} className="underline cursor-pointer">tentar novamente</button>.</p>}
              </div>
              <div>
                <label htmlFor="ag-obs" className={classeRotulo}>
                  Pauta <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
                </label>
                <textarea
                  id="ag-obs"
                  rows={3}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Tópicos da conversa, orientações prévias…"
                  className={`${classeCampo} h-auto py-3 leading-relaxed resize-none`}
                />
              </div>
            </div>
          </Etapa>

          <Etapa numero={2} titulo="Quem e onde" descricao="Responsável e sala da reunião." estado={!etapa1Ok ? 'ativa' : 'concluida'} fimDeColuna>
            <div className="space-y-4">
              <div>
                <span className={classeRotulo}>Responsável</span>
                {responsavel ? (
                  <Escolhido
                    icone={<UserIcon className="w-4 h-4" />}
                    titulo={responsavel.nome}
                    detalhe={responsavel.email ? (responsavel.email === (userEmail || '').toLowerCase() ? 'Você' : responsavel.email) : responsavel.detalhe}
                    onTrocar={() => setResponsavel(null)}
                  />
                ) : (
                  <Combobox
                    id="ag-responsavel"
                    placeholder="Digite o nome de quem conduz"
                    opcoes={pessoas}
                    onEscolher={setResponsavel}
                    renderOpcao={(p) => (
                      <span className="block min-w-0">
                        <span className="block text-sm font-medium truncate">{p.nome}</span>
                        {p.detalhe && <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{p.detalhe}</span>}
                      </span>
                    )}
                  />
                )}
              </div>

              {agendas.length > 1 && !editando && (
                <div>
                  <span id="ag-agenda" className={classeRotulo}>Agenda do Google</span>
                  <div role="radiogroup" aria-labelledby="ag-agenda" className="flex flex-wrap gap-2">
                    {agendas.map((a) => {
                      const ativo = a.id === agendaId;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="radio"
                          aria-checked={ativo}
                          onClick={() => setAgendaId(a.id)}
                          className={`h-9 px-3.5 rounded-full text-[13px] font-medium border flex items-center gap-2 cursor-pointer transition-colors ${
                            ativo
                              ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent'
                              : 'bg-white dark:bg-white/[0.04] border-black/[0.12] dark:border-white/[0.14] text-slate-700 dark:text-zinc-300 hover:border-black/25 dark:hover:border-white/25'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ background: a.cor || '#8e8e93' }} aria-hidden="true" />
                          {a.nome}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <span className={classeRotulo}>Sala virtual</span>
                {gerarMeet && podeGerarMeet ? (
                  <Escolhido
                    icone={<IconeVideo />}
                    titulo="Google Meet"
                    detalhe="O link é criado automaticamente ao salvar"
                    onTrocar={() => setGerarMeet(false)}
                    rotuloTrocar="Usar outro link"
                  />
                ) : (
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="Cole o link (Meet, Zoom, Teams) ou deixe vazio"
                      aria-label="Link da sala virtual"
                      className={`${classeCampo} font-mono text-[13px]`}
                    />
                    {podeGerarMeet && (
                      <button
                        type="button"
                        onClick={() => {
                          setGerarMeet(true);
                          setLink('');
                        }}
                        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        <IconeVideo /> Gerar link do Google Meet
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Etapa>
        </div>

        <div className="lg:pl-12 lg:border-l border-black/[0.06] dark:border-white/[0.08]">
          <Etapa numero={3} titulo="Quando" descricao={`${rotuloData(data)}, das ${inicio} às ${fim}`} estado="concluida">
            <div className="space-y-5">
              <CalendarioMes valor={data} onMudar={setData} />
              <div>
                <span id="ag-inicio" className={classeRotulo}>Começa às</span>
                <SeletorHorario valor={inicio} onMudar={mudarInicio} rotuloId="ag-inicio" />
              </div>
              <div>
                <span id="ag-duracao" className={classeRotulo}>Duração</span>
                <SeletorDuracao inicio={inicio} fim={fim} onMudar={setFim} rotuloId="ag-duracao" />
              </div>
            </div>
          </Etapa>

          <Etapa numero={4} titulo="Aviso ao cliente" descricao="Opcional. Confirmação e lembrete pelo WhatsApp." estado="concluida" ultima>
            <div className="space-y-4">
              <div>
                <label htmlFor="ag-telefone" className={classeRotulo}>
                  WhatsApp do cliente <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
                </label>
                <input
                  id="ag-telefone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  onBlur={() => telefoneNormalizado && setTelefone(formatarTelefone(telefone))}
                  placeholder="(85) 99999-0000"
                  maxLength={25}
                  className={classeCampo}
                />
                {telefone.trim() && !telefoneNormalizado && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">Use DDD + número.</p>}
              </div>

              {telefoneNormalizado && !whatsappPronto && (
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  O número fica salvo na reunião. O envio pelo WhatsApp ainda não foi ligado em Configurações avançadas › WhatsApp da agenda.
                </p>
              )}

              {telefoneNormalizado && whatsappPronto && (
                <>
                  <div className="rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] p-3.5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={enviarConfirmacao} onChange={(e) => setEnviarConfirmacao(e.target.checked)} className="mt-0.5 w-4 h-4 accent-rm-acento cursor-pointer" />
                      <span>
                        <span className="block text-sm font-medium">{editando ? 'Enviar de novo o pedido de confirmação' : 'Pedir confirmação ao cliente'}</span>
                        <span className="block text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          {evento?.confirmacao_status === 'confirmada' && !remarcou ? 'O cliente já confirmou esta reunião.' : 'Ele recebe um link para confirmar, remarcar ou cancelar.'}
                        </span>
                      </span>
                    </label>
                    {prefsWhatsapp.confirmacao === 'perguntar' && (
                      <label className="mt-2.5 ml-7 flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 cursor-pointer">
                        <input type="checkbox" checked={lembrarConfirmacao} onChange={(e) => setLembrarConfirmacao(e.target.checked)} className="w-3.5 h-3.5 accent-rm-acento cursor-pointer" />
                        {enviarConfirmacao ? 'Sempre pedir confirmação nos próximos agendamentos' : 'Não perguntar mais (nunca enviar)'}
                      </label>
                    )}
                  </div>

                  <div>
                    <span id="ag-lembrete" className={classeRotulo}>
                      Lembrete pelo WhatsApp
                    </span>
                    <div role="radiogroup" aria-labelledby="ag-lembrete" className="flex flex-wrap gap-2">
                      {[null, ...LEMBRETE_OPCOES].map((min) => {
                        const ativo = lembreteMin === min;
                        return (
                          <button
                            key={min ?? 'sem'}
                            type="button"
                            role="radio"
                            aria-checked={ativo}
                            onClick={() => setLembreteMin(min)}
                            className={`h-9 px-3.5 rounded-full text-[13px] font-medium border cursor-pointer transition-colors ${
                              ativo ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent' : 'bg-white dark:bg-white/[0.04] border-black/[0.12] dark:border-white/[0.14] text-slate-700 dark:text-zinc-300 hover:border-black/25 dark:hover:border-white/25'
                            }`}
                          >
                            {min ? `${textoTempoAntes(min)} antes` : 'Sem lembrete'}
                          </button>
                        );
                      })}
                    </div>
                    {evento?.lembrete_enviado_em && !remarcou && lembreteMin === evento.lembrete_minutos && <p className="mt-2 text-xs text-rm-acento dark:text-rm-acento-vivo">Lembrete já enviado.</p>}
                    {prefsWhatsapp.lembrete !== 'sempre' || (lembreteMin || null) !== prefsWhatsapp.lembrete_minutos ? (
                      <label className="mt-2.5 flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 cursor-pointer">
                        <input type="checkbox" checked={lembrarLembrete} onChange={(e) => setLembrarLembrete(e.target.checked)} className="w-3.5 h-3.5 accent-rm-acento cursor-pointer" />
                        {lembreteMin ? `Usar ${textoTempoAntes(lembreteMin)} antes em todos os próximos agendamentos` : 'Não sugerir lembrete nos próximos agendamentos'}
                      </label>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </Etapa>
        </div>
      </div>
    </ModalEtapas>
  );
}

