/** standard-mapping gamepad buttons */
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseLeft = false;
  mouseRight = false;
  mouseLeftPressed = false;
  mouseRightPressed = false;
  wheel = 0;
  /** set while a DOM menu has focus so game keys are ignored */
  blocked = false;

  // ---- controller
  /** the last thing touched was a controller: aim comes from the right stick, menus get a pointer */
  usingPad = false;
  /** right stick, for aiming in play */
  aimX = 0;
  aimY = 0;
  /** left stick, for aiming down at your feet when nothing else is aimed */
  moveY = 0;
  /** keys the controller is holding down on the keyboard's behalf */
  private padKeys = new Set<string>();
  /** buttons held across a switch between play and a menu: ignored until let go */
  private latched = new Set<number>();
  private prevButtons: boolean[] = [];
  private lastMenu = false;
  private cursor: HTMLElement | null = null;
  private cx = window.innerWidth / 2;
  private cy = window.innerHeight / 2;
  private hoverEl: Element | null = null;
  private wasPadMouseL = false;
  private wasPadMouseR = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.isTrusted) this.usingPad = false;
      if (e.repeat) return;
      const k = e.code;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      this.down.add(k);
      this.pressed.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseLeft = false;
      this.mouseRight = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (e.isTrusted && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.usingPad = false;
    });
    target.addEventListener('mousemove', (e) => {
      const r = target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.isTrusted) this.usingPad = false;
      if (e.button === 0) {
        this.mouseLeft = true;
        this.mouseLeftPressed = true;
      } else if (e.button === 2) {
        this.mouseRight = true;
        this.mouseRightPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      else if (e.button === 2) this.mouseRight = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('gamepadconnected', () => {
      this.usingPad = true;
    });
  }

  isDown(...codes: string[]): boolean {
    if (this.blocked) return false;
    return codes.some((c) => this.down.has(c));
  }
  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }
  /** forget a key press so the game does not also act on it (the UI already did) */
  consume(code: string): void {
    this.pressed.delete(code);
  }
  /** call at the end of each frame */
  endFrame(): void {
    this.pressed.clear();
    this.mouseLeftPressed = false;
    this.mouseRightPressed = false;
    this.wheel = 0;
  }

  // ------------------------------------------------------------------ controller
  /**
   * Read the first connected controller. In play its buttons stand in for keys and mouse
   * buttons; in a menu (or on the title) it drives an on-screen pointer that clicks the DOM.
   */
  pollPad(dt: number, menu: boolean): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }
    if (!gp) {
      this.releaseAll();
      this.showCursor(false);
      return;
    }
    const raw = gp.buttons.map((b) => b.pressed || b.value > 0.45);
    const axis = (i: number): number => {
      const v = gp?.axes[i] ?? 0;
      return Math.abs(v) < 0.2 ? 0 : v;
    };
    if (raw.some(Boolean) || gp.axes.some((v) => Math.abs(v) > 0.4)) this.usingPad = true;
    if (!this.usingPad) {
      this.prevButtons = raw;
      return;
    }
    // a button held while play and menus swap over does nothing until it is let go
    if (menu !== this.lastMenu) {
      raw.forEach((on, i) => on && this.latched.add(i));
      this.releaseAll();
      this.lastMenu = menu;
    }
    for (const i of [...this.latched]) if (!raw[i]) this.latched.delete(i);
    const held = (i: number): boolean => !!raw[i] && !this.latched.has(i);
    const tapped = (i: number): boolean => held(i) && !this.prevButtons[i];
    const lx = axis(0);
    const ly = axis(1);
    const rx = axis(2);
    const ry = axis(3);
    const want = new Set<string>();

    if (menu) {
      this.aimX = 0;
      this.aimY = 0;
      this.moveY = 0;
      this.showCursor(true);
      // the pointer: left stick, or the d-pad for fine moves
      let vx = lx;
      let vy = ly;
      if (held(PAD.LEFT)) vx = -0.35;
      if (held(PAD.RIGHT)) vx = 0.35;
      if (held(PAD.UP)) vy = -0.35;
      if (held(PAD.DOWN)) vy = 0.35;
      const mag = Math.hypot(vx, vy);
      if (mag > 0) {
        const sp = 1300 * Math.pow(Math.min(1, mag), 1.6);
        this.cx = Math.max(0, Math.min(window.innerWidth - 2, this.cx + (vx / mag) * sp * dt));
        this.cy = Math.max(0, Math.min(window.innerHeight - 2, this.cy + (vy / mag) * sp * dt));
        this.moveCursor();
      }
      // the right stick scrolls whatever is under the pointer
      if (ry !== 0) {
        let el = document.elementFromPoint(this.cx, this.cy);
        while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
        if (el) el.scrollTop += ry * 900 * dt;
      }
      if (tapped(PAD.A)) this.clickAt(0);
      if (tapped(PAD.X)) this.clickAt(2);
      if (held(PAD.B) || held(PAD.START)) want.add('Escape');
      if (held(PAD.Y)) want.add('Tab');
      if (held(PAD.BACK)) want.add('KeyM');
      this.setMouse(false, false);
    } else {
      this.showCursor(false);
      if (lx < -0.4) want.add('KeyA');
      if (lx > 0.4) want.add('KeyD');
      if (ly < -0.6) want.add('KeyW');
      if (ly > 0.6) want.add('KeyS');
      if (held(PAD.A)) want.add('Space');
      if (held(PAD.B)) want.add('KeyE');
      if (held(PAD.Y)) want.add('Tab');
      if (held(PAD.BACK)) want.add('KeyM');
      if (held(PAD.START)) want.add('Escape');
      if (held(PAD.L3)) want.add('KeyG');
      if (held(PAD.R3)) want.add('KeyQ');
      if (held(PAD.UP)) want.add('KeyH');
      if (held(PAD.DOWN)) want.add('KeyR');
      if (held(PAD.LEFT)) want.add('KeyF');
      if (held(PAD.RIGHT)) want.add('KeyJ');
      if (tapped(PAD.LB)) this.wheel -= 1;
      if (tapped(PAD.RB)) this.wheel += 1;
      this.aimX = rx;
      this.aimY = ry;
      this.moveY = ly;
      this.setMouse(held(PAD.RT), held(PAD.LT) || held(PAD.X));
    }
    // press and release keys on the keyboard's behalf
    for (const k of want) if (!this.padKeys.has(k)) this.key('keydown', k);
    for (const k of [...this.padKeys]) if (!want.has(k)) this.key('keyup', k);
    this.prevButtons = raw;
  }

  private key(type: 'keydown' | 'keyup', code: string): void {
    if (type === 'keydown') this.padKeys.add(code);
    else this.padKeys.delete(code);
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  }

  private releaseAll(): void {
    for (const k of [...this.padKeys]) this.key('keyup', k);
    this.setMouse(false, false);
    this.aimX = 0;
    this.aimY = 0;
    this.moveY = 0;
  }

  /** the triggers hold the mouse buttons down */
  private setMouse(left: boolean, right: boolean): void {
    if (left && !this.wasPadMouseL) {
      this.mouseLeft = true;
      this.mouseLeftPressed = true;
    } else if (!left && this.wasPadMouseL) this.mouseLeft = false;
    if (right && !this.wasPadMouseR) {
      this.mouseRight = true;
      this.mouseRightPressed = true;
    } else if (!right && this.wasPadMouseR) this.mouseRight = false;
    this.wasPadMouseL = left;
    this.wasPadMouseR = right;
  }

  private showCursor(on: boolean): void {
    if (!this.cursor) {
      if (!on) return;
      const c = document.createElement('div');
      c.id = 'padCursor';
      document.body.appendChild(c);
      this.cursor = c;
      this.moveCursor();
    }
    this.cursor.classList.toggle('on', on);
  }

  private moveCursor(): void {
    if (!this.cursor) return;
    this.cursor.style.transform = `translate(${Math.round(this.cx)}px, ${Math.round(this.cy)}px)`;
    // the pack's held-item ghost and the tooltips follow the mouse: let them follow the pointer
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: this.cx, clientY: this.cy }));
    const el = document.elementFromPoint(this.cx, this.cy);
    if (el !== this.hoverEl) {
      this.hoverEl?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, clientX: this.cx, clientY: this.cy }));
      el?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: this.cx, clientY: this.cy }));
      this.hoverEl = el;
    }
  }

  /** press a mouse button on whatever is under the pointer */
  private clickAt(button: 0 | 2): void {
    const el = document.elementFromPoint(this.cx, this.cy);
    if (!el) return;
    const o = { bubbles: true, cancelable: true, clientX: this.cx, clientY: this.cy, button };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    if (button === 0) el.dispatchEvent(new MouseEvent('click', o));
    else el.dispatchEvent(new MouseEvent('contextmenu', o));
    // panels re-render on a click: whatever is under the pointer now may be new
    this.hoverEl = null;
    this.moveCursor();
  }
}
