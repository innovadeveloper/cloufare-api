import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
const mode = process.argv[2];
if (mode !== '--local' && mode !== '--remote') throw new Error('Indica --local o --remote explícitamente');
const root = 'content/sample';
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]); }
// El catálogo se publica al final, tras subir los capítulos.
const paths = files(root).sort((a,b) => Number(a.endsWith('catalog.json')) - Number(b.endsWith('catalog.json')));
for (const path of paths) {
 const key = relative(root, path).replaceAll('\\', '/');
 const result = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `entre-paginas-content/${key}`, '--file', path, mode, '--content-type', path.endsWith('.json') ? 'application/json' : 'application/octet-stream'], { stdio: 'inherit' });
 if (result.status !== 0) process.exit(result.status ?? 1);
}
