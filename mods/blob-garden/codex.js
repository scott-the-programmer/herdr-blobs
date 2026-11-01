// Codex context counters, read from Codex's own session logs on each terminal's machine.
// The shell side uses only POSIX tools (find, ls, head, tail, grep); all parsing happens here.

// Newest-first rollout logs from the last 30 days, each with the first 64 KiB of its first line.
export const LIST_SCRIPT = `dir="\${CODEX_HOME:-$HOME/.codex}/sessions"
[ -d "$dir" ] || exit 0
find "$dir" -type f -name 'rollout-*.jsonl' -mtime -30 -exec ls -t {} + 2>/dev/null | head -n 200 | while IFS= read -r f; do
  printf '%s\\t' "$f"; head -c 65536 "$f" | head -n 1; printf '\\n'
done`;

// For each log given as an argument: its path and its last token-count or compaction record,
// looking only at the final 8 MiB.
export const COUNT_SCRIPT = `for f in "$@"; do
  line=$(tail -c 8388608 "$f" 2>/dev/null | grep -E '"type": ?"(token_count|compacted)"' | tail -n 1)
  printf '%s\\t%s\\n' "$f" "$line"
done`;

const field = (text, key) => {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`));
  try { return match ? JSON.parse(match[1]) : null; } catch (_) { return null; }
};

const trimSlash = path => path && path.length > 1 ? path.replace(/[\\/]+$/, "") : path;

// One entry per log: { file, id, cwd }. A truncated first line still yields its fields.
export function parseListing(stdout) {
  const sessions = [];
  for (const line of String(stdout || "").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 1) continue;
    const file = line.slice(0, tab), meta = line.slice(tab + 1);
    if (!/"type"\s*:\s*"session_meta"/.test(meta)) continue;
    const name = file.split(/[\\/]/).pop();
    const id = field(meta, "id") || name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i)?.[1] || null;
    sessions.push({ file, id, cwd: trimSlash(field(meta, "cwd")) });
  }
  return sessions;
}

// Map each terminal to one log, or leave it out. A session label matches by id; otherwise the
// newest log in the terminal's directory, but only when no other unlabelled terminal shares it.
export function matchSessions(targets, sessions) {
  const shared = new Map();
  for (const t of targets) {
    if (t.session || !t.cwd) continue;
    const cwd = trimSlash(t.cwd);
    shared.set(cwd, (shared.get(cwd) || 0) + 1);
  }
  const matches = {};
  for (const t of targets) {
    let found;
    if (t.session) found = sessions.find(s => s.id === t.session || s.file.endsWith(`${t.session}.jsonl`));
    else if (t.cwd && shared.get(trimSlash(t.cwd)) === 1) found = sessions.find(s => s.cwd === trimSlash(t.cwd));
    if (found) matches[t.address] = found.file;
  }
  return matches;
}

// { used, limit } from a token_count record, or null for compaction or anything unreadable.
export function parseCounter(line) {
  try {
    const record = JSON.parse(line);
    const payload = record?.payload;
    if (record?.type !== "event_msg" || payload?.type !== "token_count") return null;
    const used = payload.info?.last_token_usage?.total_tokens;
    const limit = payload.info?.model_context_window;
    if (!Number.isFinite(used) || used < 0 || !Number.isFinite(limit) || limit <= 0) return null;
    return { used, limit };
  } catch (_) { return null; }
}

// Counters keyed by terminal address, from COUNT_SCRIPT output and the matches that chose each log.
export function parseCounts(stdout, matches) {
  const byFile = new Map();
  for (const line of String(stdout || "").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 1) continue;
    byFile.set(line.slice(0, tab), parseCounter(line.slice(tab + 1)));
  }
  const result = {};
  for (const [address, file] of Object.entries(matches)) {
    const counter = byFile.get(file);
    if (counter) result[address] = counter;
  }
  return result;
}

// Read counters for every target on one machine. `run(script, args)` resolves with { code, stdout }.
export async function readCounters(targets, run) {
  if (!targets.length) return {};
  const listing = await run(LIST_SCRIPT, []);
  if (listing.code !== 0) return {};
  const matches = matchSessions(targets, parseListing(listing.stdout));
  const files = [...new Set(Object.values(matches))];
  if (!files.length) return {};
  const counts = await run(COUNT_SCRIPT, files);
  return counts.code === 0 ? parseCounts(counts.stdout, matches) : {};
}
