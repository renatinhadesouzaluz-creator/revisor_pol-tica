// Gera a versão em arquivo único da ferramenta: dist/revisor-politicas-cimed.html
// Uso: npm run build:html
//
// O arquivo contém toda a interface (HTML, CSS e JavaScript) e funciona ao ser
// aberto diretamente no navegador, sem servidor. Nenhuma chave é incluída.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'revisor-politicas-cimed.html');

// Troca a comunicação com o servidor pela versão local (navegador).
const localApi = {
  name: 'api-local',
  setup(b) {
    b.onResolve({ filter: /\/api-client\.js$/ }, () => ({ path: path.join(root, 'standalone', 'api-local.js') }));
  },
};

const result = await build({
  entryPoints: [path.join(root, 'public', 'app.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome110', 'edge110', 'firefox115', 'safari16'],
  minify: true,
  write: false,
  external: ['unpdf'], // PDF só é lido na versão com servidor
  plugins: [localApi],
  legalComments: 'none',
  logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const favicon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'public', 'favicon.svg')).toString('base64');
let html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

// Logotipo oficial (opcional) em public/brand/: embutido no arquivo.
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const logoExt = Object.keys(MIME).find((e) => fs.existsSync(path.join(root, 'public', 'brand', `logo.${e}`)));
const logoScript = logoExt
  ? `<script>globalThis.__LOGO_DATA_URL__=${JSON.stringify(`data:${MIME[logoExt]};base64,` + fs.readFileSync(path.join(root, 'public', 'brand', `logo.${logoExt}`)).toString('base64'))};</script>\n`
  : '';

html = html
  .replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">', `<link rel="icon" href="${favicon}" type="image/svg+xml">`)
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', '')
  .replace('</body>', () => `${logoScript}<script type="module">\n${js}\n</script>\n</body>`);

if (/sk-ant-/i.test(html)) throw new Error('Possível chave de API no arquivo gerado. Abortado.');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Gerado: ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
