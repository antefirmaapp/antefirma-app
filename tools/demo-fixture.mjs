/**
 * Test material shared by tools/media.mjs (website) and tools/help-shots.mjs (help):
 * an invented gym in eight languages, on a domain that doesn't exist, and a fake
 * AnteFirma server, so no analysis is spent and no network is needed.
 */
/** The example page, in eight languages: invented site, price and terms. */
export const PAGE = {
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
  de: { title: 'Fitness Horizont — Mitgliedschaft Plus', name: 'Mitgliedschaft Plus', per: 'im Monat', btn: 'Jetzt abonnieren', feats: ['Unbegrenzt Geräte und Kurse', '7 Tage die Woche geöffnet', 'App mit Trainingsplänen'],
    terms: 'Die Mitgliedschaft hat eine Mindestlaufzeit von 12 Monaten ab Aktivierung. Der Vertrag verlängert sich automatisch um ein weiteres Jahr, sofern nicht mindestens 30 Tage vorher gekündigt wird. Bei vorzeitiger Kündigung wird eine Gebühr von 120 € fällig. Die Aufnahmegebühr wird nicht erstattet.',
    q: ['Mindestlaufzeit von 12 Monaten', 'verlängert sich automatisch um ein weiteres Jahr', 'mindestens 30 Tage vorher', 'Gebühr von 120 €'],
    why: ['Ein Jahr lang müssen Sie zahlen.', 'Wenn Sie nicht rechtzeitig kündigen, zahlen Sie ein weiteres Jahr.', 'Die Kündigung muss einen Monat vorher ankommen.', 'Früher aussteigen kostet 120 €.'],
    summary: 'Sie binden sich ein Jahr: Es verlängert sich von selbst, und früher aussteigen kostet 120 €.', you: { name: 'Erika Mustermann', address: 'Hauptstraße 1, 10115 Berlin', email: 'erika.mustermann@beispiel.de' } },
  fr: { title: 'Salle Horizon — Abonnement Plus', name: 'Abonnement Plus', per: 'par mois', btn: 'Je m’abonne', feats: ['Musculation et cours illimités', 'Ouvert 7 jours sur 7', 'Appli avec programmes d’entraînement'],
    terms: 'L’abonnement comporte une durée minimale de 12 mois à compter de l’activation. Le contrat est reconduit automatiquement pour une année supplémentaire sauf résiliation au moins 30 jours avant. Toute résiliation anticipée entraîne des frais de 120 €. Les frais d’inscription ne sont pas remboursables.',
    q: ['durée minimale de 12 mois', 'reconduit automatiquement pour une année supplémentaire', 'au moins 30 jours avant', 'frais de 120 €'],
    why: ['Pendant un an, vous ne pouvez pas arrêter de payer.', 'Si vous ne résiliez pas à temps, vous payez une année de plus.', 'La résiliation doit arriver un mois avant.', 'Partir plus tôt coûte 120 €.'],
    summary: 'Vous vous engagez pour un an : il se reconduit tout seul et partir plus tôt coûte 120 €.', you: { name: 'Marie Dupont', address: '1 rue de la Paix, 75002 Paris', email: 'marie.dupont@exemple.fr' } },
  nl: { title: 'Sportschool Horizon — Lidmaatschap Plus', name: 'Lidmaatschap Plus', per: 'per maand', btn: 'Word lid', feats: ['Onbeperkt fitness en lessen', '7 dagen per week open', 'App met trainingsschema’s'],
    terms: 'Het lidmaatschap heeft een minimale looptijd van 12 maanden vanaf activering. De overeenkomst wordt automatisch met een jaar verlengd tenzij ten minste 30 dagen van tevoren wordt opgezegd. Bij voortijdige opzegging betaal je 120 € afkoopsom. Het inschrijfgeld wordt niet terugbetaald.',
    q: ['minimale looptijd van 12 maanden', 'automatisch met een jaar verlengd', 'ten minste 30 dagen van tevoren', '120 € afkoopsom'],
    why: ['Een jaar lang moet je betalen.', 'Zeg je niet op tijd op, dan betaal je nog een jaar.', 'De opzegging moet een maand van tevoren binnen zijn.', 'Eerder stoppen kost 120 €.'],
    summary: 'Je verplicht je een jaar: het verlengt zichzelf en eerder stoppen kost 120 €.', you: { name: 'Sanne de Vries', address: 'Dorpsstraat 1, 3511 AB Utrecht', email: 'sanne.devries@voorbeeld.nl' } },
  pl: { title: 'Siłownia Horyzont — Karnet Plus', name: 'Karnet Plus', per: 'miesięcznie', btn: 'Kupuję i płacę', feats: ['Siłownia i zajęcia bez limitu', 'Otwarte 7 dni w tygodniu', 'Aplikacja z planami treningowymi'],
    terms: 'Karnet ma minimalny okres 12 miesięcy od aktywacji. Umowa przedłuża się automatycznie na kolejny rok, jeżeli nie zostanie wypowiedziana co najmniej 30 dni wcześniej. Wcześniejsze rozwiązanie umowy kosztuje 120 €. Opłata wpisowa nie podlega zwrotowi.',
    q: ['minimalny okres 12 miesięcy', 'przedłuża się automatycznie na kolejny rok', 'co najmniej 30 dni wcześniej', 'kosztuje 120 €'],
    why: ['Przez rok musisz płacić.', 'Jeśli nie wypowiesz na czas, płacisz za kolejny rok.', 'Wypowiedzenie musi dotrzeć miesiąc wcześniej.', 'Wcześniejsze odejście kosztuje 120 €.'],
    summary: 'Zobowiązujesz się na rok: karnet przedłuża się sam, a wcześniejsze odejście kosztuje 120 €.', you: { name: 'Anna Kowalska', address: 'ul. Marszałkowska 1, 00-001 Warszawa', email: 'anna.kowalska@przyklad.pl' } },
  pt: { title: 'Ginásio Horizonte — Assinatura Plus', name: 'Assinatura Plus', per: 'por mês', btn: 'Aderir já', feats: ['Musculação e aulas ilimitadas', 'Aberto 7 dias por semana', 'App com planos de treino'],
    terms: 'A assinatura tem uma fidelização de 12 meses a contar da ativação. O contrato renova-se automaticamente por mais um ano, salvo denúncia com pelo menos 30 dias de antecedência. A rescisão antecipada implica uma penalização de 120 €. A taxa de inscrição não é reembolsável.',
    q: ['fidelização de 12 meses', 'renova-se automaticamente por mais um ano', 'pelo menos 30 dias de antecedência', 'penalização de 120 €'],
    why: ['Durante um ano tem de pagar.', 'Se não cancelar a tempo, paga mais um ano.', 'O cancelamento tem de chegar um mês antes.', 'Sair antes custa 120 €.'],
    summary: 'Compromete-se por um ano: renova-se sozinho e sair antes custa 120 €.', you: { name: 'Ana Silva', address: 'Rua Augusta 1, 1100-053 Lisboa', email: 'ana.silva@exemplo.pt' } },
};
export const page = (l) => {
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

// An invented domain (.example doesn't exist): the warning and the letter show the site's name, not 127.0.0.1.
export const HOST = { it: 'palestra-orizzonte.example', en: 'horizon-gym.example', es: 'gimnasio-horizonte.example', de: 'fitness-horizont.example', fr: 'salle-horizon.example', nl: 'sportschool-horizon.example', pl: 'silownia-horyzont.example', pt: 'ginasio-horizonte.example' };

export const verdict = (l) => {
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


/**
 * The fake server. `delay`: how long the analysis "thinks". A key starting with
 * AF- activates the Pro plan, so activation can be shown too.
 */
export async function mockServer(context, l, { delay = 1800 } = {}) {
  let plan = 'free';
  await context.route(`https://${HOST[l]}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page(l) }));
  await context.route('https://api.antefirma.app/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const pro = () => ({ plan: 'pro', status: 'active', active: true, periodEnd: '2027-12-01T00:00:00Z', activations: { used: 1, limit: 3, here: true },
      quota: { month: { limit: 50, remaining: 49 }, day: { limit: 15, remaining: 15 } } });
    if (path === '/v1/health') return json({ ok: true });
    if (path === '/v1/register') return json({ token: 'v1.finto' });
    if (path === '/v1/license') return json(plan === 'pro' ? pro() : { plan: 'free', active: false, quota: { month: { limit: 5, remaining: 4 } } });
    if (path === '/v1/license/activate') { plan = 'pro'; return json(pro()); }
    if (path === '/v1/license/deactivate') { plan = 'free'; return json({ removed: true }); }
    if (path === '/v1/analyze') { await new Promise((r) => setTimeout(r, delay)); return json(verdict(l)); }
    return route.fulfill({ status: 404, body: '{}' });
  });
}
