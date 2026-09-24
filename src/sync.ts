import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rm, lstat, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { Config, safePath, validSkillName } from './config.js';

export type Files = Record<string, string>;
export interface State {
  version: 1; repository: string; branch: string; sourcePath: string; targetPath: string; skills: Record<string, Files>;
  pending?: { branch: string; baseRevision: string; skills: Record<string, Files> };
}
export type Change = { skill: string; file: string; before?: string; source?: string; local?: string; merged?: string; kind: 'pull' | 'push' | 'merge' | 'delete' | 'conflict' | 'same' };
const stateFile = (root: string) => path.join(root, '.agents', 'skills-sync-state.json');

export async function loadState(root: string, config: Config): Promise<State> {
  let state: State;
  try { state = JSON.parse(await readFile(stateFile(root), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state = { version: 1, repository: config.source.repository, branch: config.source.branch, sourcePath: config.source.path, targetPath: config.target.path, skills: {} };
  }
  if (state.version !== 1 || state.repository !== config.source.repository || state.branch !== config.source.branch || state.sourcePath !== config.source.path || state.targetPath !== config.target.path) throw new Error('Sync baseline does not match configured source or paths; review or adopt it explicitly');
  return state;
}

export async function saveState(root: string, state: State): Promise<void> {
  await mkdir(path.dirname(stateFile(root)), { recursive: true });
  await writeFile(stateFile(root), JSON.stringify(state, null, 2) + '\n');
}

async function walk(dir: string, prefix = ''): Promise<Files> {
  const files: Files = {};
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return files; throw error; }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink in skill: ${path.join(dir, entry.name)}`);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await walk(path.join(dir, entry.name), name));
    else if (entry.isFile()) files[name] = (await readFile(path.join(dir, entry.name))).toString('base64');
  }
  return files;
}

export async function discover(root: string, directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(path.join(root, directory), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const names: string[] = [];
  for (const entry of entries) if (entry.isDirectory() && entry.name.trim() !== '' && !/[\\/\0-\x1f\x7f]/.test(entry.name)) {
    try { if ((await lstat(path.join(root, directory, entry.name, 'SKILL.md'))).isFile()) names.push(entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return names.sort();
}

/** Skill-name patterns from .skillsignore text: one per line, `#` comments, `*` and `?` wildcards. */
export function parseSkillsIgnore(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim().replace(/\/+$/, '')).filter(line => line && !line.startsWith('#'));
}

export function isIgnored(skill: string, patterns: string[]): boolean {
  return patterns.some(pattern => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(skill));
}

/** Patterns from `<root>/.skillsignore`; a missing file ignores nothing, and a symlink is refused. */
export async function readSkillsIgnore(root: string): Promise<string[]> {
  const file = path.join(root, '.skillsignore');
  try { if (!(await lstat(file)).isFile()) throw new Error('.skillsignore must be a regular file, not a symlink or directory'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return parseSkillsIgnore(await readFile(file, 'utf8'));
}

/**
 * Skills managed when no explicit selection is saved: everything in the source, the project, and the
 * baseline, minus .skillsignore. One-sided skills that were never synced are skipped when the direction
 * could not sync them.
 */
export function resolveSkills({ source, project, baseline, ignore, direction }: {
  source: string[]; project: string[]; baseline: string[]; ignore: string[]; direction: Config['direction'];
}): { skills: string[]; skipped: { skill: string; side: 'project' | 'source' }[]; invalid: string[] } {
  const skills: string[] = [], skipped: { skill: string; side: 'project' | 'source' }[] = [], invalid: string[] = [];
  for (const skill of [...new Set([...source, ...project, ...baseline])].sort()) {
    if (isIgnored(skill, ignore)) continue;
    if (!validSkillName(skill)) { invalid.push(skill); continue; }
    const known = baseline.includes(skill);
    if (!known && direction === 'pull' && !source.includes(skill)) skipped.push({ skill, side: 'project' });
    else if (!known && direction === 'push' && !project.includes(skill)) skipped.push({ skill, side: 'source' });
    else skills.push(skill);
  }
  return { skills, skipped, invalid };
}

/** Single-line `description:` from a skill's SKILL.md frontmatter, for display only. Symlinks are not followed. */
export async function readSkillDescription(root: string, directory: string, skill: string): Promise<string | undefined> {
  let file: string;
  try { file = path.join(root, directory, safePath(skill, 'skill'), 'SKILL.md'); } catch { return undefined; }
  try { if (!(await lstat(file)).isFile()) return undefined; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(await readFile(file, 'utf8'))?.[1];
  const value = frontmatter?.match(/^description:[ \t]*(.*?)[ \t]*$/m)?.[1];
  if (!value || /^[|>]/.test(value)) return undefined;
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

export async function inventory(root: string, directory: string, skill: string): Promise<Files> {
  safePath(skill, 'skill');
  await assertNoSymlinkPath(root, `${directory}/${skill}`);
  return walk(path.join(root, directory, skill));
}

export function sameFiles(left: Files | undefined, right: Files | undefined): boolean {
  if (!left || !right) return left === right;
  const a = Object.keys(left).sort(), b = Object.keys(right).sort();
  return a.length === b.length && a.every((key, index) => key === b[index] && left[key] === right[key]);
}

async function assertNoSymlinkPath(root: string, relative: string): Promise<void> {
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing to follow symlink: ${current}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
}

export function hash(value: string | undefined): string { return value === undefined ? 'absent' : createHash('sha256').update(value).digest('hex').slice(0, 12); }

export function planSkill(skill: string, base: Files | undefined, local: Files, source: Files, direction: Config['direction']): Change[] {
  const changes: Change[] = [];
  for (const file of [...new Set([...Object.keys(base ?? {}), ...Object.keys(local), ...Object.keys(source)])].sort()) {
    const before = base?.[file], l = local[file], s = source[file];
    if (l === s) continue;
    let kind: Change['kind'];
    if (!base) kind = l === undefined ? 'pull' : s === undefined ? 'push' : 'conflict';
    else if (l === before) kind = s === undefined ? 'delete' : 'pull';
    else if (s === before) kind = l === undefined ? 'delete' : 'push';
    else kind = 'conflict';
    if ((kind === 'pull' && direction === 'push') || (kind === 'push' && direction === 'pull')) kind = 'conflict';
    changes.push({ skill, file, before, local: l, source: s, kind });
  }
  return changes;
}

const exec = promisify(execFile);
export async function tryMerge(change: Change): Promise<Change> {
  if (change.kind !== 'conflict' || change.before === undefined || change.local === undefined || change.source === undefined) return change;
  const decoded = [change.local, change.before, change.source].map(s => Buffer.from(s, 'base64'));
  if (decoded.some(b => b.includes(0) || !Buffer.from(b.toString('utf8'), 'utf8').equals(b))) return change;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skills-merge-'));
  try {
    const names = ['local', 'base', 'source'].map(n => path.join(dir, n));
    await Promise.all(names.map((name, i) => writeFile(name, decoded[i])));
    const { stdout } = await exec('git', ['merge-file', '--stdout', names[0], names[1], names[2]], { maxBuffer: 10 * 1024 * 1024 });
    return { ...change, kind: 'merge', merged: Buffer.from(stdout).toString('base64') };
  } catch { return change; }
  finally { await rm(dir, { recursive: true, force: true }); }
}

export async function formatDiff(change: Change): Promise<string> {
  const versions: Array<[string, string | undefined]> = [['baseline', change.before], ['project', change.local], ['source', change.source]];
  const present = versions.filter((entry): entry is [string, string] => entry[1] !== undefined);
  if (present.some(([, value]) => {
    const b = Buffer.from(value, 'base64');
    return b.includes(0) || !Buffer.from(b.toString('utf8')).equals(b);
  })) return `  [binary content] baseline=${hash(change.before)} project=${hash(change.local)} source=${hash(change.source)}\n`;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'skills-diff-'));
  const output: string[] = [];
  try {
    const pairs: Array<[string, string | undefined, string, string | undefined]> = change.before === undefined
      ? [['/dev/null', undefined, 'project', change.local], ['/dev/null', undefined, 'source', change.source]]
      : [['baseline', change.before, 'project', change.local], ['baseline', change.before, 'source', change.source]];
    for (let i = 0; i < pairs.length; i++) {
      const [leftName, left, rightName, right] = pairs[i];
      if (left === right) continue;
      const leftPath = path.join(dir, `left-${i}`), rightPath = path.join(dir, `right-${i}`);
      await Promise.all([
        writeFile(leftPath, left === undefined ? Buffer.alloc(0) : Buffer.from(left, 'base64')),
        writeFile(rightPath, right === undefined ? Buffer.alloc(0) : Buffer.from(right, 'base64'))
      ]);
      try {
        const { stdout } = await exec('git', ['diff', '--no-index', '--no-prefix', leftPath, rightPath], { maxBuffer: 10 * 1024 * 1024 });
        if (stdout) output.push(stdout.replaceAll(leftPath, left === undefined ? '/dev/null' : leftName).replaceAll(rightPath, right === undefined ? '/dev/null' : rightName));
      } catch (error) {
        const diff = (error as Error & { stdout?: string }).stdout;
        if (diff) output.push(diff.replaceAll(leftPath, left === undefined ? '/dev/null' : leftName).replaceAll(rightPath, right === undefined ? '/dev/null' : rightName));
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
  return output.join('') || '  No text diff available.\n';
}

export async function applyFile(root: string, directory: string, change: Change, destination: 'source' | 'local', allowDelete: boolean): Promise<void> {
  const value = change.kind === 'merge' ? change.merged : destination === 'source' ? change.local : change.source;
  const relative = `${directory}/${change.skill}/${change.file}`;
  await assertNoSymlinkPath(root, relative);
  const target = path.join(root, ...relative.split('/'));
  if (value === undefined) {
    if (!allowDelete) throw new Error(`Deletion requires --allow-delete: ${change.skill}/${change.file}`);
    await rm(target, { force: true });
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(value, 'base64'));
  }
}
