/**
 * Reunião do Google Meet criada direto do Chat (atalho #meet no campo de mensagem).
 *
 * O evento nasce na Agenda do sistema (agenda_eventos) e vai para o Google Agenda conectado à EMPRESA
 * de quem está atendendo (cada assinante conecta a própria conta), com a videoconferência do Meet.
 * O link volta para ser enviado na conversa.
 */
import { executarNaEmpresa } from '@/lib/server/organizacao';
import { carregarContasConectadas, espelharEvento, googleConfigurado, partesNoFuso } from '@/lib/server/googleAgenda';
import { ehGrupo } from '@/lib/canais';

export const DURACOES_MEET = [15, 30, 45, 60, 90];

const somarMinutos = (hora, minutos) => {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutos);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Texto da mensagem com o link (o complemento, se a pessoa escreveu algo depois do atalho, vem antes). */
export function textoDoMeet({ link, complemento = '', titulo }) {
  const partes = [];
  if (complemento.trim()) partes.push(complemento.trim());
  partes.push(`📅 *${titulo}*\nEntre pelo Google Meet: ${link}`);
  return partes.join('\n\n');
}

/**
 * Cria o evento com Meet e devolve { evento, link, titulo }. Lança Error com mensagem para a pessoa.
 * ctx: contexto da requisição (db da empresa e org); perm: quem está atendendo; conversa: a do chat.
 */
export async function criarMeetDaConversa({ ctx, perm, conversa, duracao = 30, agora = new Date(), fetchImpl = fetch, pessoa = null }) {
  if (!googleConfigurado()) throw new Error('O Google Agenda não está configurado neste servidor. Fale com o administrador do sistema.');
  const org = ctx.org?.legado ? null : ctx.org?.id || null;
  return executarNaEmpresa(org, async () => {
    const contas = await carregarContasConectadas();
    if (!contas.length) throw new Error('Conecte o Google Agenda da empresa (Configurações › Agenda › Google Agenda e lembretes) para criar reuniões do Meet pelo Chat.');
    const { db } = ctx;
    const { data: contato } = await db.from('contatos').select('nome, telefone, empresa_id').eq('id', conversa.contato_id).maybeSingle();
    let empresa = '';
    if (contato?.empresa_id) {
      const { data: e } = await db.from('empresas').select('nome').eq('id', contato.empresa_id).maybeSingle();
      empresa = e?.nome || '';
    }
    const grupo = ehGrupo(contato?.telefone);
    const nome = contato?.nome || (grupo ? 'grupo' : 'cliente');
    // Reunião rápida pelo menu da mensagem: vai em nome da pessoa (no grupo, quem escreveu) e fica para completar na Agenda
    const nomePessoa = String(pessoa?.nome || '').trim().slice(0, 200);
    const telefonePessoa = String(pessoa?.telefone || '').replace(/\D/g, '');
    const titulo = `Reunião com ${nomePessoa || empresa || nome}`;
    const { data, hora } = partesNoFuso(agora.toISOString());
    const minutos = DURACOES_MEET.includes(Number(duracao)) ? Number(duracao) : 30;
    const linha = {
      titulo,
      empresa: nomePessoa ? empresa : empresa || nome,
      empresa_id: contato?.empresa_id || null,
      participante_nome: nomePessoa || (grupo ? null : contato?.nome || null),
      ...(nomePessoa ? { participante_tipo: 'cliente_novo' } : {}),
      data,
      hora_inicio: hora,
      hora_fim: somarMinutos(hora, minutos),
      responsavel_email: perm.email,
      responsavel_nome: perm.nome,
      status: 'agendada',
      tipo: 'cliente',
      observacoes: nomePessoa ? `Criada na hora pelo Chat para ${nomePessoa}${grupo ? ` (grupo ${nome})` : ''}. Falta completar: departamento e empresa.` : `Criada pelo Chat (atalho #meet) na conversa com ${nome}.`,
      criado_por: perm.email,
      ...(telefonePessoa ? { cliente_telefone: telefonePessoa } : grupo || !contato?.telefone ? {} : { cliente_telefone: contato.telefone }),
      ...(conversa.departamento ? { departamento: conversa.departamento } : {}),
    };
    // Bancos sem alguma coluna opcional (telefone do cliente, departamento, empresa_id): grava sem ela
    let res = await db.from('agenda_eventos').insert([linha]).select('*').single();
    for (const coluna of ['cliente_telefone', 'departamento', 'empresa_id', 'participante_nome', 'participante_tipo']) {
      if (!res.error || !new RegExp(coluna).test(res.error.message || '')) continue;
      delete linha[coluna];
      res = await db.from('agenda_eventos').insert([linha]).select('*').single();
    }
    if (res.error) throw new Error('Não foi possível criar a reunião na agenda.');
    const evento = res.data;
    let espelho;
    try {
      espelho = await espelharEvento(evento.id, fetchImpl, { gerarMeet: true });
    } catch (e) {
      await db.from('agenda_eventos').delete().eq('id', evento.id);
      throw new Error(`O Google Agenda recusou a criação da reunião: ${e.message}`);
    }
    const link = espelho?.link_reuniao || null;
    if (!link) {
      await db.from('agenda_eventos').delete().eq('id', evento.id);
      throw new Error(espelho?.motivo === 'agenda_sem_conexao' ? 'A agenda padrão da empresa não está conectada ao Google. Escolha a agenda padrão em Configurações › Agenda.' : 'O Google não devolveu o link do Meet. Tente de novo.');
    }
    return { evento: { ...evento, link_reuniao: link }, link, titulo };
  });
}
