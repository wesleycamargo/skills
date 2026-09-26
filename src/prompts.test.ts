import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import * as clack from '@clack/prompts';
import { CANCEL, createClackPrompts, toCancel } from './prompts.js';
import { cancelSymbol } from './vendor/skills/search-multiselect.js';

test('clack and search-multiselect cancellations map to one cancel marker', async () => {
  const aborted = await clack.confirm({ message: 'x', signal: AbortSignal.abort(), input: new PassThrough(), output: new PassThrough() });
  assert.equal(toCancel(aborted), CANCEL);
  assert.equal(toCancel(cancelSymbol), CANCEL);
  assert.deepEqual(toCancel(['alpha']), ['alpha']);
  assert.equal(toCancel(false), false);
});

async function typeInto(keys: string, options: { message: string; defaultValue?: string; validate?: (value: string) => string | undefined }) {
  const input = new PassThrough() as PassThrough & { isTTY?: boolean }, output = new PassThrough();
  const prompts = createClackPrompts({ input, output });
  const answer = prompts.text(options);
  setImmediate(() => input.write(keys));
  return answer;
}

test('typing at a text prompt replaces the default instead of appending to it', async () => {
  const isBranch = (value: string) => value ? undefined : 'Invalid source.branch';
  assert.equal(await typeInto('skills\r', { message: 'Source branch', defaultValue: 'main', validate: isBranch }), 'skills');
  assert.equal(await typeInto('\r', { message: 'Source branch', defaultValue: 'main', validate: isBranch }), 'main');
});
