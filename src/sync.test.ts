import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFile, formatDiff, isIgnored, parseSkillsIgnore, planSkill, readSkillDescription, readSkillsIgnore, resolveSkills, tryMerge } from './sync.js';
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

test('reads a single-line skill description without following symlinks', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-sync-desc-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (skill: string, text: string) => { await mkdir(path.join(root, 'skills', skill), { recursive: true }); await writeFile(path.join(root, 'skills', skill, 'SKILL.md'), text); };
  await write('plain', '---\nname: plain\ndescription: Formats commit messages\n---\nbody\n');
  await write('quoted', '---\ndescription: "Quoted: text"\n---\n');
  await write('folded', '---\ndescription: >\n  spans lines\n---\n');
  await write('none', '# No frontmatter\ndescription: not frontmatter\n');
  await mkdir(path.join(root, 'skills', 'linked'));
  await symlink(path.join(root, 'skills', 'plain', 'SKILL.md'), path.join(root, 'skills', 'linked', 'SKILL.md'));
  assert.equal(await readSkillDescription(root, 'skills', 'plain'), 'Formats commit messages');
  assert.equal(await readSkillDescription(root, 'skills', 'quoted'), 'Quoted: text');
  assert.equal(await readSkillDescription(root, 'skills', 'folded'), undefined);
  assert.equal(await readSkillDescription(root, 'skills', 'none'), undefined);
  assert.equal(await readSkillDescription(root, 'skills', 'linked'), undefined);
});

test('.skillsignore entries skip comments and whitespace, and match names with wildcards', () => {
  const patterns = parseSkillsIgnore('# drafts\n  draft-*  \n\nlegacy/\nv?-skill\n');
  assert.deepEqual(patterns, ['draft-*', 'legacy', 'v?-skill']);
  assert.ok(isIgnored('draft-notes', patterns));
  assert.ok(isIgnored('legacy', patterns));
  assert.ok(isIgnored('v2-skill', patterns));
  assert.ok(!isIgnored('v10-skill', patterns));
  assert.ok(!isIgnored('legacy-tools', patterns));
});

test('a missing .skillsignore ignores nothing and a symlinked one fails', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-sync-ignore-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await readSkillsIgnore(root), []);
  await writeFile(path.join(root, 'real'), 'alpha\n');
  await symlink(path.join(root, 'real'), path.join(root, '.skillsignore'));
  await assert.rejects(readSkillsIgnore(root), /\.skillsignore must be a regular file/);
});

test('managed skills are the source, project, and baseline skills minus ignored ones', () => {
  const result = resolveSkills({ source: ['alpha', 'beta', 'draft-x'], project: ['alpha', 'local'], baseline: ['gone'], ignore: ['draft-*'], direction: 'bidirectional' });
  assert.deepEqual(result, { skills: ['alpha', 'beta', 'gone', 'local'], skipped: [], invalid: [] });
});

test('direction skips one-sided skills that were never synced, and invalid names are reported', () => {
  const pull = resolveSkills({ source: ['alpha'], project: ['alpha', 'local', 'synced'], baseline: ['synced'], ignore: [], direction: 'pull' });
  assert.deepEqual(pull, { skills: ['alpha', 'synced'], skipped: [{ skill: 'local', side: 'project' }], invalid: [] });
  const push = resolveSkills({ source: ['alpha', 'remote'], project: ['alpha'], baseline: [], ignore: [], direction: 'push' });
  assert.deepEqual(push.skipped, [{ skill: 'remote', side: 'source' }]);
  assert.deepEqual(resolveSkills({ source: ['ok', 'bad:name'], project: [], baseline: [], ignore: [], direction: 'bidirectional' }).invalid, ['bad:name']);
});
