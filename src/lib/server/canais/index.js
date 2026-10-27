/**
 * Conector genérico de WhatsApp. Telas, API e banco falam só com estas funções;
 * cada provedor (Evolution hoje, Baileys próprio amanhã, Meta oficial) implementa a mesma interface:
 *   conectar · situacao · desconectar · reiniciar · remover · enviarTexto · autenticarAviso · lerAviso
 *
 * Todas recebem o banco JÁ PRESO à empresa dona do canal (escopo de src/lib/server/organizacao.js).
 */
import { evolution } from './evolution';
import { meta } from './meta';
import { decifrarSegredos } from './cofre';
import { CONFIG_CHAT_PADRAO, ORDEM_STATUS, assinarMensagem, formasDoTelefone, podeEnviarTextoLivre, previaMensagem, telefoneCanonico, validarConfigChat } from '@/lib/canais';
import { formatarTelefone, normalizarTelefone } from '@/lib/whatsappAgenda';
import { urlPublica } from '@/lib/server/googleAgenda';
import { LIMITE_RECEBIDO, guardarArquivo } from './midia';

const TIPOS_COM_ARQUIVO = ['imagem', 'audio', 'video', 'documento', 'figurinha'];

/**
 * Endereço que o provedor chama para entregar mensagens deste canal.
 * CANAIS_WEBHOOK_BASE serve para testes locais: a Evolution no Docker chega no Mac por http://host.docker.internal:3000
 */
export const enderecoWebhook = (request, canalId) =>
  `${(process.env.CANAIS_WEBHOOK_BASE || urlPublica(request) || '').replace(/\/$/, '')}/api/canais/webhook/${canalId}`;

const PROVEDORES = { evolution, meta };

export function provedorDo(canal) {
  const p = PROVEDORES[canal?.provedor];
  if (!p) throw new Error('Provedor de canal desconhecido.');
  return p;
}

/**
 * Servidor de WhatsApp por QR da plataforma (Evolution): configurado uma vez em EVOLUTION_URL e
 * EVOLUTION_API_KEY. Os canais das empresas usam este servidor, cada um na sua própria instância.
 */
export function servidorQrDaPlataforma() {
  const url = String(process.env.EVOLUTION_URL || '').trim().replace(/\/+$/, '');
  const apikey = String(process.env.EVOLUTION_API_KEY || '').trim();
  return url && apikey ? { url, apikey } : null;
}

export function segredosDo(canal) {
  const segredos = decifrarSegredos(canal?.credenciais_cifradas);
  if (canal?.provedor === 'evolution' && !segredos.url) return servidorQrDaPlataforma() || segredos;
  return segredos;
}

/** Colunas do canal que podem ir para a tela (sem segredos, sem hash do webhook, sem QR antigo). */
export function canalPublico(c) {
  const { credenciais_cifradas, webhook_token_hash, qr_codigo, ...resto } = c;
  return resto;
}

// ------------------------------------------------------------------------------
// Recebimento (avisos do provedor)
// ------------------------------------------------------------------------------
async function nomeDoGrupo(canal, jid, fetchImpl) {
  const p = provedorDo(canal);
  if (!p.nomeDoGrupo) return null;
  return p.nomeDoGrupo(canal, segredosDo(canal), jid, { fetchImpl }).catch(() => null);
}

/** Configuração do Chat da empresa (grupos...). */
export async function configDoChat(db) {
  const { data } = await db.from('sistema_config').select('valor').eq('chave', 'chat').maybeSingle();
  return validarConfigChat(data?.valor || {});
}

/** Liga ou desliga o recebimento de grupos em todos os canais por QR Code da empresa. */
export async function aplicarGruposNosCanais(db, config, { fetchImpl = fetch } = {}) {
  const { data: canais } = await db.from('canais').select('*').eq('provedor', 'evolution');
  const falhas = [];
  for (const canal of canais || []) {
    try {
      await provedorDo(canal).ajustarGrupos(canal, segredosDo(canal), config.grupos !== 'desligado', { fetchImpl });
    } catch (e) {
      falhas.push(`${canal.nome}: ${e.message}`);
    }
  }
  return falhas;
}
async function contatoPorTelefone(db, numero, nome, { grupo = false } = {}) {
  const telefone = grupo ? String(numero) : telefoneCanonico(numero);
  // Procura nas duas formas (com e sem o 9º dígito); o contato antigo passa para a forma certa
  const { data: achados } = await db.from('contatos').select('id, nome, telefone').in('telefone', grupo ? [telefone] : formasDoTelefone(telefone));
  const existente = (achados || []).find((c) => c.telefone === telefone) || (achados || [])[0];
  if (existente) {
    const campos = {};
    if (nome && !existente.nome) campos.nome = nome;
    if (existente.telefone !== telefone && !(achados || []).some((c) => c.telefone === telefone)) campos.telefone = telefone;
    if (Object.keys(campos).length) await db.from('contatos').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', existente.id);
    return existente.id;
  }
  const { data, error } = await db.from('contatos').insert([{ telefone, nome: nome || null }]).select('id').single();
  if (!error) return data.id;
  // Outro aviso criou ao mesmo tempo
  const { data: depois } = await db.from('contatos').select('id').eq('telefone', telefone).maybeSingle();
  if (depois) return depois.id;
  throw new Error(`Não foi possível registrar o contato: ${error.message}`);
}

async function conversaAberta(db, canal, contatoId) {
  const buscar = () => db.from('conversas').select('*').eq('canal_id', canal.id).eq('contato_id', contatoId).neq('status', 'resolvida').maybeSingle();
  const { data } = await buscar();
  if (data) return data;
  const { data: nova, error } = await db
    .from('conversas')
    .insert([{ canal_id: canal.id, contato_id: contatoId, status: 'aguardando', departamento: canal.departamento_padrao || null }])
    .select('*')
    .single();
  if (!error) return nova;
  const { data: depois } = await buscar();
  if (depois) return depois;
  throw new Error(`Não foi possível abrir a conversa: ${error.message}`);
}

/**
 * Grava os eventos de um aviso. Idempotente: o mesmo aviso repetido não duplica nada.
 * @returns {{ mensagens: number, status: number, conexao: string|null }}
 */
export async function registrarEventos(db, canal, eventos, { config = CONFIG_CHAT_PADRAO, fetchImpl = fetch } = {}) {
  const resumo = { mensagens: 0, status: 0, conexao: null };
  const nomesDeGrupo = new Map();
  for (const ev of eventos) {
    if (ev.tipo === 'apagada' || ev.tipo === 'editada') {
      // Feito no WhatsApp (pelo cliente ou pelo celular da empresa): o texto anterior fica guardado
      const { data: msg } = await db.from('mensagens').select('id, conteudo, conteudo_original').eq('id_externo', ev.idExterno).maybeSingle();
      if (!msg) continue;
      const campos =
        ev.tipo === 'apagada'
          ? { apagada_em: new Date().toISOString(), apagada_por: 'whatsapp' }
          : { conteudo: ev.texto, editada_em: new Date().toISOString(), ...(msg.conteudo_original ? {} : { conteudo_original: msg.conteudo }) };
      await db.from('mensagens').update(campos).eq('id', msg.id);
      resumo.mensagens += 1;
      continue;
    }
    if (ev.tipo === 'mensagem') {
      if (ev.grupo && config.grupos === 'desligado') continue;
      let nome = ev.deMim ? null : ev.nome;
      if (ev.grupo) {
        // Nome do grupo: perguntado ao WhatsApp uma vez (e só se o contato ainda não tem nome)
        const { data: jaTem } = await db.from('contatos').select('nome').eq('telefone', ev.telefone).maybeSingle();
        if (!jaTem?.nome) {
          if (!nomesDeGrupo.has(ev.telefone)) nomesDeGrupo.set(ev.telefone, await nomeDoGrupo(canal, ev.telefone, fetchImpl));
          nome = nomesDeGrupo.get(ev.telefone);
        }
      }
      if (ev.tipoMensagem === 'reacao') {
        if (await registrarReacao(db, ev)) resumo.mensagens += 1;
        continue;
      }
      const contatoId = await contatoPorTelefone(db, ev.telefone, nome, { grupo: ev.grupo });
      const conversa = await conversaAberta(db, canal, contatoId);
      const { data: gravada, error } = await db.from('mensagens').insert([
        {
          conversa_id: conversa.id,
          direcao: ev.deMim ? 'saida' : 'entrada',
          tipo: ev.tipoMensagem,
          conteudo: ev.texto || null,
          midia: ev.midia || null,
          status: ev.deMim ? 'enviada' : 'recebida',
          id_externo: ev.idExterno,
          // Em grupo, guarda quem escreveu (aparece no balão)
          autor_nome: ev.participante?.nome || (ev.participante?.telefone ? formatarTelefone(ev.participante.telefone) : null),
          criado_em: ev.em,
        },
      ]).select('id').single();
      if (error) {
        if (/duplicate|unique|23505/i.test(`${error.code} ${error.message}`)) continue; // aviso repetido
        throw new Error(`Não foi possível gravar a mensagem: ${error.message}`);
      }
      await guardarDetalhes(db, gravada.id, { chave: ev.chave, respondeAExterno: ev.respondeA });
      if (TIPOS_COM_ARQUIVO.includes(ev.tipoMensagem)) await guardarArquivoRecebido(db, canal, conversa, gravada.id, ev, fetchImpl);
      const campos = { ultima_mensagem_em: ev.em, ultima_mensagem_texto: previaMensagem(ev) };
      if (!ev.deMim) {
        campos.ultima_entrada_cliente_em = ev.em;
        campos.nao_lidas = (conversa.nao_lidas || 0) + 1;
        // Cliente respondeu: sai de "aguardando cliente"
        if (conversa.status === 'aguardando_cliente') campos.status = 'em_atendimento';
      }
      await db.from('conversas').update(campos).eq('id', conversa.id);
      resumo.mensagens += 1;
    } else if (ev.tipo === 'status') {
      const { data: msg } = await db.from('mensagens').select('id, status').eq('id_externo', ev.idExterno).maybeSingle();
      if (!msg) continue;
      // Avisos chegam fora de ordem: "entregue" atrasado não desfaz "lida"
      if (ev.status !== 'falhou' && (ORDEM_STATUS[ev.status] ?? 0) <= (ORDEM_STATUS[msg.status] ?? 0)) continue;
      await db.from('mensagens').update({ status: ev.status, ...(ev.erro ? { erro: String(ev.erro).slice(0, 300) } : {}) }).eq('id', msg.id);
      resumo.status += 1;
    } else if (ev.tipo === 'conexao') {
      const campos = { status: ev.status, status_detalhe: ev.detalhe || null, atualizado_em: new Date().toISOString() };
      if (ev.qr !== undefined) {
        campos.qr_codigo = ev.qr;
        campos.qr_atualizado_em = new Date().toISOString();
      }
      if (ev.status === 'conectado') {
        campos.qr_codigo = null;
        if (ev.numero) campos.numero = ev.numero;
      }
      await db.from('canais').update(campos).eq('id', canal.id);
      resumo.conexao = ev.status;
    }
  }
  return resumo;
}

/**
 * Chave do WhatsApp e mensagem citada. Gravadas à parte e sem travar: sem a migração das ações do chat
 * (supabase/migration_chat_acoes.sql) a coluna da chave não existe e a mensagem segue normalmente.
 */
async function guardarDetalhes(db, mensagemId, { chave, respondeAExterno, respondeA } = {}) {
  const campos = {};
  if (respondeA) campos.responde_a = respondeA;
  else if (respondeAExterno) {
    const { data: citada } = await db.from('mensagens').select('id').eq('id_externo', respondeAExterno).maybeSingle();
    if (citada) campos.responde_a = citada.id;
  }
  if (campos.responde_a) await db.from('mensagens').update(campos).eq('id', mensagemId);
  if (chave) await db.from('mensagens').update({ chave_externa: chave }).eq('id', mensagemId).then(() => {}, () => {});
}

/**
 * Reação (❤️, 👍...): fica presa à mensagem reagida, não vira mensagem solta na conversa.
 * Cada pessoa tem no máximo uma reação por mensagem; reação vazia = removida.
 */
async function registrarReacao(db, ev) {
  if (!ev.reageA) return false;
  const { data: alvo } = await db.from('mensagens').select('id, conversa_id').eq('id_externo', ev.reageA).maybeSingle();
  if (!alvo) return false;
  const direcao = ev.deMim ? 'saida' : 'entrada';
  const autor = ev.participante?.nome || (ev.participante?.telefone ? formatarTelefone(ev.participante.telefone) : null);
  const { data: anteriores } = await db.from('mensagens').select('id, autor_nome').eq('responde_a', alvo.id).eq('tipo', 'reacao').eq('direcao', direcao);
  for (const r of (anteriores || []).filter((x) => (x.autor_nome || null) === autor)) await db.from('mensagens').delete().eq('id', r.id);
  if (!ev.texto) return true;
  const { error } = await db.from('mensagens').insert([
    { conversa_id: alvo.conversa_id, direcao, tipo: 'reacao', conteudo: ev.texto.slice(0, 16), status: ev.deMim ? 'enviada' : 'recebida', id_externo: ev.idExterno, responde_a: alvo.id, autor_nome: autor, criado_em: ev.em },
  ]);
  if (error && !/duplicate|unique|23505/i.test(`${error.code} ${error.message}`)) throw new Error(`Não foi possível gravar a reação: ${error.message}`);
  return true;
}

/** Baixa o arquivo de uma mensagem recebida e guarda na pasta da empresa. Falhar aqui não perde a mensagem. */
async function guardarArquivoRecebido(db, canal, conversa, mensagemId, ev, fetchImpl) {
  let midia;
  try {
    const p = provedorDo(canal);
    if (!p.baixarMidia) throw new Error('sem suporte');
    const arquivo = await p.baixarMidia(canal, segredosDo(canal), ev, { fetchImpl });
    if (arquivo.dados.length > LIMITE_RECEBIDO) throw new Error('grande');
    midia = { ...(ev.midia || {}), ...(await guardarArquivo({ organizacaoId: conversa.organizacao_id || canal.organizacao_id, conversaId: conversa.id, mensagemId, ...arquivo })) };
  } catch (e) {
    midia = { ...(ev.midia || {}), erro: /grande/.test(e.message) ? 'grande' : 'indisponivel' };
  }
  await db.from('mensagens').update({ midia }).eq('id', mensagemId);
}

// ------------------------------------------------------------------------------
// Envio
// ------------------------------------------------------------------------------
/**
 * Envia texto numa conversa. Grava antes como "pendente" (nada se perde se a rede cair) e atualiza
 * com o resultado. API oficial: só com a janela de 24h aberta.
 */
export async function enviarTextoNaConversa(db, { conversa, texto, autor, assinar = false, respondeA = null, fetchImpl = fetch }) {
  const conteudo = String(texto || '').trim();
  if (!conteudo) throw new Error('Escreva a mensagem.');
  if (conteudo.length > 4096) throw new Error('Mensagem longa demais (máximo de 4.096 caracteres).');
  const { data: canal } = await db.from('canais').select('*').eq('id', conversa.canal_id).maybeSingle();
  if (!canal || !canal.ativo) throw new Error('O canal desta conversa não está disponível.');
  if (!podeEnviarTextoLivre(canal, conversa)) {
    throw new Error('A janela de 24 horas desta conversa fechou. Pela API oficial, só é possível enviar um template aprovado.');
  }
  const { data: contato } = await db.from('contatos').select('telefone').eq('id', conversa.contato_id).maybeSingle();
  // Resposta: a mensagem citada precisa ser desta conversa
  let citada = null;
  if (respondeA) {
    const { data } = await db.from('mensagens').select('*').eq('id', respondeA).maybeSingle();
    if (data?.conversa_id === conversa.id) citada = data;
  }
  const agora = new Date().toISOString();
  const { data: msg, error } = await db
    .from('mensagens')
    .insert([{ conversa_id: conversa.id, direcao: 'saida', tipo: 'texto', conteudo, status: 'pendente', autor_email: autor.email, autor_nome: autor.nome, criado_em: agora, ...(citada ? { responde_a: citada.id } : {}) }])
    .select('*')
    .single();
  if (error) throw new Error(`Não foi possível registrar a mensagem: ${error.message}`);

  try {
    // A tela guarda o texto puro (o nome já aparece no balão); o cliente recebe com a assinatura
    const r = await provedorDo(canal).enviarTexto(canal, segredosDo(canal), contato.telefone, assinar ? assinarMensagem(conteudo, autor.nome) : conteudo, {
      fetchImpl,
      citada: citada?.id_externo ? { idExterno: citada.id_externo, chave: citada.chave_externa || chavePadrao(contato.telefone, citada.direcao === 'saida'), conteudo: citada.conteudo } : null,
    });
    await db.from('mensagens').update({ status: 'enviada', id_externo: r.idExterno }).eq('id', msg.id);
    await guardarDetalhes(db, msg.id, { chave: r.chave });
    // Responder assume a conversa (se ainda estava na fila)
    const campos = { ultima_mensagem_em: agora, ultima_mensagem_texto: conteudo.slice(0, 140), nao_lidas: 0 };
    if (conversa.status === 'aguardando' || !conversa.responsavel_email) Object.assign(campos, { status: 'em_atendimento', responsavel_email: autor.email, responsavel_nome: autor.nome });
    await db.from('conversas').update(campos).eq('id', conversa.id);
    return { ...msg, status: 'enviada', id_externo: r.idExterno };
  } catch (e) {
    await db.from('mensagens').update({ status: 'falhou', erro: String(e.message).slice(0, 300) }).eq('id', msg.id);
    throw e;
  }
}

/** Mensagem para um número (teste do canal ou primeiro contato): abre a conversa se precisar. */
export async function enviarTextoParaNumero(db, { canal, telefone, texto, autor, assinar = false, fetchImpl = fetch }) {
  const numero = normalizarTelefone(telefone);
  if (!numero) throw new Error('Telefone inválido. Use DDD + número.');
  const contatoId = await contatoPorTelefone(db, numero, null);
  const conversa = await conversaAberta(db, canal, contatoId);
  return enviarTextoNaConversa(db, { conversa, texto, autor, assinar, fetchImpl });
}

/** Chave do WhatsApp quando a mensagem é antiga (sem chave guardada): monta pelo telefone do contato. */
export function chavePadrao(telefone, deMim) {
  const t = String(telefone || '');
  return { remoteJid: /@/.test(t) ? t : `${t}@s.whatsapp.net`, fromMe: Boolean(deMim) };
}

/**
 * Envia um arquivo numa conversa (foto, vídeo, documento ou áudio gravado). Guarda primeiro na pasta da
 * empresa (a equipe vê na hora) e depois manda pelo WhatsApp.
 */
export async function enviarMidiaNaConversa(db, { conversa, arquivo, tipo, legenda = '', segundos = null, autor, assinar = false, fetchImpl = fetch }) {
  const { data: canal } = await db.from('canais').select('*').eq('id', conversa.canal_id).maybeSingle();
  if (!canal || !canal.ativo) throw new Error('O canal desta conversa não está disponível.');
  if (!podeEnviarTextoLivre(canal, conversa)) throw new Error('A janela de 24 horas desta conversa fechou. Pela API oficial, só é possível enviar um template aprovado.');
  const texto = String(legenda || '').trim().slice(0, 1024);
  const { data: contato } = await db.from('contatos').select('telefone').eq('id', conversa.contato_id).maybeSingle();
  const agora = new Date().toISOString();
  const { data: msg, error } = await db
    .from('mensagens')
    .insert([{ conversa_id: conversa.id, direcao: 'saida', tipo, conteudo: texto || null, midia: { mime: arquivo.mime, nome: arquivo.nome || null, tamanho: arquivo.dados.length, ...(segundos ? { segundos } : {}) }, status: 'pendente', autor_email: autor.email, autor_nome: autor.nome, criado_em: agora }])
    .select('*')
    .single();
  if (error) throw new Error(`Não foi possível registrar a mensagem: ${error.message}`);

  try {
    const guardado = await guardarArquivo({ organizacaoId: conversa.organizacao_id || canal.organizacao_id, conversaId: conversa.id, mensagemId: msg.id, ...arquivo });
    const midia = { ...msg.midia, ...guardado };
    await db.from('mensagens').update({ midia }).eq('id', msg.id);
    // Áudio de voz não tem legenda; nos demais, a assinatura vai na legenda
    const legendaFinal = tipo === 'audio' ? '' : assinar ? assinarMensagem(texto, autor.nome) : texto;
    const r = await provedorDo(canal).enviarMidia(canal, segredosDo(canal), contato.telefone, { tipo, ...arquivo, legenda: legendaFinal }, { fetchImpl });
    await db.from('mensagens').update({ status: 'enviada', id_externo: r.idExterno }).eq('id', msg.id);
    const campos = { ultima_mensagem_em: agora, ultima_mensagem_texto: previaMensagem({ texto, tipoMensagem: tipo }), nao_lidas: 0 };
    if (conversa.status === 'aguardando' || !conversa.responsavel_email) Object.assign(campos, { status: 'em_atendimento', responsavel_email: autor.email, responsavel_nome: autor.nome });
    await db.from('conversas').update(campos).eq('id', conversa.id);
    return { ...msg, midia, status: 'enviada', id_externo: r.idExterno };
  } catch (e) {
    await db.from('mensagens').update({ status: 'falhou', erro: String(e.message).slice(0, 300) }).eq('id', msg.id);
    throw e;
  }
}
