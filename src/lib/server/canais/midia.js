/**
 * Arquivos do Chat (fotos, áudios, vídeos, documentos) no Supabase Storage.
 * Pasta privada "chat-midia", separada por empresa: <empresa>/<conversa>/<mensagem>.<ext>.
 * O navegador nunca acessa a pasta direto: o servidor confere a permissão e devolve um link temporário.
 */
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';

export const PASTA = 'chat-midia';
/** Limite por arquivo recebido (o WhatsApp aceita até 100 MB; no plano gratuito guardamos até 16 MB). */
export const LIMITE_RECEBIDO = 16 * 1024 * 1024;
/** Limite de envio pela tela (a Vercel recusa corpos acima de ~4,5 MB). */
export const LIMITE_ENVIO = 4 * 1024 * 1024;

const EXTENSOES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};
export const mimeBase = (mime) => String(mime || '').split(';')[0].trim().toLowerCase();
export const extensaoDe = (mime, nome) => EXTENSOES[mimeBase(mime)] || String(nome || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';

/**
 * Tipo de mensagem de um arquivo enviado pela equipe. Só formatos comuns; nada que o navegador execute
 * (HTML, SVG, scripts, executáveis).
 */
export function tipoDoArquivo(mime) {
  const m = mimeBase(mime);
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(m)) return 'imagem';
  if (m.startsWith('audio/') && EXTENSOES[m]) return 'audio';
  if (['video/mp4', 'video/3gpp', 'video/quicktime'].includes(m)) return 'video';
  if (EXTENSOES[m]) return 'documento';
  return null;
}

const nomeSeguro = (nome) => String(nome || '').replace(/[\u0000-\u001f\\/:*?"<>|]/g, '').trim().slice(0, 120);

let pastaPronta = false;
async function garantirPasta(storage) {
  if (pastaPronta) return;
  const { data } = await storage.getBucket(PASTA);
  if (!data) await storage.createBucket(PASTA, { public: false, fileSizeLimit: LIMITE_RECEBIDO });
  pastaPronta = true;
}

/** Guarda o arquivo e devolve os dados que ficam em mensagens.midia. */
export async function guardarArquivo({ organizacaoId, conversaId, mensagemId, dados, mime, nome }) {
  const admin = getSupabaseAdmin();
  if (!admin?.storage) throw new Error('Armazenamento de arquivos indisponível.');
  await garantirPasta(admin.storage);
  const caminho = `${organizacaoId || 'legado'}/${conversaId}/${mensagemId}.${extensaoDe(mime, nome)}`;
  const { error } = await admin.storage.from(PASTA).upload(caminho, dados, { contentType: mimeBase(mime) || 'application/octet-stream', upsert: true });
  if (error) throw new Error(`Não foi possível guardar o arquivo: ${error.message}`);
  return { caminho, mime: mimeBase(mime), tamanho: dados.length ?? dados.byteLength, ...(nome ? { nome: nomeSeguro(nome) } : {}) };
}

/** Link temporário (5 minutos) para abrir ou baixar o arquivo. */
export async function linkTemporario(caminho, { baixar = null } = {}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(PASTA).createSignedUrl(caminho, 300, baixar ? { download: nomeSeguro(baixar) || true } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Apaga todos os arquivos guardados de uma conversa (ao excluir a conversa). */
export async function apagarArquivosDaConversa(organizacaoId, conversaId) {
  const admin = getSupabaseAdmin();
  if (!admin?.storage?.from) return;
  const pasta = `${organizacaoId || 'legado'}/${conversaId}`;
  const { data } = await admin.storage.from(PASTA).list(pasta, { limit: 1000 }).then((r) => r, () => ({ data: [] }));
  const caminhos = (data || []).map((f) => `${pasta}/${f.name}`);
  if (caminhos.length) await admin.storage.from(PASTA).remove(caminhos).then(() => {}, () => {});
}

/** Links temporários de vários arquivos numa chamada só ao Storage. */
export async function linksTemporarios(caminhos, segundos = 3600) {
  if (!caminhos.length) return {};
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(PASTA).createSignedUrls(caminhos, segundos);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
}
