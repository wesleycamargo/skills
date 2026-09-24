import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('dist/cli.js');
async function git(args: string[], cwd: string): Promise<string> {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function invoke(command: string, project: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, command, ...args], { cwd: project, encoding: 'utf8' });
}
async function fixture(t: test.TestContext) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skills-sync-it-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const bare = path.join(temp, 'source.git'), seed = path.join(temp, 'seed'), project = path.join(temp, 'project');
  await mkdir(seed); await mkdir(project);
  await git(['init', '--bare', '--initial-branch=main', bare], temp);
  await git(['clone', bare, seed], temp);
  await git(['config', 'user.name', 'Test'], seed); await git(['config', 'user.email', 'test@example.invalid'], seed);
  await mkdir(path.join(seed, 'skills/example'), { recursive: true });
  await writeFile(path.join(seed, 'skills/example/SKILL.md'), 'one\ntwo\nthree\n');
  await git(['add', '.'], seed); await git(['commit', '-m', 'initial'], seed); await git(['push', '-u', 'origin', 'main'], seed);
  await mkdir(path.join(project, '.agents'), { recursive: true });
  await writeFile(path.join(project, '.agents/skills-sync.json'), JSON.stringify({
    version: 1, source: { repository: bare, branch: 'main', path: 'skills' }, target: { path: '.agents/skills' },
    selection: ['example'], direction: 'bidirectional', agents: [], publication: { mode: 'main' }
  }));
  return { temp, bare, seed, project };
}

test('pulls, publishes, and remains unchanged on the next sync', async t => {
  const { seed, project, bare } = await fixture(t);
  const initial = invoke('sync', project, '--yes');
  assert.equal(initial.status, 0, initial.stderr);
  const skill = path.join(project, '.agents/skills/example/SKILL.md');
  assert.equal(await readFile(skill, 'utf8'), 'one\ntwo\nthree\n');
  await writeFile(skill, 'ONE\ntwo\nthree\n');
  const push = invoke('sync', project, '--yes', '--publish');
  assert.equal(push.status, 0, push.stderr);
  assert.equal(await git(['--git-dir', bare, 'show', 'main:skills/example/SKILL.md'], tempPath(seed)), 'ONE\ntwo\nthree', `${push.stdout}\n${push.stderr}`);
  const repeat = invoke('sync', project, '--yes');
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /No changes/);
});

function tempPath(seed: string): string { return path.dirname(seed); }

test('preserves both sides when the same line changes incompatibly', async t => {
  const { seed, project } = await fixture(t);
  assert.equal(invoke('sync', project, '--yes').status, 0);
  const local = path.join(project, '.agents/skills/example/SKILL.md');
  await writeFile(local, 'LOCAL\ntwo\nthree\n');
  await writeFile(path.join(seed, 'skills/example/SKILL.md'), 'REMOTE\ntwo\nthree\n');
  await git(['add', '.'], seed); await git(['commit', '-m', 'remote edit'], seed); await git(['push'], seed);
  const result = invoke('sync', project, '--yes', '--publish');
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(local, 'utf8'), 'LOCAL\ntwo\nthree\n');
  assert.equal(await git(['show', 'main:skills/example/SKILL.md'], seed), 'REMOTE\ntwo\nthree');
});
