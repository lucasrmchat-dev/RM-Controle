/**
 * Daily (ticket #21): reuniões diárias da equipe e metas da semana. Regras puras (navegador e servidor).
 */
const texto = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
export const dataIsoValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime());

/** Segunda-feira da semana de uma data (YYYY-MM-DD). */
export function semanaDe(dataIso) {
  const d = new Date(`${dataIsoValida(dataIso) ? dataIso : new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dia - 1));
  return d.toISOString().slice(0, 10);
}

export function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Campos de uma reunião vindos da tela. */
export function validarReuniao(valor, { parcial = false } = {}) {
  const r = {};
  if (!parcial || valor?.data !== undefined) {
    if (!dataIsoValida(valor?.data)) throw new Error('Data da daily inválida.');
    r.data = valor.data;
  }
  if (!parcial || valor?.titulo !== undefined) r.titulo = texto(valor?.titulo, 120) || 'Daily';
  if (valor?.resumo !== undefined) r.resumo = texto(valor.resumo, 20000) || null;
  if (valor?.atualizacoes_clickmassa !== undefined) r.atualizacoes_clickmassa = texto(valor.atualizacoes_clickmassa, 20000) || null;
  if (valor?.participantes !== undefined) r.participantes = [...new Set((Array.isArray(valor.participantes) ? valor.participantes : []).map((p) => texto(p, 160).toLowerCase()).filter(Boolean))].slice(0, 100);
  return r;
}

/** Campos de uma meta da semana. */
export function validarMeta(valor, { parcial = false } = {}) {
  const m = {};
  if (!parcial || valor?.texto !== undefined) {
    const t = texto(valor?.texto, 500);
    if (t.length < 2) throw new Error('Descreva a meta.');
    m.texto = t;
  }
  if (!parcial || valor?.semana !== undefined) m.semana = semanaDe(valor?.semana);
  if (valor?.responsavel_email !== undefined) m.responsavel_email = texto(valor.responsavel_email, 160).toLowerCase() || null;
  return m;
}

/** Progresso das metas: { feitas, total, fracao } */
export function progressoMetas(metas = []) {
  const total = metas.length;
  const feitas = metas.filter((m) => m.concluida_em).length;
  return { feitas, total, fracao: total ? feitas / total : 0 };
}
