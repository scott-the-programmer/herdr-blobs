// Explicit terminal labels keep synthetic demo values separate from real telemetry.
const TYPE_IDS = new Set(["pebble", "sprout", "ripple", "ember", "frost", "cosmic"]);
export function demoProperties(labels) {
  try {
    const value = JSON.parse(labels?.["blob.demo"] || "null");
    if (!value || typeof value.run !== "string" || !value.run) return null;
    const result = { run: value.run };
    if (TYPE_IDS.has(value.type)) result.type = value.type;
    if (Number.isFinite(value.used) && value.used >= 0 && Number.isFinite(value.limit) && value.limit > 0 && value.used <= value.limit)
      result.context = { used: value.used, limit: value.limit };
    if (Number.isFinite(value.x) && Number.isFinite(value.y))
      result.pin = { x: Math.max(0, Math.min(1, value.x)), y: Math.max(0, Math.min(1, value.y)) };
    if (Number.isFinite(value.zoom) && value.zoom >= 0.5 && value.zoom <= 2) result.zoom = Math.round(value.zoom * 10) / 10;
    return result;
  } catch (_) { return null; }
}
