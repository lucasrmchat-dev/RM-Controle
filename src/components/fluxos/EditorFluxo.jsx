'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BLOCOS, CATEGORIAS_FLUXO, OPERADORES, ROTULO_SAIDA, STATUS_REUNIAO, exportarFluxo, novoBloco, novoId, problemasDoFluxo } from '@/lib/fluxos';
import { fetchCanais, fetchConfigComercial, fetchExecucoesFluxo, getConfigComercial, getDepartamentos, getEquipeUsuarios, salvarFluxo } from '@/lib/storage';
import EncaixeCabecalho from '../EncaixeCabecalho';
import { showToast } from '../ToastNotification';
import ConfigBloco from './ConfigBloco';
import TestarFluxo from './TestarFluxo';
import { CORES_BLOCO, IconeBloco } from './visual';

// ------------------------------------------------------------------------------
// Editor do Fluxo Inteligente: quadro infinito (arrastar o fundo move, Ctrl/⌘ + rolagem ou os botões dão zoom),
// blocos arrastáveis, ligações puxadas das bolinhas de saída, desfazer (⌘Z), salvamento automático,
// teste com o mesmo motor do servidor e o histórico das execuções reais.
// ------------------------------------------------------------------------------
const LARGURA = 248;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
// Saídas com cor: "deu certo" em verde, "não deu" em vermelho
const SAIDA_POSITIVA = new Set(['sim', 'respondeu']);
const SAIDA_NEGATIVA = new Set(['nao', 'sem_resposta']);
const portaY = (tipo, i) => (BLOCOS[tipo]?.saidas.length > 1 ? 72 + i * 28 : 26);
const ENTRADA_Y = 26;

const curva = (x1, y1, x2, y2) => {
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};
const meioDaCurva = (x1, y1, x2, y2) => {
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  return { x: (x1 + 3 * (x1 + dx) + 3 * (x2 - dx) + x2) / 8, y: (y1 + 3 * y1 + 3 * y2 + y2) / 8 };
};

const rotuloStatus = (id) => (id === 'qualquer' ? 'qualquer mudança' : STATUS_REUNIAO.find((s) => s.id === id)?.rotulo.toLowerCase() || id);

/** Resumo do que o bloco faz, no próprio cartão. */
function resumoBloco(no, canaisPorId) {
  const c = no.config || {};
  switch (no.tipo) {
    case 'gatilho_mensagem': {
      const canais = (c.canais || []).map((id) => canaisPorId.get(id)?.nome || 'canal removido');
      const origem = { todas: 'Contatos e grupos', contato: 'Só contatos', grupo: 'Só grupos' }[c.origem || 'todas'];
      const filtro = !c.filtro || c.filtro === 'qualquer' ? 'Qualquer mensagem' : `${{ contem: 'Contém', palavras: 'Alguma de', comeca: 'Começa com', igual: 'É' }[c.filtro]} “${c.texto || '…'}”`;
      return [canais.length ? canais.join(', ') : 'Todos os canais', origem, filtro];
    }
    case 'gatilho_reuniao_agendada':
      return [{ todos: 'Qualquer reunião', cliente: 'Reunião com cliente', interna: 'Reunião interna' }[c.tipo || 'todos']];
    case 'gatilho_reuniao_status':
      return [`Quando ficar ${rotuloStatus(c.status)}`];
    case 'gatilho_demanda_criada':
    case 'gatilho_demanda_andamento':
      return [{ qualquer: 'Criada em qualquer lugar', conversa: 'Criada de uma conversa', grupo: 'Criada de um grupo' }[c.origem || 'qualquer'], c.departamento ? `Departamento: ${c.departamento}` : 'Todos os departamentos'];
    case 'gatilho_demanda_fechada':
      return [{ qualquer: 'Concluída ou cancelada', concluida: 'Só concluídas', cancelada: 'Só canceladas' }[c.resultado || 'qualquer'], c.departamento ? `Departamento: ${c.departamento}` : 'Todos os departamentos'];
    case 'gatilho_demanda_sla':
      return [`${(c.em || 'aguardando') === 'aguardando' ? 'Esperando alguém assumir' : 'Em atendimento'} há mais de ${c.minutos ?? 30} min`, c.departamento ? `Departamento: ${c.departamento}` : 'Todos os departamentos'];
    case 'enviar_mensagem': {
      const canal = c.canal_id ? canaisPorId.get(c.canal_id)?.nome || 'canal removido' : null;
      const para = { conversa: '→ na conversa', cliente_reuniao: '→ cliente da reunião', solicitante: '→ solicitante da demanda', grupo_empresa: '→ grupo da empresa', numero: `→ ${c.telefone || 'número'}` }[c.destino || 'conversa'];
      return [c.texto ? c.texto : 'Sem texto', c.destino === 'conversa' || c.destino === 'grupo_empresa' ? para : `${para} · pelo canal ${canal || 'padrão'}`];
    }
    case 'pergunta': {
      const min = Number(c.minutos) || 60;
      return [c.texto ? c.texto : 'Sem texto', `Espera ${min >= 60 ? `${Math.round(min / 6) / 10} h` : `${min} min`} · {{var.${c.variavel || 'resposta'}}}`];
    }
    case 'condicao':
      return (c.regras || []).slice(0, 3).map((r) => `${r.campo} ${OPERADORES.find((o) => o.id === r.operador)?.rotulo || ''} ${OPERADORES.find((o) => o.id === r.operador)?.semValor ? '' : `“${r.valor || ''}”`}`.trim());
    case 'espera':
      return [`${c.segundos ?? 0} segundos`];
    case 'variavel':
      return [c.nome ? `${c.nome} = ${c.valor || '…'}` : 'Sem nome'];
    case 'reuniao_status':
      return [`Marcar como ${rotuloStatus(c.status)}`];
    case 'reuniao_anotar':
      return [c.texto || 'Sem texto'];
    case 'reuniao_criar':
      return [c.titulo || 'Reunião', `Em ${c.em_dias ?? 0} dia(s) às ${c.hora || '09:00'}`];
    case 'comercial_etapa':
      return c.processo_id && c.etapa_id ? [c.processo_nome || 'Processo comercial', `→ ${c.etapa_nome || 'etapa'}`] : ['Escolha o processo e a etapa'];
    case 'conversa_departamento':
      return [c.departamento ? `→ ${c.departamento}` : 'Sem departamento'];
    case 'conversa_resolver':
      return ['Encerra a conversa'];
    default:
      return [];
  }
}

/** Um bloco no quadro. */
const CartaoBloco = React.memo(function CartaoBloco({ no, selecionado, estado, canaisPorId, onInicioMover, onInicioLigar }) {
  const b = BLOCOS[no.tipo];
  const cor = CORES_BLOCO[b.cor] || CORES_BLOCO.slate;
  const linhas = resumoBloco(no, canaisPorId);
  const multi = b.saidas.length > 1;
  return (
    <div
      data-no-id={no.id}
      className={`absolute rounded-2xl bg-white dark:bg-rm-elevado-escuro shadow-[0_6px_20px_-8px_rgba(0,0,0,0.25)] transition-shadow ${
        selecionado ? `ring-2 ${cor.anel} shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35)]` : estado === 'erro' ? 'ring-2 ring-rose-500' : estado === 'ok' ? 'ring-2 ring-emerald-500' : 'ring-1 ring-black/[0.08] dark:ring-white/[0.1]'
      }`}
      style={{ left: no.x, top: no.y, width: LARGURA }}
    >
      <div className={`h-1 rounded-t-2xl ${cor.faixa}`} />
      <div onPointerDown={(e) => onInicioMover(e, no.id)} className="h-[46px] flex items-center gap-2.5 px-3 cursor-grab active:cursor-grabbing select-none">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cor.suave}`}>
          <IconeBloco tipo={no.tipo} className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight truncate text-[#1d1d1f] dark:text-white">{b.rotulo}</p>
          <p className="text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-zinc-500">{CATEGORIAS_FLUXO.find((c) => c.id === b.categoria)?.rotulo}</p>
        </div>
        {estado && <span className={`w-2 h-2 rounded-full ${estado === 'erro' ? 'bg-rose-500' : 'bg-emerald-500'}`} />}
      </div>
      <div className={`px-3 pb-3 space-y-0.5 ${multi ? 'min-h-[76px] pr-14' : ''}`} onPointerDown={(e) => onInicioMover(e, no.id)}>
        {linhas.map((l, i) => (
          <p key={i} className={`text-[11.5px] leading-snug text-slate-600 dark:text-zinc-300 ${no.tipo === 'enviar_mensagem' && i === 0 ? 'line-clamp-3 whitespace-pre-wrap' : 'truncate'}`}>
            {l}
          </p>
        ))}
      </div>

      {/* Entrada (gatilhos não têm) */}
      {!b.gatilho && (
        <span data-entrada={no.id} className="absolute -left-[7px] w-3.5 h-3.5 rounded-full bg-white dark:bg-rm-elevado-escuro border-2 border-slate-400 dark:border-zinc-500" style={{ top: ENTRADA_Y - 7 }} />
      )}
      {/* Saídas: puxe para ligar */}
      {b.saidas.map((s, i) => (
        <React.Fragment key={s}>
          {multi && (
            <span className={`absolute right-4 text-[11px] font-semibold ${SAIDA_POSITIVA.has(s) ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} style={{ top: portaY(no.tipo, i) - 8 }}>
              {ROTULO_SAIDA[s]}
            </span>
          )}
          <button
            type="button"
            aria-label={`Ligar a saída ${ROTULO_SAIDA[s] || ''} de ${b.rotulo}`}
            onPointerDown={(e) => onInicioLigar(e, no.id, s)}
            className={`absolute -right-[8px] w-4 h-4 rounded-full border-2 cursor-crosshair hover:scale-125 transition-transform ${
              SAIDA_POSITIVA.has(s) ? 'bg-emerald-500 border-white dark:border-rm-elevado-escuro' : SAIDA_NEGATIVA.has(s) ? 'bg-rose-500 border-white dark:border-rm-elevado-escuro' : 'bg-rm-acento-medio border-white dark:border-rm-elevado-escuro'
            }`}
            style={{ top: portaY(no.tipo, i) - 8 }}
          />
        </React.Fragment>
      ))}
    </div>
  );
});

function Execucoes({ fluxoId, onFechar }) {
  const [lista, setLista] = useState(null);
  const [aberta, setAberta] = useState(null);
  // "Não disparou": mensagens que chegaram e não seguiram (com o motivo). Ajudam a testar o gatilho.
  const [verIgnoradas, setVerIgnoradas] = useState(true);
  const carregar = useCallback(() => {
    setLista(null);
    fetchExecucoesFluxo(fluxoId)
      .then((r) => setLista(r.execucoes))
      .catch((e) => {
        setLista([]);
        showToast(e.message, 'error');
      });
  }, [fluxoId]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  const nomeGatilho = { mensagem_recebida: 'Mensagem no WhatsApp', reuniao_agendada: 'Reunião agendada', reuniao_status: 'Status da reunião', pergunta_respondida: 'Pergunta respondida', pergunta_sem_resposta: 'Pergunta sem resposta' };
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 h-14 flex items-center gap-2 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
        <span className="text-[14.5px] font-semibold">Execuções</span>
        <span className="text-[12px] text-slate-500">últimas 50</span>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={verIgnoradas} onChange={(e) => setVerIgnoradas(e.target.checked)} className="accent-current" />
          Não disparou
        </label>
        <button type="button" onClick={carregar} className="h-8 px-3 rounded-full text-[12px] font-medium bg-black/[0.05] dark:bg-white/[0.08] cursor-pointer">
          Atualizar
        </button>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full text-slate-500 hover:bg-black/[0.05] cursor-pointer text-[18px]">
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-black/[0.05] dark:divide-white/[0.07]">
        {lista === null ? (
          <p className="p-6 text-center text-[13px] text-slate-400">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-slate-500">Nenhuma execução ainda. Ative o fluxo e ele roda sozinho quando o gatilho acontecer.</p>
        ) : (
          lista.filter((e) => verIgnoradas || e.status !== 'ignorado').map((e) => (
            <div key={e.id} className="px-4 py-3">
              <button type="button" onClick={() => setAberta(aberta === e.id ? null : e.id)} className="w-full flex items-center gap-2 text-left cursor-pointer">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.status === 'ok' ? 'bg-emerald-500' : e.status === 'erro' ? 'bg-rose-500' : e.status === 'ignorado' ? 'bg-slate-300 dark:bg-zinc-600' : 'bg-amber-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-medium truncate ${e.status === 'ignorado' ? 'text-slate-500 dark:text-zinc-400' : ''}`}>{e.status === 'ignorado' ? 'Não disparou' : nomeGatilho[e.gatilho] || e.gatilho}</span>
                  <span className="block text-[11.5px] text-slate-500 truncate">{e.resumo}</span>
                </span>
                <span className="text-[11.5px] text-slate-400 tabular-nums">{new Date(e.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </button>
              {aberta === e.id && (
                <ol className="mt-2 ml-4 space-y-1">
                  {(e.passos || []).map((p, i) => (
                    <li key={i} className="text-[12px] flex gap-2">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.status === 'ignorado' ? 'bg-slate-300 dark:bg-zinc-600' : p.erro ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <span>
                        <strong className="font-semibold">{p.rotulo}</strong> <span className="text-slate-500">{p.erro || p.resultado}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function EditorFluxo({ fluxo: inicial, onVoltar, onMudou }) {
  const [fluxo, setFluxo] = useState(inicial);
  const [def, setDef] = useState(() => ({ versao: 1, nos: inicial.definicao?.nos || [], ligacoes: inicial.definicao?.ligacoes || [] }));
  const [vista, setVista] = useState({ x: 120, y: 80, zoom: 1 });
  const [selecao, setSelecao] = useState(null); // { tipo: 'no' | 'ligacao', id }
  const [painel, setPainel] = useState(null); // 'testar' | 'execucoes' | null (bloco selecionado abre a configuração)
  const [ligando, setLigando] = useState(null); // { de, saida, x, y } (mundo)
  const [estadoSalvo, setEstadoSalvo] = useState('salvo');
  const [caminho, setCaminho] = useState([]);
  const [canais, setCanais] = useState([]);
  const [busca, setBusca] = useState('');
  const [fechadas, setFechadas] = useState({});
  const [editandoNome, setEditandoNome] = useState(false);
  // Celular: a paleta abre por cima do quadro
  const [paletaAberta, setPaletaAberta] = useState(false);
  const quadro = useRef(null);
  const acao = useRef(null);
  const historico = useRef({ passado: [], futuro: [], ultimo: 0 });
  // Último desenho salvo: só salva quando algo mudou de verdade
  const salvoJson = useRef(JSON.stringify({ versao: 1, nos: inicial.definicao?.nos || [], ligacoes: inicial.definicao?.ligacoes || [] }));

  const equipe = useMemo(() => (getEquipeUsuarios() || []).filter((p) => p.ativo !== false && p.email).map((p) => ({ email: p.email, nome: p.nome })), []);
  const departamentos = useMemo(() => getDepartamentos() || [], []);
  // Processos comerciais da empresa (as etapas são as que o cliente criou)
  const [processos, setProcessos] = useState(() => getConfigComercial()?.pipelines || []);
  useEffect(() => {
    fetchCanais()
      .then((r) => setCanais((r.canais || []).filter((c) => c.ativo)))
      .catch(() => {});
    fetchConfigComercial()
      .then((c) => setProcessos(c?.pipelines || []))
      .catch(() => {});
  }, []);
  const canaisPorId = useMemo(() => new Map(canais.map((c) => [c.id, c])), [canais]);
  const porId = useMemo(() => new Map(def.nos.map((n) => [n.id, n])), [def.nos]);
  const problemas = useMemo(() => problemasDoFluxo(def), [def]);

  // ---------------------------------------------------------------- histórico e salvamento
  const mudarDef = useCallback((fn, { guardar = true, agrupar = false } = {}) => {
    setDef((atual) => {
      const h = historico.current;
      if (guardar && (!agrupar || Date.now() - h.ultimo > 1200)) {
        h.passado.push(JSON.stringify(atual));
        if (h.passado.length > 60) h.passado.shift();
        h.futuro = [];
      }
      if (guardar) h.ultimo = Date.now();
      return fn(atual);
    });
  }, []);
  const desfazer = useCallback((refazer = false) => {
    const h = historico.current;
    const de = refazer ? h.futuro : h.passado;
    const para = refazer ? h.passado : h.futuro;
    if (!de.length) return;
    setDef((atual) => {
      para.push(JSON.stringify(atual));
      return JSON.parse(de.pop());
    });
  }, []);

  useEffect(() => {
    const json = JSON.stringify(def);
    if (json === salvoJson.current) return undefined;
    setEstadoSalvo('pendente');
    const t = setTimeout(async () => {
      setEstadoSalvo('salvando');
      try {
        const r = await salvarFluxo(fluxo.id, { definicao: def });
        salvoJson.current = json;
        setFluxo((f) => ({ ...f, ...r.fluxo }));
        onMudou?.(r.fluxo);
        setEstadoSalvo('salvo');
      } catch (e) {
        setEstadoSalvo('erro');
        showToast(e.message, 'error');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [def]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvarCampos = async (campos) => {
    try {
      const r = await salvarFluxo(fluxo.id, campos);
      setFluxo((f) => ({ ...f, ...r.fluxo }));
      onMudou?.(r.fluxo);
      return true;
    } catch (e) {
      showToast(e.message, 'error');
      return false;
    }
  };

  // ---------------------------------------------------------------- coordenadas
  const paraMundo = useCallback(
    (clientX, clientY) => {
      const r = quadro.current.getBoundingClientRect();
      return { x: (clientX - r.left - vista.x) / vista.zoom, y: (clientY - r.top - vista.y) / vista.zoom };
    },
    [vista]
  );
  const zoomEm = useCallback((fator, cx, cy) => {
    setVista((v) => {
      const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * fator));
      const r = quadro.current.getBoundingClientRect();
      const px = cx ?? r.width / 2;
      const py = cy ?? r.height / 2;
      return { zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom };
    });
  }, []);
  const enquadrar = useCallback(() => {
    if (!def.nos.length || !quadro.current) return setVista({ x: 120, y: 80, zoom: 1 });
    const r = quadro.current.getBoundingClientRect();
    const xs = def.nos.map((n) => n.x);
    const ys = def.nos.map((n) => n.y);
    const minX = Math.min(...xs) - 60;
    const minY = Math.min(...ys) - 60;
    const maxX = Math.max(...xs) + LARGURA + 60;
    const maxY = Math.max(...ys) + 170;
    const zoom = Math.max(ZOOM_MIN, Math.min(1.1, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))));
    setVista({ zoom, x: (r.width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (r.height - (maxY - minY) * zoom) / 2 - minY * zoom });
  }, [def.nos]);
  useEffect(() => {
    // Abre enquadrando o que já existe
    const t = setTimeout(enquadrar, 50);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rolagem: move o quadro; com Ctrl/⌘ (ou pinça no trackpad), zoom no ponto do mouse
  useEffect(() => {
    const el = quadro.current;
    if (!el) return undefined;
    const roda = (e) => {
      if (e.target.closest?.('[data-rolavel]')) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomEm(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      } else setVista((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', roda, { passive: false });
    return () => el.removeEventListener('wheel', roda);
  }, [zoomEm]);

  // ---------------------------------------------------------------- arrastar: fundo, blocos e ligações
  const mover = useCallback((e) => {
    const a = acao.current;
    if (!a) return;
    const dx = e.clientX - a.cx;
    const dy = e.clientY - a.cy;
    if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
    if (a.tipo === 'fundo') setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }));
    else if (a.tipo === 'bloco') {
      if (!a.moveu) return;
      if (!a.guardou) {
        a.guardou = true;
        mudarDef((d) => d);
      }
      const nx = Math.round((a.nx + dx / a.zoom) / 10) * 10;
      const ny = Math.round((a.ny + dy / a.zoom) / 10) * 10;
      setDef((d) => ({ ...d, nos: d.nos.map((n) => (n.id === a.id ? { ...n, x: nx, y: ny } : n)) }));
    } else if (a.tipo === 'ligar') {
      const r = quadro.current.getBoundingClientRect();
      setLigando((l) => l && { ...l, x: (e.clientX - r.left - a.vx) / a.zoom, y: (e.clientY - r.top - a.vy) / a.zoom });
    }
  }, [mudarDef]);

  const soltar = useCallback(
    (e) => {
      const a = acao.current;
      if (a?.tipo === 'fundo' && !a.moveu) setSelecao(null);
      if (a?.tipo === 'ligar') {
        const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-no-id]');
        const para = alvo?.getAttribute('data-no-id');
        setLigando(null);
        if (para && para !== a.de) {
          mudarDef((d) => {
            const destino = d.nos.find((n) => n.id === para);
            if (!destino || BLOCOS[destino.tipo].gatilho) return d;
            if (d.ligacoes.some((l) => l.de === a.de && l.saida === a.saida && l.para === para)) return d;
            return { ...d, ligacoes: [...d.ligacoes, { id: novoId('l'), de: a.de, saida: a.saida, para }] };
          });
        }
      }
      acao.current = null;
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    },
    [mover, mudarDef]
  );

  const iniciar = (dados, e) => {
    acao.current = { ...dados, cx: e.clientX, cy: e.clientY, vx: vista.x, vy: vista.y, zoom: vista.zoom, moveu: false };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };
  const noFundo = (e) => {
    if (e.button !== 0 || (e.target !== e.currentTarget && !e.target.hasAttribute?.('data-fundo'))) return;
    iniciar({ tipo: 'fundo' }, e);
  };
  const inicioMover = useCallback(
    (e, id) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      // Clicar num bloco abre a configuração dele (o caminho do último teste continua marcado)
      setSelecao({ tipo: 'no', id });
      setPainel(null);
      const n = def.nos.find((x) => x.id === id);
      iniciar({ tipo: 'bloco', id, nx: n.x, ny: n.y }, e);
    },
    [def.nos, vista] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const inicioLigar = useCallback(
    (e, de, saida) => {
      e.stopPropagation();
      e.preventDefault();
      const n = def.nos.find((x) => x.id === de);
      setLigando({ de, saida, x: n.x + LARGURA + 40, y: n.y + portaY(n.tipo, BLOCOS[n.tipo].saidas.indexOf(saida)) });
      iniciar({ tipo: 'ligar', de, saida }, e);
    },
    [def.nos, vista] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Saiu do editor no meio de um arraste: solta os ouvintes
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    },
    [mover, soltar]
  );

  // ---------------------------------------------------------------- blocos
  const adicionar = (tipo, x, y) => {
    let px = x;
    let py = y;
    if (px === undefined) {
      const r = quadro.current.getBoundingClientRect();
      const c = paraMundo(r.left + r.width / 2, r.top + r.height / 2);
      px = c.x - LARGURA / 2 + (def.nos.length % 5) * 24;
      py = c.y - 50 + (def.nos.length % 5) * 24;
    }
    const n = novoBloco(tipo, px, py);
    // Bloco novo ligado ao selecionado (se ele tem saída livre), como no n8n
    mudarDef((d) => {
      const sel = selecao?.tipo === 'no' ? d.nos.find((x) => x.id === selecao.id) : null;
      const saida = sel && !BLOCOS[tipo].gatilho ? BLOCOS[sel.tipo].saidas.find((s) => !d.ligacoes.some((l) => l.de === sel.id && l.saida === s)) : null;
      if (sel && saida && x === undefined) {
        n.x = sel.x + LARGURA + 90;
        n.y = sel.y + (BLOCOS[sel.tipo].saidas.indexOf(saida) * 140);
      }
      return { ...d, nos: [...d.nos, n], ligacoes: saida ? [...d.ligacoes, { id: novoId('l'), de: sel.id, saida, para: n.id }] : d.ligacoes };
    });
    setSelecao({ tipo: 'no', id: n.id });
    setPainel(null);
    setPaletaAberta(false);
  };
  const excluirSelecao = useCallback(() => {
    if (!selecao) return;
    if (selecao.tipo === 'no') mudarDef((d) => ({ ...d, nos: d.nos.filter((n) => n.id !== selecao.id), ligacoes: d.ligacoes.filter((l) => l.de !== selecao.id && l.para !== selecao.id) }));
    else mudarDef((d) => ({ ...d, ligacoes: d.ligacoes.filter((l) => l.id !== selecao.id) }));
    setSelecao(null);
  }, [selecao, mudarDef]);
  const duplicar = (id) => {
    const n = porId.get(id);
    if (!n) return;
    const copia = { ...JSON.parse(JSON.stringify(n)), id: novoId('n'), x: n.x + 40, y: n.y + 40 };
    mudarDef((d) => ({ ...d, nos: [...d.nos, copia] }));
    setSelecao({ tipo: 'no', id: copia.id });
  };

  // Teclado: Delete apaga, ⌘Z desfaz, ⇧⌘Z refaz, ⌘D duplica, Esc solta
  useEffect(() => {
    const tecla = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const cmd = e.metaKey || e.ctrlKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selecao) {
        e.preventDefault();
        excluirSelecao();
      } else if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        desfazer(e.shiftKey);
      } else if (cmd && e.key.toLowerCase() === 'd' && selecao?.tipo === 'no') {
        e.preventDefault();
        duplicar(selecao.id);
      } else if (e.key === 'Escape') {
        setSelecao(null);
        setLigando(null);
      } else if ((e.key === '+' || e.key === '=') && !cmd) zoomEm(1.15);
      else if (e.key === '-' && !cmd) zoomEm(1 / 1.15);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [selecao, excluirSelecao, desfazer, zoomEm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrastar da paleta para o quadro
  const soltarNoQuadro = (e) => {
    const tipo = e.dataTransfer.getData('text/rm-bloco');
    if (!BLOCOS[tipo]) return;
    e.preventDefault();
    const p = paraMundo(e.clientX, e.clientY);
    adicionar(tipo, p.x - LARGURA / 2, p.y - 24);
  };

  // ---------------------------------------------------------------- exportar e ativar
  const exportar = () => {
    try {
      const conteudo = JSON.stringify(exportarFluxo({ nome: fluxo.nome, descricao: fluxo.descricao, definicao: def }), null, 2);
      const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxo-${fluxo.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
  const alternarAtivo = async () => {
    const ativo = !fluxo.ativo;
    if (await salvarCampos({ ativo })) showToast(ativo ? 'Fluxo ativado: ele roda sozinho quando o gatilho acontecer.' : 'Fluxo desativado.', 'success');
  };

  // ---------------------------------------------------------------- caminho do teste
  const estados = useMemo(() => {
    const m = new Map();
    caminho.forEach((p) => p.no && m.set(p.no, p.erro ? 'erro' : 'ok'));
    return m;
  }, [caminho]);
  const ligacoesPercorridas = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < caminho.length; i += 1) {
      const p = caminho[i];
      if (!p.no || !p.saida) continue;
      def.ligacoes.forEach((l) => l.de === p.no && l.saida === p.saida && estados.has(l.para) && s.add(l.id));
    }
    return s;
  }, [caminho, def.ligacoes, estados]);

  const selecionado = selecao?.tipo === 'no' ? porId.get(selecao.id) : null;
  const painelAberto = painel || selecionado;
  const termo = busca.trim().toLowerCase();

  // ---------------------------------------------------------------- tela
  return (
    <div className="h-[calc(100dvh-178px)] sm:h-[calc(100dvh-24px-var(--rm-cabecalho,0px))] min-h-[520px] flex flex-col rounded-[22px] overflow-hidden ring-1 ring-black/[0.08] dark:ring-white/[0.08] bg-white dark:bg-rm-cartao-escuro shadow-[0_10px_40px_-18px_rgba(0,0,0,0.25)]">
      <style>{`@keyframes rm-fluxo-corre { to { stroke-dashoffset: -24; } }`}</style>
      {/* Barra do fluxo */}
      <div className="min-h-[60px] flex-shrink-0 px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={onVoltar} aria-label="Voltar para os fluxos" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex-shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="w-9 h-9 rounded-xl bg-rm-acento-medio text-white flex items-center justify-center flex-shrink-0">
            <IconeBloco tipo="fluxo" className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            {editandoNome ? (
              <input
                autoFocus
                defaultValue={fluxo.nome}
                onBlur={(e) => {
                  setEditandoNome(false);
                  const v = e.target.value.trim();
                  if (v && v !== fluxo.nome) salvarCampos({ nome: v });
                }}
                onKeyDown={(e) => (e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' && setEditandoNome(false))}
                className="h-8 px-2 -ml-2 rounded-lg text-[15px] font-semibold bg-black/[0.04] dark:bg-white/[0.06] outline-none w-[220px]"
              />
            ) : (
              <button type="button" onClick={() => setEditandoNome(true)} title="Renomear" className="block max-w-[260px] truncate text-[15px] font-semibold text-left cursor-text">
                {fluxo.nome}
              </button>
            )}
            <p className={`text-[11.5px] flex items-center gap-1 ${estadoSalvo === 'erro' ? 'text-rose-600' : 'text-slate-500 dark:text-zinc-400'}`}>
              {estadoSalvo === 'salvo' ? '✓ Tudo salvo' : estadoSalvo === 'erro' ? 'Não salvou — tente de novo' : 'Salvando…'}
            </p>
          </div>
        </div>
        <EncaixeCabecalho />
        <div className="flex items-center gap-1.5 lg:justify-self-end ml-auto lg:ml-0">
          {problemas.length > 0 && (
            <span title={problemas.join('\n')} className="h-8 px-2.5 rounded-full text-[12px] font-medium bg-amber-500/14 text-amber-700 dark:text-amber-300 flex items-center gap-1 cursor-help">
              ⚠ {problemas.length}
            </span>
          )}
          <button type="button" onClick={alternarAtivo} role="switch" aria-checked={fluxo.ativo} aria-label={fluxo.ativo ? 'Fluxo ativo: clique para desativar' : 'Fluxo inativo: clique para ativar'} title={fluxo.ativo ? 'Ativo' : 'Inativo'} className="h-9 pl-2 pr-2 xl:pr-3 rounded-full flex items-center gap-2 text-[12.5px] font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer">
            <span className={`relative w-9 h-5 rounded-full transition-colors ${fluxo.ativo ? 'bg-emerald-500' : 'bg-black/15 dark:bg-white/20'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${fluxo.ativo ? 'translate-x-4' : ''}`} />
            </span>
            <span className="hidden min-[2300px]:inline">{fluxo.ativo ? 'Ativo' : 'Inativo'}</span>
          </button>
          {/* Em telas médias viram só ícones: o cabeçalho ocupa o meio da barra */}
          <button type="button" onClick={() => setPainel(painel === 'execucoes' ? null : 'execucoes')} title="Execuções reais deste fluxo" aria-label="Execuções" className={`h-9 px-2.5 min-[2300px]:px-3 rounded-full text-[12.5px] font-medium cursor-pointer flex items-center gap-1.5 ${painel === 'execucoes' ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'}`}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5M12 7v5l3 2" />
            </svg>
            <span className="hidden min-[2300px]:inline">Execuções</span>
          </button>
          <button type="button" onClick={exportar} title="Exportar JSON (para importar em outra empresa)" aria-label="Exportar JSON" className="h-9 px-2.5 min-[2300px]:px-3 rounded-full text-[12.5px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7 10l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            <span className="hidden min-[2300px]:inline">Exportar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelecao(null);
              setPainel(painel === 'testar' ? null : 'testar');
            }}
            className="h-9 px-4 rounded-full whitespace-nowrap text-[12.5px] font-semibold bg-rm-acento-medio text-white cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
            </svg>
            <span className="min-[2300px]:hidden">Testar</span>
            <span className="hidden min-[2300px]:inline">Testar fluxo</span>
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex">
        {/* Paleta (no celular, gaveta por cima do quadro) */}
        <aside className={`${paletaAberta ? 'flex absolute inset-y-0 left-0 z-30 shadow-2xl' : 'hidden'} md:flex md:static md:shadow-none w-[248px] flex-shrink-0 flex-col border-r border-black/[0.06] dark:border-white/[0.08] bg-[#fafafa] dark:bg-rm-fundo-escuro`}>
          <div className="p-3">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar bloco…" className="w-full h-9 px-3.5 rounded-full bg-white dark:bg-rm-campo-escuro border border-black/[0.08] dark:border-white/[0.1] text-[13px] outline-none focus:border-rm-acento-medio" />
          </div>
          <div data-rolavel className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-3">
            {CATEGORIAS_FLUXO.map((cat) => {
              const itens = Object.entries(BLOCOS).filter(([, b]) => b.categoria === cat.id && (!termo || `${b.rotulo} ${b.descricao}`.toLowerCase().includes(termo)));
              if (!itens.length) return null;
              const fechada = fechadas[cat.id] && !termo;
              return (
                <div key={cat.id}>
                  <button type="button" onClick={() => setFechadas((f) => ({ ...f, [cat.id]: !f[cat.id] }))} className="w-full flex items-center justify-between px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 cursor-pointer">
                    {cat.rotulo}
                    <svg className={`w-3.5 h-3.5 transition-transform ${fechada ? '-rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {!fechada && (
                    <div className="space-y-1.5">
                      {itens.map(([tipo, b]) => {
                        const cor = CORES_BLOCO[b.cor];
                        return (
                          <button
                            key={tipo}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/rm-bloco', tipo);
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={() => adicionar(tipo)}
                            title="Arraste para o quadro ou clique para adicionar"
                            className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-rm-elevado-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.08] hover:ring-black/[0.16] dark:hover:ring-white/[0.2] hover:shadow-sm text-left cursor-grab active:cursor-grabbing transition-all"
                          >
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${cor.faixa}`}>
                              <IconeBloco tipo={tipo} className="w-4 h-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[12.5px] font-semibold leading-tight truncate">{b.rotulo}</span>
                              <span className="block text-[11px] text-slate-500 dark:text-zinc-400 leading-tight truncate">{b.descricao}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Quadro */}
        <div
          ref={quadro}
          onPointerDown={noFundo}
          onDragOver={(e) => e.dataTransfer.types.includes('text/rm-bloco') && e.preventDefault()}
          onDrop={soltarNoQuadro}
          data-fundo
          className="relative flex-1 min-w-0 overflow-hidden bg-[#f6f7f9] dark:bg-[#111316] touch-none select-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(120,120,130,0.28) 1px, transparent 1.2px)',
            backgroundSize: `${22 * vista.zoom}px ${22 * vista.zoom}px`,
            backgroundPosition: `${vista.x}px ${vista.y}px`,
            cursor: acao.current?.tipo === 'fundo' ? 'grabbing' : 'default',
          }}
        >
          <div data-fundo className="absolute left-0 top-0" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})`, transformOrigin: '0 0' }}>
            {/* Ligações */}
            <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1">
              {def.ligacoes.map((l) => {
                const de = porId.get(l.de);
                const para = porId.get(l.para);
                if (!de || !para) return null;
                const x1 = de.x + LARGURA + 1;
                const y1 = de.y + portaY(de.tipo, BLOCOS[de.tipo].saidas.indexOf(l.saida));
                const x2 = para.x - 1;
                const y2 = para.y + ENTRADA_Y;
                const sel = selecao?.tipo === 'ligacao' && selecao.id === l.id;
                const andou = ligacoesPercorridas.has(l.id);
                const cor = sel ? 'rgb(var(--rm-acento-medio))' : andou ? '#10b981' : SAIDA_POSITIVA.has(l.saida) ? '#34d399' : SAIDA_NEGATIVA.has(l.saida) ? '#fb7185' : '#94a3b8';
                return (
                  <g key={l.id}>
                    <path d={curva(x1, y1, x2, y2)} fill="none" stroke="transparent" strokeWidth="14" className="pointer-events-auto cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); setSelecao({ tipo: 'ligacao', id: l.id }); }} />
                    <path d={curva(x1, y1, x2, y2)} fill="none" stroke={cor} strokeWidth={sel || andou ? 2.6 : 2} strokeDasharray={andou ? '8 4' : undefined} style={andou ? { animation: 'rm-fluxo-corre 0.6s linear infinite' } : undefined} />
                  </g>
                );
              })}
              {ligando && (() => {
                const de = porId.get(ligando.de);
                if (!de) return null;
                return <path d={curva(de.x + LARGURA, de.y + portaY(de.tipo, BLOCOS[de.tipo].saidas.indexOf(ligando.saida)), ligando.x, ligando.y)} fill="none" stroke="rgb(var(--rm-acento-medio))" strokeWidth="2.2" strokeDasharray="6 4" />;
              })()}
            </svg>

            {/* Botão de tirar a ligação selecionada */}
            {selecao?.tipo === 'ligacao' && (() => {
              const l = def.ligacoes.find((x) => x.id === selecao.id);
              const de = l && porId.get(l.de);
              const para = l && porId.get(l.para);
              if (!de || !para) return null;
              const m = meioDaCurva(de.x + LARGURA, de.y + portaY(de.tipo, BLOCOS[de.tipo].saidas.indexOf(l.saida)), para.x, para.y + ENTRADA_Y);
              return (
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={excluirSelecao} aria-label="Tirar ligação" className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full bg-white dark:bg-rm-elevado-escuro shadow-md ring-1 ring-black/10 text-rose-600 flex items-center justify-center cursor-pointer text-[16px]" style={{ left: m.x, top: m.y }}>
                  ×
                </button>
              );
            })()}

            {def.nos.map((n) => (
              <CartaoBloco key={n.id} no={n} selecionado={selecao?.tipo === 'no' && selecao.id === n.id} estado={estados.get(n.id)} canaisPorId={canaisPorId} onInicioMover={inicioMover} onInicioLigar={inicioLigar} />
            ))}
          </div>

          {def.nos.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center max-w-sm px-6">
                <span className="mx-auto w-14 h-14 rounded-2xl bg-rm-acento-medio/12 text-rm-acento-medio flex items-center justify-center">
                  <IconeBloco tipo="gatilho_mensagem" className="w-7 h-7" />
                </span>
                <p className="mt-4 text-[15px] font-semibold">Comece por um gatilho</p>
                <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">Arraste “Mensagem no WhatsApp” ou um gatilho da agenda da esquerda para cá. Depois puxe a bolinha da direita de um bloco até o próximo.</p>
              </div>
            </div>
          )}

          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setPaletaAberta((v) => !v)} className="md:hidden absolute left-3 top-3 h-9 px-4 rounded-full bg-rm-acento-medio text-white text-[13px] font-semibold shadow-md cursor-pointer">
            {paletaAberta ? 'Fechar' : '+ Bloco'}
          </button>

          {/* Zoom */}
          <div className="absolute left-3 bottom-3 flex items-center gap-1 p-1 rounded-full bg-white/95 dark:bg-rm-elevado-escuro/95 shadow-md ring-1 ring-black/[0.06] dark:ring-white/[0.08]" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => zoomEm(1 / 1.2)} aria-label="Diminuir zoom" className="w-8 h-8 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer text-[18px] leading-none">
              −
            </button>
            <button type="button" onClick={() => setVista((v) => ({ ...v, zoom: 1 }))} title="Zoom 100%" className="min-w-[48px] h-8 px-1 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer text-[12px] font-semibold tabular-nums">
              {Math.round(vista.zoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomEm(1.2)} aria-label="Aumentar zoom" className="w-8 h-8 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer text-[18px] leading-none">
              +
            </button>
            <span className="w-px h-5 bg-black/10 dark:bg-white/10" />
            <button type="button" onClick={enquadrar} title="Enquadrar tudo" aria-label="Enquadrar tudo" className="w-8 h-8 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
              </svg>
            </button>
            <button type="button" onClick={() => desfazer(false)} title="Desfazer (⌘Z)" aria-label="Desfazer" className="w-8 h-8 rounded-full hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
            </button>
          </div>
          <p className="hidden lg:block absolute right-3 bottom-3 text-[11px] text-slate-400 pointer-events-none">Arraste o fundo para mover · ⌘/Ctrl + rolagem para zoom · Delete apaga</p>
        </div>

        {/* Painel da direita: configuração do bloco, teste ou execuções */}
        <AnimatePresence initial={false}>
          {painelAberto && (
            <motion.aside
              key={painel || 'config'}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              data-rolavel
              className="max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:shadow-2xl max-w-full flex-shrink-0 border-l border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-rm-cartao-escuro overflow-hidden"
            >
              <div className="w-[360px] max-w-[100vw] h-full">
                {painel === 'testar' ? (
                  <TestarFluxo definicao={def} canais={canais} onResultado={setCaminho} onFechar={() => { setPainel(null); setCaminho([]); }} />
                ) : painel === 'execucoes' ? (
                  <Execucoes fluxoId={fluxo.id} onFechar={() => setPainel(null)} />
                ) : selecionado ? (
                  <ConfigBloco
                    key={selecionado.id}
                    no={selecionado}
                    definicao={def}
                    canais={canais}
                    equipe={equipe}
                    departamentos={departamentos}
                    processos={processos}
                    onMudar={(config) => mudarDef((d) => ({ ...d, nos: d.nos.map((n) => (n.id === selecionado.id ? { ...n, config } : n)) }), { agrupar: true })}
                    onExcluir={excluirSelecao}
                    onDuplicar={() => duplicar(selecionado.id)}
                    onFechar={() => setSelecao(null)}
                  />
                ) : null}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
