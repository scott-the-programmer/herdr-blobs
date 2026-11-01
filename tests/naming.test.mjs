import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../mods/blob-garden/naming.js', import.meta.url), 'utf8');
const { topicName, blobName, tabRenames } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const claude = { key: 'claude', name: 'Claude Code' };
const opencode = { key: 'opencode', name: 'OpenCode' };

test('topic strips spinners and agent prefixes and rejects bare program names', () => {
  assert.equal(topicName('✳ Fix login bug', claude), 'Fix login bug');
  assert.equal(topicName('⠂ Fix login bug', claude), 'Fix login bug');
  assert.equal(topicName('OC | Auto name tabs skill', opencode), 'Auto name tabs skill');
  assert.equal(topicName('Blob drag offset', claude), 'Blob drag offset');
  assert.equal(topicName('✳ Claude Code', claude), null);
  assert.equal(topicName('OpenCode', opencode), null);
  assert.equal(topicName('', claude), null);
  assert.equal(topicName('a'.repeat(60), claude).length, 40);
});

test('blob name falls back to the program, then the address', () => {
  assert.equal(blobName({ title: '✳ Fix login bug', program: claude, address: 't1' }), 'Fix login bug');
  assert.equal(blobName({ title: '✳ Claude Code', program: claude, address: 't1' }), 'Claude Code');
  assert.equal(blobName({ title: '', program: null, address: 't1' }), 't1');
});

test('tabs get renamed only while the name is Herdr\'s, the launcher\'s, or ours', () => {
  const agents = [
    { tab: 'a', title: '✳ Fix login', program: claude },
    { tab: 'b', title: '✳ Fix login', program: claude },
    { tab: 'c', title: '✳ New topic', program: claude },
    { tab: 'd', title: '✳ Fix login', program: claude },
    { tab: 'e', title: '✳ Claude Code', program: claude },
    { tab: 'f', title: '✳ Fix login', program: claude }
  ];
  const spaces = [{ tabs: [
    { id: 'a', name: '2', named: false },
    { id: 'b', name: 'Claude Code', named: true },
    { id: 'c', name: 'Old topic', named: true },
    { id: 'd', name: 'my tab', named: true },
    { id: 'e', name: '3', named: false },
    { id: 'f', name: 'Fix login', named: true }
  ] }];
  assert.deepEqual(tabRenames(spaces, agents, { c: 'Old topic', d: 'Fix logi' }), [
    { id: 'a', name: 'Fix login' }, { id: 'b', name: 'Fix login' }, { id: 'c', name: 'New topic' }
  ]);
});
