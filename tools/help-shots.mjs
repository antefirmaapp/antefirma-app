/**
 * Help centre screenshots and short videos, in three languages, from the real extension.
 *
 *     node tools/help-shots.mjs [folder]     (default: ../antefirma-site/assets/help)
 *     node tools/help-shots.mjs --no-video    screenshots only (faster)
 *     node tools/help-shots.mjs --lang=it     a single language
 *
 * Rerun for every version that changes how the extension looks: the website puts
 * them in the guides (help.mjs) by the names below, and a missing screenshot
 * simply doesn't appear. Like tools/media.mjs: extension loaded in Chromium,
 * invented gym, fake server (demo-fixture.mjs), no network.
 *
 * Screenshots: consent, waiting, warning, why, panel-examples, panel-result,
 * calendar, commitments, letter, settings-plan, settings-data.
 * Videos (15–20 s, .mp4 via ffmpeg): video-commitment, video-letter, video-key.
 * Also writes sizes.json (width and height of each image).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { PAGE, HOST, mockServer } from './demo-fixture.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VIDEO = !args.includes('--no-video');
const LANGS = args.find((a) => a.startsWith('--lang='))?.slice(7).split(',') || ['it', 'en', 'es', 'de', 'fr', 'nl', 'pl', 'pt', 'sv', 'ro', 'cs', 'da', 'fi', 'no', 'sk', 'hu', 'el', 'hr', 'sl', 'bg'];
const OUT = resolve(args.find((a) => !a.startsWith('--')) || join(ROOT, '..', 'antefirma-site', 'assets', 'help'));
const PANEL = { width: 420, height: 760 };
const SITE = { width: 1180, height: 760 };
const DEMO_KEY = 'AF-DEMO-7K2P-9QX4-M3RT';

async function launch(l, { video, viewport }) {
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'af-help-')), {
    headless: false, viewport, deviceScaleFactor: video ? 1 : 2,
    ...(video ? { recordVideo: { dir: video, size: viewport } } : {}),
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--headless=new', '--no-sandbox', `--lang=${l}`],
  });
  await mockServer(context, l, { delay: video ? 1500 : 3500 });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  return { context, extId: new URL(sw.url()).host };
}

/** Language, country and letter details, as the person would set them. Not consent: it is screenshotted. */
async function setup(context, extId, l, { consent = false } = {}) {
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extId}/src/options/options.html`);
  await opt.waitForTimeout(700);
  await opt.selectOption('#uiLang', l);
  await opt.selectOption('#jurisdiction', { it: 'IT', en: 'EU', es: 'ES', de: 'DE', fr: 'FR', nl: 'NL', pl: 'PL', pt: 'PT', sv: 'SE', ro: 'RO', cs: 'CZ', da: 'DK', fi: 'FI', no: 'NO', sk: 'SK', hu: 'HU', el: 'GR', hr: 'HR', sl: 'SI', bg: 'BG' }[l]);
  const you = PAGE[l].you;
  await opt.fill('#id-name', you.name); await opt.fill('#id-address', you.address); await opt.fill('#id-email', you.email);
  await opt.click('#save');
  await opt.waitForTimeout(1000);
  if (consent && await opt.isVisible('#grant-consent')) { await opt.click('#grant-consent'); await opt.waitForTimeout(500); }
  for (const p of context.pages()) await p.close().catch(() => {});
}

const sizes = {};
async function shot(target, dir, name, opts = {}) {
  const file = join(dir, `${name}.jpg`);
  const bb = await target.screenshot({ path: file, type: 'jpeg', quality: 84, ...opts });
  const vp = opts.clip || (target.viewportSize ? target.viewportSize() : await target.boundingBox());
  sizes[name + '.jpg'] = { w: Math.round(vp.width), h: Math.round(vp.height) };
  return bb;
}

async function screens(l, dir) {
  const { context, extId } = await launch(l, { viewport: SITE });
  await setup(context, extId, l);

  // The moment of the click: consent, waiting, warning, "Why?".
  const pg = await context.newPage();
  const alert = pg.locator('antefirma-alert');
  await pg.goto(`https://${HOST[l]}/abbonati`);
  await pg.waitForTimeout(1000);
  await pg.click('button.cta');
  await pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-consent="accept"]'), null, { timeout: 15000 });
  await pg.waitForTimeout(500);
  await shot(pg, dir, 'consent');
  await alert.locator('[data-consent="accept"]').click();
  await pg.waitForTimeout(1200);
  await shot(pg, dir, 'waiting');
  await pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.tiles .tvalue'), null, { timeout: 15000 });
  await pg.waitForTimeout(2200);
  await shot(pg, dir, 'warning');
  await alert.locator('details.why > summary').click();
  await pg.waitForTimeout(700);
  await shot(pg, dir, 'why');
  await pg.waitForTimeout(1500);
  await alert.locator('[data-act="track"]').click();
  await pg.waitForTimeout(800);
  await pg.close();

  // The panel: examples, result, calendar, commitments, letter.
  const panel = await context.newPage();
  await panel.setViewportSize(PANEL);
  await panel.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`);
  await panel.waitForTimeout(800);
  await panel.click('.source[data-source="paste"]');
  await panel.waitForTimeout(400);
  await shot(panel, dir, 'panel-examples');
  // An example is viewed, not recorded: the result needs a (fake) analysis of the gym text.
  await panel.fill('#paste-text', PAGE[l].terms);
  await panel.fill('#paste-price', '39'); await panel.selectOption('#paste-period', 'month');
  await panel.click('#run-paste');
  await panel.waitForSelector('#track', { timeout: 15000 });
  await panel.waitForTimeout(600);
  await shot(panel, dir, 'panel-result');
  await panel.click('#track');
  await panel.waitForSelector('#cal-ics', { timeout: 10000 });
  await panel.locator('#cal-ics').scrollIntoViewIfNeeded();
  await panel.waitForTimeout(500);
  await shot(panel, dir, 'calendar');
  await panel.click('#tab-btn-commitments');
  await panel.waitForTimeout(800);
  await shot(panel, dir, 'commitments');
  await panel.locator('[data-act="letter"]').first().click();
  await panel.waitForSelector('#letter-lang', { timeout: 10000 });
  await panel.waitForTimeout(600);
  await shot(panel, dir, 'letter');
  await panel.close();

  // Settings: one section at a time.
  const opt = await context.newPage();
  await opt.setViewportSize({ width: 820, height: 900 });
  await opt.goto(`chrome-extension://${extId}/src/options/options.html`);
  await opt.waitForTimeout(1000);
  for (const [name, sel] of [['settings-plan', '#piano'], ['settings-data', '#export-data']]) {
    const sec = opt.locator(sel).locator('xpath=ancestor-or-self::section[1]');
    await sec.scrollIntoViewIfNeeded();
    await opt.waitForTimeout(300);
    await shot(sec, dir, name);
  }
  await context.close();
}

/** A short video: `run` drives the page, the rest (recording, .mp4, poster) is here. */
async function clip(l, dir, name, viewport, run) {
  const vids = mkdtempSync(join(tmpdir(), 'af-hvid-'));
  const { context, extId } = await launch(l, { video: vids, viewport });
  await setup(context, extId, l, { consent: true });
  const page = await context.newPage();
  await run(page, extId, context);
  await page.waitForTimeout(1500);
  const video = page.video();
  await page.close();
  const webm = await video.path();
  await context.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(dir, `${name}.mp4`)]);
  // The poster: the last frame, which shows the result.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.6', '-i', join(dir, `${name}.mp4`), '-frames:v', '1', '-q:v', '4', join(dir, `${name}.jpg`)]);
  sizes[`${name}.jpg`] = { w: viewport.width, h: viewport.height };
  rmSync(vids, { recursive: true, force: true });
}

/** A visible cursor in the video (Playwright doesn't draw one). */
const CURSOR = `(() => { const c = document.createElement('div'); c.id = '__cur';
  c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;border-radius:50%;background:rgba(255,224,74,.85);border:2px solid #15203a;pointer-events:none;z-index:2147483647;transform:translate(-50px,-50px);transition:transform .25s ease';
  document.documentElement.append(c);
  addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 11) + 'px,' + (e.clientY - 11) + 'px)'; }, true); })()`;
async function press(page, sel, wait = 700) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  const bb = await loc.boundingBox();
  if (bb) { await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 18 }); await page.waitForTimeout(350); }
  await loc.click();
  await page.waitForTimeout(wait);
}
const panelUrl = (id) => `chrome-extension://${id}/src/sidepanel/sidepanel.html`;

async function videos(l, dir) {
  // Recording a commitment and adding it to the calendar.
  await clip(l, dir, 'video-commitment', PANEL, async (p, id) => {
    await p.goto(panelUrl(id)); await p.evaluate(CURSOR); await p.waitForTimeout(900);
    await press(p, '.source[data-source="paste"]', 900);
    await press(p, '#paste-text', 200);
    await p.keyboard.insertText(PAGE[l].terms); await p.waitForTimeout(500);
    await p.fill('#paste-price', '39'); await p.selectOption('#paste-period', 'month'); await p.waitForTimeout(500);
    await press(p, '#run-paste', 400);
    await p.waitForSelector('#track', { timeout: 15000 }); await p.waitForTimeout(2500);
    await press(p, '#track', 1200);
    await p.locator('#cal-ics').scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
    await press(p, '#tab-btn-commitments', 2500);
  });
  // Preparing the letter, and changing its language.
  await clip(l, dir, 'video-letter', PANEL, async (p, id) => {
    await p.goto(panelUrl(id)); await p.evaluate(CURSOR);
    await p.click('.source[data-source="paste"]'); await p.fill('#paste-text', PAGE[l].terms);
    await p.fill('#paste-price', '39'); await p.selectOption('#paste-period', 'month'); await p.click('#run-paste');
    await p.waitForSelector('#track', { timeout: 15000 }); await p.click('#track'); await p.waitForTimeout(500);
    await press(p, '#tab-btn-commitments', 1500);
    await press(p, '[data-act="letter"]', 2500);
    const other = { it: 'en', en: 'es', es: 'it', de: 'en', fr: 'en', nl: 'en', pl: 'en', pt: 'en', sv: 'en', ro: 'en', cs: 'en', da: 'en', fi: 'en', no: 'en', sk: 'en', hu: 'en', el: 'en', hr: 'en', sl: 'en', bg: 'en' }[l];
    await p.locator('#letter-lang').scrollIntoViewIfNeeded();
    const bb = await p.locator('#letter-lang').boundingBox();
    if (bb) await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 15 });
    await p.selectOption('#letter-lang', other); await p.waitForTimeout(2000);
    await p.selectOption('#letter-lang', l); await p.waitForTimeout(1500);
    await p.mouse.wheel(0, 500); await p.waitForTimeout(2000);
  });
  // Entering the plan key (fake: the test server accepts it).
  await clip(l, dir, 'video-key', PANEL, async (p, id) => {
    await p.goto(`chrome-extension://${id}/src/options/options.html`); await p.evaluate(CURSOR); await p.waitForTimeout(600);
    await p.locator('#piano').scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
    await press(p, '#plan-key', 300);
    await p.keyboard.type(DEMO_KEY, { delay: 70 });
    await p.waitForTimeout(500);
    await press(p, '#plan-activate', 2500);
    await p.locator('#plan-status').scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  });
}

for (const l of LANGS) {
  const dir = join(OUT, l);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const k of Object.keys(sizes)) delete sizes[k];
  await screens(l, dir);
  if (VIDEO) await videos(l, dir);
  writeFileSync(join(dir, 'sizes.json'), JSON.stringify(sizes, null, 1) + '\n');
  console.log(`${l}: ${readdirSync(dir).length} files`);
}
