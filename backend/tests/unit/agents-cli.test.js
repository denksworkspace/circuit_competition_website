import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parseAndExpand, setProtocolActive } from '../../../scripts/agents-cli.mjs';

function createFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-cli-'));
  for (const file of files) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'x');
  }
  return root;
}

describe('agents-cli', () => {
  it('expands add -safe -strict into add/fix/check with narrowed scope', () => {
    const root = createFixture([
      'AGENTS.md',
      'src/main.js',
      'src/only.js',
      'README.md',
      'node_modules/ignored.js',
    ]);

    const result = parseAndExpand(
      'add -safe -strict [DESIGN_AGENTS.md STRUCTURE_AGENTS.md] [src/main.js] {refactor}',
      root,
    );

    expect(result.ok).toBe(true);
    expect(result.prompt).toBe('{refactor}');
    expect(result.expandedCommands).toHaveLength(3);
    expect(result.expandedCommands[0]).toBe('add');
    expect(result.expandedCommands[1]).toContain('[STRUCTURE DESIGN] fix [src/main.js]');
    expect(result.expandedCommands[2]).toContain('[STRUCTURE DESIGN] check [src/main.js]');
    expect(result.expandedCommands[0]).not.toContain('-safe');
    expect(result.expandedCommands[0]).not.toContain('{refactor}');
    expect(result.expandedCommands[1]).not.toContain('node_modules/ignored.js');
    expect(result.expandedCommands[1]).not.toContain('src/only.js');
  });

  it('supports strict with implicit target bracket list (no -a)', () => {
    const root = createFixture(['AGENTS.md', 'src/main.js']);
    const result = parseAndExpand(
      'AGENTS.md add -brute -strict [DESIGN_AGENTS.md STRUCTURE_AGENTS.md] {test}',
      root,
    );

    expect(result.ok).toBe(true);
    expect(result.expandedCommands[1]).toContain('[STRUCTURE DESIGN] fix');
    expect(result.expandedCommands[2]).toContain('[STRUCTURE DESIGN] check');
  });

  it('requires exactly one mode flag for add', () => {
    const root = createFixture(['AGENTS.md', 'src/main.js']);
    const noMode = parseAndExpand('add -strict -a [ALL] -f [all] {x}', root);
    const bothModes = parseAndExpand('add -safe -brute -strict -a [ALL] -f [all] {x}', root);

    expect(noMode.ok).toBe(false);
    expect(noMode.error).toContain('exactly one mode flag');
    expect(bothModes.ok).toBe(false);
    expect(bothModes.error).toContain('exactly one mode flag');
  });

  it('expands direct check with default all targets/files', () => {
    const root = createFixture(['AGENTS.md', 'src/main.js']);
    const result = parseAndExpand('check {validate}', root);

    expect(result.ok).toBe(true);
    expect(result.prompt).toBe('{validate}');
    expect(result.expandedCommands).toHaveLength(1);
    expect(result.expandedCommands[0]).toContain('[STRUCTURE DESIGN SECURITY DEBUG PUSH OPTIMIZATION COMPILATION] check');
    expect(result.expandedCommands[0]).not.toContain('{validate}');
  });

  it('returns suggestion for unknown command', () => {
    const result = parseAndExpand('ad -safe {oops}');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('No such command');
    expect(result.suggestion).toBe('add');
  });

  it('does not auto-wrap free text into command', () => {
    const root = createFixture(['AGENTS.md', 'src/main.js']);
    const result = parseAndExpand('исправь баг в api и обнови тесты', root);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('No such command');
  });

  it('sets protocol flag for init and quit commands', () => {
    const root = createFixture(['AGENTS.md', 'src/main.js']);
    const statePath = path.join(root, '.agents/protocol_state.env');

    setProtocolActive(root, true);
    expect(fs.readFileSync(statePath, 'utf8')).toContain('AGENTS_PROTOCOL_ACTIVE=1');

    setProtocolActive(root, false);
    expect(fs.readFileSync(statePath, 'utf8')).toContain('AGENTS_PROTOCOL_ACTIVE=0');
  });
});
