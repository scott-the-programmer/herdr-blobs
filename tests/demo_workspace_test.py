import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('demo_workspace', Path(__file__).resolve().parents[1] / 'demo/workspace.py')
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)


class DemoTests(unittest.TestCase):
    def test_default_has_eight_varied_blobs(self):
        config = demo.validate(demo.preset())
        self.assertEqual(len(config['blobs']), 8)
        self.assertEqual(config['zoom'], 0.6)
        self.assertEqual({b['type'] for b in config['blobs']}, set(demo.TYPES))
        self.assertEqual({b['status'] for b in config['blobs']}, set(demo.STATES))
        self.assertEqual(len({(b['x'], b['y']) for b in config['blobs']}), 8)
        self.assertGreaterEqual(max(b['limit'] for b in config['blobs']), 1000000)
        self.assertEqual(len({b['used'] / b['limit'] for b in config['blobs']}), 5)

    def test_default_spreads_blobs_without_aligned_rows_or_columns(self):
        blobs = demo.preset()['blobs']
        self.assertEqual(len({b['x'] for b in blobs}), len(blobs))
        self.assertEqual(len({b['y'] for b in blobs}), len(blobs))
        for axis in ('x', 'y'):
            self.assertGreater(max(b[axis] for b in blobs) - min(b[axis] for b in blobs), 0.6)
        distances = [((a['x'] - b['x']) ** 2 + (a['y'] - b['y']) ** 2) ** 0.5
                     for i, a in enumerate(blobs) for b in blobs[i + 1:]]
        self.assertGreater(min(distances), 0.13)
        self.assertEqual(blobs, demo.preset()['blobs'])
        for count in (1, 6, 100):
            config = demo.validate(demo.preset(count))
            self.assertEqual(len(config['blobs']), count)

    def test_bad_config_never_opens_sessions(self):
        config = demo.preset()
        config['blobs'][0]['used'] = -1
        with patch.object(demo.subprocess, 'check_output') as call:
            with self.assertRaises(ValueError):
                demo.validate(config)
            call.assert_not_called()

    def test_creates_and_labels_exactly_eight_sessions(self):
        calls = []
        def command(action, **args):
            calls.append((action, args))
            return {'space': 'demo-space', 'tab': f'tab{len(calls)}', 'terminal': f't{len(calls)}'}
        def output(argv, **kwargs):
            return '{"space":"main-space"}' if argv == ['herdr-app', 'status'] else '{}'
        with patch.object(demo, 'command', side_effect=command), patch.object(demo.subprocess, 'check_output', side_effect=output) as core, patch('sys.argv', ['workspace.py']), patch('builtins.print') as printed:
            demo.main()
        self.assertEqual(sum(name == 'space.new' for name, _ in calls), 0)
        self.assertEqual(sum(name == 'tab.new' for name, _ in calls), 8)
        self.assertTrue(all(args['space'] == 'main-space' for name, args in calls if name == 'tab.new'))
        result = json.loads(printed.call_args.args[0])
        self.assertEqual(result['space'], 'main-space')
        self.assertFalse(result['created_space'])
        labels = [c.args[0] for c in core.call_args_list if c.args[0][1] == 'label']
        self.assertEqual(len(labels), 8)
        self.assertIn('"zoom": 0.6', labels[0][-1])
        self.assertTrue(all('blob.demo=' in c[-1] for c in labels))

    def test_creates_space_only_when_none_is_active(self):
        calls = []
        def command(action, **args):
            calls.append((action, args))
            return {'space': 'new-space', 'tab': f'tab{len(calls)}', 'terminal': f't{len(calls)}'}
        with patch.object(demo, 'command', side_effect=command), patch.object(demo.subprocess, 'check_output', return_value='{}'), patch('sys.argv', ['workspace.py', '--count', '2']), patch('builtins.print') as printed:
            demo.main()
        self.assertEqual([name for name, _ in calls], ['space.new', 'tab.new', 'tab.select'])
        self.assertEqual(calls[1][1]['space'], 'new-space')
        self.assertTrue(json.loads(printed.call_args.args[0])['created_space'])

    def test_live_mode_launches_read_only_agents_without_script_signals(self):
        calls = []
        def command(action, **args):
            calls.append((action, args))
            return {'space': 'live-space', 'tab': f'tab{len(calls)}', 'terminal': f't{len(calls)}'}
        def output(argv, **kwargs):
            return '{"space":"main-space"}' if argv == ['herdr-app', 'status'] else '{}'
        with patch.object(demo, 'command', side_effect=command), patch.object(demo.subprocess, 'check_output', side_effect=output), patch.object(demo.shutil, 'which', return_value='/bin/codex'), patch.object(demo.os, 'kill') as kill, patch('sys.argv', ['workspace.py', '--live', '--count', '2']), patch('builtins.print'):
            demo.main()
        launches = [args['argv'] for action, args in calls if action in ('space.new', 'tab.new')]
        self.assertEqual(len(launches), 2)
        self.assertTrue(all(action != 'space.new' for action, _ in calls))
        self.assertTrue(all(args['space'] == 'main-space' for action, args in calls if action == 'tab.new'))
        for argv in launches:
            self.assertEqual(argv[0], 'codex')
            self.assertIn('--no-daemon', argv)
            self.assertEqual(argv[argv.index('--sandbox') + 1], 'read-only')
            self.assertIn('do not edit files', argv[-1])
        kill.assert_not_called()


if __name__ == '__main__':
    unittest.main()
