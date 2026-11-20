'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { toEvent } = require('../lib/events');

const root = path.resolve('/tmp/proj');
const mem = path.join(root, '.project-memory');
const now = new Date('2026-11-19T10:00:00.000Z');
const ts = now.toISOString();

function post(tool, tool_input) {
  return toEvent({ hook_event_name: 'PostToolUse', tool_name: tool, tool_input }, root, mem, now);
}

test('UserPromptSubmit -> prompt event', () => {
  const e = toEvent({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' }, root, mem, now);
  assert.deepStrictEqual(e, { ts, type: 'prompt', text: 'hello' });
});

test('prompt truncated to 300', () => {
  const e = toEvent({ hook_event_name: 'UserPromptSubmit', prompt: 'x'.repeat(500) }, root, mem, now);
  assert.strictEqual(e.text.length, 300);
});

test('Edit -> tool event with relative file', () => {
  const e = post('Edit', { file_path: path.join(root, 'src', 'a.js') });
  assert.deepStrictEqual(e, { ts, type: 'tool', tool: 'Edit', files: ['src/a.js'] });
});

test('Write and MultiEdit -> tool events', () => {
  for (const tool of ['Write', 'MultiEdit']) {
    const e = post(tool, { file_path: path.join(root, 'b.js') });
    assert.deepStrictEqual(e, { ts, type: 'tool', tool, files: ['b.js'] });
  }
});

test('NotebookEdit uses notebook_path, falls back to file_path', () => {
  let e = post('NotebookEdit', { notebook_path: path.join(root, 'n.ipynb') });
  assert.deepStrictEqual(e, { ts, type: 'tool', tool: 'NotebookEdit', files: ['n.ipynb'] });
  e = post('NotebookEdit', { file_path: path.join(root, 'm.ipynb') });
  assert.deepStrictEqual(e.files, ['m.ipynb']);
});

test('Bash -> tool event with cmd', () => {
  assert.deepStrictEqual(post('Bash', { command: 'ls -la' }), { ts, type: 'tool', tool: 'Bash', cmd: 'ls -la', isCommit: false });
});

test('Bash cmd truncated to 200', () => {
  assert.strictEqual(post('Bash', { command: 'e'.repeat(400) }).cmd.length, 200);
});

test('Bash git commit -m x isCommit true', () => {
  assert.strictEqual(post('Bash', { command: 'git commit -m x' }).isCommit, true);
});

test('git log | grep commit isCommit false', () => {
  assert.strictEqual(post('Bash', { command: 'git log | grep commit' }).isCommit, false);
});

test('PreCompact -> compact event', () => {
  const e = toEvent({ hook_event_name: 'PreCompact', trigger: 'auto' }, root, mem, now);
  assert.deepStrictEqual(e, { ts, type: 'compact', trigger: 'auto' });
});

test('SessionEnd -> end event', () => {
  const e = toEvent({ hook_event_name: 'SessionEnd', reason: 'clear' }, root, mem, now);
  assert.deepStrictEqual(e, { ts, type: 'end', reason: 'clear' });
});

test('Edit inside .project-memory returns null', () => {
  assert.strictEqual(post('Edit', { file_path: path.join(mem, 'state', 'x.md') }), null);
});

test('Read tool returns null', () => {
  assert.strictEqual(post('Read', { file_path: path.join(root, 'a.js') }), null);
});

test('unknown event returns null', () => {
  assert.strictEqual(toEvent({ hook_event_name: 'Stop' }, root, mem, now), null);
});

test('Windows backslash file_path becomes forward-slash relative', { skip: process.platform !== 'win32' }, () => {
  const winRoot = 'C:\\Proj\\App';
  const e = toEvent(
    { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\Proj\\App\\src\\x.js' } },
    winRoot,
    path.join(winRoot, '.project-memory'),
    now
  );
  assert.deepStrictEqual(e.files, ['src/x.js']);
});

test('Bash running the plugin session-log.js script is not logged', () => {
  const cmd = 'node "C:\\Users\\me\\.claude\\plugins\\project-memory\\scripts\\session-log.js" done "C:\\proj" "abc"';
  assert.strictEqual(post('Bash', { command: cmd }), null);
});

test('Bash running the plugin init-memory.js script is not logged', () => {
  assert.strictEqual(post('Bash', { command: 'node "/home/me/plugins/project-memory/scripts/init-memory.js" /proj --name X' }), null);
});

test('unrelated Bash command is still logged', () => {
  assert.strictEqual(post('Bash', { command: 'node scripts/build.js' }).cmd, 'node scripts/build.js');
});

test('git commit mentioning a plugin script name is still logged as a commit', () => {
  const e = post('Bash', { command: 'git commit -m "fix session-log.js"' });
  assert.ok(e, 'commit was dropped');
  assert.strictEqual(e.isCommit, true);
});

test('node calls to each plugin script are not logged', () => {
  for (const s of ['session-log', 'init-memory', 'move-docs']) {
    assert.strictEqual(post('Bash', { command: `node "/home/me/plugins/project-memory/scripts/${s}.js" /proj x` }), null, s);
    assert.strictEqual(post('Bash', { command: `node /opt/pm/scripts/${s}.js /proj x` }), null, s);
    assert.strictEqual(
      post('Bash', { command: `node "C:\\Users\\Jane Doe\\.claude\\plugins\\pm\\scripts\\${s}.js" "C:\\proj" x` }),
      null,
      `${s} (path with spaces)`
    );
  }
});

test('the plugin config.js (dead-ends) is not logged; other config.js runs are', () => {
  assert.strictEqual(post('Bash', { command: 'node "C:\\Users\\Jane Doe\\.claude\\plugins\\pm\\scripts\\config.js" "C:\\proj" dead-ends on' }), null);
  assert.strictEqual(post('Bash', { command: 'node /opt/pm/scripts/config.js /proj dead-ends' }), null);
  for (const cmd of ['node scripts/config.js --check', 'node webpack.config.js', 'node config.js']) {
    assert.ok(post('Bash', { command: cmd }), cmd);
  }
});
