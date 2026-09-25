import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { CANCEL, createInquirerPrompts } from './prompts.js';

async function typeInto(keys: string, defaultValue = 'main') {
  const input = new PassThrough(), output = new PassThrough();
  const answer = createInquirerPrompts({ input, output }).text({ message: 'Source branch', defaultValue, validate: v => v ? undefined : 'Required' });
  setImmediate(() => input.write(keys));
  return answer;
}

test('inquirer returns entered text and accepts the suggested default', async () => {
  assert.equal(await typeInto('skills\r'), 'skills');
  assert.equal(await typeInto('\r'), 'main');
});

test('inquirer cancellation maps to the shared marker', async () => {
  assert.equal(await typeInto('\x03'), CANCEL);
});
