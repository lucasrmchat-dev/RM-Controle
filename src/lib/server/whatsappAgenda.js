/**
 * WhatsApp da agenda no servidor: link seguro de confirmação, envio pelo webhook da
 * plataforma de atendimento e lembretes. Só roda com a chave de serviço do Supabase.
 *
 * Segurança do link público:
 *  - token aleatório de 256 bits; o banco guarda o hash (busca) e uma cópia cifrada (reenvio)
 *  - expira um dia depois da reunião
 *  - a página pública só recebe dados mínimos da reunião, nunca ids ou dados da equipe
 */
import crypto from 'crypto';
import { cifrar, decifrar } from '@/lib/server/googleAgenda';
import { escopoDoRegistro } from '@/lib/server/organizacao';
import {
  validarConfigWhatsapp,
  validarPreferencias,
  CONFIG_WHATSAPP_PADRAO,
  dadosDaReuniao,
  montarCorpo,
  normalizarTelefone,
  inicioDaReuniao,
  lembreteVencido,
} from '@/lib/whatsappAgenda';

export const CHAVE_CONFIG = 'whatsapp_agenda';
export const CHAVE_PREFERENCIAS = 'whatsapp_agenda_preferencias';
export const SEGREDO_URL = 'whatsapp_agenda_url';
export const SEGREDO_TOKEN = 'whatsapp_agenda_token';

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const tokenValido = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

// ------------------------------------------------------------------------------
// Configuração
// ------------------------------------------------------------------------------
export async function lerConfig(db) {
  const { data } = await db.from('sistema_config').select('valor').eq('chave', CHAVE_CONFIG).maybeSingle();
  try {
    return validarConfigWhatsapp(data?.valor || CONFIG_WHATSAPP_PADRAO);
  } catch {
    return validarConfigWhatsapp(CONFIG_WHATSAPP_PADRAO);
  }
}

export async function salvarConfig(db, valor) {
  const config = validarConfigWhatsapp(valor);
  const { error } = await db.from('sistema_config').upsert({ chave: CHAVE_CONFIG, valor: config, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new Error(error.message);
  return config;
}

export async function lerSegredo(db, chave) {
  const { data, error } = await db.rpc('rm_ler_segredo', { p_chave: chave });
  return error ? null : data || null;
}

export async function gravarSegredo(db, chave, valor) {
  const { error } = await db.rpc('rm_gravar_segredo', { p_chave: chave, p_valor: valor });
  if (error) throw new Error(error.message);
}

/**
 * Endereço do webhook: só https e nunca rede interna (o servidor não pode ser usado
 * para acessar máquinas privadas). Em desenvolvimento aceita http://localhost.
 */
export function validarUrlWebhook(valor, { permitirLocal = process.env.NODE_ENV !== 'production' } = {}) {
  let u;
  try {
    u = new URL(String(valor || '').trim());
  } catch {
    throw new Error('Endereço do webhook inválido.');
  }
  const host = u.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (local && permitirLocal) return u.toString();
  if (u.protocol !== 'https:') throw new Error('Use um endereço https:// para o webhook.');
  const privado =
    local ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host) ||
    /^\[?(fc|fd|fe80)/i.test(host);
  if (privado) throw new Error('O webhook precisa ser um endereço público da internet.');
  if (u.username || u.password) throw new Error('Não coloque usuário e senha no endereço; use o campo de token.');
  return u.toString();
}

export async function lerPreferencias(db, email) {
  const { data } = await db.from('sistema_config').select('valor').eq('chave', CHAVE_PREFERENCIAS).maybeSingle();
  return validarPreferencias(data?.valor?.[String(email || '').toLowerCase()] || {});
}

export async function salvarPreferencias(db, email, prefs) {
  const { data } = await db.from('sistema_config').select('valor').eq('chave', CHAVE_PREFERENCIAS).maybeSingle();
  const todas = data?.valor && typeof data.valor === 'object' ? data.valor : {};
  todas[String(email || '').toLowerCase()] = validarPreferencias(prefs);
  const { error } = await db.from('sistema_config').upsert({ chave: CHAVE_PREFERENCIAS, valor: todas, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new Error(error.message);
  return todas[String(email || '').toLowerCase()];
}

// ------------------------------------------------------------------------------
// Link de confirmação
// ------------------------------------------------------------------------------
function expiracao(evento) {
  const inicio = inicioDaReuniao(evento);
  return new Date((inicio || Date.now()) + 24 * 3600 * 1000).toISOString();
}

/** Link público da reunião. Reaproveita o token existente (o link enviado antes continua valendo). */
export async function linkConfirmacao(db, evento, base) {
  const { data: atual } = await db.from('agenda_confirmacoes').select('token_cifrado').eq('evento_id', evento.id).maybeSingle();
  let token = atual?.token_cifrado ? decifrar(atual.token_cifrado) : null;
  if (!tokenValido(token)) {
    token = crypto.randomBytes(32).toString('base64url');
    const { error } = await db
      .from('agenda_confirmacoes')
      .upsert({ evento_id: evento.id, token_hash: hash(token), token_cifrado: cifrar(token), expira_em: expiracao(evento) }, { onConflict: 'evento_id' });
    if (error) throw new Error(/agenda_confirmacoes/.test(error.message) ? 'Rode supabase/migration_whatsapp_agenda.sql no Supabase.' : error.message);
  } else {
    // Reunião remarcada: o link vale até um dia depois do novo horário
    await db.from('agenda_confirmacoes').update({ expira_em: expiracao(evento) }).eq('evento_id', evento.id);
  }
  return `${String(base || '').replace(/\/$/, '')}/r/${token}`;
}

// ------------------------------------------------------------------------------
// Envio
// ------------------------------------------------------------------------------
async function registrar(db, linha) {
  await db.from('whatsapp_envios').insert([{ ...linha, erro: linha.erro ? String(linha.erro).slice(0, 500) : null }]);
}

/**
 * Envia a confirmação ou o lembrete de uma reunião ao cliente.
 * @returns {{ ok: boolean, mensagem: string, previa?: string }}
 */
export async function enviarMensagem(db, { evento, tipo, mensagemTeste = 'confirmacao', por = 'sistema', base, telefone = null, fetchImpl = fetch }) {
  const config = await lerConfig(db);
  if (!config.ativo && tipo !== 'teste') return { ok: false, mensagem: 'O envio pelo WhatsApp está desligado em Configurações avançadas.' };
  const url = await lerSegredo(db, SEGREDO_URL);
  if (!url) return { ok: false, mensagem: 'Falta o endereço do webhook em Configurações avançadas › WhatsApp.' };
  const numero = normalizarTelefone(telefone || evento?.cliente_telefone);
  if (!numero) return { ok: false, mensagem: 'Telefone do cliente inválido. Use DDD + número.' };

  const tipoMensagem = (tipo === 'teste' ? mensagemTeste : tipo) === 'lembrete' ? 'lembrete' : 'confirmacao';
  const usaLink = /\{link_confirmacao\}/.test(JSON.stringify(config[tipoMensagem]));
  const link = evento?.id && (tipoMensagem === 'confirmacao' || usaLink) ? await linkConfirmacao(db, evento, base) : `${String(base || '').replace(/\/$/, '')}/r/exemplo`;
  const dados = { ...dadosDaReuniao(evento, { linkConfirmacao: link, minutosAntes: evento?.lembrete_minutos }), telefone: numero };
  const { corpo, previa } = montarCorpo(config, tipoMensagem, dados);

  const token = await lerSegredo(db, SEGREDO_TOKEN);
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 10000);
  let res = null;
  let erro = null;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
      signal: controle.signal,
      redirect: 'error',
    });
    if (!res.ok) erro = `A plataforma respondeu ${res.status}.`;
  } catch (e) {
    erro = e?.name === 'AbortError' ? 'A plataforma não respondeu em 10 segundos.' : `Não foi possível falar com a plataforma: ${e.message}`;
  } finally {
    clearTimeout(limite);
  }
  const ok = !erro;
  await registrar(db, { evento_id: evento?.id || null, tipo, ok, http_status: res?.status ?? null, erro, por });

  if (evento?.id && tipo === 'confirmacao') {
    await db
      .from('agenda_eventos')
      .update(ok ? { confirmacao_status: 'enviada', confirmacao_enviada_em: new Date().toISOString(), confirmacao_mensagem: null, confirmacao_respondida_em: null } : { confirmacao_status: 'falhou' })
      .eq('id', evento.id);
  }
  if (evento?.id && tipo === 'lembrete' && ok) {
    await db.from('agenda_eventos').update({ lembrete_enviado_em: new Date().toISOString() }).eq('id', evento.id);
  }
  return { ok, mensagem: ok ? 'Mensagem enviada.' : erro, previa };
}

/** Lembretes que venceram (chamado a cada 5 minutos pelo agendador). */
export async function processarLembretes(db, { base, agora = Date.now(), fetchImpl = fetch } = {}) {
  const dia = (d) => new Date(d).toISOString().slice(0, 10);
  const { data, error } = await db
    .from('agenda_eventos')
    .select('*')
    .not('lembrete_minutos', 'is', null)
    .is('lembrete_enviado_em', null)
    .gte('data', dia(agora - 86400000))
    .lte('data', dia(agora + 3 * 86400000));
  if (error) throw new Error(error.message);
  const vencidos = (data || []).filter((e) => lembreteVencido(e, agora));
  const resultados = [];
  for (const evento of vencidos) {
    // Cada reunião usa o webhook e as mensagens da empresa dona dela
    const r = await enviarMensagem(escopoDoRegistro(db, evento), { evento, tipo: 'lembrete', base, fetchImpl });
    resultados.push({ ok: r.ok });
  }
  return { verificados: (data || []).length, enviados: resultados.filter((r) => r.ok).length, falhas: resultados.filter((r) => !r.ok).length };
}

// ------------------------------------------------------------------------------
// Página pública
// ------------------------------------------------------------------------------
async function eventoDoToken(db, token) {
  if (!tokenValido(token)) return null;
  const { data: conf } = await db.from('agenda_confirmacoes').select('evento_id, expira_em').eq('token_hash', hash(token)).maybeSingle();
  if (!conf || new Date(conf.expira_em).getTime() < Date.now()) return null;
  const { data: evento } = await db.from('agenda_eventos').select('*').eq('id', conf.evento_id).maybeSingle();
  return evento || null;
}

/** Só o necessário para o cliente decidir. Nada de ids, e-mails ou dados internos. */
export function visaoPublica(evento) {
  const primeiroNome = String(evento.responsavel_nome || '').trim().split(/\s+/)[0] || '';
  return {
    titulo: String(evento.titulo || 'Reunião').slice(0, 140),
    data: evento.data,
    hora_inicio: String(evento.hora_inicio || '').slice(0, 5),
    hora_fim: String(evento.hora_fim || '').slice(0, 5),
    responsavel: primeiroNome,
    cliente: String(evento.participante_nome || '').trim().split(/\s+/)[0] || '',
    link_reuniao: evento.confirmacao_status === 'confirmada' && /^https:\/\/meet\.google\.com\//.test(evento.link_reuniao || '') ? evento.link_reuniao : null,
    situacao: evento.status === 'cancelada' ? 'cancelada_pela_equipe' : evento.confirmacao_status || 'enviada',
    mensagem: evento.confirmacao_status === 'remarcar' || evento.confirmacao_status === 'cancelada' ? evento.confirmacao_mensagem || '' : '',
    passou: (inicioDaReuniao(evento) || 0) < Date.now(),
  };
}

export async function lerPorToken(db, token) {
  const evento = await eventoDoToken(db, token);
  return evento ? visaoPublica(evento) : null;
}

const ACOES = { confirmar: 'confirmada', remarcar: 'remarcar', cancelar: 'cancelada' };

export async function responderPorToken(db, token, acao, mensagem = '') {
  const evento = await eventoDoToken(db, token);
  if (!evento) return { ok: false, status: 404 };
  if (!ACOES[acao]) return { ok: false, status: 400 };
  if (evento.status === 'cancelada' || (inicioDaReuniao(evento) || 0) < Date.now()) return { ok: false, status: 409 };
  // Texto do cliente: sem marcação, tamanho limitado
  const recado = String(mensagem || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const { error } = await db
    .from('agenda_eventos')
    .update({ confirmacao_status: ACOES[acao], confirmacao_respondida_em: new Date().toISOString(), confirmacao_mensagem: acao === 'confirmar' ? null : recado || null })
    .eq('id', evento.id);
  if (error) return { ok: false, status: 500 };
  return { ok: true, reuniao: visaoPublica({ ...evento, confirmacao_status: ACOES[acao], confirmacao_mensagem: recado }) };
}
