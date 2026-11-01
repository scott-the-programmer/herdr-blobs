#!/usr/bin/env node
// Create labelled Herdr demos with scripted sessions or live Codex agents.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT), "..");
export const TYPES = ["pebble", "sprout", "ripple", "ember", "frost", "cosmic"];
export const STATES = ["working", "blocked", "done", "idle"];
const APPS = ["codex", "claude-code", "pi"];
const NAMES = ["Plan architecture", "Build garden", "Review changes", "Choose palette", "Run tests",
  "Write docs", "Trace context", "Design stars", "Fix keyboard", "Ship preview",
  "Audit launcher", "Tune motion", "Map sessions", "Check layout", "Profile render",
  "Polish faces", "Review types", "Verify focus", "Explore ideas", "Cosmic captain"];

// Small seeded generator so the default preset is the same on every run.
function seeded(seed) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function preset(count = 8) {
  // Best-candidate sampling fills the garden without aligned rows or clumps.
  const random = seeded(0);
  const positions = [];
  for (let i = 0; i < count; i++) {
    let best, bestScore = -Infinity;
    for (let c = 0; c < 128; c++) {
      const x = random(), y = random();
      let score = 4 * Math.min(x, y, 1 - x, 1 - y) ** 2;
      for (const [px, py] of positions) score = Math.min(score, (x - px) ** 2 + (y - py) ** 2);
      if (score > bestScore) { best = [x, y]; bestScore = score; }
    }
    positions.push(best);
  }
  const blobs = positions.map(([x, y], i) => {
    // Deliberately overrepresent rare types so every silhouette is visible.
    const type = i < count - 2 ? TYPES[i % 5] : "cosmic";
    const limit = [200000, 200000, 1000000, 200000][i % 4];
    const ratio = [0.02, 0.15, 0.40, 0.72, 0.98][i % 5];
    return { title: NAMES[i] ?? `Demo task ${i + 1}`, status: STATES[i % 4], app: APPS[i % 3],
      type, used: Math.trunc(limit * ratio), limit, x, y };
  });
  return { name: "Blobs demo", zoom: 0.6, blobs };
}

const finite = value => typeof value === "number" && Number.isFinite(value);

export function validate(config) {
  if (!config || typeof config !== "object" || !Array.isArray(config.blobs) || !config.blobs.length)
    throw new Error("Config needs a nonempty blobs array");
  if (typeof config.name !== "string" || !config.name.trim()) throw new Error("Config needs a space name");
  const zoom = config.zoom ?? 0.6;
  if (!finite(zoom) || zoom < 0.5 || zoom > 2) throw new Error("Zoom must be between 0.5 and 2");
  for (const blob of config.blobs) {
    if (!blob || typeof blob !== "object") throw new Error("Each blob must be an object");
    if (!TYPES.includes(blob.type) || !STATES.includes(blob.status)) throw new Error("Each blob needs a valid type and status");
    if (!APPS.includes(blob.app)) throw new Error("App must be codex, claude-code, or pi");
    const title = blob.title;
    if (typeof title !== "string" || !title || [...title].some(c => c.charCodeAt(0) < 32 || c === ":"))
      throw new Error("Titles must be nonempty and contain no control characters or colons");
    for (const key of ["used", "limit", "x", "y"]) if (!finite(blob[key])) throw new Error(`Invalid ${key}`);
    if (!(blob.used >= 0 && blob.used <= blob.limit) || blob.limit <= 0)
      throw new Error("Context must satisfy 0 <= used <= limit and limit > 0");
    if (blob.x < 0 || blob.x > 1 || blob.y < 0 || blob.y > 1) throw new Error("Positions must be between 0 and 1");
  }
  return config;
}

export function launchArgs(blob, live = false) {
  if (live) {
    const prompt = `Herdr Blobs demo task: ${blob.title}. `
      + "Read README.md and the relevant files in mods/ and tests/ in this repository. "
      + "Explain how the existing code relates to this task in a concise terminal report. "
      + "This is a read-only demonstration: do not edit files, install anything, "
      + "make network requests, or start other agents. Stop after your report.";
    return ["codex", "--no-daemon", "--sandbox", "read-only", "--ask-for-approval", "never", prompt];
  }
  return [process.execPath, SCRIPT, "--session", JSON.stringify(blob)];
}

// A scripted terminal: reports its status to Herdr and redraws nothing until it is closed.
function session(blob) {
  const { title, status, app } = blob;
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("data", data => { if (data.includes(3)) process.exit(0); });
  process.stdin.resume();
  setInterval(() => {}, 1 << 30); // Stay open until the tab closes, even if stdin ends.
  const out = text => process.stdout.write(text);
  out(`\x1b]0;${title}\x07`);
  const report = () => out(`\x1b]7501;state=${status}:app=${app}:title=${title}\x07`);
  process.on("SIGUSR1", report);
  report();
  out("\x1b[2J\x1b[H\x1b[?25l");
  out("\x1b[1;38;2;181;217;123m  BLOBS / DEMO WORKSPACE\x1b[0m\n\n");
  out(`  ${title}\n  ${status.toUpperCase()} / ${app} / ${blob.type}\n`);
  out(`  Context: ${blob.used.toLocaleString("en-US")} / ${blob.limit.toLocaleString("en-US")} tokens\n`);
  out("\n  Click blobs to switch sessions. Drag to rearrange. Zoom to inspect.\n");
  out("  Scripted demo data. No AI agents or API calls.\n");
}

const defaults = {
  output: (file, args) => execFileSync(file, args, { encoding: "utf8" }),
  which: name => { try { execFileSync("sh", ["-c", 'command -v "$1"', "sh", name], { stdio: "ignore" }); return true; } catch (_) { return false; } },
  kill: (pid, signal) => process.kill(pid, signal),
  print: text => console.log(text),
  error: text => console.error(text),
  readFile: path => readFileSync(path, "utf8"),
};

class UsageError extends Error {}

export function main(argv = process.argv.slice(2), io = {}) {
  io = { ...defaults, ...io };
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: {
      count: { type: "string", default: "8" }, config: { type: "string" },
      "dry-run": { type: "boolean" }, live: { type: "boolean" }, session: { type: "string" }, help: { type: "boolean", short: "h" }
    } }));
  } catch (error) { throw new UsageError(error.message); }
  if (values.help) {
    io.print("Usage: node demo/workspace.mjs [--count N] [--config FILE] [--dry-run] [--live]");
    return;
  }
  if (values.session) { session(JSON.parse(values.session)); return; }
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new UsageError("--count must be between 1 and 100");
  let config;
  try { config = validate(values.config ? JSON.parse(io.readFile(values.config)) : preset(count)); }
  catch (error) { throw new UsageError(error.message); }
  if (values["dry-run"]) { io.print(JSON.stringify(config, null, 2)); return; }
  const live = Boolean(values.live);
  if (live && !io.which("codex")) throw new UsageError("--live requires Codex CLI on PATH");
  const command = (action, args) => JSON.parse(io.output("herdr-app", ["do", action, JSON.stringify(args)]));
  // Capture the destination once; focus can change while sessions start.
  const status = JSON.parse(io.output("herdr-app", ["status"]));
  const run = randomUUID().replace(/-/g, "");
  const sessions = [];
  let space = status.space || null, createdSpace = false;
  try {
    config.blobs.forEach((blob, i) => {
      const argv = launchArgs(blob, live);
      let created;
      if (!space) {
        created = command("space.new", { name: config.name, tab: blob.title, folder: ROOT, argv });
        space = created.space;
        createdSpace = true;
      } else {
        created = command("tab.new", { space, name: blob.title, folder: ROOT, argv });
      }
      sessions.push(created);
      const properties = { type: blob.type, used: blob.used, limit: blob.limit, x: blob.x, y: blob.y, run };
      if (i === 0) properties.zoom = config.zoom ?? 0.6;
      io.output("hc", ["label", created.terminal, "blob.demo=" + JSON.stringify(properties)]);
    });
    command("tab.select", { id: sessions[0].tab });
    // Only scripted sessions handle SIGUSR1. Never signal a live coding agent.
    if (!live) for (const created of sessions) {
      const terminal = JSON.parse(io.output("hc", ["get", created.terminal]));
      if (terminal.reported && terminal.foreground) io.kill(terminal.foreground.pid, "SIGUSR1");
    }
    io.print(JSON.stringify({ space, created_space: createdSpace, run, live, sessions }, null, 2));
  } catch (error) {
    io.error(JSON.stringify({ error: "Demo incomplete", space, created_space: createdSpace, sessions }));
    io.error("Close only the recorded demo tabs to clean up.");
    throw error;
  }
}

const invoked = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
if (invoked) {
  try { main(); }
  catch (error) {
    if (error instanceof UsageError) { console.error(`workspace.mjs: error: ${error.message}`); process.exit(2); }
    throw error;
  }
}
