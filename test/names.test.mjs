/** The commitment's name: who sells, not who collects the payment (Paddle, Stripe…). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { providerName, nameFromFileTitle, merchantFromTitle, isPaymentHost } from '../src/core/commitments.js';

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

test('a file name names the seller only when it says something', () => {
  for (const generic of ['page1.jpg', 'IMG_2041.JPG', 'IMG_2041.jpg +2', 'scan.pdf', 'Scansione 3.pdf', 'DSC00412.png', 'PXL_20261114_101500.jpg', 'WhatsApp Image 2026-11-14 at 10.15.00.jpeg', 'document (2).pdf', '2026-11-14.pdf', 'foto.heic', '', null])
    assert.equal(nameFromFileTitle(generic), null, String(generic));
  assert.equal(nameFromFileTitle('contratto-palestra.pdf'), 'contratto-palestra');
  assert.equal(nameFromFileTitle('FitClub.jpg +1'), 'FitClub');
  assert.equal(nameFromFileTitle('Condizioni Streamly'), 'Condizioni Streamly');
  assert.equal(providerName({ title: 'page1.jpg' }), null);
  assert.equal(providerName({ title: 'Vodafone contratto.pdf' }), 'Vodafone contratto');
});
