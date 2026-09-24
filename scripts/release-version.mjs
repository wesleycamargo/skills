#!/usr/bin/env node
// Computes the next release version from [major]/[minor]/[patch] commit markers.
// See sdlc/semver-release-bump/spec.md.

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
