import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8380);
const received = new Map();
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
  ['/global.js', ['.generated/global.js', 'text/javascript']],
  ['/controller.js', ['.generated/controller.js', 'text/javascript']],
  ['/fixed.tpl', ['.generated/fixed.tpl', 'text/plain']],
  ['/original.tpl', ['.generated/original.tpl', 'text/plain']],
  ['/provenance.json', ['.generated/provenance.json', 'application/json']],
]);
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && /^\/collect\/[a-z0-9-]+$/.test(path)) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      const events = Array.isArray(payload.events) ? payload.events : [payload];
      const id = path.slice('/collect/'.length);
      const prior = received.get(id) ?? [];
      received.set(id, prior.concat(events.map(e => ({ type: e.event_type, transaction: e.transaction_id, product: e.product_id }))));
      res.writeHead(204).end();
    } catch { res.writeHead(400).end(); }
    return;
  }
  if (req.method === 'GET' && /^\/received\/[a-z0-9-]+$/.test(path)) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(received.get(path.slice('/received/'.length)) ?? []));
    return;
  }
  const file = files.get(path);
  if (req.method !== 'GET' || !file) { res.writeHead(404).end(); return; }
  try {
    const content = await readFile(join(root, file[0]));
    res.setHeader('Content-Type', file[1]);
    res.end(content);
  } catch { res.writeHead(503).end('Run prepare.mjs first.'); }
});
server.listen(port, '0.0.0.0', () => console.log(`Native GTM checkout test: http://localhost:${port}`));
