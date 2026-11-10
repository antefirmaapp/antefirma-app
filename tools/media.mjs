/**
 * Video e schermate dell'estensione vera, per il sito, in italiano, inglese e spagnolo.
 *
 *     node tools/media.mjs [cartella]     (predefinita: ../antefirma-site/assets/media)
 *
 * Carica l'estensione in Chromium come fa test/smoke.mjs, con il server di
 * AnteFirma finto (nessuna analisi spesa, niente rete), su una pagina di
 * esempio inventata: la stessa palestra della home del sito. Registra il
 * percorso del click (video .mp4 con ffmpeg) e fotografa l'avviso, il pannello
 * degli impegni e la lettera. Scrive anche media.json, che il sito legge.
 *
 * Richiede Playwright con Chromium e ffmpeg.
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
const W = 1280, H = 800;

/** La pagina di esempio, nelle tre lingue: sito, prezzo e condizioni inventati. */
const PAGE = {
  it: { title: 'Palestra Orizzonte — Abbonamento Plus', name: 'Abbonamento Plus', per: 'al mese', btn: 'Abbonati ora', feats: ['Sala pesi e corsi illimitati', 'Accesso 7 giorni su 7', 'App con le schede di allenamento'],
    terms: 'L’abbonamento ha una durata minima di 12 mesi dalla data di attivazione. Il contratto si rinnova automaticamente per un ulteriore anno salvo disdetta inviata con almeno 30 giorni di preavviso. In caso di recesso anticipato è dovuta una penale di 120 €. La quota di iscrizione non è rimborsabile.',
    q: ['durata minima di 12 mesi', 'si rinnova automaticamente per un ulteriore anno', 'almeno 30 giorni di preavviso', 'penale di 120 €'],
    why: ['Per un anno non puoi smettere di pagare.', 'Se non disdici in tempo, paghi un altro anno.', 'La disdetta deve arrivare un mese prima.', 'Uscire prima costa 120 €.'],
    summary: 'Ti impegni per un anno: si rinnova da solo e uscire prima costa 120 €.', you: { name: 'Mario Rossi', address: 'Via Roma 1, 20100 Milano', email: 'mario.rossi@esempio.it' } },
  en: { title: 'Horizon Gym — Plus membership', name: 'Plus membership', per: 'a month', btn: 'Subscribe now', feats: ['Unlimited gym and classes', 'Open 7 days a week', 'App with training plans'],
    terms: 'The membership has a minimum term of 12 months from activation. The contract renews automatically for a further year unless notice of cancellation is given at least 30 days in advance. Early termination incurs a fee of €120. The joining fee is non-refundable.',
    q: ['minimum term of 12 months', 'renews automatically for a further year', 'at least 30 days in advance', 'fee of €120'],
    why: ['For a year you can’t stop paying.', 'If you don’t cancel in time, you pay for another year.', 'Notice must arrive a month ahead.', 'Leaving early costs €120.'],
    summary: 'You’re committing for a year: it renews on its own and leaving early costs €120.', you: { name: 'Jane Smith', address: '1 High Street, London', email: 'jane.smith@example.com' } },
  es: { title: 'Gimnasio Horizonte — Abono Plus', name: 'Abono Plus', per: 'al mes', btn: 'Contratar ahora', feats: ['Sala de musculación y clases ilimitadas', 'Abierto 7 días a la semana', 'App con planes de entrenamiento'],
    terms: 'El abono tiene una permanencia mínima de 12 meses desde la fecha de alta. El contrato se renovará automáticamente por un año más salvo que se comunique la baja con al menos 30 días de antelación. La baja anticipada conlleva una penalización de 120 €. La matrícula no es reembolsable.',
    q: ['permanencia mínima de 12 meses', 'se renovará automáticamente por un año más', 'al menos 30 días de antelación', 'penalización de 120 €'],
    why: ['Durante un año no puedes dejar de pagar.', 'Si no te das de baja a tiempo, pagas otro año.', 'La baja tiene que llegar un mes antes.', 'Irte antes cuesta 120 €.'],
    summary: 'Te comprometes un año: se renueva solo e irte antes cuesta 120 €.', you: { name: 'Lucía García', address: 'Calle Mayor 1, 28013 Madrid', email: 'lucia.garcia@ejemplo.es' } },
};
const ALT = {
  it: ['L’avviso di AnteFirma al click su «Abbonati»: quanto paghi davvero, entro quando disdire, come si esce.', 'Il pannello laterale: l’impegno registrato, con la sua scadenza.', 'La lettera di disdetta, già scritta con i tuoi dati.'],
  en: ['AnteFirma’s warning on “Subscribe”: what you really pay, when to cancel by, how to get out.', 'The side panel: the commitment recorded, with its deadline.', 'The cancellation letter, already written with your details.'],
  es: ['El aviso de AnteFirma al pulsar «Contratar»: cuánto pagas de verdad, hasta cuándo darte de baja, cómo salir.', 'El panel lateral: el compromiso registrado, con su fecha.', 'La carta de baja, ya escrita con tus datos.'],
};

const page = (l) => {
  const p = PAGE[l];
  return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><title>${p.title}</title><style>
body{margin:0;background:#eef1f5;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#16191f}
.bar{background:#fff;border-bottom:1px solid #dde2ea;padding:14px 28px;font-weight:700;font-size:18px}
.wrap{max-width:620px;margin:36px auto;padding:0 20px}.card{background:#fff;border-radius:16px;padding:30px;box-shadow:0 2px 16px rgba(0,0,0,.07)}
h1{margin:0 0 6px;font-size:26px}.price{font-size:42px;font-weight:800;letter-spacing:-.02em}.price small{font-size:16px;color:#6b7280;font-weight:400}
ul{padding-left:20px;color:#414852}button{width:100%;margin-top:16px;background:#1f7a4d;color:#fff;border:0;border-radius:12px;padding:16px;font:700 17px system-ui,sans-serif;cursor:pointer}
.fine{font-size:11px;color:#8a93a2;margin-top:14px;line-height:1.5}
#cur{position:fixed;left:0;top:0;width:26px;height:26px;pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px);transition:transform .05s linear}
</style></head><body><div class="bar">${p.title.split(' — ')[0]}</div><div class="wrap"><div class="card"><h1>${p.name}</h1>
<div class="price">39 € <small>${p.per}</small></div><ul>${p.feats.map((f) => `<li>${f}</li>`).join('')}</ul>
<form id="f"><button type="submit" class="cta">${p.btn}</button></form><p class="fine">${p.terms}</p></div></div>
<svg id="cur" viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.6L10 19z" fill="#fff" stroke="#15203a" stroke-width="1.6" stroke-linejoin="round"/></svg>
<script>addEventListener('mousemove',(e)=>{document.getElementById('cur').style.transform='translate('+(e.clientX-4)+'px,'+(e.clientY-3)+'px)'});
document.getElementById('f').addEventListener('submit',(e)=>{e.preventDefault();});</script></body></html>`;
};

// Un dominio inventato (.example non esiste): l'avviso e la lettera mostrano il nome del sito, non 127.0.0.1.
const HOST = { it: 'palestra-orizzonte.example', en: 'horizon-gym.example', es: 'gimnasio-horizonte.example' };

const verdict = (l) => {
  const p = PAGE[l];
  return {
    findings: [['minimum_term', 0], ['auto_renewal', 1], ['notice_period', 2], ['early_termination_penalty', 3]]
      .map(([category, i]) => ({ category, quote: p.q[i], why: p.why[i], confidence: 0.9 })),
    terms: {
      price: { value: 39, quote: '39 €' }, currency: { value: 'EUR' }, billing_period: { value: 'month' },
      minimum_term_months: { value: 12, quote: p.q[0] }, notice_days: { value: 30, quote: p.q[2] },
      exit_fee: { value: 120, quote: p.q[3] }, extra_fees: [],
    },
    summary: p.summary, dropped: 0, truncated: false, model: 'finto', cached: false,
    quota: { plan: 'free', remaining: 4, month: { limit: 5, remaining: 4 } },
  };
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
  await context.route(`https://${HOST[l]}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page(l) }));
  await context.route('https://api.antefirma.app/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/v1/health') return json({ ok: true });
    if (path === '/v1/register') return json({ token: 'v1.finto' });
    if (path === '/v1/license') return json({ plan: 'free', active: false, quota: { month: { limit: 5, remaining: 4 } } });
    if (path === '/v1/analyze') { await new Promise((r) => setTimeout(r, 1800)); return json(verdict(l)); }
    return route.fulfill({ status: 404, body: '{}' });
  });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = new URL(sw.url()).host;

  // Lingua, consenso e dati per la lettera, come farebbe la persona.
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

  // Il pannello degli impegni e la lettera.
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 420, height: 720 });
  await panel.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`);
  await panel.waitForTimeout(800);
  await panel.click('#tab-btn-commitments');
  await panel.waitForTimeout(900);
  await panel.screenshot({ path: join(dir, 'impegni.jpg'), type: 'jpeg', quality: 85 });
  // La lettera dell'estensione è scritta per un fornitore italiano: si mostra solo nella pagina italiana.
  if (l === 'it') {
    await panel.locator('[data-act="letter"]').first().click();
    await panel.waitForTimeout(1000);
    await panel.screenshot({ path: join(dir, 'lettera.jpg'), type: 'jpeg', quality: 85 });
  }
  await context.close();

  // .mp4 (H.264) per tutti i browser; avvio veloce in streaming.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(dir, 'demo.mp4')]);
  rmSync(vids, { recursive: true, force: true });
  const [a1, a2, a3] = ALT[l];
  writeFileSync(join(dir, 'media.json'), JSON.stringify({
    video: 'demo.mp4', poster: 'poster.jpg',
    shots: [{ file: 'avviso.jpg', alt: a1, w: W, h: H }, { file: 'impegni.jpg', alt: a2, w: 420, h: 720 }, ...(l === 'it' ? [{ file: 'lettera.jpg', alt: a3, w: 420, h: 720 }] : [])],
  }, null, 1) + '\n');
  const kb = readdirSync(dir).map((f) => `${f} ${Math.round(statSync(join(dir, f)).size / 1024)} kB`).join(', ');
  console.log(`${l}: ${kb}`);
}

for (const l of ['it', 'en', 'es']) await record(l);
