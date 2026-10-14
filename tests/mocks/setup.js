// Ambiente de navegador mínimo + redirecionamento dos módulos externos de storage.js para mocks
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const mocksDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(mocksDir, '../../src');
const MOCKS = { './supabase': 'supabase.js', './security': 'security.js', './audioNotifications': 'audioNotifications.js' };

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/lib/storage.js') && MOCKS[specifier]) {
      return { url: pathToFileURL(path.join(mocksDir, MOCKS[specifier])).href, shortCircuit: true };
    }
    // Rotas importam 'next/server' sem extensão (resolvido pelo bundler do Next)
    if (specifier === 'next/server') return next('next/server.js', context);
    // Alias "@/..." do Next.js → src/...
    if (specifier.startsWith('@/')) {
      const alvo = path.join(srcDir, specifier.slice(2));
      return next(pathToFileURL(alvo.endsWith('.js') ? alvo : `${alvo}.js`).href, context);
    }
    // Imports relativos sem extensão dentro de src/ (resolvidos pelo bundler do Next)
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.includes('/src/')) {
      return next(`${specifier}.js`, context);
    }
    return next(specifier, context);
  },
});

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = new EventTarget();
