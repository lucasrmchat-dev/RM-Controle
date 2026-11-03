import { TIPOS_ETIQUETA, etiquetaCadastrada, etiquetasEmUso } from '@/lib/etiquetas';

/**
 * Etiquetas cadastradas da empresa (db já com o escopo da empresa). Na primeira leitura, a lista
 * nasce com as etiquetas que já estavam em uso, para nada se perder.
 */
export async function etiquetasDaEmpresa(db, tipo) {
  const { chave } = TIPOS_ETIQUETA[tipo];
  const { data, error } = await db
    .from('sistema_config')
    .select('valor')
    .eq('chave', chave)
    .maybeSingle();
  if (error) throw new Error('Não foi possível ler as etiquetas.');
  if (Array.isArray(data?.valor)) return data.valor;
  const fonte =
    tipo === 'chat'
      ? db.from('contatos').select('etiquetas').not('etiquetas', 'is', null)
      : db.from('suporte_chamados').select('etiquetas').not('etiquetas', 'is', null);
  const { data: linhas } = await fonte.limit(5000).then(
    (r) => r,
    () => ({ data: [] }),
  );
  const lista = etiquetasEmUso(linhas || []);
  await db
    .from('sistema_config')
    .upsert({ chave, valor: lista, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  return lista;
}

/**
 * Confere uma nova lista de etiquetas de um contato/grupo: as que ele já tinha continuam valendo
 * (mesmo que tenham saído do cadastro); as novas precisam estar cadastradas.
 * Devolve { lista } ou { erro } com o nome da que não está cadastrada.
 */
export function conferirEtiquetasNovas(cadastradas, atuais, novas) {
  const lista = [];
  for (const bruta of novas) {
    const nome = String(bruta || '')
      .trim()
      .slice(0, 30);
    if (!nome) continue;
    const antiga = (atuais || []).find((t) => t === nome);
    const valida = antiga || etiquetaCadastrada(cadastradas, nome);
    if (!valida)
      return {
        erro: `A etiqueta "${nome}" não está cadastrada. Cadastre em Configurações › Etiquetas.`,
      };
    if (!lista.includes(valida)) lista.push(valida);
  }
  return { lista: lista.slice(0, 20) };
}
