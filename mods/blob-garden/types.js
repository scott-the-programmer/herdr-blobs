// Weights total 10,000: common 85%, rare 14%, ultra rare 1%.
export const TYPES = [
  { id: "pebble", name: "Pebble", rarity: "Common", weight: 3000, accent: "#bdae93", mark: "spots" },
  { id: "sprout", name: "Sprout", rarity: "Common", weight: 2800, accent: "#b8bb26", mark: "leaves" },
  { id: "ripple", name: "Ripple", rarity: "Common", weight: 2700, accent: "#8ec07c", mark: "ripples" },
  { id: "ember", name: "Ember", rarity: "Rare", weight: 700, accent: "#fe8019", mark: "flame" },
  { id: "frost", name: "Frost", rarity: "Rare", weight: 700, accent: "#83a598", mark: "✦" },
  { id: "cosmic", name: "Cosmic", rarity: "Ultra rare", weight: 100, accent: "#d3869b", mark: "✧ ✦ ✧" }
];

export function typeForRoll(roll) {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10000) throw new RangeError("Blob roll must be an integer from 0 to 9999");
  let boundary = 0;
  for (const type of TYPES) {
    boundary += type.weight;
    if (roll < boundary) return type;
  }
}

// Stable across renders and reloads. Mix sequential terminal addresses before rolling.
export function blobType(address) {
  let hash = 2166136261;
  for (const char of address) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return typeForRoll((hash >>> 0) % 10000);
}
