import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("blob_context", Path(__file__).resolve().parents[1] / "mods/blob-garden/context.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def event(used, limit=200000, cumulative=99999999):
    return json.dumps({"type": "event_msg", "payload": {"type": "token_count", "info": {
        "last_token_usage": {"total_tokens": used}, "total_token_usage": {"total_tokens": cumulative}, "model_context_window": limit}}})


class ContextReaderTests(unittest.TestCase):
    def test_latest_call_replaces_cumulative_and_compaction_shrinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "session.jsonl"
            path.write_text(event(150000) + '\n' + event(25000) + '\n{"unfinished":')
            self.assertEqual(reader.latest_context(path)["used"], 25000)
            self.assertEqual(reader.latest_context(path)["limit"], 200000)

    def test_names_and_directories_must_match_one_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            connection = sqlite3.connect(root / 'state_5.sqlite')
            connection.execute('create table threads (id text, name text, cwd text, rollout_path text, archived integer)')
            for session, cwd, used in [('one', '/work/a', 10000), ('two', '/work/b', 90000)]:
                path = root / (session + '.jsonl'); path.write_text(event(used))
                connection.execute('insert into threads values (?,?,?,?,0)', (session, 'Agent', cwd, str(path)))
            connection.commit()
            targets = [{'address': 't1', 'title': '⠋ Agent | a', 'cwd': '/work/a'}, {'address': 't2', 'title': 'Agent | b', 'cwd': '/work/b'}]
            result = reader.collect(targets, root)
            self.assertEqual(result['t1']['used'], 10000)
            self.assertEqual(result['t2']['used'], 90000)
            connection.execute('insert into threads values (?,?,?,?,0)', ('duplicate', 'Agent', '/work/a', str(root / 'one.jsonl')))
            connection.commit()
            self.assertNotIn('t1', reader.collect(targets, root))
            connection.close()

    def test_unknown_source_has_no_estimated_counter(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(reader.collect([{'address': 't1'}], Path(tmp)), {})
            path = Path(tmp) / 'empty.jsonl'; path.write_text('{"type":"response_item","payload":{"text":"private message"}}')
            self.assertIsNone(reader.latest_context(path))


if __name__ == '__main__':
    unittest.main()
