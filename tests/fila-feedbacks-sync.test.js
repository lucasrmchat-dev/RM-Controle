// Testes de regressão dos relatos da equipe (Fila de Demandas e Feedbacks).
// Executar: node --import ./tests/mocks/setup.js --test tests/fila-feedbacks-sync.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './mocks/supabase.js';

const storage = await import('../src/lib/storage.js');
const {
  adicionarChamadoFila,
  fetchChamadosFila,
  cancelarSuporte,
  getChamadosSuporte,
  fetchHistoricoChamados,
  fetchFeedbacks,
  updateFeedbackStatus,
  getDepartamentos,
  isChamadoFeedback,
} = storage;

const USER = 'maria@rmcontrole.com';

// Simula outro colaborador: limpa o navegador mas mantém o banco
function trocarDeNavegador() {
  localStorage.clear();
}

beforeEach(() => {
  db.reset();
  localStorage.clear();
});

test('demanda nova aparece na fila e chega à nuvem', async () => {
  const criado = await adicionarChamadoFila({ empresa_id: null, empresa_nome: 'Empresa A', userEmail: USER });
  assert.equal(criado.sync_estado, 'sincronizado');
  assert.equal(db.tables.suporte_chamados.length, 1);
  const fila = await fetchChamadosFila();
  assert.equal(fila.length, 1);
  assert.equal(fila[0].id, criado.id);
});

test('ticket #24: demanda aberta de uma mensagem do Chat guarda a conversa e a mensagem (local, nuvem e outro navegador)', async () => {
  const conversa = '11111111-1111-4111-8111-111111111111';
  const mensagem = '22222222-2222-4222-8222-222222222222';
  const criado = await adicionarChamadoFila({
    empresa_nome: 'Empresa A',
    solicitante_nome: 'Carla',
    observacao_inicial: 'Relato do cliente: o número parou de receber mensagens',
    userEmail: USER,
    chat: { conversa_id: conversa, mensagem_id: mensagem, mensagem_em: '2026-10-28T12:00:00.000Z' },
  });
  assert.equal(criado.chat_conversa_id, conversa);
  assert.equal(db.tables.suporte_chamados[0].chat_conversa_id, conversa, 'vai para a nuvem');
  assert.equal(db.tables.suporte_chamados[0].chat_mensagem_id, mensagem);
  trocarDeNavegador();
  const fila = await fetchChamadosFila();
  assert.equal(fila[0].chat_conversa_id, conversa, 'outro colaborador recebe o atalho para a conversa');
  assert.equal(fila[0].chat_mensagem_id, mensagem);
  // Sem vínculo: campos não aparecem
  const comum = await adicionarChamadoFila({ empresa_nome: 'Empresa B', userEmail: USER });
  assert.equal(comum.chat_conversa_id, undefined);
});

test('várias demandas da mesma empresa, sem solicitante/observação, aparecem todas', async () => {
  await adicionarChamadoFila({ empresa_nome: 'Empresa A', userEmail: USER });
  await adicionarChamadoFila({ empresa_nome: 'Empresa A', userEmail: USER });
  await adicionarChamadoFila({ empresa_nome: 'Empresa A', userEmail: USER });
  const fila = await fetchChamadosFila();
  assert.equal(fila.length, 3, 'as 3 demandas devem estar na fila');

  // E também para outro colaborador
  trocarDeNavegador();
  assert.equal((await fetchChamadosFila()).length, 3);
});

test('schema sem colunas estendidas: insert recua para colunas base em vez de falhar em silêncio', async () => {
  db.columns.suporte_chamados = [
    'empresa_id', 'empresa_nome', 'tecnico_email', 'atendente', 'colaborador_solicitante',
    'status', 'observacoes', 'motivo', 'iniciado_em',
  ];
  const criado = await adicionarChamadoFila({ empresa_nome: 'Empresa B', etiquetas: ['urgente'], userEmail: USER });
  assert.equal(criado.sync_estado, 'sincronizado');
  assert.equal(db.tables.suporte_chamados.length, 1);

  trocarDeNavegador();
  const fila = await fetchChamadosFila();
  assert.equal(fila.length, 1, 'outro colaborador vê a demanda');
});

test('falha de rede: demanda fica marcada como pendente, visível, e é reenviada no próximo sync', async () => {
  // Simula falha definitiva (RLS/rede) no insert
  db.columns.suporte_chamados = [];
  const criado = await adicionarChamadoFila({ empresa_nome: 'Empresa C', userEmail: USER });
  assert.equal(criado.sync_estado, 'pendente');
  assert.equal(getChamadosSuporte().length, 1, 'continua visível localmente');

  db.columns.suporte_chamados = null; // conexão restabelecida
  const fila = await fetchChamadosFila();
  assert.equal(db.tables.suporte_chamados.length, 1, 'reenviada para a nuvem');
  assert.equal(fila.length, 1, 'sem duplicar');
  assert.equal(fila[0].sync_estado, 'sincronizado');
});

test('cancelar sem permissão de DELETE (usuário suporte) remove a demanda de vez', async () => {
  db.rls.deleteAllowed = false; // RLS: DELETE só para administrador
  const criado = await adicionarChamadoFila({ empresa_nome: 'Empresa D', userEmail: USER });
  await cancelarSuporte({ chamado_id: criado.id, userEmail: USER });

  assert.equal((await fetchChamadosFila()).length, 0, 'não volta no próximo sync');
  assert.equal(db.tables.suporte_chamados[0].status, 'cancelado');

  trocarDeNavegador();
  assert.equal((await fetchChamadosFila()).length, 0, 'sumiu para os outros colaboradores');
  assert.equal((await fetchHistoricoChamados()).length, 0, 'cancelada não entra no histórico');
});

test('cancelar sem nenhuma permissão: reverte e informa o erro em vez de fingir sucesso', async () => {
  const criado = await adicionarChamadoFila({ empresa_nome: 'Empresa E', userEmail: USER });
  db.rls.deleteAllowed = false;
  db.rls.updateAllowed = false;
  await assert.rejects(() => cancelarSuporte({ chamado_id: criado.id, userEmail: USER }), /permissão/);
  assert.equal(getChamadosSuporte().length, 1, 'demanda restaurada na fila');
});

test('lembrete entra no departamento Lembretes e mantém o selo após sync', async () => {
  assert.ok(getDepartamentos().includes('Lembretes'));
  await adicionarChamadoFila({ empresa_nome: 'Empresa F', is_lembrete: true, userEmail: USER });
  trocarDeNavegador();
  const [ch] = await fetchChamadosFila();
  assert.ok(ch.categorias.includes('Lembretes'));
  assert.equal(ch.is_lembrete, true);
});

test('demanda interna da RM Controle não é escondida como se fosse feedback', () => {
  assert.equal(isChamadoFeedback({ empresa_nome: 'RM Controle', is_demanda_interna: true, categorias: ['Suporte'] }), false);
  assert.equal(isChamadoFeedback({ feedback_id: 'x' }), true);
});

test('status de feedback alterado por um colaborador aparece para os outros', async () => {
  db.tables.feedbacks.push({
    id: '11111111-1111-4111-8111-111111111111',
    titulo: 'Não cancela chamados',
    descricao: '[Módulo: Fila de Demandas] Clico e continua lá',
    status: 'em_analise',
    created_at: new Date().toISOString(),
  });

  // Colaborador 1 (Maria) carrega a lista
  const listaMaria = await fetchFeedbacks();
  assert.equal(listaMaria[0].status, 'em_analise');
  assert.equal(listaMaria[0].modulo_afetado, 'Fila de Demandas');
  const estadoMaria = localStorage.getItem('rm_feedbacks_lista');

  // Colaborador 2 (Lucas) move para "resolvido"
  trocarDeNavegador();
  await fetchFeedbacks();
  await updateFeedbackStatus('11111111-1111-4111-8111-111111111111', 'resolvido', 'lucas@rmcontrole.com');

  // Maria volta ao navegador dela (com o cache antigo) e recarrega
  localStorage.clear();
  localStorage.setItem('rm_feedbacks_lista', estadoMaria);
  const atualizada = await fetchFeedbacks();
  assert.equal(atualizada[0].status, 'resolvido');
});

test('status de feedback recusado pelo servidor é revertido e gera erro', async () => {
  db.tables.feedbacks.push({
    id: '22222222-2222-4222-8222-222222222222',
    titulo: 'Teste',
    descricao: 'x',
    status: 'em_analise',
    created_at: new Date().toISOString(),
  });
  await fetchFeedbacks();
  db.rls.updateAllowed = false;
  await assert.rejects(() => updateFeedbackStatus('22222222-2222-4222-8222-222222222222', 'resolvido'));
  const lista = JSON.parse(localStorage.getItem('rm_feedbacks_lista'));
  assert.equal(lista[0].status, 'em_analise');
});

// ============================================================================
// Consistência da fila (relatos: "fechar duas vezes", "demanda some",
// "cada colaborador vê uma lista diferente")
// ============================================================================
const { finalizarSuporte, assumirSuporte, reatribuirChamadoSuporte } = storage;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('concluir enquanto um sync lento está em andamento: a demanda NÃO volta (antes precisava fechar 2x)', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa G', userEmail: USER });
  await fetchChamadosFila();

  db.atraso.select = 40; // o sync de 5s "fotografa" a fila antes da conclusão
  const syncAtrasado = fetchChamadosFila();
  await esperar(5);
  await finalizarSuporte({ chamado_id: ch.id, motivo: 'Resolvido', userEmail: USER });
  await syncAtrasado;
  db.atraso.select = 0;

  assert.equal(getChamadosSuporte().length, 0, 'continua fora da fila');
  assert.equal(db.tables.suporte_chamados[0].status, 'finalizado');
  assert.equal((await fetchChamadosFila()).length, 0);
});

test('modal aberto com o ID provisório conclui no primeiro clique depois da troca pelo UUID', async () => {
  db.atraso.insert = 30;
  const criacao = adicionarChamadoFila({ empresa_nome: 'Empresa H', userEmail: USER });
  const idProvisorio = getChamadosSuporte()[0].id;
  assert.ok(idProvisorio.startsWith('chamado_'));
  await criacao; // ID trocado pelo UUID enquanto o "modal" segurava o provisório
  db.atraso.insert = 0;

  await finalizarSuporte({ chamado_id: idProvisorio, motivo: 'Ok', userEmail: USER });
  assert.equal(getChamadosSuporte().length, 0);
  assert.equal(db.tables.suporte_chamados.length, 1);
  assert.equal(db.tables.suporte_chamados[0].status, 'finalizado');
});

test('concluir logo após criar (envio em andamento) não duplica nem deixa a original aberta', async () => {
  db.atraso.insert = 30;
  const criacao = adicionarChamadoFila({ empresa_nome: 'Empresa I', userEmail: USER });
  const idProvisorio = getChamadosSuporte()[0].id;
  await finalizarSuporte({ chamado_id: idProvisorio, motivo: 'Rápido', userEmail: USER });
  await criacao;
  db.atraso.insert = 0;

  assert.equal(db.tables.suporte_chamados.length, 1, 'uma única linha na nuvem');
  assert.equal(db.tables.suporte_chamados[0].status, 'finalizado');
  trocarDeNavegador();
  assert.equal((await fetchChamadosFila()).length, 0, 'fechada para os outros colaboradores');
});

test('segundo clique em "Concluir" não gera erro nem duplica', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa J', userEmail: USER });
  await finalizarSuporte({ chamado_id: ch.id, motivo: 'Ok', userEmail: USER });
  await finalizarSuporte({ chamado_id: ch.id, motivo: 'Ok', userEmail: USER });
  assert.equal(JSON.parse(localStorage.getItem('rm_historico_chamados')).length, 1);
});

test('servidor recusa a conclusão: demanda volta para a fila e o erro é informado', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa K', userEmail: USER });
  db.rls.updateAllowed = false;
  await assert.rejects(() => finalizarSuporte({ chamado_id: ch.id, motivo: 'X', userEmail: USER }), /continua na fila/);
  assert.equal(getChamadosSuporte().length, 1);
});

test('reatribuição chega à nuvem (antes falhava por coluna inexistente) e todos veem o novo responsável', async () => {
  db.columns.suporte_chamados = [
    'empresa_id', 'empresa_nome', 'tecnico_email', 'atendente', 'colaborador_solicitante',
    'status', 'observacoes', 'motivo', 'iniciado_em', 'finalizado_em', 'duracao_segundos',
  ];
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa L', userEmail: USER });
  db.columns.suporte_chamados = null;
  await reatribuirChamadoSuporte(ch.id, 'pedro@rmcontrole.com', 'Pedro', USER);
  trocarDeNavegador();
  const [visto] = await fetchChamadosFila();
  assert.equal(visto.tecnico_email, 'pedro@rmcontrole.com');
});

test('dois colaboradores assumem a mesma demanda: o segundo é avisado', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa M', userEmail: USER });
  await assumirSuporte({ chamado_id: ch.id, userEmail: 'joao@rmcontrole.com' });
  db.tables.suporte_chamados[0].status = 'finalizado'; // outro colaborador já concluiu
  await fetchChamadosFila();
  localStorage.setItem('rm_chamados_suporte', JSON.stringify([{ ...ch, status: 'aguardando_visualizacao' }]));
  await assert.rejects(() => assumirSuporte({ chamado_id: ch.id, userEmail: 'ana@rmcontrole.com' }), /Não foi possível assumir/);
});

test('sem sessão no banco: assumir explica o motivo e não muda nada localmente', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa S', userEmail: USER });
  db.semSessao = true;
  await assert.rejects(() => assumirSuporte({ chamado_id: ch.id, userEmail: 'ana@rmcontrole.com' }), /conexão com o banco expirou/);
  const local = JSON.parse(localStorage.getItem('rm_chamados_suporte')).find((c) => c.id === ch.id);
  assert.equal(local.status, 'aguardando_visualizacao', 'a demanda volta ao estado anterior');
  assert.equal(db.tables.suporte_chamados[0].status, 'aguardando_visualizacao');
});

test('assumir uma demanda já assumida por outra pessoa diz quem pegou', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa T', userEmail: USER });
  await assumirSuporte({ chamado_id: ch.id, userEmail: 'joao@rmcontrole.com' });
  db.tables.suporte_chamados[0].status = 'finalizado';
  localStorage.setItem('rm_chamados_suporte', JSON.stringify([{ ...ch, status: 'aguardando_visualizacao' }]));
  await assert.rejects(() => assumirSuporte({ chamado_id: ch.id, userEmail: 'ana@rmcontrole.com' }), /já foi concluída ou cancelada/);
});

test('demanda antiga que só existia num navegador é enviada para todos verem', async () => {
  localStorage.setItem('rm_chamados_suporte', JSON.stringify([{
    id: 'chamado_legado_1', empresa_nome: 'Empresa Legada', status: 'aguardando_visualizacao',
    categorias: ['Suporte'], solicitante_nome: 'Ana', observacao_inicial: 'criada antes da correção',
    created_at: new Date().toISOString(),
  }]));
  await fetchChamadosFila(); // detecta e agenda
  await fetchChamadosFila(); // reenvia
  assert.equal(db.tables.suporte_chamados.length, 1);
  trocarDeNavegador();
  assert.equal((await fetchChamadosFila())[0].empresa_nome, 'Empresa Legada');
});

test('demanda antiga duplicada localmente é descartada quando a nuvem já a tem', async () => {
  const nuvem = await adicionarChamadoFila({ empresa_nome: 'Empresa N', solicitante_nome: 'Bia', observacao_inicial: 'x', userEmail: USER });
  const lista = JSON.parse(localStorage.getItem('rm_chamados_suporte'));
  lista.push({ ...lista[0], id: 'chamado_copia_antiga', sync_estado: undefined });
  localStorage.setItem('rm_chamados_suporte', JSON.stringify(lista));
  const fila = await fetchChamadosFila();
  assert.deepEqual(fila.map((c) => c.id), [nuvem.id]);
  assert.equal(db.tables.suporte_chamados.length, 1);
});

test('navegação mantém Comercial para o administrador mesmo após perder a referência interna do usuário', () => {
  storage.definirUsuarioAtual('');
  assert.equal(storage.getAbasPermitidas().includes('comercial'), false, 'sem identificação não concede administração');
  assert.equal(storage.getAbasPermitidas('lucas@rmchat.com').includes('comercial'), true, 'a sessão explícita mantém a aba após recarregar módulos');
  assert.equal(storage.getPermissoesAtuais('lucas@rmchat.com').administrador, true);
  storage.definirUsuarioAtual('lucas@rmchat.com');
  assert.equal(storage.getAbasPermitidas('membro@rmchat.com').includes('comercial'), false, 'a sessão explícita prevalece sobre uma referência antiga');
  storage.definirUsuarioAtual('');
});

test('configurações avançadas usam a sessão explícita e respeitam a simulação de perfil', async () => {
  const { podeVerConfiguracoesAvancadas, podeAcessarAbaConfiguracao } = await import('../src/lib/roles.js');
  storage.definirUsuarioAtual('');
  const papel = (email) => storage.getPermissoesAtuais(email).administrador ? 'administrador' : 'suporte';
  assert.equal(podeVerConfiguracoesAvancadas(papel('lucas@rmchat.com')), true);
  for (const aba of ['departamentos', 'perfis', 'canais', 'servidores', 'auditoria']) {
    assert.equal(podeAcessarAbaConfiguracao(papel('lucas@rmchat.com'), aba), true);
    assert.equal(podeAcessarAbaConfiguracao(papel('membro@rmchat.com'), aba), false);
  }
  localStorage.setItem('rm_perfis_acesso', JSON.stringify([{ id: 'restrito', nome: 'Suporte', administrador: false, modulos: ['fila', 'configuracoes'], todos_departamentos: true }]));
  storage.setVerComoPerfil('restrito');
  assert.equal(podeVerConfiguracoesAvancadas(papel('lucas@rmchat.com')), false, 'simular suporte continua ocultando administração');
  storage.setVerComoPerfil(null);
  assert.equal(podeVerConfiguracoesAvancadas(papel('lucas@rmchat.com')), true, 'sair da simulação restaura a administração');
});

test('histórico não classifica demandas abertas como concluídas, inclusive depois de limpar o navegador', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa mesma', observacao_inicial: 'Mensagens não chegam', userEmail: USER });
  localStorage.clear();
  assert.equal((await fetchHistoricoChamados()).length, 0);
  assert.equal((await fetchChamadosFila()).some((c) => c.id === ch.id), true);
  // Limpa um histórico incorreto produzido pela versão antiga.
  localStorage.setItem('rm_historico_chamados', JSON.stringify([{ ...ch, status: 'finalizado' }]));
  localStorage.removeItem('rm_chamados_suporte');
  assert.equal((await fetchHistoricoChamados()).length, 0);
});

test('segunda demanda da mesma empresa permanece durante um envio lento e sincroniza sem recarregar', async () => {
  const primeira = await adicionarChamadoFila({ empresa_nome: 'Empresa repetida', userEmail: USER });
  db.atraso.insert = 40;
  const criando = adicionarChamadoFila({ empresa_nome: 'Empresa repetida', userEmail: USER });
  await esperar(5);
  await fetchHistoricoChamados();
  const duranteEnvio = await fetchChamadosFila();
  assert.equal(duranteEnvio.length, 2, 'não confunde o envio com a primeira demanda parecida');
  await criando;
  db.atraso.insert = 0;
  const fila = await fetchChamadosFila();
  assert.equal(fila.length, 2);
  assert.equal(new Set(fila.map((c) => c.id)).size, 2);
  assert.ok(fila.some((c) => c.id === primeira.id));
});

test('relato e resolução sobrevivem à conclusão e à leitura por outro navegador', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa relato', observacao_inicial: 'Relato do cliente: mensagens desconectadas', categorias: ['Suporte'], userEmail: USER });
  await finalizarSuporte({ chamado_id: ch.id, motivo: 'Instância desconectada', observacoes: 'Pareamento refeito', userEmail: USER, catalogarSolucao: false });
  localStorage.clear();
  const h = (await fetchHistoricoChamados()).find((c) => c.id === ch.id);
  assert.equal(h.observacao_inicial, 'Relato do cliente: mensagens desconectadas');
  assert.equal(h.resolucao, 'Pareamento refeito');
  assert.equal(h.status_resolucao, 'resolvido');
  assert.deepEqual(h.categorias, ['Suporte']);
});

test('conclusão sem procedimento preserva o relato, inclusive quando preenchido apenas ao concluir', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa relato final', userEmail: USER });
  await finalizarSuporte({ chamado_id: ch.id, motivo: 'Senha', observacao_inicial: 'Cliente perdeu acesso', userEmail: USER, catalogarSolucao: false });
  localStorage.clear();
  const h = (await fetchHistoricoChamados())[0];
  assert.equal(h.observacao_inicial, 'Cliente perdeu acesso');
  assert.equal(h.resolucao, '');
});

import { analisarRecorrencias } from '../src/lib/recorrencias.js';
test('recorrências contam atendimentos únicos no período, sem confundir resolução com relato', () => {
  const base = { status: 'finalizado', motivo: 'Desconexão', finalizado_em: '2026-10-23T12:00:00', observacao_inicial: 'Mensagens mensagens desconectadas' };
  const atendimentos = [
    ...Array.from({ length: 4 }, (_, n) => ({ ...base, id: `r${n}` })),
    { ...base, id: 'r0' },
    { ...base, id: 'fora', finalizado_em: '2026-09-01T12:00:00' },
    { ...base, id: 'ativo', status: 'em_andamento' },
    { ...base, id: 'lembrete', is_lembrete: true },
    { ...base, id: 'sem-relato', motivo: 'Senha', observacao_inicial: '', resolucao: 'Mensagens corrigidas' },
  ];
  const r = analisarRecorrencias(atendimentos, { inicio: '2026-10-20', fim: '2026-10-23' });
  assert.equal(r.totalPeriodo, 5);
  assert.equal(r.semRelato, 1);
  assert.equal(r.categorias.find((c) => c.nome === 'Desconexão').total, 4);
  assert.equal(r.termos.find((t) => t.termo === 'mensagens').total, 4);
  assert.equal(analisarRecorrencias(atendimentos, { inicio: '2026-10-20', fim: '2026-10-23', busca: 'MENSAGENS' }).atendimentos.length, 4);
  assert.equal(analisarRecorrencias(atendimentos, { inicio: '2026-10-20', fim: '2026-10-23', categoria: 'senha' }).atendimentos.length, 1);
});

test('envios distintos com o mesmo relato e solicitante não são descartados por proximidade de horário', async () => {
  const dados = { empresa_nome: 'Empresa repetida com relato', solicitante_nome: 'Ana', observacao_inicial: 'Mesma falha', userEmail: USER };
  const primeira = await adicionarChamadoFila(dados);
  const segunda = await adicionarChamadoFila(dados);
  assert.notEqual(primeira.id, segunda.id);
  assert.equal((await fetchChamadosFila()).length, 2);
});

test('histórico de recorrências lê mais de mil atendimentos sem truncar a contagem', async () => {
  db.tables.suporte_chamados = Array.from({ length: 1005 }, (_, n) => ({ id: `historico-${n}`, empresa_nome: 'Empresa anual', status: 'finalizado', motivo: 'Falha recorrente', observacao_inicial: 'Mensagens não chegam', created_at: '2026-10-23T10:00:00Z', finalizado_em: '2026-10-23T11:00:00Z' }));
  const historico = await fetchHistoricoChamados();
  assert.equal(historico.length, 1005);
  assert.equal(analisarRecorrencias(historico).totalPeriodo, 1005);
});

test('sem migração, conclusão não apaga o relato silenciosamente', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa migração relato', observacao_inicial: 'Falha importante', userEmail: USER });
  db.columns.suporte_chamados = [...Object.keys(db.tables.suporte_chamados[0]).filter((c) => c !== 'observacao_inicial'), 'duracao_segundos'];
  await assert.rejects(() => finalizarSuporte({ chamado_id: ch.id, motivo: 'Falha', observacoes: 'Resolvido', userEmail: USER }), /migration_relato_atendimentos/);
  assert.equal(getChamadosSuporte()[0].observacao_inicial, 'Falha importante');
  assert.notEqual(db.tables.suporte_chamados[0].status, 'finalizado');
});

test('histórico local antigo incorreto não oculta uma demanda que a nuvem confirma aberta', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa histórico antigo', userEmail: USER });
  localStorage.setItem('rm_historico_chamados', JSON.stringify([{ ...ch, status: 'finalizado' }]));
  localStorage.removeItem('rm_chamados_suporte');
  assert.equal((await fetchChamadosFila()).some((c) => c.id === ch.id), true);
});

import { randomUUID } from 'node:crypto';
test('editar motivo salva para a equipe e preserva os nomes registrados em atendimentos anteriores', async () => {
  const id = randomUUID();
  db.tables.suporte_motivos = [{ id, nome: 'Motivo anterior', descricao: 'Descrição antiga' }];
  db.tables.suporte_chamados = [{ id: randomUUID(), motivo: 'Motivo anterior', status: 'finalizado' }];
  await storage.fetchMotivosSuporte();
  await storage.updateMotivoSuporte(id, { nome: '  Motivo   separado  ', descricao: 'Descrição revisada' });
  assert.equal(db.tables.suporte_motivos[0].nome, 'Motivo separado');
  assert.equal(db.tables.suporte_chamados[0].motivo, 'Motivo anterior');
  localStorage.clear();
  const lista = await storage.fetchMotivosSuporte();
  assert.equal(lista.find((m) => m.id === id).nome, 'Motivo separado');
  assert.equal(lista.find((m) => m.id === id).descricao, 'Descrição revisada');
});

test('editar motivo valida nome vazio ou repetido e não confirma escrita recusada', async () => {
  const id = randomUUID();
  db.tables.suporte_motivos = [{ id, nome: 'Primeiro' }, { id: randomUUID(), nome: 'Instância' }];
  await storage.fetchMotivosSuporte();
  await assert.rejects(() => storage.updateMotivoSuporte(id, { nome: '  ' }), /Informe o nome/);
  await assert.rejects(() => storage.updateMotivoSuporte(id, { nome: 'instancia' }), /Já existe/);
  db.rls.updateAllowed = false;
  await assert.rejects(() => storage.updateMotivoSuporte(id, { nome: 'Alterado' }), /recusou/);
  assert.equal(storage.getMotivosSuporte().find((m) => m.id === id).nome, 'Primeiro');
});

test('remover motivo funciona com banco sem coluna ativo e mantém atendimentos antigos', async () => {
  const id = randomUUID();
  db.tables.suporte_motivos = [{ id, nome: 'Motivo removível', descricao: '' }];
  db.columns.suporte_motivos = ['id', 'nome', 'descricao'];
  db.tables.suporte_chamados = [{ id: randomUUID(), motivo: 'Motivo removível', status: 'finalizado' }];
  await storage.fetchMotivosSuporte();
  await storage.removeMotivoSuporte(id);
  assert.equal(db.tables.suporte_motivos.length, 0);
  assert.equal(storage.getMotivosSuporte().length, 0);
  assert.equal(db.tables.suporte_chamados[0].motivo, 'Motivo removível');
});

test('leituras simultâneas da fila compartilham uma única consulta ao Supabase', async () => {
  db.atraso.select = 20;
  const a = fetchChamadosFila();
  const b = fetchChamadosFila();
  assert.equal(a, b);
  await Promise.all([a, b]);
  assert.equal(db.leituras.suporte_chamados, 1);
});

test('histórico no polling reutiliza a leitura recente e invalida após concluir demanda', async () => {
  const ch = await adicionarChamadoFila({ empresa_nome: 'Empresa cache', userEmail: USER });
  const a = fetchHistoricoChamados();
  const b = fetchHistoricoChamados();
  assert.equal(a, b);
  await Promise.all([a, b]);
  const leituras = db.leituras.suporte_chamados;
  assert.equal((await fetchHistoricoChamados({ usarCache: true })).length, 0);
  assert.equal(db.leituras.suporte_chamados, leituras);
  await finalizarSuporte({ chamado_id: ch.id, motivo: 'Resolvido', userEmail: USER, catalogarSolucao: false });
  const apos = db.leituras.suporte_chamados;
  assert.equal((await fetchHistoricoChamados({ usarCache: true })).length, 1);
  assert.equal(db.leituras.suporte_chamados, apos + 1);
});

test('agendar para cliente novo ou parceiro guarda somente o participante da reunião, sem cadastrar empresa', async () => {
  const { dadosParticipanteAgenda } = await import('../src/lib/participantesAgenda.js');
  for (const tipo of ['cliente_novo', 'parceiro']) {
    const evento = await storage.addAgendaEvento({ titulo: 'Conversa inicial', data: '2026-10-23', departamento: 'Vendas', ...dadosParticipanteAgenda({ tipo, nome: 'Contato externo' }) });
    assert.equal(evento.participante_nome, 'Contato externo');
    assert.equal(evento.empresa_id, null);
    assert.equal(db.tables.agenda_eventos.find((e) => e.id === evento.id).participante_tipo, tipo);
  }
  assert.equal(db.tables.empresas.length, 0);
});

test('agenda sem migração informa atualização necessária e não finge ter salvo', async () => {
  db.columns.agenda_eventos = ['titulo', 'empresa', 'data', 'hora_inicio', 'hora_fim', 'responsavel_email', 'responsavel_nome', 'google_calendar_id', 'link_reuniao', 'status', 'tipo', 'observacoes', 'chamado_id', 'criado_por'];
  await assert.rejects(() => storage.addAgendaEvento({ titulo: 'Teste da migração', departamento: 'Vendas' }), /agenda precisa de uma atualização no banco/);
  assert.equal(db.tables.agenda_eventos?.length || 0, 0);
  assert.equal(storage.getAgendaEventos().length, 0);
});

test('descrição da demanda não some quando o banco recusa outra coluna do cadastro', async () => {
  const { descricaoDaLinha, colunaDoErro } = storage;
  // Banco sem a coluna "categorias": antes, a recusa derrubava todos os extras (descrição inclusive)
  db.columns.suporte_chamados = [
    'empresa_id', 'empresa_nome', 'tecnico_email', 'atendente', 'colaborador_solicitante', 'status', 'observacoes', 'motivo', 'iniciado_em',
    'etiquetas', 'prazo_limite', 'is_lembrete', 'criador_email', 'observacao_inicial', 'atribuido_a',
  ];
  await adicionarChamadoFila({ empresa_nome: 'RM Chat', observacao_inicial: 'Relato do cliente: Criar o ticket casa viana', prazo_limite: '2026-10-30T10:00', userEmail: USER });
  const linha = db.tables.suporte_chamados.at(-1);
  assert.equal(linha.observacao_inicial, 'Relato do cliente: Criar o ticket casa viana');
  assert.ok(linha.prazo_limite, 'prazo também preservado');
  assert.equal('categorias' in linha, false);

  // Outro navegador lê do banco: a descrição continua lá
  trocarDeNavegador();
  const fila = await fetchChamadosFila();
  assert.equal(fila.find((c) => c.empresa_nome === 'RM Chat').observacao_inicial, 'Relato do cliente: Criar o ticket casa viana');

  // Linhas antigas: texto só em "observacoes" e "observacao_inicial" vazio
  assert.equal(descricaoDaLinha({ observacoes: 'Vender automação', observacao_inicial: '' }), 'Vender automação');
  assert.equal(descricaoDaLinha({ observacoes: 'antigo', observacao_inicial: 'Reconectar API' }), 'Reconectar API');
  assert.equal(colunaDoErro({ message: "Could not find the 'categorias' column of 'suporte_chamados' in the schema cache" }), 'categorias');
  assert.equal(colunaDoErro({ message: 'column "categorias" of relation "suporte_chamados" does not exist' }), 'categorias');
});
