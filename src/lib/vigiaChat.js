/**
 * Vigia do Chat: compara a lista de conversas com a anterior e diz o que merece aviso (som + central).
 *  - conversa nova na fila de pendentes
 *  - mensagem nova do cliente numa conversa pendente ou numa conversa que está com a pessoa,
 *    inclusive a que está aberta na tela (a pessoa pode estar longe do computador)
 * Grupos avisam só com a opção ligada (podem fazer barulho demais).
 * Função pura: o estado (não lidas e última mensagem do cliente, por conversa) é passado e devolvido.
 */
import { ehGrupo } from './canais';

const momento = (iso) => (iso ? new Date(iso).getTime() || 0 : 0);

export function analisarConversas(anterior, conversas = [], { email, grupos = false } = {}) {
  const proximo = new Map();
  const avisos = [];
  // A mesma mensagem de grupo chega a cada canal da empresa que está no grupo (uma conversa por canal,
  // todas com a mesma hora): avisa uma vez só. Lembra das últimas para valer também entre uma consulta e outra.
  const jaAvisadas = new Set(anterior?.jaAvisadas || []);
  const avisarGrupoUmaVez = (c) => {
    if (!ehGrupo(c.contato?.telefone)) return true;
    const chave = `${c.contato.telefone}|${c.ultima_entrada_cliente_em || c.ultima_mensagem_em || ''}`;
    if (jaAvisadas.has(chave)) return false;
    jaAvisadas.add(chave);
    return true;
  };
  for (const c of conversas || []) {
    if (c.status === 'resolvida') continue;
    const atual = { naoLidas: c.nao_lidas || 0, entrada: momento(c.ultima_entrada_cliente_em) };
    proximo.set(c.id, atual);
    // Grupos só avisam se a pessoa escolheu (Configurações › Alertas sonoros › Chat)
    if (!anterior || (ehGrupo(c.contato?.telefone) && !grupos)) continue;
    const antes = anterior.get(c.id);
    const nome = c.contato?.nome || 'Cliente';
    const previa = String(c.ultima_mensagem_texto || '').slice(0, 90);
    const pendente = !c.responsavel_email;
    const minha = c.responsavel_email && c.responsavel_email === email;
    // Com a conversa aberta as mensagens já chegam lidas: vale a hora da última mensagem do cliente
    const chegouMensagem = antes && (atual.naoLidas > antes.naoLidas || atual.entrada > antes.entrada);
    if (!antes && pendente && atual.naoLidas > 0) {
      if (avisarGrupoUmaVez(c)) avisos.push({ conversaId: c.id, titulo: `Nova conversa: ${nome}`, detalhe: previa, chave: `${c.id}-nova` });
    } else if (chegouMensagem && (pendente || minha)) {
      if (avisarGrupoUmaVez(c)) avisos.push({ conversaId: c.id, titulo: `${pendente ? 'Na fila' : 'Mensagem'} de ${nome}`, detalhe: previa, chave: `${c.id}-${c.ultima_entrada_cliente_em || c.ultima_mensagem_em || atual.naoLidas}` });
    }
  }
  proximo.jaAvisadas = [...jaAvisadas].slice(-200);
  return { proximo, avisos };
}

/** Ainda há algo esperando a pessoa (para a repetição do som parar sozinha quando tudo foi lido). */
export function chatEsperando(conversas = [], { email, grupos = false } = {}) {
  return (conversas || []).some((c) => c.status !== 'resolvida' && (grupos || !ehGrupo(c.contato?.telefone)) && (c.nao_lidas || 0) > 0 && (!c.responsavel_email || c.responsavel_email === email));
}
