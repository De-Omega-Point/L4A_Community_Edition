import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Fast browser-independent checks. The rendered Worker test belongs to npm test,
// which first builds the exact source under test.
const files = readdirSync('tests')
  .filter(name => name.endsWith('.test.mjs') && name !== 'rendered-html.test.mjs')
  .sort().map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
