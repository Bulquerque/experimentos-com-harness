import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

// Assets são estáticos; personagens não dependem deles e o Harness não conhece cenas.
test('cenários e efeitos existem com manifesto e imagens WebP válidas', async () => {
  const root = new URL('../app/assets/', import.meta.url);
  const { assets } = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.ok(Object.keys(assets).length >= 20);
  for (const entry of Object.values(assets)) {
    const data = await readFile(new URL(entry.path.replace(/^assets\//, ''), root));
    assert.ok(data.length > 500, `Arquivo vazio: ${entry.path}`);
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  }
});

test('a interface usa seletor real de cena e não modifica a IA', async () => {
  const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../app/styles/scenes.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="scene-preset"/);
  assert.match(html, /class="scene-backdrop"/);
  assert.match(css, /judge-bench.webp/);
  assert.match(css, /courtroom-grand.webp/);
  assert.match(app, /dataset\.scene = event\.target\.value/);
});

test('servidor entrega arte WebP com Content-Type correto', async () => {
  const { createServer } = await import('../server/index.js');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/assets/scenes/courtroom-grand.webp`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
