import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assinatura, diferencas, ehChaveDePreferencia, lerPreferenciasLocais, mesclar, validarPreferencias } from '../src/lib/preferenciasConta.js';

const armazenamento = (obj) => {
  const chaves = Object.keys(obj);
  return { length: chaves.length, key: (i) => chaves[i], getItem: (k) => (k in obj ? obj[k] : null) };
};

test('só chaves de preferência são aceitas', () => {
  for (const k of ['rm_paleta', 'rm_theme', 'rm_avisos_tela', 'rm_default_view_mode', 'rm_som_chat', 'rm_som_fila']) assert.equal(ehChaveDePreferencia(k), true, k);
  for (const k of ['rm_chamados_suporte', 'rm_equipe_usuarios', 'rm_som_', 'rm_som_Chat', 'paleta', 'rm_auth_user']) assert.equal(ehChaveDePreferencia(k), false, k);
});

test('validação descarta o que não conhece, o que não é texto e o grande demais', () => {
  const v = validarPreferencias({ rm_paleta: 'rosa', rm_equipe_usuarios: '[]', rm_theme: 5, rm_avisos_tela: 'x'.repeat(5000), rm_som_chat: '{"a":1}' });
  assert.deepEqual(v, { rm_paleta: 'rosa', rm_som_chat: '{"a":1}' });
  assert.deepEqual(validarPreferencias(null), {});
  assert.deepEqual(validarPreferencias([1, 2]), {});
});

test('lê do navegador só as preferências', () => {
  const l = lerPreferenciasLocais(armazenamento({ rm_paleta: 'azul', rm_chamados_suporte: '[1]', rm_som_fila: '{}' }));
  assert.deepEqual(l, { rm_paleta: 'azul', rm_som_fila: '{}' });
});

test('diferenças, mescla e assinatura', () => {
  const local = { rm_paleta: 'azul', rm_theme: 'dark' };
  const conta = { rm_paleta: 'rosa', rm_avisos_tela: '{}' };
  assert.deepEqual(diferencas(local, conta).sort(), ['rm_avisos_tela', 'rm_paleta']);
  assert.deepEqual(mesclar(local, conta), { rm_paleta: 'rosa', rm_theme: 'dark', rm_avisos_tela: '{}' });
  assert.equal(assinatura({ b: '1', a: '2' }), assinatura({ a: '2', b: '1' }), 'ordem não importa');
  assert.notEqual(assinatura({ a: '1' }), assinatura({ a: '2' }));
});
