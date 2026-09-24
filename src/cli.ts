#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkout, head, run } from './git.js';
import { Config, configPath, loadConfig, validateConfig } from './config.js';
import { applyFile, Change, discover, hash, inventory, loadState, planSkill, saveState, tryMerge } from './sync.js';

const root = process.cwd();
const cmd = process.argv[2] || (stdin.isTTY ? 'init' : 'status');
const flags = new Set(process.argv.slice(3));
const confirmed = flags.has('--yes');
const publish = flags.has('--publish');

async function prompt(question: string, defaultValue = ''): Promise<string> {
  if (!stdin.isTTY) throw new Error(`Interactive input required: ${question}`);
  const rl = createInterface({ input: stdin, output: stdout });
  try { return (await rl.question(`${question}${defaultValue ? ` [${defaultValue}]` : ''}: `)).trim() || defaultValue; }
  finally { rl.close(); }
}

async function init(): Promise<void> {
  let old: Config | undefined;
  try { old = await loadConfig(root); } catch { /* First setup. */ }
  const repository = await prompt('Skills Git URL or local checkout', old?.source.repository);
  const branch = await prompt('Source branch', old?.source.branch || 'main');
  const sourcePath = await prompt('Source skills directory', old?.source.path || 'skills');
  const targetPath = await prompt('Project skills directory', old?.target.path || '.agents/skills');
  const checkoutInfo = await checkout(repository, branch);
  let available: string[];
  try { available = await discover(checkoutInfo.dir, sourcePath); }
  finally { await checkoutInfo.cleanup(); }
  if (!available.length) throw new Error(`No skills with SKILL.md found in ${sourcePath}`);
  console.log(`Available: ${available.join(', ')}`);
  const selected = await prompt('Skills (comma separated, * for all)', old?.selection.join(',') || '*');
  const selection = selected === '*' ? available : selected.split(',').map(s => s.trim()).filter(Boolean);
  if (selection.some(s => !available.includes(s))) throw new Error('Selection contains a skill absent from source');
  const direction = await prompt('Direction (bidirectional/pull/push)', old?.direction || 'bidirectional');
  const agents = (await prompt('Agents (comma separated, blank to skip)', old?.agents.join(',') || '')).split(',').map(s => s.trim()).filter(Boolean);
  if (agents.length) throw new Error('Agent installation is still under development. Leave agents blank for this draft.');
  const mode = await prompt('Publish mode (local-commit/branch/pull-request/main/override-main)', old?.publication.mode || 'local-commit');
  const publicationBranch = ['branch', 'pull-request'].includes(mode) ? await prompt('Publication branch', old?.publication.branch || 'skills-sync/update') : undefined;
  const config = validateConfig({ version: 1, source: { repository, branch, path: sourcePath }, target: { path: targetPath }, selection, direction, agents, publication: { mode, branch: publicationBranch } });
  console.log(JSON.stringify(config, null, 2));
  if ((await prompt('Save this configuration? (yes/no)', 'no')).toLowerCase() !== 'yes') return;
  await mkdir(path.dirname(configPath(root)), { recursive: true });
  await writeFile(configPath(root), JSON.stringify(config, null, 2) + '\n');
  console.log(`Saved ${configPath(root)}. Run skills-sync sync to preview changes.`);
}

function summary(changes: Change[]): void {
  if (!changes.length) { console.log('No changes.'); return; }
  for (const c of changes) console.log(`${c.kind.padEnd(9)} ${c.skill}/${c.file} local:${hash(c.local)} source:${hash(c.source)} baseline:${hash(c.before)}`);
}

async function ensureFresh(dir: string, original: string, branch: string): Promise<void> {
  await run('git', ['fetch', '--quiet', 'origin', branch], dir);
  if (await run('git', ['rev-parse', `origin/${branch}`], dir) !== original) throw new Error('Source branch advanced. Run status and retry; no publication was attempted.');
}

async function publication(dir: string, config: Config, original: string): Promise<void> {
  const mode = config.publication.mode;
  const changed = await run('git', ['status', '--porcelain'], dir);
  if (!changed) return;
  await ensureFresh(dir, original, config.source.branch);
  for (const skill of config.selection) await run('git', ['add', '--', `${config.source.path}/${skill}`], dir);
  if (!(await run('git', ['diff', '--cached', '--name-only'], dir))) return;
  if (['branch', 'pull-request'].includes(mode)) {
    const remoteBranch = await run('git', ['ls-remote', '--heads', 'origin', config.publication.branch!], dir);
    if (remoteBranch) {
      await run('git', ['fetch', '--quiet', 'origin', config.publication.branch!], dir);
      const differences = await run('git', ['diff', '--name-only', `FETCH_HEAD`, '--', config.source.path], dir);
      if (!differences) {
        console.log(`Existing ${config.publication.branch} already contains the selected content.`);
        return;
      }
      throw new Error(`Publication branch ${config.publication.branch} has other content; inspect it before updating.`);
    }
    await run('git', ['switch', '-c', config.publication.branch!], dir);
  }
  await run('git', ['-c', 'user.name=skills-sync', '-c', 'user.email=skills-sync@users.noreply.github.com', 'commit', '-m', 'Sync selected skills'], dir);
  if (mode === 'local-commit') { console.log(`Commit kept in temporary checkout ${dir}`); return; }
  const branch = ['branch', 'pull-request'].includes(mode) ? config.publication.branch! : config.source.branch;
  await run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], dir);
  if (mode === 'pull-request') {
    const url = config.source.repository;
    if (!/github\.com[:/][^/]+\/[^/]+(?:\.git)?$/.test(url)) throw new Error('Pull request mode currently requires a GitHub remote');
    const existing = await run('gh', ['pr', 'list', '--head', branch, '--base', config.source.branch, '--json', 'number', '--jq', '.[0].number // empty'], dir);
    if (!existing) await run('gh', ['pr', 'create', '--head', branch, '--base', config.source.branch, '--title', 'Sync selected skills', '--body', 'Synchronize configured skills from a project.'], dir);
  }
}

async function execute(): Promise<void> {
  const config = await loadConfig(root);
  if (cmd === 'pull' && config.direction === 'push') throw new Error('Project is configured push-only');
  if (cmd === 'push' && config.direction === 'pull') throw new Error('Project is configured pull-only');
  const source = await checkout(config.source.repository, config.source.branch);
  let keepCheckout = false;
  try {
    const original = await head(source.dir);
    const state = await loadState(root, config);
    const changes: Change[] = [];
    for (const skill of config.selection) {
      const [local, upstream] = await Promise.all([inventory(root, config.target.path, skill), inventory(source.dir, config.source.path, skill)]);
      for (const change of planSkill(skill, state.skills[skill], local, upstream, config.direction)) changes.push(config.direction === 'bidirectional' ? await tryMerge(change) : change);
    }
    summary(changes);
    if (cmd === 'status' || cmd === 'diff') return;
    const override = config.publication.mode === 'override-main' && flags.has('--override-main') && confirmed &&
      flags.has(`--override-target=${config.source.repository}@${config.source.branch}`);
    const deletionChoices = new Set([...flags].filter(f => f.startsWith('--delete=')).map(f => f.slice('--delete='.length)));
    const deletions = changes.filter(c => c.kind === 'delete' && deletionChoices.has(`${c.skill}/${c.file}`) &&
      (c.local === undefined ? config.direction !== 'pull' && cmd !== 'pull' : config.direction !== 'push' && cmd !== 'push'));
    const replacements = override ? changes.filter(c => c.kind === 'conflict' && c.local !== undefined) : [];
    const applicable = [...changes.filter(c => cmd === 'pull' ? c.kind === 'pull' : cmd === 'push' ? c.kind === 'push' : c.kind === 'pull' || c.kind === 'push' || c.kind === 'merge'), ...deletions, ...replacements];
    const conflicts = changes.filter(c => (c.kind === 'conflict' || c.kind === 'delete') && !applicable.includes(c));
    if (conflicts.length) throw new Error(`${conflicts.length} conflict or deletion proposals; resolve these before applying.`);
    if (replacements.length) for (const c of replacements) console.log(`OVERRIDE ${c.skill}/${c.file}: source ${hash(c.source)} becomes local ${hash(c.local)} in ${config.source.repository}@${config.source.branch}`);
    if (!applicable.length) {
      if (cmd === 'sync' && changes.length === 0) {
        for (const skill of config.selection) state.skills[skill] = await inventory(root, config.target.path, skill);
        await saveState(root, state);
      }
      return;
    }
    const writesSource = applicable.some(c => c.kind === 'push' || c.kind === 'merge' || replacements.includes(c) || (deletions.includes(c) && c.local === undefined));
    if (writesSource && !publish) throw new Error('Local changes need source publication; preview only. Rerun with --publish after review.');
    if (config.publication.mode === 'override-main' && writesSource && !override) throw new Error(`Override requires --yes --override-main --override-target=${config.source.repository}@${config.source.branch}`);
    if (!confirmed && (await prompt('Apply the listed changes? (yes/no)', 'no')).toLowerCase() !== 'yes') return;
    await ensureFresh(source.dir, original, config.source.branch);
    for (const change of applicable) {
      const localWrite = change.kind === 'pull' || change.kind === 'merge' || (deletions.includes(change) && change.source === undefined);
      const sourceWrite = change.kind === 'push' || change.kind === 'merge' || replacements.includes(change) || (deletions.includes(change) && change.local === undefined);
      if (localWrite) await applyFile(root, config.target.path, change, 'local', deletions.includes(change));
      if (sourceWrite) await applyFile(source.dir, config.source.path, change, 'source', deletions.includes(change));
    }
    if (writesSource) await publication(source.dir, config, original);
    if (config.publication.mode !== 'pull-request' && config.publication.mode !== 'branch' && config.publication.mode !== 'local-commit') {
      for (const skill of config.selection) state.skills[skill] = await inventory(root, config.target.path, skill);
      await saveState(root, state);
    } else if (!applicable.some(c => c.kind === 'push')) {
      for (const skill of config.selection) state.skills[skill] = await inventory(root, config.target.path, skill);
      await saveState(root, state);
    }
    if (config.publication.mode === 'local-commit' && writesSource) keepCheckout = true;
  } finally { if (!keepCheckout) await source.cleanup(); }
}

try {
  if (cmd === 'init' || cmd === 'configure') await init();
  else if (['status', 'diff', 'pull', 'push', 'sync'].includes(cmd)) await execute();
  else throw new Error(`Unknown command ${cmd}`);
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
