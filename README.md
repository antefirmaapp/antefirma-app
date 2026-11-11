# AnteFirma

**Before you sign, you know what you are committing to.**

[antefirma.app](https://antefirma.app) · extension for Chrome and Edge (Manifest V3) · web app at
[web.antefirma.app](https://web.antefirma.app) · Safari build prepared

It kicks in when you are about to press a button that commits you — Accept,
Subscribe, Buy, Sign — and tells you in euros and dates what you are committing
to: real cost, minimum term, automatic renewal, exit fees, notice periods,
arbitration, licences on your content, use of your data. The result is not
`Risk score 73/100` but:

> **You see €19.99/month, but you are committing up to €648.76**
> €19.99 × 24 cycles + exit fee €120.00 + activation €49.00
> 📌 You must send the cancellation by 16 June 2028.

Every warning quotes the exact sentence of the page it comes from: if the
sentence isn't there, the warning doesn't appear. After the yes: reminders before
the last day to cancel, a cancellation letter already written (Italian, Spanish
or English, with the laws of the provider's country), the list of commitments in
the side panel. No account.

The interface is in Italian, English and Spanish. Code, comments, tests and
documentation are in English (`npm run check:english` enforces it).

---

## How it works

```
button pressed ──► content script (holds the click, reads the page)
                          │
                          ▼
                    service worker ──► POST /v1/analyze ──► AnteFirma server ──► Claude
                          │                                   (drops every risk whose
                          │                                    quote isn't in the text)
                          ▼
     severity and labels · cost · deadlines · profile · EU/IT protections · score
                          │
                          ▼
           warning on the page  →  Go back / Continue and remind me to cancel
```

- **The server does the analysis** (`antefirma-server`): the extension holds no
  key. It sends the page text, the address, the action type, the button text and
  the country; it receives the risks with their quotes and the economic terms,
  each with the passage it comes from.
- **Severities, labels and colours are decided by the extension**
  (`src/core/constants.js`), not by the model. The model's confidence only moves
  severity downwards, and only a little.
- **The cost** is computed only from the figures the server verified in the
  quoted passage — fee, term, notice, exit fee and extra costs (`extra_fees`:
  activation, setup, per-instalment charges multiplied by the cycles) — plus the
  price read on the page near the button (which wins over the one in the text).
- **Personal profile, EU/IT protections, score, deadlines**: all local.
- **If the server doesn't answer**, the warning says so and lets the user choose.
  There is no fallback verdict: faking "all fine" would be worse.

### Consent

The page text goes to the server only after an explicit yes, asked at the first
analysis inside the warning (or in the panel, or in settings). This is exactly
what the Chrome Web Store requires: an explanation in the interface and an act of
acceptance before collection. The "Yes, analyse" button only accepts real clicks
(`isTrusted`): the warning lives in an open shadow root, and a page script must
not be able to press it on the person's behalf.

### The token

On installation the extension generates a random id (`crypto.randomUUID()`) and
asks the server for a token (`POST /v1/register`). The token identifies the
installation, not the person, and expires after 90 days: on a 401 a new one is
requested and the call retried once.

---

## Installation (development)

Chrome, Edge or Brave **version 116 or later**.

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and select this folder.
3. On first load the welcome page opens.

Try it: serve `demo/` with a local server (`python3 -m http.server -d demo`) and
press "Conferma abbonamento" in `checkout.html`. The "Iscriviti alla newsletter"
button must **not** trigger anything. There is also a demo page at
https://antefirma.app/demo/.

```bash
npm ci                 # dev dependencies: ESLint, fast-check, axe-core
npm test               # unit, golden and contract tests
npm run test:e2e       # the extension in a real Chromium (needs Playwright)
npm run test:e2e:all   # smoke, every e2e scenario and the web app (about 2 minutes)
npm run test:web       # the web app in a real Chromium
npm run test:visual    # screenshots compared with test/visual/
npm run lint
npm run check:english
```

### Against a local server

The server address lives in one place, `src/core/config.js`
(`https://api.antefirma.app`). To test with `npm start` in `antefirma-server`:

1. in `src/core/config.js` set `http://localhost:8787`;
2. in `manifest.json` add `http://localhost:8787/*` to `host_permissions`;
3. start the server with an empty `ALLOWED_ORIGINS` (accepts any origin) or with
   the id the extension has in `chrome://extensions`.

Don't publish these two changes.

---

## Permissions and why

| Permission | What it is for |
|---|---|
| `https://api.antefirma.app/*` | the analysis server |
| `<all_urls>` | interception must work on any site; downloading the terms document linked to the button |
| `activeTab`, `scripting` | reading the current page when you ask from the panel |
| `storage` + `unlimitedStorage` | settings, cache, commitments and the full text of proofs |
| `alarms` | the daily pass and the terms check |
| `notifications` | deadline reminders |
| `sidePanel` | the panel with manual analyses, commitments and history |
| `contextMenus` | "Analyse the selected text" |

## What leaves the browser

**To the AnteFirma server, only after consent:** the page text (at most 80,000
characters), its address, the action type, the button text, the language and the
country chosen in settings, the installation token.

**Never leaves:** browsing history, letter details, recorded commitments,
proofs, the personal profile.

The check of terms already accepted re-reads the public document and, only if
the text changed, has the server read it again (it can be turned off in
settings: then it only says the text changed).

---

## Developer and tester package

```bash
node tools/dev-zip.mjs     # → dist/antefirma-dev-<version>.zip
```

The package's manifest carries a fixed public key, so the ID is always
`alfaikbfkaimaejlhghbjffihjgoigoh`, allowed on the server (`ALLOWED_ORIGINS`).
The ZIP is uploaded to the R2 bucket `antefirma-backup` (EU jurisdiction) under
`dev/` and downloaded from the admin panel, **Tools → Developer extension**. The
repository's manifest stays without a key: the store assigns its own ID.

## AnteFirma web (installable on the desktop)

```bash
node tools/web-build.mjs           # → dist/web, published on web.antefirma.app
node tools/web-build.mjs --icons   # only if the brand changes: regenerates web/icons (needs Playwright)
```

It publishes itself: the **antefirma-web** Worker (`wrangler.toml` in this folder)
is linked to this repository with Workers Builds (build `node tools/web-build.mjs`,
deploy `npx wrangler deploy`). Every push updates the web version too.
`dist/web/_headers` sets the page's security rules (CSP: only its own files and
api.antefirma.app).

The same panel, settings and "background" code, with `web/shim.js` imitating
Chrome's APIs in a normal page (IndexedDB, timers, browser notifications). It is
an installable app (PWA): manifest, icons, service worker. It does: pasted text
and PDFs, commitments, deadlines, letters, plan and key. It cannot: stop clicks
on other sites or read other tabs (that needs the extension). The server must
allow the origin `https://web.antefirma.app` (`APP_ORIGINS`).

## Help, screenshots and videos

The help centre is on the website (`antefirma.app/aiuto/`, texts in
`antefirma-site/help.mjs`). The "?" in the panel, settings and warning leads
there through `src/core/help.js` (same keys and addresses: `test/help.test.mjs`
checks it).

For every version that changes the look, regenerate the images and the manual:

    node tools/help-shots.mjs                             # screenshots and 15–20 s videos, it/en/es → ../antefirma-site/assets/help
    (cd ../antefirma-site && node tools/manual-pdf.mjs)   # Team page + PDF manual in three languages

Both use a fake server and an invented site: no analysis spent, no real data.

## Safari (Mac)

```bash
node tools/safari-build.mjs     # → dist/safari: manifest without side panel and notifications
```

Then, **on a Mac with Xcode** (it can't be done from Linux):

```bash
xcrun safari-web-extension-converter dist/safari --project-location safari-xcode \
  --app-name AnteFirma --bundle-identifier app.antefirma.safari --macos-only --copy-resources
```

1. Open the project in Xcode, choose your Team in *Signing & Capabilities*, press Run.
2. In Safari: *Settings → Advanced → Show features for web developers*, then
   *Develop → Allow unsigned extensions*; enable AnteFirma in *Settings → Extensions*.
3. Publishing needs the Apple Developer Program (USD 99 a year) and submission
   through App Store Connect, like an app.

In Safari the panel opens from the toolbar button (popup) and from the context
menu (tab); there are no notifications, reminders stay in the panel and in the
calendar (.ics). The server accepts `safari-web-extension://` origins with
`ALLOW_SAFARI=1`. To be tested on a Mac before publishing: a module service
worker needs Safari 16.4 or later.

## Tests

| file | what it covers |
|---|---|
| `engine.test.mjs` | from the server's answer to the verdict: severity, cost, deadlines, profile, protections, score; message guards |
| `server.test.mjs` | server client: token, retry after a 401, errors |
| `calibration.test.mjs` | the score stays calibrated on the nine texts of `fixtures/corpus.mjs` |
| `features.test.mjs` | proof, commitments, reminders, `.ics`, letters |
| `actions.test.mjs` | which buttons are intercepted; price choice on the page |
| `pdf.test.mjs` | text extraction from PDFs |
| `i18n.test.mjs` | every sentence of code and pages has its English and Spanish translation, with the same placeholders |
| `golden.test.mjs` | verdicts, panel HTML (it/en/es), letters (3 × 3) and `.ics` compared with approved copies in `test/golden/` (`UPDATE_GOLDEN=1` to accept a deliberate change) |
| `contract.test.mjs` | test fixtures and the demo mock match the API contract shared with the server (`test/contract/`) |
| `help.test.mjs`, `names.test.mjs` | help links; seller name on payment pages |
| `properties.test.mjs` | property-based tests (fast-check): amounts, cost, reminders, score, seller names, `.ics` hold for hundreds of random inputs |
| `e2e/all.mjs` | end-to-end scenarios on fresh profiles (`e2e/harness.mjs`, shared with `smoke.mjs`): every demo page as `demo/index.html` declares, slow server and "Continue without waiting", timeout / network / 500 / malformed answers never shown as "all fine", 401 retry without loops, quota and active licence, SPA, double click, iframe, Enter, "Go back" / "Continue", synthetic clicks on "Yes, analyse" (`ONLY=failures` for one) |
| `detector.test.mjs` | which buttons are held on 30 realistic pages in `test/fixtures/pages/` (each with its expected `.json`): precision, recall, content-script coverage |
| `web.mjs` | the web app in a real Chromium: first visit, consent, verdict, settings, phone width, axe-core accessibility |
| `visual.mjs` | visual regression: ten web app screens (desktop and phone) against the approved images in `test/visual/` (`UPDATE_VISUAL=1` to approve a deliberate change) |
| `smoke.mjs` | the extension in a real Chromium with a fake server: interception, consent, verdict and cost, "Continue and remind me", "Upgrade to Pro", Spanish settings, English warning and panel, axe-core accessibility of warning, panel, settings and welcome (`SHOTS=folder` saves screenshots) |

The server is replaced by hand-written or recorded answers
(`fixtures/responses.mjs`). The model's quality is measured on the server with
`npm run eval`. GitHub Actions runs lint, the English check, tests with coverage
thresholds, the web build, the extension and web app in Chromium and the visual
check on every push.

---

## Code structure

```
manifest.json, _locales/{it,en,es}   name and description in three languages
src/background/service-worker.js     listeners and message router
src/background/{settings,analysis,commitments,changes,exit-kit,plan}.js  the work behind each message
src/content/                         detector, page context, warning
src/core/config.js                   server address
src/core/server.js                   server client: token, analysis, errors
src/core/analyzer.js                 from the server's answer to the verdict
src/core/consequence.js              cost and timeline from verified figures
src/core/{profile,eu,scoring}.js     profile, EU/IT protections, score
src/core/{commitments,letter,ics,proof}.js  exit kit and proof
src/core/help.js                     links to the help centre
src/sidepanel/, src/options/         panel and settings
src/i18n/                            languages: t(), locales/*.json, generated messages.js, page translation
src/lib/pdf-text.js                  dependency-free PDF text extractor
web/                                 the web app layer (shim, boot, styles, icons)
tools/                               builds, screenshots, dev package, English check
```

Conventions: everything in English except user-facing text; no secrets in code.

**Languages.** Code refers to user-facing texts by English id: `t('goBack')`,
`tn(n, 'nDay', 'nDays2')` for singular and plural. The texts live in
`src/i18n/locales/{it,en,es}.json`; after editing them run
`node tools/i18n-build.mjs`, which writes `src/i18n/messages.js` (content scripts
can't import JSON). HTML pages are written in Italian and translated by
`src/i18n/dom.js`, which finds each text's id in `it.json`. The language is chosen
in settings ("Automatic" follows the browser; outside it/es, English) and also
applies to the server's answers. `test/i18n.test.mjs` fails if an id is missing
in any language, if placeholders differ, if `messages.js` is stale, or if an id
is unused.

### Mutation testing

Coverage says which lines run, not whether the tests would notice a mistake.
`npm run test:mutation` (Stryker, config in `stryker.config.json`) changes
src/core/consequence.js, scoring.js, ics.js and commitments.js one small piece at a time and checks that some test fails. Slow (tens of
minutes): it runs weekly in GitHub Actions and on demand (*Mutation testing*
workflow), not on every push; the HTML report is kept as an artifact.
Last run: consequence.js 82%, ics.js 81%, scoring.js 60%, commitments.js 60% (overall 72%, was 67%). Most survivors left are equivalent changes (the same
behaviour written differently) or texts.

## Known limits

- **The model can stay silent about a risk**: quote verification stops it from
  inventing risks, not from omitting them. A page can try to talk it into silence.

## Legal notice

AnteFirma produces **automated analysis for information only. It is not legal
advice.** Legal references show where to look, not whether a clause is valid in a
specific case. Generated letters are templates to check before sending. The
commitment figure is an estimate derived from the text, not a quote.
