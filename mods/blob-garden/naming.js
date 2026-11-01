// Names for blobs and tabs, taken from the topic each agent writes into its terminal title.
// Claude Code sets titles like "✳ Fix login bug"; OpenCode sets "OC | Fix login bug".

const MAX = 40;
// Spinner and status glyphs agents put before the topic: braille spinners, Claude's stars, dots.
const LEAD = /^[\s⠀-⣿✢-✽·•*·•●○◐◑◒◓>|:\-]+/u;
const PREFIX = /^(OC|Codex|Claude|Claude Code|OpenCode)\s*[|:\-]\s*/i;
const GENERIC = /^(claude( code)?|codex|opencode|pi|agent|zsh|bash|fish|sh|shell|terminal|\d+)$/i;

// The topic in a terminal title, or null when the title only names the program.
export function topicName(title, program) {
  let text = String(title || "").replace(LEAD, "");
  for (let previous; previous !== text;) { previous = text; text = text.replace(PREFIX, "").replace(LEAD, ""); }
  text = text.replace(/\s+/g, " ").trim();
  if (!text || GENERIC.test(text) || text.toLowerCase() === String(program?.name || "").toLowerCase()) return null;
  return text.length > MAX ? text.slice(0, MAX - 1).trimEnd() + "…" : text;
}

// A blob's label: its topic, else the program, else the address.
export function blobName(agent) {
  return topicName(agent?.title, agent?.program) || agent?.program?.name || agent?.title || agent?.address;
}

// tab.rename requests for tabs whose name Herdr or this mod chose. A tab is ours to rename when
// nobody named it, when it still carries its agent's program name (the launcher's old default),
// or when it still carries the name this mod gave it last time. Anything else is the person's.
// `given` maps tab id to the name this mod last gave it; the result says what to record.
export function tabRenames(spaces, agents, given = {}) {
  const renames = [];
  for (const space of spaces || []) {
    for (const tab of space.tabs || []) {
      const agent = (agents || []).find(a => a.tab === tab.id && topicName(a.title, a.program));
      if (!agent) continue;
      const topic = topicName(agent.title, agent.program);
      if (tab.name === topic) continue;
      const ours = !tab.named || tab.name === given[tab.id] || GENERIC.test(tab.name)
        || (agents || []).some(a => a.tab === tab.id && a.program?.name === tab.name);
      if (ours) renames.push({ id: tab.id, name: topic });
    }
  }
  return renames;
}
