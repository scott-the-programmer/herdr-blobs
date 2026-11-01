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

// Sub-agents drift with their root ancestor, so the tether to their parent stays attached.
export function attachField(field) {
  const byAddress = new Map(field.placed.map(p => [p.a.address, p]));
  const rootOf = p => {
    const seen = new Set([p.a.address]);
    let root = p;
    while (byAddress.has(root.a.parent) && !seen.has(root.a.parent)) {
      root = byAddress.get(root.a.parent);
      seen.add(root.a.address);
    }
    return root;
  };
  const tethers = [];
  const placed = field.placed.map(p => {
    const parent = byAddress.get(p.a.parent);
    if (!parent || parent === p) return p;
    const root = rootOf(p);
    const dx = p.x - root.x, dy = p.y - root.y;
    const left = root.orbit.left, top = root.orbit.top;
    tethers.push({ parent, child: p, drift: {
      left: { ...left, from: left.from - root.x, to: left.to - root.x },
      top: { ...top, from: top.from - root.y, to: top.to - root.y }
    } });
    return { ...p, root: root.a.address, orbit: {
      left: { ...left, from: left.from + dx, to: left.to + dx },
      top: { ...top, from: top.from + dy, to: top.to + dy }
    } };
  });
  return { ...field, placed, tethers };
}

// Every placed blob whose parent chain reaches `address`, excluding `address` itself.
export function descendants(placed, address) {
  const found = new Set([address]);
  let added = true;
  while (added) {
    added = false;
    for (const p of placed) {
      if (!found.has(p.a.address) && found.has(p.a.parent)) { found.add(p.a.address); added = true; }
    }
  }
  found.delete(address);
  return [...found];
}
