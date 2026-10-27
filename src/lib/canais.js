/**
 * Canais de WhatsApp: regras puras usadas no servidor e na tela (testadas em tests/canais.test.js).
 *
 * Todo provedor (Evolution por QR Code, API oficial da Meta, futuramente Baileys próprio) é traduzido
 * para os MESMOS eventos padronizados, para o resto do sistema não depender de quem conectou o número:
 *   { tipo: 'mensagem', idExterno, telefone, nome, deMim, tipoMensagem, texto, midia, em }
 *   { tipo: 'status', idExterno, status }               status: enviada | entregue | lida | falhou
 *   { tipo: 'conexao', status, numero?, qr?, detalhe? }  status: conectado | conectando | desconectado | aguardando_qr
 */
import { normalizarTelefone } from './whatsappAgenda';

export const TIPOS_CANAL = {
  whatsapp_qr: { rotulo: 'WhatsApp QR Code', provedor: 'evolution', descricao: 'Conecta um número lendo o QR Code, como no WhatsApp Web.' },
  whatsapp_oficial: { rotulo: 'WhatsApp Oficial', provedor: 'meta', descricao: 'API oficial da Meta: templates aprovados e janela de 24 horas.' },
};

export const STATUS_CANAL = {
  conectado: { rotulo: 'Conectado', cor: 'verde' },
  conectando: { rotulo: 'Conectando…', cor: 'ambar' },
  aguardando_qr: { rotulo: 'Aguardando leitura do QR', cor: 'ambar' },
  desconectado: { rotulo: 'Desconectado', cor: 'cinza' },
  erro: { rotulo: 'Com erro', cor: 'vermelho' },
};

export const JANELA_ATENDIMENTO_MS = 24 * 60 * 60 * 1000;

/** Janela de 24h da API oficial: aberta até 24h depois da última mensagem do cliente. */
export function janelaAtendimento(conversa, agora = Date.now()) {
  const ultima = conversa?.ultima_entrada_cliente_em ? new Date(conversa.ultima_entrada_cliente_em).getTime() : 0;
  const fecha = ultima ? ultima + JANELA_ATENDIMENTO_MS : 0;
  return { aberta: fecha > agora, fechaEm: fecha ? new Date(fecha).toISOString() : null, restanteMs: Math.max(0, fecha - agora) };
}

/** Pode enviar texto livre nesta conversa? (QR Code sempre; oficial só com a janela aberta) */
export function podeEnviarTextoLivre(canal, conversa, agora = Date.now()) {
  if (canal?.tipo !== 'whatsapp_oficial') return true;
  return janelaAtendimento(conversa, agora).aberta;
}

/** Troca {nome}, {primeiro_nome} e {atendente} no texto da resposta rápida. */
export function preencherResposta(texto, { contato, atendente } = {}) {
  const nome = String(contato?.nome || '').trim();
  return String(texto || '')
    .replace(/\{primeiro_nome\}/g, nome.split(/\s+/)[0] || '')
    .replace(/\{nome\}/g, nome)
    .replace(/\{atendente\}/g, String(atendente || '').split(/\s+/)[0] || '');
}

/**
 * Celular brasileiro sempre com o 9º dígito: o WhatsApp ainda identifica muitos números no formato antigo
 * (55 84 9814-3514) e, sem isso, a mesma pessoa viraria dois contatos.
 */
export function telefoneCanonico(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('55') && /[6-9]/.test(d[4])) return `${d.slice(0, 4)}9${d.slice(4)}`;
  return d;
}

/** As duas formas de um celular brasileiro (com e sem o 9º dígito), para achar contatos antigos. */
export function formasDoTelefone(numero) {
  const c = telefoneCanonico(numero);
  return c.length === 13 && c.startsWith('55') && c[4] === '9' ? [c, `${c.slice(0, 4)}${c.slice(5)}`] : [c];
}

/** Nome de quem atende quando a pessoa não tem nome na equipe (mesma regra do topo do sistema). */
export function nomePeloEmail(email) {
  const parte = String(email || '').split('@')[0];
  return parte ? parte.charAt(0).toUpperCase() + parte.slice(1) : 'Equipe';
}

/** Grupo do WhatsApp: o "telefone" do contato é o identificador do grupo (ex.: 120363...@g.us). */
export const ehGrupo = (telefone) => /@g\.us$/.test(String(telefone || ''));

/**
 * Configuração do Chat da empresa (Configurações avançadas › Chat).
 *  grupos: 'desligado' (não recebe) | 'aba' (aba própria, fora da fila) | 'fila' (como conversa normal)
 */
export const CONFIG_CHAT_PADRAO = { grupos: 'desligado' };
export function validarConfigChat(valor) {
  const grupos = ['desligado', 'aba', 'fila'].includes(valor?.grupos) ? valor.grupos : CONFIG_CHAT_PADRAO.grupos;
  return { ...CONFIG_CHAT_PADRAO, grupos };
}

/** Conversas com mensagens novas (o número da aba Chat). Grupos numa aba própria não entram. */
export function contarConversasNovas(conversas = [], config = CONFIG_CHAT_PADRAO) {
  return (conversas || []).filter((c) => c.nao_lidas > 0 && c.status !== 'resolvida' && !(config?.grupos === 'aba' && ehGrupo(c.contato?.telefone))).length;
}

/** Assinatura do atendente na mensagem que o cliente recebe: *Nome:* na primeira linha. */
export const assinarMensagem = (texto, nome) => (nome ? `*${String(nome).trim()}:*\n${texto}` : texto);

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

/** Dados de um canal novo vindos da tela. Segredos vão separados (são cifrados no servidor). */
export function validarCanal(valor) {
  const tipo = valor?.tipo;
  if (!TIPOS_CANAL[tipo]) throw new Error('Escolha o tipo do canal.');
  const nome = texto(valor?.nome, 80);
  if (nome.length < 2) throw new Error('Dê um nome ao canal (ex.: Comercial, Suporte).');
  const canal = { tipo, provedor: TIPOS_CANAL[tipo].provedor, nome, departamento_padrao: texto(valor?.departamento_padrao, 60) || null };
  if (tipo === 'whatsapp_qr') {
    const url = texto(valor?.evolution_url, 300).replace(/\/+$/, '');
    // Sem endereço: usa o servidor de WhatsApp da plataforma (o cliente só lê o QR, como no RM Chat)
    if (!url) {
      if (!valor?.servidorDaPlataforma) throw new Error('Informe o endereço da Evolution API.');
      return { canal: { ...canal, config: { servidor: 'plataforma' } }, segredos: {} };
    }
    if (!texto(valor?.evolution_apikey, 300)) throw new Error('Informe a chave (API Key) da Evolution API.');
    return { canal: { ...canal, config: { servidor: 'proprio' } }, segredos: { url, apikey: texto(valor.evolution_apikey, 300) } };
  }
  const phoneNumberId = texto(valor?.phone_number_id, 40);
  if (!/^\d{6,30}$/.test(phoneNumberId)) throw new Error('ID do número de telefone inválido (só números, como aparece na Meta).');
  const wabaId = texto(valor?.waba_id, 40);
  if (wabaId && !/^\d{6,30}$/.test(wabaId)) throw new Error('ID da conta do WhatsApp Business inválido.');
  if (texto(valor?.token, 1000).length < 20) throw new Error('Informe o token permanente da Meta.');
  if (!/^[a-f0-9]{32}$/i.test(texto(valor?.app_secret, 64))) throw new Error('A chave secreta do app tem 32 letras e números (Configurações › Básico, na Meta).');
  return {
    canal: { ...canal, config: { phone_number_id: phoneNumberId, waba_id: wabaId || null } },
    segredos: { token: texto(valor.token, 1000), app_secret: texto(valor.app_secret, 64) },
  };
}

/** Texto curto para a lista de conversas. */
export function previaMensagem(evento) {
  if (evento.texto) return evento.texto.slice(0, 140);
  return { imagem: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', documento: '📄 Documento', figurinha: 'Figurinha', localizacao: '📍 Localização', contato: '👤 Contato', reacao: 'Reação' }[evento.tipoMensagem] || 'Mensagem';
}

// ------------------------------------------------------------------------------
// Evolution API (v2) → eventos padronizados
// ------------------------------------------------------------------------------
const telefoneDoJid = (jid) => {
  const bruto = String(jid || '').split('@')[0].split(':')[0];
  return telefoneCanonico(normalizarTelefone(bruto) || bruto.replace(/\D/g, '')) || null;
};
const ehConversaIndividual = (jid) => /@s\.whatsapp\.net$|@c\.us$|@lid$/.test(String(jid || ''));
const ehJidDeGrupo = (jid) => /^\d[\d-]*@g\.us$/.test(String(jid || ''));

/** Id da mensagem citada (resposta), em qualquer tipo de mensagem do WhatsApp. */
function citadaEvolution(message = {}) {
  for (const v of Object.values(message || {})) {
    const id = v && typeof v === 'object' ? v.contextInfo?.stanzaId : null;
    if (id) return id;
  }
  return null;
}

/** Edição ou "apagar para todos" feitos no WhatsApp (mensagem de protocolo). */
function protocoloEvolution(message = {}) {
  const p = message.protocolMessage || message.editedMessage?.message?.protocolMessage;
  if (!p?.key?.id) return null;
  const tipo = String(p.type);
  if (tipo === 'REVOKE' || tipo === '0') return { tipo: 'apagada', idExterno: p.key.id };
  if (tipo === 'MESSAGE_EDIT' || tipo === '14') {
    const novo = p.editedMessage?.conversation || p.editedMessage?.extendedTextMessage?.text || p.editedMessage?.imageMessage?.caption || '';
    return novo ? { tipo: 'editada', idExterno: p.key.id, texto: texto(novo, 4000) } : null;
  }
  return null;
}

function conteudoEvolution(message = {}) {
  if (message.conversation) return { tipoMensagem: 'texto', texto: message.conversation };
  if (message.extendedTextMessage) return { tipoMensagem: 'texto', texto: message.extendedTextMessage.text || '' };
  if (message.imageMessage) return { tipoMensagem: 'imagem', texto: message.imageMessage.caption || '', midia: { mime: message.imageMessage.mimetype } };
  if (message.videoMessage) return { tipoMensagem: 'video', texto: message.videoMessage.caption || '', midia: { mime: message.videoMessage.mimetype } };
  if (message.audioMessage) return { tipoMensagem: 'audio', texto: '', midia: { mime: message.audioMessage.mimetype, segundos: message.audioMessage.seconds } };
  if (message.documentMessage || message.documentWithCaptionMessage) {
    const d = message.documentMessage || message.documentWithCaptionMessage?.message?.documentMessage || {};
    return { tipoMensagem: 'documento', texto: d.caption || '', midia: { mime: d.mimetype, nome: d.fileName } };
  }
  if (message.stickerMessage) return { tipoMensagem: 'figurinha', texto: '' };
  if (message.locationMessage) return { tipoMensagem: 'localizacao', texto: [message.locationMessage.name, message.locationMessage.address].filter(Boolean).join(' · '), midia: { latitude: message.locationMessage.degreesLatitude, longitude: message.locationMessage.degreesLongitude } };
  if (message.contactMessage) return { tipoMensagem: 'contato', texto: message.contactMessage.displayName || '' };
  // Reação: aponta para a mensagem reagida (texto vazio = reação removida)
  if (message.reactionMessage) return { tipoMensagem: 'reacao', texto: message.reactionMessage.text || '', reageA: message.reactionMessage.key?.id || null };
  return { tipoMensagem: 'outro', texto: '' };
}

const STATUS_EVOLUTION = { SERVER_ACK: 'enviada', DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', ERROR: 'falhou' };
const CONEXAO_EVOLUTION = { open: 'conectado', connecting: 'conectando', close: 'desconectado' };

/**
 * Aviso da Evolution API → lista de eventos padronizados. Status do WhatsApp são ignorados; mensagens de
 * grupo vêm marcadas (grupo: true, com quem escreveu em `participante`) e o servidor decide se entram.
 */
export function eventosDaEvolution(payload) {
  const evento = String(payload?.event || '').toLowerCase().replace(/_/g, '.');
  const data = payload?.data;
  if (!data) return [];

  if (evento === 'messages.delete') {
    const itens = Array.isArray(data) ? data : [data];
    return itens.map((d) => ({ tipo: 'apagada', idExterno: d?.key?.id || d?.id })).filter((e) => e.idExterno);
  }

  if (evento === 'messages.upsert' || evento === 'messages.edited') {
    const itens = Array.isArray(data) ? data : Array.isArray(data.messages) ? data.messages : [data];
    return itens
      .filter((m) => m?.key?.id && (ehConversaIndividual(m.key.remoteJid) || ehJidDeGrupo(m.key.remoteJid)))
      .map((m) => {
        const protocolo = protocoloEvolution(m.message || {});
        if (protocolo) return protocolo;
        const c = conteudoEvolution(m.message || {});
        const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp) || 0;
        const grupo = ehJidDeGrupo(m.key.remoteJid);
        return {
          tipo: 'mensagem',
          idExterno: m.key.id,
          telefone: grupo ? m.key.remoteJid : telefoneDoJid(m.key.remoteJidAlt || m.key.remoteJid),
          // Em grupo, o pushName é de quem escreveu, não o nome do grupo
          nome: m.key.fromMe || grupo ? null : texto(m.pushName, 120) || null,
          grupo,
          participante: grupo && !m.key.fromMe ? { nome: texto(m.pushName, 120) || null, telefone: telefoneDoJid(m.key.participantAlt || m.key.participant) } : null,
          deMim: Boolean(m.key.fromMe),
          ...c,
          texto: texto(c.texto, 4000),
          em: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
          // Chave da mensagem no WhatsApp (para responder, reagir, editar e apagar depois)
          chave: { remoteJid: m.key.remoteJid, fromMe: Boolean(m.key.fromMe), ...(m.key.participant ? { participant: m.key.participant } : {}) },
          ...(citadaEvolution(m.message) ? { respondeA: citadaEvolution(m.message) } : {}),
        };
      })
      .filter((e) => e.tipo !== 'mensagem' || (e.telefone && e.tipoMensagem !== 'outro'));
  }

  if (evento === 'messages.update') {
    const itens = Array.isArray(data) ? data : [data];
    return itens
      .map((u) => ({ tipo: 'status', idExterno: u.keyId || u.messageId || u.key?.id, status: STATUS_EVOLUTION[u.status || u.update?.status] }))
      .filter((e) => e.idExterno && e.status);
  }

  if (evento === 'connection.update') {
    const status = CONEXAO_EVOLUTION[data.state];
    if (!status) return [];
    return [{ tipo: 'conexao', status, numero: data.wuid ? telefoneDoJid(data.wuid) : null, detalhe: data.statusReason ? String(data.statusReason) : null }];
  }

  if (evento === 'qrcode.updated') {
    const qr = data.qrcode?.base64 || data.base64;
    return qr ? [{ tipo: 'conexao', status: 'aguardando_qr', qr }] : [];
  }
  return [];
}

// ------------------------------------------------------------------------------
// API oficial da Meta (Cloud API) → eventos padronizados
// ------------------------------------------------------------------------------
const TIPOS_META = { text: 'texto', image: 'imagem', audio: 'audio', video: 'video', document: 'documento', sticker: 'figurinha', location: 'localizacao', contacts: 'contato', reaction: 'reacao', button: 'texto', interactive: 'texto' };
const STATUS_META = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };

function conteudoMeta(m) {
  switch (m.type) {
    case 'text':
      return { texto: m.text?.body || '' };
    case 'image':
    case 'video':
    case 'document':
    case 'audio':
    case 'sticker':
      return { texto: m[m.type]?.caption || '', midia: { id: m[m.type]?.id, mime: m[m.type]?.mime_type, nome: m[m.type]?.filename } };
    case 'location':
      return { texto: [m.location?.name, m.location?.address].filter(Boolean).join(' · '), midia: { latitude: m.location?.latitude, longitude: m.location?.longitude } };
    case 'button':
      return { texto: m.button?.text || '' };
    case 'interactive':
      return { texto: m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '' };
    case 'reaction':
      return { texto: m.reaction?.emoji || '', reageA: m.reaction?.message_id || null };
    case 'contacts':
      return { texto: m.contacts?.[0]?.name?.formatted_name || '' };
    default:
      return { texto: '' };
  }
}

/**
 * Aviso da Meta → eventos padronizados. Só aceita avisos do número deste canal
 * (phone_number_id), para um app com vários números não misturar conversas.
 */
export function eventosDaMeta(payload, phoneNumberId) {
  const eventos = [];
  for (const entrada of payload?.entry || []) {
    for (const mudanca of entrada.changes || []) {
      const v = mudanca.value || {};
      if (mudanca.field !== 'messages' || String(v.metadata?.phone_number_id || '') !== String(phoneNumberId)) continue;
      const nomes = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        if (!TIPOS_META[m.type]) continue;
        const c = conteudoMeta(m);
        eventos.push({
          tipo: 'mensagem',
          idExterno: m.id,
          telefone: telefoneCanonico(normalizarTelefone(m.from) || String(m.from || '').replace(/\D/g, '')),
          nome: texto(nomes[m.from], 120) || null,
          deMim: false,
          tipoMensagem: TIPOS_META[m.type],
          texto: texto(c.texto, 4000),
          midia: c.midia,
          ...(c.reageA ? { reageA: c.reageA } : {}),
          ...(m.context?.id ? { respondeA: m.context.id } : {}),
          em: new Date((Number(m.timestamp) || Date.now() / 1000) * 1000).toISOString(),
        });
      }
      for (const s of v.statuses || []) {
        if (STATUS_META[s.status]) eventos.push({ tipo: 'status', idExterno: s.id, status: STATUS_META[s.status], erro: s.errors?.[0]?.title || null });
      }
    }
  }
  return eventos.filter((e) => e.tipo !== 'mensagem' || e.telefone);
}

/** Ordem dos status de uma mensagem enviada: um aviso atrasado nunca "volta" o status. */
export const ORDEM_STATUS = { pendente: 0, falhou: 0, enviada: 1, entregue: 2, lida: 3 };
