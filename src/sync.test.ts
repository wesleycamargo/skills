import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFile, formatDiff, planSkill, tryMerge } from './sync.js';
import { mkdtemp, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

test('diff preview shows added text', async () => {
  const change = planSkill('example', undefined, {}, { 'SKILL.md': Buffer.from('new skill\n').toString('base64') }, 'bidirectional')[0];
  const diff = await formatDiff(change);
  assert.match(diff, /\+new skill/);
});

test('refuses to write through a symlink in the target path', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-sync-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'outside'), { recursive: true });
  await symlink(path.join(root, 'outside'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const change = { skill: 'example', file: 'SKILL.md', source: Buffer.from('content').toString('base64'), kind: 'pull' as const };
  await assert.rejects(() => applyFile(root, 'linked', change, 'local', false), /symlink/i);
  assert.deepEqual(await import('node:fs/promises').then(fs => fs.readdir(path.join(root, 'outside'))), []);
});
