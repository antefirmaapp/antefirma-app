/**
 * The extension's test data must look like the real server's responses.
 * If the server changes a response shape, test/contract/api-contract.mjs changes
 * in both repositories and these fixtures must follow, or the tests fail here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { assertContract } from './contract/api-contract.mjs';
import { RESPONSES } from './fixtures/responses.mjs';
import { verdict, HOST } from '../tools/demo-fixture.mjs';

test('recorded corpus responses match the analyze contract', () => {
  for (const [id, r] of Object.entries(RESPONSES)) {
    try { assertContract(r, 'analyze'); } catch (e) { assert.fail(`${id}: ${e.message}`); }
  }
});

test('the demo/mock server used for screenshots matches the contract', () => {
  for (const l of Object.keys(HOST)) assertContract(verdict(l), 'analyze');
});

const other = new URL('../../antefirma-server/test/contract/api-contract.mjs', import.meta.url);
test('api-contract.mjs is identical in antefirma-server', { skip: !existsSync(other) && 'antefirma-server not checked out next to this repo' }, () => {
  assert.equal(readFileSync(new URL('./contract/api-contract.mjs', import.meta.url), 'utf8'), readFileSync(other, 'utf8'));
});
