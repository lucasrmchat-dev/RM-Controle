'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { addAgendaEvento, updateAgendaEvento, getNomeTecnico } from '@/lib/storage';
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
  const [empresa, setEmpresa] = useState('');
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

  // Equipe + quem está usando o sistema (o administrador nem sempre está em Equipe & Senhas)
  const pessoas = useMemo(() => {
    const meuEmail = (userEmail || '').toLowerCase();
    const lista = (equipe || [])
      .filter((u) => u && u.email && u.ativo !== false)
      .map((u) => ({ id: u.email, email: u.email.toLowerCase(), nome: u.nome || u.email, detalhe: u.email.toLowerCase() === meuEmail ? 'Você' : u.email }));
    if (meuEmail && !lista.some((p) => p.email === meuEmail)) lista.unshift({ id: meuEmail, email: meuEmail, nome: getNomeTecnico(meuEmail), detalhe: 'Você' });
    return [{ ...SEM_RESPONSAVEL, id: '__sem__' }, ...lista];
  }, [equipe, userEmail]);

  const opcoesEmpresa = useMemo(() => (empresas || []).map((e) => ({ id: e.id, nome: e.nome })), [empresas]);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setEnviando(false);
    setGerarMeet(false);
    if (evento) {
      setTitulo(evento.titulo || '');
      setEmpresa(evento.empresa && evento.empresa !== 'Cliente Geral' ? evento.empresa : '');
      setObs(evento.observacoes || '');
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

  const etapa1Ok = titulo.trim().length > 0;
  const agendaAtual = agendas.find((a) => a.id === agendaId);
  const podeGerarMeet = googleAtivo && Boolean(agendaAtual) && !/meet\.google\.com/.test(link);

  const salvar = async () => {
    if (enviando) return;
    if (!titulo.trim()) return setErro('Dê um título para a reunião.');
    if (minutosDe(fim) - minutosDe(inicio) < 15) return setErro('A reunião precisa ter pelo menos 15 minutos.');
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) return setErro('O link da sala precisa começar com https://');
    setErro('');
    setEnviando(true);
    const payload = {
      titulo: titulo.trim(),
      empresa: empresa.trim(),
      data,
      hora_inicio: inicio,
      hora_fim: fim,
      responsavel_email: responsavel?.email || null,
      responsavel_nome: responsavel?.email ? responsavel.nome : null,
      link_reuniao: gerarMeet && podeGerarMeet ? '' : link.trim(),
      observacoes: obs.trim(),
      tipo: evento?.tipo || 'cliente',
      status: evento?.status === 'cancelada' ? 'agendada' : evento?.status || 'agendada',
    };
    try {
      const opcoes = { gerarMeet: gerarMeet && podeGerarMeet };
      const salvo = editando
        ? await updateAgendaEvento(evento.id, payload, opcoes)
        : await addAgendaEvento({ ...payload, google_calendar_id: agendaId || null, criado_por: userEmail }, opcoes);
      if (salvo?.aviso_google) showToast(salvo.aviso_google, 'warning');
      else showToast(editando ? 'Reunião atualizada.' : agendaAtual ? `Reunião agendada em "${agendaAtual.nome}".` : 'Reunião agendada.', 'success');
      onFechar();
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar a reunião.');
    } finally {
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
          <Etapa numero={1} titulo="Assunto" descricao="Sobre o que é a reunião." estado={etapa1Ok ? 'concluida' : 'ativa'}>
            <div className="space-y-4">
              <div>
                <label htmlFor="ag-titulo" className={classeRotulo}>
                  Título <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  id="ag-titulo"
                  autoFocus
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  maxLength={200}
                  placeholder="Ex.: Implantação Padaria Sol"
                  className={classeCampo}
                />
              </div>
              <div>
                <span className={classeRotulo}>
                  Empresa <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
                </span>
                {empresa ? (
                  <Escolhido icone={<BuildingIcon className="w-4 h-4" />} titulo={empresa} onTrocar={() => setEmpresa('')} />
                ) : (
                  <Combobox
                    id="ag-empresa"
                    placeholder="Digite o nome da empresa"
                    opcoes={opcoesEmpresa}
                    onEscolher={(e) => setEmpresa(e.nome)}
                    onNova={(nome) => setEmpresa(nome)}
                    opcaoNova={(t) => `Usar “${t}”`}
                    renderOpcao={(e) => <span className="text-sm font-medium truncate">{e.nome}</span>}
                  />
                )}
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
          <Etapa numero={3} titulo="Quando" descricao={`${rotuloData(data)}, das ${inicio} às ${fim}`} estado="concluida" ultima>
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
        </div>
      </div>
    </ModalEtapas>
  );
}

