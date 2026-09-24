import assert from 'node:assert/strict';
import test from 'node:test';
import { agents, getNonUniversalAgents, getUniversalAgents, getVisibleUniversalAgents } from './vendor/skills/agents.js';
import { buildSearchEntries, getSelectAllState, toggleAllItems, toggleSearchEntry } from './vendor/skills/search-multiselect.js';

const items = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];

test('select all toggles between every item and none', () => {
  const selected = new Set<string>();
  assert.equal(getSelectAllState(selected, items), 'none');
  toggleSearchEntry(selected, buildSearchEntries(items, false)[0]);
  assert.equal(getSelectAllState(selected, items), 'partial');
  toggleAllItems(selected, items);
  assert.deepEqual([...selected].sort(), ['a', 'b']);
  toggleAllItems(selected, items);
  assert.equal(selected.size, 0);
});

test('universal agents read .agents/skills and are split from the rest', () => {
  assert.ok(getUniversalAgents().includes('codex'));
  assert.ok(!getUniversalAgents().includes('universal'));
  assert.ok(getNonUniversalAgents().includes('claude-code'));
  assert.ok(!getNonUniversalAgents().includes('codex'));
  assert.ok(!getVisibleUniversalAgents().includes('antigravity'));
  assert.equal(getUniversalAgents().length + getNonUniversalAgents().length + 2, Object.keys(agents).length);
});
