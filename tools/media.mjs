/**
 * Videos and screenshots of the real extension, for the website, in Italian, English and Spanish.
 *
 *     node tools/media.mjs [folder]     (default: ../antefirma-site/assets/media)
 *
 * Loads the extension in Chromium like test/smoke.mjs, with a fake AnteFirma
 * server (no analysis spent, no network), on an invented example page: the same
 * gym as on the website's home page. It records the click path (.mp4 video via
 * ffmpeg) and screenshots the warning, the commitments panel and the letter. It
 * also writes media.json, which the website reads.
 *
 * Requires Playwright with Chromium, and ffmpeg.
 */
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, '..', 'antefirma-site', 'assets', 'media'));
import { PAGE, HOST, mockServer } from './demo-fixture.mjs';
const W = 1280, H = 800;

const ALT = {
  it: ['L’avviso di AnteFirma al click su «Abbonati»: quanto paghi davvero, entro quando disdire, come si esce.', 'Il pannello laterale: l’impegno registrato, con la sua scadenza.', 'La lettera di disdetta, già scritta con i tuoi dati.'],
  en: ['AnteFirma’s warning on “Subscribe”: what you really pay, when to cancel by, how to get out.', 'The side panel: the commitment recorded, with its deadline.', 'The cancellation letter, already written with your details.'],
  es: ['El aviso de AnteFirma al pulsar «Contratar»: cuánto pagas de verdad, hasta cuándo darte de baja, cómo salir.', 'El panel lateral: el compromiso registrado, con su fecha.', 'La carta de baja, ya escrita con tus datos.'],
};

async function record(l) {
  const dir = join(OUT, l);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const vids = mkdtempSync(join(tmpdir(), 'af-video-'));
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'af-media-')), {
    headless: false, viewport: { width: W, height: H }, recordVideo: { dir: vids, size: { width: W, height: H } },
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--headless=new', '--no-sandbox', `--lang=${l}`],
  });
  await mockServer(context, l);
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = new URL(sw.url()).host;

  // Language, consent and letter details, as the person would set them.
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extId}/src/options/options.html`);
  await opt.waitForTimeout(800);
  await opt.selectOption('#uiLang', l);
  await opt.selectOption('#jurisdiction', { it: 'IT', en: 'EU', es: 'ES' }[l]);
  const you = PAGE[l].you;
  await opt.fill('#id-name', you.name); await opt.fill('#id-address', you.address); await opt.fill('#id-email', you.email);
  await opt.click('#save');
  await opt.waitForTimeout(1200);
  if (await opt.isVisible('#grant-consent')) { await opt.click('#grant-consent'); await opt.waitForTimeout(600); }
  for (const p of context.pages()) if (p !== opt) await p.close().catch(() => {});

  const pg = await context.newPage();
  const alert = pg.locator('antefirma-alert');
  await pg.goto(`https://${HOST[l]}/abbonati`);
  await pg.mouse.move(980, 140);
  await pg.waitForTimeout(1400);
  await pg.screenshot({ path: join(dir, 'poster.jpg'), type: 'jpeg', quality: 82 });
  const btn = await pg.locator('button.cta').boundingBox();
  await pg.mouse.move(btn.x + btn.width * 0.5, btn.y + btn.height * 0.5, { steps: 40 });
  await pg.waitForTimeout(500);
  await pg.mouse.down(); await pg.mouse.up();
  await pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.tiles .tvalue'), null, { timeout: 15000 });
  await pg.waitForTimeout(2600);
  await pg.screenshot({ path: join(dir, 'avviso.jpg'), type: 'jpeg', quality: 82 });
  const why = alert.locator('details.why > summary');
  if (await why.count()) {
    const bb = await why.boundingBox();
    if (bb) await pg.mouse.move(bb.x + 30, bb.y + bb.height / 2, { steps: 25 });
    await why.click(); await pg.waitForTimeout(2500);
  }
  const track = alert.locator('[data-act="track"]');
  await pg.waitForTimeout(1500);
  const tb = await track.boundingBox();
  if (tb) await pg.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 30 });
  await pg.waitForTimeout(600);
  await track.click();
  await pg.waitForTimeout(2500);
  const video = pg.video();
  await pg.close();
  const webm = await video.path();

  // The commitments panel and the letter.
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 420, height: 720 });
  await panel.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`);
  await panel.waitForTimeout(800);
  await panel.click('#tab-btn-commitments');
  await panel.waitForTimeout(900);
  await panel.screenshot({ path: join(dir, 'impegni.jpg'), type: 'jpeg', quality: 85 });
  // The letter, in the provider's language (Italian, Spanish or English).
  await panel.locator('[data-act="letter"]').first().click();
  await panel.waitForTimeout(1000);
  await panel.screenshot({ path: join(dir, 'lettera.jpg'), type: 'jpeg', quality: 85 });
  await context.close();

  // .mp4 (H.264) for every browser; fast start for streaming.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(dir, 'demo.mp4')]);
  rmSync(vids, { recursive: true, force: true });
  const [a1, a2, a3] = ALT[l];
  writeFileSync(join(dir, 'media.json'), JSON.stringify({
    video: 'demo.mp4', poster: 'poster.jpg',
    shots: [{ file: 'avviso.jpg', alt: a1, w: W, h: H }, { file: 'impegni.jpg', alt: a2, w: 420, h: 720 }, { file: 'lettera.jpg', alt: a3, w: 420, h: 720 }],
  }, null, 1) + '\n');
  const kb = readdirSync(dir).map((f) => `${f} ${Math.round(statSync(join(dir, f)).size / 1024)} kB`).join(', ');
  console.log(`${l}: ${kb}`);
}

for (const l of ['it', 'en', 'es']) await record(l);
