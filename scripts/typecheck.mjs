import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Vinext supplies the actual Workers compatibility date/bindings at build time.
// Generate matching types instead of maintaining handwritten platform globals.
if (!existsSync('dist/server/wrangler.json')) run('npm', ['run', 'build']);
run('bash', ['scripts/sites-env.sh', '--', process.execPath,
  'node_modules/wrangler/bin/wrangler.js', 'types', '.sites-runtime/worker-runtime.d.ts',
  '--config', 'dist/server/wrangler.json', '--include-env', 'false']);
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
