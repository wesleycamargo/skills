/*
 * Copied from vercel-labs/skills, src/agents.ts and src/types.ts
 * Tag v1.7.0, commit 5b1b4fe90fa9b5809d6db1e0ce97f5d2e3715fdc
 * https://github.com/vercel-labs/skills/blob/5b1b4fe90fa9b5809d6db1e0ce97f5d2e3715fdc/src/agents.ts
 *
 * Changes from the original: only the static prompt fields of each agent are kept
 * (displayName, skillsDir, showInUniversalList, showInUniversalPrompt). Installation
 * detection, global directories, and the xdg-basedir/os/fs imports are removed.
 * AgentType is derived from the registry keys. Refresh this file whenever the
 * pinned `skills` dependency changes; src/agents-drift.integration.test.ts checks it.
 *
 * MIT License
 *
 * Copyright (c) 2026 Vercel, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export interface AgentConfig {
  displayName: string;
  skillsDir: string;
  /** Whether to show this agent in the universal agents list. Defaults to true. */
  showInUniversalList?: boolean;
  /** Whether to display this universal agent in the interactive locked section. Defaults to true. */
  showInUniversalPrompt?: boolean;
}

export const agents = {
  'aider-desk': { displayName: 'AiderDesk', skillsDir: '.aider-desk/skills' },
  amp: { displayName: 'Amp', skillsDir: '.agents/skills' },
  antigravity: { displayName: 'Antigravity', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  'antigravity-cli': { displayName: 'Antigravity CLI', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  astrbot: { displayName: 'AstrBot', skillsDir: 'data/skills' },
  'autohand-code': { displayName: 'Autohand Code CLI', skillsDir: '.autohand/skills' },
  augment: { displayName: 'Augment', skillsDir: '.augment/skills' },
  bob: { displayName: 'IBM Bob', skillsDir: '.bob/skills' },
  'claude-code': { displayName: 'Claude Code', skillsDir: '.claude/skills' },
  openclaw: { displayName: 'OpenClaw', skillsDir: 'skills' },
  cline: { displayName: 'Cline', skillsDir: '.agents/skills' },
  'codearts-agent': { displayName: 'CodeArts Agent', skillsDir: '.codeartsdoer/skills' },
  codebuddy: { displayName: 'CodeBuddy', skillsDir: '.codebuddy/skills' },
  codemaker: { displayName: 'Codemaker', skillsDir: '.codemaker/skills' },
  codestudio: { displayName: 'Code Studio', skillsDir: '.codestudio/skills' },
  codex: { displayName: 'Codex', skillsDir: '.agents/skills' },
  'command-code': { displayName: 'Command Code', skillsDir: '.commandcode/skills' },
  continue: { displayName: 'Continue', skillsDir: '.continue/skills' },
  cortex: { displayName: 'Cortex Code', skillsDir: '.cortex/skills' },
  crush: { displayName: 'Crush', skillsDir: '.crush/skills' },
  cursor: { displayName: 'Cursor', skillsDir: '.agents/skills' },
  deepagents: { displayName: 'Deep Agents', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  devin: { displayName: 'Devin for Terminal', skillsDir: '.devin/skills' },
  dexto: { displayName: 'Dexto', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  droid: { displayName: 'Droid', skillsDir: '.agents/skills' },
  eve: { displayName: 'Eve', skillsDir: 'agent/skills' },
  firebender: { displayName: 'Firebender', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  forgecode: { displayName: 'ForgeCode', skillsDir: '.forge/skills' },
  fx: { displayName: 'fx', skillsDir: '.fx/skills' },
  'gemini-cli': { displayName: 'Gemini CLI', skillsDir: '.agents/skills' },
  'github-copilot': { displayName: 'GitHub Copilot', skillsDir: '.agents/skills' },
  goose: { displayName: 'Goose', skillsDir: '.goose/skills' },
  grok: { displayName: 'Grok Build', skillsDir: '.grok/skills' },
  'hermes-agent': { displayName: 'Hermes Agent', skillsDir: '.hermes/skills' },
  'inference-sh': { displayName: 'inference.sh', skillsDir: '.inferencesh/skills' },
  jazz: { displayName: 'Jazz', skillsDir: '.jazz/skills' },
  junie: { displayName: 'Junie', skillsDir: '.junie/skills' },
  'iflow-cli': { displayName: 'iFlow CLI', skillsDir: '.iflow/skills' },
  kilo: { displayName: 'Kilo Code', skillsDir: '.agents/skills' },
  kimchi: { displayName: 'Kimchi', skillsDir: '.kimchi/skills' },
  'kimi-code-cli': { displayName: 'Kimi Code CLI', skillsDir: '.agents/skills' },
  'kiro-cli': { displayName: 'Kiro CLI', skillsDir: '.kiro/skills' },
  kode: { displayName: 'Kode', skillsDir: '.kode/skills' },
  lingma: { displayName: 'Lingma', skillsDir: '.lingma/skills' },
  loaf: { displayName: 'Loaf', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  mcpjam: { displayName: 'MCPJam', skillsDir: '.mcpjam/skills' },
  'minimax-code': { displayName: 'MiniMax Code', skillsDir: '.minimax/skills' },
  'mistral-vibe': { displayName: 'Mistral Vibe', skillsDir: '.vibe/skills' },
  moxby: { displayName: 'Moxby', skillsDir: '.moxby/skills' },
  mux: { displayName: 'Mux', skillsDir: '.mux/skills' },
  opencode: { displayName: 'OpenCode', skillsDir: '.agents/skills' },
  openhands: { displayName: 'OpenHands', skillsDir: '.openhands/skills' },
  ona: { displayName: 'Ona', skillsDir: '.ona/skills' },
  pi: { displayName: 'Pi', skillsDir: '.pi/skills' },
  'posit-assistant': { displayName: 'Posit Assistant', skillsDir: '.posit/assistant/skills' },
  qoder: { displayName: 'Qoder', skillsDir: '.qoder/skills' },
  'qoder-cn': { displayName: 'Qoder CN', skillsDir: '.qoder/skills' },
  'qwen-code': { displayName: 'Qwen Code', skillsDir: '.qwen/skills' },
  replit: { displayName: 'Replit', skillsDir: '.agents/skills', showInUniversalList: false },
  reasonix: { displayName: 'Reasonix', skillsDir: '.reasonix/skills' },
  rovodev: { displayName: 'Rovo Dev', skillsDir: '.rovodev/skills' },
  roo: { displayName: 'Roo Code', skillsDir: '.roo/skills' },
  'sarvam-code': { displayName: 'Sarvam Code', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  'tabnine-cli': { displayName: 'Tabnine CLI', skillsDir: '.tabnine/agent/skills' },
  terramind: { displayName: 'Terramind', skillsDir: '.terramind/skills' },
  tinycloud: { displayName: 'Tinycloud', skillsDir: '.tinycloud/skills' },
  trae: { displayName: 'Trae', skillsDir: '.trae/skills' },
  'trae-cn': { displayName: 'Trae CN', skillsDir: '.trae/skills' },
  warp: { displayName: 'Warp', skillsDir: '.agents/skills' },
  windsurf: { displayName: 'Windsurf', skillsDir: '.windsurf/skills' },
  zed: { displayName: 'Zed', skillsDir: '.agents/skills' },
  zcode: { displayName: 'ZCode', skillsDir: '.zcode/skills' },
  zencoder: { displayName: 'Zencoder', skillsDir: '.zencoder/skills' },
  zenflow: { displayName: 'Zenflow', skillsDir: '.zencoder/skills' },
  neovate: { displayName: 'Neovate', skillsDir: '.neovate/skills' },
  pochi: { displayName: 'Pochi', skillsDir: '.pochi/skills' },
  promptscript: { displayName: 'PromptScript', skillsDir: '.agents/skills', showInUniversalPrompt: false },
  adal: { displayName: 'AdaL', skillsDir: '.adal/skills' },
  universal: { displayName: 'Universal', skillsDir: '.agents/skills', showInUniversalList: false },
} satisfies Record<string, AgentConfig>;

export type AgentType = keyof typeof agents;

const entries = () => Object.entries(agents as Record<AgentType, AgentConfig>) as [AgentType, AgentConfig][];

/**
 * Returns agents that use the universal .agents/skills directory.
 * These agents share a common skill location and don't need symlinks.
 * Agents with showInUniversalList: false are excluded.
 */
export function getUniversalAgents(): AgentType[] {
  return entries()
    .filter(
      ([_, config]) => config.skillsDir === '.agents/skills' && config.showInUniversalList !== false
    )
    .map(([type]) => type);
}

/**
 * Returns the subset of universal agents shown in the interactive locked section.
 * All universal agents are still installed; this only keeps the prompt readable.
 */
export function getVisibleUniversalAgents(): AgentType[] {
  return entries()
    .filter(
      ([_, config]) =>
        config.skillsDir === '.agents/skills' &&
        config.showInUniversalList !== false &&
        config.showInUniversalPrompt !== false
    )
    .map(([type]) => type);
}

/**
 * Returns agents that use agent-specific skill directories (not universal).
 * These agents need symlinks from the canonical .agents/skills location.
 */
export function getNonUniversalAgents(): AgentType[] {
  return entries()
    .filter(([_, config]) => config.skillsDir !== '.agents/skills')
    .map(([type]) => type);
}
