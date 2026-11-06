/** HTTP sem dependências: JSON, upload limitado, PDF e arquivos públicos. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

export async function readBody(req, limit = 35000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Arquivo ou requisição muito grande.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Requer Python + pypdf apenas para arquivos PDF; TXT/MD não exigem Python. */
export async function extractPdf(buffer, root) {
  return new Promise((resolve, reject) => {
    const processPdf = spawn(process.env.PYTHON_BIN || 'python3', [path.join(root, 'scripts', 'extract_pdf.py')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const output = []; const errors = []; let length = 0;
    processPdf.stdout.on('data', bytes => {
      length += bytes.length;
      if (length <= 800000) output.push(bytes);
      else processPdf.kill();
    });
    processPdf.stderr.on('data', bytes => errors.push(bytes));
    processPdf.on('error', reject);
    processPdf.on('close', code => code === 0
      ? resolve(Buffer.concat(output).toString('utf8'))
      : reject(new Error(Buffer.concat(errors).toString('utf8').slice(0, 230) || 'Falha na leitura do PDF.')));
    processPdf.stdin.on('error', () => {});
    processPdf.stdin.end(buffer);
  });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

export async function servePublic(req, res, pathname, root) {
  const target = pathname === '/' ? '/index.html' : pathname;
  const base = path.join(root, 'app');
  const file = path.resolve(base, '.' + target);
  if (!file.startsWith(base + path.sep)) return json(res, 404, { error: 'Arquivo não encontrado.' });
  try {
    const content = await readFile(file);
    res.writeHead(200, {
      'Content-Type': `${MIME[path.extname(file)] || 'application/octet-stream'}${['.html','.css','.js','.svg','.json'].includes(path.extname(file)) ? '; charset=utf-8' : ''}`,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    });
    req.method === 'HEAD' ? res.end() : res.end(content);
  } catch { json(res, 404, { error: 'Arquivo não encontrado.' }); }
}
