/**
 * Key bindings. The game reads keys by their default codes (KeyE is interact, Space is jump, Tab is
 * the pack...), and the on-screen controls and the controller press those same codes for you. So a
 * rebinding is only a translation, applied to real key presses: the physical key you press becomes
 * the default code of the action it is bound to, and a default key whose action has moved elsewhere
 * does nothing. Everything downstream is untouched. Saved in this browser, for every world.
 */

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'interact' | 'pack' | 'journal' | 'map' | 'hook' | 'drop' | 'recall' | 'tonic' | 'oil';

export const ACTIONS: { id: Action; name: string; code: string }[] = [
  { id: 'left', name: 'Move left', code: 'KeyA' },
  { id: 'right', name: 'Move right', code: 'KeyD' },
  { id: 'up', name: 'Climb up', code: 'KeyW' },
  { id: 'down', name: 'Climb down', code: 'KeyS' },
  { id: 'jump', name: 'Jump, swim up', code: 'Space' },
  { id: 'interact', name: 'Talk, interact, ride', code: 'KeyE' },
  { id: 'pack', name: 'Pack & crafting', code: 'Tab' },
  { id: 'journal', name: 'Journal', code: 'KeyJ' },
  { id: 'map', name: 'Map', code: 'KeyM' },
  { id: 'hook', name: 'Grappling hook', code: 'KeyG' },
  { id: 'drop', name: 'Drop the held stack', code: 'KeyQ' },
  { id: 'recall', name: 'Recall to your bed', code: 'KeyR' },
  { id: 'tonic', name: 'Drink a tonic', code: 'KeyH' },
  { id: 'oil', name: 'Lamp oil', code: 'KeyF' },
];

/**
 * keys that keep their own jobs: pause, the hotbar numbers and the arrows (a second way to move); the
 * browser's own keys; and the lock keys, which some systems only report going down every other press
 */
const FIXED = new Set(['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'MetaLeft', 'MetaRight', 'ContextMenu', 'CapsLock', 'NumLock', 'ScrollLock', 'Pause', 'PrintScreen']);
for (let d = 0; d <= 9; d++) FIXED.add('Digit' + d);
for (let f = 1; f <= 24; f++) FIXED.add('F' + f);

const STORE = 'deepwick.keys';
const DEFAULT = Object.fromEntries(ACTIONS.map((a) => [a.id, a.code])) as Record<Action, string>;
const bound: Record<Action, string> = { ...DEFAULT };
let byKey = new Map<string, string>();
let moved = new Set<string>();

function rebuild(): void {
  byKey = new Map(ACTIONS.map((a) => [bound[a.id], a.code]));
  moved = new Set(ACTIONS.filter((a) => bound[a.id] !== a.code).map((a) => a.code));
}

function load(): void {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<Action, unknown>>;
      const used = new Set<string>();
      const next = { ...DEFAULT };
      let ok = true;
      for (const a of ACTIONS) {
        const c = saved[a.id];
        const code = typeof c === 'string' && c && !FIXED.has(c) ? c : a.code;
        if (used.has(code)) ok = false;
        used.add(code);
        next[a.id] = code;
      }
      if (ok) Object.assign(bound, next);
    }
  } catch {
    /* no storage here: the defaults stand */
  }
  rebuild();
}
load();

function save(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(bound));
  } catch {
    /* a private window: the keys last until the page closes */
  }
}

/** what a real key press means to the game */
export function canon(code: string): string {
  const c = byKey.get(code);
  if (c) return c;
  return moved.has(code) ? 'Unbound' : code;
}

/** bind an action to a key; whatever had that key takes this action's old one. False for a key that cannot be bound */
export function bind(a: Action, code: string): boolean {
  if (FIXED.has(code) || !code) return false;
  const other = ACTIONS.find((x) => bound[x.id] === code);
  if (other && other.id !== a) bound[other.id] = bound[a];
  bound[a] = code;
  rebuild();
  save();
  return true;
}

export function resetKeys(): void {
  Object.assign(bound, DEFAULT);
  rebuild();
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* nothing saved to clear */
  }
}

/** any key moved from where it started */
export function customKeys(): boolean {
  return moved.size > 0;
}

const NAMES: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  CapsLock: 'Caps',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Insert: 'Ins',
  Delete: 'Del',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return NAMES[code] ?? code;
}

/** the key an action is on, as you would write it */
export function keyName(a: Action): string {
  return keyLabel(bound[a]);
}

/** the ways the game's text names a key, and what each becomes (the one group, if any, is kept) */
const SAYS: [RegExp, (g?: string) => string][] = [
  [/\(E([) ])/g, (g) => `(${keyName('interact')}${g ?? ''}`],
  [/\b(Press|press|pressing) E\b/g, (g) => `${g ?? ''} ${keyName('interact')}`],
  [/\b(Press|press) G\b/g, (g) => `${g ?? ''} ${keyName('hook')}`],
  [/\bG lets go\b/g, () => `${keyName('hook')} lets go`],
  [/\bF tops it up\b/g, () => `${keyName('oil')} tops it up`],
  [/\bPress Tab\b/g, () => `Press ${keyName('pack')}`],
  [/\(Tab( to craft)?\)/g, (g) => `(${keyName('pack')}${g ?? ''})`],
  [/\(top right, J\)/g, () => `(top right, ${keyName('journal')})`],
  [/\bwith Space\b/g, () => `with ${keyName('jump')}`],
  [/\bSpace (to jump|jumps)\b/g, (g) => `${keyName('jump')} ${g ?? ''}`],
  [/\bA \/ D\b/g, () => `${keyName('left')} / ${keyName('right')}`],
  [/\bW (and|\/) S\b/g, (g) => `${keyName('up')} ${g ?? ''} ${keyName('down')}`],
];

/**
 * tutorial text written for the default keys, told with the keys you have chosen. One pass: what
 * one phrase becomes is set aside, so a later phrase can never rewrite it (E moved to Tab must not
 * then read as the pack's Tab)
 */
export function forKeys(msg: string): string {
  if (!customKeys()) return msg;
  const out: string[] = [];
  let s = msg;
  for (const [re, say] of SAYS) {
    s = s.replace(re, (_m: string, g?: unknown) => {
      out.push(say(typeof g === 'string' ? g : undefined));
      return `\u0000${out.length - 1}\u0001`;
    });
  }
  return s.replace(/\u0000(\d+)\u0001/g, (_m: string, i: string) => out[Number(i)] ?? '');
}
