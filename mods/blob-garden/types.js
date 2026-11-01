// Weights total 10,000: common 85%, rare 14%, ultra rare 1%.
export const TYPES = [
  { id: "pebble", name: "Pebble", rarity: "Common", weight: 3000, accent: "#b8c7ad", mark: "spots" },
  { id: "sprout", name: "Sprout", rarity: "Common", weight: 2800, accent: "#b5d97b", mark: "leaves" },
  { id: "ripple", name: "Ripple", rarity: "Common", weight: 2700, accent: "#92cfc3", mark: "ripples" },
  { id: "ember", name: "Ember", rarity: "Rare", weight: 700, accent: "#f2b477", mark: "flame" },
  { id: "frost", name: "Frost", rarity: "Rare", weight: 700, accent: "#b5dcf7", mark: "✦" },
  { id: "cosmic", name: "Cosmic", rarity: "Ultra rare", weight: 100, accent: "#e7b6fa", mark: "✧ ✦ ✧" }
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
