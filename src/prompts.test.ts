import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import * as clack from '@clack/prompts';
import { CANCEL, toCancel } from './prompts.js';
import { cancelSymbol } from './vendor/skills/search-multiselect.js';

test('clack and search-multiselect cancellations map to one cancel marker', async () => {
  const aborted = await clack.confirm({ message: 'x', signal: AbortSignal.abort(), input: new PassThrough(), output: new PassThrough() });
  assert.equal(toCancel(aborted), CANCEL);
  assert.equal(toCancel(cancelSymbol), CANCEL);
  assert.deepEqual(toCancel(['alpha']), ['alpha']);
  assert.equal(toCancel(false), false);
});
