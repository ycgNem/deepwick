/**
 * Touchscreen play: a thumbstick that appears wherever the left thumb lands, a cluster of
 * buttons under the right thumb, and the world itself as the mouse (a finger on a block digs
 * it, a tap on a door or a bed opens it). The controls press keys just as the keyboard does,
 * so the game and the menus need no second set of rules.
 */
import type { Input } from './input';

/** what the controls need from the game each frame */
export interface TouchView {
  /** in play: no menu, title card or intro in the way */
  play: boolean;
  /** what the Use button would do right now, if anything */
  near: string | null;
}

/** how far the knob travels from the centre of the stick, in CSS pixels */
const STICK_R = 46;

export class TouchControls {
  private root: HTMLElement;
  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private useBtn: HTMLElement | null;
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  private keys = new Set<string>();
  private shown = false;
  private live = false;
  private lastNear: string | null = null;

  constructor(private input: Input) {
    this.root = document.getElementById('touch') as HTMLElement;
    this.zone = document.getElementById('tZone') as HTMLElement;
    this.base = document.getElementById('tBase') as HTMLElement;
    this.knob = document.getElementById('tKnob') as HTMLElement;
    this.useBtn = this.root.querySelector('.tb.use');

    // the stick: wherever the thumb lands in the left of the screen
    this.zone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (this.stickId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        this.stickId = t.identifier;
        const pad = STICK_R + 14;
        this.ox = Math.max(pad, Math.min(window.innerWidth - pad, t.clientX));
        this.oy = Math.max(pad, Math.min(window.innerHeight - pad, t.clientY));
        this.base.classList.add('held');
        this.base.style.left = `${this.ox}px`;
        this.base.style.top = `${this.oy}px`;
        this.moveStick(t.clientX, t.clientY);
      },
      { passive: false },
    );
    this.zone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) if (t.identifier === this.stickId) this.moveStick(t.clientX, t.clientY);
      },
      { passive: false },
    );
    const lift = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.stickId) this.releaseStick();
    };
    this.zone.addEventListener('touchend', lift);
    this.zone.addEventListener('touchcancel', lift);

    // the buttons hold their key down for as long as the finger stays on them
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-k]'))) {
      const code = b.dataset.k ?? '';
      b.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          b.classList.add('on');
          this.input.touchKey(code, true);
        },
        { passive: false },
      );
      const up = (e: TouchEvent): void => {
        e.preventDefault();
        b.classList.remove('on');
        this.input.touchKey(code, false);
      };
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
      // a mouse on a touch laptop still works them
      b.addEventListener('click', () => {
        this.input.touchKey(code, true);
        this.input.touchKey(code, false);
      });
    }
  }

  private moveStick(x: number, y: number): void {
    let dx = x - this.ox;
    let dy = y - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / STICK_R;
    const ny = dy / STICK_R;
    // sideways walks; well up climbs, well down climbs down or drops through
    this.hold('KeyA', nx < -0.32);
    this.hold('KeyD', nx > 0.32);
    this.hold('KeyW', ny < -0.6);
    this.hold('KeyS', ny > 0.6);
  }

  private releaseStick(): void {
    this.stickId = null;
    this.knob.style.transform = '';
    this.base.classList.remove('held');
    this.base.style.left = '';
    this.base.style.top = '';
    for (const k of [...this.keys]) this.hold(k, false);
  }

  private hold(code: string, on: boolean): void {
    if (on === this.keys.has(code)) return;
    if (on) this.keys.add(code);
    else this.keys.delete(code);
    this.input.touchKey(code, on);
  }

  /** each frame: show or hide, and let go of everything when a menu comes up */
  update(view: TouchView): void {
    const shown = this.input.usingTouch;
    if (shown !== this.shown) {
      this.shown = shown;
      document.body.classList.toggle('touch', shown);
    }
    const live = shown && view.play;
    if (live !== this.live) {
      this.live = live;
      this.root.classList.toggle('live', live);
      if (!live) {
        this.releaseStick();
        for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-k].on'))) {
          b.classList.remove('on');
          this.input.touchKey(b.dataset.k ?? '', false);
        }
      }
    }
    // the Use button lights up while there is something to use (its words float over your head)
    const near = live ? view.near : null;
    if (near !== this.lastNear) {
      this.lastNear = near;
      this.useBtn?.classList.toggle('ready', !!near);
    }
  }
}

/** tutorial text written for a keyboard, told for fingers instead */
export function forTouch(msg: string): string {
  return msg
    .replace(/\(top right, J\)/g, '(top right; tap it)')
    .replace(/Esc shows every control\./g, 'The ☰ button pauses.')
    .replace(/ \(E\)/g, ' (tap Use)')
    .replace(/\(E /g, '(tap Use ')
    .replace(/Press G, or click while holding it, to throw it/g, 'Tap while holding it to throw it')
    .replace(/\bF tops it up\b/g, 'the Oil button tops it up')
    .replace(/\bPress E\b/g, 'Tap Use')
    .replace(/\bpress E\b/g, 'tap Use')
    .replace(/\bpressing E\b/g, 'tapping Use')
    .replace(/Press Tab to open your inventory/g, 'Tap Pack to open your inventory')
    .replace(/\(Tab to craft\)/g, '(tap Pack to craft)')
    .replace(/\(Tab\)/g, '(tap Pack)')
    .replace(/\bRight-click\b/g, 'Tap')
    .replace(/\bright-click\b/g, 'tap')
    .replace(/\bClick\b/g, 'Tap')
    .replace(/\bclick\b/g, 'tap');
}

/** go fullscreen and sideways, where the browser allows it (it must follow a tap) */
export function goFullscreenLandscape(): void {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
          return o.lock?.('landscape');
        })
        .catch(() => undefined);
    }
  } catch {
    // no fullscreen here (iPhone Safari): the game still fits the screen
  }
}
