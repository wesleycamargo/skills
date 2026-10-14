import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAdoptions, chooseDeletions } from './decisions.js';
import { CANCEL, Prompts } from './prompts.js';

const scripted = (answers: unknown[]): Prompts => {
  const next = async () => answers.shift();
  return { select: next, confirm: next } as unknown as Prompts;
};

test('adoption choices are collected per skill', async () => {
  const result = await chooseAdoptions(scripted(['source', 'skip']), ['a', 'b']);
  assert.deepEqual([...result!], [['a', 'source'], ['b', 'skip']]);
});

test('cancelling an adoption prompt stops the run', async () => {
  assert.equal(await chooseAdoptions(scripted([CANCEL]), ['a']), undefined);
});

test('only confirmed deletions are returned', async () => {
  const deletions = [{ skill: 'a', file: 'x.md', kind: 'delete' as const, local: undefined }, { skill: 'a', file: 'y.md', kind: 'delete' as const, local: 'Zg==' }];
  const result = await chooseDeletions(scripted([true, false]), deletions);
  assert.deepEqual([...result!], ['a/x.md']);
  assert.equal(await chooseDeletions(scripted([CANCEL]), deletions), undefined);
});
