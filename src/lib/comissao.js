/**
 * Comissão comercial: as mesmas regras da planilha "Controle de atividade e comissão".
 *
 *  - Reunião marcada: agendada naquele dia (created_at), mesmo que aconteça outro dia.
 *  - Reunião feita: realizada (status "concluida") na data dela.
 *  - Venda: registrada em comercial_vendas (ao marcar Ganho ou à mão), com empresa, mensalidade e adicionais.
 *  - Comissão do dia = (marcadas ou feitas, conforme a regra) × valor por reunião + vendas × valor por venda.
 *  - Comparecimento = feitas ÷ marcadas · Conversão = vendas ÷ feitas · Ticket médio = contratos ÷ vendas.
 *
 * Cada vendedor pode ter regras próprias (valores diferentes); o resto usa a regra geral da empresa.
 */

export const REGRAS_PADRAO = { valor_reuniao: 25, pagar_por: 'marcada', valor_venda: 300, visibilidade: 'todos', por_vendedor: {} };

export const VISIBILIDADES = [
  { id: 'todos', rotulo: 'Todos veem tudo', descricao: 'Todos os vendedores veem as vendas e comissões da equipe.' },
  { id: 'escolha', rotulo: 'Cada vendedor escolhe', descricao: 'Por padrão todos veem; quem quiser pode esconder as próprias vendas dos outros vendedores.' },
  { id: 'proprias', rotulo: 'Cada um vê só as suas', descricao: 'Vendedores veem apenas as próprias vendas e comissões.' },
];

const dinheiro = (v, max = 1e7) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(max, n)) * 100) / 100 : 0;
};
const email = (e) => String(e || '').trim().toLowerCase();

/** Valida as regras (vindas da tela). Lança Error com mensagem para a pessoa. */
export function validarRegras(r = {}) {
  const pagar = (p) => (p === 'feita' ? 'feita' : 'marcada');
  const porVendedor = {};
  for (const [e, v] of Object.entries(r.por_vendedor || {}).slice(0, 300)) {
    const chave = email(e);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave) || !v || typeof v !== 'object') continue;
    const item = {};
    if (v.valor_reuniao !== undefined && v.valor_reuniao !== '' && v.valor_reuniao !== null) item.valor_reuniao = dinheiro(v.valor_reuniao, 1e5);
    if (v.valor_venda !== undefined && v.valor_venda !== '' && v.valor_venda !== null) item.valor_venda = dinheiro(v.valor_venda, 1e6);
    if (v.pagar_por) item.pagar_por = pagar(v.pagar_por);
    if (Object.keys(item).length) porVendedor[chave] = item;
  }
  return {
    valor_reuniao: dinheiro(r.valor_reuniao ?? REGRAS_PADRAO.valor_reuniao, 1e5),
    pagar_por: pagar(r.pagar_por ?? REGRAS_PADRAO.pagar_por),
    valor_venda: dinheiro(r.valor_venda ?? REGRAS_PADRAO.valor_venda, 1e6),
    visibilidade: VISIBILIDADES.some((v) => v.id === r.visibilidade) ? r.visibilidade : REGRAS_PADRAO.visibilidade,
    por_vendedor: porVendedor,
  };
}

export const regrasDoVendedor = (regras, vendedor) => ({ ...regras, ...(regras?.por_vendedor?.[email(vendedor)] || {}) });

/** Valida uma venda vinda da tela. */
export function validarVenda(v = {}) {
  const empresa = String(v.empresa || '').trim().slice(0, 160);
  if (!empresa) throw new Error('Informe a empresa (cliente) da venda.');
  const data = String(v.data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data da venda.');
  const vendedor = email(v.vendedor_email);
  if (!vendedor) throw new Error('Escolha o vendedor.');
  return {
    empresa,
    contato: String(v.contato || '').trim().slice(0, 160) || null,
    data,
    vendedor_email: vendedor,
    mensalidade: dinheiro(v.mensalidade),
    adicionais: dinheiro(v.adicionais),
    observacoes: String(v.observacoes || '').trim().slice(0, 1000) || null,
    origem_tipo: ['reuniao', 'lead'].includes(v.origem_tipo) ? v.origem_tipo : 'avulsa',
    origem_id: v.origem_id ? String(v.origem_id).slice(0, 80) : null,
  };
}

// ------------------------------------------------------------------------------
// Datas (no fuso do Brasil)
// ------------------------------------------------------------------------------
const FUSO = 'America/Sao_Paulo';
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
/** "2026-10-28T02:30:00Z" → "2026-10-27" (dia no Brasil). Datas "YYYY-MM-DD" ficam como estão. */
export function diaLocal(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : formatoDia.format(d);
}
export function diasDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const total = new Date(a, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
}
const SEMANA = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
export const diaDaSemana = (iso) => SEMANA[new Date(`${iso}T12:00:00`).getDay()];

/** Nome de quem participou da reunião (cliente), como na planilha. */
export const nomeDaReuniao = (e) => String(e.participante_nome || (e.empresa && e.empresa !== 'Cliente Geral' ? e.empresa : '') || e.titulo || 'Reunião').trim();

// ------------------------------------------------------------------------------
// Cálculo
// ------------------------------------------------------------------------------
const doVendedor = (alvo) => (x) => !alvo || email(x) === email(alvo);
const taxa = (a, b) => (b ? a / b : 0);

/**
 * Mês de um vendedor (ou de todos, se vendedor = null): dia a dia como na planilha.
 * eventos: reuniões (com created_at, data, status, responsavel_email, participante_nome...)
 * vendas: linhas de comercial_vendas
 */
export function calcularMes({ mes, vendedor = null, eventos = [], vendas = [], regras = REGRAS_PADRAO }) {
  const dias = new Map(
    diasDoMes(mes).map((d) => [d, { data: d, dia: diaDaSemana(d), marcadas: [], feitas: [], vendas: [], mensalidade: 0, adicionais: 0, total: 0, comissao: 0 }])
  );
  const deste = doVendedor(vendedor);
  for (const e of eventos) {
    // Cancelada continua contando como marcada (o comparecimento mostra quem faltou); inválidas se excluem
    if (!deste(e.responsavel_email)) continue;
    const criada = diaLocal(e.created_at);
    if (dias.has(criada)) dias.get(criada).marcadas.push({ id: e.id, nome: nomeDaReuniao(e), vendedor: email(e.responsavel_email) });
    if (e.status === 'concluida' && dias.has(String(e.data || '').slice(0, 10))) dias.get(String(e.data).slice(0, 10)).feitas.push({ id: e.id, nome: nomeDaReuniao(e), vendedor: email(e.responsavel_email) });
  }
  for (const v of vendas) {
    if (!deste(v.vendedor_email)) continue;
    const d = dias.get(String(v.data || '').slice(0, 10));
    if (!d) continue;
    d.vendas.push(v);
    d.mensalidade += Number(v.mensalidade) || 0;
    d.adicionais += Number(v.adicionais) || 0;
  }
  // Comissão: cada item paga pela regra do vendedor dele (equipe com valores diferentes)
  for (const d of dias.values()) {
    d.total = d.mensalidade + d.adicionais;
    const reunioesPagas = (lista, pagar) => lista.filter((r) => regrasDoVendedor(regras, r.vendedor).pagar_por === pagar);
    const valorReunioes = [...reunioesPagas(d.marcadas, 'marcada'), ...reunioesPagas(d.feitas, 'feita')].reduce((s, r) => s + regrasDoVendedor(regras, r.vendedor).valor_reuniao, 0);
    const valorVendas = d.vendas.reduce((s, v) => s + regrasDoVendedor(regras, v.vendedor_email).valor_venda, 0);
    d.comissao = Math.round((valorReunioes + valorVendas) * 100) / 100;
  }
  const lista = [...dias.values()];
  const soma = (f) => lista.reduce((s, d) => s + f(d), 0);
  const totais = {
    marcadas: soma((d) => d.marcadas.length),
    feitas: soma((d) => d.feitas.length),
    vendas: soma((d) => d.vendas.length),
    mensalidade: soma((d) => d.mensalidade),
    adicionais: soma((d) => d.adicionais),
    contratos: soma((d) => d.total),
    comissao: Math.round(soma((d) => d.comissao) * 100) / 100,
  };
  return {
    mes,
    dias: lista,
    totais,
    taxas: { comparecimento: taxa(totais.feitas, totais.marcadas), conversao: taxa(totais.vendas, totais.feitas), ticket: taxa(totais.contratos, totais.vendas) },
    vendas: lista.flatMap((d) => d.vendas).sort((a, b) => String(a.data).localeCompare(String(b.data))),
  };
}

/** Totais do mês de cada vendedor (ranking da equipe). */
export function porVendedor({ mes, vendedores = [], eventos, vendas, regras }) {
  return vendedores
    .map((p) => ({ ...p, ...calcularMes({ mes, vendedor: p.email, eventos, vendas, regras }) }))
    .map(({ dias, vendas: v, ...resto }) => resto)
    .sort((a, b) => b.totais.comissao - a.totais.comissao || b.totais.vendas - a.totais.vendas || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

/** Os 12 meses do ano (resumo anual). */
export function calcularAno({ ano, vendedor = null, eventos, vendas, regras }) {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const r = calcularMes({ mes, vendedor, eventos, vendas, regras });
    return { mes, totais: r.totais, taxas: r.taxas };
  });
}

/**
 * Quem esta pessoa pode ver nas comissões e vendas.
 * Gestores (administrador ou perfil "Comercial: gestor") veem todos. Os demais seguem a visibilidade da empresa;
 * em "cada vendedor escolhe", quem marcou "não mostrar minhas vendas" fica de fora (menos para si mesmo).
 */
export function vendedoresVisiveis({ eu, gestor, regras, vendedores, privacidade = {} }) {
  if (gestor || regras.visibilidade === 'todos') return vendedores.map((v) => v.email);
  if (regras.visibilidade === 'proprias') return vendedores.filter((v) => v.email === email(eu)).map((v) => v.email);
  return vendedores.filter((v) => v.email === email(eu) || !privacidade[v.email]).map((v) => v.email);
}

export const formatarReal = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarPct = (v) => `${Math.round((Number(v) || 0) * 1000) / 10}%`.replace('.', ',');
