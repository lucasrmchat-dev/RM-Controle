import { nomePeloEmail } from '@/lib/canais';

/** Nome de quem está agindo (para a mensagem mostrar quem respondeu). */
export async function getNomeEquipe(db, email) {
  const { data } = await db.from('equipe_usuarios').select('nome').eq('email', String(email || '').toLowerCase()).maybeSingle();
  return data?.nome || nomePeloEmail(email);
}
