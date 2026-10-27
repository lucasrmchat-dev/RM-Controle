/**
 * Provedor Evolution API (v2) — WhatsApp por QR Code (Baileys por baixo).
 * Cada canal vira uma instância "rmc_<id do canal>" no servidor da Evolution.
 * Documentação da Evolution: https://doc.evolution-api.com
 */
import { eventosDaEvolution } from '@/lib/canais';
import { iguais, hashToken } from './cofre';

const EVENTOS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_EDITED', 'MESSAGES_DELETE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];
export const nomeInstancia = (canal) => `rmc_${String(canal.id).replace(/-/g, '')}`;
const CACHE_NOMES = new Map();

async function chamar(segredos, caminho, { metodo = 'GET', corpo, fetchImpl = fetch, segundos = 15 } = {}) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), segundos * 1000);
  try {
    const res = await fetchImpl(`${segredos.url}${caminho}`, {
      method: metodo,
      // ngrok-skip-browser-warning: com a Evolution atrás de um túnel do ngrok, evita a página de aviso dele
      headers: { apikey: segredos.apikey, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
      redirect: 'error',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.response?.message || json?.message || json?.error;
      throw new Error(`Evolution respondeu ${res.status}${msg ? `: ${Array.isArray(msg) ? msg.join(' ') : msg}` : ''}`);
    }
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`A Evolution API não respondeu em ${segundos} segundos. Confira se ela está ligada.`);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(e.message)) throw new Error('Não foi possível falar com a Evolution API. Confira o endereço e se ela está ligada.');
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

const CONEXAO = { open: 'conectado', connecting: 'conectando', close: 'desconectado' };

export const evolution = {
  /** Cria (ou reaproveita) a instância já apontando os avisos para o RM Controle e devolve o QR. */
  async conectar(canal, segredos, { urlWebhook, tokenWebhook, receberGrupos = false, fetchImpl } = {}) {
    const instancia = nomeInstancia(canal);
    const webhook = { enabled: true, url: urlWebhook, byEvents: false, base64: false, headers: { 'x-rm-token': tokenWebhook }, events: EVENTOS };
    let qr = null;
    try {
      const criada = await chamar(segredos, '/instance/create', { metodo: 'POST', fetchImpl, corpo: { instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true, groupsIgnore: !receberGrupos, webhook } });
      qr = criada?.qrcode?.base64 || null;
    } catch (e) {
      // Já existe: só garante o webhook atualizado e pede um QR novo
      if (!/403|409|already|em uso|exist/i.test(e.message)) throw e;
      await chamar(segredos, `/webhook/set/${instancia}`, { metodo: 'POST', fetchImpl, corpo: { webhook } });
      await this.ajustarGrupos(canal, segredos, receberGrupos, { fetchImpl }).catch(() => {});
    }
    if (!qr) {
      const c = await chamar(segredos, `/instance/connect/${instancia}`, { fetchImpl });
      qr = c?.base64 || null;
    }
    return { status: qr ? 'aguardando_qr' : 'conectando', qr, config: { instancia } };
  },

  async situacao(canal, segredos, { fetchImpl } = {}) {
    const instancia = nomeInstancia(canal);
    const r = await chamar(segredos, `/instance/connectionState/${instancia}`, { fetchImpl });
    const status = CONEXAO[r?.instance?.state] || 'desconectado';
    let numero = null;
    if (status === 'conectado') {
      const lista = await chamar(segredos, `/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`, { fetchImpl }).catch(() => []);
      const dono = (Array.isArray(lista) ? lista[0] : lista)?.ownerJid || (Array.isArray(lista) ? lista[0] : lista)?.instance?.owner;
      numero = dono ? String(dono).split('@')[0].split(':')[0] : null;
    }
    return { status, numero };
  },

  async desconectar(canal, segredos, { fetchImpl } = {}) {
    await chamar(segredos, `/instance/logout/${nomeInstancia(canal)}`, { metodo: 'DELETE', fetchImpl }).catch(() => {});
    return { status: 'desconectado' };
  },

  async reiniciar(canal, segredos, { fetchImpl } = {}) {
    const instancia = nomeInstancia(canal);
    await chamar(segredos, `/instance/restart/${instancia}`, { metodo: 'POST', fetchImpl }).catch(() => chamar(segredos, `/instance/restart/${instancia}`, { metodo: 'PUT', fetchImpl }));
    return { status: 'conectando' };
  },

  /** Remove a instância no servidor da Evolution (ao excluir o canal). */
  async remover(canal, segredos, { fetchImpl } = {}) {
    await chamar(segredos, `/instance/delete/${nomeInstancia(canal)}`, { metodo: 'DELETE', fetchImpl }).catch(() => {});
  },

  /** Texto; com `citada` ({ idExterno, chave, conteudo }) sai como resposta à mensagem. */
  async enviarTexto(canal, segredos, telefone, texto, { fetchImpl, citada, mencionados = [] } = {}) {
    const corpo = { number: telefone, text: texto };
    // Identificador completo (…@lid ou número@s.whatsapp.net): a Evolution repassa como está
    if (mencionados.length) corpo.mentioned = mencionados;
    if (citada?.idExterno) corpo.quoted = { key: { id: citada.idExterno, ...(citada.chave || {}) }, message: { conversation: citada.conteudo || '' } };
    const r = await chamar(segredos, `/message/sendText/${nomeInstancia(canal)}`, { metodo: 'POST', fetchImpl, corpo });
    return { idExterno: r?.key?.id || null, chave: r?.key ? { remoteJid: r.key.remoteJid, fromMe: true } : null };
  },

  async reagir(canal, segredos, { chave, idExterno, emoji }, { fetchImpl } = {}) {
    const r = await chamar(segredos, `/message/sendReaction/${nomeInstancia(canal)}`, { metodo: 'POST', fetchImpl, corpo: { key: { ...chave, id: idExterno }, reaction: emoji } });
    return { idExterno: r?.key?.id || null };
  },

  /** O WhatsApp deixa editar por até 15 minutos depois do envio. */
  async editar(canal, segredos, { telefone, chave, idExterno, texto }, { fetchImpl } = {}) {
    await chamar(segredos, `/chat/updateMessage/${nomeInstancia(canal)}`, { metodo: 'POST', fetchImpl, corpo: { number: telefone, key: { ...chave, fromMe: true, id: idExterno }, text: texto } });
  },

  async apagarParaTodos(canal, segredos, { chave, idExterno }, { fetchImpl } = {}) {
    await chamar(segredos, `/chat/deleteMessageForEveryone/${nomeInstancia(canal)}`, { metodo: 'DELETE', fetchImpl, corpo: { id: idExterno, remoteJid: chave.remoteJid, fromMe: chave.fromMe !== false, ...(chave.participant ? { participant: chave.participant } : {}) } });
  },

  /** Atualiza o endereço e os eventos do aviso (webhook) de uma instância já conectada. */
  async atualizarAviso(canal, segredos, { urlWebhook, tokenWebhook, fetchImpl } = {}) {
    await chamar(segredos, `/webhook/set/${nomeInstancia(canal)}`, { metodo: 'POST', fetchImpl, corpo: { webhook: { enabled: true, url: urlWebhook, byEvents: false, base64: false, headers: { 'x-rm-token': tokenWebhook }, events: EVENTOS } } });
  },

  /** Liga ou desliga as mensagens de grupo desta instância (as demais opções ficam no padrão). */
  async ajustarGrupos(canal, segredos, receber, { fetchImpl } = {}) {
    await chamar(segredos, `/settings/set/${nomeInstancia(canal)}`, {
      metodo: 'POST',
      fetchImpl,
      corpo: { rejectCall: false, msgCall: '', groupsIgnore: !receber, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false },
    });
  },

  /**
   * Nomes que o WhatsApp conhece (contatos e quem já escreveu), pelo identificador (…@lid ou número@s.whatsapp.net).
   * A Evolution não filtra por lista, então a agenda inteira vem de uma vez e fica guardada 10 minutos.
   */
  async nomesConhecidos(canal, segredos, { fetchImpl } = {}) {
    const chave = nomeInstancia(canal);
    const cache = CACHE_NOMES.get(chave);
    if (cache && Date.now() - cache.em < 10 * 60 * 1000) return cache.nomes;
    const lista = await chamar(segredos, `/chat/findContacts/${chave}`, { metodo: 'POST', fetchImpl, segundos: 40, corpo: { where: {} } });
    const nomes = new Map((Array.isArray(lista) ? lista : []).filter((c) => c?.remoteJid && c.pushName).map((c) => [c.remoteJid, String(c.pushName).trim().slice(0, 120)]));
    CACHE_NOMES.set(chave, { em: Date.now(), nomes });
    return nomes;
  },

  /** Participantes do grupo: identificador no WhatsApp e, quando o WhatsApp informa, o número de verdade. */
  async participantes(canal, segredos, jidGrupo, { fetchImpl } = {}) {
    const r = await chamar(segredos, `/group/participants/${nomeInstancia(canal)}?groupJid=${encodeURIComponent(jidGrupo)}`, { fetchImpl });
    const lista = Array.isArray(r?.participants) ? r.participants : Array.isArray(r) ? r : [];
    return lista.map((p) => {
      const numero = [p.phoneNumber, p.jid, p.id].find((j) => /@s\.whatsapp\.net$/.test(String(j || '')));
      return { jid: p.id || p.jid, jidTelefone: numero || null, telefone: numero ? String(numero).split('@')[0].split(':')[0] : null, admin: Boolean(p.admin) };
    });
  },

  async nomeDoGrupo(canal, segredos, jid, { fetchImpl } = {}) {
    const r = await chamar(segredos, `/group/findGroupInfos/${nomeInstancia(canal)}?groupJid=${encodeURIComponent(jid)}`, { fetchImpl });
    return String(r?.subject || '').trim().slice(0, 120) || null;
  },

  /** Arquivo de uma mensagem recebida (a Evolution guarda a mensagem e devolve o arquivo em base64). */
  async baixarMidia(canal, segredos, evento, { fetchImpl } = {}) {
    const r = await chamar(segredos, `/chat/getBase64FromMediaMessage/${nomeInstancia(canal)}`, { metodo: 'POST', fetchImpl, segundos: 40, corpo: { message: { key: { id: evento.idExterno } }, convertToMp4: false } });
    if (!r?.base64) throw new Error('A Evolution não devolveu o arquivo.');
    return { dados: Buffer.from(r.base64, 'base64'), mime: r.mimetype || evento.midia?.mime, nome: r.fileName || evento.midia?.nome };
  },

  /** Foto, vídeo, documento (com legenda) ou áudio de voz (vira mensagem de voz no WhatsApp). */
  async enviarMidia(canal, segredos, destino, { tipo, dados, mime, nome, legenda }, { fetchImpl } = {}) {
    const instancia = nomeInstancia(canal);
    const base64 = Buffer.from(dados).toString('base64');
    const r =
      tipo === 'audio'
        ? await chamar(segredos, `/message/sendWhatsAppAudio/${instancia}`, { metodo: 'POST', fetchImpl, segundos: 60, corpo: { number: destino, audio: base64 } })
        : await chamar(segredos, `/message/sendMedia/${instancia}`, {
            metodo: 'POST',
            fetchImpl,
            segundos: 60,
            corpo: { number: destino, mediatype: { imagem: 'image', video: 'video', documento: 'document' }[tipo], mimetype: mime, caption: legenda || '', media: base64, fileName: nome || `arquivo.${String(mime).split('/')[1] || 'bin'}` },
          });
    return { idExterno: r?.key?.id || null };
  },

  async fotoDoPerfil(canal, segredos, numero, { fetchImpl } = {}) {
    const r = await chamar(segredos, `/chat/fetchProfilePictureUrl/${nomeInstancia(canal)}`, { metodo: 'POST', fetchImpl, corpo: { number: numero } });
    return r?.profilePictureUrl || null;
  },

  /** O aviso veio mesmo da Evolution deste canal? (cabeçalho com o token gerado na conexão) */
  autenticarAviso(canal, { headers }) {
    const token = headers.get('x-rm-token') || '';
    return Boolean(token) && iguais(hashToken(token), canal.webhook_token_hash);
  },

  lerAviso(payload) {
    return eventosDaEvolution(payload);
  },
};
