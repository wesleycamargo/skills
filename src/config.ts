import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type Direction = 'bidirectional' | 'pull' | 'push';
export type Publication = 'local-commit' | 'branch' | 'pull-request' | 'main' | 'override-main';
export interface Config {
  version: 1;
  source: { repository: string; branch: string; path: string };
  target: { path: string };
  /** Legacy explicit skill list; without it, every discovered skill not in .skillsignore is managed. */
  selection?: string[];
  direction: Direction;
  agents: string[];
  publication: { mode: Publication; branch?: string };
}
export const configPath = (root: string) => path.join(root, '.agents', 'skills-sync.json');

export function safePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value) ||
      value.split('/').some(p => !p || p === '.' || p === '..' || /[*?\[\]:]/.test(p)) || /^[A-Za-z]:/.test(value)) {
    throw new Error(`${label} must be a safe relative POSIX path`);
  }
  return value;
}

/** Field checks shared by validateConfig and the setup wizard; each returns an error message or undefined. */
/** A skill directory name that is safe to manage. */
export const validSkillName = (s: unknown): s is string =>
  typeof s === 'string' && s.trim() !== '' && s !== '.' && s !== '..' && !/[\\/\0-\x1f\x7f*?\[\]:]/.test(s);

export const fieldError = {
  repository: (value: unknown) => typeof value !== 'string' || !value.trim() ? 'Missing source.repository' : undefined,
  branch: (value: unknown) => typeof value !== 'string' || !/^[\w][\w.\/-]*$/.test(value) || value.includes('..') ? 'Invalid source.branch' : undefined,
  path: (value: unknown, label: string) => { try { safePath(value, label); return undefined; } catch (error) { return (error as Error).message; } },
  publicationBranch: (value: unknown, sourceBranch: string) => !value || value === sourceBranch ? 'Publication needs a non-source branch' : undefined,
};

export function validateConfig(input: unknown): Config {
  if (!input || typeof input !== 'object') throw new Error('Configuration must be an object');
  const c = input as Record<string, any>;
  if (c.version !== 1) throw new Error('Unsupported configuration version; expected version 1');
  if (!c.source) throw new Error('Missing source.repository');
  for (const error of [fieldError.repository(c.source.repository), fieldError.branch(c.source.branch)]) if (error) throw new Error(error);
  safePath(c.source.path, 'source.path');
  safePath(c.target?.path, 'target.path');
  if (c.selection !== undefined && (!Array.isArray(c.selection) || !c.selection.every(validSkillName) || new Set(c.selection).size !== c.selection.length)) throw new Error('selection must contain unique skill directory names');
  if (!['bidirectional', 'pull', 'push'].includes(c.direction)) throw new Error('Invalid direction');
  if (!Array.isArray(c.agents) || !c.agents.every((s: unknown) => typeof s === 'string')) throw new Error('Invalid agents');
  if (!['local-commit', 'branch', 'pull-request', 'main', 'override-main'].includes(c.publication?.mode)) throw new Error('Invalid publication mode');
  const publicationError = ['branch', 'pull-request'].includes(c.publication.mode) && fieldError.publicationBranch(c.publication.branch, c.source.branch);
  if (publicationError) throw new Error(publicationError);
  return c as Config;
}

export async function loadConfig(root: string): Promise<Config> {
  try { return validateConfig(JSON.parse(await readFile(configPath(root), 'utf8'))); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('No .agents/skills-sync.json; run skills-sync init');
    throw e;
  }
}
