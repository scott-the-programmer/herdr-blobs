export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function spaceFor(address, all, panes, spaces) {
  const seen = new Set();
  while (address && !seen.has(address)) {
    seen.add(address);
    const tab = panes.find(p => p.terminal === address)?.tab;
    const space = spaces.find(s => s.tabs?.some(t => t.id === tab));
    if (space) return space;
    address = all.find(t => t.address === address)?.parent;
  }
  return null;
}

export function finished(before, after) {
  return before !== undefined && ((after === "done" && before !== "done")
    || (before === "working" && after === "idle"));
}
