#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, writeFile, readdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { checkout, head, run } from './git.js';
import { Config, configPath, loadConfig, validateConfig } from './config.js';
import { applyFile, Change, discover, formatDiff, hash, inventory, loadState, planSkill, sameFiles, saveState, State, tryMerge } from './sync.js';

const root = process.cwd();
const cmd = process.argv[2] || (stdin.isTTY ? 'init' : 'status');
const flags = new Set(process.argv.slice(3));
const confirmed = flags.has('--yes');
const publish = flags.has('--publish');
const require = createRequire(import.meta.url);

async function prompt(question: string, defaultValue = ''): Promise<string> {
  if (!stdin.isTTY) throw new Error(`Interactive input required: ${question}`);
  const rl = createInterface({ input: stdin, output: stdout });
  try { return (await rl.question(`${question}${defaultValue ? ` [${defaultValue}]` : ''}: `)).trim() || defaultValue; }
  finally { rl.close(); }
}

async function locateAgentSkillDirs(dir: string, prefix = ''): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try { entries = await readdir(path.join(dir, prefix), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return found; throw error; }
  for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink()) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.name === 'skills' && rel !== '.agents/skills') found.push(rel);
    else if (rel !== '.git' && !rel.startsWith('.git/')) found.push(...await locateAgentSkillDirs(dir, rel));
  }
  return found;
}

async function installAgents(config: Config, sourceRoot: string): Promise<void> {
  if (!config.agents.length) return;
  if (config.target.path !== '.agents/skills') throw new Error('Agent installation currently requires target.path=.agents/skills');
  const stage = await mkdtemp(path.join(os.tmpdir(), 'skills-install-'));
  try {
    await run('git', ['init', '-q'], stage);
    const cli = require.resolve('skills/bin/cli.mjs');
    const args = [cli, 'add', path.join(sourceRoot, config.source.path), ...config.selection.flatMap(skill => ['--skill', skill]),
      ...config.agents.flatMap(agent => ['--agent', agent]), '--copy', '--yes'];
    await run(process.execPath, args, stage);
    const dirs = await locateAgentSkillDirs(stage);
    const installs: Array<{ destination: string; skill: string; desired: Record<string, string> }> = [];
    for (const directory of dirs) for (const skill of config.selection) {
      const desired = await inventory(stage, directory, skill);
      if (!Object.keys(desired).length) continue;
      const current = await inventory(root, directory, skill);
      if (Object.keys(current).length && !sameFiles(current, desired))
        throw new Error(`Agent copy ${directory}/${skill} has local edits; resolve them before reinstalling.`);
      installs.push({ destination: directory, skill, desired });
    }
    for (const item of installs) for (const [file, content] of Object.entries(item.desired)) {
      const target = path.join(root, item.destination, item.skill, ...file.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(content, 'base64'));
    }
  } finally { await rm(stage, { recursive: true, force: true }); }
}

async function init(): Promise<void> {
  let old: Config | undefined;
  try { old = await loadConfig(root); }
  catch (error) { if (!(error as Error).message.startsWith('No .agents/skills-sync.json')) throw error; }
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
  if (agents.length && targetPath !== '.agents/skills') throw new Error('Agent installation currently requires .agents/skills as the project skills directory.');
  const mode = await prompt('Publish mode (local-commit/branch/pull-request/main/override-main)', old?.publication.mode || 'local-commit');
  const publicationBranch = ['branch', 'pull-request'].includes(mode) ? await prompt('Publication branch', old?.publication.branch || 'skills-sync/update') : undefined;
  const config = validateConfig({ version: 1, source: { repository, branch, path: sourcePath }, target: { path: targetPath }, selection, direction, agents, publication: { mode, branch: publicationBranch } });
  console.log(JSON.stringify(config, null, 2));
  if ((await prompt('Save this configuration? (yes/no)', 'no')).toLowerCase() !== 'yes') return;
  await mkdir(path.dirname(configPath(root)), { recursive: true });
  await writeFile(configPath(root), JSON.stringify(config, null, 2) + '\n');
  console.log(`Saved ${configPath(root)}. Initial sync will preview selected skill changes.`);
  await execute();
}

function summary(changes: Change[]): void {
  if (!changes.length) { console.log('No changes.'); return; }
  for (const c of changes) console.log(`${c.kind.padEnd(9)} ${c.skill}/${c.file} local:${hash(c.local)} source:${hash(c.source)} baseline:${hash(c.before)}`);
}

async function showDiffs(changes: Change[]): Promise<void> {
  for (const change of changes) console.log(`${change.skill}/${change.file} [${change.kind}]\n${await formatDiff(change)}`);
}

async function ensureFresh(dir: string, original: string, branch: string): Promise<void> {
  await run('git', ['fetch', '--quiet', 'origin', branch], dir);
  if (await run('git', ['rev-parse', `origin/${branch}`], dir) !== original) throw new Error('Source branch advanced. Run status and retry; no publication was attempted.');
}

async function openSource(config: Config): Promise<{ dir: string; cleanup: () => Promise<void>; localCommit: boolean }> {
  if (config.publication.mode !== 'local-commit') return { ...(await checkout(config.source.repository, config.source.branch)), localCommit: false };
  const candidate = path.resolve(root, config.source.repository);
  try {
    if (!(await stat(candidate)).isDirectory()) throw new Error('not a directory');
    const dir = await run('git', ['rev-parse', '--show-toplevel'], candidate);
    const branch = await run('git', ['symbolic-ref', '--short', 'HEAD'], dir);
    if (branch !== config.source.branch) throw new Error(`Local-commit mode requires the source checkout on ${config.source.branch}; it is on ${branch}`);
    if (cmd !== 'status' && cmd !== 'diff') {
      const dirty = await run('git', ['status', '--porcelain', '--', ...config.selection.map(skill => `${config.source.path}/${skill}`)], dir);
      if (dirty) throw new Error('Commit or stash existing source skill changes before syncing in local-commit mode');
    }
    return { dir, cleanup: async () => {}, localCommit: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if ((error as Error).message.startsWith('Local-commit') || (error as Error).message.startsWith('Commit or stash')) throw error;
    throw new Error('local-commit mode requires source.repository to be a local Git checkout path on the configured branch');
  }
}

async function ensurePullRequest(dir: string, branch: string, base: string): Promise<void> {
  const existing = await run('gh', ['pr', 'list', '--head', branch, '--base', base, '--json', 'number', '--jq', '.[0].number // empty'], dir);
  if (!existing) await run('gh', ['pr', 'create', '--head', branch, '--base', base, '--title', 'Sync selected skills', '--body', 'Synchronize configured skills from a project.'], dir);
}

async function reconcilePending(state: State, config: Config, sourceDir: string): Promise<void> {
  const pending = state.pending;
  if (!pending) return;
  if (pending.branch !== config.publication.branch) throw new Error('Pending publication branch differs from configuration; resolve it before changing branches.');
  const branch = await checkout(config.source.repository, pending.branch);
  try {
    for (const skill of config.selection) {
      if (!sameFiles(await inventory(branch.dir, config.source.path, skill), pending.skills[skill]))
        throw new Error(`Pending branch ${pending.branch} changed independently in ${skill}; resolve it manually before syncing.`);
    }
  } finally { await branch.cleanup(); }
  let merged = true;
  for (const skill of config.selection) {
    const upstream = await inventory(sourceDir, config.source.path, skill);
    if (!sameFiles(upstream, pending.skills[skill])) merged = false;
  }
  if (merged) {
    for (const skill of config.selection) state.skills[skill] = await inventory(sourceDir, config.source.path, skill);
    delete state.pending;
    console.log(`Pending publication on ${pending.branch} is now present in the source branch.`);
    return;
  }
  for (const skill of config.selection) {
    const upstream = await inventory(sourceDir, config.source.path, skill);
    if (!sameFiles(upstream, state.skills[skill])) throw new Error(`Source skills changed while ${pending.branch} is pending. Resolve the PR and run sync again.`);
  }
}

async function replaceSkillFiles(dir: string, directory: string, skill: string, desired: Record<string, string>): Promise<void> {
  const current = await inventory(dir, directory, skill);
  for (const file of Object.keys(current)) if (!(file in desired)) await applyFile(dir, directory, { skill, file, kind: 'delete' }, 'local', true);
  for (const [file, content] of Object.entries(desired)) await applyFile(dir, directory, { skill, file, kind: 'pull', source: content }, 'local', false);
}

async function publication(dir: string, config: Config, original: string, pending?: State['pending']): Promise<void> {
  const mode = config.publication.mode;
  if (mode === 'pull-request') {
    if (!/github\.com[:/][^/]+\/[^/]+(?:\.git)?$/.test(config.source.repository)) throw new Error('Pull request mode requires a GitHub source repository');
    await run('gh', ['auth', 'status'], dir);
  }
  const changed = await run('git', ['status', '--porcelain'], dir);
  if (!changed) return;
  if (mode !== 'local-commit') await ensureFresh(dir, original, config.source.branch);
  const desired: Record<string, Record<string, string>> = {};
  for (const skill of config.selection) desired[skill] = await inventory(root, config.target.path, skill);
  for (const skill of config.selection) await run('git', ['add', '--', `${config.source.path}/${skill}`], dir);
  if (!(await run('git', ['diff', '--cached', '--name-only'], dir))) return;
  if (['branch', 'pull-request'].includes(mode)) {
    const remoteBranch = await run('git', ['ls-remote', '--heads', 'origin', config.publication.branch!], dir);
    if (remoteBranch) {
      await run('git', ['fetch', '--quiet', 'origin', config.publication.branch!], dir);
      if (pending) {
        await run('git', ['reset', '--hard', 'HEAD'], dir);
        for (const skill of config.selection) await run('git', ['clean', '-fd', '--', `${config.source.path}/${skill}`], dir);
        await run('git', ['switch', '-C', config.publication.branch!, 'FETCH_HEAD'], dir);
        for (const skill of config.selection) await replaceSkillFiles(dir, config.source.path, skill, desired[skill]);
        for (const skill of config.selection) await run('git', ['add', '--', `${config.source.path}/${skill}`], dir);
        if (await run('git', ['diff', '--cached', '--name-only'], dir)) {
          await run('git', ['-c', 'user.name=skills-sync', '-c', 'user.email=skills-sync@users.noreply.github.com', 'commit', '-m', 'Update pending skill sync'], dir);
          await run('git', ['push', 'origin', `HEAD:refs/heads/${config.publication.branch}`], dir);
        }
        if (mode === 'pull-request') await ensurePullRequest(dir, config.publication.branch!, config.source.branch);
        return;
      }
      let alreadyMerged = false;
      try { await run('git', ['merge-base', '--is-ancestor', 'FETCH_HEAD', `origin/${config.source.branch}`], dir); alreadyMerged = true; }
      catch { /* A branch not contained in main may include independent work. */ }
      if (alreadyMerged) {
        await run('git', ['reset', '--hard', 'HEAD'], dir);
        for (const skill of config.selection) await run('git', ['clean', '-fd', '--', `${config.source.path}/${skill}`], dir);
        await run('git', ['switch', '-C', config.publication.branch!, `origin/${config.source.branch}`], dir);
        for (const skill of config.selection) await replaceSkillFiles(dir, config.source.path, skill, desired[skill]);
        for (const skill of config.selection) await run('git', ['add', '--', `${config.source.path}/${skill}`], dir);
        if (await run('git', ['diff', '--cached', '--name-only'], dir)) {
          await run('git', ['-c', 'user.name=skills-sync', '-c', 'user.email=skills-sync@users.noreply.github.com', 'commit', '-m', 'Sync selected skills'], dir);
          await run('git', ['push', 'origin', `HEAD:refs/heads/${config.publication.branch}`], dir);
        }
        if (mode === 'pull-request') await ensurePullRequest(dir, config.publication.branch!, config.source.branch);
        return;
      }
      const differences = await run('git', ['diff', '--name-only', `FETCH_HEAD`, '--', config.source.path], dir);
      if (!differences) {
        console.log(`Existing ${config.publication.branch} already contains the selected content.`);
        if (mode === 'pull-request') await ensurePullRequest(dir, config.publication.branch!, config.source.branch);
        return;
      }
      throw new Error(`Publication branch ${config.publication.branch} has other content; inspect it before updating.`);
    }
    await run('git', ['switch', '-c', config.publication.branch!], dir);
  }
  await run('git', ['-c', 'user.name=skills-sync', '-c', 'user.email=skills-sync@users.noreply.github.com', 'commit', '-m', 'Sync selected skills'], dir);
  if (mode === 'local-commit') { console.log(`Created local commit in ${dir}`); return; }
  const branch = ['branch', 'pull-request'].includes(mode) ? config.publication.branch! : config.source.branch;
  await run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], dir);
  if (mode === 'pull-request') {
    await ensurePullRequest(dir, branch, config.source.branch);
  }
}

async function execute(): Promise<void> {
  const config = await loadConfig(root);
  if (cmd === 'pull' && config.direction === 'push') throw new Error('Project is configured push-only');
  if (cmd === 'push' && config.direction === 'pull') throw new Error('Project is configured pull-only');
  const source = await openSource(config);
  let keepCheckout = false;
  try {
    const original = await head(source.dir);
    const state = await loadState(root, config);
    await reconcilePending(state, config, source.dir);
    const changes: Change[] = [];
    for (const skill of config.selection) {
      const [local, upstream] = await Promise.all([inventory(root, config.target.path, skill), inventory(source.dir, config.source.path, skill)]);
      if (state.pending && sameFiles(local, state.pending.skills[skill]) && sameFiles(upstream, state.skills[skill])) continue;
      const takeSource = flags.has(`--adopt-source=${skill}`), takeProject = flags.has(`--adopt-project=${skill}`);
      if (takeSource && takeProject) throw new Error(`Choose only one adoption side for ${skill}`);
      const baseline = state.skills[skill] ?? (takeSource ? local : takeProject ? upstream : undefined);
      for (const change of planSkill(skill, baseline, local, upstream, config.direction)) changes.push(config.direction === 'bidirectional' ? await tryMerge(change) : change);
    }
    summary(changes);
    if (state.pending) console.log(`Pending publication: ${state.pending.branch} (source branch has not accepted it yet).`);
    if (cmd === 'diff') { await showDiffs(changes); return; }
    if (cmd === 'status') return;
    const override = config.publication.mode === 'override-main' && flags.has('--override-main') && confirmed &&
      flags.has(`--override-target=${config.source.repository}@${config.source.branch}`);
    const deletionChoices = new Set([...flags].filter(f => f.startsWith('--delete=')).map(f => f.slice('--delete='.length)));
    const deletions = changes.filter(c => c.kind === 'delete' && deletionChoices.has(`${c.skill}/${c.file}`) &&
      (c.local === undefined ? config.direction !== 'pull' && cmd !== 'pull' : config.direction !== 'push' && cmd !== 'push'));
    const replacements = override ? changes.filter(c => c.kind === 'conflict' && c.local !== undefined) : [];
    const applicable = [...changes.filter(c => cmd === 'pull' ? c.kind === 'pull' : cmd === 'push' ? c.kind === 'push' : c.kind === 'pull' || c.kind === 'push' || c.kind === 'merge'), ...deletions, ...replacements];
    const conflicts = changes.filter(c => (c.kind === 'conflict' || c.kind === 'delete') && !applicable.includes(c));
    if (conflicts.length) {
      const firstSetup = config.selection.filter(skill => !state.skills[skill]);
      const guidance = firstSetup.length ? ` For existing skills, explicitly choose --adopt-source=${firstSetup[0]} or --adopt-project=${firstSetup[0]}; confirm each deletion separately with --delete=skill/file.` : '';
      throw new Error(`${conflicts.length} conflict or deletion proposals; resolve these before applying.${guidance}`);
    }
    if (replacements.length) for (const c of replacements) console.log(`OVERRIDE ${c.skill}/${c.file}: source ${hash(c.source)} becomes local ${hash(c.local)} in ${config.source.repository}@${config.source.branch}`);
    await showDiffs(applicable);
    if (!applicable.length) {
      if (cmd === 'sync' && changes.length === 0) {
        await installAgents(config, source.dir);
        if (state.pending) console.log(`Publication is still pending on ${state.pending.branch}; baseline remains unchanged.`);
        else {
          for (const skill of config.selection) state.skills[skill] = await inventory(root, config.target.path, skill);
          await saveState(root, state);
        }
      }
      return;
    }
    const writesSource = applicable.some(c => c.kind === 'push' || c.kind === 'merge' || replacements.includes(c) || (deletions.includes(c) && c.local === undefined));
    if (writesSource && !publish) throw new Error('Local changes need source publication; preview only. Rerun with --publish after review.');
    if (config.publication.mode === 'override-main' && writesSource && !override) throw new Error(`Override requires --yes --override-main --override-target=${config.source.repository}@${config.source.branch}`);
    if (!confirmed && (await prompt('Apply the listed changes? (yes/no)', 'no')).toLowerCase() !== 'yes') return;
    if (!source.localCommit) await ensureFresh(source.dir, original, config.source.branch);
    for (const change of applicable) {
      const localWrite = change.kind === 'pull' || change.kind === 'merge' || (deletions.includes(change) && change.source === undefined);
      const sourceWrite = change.kind === 'push' || change.kind === 'merge' || replacements.includes(change) || (deletions.includes(change) && change.local === undefined);
      if (localWrite) await applyFile(root, config.target.path, change, 'local', deletions.includes(change));
      if (sourceWrite) await applyFile(source.dir, config.source.path, change, 'source', deletions.includes(change));
    }
    if (writesSource) {
      await publication(source.dir, config, original, state.pending);
      if (config.publication.mode === 'branch' || config.publication.mode === 'pull-request') {
        const pendingSkills: Record<string, Record<string, string>> = {};
        for (const skill of config.selection) pendingSkills[skill] = await inventory(root, config.target.path, skill);
        state.pending = { branch: config.publication.branch!, baseRevision: original, skills: pendingSkills };
      }
    }
    await installAgents(config, source.dir);
    if ((config.publication.mode === 'pull-request' || config.publication.mode === 'branch') && writesSource) await saveState(root, state);
    else {
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
