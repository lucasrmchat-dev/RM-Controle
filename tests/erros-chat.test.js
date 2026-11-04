import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDeFalhaDeEnvio, ERROS_CHAT, explicarErroChat, relatorioErroChat } from '../src/lib/errosChat.js';

test('erros do chat: cada texto técnico conhecido vira o código certo', () => {
  const casos = {
    'Evolution respondeu 404': 'CHAT-101',
    'A Evolution API não respondeu em 15 segundos. Confira se ela está ligada.': 'CHAT-102',
    'Não foi possível falar com a Evolution API. Confira o endereço e se ela está ligada.': 'CHAT-103',
    'Evolution respondeu 401: Unauthorized': 'CHAT-104',
    'Evolution respondeu 400: Connection Closed': 'CHAT-105',
    'Evolution respondeu 400: [{"jid":"5585999990000@s.whatsapp.net","exists":false}]': 'CHAT-106',
    'Meta respondeu 429: (#131056) rate limit hit': 'CHAT-107',
    'Evolution respondeu 500: Internal Server Error': 'CHAT-108',
    'A janela de 24 horas desta conversa fechou. Pela API oficial, só é possível enviar um template aprovado.': 'CHAT-201',
    'Meta respondeu 400: (#131047) Re-engagement message': 'CHAT-201',
    'Meta respondeu 400: (#100) Invalid parameter': 'CHAT-202',
    'Arquivo grande demais.': 'CHAT-301',
    'Pela API oficial, grave o áudio em outro navegador (Firefox) ou envie um arquivo .mp3/.ogg.': 'CHAT-302',
    'O canal desta conversa não está disponível.': 'CHAT-401',
    'Telefone inválido. Use DDD + número.': 'CHAT-402',
    'Não foi possível registrar a mensagem: violates check constraint': 'CHAT-501',
    'algo totalmente novo aconteceu': 'CHAT-000',
    '': 'CHAT-000',
  };
  for (const [texto, codigo] of Object.entries(casos)) assert.equal(explicarErroChat(texto).codigo, codigo, texto);
});

test('erros do chat: códigos únicos, textos completos e relatório para o desenvolvimento', () => {
  const codigos = ERROS_CHAT.map((e) => e.codigo);
  assert.equal(new Set(codigos).size, codigos.length, 'código repetido');
  for (const e of ERROS_CHAT) assert.ok(e.titulo && e.explicacao && e.oQueFazer && e.paraDev, e.codigo);
  const erro = explicarErroChat('Evolution respondeu 404');
  assert.equal(erro.tecnico, 'Evolution respondeu 404');
  assert.equal('reconhece' in erro, false);
  const texto = relatorioErroChat(erro, { mensagemId: 'm1', conversaId: 'c1', quando: '2026-11-03T11:08:00Z', conteudo: 'oi' });
  for (const trecho of ['CHAT-101', 'Conversa: c1', 'Mensagem: m1', 'Erro técnico: Evolution respondeu 404', 'O que verificar:']) assert.ok(texto.includes(trecho), trecho);
});

test('aviso de falha de envio: texto simples, sem "Evolution respondeu"', () => {
  const aviso = avisoDeFalhaDeEnvio('Evolution respondeu 404');
  assert.match(aviso, /Servidor do WhatsApp fora do ar/);
  assert.doesNotMatch(aviso, /Evolution respondeu/);
  // Texto fora do catálogo continua aparecendo como veio, para não esconder o problema
  assert.equal(avisoDeFalhaDeEnvio('Algo novo deu errado'), 'Algo novo deu errado');
});
