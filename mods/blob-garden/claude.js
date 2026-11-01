// Claude Code context counters, read from Claude Code's own transcripts on each terminal's machine.
// Claude Code writes sessions/<pid>.json for each running process, and Herdr knows the pid.
// The shell side uses only POSIX tools (head, sed, tail, awk); all parsing happens here.

export const WINDOW = 200000;
export const LONG_WINDOW = 1000000;

// For each pid given as an argument: the pid and the last few usage or compaction records from the
// final 8 MiB of that process's transcript. awk keeps only numbers and model names, never messages.
export const SCRIPT = `root="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
for pid in "$@"; do
  case "$pid" in ''|*[!0-9]*) continue ;; esac
  id=$(head -c 65536 "$root/sessions/$pid.json" 2>/dev/null | sed -n 's/.*"sessionId" *: *"\\([0-9a-fA-F-]\\{36\\}\\)".*/\\1/p' | head -n 1)
  [ -n "$id" ] || continue
  file= n=0
  for f in "$root"/projects/*/"$id".jsonl; do
    [ -f "$f" ] && file=$f && n=$((n + 1))
  done
  [ "$n" = 1 ] || continue
  tail -c 8388608 "$file" 2>/dev/null | awk -v pid="$pid" '
    function num(key,   s) {
      if (!match(u, "\\"" key "\\": *[0-9]+")) return ""
      s = substr(u, RSTART, RLENGTH); sub(/.*: */, "", s); return s
    }
    /"subtype": *"compact_boundary"/ { print pid "\\tC"; next }
    /"type": *"assistant"/ && /"usage": *\\{/ {
      u = $0
      while (match(u, /"usage": *\\{/)) u = substr(u, RSTART + RLENGTH)
      model = ""
      if (match($0, /"model": *"[^"]*"/)) { model = substr($0, RSTART, RLENGTH); sub(/^"model": *"/, "", model); sub(/"$/, "", model) }
      side = $0 ~ /"isSidechain": *true/ ? 1 : 0
      print pid "\\tA\\t" side "\\t" model "\\t" num("input_tokens") "\\t" num("cache_creation_input_tokens") "\\t" num("cache_read_input_tokens") "\\t" num("output_tokens")
    }' | tail -n 50
done`;

// { used, limit } from the newest main-thread reply, or null when a compaction follows it.
export function latestCounter(records) {
  for (let i = records.length - 1; i >= 0; i--) {
    const [kind, side, model, ...parts] = records[i];
    if (kind === "C") return null;
    if (kind !== "A" || side === "1" || model === "<synthetic>" || !/^\d+$/.test(parts[0] || "")) continue;
    const used = parts.reduce((sum, value) => sum + (/^\d+$/.test(value || "") ? Number(value) : 0), 0);
    // Transcripts do not record the window. Assume the standard one unless the model asks
    // for 1M or the counter has already passed the standard window.
    const limit = /\[1m\]/i.test(model) || used > WINDOW ? LONG_WINDOW : WINDOW;
    return { used, limit };
  }
  return null;
}

// Counters keyed by terminal address, from SCRIPT output.
export function parseCounts(stdout, targets) {
  const byPid = new Map();
  for (const line of String(stdout || "").split("\n")) {
    const [pid, ...record] = line.split("\t");
    if (!pid || !record.length) continue;
    if (!byPid.has(pid)) byPid.set(pid, []);
    byPid.get(pid).push(record);
  }
  const result = {};
  for (const t of targets) {
    const counter = latestCounter(byPid.get(String(t.pid)) || []);
    if (counter) result[t.address] = counter;
  }
  return result;
}

// Read counters for every target on one machine. `run(script, args)` resolves with { code, stdout }.
export async function readCounters(targets, run) {
  const pids = [...new Set(targets.map(t => t.pid).filter(pid => Number.isInteger(pid) && pid > 0))];
  if (!pids.length) return {};
  const counts = await run(SCRIPT, pids.map(String));
  return counts.code === 0 ? parseCounts(counts.stdout, targets) : {};
}
