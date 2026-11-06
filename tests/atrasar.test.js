import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atrasarComLimite } from '../src/lib/atrasar.js';

// Relógio e agendador falsos: o tempo só anda quando o teste manda
function relogio() {
  let agora = 0;
  let proximo = 1;
  const tarefas = new Map();
  return {
    agora: () => agora,
    marcar: (fn, ms) => {
      const id = proximo++;
      tarefas.set(id, { fn, em: agora + ms });
      return id;
    },
    limpar: (id) => tarefas.delete(id),
    avancar(ms) {
      const fim = agora + ms;
      for (;;) {
        const prox = [...tarefas.entries()].filter(([, t]) => t.em <= fim).sort((a, b) => a[1].em - b[1].em)[0];
        if (!prox) break;
        agora = prox[1].em;
        tarefas.delete(prox[0]);
        prox[1].fn();
      }
      agora = fim;
    },
  };
}

test('uma chamada só roda depois da espera', () => {
  const r = relogio();
  let n = 0;
  const f = atrasarComLimite(() => n++, 300, 2000, r);
  f();
  r.avancar(299);
  assert.equal(n, 0);
  r.avancar(2);
  assert.equal(n, 1);
});

test('rajada contínua não adia para sempre: roda ao menos a cada "máximo"', () => {
  const r = relogio();
  let n = 0;
  const f = atrasarComLimite(() => n++, 300, 2000, r);
  // um pedido a cada 100 ms durante 7 s (um debounce comum nunca rodaria)
  for (let t = 0; t < 7000; t += 100) {
    f();
    r.avancar(100);
  }
  assert.ok(n >= 3, `rodou ${n} vezes`);
  assert.ok(n <= 4, `rodou ${n} vezes, mais do que o esperado`);
});

test('cancelar descarta o que estava marcado', () => {
  const r = relogio();
  let n = 0;
  const f = atrasarComLimite(() => n++, 300, 2000, r);
  f();
  f.cancelar();
  r.avancar(5000);
  assert.equal(n, 0);
});
