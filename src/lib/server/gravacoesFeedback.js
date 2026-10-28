/**
 * Gravações dos feedbacks (ticket #22): tela com áudio ou só áudio, guardadas na pasta privada
 * "feedback-gravacoes", separada por empresa: <empresa>/<feedback>/<id>.<ext>.
 * O navegador envia direto para o Storage com um link de envio de uso único que o servidor cria
 * (vídeos passam do limite de 4,5 MB da Vercel) e só vê os arquivos por links temporários.
 */
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';

export const PASTA_GRAVACOES = 'feedback-gravacoes';
export const LIMITE_GRAVACAO = 50 * 1024 * 1024;
export const MAX_GRAVACOES_POR_FEEDBACK = 5;
const FORMATOS = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' };
export const mimeGravacao = (mime) => String(mime || '').split(';')[0].trim().toLowerCase();
export const formatoAceito = (mime) => Boolean(FORMATOS[mimeGravacao(mime)]);

let pastaPronta = false;
async function garantirPasta(storage) {
  if (pastaPronta) return;
  const { data } = await storage.getBucket(PASTA_GRAVACOES);
  if (!data) await storage.createBucket(PASTA_GRAVACOES, { public: false, fileSizeLimit: LIMITE_GRAVACAO });
  pastaPronta = true;
}

const pastaDo = (organizacaoId, feedbackId) => `${organizacaoId || 'legado'}/${feedbackId}`;

/** Link de envio de uso único para uma gravação nova deste feedback. */
export async function linkDeEnvio({ organizacaoId, feedbackId, mime }) {
  const admin = getSupabaseAdmin();
  if (!admin?.storage) throw new Error('Armazenamento de arquivos indisponível.');
  await garantirPasta(admin.storage);
  const pasta = pastaDo(organizacaoId, feedbackId);
  const { data: existentes } = await admin.storage.from(PASTA_GRAVACOES).list(pasta, { limit: 100 }).then((r) => r, () => ({ data: [] }));
  if ((existentes || []).length >= MAX_GRAVACOES_POR_FEEDBACK) throw Object.assign(new Error(`Cada feedback aceita até ${MAX_GRAVACOES_POR_FEEDBACK} gravações.`), { status: 400 });
  const tipo = mimeGravacao(mime).startsWith('video/') ? 'tela' : 'audio';
  const caminho = `${pasta}/${Date.now()}-${tipo}-${crypto.randomUUID().slice(0, 8)}.${FORMATOS[mimeGravacao(mime)]}`;
  const { data, error } = await admin.storage.from(PASTA_GRAVACOES).createSignedUploadUrl(caminho);
  if (error) throw new Error(error.message);
  return { caminho, token: data.token, pasta: PASTA_GRAVACOES };
}

/** Gravações de um feedback, com links temporários (1 hora). */
export async function gravacoesDoFeedback({ organizacaoId, feedbackId }) {
  const admin = getSupabaseAdmin();
  if (!admin?.storage?.from) return [];
  const pasta = pastaDo(organizacaoId, feedbackId);
  const { data } = await admin.storage.from(PASTA_GRAVACOES).list(pasta, { limit: 100 }).then((r) => r, () => ({ data: [] }));
  const nomes = (data || []).map((f) => f.name).filter(Boolean).sort();
  if (!nomes.length) return [];
  const { data: links } = await admin.storage.from(PASTA_GRAVACOES).createSignedUrls(nomes.map((n) => `${pasta}/${n}`), 3600);
  return nomes.map((nome, i) => {
    const [quando, tipo] = nome.split('-');
    return { nome, tipo: tipo === 'tela' ? 'tela' : 'audio', em: Number(quando) ? new Date(Number(quando)).toISOString() : null, url: links?.[i]?.signedUrl || null };
  });
}
