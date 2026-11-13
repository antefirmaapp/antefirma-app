/**
 * The letters in "en": see ../letter.js for how they are put together.
 *
 * English: the European directives and, for the United Kingdom, the equivalent rules.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Full name]', address: '[Address]', email: '[Email]', provider: '[Provider]', service: '[description of the service]', date: '[date]' },
  estimated: (x) => `(estimated commitment ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `To: ${provider}`,
    '[Provider address / email given in the terms]', '', `Place and date: ______________, ${today}`, '',
    'Sent by: ☐ recorded delivery   ☐ email   ☐ online form   ☐ other: ________'].join('\n'),
  withdrawal: (k) => ['Subject: notice of withdrawal', '', `Dear ${k.provider},`, '',
    'I hereby give notice that I withdraw from my contract for the supply',
    `of the service ${service(k)}, concluded on ${orderDate(k)}.`, '',
    'I am exercising the right of withdrawal for distance contracts, within fourteen days of',
    'the conclusion of the contract, without giving any reason and without any cost to me.', '',
    'I therefore ask you to:', '  1. stop the service and any related charges immediately;',
    '  2. refund any amount already paid within fourteen days of receiving this notice,',
    '     using the same means of payment;', '  3. confirm in writing that you have received this notice.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Subject: cancellation — no automatic renewal', '', `Dear ${k.provider},`, '',
      `I hereby give notice that I am cancelling my contract for ${service(k)},`, `started on ${orderDate(k)}.`, '',
      renewal ? `This notice is given so that the contract does not renew at the end of the term on ${renewal},`
        : 'This notice is given so that the contract does not renew automatically at the end of the term,',
      notice ? `in accordance with the ${notice}-day notice period set out in the terms${deadline ? ` (last day: ${deadline})` : ''}.`
        : 'in accordance with the notice period set out in the terms.', '',
      'I therefore ask you to:', '  1. confirm in writing that you have received this notice and the date the cancellation takes effect;',
      '  2. stop all charges from the end date stated above;', '  3. itemise any amount you consider still due, stating the clause it is based on.', '',
      'Please note that no further charge will be accepted for any period after the end date stated above.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Subject: withdrawal following a unilateral change to the terms', '', `Dear ${k.provider},`, '',
      `I have noticed a change to the terms of my contract for ${service(k)},`, `compared with the terms I accepted on ${orderDate(k)}.`, '',
      ch?.summary ? `In particular: ${ch.summary}` : 'The change affects the price or the conditions of the service.', '',
      'As I do not accept the new terms, I hereby end the contract with immediate effect,',
      'without any fee or disconnection charge, since the change was made unilaterally and', 'not at my request.', '',
      'I therefore ask you to:', '  1. confirm in writing that the contract has ended and the date it takes effect;', '  2. stop all charges;',
      '  3. refund any amount paid for periods after the end of the contract.'];
  },
  identity: ({ you, c }) => [`Account holder: ${you.name}`, `Address: ${you.address}`, `Contact email: ${you.email}`,
    `Customer / contract number: ${you.customerId || '[to be completed]'}`,
    ...(c.url ? [`Signed up at: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Fingerprint of the accepted terms (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Yours faithfully,', '', you.name, '', 'Signature _______________________', `Date ${today}`].join('\n'),
  footer: (refs) => ['—', 'Useful legal references:', ...refs.map((r) => `  · ${r}`), '',
    'Document generated automatically by AnteFirma from the terms it analysed.',
    'Check the details in square brackets before sending it. It is not legal advice.'].join('\n'),
  subject: { withdrawal: (p) => `Notice of withdrawal — ${p}`, cancellation: (p) => `Cancellation — ${p}`, change_withdrawal: (p) => `Withdrawal following changes to the terms — ${p}` },
  refs: {
    withdrawal: ['Directive 2011/83/EU on consumer rights, arts. 9-16 — right of withdrawal from distance contracts',
      'Directive 2011/83/EU, Annex I(B) — model withdrawal form',
      'UK: Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013'],
    cancellation: ['Directive 93/13/EEC on unfair terms, annex, point 1(h) — automatic extension with an unreasonably early deadline',
      'UK: Consumer Rights Act 2015, Part 2 — unfair terms'],
    change_withdrawal: ['Directive 93/13/EEC, annex, point 1(j) and (l) — unilateral changes to terms and price',
      'UK: Consumer Rights Act 2015, Schedule 2, paras 11 and 15'],
  },
};
