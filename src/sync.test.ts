import assert from 'node:assert/strict';
import test from 'node:test';
import { planSkill, tryMerge } from './sync.js';

test('carries edits from either side without losing independent files', () => {
  const changes = planSkill('example', { 'a.md': 'old', 'b.md': 'old' }, { 'a.md': 'local', 'b.md': 'old' }, { 'a.md': 'old', 'b.md': 'source' }, 'bidirectional');
  assert.deepEqual(changes.map(c => c.kind), ['push', 'pull']);
});

test('reports conflicting edits and deletion separately', () => {
  assert.equal(planSkill('example', { 'a.md': 'old' }, { 'a.md': 'local' }, { 'a.md': 'source' }, 'bidirectional')[0].kind, 'conflict');
  assert.equal(planSkill('example', { 'a.md': 'old' }, {}, { 'a.md': 'old' }, 'bidirectional')[0].kind, 'delete');
});

test('repeated content needs no changes', () => {
  assert.deepEqual(planSkill('example', { 'a.md': 'same' }, { 'a.md': 'same' }, { 'a.md': 'same' }, 'bidirectional'), []);
});

test('merges independent edits in the same text file', async () => {
  const encode = (text: string) => Buffer.from(text).toString('base64');
  const change = planSkill('example', { 'SKILL.md': encode('one\ntwo\nthree\nfour\n') },
    { 'SKILL.md': encode('ONE\ntwo\nthree\nfour\n') },
    { 'SKILL.md': encode('one\ntwo\nthree\nFOUR\n') }, 'bidirectional')[0];
  const merged = await tryMerge(change);
  assert.equal(merged.kind, 'merge');
  assert.equal(Buffer.from(merged.merged!, 'base64').toString(), 'ONE\ntwo\nthree\nFOUR\n');
});
