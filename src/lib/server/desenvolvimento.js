/**
 * No servidor: a pessoa é da área de desenvolvimento? (mesma regra do navegador, lida do banco)
 * Administradores sempre; os demais pelo departamento marcado em Configurações › Feedbacks.
 */
import { permissoesEfetivas } from '@/lib/perfis';
import { ehDesenvolvimento, validarConfigFeedbacks } from '@/lib/feedbacks';
import { normalizarEmail } from '@/lib/roles';

export async function ehDesenvolvimentoServidor(db, email) {
  const alvo = normalizarEmail(email);
  const [equipe, perfis, config] = await Promise.all([
    db.from('equipe_usuarios').select('*'),
    db.from('perfis_acesso').select('*'),
    db.from('sistema_config').select('valor').eq('chave', 'feedbacks').maybeSingle(),
  ]);
  // Sem a tabela de perfis (migração não rodada) a regra segue pelo papel e departamentos
  const linhas = (equipe.data || []).map(({ senha, ...resto }) => resto);
  const perm = permissoesEfetivas({ email: alvo, equipe: linhas, perfis: perfis.data || [], adminsExtras: process.env.RM_ADMIN_EMAILS });
  const membro = linhas.find((u) => normalizarEmail(u.email) === alvo) || null;
  return ehDesenvolvimento(perm, membro, validarConfigFeedbacks(config.data?.valor || {}));
}
