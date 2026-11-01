#!/usr/bin/env python3
"""Create labelled Herdr demos with scripted sessions or live Codex agents."""
import argparse
import json
import math
import os
import random
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import termios
import uuid

ROOT = Path(__file__).resolve().parents[1]
TYPES = ("pebble", "sprout", "ripple", "ember", "frost", "cosmic")
STATES = ("working", "blocked", "done", "idle")
NAMES = ("Plan architecture", "Build garden", "Review changes", "Choose palette", "Run tests",
         "Write docs", "Trace context", "Design stars", "Fix keyboard", "Ship preview",
         "Audit launcher", "Tune motion", "Map sessions", "Check layout", "Profile render",
         "Polish faces", "Review types", "Verify focus", "Explore ideas", "Cosmic captain")


def preset(count=8):
    # Best-candidate sampling fills the garden without aligned rows or clumps.
    rng = random.Random(0)
    positions = []
    for _ in range(count):
        candidates = [(rng.random(), rng.random()) for _ in range(128)]
        def clearance(point):
            x, y = point
            distances = [(x - px) ** 2 + (y - py) ** 2 for px, py in positions]
            return min([4 * min(x, y, 1 - x, 1 - y) ** 2, *distances])
        positions.append(max(candidates, key=clearance))
    blobs = []
    for i in range(count):
        # Deliberately overrepresent rare types so every silhouette is visible.
        kind = ("pebble", "sprout", "ripple", "ember", "frost")[i % 5] if i < count - 2 else "cosmic"
        limit = (200_000, 200_000, 1_000_000, 200_000)[i % 4]
        ratio = (0.02, 0.15, 0.40, 0.72, 0.98)[i % 5]
        blobs.append({"title": NAMES[i] if i < len(NAMES) else f"Demo task {i + 1}",
                      "status": STATES[i % 4], "app": ("codex", "claude-code", "pi")[i % 3],
                      "type": kind, "used": int(limit * ratio), "limit": limit,
                      "x": positions[i][0], "y": positions[i][1]})
    return {"name": "Blobs demo", "zoom": 0.6, "blobs": blobs}


def validate(config):
    if not isinstance(config, dict) or not isinstance(config.get("blobs"), list) or not config["blobs"]:
        raise ValueError("Config needs a nonempty blobs array")
    if not isinstance(config.get("name"), str) or not config["name"].strip():
        raise ValueError("Config needs a space name")
    zoom = config.get("zoom", 0.6)
    if not isinstance(zoom, (int, float)) or not math.isfinite(zoom) or not 0.5 <= zoom <= 2:
        raise ValueError("Zoom must be between 0.5 and 2")
    for blob in config["blobs"]:
        if blob.get("type") not in TYPES or blob.get("status") not in STATES:
            raise ValueError("Each blob needs a valid type and status")
        if blob.get("app") not in ("codex", "claude-code", "pi"):
            raise ValueError("App must be codex, claude-code, or pi")
        title = blob.get("title")
        if not isinstance(title, str) or not title or any(ord(c) < 32 or c == ":" for c in title):
            raise ValueError("Titles must be nonempty and contain no control characters or colons")
        for key in ("used", "limit", "x", "y"):
            value = blob.get(key)
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"Invalid {key}")
        if not 0 <= blob["used"] <= blob["limit"] or blob["limit"] <= 0:
            raise ValueError("Context must satisfy 0 <= used <= limit and limit > 0")
        if not 0 <= blob["x"] <= 1 or not 0 <= blob["y"] <= 1:
            raise ValueError("Positions must be between 0 and 1")
    return config


def command(action, **args):
    return json.loads(subprocess.check_output(["herdr-app", "do", action, json.dumps(args)], text=True))


def launch_args(blob, live=False):
    if live:
        prompt = (
            f"Herdr Blobs demo task: {blob['title']}. "
            "Read README.md and the relevant files in mods/ and tests/ in this repository. "
            "Explain how the existing code relates to this task in a concise terminal report. "
            "This is a read-only demonstration: do not edit files, install anything, "
            "make network requests, or start other agents. Stop after your report."
        )
        return ["codex", "--no-daemon", "--sandbox", "read-only", "--ask-for-approval", "never", prompt]
    return [sys.executable, str(Path(__file__).resolve()), "--session", json.dumps(blob)]


def session(blob):
    attributes = termios.tcgetattr(sys.stdin)
    attributes[3] &= ~termios.ECHO
    termios.tcsetattr(sys.stdin, termios.TCSANOW, attributes)
    title, state, app = blob["title"], blob["status"], blob["app"]
    print("\033]0;" + title + "\007", end="")

    def report(*_):
        print(f"\033]7501;state={state}:app={app}:title={title}\007", end="", flush=True)

    signal.signal(signal.SIGUSR1, report)
    report()
    print("\033[2J\033[H\033[?25l", end="")
    print("\033[1;38;2;181;217;123m  BLOBS / DEMO WORKSPACE\033[0m\n")
    print(f"  {title}\n  {state.upper()} / {app} / {blob['type']}")
    print(f"  Context: {blob['used']:,} / {blob['limit']:,} tokens")
    print("\n  Click blobs to switch sessions. Drag to rearrange. Zoom to inspect.")
    print("  Scripted demo data. No AI agents or API calls.", flush=True)
    while True:
        signal.pause()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=8)
    parser.add_argument("--config", type=Path, help="JSON config; overrides --count")
    parser.add_argument("--dry-run", action="store_true", help="Print validated config without opening Herdr")
    parser.add_argument("--live", action="store_true", help="Launch interactive read-only Codex agents using the configured model")
    parser.add_argument("--session", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.session:
        session(json.loads(args.session))
        return
    if not 1 <= args.count <= 100:
        parser.error("--count must be between 1 and 100")
    try:
        config = validate(json.loads(args.config.read_text()) if args.config else preset(args.count))
    except (ValueError, OSError, TypeError, AttributeError) as error:
        parser.error(str(error))
    if args.dry_run:
        print(json.dumps(config, indent=2))
        return
    if args.live and not shutil.which("codex"):
        parser.error("--live requires Codex CLI on PATH")
    # Capture the destination once; focus can change while sessions start.
    status = json.loads(subprocess.check_output(["herdr-app", "status"], text=True))
    run = uuid.uuid4().hex
    sessions = []
    space_id = status.get("space")
    created_space = False
    try:
        for i, blob in enumerate(config["blobs"]):
            argv = launch_args(blob, args.live)
            common = dict(name=blob["title"], folder=str(ROOT), argv=argv)
            if not space_id:
                created = command("space.new", name=config["name"], tab=blob["title"], folder=str(ROOT), argv=argv)
                space_id = created["space"]
                created_space = True
            else:
                created = command("tab.new", space=space_id, **common)
            sessions.append(created)
            properties = {key: blob[key] for key in ("type", "used", "limit", "x", "y")}
            properties["run"] = run
            if i == 0:
                properties["zoom"] = config.get("zoom", 0.6)
            subprocess.check_output(["hc", "label", created["terminal"], "blob.demo=" + json.dumps(properties)], text=True)
        command("tab.select", id=sessions[0]["tab"])
        # Only scripted sessions implement SIGUSR1. Never signal a live coding agent.
        if not args.live:
            for created in sessions:
                terminal = json.loads(subprocess.check_output(["hc", "get", created["terminal"]], text=True))
                if terminal.get("reported") and terminal.get("foreground"):
                    os.kill(terminal["foreground"]["pid"], signal.SIGUSR1)
        print(json.dumps({"space": space_id, "created_space": created_space, "run": run,
                          "live": args.live, "sessions": sessions}, indent=2))
    except (subprocess.CalledProcessError, KeyError, OSError):
        print(json.dumps({"error": "Demo incomplete", "space": space_id,
                          "created_space": created_space, "sessions": sessions}), file=sys.stderr)
        print("Close only the recorded demo tabs to clean up.", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
