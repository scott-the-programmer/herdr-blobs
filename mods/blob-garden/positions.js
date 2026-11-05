// Pins use fit-relative coordinates and may extend beyond the fitted cluster.
export function pinAt(x, y, field) {
  const marginX = 14 * field.scale, marginY = 10 * field.scale;
  const rangeX = Math.max(1, field.width - field.cellWidth - marginX * 2);
  const rangeY = Math.max(1, field.height - field.cellHeight - marginY * 2);
  return { x: (x - marginX) / rangeX, y: (y - marginY) / rangeY };
}

export function positionField(field, pins = {}, pan = { x: 0, y: 0 }, zoom = 1) {
  const offsetX = field.width / 2 * (1 - zoom) + (Number.isFinite(pan?.x) ? pan.x : 0);
  const offsetY = field.height / 2 * (1 - zoom) + (Number.isFinite(pan?.y) ? pan.y : 0);
  return { ...field, scale: field.scale * zoom, cellWidth: field.cellWidth * zoom,
    cellHeight: field.cellHeight * zoom, placed: field.placed.map(p => {
    const pin = pins[p.a.address];
    let x = p.x, y = p.y;
    if (Number.isFinite(pin?.x) && Number.isFinite(pin?.y)) {
      const marginX = 14 * field.scale, marginY = 10 * field.scale;
      x = marginX + pin.x * Math.max(1, field.width - field.cellWidth - marginX * 2);
      y = marginY + pin.y * Math.max(1, field.height - field.cellHeight - marginY * 2);
    }
    const dx = x - p.x, dy = y - p.y;
    return { ...p, x: x * zoom + offsetX, y: y * zoom + offsetY, orbit: {
      left: { ...p.orbit.left, from: (p.orbit.left.from + dx) * zoom + offsetX, to: (p.orbit.left.to + dx) * zoom + offsetX },
      top: { ...p.orbit.top, from: (p.orbit.top.from + dy) * zoom + offsetY, to: (p.orbit.top.to + dy) * zoom + offsetY }
    } };
  }) };
}

// Pins that scatter the fitted rows across the field around the camera's current center,
// so a tidy gathers every blob back into view without moving the camera. Each row gets an
// even band of the field and each blob a random spot in its share, close enough to the
// center that neighbours' labels never overlap.
export function tidyPins(field, pan = { x: 0, y: 0 }, zoom = 1, random = Math.random) {
  const z = zoom > 0 ? zoom : 1;
  const panX = Number.isFinite(pan?.x) ? pan.x / z : 0, panY = Number.isFinite(pan?.y) ? pan.y / z : 0;
  const pitchX = field.cellWidth + 36 * field.scale, pitchY = field.cellHeight + 28 * field.scale;
  const rows = [];
  for (const p of [...field.placed].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find(r => Math.abs(r[0].y - p.y) < pitchY / 2);
    if (row) row.push(p); else rows.push([p]);
  }
  const jitter = spread => (random() * 2 - 1) * spread;
  const bandY = Math.max(pitchY, field.height / Math.max(1, rows.length));
  const minX = 14 * field.scale, maxX = Math.max(minX, field.width - field.cellWidth - minX);
  const minY = 10 * field.scale, maxY = Math.max(minY, field.height - field.cellHeight - minY);
  const pins = {};
  rows.forEach((row, r) => {
    row.sort((a, b) => a.x - b.x);
    const bandX = Math.max(pitchX, field.width / row.length);
    const centerY = field.height / 2 + (r - (rows.length - 1) / 2) * bandY;
    row.forEach((p, c) => {
      const centerX = field.width / 2 + (c - (row.length - 1) / 2) * bandX;
      const x = centerX + jitter((bandX - pitchX) / 2 + 0.12 * pitchX) - field.cellWidth / 2;
      const y = centerY + jitter((bandY - pitchY) / 2 + 0.08 * pitchY) - field.cellHeight / 2;
      pins[p.a.address] = pinAt(Math.min(maxX, Math.max(minX, x)) - panX, Math.min(maxY, Math.max(minY, y)) - panY, field);
    });
  });
  return pins;
}

// Split blobs into roots, which get a grid cell, and sub-agents, which ride under their root
// as small moons. A root's moons are its descendants in depth-first order, so a sub-agent's own
// sub-agents sit next to it. A blob caught in a parent cycle stays a root.
export function moonsOf(list) {
  const byAddress = new Map(list.map(a => [a.address, a]));
  const isRoot = a => {
    const seen = new Set([a.address]);
    for (let p = byAddress.get(a.parent); p; p = byAddress.get(p.parent)) {
      if (seen.has(p.address)) return p.address === a.address;
      seen.add(p.address);
    }
    return !byAddress.has(a.parent);
  };
  const roots = list.filter(isRoot);
  const moons = new Map();
  const claimed = new Set(roots.map(a => a.address));
  for (const root of roots) {
    const found = [];
    const visit = address => {
      for (const a of list) {
        if (a.parent !== address || claimed.has(a.address)) continue;
        claimed.add(a.address);
        found.push(a);
        visit(a.address);
      }
    };
    visit(root.address);
    moons.set(root.address, found);
  }
  return { roots, moons };
}

// A centred row of `count` moons under the parent body, wrapping onto more rows when they
// outgrow `width`. Spots are centre offsets from the middle of the row block's top edge.
export function moonSpots(count, width, size, gap) {
  if (!count) return { spots: [], height: 0 };
  const perRow = Math.max(1, Math.floor((width + gap) / (size + gap)));
  const rows = Math.ceil(count / perRow);
  const spots = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow), column = i % perRow;
    const inRow = Math.min(perRow, count - row * perRow);
    spots.push({ x: (column - (inRow - 1) / 2) * (size + gap), y: row * (size + gap) + size / 2 });
  }
  return { spots, height: rows * size + (rows - 1) * gap };
}
