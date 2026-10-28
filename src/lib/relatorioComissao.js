/**
 * Relatório do mês no formato da planilha "Controle de atividade e comissão":
 * uma aba por vendedor (resumo do mês, dia a dia e vendas do mês) e, quando há mais de um, a aba "Equipe".
 */
import { calcularMes, diaDaSemana, formatarReal, regrasDoVendedor } from './comissao';
import { ESTILO, gerarXlsx } from './xlsx';

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const nomeDoMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
const c = (v, s) => ({ v, s });
const fds = (iso) => ['sáb.', 'dom.'].includes(diaDaSemana(iso));
const LARGURAS = [2, 12, 7, 11, 28, 11, 28, 9, 30, 14, 14, 15, 15];

function abaDoVendedor({ mes, vendedor, eventos, vendas, regras, geradoEm }) {
  const r = calcularMes({ mes, vendedor: vendedor.email, eventos, vendas, regras });
  const regra = regrasDoVendedor(regras, vendedor.email);
  const t = r.totais;
  const linhas = [];
  const mesclar = ['B2:M2', 'B3:M3'];
  linhas[1] = [null, c(`${nomeDoMes(mes)} · ${vendedor.nome}`, ESTILO.titulo), ...Array(11).fill(c('', ESTILO.titulo))];
  linhas[2] = [null, c(`Relatório de atividade e comissão · gerado em ${geradoEm} · ${formatarReal(regra.valor_reuniao)} por reunião ${regra.pagar_por === 'feita' ? 'feita' : 'marcada'} + ${formatarReal(regra.valor_venda)} por venda`, ESTILO.subtitulo)];
  linhas[4] = [null, c('RESUMO DO MÊS', ESTILO.secao)];
  linhas[5] = [null, null, null, c('Reuniões marcadas', ESTILO.kpiRotulo), null, c('Reuniões feitas', ESTILO.kpiRotulo), null, c('Vendas', ESTILO.kpiRotulo), null, c('Contratos', ESTILO.kpiRotulo), null, c('TOTAL A RECEBER', ESTILO.kpiRotulo)];
  linhas[6] = [null, null, null, c(t.marcadas, ESTILO.kpiInteiro), null, c(t.feitas, ESTILO.kpiInteiro), null, c(t.vendas, ESTILO.kpiInteiro), null, c(t.contratos, ESTILO.kpiMoeda), null, c(t.comissao, ESTILO.kpiDestaque)];
  mesclar.push('D6:E6', 'F6:G6', 'H6:I6', 'J6:K6', 'L6:M6', 'D7:E7', 'F7:G7', 'H7:I7', 'J7:K7', 'L7:M7');
  linhas[8] = [null, c('Comparecimento', ESTILO.kpiRotulo), c(r.taxas.comparecimento, ESTILO.kpiPct), c('Conversão em venda', ESTILO.kpiRotulo), null, c(r.taxas.conversao, ESTILO.kpiPct), null, c('Ticket médio', ESTILO.kpiRotulo), null, c(r.taxas.ticket, ESTILO.kpiMoeda)];
  mesclar.push('D9:E9', 'F9:G9', 'H9:I9', 'J9:K9');
  linhas[10] = [null, ...['Data', 'Dia', 'Reuniões marcadas', 'Nomes (marcadas)', 'Reuniões feitas', 'Nomes (feitas)', 'Vendas', 'Cliente (empresa)', 'Mensalidade', 'Adicionais', 'Total contrato', 'Comissão do dia'].map((h) => c(h, ESTILO.cabecalho))];
  r.dias.forEach((d, i) => {
    const f = fds(d.data);
    const tx = f ? ESTILO.textoFds : ESTILO.texto;
    const n = f ? ESTILO.inteiroFds : ESTILO.inteiro;
    const m = f ? ESTILO.moedaFds : ESTILO.moeda;
    const vazio = (x) => (x ? x : '');
    linhas[11 + i] = [
      null,
      c(d.data, f ? ESTILO.dataFds : ESTILO.data),
      c(d.dia, tx),
      c(vazio(d.marcadas.length), n),
      c(d.marcadas.map((x) => x.nome).join(', '), tx),
      c(vazio(d.feitas.length), n),
      c(d.feitas.map((x) => x.nome).join(', '), tx),
      c(vazio(d.vendas.length), n),
      c(d.vendas.map((v) => v.empresa).join(', '), tx),
      c(vazio(d.mensalidade), m),
      c(vazio(d.adicionais), m),
      c(vazio(d.total), m),
      c(vazio(d.comissao), m),
    ];
  });
  const linhaTotal = 11 + r.dias.length;
  linhas[linhaTotal] = [null, c('TOTAL', ESTILO.totalRotulo), c('', ESTILO.totalRotulo), c(t.marcadas, ESTILO.totalInteiro), c('', ESTILO.totalRotulo), c(t.feitas, ESTILO.totalInteiro), c('', ESTILO.totalRotulo), c(t.vendas, ESTILO.totalInteiro), c('', ESTILO.totalRotulo), c(t.mensalidade, ESTILO.totalMoeda), c(t.adicionais, ESTILO.totalMoeda), c(t.contratos, ESTILO.totalMoeda), c(t.comissao, ESTILO.totalMoeda)];

  const inicioVendas = linhaTotal + 2;
  linhas[inicioVendas] = [null, c('VENDAS DO MÊS', ESTILO.secao)];
  linhas[inicioVendas + 1] = [null, ...['Data', 'Cliente (empresa)', '', 'Contato', 'Mensalidade', 'Adicionais', 'Total contrato'].map((h) => c(h, ESTILO.cabecalho))];
  mesclar.push(`C${inicioVendas + 2}:D${inicioVendas + 2}`);
  if (!r.vendas.length) linhas[inicioVendas + 2] = [null, c('Nenhuma venda neste mês.', ESTILO.subtitulo)];
  r.vendas.forEach((v, i) => {
    const n = inicioVendas + 2 + i;
    linhas[n] = [null, c(String(v.data).slice(0, 10), ESTILO.data), c(v.empresa, ESTILO.texto), c('', ESTILO.texto), c(v.contato || '', ESTILO.texto), c(Number(v.mensalidade) || 0, ESTILO.moeda), c(Number(v.adicionais) || 0, ESTILO.moeda), c((Number(v.mensalidade) || 0) + (Number(v.adicionais) || 0), ESTILO.moeda)];
    mesclar.push(`C${n + 1}:D${n + 1}`);
  });
  return { nome: vendedor.nome, larguras: LARGURAS, linhas, mesclar, alturas: { 2: 34, 7: 28, 11: 32 }, congelar: 'B12' };
}

function abaEquipe({ mes, vendedores, eventos, vendas, regras, geradoEm }) {
  const linhas = [];
  linhas[1] = [null, c(`${nomeDoMes(mes)} · Equipe comercial`, ESTILO.titulo), ...Array(8).fill(c('', ESTILO.titulo))];
  linhas[2] = [null, c(`Resumo por vendedor · gerado em ${geradoEm}`, ESTILO.subtitulo)];
  linhas[4] = [null, ...['Vendedor', 'Marcadas', 'Feitas', 'Vendas', 'Comparec.', 'Conversão', 'Contratos', 'Ticket médio', 'Comissão'].map((h) => c(h, ESTILO.cabecalho))];
  const linhasEquipe = vendedores.map((p) => ({ p, r: calcularMes({ mes, vendedor: p.email, eventos, vendas, regras }) })).sort((a, b) => b.r.totais.comissao - a.r.totais.comissao);
  linhasEquipe.forEach(({ p, r }, i) => {
    linhas[5 + i] = [null, c(p.nome, ESTILO.texto), c(r.totais.marcadas, ESTILO.inteiro), c(r.totais.feitas, ESTILO.inteiro), c(r.totais.vendas, ESTILO.inteiro), c(Math.round(r.taxas.comparecimento * 1000) / 10 / 100, ESTILO.texto), c(Math.round(r.taxas.conversao * 1000) / 10 / 100, ESTILO.texto), c(r.totais.contratos, ESTILO.moeda), c(r.taxas.ticket, ESTILO.moeda), c(r.totais.comissao, ESTILO.moeda)];
  });
  // Porcentagens como texto formatado (as células de tabela não usam o estilo grande de %)
  linhasEquipe.forEach(({ r }, i) => {
    linhas[5 + i][5] = c(`${Math.round(r.taxas.comparecimento * 1000) / 10}%`.replace('.', ','), ESTILO.texto);
    linhas[5 + i][6] = c(`${Math.round(r.taxas.conversao * 1000) / 10}%`.replace('.', ','), ESTILO.texto);
  });
  const soma = (f) => linhasEquipe.reduce((s, x) => s + f(x.r), 0);
  const n = 5 + linhasEquipe.length;
  linhas[n] = [null, c('TOTAL', ESTILO.totalRotulo), c(soma((r) => r.totais.marcadas), ESTILO.totalInteiro), c(soma((r) => r.totais.feitas), ESTILO.totalInteiro), c(soma((r) => r.totais.vendas), ESTILO.totalInteiro), c('', ESTILO.totalRotulo), c('', ESTILO.totalRotulo), c(soma((r) => r.totais.contratos), ESTILO.totalMoeda), c('', ESTILO.totalRotulo), c(soma((r) => r.totais.comissao), ESTILO.totalMoeda)];
  return { nome: 'Equipe', larguras: [2, 28, 11, 11, 10, 12, 12, 15, 15, 15], linhas, mesclar: ['B2:J2', 'B3:J3'], alturas: { 2: 34, 5: 30 } };
}

/** Arquivo .xlsx do mês (Uint8Array). vendedores: [{ email, nome }] já filtrados pelo que a pessoa pode ver. */
export function relatorioComissaoXlsx({ mes, vendedores, eventos, vendas, regras, agora = new Date() }) {
  const geradoEm = agora.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const abas = vendedores.map((vendedor) => abaDoVendedor({ mes, vendedor, eventos, vendas, regras, geradoEm }));
  if (vendedores.length > 1) abas.unshift(abaEquipe({ mes, vendedores, eventos, vendas, regras, geradoEm }));
  return gerarXlsx(abas.length ? abas : [{ nome: 'Comissão', linhas: [[null, 'Nenhum vendedor para o relatório.']] }]);
}
