"""
Verifica che ogni pagina di prova si comporti come dichiara.

    python3 demo/verify.py

Non sostituisce test/smoke.py, che verifica il *meccanismo* (il click viene
sospeso, l'avviso resiste, l'impegno nasce). Qui si verifica il *giudizio*: su
ciascuno scenario, che cosa vede il motore e che cosa decide.

Serve a due cose. La prima è che una demo di cui non si conosce l'esito atteso
non è una demo, è una pagina: l'esito misurato qui è quello scritto in
index.html, e se i due divergono uno dei due è da aggiornare. La seconda è che
gli scenari coprono per costruzione i casi che i nove testi del corpus non
possono coprire — elenchi, tabelle, prezzi promozionali, altre lingue — quindi
questo file è la rete che li tiene fermi.
"""

import http.server
import os
import socketserver
import sys
import tempfile
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8732

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'  ok  ' if ok else 'NOT OK'}  {name}" + (f" — {detail}" if detail else ""), flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "demo"), **kwargs)

    def log_message(self, *args):
        pass


# pagina · pulsante · deve bloccare · categorie attese · nota
SCENARIOS = [
    ("checkout.html", "Conferma abbonamento", True,
     ["auto_renewal", "minimum_term", "early_termination_penalty", "no_refund"],
     "la pagina storica, con tutte le trappole"),
    ("riepilogo.html", "Attiva l'offerta", True,
     ["auto_renewal", "minimum_term", "early_termination_penalty", "no_refund"],
     "condizioni solo in elenco e tabella"),
    ("promo.html", "Passa a Pro", True,
     ["auto_renewal", "minimum_term", "early_termination_penalty"],
     "prezzo a regime, non promo né barrato"),
    ("onesto.html", "Abbonati", False, [],
     "contratto onesto: non deve bloccare"),
    ("generico.html", "Continua", True,
     ["auto_renewal", "minimum_term", "early_termination_penalty"],
     "«Continua» dentro un checkout"),
    ("es.html", "Contratar ahora", True,
     ["auto_renewal", "minimum_term", "early_termination_penalty", "no_refund"],
     "spagnolo"),
    ("en.html", "Subscribe — cancel anytime", True,
     ["auto_renewal", "minimum_term", "early_termination_penalty"],
     "inglese, con «cancel» nel microcopy"),
]


def wait_for_verdict(page, timeout_ms=15000):
    """
    Aspetta l'esito, non l'orologio.

    Un tempo fisso qui è una fonte di falsi rossi: la prima analisi dopo il
    risveglio del service worker è molto più lenta delle successive, e un
    `wait_for_timeout` tarato sulla seconda fotografa la prima ancora in
    caricamento. Si aspetta finché la card mostra la riga di provenienza — che
    esiste solo nel verdetto, non nel caricamento — o finché il tempo scade.
    """
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        state = page.evaluate("""() => {
            const host = document.querySelector('vincolo-alert');
            if (!host) return 'none';
            return host.shadowRoot?.querySelector('.provenance') ? 'verdict' : 'pending';
        }""")
        if state == "verdict":
            return "verdict"
        page.wait_for_timeout(250)
    # Distinguere «non intercettato» da «rimasto in caricamento» è il punto:
    # trattarli allo stesso modo maschererebbe proprio il guasto peggiore,
    # cioè il click sospeso per sempre.
    return "pending" if page.locator("vincolo-alert").count() else "none"


def main():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="cf-demo-")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            profile,
            headless=False,
            executable_path=os.environ.get("CHROMIUM_PATH") or None,
            args=[
                f"--disable-extensions-except={ROOT}",
                f"--load-extension={ROOT}",
                "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
                "--no-default-browser-check", "--disable-background-networking",
                "--disable-component-update", "--disable-sync",
            ],
        )
        try:
            deadline = time.time() + 20
            while time.time() < deadline and not context.service_workers:
                try:
                    context.wait_for_event("serviceworker", timeout=2000)
                except Exception:
                    pass
            if not context.service_workers:
                check("il service worker si avvia", False)
                return 1

            page = context.new_page()
            page.on("dialog", lambda d: d.dismiss())

            for file, label, should_block, expected_categories, note in SCENARIOS:
                page.goto(f"http://127.0.0.1:{PORT}/{file}", wait_until="domcontentloaded")
                page.wait_for_timeout(1000)

                bottone = page.get_by_role("button", name=label, exact=False).first
                bottone.click()
                state = wait_for_verdict(page)
                check(f"{file}: l'analisi si conclude", state != "attesa",
                      "l'avviso è rimasto in caricamento" if state == "pending" else "")
                blocked = state == "verdict"
                verdict = page.evaluate("""() => {
                    const c = document.querySelector('vincolo-alert')?.shadowRoot;
                    if (!c) return null;
                    const prov = c.querySelector('.provenance')?.textContent || '';
                    const score = /(\\d+)\\/100/.exec(prov);
                    return {
                      level: c.querySelector('.badge')?.textContent?.trim() || '',
                      score: score ? Number(score[1]) : null,
                      amount: c.querySelector('.cost .amount')?.textContent?.trim() || '',
                      findings: [...c.querySelectorAll('.finding .tag, .finding .top')]
                        .map((e) => e.textContent.trim()).join(' | '),
                    };
                }""")

                if not should_block:
                    check(f"{file}: non blocca ({note})", not blocked,
                          f"level {verdict['level']}" if verdict else "nessun avviso")
                else:
                    detail = f"{verdict['level']} {verdict['score']}/100 · {verdict['amount']}" if verdict else "nessun avviso"
                    check(f"{file}: blocca ({note})", blocked, detail)
                    if verdict:
                        found_text = verdict["findings"].lower()
                        labels = {
                            "auto_renewal": "rinnovo automatico",
                            "minimum_term": "durata minima",
                            "early_termination_penalty": "penale",
                            "no_refund": "rimborso",
                        }
                        missing = [c for c in expected_categories if labels.get(c, c) not in found_text]
                        check(f"{file}: condizioni portanti presenti", not missing,
                              f"mancano {missing}" if missing else verdict["findings"][:70])

                if blocked:
                    page.evaluate("() => document.querySelector('vincolo-alert')?.remove()")

            # L'invio da tastiera: il modulo parte dal submit, non dal click.
            page.goto(f"http://127.0.0.1:{PORT}/tastiera.html", wait_until="domcontentloaded")
            page.wait_for_timeout(1000)
            page.fill("input[name=nome]", "Mario Rossi")
            page.keyboard.press("Enter")
            state = wait_for_verdict(page)
            check("tastiera.html: Invio è intercettato come un click", state == "verdict",
                  "rimasto in caricamento" if state == "pending" else
                  "nessun avviso" if state == "none" else "")
            if state == "verdict":
                page.evaluate("() => document.querySelector('vincolo-alert')?.remove()")

            # Controprove: questi pulsanti non devono far scattare nulla.
            for file, label in [("es.html", "Rechazar todas las cookies"),
                                    ("checkout.html", "Iscriviti alla newsletter"),
                                    ("generico.html", "Continua")]:
                page.goto(f"http://127.0.0.1:{PORT}/{file}", wait_until="domcontentloaded")
                page.wait_for_timeout(900)
                page.get_by_role("button", name=label, exact=False).last.click()
                page.wait_for_timeout(3000)
                check(f"{file}: «{label}» non viene intercettato",
                      page.locator("vincolo-alert").count() == 0)
        finally:
            context.close()
            httpd.shutdown()

    ok = sum(1 for r in results if r)
    print(f"\n{ok}/{len(results)} scenari verificati", flush=True)
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
