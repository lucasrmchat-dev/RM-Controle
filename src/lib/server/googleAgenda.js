/**
 * Sincronização bidirecional entre a Agenda do RM Controle (public.agenda_eventos) e o Google Agenda
 * de cada pessoa da equipe.
 *
 * Acesso: cada pessoa clica em "Conectar Google Agenda" e autoriza a própria conta (OAuth 2.0).
 * O servidor guarda só o refresh token, criptografado (AES-256-GCM), e o usa para ler e escrever
 * naquela agenda. Desconectar revoga a autorização no Google.
 *
 * Fluxos:
 *  - Sistema → Google: criar/editar/excluir no RM Controle chama espelharEvento / excluirEvento.
 *  - Google → Sistema: o Google avisa o webhook (/api/google/agenda/webhook) a cada mudança e o servidor
 *    reconcilia a janela da agenda daquela pessoa (cria, atualiza e apaga linhas).
 *  - Cron diário: renova os canais de aviso (expiram em ~7 dias) e reconcilia tudo.
 *
 * Variáveis de ambiente (painel da Vercel):
 *  GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET   ID do cliente OAuth (tipo "Aplicativo da Web")
 *  GOOGLE_TOKENS_KEY             opcional: chave para criptografar os tokens (padrão: derivada do segredo do servidor)
 *  GOOGLE_AGENDA_WEBHOOK_TOKEN   segredo aleatório que o Google devolve em cada aviso
 *  CRON_SECRET                   a Vercel envia no cabeçalho Authorization do cron
 */
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';

export const CHAVE_CONFIG = 'google_agenda';
const CHAVE_TOKENS = 'google_agenda_tokens';
export const FUSO = 'America/Sao_Paulo';
const ESCOPOS = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const URL_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_REVOGAR = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
const DIAS_PASSADO = 30;
const DIAS_FUTURO = 180;

export class ErroGoogle extends Error {
  constructor(codigo, mensagem, status = 0) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

export const googleConfigurado = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);

// ------------------------------------------------------------------------------
// Segredos: criptografia dos tokens e assinatura do "state" do OAuth
// ------------------------------------------------------------------------------
function segredoBase() {
  return process.env.GOOGLE_TOKENS_KEY || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'rm_dev_local';
}
const chaveCifra = () => crypto.createHash('sha256').update(`rm_google_tokens:${segredoBase()}`).digest();

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveCifra(), iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64url')).join('.');
}

export function decifrar(cifrado) {
  try {
    const [iv, tag, dados] = String(cifrado).split('.').map((p) => Buffer.from(p, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', chaveCifra(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const assinar = (texto) => crypto.createHmac('sha256', `rm_google_state:${segredoBase()}`).update(texto).digest('base64url');

/** "state" do OAuth: amarra a volta do Google à pessoa logada e expira em 10 minutos. */
export function criarState(emailSistema, nonce) {
  const corpo = Buffer.from(JSON.stringify({ e: emailSistema, n: nonce, x: Date.now() + 10 * 60000 })).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

export function lerState(state, nonceCookie) {
  const [corpo, assinatura] = String(state || '').split('.');
  if (!corpo || !assinatura) return null;
  const esperada = assinar(corpo);
  if (esperada.length !== assinatura.length || !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura))) return null;
  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    if (!dados.e || dados.x < Date.now() || !nonceCookie || dados.n !== nonceCookie) return null;
    return dados.e;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------
// OAuth: conectar, trocar o código e renovar o acesso
// ------------------------------------------------------------------------------
export function urlConectar({ state, redirectUri, loginHint }) {
  const u = new URL(URL_AUTORIZACAO);
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPOS.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return u.toString();
}

/** Troca o código da volta do Google por tokens e descobre qual conta Google foi conectada. */
export async function trocarCodigo(code, redirectUri, fetchImpl = fetch) {
  const res = await fetchImpl(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.refresh_token) {
    throw new ErroGoogle('oauth', json.error_description || 'O Google não devolveu a autorização. Tente conectar de novo.');
  }
  if (!String(json.scope || '').includes('calendar')) {
    throw new ErroGoogle('escopo', 'Para sincronizar, é preciso permitir o acesso à agenda na tela do Google.');
  }
  // O id_token veio direto do Google por HTTPS nesta troca: o e-mail dele é confiável
  let emailGoogle = '';
  try {
    emailGoogle = JSON.parse(Buffer.from(String(json.id_token).split('.')[1], 'base64url').toString()).email || '';
  } catch {}
  if (!emailGoogle) throw new ErroGoogle('oauth', 'Não foi possível identificar a conta Google conectada.');
  cacheTokens.set(emailGoogle.toLowerCase(), { token: json.access_token, expira: Date.now() + (json.expires_in || 3600) * 1000 });
  return { emailGoogle: emailGoogle.toLowerCase(), refreshToken: json.refresh_token };
}

const cacheTokens = new Map();

async function tokenPara(conta, fetchImpl = fetch) {
  const emCache = cacheTokens.get(conta.email_google);
  if (emCache && emCache.expira > Date.now() + 60000) return emCache.token;
  if (!conta.refresh_token) throw new ErroGoogle('desconectado', 'Esta agenda não está conectada ao Google.');
  const res = await fetchImpl(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: conta.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new ErroGoogle(
      json.error === 'invalid_grant' ? 'desconectado' : 'falha_token',
      json.error === 'invalid_grant'
        ? 'A conexão com o Google foi revogada ou expirou. Conecte o Google Agenda de novo.'
        : json.error_description || `Falha ao renovar o acesso ao Google (${res.status}).`
    );
  }
  cacheTokens.set(conta.email_google, { token: json.access_token, expira: Date.now() + (json.expires_in || 3600) * 1000 });
  return json.access_token;
}

async function chamarApi(conta, caminho, { metodo = 'GET', corpo, consulta } = {}, fetchImpl = fetch) {
  const token = await tokenPara(conta, fetchImpl);
  const url = new URL(API + caminho);
  Object.entries(consulta || {}).forEach(([k, v]) => v !== undefined && v !== null && url.searchParams.set(k, String(v)));
  const res = await fetchImpl(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroGoogle('api', json?.error?.message || `Google Agenda respondeu ${res.status}.`, res.status);
  return json;
}

// ------------------------------------------------------------------------------
// Conversão de campos (funções puras, testadas em tests/google-agenda.test.js)
// ------------------------------------------------------------------------------
const formatadorLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Instante (ISO com fuso) → { data: 'AAAA-MM-DD', hora: 'HH:mm' } no horário de Brasília. */
export function partesNoFuso(iso) {
  const p = Object.fromEntries(formatadorLocal.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

const somarDia = (data, dias) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const somarMinutos = (hora, minutos) => {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutos);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const textoSemHtml = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
    .slice(0, 2000);

function linkDaReuniao(ev) {
  if (ev.hangoutLink) return ev.hangoutLink;
  const video = (ev.conferenceData?.entryPoints || []).find((p) => p.entryPointType === 'video');
  if (video?.uri) return video.uri;
  return /^https?:\/\//.test(ev.location || '') ? ev.location : '';
}

/** Evento do Google → campos de agenda_eventos (preserva o que só existe no sistema, como empresa e tipo). */
export function googleParaLinha(ev, conta, existente = null) {
  const diaInteiro = Boolean(ev.start?.date && !ev.start?.dateTime);
  let data;
  let horaInicio;
  let horaFim;
  if (diaInteiro) {
    data = ev.start.date;
    horaInicio = '00:00';
    horaFim = '23:59';
  } else {
    const ini = partesNoFuso(ev.start.dateTime);
    const fim = partesNoFuso(ev.end?.dateTime || ev.start.dateTime);
    data = ini.data;
    horaInicio = ini.hora;
    horaFim = fim.data === ini.data ? fim.hora : '23:59';
  }
  return {
    titulo: (ev.summary || '(Sem título)').trim().slice(0, 300),
    empresa: existente?.empresa ?? (ev.location && !/^https?:\/\//.test(ev.location) ? ev.location.slice(0, 200) : ''),
    data,
    hora_inicio: horaInicio,
    hora_fim: horaFim,
    dia_inteiro: diaInteiro,
    responsavel_email: conta.email_sistema,
    responsavel_nome: conta.nome || existente?.responsavel_nome || conta.email_sistema,
    link_reuniao: linkDaReuniao(ev),
    status: existente?.status && existente.status !== 'cancelada' ? existente.status : 'agendada',
    tipo: existente?.tipo || 'interna',
    observacoes: textoSemHtml(ev.description),
    chamado_id: existente?.chamado_id ?? null,
    origem: existente?.origem || 'google',
    criado_por: existente?.criado_por || ev.organizer?.email || conta.email_sistema,
    google_event_id: ev.id,
    google_calendar_id: conta.email_google,
    google_ical_uid: ev.iCalUID || null,
    google_atualizado_em: ev.updated || null,
    updated_at: new Date().toISOString(),
  };
}

/** Linha de agenda_eventos → corpo de evento do Google. */
export function linhaParaGoogle(linha) {
  const descricao = [linha.empresa ? `Empresa: ${linha.empresa}` : '', linha.observacoes || ''].filter(Boolean).join('\n\n');
  const corpo = {
    summary: linha.titulo || 'Reunião',
    description: descricao || undefined,
    location: linha.link_reuniao || undefined,
    extendedProperties: { private: { rm_id: String(linha.id) } },
  };
  if (linha.dia_inteiro) {
    corpo.start = { date: linha.data };
    corpo.end = { date: somarDia(linha.data, 1) };
  } else {
    const inicio = linha.hora_inicio || '09:00';
    let fim = linha.hora_fim || somarMinutos(inicio, 60);
    if (fim <= inicio) fim = somarMinutos(inicio, 30);
    corpo.start = { dateTime: `${linha.data}T${inicio}:00`, timeZone: FUSO };
    corpo.end = { dateTime: `${linha.data}T${fim}:00`, timeZone: FUSO };
  }
  return corpo;
}

// ------------------------------------------------------------------------------
// Configuração (sistema_config, lida só pelo servidor)
// ------------------------------------------------------------------------------
const CONFIG_PADRAO = { contas: [], canais: {}, ultima_sincronizacao: null, erros: {} };

function db() {
  const cliente = getSupabaseAdmin();
  if (!cliente) throw new ErroGoogle('sem_banco', 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.');
  return cliente;
}

export async function carregarConfigGoogle() {
  const { data } = await db().from('sistema_config').select('valor').eq('chave', CHAVE_CONFIG).maybeSingle();
  return { ...CONFIG_PADRAO, ...(data?.valor || {}) };
}

export async function salvarConfigGoogle(config) {
  const { error } = await db()
    .from('sistema_config')
    .upsert({ chave: CHAVE_CONFIG, valor: config, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new ErroGoogle('config', `Não foi possível salvar a configuração do Google Agenda: ${error.message}`);
  return config;
}

// Refresh tokens ficam numa chave separada e sempre criptografados
async function carregarTokens() {
  const { data } = await db().from('sistema_config').select('valor').eq('chave', CHAVE_TOKENS).maybeSingle();
  return data?.valor || {};
}

async function salvarTokens(tokens) {
  const { error } = await db()
    .from('sistema_config')
    .upsert({ chave: CHAVE_TOKENS, valor: tokens, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new ErroGoogle('config', `Não foi possível guardar a conexão com o Google: ${error.message}`);
}

/** Contas conectadas, já com o refresh token decifrado (uso exclusivo do servidor). */
export async function carregarContasConectadas(config = null) {
  const cfg = config || (await carregarConfigGoogle());
  const tokens = await carregarTokens();
  return (cfg.contas || [])
    .map((c) => ({ ...c, refresh_token: tokens[c.email_sistema] ? decifrar(tokens[c.email_sistema]) : null }))
    .filter((c) => c.email_google && c.email_sistema && c.refresh_token);
}

/** Grava a conexão de uma pessoa (substitui a anterior, se houver). */
export async function registrarConexao({ emailSistema, nome, emailGoogle, refreshToken }) {
  const config = await carregarConfigGoogle();
  const contas = (config.contas || []).filter((c) => c.email_sistema !== emailSistema && c.email_google !== emailGoogle);
  contas.push({ email_sistema: emailSistema, email_google: emailGoogle, nome: nome || '', conectado_em: new Date().toISOString() });
  const erros = { ...(config.erros || {}) };
  delete erros[emailSistema];
  await salvarConfigGoogle({ ...config, contas, erros });
  const tokens = await carregarTokens();
  await salvarTokens({ ...tokens, [emailSistema]: cifrar(refreshToken) });
}

/** Desconecta: revoga no Google, encerra o canal de avisos e esquece o token. */
export async function desconectar(emailSistema, fetchImpl = fetch) {
  const config = await carregarConfigGoogle();
  const [conta] = (await carregarContasConectadas(config)).filter((c) => c.email_sistema === emailSistema);
  if (conta) {
    const canal = config.canais?.[conta.email_google];
    if (canal?.id) {
      await chamarApi(conta, '/channels/stop', { metodo: 'POST', corpo: { id: canal.id, resourceId: canal.resource_id } }, fetchImpl).catch(() => {});
    }
    await fetchImpl(`${URL_REVOGAR}?token=${encodeURIComponent(conta.refresh_token)}`, { method: 'POST' }).catch(() => {});
    cacheTokens.delete(conta.email_google);
  }
  const canais = { ...(config.canais || {}) };
  if (conta) delete canais[conta.email_google];
  await salvarConfigGoogle({ ...config, canais, contas: (config.contas || []).filter((c) => c.email_sistema !== emailSistema) });
  const tokens = await carregarTokens();
  delete tokens[emailSistema];
  await salvarTokens(tokens);
}

// ------------------------------------------------------------------------------
// Google → Sistema: reconcilia a janela de uma agenda
// ------------------------------------------------------------------------------
async function listarEventosGoogle(conta, fetchImpl) {
  const agora = Date.now();
  const eventos = [];
  let pageToken;
  do {
    const pagina = await chamarApi(
      conta,
      `/calendars/${encodeURIComponent(conta.email_google)}/events`,
      {
        consulta: {
          singleEvents: true,
          showDeleted: false,
          maxResults: 250,
          timeMin: new Date(agora - DIAS_PASSADO * 86400000).toISOString(),
          timeMax: new Date(agora + DIAS_FUTURO * 86400000).toISOString(),
          pageToken,
        },
      },
      fetchImpl
    );
    eventos.push(...(pagina.items || []).filter((e) => e.status !== 'cancelled'));
    pageToken = pagina.nextPageToken;
  } while (pageToken);
  return eventos;
}

export async function sincronizarConta(conta, fetchImpl = fetch) {
  const cliente = db();
  const desde = new Date(Date.now() - DIAS_PASSADO * 86400000).toISOString().slice(0, 10);
  const ate = new Date(Date.now() + DIAS_FUTURO * 86400000).toISOString().slice(0, 10);
  const eventos = await listarEventosGoogle(conta, fetchImpl);

  const { data: linhas, error } = await cliente
    .from('agenda_eventos')
    .select('*')
    .gte('data', desde)
    .lte('data', ate)
    .or(`google_calendar_id.eq."${conta.email_google}",and(google_event_id.is.null,responsavel_email.eq."${conta.email_sistema}")`);
  if (error) throw new ErroGoogle('banco', `Não foi possível ler a agenda: ${error.message}`);

  const porGoogleId = new Map();
  const porId = new Map();
  (linhas || []).forEach((l) => {
    porId.set(String(l.id), l);
    if (l.google_event_id && l.google_calendar_id === conta.email_google) porGoogleId.set(l.google_event_id, l);
  });

  const novos = [];
  const atualizados = [];
  const vistos = new Set();
  const vinculados = new Set();
  for (const ev of eventos) {
    vistos.add(ev.id);
    // Evento criado pelo sistema cujo vínculo ainda não foi gravado (corrida entre o push e o aviso)
    const rmId = ev.extendedProperties?.private?.rm_id;
    const existente = porGoogleId.get(ev.id) || (rmId && porId.get(rmId)) || null;
    if (existente) vinculados.add(String(existente.id));
    if (existente && existente.google_atualizado_em && ev.updated && new Date(existente.google_atualizado_em).getTime() >= new Date(ev.updated).getTime()) continue;
    const linha = googleParaLinha(ev, conta, existente);
    if (existente) atualizados.push({ id: existente.id, ...linha });
    else novos.push(linha);
  }

  // Apagados no Google (ou fora da agenda): somem do sistema
  const apagar = (linhas || [])
    .filter((l) => l.google_event_id && l.google_calendar_id === conta.email_google && !vistos.has(l.google_event_id))
    .map((l) => l.id);

  if (novos.length) {
    const { error: e } = await cliente.from('agenda_eventos').insert(novos);
    if (e) throw new ErroGoogle('banco', `Não foi possível gravar eventos do Google: ${e.message}`);
  }
  for (const linha of atualizados) {
    const { id, ...campos } = linha;
    await cliente.from('agenda_eventos').update(campos).eq('id', id);
  }
  if (apagar.length) await cliente.from('agenda_eventos').delete().in('id', apagar);

  // Eventos do sistema dessa pessoa que ainda não estão no Google (criados antes da integração ou com falha)
  const pendentes = (linhas || []).filter(
    (l) => !l.google_event_id && !vinculados.has(String(l.id)) && l.responsavel_email === conta.email_sistema && l.status !== 'cancelada'
  );
  for (const l of pendentes) await enviarParaGoogle(l, conta, fetchImpl);

  return { recebidos: novos.length, atualizados: atualizados.length, apagados: apagar.length, enviados: pendentes.length };
}

/** Reconcilia todas as contas (cada uma isolada: o erro de uma não impede as outras). */
export async function sincronizarTodas({ fetchImpl = fetch, renovarCanais = false, urlBase = null } = {}) {
  const config = await carregarConfigGoogle();
  const contas = await carregarContasConectadas(config);
  const resultados = {};
  const erros = {};
  await Promise.all(
    contas.map(async (conta) => {
      try {
        resultados[conta.email_sistema] = await sincronizarConta(conta, fetchImpl);
        if (renovarCanais && urlBase) await garantirCanal(config, conta, urlBase, fetchImpl);
      } catch (e) {
        erros[conta.email_sistema] = e.message;
      }
    })
  );
  const atual = await carregarConfigGoogle();
  await salvarConfigGoogle({ ...atual, canais: { ...atual.canais, ...config.canais }, ultima_sincronizacao: new Date().toISOString(), erros });
  return { resultados, erros };
}

// ------------------------------------------------------------------------------
// Sistema → Google
// ------------------------------------------------------------------------------
async function enviarParaGoogle(linha, conta, fetchImpl = fetch) {
  const corpo = linhaParaGoogle(linha);
  const caminho = `/calendars/${encodeURIComponent(conta.email_google)}/events`;
  const ev = await chamarApi(conta, caminho, { metodo: 'POST', corpo }, fetchImpl);
  await db()
    .from('agenda_eventos')
    .update({ google_event_id: ev.id, google_calendar_id: conta.email_google, google_ical_uid: ev.iCalUID || null, google_atualizado_em: ev.updated || null })
    .eq('id', linha.id);
  return ev;
}

async function apagarNoGoogle(conta, eventId, fetchImpl = fetch) {
  // A agenda pode ter sido desconectada: sem acesso, não há o que apagar lá
  if (!conta) return;
  try {
    await chamarApi(conta, `/calendars/${encodeURIComponent(conta.email_google)}/events/${encodeURIComponent(eventId)}`, { metodo: 'DELETE' }, fetchImpl);
  } catch (e) {
    // Já apagado no Google: segue normalmente
    if (e.status !== 404 && e.status !== 410) throw e;
  }
}

/**
 * Leva ao Google o estado atual de um evento do sistema (criado ou editado).
 * Se o responsável mudou de pessoa, o evento sai da agenda antiga e entra na nova.
 */
export async function espelharEvento(id, fetchImpl = fetch) {
  const contas = await carregarContasConectadas();
  const { data: linha } = await db().from('agenda_eventos').select('*').eq('id', id).maybeSingle();
  if (!linha) return { ok: false, motivo: 'nao_encontrado' };
  const conta = contas.find((c) => c.email_sistema === String(linha.responsavel_email || '').toLowerCase());

  if (linha.google_event_id && (!conta || conta.email_google !== linha.google_calendar_id)) {
    await apagarNoGoogle(contas.find((c) => c.email_google === linha.google_calendar_id), linha.google_event_id, fetchImpl);
    await db().from('agenda_eventos').update({ google_event_id: null, google_calendar_id: null, google_atualizado_em: null }).eq('id', id);
    linha.google_event_id = null;
  }
  if (!conta) return { ok: true, motivo: 'responsavel_sem_google' };
  if (linha.status === 'cancelada') {
    if (linha.google_event_id) {
      await apagarNoGoogle(conta, linha.google_event_id, fetchImpl);
      await db().from('agenda_eventos').update({ google_event_id: null, google_calendar_id: null, google_atualizado_em: null }).eq('id', id);
    }
    return { ok: true };
  }
  if (!linha.google_event_id) {
    await enviarParaGoogle(linha, conta, fetchImpl);
    return { ok: true };
  }
  const ev = await chamarApi(
    conta,
    `/calendars/${encodeURIComponent(conta.email_google)}/events/${encodeURIComponent(linha.google_event_id)}`,
    { metodo: 'PATCH', corpo: linhaParaGoogle(linha) },
    fetchImpl
  );
  await db().from('agenda_eventos').update({ google_atualizado_em: ev.updated || null }).eq('id', id);
  return { ok: true };
}

/** Exclui no Google e no banco (o servidor já conferiu a permissão de quem pediu). */
export async function excluirEvento(linha, fetchImpl = fetch) {
  if (linha.google_event_id && linha.google_calendar_id && googleConfigurado()) {
    const contas = await carregarContasConectadas();
    await apagarNoGoogle(contas.find((c) => c.email_google === linha.google_calendar_id), linha.google_event_id, fetchImpl);
  }
  const { error } = await db().from('agenda_eventos').delete().eq('id', linha.id);
  if (error) throw new ErroGoogle('banco', `Não foi possível excluir o evento: ${error.message}`);
}

// ------------------------------------------------------------------------------
// Avisos do Google (push notifications)
// ------------------------------------------------------------------------------
export function tokenWebhook() {
  return process.env.GOOGLE_AGENDA_WEBHOOK_TOKEN || '';
}

/** Abre (ou renova, se faltar menos de 2 dias para expirar) o canal de avisos de uma agenda. */
async function garantirCanal(config, conta, urlBase, fetchImpl = fetch) {
  if (!tokenWebhook() || !/^https:\/\//.test(urlBase)) return;
  const atual = config.canais?.[conta.email_google];
  if (atual?.expira_em && atual.expira_em - Date.now() > 2 * 86400000) return;
  const canal = await chamarApi(
    conta,
    `/calendars/${encodeURIComponent(conta.email_google)}/events/watch`,
    {
      metodo: 'POST',
      corpo: { id: crypto.randomUUID(), type: 'web_hook', address: `${urlBase}/api/google/agenda/webhook`, token: tokenWebhook() },
    },
    fetchImpl
  );
  config.canais = { ...(config.canais || {}), [conta.email_google]: { id: canal.id, resource_id: canal.resourceId, expira_em: Number(canal.expiration) || Date.now() + 6 * 86400000 } };
  // O canal antigo continua válido até expirar; encerrá-lo evita avisos em dobro
  if (atual?.id && atual?.resource_id) {
    await chamarApi(conta, '/channels/stop', { metodo: 'POST', corpo: { id: atual.id, resourceId: atual.resource_id } }, fetchImpl).catch(() => {});
  }
}

/** Qual conta um aviso do Google se refere (pelo id do canal). */
export async function contaDoCanal(canalId) {
  const config = await carregarConfigGoogle();
  const entrada = Object.entries(config.canais || {}).find(([, c]) => c.id === canalId);
  if (!entrada) return null;
  return (await carregarContasConectadas(config)).find((c) => c.email_google === entrada[0]) || null;
}

/** Endereço público do sistema para o Google chamar (precisa ser https). */
export function urlPublica(request) {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const host = request?.headers?.get('host');
  if (!host) return null;
  // Em desenvolvimento o Google aceita http://localhost como endereço de volta
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : `https://${host}`;
}
