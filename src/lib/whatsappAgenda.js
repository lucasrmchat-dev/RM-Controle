/**
 * WhatsApp da agenda: pedido de confirmação e lembrete de reunião enviados ao cliente
 * por um webhook da plataforma de atendimento (RM Chat). Regras puras, usadas no navegador
 * e no servidor; testadas em tests/whatsapp-agenda.test.js.
 *
 * Dois tipos de canal:
 *  - API oficial (Meta): mensagem iniciada pela empresa precisa de template aprovado;
 *    o texto é fixo na Meta e só as variáveis ({{1}}, {{2}}…) mudam.
 *  - QR Code: aceita texto livre ("personalizada") ou um texto fixo cadastrado na
 *    plataforma, preenchido só com variáveis ("fixa").
 */

export const CANAIS = {
  api_oficial: { rotulo: 'API oficial (Meta)', modos: ['template'] },
  qrcode: { rotulo: 'QR Code', modos: ['personalizada', 'fixa'] },
};

export const MODOS = {
  template: { rotulo: 'Template aprovado', descricao: 'Texto fixo aprovado na Meta; você define só as variáveis.' },
  fixa: { rotulo: 'Mensagem fixa', descricao: 'Texto cadastrado na plataforma; você define só as variáveis.' },
  personalizada: { rotulo: 'Mensagem personalizada', descricao: 'O texto inteiro é escrito aqui, com variáveis.' },
};

/** Variáveis disponíveis nas mensagens e no corpo da requisição. */
export const VARIAVEIS = [
  { id: 'cliente_nome', rotulo: 'Nome do cliente' },
  { id: 'titulo', rotulo: 'Título da reunião' },
  { id: 'data', rotulo: 'Data (30/10/2026)' },
  { id: 'dia_semana', rotulo: 'Dia da semana' },
  { id: 'hora', rotulo: 'Hora (14:00)' },
  { id: 'data_hora', rotulo: 'Data e hora por extenso' },
  { id: 'responsavel', rotulo: 'Quem conduz a reunião' },
  { id: 'empresa', rotulo: 'Empresa' },
  { id: 'link_confirmacao', rotulo: 'Link para confirmar, remarcar ou cancelar' },
  { id: 'link_reuniao', rotulo: 'Link da reunião (Meet)' },
  { id: 'tempo_antes', rotulo: 'Quanto falta (lembrete)' },
  { id: 'telefone', rotulo: 'Telefone do cliente' },
];

const MENSAGEM_CONFIRMACAO =
  'Olá, {cliente_nome}! Sua reunião "{titulo}" com {responsavel} está marcada para {data_hora}.\n\nConfirme, remarque ou cancele por aqui: {link_confirmacao}';
const MENSAGEM_LEMBRETE = 'Olá, {cliente_nome}! Passando para lembrar: sua reunião "{titulo}" começa em {tempo_antes}, às {hora}.\n\n{link_reuniao}';

const mensagemPadrao = (texto, template) => ({ modo: 'personalizada', template, idioma: 'pt_BR', variaveis: ['{cliente_nome}', '{data_hora}', '{link_confirmacao}'], mensagem: texto });

export const CONFIG_WHATSAPP_PADRAO = {
  ativo: false,
  canal: 'qrcode',
  confirmacao: mensagemPadrao(MENSAGEM_CONFIRMACAO, 'confirmacao_reuniao'),
  lembrete: { ...mensagemPadrao(MENSAGEM_LEMBRETE, 'lembrete_reuniao'), variaveis: ['{cliente_nome}', '{tempo_antes}', '{hora}'] },
  corpo: '', // vazio = corpo padrão do modo
};

export const LEMBRETE_OPCOES = [15, 30, 45, 60, 120, 1440];

export const PREFERENCIAS_PADRAO = { confirmacao: 'perguntar', lembrete: 'perguntar', lembrete_minutos: 60 };

const texto = (v, max) => String(v ?? '').slice(0, max);

function validarMensagem(m, canal, padrao) {
  const modos = CANAIS[canal].modos;
  const modo = modos.includes(m?.modo) ? m.modo : modos[0];
  const variaveis = (Array.isArray(m?.variaveis) ? m.variaveis : padrao.variaveis).map((v) => texto(v, 200).trim()).filter(Boolean).slice(0, 10);
  return {
    modo,
    template: texto(m?.template ?? padrao.template, 120).trim(),
    idioma: texto(m?.idioma ?? 'pt_BR', 12).trim() || 'pt_BR',
    variaveis,
    mensagem: texto(m?.mensagem ?? padrao.mensagem, 1000),
  };
}

/** Valida a configuração salva pelo administrador. Lança erro com mensagem legível. */
export function validarConfigWhatsapp(valor) {
  const canal = CANAIS[valor?.canal] ? valor.canal : CONFIG_WHATSAPP_PADRAO.canal;
  const config = {
    ativo: Boolean(valor?.ativo),
    canal,
    confirmacao: validarMensagem(valor?.confirmacao, canal, CONFIG_WHATSAPP_PADRAO.confirmacao),
    lembrete: validarMensagem(valor?.lembrete, canal, CONFIG_WHATSAPP_PADRAO.lembrete),
    corpo: texto(valor?.corpo, 4000).trim(),
  };
  if (config.corpo) {
    try {
      const obj = JSON.parse(config.corpo);
      if (!obj || typeof obj !== 'object') throw new Error();
    } catch {
      throw new Error('O corpo da requisição precisa ser um JSON válido.');
    }
  }
  for (const tipo of ['confirmacao', 'lembrete']) {
    const m = config[tipo];
    if (m.modo === 'template' && !m.template) {
      throw new Error(`Informe o nome do template de ${tipo === 'confirmacao' ? 'confirmação' : 'lembrete'}.`);
    }
    if (m.modo === 'personalizada' && !m.mensagem.trim()) {
      throw new Error(`Escreva a mensagem de ${tipo === 'confirmacao' ? 'confirmação' : 'lembrete'}.`);
    }
  }
  return config;
}

export function validarPreferencias(p) {
  const opcao = (v, padrao) => (['sempre', 'perguntar', 'nunca'].includes(v) ? v : padrao);
  const minutos = Number(p?.lembrete_minutos);
  return {
    confirmacao: opcao(p?.confirmacao, PREFERENCIAS_PADRAO.confirmacao),
    lembrete: opcao(p?.lembrete, PREFERENCIAS_PADRAO.lembrete),
    lembrete_minutos: Number.isFinite(minutos) && minutos >= 5 && minutos <= 2880 ? Math.round(minutos) : PREFERENCIAS_PADRAO.lembrete_minutos,
  };
}

/**
 * Telefone em formato internacional só com dígitos (Brasil: 55 + DDD + número).
 * Retorna null quando não parece um telefone válido.
 */
export function normalizarTelefone(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  return d.length >= 10 && d.length <= 15 && !d.startsWith('55') ? d : null;
}

/** "(85) 99999-0000" para exibir. */
export function formatarTelefone(valor) {
  const d = normalizarTelefone(valor);
  if (!d) return String(valor || '');
  if (!d.startsWith('55')) return `+${d}`;
  const local = d.slice(2);
  const ddd = local.slice(0, 2);
  const num = local.slice(2);
  return `(${ddd}) ${num.length === 9 ? `${num.slice(0, 5)}-${num.slice(5)}` : `${num.slice(0, 4)}-${num.slice(4)}`}`;
}

export function textoTempoAntes(minutos) {
  const m = Number(minutos) || 0;
  if (m >= 1440 && m % 1440 === 0) return m === 1440 ? '1 dia' : `${m / 1440} dias`;
  if (m >= 60 && m % 60 === 0) return m === 60 ? '1 hora' : `${m / 60} horas`;
  if (m > 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return `${m} minutos`;
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Dados de uma reunião para preencher as variáveis. */
export function dadosDaReuniao(evento, { linkConfirmacao = '', minutosAntes = null } = {}) {
  const [a, m, d] = String(evento?.data || '').split('-').map(Number);
  const dia = a ? new Date(Date.UTC(a, m - 1, d)) : null;
  const hora = String(evento?.hora_inicio || '').slice(0, 5);
  const data = a ? `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}` : '';
  const diaSemana = dia ? DIAS[dia.getUTCDay()] : '';
  return {
    cliente_nome: String(evento?.participante_nome || evento?.empresa || 'cliente').trim(),
    titulo: String(evento?.titulo || 'Reunião').trim(),
    data,
    dia_semana: diaSemana,
    hora,
    data_hora: dia ? `${diaSemana}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} às ${hora}` : '',
    responsavel: String(evento?.responsavel_nome || 'nossa equipe').trim(),
    empresa: String(evento?.empresa || '').trim(),
    link_confirmacao: linkConfirmacao,
    link_reuniao: String(evento?.link_reuniao || '').trim(),
    tempo_antes: minutosAntes ? textoTempoAntes(minutosAntes) : '',
    telefone: normalizarTelefone(evento?.cliente_telefone) || '',
  };
}

/** Troca {variavel} pelo valor. Variável desconhecida fica vazia. */
export function preencher(textoBase, dados) {
  return String(textoBase || '').replace(/\{([a-z_]+)\}/g, (_, chave) => (dados[chave] ?? '').toString());
}

export function corpoPadrao(modo) {
  return modo === 'personalizada'
    ? { number: '{telefone}', body: '{mensagem}' }
    : { number: '{telefone}', template: '{template}', language: '{idioma}', variables: '{variaveis}' };
}

/**
 * Monta o JSON enviado ao webhook. Os valores entram como texto JSON (sem concatenação de
 * strings), então nenhuma resposta do cliente ou nome consegue quebrar a estrutura.
 * "{variaveis}" sozinho num campo vira a lista de variáveis já preenchidas.
 */
export function montarCorpo(config, tipo, dados) {
  const m = config[tipo];
  const mensagem = m.modo === 'personalizada' ? preencher(m.mensagem, dados).trim() : '';
  const variaveis = m.variaveis.map((v) => preencher(v, dados));
  const valores = { ...dados, mensagem, template: m.template, idioma: m.idioma, tipo };
  const modelo = config.corpo ? JSON.parse(config.corpo) : corpoPadrao(m.modo);
  const percorrer = (no) => {
    if (typeof no === 'string') return no.trim() === '{variaveis}' ? variaveis : preencher(no, valores);
    if (Array.isArray(no)) return no.map(percorrer);
    if (no && typeof no === 'object') return Object.fromEntries(Object.entries(no).map(([k, v]) => [k, percorrer(v)]));
    return no;
  };
  return { corpo: percorrer(modelo), previa: m.modo === 'personalizada' ? mensagem : `${m.modo === 'template' ? 'Template' : 'Mensagem fixa'} "${m.template || 'cadastrada na plataforma'}" com: ${variaveis.join(' · ')}` };
}

/** Início da reunião como instante absoluto (a agenda guarda dia e hora de Brasília). */
export function inicioDaReuniao(evento, fuso = '-03:00') {
  if (!evento?.data || !evento?.hora_inicio) return null;
  const t = new Date(`${evento.data}T${String(evento.hora_inicio).slice(0, 5)}:00${fuso}`).getTime();
  return Number.isFinite(t) ? t : null;
}

/** O lembrete desta reunião deve sair agora? */
export function lembreteVencido(evento, agora = Date.now()) {
  if (!evento?.lembrete_minutos || evento.lembrete_enviado_em || !evento.cliente_telefone) return false;
  if (['cancelada', 'concluida'].includes(evento.status) || evento.confirmacao_status === 'cancelada') return false;
  const inicio = inicioDaReuniao(evento);
  if (!inicio) return false;
  return agora >= inicio - evento.lembrete_minutos * 60000 && agora < inicio;
}

export const STATUS_CONFIRMACAO = {
  enviada: { rotulo: 'Aguardando o cliente', cor: 'amber' },
  confirmada: { rotulo: 'Cliente confirmou', cor: 'green' },
  remarcar: { rotulo: 'Cliente pediu para remarcar', cor: 'violet' },
  cancelada: { rotulo: 'Cliente cancelou', cor: 'rose' },
  falhou: { rotulo: 'Mensagem não enviada', cor: 'rose' },
};
