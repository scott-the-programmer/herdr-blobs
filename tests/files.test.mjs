import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../mods/blob-files/open.js', import.meta.url), 'utf8');
const { openCommand } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('opens files with the platform default app', () => {
  assert.deepEqual(openCommand('/a b/c.js', 'macos'), ['open', ['/a b/c.js']]);
  assert.deepEqual(openCommand('/a/c.js', 'linux'), ['xdg-open', ['/a/c.js']]);
  assert.deepEqual(openCommand('C:\\a\\c.js', 'windows'), ['cmd', ['/c', 'start', '', 'C:\\a\\c.js']]);
});

test('falls back to xdg-open when the platform is unknown', () => {
  assert.deepEqual(openCommand('/a/c.js', undefined), ['xdg-open', ['/a/c.js']]);
});
