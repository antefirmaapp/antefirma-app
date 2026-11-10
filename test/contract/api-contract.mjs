/**
 * The API contract between the server and its clients (extension, web app, website).
 *
 * The SAME file lives in antefirma-server/test/contract and antefirma-app/test/contract:
 * the server checks that its real responses match it, the extension checks that
 * its test fixtures and mocks match it. A test in each repo fails if the two
 * copies drift apart (when both repositories are checked out side by side).
 *
 * Spec language: 'string' | 'number' | 'boolean' | 'any', a trailing '?' allows
 * null/undefined, [spec] is an array of spec, { key: spec } is an object
 * (extra keys are allowed: clients must ignore what they don't know).
 */
const TERM = { value: 'any', quote: 'string?' };

export const CONTRACT = {
  health: { ok: 'boolean' },
  register: { token: 'string' },
  error: { error: 'string', message: 'string' },
  analyze: {
    findings: [{ category: 'string', quote: 'string', why: 'string?', confidence: 'number?' }],
    terms: {
      price: { ...TERM, '?': true }, currency: { ...TERM, '?': true }, billing_period: { ...TERM, '?': true },
      minimum_term_months: { ...TERM, '?': true }, notice_days: { ...TERM, '?': true }, exit_fee: { ...TERM, '?': true },
      extra_fees: [{ label: 'string?', value: 'number', per_cycle: 'boolean?', quote: 'string?' }],
    },
    summary: 'string',
    '?quota': { month: { limit: 'number', remaining: 'number', '?': true }, '?': true },
  },
  licenseFree: { plan: 'string', active: 'boolean', quota: { month: { limit: 'number', remaining: 'number' } } },
  licensePaid: {
    plan: 'string', status: 'string?', active: 'boolean', periodEnd: 'string?',
    activations: { used: 'number', limit: 'number', here: 'boolean' },
    quota: { month: { limit: 'number', remaining: 'number' }, day: { limit: 'number', remaining: 'number', '?': true } },
  },
  teamKeys: {
    month: { limit: 'number', remaining: 'number' }, periodEnd: 'string?',
    seats: [{ seat: 'number', key: 'string', browsers: 'number', limit: 'number' }],
  },
};

/** Returns a list of problems ('' path = root); empty when `value` matches `spec`. */
export function check(value, spec, path = '') {
  if (typeof spec === 'string') {
    const optional = spec.endsWith('?');
    const type = spec.replace(/\?$/, '');
    if (value == null) return optional ? [] : [`${path || 'value'}: missing`];
    if (type === 'any' || typeof value === type) return [];
    return [`${path}: expected ${type}, got ${typeof value}`];
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    return value.flatMap((v, i) => check(v, spec[0], `${path}[${i}]`));
  }
  if (value == null) return spec['?'] ? [] : [`${path || 'value'}: missing object`];
  if (typeof value !== 'object') return [`${path}: expected object`];
  return Object.entries(spec).filter(([k]) => k !== '?').flatMap(([k, s]) => {
    const optional = k.startsWith('?');
    const key = k.replace(/^\?/, '');
    if (optional && value[key] == null) return [];
    return check(value[key], s, path ? `${path}.${key}` : key);
  });
}

/** For tests: throws with every mismatch listed. */
export function assertContract(value, name) {
  const problems = check(value, CONTRACT[name]);
  if (problems.length) throw new Error(`response "${name}" breaks the API contract:\n  ${problems.join('\n  ')}`);
}
