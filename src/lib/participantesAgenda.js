export const TIPOS_PARTICIPANTE_AGENDA = [
  { id: 'empresa', nome: 'Empresa cadastrada' },
  { id: 'cliente_novo', nome: 'Cliente novo' },
  { id: 'parceiro', nome: 'Parceiro' },
];
const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function dadosParticipanteAgenda({ tipo, empresa, nome, nomeLegado = '' }) {
  if (tipo === 'empresa') {
    if (empresa?.id && empresa?.nome) return { participante_tipo: 'empresa', participante_nome: empresa.nome.trim(), empresa_id: empresa.id, empresa: empresa.nome.trim() };
    // Edição de reunião antiga: mantém o texto existente até alguém definir o vínculo.
    if (nomeLegado) return { participante_tipo: null, participante_nome: null, empresa_id: null, empresa: nomeLegado };
    throw new Error('Selecione uma empresa cadastrada.');
  }
  if (!['cliente_novo', 'parceiro'].includes(tipo)) throw new Error('Escolha o tipo de participante.');
  const nomeFinal = String(nome || '').trim();
  if (!nomeFinal) throw new Error('Informe o nome do cliente ou parceiro.');
  if (nomeFinal.length > 200) throw new Error('O nome deve ter até 200 caracteres.');
  return { participante_tipo: tipo, participante_nome: nomeFinal, empresa_id: null, empresa: '' };
}

export const nomeParticipanteAgenda = (evento) => evento?.participante_nome || evento?.empresa || '';

/** Mais reuniões não canceladas primeiro. Empates preservam a ordem do catálogo. */
export function ordenarDepartamentosAgenda(departamentos, eventos) {
  const uso = new Map();
  const vistos = new Set();
  for (const evento of eventos || []) {
    if (!evento?.id || vistos.has(evento.id) || evento.status === 'cancelada' || evento.is_mock || evento.chamado_id || evento.origem === 'fila_demandas') continue;
    vistos.add(evento.id);
    const departamento = normalizar(evento.departamento);
    uso.set(departamento, (uso.get(departamento) || 0) + 1);
  }
  return [...departamentos].sort((a, b) => (uso.get(normalizar(b)) || 0) - (uso.get(normalizar(a)) || 0));
}
