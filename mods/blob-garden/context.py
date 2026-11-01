"""Read only Codex context counters; never return session messages."""
import json
import os
from pathlib import Path
import re
import sqlite3
import sys


def connect_readonly(path):
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=1)
    connection.row_factory = sqlite3.Row
    return connection


def title_name(title):
    return re.sub(r"^[^\w]+", "", (title or "").split(" | ")[0]).strip()


def latest_context(path):
    # Bounded reverse scan. Skip all non-counter records without parsing their content.
    with path.open("rb") as stream:
        stream.seek(0, 2)
        end = stream.tell()
        start = max(0, end - 8 * 1024 * 1024)
        stream.seek(start)
        lines = stream.read(end - start).splitlines()
    for line in reversed(lines):
        if b'"token_count"' not in line:
            continue
        try:
            event = json.loads(line)
            payload = event.get("payload", {})
            if event.get("type") != "event_msg" or payload.get("type") != "token_count":
                continue
            info = payload.get("info") or {}
            last = info.get("last_token_usage") or {}
            used = last.get("total_tokens")
            if used is None and isinstance(last.get("input_tokens"), (int, float)):
                used = last["input_tokens"] + last.get("output_tokens", 0)
            limit = info.get("model_context_window")
            if isinstance(used, (int, float)) and isinstance(limit, (int, float)) and used >= 0 and limit > 0:
                return {"used": used, "limit": limit, "source": "codex", "at": event.get("timestamp")}
        except (ValueError, TypeError):
            continue
    return None


def collect(targets, root):
    result = {}
    databases = sorted(root.glob("state_*.sqlite"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not databases:
        return result
    with connect_readonly(databases[0]) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(threads)")}
        if not {"id", "cwd", "rollout_path"}.issubset(columns):
            return result
        for target in targets:
            try:
                session = target.get("session")
                if session:
                    matches = connection.execute("SELECT id, rollout_path FROM threads WHERE id=?", (session,)).fetchall()
                elif "name" in columns and target.get("cwd") and title_name(target.get("title")):
                    matches = connection.execute("SELECT id, rollout_path FROM threads WHERE cwd=? AND name=? AND archived=0",
                                                 (target["cwd"], title_name(target.get("title")))).fetchall()
                else:
                    continue
                # Never guess between concurrent sessions with the same name and directory.
                if len(matches) != 1:
                    continue
                path = Path(matches[0]["rollout_path"]).resolve()
                if not path.is_relative_to(root.resolve()):
                    continue
                usage = latest_context(path)
                if usage:
                    result[target["address"]] = usage
            except (OSError, sqlite3.Error, ValueError):
                continue
    return result


if __name__ == "__main__":
    try:
        root = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
        print(json.dumps(collect(json.loads(sys.argv[1]), root)))
    except (OSError, sqlite3.Error, ValueError, IndexError):
        print("{}")
