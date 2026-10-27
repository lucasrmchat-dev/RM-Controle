/**
 * Provedor API oficial da Meta (WhatsApp Cloud API).
 * Envio pelo Graph API; avisos assinados com a chave secreta do app (X-Hub-Signature-256).
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import crypto from 'crypto';
import { eventosDaMeta } from '@/lib/canais';
import { iguais, hashToken } from './cofre';

const GRAPH = 'https://graph.facebook.com/v21.0';

async function chamar(segredos, caminho, { metodo = 'GET', corpo, fetchImpl = fetch } = {}) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 15000);
  try {
    const res = await fetchImpl(`${GRAPH}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${segredos.token}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Meta respondeu ${res.status}: ${json?.error?.message || 'erro desconhecido'}`);
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A Meta não respondeu em 15 segundos.');
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

const QUALIDADE = { GREEN: 'Alta', YELLOW: 'Média', RED: 'Baixa' };

export const meta = {
  /** Confere token e número; a conexão de verdade é o webhook configurado no painel da Meta. */
  async conectar(canal, segredos, { fetchImpl } = {}) {
    const r = await this.situacao(canal, segredos, { fetchImpl });
    return { ...r, qr: null };
  },

  async situacao(canal, segredos, { fetchImpl } = {}) {
    const id = canal.config?.phone_number_id;
    const r = await chamar(segredos, `/${id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status`, { fetchImpl });
    return {
      status: 'conectado',
      numero: String(r.display_phone_number || '').replace(/\D/g, '') || null,
      config: {
        ...canal.config,
        nome_verificado: r.verified_name || null,
        qualidade: QUALIDADE[r.quality_rating] || r.quality_rating || null,
        limite_envio: r.messaging_limit_tier || null,
        verificacao: r.code_verification_status || null,
      },
    };
  },

  async desconectar() {
    // A API oficial não "desconecta": o número segue no WhatsApp Business; aqui só paramos de usar o canal
    return { status: 'desconectado' };
  },

  async reiniciar(canal, segredos, opcoes) {
    return this.situacao(canal, segredos, opcoes);
  },

  async remover() {},

  async enviarTexto(canal, segredos, telefone, texto, { fetchImpl, citada } = {}) {
    const r = await chamar(segredos, `/${canal.config?.phone_number_id}/messages`, {
      metodo: 'POST',
      fetchImpl,
      corpo: { messaging_product: 'whatsapp', recipient_type: 'individual', to: telefone, type: 'text', text: { body: texto, preview_url: false }, ...(citada?.idExterno ? { context: { message_id: citada.idExterno } } : {}) },
    });
    return { idExterno: r?.messages?.[0]?.id || null, chave: null };
  },

  async reagir(canal, segredos, { telefone, idExterno, emoji }, { fetchImpl } = {}) {
    const r = await chamar(segredos, `/${canal.config?.phone_number_id}/messages`, { metodo: 'POST', fetchImpl, corpo: { messaging_product: 'whatsapp', recipient_type: 'individual', to: telefone, type: 'reaction', reaction: { message_id: idExterno, emoji } } });
    return { idExterno: r?.messages?.[0]?.id || null };
  },

  /** Arquivo recebido: a Meta manda só o id; o link vem do Graph e exige o token. */
  async baixarMidia(canal, segredos, evento, { fetchImpl = fetch } = {}) {
    if (!evento.midia?.id) throw new Error('Mensagem sem arquivo.');
    const info = await chamar(segredos, `/${evento.midia.id}`, { fetchImpl });
    if (Number(info.file_size) > 16 * 1024 * 1024) throw new Error('Arquivo grande demais.');
    const res = await fetchImpl(info.url, { headers: { Authorization: `Bearer ${segredos.token}` } });
    if (!res.ok) throw new Error(`Meta respondeu ${res.status} ao baixar o arquivo.`);
    return { dados: Buffer.from(await res.arrayBuffer()), mime: info.mime_type || evento.midia.mime, nome: evento.midia.nome };
  },

  async enviarMidia(canal, segredos, destino, { tipo, dados, mime, nome, legenda }, { fetchImpl = fetch } = {}) {
    // Áudio gravado no navegador (webm) não é aceito pela Meta, que só recebe ogg/opus, mp3, aac e amr
    if (tipo === 'audio' && /webm/.test(mime)) throw new Error('Pela API oficial, grave o áudio em outro navegador (Firefox) ou envie um arquivo .mp3/.ogg.');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([dados], { type: mime }), nome || 'arquivo');
    const subida = await fetchImpl(`${GRAPH}/${canal.config?.phone_number_id}/media`, { method: 'POST', headers: { Authorization: `Bearer ${segredos.token}` }, body: form });
    const enviado = await subida.json().catch(() => ({}));
    if (!subida.ok || !enviado.id) throw new Error(`Meta respondeu ${subida.status}: ${enviado?.error?.message || 'não aceitou o arquivo'}`);
    const chave = { imagem: 'image', video: 'video', documento: 'document', audio: 'audio' }[tipo];
    const corpo = { id: enviado.id, ...(legenda && tipo !== 'audio' ? { caption: legenda } : {}), ...(tipo === 'documento' && nome ? { filename: nome } : {}) };
    const r = await chamar(segredos, `/${canal.config?.phone_number_id}/messages`, { metodo: 'POST', fetchImpl, corpo: { messaging_product: 'whatsapp', recipient_type: 'individual', to: destino, type: chave, [chave]: corpo } });
    return { idExterno: r?.messages?.[0]?.id || null };
  },

  /** Assinatura da Meta: HMAC-SHA256 do corpo BRUTO com a chave secreta do app deste canal. */
  autenticarAviso(canal, { headers, corpoBruto, segredos }) {
    const assinatura = headers.get('x-hub-signature-256') || '';
    if (!segredos?.app_secret || !assinatura.startsWith('sha256=')) return false;
    const esperada = `sha256=${crypto.createHmac('sha256', segredos.app_secret).update(corpoBruto).digest('hex')}`;
    return iguais(assinatura, esperada);
  },

  /** Verificação do webhook no painel da Meta (GET com hub.verify_token). */
  verificarAssinatura(canal, verifyToken) {
    return Boolean(verifyToken) && iguais(hashToken(verifyToken), canal.webhook_token_hash);
  },

  lerAviso(payload, canal) {
    return eventosDaMeta(payload, canal.config?.phone_number_id);
  },
};
