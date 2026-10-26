const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const IGNORAR = new Set('para pela pelo pelas pelos como esse essa esses essas este esta estes estas isso isto aqui mais muito mesmo mesma quando onde sobre entre depois antes cliente relato problema precisa fazer feito fazer foi foram ficou esta estava estava estao sendo sera seja teve tinha tem temos nao sim uma umas uns com que por dos das aos suas seus seu sua sem ate pelo pela pois entao tambem atendimento suporte'.split(' '));
export const relatoDoAtendimento = (ch) => String(ch.observacao_inicial || '').trim();

/** Cada termo conta no máximo uma vez por atendimento; categorias são agrupadas pelo nome exato normalizado. */
export function analisarRecorrencias(chamados, { inicio, fim, busca = '', categoria = '' } = {}) {
  const q = normalizar(busca);
  const concluidos = (chamados || []).filter((c) => ['finalizado', 'concluido'].includes(c.status) && !c.is_lembrete);
  const vistos = new Set();
  const periodo = concluidos.filter((c) => {
    if (!c.id || vistos.has(c.id)) return false;
    vistos.add(c.id);
    const data = new Date(c.finalizado_em || c.created_at || c.iniciado_em);
    if (Number.isNaN(data.getTime())) return false;
    if (inicio && data < new Date(`${inicio}T00:00:00`)) return false;
    if (fim && data > new Date(`${fim}T23:59:59.999`)) return false;
    return true;
  });
  const categorias = new Map();
  periodo.forEach((c) => {
    const nome = String(c.motivo || 'Sem categoria').trim();
    const chave = normalizar(nome);
    if (!categorias.has(chave)) categorias.set(chave, { nome, total: 0 });
    categorias.get(chave).total += 1;
  });
  const filtrados = periodo.filter((c) => (!categoria || normalizar(c.motivo || 'Sem categoria') === normalizar(categoria)) && (!q || normalizar(relatoDoAtendimento(c)).includes(q)));
  const termos = new Map();
  filtrados.forEach((c) => {
    const palavras = new Set((normalizar(relatoDoAtendimento(c)).match(/[a-z][a-z0-9_-]{3,}/g) || []).filter((p) => !IGNORAR.has(p)));
    palavras.forEach((p) => termos.set(p, (termos.get(p) || 0) + 1));
  });
  return {
    totalPeriodo: periodo.length,
    semRelato: periodo.filter((c) => !relatoDoAtendimento(c)).length,
    categorias: [...categorias.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR')),
    termos: [...termos].map(([termo, total]) => ({ termo, total })).sort((a, b) => b.total - a.total || a.termo.localeCompare(b.termo)).slice(0, 16),
    atendimentos: filtrados.sort((a, b) => new Date(b.finalizado_em || b.created_at) - new Date(a.finalizado_em || a.created_at)),
  };
}
