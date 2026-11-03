'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  INTERVALO_MAX,
  INTERVALO_MIN,
  INTERVALO_PADRAO,
  MENSAGEM_MAX,
  STATUS_ENVIO,
  avaliarRisco,
  envioBloqueado,
  exigeAceite,
  RESSALVA_RISCO_BAIXO,
  TERMO_RISCO_MEDIO,
  intervaloSeguro,
  duracaoEstimada,
  formatarDuracao,
  preencherMensagem,
} from '@/lib/envios';
import { acaoEnvio, criarEnvio, fetchDestinosEnvio, fetchEnvio, fetchEnvios } from '@/lib/storage';
import ConfirmModal from './ConfirmModal';
import EncaixeCabecalho, { ACOES_TITULO, LINHA_TITULO } from './EncaixeCabecalho';
import {
  EASE,
  ErroRodape,
  Etapa,
  ModalEtapas,
  Spinner,
  classeBotaoPrimario,
  classeBotaoTexto,
  normalizarBusca,
} from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { useEtiquetasCadastradas } from './SeletorEtiqueta';
import { CalendarioMes, SeletorHorario, isoDoDia } from './SeletoresTempo';
import { showToast } from './ToastNotification';

// ------------------------------------------------------------------------------
// Envios em massa: uma mensagem para vários contatos e grupos, na hora ou agendada, com um intervalo
// entre uma mensagem e outra. Quanto menor o intervalo, maior o risco de o WhatsApp bloquear o número (QR Code).
// ------------------------------------------------------------------------------

// Paradas do controle deslizante (segundos); o campo ao lado aceita qualquer valor entre 5 s e 1 h
const ESCALA = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1800, 3600];
const indiceNaEscala = (s) =>
  ESCALA.reduce((melhor, v, i) => (Math.abs(v - s) < Math.abs(ESCALA[melhor] - s) ? i : melhor), 0);

const CORES_RISCO = {
  baixo: {
    ponto: 'bg-emerald-500',
    texto: 'text-emerald-600 dark:text-emerald-300',
    suave: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  medio: {
    ponto: 'bg-amber-500',
    texto: 'text-amber-600 dark:text-amber-300',
    suave: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  alto: {
    ponto: 'bg-orange-500',
    texto: 'text-orange-600 dark:text-orange-300',
    suave: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  },
  muito_alto: {
    ponto: 'bg-rose-500',
    texto: 'text-rose-600 dark:text-rose-400',
    suave: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
};
// Faixas do termômetro (mesmos cortes de nivelDoRisco): largura proporcional a cada faixa
// Mensagem com o nome do contato (cada um recebe um texto diferente)
const PERSONALIZADA = /\{\{\s*(primeiro_)?nome\s*\}\}/i;
const FAIXAS_RISCO = [
  ['baixo', 'Baixa'],
  ['medio', 'Média'],
  ['alto', 'Alta'],
  ['muito_alto', 'Muito alta'],
];
const CORES_STATUS = {
  agendado: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  enviando: 'bg-rm-acento-medio/15 text-rm-acento dark:text-rm-acento-vivo',
  pausado: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  concluido: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cancelado: 'bg-black/[0.05] dark:bg-white/[0.08] text-slate-500 dark:text-zinc-400',
};
const STATUS_DESTINO = {
  pendente: { rotulo: 'Na fila', cor: 'text-slate-500 dark:text-zinc-400' },
  enviando: { rotulo: 'Enviando', cor: 'text-rm-acento dark:text-rm-acento-vivo' },
  enviado: { rotulo: 'Enviado', cor: 'text-emerald-700 dark:text-emerald-300' },
  falhou: { rotulo: 'Falhou', cor: 'text-rose-600 dark:text-rose-400' },
};

const dataHora = (iso) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
const iniciais = (nome) =>
  String(nome || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

function IconeGrupo({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function Segmentos({ valor, opcoes, onMudar }) {
  return (
    <div className="inline-flex p-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.07]">
      {opcoes.map(([id, rotulo]) => (
        <button
          key={id}
          type="button"
          onClick={() => onMudar(id)}
          className={`h-9 px-4 rounded-full text-[13px] font-medium cursor-pointer transition-colors ${valor === id ? 'bg-white dark:bg-rm-elevado-escuro shadow-sm text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'}`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * Termômetro da probabilidade de bloqueio: junta o intervalo e a quantidade de destinatários.
 * Passando o mouse (ou tocando), explica o porquê e o que fazer para diminuir.
 */
function MedidorRisco({ segundos, quantidade, personalizada }) {
  const { pontos, nivel, motivos, recomendacoes } = avaliarRisco({
    segundos,
    quantidade,
    personalizada,
  });
  const cor = CORES_RISCO[nivel.id];
  return (
    <div
      // biome-ignore lint/a11y/noNoninteractiveTabindex: o foco abre a explicação no celular e no teclado
      tabIndex={0}
      aria-describedby="explicacao-risco"
      className="group relative rounded-3xl p-5 bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-rm-acento/15 cursor-help"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Probabilidade de bloqueio
          </p>
          <motion.p
            key={nivel.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className={`mt-1 text-[30px] leading-tight font-bold tracking-tight ${cor.texto}`}
          >
            {nivel.rotulo}
          </motion.p>
        </div>
        <span className="mt-1 h-7 px-3 rounded-full text-[11.5px] font-medium inline-flex items-center gap-1.5 bg-black/[0.04] dark:bg-white/[0.07] text-slate-500 dark:text-zinc-400 whitespace-nowrap">
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          Por quê?
        </span>
      </div>

      {/* Termômetro: faixa colorida; a parte acima do nível fica apagada e o marcador desliza até ele */}
      <div className="mt-5 relative h-3">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500" />
        <div
          className="absolute inset-0 rounded-full bg-white/75 dark:bg-[#1c1c1e]/75 origin-right transition-transform duration-700 ease-out"
          style={{ transform: `scaleX(${(100 - pontos) / 100})` }}
        />
        <div
          className="absolute inset-0 transition-transform duration-700 ease-out"
          style={{ transform: `translateX(${pontos}%)` }}
        >
          <span
            className={`absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full ring-4 ring-white dark:ring-[#2c2c2e] shadow-[0_2px_8px_rgba(0,0,0,0.25)] ${cor.ponto}`}
          />
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-[20fr_25fr_25fr_30fr] text-[11px]">
        {FAIXAS_RISCO.map(([id, rotulo]) => (
          <span
            key={id}
            className={`${id === nivel.id ? `font-semibold ${cor.texto}` : 'text-slate-400 dark:text-zinc-500'} ${id === 'muito_alto' ? 'text-right' : ''}`}
          >
            {rotulo}
          </span>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-[12.5px]">
        <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5">
          <dt className="text-slate-500 dark:text-zinc-400">Destinatários</dt>
          <dd className="font-semibold tabular-nums text-[15px]">{quantidade}</dd>
        </div>
        <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5">
          <dt className="text-slate-500 dark:text-zinc-400">Duração aproximada</dt>
          <dd className="font-semibold tabular-nums text-[15px]">
            {quantidade > 1 ? formatarDuracao(duracaoEstimada(quantidade, segundos)) : '—'}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11.5px] leading-snug text-slate-500 dark:text-zinc-400">
        Estimativa pelo tempo entre as mensagens e pela quantidade de destinatários. Passe o mouse
        para ver o porquê.
      </p>

      {/* Explicação ao passar o mouse ou focar */}
      <div
        id="explicacao-risco"
        role="tooltip"
        className="pointer-events-none absolute z-10 left-3 right-3 bottom-full mb-3 rounded-2xl p-4 bg-[#1d1d1f]/95 dark:bg-[#f5f5f7]/95 text-[#f5f5f7] dark:text-[#1d1d1f] shadow-2xl backdrop-blur opacity-0 translate-y-1 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-focus:opacity-100 group-focus:translate-y-0"
      >
        <p className="text-[12.5px] font-semibold">
          Por que a probabilidade está {nivel.rotulo.toLowerCase()}
        </p>
        <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug opacity-90">
          {motivos.map((m) => (
            <li key={m} className="flex gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cor.ponto}`} />
              {m}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] font-semibold">Como diminuir o risco</p>
        <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug opacity-90">
          {recomendacoes.map((r) => (
            <li key={r} className="flex gap-2">
              <svg
                className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-emerald-400 dark:text-emerald-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SeletorIntervalo({ valor, onMudar }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const confirmar = () => {
    const n = Math.round(Number(texto));
    const limpo = Number.isFinite(n) ? Math.min(INTERVALO_MAX, Math.max(INTERVALO_MIN, n)) : valor;
    onMudar(limpo);
    setTexto(String(limpo));
  };
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <label className="block">
          <span className={classeRotulo}>Segundos entre as mensagens</span>
          <input
            type="number"
            inputMode="numeric"
            min={INTERVALO_MIN}
            max={INTERVALO_MAX}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmar();
              }
            }}
            className={`${classeCampo} w-32 text-[18px] font-semibold tabular-nums`}
          />
        </label>
        <p className="pb-3 text-[13px] text-slate-500 dark:text-zinc-400">
          = {formatarDuracao(valor)}
        </p>
      </div>
      <input
        type="range"
        min={0}
        max={ESCALA.length - 1}
        step={1}
        value={indiceNaEscala(valor)}
        onChange={(e) => onMudar(ESCALA[Number(e.target.value)])}
        aria-label="Intervalo entre as mensagens"
        className="w-full accent-[rgb(var(--rm-acento-medio))] cursor-pointer"
      />
      <div className="flex justify-between text-[11px] text-slate-400 -mt-2">
        <span>5 s · mais rápido</span>
        <span>1 h · mais seguro</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[15, 30, 60, 120, 300].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onMudar(s)}
            className={`h-8 px-3 rounded-full text-[12.5px] font-medium cursor-pointer transition-colors ${valor === s ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'bg-black/[0.05] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.12]'}`}
          >
            {formatarDuracao(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

function EscolhaDestinos({ destinos, selecionados, onMudar }) {
  const etiquetas = useEtiquetasCadastradas('chat');
  const [tipo, setTipo] = useState('todos');
  const [etiqueta, setEtiqueta] = useState('');
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    const q = normalizarBusca(busca);
    const alvo = normalizarBusca(etiqueta);
    return (destinos || []).filter(
      (d) =>
        (tipo === 'todos' || (tipo === 'grupos' ? d.grupo : !d.grupo)) &&
        (!alvo || d.etiquetas.some((t) => normalizarBusca(t) === alvo)) &&
        (!q ||
          normalizarBusca(d.nome).includes(q) ||
          String(d.telefone).includes(q.replace(/\D/g, '') || '#')),
    );
  }, [destinos, tipo, etiqueta, busca]);

  const marcadosVisiveis = visiveis.filter((d) => selecionados.has(d.id)).length;
  const alternar = (id) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    onMudar(novo);
  };
  const marcarVisiveis = (marcar) => {
    const novo = new Set(selecionados);
    for (const d of visiveis) marcar ? novo.add(d.id) : novo.delete(d.id);
    onMudar(novo);
  };
  const grupos = (destinos || []).filter((d) => d.grupo && selecionados.has(d.id)).length;

  if (destinos === null)
    return (
      <p className="text-[13px] text-slate-500 dark:text-zinc-400">Carregando contatos e grupos…</p>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Segmentos
          valor={tipo}
          onMudar={setTipo}
          opcoes={[
            ['todos', 'Todos'],
            ['contatos', 'Contatos'],
            ['grupos', 'Grupos'],
          ]}
        />
        <select
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          aria-label="Filtrar por etiqueta"
          className={`${classeCampo} h-10 sm:w-52`}
        >
          <option value="">Todas as etiquetas</option>
          {(etiquetas || []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nome ou número"
          aria-label="Buscar contato ou grupo"
          className={`${classeCampo} h-10 sm:flex-1`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className="text-slate-500 dark:text-zinc-400">
          {visiveis.length} {visiveis.length === 1 ? 'resultado' : 'resultados'}
          {etiqueta ? ` com a etiqueta “${etiqueta}”` : ''}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => marcarVisiveis(true)}
            disabled={!visiveis.length || marcadosVisiveis === visiveis.length}
            className="h-8 px-3 rounded-full font-medium text-rm-acento dark:text-rm-acento-vivo hover:bg-rm-acento/10 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            Marcar {etiqueta ? 'todos desta etiqueta' : 'todos'}
          </button>
          <button
            type="button"
            onClick={() => marcarVisiveis(false)}
            disabled={!marcadosVisiveis}
            className="h-8 px-3 rounded-full font-medium text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            Desmarcar
          </button>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto rounded-2xl border border-black/[0.08] dark:border-white/[0.1] divide-y divide-black/[0.05] dark:divide-white/[0.07] bg-white dark:bg-white/[0.02]">
        {visiveis.length === 0 && (
          <p className="p-6 text-center text-[13px] text-slate-500 dark:text-zinc-400">
            Nenhum contato ou grupo com este filtro.
          </p>
        )}
        {visiveis.slice(0, 500).map((d) => {
          const marcado = selecionados.has(d.id);
          return (
            <label
              key={d.id}
              className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${marcado ? 'bg-rm-acento-medio/[0.06]' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'}`}
            >
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => alternar(d.id)}
                className="w-4 h-4 accent-[rgb(var(--rm-acento-medio))]"
              />
              <span
                className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-semibold ${d.grupo ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-rm-acento-medio/10 text-rm-acento dark:text-rm-acento-vivo'}`}
              >
                {d.grupo ? <IconeGrupo /> : iniciais(d.nome || d.telefone)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium truncate">
                  {d.nome || d.telefone || 'Sem nome'}
                </span>
                <span className="block text-[12px] text-slate-500 dark:text-zinc-400 truncate">
                  {d.grupo ? 'Grupo' : d.telefone}
                </span>
              </span>
              <span className="hidden sm:flex flex-wrap justify-end gap-1 max-w-[45%]">
                {d.etiquetas.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="h-5 px-2 rounded-full text-[11px] bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-300 inline-flex items-center"
                  >
                    {t}
                  </span>
                ))}
              </span>
            </label>
          );
        })}
        {visiveis.length > 500 && (
          <p className="p-3 text-center text-[12px] text-slate-500">
            Mostrando 500 de {visiveis.length}. Use a busca ou a etiqueta para afinar.
          </p>
        )}
      </div>
      <p className="text-[13px] font-medium">
        {selecionados.size}{' '}
        {selecionados.size === 1 ? 'destinatário escolhido' : 'destinatários escolhidos'}
        {grupos ? (
          <span className="text-slate-500 dark:text-zinc-400 font-normal">
            {' '}
            · {grupos} {grupos === 1 ? 'grupo' : 'grupos'}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function NovoEnvio({ aberto, onFechar, onCriado }) {
  const [dados, setDados] = useState({ destinos: null, canais: [] });
  const [nome, setNome] = useState('');
  const [canalId, setCanalId] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [quando, setQuando] = useState('agora');
  const [dia, setDia] = useState(() => isoDoDia(new Date()));
  const [hora, setHora] = useState('09:00');
  const [intervalo, setIntervalo] = useState(INTERVALO_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  // O aceite do termo vale só para o nível em que foi dado (mudou o nível, precisa aceitar de novo)
  const [aceiteNivel, setAceiteNivel] = useState(null);

  useEffect(() => {
    if (!aberto) return;
    setAceiteNivel(null);
    setNome('');
    setMensagem('');
    setSelecionados(new Set());
    setQuando('agora');
    setDia(isoDoDia(new Date()));
    setIntervalo(INTERVALO_PADRAO);
    setErro('');
    setDados({ destinos: null, canais: [] });
    fetchDestinosEnvio()
      .then((r) => {
        setDados({ destinos: r.destinos || [], canais: r.canais || [] });
        const conectado =
          (r.canais || []).find((k) => k.status === 'conectado') || (r.canais || [])[0];
        setCanalId(conectado?.id || '');
      })
      .catch((e) => {
        setDados({ destinos: [], canais: [] });
        setErro(e.message);
      });
  }, [aberto]);

  const personalizada = PERSONALIZADA.test(mensagem);
  const avaliacao = avaliarRisco({
    segundos: intervalo,
    quantidade: selecionados.size,
    personalizada,
  });
  // Alta ou muito alta: não deixa enviar (o servidor confere de novo)
  const bloqueado = selecionados.size > 0 && envioBloqueado(avaliacao);
  const seguro = bloqueado
    ? intervaloSeguro({ quantidade: selecionados.size, personalizada })
    : null;
  // Média: precisa aceitar o termo; ao mudar de nível, o aceite anterior não vale mais
  const precisaAceite = selecionados.size > 0 && exigeAceite(avaliacao);
  const aceite = aceiteNivel === avaliacao.nivel.id;
  const agendadoPara = quando === 'agendar' ? new Date(`${dia}T${hora}:00`) : null;
  const noPassado = agendadoPara && agendadoPara.getTime() < Date.now();
  const exemplo = (dados.destinos || []).find((d) => selecionados.has(d.id)) || {
    nome: 'Carla Mendes',
  };
  const canal = dados.canais.find((k) => k.id === canalId);
  const pronto =
    mensagem.trim() &&
    canalId &&
    selecionados.size > 0 &&
    !noPassado &&
    !bloqueado &&
    (!precisaAceite || aceite);

  const inserirVariavel = (v) =>
    setMensagem((m) => `${m}${m && !/\s$/.test(m) ? ' ' : ''}{{${v}}}`);

  const salvar = async () => {
    if (!pronto || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await criarEnvio({
        nome,
        canal_id: canalId,
        mensagem,
        intervalo_segundos: intervalo,
        contatos: [...selecionados],
        aceite_risco: precisaAceite && aceite,
        agendado_para: agendadoPara ? agendadoPara.toISOString() : null,
      });
      showToast(
        agendadoPara
          ? 'Envio agendado.'
          : 'Envio iniciado. As mensagens saem no intervalo escolhido.',
        'success',
      );
      onCriado(r.envio);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      titulo="Novo envio em massa"
      subtitulo="Uma mensagem para vários contatos e grupos, com tempo entre um envio e outro."
      largura="max-w-4xl"
      idTitulo="novo-envio-titulo"
      rodape={
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <ErroRodape erro={erro} />
            {!erro && (
              <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">
                {bloqueado
                  ? 'Envio bloqueado: aumente o intervalo ou diminua a lista.'
                  : precisaAceite && !aceite
                    ? 'Probabilidade média: aceite o termo de ciência do risco para enviar.'
                    : selecionados.size
                      ? `${selecionados.size} ${selecionados.size === 1 ? 'destinatário' : 'destinatários'} · a cada ${formatarDuracao(intervalo)} · probabilidade de bloqueio ${avaliacao.nivel.rotulo.toLowerCase()}`
                      : 'Escolha a mensagem e os destinatários.'}
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onFechar}
              disabled={enviando}
              className={classeBotaoTexto}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={!pronto || enviando}
              className={classeBotaoPrimario}
            >
              {enviando && <Spinner />}
              {quando === 'agendar' ? 'Agendar envio' : 'Enviar agora'}
            </button>
          </div>
        </div>
      }
    >
      <Etapa
        numero={1}
        titulo="Mensagem"
        descricao="O que vai ser enviado e por qual número."
        estado={mensagem.trim() && canalId ? 'concluida' : 'ativa'}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={classeRotulo}>Nome do envio (opcional)</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={80}
                  placeholder="Ex.: Aviso de feriado"
                  className={classeCampo}
                />
              </label>
              <label className="block">
                <span className={classeRotulo}>Enviar pelo número</span>
                <select
                  value={canalId}
                  onChange={(e) => setCanalId(e.target.value)}
                  className={classeCampo}
                >
                  {!dados.canais.length && <option value="">Nenhum número disponível</option>}
                  {dados.canais.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nome}
                      {k.status !== 'conectado' ? ' (desconectado)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className={classeRotulo}>Mensagem</span>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                maxLength={MENSAGEM_MAX}
                rows={5}
                placeholder="Olá {{primeiro_nome}}! Temos uma novidade para você…"
                className={`${classeCampo} h-auto py-3 leading-relaxed resize-y`}
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-slate-500 dark:text-zinc-400 mr-1">Personalizar:</span>
              {[
                ['primeiro_nome', 'Primeiro nome'],
                ['nome', 'Nome completo'],
              ].map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => inserirVariavel(v)}
                  className="h-7 px-2.5 rounded-full bg-rm-acento-medio/10 text-rm-acento dark:text-rm-acento-vivo font-medium hover:bg-rm-acento-medio/20 cursor-pointer"
                >
                  + {r}
                </button>
              ))}
              <span className="ml-auto tabular-nums text-slate-400">
                {mensagem.length}/{MENSAGEM_MAX}
              </span>
            </div>
            {canal && canal.status !== 'conectado' && (
              <p className="text-[12.5px] text-amber-700 dark:text-amber-300">
                Este número está desconectado. O envio fica pausado até ele voltar.
              </p>
            )}
          </div>
          {/* Prévia no estilo do WhatsApp (cores fixas das bolhas) */}
          <div className="rounded-3xl p-4 bg-[#efeae2] dark:bg-[#0b141a] min-h-[180px] flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 mb-2">
              Prévia para{' '}
              {exemplo.grupo ? 'o grupo' : String(exemplo.nome || '').split(' ')[0] || 'o contato'}
            </p>
            {mensagem.trim() ? (
              <div className="self-end max-w-full rounded-2xl rounded-tr-md px-3 py-2 bg-[#d9fdd3] dark:bg-[#005c4b] text-[13.5px] text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words shadow-sm">
                {preencherMensagem(mensagem, exemplo)}
              </div>
            ) : (
              <p className="m-auto text-[12.5px] text-black/40 dark:text-white/40">
                A mensagem aparece aqui.
              </p>
            )}
          </div>
        </div>
      </Etapa>

      <Etapa
        numero={2}
        titulo="Destinatários"
        descricao="Contatos e grupos do Chat. Filtre por etiqueta e marque quem recebe."
        estado={selecionados.size ? 'concluida' : 'ativa'}
      >
        <EscolhaDestinos
          destinos={dados.destinos}
          selecionados={selecionados}
          onMudar={setSelecionados}
        />
      </Etapa>

      <Etapa
        numero={3}
        titulo="Quando"
        descricao="Na hora ou num dia e horário marcados."
        estado={noPassado ? 'ativa' : 'concluida'}
      >
        <Segmentos
          valor={quando}
          onMudar={setQuando}
          opcoes={[
            ['agora', 'Enviar agora'],
            ['agendar', 'Agendar'],
          ]}
        />
        {quando === 'agendar' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
            <CalendarioMes valor={dia} onMudar={setDia} />
            <div>
              <span className={classeRotulo} id="envio-hora">
                Horário
              </span>
              <SeletorHorario valor={hora} onMudar={setHora} rotuloId="envio-hora" />
              {noPassado && (
                <p className="mt-2 text-[12.5px] text-rose-600 dark:text-rose-400">
                  Esse horário já passou.
                </p>
              )}
            </div>
          </div>
        )}
      </Etapa>

      <Etapa
        numero={4}
        titulo="Intervalo entre as mensagens"
        descricao="Quanto maior o tempo entre um envio e outro (e menor a lista), menor o risco de o número ser bloqueado."
        estado="concluida"
        ultima
      >
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          <SeletorIntervalo valor={intervalo} onMudar={setIntervalo} />
          <div className="space-y-3">
            <MedidorRisco
              segundos={intervalo}
              quantidade={selecionados.size}
              personalizada={personalizada}
            />
            {precisaAceite && (
              <motion.label
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className={`block rounded-3xl p-4 border cursor-pointer transition-colors ${aceite ? 'bg-amber-500/10 border-amber-500/40' : 'bg-amber-500/5 border-amber-500/20'}`}
              >
                <span className="block text-[13.5px] font-semibold text-amber-700 dark:text-amber-300">
                  Termo de ciência do risco
                </span>
                <span className="mt-2 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={aceite}
                    onChange={(e) => setAceiteNivel(e.target.checked ? avaliacao.nivel.id : null)}
                    className="mt-0.5 w-4 h-4 flex-shrink-0 accent-amber-500"
                  />
                  <span className="text-[12.5px] leading-snug text-[#1d1d1f]/85 dark:text-white/85">
                    {TERMO_RISCO_MEDIO}
                  </span>
                </span>
                <span className="block mt-2 text-[11.5px] text-slate-500 dark:text-zinc-400">
                  O aceite fica registrado na auditoria com o seu nome, a data e a hora.
                </span>
              </motion.label>
            )}
            {selecionados.size > 0 && avaliacao.nivel.id === 'baixo' && (
              <p className="rounded-2xl px-3.5 py-3 bg-emerald-500/10 text-[12.5px] leading-snug text-emerald-800 dark:text-emerald-200">
                {RESSALVA_RISCO_BAIXO}
              </p>
            )}
            {bloqueado && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="rounded-3xl p-4 bg-rose-500/10 border border-rose-500/20"
              >
                <p className="text-[13.5px] font-semibold text-rose-600 dark:text-rose-400">
                  Envio bloqueado: probabilidade {avaliacao.nivel.rotulo.toLowerCase()}
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-[#1d1d1f]/80 dark:text-white/80">
                  Para proteger o número, só é possível enviar com probabilidade média ou baixa.
                  Para conseguir:
                </p>
                <ul className="mt-2 space-y-1 text-[12.5px] leading-snug text-[#1d1d1f]/80 dark:text-white/80">
                  {seguro && (
                    <li className="flex gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-rose-500" />
                      Aumente o intervalo para pelo menos {formatarDuracao(seguro)}.
                    </li>
                  )}
                  <li className="flex gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-rose-500" />
                    Ou escolha menos destinatários e faça o resto em outro envio, em outro dia.
                  </li>
                </ul>
                {seguro && (
                  <button
                    type="button"
                    onClick={() => setIntervalo(seguro)}
                    className="mt-3 h-9 px-4 rounded-full text-[12.5px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer"
                  >
                    Usar {formatarDuracao(seguro)} entre as mensagens
                  </button>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </Etapa>
    </ModalEtapas>
  );
}

function DetalheEnvio({ envioId, onFechar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!envioId) return undefined;
    let vivo = true;
    const ler = () =>
      fetchEnvio(envioId)
        .then((r) => vivo && setDados(r))
        .catch((e) => vivo && setErro(e.message));
    setDados(null);
    setErro('');
    ler();
    const t = setInterval(ler, 8000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [envioId]);
  const envio = dados?.envio;
  return (
    <ModalEtapas
      aberto={Boolean(envioId)}
      onFechar={onFechar}
      titulo={envio?.nome || 'Envio'}
      subtitulo={
        envio
          ? `${STATUS_ENVIO[envio.status]?.rotulo} · a cada ${formatarDuracao(envio.intervalo_segundos)}`
          : ''
      }
      largura="max-w-2xl"
      idTitulo="detalhe-envio-titulo"
    >
      {erro && <p className="text-[13px] text-rose-600 dark:text-rose-400">{erro}</p>}
      {!dados && !erro && <p className="text-[13px] text-slate-500">Carregando…</p>}
      {envio && (
        <div className="space-y-4">
          <div className="rounded-2xl p-4 bg-black/[0.03] dark:bg-white/[0.04] text-[13.5px] whitespace-pre-wrap break-words">
            {envio.mensagem}
          </div>
          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.1] divide-y divide-black/[0.05] dark:divide-white/[0.07]">
            {dados.destinos.map((d) => {
              const st = STATUS_DESTINO[d.status] || STATUS_DESTINO.pendente;
              return (
                <div key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold ${d.grupo ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-rm-acento-medio/10 text-rm-acento dark:text-rm-acento-vivo'}`}
                  >
                    {d.grupo ? (
                      <IconeGrupo className="w-3.5 h-3.5" />
                    ) : (
                      iniciais(d.nome || d.telefone)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium truncate">
                      {d.nome || d.telefone || 'Sem nome'}
                    </span>
                    {d.erro && (
                      <span className="block text-[12px] text-rose-600 dark:text-rose-400 truncate">
                        {d.erro}
                      </span>
                    )}
                  </span>
                  <span className={`text-[12.5px] font-medium whitespace-nowrap ${st.cor}`}>
                    {st.rotulo}
                    {d.enviado_em ? (
                      <span className="text-slate-400 font-normal">
                        {' '}
                        · {dataHora(d.enviado_em)}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ModalEtapas>
  );
}

function CartaoEnvio({ envio, onAcao, onAbrir }) {
  const feitos = (envio.enviados || 0) + (envio.falhas || 0);
  const progresso = envio.total ? feitos / envio.total : 0;
  const { nivel } = avaliarRisco({
    segundos: envio.intervalo_segundos,
    quantidade: envio.total,
    personalizada: PERSONALIZADA.test(envio.mensagem),
  });
  const ativo = envio.status === 'agendado' || envio.status === 'enviando';
  const linhaTempo =
    envio.status === 'agendado'
      ? `Começa ${dataHora(envio.agendado_para)}`
      : envio.status === 'enviando'
        ? `Próxima mensagem ${dataHora(envio.proximo_envio_em)}`
        : envio.concluido_em
          ? `${envio.status === 'cancelado' ? 'Cancelado' : 'Terminou'} ${dataHora(envio.concluido_em)}`
          : `Criado ${dataHora(envio.criado_em)}`;
  const botao = 'h-8 px-3 rounded-full text-[12.5px] font-medium cursor-pointer transition-colors';
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="rounded-3xl p-5 bg-white dark:bg-rm-cartao-escuro border border-black/[0.08] dark:border-white/[0.1] shadow-sm flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onAbrir} className="min-w-0 text-left cursor-pointer">
          <h3 className="text-[15px] font-semibold truncate">{envio.nome}</h3>
          <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 truncate">
            {envio.criado_por_nome ? `por ${envio.criado_por_nome} · ` : ''}
            {linhaTempo}
          </p>
        </button>
        <span
          className={`h-6 px-2.5 rounded-full text-[11.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${CORES_STATUS[envio.status] || ''}`}
        >
          {envio.status === 'enviando' && (
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          )}
          {STATUS_ENVIO[envio.status]?.rotulo || envio.status}
        </span>
      </div>
      <p className="text-[13px] text-[#1d1d1f]/80 dark:text-white/75 line-clamp-2 break-words">
        {envio.mensagem}
      </p>
      <div>
        <div className="flex justify-between text-[12px] mb-1.5">
          <span className="tabular-nums font-medium">
            {envio.enviados || 0} de {envio.total} enviadas
          </span>
          {envio.falhas ? (
            <span className="text-rose-600 dark:text-rose-400 tabular-nums">
              {envio.falhas} com falha
            </span>
          ) : (
            <span className="text-slate-400 tabular-nums">{Math.round(progresso * 100)}%</span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
          <div
            className="h-full w-full rounded-full bg-rm-acento-medio origin-left transition-transform duration-700"
            style={{ transform: `scaleX(${progresso})` }}
          />
        </div>
      </div>
      {envio.ultimo_erro && envio.status === 'pausado' && (
        <p className="text-[12.5px] leading-snug rounded-2xl px-3 py-2 bg-amber-500/10 text-amber-800 dark:text-amber-200">
          {envio.ultimo_erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 mt-auto">
        <span className="h-7 px-2.5 rounded-full text-[11.5px] font-medium bg-black/[0.05] dark:bg-white/[0.08] inline-flex items-center">
          a cada {formatarDuracao(envio.intervalo_segundos)}
        </span>
        <span
          className={`h-7 px-2.5 rounded-full text-[11.5px] font-medium inline-flex items-center ${CORES_RISCO[nivel.id].suave}`}
        >
          bloqueio: {nivel.rotulo.toLowerCase()}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 -mx-1.5 -mb-1.5 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
        {ativo && (
          <button
            type="button"
            onClick={() => onAcao(envio, 'pausar')}
            className={`${botao} hover:bg-black/[0.05] dark:hover:bg-white/[0.08]`}
          >
            Pausar
          </button>
        )}
        {envio.status === 'pausado' && (
          <button
            type="button"
            onClick={() => onAcao(envio, 'retomar')}
            className={`${botao} text-rm-acento dark:text-rm-acento-vivo hover:bg-rm-acento/10`}
          >
            Retomar
          </button>
        )}
        {(ativo || envio.status === 'pausado') && (
          <button
            type="button"
            onClick={() => onAcao(envio, 'cancelar')}
            className={`${botao} text-rose-600 dark:text-rose-400 hover:bg-rose-500/10`}
          >
            Cancelar
          </button>
        )}
        {!ativo && envio.status !== 'pausado' && (
          <button
            type="button"
            onClick={() => onAcao(envio, 'excluir')}
            className={`${botao} text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]`}
          >
            Excluir
          </button>
        )}
        <button
          type="button"
          onClick={onAbrir}
          className={`${botao} hover:bg-black/[0.05] dark:hover:bg-white/[0.08]`}
        >
          Detalhes
        </button>
      </div>
    </motion.article>
  );
}

const CONFIRMACOES = {
  cancelar: {
    titulo: 'Cancelar o envio?',
    texto:
      'As mensagens que ainda não saíram não serão enviadas. As que já saíram continuam no Chat.',
    botao: 'Cancelar envio',
  },
  excluir: {
    titulo: 'Excluir o envio?',
    texto: 'Some da lista. As mensagens que já saíram continuam no histórico do Chat.',
    botao: 'Excluir',
  },
};

export default function EnviosView() {
  const [envios, setEnvios] = useState(null);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const carregar = useCallback(
    () =>
      fetchEnvios()
        .then((r) => {
          setEnvios(r.envios || []);
          setErro('');
        })
        .catch((e) => setErro(e.message)),
    [],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);
  // Enquanto algum envio estiver em andamento, a lista se atualiza sozinha
  const emAndamento = (envios || []).some(
    (e) => e.status === 'agendado' || e.status === 'enviando',
  );
  useEffect(() => {
    if (!emAndamento) return undefined;
    const t = setInterval(carregar, 8000);
    return () => clearInterval(t);
  }, [emAndamento, carregar]);

  const agir = async (envio, acao) => {
    try {
      await acaoEnvio(envio.id, acao);
      showToast(
        {
          pausar: 'Envio pausado.',
          retomar: 'Envio retomado.',
          cancelar: 'Envio cancelado.',
          excluir: 'Envio excluído.',
        }[acao],
        'success',
      );
      carregar();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const lista = (envios || []).filter(
    (e) =>
      filtro === 'todos' ||
      (filtro === 'andamento'
        ? ['agendado', 'enviando', 'pausado'].includes(e.status)
        : ['concluido', 'cancelado'].includes(e.status)),
  );
  const contagem = (st) => (envios || []).filter((e) => st.includes(e.status)).length;

  return (
    <div className="space-y-4">
      <div className={`${LINHA_TITULO} flex flex-col gap-3`}>
        <div className="hidden lg:block" />
        <EncaixeCabecalho />
        <div className={`flex items-center gap-2 ${ACOES_TITULO}`}>
          <span className="hidden 2xl:flex h-8 px-3 rounded-full text-[12px] font-medium bg-rm-acento-medio/10 text-rm-acento dark:text-rm-acento-vivo items-center whitespace-nowrap">
            {contagem(['agendado', 'enviando'])} em andamento
          </span>
          <button
            type="button"
            onClick={() => setNovo(true)}
            className="h-10 px-5 rounded-full whitespace-nowrap text-[12.5px] font-bold bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 shadow-md cursor-pointer"
          >
            + Novo envio
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Segmentos
          valor={filtro}
          onMudar={setFiltro}
          opcoes={[
            ['todos', 'Todos'],
            ['andamento', 'Em andamento'],
            ['terminados', 'Terminados'],
          ]}
        />
        <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">
          As mensagens ficam no histórico de cada conversa do Chat. Quem responder volta para a
          fila.
        </p>
      </div>

      {erro ? (
        <p className="p-10 text-center text-[13.5px] text-rose-600 dark:text-rose-400">{erro}</p>
      ) : envios === null ? (
        <p className="p-10 text-center text-[13px] text-slate-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-black/[0.12] dark:border-white/[0.14] p-12 text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-rm-acento-medio/10 text-rm-acento dark:text-rm-acento-vivo flex items-center justify-center">
            <svg
              className="w-7 h-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21.5 2.5 10.5 13.5" />
              <path d="M21.5 2.5l-7 19-4-8-8-4z" />
            </svg>
          </span>
          <p className="mt-4 text-[15px] font-semibold">
            {envios.length ? 'Nenhum envio com este filtro' : 'Nenhum envio ainda'}
          </p>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
            Mande uma mensagem para vários contatos e grupos de uma vez, na hora ou agendada, com
            tempo entre um envio e outro.
          </p>
          {!envios.length && (
            <button
              type="button"
              onClick={() => setNovo(true)}
              className={`${classeBotaoPrimario} mx-auto mt-5`}
            >
              Criar o primeiro envio
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((e) => (
            <CartaoEnvio
              key={e.id}
              envio={e}
              onAbrir={() => setAberto(e.id)}
              onAcao={(envio, acao) =>
                CONFIRMACOES[acao] ? setConfirmando({ envio, acao }) : agir(envio, acao)
              }
            />
          ))}
        </div>
      )}

      <NovoEnvio
        aberto={novo}
        onFechar={() => setNovo(false)}
        onCriado={(envio) => {
          setNovo(false);
          setEnvios((l) => [envio, ...(l || [])]);
          setTimeout(carregar, 4000);
        }}
      />
      <DetalheEnvio envioId={aberto} onFechar={() => setAberto(null)} />
      <ConfirmModal
        isOpen={Boolean(confirmando)}
        title={confirmando ? CONFIRMACOES[confirmando.acao].titulo : ''}
        message={
          confirmando ? `“${confirmando.envio.nome}”: ${CONFIRMACOES[confirmando.acao].texto}` : ''
        }
        confirmText={confirmando ? CONFIRMACOES[confirmando.acao].botao : ''}
        variant="danger"
        onClose={() => setConfirmando(null)}
        onConfirm={async () => {
          const c = confirmando;
          setConfirmando(null);
          if (c) await agir(c.envio, c.acao);
        }}
      />
    </div>
  );
}
