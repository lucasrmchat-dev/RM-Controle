/**
 * Fluxo Inteligente: blocos, validação e o motor que executa um fluxo.
 *
 * Um fluxo é um desenho de blocos ligados: { versao, nos: [{ id, tipo, x, y, config }], ligacoes: [{ id, de, saida, para }] }.
 * Um bloco de gatilho (mensagem no WhatsApp, reunião agendada, status da reunião) começa a execução quando
 * o evento combina com ele; daí o motor segue as ligações, bloco a bloco.
 *
 * O motor não fala com o banco nem com o WhatsApp: recebe `efeitos` (enviar mensagem, mudar a reunião...).
 * No servidor os efeitos são reais; no "Testar fluxo" são simulados. O mesmo código, os mesmos caminhos.
 */

export const CATEGORIAS_FLUXO = [
  { id: 'gatilhos', rotulo: 'Gatilhos · WhatsApp e agenda' },
  { id: 'gatilhos_demandas', rotulo: 'Gatilhos · Demandas' },
  { id: 'mensagens', rotulo: 'Mensagens' },
  { id: 'logica', rotulo: 'Lógica' },
  { id: 'agenda', rotulo: 'Agenda' },
  { id: 'comercial', rotulo: 'Processo comercial' },
  { id: 'chat', rotulo: 'Chat' },
];

export const STATUS_REUNIAO = [
  { id: 'agendada', rotulo: 'Agendada' },
  { id: 'concluida', rotulo: 'Realizada' },
  { id: 'cancelada', rotulo: 'Cancelada' },
  { id: 'remarcar', rotulo: 'Remarcar' },
];
const rotuloStatus = (id) => STATUS_REUNIAO.find((s) => s.id === id)?.rotulo || id;

export const OPERADORES = [
  { id: 'contem', rotulo: 'contém' },
  { id: 'nao_contem', rotulo: 'não contém' },
  { id: 'igual', rotulo: 'é igual a' },
  { id: 'diferente', rotulo: 'é diferente de' },
  { id: 'comeca', rotulo: 'começa com' },
  { id: 'termina', rotulo: 'termina com' },
  { id: 'vazio', rotulo: 'está vazio', semValor: true },
  { id: 'preenchido', rotulo: 'está preenchido', semValor: true },
  { id: 'maior', rotulo: 'é maior que' },
  { id: 'menor', rotulo: 'é menor que' },
  // Para listas (ex.: etiquetas do contato/grupo): compara cada item inteiro, sem diferenciar maiúsculas e acentos
  { id: 'tem_item', rotulo: 'tem a etiqueta' },
  { id: 'nao_tem_item', rotulo: 'não tem a etiqueta' },
];

export const ESPERA_MAXIMA_SEGUNDOS = 30;

/**
 * Catálogo dos blocos. `saidas`: portas de saída (a primeira é a padrão); `gatilho`: começa o fluxo.
 * `padrao`: configuração de um bloco novo.
 */
export const BLOCOS = {
  gatilho_mensagem: {
    categoria: 'gatilhos', rotulo: 'Mensagem no WhatsApp', descricao: 'Quando chega uma mensagem de contato ou grupo',
    cor: 'emerald', gatilho: true, saidas: ['proximo'],
    padrao: { canais: [], origem: 'todas', filtro: 'qualquer', texto: '', so_sem_responsavel: false },
  },
  gatilho_reuniao_agendada: {
    categoria: 'gatilhos', rotulo: 'Reunião agendada', descricao: 'Quando uma nova reunião é marcada na agenda',
    cor: 'sky', gatilho: true, saidas: ['proximo'],
    padrao: { tipo: 'todos' },
  },
  gatilho_reuniao_status: {
    categoria: 'gatilhos', rotulo: 'Status da reunião', descricao: 'Quando a reunião é realizada, cancelada ou vai para remarcar',
    cor: 'sky', gatilho: true, saidas: ['proximo'],
    padrao: { status: 'concluida' },
  },
  gatilho_demanda_criada: {
    categoria: 'gatilhos_demandas', rotulo: 'Demanda criada', descricao: 'Quando uma demanda nova entra na fila',
    cor: 'orange', gatilho: true, saidas: ['proximo'],
    padrao: { origem: 'qualquer', departamento: '' },
  },
  gatilho_demanda_andamento: {
    categoria: 'gatilhos_demandas', rotulo: 'Demanda em andamento', descricao: 'Quando alguém começa a atender a demanda',
    cor: 'orange', gatilho: true, saidas: ['proximo'],
    padrao: { origem: 'qualquer', departamento: '' },
  },
  gatilho_demanda_fechada: {
    categoria: 'gatilhos_demandas', rotulo: 'Demanda fechada', descricao: 'Quando a demanda é concluída ou cancelada',
    cor: 'orange', gatilho: true, saidas: ['proximo'],
    padrao: { resultado: 'qualquer', origem: 'qualquer', departamento: '' },
  },
  gatilho_demanda_sla: {
    categoria: 'gatilhos_demandas', rotulo: 'Demanda passou do prazo (SLA)', descricao: 'Quando a demanda passa de X minutos parada',
    cor: 'orange', gatilho: true, saidas: ['proximo'],
    padrao: { em: 'aguardando', minutos: 30, origem: 'qualquer', departamento: '' },
  },
  enviar_mensagem: {
    categoria: 'mensagens', rotulo: 'Enviar mensagem', descricao: 'Texto no WhatsApp, com variáveis',
    cor: 'blue', saidas: ['proximo'],
    padrao: { destino: 'conversa', texto: '', telefone: '', canal_id: '' },
  },
  pergunta: {
    categoria: 'mensagens', rotulo: 'Pergunta', descricao: 'Pergunta na conversa e espera a resposta do contato ou grupo',
    cor: 'blue', saidas: ['respondeu', 'sem_resposta'],
    padrao: { texto: '', variavel: 'resposta', minutos: 60 },
  },
  condicao: {
    categoria: 'logica', rotulo: 'Condição', descricao: 'Segue por Sim ou Não conforme as regras',
    cor: 'violet', saidas: ['sim', 'nao'],
    padrao: { combinar: 'todas', regras: [{ campo: 'mensagem.texto', operador: 'contem', valor: '' }] },
  },
  espera: {
    categoria: 'logica', rotulo: 'Espera', descricao: `Pausa antes do próximo bloco (até ${ESPERA_MAXIMA_SEGUNDOS} s)`,
    cor: 'fuchsia', saidas: ['proximo'],
    padrao: { segundos: 3 },
  },
  variavel: {
    categoria: 'logica', rotulo: 'Variável', descricao: 'Guarda um valor para usar depois',
    cor: 'fuchsia', saidas: ['proximo'],
    padrao: { nome: '', valor: '' },
  },
  fim: {
    categoria: 'logica', rotulo: 'Encerrar', descricao: 'Termina o fluxo aqui',
    cor: 'slate', saidas: [],
    padrao: {},
  },
  reuniao_status: {
    categoria: 'agenda', rotulo: 'Mudar status da reunião', descricao: 'Marca a reunião do gatilho como realizada, cancelada…',
    cor: 'amber', saidas: ['proximo'],
    padrao: { status: 'concluida' },
  },
  reuniao_anotar: {
    categoria: 'agenda', rotulo: 'Anotar na reunião', descricao: 'Acrescenta um texto às observações da reunião',
    cor: 'amber', saidas: ['proximo'],
    padrao: { texto: '' },
  },
  reuniao_criar: {
    categoria: 'agenda', rotulo: 'Agendar reunião', descricao: 'Marca uma reunião nova na agenda',
    cor: 'amber', saidas: ['proximo'],
    padrao: { titulo: 'Reunião com {{contato.nome}}', em_dias: 1, hora: '09:00', duracao_min: 30, responsavel_email: '', tipo: 'cliente' },
  },
  comercial_etapa: {
    categoria: 'comercial', rotulo: 'Mover no processo comercial', descricao: 'Coloca a reunião numa etapa do processo comercial',
    cor: 'indigo', saidas: ['proximo'],
    // Os nomes ficam guardados para mostrar no desenho; o servidor confere os ids na configuração atual
    padrao: { processo_id: '', processo_nome: '', etapa_id: '', etapa_nome: '' },
  },
  conversa_departamento: {
    categoria: 'chat', rotulo: 'Mover para departamento', descricao: 'Coloca a conversa num departamento',
    cor: 'teal', saidas: ['proximo'],
    padrao: { departamento: '' },
  },
  conversa_resolver: {
    categoria: 'chat', rotulo: 'Resolver conversa', descricao: 'Encerra a conversa do gatilho',
    cor: 'teal', saidas: ['proximo'],
    padrao: {},
  },
};

export const ROTULO_SAIDA = { proximo: '', sim: 'Sim', nao: 'Não', respondeu: 'Respondeu', sem_resposta: 'Sem resposta' };

/** Pergunta: espera de 1 minuto a 7 dias pela resposta. */
export const PERGUNTA_MAX_MINUTOS = 7 * 24 * 60;

/** Variáveis que cada gatilho oferece (para as regras e para {{variável}} nos textos). */
export const VARIAVEIS_GATILHO = {
  gatilho_mensagem: [
    ['mensagem.texto', 'Texto da mensagem'],
    ['contato.nome', 'Nome do contato'],
    ['contato.telefone', 'Telefone do contato'],
    ['contato.etiquetas', 'Etiquetas do contato ou grupo'],
    ['conversa.grupo', 'É grupo (sim/não)'],
    ['conversa.departamento', 'Departamento da conversa'],
    ['canal.nome', 'Nome do canal'],
  ],
  gatilho_reuniao_agendada: [
    ['reuniao.titulo', 'Título da reunião'],
    ['reuniao.empresa', 'Empresa'],
    ['reuniao.data', 'Data (dd/mm/aaaa)'],
    ['reuniao.hora', 'Hora'],
    ['reuniao.responsavel', 'Responsável'],
    ['reuniao.tipo', 'Tipo'],
    ['reuniao.status', 'Status'],
    ['contato.telefone', 'Telefone do cliente'],
  ],
};
VARIAVEIS_GATILHO.gatilho_reuniao_status = VARIAVEIS_GATILHO.gatilho_reuniao_agendada;
VARIAVEIS_GATILHO.gatilho_demanda_criada = [
  ['demanda.empresa', 'Empresa da demanda'],
  ['demanda.relato', 'O que a pessoa relatou'],
  ['demanda.departamento', 'Departamento'],
  ['demanda.solicitante', 'Quem pediu (solicitante)'],
  ['demanda.responsavel', 'Responsável'],
  ['demanda.status', 'Situação'],
  ['demanda.minutos', 'Minutos desde que ficou nesta situação'],
  ['demanda.motivo', 'Motivo informado ao concluir'],
  ['contato.nome', 'Nome do contato (se veio de uma conversa)'],
  ['canal.nome', 'Canal da conversa (se veio de uma conversa)'],
];
VARIAVEIS_GATILHO.gatilho_demanda_andamento = VARIAVEIS_GATILHO.gatilho_demanda_criada;
VARIAVEIS_GATILHO.gatilho_demanda_fechada = VARIAVEIS_GATILHO.gatilho_demanda_criada;
VARIAVEIS_GATILHO.gatilho_demanda_sla = VARIAVEIS_GATILHO.gatilho_demanda_criada;
export const VARIAVEIS_SEMPRE = [
  ['agora.data', 'Data de hoje'],
  ['agora.hora', 'Hora agora'],
];

// ------------------------------------------------------------------------------
// Desenho: criar, validar, exportar e importar
// ------------------------------------------------------------------------------
const LIMITE_NOS = 200;
const LIMITE_LIGACOES = 400;
const LIMITE_JSON = 200 * 1024;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,40}$/;
const idValido = (v) => typeof v === 'string' && ID_VALIDO.test(v);

export const definicaoVazia = () => ({ versao: 1, nos: [], ligacoes: [] });
export const novoId = (prefixo = 'n') => `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function novoBloco(tipo, x = 0, y = 0) {
  const b = BLOCOS[tipo];
  if (!b) throw new Error('Bloco desconhecido.');
  return { id: novoId('n'), tipo, x: Math.round(x), y: Math.round(y), config: JSON.parse(JSON.stringify(b.padrao)) };
}

/** Configuração só com dados simples (texto, número, sim/não, listas e objetos disso), sem nada executável. */
function limparConfig(valor, nivel = 0) {
  if (nivel > 4) return null;
  if (typeof valor === 'string') return valor.slice(0, 4000);
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === 'boolean' || valor === null) return valor;
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => limparConfig(v, nivel + 1));
  if (typeof valor === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(valor).slice(0, 40)) if (/^[a-z_][a-z0-9_]{0,39}$/i.test(k)) saida[k] = limparConfig(v, nivel + 1);
    return saida;
  }
  return null;
}

/** Confere e limpa um desenho (vindo da tela ou de um JSON importado). Lança Error com a mensagem. */
export function validarDefinicao(def) {
  if (!def || typeof def !== 'object') throw new Error('Fluxo inválido.');
  if (JSON.stringify(def).length > LIMITE_JSON) throw new Error('Fluxo grande demais.');
  const nosEntrada = Array.isArray(def.nos) ? def.nos : [];
  if (nosEntrada.length > LIMITE_NOS) throw new Error(`Um fluxo pode ter até ${LIMITE_NOS} blocos.`);
  const nos = [];
  const ids = new Set();
  for (const n of nosEntrada) {
    if (!n || !idValido(n.id) || ids.has(n.id)) throw new Error('Há um bloco com identificação inválida.');
    if (!BLOCOS[n.tipo]) throw new Error(`Bloco desconhecido: ${String(n.tipo).slice(0, 40)}.`);
    ids.add(n.id);
    const padrao = BLOCOS[n.tipo].padrao;
    nos.push({
      id: n.id,
      tipo: n.tipo,
      x: Math.round(Math.max(-50000, Math.min(50000, Number(n.x) || 0))),
      y: Math.round(Math.max(-50000, Math.min(50000, Number(n.y) || 0))),
      config: { ...JSON.parse(JSON.stringify(padrao)), ...(limparConfig(n.config || {}) || {}) },
    });
  }
  const porId = new Map(nos.map((n) => [n.id, n]));
  const ligEntrada = Array.isArray(def.ligacoes) ? def.ligacoes : [];
  if (ligEntrada.length > LIMITE_LIGACOES) throw new Error('Ligações demais neste fluxo.');
  const ligacoes = [];
  const vistas = new Set();
  const idsLig = new Set();
  for (const l of ligEntrada) {
    const de = porId.get(l?.de);
    const para = porId.get(l?.para);
    if (!de || !para || de.id === para.id) continue;
    if (BLOCOS[para.tipo].gatilho) continue; // nada entra num gatilho
    const saida = BLOCOS[de.tipo].saidas.includes(l.saida) ? l.saida : BLOCOS[de.tipo].saidas[0];
    if (!saida) continue;
    const chave = `${de.id}:${saida}:${para.id}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    ligacoes.push({ id: idValido(l.id) && !idsLig.has(l.id) ? l.id : novoId('l'), de: de.id, saida, para: para.id });
    idsLig.add(ligacoes[ligacoes.length - 1].id);
  }
  return { versao: 1, nos, ligacoes };
}

/** Tipos de gatilho presentes (guardados à parte para achar os fluxos de um evento). */
export const gatilhosDe = (def) => [...new Set((def?.nos || []).filter((n) => BLOCOS[n.tipo]?.gatilho).map((n) => n.tipo))];

/** Arquivo para levar o fluxo a outra empresa. */
export function exportarFluxo({ nome, descricao, definicao }) {
  return { formato: 'rm-controle-fluxo', versao: 1, exportado_em: new Date().toISOString(), nome, descricao: descricao || '', definicao: validarDefinicao(definicao) };
}

/** Lê um arquivo exportado (ou só o desenho). Canais de outra empresa são removidos por quem importa. */
export function lerArquivoFluxo(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  if (!obj || typeof obj !== 'object') throw new Error('Arquivo de fluxo inválido.');
  const definicao = validarDefinicao(obj.definicao || obj);
  const nome = String(obj.nome || 'Fluxo importado').trim().slice(0, 120) || 'Fluxo importado';
  return { nome, descricao: String(obj.descricao || '').slice(0, 500), definicao };
}

/** Tira dos blocos os canais que não existem nesta empresa (fluxo vindo de outra). Devolve quantos saíram. */
export function ajustarCanais(definicao, canaisValidos) {
  const validos = new Set(canaisValidos);
  let removidos = 0;
  for (const n of definicao.nos) {
    if (Array.isArray(n.config.canais)) {
      const antes = n.config.canais.length;
      n.config.canais = n.config.canais.filter((c) => validos.has(c));
      removidos += antes - n.config.canais.length;
    }
    if (n.config.canal_id && !validos.has(n.config.canal_id)) {
      n.config.canal_id = '';
      removidos += 1;
    }
  }
  return removidos;
}

/** Problemas que impedem o fluxo de funcionar (mostrados ao ativar e no editor). */
export function problemasDoFluxo(def) {
  const p = [];
  const nos = def?.nos || [];
  if (!nos.some((n) => BLOCOS[n.tipo]?.gatilho)) p.push('Coloque um gatilho para o fluxo começar.');
  for (const n of nos) {
    const b = BLOCOS[n.tipo];
    if (n.tipo === 'enviar_mensagem' && !String(n.config.texto || '').trim()) p.push(`“${b.rotulo}” está sem texto.`);
    if (n.tipo === 'enviar_mensagem' && n.config.destino === 'numero' && !String(n.config.telefone || '').trim()) p.push(`“${b.rotulo}” está sem o número.`);
    if (n.tipo === 'variavel' && !String(n.config.nome || '').trim()) p.push('“Variável” está sem nome.');
    if (n.tipo === 'pergunta' && !String(n.config.texto || '').trim()) p.push('“Pergunta” está sem texto.');
    if (n.tipo === 'pergunta' && !nos.some((g) => g.tipo === 'gatilho_mensagem')) p.push('“Pergunta” precisa do gatilho “Mensagem no WhatsApp” (ela pergunta na conversa).');
    if (n.tipo === 'conversa_departamento' && !String(n.config.departamento || '').trim()) p.push('“Mover para departamento” está sem departamento.');
    if (n.tipo === 'comercial_etapa' && !(n.config.processo_id && n.config.etapa_id)) p.push('“Mover no processo comercial” está sem processo ou etapa.');
    if (b?.gatilho && !(def.ligacoes || []).some((l) => l.de === n.id)) p.push(`O gatilho “${b.rotulo}” não está ligado a nenhum bloco.`);
  }
  return [...new Set(p)];
}

// ------------------------------------------------------------------------------
// Textos: {{variável}} e comparações
// ------------------------------------------------------------------------------
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const valorEm = (ctx, caminho) =>
  String(caminho || '')
    .split('.')
    .reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), ctx);

const comoTexto = (v) => (v === true ? 'sim' : v === false ? 'não' : v === undefined || v === null ? '' : Array.isArray(v) ? v.map(comoTexto).join(', ') : String(v));

/** "Olá {{contato.nome}}" → "Olá Maria". Variável que não existe vira vazio. */
export const preencher = (texto, ctx) => String(texto ?? '').replace(/\{\{\s*([A-Za-z_][\w.]{0,80})\s*\}\}/g, (_, c) => comoTexto(valorEm(ctx, c)));

export function regraCasa(regra, ctx) {
  const bruto = valorEm(ctx, regra.campo);
  const atual = semAcento(comoTexto(bruto));
  const alvo = semAcento(preencher(regra.valor, ctx));
  const itens = () => (Array.isArray(bruto) ? bruto : comoTexto(bruto).split(',')).map((i) => semAcento(comoTexto(i)).trim()).filter(Boolean);
  switch (regra.operador) {
    case 'tem_item': return Boolean(alvo) && itens().includes(alvo.trim());
    case 'nao_tem_item': return !alvo || !itens().includes(alvo.trim());
    case 'contem': return alvo ? atual.includes(alvo) : true;
    case 'nao_contem': return alvo ? !atual.includes(alvo) : true;
    case 'igual': return atual === alvo;
    case 'diferente': return atual !== alvo;
    case 'comeca': return atual.startsWith(alvo);
    case 'termina': return atual.endsWith(alvo);
    case 'vazio': return atual === '';
    case 'preenchido': return atual !== '';
    case 'maior': return Number(atual.replace(',', '.')) > Number(alvo.replace(',', '.'));
    case 'menor': return Number(atual.replace(',', '.')) < Number(alvo.replace(',', '.'));
    default: return false;
  }
}

// ------------------------------------------------------------------------------
// Gatilhos: o evento combina com o bloco?
// ------------------------------------------------------------------------------
/**
 * Eventos:
 *  { tipo: 'mensagem_recebida', dados: { mensagem: { texto }, contato: { nome, telefone }, conversa: { id, grupo, departamento, responsavel_email }, canal: { id, nome } } }
 *  { tipo: 'reuniao_agendada', dados: { reuniao: {...}, contato: { telefone } } }
 *  { tipo: 'reuniao_status',   dados: { reuniao: {...}, contato: { telefone } } }
 */
export function gatilhoCasa(no, evento) {
  return avaliarGatilho(no, evento).casa;
}

/**
 * Mesmo teste de gatilhoCasa, dizendo o motivo quando não dispara (aparece nas execuções do fluxo,
 * para quem monta o fluxo saber que a mensagem chegou e por que não seguiu).
 * @returns {{ casa: boolean, motivo?: string }}
 */
export function avaliarGatilho(no, evento) {
  const c = no.config || {};
  const d = evento?.dados || {};
  const nao = (motivo) => ({ casa: false, motivo });
  if (no.tipo === 'gatilho_mensagem') {
    if (evento.tipo !== 'mensagem_recebida') return nao('Não é uma mensagem do WhatsApp.');
    if (Array.isArray(c.canais) && c.canais.length && !c.canais.includes(d.canal?.id)) return nao(`Chegou pelo canal “${d.canal?.nome || 'outro'}”, que não está marcado no gatilho.`);
    if (c.origem === 'contato' && d.conversa?.grupo) return nao('Veio de um grupo, e o gatilho é só para contatos.');
    if (c.origem === 'grupo' && !d.conversa?.grupo) return nao('Veio de um contato, e o gatilho é só para grupos.');
    if (c.so_sem_responsavel && d.conversa?.responsavel_email) return nao('A conversa já tem responsável, e o gatilho é só para conversas sem responsável.');
    const texto = semAcento(d.mensagem?.texto);
    const alvo = semAcento(c.texto);
    const textoNao = nao('O texto da mensagem não combina com o filtro do gatilho.');
    if (c.filtro === 'contem') return Boolean(alvo) && texto.includes(alvo) ? { casa: true } : textoNao;
    if (c.filtro === 'igual') return texto === alvo ? { casa: true } : textoNao;
    if (c.filtro === 'comeca') return Boolean(alvo) && texto.startsWith(alvo) ? { casa: true } : textoNao;
    if (c.filtro === 'palavras') {
      const palavras = alvo.split(',').map((x) => x.trim()).filter(Boolean);
      return palavras.some((p) => texto.includes(p)) ? { casa: true } : textoNao;
    }
    return { casa: true };
  }
  return gatilhoOutros(no, evento) ? { casa: true } : nao('O evento não combina com o gatilho.');
}

// Gatilhos de demanda: o departamento do gatilho (vazio = qualquer) está entre os da demanda?
function departamentoCasa(c, d) {
  // Criada a partir de: qualquer lugar | de uma conversa (inclui grupos) | só de um grupo
  const origem = d.demanda?.origem || 'sistema';
  if (c.origem === 'conversa' && origem === 'sistema') return false;
  if (c.origem === 'grupo' && origem !== 'grupo') return false;
  const alvo = semAcento(c.departamento);
  if (!alvo) return true;
  return (d.demanda?.departamentos || []).some((x) => semAcento(x) === alvo);
}

function gatilhoOutros(no, evento) {
  const c = no.config || {};
  const d = evento?.dados || {};
  if (no.tipo === 'gatilho_reuniao_agendada') return evento.tipo === 'reuniao_agendada' && (!c.tipo || c.tipo === 'todos' || c.tipo === d.reuniao?.tipo);
  if (no.tipo === 'gatilho_reuniao_status') return evento.tipo === 'reuniao_status' && (!c.status || c.status === 'qualquer' || c.status === d.reuniao?.status);
  if (no.tipo === 'gatilho_demanda_criada') return evento.tipo === 'demanda_criada' && departamentoCasa(c, d);
  if (no.tipo === 'gatilho_demanda_andamento') return evento.tipo === 'demanda_andamento' && departamentoCasa(c, d);
  if (no.tipo === 'gatilho_demanda_fechada') return evento.tipo === 'demanda_fechada' && departamentoCasa(c, d) && (!c.resultado || c.resultado === 'qualquer' || c.resultado === d.demanda?.resultado);
  if (no.tipo === 'gatilho_demanda_sla') {
    const limite = Math.max(1, Number(c.minutos) || 30);
    return evento.tipo === 'demanda_sla' && departamentoCasa(c, d) && (c.em || 'aguardando') === d.demanda?.estado && Number(d.demanda?.minutos) >= limite;
  }
  return false;
}

/** Que gatilhos de bloco atendem a um tipo de evento (para buscar fluxos no banco). */
export const GATILHOS_DO_EVENTO = {
  mensagem_recebida: ['gatilho_mensagem'],
  reuniao_agendada: ['gatilho_reuniao_agendada'],
  reuniao_status: ['gatilho_reuniao_status'],
  demanda_criada: ['gatilho_demanda_criada'],
  demanda_andamento: ['gatilho_demanda_andamento'],
  demanda_fechada: ['gatilho_demanda_fechada'],
  demanda_sla: ['gatilho_demanda_sla'],
};

// ------------------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------------------
const FUSO = 'America/Sao_Paulo';
export function agoraNoFuso(data = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(data)
      .map((x) => [x.type, x.value])
  );
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}`, iso: `${p.year}-${p.month}-${p.day}` };
}
const somarDiasIso = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const somarMinutos = (hora, min) => {
  const [h, m] = String(hora || '09:00').split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (h || 0) * 60 + (m || 0) + min);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Executa o fluxo para um evento. Começa no primeiro gatilho que combina.
 * efeitos: { enviarMensagem, esperar, atualizarReuniao, anotarReuniao, criarReuniao, atualizarConversa, aguardarResposta } (todos async,
 * devolvem um texto curto do que foi feito).
 * @returns {Promise<{ casou: boolean, status: 'ok'|'erro'|'parou', passos: Array, variaveis: object }>}
 */
export async function executarFluxo({ definicao, evento, efeitos, maxPassos = 60, agora = new Date(), retomar = null }) {
  const def = definicao || definicaoVazia();
  const gatilhos = (def.nos || []).filter((n) => BLOCOS[n.tipo]?.gatilho);
  // retomar: { noId, saida, contexto, resultado } — continua depois de uma Pergunta (respondida ou sem resposta)
  const inicio = retomar ? (def.nos || []).find((n) => n.id === retomar.noId) : gatilhos.find((n) => gatilhoCasa(n, evento));
  if (retomar && !inicio) return { casou: false, motivo: 'A pergunta foi apagada do fluxo.', status: 'ok', passos: [], variaveis: {} };
  if (!inicio) {
    // Por que não disparou (o primeiro gatilho do tipo do evento explica; sem gatilho, diz isso)
    const doTipo = gatilhos.filter((n) => (GATILHOS_DO_EVENTO[evento?.tipo] || []).includes(n.tipo));
    const motivo = doTipo.length ? avaliarGatilho(doTipo[0], evento).motivo : 'O fluxo não tem gatilho para este tipo de evento.';
    return { casou: false, motivo, status: 'ok', passos: [], variaveis: {} };
  }

  const relogio = agoraNoFuso(agora);
  const base = retomar ? { ...(retomar.contexto || {}), ...(evento.dados || {}) } : evento.dados || {};
  const ctx = { ...base, var: { ...(retomar?.contexto?.var || {}) }, agora: { data: relogio.data, hora: relogio.hora } };
  if (retomar?.variavel) ctx.var[retomar.variavel] = retomar.saida === 'respondeu' ? String(evento.dados?.mensagem?.texto || '') : '';
  const porId = new Map(def.nos.map((n) => [n.id, n]));
  const saindo = (id, saida) => (def.ligacoes || []).filter((l) => l.de === id && l.saida === saida).map((l) => porId.get(l.para)).filter(Boolean);

  const primeiraSaida = retomar ? retomar.saida : 'proximo';
  const passos = [{ no: inicio.id, tipo: inicio.tipo, rotulo: BLOCOS[inicio.tipo].rotulo, saida: primeiraSaida, resultado: retomar ? retomar.resultado : 'Gatilho disparado' }];
  // Pilha (profundidade primeiro): uma saída ligada a vários blocos roda um depois do outro, na ordem das ligações
  const pilha = saindo(inicio.id, primeiraSaida).reverse();
  let status = 'ok';
  while (pilha.length) {
    if (passos.length >= maxPassos) {
      passos.push({ no: null, tipo: 'limite', rotulo: 'Limite', erro: `Parou depois de ${maxPassos} passos (o fluxo pode estar em círculo).` });
      status = 'parou';
      break;
    }
    const no = pilha.pop();
    const b = BLOCOS[no.tipo];
    const c = no.config || {};
    const passo = { no: no.id, tipo: no.tipo, rotulo: b.rotulo };
    try {
      let saida = b.saidas[0];
      switch (no.tipo) {
        case 'enviar_mensagem': {
          const texto = preencher(c.texto, ctx).trim();
          if (!texto) throw new Error('Mensagem sem texto.');
          let destino = c.destino;
          let conversaId = ctx.conversa?.id || null;
          let telefone = c.destino === 'numero' ? preencher(c.telefone, ctx) : c.destino === 'cliente_reuniao' ? ctx.contato?.telefone : null;
          // Demandas: o solicitante (número cadastrado no colaborador) ou o grupo de WhatsApp ligado à empresa
          if (c.destino === 'solicitante') {
            if (!ctx.demanda?.id) throw new Error('“Ao solicitante” só funciona com gatilhos de demanda.');
            telefone = ctx.demanda.solicitante_telefone;
            if (!telefone) throw new Error('O solicitante não tem número cadastrado. Ele é gravado quando a demanda é criada a partir de uma conversa.');
            destino = 'numero';
          } else if (c.destino === 'grupo_empresa') {
            if (!ctx.demanda?.id) throw new Error('“Ao grupo da empresa” só funciona com gatilhos de demanda.');
            conversaId = ctx.demanda.grupo_conversa_id;
            if (!conversaId) throw new Error('Esta empresa não tem grupo de WhatsApp ligado. Ele é ligado quando uma demanda é criada a partir de uma conversa do grupo.');
            destino = 'conversa';
          }
          if (destino === 'conversa' && !conversaId) throw new Error('Este gatilho não tem conversa: escolha “Número”, “Cliente da reunião”, “Solicitante” ou “Grupo da empresa”.');
          if (destino !== 'conversa' && !telefone) throw new Error('Sem número para enviar.');
          passo.resultado = await efeitos.enviarMensagem({ destino, conversaId, telefone, canalId: c.canal_id || ctx.canal?.id || null, texto });
          passo.texto = texto;
          break;
        }
        case 'condicao': {
          const regras = Array.isArray(c.regras) ? c.regras.filter((r) => r && r.campo) : [];
          const casa = regras.length === 0 ? true : c.combinar === 'alguma' ? regras.some((r) => regraCasa(r, ctx)) : regras.every((r) => regraCasa(r, ctx));
          saida = casa ? 'sim' : 'nao';
          passo.resultado = casa ? 'Regras atendidas: seguiu por Sim' : 'Regras não atendidas: seguiu por Não';
          break;
        }
        case 'espera': {
          const s = Math.max(0, Math.min(ESPERA_MAXIMA_SEGUNDOS, Number(c.segundos) || 0));
          await efeitos.esperar(s * 1000);
          passo.resultado = `Esperou ${s} s`;
          break;
        }
        case 'variavel': {
          const nome = String(c.nome || '').trim().replace(/[^\w]/g, '_').slice(0, 40);
          if (!nome) throw new Error('Variável sem nome.');
          ctx.var[nome] = preencher(c.valor, ctx);
          passo.resultado = `var.${nome} = “${ctx.var[nome]}”`;
          break;
        }
        case 'fim':
          passo.resultado = 'Fluxo encerrado';
          passos.push(passo);
          pilha.length = 0;
          continue;
        case 'reuniao_status': {
          if (!ctx.reuniao?.id) throw new Error('Este gatilho não tem reunião.');
          passo.resultado = await efeitos.atualizarReuniao(ctx.reuniao.id, { status: c.status });
          ctx.reuniao = { ...ctx.reuniao, status: c.status };
          break;
        }
        case 'reuniao_anotar': {
          if (!ctx.reuniao?.id) throw new Error('Este gatilho não tem reunião.');
          const texto = preencher(c.texto, ctx).trim();
          if (!texto) throw new Error('Anotação sem texto.');
          passo.resultado = await efeitos.anotarReuniao(ctx.reuniao.id, texto);
          break;
        }
        case 'reuniao_criar': {
          const dias = Math.max(0, Math.min(365, Number(c.em_dias) || 0));
          const hora = /^\d{2}:\d{2}$/.test(String(c.hora || '')) ? c.hora : '09:00';
          const nova = {
            titulo: preencher(c.titulo, ctx).trim().slice(0, 200) || 'Reunião',
            empresa: ctx.reuniao?.empresa || ctx.contato?.nome || '',
            data: somarDiasIso(relogio.iso, dias),
            hora_inicio: hora,
            hora_fim: somarMinutos(hora, Math.max(5, Math.min(480, Number(c.duracao_min) || 30))),
            responsavel_email: String(c.responsavel_email || '').trim().toLowerCase() || null,
            tipo: c.tipo || 'cliente',
            cliente_telefone: ctx.contato?.telefone || null,
          };
          const criada = await efeitos.criarReuniao(nova);
          // A reunião criada passa a ser "a reunião" dos próximos blocos (ex.: mover no processo comercial)
          if (criada && typeof criada === 'object') {
            passo.resultado = criada.resultado;
            if (criada.id) ctx.reuniao = { id: criada.id, titulo: nova.titulo, empresa: nova.empresa, data: nova.data.split('-').reverse().join('/'), hora: nova.hora_inicio, status: 'agendada', tipo: nova.tipo };
          } else passo.resultado = criada;
          break;
        }
        case 'comercial_etapa': {
          if (!ctx.reuniao?.id) throw new Error('Não há reunião para mover: use um gatilho de reunião ou “Agendar reunião” antes.');
          if (!c.processo_id || !c.etapa_id) throw new Error('Escolha o processo comercial e a etapa.');
          passo.resultado = await efeitos.moverNoProcesso(ctx.reuniao.id, { processoId: c.processo_id, etapaId: c.etapa_id, processoNome: c.processo_nome, etapaNome: c.etapa_nome });
          break;
        }
        case 'conversa_departamento': {
          if (!ctx.conversa?.id) throw new Error('Este gatilho não tem conversa.');
          const dep = preencher(c.departamento, ctx).trim().slice(0, 60);
          if (!dep) throw new Error('Departamento vazio.');
          passo.resultado = await efeitos.atualizarConversa(ctx.conversa.id, { departamento: dep });
          break;
        }
        case 'conversa_resolver': {
          if (!ctx.conversa?.id) throw new Error('Este gatilho não tem conversa.');
          passo.resultado = await efeitos.atualizarConversa(ctx.conversa.id, { resolver: true });
          break;
        }
        case 'pergunta': {
          // Envia na conversa e para este caminho: continua quando chegar a resposta (ou o prazo vencer)
          if (!ctx.conversa?.id) throw new Error('A pergunta precisa de uma conversa: use o gatilho “Mensagem no WhatsApp”.');
          const texto = preencher(c.texto, ctx).trim();
          if (!texto) throw new Error('Pergunta sem texto.');
          const variavel = String(c.variavel || 'resposta').trim().replace(/[^\w]/g, '_').slice(0, 40) || 'resposta';
          const minutos = Math.max(1, Math.min(PERGUNTA_MAX_MINUTOS, Math.round(Number(c.minutos) || 60)));
          await efeitos.enviarMensagem({ destino: 'conversa', conversaId: ctx.conversa.id, canalId: ctx.canal?.id || null, texto });
          const expiraEm = new Date(agora.getTime() + minutos * 60000);
          await efeitos.aguardarResposta({ conversaId: ctx.conversa.id, noId: no.id, variavel, expiraEm, contexto: ctx });
          passo.texto = texto;
          passo.resultado = `Pergunta enviada. Esperando a resposta (até ${minutos >= 60 ? `${Math.round(minutos / 6) / 10} h` : `${minutos} min`}); ela fica em {{var.${variavel}}}.`;
          passos.push(passo);
          continue;
        }
        default:
          throw new Error('Bloco sem execução.');
      }
      passo.saida = saida;
      passos.push(passo);
      pilha.push(...saindo(no.id, saida).reverse());
    } catch (e) {
      passo.erro = String(e?.message || e).slice(0, 300);
      passos.push(passo);
      status = 'erro';
      break;
    }
  }
  return { casou: true, status, passos, variaveis: ctx.var };
}

/** Efeitos de mentira para o "Testar fluxo": nada sai do sistema, tudo vira texto. */
export function efeitosSimulados({ aoEnviar } = {}) {
  return {
    enviarMensagem: async ({ destino, telefone, texto }) => {
      aoEnviar?.(texto);
      return destino === 'conversa' ? 'Mensagem enviada na conversa (simulado)' : `Mensagem enviada para ${telefone} (simulado)`;
    },
    esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 1500))),
    atualizarReuniao: async (_id, campos) => `Reunião marcada como ${rotuloStatus(campos.status)} (simulado)`,
    anotarReuniao: async (_id, texto) => `Anotado na reunião: “${texto.slice(0, 60)}” (simulado)`,
    criarReuniao: async (r) => ({ id: 'reuniao-simulada', resultado: `Reunião “${r.titulo}” agendada para ${r.data.split('-').reverse().join('/')} às ${r.hora_inicio} (simulado)` }),
    moverNoProcesso: async (_id, { processoNome, etapaNome }) => `Reunião movida para ${etapaNome || 'a etapa'} em ${processoNome || 'processo comercial'} (simulado)`,
    atualizarConversa: async (_id, campos) => (campos.resolver ? 'Conversa resolvida (simulado)' : `Conversa movida para ${campos.departamento} (simulado)`),
    // No teste, a pergunta é enviada mas ninguém responde: o caminho para depois da pergunta
    aguardarResposta: async () => {},
  };
}

/** Dados de uma reunião da agenda no formato das variáveis do fluxo. */
export function dadosDaReuniao(e) {
  return {
    reuniao: {
      id: e.id,
      titulo: e.titulo || '',
      empresa: e.empresa || '',
      data: e.data ? String(e.data).slice(0, 10).split('-').reverse().join('/') : '',
      hora: e.hora_inicio || '',
      responsavel: e.responsavel_nome || e.responsavel_email || '',
      responsavel_email: e.responsavel_email || '',
      tipo: e.tipo || '',
      status: e.status || '',
    },
    contato: { telefone: e.cliente_telefone || '', nome: e.participante_nome || e.empresa || '' },
  };
}

/**
 * Dados de uma demanda (linha de suporte_chamados) para os fluxos.
 * `estado`: em que situação ela está parada (aguardando alguém assumir ou em andamento) e há quantos `minutos`.
 */
export function dadosDaDemanda(c, { responsavelNome = '', agora = Date.now(), chat = null, solicitanteTelefone = '', grupoConversaId = '' } = {}) {
  const departamentos = (Array.isArray(c.categorias) && c.categorias.length ? c.categorias : String(c.motivo || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
  const emAndamento = c.status === 'em_andamento';
  const desde = new Date((emAndamento ? c.iniciado_em : c.created_at) || c.created_at || agora).getTime();
  const fechada = c.status === 'finalizado' || c.status === 'cancelado';
  return {
    demanda: {
      id: c.id,
      empresa: c.empresa_nome || '',
      relato: String(c.observacao_inicial || c.observacoes || '').trim(),
      departamento: departamentos.join(', '),
      departamentos,
      solicitante: c.colaborador_solicitante || '',
      solicitante_telefone: solicitanteTelefone || '',
      grupo_conversa_id: grupoConversaId || '',
      // De onde a demanda nasceu: sistema (tela de demandas) | conversa | grupo (a partir de uma mensagem do Chat)
      origem: chat ? (chat.grupo ? 'grupo' : 'conversa') : 'sistema',
      responsavel: c.tecnico_email && c.tecnico_email !== 'geral' ? responsavelNome || c.atendente || c.tecnico_email : '',
      responsavel_email: c.tecnico_email && c.tecnico_email !== 'geral' ? c.tecnico_email : '',
      status: c.status || '',
      estado: emAndamento ? 'andamento' : fechada ? 'fechada' : 'aguardando',
      resultado: c.status === 'cancelado' ? 'cancelada' : fechada ? 'concluida' : '',
      minutos: Math.max(0, Math.floor((agora - desde) / 60000)),
      motivo: fechada ? String(c.motivo || '') : '',
    },
    ...(chat
      ? {
          conversa: { id: chat.id, grupo: Boolean(chat.grupo), departamento: chat.departamento || '', responsavel_email: chat.responsavel_email || '' },
          contato: { nome: chat.contato_nome || '', telefone: chat.contato_telefone || '' },
          canal: { id: chat.canal_id || '', nome: chat.canal_nome || '' },
        }
      : {}),
  };
}
