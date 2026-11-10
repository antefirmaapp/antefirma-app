/**
 * Recorded server answers, one per text of `corpus.mjs`.
 *
 * They have the exact shape of `POST /v1/analyze` (findings with quotes, terms
 * with the passage each figure comes from) and serve to test everything the
 * extension does **after** the server: severity, cost, profile, protections,
 * score, deadlines.
 *
 * Where they come from: derived once from the old rule engine (version 0.4),
 * on the same texts, and every quote was found again word for word in the
 * text — as the server does. So they don't measure the model's quality, which
 * is measured with `npm run eval` on the server: they measure that, for the
 * same answer, the score stays calibrated.
 *
 * Once the server has real traffic they should be replaced with real answers.
 */
export const RESPONSES = {
 "newsletter": {
  "findings": [],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": null,
   "notice_days": null,
   "exit_fee": null,
   "extra_fees": []
  },
  "summary": ""
 },
 "cookie_banner": {
  "findings": [
   {
    "category": "data_sharing",
    "quote": "I dati raccolti attraverso questi strumenti potranno essere condivisi con terze parti\nappartenenti al circuito pubblicitario a fini di profilazione e pubblicità mirata",
    "why": "",
    "confidence": 1
   },
   {
    "category": "profiling",
    "quote": "Questo sito utilizza cookie tecnici necessari al funzionamento e, previo tuo\nconsenso, cookie di profilazione propri e di terze parti",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": null,
   "notice_days": null,
   "exit_fee": null,
   "extra_fees": []
  },
  "summary": ""
 },
 "saas_fair": {
  "findings": [
   {
    "category": "liability_limitation",
    "quote": "Il fornitore non sarà responsabile per danni indiretti derivanti da interruzioni del\nservizio dovute a cause di forza maggiore",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": null,
   "notice_days": null,
   "exit_fee": null,
   "extra_fees": []
  },
  "summary": ""
 },
 "ecommerce": {
  "findings": [
   {
    "category": "no_refund",
    "quote": "I prodotti personalizzati non sono rimborsabili in alcun caso, nemmeno in caso di mancato\nutilizzo",
    "why": "",
    "confidence": 1
   },
   {
    "category": "liability_limitation",
    "quote": "Il venditore non sarà in alcun modo responsabile per ritardi imputabili al\ncorriere",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": null,
   "notice_days": null,
   "exit_fee": null,
   "extra_fees": []
  },
  "summary": ""
 },
 "social_ip": {
  "findings": [
   {
    "category": "ip_license",
    "quote": "Caricando contenuti sulla\npiattaforma, l'utente concede alla società una licenza mondiale, gratuita, perpetua e\nirrevocabile di usare, riprodurre, modificare, adattare e distribuire tali contenuti,\nanche per l'addestramento di modelli di intelligenza artificia",
    "why": "",
    "confidence": 1
   },
   {
    "category": "ai_training",
    "quote": "cabile di usare, riprodurre, modificare, adattare e distribuire tali contenuti,\nanche per l'addestramento di modelli di intelligenza artificiale",
    "why": "",
    "confidence": 1
   },
   {
    "category": "unilateral_change",
    "quote": "Ci riserviamo il diritto di modificare in qualsiasi momento i presenti termini",
    "why": "",
    "confidence": 1
   },
   {
    "category": "data_sharing",
    "quote": "I dati raccolti potranno essere condivisi con terze parti a fini di profilazione e\npubblicità personalizzata, e potranno essere trasferiti al di fuori dell'Unione Europea",
    "why": "",
    "confidence": 1
   },
   {
    "category": "third_party_transfer",
    "quote": "I dati raccolti potranno essere condivisi con terze parti a fini di profilazione e\npubblicità personalizzata, e potranno essere trasferiti al di fuori dell'Unione Europea",
    "why": "",
    "confidence": 0.9
   },
   {
    "category": "data_retention",
    "quote": "I dati vengono conservati anche dopo la chiusura dell'account",
    "why": "",
    "confidence": 0.9
   },
   {
    "category": "profiling",
    "quote": "I dati raccolti potranno essere condivisi con terze parti a fini di profilazione e\npubblicità personalizzata, e potranno essere trasferiti al di fuori dell'Unione Europea",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": null,
   "notice_days": null,
   "exit_fee": null,
   "extra_fees": []
  },
  "summary": ""
 },
 "saas_annual": {
  "findings": [
   {
    "category": "minimum_term",
    "quote": "Il contratto ha una durata\nminima di 12 mesi",
    "why": "",
    "confidence": 1
   },
   {
    "category": "auto_renewal",
    "quote": "Alla scadenza il contratto si rinnova automaticamente per un uguale\nperiodo, salvo disdetta da comunicarsi con preavviso di almeno 30 giorni prima della\nscadenza",
    "why": "",
    "confidence": 1
   },
   {
    "category": "unilateral_change",
    "quote": "Il fornitore si riserva il diritto di modificare le condizioni economiche dandone\ncomunicazione con congruo preavviso",
    "why": "",
    "confidence": 1
   },
   {
    "category": "no_refund",
    "quote": "Gli importi versati non sono rimborsabili in caso di recesso anticipato",
    "why": "",
    "confidence": 1
   },
   {
    "category": "notice_period",
    "quote": "Alla scadenza il contratto si rinnova automaticamente per un uguale\nperiodo, salvo disdetta da comunicarsi con preavviso di almeno 30 giorni prima della\nscadenza",
    "why": "",
    "confidence": 1
   },
   {
    "category": "liability_limitation",
    "quote": "Il servizio è fornito così com'è, nei limiti massimi\nconsentiti dalla legge",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": {
    "value": 12,
    "quote": "12 mesi"
   },
   "notice_days": {
    "value": 30,
    "quote": "30 giorni"
   },
   "exit_fee": null,
   "extra_fees": []
  },
  "summary": ""
 },
 "telco_24m": {
  "findings": [
   {
    "category": "early_termination_penalty",
    "quote": "In caso di recesso prima della scadenza del periodo minimo è dovuta una penale pari a\n120,00 euro, oltre al rimborso degli sconti già goduti",
    "why": "",
    "confidence": 1
   },
   {
    "category": "price_change",
    "quote": "Il fornitore può modificare unilateralmente il prezzo del servizio dandone\ncomunicazione sul proprio sito",
    "why": "",
    "confidence": 1
   },
   {
    "category": "minimum_term",
    "quote": "Il contratto ha una durata minima di 24 mesi a decorrere dalla data di\nattivazione",
    "why": "",
    "confidence": 1
   },
   {
    "category": "auto_renewal",
    "quote": "Alla scadenza il contratto si rinnova automaticamente per un uguale periodo,\nsalvo disdetta da comunicarsi con preavviso di almeno 60 giorni",
    "why": "",
    "confidence": 1
   },
   {
    "category": "no_refund",
    "quote": "Gli importi versati non sono\nrimborsabili",
    "why": "",
    "confidence": 1
   },
   {
    "category": "hidden_costs",
    "quote": "Il canone mensile è pari a 29,90 euro, oltre a spese di attivazione una tantum di\n49,00 euro",
    "why": "",
    "confidence": 0.9
   },
   {
    "category": "notice_period",
    "quote": "Alla scadenza il contratto si rinnova automaticamente per un uguale periodo,\nsalvo disdetta da comunicarsi con preavviso di almeno 60 giorni",
    "why": "",
    "confidence": 1
   },
   {
    "category": "liability_limitation",
    "quote": "Il fornitore non sarà in alcun modo responsabile per\ninterruzioni del servizio",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": {
    "value": 24,
    "quote": "24 mesi"
   },
   "notice_days": {
    "value": 60,
    "quote": "60 giorni"
   },
   "exit_fee": {
    "value": 120,
    "quote": "120,00 euro"
   },
   "extra_fees": [
    {
     "label": "Attivazione",
     "value": 49,
     "per_cycle": false,
     "quote": "49,00 euro"
    }
   ]
  },
  "summary": ""
 },
 "freelance_assignment": {
  "findings": [
   {
    "category": "ip_assignment",
    "quote": "La cessione dei diritti è definitiva e comprende il\ndiritto di modificare, adattare e sublicenziare le opere a terzi senza ulteriore compenso",
    "why": "",
    "confidence": 1
   },
   {
    "category": "arbitration",
    "quote": "Ogni controversia sarà devoluta ad arbitrato rituale e il foro competente\nesclusivo è quello di Dublino",
    "why": "",
    "confidence": 1
   },
   {
    "category": "ai_training",
    "quote": "I contenuti potranno essere utilizzati per l'addestramento di modelli di intelligenza\nartificiale",
    "why": "",
    "confidence": 1
   },
   {
    "category": "jurisdiction",
    "quote": "Ogni controversia sarà devoluta ad arbitrato rituale e il foro competente\nesclusivo è quello di Dublino",
    "why": "",
    "confidence": 0.9
   },
   {
    "category": "liability_limitation",
    "quote": "La società non sarà responsabile per il mancato pagamento\nda parte dei committenti",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": null,
   "notice_days": null,
   "exit_fee": null,
   "extra_fees": []
  },
  "summary": ""
 },
 "predatory_loan": {
  "findings": [
   {
    "category": "early_termination_penalty",
    "quote": "In caso di estinzione anticipata è dovuta una penale pari a 900,00 euro",
    "why": "",
    "confidence": 1
   },
   {
    "category": "arbitration",
    "quote": "Ogni controversia sarà devoluta ad arbitrato rituale vincolante;",
    "why": "",
    "confidence": 1
   },
   {
    "category": "minimum_term",
    "quote": "Il contratto ha una durata minima di 60 mesi",
    "why": "",
    "confidence": 1
   },
   {
    "category": "no_refund",
    "quote": "Gli importi versati non sono rimborsabili in alcun caso",
    "why": "",
    "confidence": 1
   },
   {
    "category": "hidden_costs",
    "quote": "Il finanziamento prevede il rimborso in 60 rate mensili da 189,00 euro ciascuna,\noltre a spese di istruttoria una tantum di 350,00 euro e spese di incasso di 4,00 euro per\nogni rata",
    "why": "",
    "confidence": 0.9
   },
   {
    "category": "jurisdiction",
    "quote": "Il foro competente esclusivo è quello di Dublino",
    "why": "",
    "confidence": 0.9
   },
   {
    "category": "liability_limitation",
    "quote": "Il finanziatore non sarà in alcun modo responsabile per danni derivanti dall'esecuzione\ndel contratto",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": {
    "value": 60,
    "quote": "60 mesi"
   },
   "notice_days": null,
   "exit_fee": {
    "value": 900,
    "quote": "900,00 euro"
   },
   "extra_fees": [
    {
     "label": "Istruttoria",
     "value": 350,
     "per_cycle": false,
     "quote": "350,00 euro"
    },
    {
     "label": "Incasso",
     "value": 4,
     "per_cycle": true,
     "quote": "4,00 euro"
    }
   ]
  },
  "summary": ""
 },
 "telco_prosa": {
  "findings": [
   {
    "category": "early_termination_penalty",
    "quote": "In caso di recesso prima della scadenza del periodo minimo è dovuta una penale pari a\n120,00 euro, oltre al rimborso degli sconti già goduti",
    "why": "",
    "confidence": 1
   },
   {
    "category": "price_change",
    "quote": "Il fornitore può modificare unilateralmente il prezzo del servizio dandone\ncomunicazione sul proprio sito",
    "why": "",
    "confidence": 1
   },
   {
    "category": "minimum_term",
    "quote": "Il contratto ha una durata minima di 24 mesi a decorrere dalla data di\nattivazione",
    "why": "",
    "confidence": 1
   },
   {
    "category": "auto_renewal",
    "quote": "Alla scadenza il contratto si rinnova automaticamente per un uguale periodo,\nsalvo disdetta da comunicarsi con preavviso di almeno 60 giorni",
    "why": "",
    "confidence": 1
   },
   {
    "category": "no_refund",
    "quote": "Gli importi versati non sono\nrimborsabili",
    "why": "",
    "confidence": 1
   },
   {
    "category": "hidden_costs",
    "quote": "Il canone mensile è pari a 29,90 euro, oltre a spese di attivazione una tantum di\n49,00 euro",
    "why": "",
    "confidence": 0.9
   },
   {
    "category": "notice_period",
    "quote": "Alla scadenza il contratto si rinnova automaticamente per un uguale periodo,\nsalvo disdetta da comunicarsi con preavviso di almeno 60 giorni",
    "why": "",
    "confidence": 1
   },
   {
    "category": "liability_limitation",
    "quote": "Il fornitore non sarà in alcun modo responsabile per\ninterruzioni del servizio",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": {
    "value": 24,
    "quote": "24 mesi"
   },
   "notice_days": {
    "value": 60,
    "quote": "60 giorni"
   },
   "exit_fee": {
    "value": 120,
    "quote": "120,00 euro"
   },
   "extra_fees": [
    {
     "label": "Attivazione",
     "value": 49,
     "per_cycle": false,
     "quote": "49,00 euro"
    }
   ]
  },
  "summary": ""
 },
 "telco_elenco": {
  "findings": [
   {
    "category": "early_termination_penalty",
    "quote": "Riepilogo dell'offerta\n• Canone mensile 29,90 euro\n• Spese di attivazione 49,00 euro\n• Durata minima 24 mesi\n• Rinnovo automatico alla scadenza\n• Preavviso di disdetta 60 giorni\n• Penale di recesso pari a 120,00 euro\n• Nessun rimborso degli importi versati",
    "why": "",
    "confidence": 1
   },
   {
    "category": "auto_renewal",
    "quote": "Riepilogo dell'offerta\n• Canone mensile 29,90 euro\n• Spese di attivazione 49,00 euro\n• Durata minima 24 mesi\n• Rinnovo automatico alla scadenza\n• Preavviso di disdetta 60 giorni\n• Penale di recesso pari a 120,00 euro\n• Nessun rimborso degli importi versati",
    "why": "",
    "confidence": 1
   },
   {
    "category": "minimum_term",
    "quote": "Riepilogo dell'offerta\n• Canone mensile 29,90 euro\n• Spese di attivazione 49,00 euro\n• Durata minima 24 mesi\n• Rinnovo automatico alla scadenza\n• Preavviso di disdetta 60 giorni\n• Penale di recesso pari a 120,00 euro\n• Nessun rimborso degli importi versati",
    "why": "",
    "confidence": 1
   },
   {
    "category": "no_refund",
    "quote": "Riepilogo dell'offerta\n• Canone mensile 29,90 euro\n• Spese di attivazione 49,00 euro\n• Durata minima 24 mesi\n• Rinnovo automatico alla scadenza\n• Preavviso di disdetta 60 giorni\n• Penale di recesso pari a 120,00 euro\n• Nessun rimborso degli importi versati",
    "why": "",
    "confidence": 1
   },
   {
    "category": "hidden_costs",
    "quote": "Riepilogo dell'offerta\n• Canone mensile 29,90 euro\n• Spese di attivazione 49,00 euro\n• Durata minima 24 mesi\n• Rinnovo automatico alla scadenza\n• Preavviso di disdetta 60 giorni\n• Penale di recesso pari a 120,00 euro\n• Nessun rimborso degli importi versati",
    "why": "",
    "confidence": 0.9
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": {
    "value": 24,
    "quote": "24 mesi"
   },
   "notice_days": {
    "value": 60,
    "quote": "60 giorni"
   },
   "exit_fee": {
    "value": 120,
    "quote": "120,00 euro"
   },
   "extra_fees": [
    {
     "label": "Attivazione",
     "value": 49,
     "per_cycle": false,
     "quote": "49,00 euro"
    }
   ]
  },
  "summary": ""
 },
 "telco_tabella": {
  "findings": [
   {
    "category": "early_termination_penalty",
    "quote": "Voce Condizione\nCanone 29,90 €/mese\nAttivazione 49,00 €\nDurata minima 24 mesi\nRinnovo automatico alla scadenza\nPreavviso di disdetta 60 giorni\nPenale di recesso 120,00 €\nRimborsi nessun rimborso",
    "why": "",
    "confidence": 1
   },
   {
    "category": "auto_renewal",
    "quote": "Voce Condizione\nCanone 29,90 €/mese\nAttivazione 49,00 €\nDurata minima 24 mesi\nRinnovo automatico alla scadenza\nPreavviso di disdetta 60 giorni\nPenale di recesso 120,00 €\nRimborsi nessun rimborso",
    "why": "",
    "confidence": 1
   },
   {
    "category": "minimum_term",
    "quote": "Voce Condizione\nCanone 29,90 €/mese\nAttivazione 49,00 €\nDurata minima 24 mesi\nRinnovo automatico alla scadenza\nPreavviso di disdetta 60 giorni\nPenale di recesso 120,00 €\nRimborsi nessun rimborso",
    "why": "",
    "confidence": 1
   },
   {
    "category": "no_refund",
    "quote": "Voce Condizione\nCanone 29,90 €/mese\nAttivazione 49,00 €\nDurata minima 24 mesi\nRinnovo automatico alla scadenza\nPreavviso di disdetta 60 giorni\nPenale di recesso 120,00 €\nRimborsi nessun rimborso",
    "why": "",
    "confidence": 1
   }
  ],
  "terms": {
   "price": null,
   "currency": null,
   "billing_period": null,
   "minimum_term_months": {
    "value": 24,
    "quote": "24 mesi"
   },
   "notice_days": {
    "value": 60,
    "quote": "60 giorni"
   },
   "exit_fee": {
    "value": 120,
    "quote": "120,00 €"
   },
   "extra_fees": [
    {
     "label": "Attivazione",
     "value": 49,
     "per_cycle": false,
     "quote": "49,00 €"
    }
   ]
  },
  "summary": ""
 }
};
