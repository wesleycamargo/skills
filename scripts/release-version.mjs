#!/usr/bin/env node
// Computes the next release version from [major]/[minor]/[patch] commit markers.
// See sdlc/semver-release-bump/spec.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RANK = { patch: 1, minor: 2, major: 3 };
const STABLE = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** Largest marker in a commit subject; a subject with no marker counts as minor. */
export function bumpOf(subject) {
  const markers = [...subject.matchAll(/\[(major|minor|patch)\]/gi)].map(m => m[1].toLowerCase());
  return markers.length ? markers.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : 'minor';
}

/** Commits that count toward the bump: not merges, and not [skip ci] release commits. */
export function countedCommits(commits) {
  return commits.filter(c => c.parents.length <= 1 && !/\[skip ci\]/i.test(c.subject));
}

const parse = version => STABLE.exec(version)?.slice(1).map(Number);
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Highest stable version among tags (vX.Y.Z) or npm versions (X.Y.Z); others are ignored. */
export function highestStable(names) {
  const versions = names.map(parse).filter(Boolean).sort(compare);
  return versions.length ? versions.at(-1).join('.') : null;
}

export function increment(version, bump) {
  const [major, minor, patch] = parse(version);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Stable npm version that is ahead of every tag, meaning its tag push failed; null when tags are current. */
export function recoveryVersion(tags, npmVersions) {
  const tagged = highestStable(tags.filter(t => t.startsWith('v'))), published = highestStable(npmVersions.filter(v => !v.startsWith('v')));
  if (!published) return null;
  return !tagged || compare(parse(published), parse(tagged)) > 0 ? published : null;
}

/**
 * @param {{ channel: string, tags: string[], npmVersions: string[], commits: { sha: string, parents: string[], subject: string }[] }} input
 * commits are those after the baseline; the caller reads them after any tag recovery.
 */
export function planRelease({ channel, tags, npmVersions, commits }) {
  if (channel !== 'latest' && channel !== 'beta') throw new Error(`Unknown channel ${channel}; use latest or beta.`);
  const baseline = recoveryVersion(tags, npmVersions) ?? highestStable(tags.filter(t => t.startsWith('v')));
  if (!baseline) throw new Error('No stable release to start from. Create an initial v<major>.<minor>.<patch> tag on the last released commit.');
  const counted = countedCommits(commits).map(c => ({ ...c, bump: bumpOf(c.subject) }));
  if (!counted.length) return { baseline, bump: null, version: null, counted };
  const bump = counted.map(c => c.bump).reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  const next = increment(baseline, bump);
  if (channel === 'latest') return { baseline, bump, version: next, counted };
  const betas = npmVersions.map(v => new RegExp(`^${next.replace(/\./g, '\\.')}-beta\\.(\\d+)$`).exec(v)?.[1]).filter(Boolean).map(Number);
  return { baseline, bump, version: `${next}-beta.${betas.length ? Math.max(...betas) + 1 : 0}`, counted };
}

// Command: preview (default), apply, or tag <version>. Run from the repository root.
const REGISTRY = 'https://registry.npmjs.org';

function main(argv) {
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args) => run('git', args);
  const fail = message => { process.stderr.write(`Error: ${message}\n`); process.exit(1); };

  const mode = ['preview', 'apply', 'tag'].includes(argv[0]) ? argv.shift() : 'preview';
  const channelAt = argv.indexOf('--channel');
  const channel = channelAt >= 0 ? argv[channelAt + 1] : 'latest';
  const name = JSON.parse(readFileSync('package.json', 'utf8')).name;

  const pushTag = (version, ref) => {
    git('tag', '-a', `v${version}`, '-m', `Release ${version}`, ref);
    git('push', 'origin', `refs/tags/v${version}`);
  };

  if (mode === 'tag') {
    const version = argv[0];
    if (!version || !STABLE.test(version)) fail('tag needs a stable version, for example: tag 0.3.2');
    if (spawnOk('git', ['rev-parse', '-q', '--verify', `refs/tags/v${version}`])) fail(`Tag v${version} already exists; tags are never moved.`);
    pushTag(version, 'HEAD');
    console.log(`Tagged v${version} and pushed it to origin.`);
    return;
  }

  const tags = git('tag', '--list', 'v*').split('\n').filter(Boolean);
  for (const tag of tags) if (!STABLE.test(tag) && !/^v\d+\.\d+\.\d+-/.test(tag)) process.stderr.write(`Warning: ignoring tag ${tag}; it is not v<major>.<minor>.<patch>.\n`);

  let npmVersions;
  try { npmVersions = [JSON.parse(run('npm', ['view', name, 'versions', '--json', `--registry=${REGISTRY}`]))].flat(); }
  catch (error) {
    if (/E404/.test(String(error.stderr ?? error.message))) npmVersions = [];
    else fail(`Cannot read npmjs versions of ${name}; not publishing.`);
  }

  const recover = recoveryVersion(tags, npmVersions);
  let recoverSha;
  if (recover) {
    recoverSha = run('npm', ['view', `${name}@${recover}`, 'gitHead', `--registry=${REGISTRY}`]);
    if (!recoverSha || !spawnOk('git', ['cat-file', '-e', `${recoverSha}^{commit}`])) {
      fail(`npmjs has ${recover} but no v${recover} tag, and its source commit is unknown. Tag the released commit by hand:\n  git tag -a v${recover} -m "Release ${recover}" <commit> && git push origin refs/tags/v${recover}`);
    }
    if (mode === 'apply') pushTag(recover, recoverSha);
  }

  const baseline = recover ?? highestStable(tags);
  const log = baseline ? git('log', '--format=%H%x00%P%x00%s', `${recoverSha ?? `v${baseline}`}..HEAD`) : '';
  const commits = log.split('\n').filter(Boolean).map(line => {
    const [sha, parents, subject] = line.split('\0');
    return { sha, parents: parents.split(' ').filter(Boolean), subject };
  });
  let plan;
  try { plan = planRelease({ channel, tags, npmVersions, commits }); } catch (error) { fail(error.message); }

  console.log(plan.version ?? 'none');
  console.log(`baseline: ${plan.baseline} (v${plan.baseline})`);
  console.log(`channel: ${channel}`);
  console.log(`recovery: ${recover ? `${mode === 'apply' ? 'tagged' : 'would tag'} v${recover} at ${recoverSha.slice(0, 7)}` : 'none'}`);
  if (!plan.version) console.log(`Nothing to release since v${plan.baseline}.`);
  else for (const c of plan.counted) console.log(`  ${c.bump.padEnd(6)} ${c.sha.slice(0, 7)} ${c.subject}`);

  if (mode !== 'apply') return;
  if (plan.version) {
    for (const file of ['package.json', 'package-lock.json']) {
      const json = JSON.parse(readFileSync(file, 'utf8'));
      json.version = plan.version;
      if (json.packages?.['']) json.packages[''].version = plan.version;
      writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    }
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${plan.version ?? 'none'}\n`);
}

function spawnOk(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
