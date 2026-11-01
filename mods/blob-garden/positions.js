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
