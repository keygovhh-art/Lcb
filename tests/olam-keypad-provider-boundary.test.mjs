import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../cloudflare/gavhah/olam-keypad-live.js', import.meta.url), 'utf8');

test('Olam 159 keypad map respects Yemot menus and SignalWire calling-only boundary', () => {
  assert.match(source, /digits\.startsWith\("159"\)\?"עולם החסד — ימות\/SignalWire"/);
  assert.match(source, /ימות־מעניוס, SignalWire בלויז פאר קאלינג/);
  assert.doesNotMatch(source, /digits\.startsWith\("159"\)\?"SignalWire"/);
});

test('Phone key documentation reserves star for back, hash for next and 0 for signup', () => {
  assert.match(source, /<b>\*<\/b> — צוריק איין מעניו/);
  assert.match(source, /<b>#<\/b> — קומענדיגע מעלדונג/);
  assert.match(source, /<b>0<\/b> — איינשרייבן אויפן הויפט מעניו/);
  assert.doesNotMatch(source, /<b>0<\/b> — צוריק איין מעניו/);
});
