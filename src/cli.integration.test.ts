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
  await writeFile(path.join(seed, 'skills/example/SKILL.md'), '---\nname: example\ndescription: Test fixture\n---\none\ntwo\nthree\n');
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
  assert.equal(await readFile(skill, 'utf8'), '---\nname: example\ndescription: Test fixture\n---\none\ntwo\nthree\n');
  await writeFile(skill, '---\nname: example\ndescription: Test fixture\n---\nONE\ntwo\nthree\n');
  const push = invoke('sync', project, '--yes', '--publish');
  assert.equal(push.status, 0, push.stderr);
  assert.equal(await git(['--git-dir', bare, 'show', 'main:skills/example/SKILL.md'], tempPath(seed)), '---\nname: example\ndescription: Test fixture\n---\nONE\ntwo\nthree', `${push.stdout}\n${push.stderr}`);
  const repeat = invoke('sync', project, '--yes');
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /No changes/);
});

function tempPath(seed: string): string { return path.dirname(seed); }

test('preserves both sides when the same line changes incompatibly', async t => {
  const { seed, project } = await fixture(t);
  assert.equal(invoke('sync', project, '--yes').status, 0);
  const local = path.join(project, '.agents/skills/example/SKILL.md');
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\nLOCAL\ntwo\nthree\n');
  await writeFile(path.join(seed, 'skills/example/SKILL.md'), '---\nname: example\ndescription: Test fixture\n---\nREMOTE\ntwo\nthree\n');
  await git(['add', '.'], seed); await git(['commit', '-m', 'remote edit'], seed); await git(['push'], seed);
  const result = invoke('sync', project, '--yes', '--publish');
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(local, 'utf8'), '---\nname: example\ndescription: Test fixture\n---\nLOCAL\ntwo\nthree\n');
  assert.equal(await git(['show', 'main:skills/example/SKILL.md'], seed), '---\nname: example\ndescription: Test fixture\n---\nREMOTE\ntwo\nthree');
});

test('requires an explicit side when adopting an existing skill', async t => {
  const { project } = await fixture(t);
  const local = path.join(project, '.agents/skills/example/SKILL.md');
  await mkdir(path.dirname(local), { recursive: true });
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\nold local text\n');
  const preview = invoke('sync', project, '--yes');
  assert.notEqual(preview.status, 0);
  assert.match(preview.stderr, /adopt-source=example/);
  const accepted = invoke('sync', project, '--yes', '--adopt-source=example');
  assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
  assert.match(await readFile(local, 'utf8'), /one\ntwo\nthree/);
});

test('installs agent copies through the upstream skills CLI', async t => {
  const { project } = await fixture(t);
  const first = invoke('sync', project, '--yes');
  assert.equal(first.status, 0, first.stderr);
  const configPath = path.join(project, '.agents/skills-sync.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.agents = ['claude-code'];
  await writeFile(configPath, JSON.stringify(config));
  const result = invoke('sync', project, '--yes');
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const agentSkill = path.join(project, '.claude/skills/example/SKILL.md');
  assert.equal(await readFile(agentSkill, 'utf8'), await readFile(path.join(project, '.agents/skills/example/SKILL.md'), 'utf8'));
  await writeFile(agentSkill, '# Local agent-specific edit\n');
  const rerun = invoke('sync', project, '--yes');
  assert.notEqual(rerun.status, 0);
  assert.match(rerun.stderr, /has local edits/);
  assert.equal(await readFile(agentSkill, 'utf8'), '# Local agent-specific edit\n');
});
