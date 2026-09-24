import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
function invokeWithEnv(command: string, project: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  return spawnSync(process.execPath, [cli, command, ...args], { cwd: project, encoding: 'utf8', env: { ...process.env, ...env } });
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

test('local-commit mode commits in the configured source checkout and records its baseline', async t => {
  const { seed, project } = await fixture(t);
  const configPath = path.join(project, '.agents/skills-sync.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.source.repository = seed;
  config.publication = { mode: 'local-commit' };
  await writeFile(configPath, JSON.stringify(config));
  assert.equal(invoke('sync', project, '--yes').status, 0);
  await writeFile(path.join(project, '.agents/skills/example/SKILL.md'), '---\nname: example\ndescription: Test fixture\n---\nlocal commit\n');
  const publish = invoke('sync', project, '--yes', '--publish');
  assert.equal(publish.status, 0, `${publish.stdout}\n${publish.stderr}`);
  assert.match(await git(['log', '-1', '--format=%s'], seed), /Sync selected skills/);
  assert.match(await git(['show', 'HEAD:skills/example/SKILL.md'], seed), /local commit/);
  const repeat = invoke('sync', project, '--yes');
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /No changes/);
});

test('updates a pending publication branch without duplicate commits and clears it when merged', async t => {
  const { bare, seed, project } = await fixture(t);
  const configPath = path.join(project, '.agents/skills-sync.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.publication = { mode: 'branch', branch: 'skills-sync/test' };
  await writeFile(configPath, JSON.stringify(config));
  assert.equal(invoke('sync', project, '--yes').status, 0);
  const local = path.join(project, '.agents/skills/example/SKILL.md');
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\nfirst pending edit\n');
  assert.equal(invoke('sync', project, '--yes', '--publish').status, 0);
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\nupdated pending edit\n');
  const update = invoke('sync', project, '--yes', '--publish');
  assert.equal(update.status, 0, `${update.stdout}\n${update.stderr}`);
  const branchFile = await git(['--git-dir', bare, 'show', 'skills-sync/test:skills/example/SKILL.md'], tempPath(seed));
  assert.match(branchFile, /updated pending edit/);
  const branchCommit = await git(['--git-dir', bare, 'rev-parse', 'refs/heads/skills-sync/test'], tempPath(seed));
  const repeat = invoke('sync', project, '--yes');
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /Pending publication/);
  assert.equal(await git(['--git-dir', bare, 'rev-parse', 'refs/heads/skills-sync/test'], tempPath(seed)), branchCommit);
  await git(['fetch', 'origin', 'skills-sync/test'], seed);
  await git(['merge', '--ff-only', 'FETCH_HEAD'], seed);
  await git(['push', 'origin', 'main'], seed);
  const merged = invoke('sync', project, '--yes');
  assert.equal(merged.status, 0, `${merged.stdout}\n${merged.stderr}`);
  assert.match(merged.stdout, /present in the source branch/);
  assert.equal(JSON.parse(await readFile(path.join(project, '.agents/skills-sync-state.json'), 'utf8')).pending, undefined);
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\npost-merge edit\n');
  const next = invoke('sync', project, '--yes', '--publish');
  assert.equal(next.status, 0, `${next.stdout}\n${next.stderr}`);
  assert.match(await git(['--git-dir', bare, 'show', 'skills-sync/test:skills/example/SKILL.md'], tempPath(seed)), /post-merge edit/);
});

test('opens one pull request, updates its branch, then settles after merge', async t => {
  const { bare, seed, project, temp } = await fixture(t);
  const configPath = path.join(project, '.agents/skills-sync.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.source.repository = 'https://github.com/test/repo.git';
  config.publication = { mode: 'pull-request', branch: 'skills-sync/pr-test' };
  await writeFile(configPath, JSON.stringify(config));
  const bin = path.join(temp, 'bin'); await mkdir(bin);
  const gitPath = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  const gitWrapper = `#!/bin/sh\nif [ "$1" = clone ] && [ "$6" = 'https://github.com/test/repo.git' ]; then exec '${gitPath}' clone --quiet --branch "$4" --single-branch '${bare}' "$7"; fi\nexec '${gitPath}' "$@"\n`;
  const ghWrapper = `#!/bin/sh\nif [ "$1" = pr ] && [ "$2" = list ]; then [ -f '${path.join(temp, 'pr-created')}' ] && echo 1; exit 0; fi\nif [ "$1" = pr ] && [ "$2" = create ]; then touch '${path.join(temp, 'pr-created')}'; exit 0; fi\nexit 0\n`;
  await writeFile(path.join(bin, 'git'), gitWrapper); await writeFile(path.join(bin, 'gh'), ghWrapper);
  await chmod(path.join(bin, 'git'), 0o755); await chmod(path.join(bin, 'gh'), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}` };
  assert.equal(invokeWithEnv('sync', project, env, '--yes').status, 0);
  const local = path.join(project, '.agents/skills/example/SKILL.md');
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\nfirst PR edit\n');
  const first = invokeWithEnv('sync', project, env, '--yes', '--publish');
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  assert.equal(await readFile(path.join(temp, 'pr-created'), 'utf8'), '');
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\nupdated PR edit\n');
  const update = invokeWithEnv('sync', project, env, '--yes', '--publish');
  assert.equal(update.status, 0, `${update.stdout}\n${update.stderr}`);
  assert.match(await git(['--git-dir', bare, 'show', 'skills-sync/pr-test:skills/example/SKILL.md'], tempPath(seed)), /updated PR edit/);
  await git(['fetch', 'origin', 'skills-sync/pr-test'], seed);
  await git(['merge', '--ff-only', 'FETCH_HEAD'], seed);
  await git(['push', 'origin', 'main'], seed);
  const merged = invokeWithEnv('sync', project, env, '--yes');
  assert.equal(merged.status, 0, `${merged.stdout}\n${merged.stderr}`);
  assert.match(merged.stdout, /present in the source branch/);
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

test('requires an explicit deletion selection before publishing a removal', async t => {
  const { bare, project, seed } = await fixture(t);
  assert.equal(invoke('sync', project, '--yes').status, 0);
  const local = path.join(project, '.agents/skills/example/SKILL.md');
  await rm(local);
  const noChoice = invoke('sync', project, '--yes', '--publish');
  assert.notEqual(noChoice.status, 0);
  assert.match(await git(['--git-dir', bare, 'show', 'main:skills/example/SKILL.md'], tempPath(seed)), /name: example/);
  const accepted = invoke('sync', project, '--yes', '--publish', '--delete=example/SKILL.md');
  assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
  assert.notEqual(spawnSync('git', ['--git-dir', bare, 'show', 'main:skills/example/SKILL.md'], { encoding: 'utf8' }).status, 0);
});

test('override-main requires target confirmation and replaces only managed skill content', async t => {
  const { bare, seed, project } = await fixture(t);
  const configPath = path.join(project, '.agents/skills-sync.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.publication = { mode: 'override-main' };
  await writeFile(configPath, JSON.stringify(config));
  assert.equal(invoke('sync', project, '--yes').status, 0);
  const local = path.join(project, '.agents/skills/example/SKILL.md');
  await writeFile(local, '---\nname: example\ndescription: Test fixture\n---\nproject version\n');
  await writeFile(path.join(seed, 'skills/example/SKILL.md'), '---\nname: example\ndescription: Test fixture\n---\nsource version\n');
  await git(['add', '.'], seed); await git(['commit', '-m', 'source conflict'], seed); await git(['push'], seed);
  const target = `--override-target=${bare}@main`;
  const missing = invoke('sync', project, '--yes', '--publish', '--override-main');
  assert.notEqual(missing.status, 0);
  assert.match(await git(['--git-dir', bare, 'show', 'main:skills/example/SKILL.md'], tempPath(seed)), /source version/);
  const accepted = invoke('sync', project, '--yes', '--publish', '--override-main', target);
  assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
  assert.match(await git(['--git-dir', bare, 'show', 'main:skills/example/SKILL.md'], tempPath(seed)), /project version/);
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
