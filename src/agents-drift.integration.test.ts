import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import test from 'node:test';
import { agents } from './vendor/skills/agents.js';

test('copied agent registry matches the agents accepted by the pinned skills CLI', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skills-sync-drift-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = path.join(temp, 'source'), project = path.join(temp, 'project');
  await mkdir(path.join(source, 'fixture'), { recursive: true }); await mkdir(project);
  await writeFile(path.join(source, 'fixture/SKILL.md'), '---\nname: fixture\ndescription: Drift fixture\n---\n');
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: project }).status, 0);
  const cli = createRequire(import.meta.url).resolve('skills/bin/cli.mjs');
  const result = spawnSync(process.execPath, [cli, 'add', source, '--agent', '__invalid__', '-y'], {
    cwd: project, encoding: 'utf8', env: { ...process.env, DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' }
  });
  const output = stripVTControlCharacters(result.stdout + result.stderr);
  const line = output.split('\n').find(l => l.includes('Valid agents:'));
  assert.ok(line, `pinned skills CLI did not list valid agents:\n${output}`);
  const upstream = new Set(line.slice(line.indexOf('Valid agents:') + 'Valid agents:'.length).split(',').map(s => s.trim()).filter(Boolean));
  const copied = new Set(Object.keys(agents));
  const missing = [...upstream].filter(key => !copied.has(key));
  const extra = [...copied].filter(key => !upstream.has(key));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, 'refresh src/vendor/skills/agents.ts from the pinned skills version');
});
