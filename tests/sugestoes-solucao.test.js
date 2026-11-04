import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palavrasDoRelato, sugerirSolucoes } from '../src/lib/sugestoesSolucao.js';

test('palavras do relato: sem acento, sem palavras comuns e sem repetir', () => {
  assert.deepEqual(palavrasDoRelato('A impressora não imprime, impressora travada!'), ['impressora', 'imprime', 'travada']);
  assert.deepEqual(palavrasDoRelato(''), []);
});

test('sugestões: mostra o que combina, o mais parecido primeiro, e nada sem relato', () => {
  const base = [
    { id: 1, titulo: 'Impressora não imprime', solucao_passos: 'Reiniciar o spooler' },
    { id: 2, titulo: 'Erro de login', solucao_passos: 'Redefinir a senha' },
    { id: 3, titulo: 'QR Code', solucao_passos: 'impressora térmica do caixa' },
  ];
  const r = sugerirSolucoes('A impressora do caixa não imprime', base);
  assert.equal(r[0].id, 1);
  assert.ok(!r.some((s) => s.id === 2));
  assert.deepEqual(sugerirSolucoes('', base), []);
});
