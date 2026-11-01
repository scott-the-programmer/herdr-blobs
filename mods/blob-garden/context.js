export function contextSize(usage, scale = 1) {
  const known = Number.isFinite(usage?.used) && usage.used >= 0 && Number.isFinite(usage?.limit) && usage.limit > 0;
  const ratio = known ? Math.max(0, Math.min(1, usage.used / usage.limit)) : 0;
  const tokens = value => value >= 1000 ? `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k` : String(Math.round(value));
  return {
    known,
    // Circle area, rather than diameter, follows the fraction of context in use.
    diameter: Math.sqrt(81 ** 2 + (144 ** 2 - 81 ** 2) * ratio) * scale,
    label: known ? `${tokens(usage.used)} tokens · ${Math.round(ratio * 100)}%` : "Context unknown",
    detail: known ? `${Math.round(usage.used).toLocaleString()} / ${Math.round(usage.limit).toLocaleString()} context tokens` : "Context usage unavailable"
  };
}

export function terminalDirectory(terminal) {
  return terminal?.foreground?.cwd || terminal?.cwd || null;
}

export function directoryLabel(cwd) {
  if (!cwd) return "Directory unknown";
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.slice(-2).join("/") || "/";
}
