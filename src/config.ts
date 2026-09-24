import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type Direction = 'bidirectional' | 'pull' | 'push';
export type Publication = 'local-commit' | 'branch' | 'pull-request' | 'main' | 'override-main';
export interface Config {
  version: 1;
  source: { repository: string; branch: string; path: string };
  target: { path: string };
  selection: string[];
  direction: Direction;
  agents: string[];
  publication: { mode: Publication; branch?: string };
}
export const configPath = (root: string) => path.join(root, '.agents', 'skills-sync.json');

export function safePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value) ||
      value.split('/').some(p => !p || p === '.' || p === '..') || /^[A-Za-z]:/.test(value)) {
    throw new Error(`${label} must be a safe relative POSIX path`);
  }
  return value;
}

export function validateConfig(input: unknown): Config {
  if (!input || typeof input !== 'object') throw new Error('Configuration must be an object');
  const c = input as Record<string, any>;
  if (c.version !== 1) throw new Error('Unsupported configuration version; expected version 1');
  if (!c.source || typeof c.source.repository !== 'string' || !c.source.repository.trim()) throw new Error('Missing source.repository');
  if (typeof c.source.branch !== 'string' || !/^[\w][\w.\/-]*$/.test(c.source.branch) || c.source.branch.includes('..')) throw new Error('Invalid source.branch');
  safePath(c.source.path, 'source.path');
  safePath(c.target?.path, 'target.path');
  if (!Array.isArray(c.selection) || !c.selection.every((s: unknown) => typeof s === 'string' && /^[\w-]+$/.test(s)) || new Set(c.selection).size !== c.selection.length) throw new Error('selection must contain unique skill names');
  if (!['bidirectional', 'pull', 'push'].includes(c.direction)) throw new Error('Invalid direction');
  if (!Array.isArray(c.agents) || !c.agents.every((s: unknown) => typeof s === 'string')) throw new Error('Invalid agents');
  if (!['local-commit', 'branch', 'pull-request', 'main', 'override-main'].includes(c.publication?.mode)) throw new Error('Invalid publication mode');
  if (['branch', 'pull-request'].includes(c.publication.mode) && (!c.publication.branch || c.publication.branch === c.source.branch)) throw new Error('Publication needs a non-source branch');
  return c as Config;
}

export async function loadConfig(root: string): Promise<Config> {
  try { return validateConfig(JSON.parse(await readFile(configPath(root), 'utf8'))); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('No .agents/skills-sync.json; run skills-sync init');
    throw e;
  }
}
