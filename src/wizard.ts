import { Config, Direction, fieldError, Publication, validateConfig } from './config.js';
import { isIgnored } from './sync.js';
import { CANCEL, Cancel, Option, Prompts } from './prompts.js';
import { AgentType, agents, getNonUniversalAgents, getUniversalAgents, getVisibleUniversalAgents } from './vendor/skills/agents.js';

export interface SkillInfo { name: string; description?: string }
export interface WizardDeps {
  old?: Config;
  /** Checks out the source, lists skills with SKILL.md, and cleans up the checkout. */
  discoverSkills(repository: string, branch: string, sourcePath: string): Promise<SkillInfo[]>;
  /** Skills with SKILL.md in the project skills directory. */
  projectSkills(targetPath: string): Promise<string[]>;
  /** The project's .skillsignore: whether it exists, and its patterns. */
  skillsIgnore: { exists: boolean; patterns: string[] };
}
/** `skillsIgnore` lists skills to write to a new .skillsignore when migrating a legacy selection. */
export type WizardResult = { config: Config; skillsIgnore?: string[] } | { cancelled: true };

const AGENT_DIR = '.agents/skills';

const directions: Option<Direction>[] = [
  { value: 'bidirectional', label: 'Bidirectional (Recommended)', hint: 'Pull source changes and publish project edits' },
  { value: 'pull', label: 'Pull only', hint: 'Update the project from the source; never write the source' },
  { value: 'push', label: 'Push only', hint: 'Publish project edits; never update the project from the source' },
];

const modes: Option<Publication>[] = [
  { value: 'local-commit', label: 'Local commit (Recommended)', hint: 'Commit source edits in a local checkout; no push' },
  { value: 'branch', label: 'Branch', hint: 'Push source edits to a publication branch; needs push access' },
  { value: 'pull-request', label: 'Pull request', hint: 'Push a branch and open a PR; needs push access and an authenticated gh' },
  { value: 'main', label: 'Main', hint: 'Push source edits to the source branch; needs push access' },
  { value: 'override-main', label: 'Override main', hint: 'May replace conflicting source content; each run needs explicit override flags' },
];

class Cancelled extends Error {}
function answer<T>(value: T | Cancel): T {
  if (value === CANCEL) throw new Cancelled();
  return value as T;
}

export const maskCredentials = (repository: string) => repository.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]+@/i, '$1***@');

export async function runWizard(prompts: Prompts, deps: WizardDeps): Promise<WizardResult> {
  try { return await ask(prompts, deps); }
  catch (error) { if (error instanceof Cancelled) return { cancelled: true }; throw error; }
}

async function ask(prompts: Prompts, { old, discoverSkills, projectSkills, skillsIgnore }: WizardDeps): Promise<{ config: Config; skillsIgnore?: string[] }> {
  const text = async (message: string, defaultValue: string | undefined, validate: (value: string) => string | undefined) =>
    answer(await prompts.text({ message, defaultValue, validate })).trim();

  const repository = await text('Skills Git URL or local checkout', old?.source.repository, fieldError.repository);
  const branch = await text('Source branch', old?.source.branch || 'main', v => fieldError.branch(v.trim()));
  const sourcePath = await text('Source skills directory', old?.source.path || 'skills', v => fieldError.path(v.trim(), 'source.path'));
  const targetPath = await text('Project skills directory', old?.target.path || AGENT_DIR, v => fieldError.path(v.trim(), 'target.path'));

  const spinner = prompts.spinner();
  spinner.start('Loading skills…');
  let available: SkillInfo[];
  try { available = await discoverSkills(repository, branch, sourcePath); }
  catch (error) { spinner.error('Could not load skills'); throw error; }
  if (!available.length) { spinner.error('No skills found'); throw new Error(`No skills with SKILL.md found in ${sourcePath}`); }
  spinner.stop(`Found ${available.length} skill${available.length === 1 ? '' : 's'}`);

  // Every discovered skill is synced unless .skillsignore matches it; no selection is saved.
  const names = [...new Set([...available.map(skill => skill.name), ...await projectSkills(targetPath)])].sort();
  // A legacy selection becomes a .skillsignore listing the skills it left out, so the synced set stays the same.
  const migrated = old?.selection && !skillsIgnore.exists ? names.filter(skill => !old.selection!.includes(skill)) : undefined;
  const patterns = migrated ?? skillsIgnore.patterns;
  const ignored = names.filter(skill => isIgnored(skill, patterns));
  prompts.log.info(`Skills to sync: ${names.filter(skill => !ignored.includes(skill)).join(', ') || 'none'}`);
  if (ignored.length) prompts.log.info(`Ignored by .skillsignore: ${ignored.join(', ')}`);

  const direction = answer(await prompts.select({ message: 'Direction', options: directions, initialValue: old?.direction ?? 'bidirectional' }));
  const chosenAgents = targetPath === AGENT_DIR ? await askAgents(prompts, old) : skipAgents(prompts);
  const mode = answer(await prompts.select({ message: 'Publish mode', options: modes, initialValue: old?.publication.mode ?? 'local-commit' }));
  const publicationBranch = mode === 'branch' || mode === 'pull-request'
    ? await text('Publication branch', old?.publication.branch || 'skills-sync/update', v => fieldError.publicationBranch(v.trim(), branch))
    : undefined;

  const config = validateConfig({ version: 1, source: { repository, branch, path: sourcePath }, target: { path: targetPath },
    direction, agents: chosenAgents, publication: { mode, branch: publicationBranch } });
  prompts.note(summary(config, migrated), 'Configuration Summary');
  if (!answer(await prompts.confirm({ message: 'Save this configuration?', initialValue: false }))) throw new Cancelled();
  return { config, skillsIgnore: migrated };
}

async function askAgents(prompts: Prompts, old: Config | undefined): Promise<string[]> {
  const universal = getUniversalAgents(), visible = getVisibleUniversalAgents();
  const offered = getNonUniversalAgents().filter(agent => agent !== 'eve');
  const isOffered = (agent: string): agent is AgentType => (offered as string[]).includes(agent);
  const unknown = old?.agents.filter(agent => !isOffered(agent)) ?? [];
  if (unknown.length) prompts.log.warn(`Saved agents not offered by skills: ${unknown.join(', ')}`);
  const chosen = answer(await prompts.searchMultiselect<string>({
    message: 'Which agents do you want to install to?',
    items: offered.map(agent => ({ value: agent, label: agents[agent].displayName, hint: agents[agent].skillsDir })),
    initialSelected: old?.agents.filter(isOffered) ?? [],
    lockedSection: {
      title: 'Universal (.agents/skills)',
      items: visible.map(agent => ({ value: agent, label: agents[agent].displayName })),
      hiddenCount: universal.length - visible.length,
    },
    required: false,
  }));
  // The prompt returns locked (universal) agents too; they already read .agents/skills and are not saved.
  return chosen.filter(isOffered);
}

function skipAgents(prompts: Prompts): string[] {
  prompts.log.info('Agent installation requires .agents/skills as the project skills directory; skipping agents.');
  return [];
}

function summary(config: Config, migrated?: string[]): string {
  const publication = config.publication.branch ? `${config.publication.mode} → ${config.publication.branch}` : config.publication.mode;
  return [
    `Source:        ${maskCredentials(config.source.repository)} @ ${config.source.branch}`,
    `Source path:   ${config.source.path}`,
    `Project path:  ${config.target.path}`,
    `Skills:        all except .skillsignore${migrated ? ` (writes .skillsignore with ${migrated.length} skill${migrated.length === 1 ? '' : 's'} from the saved selection)` : ''}`,
    `Direction:     ${config.direction}`,
    `Agents:        ${config.agents.length ? config.agents.join(', ') : 'none'}`,
    `Publication:   ${publication}`,
  ].join('\n');
}
