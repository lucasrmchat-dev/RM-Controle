/**
 * Vigia em segundo plano que transforma o estado do sistema em notificações:
 * SLA estourado, prazo de demanda chegando/vencido e feedback que mudou de etapa.
 * Cada aviso tem id estável, então aparece uma vez só (ver lib/notificacoes.js).
 */
import { notificar } from './notificacoes';
import { deveNotificarChamado, getAudioConfig } from './audioNotifications';
import { fetchFeedbacks, fetchPublicacaoNovidades, getAgendaEventos, getChamadosSuporte, getConfigFeedbacks, getConfiguracoesSuporte, getLocalData, setLocalData, isChamadoFeedback } from './storage';
import { etapaDe } from './feedbacks';
import { NOVIDADES } from './novidades';

const minutosDesde = (iso) => {
  const t = new Date(iso || 0).getTime();
  return t ? Math.floor((Date.now() - t) / 60000) : 0;
};

function verificarDemandas(email) {
  const me = String(email || '').toLowerCase().trim();
  const cfg = getConfiguracoesSuporte() || {};
  const critico = Number(cfg.tempo_critico_minutos) || 30;
  // As mesmas regras do alerta sonoro decidem para quem a demanda importa (mesmo com o som desligado)
  const regras = { ...getAudioConfig(), habilitado: true };

  for (const ch of getChamadosSuporte().filter((c) => !isChamadoFeedback(c))) {
    const empresa = ch.empresa_nome || 'Empresa';
    const minha = String(ch.tecnico_email || '').toLowerCase().trim() === me;
    const paraMim = minha || deveNotificarChamado({ status: 'aguardando_visualizacao', ...ch }, me, regras);

    if (ch.status === 'aguardando_visualizacao' && paraMim) {
      const espera = minutosDesde(ch.tempo_espera_inicio || ch.created_at);
      if (espera >= critico) {
        notificar({ id: `sla_espera_${ch.id}`, tipo: 'sla', titulo: `SLA estourado · ${empresa}`, detalhe: `Esperando há ${espera} min sem ninguém assumir.`, aba: 'fila' });
      }
    }
    if (ch.status === 'em_andamento' && minha) {
      const ativo = minutosDesde(ch.tempo_ativo_inicio || ch.iniciado_em);
      if (ativo >= critico) {
        notificar({ id: `sla_atendimento_${ch.id}`, tipo: 'sla', titulo: `Atendimento longo · ${empresa}`, detalhe: `Com você há ${ativo} min. O limite configurado é ${critico} min.`, aba: 'fila' });
      }
    }

    if (ch.prazo_limite && paraMim) {
      const faltam = Math.round((new Date(ch.prazo_limite).getTime() - Date.now()) / 60000);
      const hora = new Date(ch.prazo_limite).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      if (faltam < 0) {
        notificar({ id: `prazo_vencido_${ch.id}_${ch.prazo_limite}`, tipo: 'prazo', titulo: `Prazo vencido · ${empresa}`, detalhe: `O prazo era ${hora}.`, aba: 'fila' });
      } else if (faltam <= 60) {
        notificar({ id: `prazo_breve_${ch.id}_${ch.prazo_limite}`, tipo: 'prazo', titulo: `Prazo em ${faltam} min · ${empresa}`, detalhe: `Vence às ${hora}.`, aba: 'fila' });
      }
    }
  }
}

async function verificarFeedbacks(email) {
  const me = String(email || '').toLowerCase().trim();
  const lista = await fetchFeedbacks().catch(() => null);
  if (!Array.isArray(lista)) return;
  const chave = `feedbacks_etapas_vistas:${me}`;
  const vistas = getLocalData(chave, null);
  const nomes = getConfigFeedbacks().etapas;
  const atuais = {};
  for (const fb of lista) {
    if (String(fb.autor_email || '').toLowerCase().trim() !== me) continue;
    const etapa = etapaDe(fb);
    atuais[fb.id] = etapa;
    // Primeira leitura só memoriza; avisa a partir das próximas mudanças
    if (vistas && vistas[fb.id] && vistas[fb.id] !== etapa) {
      notificar({
        id: `feedback_${fb.id}_${etapa}`,
        tipo: 'feedback',
        titulo: etapa === 'resolvido' ? 'Seu feedback foi concluído' : `Seu feedback está em "${nomes[etapa]}"`,
        detalhe: fb.titulo,
        aba: 'feedbacks',
      });
    }
  }
  setLocalData(chave, atuais);
}

// Cliente respondeu ao pedido de confirmação (reuniões de que a pessoa é responsável)
const RESPOSTAS = {
  confirmada: (e) => ({ titulo: `Cliente confirmou · ${e.titulo}`, detalhe: `${e.participante_nome || e.empresa || 'Cliente'} confirmou a reunião de ${e.data.split('-').reverse().join('/')} às ${e.hora_inicio}.` }),
  remarcar: (e) => ({ titulo: `Cliente pediu para remarcar · ${e.titulo}`, detalhe: e.confirmacao_mensagem || 'Combine um novo horário com o cliente.' }),
  cancelada: (e) => ({ titulo: `Cliente cancelou · ${e.titulo}`, detalhe: e.confirmacao_mensagem || 'A reunião continua na agenda até você cancelar.' }),
};
function verificarRespostasClientes(email) {
  const me = String(email || '').toLowerCase().trim();
  for (const e of getAgendaEventos()) {
    const texto = RESPOSTAS[e.confirmacao_status];
    if (!texto || String(e.responsavel_email || e.criado_por || '').toLowerCase().trim() !== me || !e.confirmacao_respondida_em) continue;
    notificar({ id: `reuniao_resposta_${e.id}_${e.confirmacao_status}_${e.confirmacao_respondida_em}`, tipo: 'reuniao', ...texto(e), aba: 'agenda' });
  }
}

// Novidades: a área de desenvolvimento é avisada do que espera aprovação; todos, do que foi publicado
async function verificarNovidades() {
  const { publicacao, desenvolvimento } = await fetchPublicacaoNovidades();
  const semana = Date.now() - 7 * 86400000;
  for (const n of NOVIDADES) {
    const pub = publicacao[n.id];
    if (!pub && desenvolvimento) {
      notificar({ id: `novidade_pendente_${n.id}`, tipo: 'feedback', titulo: 'Novidade aguardando sua aprovação', detalhe: n.titulo, aba: 'feedbacks' });
    }
    if (pub?.publicada && new Date(pub.em).getTime() >= semana) {
      notificar({ id: `novidade_${n.id}`, tipo: 'sistema', titulo: 'Novidade no RM Controle', detalhe: n.titulo, aba: 'feedbacks' });
    }
  }
}

/** Liga o vigia para quem está logado. Retorna a função que desliga. */
export function iniciarVigiaNotificacoes(email) {
  if (typeof window === 'undefined' || !email) return () => {};
  const demandas = () => {
    try {
      verificarDemandas(email);
      verificarRespostasClientes(email);
    } catch {}
  };
  const feedbacks = () => {
    verificarFeedbacks(email).catch(() => {});
    verificarNovidades().catch(() => {});
  };
  demandas();
  feedbacks();
  const t1 = setInterval(demandas, 30000);
  const t2 = setInterval(() => document.visibilityState === 'visible' && feedbacks(), 120000);
  window.addEventListener('suporte_updated', demandas);
  window.addEventListener('agenda_eventos_updated', demandas);
  return () => {
    window.removeEventListener('agenda_eventos_updated', demandas);
    clearInterval(t1);
    clearInterval(t2);
    window.removeEventListener('suporte_updated', demandas);
  };
}
