'use client';

import { DESFECHOS_COMERCIAIS, FORA_DO_PROCESSO, posicaoComercial, resumoComercial } from '@/lib/comercial';
import { nomeParticipanteAgenda } from '@/lib/participantesAgenda';
import { ehGestorComercial, podeVerDepartamento } from '@/lib/perfis';
import {
  deleteAgendaEvento,
  editarLeadComercial,
  excluirOportunidadeComercial,
  getAgendaEventos,
  getConfigComercial,
  getEmpresas,
  getEquipeUsuarios,
  getPermissoesAtuais,
  moverReuniaoComercial,
} from '@/lib/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { classeCampo } from './NovaEmpresaCampos';
import SeletorMes from './SeletorMes';
import EncaixeCabecalho, { ACOES_TITULO, LINHA_TITULO } from './EncaixeCabecalho';
import { createPortal } from 'react-dom';
import AgendaEventoModal from './AgendaEventoModal';
import ConfirmModal from './ConfirmModal';
import ListaReunioesComercial from './ListaReunioesComercial';
import ComissaoComercial, { VendaModal } from './ComissaoComercial';
import { showToast } from './ToastNotification';

const STATUS = { agendada: 'Agendada', concluida: 'Realizada', cancelada: 'Cancelada' };
/** Um cartão do processo comercial: arrastável, com Ganho/Perda rápidos e o menu ⋯. */
function CartaoOportunidade({ e, posicao, config, pipeline, movendo, arrastando, menuAberto, onMenu, onArrastar, onMover, onEditar, onExcluir }) {
  const menu = useRef(null);
  const lista = useRef(null);
  // O menu abre por cima de tudo, preso ao botão (o quadro tem rolagem e cortaria a lista)
  const [lugar, setLugar] = useState(null);
  useEffect(() => {
    if (!menuAberto) return undefined;
    const r = menu.current?.getBoundingClientRect();
    if (r) setLugar({ top: Math.min(r.bottom + 4, window.innerHeight - 340), right: Math.max(8, window.innerWidth - r.right) });
    const fora = (ev) => !menu.current?.contains(ev.target) && !lista.current?.contains(ev.target) && onMenu(false);
    const fechar = () => onMenu(false);
    document.addEventListener('pointerdown', fora);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('pointerdown', fora);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [menuAberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const encerrada = posicao.etapaId === 'ganho' || posicao.etapaId === 'perda';
  const primeira = pipeline.etapas[0]?.id;
  const item = (rotulo, fn, classe = '', chave = rotulo) => (
    <button
      key={chave}
      type="button"
      onClick={() => {
        onMenu(false);
        fn();
      }}
      className={`w-full text-left px-3 py-2 rounded-lg text-[13px] cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${classe}`}
    >
      {rotulo}
    </button>
  );
  return (
    <article
      draggable={!movendo}
      onDragStart={(ev) => {
        ev.dataTransfer.setData('text/rm-reuniao', e.id);
        ev.dataTransfer.effectAllowed = 'move';
        onArrastar(true);
      }}
      onDragEnd={() => onArrastar(false)}
      aria-busy={movendo === e.id}
      className={`group relative rounded-xl border bg-white dark:bg-rm-elevado-escuro p-4 space-y-3 cursor-grab active:cursor-grabbing transition-all ${
        arrastando ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md'
      } ${posicao.etapaId === 'ganho' ? 'border-emerald-500/40' : posicao.etapaId === 'perda' ? 'border-rose-500/40' : 'border-black/[0.08] dark:border-white/[0.1]'}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {e.departamento} · {e._tipo === 'lead' ? 'Lead · RM Chat' : STATUS[e.status] || 'Agendada'}
          </p>
          <h4 className="font-semibold text-sm mt-1 break-words">{e._tipo === 'lead' ? e.nome : nomeParticipanteAgenda(e) || e.titulo}</h4>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 break-words">{e._tipo === 'lead' ? e.email || e.telefone || 'Recebido por webhook' : e.titulo}</p>
        </div>
        <div className="relative flex-shrink-0" ref={menu}>
          <button
            type="button"
            onClick={() => onMenu(!menuAberto)}
            aria-label={`Ações de ${e._tipo === 'lead' ? e.nome : e.titulo}`}
            aria-expanded={menuAberto}
            className="w-8 h-8 -mr-2 -mt-1 rounded-full flex items-center justify-center text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {menuAberto && lugar && createPortal(
            <div ref={lista} style={{ top: lugar.top, right: lugar.right }} className="fixed z-[9999] w-56 max-h-80 overflow-y-auto p-1 rounded-xl bg-white dark:bg-rm-elevado-escuro shadow-xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] text-[#1d1d1f] dark:text-zinc-100">
              {item('Editar', onEditar)}
              {posicao.etapaId !== 'ganho' && item('Marcar como ganho', () => onMover(posicao.pipelineId, 'ganho'), 'text-emerald-700 dark:text-emerald-300')}
              {posicao.etapaId !== 'perda' && item('Marcar como perda', () => onMover(posicao.pipelineId, 'perda'), 'text-rose-700 dark:text-rose-300')}
              <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Mover para</p>
              {config.pipelines.map((p) =>
                [...p.etapas].map((s) =>
                  p.id === posicao.pipelineId && s.id === posicao.etapaId
                    ? null
                    : item(config.pipelines.length > 1 ? `${p.nome} › ${s.nome}` : s.nome, () => onMover(p.id, s.id), '', `${p.id}:${s.id}`)
                )
              )}
              <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
              {item('Excluir oportunidade', onExcluir, 'text-rose-600 dark:text-rose-400')}
            </div>,
            document.body
          )}
        </div>
      </div>
      <div className="text-xs space-y-1">
        <p>{e._tipo === 'lead' ? `Ticket ${e.externo_id}` : `${e.data.split('-').reverse().join('/')} · ${String(e.hora_inicio || '').slice(0, 5)}`}</p>
        <p className="font-medium">{e.responsavel_nome || e.responsavel_email || 'Sem responsável'}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {encerrada ? (
          <button type="button" disabled={Boolean(movendo)} onClick={() => primeira && onMover(posicao.pipelineId, primeira)} className="h-8 px-3 rounded-full text-xs font-medium bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] cursor-pointer disabled:opacity-50">
            Reabrir
          </button>
        ) : (
          <>
            <button type="button" disabled={Boolean(movendo)} onClick={() => onMover(posicao.pipelineId, 'ganho')} className="h-8 px-3 rounded-full text-xs font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 cursor-pointer disabled:opacity-50">
              ✓ Ganho
            </button>
            <button type="button" disabled={Boolean(movendo)} onClick={() => onMover(posicao.pipelineId, 'perda')} className="h-8 px-3 rounded-full text-xs font-semibold bg-rose-500/12 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 cursor-pointer disabled:opacity-50">
              ✕ Perda
            </button>
          </>
        )}
        {posicao.etapaId === '__removida__' && <span className="text-[11px] text-amber-700 dark:text-amber-300">Etapa apagada: arraste para outra</span>}
      </div>
      {movendo === e.id && (
        <p role="status" className="text-xs">
          Salvando etapa…
        </p>
      )}
    </article>
  );
}

/** Reuniões do mês que ainda não estão no processo comercial: escolher uma a coloca na primeira etapa. */
function AdicionarReuniao({ reunioes, onAdicionar, etapa }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (ev) => !ref.current?.contains(ev.target) && setAberto(false);
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAberto((v) => !v)} className="h-[46px] px-4 rounded-2xl text-sm font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer whitespace-nowrap">
        + Adicionar reunião
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 max-h-96 overflow-y-auto p-1.5 rounded-2xl bg-white dark:bg-rm-elevado-escuro shadow-xl ring-1 ring-black/[0.08] dark:ring-white/[0.1]">
          <p className="px-3 pt-2 pb-1.5 text-xs text-slate-500 dark:text-zinc-400">Reuniões do mês fora do processo{etapa ? `. Entram em “${etapa}”.` : '.'}</p>
          {reunioes.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">Todas as reuniões do mês já estão no processo.</p>
          ) : (
            reunioes.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setAberto(false);
                  onAdicionar(e);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <span className="block text-sm font-medium truncate">{nomeParticipanteAgenda(e) || e.titulo}</span>
                <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">
                  {String(e.data || '').split('-').reverse().join('/')} · {String(e.hora_inicio || '').slice(0, 5)} · {STATUS[e.status] || 'Agendada'}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Editar os dados de um lead (nome, contato e responsável). */
function EditarLead({ lead, equipe, onFechar, onSalvo, onResponsavel }) {
  const [nome, setNome] = useState(lead.nome || '');
  const [email, setEmail] = useState(lead.email || '');
  const [telefone, setTelefone] = useState(lead.telefone || '');
  const [responsavel, setResponsavel] = useState(lead.responsavel_email || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const salvar = async (ev) => {
    ev.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const atualizado = await editarLeadComercial(lead.id, { nome, email, telefone });
      if (responsavel !== (lead.responsavel_email || '')) onResponsavel(responsavel);
      onSalvo(atualizado);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onPointerDown={(e) => e.target === e.currentTarget && onFechar()}>
      <form onSubmit={salvar} className="w-full max-w-md rounded-3xl bg-white dark:bg-rm-cartao-escuro shadow-2xl p-6 space-y-4 text-[#1d1d1f] dark:text-zinc-100">
        <h2 className="text-lg font-semibold">Editar oportunidade</h2>
        <label className="block text-xs font-medium">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={`${classeCampo} mt-1.5`} required />
        </label>
        <label className="block text-xs font-medium">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${classeCampo} mt-1.5`} />
        </label>
        <label className="block text-xs font-medium">
          Telefone
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={`${classeCampo} mt-1.5`} />
        </label>
        <label className="block text-xs font-medium">
          Responsável
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={`${classeCampo} mt-1.5`}>
            <option value="">Sem responsável</option>
            {equipe.map((u) => (
              <option key={u.email} value={u.email}>
                {u.nome || u.email}
              </option>
            ))}
          </select>
        </label>
        {erro && <p className="text-sm text-rose-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !nome.trim()} className="h-10 px-5 rounded-full text-sm font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export default function ComercialView({ userEmail, onAbrirAgenda }) {
  const [eventos, setEventos] = useState([]);
  const [leads, setLeads] = useState([]);
  const [avisoLeads, setAvisoLeads] = useState('');
  const [config, setConfig] = useState(getConfigComercial);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [departamento, setDepartamento] = useState('__todos__');
  const [responsavel, setResponsavel] = useState('__todos__');
  const [pipelineId, setPipelineId] = useState('');
  const [movendo, setMovendo] = useState(null);
  // Arrastar entre etapas, menu do cartão e janelas de editar/excluir
  const [arrastando, setArrastando] = useState(null);
  const [colunaAlvo, setColunaAlvo] = useState(null);
  const [menuAberto, setMenuAberto] = useState(null);
  const [editandoLead, setEditandoLead] = useState(null);
  const [editandoReuniao, setEditandoReuniao] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  // Abas da tela: visão geral (reuniões), processo comercial (quadro) e comissão (vendas e quanto cada um recebe)
  const [aba, setAba] = useState(() => {
    try {
      return localStorage.getItem('rm_comercial_aba') || 'visao';
    } catch {
      return 'visao';
    }
  });
  const trocarAba = (a) => {
    setAba(a);
    try {
      localStorage.setItem('rm_comercial_aba', a);
    } catch {}
  };
  const [vendedoresEquipe, setVendedoresEquipe] = useState([]);
  // Ganho: antes de mover, pede os dados da venda (empresa, mensalidade, adicionais)
  const [ganhando, setGanhando] = useState(null);
  // Reuniões do mês com detalhes: filtro por status e pessoa (os totais e a tabela por colaborador abrem a lista)
  const [detalhe, setDetalhe] = useState({ status: 'todas', email: null });
  const [excluindoReuniao, setExcluindoReuniao] = useState(null);
  const listaRef = useRef(null);
  const verReunioes = (status, email = null) => {
    setDetalhe({ status, email });
    requestAnimationFrame(() => {
      listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const abrirReuniao = (e) => {
    setEditandoReuniao(e);
    if (!empresas.length)
      getEmpresas({ pageSize: 1000 })
        .then((res) => setEmpresas(Array.isArray(res) ? res : res?.items || []))
        .catch(() => {});
  };
  const travaMovimento = useRef(false);
  const [tentativa, setTentativa] = useState(0);
  const [mes, setMes] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const permissoes = getPermissoesAtuais(userEmail);
  const podeAcessar = permissoes.modulos.includes('comercial');
  useEffect(() => {
    if (!podeAcessar) return;
    let ativo = true;
    let sequencia = 0;
    const carregar = async (inicial = false) => {
      const carga = ++sequencia;
      if (inicial) setCarregando(true);
      try {
        const res = await fetch(`/api/comercial?mes=${mes}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok)
          throw new Error(json.mensagem || 'Não foi possível carregar o Comercial.');
        if (ativo && carga === sequencia) {
          setConfig(json.config);
          setEventos(json.eventos || []);
          setLeads(json.leads || []);
          setVendedoresEquipe(json.vendedores || []);
          setAvisoLeads(json.aviso_leads || '');
          setErro('');
        }
      } catch (e) {
        if (ativo && carga === sequencia) setErro(e.message);
      } finally {
        if (ativo && carga === sequencia) setCarregando(false);
      }
    };
    const atualizar = () => {
      // Atualização imediata ao concluir ou editar na agenda; histórico de outros meses é preservado.
      const locais = getAgendaEventos().filter((e) => String(e.data || '').startsWith(`${mes}-`));
      setEventos((lista) => {
        const porId = new Map(lista.map((e) => [e.id, e]));
        // A cópia local não sabe a etapa do processo comercial (um fluxo pode ter mudado no servidor)
        locais.forEach((e) => {
          const servidor = porId.get(e.id);
          porId.set(e.id, servidor ? { ...e, comercial_pipeline_id: servidor.comercial_pipeline_id, comercial_etapa_id: servidor.comercial_etapa_id } : e);
        });
        return [...porId.values()];
      });
      carregar();
      // Fluxos que mexem no processo comercial rodam logo depois de a agenda mudar
      setTimeout(() => carregar(), 3000);
    };
    const atualizarConfig = () => setConfig(getConfigComercial());
    const aoFocar = () => carregar();
    carregar(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') carregar();
    }, 30000);
    window.addEventListener('agenda_eventos_updated', atualizar);
    window.addEventListener('comercial_config_updated', atualizarConfig);
    window.addEventListener('comercial_leads_updated', aoFocar);
    window.addEventListener('focus', aoFocar);
    return () => {
      ativo = false;
      clearInterval(timer);
      window.removeEventListener('agenda_eventos_updated', atualizar);
      window.removeEventListener('comercial_config_updated', atualizarConfig);
      window.removeEventListener('comercial_leads_updated', aoFocar);
      window.removeEventListener('focus', aoFocar);
    };
  }, [podeAcessar, userEmail, mes, tentativa]);

  const departamentos = config.departamentos.filter((d) => podeVerDepartamento(permissoes, d));
  const eventosVisiveis = eventos.filter((e) => podeVerDepartamento(permissoes, e.departamento));
  const baseResumo = resumoComercial(eventosVisiveis, {
    mes,
    departamentos,
    departamento: departamentos.includes(departamento) ? departamento : '__todos__',
  });
  const resumo = resumoComercial(baseResumo.reunioes, { mes, departamentos, responsavel });
  const pipeline = config.pipelines.find((p) => p.id === pipelineId) || config.pipelines[0];
  const colunas = pipeline ? [...pipeline.etapas, ...DESFECHOS_COMERCIAIS] : [];
  const leadsVisiveis = leads.filter(
    (e) =>
      podeVerDepartamento(permissoes, e.departamento) &&
      (departamento === '__todos__' || e.departamento === departamento) &&
      (responsavel === '__todos__' || (e.responsavel_email || '__sem__') === responsavel),
  );
  const pessoasFiltro = [
    ...new Map(
      [
        ...baseResumo.pessoas,
        ...leads
          .filter((e) => podeVerDepartamento(permissoes, e.departamento))
          .map((e) => ({
            email: e.responsavel_email || '',
            nome: e.responsavel_nome || e.responsavel_email || 'Sem responsável',
          })),
      ].map((p) => [p.email, p]),
    ).values(),
  ];
  const equipe = [
    ...new Map(
      [
        ...getEquipeUsuarios().filter((u) => u.ativo !== false),
        { email: userEmail, nome: userEmail },
      ]
        .filter((u) => u.email)
        .map((u) => [u.email, u]),
    ).values(),
  ];
  // Por colaborador: toda a equipe do comercial aparece, mesmo quem ainda não tem reunião no mês
  const pessoasTabela = useMemo(() => {
    const lista = [...resumo.pessoas];
    if (responsavel === '__todos__')
      vendedoresEquipe.forEach((v) => {
        if (!lista.some((p) => String(p.email).toLowerCase() === v.email)) lista.push({ email: v.email, nome: v.nome, agendada: 0, concluida: 0, cancelada: 0 });
      });
    return lista;
  }, [resumo.pessoas, vendedoresEquipe, responsavel]);
  const cartoes = useMemo(
    () =>
      [
        ...resumo.reunioes,
        ...leadsVisiveis.map((e) => ({ ...e, _tipo: 'lead', titulo: e.nome })),
      ].map((e) => ({ evento: e, posicao: posicaoComercial(e, config) })),
    [resumo.reunioes, leadsVisiveis, config],
  );
  if (
    cartoes.some(
      (c) => c.posicao?.pipelineId === pipeline?.id && c.posicao?.etapaId === '__removida__',
    )
  )
    colunas.push({ id: '__removida__', nome: 'Etapa indisponível' });

  const mover = async (id, destinoPipeline, etapaId, responsavelEmail, { semVenda = false } = {}) => {
    if (etapaId === 'ganho' && !semVenda && responsavelEmail === undefined) {
      const evento = eventos.find((e) => e.id === id) || leads.find((e) => e.id === id);
      if (evento) {
        setGanhando({ evento, lead: leads.some((e) => e.id === id), pipelineId: destinoPipeline });
        return;
      }
    }
    if (travaMovimento.current) return;
    travaMovimento.current = true;
    setMovendo(id);
    setErro('');
    try {
      const lead = leads.some((e) => e.id === id);
      const atualizado = await moverReuniaoComercial(
        id,
        destinoPipeline,
        etapaId,
        lead
          ? {
              tipo: 'lead',
              ...(responsavelEmail !== undefined ? { responsavel_email: responsavelEmail } : {}),
            }
          : {},
      );
      if (lead) setLeads((lista) => lista.map((e) => (e.id === id ? { ...e, ...atualizado } : e)));
      setEventos((lista) => lista.map((e) => (e.id === id ? { ...e, ...atualizado } : e)));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      travaMovimento.current = false;
      setMovendo(null);
    }
  };
  if (!podeAcessar) return null;
  return (
    <div className="space-y-7 text-[#1d1d1f] dark:text-zinc-100">
      <header className={`flex flex-wrap items-center justify-between gap-3 ${LINHA_TITULO}`}>
        {/* O nome da tela já está no cabeçalho; à esquerda, as três visões */}
        <div className="flex p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.06] w-fit self-start">
          {[
            ['visao', 'Visão geral'],
            ['processo', 'Processo comercial'],
            ['comissao', 'Comissão e vendas'],
          ].map(([id, rot]) => (
            <button
              key={id}
              type="button"
              onClick={() => trocarAba(id)}
              className={`h-9 px-4 rounded-full text-sm font-medium cursor-pointer transition-colors whitespace-nowrap ${aba === id ? 'bg-white dark:bg-rm-elevado-escuro shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'}`}
            >
              {rot}
            </button>
          ))}
        </div>
        <EncaixeCabecalho />
        {permissoes.modulos.includes('agenda') && (
          <button
            type="button"
            onClick={onAbrirAgenda}
            className="self-start lg:justify-self-end rounded-full px-5 py-2.5 text-sm font-medium bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer"
          >
            Abrir agenda
          </button>
        )}
      </header>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs font-medium mb-2">Mês</p>
          <SeletorMes valor={mes} onMudar={setMes} />
        </div>
        {aba !== 'comissao' && (<>
        <label className="block min-w-48 flex-1 max-w-xs text-xs font-medium">
          <span>Departamento</span>
          <select
            value={departamentos.includes(departamento) ? departamento : '__todos__'}
            onChange={(e) => setDepartamento(e.target.value)}
            className={`${classeCampo} mt-2`}
          >
            <option value="__todos__">Todos do Comercial</option>
            {departamentos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block min-w-48 flex-1 max-w-xs text-xs font-medium">
          <span>Responsável</span>
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className={`${classeCampo} mt-2`}
          >
            <option value="__todos__">Toda a equipe</option>
            {pessoasFiltro.map((p) => (
              <option key={p.email || '__sem__'} value={p.email || '__sem__'}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        </>)}
      </div>
      {avisoLeads && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
          {avisoLeads}
        </p>
      )}
      {erro && (
        <div role="alert" className="text-sm text-rose-600 dark:text-rose-400 flex flex-wrap gap-3">
          <span>{erro}</span>
          <button
            type="button"
            onClick={() => setTentativa((n) => n + 1)}
            className="underline cursor-pointer"
          >
            Atualizar
          </button>
        </div>
      )}
      {!carregando && !config.departamentos.length && (
        <div className="rounded-2xl border border-black/10 dark:border-white/15 p-6 bg-white dark:bg-rm-elevado-escuro">
          <h2 className="font-semibold">Escolha os departamentos do Comercial</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
            Um administrador deve selecionar os departamentos em Configurações avançadas → Comercial
            e pipelines. Reuniões existentes passam a aparecer automaticamente.
          </p>
        </div>
      )}
      {aba === 'comissao' && <ComissaoComercial mes={mes} onMes={setMes} />}
      {aba === 'visao' && (<>
      <div aria-busy={carregando} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['Agendadas', resumo.totais.agendada],
          ['Realizadas', resumo.totais.concluida],
          ['Canceladas', resumo.totais.cancelada],
        ].map(([rotulo, total], i) => {
          const status = ['agendada', 'concluida', 'cancelada'][i];
          const ativo = detalhe.status === status && !detalhe.email;
          return (
            <button
              type="button"
              key={rotulo}
              onClick={() => verReunioes(status)}
              title={`Ver as reuniões ${rotulo.toLowerCase()}`}
              className={`text-left rounded-2xl border bg-white dark:bg-rm-elevado-escuro p-5 cursor-pointer transition-all hover:shadow-md ${ativo ? 'border-rm-acento-medio ring-2 ring-rm-acento-medio/30' : 'border-black/[0.08] dark:border-white/[0.12]'}`}
            >
              <p className="text-sm text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                {rotulo}
                <span className="text-xs text-rm-acento dark:text-rm-acento-vivo">Ver detalhes →</span>
              </p>
              {carregando ? (
                <div className="mt-3 h-9 w-16 rounded-lg animate-pulse bg-black/5 dark:bg-white/10" />
              ) : (
                <p className="mt-2 text-3xl font-semibold tabular-nums">{total}</p>
              )}
            </button>
          );
        })}
      </div>
      <section className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-elevado-escuro overflow-hidden">
        <div className="p-5 border-b border-black/5 dark:border-white/10">
          <h2 className="text-lg font-semibold">Por colaborador</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Cada reunião conta uma vez, para o responsável definido na agenda. Os números mostram o
            status atual.
          </p>
        </div>
        {carregando ? (
          <div
            role="status"
            aria-label="Carregando reuniões"
            className="h-32 m-5 rounded-xl animate-pulse bg-black/5 dark:bg-white/10"
          />
        ) : pessoasTabela.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 dark:text-zinc-400">
                <tr>
                  {['Responsável', 'Agendadas', 'Realizadas', 'Canceladas'].map((t) => (
                    <th key={t} className="px-5 py-3 font-medium whitespace-nowrap">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {pessoasTabela.map((p) => (
                  <tr key={p.email || '__sem__'}>
                    <td className="px-5 py-4 font-medium">
                      {p.nome}
                      {p.email && (
                        <span className="block font-normal text-xs text-slate-500 dark:text-zinc-400 mt-1">
                          {p.email}
                        </span>
                      )}
                    </td>
                    {['agendada', 'concluida', 'cancelada'].map((s) => (
                      <td key={s} className="px-5 py-2 tabular-nums">
                        <button
                          type="button"
                          disabled={!p[s]}
                          onClick={() => verReunioes(s, p.email || '__sem__')}
                          className="min-w-10 h-9 px-3 -ml-3 rounded-full text-left hover:bg-black/[0.05] dark:hover:bg-white/[0.08] hover:text-rm-acento dark:hover:text-rm-acento-vivo cursor-pointer disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-inherit"
                        >
                          {p[s]}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-sm text-slate-500 dark:text-zinc-400">
            Nenhuma reunião para os filtros selecionados.
          </p>
        )}
      </section>
      <ListaReunioesComercial
        ref={listaRef}
        reunioes={resumo.reunioes}
        filtro={detalhe}
        onFiltro={setDetalhe}
        pessoas={resumo.pessoas}
        config={config}
        onEditar={abrirReuniao}
        onExcluir={(e) => setExcluindoReuniao(e)}
      />
      </>)}
      {aba === 'processo' && (
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Processo comercial</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Leads recebidos por webhook e reuniões. Leads em aberto permanecem visíveis; o mês
              filtra reuniões e leads encerrados.
            </p>
          </div>
          {pipeline && (
            <div className="flex flex-wrap items-end gap-2">
            <AdicionarReuniao
              reunioes={resumo.reunioes.filter((e) => !posicaoComercial(e, config))}
              onAdicionar={(e) => pipeline.etapas[0] && mover(e.id, pipeline.id, pipeline.etapas[0].id)}
              etapa={pipeline.etapas[0]?.nome}
            />
            <label className="text-xs font-medium">
              Processo comercial
              <select
                className={`${classeCampo} mt-1.5`}
                value={pipeline.id}
                onChange={(e) => setPipelineId(e.target.value)}
              >
                {config.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            </div>
          )}
        </div>
        {!pipeline ? (
          <p className="p-6 rounded-2xl border border-dashed border-black/15 dark:border-white/20 text-sm text-slate-500 dark:text-zinc-400">
            Crie seus processos comerciais e etapas em Configurações avançadas → Comercial e processos.
          </p>
        ) : carregando ? (
          <div className="h-60 rounded-2xl animate-pulse bg-black/5 dark:bg-white/10" />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {colunas.map((etapa) => {
              const itens = cartoes.filter(
                (c) => c.posicao?.pipelineId === pipeline.id && c.posicao.etapaId === etapa.id,
              );
              const alvo = colunaAlvo === etapa.id && arrastando && !itens.some((c) => c.evento.id === arrastando);
              return (
                <div
                  key={etapa.id}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('text/rm-reuniao') || etapa.id === '__removida__') return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (colunaAlvo !== etapa.id) setColunaAlvo(etapa.id);
                  }}
                  onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setColunaAlvo(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setColunaAlvo(null);
                    const id = e.dataTransfer.getData('text/rm-reuniao');
                    if (itens.some((c) => c.evento.id === id)) return;
                    if (cartoes.some((c) => c.evento.id === id) && etapa.id !== '__removida__')
                      mover(id, pipeline.id, etapa.id);
                  }}
                  className={`w-72 sm:w-80 shrink-0 snap-start rounded-2xl p-3 space-y-3 border transition-colors ${
                    alvo
                      ? 'bg-rm-acento/[0.06] dark:bg-rm-acento-escuro/[0.08] border-rm-acento-medio ring-2 ring-rm-acento-medio/40'
                      : 'bg-black/[0.025] dark:bg-white/[0.04] border-black/[0.06] dark:border-white/[0.08]'
                  }`}
                >
                  <div className="flex justify-between items-center px-1 py-2">
                    <h3
                      className={`text-sm font-semibold ${etapa.id === 'ganho' ? 'text-emerald-700 dark:text-emerald-300' : etapa.id === 'perda' ? 'text-rose-700 dark:text-rose-300' : ''}`}
                    >
                      {etapa.nome}
                    </h3>
                    <span className="text-xs tabular-nums text-slate-500">{itens.length}</span>
                  </div>
                  {itens.map(({ evento: e, posicao }) => (
                    <CartaoOportunidade
                      key={e.id}
                      e={e}
                      posicao={posicao}
                      config={config}
                      pipeline={pipeline}
                      movendo={movendo}
                      arrastando={arrastando === e.id}
                      menuAberto={menuAberto === e.id}
                      onMenu={(v) => setMenuAberto(v ? e.id : null)}
                      onArrastar={(v) => setArrastando(v ? e.id : null)}
                      onMover={(pid, eid) => mover(e.id, pid, eid)}
                      onEditar={() => (e._tipo === 'lead' ? setEditandoLead(e) : abrirReuniao(e))}
                      onExcluir={() => setExcluindo(e)}
                    />
                  ))}
                  {alvo && <div className="h-16 rounded-xl border-2 border-dashed border-rm-acento-medio/60 bg-white/50 dark:bg-white/[0.03] flex items-center justify-center text-xs font-medium text-rm-acento dark:text-rm-acento-vivo">Soltar aqui</div>}
                  {!itens.length && !alvo && (
                    <p className="text-xs text-slate-400 dark:text-zinc-500 px-1 pb-4">
                      Nenhum cartão nesta etapa
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {ganhando && (
        <VendaModal
          inicial={{
            empresa: ganhando.lead ? ganhando.evento.nome : ganhando.evento.empresa && ganhando.evento.empresa !== 'Cliente Geral' ? ganhando.evento.empresa : nomeParticipanteAgenda(ganhando.evento) || '',
            contato: ganhando.lead ? ganhando.evento.nome : nomeParticipanteAgenda(ganhando.evento) || '',
            vendedor_email: String(ganhando.evento.responsavel_email || userEmail).toLowerCase(),
            origem_tipo: ganhando.lead ? 'lead' : 'reuniao',
            origem_id: ganhando.evento.id,
          }}
          vendedores={vendedoresEquipe}
          gestor={ehGestorComercial(permissoes)}
          eu={String(userEmail || '').toLowerCase()}
          onFechar={() => setGanhando(null)}
          textoPular="Só marcar como ganho"
          onPular={() => {
            const g = ganhando;
            setGanhando(null);
            mover(g.evento.id, g.pipelineId, 'ganho', undefined, { semVenda: true });
          }}
          onSalva={() => {
            const g = ganhando;
            setGanhando(null);
            showToast('Venda registrada! Entrou na comissão do mês.', 'success');
            window.dispatchEvent(new Event('comercial_vendas_updated'));
            mover(g.evento.id, g.pipelineId, 'ganho', undefined, { semVenda: true });
          }}
        />
      )}

      {editandoLead && (
        <EditarLead
          lead={editandoLead}
          equipe={equipe}
          onFechar={() => setEditandoLead(null)}
          onSalvo={(atualizado) => {
            setLeads((lista) => lista.map((x) => (x.id === atualizado.id ? { ...x, ...atualizado } : x)));
            setEditandoLead(null);
          }}
          onResponsavel={(email) => {
            const pos = posicaoComercial(editandoLead, config);
            if (pos) mover(editandoLead.id, pos.pipelineId, pos.etapaId, email);
          }}
        />
      )}
      {editandoReuniao && (
        <AgendaEventoModal
          aberto
          evento={editandoReuniao}
          equipe={getEquipeUsuarios() || []}
          empresas={empresas}
          userEmail={userEmail}
          onFechar={() => {
            setEditandoReuniao(null);
            setTentativa((t) => t + 1);
          }}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(excluindo)}
        title="Excluir oportunidade?"
        message={
          excluindo?._tipo === 'lead'
            ? `O lead “${excluindo?.nome}” será apagado do processo comercial. Se o RM Chat enviar um novo evento deste ticket, ele volta.`
            : 'A oportunidade sai do processo comercial. A reunião continua na Agenda e nos números por colaborador.'
        }
        confirmText="Excluir"
        variant="danger"
        onClose={() => setExcluindo(null)}
        onConfirm={async () => {
          const alvo = excluindo;
          try {
            await excluirOportunidadeComercial(alvo.id, alvo._tipo === 'lead' ? 'lead' : 'reuniao');
            if (alvo._tipo === 'lead') setLeads((l) => l.filter((x) => x.id !== alvo.id));
            else setEventos((l) => l.map((x) => (x.id === alvo.id ? { ...x, comercial_pipeline_id: FORA_DO_PROCESSO, comercial_etapa_id: null } : x)));
            showToast('Oportunidade excluída do processo comercial.', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
          // Confere com o servidor (o que está salvo de verdade)
          setTentativa((t) => t + 1);
          setExcluindo(null);
        }}
      />
      <ConfirmModal
        isOpen={Boolean(excluindoReuniao)}
        title="Excluir reunião?"
        message={excluindoReuniao ? `“${excluindoReuniao.titulo}” (${String(excluindoReuniao.data || '').split('-').reverse().join('/')} às ${String(excluindoReuniao.hora_inicio || '').slice(0, 5)}) será excluída da agenda e deixa de contar nos números. Use quando a reunião não for válida.` : ''}
        confirmText="Excluir reunião"
        variant="danger"
        onClose={() => setExcluindoReuniao(null)}
        onConfirm={async () => {
          const alvo = excluindoReuniao;
          try {
            await deleteAgendaEvento(alvo.id);
            setEventos((l) => l.filter((x) => x.id !== alvo.id));
            showToast('Reunião excluída.', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
          setExcluindoReuniao(null);
          setTentativa((t) => t + 1);
        }}
      />
    </div>
  );
}
