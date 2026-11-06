/** Verifica a sintaxe de todos os módulos JS sem baixar pacotes npm. */
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function checkDirectory(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) await checkDirectory(filename);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' });
      if (result.status !== 0) process.exitCode = 1;
    }
  }
}
for (const folder of ['harness', 'server', 'app', 'tests', 'scripts']) await checkDirectory(folder);
if (!process.exitCode) console.log('Sintaxe JS: OK.');
