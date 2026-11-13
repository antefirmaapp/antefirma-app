/**
 * beta.antefirma.app: the download page for developers and testers, in Italian
 * (/) and English (/en/).
 *
 *     node tools/beta-site-build.mjs [folder]     (default: dist/beta-site)
 *
 * It builds the packages it offers and puts them next to the pages:
 *  - files/antefirma-dev-<version>.zip     Chrome and Edge (tools/dev-zip.mjs)
 *  - files/antefirma-safari-<version>.zip  the folder for Xcode (tools/safari-build.mjs)
 *  - files/antefirma-dev-latest.zip and files/antefirma-safari-latest.zip, the same bytes
 *  - versions.json                         version, sizes and SHA-256, for scripts
 * The desktop app is AnteFirma web (web.antefirma.app): the page links to it.
 *
 * The "antefirma-beta" Worker (wrangler.beta.toml) publishes dist/beta-site. The
 * build has no dependencies and no external commands (tools/zip.mjs), so
 * Cloudflare Workers Builds can run it on every push.
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { buildDevZip, DEV_ID } from './dev-zip.mjs';
import { zipFolder } from './zip.mjs';
import { TEXT } from '../beta-site/text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'dist', 'beta-site'));
const ORIGIN = 'https://beta.antefirma.app';
const version = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'files'), { recursive: true });
mkdirSync(join(OUT, 'en'), { recursive: true });

// ── the packages ───────────────────────────────────────────────────────────────
const chromeZip = readFileSync(buildDevZip());
execFileSync(process.execPath, [join(ROOT, 'tools', 'safari-build.mjs')], { cwd: ROOT, stdio: 'ignore' });
// The archive holds a "safari" folder: the converter command on the page expects that name.
const safariZip = zipFolder(join(ROOT, 'dist', 'safari'), 'safari/');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const FILES = {
  chrome: { name: `antefirma-dev-${version}.zip`, latest: 'antefirma-dev-latest.zip', data: chromeZip },
  safari: { name: `antefirma-safari-${version}.zip`, latest: 'antefirma-safari-latest.zip', data: safariZip },
};
for (const f of Object.values(FILES)) {
  writeFileSync(join(OUT, 'files', f.name), f.data);
  writeFileSync(join(OUT, 'files', f.latest), f.data);
  f.size = f.data.length;
  f.sha256 = sha(f.data);
}
writeFileSync(join(OUT, 'versions.json'), JSON.stringify({
  version,
  extensionId: DEV_ID,
  files: Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, { url: `${ORIGIN}/files/${f.name}`, latest: `${ORIGIN}/files/${f.latest}`, size: f.size, sha256: f.sha256 }])),
  desktop: 'https://web.antefirma.app/',
}, null, 2) + '\n');

// ── the pages ──────────────────────────────────────────────────────────────────
const LOGO = '<svg viewBox="0 0 64 72" aria-hidden="true"><path d="M32 4 L55.5 10 C57.5 10.6 58.5 12.2 58.5 14.2 V34 C58.5 48.5 48.5 59.5 34.2 66.6 C33.3 67.1 30.7 67.1 29.8 66.6 C15.5 59.5 5.5 48.5 5.5 34 V14.2 C5.5 12.2 6.5 10.6 8.5 10 Z" fill="var(--mark)"/><path d="M32 6.6 L52.9 11.9 C54.9 12.4 55.9 13.8 55.9 15.5 V32.4 C55.9 46.4 46.6 56.4 33.9 62.7 C33.3 63.2 30.7 63.2 30.1 62.7 C17.4 56.4 8.1 46.4 8.1 32.4 V15.5 C8.1 13.8 9.1 12.4 11.1 11.9 Z" fill="var(--ink)"/><path d="M32 15.5V37.5M22.47 21L41.53 32M22.47 32L41.53 21" stroke="var(--mark)" stroke-width="6.4" stroke-linecap="round"/><path d="M19 49.5 C22 44 26 43.5 29 47 S34.5 52 38 47.5 S43 42.5 45 43" fill="none" stroke="var(--mark)" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICONS = {
  chrome: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.4h8.8M8.9 13.8 4.5 6.2M15.1 13.8l-4.4 7.6" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  edge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.5c0-5-3.8-9-8.5-9S3.5 8 3.5 12.5 7 20 11.5 20c2.6 0 4.6-.9 6-2.3-1 .3-2 .4-3 .2-2.7-.4-4.5-2.4-4.5-4.6 0-1.7 1.4-3 3.3-3s3.4 1.4 3.4 3.2h3.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  safari: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15.8 8.2-2.4 5.2-5.2 2.4 2.4-5.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  desktop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 20h7M12 16.5V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

const fill = (s) => s.replaceAll('{v}', version).replaceAll('{id}', DEV_ID);
const mb = (n, lang) => `${new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: 1 }).format(n / 1e6)} MB`;
const steps = (list) => `<ol class="steps">${list.map((s) => `<li>${fill(s)}</li>`).join('')}</ol>`;

function card(key, L, lang) {
  const c = L.cards[key];
  const f = key === 'edge' ? FILES.chrome : FILES[key];
  const href = key === 'desktop' ? 'https://web.antefirma.app/' : `/files/${f.name}`;
  const anchor = { chrome: 'chrome', edge: 'edge', safari: 'safari', desktop: 'desktop' }[key];
  const meta = f ? `<dl class="meta"><div><dt>${L.size}</dt><dd>${mb(f.size, lang)}</dd></div>
<div><dt>${L.sha}</dt><dd><code class="hash" title="${f.sha256}">${f.sha256.slice(0, 16)}…</code><button type="button" class="copy" data-copy="${f.sha256}">${L.copy}</button></dd></div></dl>` : '';
  return `<article class="card" data-browser="${key}">
<p class="rec" hidden>${L.recommended}</p>
<h3><span class="icon">${ICONS[key]}</span>${c.name}</h3>
<p>${c.what}</p>
<a class="btn" href="${href}"${f ? ' download' : ' rel="noopener"'}>${c.btn}</a>
${meta}
<a class="more" href="#${anchor}">${L.guideLink}</a>
</article>`;
}

function page(lang) {
  const L = TEXT[lang];
  const other = lang === 'it' ? 'en' : 'it';
  const path = lang === 'it' ? '/' : '/en/';
  const otherPath = other === 'it' ? '/' : '/en/';
  const pre = lang === 'it' ? '' : '../';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<meta name="description" content="${L.description}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${ORIGIN}${path}">
<link rel="alternate" hreflang="it" href="${ORIGIN}/">
<link rel="alternate" hreflang="en" href="${ORIGIN}/en/">
<link rel="icon" href="${pre}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${pre}beta.css">
<script src="${pre}beta.js" defer></script>
</head>
<body data-copied="${L.copied}">
<a class="skip" href="#main">${L.skip}</a>
<header class="top"><div class="wrap">
<a class="brand" href="${path}">${LOGO}<span>AnteFirma <em>beta</em></span></a>
<a class="lang" href="${otherPath}" hreflang="${other}" lang="${other}">${L.other}</a>
</div></header>
<main id="main">
<section class="hero"><div class="wrap">
<p class="eyebrow">${L.eyebrow} · <span class="ver">${fill(L.built)}</span></p>
<h1>${L.h1}</h1>
<p class="lead">${L.lead}</p>
<p class="note">${L.notStore}</p>
</div></section>
<section class="wrap" aria-labelledby="dl"><h2 id="dl">${L.dlH}</h2>
<div class="cards">${['chrome', 'edge', 'safari', 'desktop'].map((k) => card(k, L, lang)).join('\n')}</div>
</section>
<section class="wrap guide" aria-labelledby="guide"><h2 id="guide">${L.guideH}</h2>
<h3 id="chrome">${L.chromeH}</h3>${steps(L.chromeSteps)}<p class="tip">${L.chromeNote}</p>
<h3 id="edge">${L.edgeH}</h3>${steps(L.edgeSteps)}<p class="tip">${L.edgeNote}</p>
<h3 id="safari">${L.safariH}</h3><p>${L.safariIntro}</p>${steps(L.safariSteps)}<p class="tip">${L.safariNote}</p>
<h3 id="desktop">${L.desktopH}</h3><p>${L.desktopIntro}</p>${steps(L.desktopSteps)}<p class="tip">${L.desktopNote}</p>
<h3 id="update">${L.updateH}</h3><ul class="plain">${L.updateSteps.map((s) => `<li>${s}</li>`).join('')}</ul>
<h3 id="trouble">${L.troubleH}</h3>
${L.trouble.map(([q, a]) => `<details><summary>${q}</summary><p>${fill(a)}</p></details>`).join('\n')}
</section>
<section class="wrap guide dev" aria-labelledby="devguide"><h2 id="devguide">${L.devH}</h2>
<p>${L.devIntro}</p>
<h3 id="source">${L.devSourceH}</h3>${L.devSource}
<h3 id="tests">${L.devTestsH}</h3>${L.devTests}
<h3 id="local">${L.devStackH}</h3>${L.devStack}
<h3 id="build">${L.devBuildH}</h3>${L.devBuild}
<h3 id="ids">${L.devIdsH}</h3>
<dl class="facts">${L.devIds.map(([k, v]) => `<div><dt>${k}</dt><dd>${fill(v)}</dd></div>`).join('')}</dl>
<h3 id="more">${L.devMoreH}</h3><p>${L.devMore}</p>
</section>
</main>
<footer class="foot"><div class="wrap">
<p>${L.footer} · ${fill(L.built)}</p>
<nav><a href="${L.siteUrl}">${L.site}</a><a href="${L.helpUrl}">${L.help}</a><a href="${L.privacyUrl}">${L.privacy}</a><a href="${pre}versions.json">versions.json</a></nav>
</div></footer>
</body>
</html>
`;
}

// Code blocks scroll sideways on a phone: tabindex lets keyboard users scroll them too.
const focusablePre = (html) => html.replaceAll('<pre>', '<pre tabindex="0">');
writeFileSync(join(OUT, 'index.html'), focusablePre(page('it')));
writeFileSync(join(OUT, 'en', 'index.html'), focusablePre(page('en')));
cpSync(join(ROOT, 'beta-site', 'beta.css'), join(OUT, 'beta.css'));
cpSync(join(ROOT, 'beta-site', 'beta.js'), join(OUT, 'beta.js'));
writeFileSync(join(OUT, 'favicon.svg'), LOGO.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replaceAll('var(--mark)', '#ffe04a').replaceAll('var(--ink)', '#15203a'));
writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
// Strict rules: only the page's own files, plus Cloudflare Web Analytics (injected by
// Cloudflare, cookieless), as on web.antefirma.app. The ZIPs are served as downloads
// and never cached for long.
writeFileSync(join(OUT, '_headers'), `/*
  Content-Security-Policy: default-src 'none'; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src https://cloudflareinsights.com; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Robots-Tag: noindex
/files/*
  Content-Type: application/zip
  Content-Disposition: attachment
  Cache-Control: public, max-age=300
`);

console.log(`dist/beta-site ready (version ${version}): ${Object.values(FILES).map((f) => `${f.name} ${f.sha256.slice(0, 12)}`).join(', ')}`);
