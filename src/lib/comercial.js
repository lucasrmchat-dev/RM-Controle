const normalizar = (valor) =>
  String(valor || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
export const CONFIG_COMERCIAL_PADRAO = { departamentos: [], pipelines: [] };
export const DESFECHOS_COMERCIAIS = [
  { id: 'ganho', nome: 'Ganho' },
  { id: 'perda', nome: 'Perda' },
];

export function validarConfigComercial(valor) {
  if (
    !valor ||
    typeof valor !== 'object' ||
    !Array.isArray(valor.departamentos) ||
    !Array.isArray(valor.pipelines)
  )
    throw new Error('Configuração comercial inválida.');
  if (valor.departamentos.length > 100 || valor.pipelines.length > 100)
    throw new Error('Limite de 100 departamentos e pipelines por configuração.');
  const departamentos = [
    ...new Set(valor.departamentos.map((d) => String(d).trim()).filter(Boolean)),
  ];
  if (departamentos.some((d) => d.length > 60))
    throw new Error('Nome de departamento muito longo.');
  const ids = new Set();
  const pipelines = valor.pipelines.map((p) => {
    const id = String(p.id || '');
    const nome = String(p.nome || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id) || !nome || nome.length > 80)
      throw new Error('Cada pipeline precisa de nome e identificador únicos.');
    ids.add(id);
    if (!Array.isArray(p.etapas) || !p.etapas.length || p.etapas.length > 100)
      throw new Error('Inclua pelo menos uma etapa antes de Ganho e Perda.');
    const etapasIds = new Set();
    const etapas = p.etapas.map((e) => {
      const eid = String(e.id || '');
      const enome = String(e.nome || '').trim();
      if (
        !/^[a-zA-Z0-9_-]{1,80}$/.test(eid) ||
        ['ganho', 'perda'].includes(eid) ||
        etapasIds.has(eid) ||
        !enome ||
        enome.length > 80 ||
        ['ganho', 'perda'].includes(normalizar(enome))
      )
        throw new Error('Etapas inválidas. Ganho e Perda são desfechos fixos.');
      etapasIds.add(eid);
      return { id: eid, nome: enome };
    });
    return { id, nome, etapas };
  });
  return { departamentos, pipelines };
}

/** Sem inferir departamentos a partir do nome: apenas os escolhidos pelo administrador. */
export function resumoComercial(
  eventos,
  { mes, departamento = '__todos__', departamentos = [], responsavel = '__todos__' } = {},
) {
  const elegiveis = new Set(departamentos.map(normalizar));
  const vistos = new Set();
  const reunioes = (eventos || []).filter((e) => {
    if (e.chamado_id || e.origem === 'fila_demandas' || e.is_mock) return false;
    if (e.id && vistos.has(e.id)) return false;
    if (e.id) vistos.add(e.id);
    if (mes && !String(e.data || '').startsWith(`${mes}-`)) return false;
    const dep = normalizar(e.departamento);
    if (!elegiveis.has(dep)) return false;
    if (departamento !== '__todos__' && dep !== normalizar(departamento)) return false;
    return (
      responsavel === '__todos__' ||
      normalizar(e.responsavel_email) === normalizar(responsavel === '__sem__' ? '' : responsavel)
    );
  });
  const pessoas = new Map();
  const totais = { agendada: 0, concluida: 0, cancelada: 0 };
  reunioes.forEach((e) => {
    const email = normalizar(e.responsavel_email);
    if (!pessoas.has(email))
      pessoas.set(email, {
        email,
        nome: email ? e.responsavel_nome || email : 'Sem responsável',
        agendada: 0,
        concluida: 0,
        cancelada: 0,
      });
    const status = e.status || 'agendada';
    if (Object.hasOwn(totais, status)) {
      totais[status] += 1;
      pessoas.get(email)[status] += 1;
    }
  });
  return {
    reunioes,
    totais,
    pessoas: [...pessoas.values()].sort(
      (a, b) => b.concluida - a.concluida || a.nome.localeCompare(b.nome, 'pt-BR'),
    ),
  };
}

// A reunião é o cartão de acompanhamento. Concluir uma reunião não significa ganhar a venda.
export function posicaoComercial(evento, config) {
  const pipeline =
    config.pipelines.find((p) => p.id === evento.comercial_pipeline_id) ||
    (!evento.comercial_pipeline_id ? config.pipelines[0] : null);
  if (!pipeline) return null;
  const etapaId = evento.comercial_etapa_id || pipeline.etapas[0]?.id;
  const etapa = [...pipeline.etapas, ...DESFECHOS_COMERCIAIS].find((e) => e.id === etapaId);
  return etapa
    ? { pipelineId: pipeline.id, etapaId: etapa.id }
    : { pipelineId: pipeline.id, etapaId: '__removida__' };
}
