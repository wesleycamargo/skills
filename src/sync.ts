import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rm, lstat, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { Config, safePath } from './config.js';

export type Files = Record<string, string>;
export interface State { version: 1; repository: string; branch: string; sourcePath: string; targetPath: string; skills: Record<string, Files> }
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
  for (const entry of entries) if (entry.isDirectory() && /^[\w-]+$/.test(entry.name)) {
    try { if ((await lstat(path.join(root, directory, entry.name, 'SKILL.md'))).isFile()) names.push(entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return names.sort();
}

export async function inventory(root: string, directory: string, skill: string): Promise<Files> {
  safePath(skill, 'skill');
  await assertNoSymlinkPath(root, `${directory}/${skill}`);
  return walk(path.join(root, directory, skill));
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
      if (left !== undefined) await writeFile(leftPath, Buffer.from(left, 'base64'));
      if (right !== undefined) await writeFile(rightPath, Buffer.from(right, 'base64'));
      try {
        const { stdout } = await exec('git', ['diff', '--no-index', '--no-prefix', left === undefined ? '/dev/null' : leftPath, right === undefined ? '/dev/null' : rightPath], { maxBuffer: 10 * 1024 * 1024 });
        if (stdout) output.push(stdout.replaceAll(leftPath, leftName).replaceAll(rightPath, rightName));
      } catch (error) {
        const diff = (error as Error & { stdout?: string }).stdout;
        if (diff) output.push(diff.replaceAll(leftPath, leftName).replaceAll(rightPath, rightName));
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
