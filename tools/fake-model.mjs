/**
 * A stand-in for the model, for runs without an API key: it reads the page text
 * and reports, with a real quote, the risk sentences the demo pages use
 * (renewal, minimum term, penalty, no refund, arbitration, in it/en/es). A fair
 * contract gets nothing. Used by the end-to-end harness (test/e2e/harness.mjs)
 * and by tools/local-stack.mjs, where it answers in the Messages API format so
 * the real server can call it through API_URL.
 */
import http from 'node:http';

const RULES = [
  ['auto_renewal', /(?:si rinnova (?:automaticamente|tacitamente)|renews automatically|se renueva autom[áa]ticamente)[^.\n]{0,60}|rinnovo automatico ogni \d+ mesi/i],
  ['minimum_term', /(?:durata minima (?:di )?\d+ mesi|minimum term of \d+ months|permanencia m[íi]nima de [a-zñ]+ meses)/i],
  ['early_termination_penalty', /(?:(?:è dovuta una )?penal(?:e|ità) (?:di|pari a|di recesso) (?:€ ?)?\d[\d.,]*(?: ?(?:€|euro))?|penalizaci[óo]n de \d[\d.,]* euros|fee of £\d[\d.,]*)/i],
  ['no_refund', /(?:non sono rimborsabili|nessun rimborso degli importi versati|non-refundable|no son reembolsables)[^.\n]{0,30}/i],
  ['arbitration', /devoluta ad arbitrato[^.\n]{0,20}/i],
];

export function keywordFindings(text, lang) {
  const out = [];
  for (const [category, re] of RULES) {
    const m = re.exec(text || '');
    if (m && m[0].trim().length >= 12) out.push({ category, quote: m[0].trim(), why: lang === 'en' ? 'English reason.' : 'Motivo.', confidence: 0.9 });
  }
  return out;
}

export const EMPTY_TERMS = { price: null, currency: null, billing_period: null, minimum_term_months: null, notice_days: null, exit_fee: null, extra_fees: [] };

/** An HTTP server answering like the Messages API, with keywordFindings(). Resolves to { url, close, calls }. */
export function startFakeModel() {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const sent = JSON.parse(body || '{}');
    const content = String(sent.messages?.[0]?.content || '');
    const page = content.split('<page>\n').slice(1).join('<page>\n').replace(/\n<\/page>$/, '');
    calls.push(page.length);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      model: 'fake-local', stop_reason: 'end_turn', usage: { input_tokens: Math.ceil(content.length / 4), output_tokens: 120 },
      content: [{ type: 'text', text: JSON.stringify({ findings: keywordFindings(page), terms: EMPTY_TERMS, summary: '' }) }],
    }));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}/v1/messages`, close: () => server.close(), calls })));
}
