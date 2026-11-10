/**
 * Shared by the web app browser tests (web.mjs, visual.mjs): dist/web served
 * locally and a fake api.antefirma.app.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'web');
if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/web is missing: run node tools/web-build.mjs first');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
export const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
export const BASE = `http://127.0.0.1:${server.address().port}/`;

export const TEXT = `Abbonamento Premium a € 19,99 al mese. Il contratto ha una durata minima di 24 mesi.
Alla scadenza il contratto si rinnova automaticamente per un uguale periodo, salvo disdetta con preavviso di almeno 60 giorni.
In caso di recesso anticipato è dovuta una penale di € 120,00.`;
export const VERDICT = {
  findings: [
    { category: 'auto_renewal', quote: 'Alla scadenza il contratto si rinnova automaticamente per un uguale', why: 'Another 24 months.', confidence: 0.9 },
    { category: 'early_termination_penalty', quote: 'In caso di recesso anticipato è dovuta una penale di € 120,00', why: 'Leaving early costs.', confidence: 0.9 },
  ],
  terms: {
    price: { value: 19.99, quote: '€ 19,99' }, currency: { value: 'EUR' }, billing_period: { value: 'month' },
    minimum_term_months: { value: 24, quote: 'durata minima di 24 mesi' }, notice_days: { value: 60, quote: 'preavviso di almeno 60 giorni' },
    exit_fee: { value: 120, quote: 'penale di € 120,00' }, extra_fees: [],
  },
  summary: '', dropped: 0, truncated: false, model: 'fake', cached: false,
  quota: { plan: 'free', remaining: 4, month: { limit: 5, remaining: 4 } },
};
export const calls = [];
export async function api(route) {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  calls.push(path);
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (path === '/v1/health') return json(200, { ok: true });
  if (path === '/v1/register') return json(200, { token: 'v1.fake' });
  if (path === '/v1/analyze') return json(200, VERDICT);
  if (path === '/v1/license') return json(200, { plan: 'free', active: false, quota: { month: { limit: 5, remaining: 4 } } });
  return json(404, { error: 'not_found' });
}
