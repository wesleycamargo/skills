import assert from 'node:assert/strict';
import test from 'node:test';
import { planSkill } from './sync.js';

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
