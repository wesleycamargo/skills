import { CANCEL, Prompts } from './prompts.js';
import type { Change } from './sync.js';

export type Adoption = 'source' | 'project' | 'skip';

/** Asks which copy wins for each existing skill that differs on first sync; undefined when cancelled. */
export async function chooseAdoptions(prompts: Prompts, skills: string[]): Promise<Map<string, Adoption> | undefined> {
  const chosen = new Map<string, Adoption>();
  for (const skill of skills) {
    const value = await prompts.select<Adoption>({
      message: `${skill} exists in the source and the project and differs. Which copy should be kept?`,
      options: [
        { value: 'skip', label: 'Skip for now', hint: 'Leave both copies untouched' },
        { value: 'source', label: 'Source', hint: 'Replace the project copy with the source copy' },
        { value: 'project', label: 'Project', hint: 'Publish the project copy to the source' },
      ],
      initialValue: 'skip',
    });
    if (value === CANCEL) return undefined;
    chosen.set(skill, value);
  }
  return chosen;
}

/** Confirms each proposed deletion; returns `skill/file` keys, or undefined when cancelled. */
export async function chooseDeletions(prompts: Prompts, deletions: Change[]): Promise<Set<string> | undefined> {
  const chosen = new Set<string>();
  for (const change of deletions) {
    const where = change.local === undefined ? 'the source' : 'the project';
    const value = await prompts.confirm({ message: `Delete ${change.skill}/${change.file} from ${where}?`, initialValue: false });
    if (value === CANCEL) return undefined;
    if (value) chosen.add(`${change.skill}/${change.file}`);
  }
  return chosen;
}
