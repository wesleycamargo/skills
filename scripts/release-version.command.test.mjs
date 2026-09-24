import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./release-version.mjs', import.meta.url));

/** A repository tagged v0.3.1, with a bare origin and a mock npm on PATH. */
function fixture(t, subjects) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'release-version-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'), remote = path.join(temp, 'origin.git'), bin = path.join(temp, 'bin');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  mkdirSync(repo); mkdirSync(bin);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('remote', 'add', 'origin', remote);
  writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: '@example/pkg', version: '0.0.0-development' }, null, 2) + '\n');
  writeFileSync(path.join(repo, 'package-lock.json'), JSON.stringify({ name: '@example/pkg', version: '0.0.0-development', lockfileVersion: 3, packages: { '': { name: '@example/pkg', version: '0.0.0-development' } } }, null, 2) + '\n');
  git('add', '.'); git('commit', '-q', '-m', 'Initial');
  git('tag', '-a', 'v0.3.1', '-m', 'Release 0.3.1');
  for (const subject of subjects) git('commit', '-q', '--allow-empty', '-m', subject);
  writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env bash
if [[ "$1" == view && "$3" == versions ]]; then
  [[ "$MOCK_VERSIONS" == 404 ]] && { echo "npm error code E404" >&2; exit 1; }
  [[ "$MOCK_VERSIONS" == broken ]] && { echo "npm error code ETIMEDOUT" >&2; exit 1; }
  echo "\${MOCK_VERSIONS:-[\\"0.3.1\\"]}"; exit 0
fi
if [[ "$1" == view && "$3" == gitHead ]]; then echo "$MOCK_GITHEAD"; exit 0; fi
echo "unexpected npm $*" >&2; exit 2
`);
  chmodSync(path.join(bin, 'npm'), 0o755);
  const run = (args, env = {}) => spawnSync(process.execPath, [script, ...args], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: '', ...env },
  });
  return { repo, remote, temp, git, run };
}

test('preview prints the next version and the counted commits without changing anything', t => {
  const { git, run } = fixture(t, ['[patch] A', 'Prepare npmjs release 0.3.1 [skip ci]', '[patch] B']);
  const result = run(['preview']);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.split('\n');
  assert.equal(lines[0], '0.3.2');
  assert.match(result.stdout, /baseline: 0\.3\.1 \(v0\.3\.1\)/);
  assert.match(result.stdout, /patch +[0-9a-f]{7} \[patch\] A/);
  assert.doesNotMatch(result.stdout, /Prepare npmjs release/);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(git('tag', '--list'), 'v0.3.1');
});

test('preview for beta numbers after the betas on npmjs', t => {
  const { run } = fixture(t, ['B']);
  const result = run(['preview', '--channel', 'beta'], { MOCK_VERSIONS: '["0.3.1","0.4.0-beta.0","0.4.0-beta.1"]' });
  assert.equal(result.stdout.split('\n')[0], '0.4.0-beta.2', result.stderr);
});

test('apply sets the version in package.json and package-lock.json only, and writes it to GITHUB_OUTPUT', t => {
  const { repo, temp, git, run } = fixture(t, ['[patch] A']);
  const output = path.join(temp, 'github-output');
  writeFileSync(output, '');
  const result = run(['apply'], { GITHUB_OUTPUT: output });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).version, '0.3.2');
  const lock = JSON.parse(readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, '0.3.2'); assert.equal(lock.packages[''].version, '0.3.2');
  assert.match(readFileSync(path.join(repo, 'package.json'), 'utf8'), /^\{\n  "name"[\s\S]*\}\n$/);
  assert.deepEqual(git('status', '--porcelain').split('\n').map(line => line.trim()).sort(), ['M package-lock.json', 'M package.json']);
  assert.equal(readFileSync(output, 'utf8'), 'version=0.3.2\n');
});

test('nothing to release prints none and writes version=none', t => {
  const { temp, run } = fixture(t, ['Merge-free [skip ci] release']);
  const output = path.join(temp, 'github-output');
  writeFileSync(output, '');
  const result = run(['apply'], { GITHUB_OUTPUT: output });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'none');
  assert.match(result.stdout, /Nothing to release since v0\.3\.1/);
  assert.equal(readFileSync(output, 'utf8'), 'version=none\n');
});

test('apply recovers a missing tag from the npmjs gitHead and starts from it', t => {
  const { git, run } = fixture(t, ['[patch] Released but untagged', '[patch] After']);
  const released = git('rev-parse', 'HEAD~1');
  const result = run(['apply'], { MOCK_VERSIONS: '["0.3.1","0.3.2"]', MOCK_GITHEAD: released });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], '0.3.3');
  assert.equal(git('rev-list', '-n', '1', 'v0.3.2'), released);
  assert.equal(git('ls-remote', '--tags', 'origin', 'v0.3.2').split(/\s/)[1], 'refs/tags/v0.3.2');
});

test('preview reports recovery without tagging', t => {
  const { git, run } = fixture(t, ['[patch] Released but untagged']);
  const result = run(['preview'], { MOCK_VERSIONS: '["0.3.2"]', MOCK_GITHEAD: git('rev-parse', 'HEAD') });
  assert.equal(result.stdout.split('\n')[0], 'none', result.stderr);
  assert.match(result.stdout, /recovery: would tag v0\.3\.2 at [0-9a-f]{7}/);
  assert.equal(git('tag', '--list'), 'v0.3.1');
});

test('recovery fails before publishing when npmjs has no known gitHead', t => {
  const { git, run } = fixture(t, ['[patch] A']);
  const result = run(['apply'], { MOCK_VERSIONS: '["0.3.2"]', MOCK_GITHEAD: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npmjs has 0\.3\.2 but no v0\.3\.2 tag.*git tag -a v0\.3\.2/s);
  assert.equal(JSON.parse(readFileSync(path.join(git('rev-parse', '--show-toplevel'), 'package.json'), 'utf8')).version, '0.0.0-development');
});

test('a registry failure other than 404 stops the run; 404 means no versions', t => {
  const { run } = fixture(t, ['[patch] A']);
  const broken = run(['preview'], { MOCK_VERSIONS: 'broken' });
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /Cannot read npmjs versions/);
  assert.equal(run(['preview'], { MOCK_VERSIONS: '404' }).stdout.split('\n')[0], '0.3.2');
});

test('tag creates and pushes an annotated release tag, and refuses an existing one', t => {
  const { git, run } = fixture(t, ['[patch] A']);
  const result = run(['tag', '0.3.2']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git('cat-file', '-t', 'v0.3.2'), 'tag');
  assert.equal(git('rev-list', '-n', '1', 'v0.3.2'), git('rev-parse', 'HEAD'));
  assert.match(git('ls-remote', '--tags', 'origin'), /refs\/tags\/v0\.3\.2/);
  const again = run(['tag', '0.3.2']);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /Tag v0\.3\.2 already exists/);
});
