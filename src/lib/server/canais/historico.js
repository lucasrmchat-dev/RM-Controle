/**
 * Histórico de cada canal (tabela auditoria_logs, imutável): criado, editado, conectado, desconectado,
 * reiniciado, ativado, desativado, mescla com canal antigo. E a limpeza dos canais inativos há muito tempo.
 */
import { provedorDo, segredosDo } from './index';

export const ACOES_HISTORICO_CANAL = ['canal_criou', 'canal_editou', 'canal_conectou', 'canal_desconectou', 'canal_reiniciou', 'canal_ativou', 'canal_desativou', 'canal_mesclou'];
export const CHAVE_LIMPEZA_CANAIS = 'canais_inativos';
export const OPCOES_LIMPEZA = [0, 30, 60, 90];
export const LIMPEZA_PADRAO = 60;

export async function registrarHistoricoCanal(db, quem, canalId, acao, extra = {}) {
  await db
    .from('auditoria_logs')
    .insert([{ usuario_email: quem.email, usuario_nome: quem.nome || quem.email, operador_nome: quem.nome || quem.email, acao, detalhes: { modulo: 'Canais', canal_id: canalId, ...extra } }])
    .then(
      () => {},
      () => {}
    );
}

export async function historicoDoCanal(db, canalId) {
  const { data } = await db
    .from('auditoria_logs')
    .select('*')
    .eq('detalhes->>canal_id', canalId)
    .in('acao', ACOES_HISTORICO_CANAL)
    .order('created_at', { ascending: false })
    .limit(200)
    .then((r) => r, () => ({ data: [] }));
  return (data || []).map((l) => ({ id: l.id, acao: l.acao, quem: l.usuario_nome || l.usuario_email, em: l.created_at, detalhes: l.detalhes || {} }));
}

/** Dias que um canal pode ficar inativo antes de sair da lista (0 = nunca). */
export async function diasLimpezaCanais(db) {
  const { data } = await db.from('sistema_config').select('valor').eq('chave', CHAVE_LIMPEZA_CANAIS).maybeSingle();
  const dias = Number(data?.valor?.dias);
  return OPCOES_LIMPEZA.includes(dias) ? dias : LIMPEZA_PADRAO;
}

/**
 * Canais inativos há mais de `dias`: sem conversas, o canal é excluído; com conversas, fica arquivado
 * (some da lista, mas as conversas e o histórico continuam guardados e abrindo normalmente).
 */
export async function limparCanaisInativos(db, dias) {
  if (!dias) return { excluidos: 0, arquivados: 0 };
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  const { data: inativos } = await db.from('canais').select('*').eq('ativo', false);
  let excluidos = 0;
  let arquivados = 0;
  for (const canal of inativos || []) {
    if (canal.config?.arquivado) continue;
    const desde = new Date(canal.config?.desativado_em || canal.atualizado_em || canal.criado_em || Date.now()).getTime();
    if (desde > limite) continue;
    const { count } = await db.from('conversas').select('id', { count: 'exact', head: true }).eq('canal_id', canal.id);
    if (count > 0) {
      await db.from('canais').update({ config: { ...(canal.config || {}), arquivado: true, arquivado_em: new Date().toISOString() } }).eq('id', canal.id);
      arquivados += 1;
    } else {
      await provedorDo(canal).remover?.(canal, segredosDo(canal)).catch(() => {});
      const { error } = await db.from('canais').delete().eq('id', canal.id);
      if (!error) excluidos += 1;
    }
  }
  return { excluidos, arquivados };
}
