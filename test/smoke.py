"""
Smoke test end-to-end: carica davvero l'estensione in Chromium, apre la pagina
demo e verifica che il click su "Conferma abbonamento" venga intercettato.

    python3 test/smoke.py

Serve a intercettare ciò che i test unitari non vedono: manifest malformato,
service worker che non parte, content script che non si aggancia, errori di
sintassi nei file che girano solo nel browser.
"""

import http.server
import os
import time
import socketserver
import sys
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8731

results = []


def check(name, ok, detail=""):
    results.append(ok)
    mark = "  ok  " if ok else "NOT OK"
    print(f"{mark}  {name}" + (f" — {detail}" if detail else ""), flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "demo"), **kwargs)

    def do_GET(self):
        if self.path == "/":
            self.path = "/checkout.html"
        return super().do_GET()

    def log_message(self, *args):
        pass


def main():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    profile = tempfile.mkdtemp(prefix="cf-profile-")
    errors = []

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            profile,
            headless=False,  # le estensioni MV3 non caricano in headless classico
            executable_path=os.environ.get("CHROMIUM_PATH") or None,
            args=[
                f"--disable-extensions-except={ROOT}",
                f"--load-extension={ROOT}",
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-sync",
            ],
        )

        def find_worker(timeout_ms=20000):
            """
            Il service worker MV3 si registra in modo asincrono e può essere
            già dormiente: si aspetta, ma senza dipendere da un singolo evento.
            """
            deadline = time.time() + timeout_ms / 1000
            while time.time() < deadline:
                if context.service_workers:
                    return context.service_workers[0]
                try:
                    return context.wait_for_event("serviceworker", timeout=2000)
                except Exception:
                    pass
            return None

        try:
            page = context.new_page()
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("dialog", lambda d: d.dismiss())
            page.on("console", lambda m: errors.append(f"console.error: {m.text}")
                    if m.type == "error" and "favicon" not in m.location.get("url", "")
                    and "404" not in m.text else None)

            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="domcontentloaded")
            page.wait_for_timeout(1200)

            # 1. Il service worker: il content script lo ha già svegliato
            # chiedendogli le impostazioni.
            worker = find_worker()
            check("il service worker si avvia", worker is not None,
                  worker.url.split("/")[-1] if worker else "non avviato")

            # 2/3. I content script vivono in un "isolated world": non sono
            # leggibili dal main world, e va bene così (il sito non li vede).
            # Si verificano quindi dal comportamento, non dalle variabili.
            # La classificazione dei pulsanti è coperta da test/actions.test.mjs.

            # 4. Il click viene intercettato.
            page.click("button.cta")
            page.wait_for_selector("antefirma-alert", state="attached", timeout=10000)
            check("il click su «Conferma abbonamento» viene intercettato", True)

            page.wait_for_timeout(3000)
            box = page.evaluate("""() => {
                const h = document.querySelector('antefirma-alert');
                const r = h && h.getBoundingClientRect();
                return r ? { w: r.width, h: r.height } : null;
            }""")
            check("l'avviso copre la pagina", bool(box and box["w"] > 300 and box["h"] > 300),
                  f"{int(box['w'])}x{int(box['h'])}" if box else "assente")

            # 5. Verdetto reale attraverso il canale dei messaggi, da una pagina
            # dell'estensione (il service worker non ammette import() dinamico).
            if worker:
                ext_id = worker.url.split("/")[2]
                ext_page = context.new_page()
                ext_page.goto(f"chrome-extension://{ext_id}/src/sidepanel/sidepanel.html")
                ext_page.wait_for_timeout(500)
                verdict = ext_page.evaluate("""async () => {
                    const text = `Il canone è pari a € 19,99 al mese, oltre a spese di attivazione una tantum di € 49,00.
                      Il contratto ha una durata minima di 24 mesi. Alla scadenza si rinnova automaticamente per un uguale
                      periodo, salvo disdetta con preavviso di almeno 60 giorni. In caso di recesso anticipato è dovuta una
                      penale pari a € 120,00. Gli importi versati non sono rimborsabili.
                      Ogni controversia sarà devoluta ad arbitrato rituale e il foro competente è quello di Dublino.`;
                    const res = await chrome.runtime.sendMessage({
                      type: 'ANALYZE_TEXT',
                      payload: {
                        text, force: true, actionType: 'subscribe',
                        url: 'http://127.0.0.1/',
                        pricing: { amount: 19.99, currency: 'EUR', period: 'month', recurring: true },
                      },
                    });
                    if (!res?.ok) return { error: res?.error || 'nessuna risposta' };
                    const v = res.result;
                    return { score: v.score, level: v.level.id, worstCase: v.cost.worstCase,
                             headline: v.headline, mustRemember: v.mustRemember,
                             findings: v.findings.length, euFlags: v.consumer.flags.length,
                             llm: v.engine.llm };
                }""")

                if verdict.get("error"):
                    check("il canale di messaggi risponde", False, verdict["error"])
                else:
                    check("il canale di messaggi risponde", True,
                          f"{verdict['findings']} clausole rilevate")
                    # 19,99 x 24 = 479,76 + 120 penale + 49 attivazione = 648,76
                    check("il costo worst-case è calcolato correttamente",
                          abs(verdict["worstCase"] - 648.76) < 0.01, f"{verdict['worstCase']} €")
                    check("il livello è di allarme", verdict["level"] in ("high_risk", "critical"),
                          f"{verdict['level']} ({verdict['score']}/100)")
                    check("indica la scadenza da ricordare", bool(verdict["mustRemember"]),
                          verdict["mustRemember"] or "")
                    check("il motore consumer IT segnala clausole", verdict["euFlags"] >= 3,
                          f"{verdict['euFlags']} segnalazioni")
                    check("senza chiave API resta tutto locale", verdict["llm"] is False)

                # 5b. Il pannello deve essere usabile appena si apre.
                #
                # `[hidden] { display: none }` è una regola dello user-agent:
                # il `display: flex` dichiarato su .modal e .input-block la
                # batteva, e il modale restava aperto sopra il pannello dal
                # primo istante, intercettando ogni click. Nessun test lo
                # vedeva perché sidepanel.html veniva caricata solo come ponte
                # verso il service worker, senza mai guardare cosa rendesse.
                layout = ext_page.evaluate("""() => {
                    const vis = (sel) => {
                      const el = document.querySelector(sel);
                      if (!el) return null;
                      return getComputedStyle(el).display !== 'none';
                    };
                    const blocchi = ['#input-paste', '#input-pdf', '#input-url'];
                    return {
                      modale: vis('#modal'),
                      visibili: blocchi.filter(vis).length,
                    };
                }""")
                check("il modale non è aperto all'apertura del pannello",
                      layout["modale"] is False,
                      "aperto sopra tutto" if layout["modale"] else "chiuso")
                check("i blocchi di input nascosti restano nascosti",
                      layout["visibili"] == 0,
                      f"{layout['visibili']} visibili su 3")

                selection = ext_page.evaluate("""() => {
                    document.querySelector('.source[data-source=\"paste\"]').click();
                    const vis = (sel) => getComputedStyle(document.querySelector(sel)).display !== 'none';
                    return { paste: vis('#input-paste'), pdf: vis('#input-pdf'), url: vis('#input-url') };
                }""")
                check("scegliere una sorgente ne mostra una sola",
                      selection["paste"] and not selection["pdf"] and not selection["url"],
                      str(selection))
                # 5c. Il payload che raggiunge un content script è ridotto.
                #
                # La guardia sul mittente è verificata in Node (test/engine.test.mjs):
                # da qui non è raggiungibile, perché page.evaluate gira nel main
                # world e chrome.runtime lì non esiste — un test che ci provasse
                # passerebbe per il motivo sbagliato.
                reduced = ext_page.evaluate("""async () => {
                    const r = await chrome.runtime.sendMessage({ type: 'GET_CONTENT_SETTINGS' });
                    return r?.ok ? Object.keys(r.result).sort() : null;
                }""")
                check("al content script vanno solo le impostazioni che gli servono",
                      reduced == ["allowlist", "blockFrom", "enabled", "speculative"],
                      str(reduced))
                ext_page.close()

            # 6. Il sito non deve poter far sparire l'avviso.
            page.evaluate("() => document.querySelector('antefirma-alert')?.remove()")
            page.evaluate("""() => {
                const st = document.createElement('style');
                st.textContent = 'antefirma-alert { display: none !important; visibility: hidden !important; }';
                document.head.append(st);
            }""")
            page.wait_for_timeout(700)
            still_there = page.evaluate("""() => {
                const h = document.querySelector('antefirma-alert');
                if (!h) return null;
                const cs = getComputedStyle(h);
                return { display: cs.display, visibility: cs.visibility };
            }""")
            check("l'avviso resiste alla rimozione da parte del sito",
                  still_there is not None, "rimosso" if still_there is None else "riagganciato")
            check("l'avviso resiste al CSS ostile del sito",
                  bool(still_there) and still_there["display"] == "block"
                  and still_there["visibility"] == "visible",
                  str(still_there))

            # 7. "Continua comunque" riproduce fedelmente l'azione originale.
            proceed = page.locator("antefirma-alert").locator("button.proceed")
            proceed.wait_for(state="visible", timeout=5000)
            page.wait_for_timeout(4000)  # il pulsante si arma dopo qualche secondo

            # L'annuncio dello sblocco deve sentirsi, non vedersi: era rimasto a
            # schermo come una riga di interfaccia («Ora puoi premere "Continua
            # comunque"»), che a chi vede il pulsante già attivo non dice nulla.
            live = page.evaluate("""() => {
                const el = document.querySelector('antefirma-alert')
                  ?.shadowRoot?.querySelector('.v-arm-live');
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { testo: (el.textContent || '').trim(), larghezza: r.width, altezza: r.height };
            }""")
            check("l'annuncio dello sblocco è per gli screen reader, non a schermo",
                  bool(live) and live["testo"] != "" and live["larghezza"] <= 2 and live["altezza"] <= 2,
                  str(live))

            proceed.click()
            page.wait_for_timeout(800)
            check("«Continua comunque» esegue l'azione sospesa",
                  page.evaluate("() => window.__demoSubmitted") is True)
            check("l'avviso si chiude dopo la decisione",
                  page.locator("antefirma-alert").count() == 0)

            # 8. Nessun falso positivo sul pulsante innocuo.
            page.click(".safe button")
            page.wait_for_timeout(800)
            check("il pulsante innocuo non viene intercettato",
                  page.locator("antefirma-alert").count() == 0)

            # 9. Le quattro funzionalità aggiunte, attraverso i canali reali.
            if worker:
                ext_id = worker.url.split("/")[2]
                ext = context.new_page()
                ext.goto(f"chrome-extension://{ext_id}/src/sidepanel/sidepanel.html")
                ext.wait_for_timeout(500)

                # 9a. Modello on-device: lo stato deve essere interrogabile senza esplodere.
                local = ext.evaluate("""async () => {
                    const res = await chrome.runtime.sendMessage({ type: 'LOCAL_MODEL_STATUS' });
                    return res?.ok ? res.result : { error: res?.error };
                }""")
                check("lo stato del modello on-device è interrogabile",
                      bool(local) and "status" in local, str(local.get("status") or local.get("error")))

                # 9b. Analisi speculativa: la pre-analisi scalda la cache senza uscire in rete.
                prefetch = ext.evaluate("""async () => {
                    const text = `Il canone è pari a € 29,99 al mese. Il contratto ha una durata minima di 12 mesi.
                      Alla scadenza si rinnova automaticamente salvo disdetta con preavviso di almeno 30 giorni.
                      In caso di recesso anticipato è dovuta una penale pari a € 90,00.
                      Gli importi versati non sono rimborsabili.`;
                    const ctx = { url: 'https://prefetch.test/checkout', title: 'Prova',
                                  pricing: { amount: 29.99, currency: 'EUR', period: 'month', recurring: true },
                                  terms: { url: 'https://prefetch.test/termini' } };
                    const first = await chrome.runtime.sendMessage({
                      type: 'PREFETCH_ACTION', payload: { actionType: 'subscribe', ctx, text } });
                    const second = await chrome.runtime.sendMessage({
                      type: 'PREFETCH_ACTION', payload: { actionType: 'subscribe', ctx, text } });
                    return { first: first?.result, second: second?.result };
                }""")
                check("la pre-analisi prepara il verdetto prima del click",
                      bool(prefetch["first"] and prefetch["first"].get("prepared")),
                      str(prefetch["first"]))
                check("la seconda pre-analisi riusa la cache invece di rifare il lavoro",
                      bool(prefetch["second"] and prefetch["second"].get("cached")),
                      str(prefetch["second"]))

                # 9c/9d. Prova + kit di uscita: dal verdetto all'impegno, alla lettera.
                kit = ext.evaluate("""async () => {
                    const call = async (type, payload) => {
                      const res = await chrome.runtime.sendMessage({ type, payload });
                      if (!res?.ok) throw new Error(`${type}: ${res?.error}`);
                      return res.result;
                    };
                    const text = `Il canone è pari a € 19,99 al mese, oltre a spese di attivazione una tantum di € 49,00.
                      Il contratto ha una durata minima di 24 mesi. Alla scadenza si rinnova automaticamente per un uguale
                      periodo, salvo disdetta con preavviso di almeno 60 giorni. In caso di recesso anticipato è dovuta una
                      penale pari a € 120,00. Gli importi versati non sono rimborsabili.`;

                    const verdict = await call('ANALYZE_TEXT', {
                      text, force: true, actionType: 'subscribe',
                      url: 'https://kit.test/checkout', title: 'Kit di prova',
                      pricing: { amount: 19.99, currency: 'EUR', period: 'month', recurring: true },
                    });

                    const commitment = await call('SAVE_COMMITMENT_FROM_VERDICT', { verdict, text });
                    const list = await call('GET_COMMITMENTS');
                    const proof = await call('GET_PROOF', { id: commitment.id });
                    const letter = await call('BUILD_LETTER', { id: commitment.id, kind: 'disdetta' });
                    const ics = await call('BUILD_ICS', { id: commitment.id });
                    await call('DELETE_COMMITMENT', { id: commitment.id });
                    const after = await call('GET_COMMITMENTS');

                    return {
                      id: commitment.id,
                      worstCase: commitment.worstCase,
                      deadlineAt: commitment.deadlineAt,
                      renewalAt: commitment.renewalAt,
                      registered: list.some((c) => c.id === commitment.id),
                      proofValid: proof.valid,
                      hashLen: (proof.snapshot?.hash || '').length,
                      letterHasNotice: letter.text.includes('60 giorni'),
                      letterHasLaw: letter.text.includes('art. 33'),
                      icsAlarms: (ics.content.match(/BEGIN:VALARM/g) || []).length,
                      icsValid: ics.content.startsWith('BEGIN:VCALENDAR'),
                      removed: !after.some((c) => c.id === commitment.id),
                    };
                }""")

                check("l'impegno viene registrato con la sua scadenza",
                      kit["registered"] and bool(kit["deadlineAt"]),
                      f"{kit['worstCase']} € · disdetta entro {(kit['deadlineAt'] or '')[:10]}")
                check("la prova conserva un'impronta verificabile",
                      kit["proofValid"] and kit["hashLen"] == 64)
                check("la lettera di disdetta riporta preavviso e norma",
                      kit["letterHasNotice"] and kit["letterHasLaw"])
                check("il file di calendario è valido e porta i promemoria",
                      kit["icsValid"] and kit["icsAlarms"] == 3, f"{kit['icsAlarms']} promemoria")
                check("l'impegno può essere rimosso", kit["removed"])

                # 9d-bis. Il controllo delle modifiche a tre cancelli: la seconda
                # verifica sullo stesso documento non deve nemmeno scaricarlo.
                gates = ext.evaluate("""async () => {
                    const call = async (type, payload) => {
                      const res = await chrome.runtime.sendMessage({ type, payload });
                      if (!res?.ok) throw new Error(`${type}: ${res?.error}`);
                      return res.result;
                    };
                    const text = `Il canone è pari a € 19,99 al mese, oltre a spese di attivazione
                      una tantum di € 49,00. Il contratto ha una durata minima di 24 mesi. Alla scadenza
                      si rinnova automaticamente salvo disdetta con preavviso di almeno 60 giorni.
                      In caso di recesso anticipato è dovuta una penale pari a € 120,00.`;
                    const verdict = await call('ANALYZE_TEXT', {
                      text, force: true, actionType: 'subscribe',
                      url: 'http://127.0.0.1:__PORT__/', title: 'Con termini',
                      ctx: { terms: { url: 'http://127.0.0.1:__PORT__/termini.html', found: true } },
                      pricing: { amount: 19.99, currency: 'EUR', period: 'month', recurring: true },
                    });
                    const c = await call('SAVE_COMMITMENT_FROM_VERDICT', { verdict, text });
                    const primo = await call('CHECK_CHANGES', { id: c.id });
                    const secondo = await call('CHECK_CHANGES', { id: c.id });
                    const dopo = (await call('GET_COMMITMENTS')).find((x) => x.id === c.id);
                    await call('DELETE_COMMITMENT', { id: c.id });
                    return {
                      termsUrl: c.termsUrl,
                      pricing: c.pricing,
                      primo,
                      primoSummary: primo.summary,
                      secondo,
                      validatori: Boolean(dopo?.http?.etag || dopo?.http?.lastModified),
                      controlli: (dopo?.changes || []).length,
                    };
                }""".replace('__PORT__', str(PORT)))

                check("l'indirizzo dei termini viene conservato con l'impegno",
                      bool(gates["termsUrl"]), gates["termsUrl"] or "assente")
                check("il primo controllo scarica e confronta", bool(gates["primoSummary"]),
                      (gates["primoSummary"] or "")[:70])
                # La segnalazione di clausole nuove qui è corretta: lo snapshot era
                # il testo del checkout, il documento riletto è la pagina dei termini
                # e contiene davvero due clausole in più. Ciò che non deve accadere è
                # il calo fantasma dell'impegno, che nasceva dal confronto fra un
                # verdetto calcolato con il prezzo e uno calcolato senza.
                check("il ricontrollo non inventa un calo dell'impegno",
                      (gates["primo"].get("costDelta") or 0) >= 0
                      and "sceso" not in (gates["primoSummary"] or "")
                      and bool(gates["pricing"]),
                      f"delta {gates['primo'].get('costDelta')} · prezzo conservato: {bool(gates['pricing'])}")
                check("i validatori HTTP vengono memorizzati per il controllo successivo",
                      gates["validatori"])
                check("il secondo controllo si ferma al primo cancello, senza analizzare",
                      gates["secondo"]["severity"] == "none" and gates["secondo"]["escalated"] is False,
                      gates["secondo"]["summary"])

                # 9e. Gli allarmi vivono e muoiono insieme all'impegno.
                alarms = ext.evaluate("""async () => {
                    const all = await chrome.alarms.getAll();
                    return all.map((a) => a.name);
                }""")
                check("un solo allarme ricorrente al posto di uno per scadenza",
                      "vincolo-passata-quotidiana" in alarms and not any(n.startswith("cf-reminder:") for n in alarms),
                      ", ".join(alarms) or "nessun allarme")
                check("la sorveglianza periodica delle condizioni è programmata",
                      "vincolo-controllo-condizioni" in alarms)

                # 9f. La catena completa: aver premuto "Continua comunque" sulla
                # pagina demo deve aver lasciato un impegno con i suoi promemoria.
                from_click = ext.evaluate("""async () => {
                    const res = await chrome.runtime.sendMessage({ type: 'GET_COMMITMENTS' });
                    const list = res?.result || [];
                    const c = list.find((x) => (x.host || '').includes('127.0.0.1'));
                    return c ? { host: c.host, worstCase: c.worstCase, deadlineAt: c.deadlineAt,
                                 hasSnapshot: Boolean(c.snapshot?.hash), reminders: (c.reminders || []).length } : null;
                }""")
                check("accettare davvero un contratto crea l'impegno da sorvegliare",
                      bool(from_click) and from_click["hasSnapshot"],
                      f"{(from_click or {}).get('worstCase')} € · {(from_click or {}).get('reminders')} promemoria")
                check("il piano dei promemoria è salvato insieme all'impegno",
                      (from_click or {}).get("reminders", 0) >= 3,
                      f"{(from_click or {}).get('reminders')} promemoria pianificati")

                ext.close()

            check("nessun errore JavaScript", len(errors) == 0, " | ".join(errors[:3]))

        finally:
            context.close()
            httpd.shutdown()

    passed = sum(1 for r in results if r)
    print(f"\n{passed}/{len(results)} controlli superati")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
