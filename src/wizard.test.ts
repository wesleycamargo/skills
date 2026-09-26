import assert from 'node:assert/strict';
import test from 'node:test';
import { Config } from './config.js';
import { CANCEL, Prompts } from './prompts.js';
import { runWizard, SkillInfo } from './wizard.js';

interface Call { kind: string; options: any }

/** Answers prompts by message; every call and message is recorded for assertions. */
function scripted(answers: Record<string, unknown>) {
  const calls: Call[] = [], output: string[] = [];
  const answer = async (kind: string, options: any) => {
    calls.push({ kind, options });
    if (!(options.message in answers)) throw new Error(`Unexpected prompt: ${options.message}`);
    const value = answers[options.message];
    if (kind === 'text' && value !== CANCEL) {
      for (const attempt of Array.isArray(value) ? value : [value]) {
        const error = options.validate?.(attempt);
        output.push(`validate:${attempt}:${error ?? 'ok'}`);
        if (!error) return attempt;
      }
      throw new Error(`No valid answer for ${options.message}`);
    }
    return value;
  };
  const prompts: Prompts = {
    intro: m => output.push(`intro:${m}`), outro: m => output.push(`outro:${m}`), cancel: m => output.push(`cancel:${m}`),
    note: (m, title) => output.push(`note:${title}:${m}`),
    log: { info: m => output.push(`info:${m}`), warn: m => output.push(`warn:${m}`), error: m => output.push(`error:${m}`) },
    spinner: () => ({ start: m => output.push(`spin:${m}`), stop: m => output.push(`stop:${m}`), error: m => output.push(`spinerror:${m}`) }),
    text: o => answer('text', o) as any, select: o => answer('select', o) as any,
    searchMultiselect: o => answer('searchMultiselect', o) as any, confirm: o => answer('confirm', o) as any,
  };
  const call = (message: string) => calls.find(c => c.options.message === message);
  return { prompts, calls, output, call };
}

const skills: SkillInfo[] = [{ name: 'alpha', description: 'Formats commit messages for conventional commit repositories everywhere' }, { name: 'beta' }];
const base = {
  'Skills Git URL or local checkout': 'https://example.com/skills.git', 'Source branch': 'main', 'Source skills directory': 'skills',
  'Project skills directory': '.agents/skills', 'Direction': 'bidirectional',
  'Which agents do you want to install to?': [], 'Publish mode': 'local-commit', 'Save this configuration?': true,
};
const discoverSkills = async () => skills;
const deps = { discoverSkills, projectSkills: async () => ['local'], skillsIgnore: { exists: false, patterns: [] as string[] } };
const saved = (config: Config) => JSON.stringify(config, null, 2) + '\n';

test('bidirectional local-commit answers produce the same file as the previous wizard', async () => {
  const { prompts } = scripted(base);
  const result = await runWizard(prompts, deps);
  assert.ok('config' in result);
  assert.equal(saved(result.config), `{
  "version": 1,
  "source": {
    "repository": "https://example.com/skills.git",
    "branch": "main",
    "path": "skills"
  },
  "target": {
    "path": ".agents/skills"
  },
  "direction": "bidirectional",
  "agents": [],
  "publication": {
    "mode": "local-commit"
  }
}
`);
});

test('pull with pull-request mode saves the publication branch', async () => {
  const { prompts } = scripted({ ...base, 'Direction': 'pull', 'Publish mode': 'pull-request', 'Publication branch': 'skills-sync/update' });
  const result = await runWizard(prompts, deps);
  assert.ok('config' in result);
  assert.equal(saved(result.config), `{
  "version": 1,
  "source": {
    "repository": "https://example.com/skills.git",
    "branch": "main",
    "path": "skills"
  },
  "target": {
    "path": ".agents/skills"
  },
  "direction": "pull",
  "agents": [],
  "publication": {
    "mode": "pull-request",
    "branch": "skills-sync/update"
  }
}
`);
});

test('push with main mode saves chosen agents and drops locked universal agents', async () => {
  const { prompts } = scripted({ ...base, 'Direction': 'push', 'Publish mode': 'main', 'Which agents do you want to install to?': ['codex', 'claude-code', 'windsurf'] });
  const result = await runWizard(prompts, deps);
  assert.ok('config' in result);
  assert.deepEqual(result.config.agents, ['claude-code', 'windsurf']);
  assert.match(saved(result.config), /"agents": \[\n    "claude-code",\n    "windsurf"\n  \],\n  "publication": \{\n    "mode": "main"\n  \}\n\}\n$/);
});

test('every discovered skill is synced unless .skillsignore matches it, with no skill prompt', async () => {
  const { prompts, calls, output } = scripted(base);
  const result = await runWizard(prompts, { ...deps, skillsIgnore: { exists: true, patterns: ['be*'] } });
  assert.ok('config' in result);
  assert.equal(result.config.selection, undefined);
  assert.equal(result.skillsIgnore, undefined);
  assert.ok(!calls.some(c => c.options.message === 'Select skills to sync'));
  assert.ok(output.includes('info:Skills to sync: alpha, local'));
  assert.ok(output.includes('info:Ignored by .skillsignore: beta'));
  assert.ok(output.some(line => line.startsWith('note:Configuration Summary:') && line.includes('Skills:        all except .skillsignore')));
});

test('reconfiguring a saved selection migrates the skills it left out to a new .skillsignore', async () => {
  const old: Config = { version: 1, source: { repository: '/src', branch: 'main', path: 'skills' }, target: { path: '.agents/skills' },
    selection: ['beta'], direction: 'bidirectional', agents: [], publication: { mode: 'local-commit' } };
  const { prompts, output } = scripted(base);
  const result = await runWizard(prompts, { ...deps, old });
  assert.ok('config' in result);
  assert.equal(result.config.selection, undefined);
  assert.deepEqual(result.skillsIgnore, ['alpha', 'local']);
  assert.ok(output.includes('info:Skills to sync: beta'));
  assert.ok(output.some(line => line.includes('writes .skillsignore with 2 skills from the saved selection')));
  const existing = scripted(base);
  const kept = await runWizard(existing.prompts, { ...deps, old, skillsIgnore: { exists: true, patterns: [] } });
  assert.ok('config' in kept);
  assert.equal(kept.skillsIgnore, undefined);
});

test('reconfiguring prefills saved values and warns about skills and agents that no longer exist', async () => {
  const old: Config = { version: 1, source: { repository: '/src', branch: 'dev', path: 'lib' }, target: { path: '.agents/skills' },
    direction: 'push', agents: ['windsurf', 'codex', 'unknown'], publication: { mode: 'branch', branch: 'sync' } };
  const { prompts, call, output } = scripted({ ...base, 'Publish mode': 'branch', 'Publication branch': 'sync' });
  await runWizard(prompts, { ...deps, old });
  assert.equal(call('Skills Git URL or local checkout')!.options.defaultValue, '/src');
  assert.equal(call('Source branch')!.options.defaultValue, 'dev');
  assert.equal(call('Source skills directory')!.options.defaultValue, 'lib');
  assert.equal(call('Direction')!.options.initialValue, 'push');
  assert.deepEqual(call('Which agents do you want to install to?')!.options.initialSelected, ['windsurf']);
  assert.equal(call('Publish mode')!.options.initialValue, 'branch');
  assert.equal(call('Publication branch')!.options.defaultValue, 'sync');
  assert.ok(output.includes('warn:Saved agents not offered by skills: codex, unknown'));
});

test('direction and mode prompts offer the documented choices with recommended defaults', async () => {
  const { prompts, call } = scripted(base);
  await runWizard(prompts, deps);
  const direction = call('Direction')!.options, mode = call('Publish mode')!.options;
  assert.equal(direction.initialValue, 'bidirectional');
  assert.deepEqual(direction.options.map((o: any) => [o.value, o.label]), [
    ['bidirectional', 'Bidirectional (Recommended)'], ['pull', 'Pull only'], ['push', 'Push only']]);
  assert.equal(mode.initialValue, 'local-commit');
  assert.deepEqual(mode.options.map((o: any) => [o.value, o.label]), [
    ['local-commit', 'Local commit (Recommended)'], ['branch', 'Branch'], ['pull-request', 'Pull request'], ['main', 'Main'], ['override-main', 'Override main']]);
  assert.match(mode.options.find((o: any) => o.value === 'pull-request').hint, /gh/);
  assert.match(mode.options.find((o: any) => o.value === 'override-main').hint, /override flags/);
});

test('agent prompt locks universal agents and is skipped outside .agents/skills', async () => {
  const offered = scripted(base);
  await runWizard(offered.prompts, deps);
  const agents = offered.call('Which agents do you want to install to?')!.options;
  const values = agents.items.map((i: any) => i.value);
  assert.ok(values.includes('claude-code') && !values.includes('eve') && !values.includes('codex'));
  assert.equal(agents.lockedSection.title, 'Universal (.agents/skills)');
  assert.ok(agents.lockedSection.items.some((i: any) => i.value === 'codex'));
  assert.equal(agents.required, false);

  const skipped = scripted({ ...base, 'Project skills directory': 'skills' });
  const result = await runWizard(skipped.prompts, deps);
  assert.ok('config' in result);
  assert.deepEqual(result.config.agents, []);
  assert.equal(skipped.call('Which agents do you want to install to?'), undefined);
  assert.ok(skipped.output.includes('info:Agent installation requires .agents/skills as the project skills directory; skipping agents.'));
});

test('invalid text answers are asked again with the validation message', async () => {
  const { prompts, output } = scripted({ ...base, 'Skills Git URL or local checkout': ['  ', '/src'], 'Source branch': ['bad..branch', 'main'],
    'Source skills directory': ['../skills', 'skills'], 'Publish mode': 'branch', 'Publication branch': ['main', 'sync'] });
  const result = await runWizard(prompts, deps);
  assert.ok('config' in result);
  assert.ok(output.includes('validate:  :Missing source.repository'));
  assert.ok(output.includes('validate:bad..branch:Invalid source.branch'));
  assert.ok(output.includes('validate:../skills:source.path must be a safe relative POSIX path'));
  assert.ok(output.includes('validate:main:Publication needs a non-source branch'));
});

test('cancelling any prompt or declining to save returns cancelled', async () => {
  const messages = ['Skills Git URL or local checkout', 'Source branch', 'Source skills directory', 'Project skills directory',
    'Direction', 'Which agents do you want to install to?', 'Publish mode', 'Publication branch', 'Save this configuration?'];
  for (const message of messages) {
    const { prompts } = scripted({ ...base, 'Publish mode': 'branch', 'Publication branch': 'sync', [message]: CANCEL });
    assert.deepEqual(await runWizard(prompts, deps), { cancelled: true }, message);
  }
  const declined = scripted({ ...base, 'Save this configuration?': false });
  assert.deepEqual(await runWizard(declined.prompts, deps), { cancelled: true });
  assert.equal(declined.call('Save this configuration?')!.options.initialValue, false);
});

test('summary masks repository credentials and failed discovery stops the spinner', async () => {
  const { prompts, output } = scripted({ ...base, 'Skills Git URL or local checkout': 'https://user:token@example.com/skills.git' });
  await runWizard(prompts, deps);
  const note = output.find(line => line.startsWith('note:Configuration Summary:'))!;
  assert.match(note, /https:\/\/\*\*\*@example\.com\/skills\.git/);
  assert.doesNotMatch(note, /token/);
  assert.ok(output.includes('spin:Loading skills…') && output.includes('stop:Found 2 skills'));

  const empty = scripted(base);
  await assert.rejects(runWizard(empty.prompts, { ...deps, discoverSkills: async () => [] }), /No skills with SKILL.md found in skills/);
  assert.ok(empty.output.some(line => line.startsWith('spinerror:')));
});
