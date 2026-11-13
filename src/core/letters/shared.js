/**
 * What the letters of every language share: how the service, the order date,
 * the notice and a deadline are written from a commitment. `k` is the context
 * buildLetter() passes to each text: { c, you, provider, today, fmt, X }.
 */
export const service = ({ c, fmt, X }) => {
  const parts = [];
  if (c.title) parts.push(`"${c.title}"`);
  else if (c.provider) parts.push(c.provider);
  if (c.recurringTotal != null && c.horizonMonths) parts.push(X.estimated(fmt.money(c.worstCase ?? c.recurringTotal, c.currency)));
  return parts.join(' ') || X.ph.service;
};
export const orderDate = ({ c, fmt, X }) => (c.createdAt ? fmt.date(new Date(c.createdAt)) : X.ph.date);
export const noticeOf = (c) => (c.noticeMonths ? Math.round(c.noticeMonths * 30) : null);
export const when = (iso, fmt) => (iso ? fmt.date(new Date(iso)) : null);
