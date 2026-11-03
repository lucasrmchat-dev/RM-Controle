import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { APIS_EXTERNAS } from '../src/lib/documentacao.js';
import { ABAS_CONFIG_AVANCADAS } from '../src/lib/roles.js';

test('documentação: toda rota documentada existe no código e todo atalho leva a uma aba de administrador', () => {
  for (const api of APIS_EXTERNAS) {
    assert.ok(ABAS_CONFIG_AVANCADAS.includes(api.token.aba), `${api.id}: aba ${api.token.aba}`);
    assert.ok(api.token.passos.length && api.autenticacao && api.erros.length, api.id);
    for (const r of api.rotas) {
      const arquivo = new URL(
        `../src/app${r.caminho.replace(/<[^>]+>/g, '[id]')}/route.js`,
        import.meta.url,
      );
      assert.ok(fs.existsSync(arquivo), `rota documentada sem arquivo: ${r.caminho}`);
      assert.match(
        fs.readFileSync(arquivo, 'utf8'),
        new RegExp(`export (async function|const) ${r.metodo}\\b`),
        `${r.caminho} sem ${r.metodo}`,
      );
    }
  }
  assert.ok(
    ABAS_CONFIG_AVANCADAS.includes('documentacao'),
    'aba Documentação só para administradores',
  );
});
