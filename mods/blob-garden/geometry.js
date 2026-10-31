const CELL_WIDTH = 128;
const CELL_HEIGHT = 208;
const GAP = 8;
const ORBIT_X = 14;
const ORBIT_Y = 10;
const PITCH_X = CELL_WIDTH + GAP + ORBIT_X * 2;
const PITCH_Y = CELL_HEIGHT + GAP + ORBIT_Y * 2;

function hash(address) {
  let value = 2166136261;
  for (const char of address) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}

// Scale a compact cluster to the measured field, including every label and hit target.
export function arrange(list, availableWidth, availableHeight) {
  const width = Math.max(1, availableWidth);
  const height = Math.max(1, availableHeight);
  const count = list.length;
  if (!count) return { placed: [], width, height, scale: 1, cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT };
  let best = { columns: 1, scale: 0, shape: Infinity };
  const preferredColumns = Math.sqrt(count * PITCH_Y / PITCH_X);
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const scale = Math.min(1, width / (columns * PITCH_X), height / (rows * PITCH_Y));
    const shape = Math.abs(columns - preferredColumns);
    if (scale > best.scale + 0.000001 || Math.abs(scale - best.scale) < 0.000001 && shape < best.shape) best = { columns, scale, shape };
  }
  const { columns, scale } = best;
  const rows = Math.ceil(count / columns);
  const pitchX = PITCH_X * scale;
  const pitchY = PITCH_Y * scale;
  const ordered = [...list].sort((a, b) => hash(a.address) - hash(b.address) || a.address.localeCompare(b.address));
  const placed = ordered.map((a, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const seed = hash(a.address);
    const x = (width - rowCount * pitchX) / 2 + column * pitchX + (ORBIT_X + 2 + seed % 5) * scale;
    const y = (height - rows * pitchY) / 2 + row * pitchY + (ORBIT_Y + 2 + (seed >>> 8) % 5) * scale;
    return { a, x, y, orbit: {
      left: { from: x - ORBIT_X * scale, to: x + ORBIT_X * scale, period: 90000 + seed % 5 * 6000 },
      top: { from: y + ORBIT_Y * scale, to: y - ORBIT_Y * scale, period: 120000 + (seed >>> 3) % 5 * 6000 }
    } };
  });
  return { placed, width, height, scale, cellWidth: CELL_WIDTH * scale, cellHeight: CELL_HEIGHT * scale };
}
