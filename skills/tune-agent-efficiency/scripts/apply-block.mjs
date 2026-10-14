#!/usr/bin/env node
// Install or replace the marked agent-efficiency block in an instructions file.
// Usage: apply-block.mjs --file <path> --block <path> [--backup-dir <dir>] [--dry-run]
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const file = opt("file");
const blockPath = opt("block");
const backupDir = opt("backup-dir");
const dryRun = args.includes("--dry-run");
if (!file || !blockPath) {
  console.error("Usage: apply-block.mjs --file <path> --block <path> [--backup-dir <dir>] [--dry-run]");
  process.exit(2);
}

const START = "<!-- agent-efficiency:start -->";
const END = "<!-- agent-efficiency:end -->";
const LEGACY_START = "<!-- codex-efficiency:start -->";
const LEGACY_END = "<!-- codex-efficiency:end -->";

const block = fs.readFileSync(blockPath, "utf8").replace(/\r\n/g, "\n").trimEnd();
if (!block.startsWith(START) || !block.endsWith(END)) {
  console.error(`Block must start with ${START} and end with ${END}.`);
  process.exit(2);
}
if (/\{\{[A-Z_]+\}\}/.test(block)) {
  console.error("Block still contains unfilled {{PLACEHOLDER}} values.");
  process.exit(2);
}

const existed = fs.existsSync(file);
const stat = existed ? fs.statSync(file) : null;
const original = existed ? fs.readFileSync(file, "utf8") : "";
const eol = original.includes("\r\n") ? "\r\n" : "\n";
const text = original.replace(/\r\n/g, "\n");

let next;
const pairs = [[START, END], [LEGACY_START, LEGACY_END]];
let replaced = false;
for (const [s, e] of pairs) {
  const a = text.indexOf(s);
  const b = text.indexOf(e);
  if (a !== -1 && b > a) {
    next = text.slice(0, a) + block + text.slice(b + e.length);
    replaced = true;
    break;
  }
}
if (!replaced) {
  next = text.trim() === "" ? block + "\n" : text.replace(/\n*$/, "\n\n") + block + "\n";
}
next = next.replace(/\n/g, eol);

if (next === original) {
  console.log("unchanged");
  process.exit(0);
}
if (dryRun) {
  console.log(`would ${replaced ? "replace" : "append"} block in ${file}`);
  process.exit(0);
}

if (backupDir) {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const note = path.join(backupDir, `${path.basename(file)}.restore.txt`);
  if (existed) {
    fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
    fs.writeFileSync(note, `Restore: copy ${path.basename(file)} back to ${file}\n`);
  } else {
    fs.writeFileSync(note, `${file} was absent before this run; delete it to restore.\n`);
  }
}

const now = fs.existsSync(file) ? fs.statSync(file) : null;
if (existed !== Boolean(now) || (now && stat && now.mtimeMs !== stat.mtimeMs)) {
  console.error(`${file} changed during the run; aborting without writing.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(file), { recursive: true });
const tmp = `${file}.tmp-${process.pid}`;
fs.writeFileSync(tmp, next, { mode: stat ? stat.mode : 0o600 });
fs.renameSync(tmp, file);
console.log(replaced ? "replaced" : "appended");
