/**
 * Vigia do Chat: compara a lista de conversas com a anterior e diz o que merece aviso (som + central).
 *  - conversa nova na fila de pendentes
 *  - mensagem nova numa conversa pendente ou numa conversa que está com a pessoa
 * Grupos não tocam (fazem barulho demais). A conversa aberta na tela não avisa.
 * Função pura: o estado (último número de não lidas por conversa) é passado e devolvido.
 */
import { ehGrupo } from './canais';

export function analisarConversas(anterior, conversas = [], { email, abertaId = null } = {}) {
  const proximo = new Map();
  const avisos = [];
  for (const c of conversas || []) {
    if (c.status === 'resolvida') continue;
    proximo.set(c.id, c.nao_lidas || 0);
    if (!anterior || ehGrupo(c.contato?.telefone) || c.id === abertaId) continue;
    const antes = anterior.get(c.id);
    const nome = c.contato?.nome || 'Cliente';
    const previa = String(c.ultima_mensagem_texto || '').slice(0, 90);
    const pendente = !c.responsavel_email;
    const minha = c.responsavel_email && c.responsavel_email === email;
    if (antes === undefined && pendente && (c.nao_lidas || 0) > 0) {
      avisos.push({ conversaId: c.id, titulo: `Nova conversa: ${nome}`, detalhe: previa, chave: `${c.id}-nova` });
    } else if (antes !== undefined && (c.nao_lidas || 0) > antes && (pendente || minha)) {
      avisos.push({ conversaId: c.id, titulo: `${pendente ? 'Na fila' : 'Mensagem'} de ${nome}`, detalhe: previa, chave: `${c.id}-${c.ultima_mensagem_em || c.nao_lidas}` });
    }
  }
  return { proximo, avisos };
}
