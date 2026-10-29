import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme';

for (const value of [null, undefined, 'system', '', '<script>']) assert.equal(resolveTheme(value), 'light');
for (const value of ['light', 'dark', null, 'invalid', 'blocked']) {
  const root = { classList: { toggle: (name: string, on: boolean) => { assert.equal(name, 'dark'); dark = on; } }, style: { colorScheme: '' } };
  let dark = false;
  runInNewContext(THEME_INIT_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: (key: string) => {
    assert.equal(key, THEME_STORAGE_KEY);
    if (value === 'blocked') throw new Error('Storage disabled');
    return value;
  } } });
  assert.equal(dark, value === 'dark');
  assert.equal(root.style.colorScheme, value === 'dark' ? 'dark' : 'light');
}

// Guard actual text/background pairings against unreadable theme changes (WCAG AA).
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
function luminance(hsl: string) {
  const [h, s, l] = hsl.split(' ').map(parseFloat);
  const a = s / 100 * Math.min(l / 100, 1 - l / 100);
  const rgb = [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  });
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
for (const selector of [':root', '.dark']) {
  const block = css.slice(css.indexOf(selector + ' {')).split('}')[0];
  const values = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([\d.]+ [\d.]+% [\d.]+%);/g)].map(m => [m[1], luminance(m[2])]));
  for (const [fg, bg] of [['foreground', 'background'], ['card-foreground', 'card'], ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'], ['primary', 'card'], ['primary-foreground', 'primary'], ['primary-foreground', 'primary-deep'],
    ['popover-foreground', 'popover'], ['destructive', 'card'], ['destructive-foreground', 'destructive'],
    ['success', 'card'], ['warning', 'card'], ['info', 'card'], ['sidebar-foreground', 'sidebar-bg']]) {
    const ratio = (Math.max(values[fg], values[bg]) + .05) / (Math.min(values[fg], values[bg]) + .05);
    assert(ratio >= 4.5, `${selector} ${fg}/${bg}: contrast ${ratio.toFixed(2)} must be >= 4.5`);
  }
}
console.log('Theme bootstrap fallback and both palettes meet contrast checks.');
