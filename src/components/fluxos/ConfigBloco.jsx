'use client';

import React, { useMemo, useRef } from 'react';
import { BLOCOS, ESPERA_MAXIMA_SEGUNDOS, OPERADORES, PERGUNTA_MAX_MINUTOS, STATUS_REUNIAO, VARIAVEIS_GATILHO, VARIAVEIS_SEMPRE } from '@/lib/fluxos';
import { DESFECHOS_COMERCIAIS } from '@/lib/comercial';
import { CORES_BLOCO, IconeBloco, campoClasse, rotuloClasse } from './visual';
import { useEtiquetasCadastradas } from '../SeletorEtiqueta';

/** Variáveis disponíveis no fluxo: as dos gatilhos presentes, as de sempre e as criadas em blocos "Variável". */
export function variaveisDoFluxo(definicao) {
  const lista = new Map();
  for (const n of definicao?.nos || []) for (const [k, r] of VARIAVEIS_GATILHO[n.tipo] || []) lista.set(k, r);
  for (const [k, r] of VARIAVEIS_SEMPRE) lista.set(k, r);
  for (const n of definicao?.nos || []) {
    const nome = String(n.config?.nome || '').trim().replace(/[^\w]/g, '_');
    if (n.tipo === 'variavel' && nome) lista.set(`var.${nome}`, `Variável ${nome}`);
    const resposta = String(n.config?.variavel || '').trim().replace(/[^\w]/g, '_');
    if (n.tipo === 'pergunta' && resposta) lista.set(`var.${resposta}`, `Resposta da pergunta (${resposta})`);
  }
  return [...lista.entries()];
}

function Segmentos({ valor, opcoes, onMudar }) {
  return (
    <div className="flex p-0.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.06]">
      {opcoes.map(([id, rotulo]) => (
        <button
          key={id}
          type="button"
          onClick={() => onMudar(id)}
          className={`flex-1 h-8 px-2 rounded-[10px] text-[12.5px] font-medium cursor-pointer transition-colors ${valor === id ? 'bg-white dark:bg-rm-elevado-escuro shadow-sm text-[#1d1d1f] dark:text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'}`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

/** Texto com botões de variáveis: clicar insere {{variável}} onde está o cursor. */
function TextoComVariaveis({ valor, onMudar, variaveis, linhas = 4, placeholder }) {
  const ref = useRef(null);
  const inserir = (chave) => {
    const el = ref.current;
    const marca = `{{${chave}}}`;
    const ini = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? valor.length;
    const novo = valor.slice(0, ini) + marca + valor.slice(fim);
    onMudar(novo);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  };
  return (
    <div>
      <textarea ref={ref} value={valor} onChange={(e) => onMudar(e.target.value)} rows={linhas} placeholder={placeholder} className={`${campoClasse} h-auto py-2 leading-relaxed resize-y`} />
      {variaveis.length > 0 && (
        <div className="mt-2">
          <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 mb-1">Toque para inserir uma informação no texto:</p>
          <div className="flex flex-wrap gap-1.5">
            {variaveis.map(([k, r]) => (
              <button key={k} type="button" onClick={() => inserir(k)} title={`{{${k}}}`} className="h-7 px-2.5 rounded-lg text-[12px] font-medium bg-white dark:bg-rm-campo-escuro ring-1 ring-black/[0.1] dark:ring-white/[0.12] text-slate-700 dark:text-zinc-200 hover:ring-rm-acento-medio hover:text-rm-acento-medio cursor-pointer">
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const Campo = ({ rotulo, children, dica }) => (
  <div>
    <span className={rotuloClasse}>{rotulo}</span>
    {children}
    {dica && <p className="mt-1 text-[11.5px] text-slate-500 dark:text-zinc-400 leading-snug">{dica}</p>}
  </div>
);

export default function ConfigBloco({ no, definicao, canais = [], equipe = [], departamentos = [], processos = [], onMudar, onExcluir, onDuplicar, onFechar }) {
  const b = BLOCOS[no.tipo];
  const c = no.config || {};
  const cor = CORES_BLOCO[b.cor] || CORES_BLOCO.slate;
  const variaveis = useMemo(() => variaveisDoFluxo(definicao), [definicao]);
  const etiquetasChat = useEtiquetasCadastradas('chat');
  const mudar = (campos) => onMudar({ ...c, ...campos });
  const canalSelect = (
    <select value={c.canal_id || ''} onChange={(e) => mudar({ canal_id: e.target.value })} className={campoClasse}>
      <option value="">Primeiro canal conectado</option>
      {canais.map((k) => (
        <option key={k.id} value={k.id}>
          {k.nome}
          {k.status !== 'conectado' ? ' (desconectado)' : ''}
        </option>
      ))}
    </select>
  );

  let corpo = null;
  switch (no.tipo) {
    case 'gatilho_mensagem': {
      const lista = Array.isArray(c.canais) ? c.canais : [];
      corpo = (
        <>
          <Campo rotulo="Canais" dica="Nenhum marcado = todos os canais.">
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {canais.length === 0 && <p className="text-[12.5px] text-slate-500">Nenhum canal cadastrado.</p>}
              {canais.map((k) => (
                <label key={k.id} className="flex items-center gap-2 text-[13px] cursor-pointer py-0.5">
                  <input type="checkbox" checked={lista.includes(k.id)} onChange={(e) => mudar({ canais: e.target.checked ? [...lista, k.id] : lista.filter((x) => x !== k.id) })} className="accent-[rgb(var(--rm-acento-medio))]" />
                  <span className="truncate">{k.nome}</span>
                  {k.numero && <span className="text-[11px] text-slate-400 truncate">{k.numero}</span>}
                </label>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Vindo de">
            <Segmentos valor={c.origem || 'todas'} onMudar={(v) => mudar({ origem: v })} opcoes={[['todas', 'Todos'], ['contato', 'Contatos'], ['grupo', 'Grupos']]} />
          </Campo>
          <Campo rotulo="Texto da mensagem">
            <select value={c.filtro || 'qualquer'} onChange={(e) => mudar({ filtro: e.target.value })} className={campoClasse}>
              <option value="qualquer">Qualquer mensagem</option>
              <option value="contem">Contém</option>
              <option value="palavras">Contém alguma das palavras</option>
              <option value="comeca">Começa com</option>
              <option value="igual">É exatamente</option>
            </select>
            {c.filtro && c.filtro !== 'qualquer' && (
              <input value={c.texto || ''} onChange={(e) => mudar({ texto: e.target.value })} placeholder={c.filtro === 'palavras' ? 'preço, orçamento, valor' : 'texto'} className={`${campoClasse} mt-2`} />
            )}
          </Campo>
          <label className="flex items-start gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={Boolean(c.so_sem_responsavel)} onChange={(e) => mudar({ so_sem_responsavel: e.target.checked })} className="mt-0.5 accent-[rgb(var(--rm-acento-medio))]" />
            <span>
              Só conversas sem responsável
              <span className="block text-[11.5px] text-slate-500 dark:text-zinc-400">Não responde quando alguém da equipe já está atendendo.</span>
            </span>
          </label>
          <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-zinc-400 rounded-xl bg-black/[0.035] dark:bg-white/[0.06] px-3 py-2">
            Mensagens enviadas pelo próprio número do canal (pelo RM Controle ou pelo celular conectado) não disparam o fluxo, para ele não responder a si mesmo. Para testar, escreva de outro número. Em “Execuções”, as mensagens que chegaram e não dispararam aparecem com o motivo.
          </p>
        </>
      );
      break;
    }
    case 'gatilho_demanda_criada':
    case 'gatilho_demanda_andamento':
    case 'gatilho_demanda_fechada':
    case 'gatilho_demanda_sla':
      corpo = (
        <>
          {no.tipo === 'gatilho_demanda_sla' && (
            <>
              <Campo rotulo="Situação da demanda">
                <Segmentos valor={c.em || 'aguardando'} onMudar={(v) => mudar({ em: v })} opcoes={[['aguardando', 'Esperando alguém assumir'], ['andamento', 'Em atendimento']]} />
              </Campo>
              <Campo rotulo="Passou de quantos minutos?" dica="O sistema confere a cada minuto e avisa uma vez por demanda.">
                <input type="number" min="1" max="10080" value={c.minutos ?? 30} onChange={(e) => mudar({ minutos: Math.max(1, Number(e.target.value) || 1) })} className={campoClasse} />
              </Campo>
            </>
          )}
          {no.tipo === 'gatilho_demanda_fechada' && (
            <Campo rotulo="Como foi fechada">
              <Segmentos valor={c.resultado || 'qualquer'} onMudar={(v) => mudar({ resultado: v })} opcoes={[['qualquer', 'Qualquer'], ['concluida', 'Concluída'], ['cancelada', 'Cancelada']]} />
            </Campo>
          )}
          <Campo rotulo="Criada a partir de" dica="“De uma conversa” é a demanda criada pelo menu da mensagem no Chat. Com ela, “Enviar mensagem” pode responder na mesma conversa.">
            <Segmentos valor={c.origem || 'qualquer'} onMudar={(v) => mudar({ origem: v })} opcoes={[['qualquer', 'Qualquer lugar'], ['conversa', 'De uma conversa'], ['grupo', 'De um grupo']]} />
          </Campo>
          <Campo rotulo="Departamento" dica="Deixe em “Todos” para valer para qualquer departamento.">
            <select value={c.departamento || ''} onChange={(e) => mudar({ departamento: e.target.value })} className={campoClasse}>
              <option value="">Todos os departamentos</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Campo>
          <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-zinc-400 rounded-xl bg-black/[0.035] dark:bg-white/[0.06] px-3 py-2">
            Para avisar alguém, use “Enviar mensagem”: dá para mandar na mesma conversa (demanda criada de uma conversa), ao solicitante, ao grupo da empresa ou a um número. Use as informações da demanda (empresa, relato, departamento…) no texto.
          </p>
        </>
      );
      break;
    case 'gatilho_reuniao_agendada':
      corpo = (
        <Campo rotulo="Tipo de reunião">
          <Segmentos valor={c.tipo || 'todos'} onMudar={(v) => mudar({ tipo: v })} opcoes={[['todos', 'Todas'], ['cliente', 'Com cliente'], ['interna', 'Interna']]} />
        </Campo>
      );
      break;
    case 'gatilho_reuniao_status':
      corpo = (
        <Campo rotulo="Quando a reunião ficar">
          <select value={c.status || 'concluida'} onChange={(e) => mudar({ status: e.target.value })} className={campoClasse}>
            {STATUS_REUNIAO.filter((s) => s.id !== 'agendada').map((s) => (
              <option key={s.id} value={s.id}>
                {s.rotulo}
              </option>
            ))}
            <option value="qualquer">Qualquer mudança</option>
          </select>
        </Campo>
      );
      break;
    case 'enviar_mensagem': {
      const temConversa = definicao?.nos?.some((n) => ['gatilho_mensagem'].includes(n.tipo));
      const temReuniao = definicao?.nos?.some((n) => ['gatilho_reuniao_agendada', 'gatilho_reuniao_status'].includes(n.tipo));
      const temDemanda = definicao?.nos?.some((n) => String(n.tipo).startsWith('gatilho_demanda'));
      const demandaDeConversa = definicao?.nos?.some((n) => String(n.tipo).startsWith('gatilho_demanda') && (n.config?.origem === 'conversa' || n.config?.origem === 'grupo'));
      const destino = c.destino || 'conversa';
      const opcoesDestino = [
        ['conversa', 'Na própria conversa', 'Responde a quem escreveu. Com “Mensagem no WhatsApp” ou com uma demanda criada de uma conversa.', temConversa || demandaDeConversa],
        ['solicitante', 'Ao solicitante da demanda', 'Usa o número gravado no colaborador quando a demanda é criada de uma conversa de grupo.', temDemanda],
        ['grupo_empresa', 'Ao grupo da empresa', 'Manda no grupo de WhatsApp ligado à empresa da demanda.', temDemanda],
        ['cliente_reuniao', 'Ao cliente da reunião', 'Usa o telefone cadastrado na reunião. Só com gatilhos de reunião.', temReuniao],
        ['numero', 'A um número específico', 'Você escolhe o número. Serve para avisar a equipe, por exemplo.', true],
      ];
      const canalEscolhido = canais.find((k) => k.id === c.canal_id);
      corpo = (
        <>
          <Campo rotulo="Para quem enviar">
            <div className="space-y-1.5">
              {opcoesDestino.map(([id, titulo, ajuda, disponivel]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => mudar({ destino: id })}
                  className={`w-full text-left rounded-xl px-3 py-2 ring-1 transition-colors cursor-pointer ${destino === id ? 'ring-2 ring-rm-acento-medio bg-rm-acento-medio/[0.06]' : 'ring-black/[0.1] dark:ring-white/[0.12] hover:ring-black/25'}`}
                >
                  <span className="block text-[13px] font-semibold text-[#1d1d1f] dark:text-white">{titulo}</span>
                  <span className="block text-[11.5px] leading-snug text-slate-500 dark:text-zinc-400">{ajuda}</span>
                  {!disponivel && destino === id && <span className="block text-[11.5px] font-medium text-amber-700 dark:text-amber-300 mt-0.5">Não funciona com os gatilhos deste fluxo: escolha outra opção.</span>}
                </button>
              ))}
            </div>
          </Campo>
          {destino === 'numero' && (
            <Campo rotulo="Número (DDD + número)">
              <input value={c.telefone || ''} onChange={(e) => mudar({ telefone: e.target.value })} placeholder="85 99999-0000 ou {{contato.telefone}}" className={campoClasse} />
            </Campo>
          )}
          {destino === 'grupo_empresa' ? (
            <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 rounded-xl bg-black/[0.035] dark:bg-white/[0.06] px-3 py-2">No grupo, a mensagem sai pelo mesmo número (canal) que já está no grupo.</p>
          ) : destino !== 'conversa' ? (
            <Campo rotulo="Enviar pelo número (canal)" dica={canalEscolhido ? `A mensagem sai pelo WhatsApp ${canalEscolhido.numero || canalEscolhido.nome}.` : 'Sem escolha, usa o primeiro canal conectado. Escolha um para ter certeza de por onde sai.'}>
              {canalSelect}
            </Campo>
          ) : (
            <p className="text-[11.5px] text-slate-500 dark:text-zinc-400 rounded-xl bg-black/[0.035] dark:bg-white/[0.06] px-3 py-2">Na conversa, a mensagem sai pelo mesmo número (canal) em que o cliente escreveu.</p>
          )}
          <Campo rotulo="Mensagem" dica="*negrito* e _itálico_ funcionam como no WhatsApp.">
            <TextoComVariaveis valor={c.texto || ''} onMudar={(v) => mudar({ texto: v })} variaveis={variaveis} linhas={6} placeholder="Olá {{contato.nome}}! Como posso ajudar?" />
          </Campo>
        </>
      );
      break;
    }
    case 'pergunta':
      corpo = (
        <>
          <Campo rotulo="Pergunta" dica="Vai na conversa que disparou o fluxo (contato ou grupo). *negrito* e variáveis funcionam.">
            <TextoComVariaveis valor={c.texto || ''} onMudar={(v) => mudar({ texto: v })} variaveis={variaveis} linhas={5} placeholder="Olá {{contato.nome}}! Qual é a sua dúvida?" />
          </Campo>
          <Campo rotulo="Guardar a resposta em" dica={`Use depois como {{var.${String(c.variavel || 'resposta').trim().replace(/[^\w]/g, '_') || 'resposta'}}} (por exemplo, numa Condição).`}>
            <input value={c.variavel ?? 'resposta'} onChange={(e) => mudar({ variavel: e.target.value })} placeholder="resposta" className={campoClasse} />
          </Campo>
          <Campo rotulo="Esperar a resposta por" dica="Se ninguém responder nesse tempo, o fluxo segue pela saída “Sem resposta”. Máximo de 7 dias.">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={PERGUNTA_MAX_MINUTOS} value={c.minutos ?? 60} onChange={(e) => mudar({ minutos: Number(e.target.value) })} className={`${campoClasse} w-28`} />
              <span className="text-[13px] text-slate-500 dark:text-zinc-400">minutos</span>
            </div>
          </Campo>
          <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-zinc-400 rounded-xl bg-black/[0.035] dark:bg-white/[0.06] px-3 py-2">
            A próxima mensagem do contato (ou de qualquer pessoa do grupo) nessa conversa é a resposta: o fluxo continua pela saída “Respondeu”. Uma pergunta nova do mesmo fluxo na mesma conversa substitui a anterior.
          </p>
        </>
      );
      break;
    case 'condicao': {
      const regras = Array.isArray(c.regras) ? c.regras : [];
      const mudarRegra = (i, campos) => mudar({ regras: regras.map((r, j) => (j === i ? { ...r, ...campos } : r)) });
      corpo = (
        <>
          <Campo rotulo="Seguir por Sim quando">
            <Segmentos valor={c.combinar || 'todas'} onMudar={(v) => mudar({ combinar: v })} opcoes={[['todas', 'Todas as regras'], ['alguma', 'Alguma regra']]} />
          </Campo>
          <div className="space-y-2.5">
            {regras.map((r, i) => {
              const op = OPERADORES.find((o) => o.id === r.operador);
              return (
                <div key={i} className="rounded-2xl p-2.5 bg-black/[0.03] dark:bg-white/[0.04] space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <select value={r.campo} onChange={(e) => mudarRegra(i, { campo: e.target.value })} className={campoClasse}>
                      {!variaveis.some(([k]) => k === r.campo) && r.campo && <option value={r.campo}>{r.campo}</option>}
                      {variaveis.map(([k, rot]) => (
                        <option key={k} value={k}>
                          {rot}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => mudar({ regras: regras.filter((_, j) => j !== i) })} aria-label="Tirar regra" className="w-8 h-8 flex-shrink-0 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer flex items-center justify-center">
                      ×
                    </button>
                  </div>
                  <select value={r.operador} onChange={(e) => mudarRegra(i, { operador: e.target.value })} className={campoClasse}>
                    {OPERADORES.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.rotulo}
                      </option>
                    ))}
                  </select>
                  {!op?.semValor &&
                    (r.campo === 'contato.etiquetas' && (r.operador === 'tem_item' || r.operador === 'nao_tem_item') ? (
                      <select value={r.valor || ''} onChange={(e) => mudarRegra(i, { valor: e.target.value })} className={campoClasse}>
                        <option value="">Escolha a etiqueta</option>
                        {[...new Set([...(etiquetasChat || []), ...(r.valor ? [r.valor] : [])])].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={r.valor || ''} onChange={(e) => mudarRegra(i, { valor: e.target.value })} placeholder="valor" className={campoClasse} />
                    ))}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => mudar({ regras: [...regras, { campo: variaveis[0]?.[0] || 'mensagem.texto', operador: 'contem', valor: '' }] })} className="h-9 w-full rounded-xl border border-dashed border-black/15 dark:border-white/20 text-[12.5px] font-medium text-slate-600 dark:text-zinc-300 hover:border-rm-acento-medio hover:text-rm-acento-medio cursor-pointer">
            + Adicionar regra
          </button>
          <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">Sem acentos e sem diferença entre maiúsculas e minúsculas.</p>
        </>
      );
      break;
    }
    case 'espera':
      corpo = (
        <Campo rotulo="Segundos" dica={`De 0 a ${ESPERA_MAXIMA_SEGUNDOS} segundos (dá um ar de “digitando”).`}>
          <input type="number" min={0} max={ESPERA_MAXIMA_SEGUNDOS} value={c.segundos ?? 3} onChange={(e) => mudar({ segundos: Math.max(0, Math.min(ESPERA_MAXIMA_SEGUNDOS, Number(e.target.value) || 0)) })} className={campoClasse} />
        </Campo>
      );
      break;
    case 'variavel':
      corpo = (
        <>
          <Campo rotulo="Nome" dica="Use depois como {{var.nome}}.">
            <input value={c.nome || ''} onChange={(e) => mudar({ nome: e.target.value.replace(/[^\w]/g, '_').slice(0, 40) })} placeholder="primeiro_nome" className={campoClasse} />
          </Campo>
          <Campo rotulo="Valor">
            <TextoComVariaveis valor={c.valor || ''} onMudar={(v) => mudar({ valor: v })} variaveis={variaveis} linhas={2} />
          </Campo>
        </>
      );
      break;
    case 'reuniao_status':
      corpo = (
        <Campo rotulo="Novo status" dica="Vale para a reunião que disparou o fluxo.">
          <select value={c.status || 'concluida'} onChange={(e) => mudar({ status: e.target.value })} className={campoClasse}>
            {STATUS_REUNIAO.map((s) => (
              <option key={s.id} value={s.id}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      );
      break;
    case 'reuniao_anotar':
      corpo = (
        <Campo rotulo="Texto da anotação" dica="Entra nas observações da reunião do gatilho.">
          <TextoComVariaveis valor={c.texto || ''} onMudar={(v) => mudar({ texto: v })} variaveis={variaveis} linhas={3} />
        </Campo>
      );
      break;
    case 'reuniao_criar':
      corpo = (
        <>
          <Campo rotulo="Título">
            <TextoComVariaveis valor={c.titulo || ''} onMudar={(v) => mudar({ titulo: v })} variaveis={variaveis} linhas={2} />
          </Campo>
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Daqui a (dias)">
              <input type="number" min={0} max={365} value={c.em_dias ?? 1} onChange={(e) => mudar({ em_dias: Number(e.target.value) || 0 })} className={campoClasse} />
            </Campo>
            <Campo rotulo="Hora">
              <input type="time" value={c.hora || '09:00'} onChange={(e) => mudar({ hora: e.target.value })} className={campoClasse} />
            </Campo>
            <Campo rotulo="Minutos">
              <input type="number" min={5} max={480} value={c.duracao_min ?? 30} onChange={(e) => mudar({ duracao_min: Number(e.target.value) || 30 })} className={campoClasse} />
            </Campo>
          </div>
          <Campo rotulo="Responsável">
            <select value={c.responsavel_email || ''} onChange={(e) => mudar({ responsavel_email: e.target.value })} className={campoClasse}>
              <option value="">Sem responsável</option>
              {equipe.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.nome || p.email}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Tipo">
            <Segmentos valor={c.tipo || 'cliente'} onMudar={(v) => mudar({ tipo: v })} opcoes={[['cliente', 'Com cliente'], ['interna', 'Interna']]} />
          </Campo>
        </>
      );
      break;
    case 'comercial_etapa': {
      // Processos e etapas que a empresa criou (Configurações › Comercial e processos), mais Ganho e Perda
      const processo = processos.find((p) => p.id === c.processo_id);
      const etapas = processo ? [...(processo.etapas || []), ...DESFECHOS_COMERCIAIS] : [];
      corpo =
        processos.length === 0 ? (
          <p className="text-[13px] text-slate-600 dark:text-zinc-300">Nenhum processo comercial criado ainda. Crie em Configurações › Comercial e processos.</p>
        ) : (
          <>
            <Campo rotulo="Processo comercial">
              <select
                value={c.processo_id || ''}
                onChange={(e) => {
                  const p = processos.find((x) => x.id === e.target.value);
                  mudar({ processo_id: p?.id || '', processo_nome: p?.nome || '', etapa_id: '', etapa_nome: '' });
                }}
                className={campoClasse}
              >
                <option value="">Escolha o processo</option>
                {processos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            {c.processo_id && !processo && <p className="text-[12px] text-rose-600">Este processo não existe mais. Escolha outro.</p>}
            {processo && (
              <Campo rotulo="Etapa" dica="A reunião do gatilho (ou a agendada por um bloco antes deste) vai para esta etapa.">
                <select
                  value={c.etapa_id || ''}
                  onChange={(e) => {
                    const et = etapas.find((x) => x.id === e.target.value);
                    mudar({ etapa_id: et?.id || '', etapa_nome: et?.nome || '' });
                  }}
                  className={campoClasse}
                >
                  <option value="">Escolha a etapa</option>
                  {etapas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </>
        );
      break;
    }
    case 'conversa_departamento':
      corpo = (
        <Campo rotulo="Departamento">
          <input list="fluxo-departamentos" value={c.departamento || ''} onChange={(e) => mudar({ departamento: e.target.value })} placeholder="Ex.: Financeiro" className={campoClasse} />
          <datalist id="fluxo-departamentos">
            {departamentos.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Campo>
      );
      break;
    case 'conversa_resolver':
      corpo = <p className="text-[13px] text-slate-600 dark:text-zinc-300">Encerra a conversa que disparou o fluxo (vai para Resolvidas).</p>;
      break;
    case 'fim':
      corpo = <p className="text-[13px] text-slate-600 dark:text-zinc-300">Nada depois deste bloco é executado.</p>;
      break;
    default:
      corpo = null;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-3 flex items-start gap-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${cor.faixa}`}>
          <IconeBloco tipo={no.tipo} className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-[#1d1d1f] dark:text-white">{b.rotulo}</p>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400 leading-snug">{b.descricao}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" onClick={onDuplicar} title="Duplicar bloco" aria-label="Duplicar bloco" className="w-8 h-8 rounded-full text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V6a2 2 0 0 1 2-2h9" />
            </svg>
          </button>
          <button type="button" onClick={onExcluir} title="Excluir bloco (⌘Z desfaz)" aria-label="Excluir bloco" className="w-8 h-8 rounded-full text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            </svg>
          </button>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer flex items-center justify-center text-[18px]">
            ×
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">{corpo}</div>
    </div>
  );
}
