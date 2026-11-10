/** The commitment's name: who sells, not who collects the payment (Paddle, Stripe…). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { providerName, merchantFromTitle, isPaymentHost } from '../src/core/commitments.js';

test('payment services recognised, normal sites not', () => {
  assert.ok(isPaymentHost('sandbox-buy.paddle.com'));
  assert.ok(isPaymentHost('checkout.stripe.com'));
  assert.ok(!isPaymentHost('www.netflix.com'));
  assert.ok(!isPaymentHost('notpaddle.com.evil.it'));
});

test('the seller from the title or from the name the page declares', () => {
  assert.equal(merchantFromTitle('Checkout – Acme Pro'), 'Acme Pro');
  assert.equal(merchantFromTitle('Pagamento sicuro | Palestra Orizzonte'), 'Palestra Orizzonte');
  assert.equal(merchantFromTitle('Checkout'), null);
  assert.equal(providerName({ host: 'sandbox-buy.paddle.com', title: 'Checkout' }), null);
  assert.equal(providerName({ host: 'buy.stripe.com', title: 'Pay', merchant: 'Streamly' }), 'Streamly');
  assert.equal(providerName({ host: 'www.netflix.com', title: 'Netflix' }), 'Netflix');
});
