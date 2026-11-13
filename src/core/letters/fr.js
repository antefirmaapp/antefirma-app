/**
 * The letters in "fr": see ../letter.js for how they are put together.
 *
 * France: Code de la consommation. Belgium uses the same texts with its own laws.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Prénom et nom]', address: '[Adresse]', email: '[E-mail]', provider: '[Fournisseur]', service: '[description du service]', date: '[date]' },
  estimated: (x) => `(engagement estimé ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `À l’attention de ${provider}`,
    '[Adresse du fournisseur / e-mail indiqué dans les conditions]', '', `Lieu et date : ______________, ${today}`, '',
    'Envoyée par : ☐ lettre recommandée avec AR   ☐ fonction de résiliation en ligne   ☐ formulaire en ligne   ☐ e-mail'].join('\n'),
  withdrawal: (k) => ['Objet : exercice du droit de rétractation', '', 'Madame, Monsieur,', '',
    'Par la présente, je vous notifie ma rétractation du contrat portant sur la fourniture',
    `du service ${service(k)}, conclu le ${orderDate(k)}.`, '',
    'J’exerce le droit de rétractation prévu pour les contrats à distance, dans le délai de',
    'quatorze jours suivant la conclusion du contrat, sans avoir à motiver ma décision et sans frais.', '',
    'Je vous demande donc :', '  1. l’arrêt immédiat du service et de tout prélèvement associé ;',
    '  2. le remboursement des sommes versées dans les quatorze jours suivant la réception',
    '     de ce courrier, par le même moyen de paiement ;', '  3. la confirmation écrite de la réception de ce courrier.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Objet : résiliation du contrat — refus de la reconduction tacite', '', 'Madame, Monsieur,', '',
      `Par la présente, je résilie le contrat relatif à ${service(k)},`, `souscrit le ${orderDate(k)}.`, '',
      renewal ? `Cette résiliation est adressée afin que le contrat ne soit pas reconduit à l’échéance du ${renewal},`
        : 'Cette résiliation est adressée afin que le contrat ne soit pas reconduit tacitement à son échéance,',
      notice ? `dans le respect du préavis de ${notice} jours prévu par les conditions${deadline ? ` (date limite : ${deadline})` : ''}.`
        : 'dans le respect du préavis prévu par les conditions du contrat.', '',
      'Je vous demande donc :', '  1. la confirmation écrite de la réception de ce courrier et de la date d’effet de la résiliation ;',
      '  2. l’arrêt de tout prélèvement à compter de l’échéance indiquée ;',
      '  3. le détail des sommes que vous estimeriez encore dues, avec la clause correspondante.', '',
      'Aucun prélèvement pour une période postérieure à l’échéance indiquée ne sera accepté.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Objet : résiliation suite à une modification unilatérale des conditions', '', 'Madame, Monsieur,', '',
      `J’ai constaté une modification des conditions de mon contrat relatif à ${service(k)},`, `par rapport à celles que j’ai acceptées le ${orderDate(k)}.`, '',
      ch?.summary ? `En particulier : ${ch.summary}` : 'La modification porte sur le prix ou sur les conditions du service.', '',
      'N’acceptant pas les nouvelles conditions, je résilie le contrat avec effet immédiat,',
      'sans pénalité ni frais de résiliation, la modification ayant été décidée unilatéralement', 'et non à ma demande.', '',
      'Je vous demande donc :', '  1. la confirmation écrite de la fin du contrat et de sa date d’effet ;', '  2. l’arrêt de tout prélèvement ;',
      '  3. le remboursement des sommes versées pour les périodes postérieures à la résiliation.'];
  },
  identity: ({ you, c }) => [`Titulaire du contrat : ${you.name}`, `Adresse : ${you.address}`, `E-mail de contact : ${you.email}`,
    `Numéro client / contrat : ${you.customerId || '[à compléter]'}`,
    ...(c.url ? [`Souscrit sur : ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Empreinte des conditions acceptées (SHA-256) : ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Veuillez agréer, Madame, Monsieur, mes salutations distinguées.', '', you.name, '', 'Signature _______________________', `Date ${today}`].join('\n'),
  footer: (refs) => ['—', 'Références juridiques utiles :', ...refs.map((r) => `  · ${r}`), '',
    'Document généré automatiquement par AnteFirma à partir des conditions analysées.',
    'Vérifiez les données entre crochets avant l’envoi. Ce n’est pas un conseil juridique.'].join('\n'),
  subject: { withdrawal: (p) => `Exercice du droit de rétractation — ${p}`, cancellation: (p) => `Résiliation du contrat — ${p}`, change_withdrawal: (p) => `Résiliation suite à modification unilatérale — ${p}` },
  refs: {
    withdrawal: ['Code de la consommation, art. L221-18 à L221-28 — droit de rétractation dans les contrats à distance',
      'Code de la consommation, annexe à l’art. R221-1 — formulaire type de rétractation', 'Directive 2011/83/UE'],
    cancellation: ['Code de la consommation, art. L215-1 — information sur la reconduction tacite (loi Chatel)',
      'Code de la consommation, art. L215-1-1 — résiliation par voie électronique'],
    change_withdrawal: ['Code de la consommation, art. R212-1 et R212-2 — clauses abusives (modification unilatérale)',
      'Directive 93/13/CEE, annexe, point 1 j) et l)'],
  },
};
