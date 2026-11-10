/**
 * The panel's examples: four invented contracts, with the answer the server
 * would give. They show how it works without pasting anything and without using
 * an analysis: the background runs them through the same computation as real
 * analyses, but no text leaves the computer.
 *
 * Every quoted sentence is copied word for word from the example's text, as the
 * server requires for real analyses. The same texts are on the website.
 */
export const SAMPLES = {
  "gym": {
    "pricing": {
      "amount": 39,
      "currency": "EUR",
      "period": "month"
    },
    "label": [
      "Palestra",
      "Gym",
      "Gimnasio"
    ],
    "langs": {
      "it": {
        "text": "Condizioni dell'abbonamento Palestra Orizzonte Plus. L'abbonamento ha una durata minima di 12 mesi dalla data di attivazione e si rinnova tacitamente per un ulteriore anno salvo disdetta inviata a mezzo raccomandata almeno 30 giorni prima della scadenza. In caso di recesso anticipato è dovuta una penale pari a tre mensilità. La quota di iscrizione di 49 € non è rimborsabile. La sospensione è ammessa per un massimo di 30 giorni l'anno, con certificato medico.",
        "summary": "Ti impegni per un anno intero più 49 € di iscrizione: se non disdici per raccomandata un mese prima, paghi un altro anno.",
        "findings": [
          {
            "category": "minimum_term",
            "quote": "una durata minima di 12 mesi",
            "why": "Per un anno non puoi smettere di pagare, anche se non ci vai.",
            "confidence": 0.9
          },
          {
            "category": "auto_renewal",
            "quote": "si rinnova tacitamente per un ulteriore anno",
            "why": "Se non fai niente, riparte per un altro anno.",
            "confidence": 0.9
          },
          {
            "category": "notice_period",
            "quote": "a mezzo raccomandata almeno 30 giorni prima della scadenza",
            "why": "Serve una raccomandata, e deve arrivare un mese prima.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "è dovuta una penale pari a tre mensilità",
            "why": "Uscire prima costa tre mesi di abbonamento.",
            "confidence": 0.9
          },
          {
            "category": "no_refund",
            "quote": "La quota di iscrizione di 49 € non è rimborsabile",
            "why": "I 49 € di iscrizione non tornano indietro.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "minimum_term_months": {
            "value": 12,
            "quote": "durata minima di 12 mesi"
          },
          "notice_days": {
            "value": 30,
            "quote": "almeno 30 giorni"
          },
          "extra_fees": [
            {
              "value": 49,
              "label": "Quota di iscrizione",
              "quote": "quota di iscrizione di 49 €"
            }
          ]
        }
      },
      "en": {
        "text": "Horizon Gym Plus membership terms. The membership has a minimum term of 12 months from activation and renews automatically for a further year unless notice of cancellation is sent by registered post at least 30 days before the end of the term. Early termination incurs a fee equal to three monthly payments. The joining fee of €49 is non-refundable. Freezing is allowed for up to 30 days a year with a medical certificate.",
        "summary": "You're committing for a whole year plus a €49 joining fee: unless you cancel by registered post a month ahead, you pay for another year.",
        "findings": [
          {
            "category": "minimum_term",
            "quote": "a minimum term of 12 months",
            "why": "For a year you can't stop paying, even if you don't go.",
            "confidence": 0.9
          },
          {
            "category": "auto_renewal",
            "quote": "renews automatically for a further year",
            "why": "If you do nothing, it starts again for another year.",
            "confidence": 0.9
          },
          {
            "category": "notice_period",
            "quote": "by registered post at least 30 days before the end of the term",
            "why": "It takes a registered letter, arriving a month ahead.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "a fee equal to three monthly payments",
            "why": "Leaving early costs three months of membership.",
            "confidence": 0.9
          },
          {
            "category": "no_refund",
            "quote": "The joining fee of €49 is non-refundable",
            "why": "The €49 joining fee doesn't come back.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "minimum_term_months": {
            "value": 12,
            "quote": "minimum term of 12 months"
          },
          "notice_days": {
            "value": 30,
            "quote": "at least 30 days"
          },
          "extra_fees": [
            {
              "value": 49,
              "label": "Joining fee",
              "quote": "joining fee of €49"
            }
          ]
        }
      },
      "es": {
        "text": "Condiciones del abono Gimnasio Horizonte Plus. El abono tiene una permanencia mínima de 12 meses desde la fecha de alta y se renovará automáticamente por un año más salvo que se comunique la baja por burofax con al menos 30 días de antelación al vencimiento. La baja anticipada conlleva una penalización equivalente a tres cuotas mensuales. La matrícula de 49 € no es reembolsable. La congelación se admite hasta 30 días al año con justificante médico.",
        "summary": "Te comprometes un año entero más 49 € de matrícula: si no te das de baja por burofax un mes antes, pagas otro año.",
        "findings": [
          {
            "category": "minimum_term",
            "quote": "una permanencia mínima de 12 meses",
            "why": "Durante un año no puedes dejar de pagar, aunque no vayas.",
            "confidence": 0.9
          },
          {
            "category": "auto_renewal",
            "quote": "se renovará automáticamente por un año más",
            "why": "Si no haces nada, vuelve a empezar otro año.",
            "confidence": 0.9
          },
          {
            "category": "notice_period",
            "quote": "por burofax con al menos 30 días de antelación al vencimiento",
            "why": "Hace falta un burofax, y tiene que llegar un mes antes.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "una penalización equivalente a tres cuotas mensuales",
            "why": "Irte antes cuesta tres meses de cuota.",
            "confidence": 0.9
          },
          {
            "category": "no_refund",
            "quote": "La matrícula de 49 € no es reembolsable",
            "why": "Los 49 € de matrícula no vuelven.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "minimum_term_months": {
            "value": 12,
            "quote": "permanencia mínima de 12 meses"
          },
          "notice_days": {
            "value": 30,
            "quote": "al menos 30 días"
          },
          "extra_fees": [
            {
              "value": 49,
              "label": "Matrícula",
              "quote": "matrícula de 49 €"
            }
          ]
        }
      }
    }
  },
  "telecom": {
    "pricing": {
      "amount": 19.9,
      "currency": "EUR",
      "period": "month"
    },
    "label": [
      "Telefono e internet",
      "Phone and internet",
      "Teléfono e internet"
    ],
    "langs": {
      "it": {
        "text": "Offerta Fibra Casa di Rete Lampo. Il canone promozionale di 19,90 € al mese è valido per i primi 12 mesi; successivamente si applica il canone di 29,90 € al mese. Il modem è concesso con 48 rate mensili da 2,50 €; in caso di cessazione anticipata le rate residue saranno addebitate in un'unica soluzione. In caso di recesso è addebitato un contributo di disattivazione di 29 €. L'operatore si riserva di modificare le condizioni economiche con preavviso di 30 giorni.",
        "summary": "Il prezzo vale solo il primo anno, poi sale a 29,90 €; uscire prima costa le rate del modem tutte insieme più 29 €.",
        "findings": [
          {
            "category": "price_change",
            "quote": "successivamente si applica il canone di 29,90 € al mese",
            "why": "Dopo un anno paghi 10 € in più ogni mese.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "le rate residue saranno addebitate in un'unica soluzione",
            "why": "Se esci prima, paghi subito tutte le rate del modem che mancano.",
            "confidence": 0.9
          },
          {
            "category": "hidden_costs",
            "quote": "un contributo di disattivazione di 29 €",
            "why": "Uscire costa comunque 29 €.",
            "confidence": 0.9
          },
          {
            "category": "unilateral_change",
            "quote": "si riserva di modificare le condizioni economiche",
            "why": "L'operatore può cambiare il prezzo mentre il contratto è in corso.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "extra_fees": [
            {
              "value": 29,
              "label": "Contributo di disattivazione",
              "quote": "contributo di disattivazione di 29 €"
            }
          ]
        }
      },
      "en": {
        "text": "Lightning Net Home Fibre offer. The promotional fee of €19.90 a month applies for the first 12 months; afterwards the standard fee of €29.90 a month applies. The router is supplied with 48 monthly instalments of €2.50; on early termination the remaining instalments will be charged in a single payment. On termination a disconnection charge of €29 applies. The provider may change the charges with 30 days' notice.",
        "summary": "The price only lasts the first year, then rises to €29.90; leaving early costs all the router instalments at once plus €29.",
        "findings": [
          {
            "category": "price_change",
            "quote": "afterwards the standard fee of €29.90 a month applies",
            "why": "After a year you pay €10 more every month.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "the remaining instalments will be charged in a single payment",
            "why": "If you leave early, you pay all the remaining router instalments at once.",
            "confidence": 0.9
          },
          {
            "category": "hidden_costs",
            "quote": "a disconnection charge of €29",
            "why": "Leaving costs €29 regardless.",
            "confidence": 0.9
          },
          {
            "category": "unilateral_change",
            "quote": "may change the charges",
            "why": "The provider can change the price while the contract runs.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "extra_fees": [
            {
              "value": 29,
              "label": "Disconnection charge",
              "quote": "disconnection charge of €29"
            }
          ]
        }
      },
      "es": {
        "text": "Oferta Fibra Hogar de Red Relámpago. La cuota promocional de 19,90 € al mes se aplica durante los primeros 12 meses; después se aplicará la cuota de 29,90 € al mes. El router se entrega con 48 cuotas mensuales de 2,50 €; en caso de baja anticipada, las cuotas pendientes se cobrarán en un único pago. En caso de baja se cobrará un importe de desconexión de 29 €. El operador podrá modificar las condiciones económicas con un preaviso de 30 días.",
        "summary": "El precio solo dura el primer año y luego sube a 29,90 €; irte antes cuesta todas las cuotas del router de golpe más 29 €.",
        "findings": [
          {
            "category": "price_change",
            "quote": "después se aplicará la cuota de 29,90 € al mes",
            "why": "Pasado un año pagas 10 € más cada mes.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "las cuotas pendientes se cobrarán en un único pago",
            "why": "Si te vas antes, pagas de golpe todas las cuotas del router que faltan.",
            "confidence": 0.9
          },
          {
            "category": "hidden_costs",
            "quote": "un importe de desconexión de 29 €",
            "why": "Irte cuesta 29 € en cualquier caso.",
            "confidence": 0.9
          },
          {
            "category": "unilateral_change",
            "quote": "podrá modificar las condiciones económicas",
            "why": "El operador puede cambiar el precio mientras dura el contrato.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "extra_fees": [
            {
              "value": 29,
              "label": "Importe de desconexión",
              "quote": "importe de desconexión de 29 €"
            }
          ]
        }
      }
    }
  },
  "streaming": {
    "pricing": {
      "amount": 12.99,
      "currency": "EUR",
      "period": "month"
    },
    "label": [
      "Streaming",
      "Streaming",
      "Streaming"
    ],
    "langs": {
      "it": {
        "text": "Condizioni di abbonamento Cinemondo Premium. L'abbonamento ha una durata minima di 12 mesi e si rinnova automaticamente per periodi uguali, salvo disdetta inviata almeno 30 giorni prima della scadenza. In caso di recesso anticipato è dovuto l'importo dei canoni residui. Il prezzo può essere modificato in qualsiasi momento con preavviso di 30 giorni. I dati di visione possono essere comunicati a partner commerciali per finalità pubblicitarie. Le somme versate non sono rimborsabili.",
        "summary": "Ti impegni per almeno un anno: il contratto si rinnova da solo, uscire prima costa i canoni che mancano e il prezzo può salire.",
        "findings": [
          {
            "category": "minimum_term",
            "quote": "una durata minima di 12 mesi",
            "why": "Per un anno non puoi uscire senza pagare.",
            "confidence": 0.9
          },
          {
            "category": "auto_renewal",
            "quote": "si rinnova automaticamente per periodi uguali",
            "why": "Se non disdici in tempo, paghi un altro anno.",
            "confidence": 0.9
          },
          {
            "category": "notice_period",
            "quote": "almeno 30 giorni prima della scadenza",
            "why": "La disdetta deve arrivare un mese prima della scadenza, non l'ultimo giorno.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "è dovuto l'importo dei canoni residui",
            "why": "Se esci prima, paghi comunque tutti i mesi che restano.",
            "confidence": 0.9
          },
          {
            "category": "price_change",
            "quote": "Il prezzo può essere modificato in qualsiasi momento",
            "why": "Il prezzo può salire mentre sei vincolato.",
            "confidence": 0.9
          },
          {
            "category": "data_sharing",
            "quote": "comunicati a partner commerciali per finalità pubblicitarie",
            "why": "Quello che guardi finisce agli inserzionisti.",
            "confidence": 0.9
          },
          {
            "category": "no_refund",
            "quote": "Le somme versate non sono rimborsabili",
            "why": "Quello che hai pagato non torna indietro.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "minimum_term_months": {
            "value": 12,
            "quote": "durata minima di 12 mesi"
          },
          "notice_days": {
            "value": 30,
            "quote": "30 giorni prima"
          }
        }
      },
      "en": {
        "text": "Cinemondo Premium subscription terms. The subscription has a minimum term of 12 months and renews automatically for equal periods unless notice of cancellation is given at least 30 days before expiry. Early termination makes the remaining monthly fees payable. The price may be changed at any time with 30 days' notice. Viewing data may be shared with commercial partners for advertising purposes. Amounts paid are non-refundable.",
        "summary": "You're committing for at least a year: the contract renews on its own, leaving early costs the remaining fees and the price can go up.",
        "findings": [
          {
            "category": "minimum_term",
            "quote": "a minimum term of 12 months",
            "why": "For a year you can't leave without paying.",
            "confidence": 0.9
          },
          {
            "category": "auto_renewal",
            "quote": "renews automatically for equal periods",
            "why": "If you don't cancel in time, you pay for another year.",
            "confidence": 0.9
          },
          {
            "category": "notice_period",
            "quote": "at least 30 days before expiry",
            "why": "Cancellation must arrive a month before the end, not on the last day.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "makes the remaining monthly fees payable",
            "why": "If you leave early, you still pay every remaining month.",
            "confidence": 0.9
          },
          {
            "category": "price_change",
            "quote": "The price may be changed at any time",
            "why": "The price can go up while you're locked in.",
            "confidence": 0.9
          },
          {
            "category": "data_sharing",
            "quote": "shared with commercial partners for advertising purposes",
            "why": "What you watch ends up with advertisers.",
            "confidence": 0.9
          },
          {
            "category": "no_refund",
            "quote": "Amounts paid are non-refundable",
            "why": "What you've paid doesn't come back.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "minimum_term_months": {
            "value": 12,
            "quote": "minimum term of 12 months"
          },
          "notice_days": {
            "value": 30,
            "quote": "30 days before"
          }
        }
      },
      "es": {
        "text": "Condiciones de suscripción de Cinemondo Premium. La suscripción tiene una permanencia mínima de 12 meses y se renueva automáticamente por periodos iguales, salvo que se comunique la baja con al menos 30 días de antelación al vencimiento. La baja anticipada obliga a abonar las cuotas restantes. El precio podrá modificarse en cualquier momento con un preaviso de 30 días. Los datos de visionado podrán cederse a socios comerciales con fines publicitarios. Las cantidades abonadas no son reembolsables.",
        "summary": "Te comprometes al menos un año: el contrato se renueva solo, irte antes cuesta las cuotas que faltan y el precio puede subir.",
        "findings": [
          {
            "category": "minimum_term",
            "quote": "una permanencia mínima de 12 meses",
            "why": "Durante un año no puedes irte sin pagar.",
            "confidence": 0.9
          },
          {
            "category": "auto_renewal",
            "quote": "se renueva automáticamente por periodos iguales",
            "why": "Si no te das de baja a tiempo, pagas otro año.",
            "confidence": 0.9
          },
          {
            "category": "notice_period",
            "quote": "al menos 30 días de antelación al vencimiento",
            "why": "La baja tiene que llegar un mes antes del vencimiento, no el último día.",
            "confidence": 0.9
          },
          {
            "category": "early_termination_penalty",
            "quote": "obliga a abonar las cuotas restantes",
            "why": "Si te vas antes, pagas igualmente todos los meses que quedan.",
            "confidence": 0.9
          },
          {
            "category": "price_change",
            "quote": "El precio podrá modificarse en cualquier momento",
            "why": "El precio puede subir mientras estás atado.",
            "confidence": 0.9
          },
          {
            "category": "data_sharing",
            "quote": "cederse a socios comerciales con fines publicitarios",
            "why": "Lo que ves acaba en manos de los anunciantes.",
            "confidence": 0.9
          },
          {
            "category": "no_refund",
            "quote": "Las cantidades abonadas no son reembolsables",
            "why": "Lo que has pagado no vuelve.",
            "confidence": 0.9
          }
        ],
        "terms": {
          "minimum_term_months": {
            "value": 12,
            "quote": "permanencia mínima de 12 meses"
          },
          "notice_days": {
            "value": 30,
            "quote": "30 días de antelación"
          }
        }
      }
    }
  },
  "software": {
    "pricing": {},
    "label": [
      "Software",
      "Software",
      "Software"
    ],
    "langs": {
      "it": {
        "text": "Termini del servizio Nuvola Docs Business. L'abbonamento annuale si rinnova automaticamente al prezzo di listino in vigore alla data del rinnovo. Il piano prevede un minimo di 5 utenti; la riduzione del numero di utenti ha effetto dal rinnovo successivo. Concedi al fornitore una licenza mondiale e gratuita per utilizzare i contenuti caricati al fine di migliorare i servizi, incluso l'addestramento dei modelli. La responsabilità del fornitore è limitata all'importo pagato nei 12 mesi precedenti.",
        "summary": "Si rinnova da solo a prezzo pieno, paghi almeno 5 utenti e i tuoi file possono servire ad addestrare i loro modelli.",
        "findings": [
          {
            "category": "auto_renewal",
            "quote": "si rinnova automaticamente al prezzo di listino",
            "why": "Al rinnovo lo sconto sparisce e riparte da solo.",
            "confidence": 0.9
          },
          {
            "category": "hidden_costs",
            "quote": "un minimo di 5 utenti",
            "why": "Paghi almeno 5 utenti, anche se ne usi meno.",
            "confidence": 0.9
          },
          {
            "category": "ip_license",
            "quote": "una licenza mondiale e gratuita per utilizzare i contenuti caricati",
            "why": "Possono usare quello che carichi, ovunque e gratis.",
            "confidence": 0.9
          },
          {
            "category": "ai_training",
            "quote": "incluso l'addestramento dei modelli",
            "why": "I tuoi file possono addestrare i loro modelli.",
            "confidence": 0.9
          },
          {
            "category": "liability_limitation",
            "quote": "limitata all'importo pagato nei 12 mesi precedenti",
            "why": "Se perdono i tuoi dati, al massimo ti rendono un anno di canone.",
            "confidence": 0.9
          }
        ],
        "terms": {}
      },
      "en": {
        "text": "Cloud Docs Business terms of service. The annual subscription renews automatically at the list price in force on the renewal date. The plan requires a minimum of 5 users; reductions in the number of users take effect from the next renewal. You grant the provider a worldwide, royalty-free licence to use uploaded content to improve the services, including model training. The provider's liability is limited to the amount paid in the preceding 12 months.",
        "summary": "It renews on its own at full price, you pay for at least 5 users and your files can be used to train their models.",
        "findings": [
          {
            "category": "auto_renewal",
            "quote": "renews automatically at the list price",
            "why": "At renewal the discount goes and it restarts on its own.",
            "confidence": 0.9
          },
          {
            "category": "hidden_costs",
            "quote": "a minimum of 5 users",
            "why": "You pay for at least 5 users, even if you use fewer.",
            "confidence": 0.9
          },
          {
            "category": "ip_license",
            "quote": "a worldwide, royalty-free licence to use uploaded content",
            "why": "They can use what you upload, anywhere, for free.",
            "confidence": 0.9
          },
          {
            "category": "ai_training",
            "quote": "including model training",
            "why": "Your files can train their models.",
            "confidence": 0.9
          },
          {
            "category": "liability_limitation",
            "quote": "limited to the amount paid in the preceding 12 months",
            "why": "If they lose your data, at most you get a year's fees back.",
            "confidence": 0.9
          }
        ],
        "terms": {}
      },
      "es": {
        "text": "Condiciones del servicio Nube Docs Empresa. La suscripción anual se renovará automáticamente al precio de tarifa vigente en la fecha de renovación. El plan exige un mínimo de 5 usuarios; la reducción del número de usuarios surtirá efecto en la siguiente renovación. Concedes al proveedor una licencia mundial y gratuita para utilizar los contenidos subidos con el fin de mejorar los servicios, incluido el entrenamiento de modelos. La responsabilidad del proveedor se limita al importe pagado en los 12 meses anteriores.",
        "summary": "Se renueva solo a precio completo, pagas al menos 5 usuarios y tus archivos pueden servir para entrenar sus modelos.",
        "findings": [
          {
            "category": "auto_renewal",
            "quote": "se renovará automáticamente al precio de tarifa",
            "why": "En la renovación desaparece el descuento y vuelve a empezar solo.",
            "confidence": 0.9
          },
          {
            "category": "hidden_costs",
            "quote": "un mínimo de 5 usuarios",
            "why": "Pagas al menos 5 usuarios, aunque uses menos.",
            "confidence": 0.9
          },
          {
            "category": "ip_license",
            "quote": "una licencia mundial y gratuita para utilizar los contenidos subidos",
            "why": "Pueden usar lo que subes, en cualquier sitio y gratis.",
            "confidence": 0.9
          },
          {
            "category": "ai_training",
            "quote": "incluido el entrenamiento de modelos",
            "why": "Tus archivos pueden entrenar sus modelos.",
            "confidence": 0.9
          },
          {
            "category": "liability_limitation",
            "quote": "se limita al importe pagado en los 12 meses anteriores",
            "why": "Si pierden tus datos, como mucho te devuelven un año de cuota.",
            "confidence": 0.9
          }
        ],
        "terms": {}
      }
    }
  }
};
