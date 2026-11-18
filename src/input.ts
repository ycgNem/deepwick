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

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
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
    target.addEventListener('mousemove', (e) => {
      const r = target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    target.addEventListener('mousedown', (e) => {
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
  }

  isDown(...codes: string[]): boolean {
    if (this.blocked) return false;
    return codes.some((c) => this.down.has(c));
  }
  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }
  /** call at the end of each frame */
  endFrame(): void {
    this.pressed.clear();
    this.mouseLeftPressed = false;
    this.mouseRightPressed = false;
    this.wheel = 0;
  }
}
