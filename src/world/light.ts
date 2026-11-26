import { World, Obj } from './world';
import { BLOCKS, B } from '../data/blocks';
import { biomeAt } from '../data/biomes';
import { decorLight } from './gen';
import { makeCanvas } from '../assets';

export interface PointLight {
  x: number; // tile coords (float)
  y: number;
  r: number;
  g: number;
  b: number;
  radius: number; // tiles
  /** shadowed raycast (lantern) vs plain seed (glows) */
  cast: boolean;
}

const AIR_DECAY = 0.86;
const SOLID_DECAY = 0.5;
const MARGIN = 14;

/**
 * Tile-resolution light field for the area around the view. Seeds come from the sky,
 * emissive blocks, decor, torches and dynamic point lights; then light is spread with
 * four directional sweeps (twice) so it bends around corners and fades into rock.
 */
/** how bright a flame out in the rain burns: low, and catching and dropping as drops hit it */
export function sputter(wet: number, time: number, x: number): number {
  const catchK = Math.max(0, Math.sin(time * 2.3 + x * 1.7) * Math.sin(time * 5.1 + x * 0.6));
  return (1 - 0.58 * wet) * (0.82 + 0.18 * Math.sin(time * 23 + x * 5.3)) * (1 - 0.25 * wet * catchK);
}

export class LightMap {
  x0 = 0;
  y0 = 0;
  w = 0;
  h = 0;
  r = new Float32Array(0);
  g = new Float32Array(0);
  b = new Float32Array(0);
  decay = new Float32Array(0);
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;

  constructor() {
    [this.canvas, this.ctx] = makeCanvas(4, 4);
  }

  private ensure(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.decay = new Float32Array(n);
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h);
  }

  /**
   * `wet` (0..1) is how hard it is raining: a torch or campfire with open sky above it sputters
   * and burns low; one with a roof over it does not notice.
   */
  compute(world: World, tx0: number, ty0: number, tw: number, th: number, lights: PointLight[], time: number, sky: [number, number, number], wet = 0): void {
    const x0 = tx0 - MARGIN;
    const y0 = ty0 - MARGIN;
    const w = tw + MARGIN * 2;
    const h = th + MARGIN * 2;
    this.x0 = x0;
    this.y0 = y0;
    this.ensure(w, h);
    const R = this.r;
    const G = this.g;
    const Bc = this.b;
    const D = this.decay;
    R.fill(0);
    G.fill(0);
    Bc.fill(0);

    for (let j = 0; j < h; j++) {
      const y = y0 + j;
      for (let i = 0; i < w; i++) {
        const x = x0 + i;
        const k = j * w + i;
        if (!world.inside(x, y)) {
          D[k] = SOLID_DECAY;
          if (y < 0) {
            R[k] = sky[0];
            G[k] = sky[1];
            Bc[k] = sky[2];
          }
          continue;
        }
        const wi = world.idx(x, y);
        const fg = world.fg[wi];
        const def = BLOCKS[fg];
        D[k] = def.solid ? SOLID_DECAY : AIR_DECAY;
        // open sky: nothing solid above this tile
        if (y < world.skyline[x] && !def.solid) {
          R[k] = sky[0];
          G[k] = sky[1];
          Bc[k] = sky[2];
        }
        if (def.light) {
          const f = fg === B.LAVA ? 0.9 + 0.1 * Math.sin(time * 3 + x * 0.7 + y) : 1;
          add(R, G, Bc, k, def.light[0] * f, def.light[1] * f, def.light[2] * f);
        }
        const dc = world.decor[wi];
        if (dc) {
          const dl = decorLight(dc);
          if (dl) add(R, G, Bc, k, dl[0], dl[1], dl[2]);
        }
        const o = world.obj[wi];
        if (o) {
          let fl = 0.92 + 0.08 * Math.sin(time * 11 + x * 3.1) * Math.sin(time * 7.3 + y);
          if (wet > 0 && (o === Obj.TORCH || o === Obj.CAMPFIRE) && y < world.skyline[x]) fl *= sputter(wet, time, x);
          if (o === Obj.TORCH) add(R, G, Bc, k, 1.05 * fl, 0.72 * fl, 0.38 * fl);
          else if (o === Obj.LAMP) add(R, G, Bc, k, 1.15 * fl, 0.85 * fl, 0.5 * fl);
          else if (o === Obj.WICKPOST) add(R, G, Bc, k, 1.35 * fl, 1.05 * fl, 0.62 * fl);
          else if (o === Obj.CAMPFIRE) add(R, G, Bc, k, 1.25 * fl, 0.75 * fl, 0.32 * fl);
          else if (o === Obj.FURNACE) add(R, G, Bc, k, 0.8 * fl, 0.42 * fl, 0.15 * fl);
          else if (o === Obj.HEART_CRYSTAL) add(R, G, Bc, k, 0.55, 0.15, 0.32);
          else if (o === Obj.CHEST) add(R, G, Bc, k, 0.18, 0.14, 0.04);
          else if (o === Obj.ALCHEMY) add(R, G, Bc, k, 0.12, 0.3, 0.2);
        }
      }
    }

    for (const L of lights) this.seedPoint(world, L);

    for (let pass = 0; pass < 2; pass++) {
      // horizontal sweeps
      for (let j = 0; j < h; j++) {
        let k = j * w;
        for (let i = 1; i < w; i++) {
          k = j * w + i;
          spread(R, G, Bc, D, k - 1, k);
        }
        for (let i = w - 2; i >= 0; i--) {
          k = j * w + i;
          spread(R, G, Bc, D, k + 1, k);
        }
      }
      // vertical sweeps
      for (let i = 0; i < w; i++) {
        for (let j = 1; j < h; j++) {
          const k = j * w + i;
          spread(R, G, Bc, D, k - w, k);
        }
        for (let j = h - 2; j >= 0; j--) {
          const k = j * w + i;
          spread(R, G, Bc, D, k + w, k);
        }
      }
    }
  }

  private seedPoint(world: World, L: PointLight): void {
    const rad = L.radius;
    const cx = L.x;
    const cy = L.y;
    const ri = Math.ceil(rad);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const tx = Math.floor(cx) + dx;
        const ty = Math.floor(cy) + dy;
        const i = tx - this.x0;
        const j = ty - this.y0;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const ddx = tx + 0.5 - cx;
        const ddy = ty + 0.5 - cy;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist > rad) continue;
        let f = 1 - dist / rad;
        f = f * f * (3 - 2 * f);
        if (L.cast && dist > 1) f *= visibility(world, cx, cy, tx + 0.5, ty + 0.5);
        if (f <= 0.01) continue;
        const k = j * this.w + i;
        if (this.r[k] < L.r * f) this.r[k] = L.r * f;
        if (this.g[k] < L.g * f) this.g[k] = L.g * f;
        if (this.b[k] < L.b * f) this.b[k] = L.b * f;
      }
    }
  }

  /** light level (max channel) at a tile, 0 if outside the computed area */
  at(tx: number, ty: number): number {
    const i = tx - this.x0;
    const j = ty - this.y0;
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    const k = j * this.w + i;
    return Math.max(this.r[k], this.g[k], this.b[k]);
  }

  /** mark explored tiles + apply remembered ambient, then write the canvas */
  finish(world: World): void {
    const img = this.img;
    if (!img) return;
    const data = img.data;
    const w = this.w;
    for (let j = 0; j < this.h; j++) {
      const y = this.y0 + j;
      for (let i = 0; i < w; i++) {
        const x = this.x0 + i;
        const k = j * w + i;
        let r = this.r[k];
        let g = this.g[k];
        let b = this.b[k];
        if (world.inside(x, y)) {
          const wi = world.idx(x, y);
          const lv = Math.max(r, g, b);
          if (lv > 0.16 && !world.explored[wi]) {
            world.explored[wi] = 1;
            world.dirty.add(wi);
          }
          if (world.explored[wi] && y >= world.surface[x]) {
            const mem = biomeAt(y).memory;
            if (r < mem[0]) r = mem[0];
            if (g < mem[1]) g = mem[1];
            if (b < mem[2]) b = mem[2];
          }
        }
        const p = k * 4;
        data[p] = tone(r);
        data[p + 1] = tone(g);
        data[p + 2] = tone(b);
        data[p + 3] = 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

function tone(v: number): number {
  // gentle curve so light reads warm and bright near sources
  const c = 1 - Math.exp(-v * 2.6);
  return Math.min(255, Math.round((c / 0.86) * 255));
}

function add(R: Float32Array, G: Float32Array, B: Float32Array, k: number, r: number, g: number, b: number): void {
  R[k] = Math.max(R[k], r);
  G[k] = Math.max(G[k], g);
  B[k] = Math.max(B[k], b);
}

function spread(R: Float32Array, G: Float32Array, B: Float32Array, D: Float32Array, from: number, to: number): void {
  const d = D[to];
  const r = R[from] * d;
  const g = G[from] * d;
  const b = B[from] * d;
  if (r > R[to]) R[to] = r;
  if (g > G[to]) G[to] = g;
  if (b > B[to]) B[to] = b;
}

/** fraction of light that survives from (ax,ay) to (bx,by), walking the tile grid */
function visibility(world: World, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2);
  let v = 1;
  let lastX = Math.floor(ax);
  let lastY = Math.floor(ay);
  const endX = Math.floor(bx);
  const endY = Math.floor(by);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = Math.floor(ax + dx * t);
    const y = Math.floor(ay + dy * t);
    if (x === lastX && y === lastY) continue;
    lastX = x;
    lastY = y;
    if (x === endX && y === endY) break;
    if (world.solid(x, y)) {
      v *= 0.18;
      if (v < 0.02) return 0;
    }
  }
  return v;
}
