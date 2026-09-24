import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfig } from './config.js';

const valid = {
  version: 1,
  source: { repository: '/tmp/my-skills', branch: 'main', path: 'skills' },
  target: { path: '.agents/skills' },
  selection: ['example'],
  direction: 'bidirectional',
  agents: [],
  publication: { mode: 'local-commit' }
};

test('accepts a portable configuration', () => {
  assert.deepEqual(validateConfig(valid), valid);
});

test('rejects paths outside the skills directories', () => {
  assert.throws(() => validateConfig({ ...valid, target: { path: '../elsewhere' } }), /safe relative/);
});

test('requires a distinct branch for pull requests', () => {
  assert.throws(() => validateConfig({ ...valid, publication: { mode: 'pull-request', branch: 'main' } }), /non-source branch/);
});
