import { DESFECHOS_COMERCIAIS } from './comercial';
export const CAMPOS_WEBHOOK = [
  'ticket.lastMessage',
  'ticket.status',
  'ticket.queueId',
  'ticket.userId',
  'ticket.closingReasonId',
  'ticket.contact.leadStatusId',
  'ticket.channel',
  'event',
];
export const normalizarTermo = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
const caminhoValido = (p) =>
  typeof p === 'string' &&
  p.length <= 160 &&
  p.split('.').length <= 8 &&
  p
    .split('.')
    .every(
      (s) => /^[a-zA-Z0-9_]+$/.test(s) && !['__proto__', 'constructor', 'prototype'].includes(s),
    );
export function lerVariavel(objeto, caminho) {
  if (!caminhoValido(caminho)) return undefined;
  return caminho
    .split('.')
    .reduce(
      (o, k) => (o && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined),
      objeto,
    );
}
export function correspondeCondicao(payload, c) {
  const valor = lerVariavel(payload, c.campo);
  if (valor === undefined || valor === null || typeof valor === 'object') return false;
  const texto = normalizarTermo(valor);
  const resultados = c.valores.map((v) =>
    c.operador === 'igual' ? texto === normalizarTermo(v) : texto.includes(normalizarTermo(v)),
  );
  return c.combinacao === 'todos' ? resultados.every(Boolean) : resultados.some(Boolean);
}
export function etapaPorRegras(payload, regras) {
  return (
    regras.find((r) =>
      r.modo === 'qualquer'
        ? r.condicoes.some((c) => correspondeCondicao(payload, c))
        : r.condicoes.every((c) => correspondeCondicao(payload, c)),
    )?.etapa_id || null
  );
}
export function validarIntegracaoComercial(body, config) {
  const nome = String(body.nome || '').trim();
  const pipeline = config.pipelines.find((p) => p.id === body.pipeline_id);
  const departamento = config.departamentos.find((d) => d === body.departamento);
  const etapas = [...(pipeline?.etapas || []), ...DESFECHOS_COMERCIAIS];
  if (!nome || nome.length > 80) throw new Error('Informe um nome para a integração.');
  if (!pipeline || !departamento || !pipeline.etapas.some((e) => e.id === body.etapa_inicial_id))
    throw new Error('Selecione departamento, pipeline e etapa inicial válidos.');
  if (!Array.isArray(body.regras) || body.regras.length > 100)
    throw new Error('Use até 100 regras por integração.');
  const regras = body.regras.map((r) => {
    if (
      !etapas.some((e) => e.id === r.etapa_id) ||
      !['todas', 'qualquer'].includes(r.modo) ||
      !Array.isArray(r.condicoes) ||
      !r.condicoes.length ||
      r.condicoes.length > 20
    )
      throw new Error('Confira a etapa e as condições das regras.');
    const condicoes = r.condicoes.map((c) => {
      if (
        !caminhoValido(c.campo) ||
        !['igual', 'contem'].includes(c.operador) ||
        !['qualquer', 'todos'].includes(c.combinacao) ||
        !Array.isArray(c.valores) ||
        !c.valores.length ||
        c.valores.length > 100 ||
        c.valores.some((v) => typeof v !== 'string' || v.length > 300) ||
        !c.valores.some((v) => v.trim())
      )
        throw new Error('Cada condição precisa de uma variável, um operador e termos válidos.');
      return {
        campo: c.campo,
        operador: c.operador,
        combinacao: c.combinacao,
        valores: [...new Set(c.valores.map((v) => v.trim()).filter(Boolean))],
      };
    });
    return {
      nome: String(r.nome || '')
        .trim()
        .slice(0, 80),
      etapa_id: r.etapa_id,
      modo: r.modo,
      condicoes,
    };
  });
  return {
    nome,
    // Compatibilidade com bancos já migrados; não é uma configuração do usuário.
    tenant_id: '',
    pipeline_id: pipeline.id,
    departamento,
    etapa_inicial_id: body.etapa_inicial_id,
    ativo: body.ativo === true,
    regras,
  };
}
export function normalizarTicketRM(payload) {
  const t = payload?.ticket;
  if (
    !t ||
    !['string', 'number'].includes(typeof t.id) ||
    !String(t.id).trim() ||
    String(t.id).length > 100
  )
    throw new Error('Envie ticket.id no payload do RM Chat.');
  // A autenticação pertence à integração (URL + token). O identificador da origem,
  // quando vier no próprio JSON, apenas evita colisões entre tickets; não é obrigatório.
  const origem = payload.tenantId ?? t.tenantId;
  if (
    payload.tenantId != null &&
    t.tenantId != null &&
    String(payload.tenantId) !== String(t.tenantId)
  ) {
    throw new Error('O payload contém identificadores de origem inconsistentes.');
  }
  if (origem != null && !/^[a-zA-Z0-9_-]{1,80}$/.test(String(origem))) {
    throw new Error('O identificador de origem do payload é inválido.');
  }
  const data = new Date(t.updatedAt);
  if (!t.updatedAt || !Number.isFinite(data.getTime()) || data.getTime() > Date.now() + 300000)
    throw new Error('Envie ticket.updatedAt válido para ordenar as atualizações.');
  const nome = String(t.contact?.name || t.contact?.pushname || '')
    .trim()
    .slice(0, 200);
  if (!nome) throw new Error('Envie ticket.contact.name.');
  return {
    externo_id: origem == null ? String(t.id) : `${origem}:${t.id}`,
    ocorrido_em: data.toISOString(),
    nome,
    email: String(t.contact?.email || '')
      .trim()
      .slice(0, 254),
    telefone: String(t.contact?.number || '')
      .trim()
      .slice(0, 64),
    evento: String(payload.event || 'UpdateOnTicket').slice(0, 100),
  };
}
