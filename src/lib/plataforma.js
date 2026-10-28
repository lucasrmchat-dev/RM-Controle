/**
 * Painel da plataforma: empresas assinantes, revendas, contratos e limites dos planos.
 * Regras puras, usadas no navegador e no servidor; testadas em tests/plataforma.test.js.
 *
 * Hierarquia: Plataforma (dono do RM Controle) → Revendas → Assinantes → Clientes de cada assinante.
 */

export const RECURSOS_LIMITE = [
  { id: 'usuarios', rotulo: 'Usuários', descricao: 'Pessoas da equipe com acesso ativo' },
  { id: 'empresas', rotulo: 'Empresas clientes', descricao: 'Clientes cadastrados pela assinante' },
  { id: 'numeros_whatsapp', rotulo: 'Números de WhatsApp', descricao: 'Canais conectados' },
  { id: 'assinantes', rotulo: 'Assinantes', descricao: 'Empresas que a revenda pode criar', so: 'revenda' },
];

/**
 * Módulos que a empresa contratou (limites.modulos). Sem a lista, tem todos (empresas antigas).
 * Os perfis de acesso escolhem, dentro destes, o que cada pessoa vê. Configurações sempre ficam.
 */
export const MODULOS_CONTRATAVEIS = [
  { id: 'chat', rotulo: 'Chat do WhatsApp' },
  { id: 'conexoes', rotulo: 'Canais (números de WhatsApp)' },
  { id: 'fluxos', rotulo: 'Fluxo Inteligente' },
  { id: 'fila', rotulo: 'Demandas' },
  { id: 'empresas', rotulo: 'Empresas clientes' },
  { id: 'feedbacks', rotulo: 'Feedbacks' },
  { id: 'agenda', rotulo: 'Agenda' },
  { id: 'daily', rotulo: 'Daily' },
  { id: 'comercial', rotulo: 'Comercial' },
  { id: 'dashboard', rotulo: 'Dashboard' },
];
const IDS_CONTRATAVEIS = MODULOS_CONTRATAVEIS.map((m) => m.id);

/** A empresa contratou o módulo? (plataforma e empresas sem lista: tudo) */
export function moduloContratado(org, modulo) {
  if (!org || org.tipo === 'plataforma') return true;
  const lista = org.limites?.modulos;
  if (!Array.isArray(lista) || !IDS_CONTRATAVEIS.includes(modulo)) return true;
  return lista.includes(modulo);
}

/** Lista de módulos da empresa para aplicar nas permissões (null = sem restrição). */
export function modulosDaEmpresa(org) {
  if (!org || org.tipo === 'plataforma' || !Array.isArray(org.limites?.modulos)) return null;
  return org.limites.modulos;
}

export const STATUS_ORGANIZACAO = {
  ativa: { rotulo: 'Ativa' },
  suspensa: { rotulo: 'Suspensa', descricao: 'Ninguém da empresa entra até ser reativada. Os dados ficam guardados.' },
  cancelada: { rotulo: 'Cancelada', descricao: 'Contrato encerrado. Os dados ficam guardados e podem ser reativados.' },
};

export const STATUS_CONTRATO = {
  ativo: 'Ativo',
  em_atraso: 'Em atraso',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
};

export const STATUS_CONTRATO_CLIENTE = {
  ativo: 'Ativo',
  em_negociacao: 'Em negociação',
  em_atraso: 'Em atraso',
  encerrado: 'Encerrado',
};

const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) ? String(v) : null);

/** Limites do plano: número inteiro ≥ 0; vazio = sem limite. "assinantes" só vale para revendas. */
export function validarLimites(valor, tipo) {
  const limites = {};
  for (const r of RECURSOS_LIMITE) {
    if (r.so && r.so !== tipo) continue;
    const bruto = valor?.[r.id];
    if (bruto === null || bruto === undefined || bruto === '') continue;
    const n = Number(bruto);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error(`Limite de ${r.rotulo.toLowerCase()} inválido.`);
    limites[r.id] = n;
  }
  // Módulos contratados: só ids conhecidos; ausente = todos
  if (Array.isArray(valor?.modulos)) limites.modulos = [...new Set(valor.modulos.filter((m) => IDS_CONTRATAVEIS.includes(m)))];
  return limites;
}

/** Dados de uma nova empresa assinante ou revenda. */
export function validarOrganizacao(valor, { exigirTipo = true } = {}) {
  const nome = texto(valor?.nome, 120);
  if (nome.length < 2) throw new Error('Informe o nome da empresa.');
  const tipo = valor?.tipo;
  if (exigirTipo && !['revenda', 'assinante'].includes(tipo)) throw new Error('Escolha se é uma revenda ou uma empresa assinante.');
  const email = texto(valor?.contato_email, 160).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail de contato inválido.');
  return {
    nome,
    ...(exigirTipo ? { tipo } : {}),
    documento: texto(valor?.documento, 30) || null,
    contato_nome: texto(valor?.contato_nome, 120) || null,
    contato_email: email || null,
    contato_telefone: texto(valor?.contato_telefone, 30) || null,
  };
}

/** Contrato entre organizações (plataforma/revenda → cliente) ou entre a assinante e um cliente dela. */
export function validarContrato(valor, { statusPermitidos = Object.keys(STATUS_CONTRATO) } = {}) {
  const plano = texto(valor?.plano, 80);
  if (!plano) throw new Error('Informe o nome do plano.');
  const valorMensal = Number(String(valor?.valor_mensal ?? 0).replace(',', '.'));
  if (!Number.isFinite(valorMensal) || valorMensal < 0 || valorMensal > 10000000) throw new Error('Valor mensal inválido.');
  const dia = valor?.dia_vencimento === '' || valor?.dia_vencimento == null ? null : Number(valor.dia_vencimento);
  if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 28)) throw new Error('O dia de vencimento vai de 1 a 28.');
  const inicio = dataIso(valor?.inicio) || new Date().toISOString().slice(0, 10);
  const fim = valor?.fim ? dataIso(valor.fim) : null;
  if (valor?.fim && !fim) throw new Error('Data de término inválida.');
  if (fim && fim < inicio) throw new Error('O término precisa ser depois do início.');
  const status = statusPermitidos.includes(valor?.status) ? valor.status : 'ativo';
  return {
    plano,
    valor_mensal: Math.round(valorMensal * 100) / 100,
    dia_vencimento: dia,
    inicio,
    fim,
    status,
    observacoes: texto(valor?.observacoes, 1000) || null,
  };
}

/** Contrato do cliente da assinante (campo "renovacao" em vez de "fim"). */
export function validarContratoCliente(valor) {
  const c = validarContrato({ ...valor, fim: valor?.renovacao }, { statusPermitidos: Object.keys(STATUS_CONTRATO_CLIENTE) });
  const { fim, ...resto } = c;
  return { ...resto, renovacao: fim };
}

/** Uso x limite, para barras de consumo do plano. */
export function consumo(uso = {}, limites = {}) {
  return RECURSOS_LIMITE.filter((r) => uso[r.id] !== undefined || limites[r.id] !== undefined).map((r) => {
    const usado = Number(uso[r.id] || 0);
    const limite = limites[r.id] ?? null;
    return { ...r, usado, limite, fracao: limite ? Math.min(1, usado / limite) : 0, esgotado: limite !== null && usado >= limite };
  });
}

export const formatarMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
