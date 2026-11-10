/**
 * Golden-file helper: compares an output with the copy approved in test/golden/.
 *
 *   node --test test/*.test.mjs                  fails on any difference
 *   UPDATE_GOLDEN=1 node --test test/*.test.mjs  rewrites the approved copies
 *
 * A failing golden test means behaviour changed. If the change is intended,
 * update the files and review the diff in the commit like any other code.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');

export function golden(name, actual) {
  const text = typeof actual === 'string' ? actual : JSON.stringify(actual, null, 1) + '\n';
  const file = join(DIR, name);
  if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    if (!process.env.UPDATE_GOLDEN && process.env.CI) assert.fail(`missing golden file ${name}: run UPDATE_GOLDEN=1 locally and commit it`);
    return;
  }
  assert.equal(text, readFileSync(file, 'utf8'), `${name} differs from the approved copy (UPDATE_GOLDEN=1 to accept)`);
}
