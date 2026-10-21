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
// calendar.events: ler/escrever eventos · calendarlist.readonly: listar agendas compartilhadas (para escolher)
const ESCOPOS = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
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

// Valores colados no painel da Vercel às vezes vêm com espaço, quebra de linha ou aspas: o Google recusaria
const variavel = (nome) => String(process.env[nome] || '').trim().replace(/^["']|["']$/g, '').trim();
const idCliente = () => variavel('GOOGLE_OAUTH_CLIENT_ID');
const segredoCliente = () => variavel('GOOGLE_OAUTH_CLIENT_SECRET');

export const googleConfigurado = () => Boolean(idCliente() && segredoCliente());

/**
 * Impressão digital da configuração OAuth (para conferir se o servidor publicado usa os mesmos valores
 * que o local, sem revelar a chave secreta): tamanho + 8 primeiros caracteres do SHA-256.
 */
export function diagnosticoOAuth() {
  const impressao = (v) => (v ? crypto.createHash('sha256').update(v).digest('hex').slice(0, 8) : null);
  const segredo = segredoCliente();
  return {
    id_cliente_final: idCliente().replace('.apps.googleusercontent.com', '').slice(-6) || null,
    segredo_tamanho: segredo.length,
    segredo_impressao: impressao(segredo),
    // Caracteres invisíveis (ex.: espaço de largura zero) copiados junto com a chave
    segredo_caracteres_estranhos: /[^A-Za-z0-9_-]/.test(segredo),
    versao_publicada: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local',
  };
}

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
    client_id: idCliente(),
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
      client_id: idCliente(),
      client_secret: segredoCliente(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.refresh_token) {
    const motivos = {
      invalid_client: 'O Google recusou o ID do cliente ou a chave secreta configurados no servidor (confira GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET na Vercel).',
      redirect_uri_mismatch: `O endereço de volta não está autorizado no Google: cadastre ${redirectUri} em "URIs de redirecionamento autorizados".`,
      invalid_grant: 'A autorização expirou antes de ser usada. Tente conectar de novo.',
    };
    throw new ErroGoogle('oauth', motivos[json.error] || json.error_description || `O Google não devolveu a autorização (${json.error || res.status}).`);
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
      client_id: idCliente(),
      client_secret: segredoCliente(),
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

// Bloco que o RM Controle escreve no fim da descrição do evento no Google (legível por quem abre lá)
const MARCA_RM = '— RM Controle —';

/** Separa a descrição do Google em texto livre + campos do bloco do RM Controle. */
export function lerDescricao(descricao) {
  const texto = textoSemHtml(descricao);
  const i = texto.indexOf(MARCA_RM);
  if (i === -1) return { observacoes: texto, campos: {} };
  const campos = {};
  texto
    .slice(i + MARCA_RM.length)
    .split('\n')
    .forEach((linha) => {
      const m = linha.match(/^\s*(Responsável|Empresa):\s*(.+?)\s*$/);
      if (m) campos[m[1] === 'Responsável' ? 'responsavel' : 'empresa'] = m[2];
    });
  return { observacoes: texto.slice(0, i).trim(), campos };
}

/**
 * Evento do Google → campos de agenda_eventos. O responsável é do EVENTO (definido no RM Controle e
 * guardado no Google), não da agenda: agendas compartilhadas são da equipe toda.
 */
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
  const priv = ev.extendedProperties?.private || {};
  const { observacoes, campos } = lerDescricao(ev.description);
  // Ordem: o que o RM Controle gravou no Google > o que já estava no sistema > dono da agenda pessoal
  const temResponsavelNoGoogle = Object.prototype.hasOwnProperty.call(priv, 'rm_responsavel_email');
  // Agenda compartilhada: sem responsável gravado no Google, o evento é da equipe (não herda dono antigo)
  const herdado = conta.principal || existente?.origem === 'sistema';
  const responsavelEmail = temResponsavelNoGoogle
    ? priv.rm_responsavel_email || null
    : herdado
      ? existente?.responsavel_email ?? (conta.principal ? conta.email_sistema : null)
      : null;
  const responsavelNome = temResponsavelNoGoogle
    ? priv.rm_responsavel_nome || campos.responsavel || null
    : herdado
      ? existente?.responsavel_nome ?? (conta.principal ? conta.nome : null)
      : null;
  return {
    titulo: (ev.summary || '(Sem título)').trim().slice(0, 300),
    empresa: priv.rm_empresa ?? campos.empresa ?? existente?.empresa ?? (ev.location && !/^https?:\/\//.test(ev.location) ? ev.location.slice(0, 200) : ''),
    data,
    hora_inicio: horaInicio,
    hora_fim: horaFim,
    dia_inteiro: diaInteiro,
    responsavel_email: responsavelEmail,
    responsavel_nome: responsavelNome,
    link_reuniao: linkDaReuniao(ev),
    status: existente?.status && existente.status !== 'cancelada' ? existente.status : 'agendada',
    tipo: existente?.tipo || 'interna',
    observacoes,
    chamado_id: existente?.chamado_id ?? null,
    origem: existente?.origem || 'google',
    criado_por: existente?.criado_por || ev.organizer?.email || null,
    google_event_id: ev.id,
    google_calendar_id: conta.calendar_id,
    google_ical_uid: ev.iCalUID || null,
    google_atualizado_em: ev.updated || null,
    updated_at: new Date().toISOString(),
  };
}

/** Linha de agenda_eventos → corpo de evento do Google (com o responsável no fim da descrição). */
export function linhaParaGoogle(linha, { gerarMeet = false } = {}) {
  const bloco = [
    linha.responsavel_nome || linha.responsavel_email ? `Responsável: ${linha.responsavel_nome || linha.responsavel_email}` : '',
    linha.empresa && linha.empresa !== 'Cliente Geral' ? `Empresa: ${linha.empresa}` : '',
  ].filter(Boolean);
  const descricao = [linha.observacoes || '', bloco.length ? `${MARCA_RM}\n${bloco.join('\n')}` : ''].filter(Boolean).join('\n\n');
  const meet = /meet\.google\.com/.test(linha.link_reuniao || '');
  const corpo = {
    summary: linha.titulo || 'Reunião',
    description: descricao,
    // O link do Meet já vai na própria conferência; outros links (Zoom, Teams) ficam no local
    location: linha.link_reuniao && !meet ? linha.link_reuniao : '',
    extendedProperties: {
      private: {
        rm_id: String(linha.id),
        rm_responsavel_email: linha.responsavel_email || '',
        rm_responsavel_nome: linha.responsavel_nome || '',
        rm_empresa: linha.empresa && linha.empresa !== 'Cliente Geral' ? linha.empresa : '',
      },
    },
  };
  if (gerarMeet) {
    corpo.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  }
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
const CONFIG_PADRAO = { canais: {}, ultima_sincronizacao: null, erros: {} };

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

// Conexões: cada pessoa tem UMA entrada própria (conta Google + refresh token criptografado), numa chave
// separada do resto da configuração. Assim as outras gravações (última sincronização, canais) nunca
// sobrescrevem uma conexão recém-feita.
async function carregarConexoes() {
  const { data } = await db().from('sistema_config').select('valor').eq('chave', CHAVE_TOKENS).maybeSingle();
  const valor = data?.valor || {};
  // Formato antigo (só o token cifrado, sem a conta) é descartado: a pessoa conecta de novo
  return Object.fromEntries(Object.entries(valor).filter(([, v]) => v && typeof v === 'object' && v.token && v.email_google));
}

async function salvarConexoes(conexoes) {
  const { error } = await db()
    .from('sistema_config')
    .upsert({ chave: CHAVE_TOKENS, valor: conexoes, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new ErroGoogle('config', `Não foi possível guardar a conexão com o Google: ${error.message}`);
}

/** Contas conectadas, sem o token (para mostrar na tela). */
export async function listarContasConectadas() {
  const conexoes = await carregarConexoes();
  return Object.entries(conexoes).map(([emailSistema, c]) => ({
    email_sistema: emailSistema,
    email_google: c.email_google,
    nome: c.nome || '',
    conectado_em: c.conectado_em || null,
    agendas: (c.agendas || []).map(({ id, nome }) => ({ id, nome })),
  }));
}

/**
 * Agendas a sincronizar, já com o refresh token decifrado (uso exclusivo do servidor).
 * Cada conexão gera a agenda principal da pessoa e, opcionalmente, agendas compartilhadas com ela
 * (ex.: a agenda do suporte@), cada uma atribuída a alguém da equipe.
 *  - email_google / refresh_token: de quem conectou (autenticação)
 *  - calendar_id: a agenda no Google
 *  - email_sistema / nome: dono da agenda pessoal (vazio nas compartilhadas, que são da equipe)
 * Uma mesma agenda nunca entra duas vezes: a do próprio dono (conectada por ele) tem prioridade.
 */
export async function carregarContasConectadas() {
  const conexoes = await carregarConexoes();
  const principais = [];
  const extras = [];
  for (const [emailSistema, c] of Object.entries(conexoes)) {
    const refreshToken = decifrar(c.token);
    if (!refreshToken) continue;
    const base = { email_google: c.email_google, refresh_token: refreshToken, conectado_por: emailSistema };
    principais.push({
      ...base,
      calendar_id: c.email_google,
      email_sistema: emailSistema,
      nome: c.nome || '',
      rotulo: `Agenda de ${(c.nome || c.email_google).split(' ')[0]}`,
      principal: true,
    });
    // Agendas compartilhadas são da equipe: não têm dono no sistema
    (c.agendas || []).forEach((a) => {
      if (a?.id) extras.push({ ...base, calendar_id: a.id, email_sistema: null, nome: '', rotulo: a.nome || a.id, cor: a.cor || null, principal: false });
    });
  }
  const vistas = new Set();
  return [...principais, ...extras].filter((a) => (vistas.has(a.calendar_id) ? false : vistas.add(a.calendar_id)));
}

/** Agendas do Google que quem conectou pode editar (para escolher quais sincronizar). */
export async function listarAgendasDisponiveis(emailSistema, fetchImpl = fetch) {
  const conexoes = await carregarConexoes();
  const c = conexoes[emailSistema];
  if (!c) throw new ErroGoogle('desconectado', 'Conecte o seu Google Agenda primeiro.');
  const conta = { email_google: c.email_google, refresh_token: decifrar(c.token) };
  let lista;
  try {
    lista = await chamarApi(conta, '/users/me/calendarList', { consulta: { minAccessRole: 'writer', maxResults: 250 } }, fetchImpl);
  } catch (e) {
    // Conectado antes desta permissão existir: precisa autorizar de novo para ver a lista
    if (e.status === 403) throw new ErroGoogle('reconectar', 'Para listar as agendas compartilhadas, conecte o Google Agenda de novo e permita "ver a lista de agendas".');
    throw e;
  }
  const escolhidas = new Map((c.agendas || []).map((a) => [a.id, a]));
  return (lista.items || [])
    .filter((cal) => cal.id !== c.email_google && !cal.primary && !/#holiday@|#contacts@|#weeknum@/.test(cal.id))
    .map((cal) => ({
      id: cal.id,
      nome: cal.summaryOverride || cal.summary || cal.id,
      cor: cal.backgroundColor || null,
      selecionada: escolhidas.has(cal.id),
    }));
}

/** Salva quais agendas compartilhadas a pessoa quer sincronizar (são da equipe toda). */
export async function salvarAgendasEscolhidas(emailSistema, ids, fetchImpl = fetch) {
  const disponiveis = new Map((await listarAgendasDisponiveis(emailSistema, fetchImpl)).map((a) => [a.id, a]));
  const validas = [];
  for (const id of ids) {
    const a = disponiveis.get(id);
    if (!a) throw new ErroGoogle('agenda', 'Uma das agendas escolhidas não está mais disponível para você no Google.');
    validas.push({ id, nome: a.nome, cor: a.cor || null });
  }
  const conexoes = await carregarConexoes();
  if (!conexoes[emailSistema]) throw new ErroGoogle('desconectado', 'Conecte o seu Google Agenda primeiro.');
  conexoes[emailSistema] = { ...conexoes[emailSistema], agendas: validas };
  await salvarConexoes(conexoes);
  return validas;
}

/** Agendas sincronizadas (de toda a equipe) para escolher onde criar um evento. */
export async function listarAgendasSincronizadas() {
  const [alvos, config] = await Promise.all([carregarContasConectadas(), carregarConfigGoogle()]);
  return {
    agendas: alvos.map((a) => ({ id: a.calendar_id, nome: a.rotulo, cor: a.cor || null, compartilhada: !a.principal })),
    padrao: agendaPadrao(alvos, config),
  };
}

/** Onde os novos eventos são criados: a escolhida pela equipe, senão a primeira compartilhada, senão a pessoal. */
function agendaPadrao(alvos, config) {
  if (config.agenda_padrao && alvos.some((a) => a.calendar_id === config.agenda_padrao)) return config.agenda_padrao;
  return (alvos.find((a) => !a.principal) || alvos[0])?.calendar_id || null;
}

export async function definirAgendaPadrao(calendarId) {
  const alvos = await carregarContasConectadas();
  if (!alvos.some((a) => a.calendar_id === calendarId)) throw new ErroGoogle('agenda', 'Essa agenda não está sincronizada.');
  const config = await carregarConfigGoogle();
  await salvarConfigGoogle({ ...config, agenda_padrao: calendarId });
}

/** Grava a conexão de uma pessoa (substitui a anterior, se houver). */
export async function registrarConexao({ emailSistema, nome, emailGoogle, refreshToken }) {
  const conexoes = await carregarConexoes();
  // A mesma conta Google não pode alimentar duas pessoas do sistema
  const anterior = conexoes[emailSistema];
  Object.keys(conexoes).forEach((k) => conexoes[k].email_google === emailGoogle && delete conexoes[k]);
  conexoes[emailSistema] = {
    email_google: emailGoogle,
    nome: nome || '',
    token: cifrar(refreshToken),
    conectado_em: new Date().toISOString(),
    // Reconectar a mesma conta mantém as agendas compartilhadas já escolhidas
    agendas: anterior?.email_google === emailGoogle ? anterior.agendas || [] : [],
  };
  await salvarConexoes(conexoes);
  await limparAvisos(emailSistema);
}

async function limparAvisos(emailSistema) {
  const config = await carregarConfigGoogle();
  const erros = { ...(config.erros || {}) };
  const falhas = { ...(config.falhas_conexao || {}) };
  delete erros[emailSistema];
  delete falhas[emailSistema];
  await salvarConfigGoogle({ ...config, erros, falhas_conexao: falhas });
}

/** Erro de sincronização de uma pessoa (aparece em Configurações › Agenda). */
export async function registrarErroSincronizacao(emailSistema, mensagem) {
  const config = await carregarConfigGoogle();
  await salvarConfigGoogle({ ...config, erros: { ...(config.erros || {}), [emailSistema]: mensagem } });
}

/** Guarda o motivo de uma falha ao conectar, para a pessoa ver em Configurações › Agenda. */
export async function registrarFalhaConexao(emailSistema, mensagem) {
  const config = await carregarConfigGoogle();
  await salvarConfigGoogle({ ...config, falhas_conexao: { ...(config.falhas_conexao || {}), [emailSistema]: { mensagem, em: new Date().toISOString() } } });
}

/** Desconecta: revoga no Google, encerra o canal de avisos e esquece o token. */
export async function desconectar(emailSistema, fetchImpl = fetch) {
  const minhas = (await carregarContasConectadas()).filter((c) => c.conectado_por === emailSistema);
  const config = await carregarConfigGoogle();
  if (minhas.length) {
    const canais = { ...(config.canais || {}) };
    for (const alvo of minhas) {
      const canal = canais[alvo.calendar_id];
      if (canal?.id) {
        await chamarApi(alvo, '/channels/stop', { metodo: 'POST', corpo: { id: canal.id, resourceId: canal.resource_id } }, fetchImpl).catch(() => {});
      }
      delete canais[alvo.calendar_id];
    }
    await fetchImpl(`${URL_REVOGAR}?token=${encodeURIComponent(minhas[0].refresh_token)}`, { method: 'POST' }).catch(() => {});
    cacheTokens.delete(minhas[0].email_google);
    await salvarConfigGoogle({ ...config, canais });
  }
  const conexoes = await carregarConexoes();
  delete conexoes[emailSistema];
  await salvarConexoes(conexoes);
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
      `/calendars/${encodeURIComponent(conta.calendar_id)}/events`,
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

// Cópias antigas do prazo de demandas (o prazo já aparece na Agenda a partir da própria demanda):
// não são compromissos de verdade e não devem ir para o Google
const ehCopiaDePrazo = (l) => Boolean(l.chamado_id) || /^\[Prazo Demanda\]/.test(l.titulo || '');

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
    .eq('google_calendar_id', conta.calendar_id);
  if (error) throw new ErroGoogle('banco', `Não foi possível ler a agenda: ${error.message}`);

  const porGoogleId = new Map();
  const porId = new Map();
  (linhas || []).forEach((l) => {
    porId.set(String(l.id), l);
    if (l.google_event_id && l.google_calendar_id === conta.calendar_id) porGoogleId.set(l.google_event_id, l);
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
    const linha = googleParaLinha(ev, conta, existente);
    // Sem mudança no Google, só regrava se o responsável calculado mudou (ex.: regra nova de agendas da equipe)
    const semMudanca = existente && existente.google_atualizado_em && ev.updated && new Date(existente.google_atualizado_em).getTime() >= new Date(ev.updated).getTime();
    if (semMudanca && (existente.responsavel_email || null) === linha.responsavel_email) continue;
    if (existente) atualizados.push({ id: existente.id, ...linha });
    else novos.push(linha);
  }

  // Apagados no Google (ou fora da agenda): somem do sistema
  const apagar = (linhas || [])
    .filter((l) => l.google_event_id && l.google_calendar_id === conta.calendar_id && !vistos.has(l.google_event_id))
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
    (l) =>
      !l.google_event_id &&
      !vinculados.has(String(l.id)) &&
      l.status !== 'cancelada' &&
      !ehCopiaDePrazo(l)
  );
  for (const l of pendentes) await enviarParaGoogle(l, conta, fetchImpl);

  return { recebidos: novos.length, atualizados: atualizados.length, apagados: apagar.length, enviados: pendentes.length };
}

/** Reconcilia todas as contas (cada uma isolada: o erro de uma não impede as outras). */
export async function sincronizarTodas({ fetchImpl = fetch, renovarCanais = false, urlBase = null } = {}) {
  const config = await carregarConfigGoogle();
  const contas = await carregarContasConectadas();
  const resultados = {};
  const erros = {};
  await Promise.all(
    contas.map(async (conta) => {
      try {
        resultados[conta.calendar_id] = await sincronizarConta(conta, fetchImpl);
        if (renovarCanais && urlBase) await garantirCanal(config, conta, urlBase, fetchImpl);
      } catch (e) {
        // O erro aparece para quem conectou (é quem consegue resolver)
        const prefixo = conta.principal ? '' : `Agenda ${conta.nome ? `de ${conta.nome}` : conta.calendar_id}: `;
        erros[conta.conectado_por] = `${erros[conta.conectado_por] ? `${erros[conta.conectado_por]} · ` : ''}${prefixo}${e.message}`;
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
async function enviarParaGoogle(linha, conta, fetchImpl = fetch, { gerarMeet = false } = {}) {
  const corpo = linhaParaGoogle(linha, { gerarMeet });
  const caminho = `/calendars/${encodeURIComponent(conta.calendar_id)}/events`;
  const ev = await chamarApi(conta, caminho, { metodo: 'POST', corpo, consulta: gerarMeet ? { conferenceDataVersion: 1 } : undefined }, fetchImpl);
  await db()
    .from('agenda_eventos')
    .update({
      google_event_id: ev.id,
      google_calendar_id: conta.calendar_id,
      google_ical_uid: ev.iCalUID || null,
      google_atualizado_em: ev.updated || null,
      ...(gerarMeet && ev.hangoutLink ? { link_reuniao: ev.hangoutLink } : {}),
    })
    .eq('id', linha.id);
  return ev;
}

async function apagarNoGoogle(conta, eventId, fetchImpl = fetch) {
  // A agenda pode ter sido desconectada: sem acesso, não há o que apagar lá
  if (!conta) return;
  try {
    await chamarApi(conta, `/calendars/${encodeURIComponent(conta.calendar_id)}/events/${encodeURIComponent(eventId)}`, { metodo: 'DELETE' }, fetchImpl);
  } catch (e) {
    // Já apagado no Google: segue normalmente
    if (e.status !== 404 && e.status !== 410) throw e;
  }
}

/**
 * Leva ao Google o estado atual de um evento do sistema (criado, editado, remarcado ou cancelado).
 * O evento vai para a agenda escolhida nele (ou a agenda padrão da equipe).
 */
export async function espelharEvento(id, fetchImpl = fetch, { gerarMeet = false } = {}) {
  const [alvos, config] = await Promise.all([carregarContasConectadas(), carregarConfigGoogle()]);
  const { data: linha } = await db().from('agenda_eventos').select('*').eq('id', id).maybeSingle();
  if (!linha) return { ok: false, motivo: 'nao_encontrado' };
  if (ehCopiaDePrazo(linha) && !linha.google_event_id) return { ok: true, motivo: 'copia_de_prazo' };

  const destino = linha.google_calendar_id || agendaPadrao(alvos, config);
  const conta = alvos.find((a) => a.calendar_id === destino);
  if (!conta) return { ok: true, motivo: 'agenda_sem_conexao' };
  if (!linha.google_calendar_id) {
    await db().from('agenda_eventos').update({ google_calendar_id: destino }).eq('id', id);
    linha.google_calendar_id = destino;
  }

  if (linha.status === 'cancelada') {
    if (linha.google_event_id) {
      await apagarNoGoogle(conta, linha.google_event_id, fetchImpl);
      await db().from('agenda_eventos').update({ google_event_id: null, google_atualizado_em: null }).eq('id', id);
    }
    return { ok: true };
  }
  if (!linha.google_event_id) {
    const ev = await enviarParaGoogle(linha, conta, fetchImpl, { gerarMeet });
    return { ok: true, link_reuniao: gerarMeet ? ev.hangoutLink || null : undefined };
  }
  const ev = await chamarApi(
    conta,
    `/calendars/${encodeURIComponent(conta.calendar_id)}/events/${encodeURIComponent(linha.google_event_id)}`,
    { metodo: 'PATCH', corpo: linhaParaGoogle(linha, { gerarMeet }), consulta: gerarMeet ? { conferenceDataVersion: 1 } : undefined },
    fetchImpl
  );
  await db()
    .from('agenda_eventos')
    .update({ google_atualizado_em: ev.updated || null, ...(gerarMeet && ev.hangoutLink ? { link_reuniao: ev.hangoutLink } : {}) })
    .eq('id', id);
  return { ok: true, link_reuniao: gerarMeet ? ev.hangoutLink || null : undefined };
}

/** Exclui no Google e no banco (o servidor já conferiu a permissão de quem pediu). */
export async function excluirEvento(linha, fetchImpl = fetch) {
  if (linha.google_event_id && linha.google_calendar_id && googleConfigurado()) {
    const contas = await carregarContasConectadas();
    await apagarNoGoogle(contas.find((c) => c.calendar_id === linha.google_calendar_id), linha.google_event_id, fetchImpl);
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
  const atual = config.canais?.[conta.calendar_id];
  if (atual?.expira_em && atual.expira_em - Date.now() > 2 * 86400000) return;
  const canal = await chamarApi(
    conta,
    `/calendars/${encodeURIComponent(conta.calendar_id)}/events/watch`,
    {
      metodo: 'POST',
      corpo: { id: crypto.randomUUID(), type: 'web_hook', address: `${urlBase}/api/google/agenda/webhook`, token: tokenWebhook() },
    },
    fetchImpl
  );
  config.canais = { ...(config.canais || {}), [conta.calendar_id]: { id: canal.id, resource_id: canal.resourceId, expira_em: Number(canal.expiration) || Date.now() + 6 * 86400000 } };
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
  return (await carregarContasConectadas()).find((c) => c.calendar_id === entrada[0]) || null;
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
