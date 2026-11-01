// Builds the command that opens a local file the way a double-click in the system file manager would.
export function openCommand(path, platform) {
  if (platform === "windows") return ["cmd", ["/c", "start", "", path]];
  if (platform === "macos") return ["open", [path]];
  return ["xdg-open", [path]];
}
