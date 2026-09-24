import assert from 'node:assert/strict';
import test from 'node:test';
import { bumpOf, countedCommits, highestStable, increment, planRelease, recoveryVersion } from './release-version.mjs';

const commit = (subject, parents = ['p']) => ({ sha: `sha-${subject}`, parents, subject });

test('markers are found anywhere in the subject, in any case, and the largest wins', () => {
  assert.equal(bumpOf('[patch] Fix typo'), 'patch');
  assert.equal(bumpOf('Fix typo [PATCH]'), 'patch');
  assert.equal(bumpOf('[Minor] Add flag'), 'minor');
  assert.equal(bumpOf('[patch] Fix [major] edge'), 'major');
  assert.equal(bumpOf('Add flag'), 'minor');
});

test('merge commits and [skip ci] commits do not count', () => {
  const kept = countedCommits([commit('[patch] A'), commit('Merge branch x', ['p1', 'p2']), commit('Prepare npmjs release 0.3.1 [skip ci]'), commit('B [Skip CI]')]);
  assert.deepEqual(kept.map(c => c.subject), ['[patch] A']);
});

test('baseline is the highest stable vX.Y.Z tag; prerelease and malformed tags are ignored', () => {
  assert.equal(highestStable(['v0.3.0', 'v0.3.1', 'v0.10.0-beta.1', 'v1.0', 'release-2', 'v0.2.10']), '0.3.1');
  assert.equal(highestStable(['v0.10.0', 'v0.9.9']), '0.10.0');
  assert.equal(highestStable([]), null);
});

test('SemVer increments reset lower parts, including below 1.0.0', () => {
  assert.equal(increment('0.3.1', 'patch'), '0.3.2');
  assert.equal(increment('0.3.1', 'minor'), '0.4.0');
  assert.equal(increment('0.3.1', 'major'), '1.0.0');
});

const base = { channel: 'latest', tags: ['v0.3.1'], npmVersions: ['0.3.0', '0.3.1'] };

test('[patch] commits give a patch release', () => {
  assert.equal(planRelease({ ...base, commits: [commit('[patch] A'), commit('[patch] B')] }).version, '0.3.2');
});

test('an unmarked commit makes the release minor', () => {
  assert.equal(planRelease({ ...base, commits: [commit('[patch] A'), commit('B')] }).version, '0.4.0');
});

test('major beats minor beats patch across commits', () => {
  assert.equal(planRelease({ ...base, commits: [commit('[minor] A'), commit('[major] B'), commit('[patch] C')] }).version, '1.0.0');
});

test('only merge and [skip ci] commits means nothing to release', () => {
  const plan = planRelease({ ...base, commits: [commit('Merge x', ['a', 'b']), commit('Prepare npmjs release 0.3.1 [skip ci]')] });
  assert.equal(plan.version, null);
  assert.equal(plan.baseline, '0.3.1');
});

test('beta numbering starts at 0 and follows the betas already on npmjs', () => {
  const beta = { ...base, channel: 'beta', commits: [commit('B')] };
  assert.equal(planRelease(beta).version, '0.4.0-beta.0');
  assert.equal(planRelease({ ...beta, npmVersions: [...base.npmVersions, '0.4.0-beta.0', '0.4.0-beta.1', '0.5.0-beta.7'] }).version, '0.4.0-beta.2');
});

test('npmjs ahead of the highest tag needs recovery and becomes the baseline', () => {
  assert.equal(recoveryVersion(['v0.3.1'], ['0.3.1', '0.3.2', '0.4.0-beta.0']), '0.3.2');
  assert.equal(recoveryVersion(['v0.3.1'], ['0.3.1']), null);
  assert.equal(recoveryVersion(['v0.3.2'], ['0.3.1']), null);
  assert.equal(planRelease({ ...base, npmVersions: ['0.3.2'], commits: [commit('[patch] A')] }).baseline, '0.3.2');
});

test('no stable tag or npmjs version fails', () => {
  assert.throws(() => planRelease({ channel: 'latest', tags: [], npmVersions: [], commits: [commit('A')] }), /initial v<major>\.<minor>\.<patch> tag/);
  assert.throws(() => planRelease({ ...base, channel: 'next', commits: [] }), /Unknown channel next/);
});
