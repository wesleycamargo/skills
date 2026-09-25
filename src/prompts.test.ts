import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createEnquirerPrompts } from './prompts.js';

async function typeInto(keys: string, defaultValue = 'main') {
  const input = new PassThrough() as PassThrough & { isTTY: boolean; isRaw: boolean; setRawMode: (mode: boolean) => void }, output = new PassThrough();
  input.isTTY = true; input.isRaw = false; input.setRawMode = mode => { input.isRaw = mode; };
  const answer = createEnquirerPrompts({ input, output }).text({ message: 'Source branch', defaultValue, validate: v => v ? undefined : 'Required' });
  setImmediate(() => input.write(keys));
  return answer;
}

test('enquirer returns entered text and accepts the suggested default', async () => {
  assert.equal(await typeInto('skills\r'), 'skills');
  assert.equal(await typeInto('\r'), 'main');
});

