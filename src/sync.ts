import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { Config, safePath } from './config.js';

export type Files = Record<string, string>;
export interface State { version: 1; repository: string; branch: string; skills: Record<string, Files> }
export type Change = { skill: string; file: string; before?: string; source?: string; local?: string; merged?: string; kind: 'pull' | 'push' | 'merge' | 'delete' | 'conflict' | 'same' };
const stateFile = (root: string) => path.join(root, '.agents', 'skills-sync-state.json');

export async function loadState(root: string, config: Config): Promise<State> {
  let state: State;
  try { state = JSON.parse(await readFile(stateFile(root), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state = { version: 1, repository: config.source.repository, branch: config.source.branch, skills: {} };
  }
  if (state.version !== 1 || state.repository !== config.source.repository || state.branch !== config.source.branch) throw new Error('Sync baseline does not match configured source; review or adopt it explicitly');
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
  return walk(path.join(root, directory, skill));
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

export async function applyFile(root: string, directory: string, change: Change, destination: 'source' | 'local', allowDelete: boolean): Promise<void> {
  const value = destination === 'source' ? change.local : change.source;
  const target = path.join(root, directory, change.skill, change.file);
  if (value === undefined) {
    if (!allowDelete) throw new Error(`Deletion requires --allow-delete: ${change.skill}/${change.file}`);
    await rm(target, { force: true });
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(value, 'base64'));
  }
}
