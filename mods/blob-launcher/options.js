const DEFAULT = { id: "default", label: "Default", detail: "Use the agent's existing configuration.", flags: [] };

export function family(agent) {
  const executable = (agent?.run?.[0] || "").replace(/\\/g, "/").split("/").pop().replace(/\.exe$/i, "");
  return ["codex", "claude"].includes(executable) ? executable : null;
}

export function modes(agent) {
  if (family(agent) === "codex") return [DEFAULT,
    { id: "read-only", label: "Read only", detail: "Read-only sandbox. Ask before commands that need approval.", flags: ["--sandbox", "read-only", "--ask-for-approval", "on-request"] },
    { id: "auto", label: "Workspace auto", detail: "Workspace-write sandbox. Commands run without approval prompts.", flags: ["--sandbox", "workspace-write", "--ask-for-approval", "never"] },
    { id: "yolo", label: "YOLO", detail: "Bypasses approval prompts and sandbox protections. Commands have unrestricted access.", flags: ["--dangerously-bypass-approvals-and-sandbox"] }];
  if (family(agent) === "claude") return [DEFAULT,
    { id: "plan", label: "Plan", detail: "Plan the task before making changes.", flags: ["--permission-mode", "plan"] },
    { id: "auto", label: "Accept edits", detail: "Accept file edits automatically. Other permission checks still apply.", flags: ["--permission-mode", "acceptEdits"] },
    { id: "yolo", label: "YOLO", detail: "Bypasses all Claude permission checks. Commands can access your files and network.", flags: ["--dangerously-skip-permissions"] }];
  return [DEFAULT];
}

function withoutOptions(argv, valued, switches) {
  const kept = [];
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].split("=")[0];
    if (valued.includes(name)) { if (!argv[i].includes("=")) i++; }
    else if (!switches.includes(name)) kept.push(argv[i]);
  }
  return kept;
}

export function launchRequest(agent, modeId, { space, folder, model, task } = {}) {
  if (!agent?.installed || !Array.isArray(agent.run) || !agent.run.length) throw new Error("Choose an installed agent.");
  const mode = modes(agent).find(m => m.id === modeId);
  if (!mode) throw new Error("This mode is not supported by the selected agent.");
  const provider = family(agent);
  let argv = [...agent.run];
  if (modeId !== "default") {
    argv = provider === "codex"
      ? withoutOptions(argv, ["--sandbox", "-s", "--ask-for-approval", "-a"], ["--yolo", "--full-auto", "--approve-for-me", "--dangerously-bypass-approvals-and-sandbox"])
      : withoutOptions(argv, ["--permission-mode"], ["--dangerously-skip-permissions"]);
  }
  argv.push(...mode.flags);
  if (model?.trim()) {
    if (!provider) throw new Error("Model selection is supported for Codex and Claude.");
    argv = withoutOptions(argv, ["--model", "-m"], []);
    argv.push("--model", model.trim());
  }
  const args = { name: agent.name, argv };
  if (folder?.trim()) args.folder = folder.trim();
  if (task?.trim()) args.task = task.trim();
  if (space) args.space = space;
  return { command: space ? "tab.new" : "space.new", args };
}
