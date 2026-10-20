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
