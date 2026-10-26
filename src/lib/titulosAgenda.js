export const MODELO_TITULO_PADRAO = '{departamento} · Reunião com {cliente}';
const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function validarModelosTitulosAgenda(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Os modelos devem ser organizados por departamento.');
  const entradas = Object.entries(valor);
  if (entradas.length > 100) throw new Error('Configure até 100 departamentos.');
  const vistos = new Set();
  const modelos = [];
  for (const [departamento, texto] of entradas) {
    if (!departamento.trim() || departamento.trim().length > 60 || typeof texto !== 'string') throw new Error('Modelo de departamento inválido.');
    const modelo = texto.trim();
    if (!modelo) continue; // Vazio usa o título padrão.
    if (modelo.length > 200) throw new Error(`O modelo de ${departamento} deve ter até 200 caracteres.`);
    if (!modelo.includes('{cliente}')) throw new Error(`Inclua {cliente} no modelo de ${departamento}.`);
    if (/[{}]/.test(modelo.replace(/\{(cliente|departamento)\}/g, ''))) throw new Error('Use apenas as variáveis {cliente} e {departamento}.');
    const chave = normalizar(departamento);
    if (vistos.has(chave)) throw new Error('Há modelos repetidos para o mesmo departamento.');
    vistos.add(chave);
    modelos.push([departamento.trim(), modelo]);
  }
  return Object.fromEntries(modelos);
}

export function sugestaoTituloReuniao(departamento, cliente, modelos = {}) {
  if (!String(departamento || '').trim() || !String(cliente || '').trim()) return '';
  const encontrado = Object.entries(modelos).find(([nome]) => normalizar(nome) === normalizar(departamento));
  const modelo = encontrado?.[1] || MODELO_TITULO_PADRAO;
  return String(modelo).replace(/\{(cliente|departamento)\}/g, (_, variavel) => variavel === 'cliente' ? String(cliente).trim() : String(departamento).trim()).trim().slice(0, 200);
}

export function resolverTituloReuniao({ titulo, departamento, cliente, modelos }) {
  return String(titulo || '').trim() || sugestaoTituloReuniao(departamento, cliente, modelos);
}
