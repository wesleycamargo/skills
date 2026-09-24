import { Config, Direction, fieldError, Publication, validateConfig } from './config.js';
import { CANCEL, Cancel, Option, Prompts } from './prompts.js';
import { AgentType, agents, getNonUniversalAgents, getUniversalAgents, getVisibleUniversalAgents } from './vendor/skills/agents.js';

export interface SkillInfo { name: string; description?: string }
export interface WizardDeps {
  old?: Config;
  /** Checks out the source, lists skills with SKILL.md, and cleans up the checkout. */
  discoverSkills(repository: string, branch: string, sourcePath: string): Promise<SkillInfo[]>;
}
export type WizardResult = { config: Config } | { cancelled: true };

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

const shorten = (text?: string) => text && text.length > 60 ? `${text.slice(0, 57)}…` : text;
export const maskCredentials = (repository: string) => repository.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]+@/i, '$1***@');

export async function runWizard(prompts: Prompts, { old, discoverSkills }: WizardDeps): Promise<WizardResult> {
  try { return { config: await ask(prompts, old, discoverSkills) }; }
  catch (error) { if (error instanceof Cancelled) return { cancelled: true }; throw error; }
}

async function ask(prompts: Prompts, old: Config | undefined, discoverSkills: WizardDeps['discoverSkills']): Promise<Config> {
  const text = async (message: string, initialValue: string | undefined, validate: (value: string) => string | undefined) =>
    answer(await prompts.text({ message, initialValue, validate })).trim();

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

  const names = available.map(skill => skill.name);
  const missing = old?.selection.filter(skill => !names.includes(skill)) ?? [];
  if (missing.length) prompts.log.warn(`Saved skills no longer in the source: ${missing.join(', ')}`);
  const selection = answer(await prompts.searchMultiselect({
    message: 'Select skills to sync',
    items: available.map(skill => ({ value: skill.name, label: skill.name, hint: shorten(skill.description) })),
    initialSelected: old?.selection.filter(skill => names.includes(skill)) ?? [],
    maxVisible: 20, selectAll: true, required: true,
  }));

  const direction = answer(await prompts.select({ message: 'Direction', options: directions, initialValue: old?.direction ?? 'bidirectional' }));
  const chosenAgents = targetPath === AGENT_DIR ? await askAgents(prompts, old) : skipAgents(prompts);
  const mode = answer(await prompts.select({ message: 'Publish mode', options: modes, initialValue: old?.publication.mode ?? 'local-commit' }));
  const publicationBranch = mode === 'branch' || mode === 'pull-request'
    ? await text('Publication branch', old?.publication.branch || 'skills-sync/update', v => fieldError.publicationBranch(v.trim(), branch))
    : undefined;

  const config = validateConfig({ version: 1, source: { repository, branch, path: sourcePath }, target: { path: targetPath },
    selection, direction, agents: chosenAgents, publication: { mode, branch: publicationBranch } });
  prompts.note(summary(config), 'Configuration Summary');
  if (!answer(await prompts.confirm({ message: 'Save this configuration?', initialValue: false }))) throw new Cancelled();
  return config;
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

function summary(config: Config): string {
  const publication = config.publication.branch ? `${config.publication.mode} → ${config.publication.branch}` : config.publication.mode;
  return [
    `Source:        ${maskCredentials(config.source.repository)} @ ${config.source.branch}`,
    `Source path:   ${config.source.path}`,
    `Project path:  ${config.target.path}`,
    `Skills:        ${config.selection.join(', ')}`,
    `Direction:     ${config.direction}`,
    `Agents:        ${config.agents.length ? config.agents.join(', ') : 'none'}`,
    `Publication:   ${publication}`,
  ].join('\n');
}
