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
