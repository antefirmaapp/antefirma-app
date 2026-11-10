/**
 * AnteFirma web: the version to use (and install) without the extension, on web.antefirma.app.
 *
 *     node tools/web-build.mjs [folder]     (default: dist/web)
 *     node tools/web-build.mjs --icons      regenerates the icons in web/icons (needs Playwright)
 *
 * It is the same code as the extension — panel, settings and "background" —
 * with web/shim.js imitating Chrome's APIs in the page. The result is an
 * installable app (PWA): manifest, icons, a service worker to open offline too.
 * The "antefirma-web" Worker (wrangler.toml) publishes it on every push: the
 * build has no dependencies, the icons are already in the repository.
 *
 * What it does: analyses pasted text and PDFs, keeps commitments, deadlines,
 * reminders, letters and the plan. What a web page cannot do: stop clicks on
 * other sites and read other tabs. That is what the extension is for.
 *
 * The server must allow the origin https://web.antefirma.app (APP_ORIGINS).
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'web', 'icons');
const version = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;

if (process.argv.includes('--icons')) { await makeIcons(); process.exit(0); }

const OUT = resolve(process.argv[2] || join(ROOT, 'dist', 'web'));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const p of ['background', 'core', 'i18n', 'lib', 'sidepanel', 'options', 'icons']) cpSync(join(ROOT, 'src', p), join(OUT, 'src', p), { recursive: true });
for (const f of ['shim.js', 'boot.js', 'web.css']) cpSync(join(ROOT, 'web', f), join(OUT, 'web', f));
if (!existsSync(ICONS)) throw new Error('icons missing: node tools/web-build.mjs --icons');
cpSync(ICONS, join(OUT, 'icons'), { recursive: true });

/** Pages get the web layer before their own scripts. */
const HEAD = `
  <meta name="theme-color" content="#15203a">
  <meta name="description" content="AnteFirma: prima di accettare, sai a che cosa ti impegni. Analizza contratti e condizioni, ricorda le scadenze, scrive la lettera di disdetta.">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="stylesheet" href="/web/web.css">
  <script src="/web/shim.js"></script>
  <script type="module" src="/web/boot.js"></script>
</head>`;
const prepare = (file, extra = (h) => h) => extra(readFileSync(file, 'utf8')
  .replace('<html lang="it">', `<html lang="it" data-version="${version}">`)
  .replace('</head>', HEAD));
// The panel is the main page, at the root: <base> keeps its relative paths valid.
writeFileSync(join(OUT, 'index.html'), prepare(join(OUT, 'src', 'sidepanel', 'sidepanel.html'), (h) => h.replace('<head>', '<head>\n  <base href="/src/sidepanel/">')));
rmSync(join(OUT, 'src', 'sidepanel', 'sidepanel.html'));
// Whoever arrives at the panel's old address (internal extension links) goes back to the root.
writeFileSync(join(OUT, '_redirects'), '/src/sidepanel/sidepanel.html / 301\n/src/sidepanel/sidepanel / 301\n/src/options/options.html /settings/ 301\n/src/options/options /settings/ 301\n');
// Settings at /settings/, not in the extension folder: <base> keeps the paths valid.
const opt = join(OUT, 'src', 'options', 'options.html');
mkdirSync(join(OUT, 'settings'), { recursive: true });
writeFileSync(join(OUT, 'settings', 'index.html'), prepare(opt, (h) => h
  .replace('<head>', '<head>\n  <base href="/src/options/">')
  .replace('<div class="wrap">', '<div class="wrap">\n    <a class="web-back" href="/">← AnteFirma</a>')));
rmSync(opt);

writeFileSync(join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'AnteFirma', short_name: 'AnteFirma',
  description: 'Prima di accettare, sai a che cosa ti impegni: analizza contratti e condizioni, ricorda le scadenze, scrive la lettera di disdetta.',
  id: '/', start_url: '/', scope: '/', display: 'standalone',
  // "Open with AnteFirma" for PDFs, with the app installed (Chrome and Edge on desktop).
  file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] }, launch_type: 'single-client' }],
  background_color: '#f5f6f8', theme_color: '#15203a', lang: 'it',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');

// The page's security rules: only its own files, the AnteFirma server for analyses
// and Cloudflare's visit statistics (cookieless), which Cloudflare injects itself.
writeFileSync(join(OUT, '_headers'), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.antefirma.app https://cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/sw.js
  Cache-Control: no-cache
`);

// The service worker: the app's files cached, so it opens offline too.
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push('/' + relative(OUT, p).split('\\').join('/')); } };
walk(OUT);
const urls = files.filter((f) => !['/sw.js', '/_headers', '/_redirects'].includes(f))
  .map((f) => (f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f.replace(/\.html$/, '')));
writeFileSync(join(OUT, 'sw.js'), `/* AnteFirma web ${version}: generated by tools/web-build.mjs. */
const CACHE = 'antefirma-web-${version}-${Date.now().toString(36)}';
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// Network first (updates arrive at once), the cached copy when offline. API calls don't go through here.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok && !r.redirected) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : undefined))));
});
`);
console.log(`AnteFirma web ${version}: ${files.length} files in ${OUT}`);

/** The icons: the brand shield, drawn by the browser at 192 and 512 pixels. Redone only if the brand changes. */
async function makeIcons() {
  const SHIELD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72"><path d="M32 4 L55.5 10 C57.5 10.6 58.5 12.2 58.5 14.2 V34 C58.5 48.5 48.5 59.5 34.2 66.6 C33.3 67.1 30.7 67.1 29.8 66.6 C15.5 59.5 5.5 48.5 5.5 34 V14.2 C5.5 12.2 6.5 10.6 8.5 10 Z" fill="#ffe04a"/><path d="M32 6.6 L52.9 11.9 C54.9 12.4 55.9 13.8 55.9 15.5 V32.4 C55.9 46.4 46.6 56.4 33.9 62.7 C33.3 63.2 30.7 63.2 30.1 62.7 C17.4 56.4 8.1 46.4 8.1 32.4 V15.5 C8.1 13.8 9.1 12.4 11.1 11.9 Z" fill="#15203a"/><path d="M32 15.5V37.5M22.47 21L41.53 32M22.47 32L41.53 21" stroke="#ffe04a" stroke-width="6.4" stroke-linecap="round"/><path d="M19 49.5 C22 44 26 43.5 29 47 S34.5 52 38 47.5 S43 42.5 45 43" fill="none" stroke="#ffe04a" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  mkdirSync(ICONS, { recursive: true });
  writeFileSync(join(ICONS, 'favicon.svg'), SHIELD + '\n');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, pad, bg] of [['icon-192', 192, 0.1, 'transparent'], ['icon-512', 512, 0.1, 'transparent'], ['maskable-512', 512, 0.22, '#15203a']]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}"><div style="width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px">${SHIELD.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body></html>`);
    await page.screenshot({ path: join(ICONS, `${name}.png`), omitBackground: bg === 'transparent' });
  }
  await browser.close();
  console.log('icons written to web/icons');
}
