// Local preview of the phone app: node mobile/dev-server.mjs, then open http://localhost:5173/?demo
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/]\.\.)+/, '');
  try {
    const body = await readFile(join(root, path.endsWith('/') || path.endsWith('\\') ? join(path, 'index.html') : path));
    res.writeHead(200, { 'content-type': (types[extname(path)] || 'text/html') + '; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(5173, '127.0.0.1', () => console.log('http://localhost:5173/?demo'));
