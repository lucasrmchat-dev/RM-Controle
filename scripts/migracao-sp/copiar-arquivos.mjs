/**
 * Copia os arquivos do Chat (bucket "chat-midia") do RM Controle (Oregon) para o RM Controle SP.
 * As chaves chegam pelo migrar.sh, sem aparecer na tela. Arquivos que já existem no destino são pulados,
 * então dá para rodar de novo na hora da troca para trazer só o que chegou depois.
 */
import { createClient } from '@supabase/supabase-js';

const PASTA = 'chat-midia';
const LIMITE = 16 * 1024 * 1024;
const opcoes = { auth: { persistSession: false } };
const origem = createClient('https://lsjjlaiiftuenaqgvgvb.supabase.co', process.env.CHAVE_ORIGEM, opcoes);
const destino = createClient('https://wwkfsdibzmquqhjykooo.supabase.co', process.env.CHAVE_DESTINO, opcoes);

/** Todos os caminhos de arquivo do bucket, entrando nas subpastas. */
async function listarTudo(cliente, prefixo = '') {
  const caminhos = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await cliente.storage.from(PASTA).list(prefixo, { limit: 1000, offset });
    if (error) throw new Error(`Não foi possível listar "${prefixo || '/'}": ${error.message}`);
    for (const item of data) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      if (item.id === null) caminhos.push(...(await listarTudo(cliente, caminho)));
      else caminhos.push({ caminho, mime: item.metadata?.mimetype });
    }
    if (data.length < 1000) return caminhos;
  }
}

const { data: existente } = await destino.storage.getBucket(PASTA);
if (!existente) {
  const { error } = await destino.storage.createBucket(PASTA, { public: false, fileSizeLimit: LIMITE });
  if (error) throw new Error(`Não foi possível criar a pasta no projeto novo: ${error.message}`);
}

const arquivos = await listarTudo(origem);
const jaCopiados = new Set((await listarTudo(destino)).map((a) => a.caminho));
const pendentes = arquivos.filter((a) => !jaCopiados.has(a.caminho));
console.log(`${arquivos.length} arquivos na origem, ${pendentes.length} para copiar.`);

const falhas = [];
for (const [i, { caminho, mime }] of pendentes.entries()) {
  const { data, error } = await origem.storage.from(PASTA).download(caminho);
  const envio = error ? { error } : await destino.storage.from(PASTA).upload(caminho, Buffer.from(await data.arrayBuffer()), {
    contentType: mime || data.type || 'application/octet-stream',
    upsert: true,
  });
  if (envio.error) falhas.push(`${caminho}: ${envio.error.message}`);
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${pendentes.length}`);
}

console.log(`Copiados: ${pendentes.length - falhas.length}. Falhas: ${falhas.length}.`);
for (const f of falhas) console.log(`  ${f}`);
process.exitCode = falhas.length ? 1 : 0;
