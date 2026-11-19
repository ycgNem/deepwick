import { makeCanvas } from './assets';

/** size of one backdrop tile; both layers repeat in x and y */
export const BW = 512;
export const BH = 320;

interface Look {
  base: string;
  farRock: string;
  farRim: string;
  midRock: string;
  midRim: string;
  midShade: string;
  glow: string;
  /** how many glowing things to scatter */
  glows: number;
  /** column density 0..1 */
  columns: number;
  /** crystal shards instead of rounded drips on the fringe */
  shards?: boolean;
}

/** one look per biome, darkest at the top so light has room to lift it */
const LOOKS: Look[] = [
  { base: '#22150d', farRock: '#352215', farRim: '#503522', midRock: '#130b08', midRim: '#5d3e26', midShade: '#0b0605', glow: '#ffb860', glows: 5, columns: 0.35 },
  { base: '#091c19', farRock: '#0f2b26', farRim: '#1a473d', midRock: '#06120e', midRim: '#2e7660', midShade: '#030a08', glow: '#5af0c8', glows: 22, columns: 0.5 },
  { base: '#170d2c', farRock: '#281b4c', farRim: '#483181', midRock: '#0b0616', midRim: '#5d40a3', midShade: '#06030e', glow: '#c08aff', glows: 18, columns: 0.4, shards: true },
  { base: '#200907', farRock: '#33100a', farRim: '#56200f', midRock: '#120503', midRim: '#a6330d', midShade: '#0a0202', glow: '#ff7a20', glows: 16, columns: 0.55 },
  { base: '#0d0a1c', farRock: '#191333', farRim: '#332863', midRock: '#06050e', midRim: '#433683', midShade: '#030308', glow: '#6a9aff', glows: 10, columns: 0.7 },
  { base: '#24060b', farRock: '#3d0b15', farRim: '#6e1328', midRock: '#0e0305', midRim: '#8d1a32', midShade: '#080203', glow: '#ff3a5a', glows: 14, columns: 0.3 },
];

export interface Backdrop {
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** periodic 1D value noise sampled at integer x in [0, period) */
function noise1(period: number, cells: number, r: () => number): Float32Array {
  const g = Array.from({ length: cells }, () => r());
  const out = new Float32Array(period);
  for (let x = 0; x < period; x++) {
    const f = (x / period) * cells;
    const i = Math.floor(f);
    const t = f - i;
    const u = t * t * (3 - 2 * t);
    out[x] = g[i % cells] * (1 - u) + g[(i + 1) % cells] * u;
  }
  return out;
}

/** periodic 2D value noise, a few octaves */
function noise2(w: number, h: number, cx: number, cy: number, oct: number, r: () => number): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    const gx = cx << o;
    const gy = cy << o;
    const g = Array.from({ length: gx * gy }, () => r());
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * gy;
      const iy = Math.floor(fy);
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * gx;
        const ix = Math.floor(fx);
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const a = g[(iy % gy) * gx + (ix % gx)];
        const b = g[(iy % gy) * gx + ((ix + 1) % gx)];
        const c = g[((iy + 1) % gy) * gx + (ix % gx)];
        const d = g[((iy + 1) % gy) * gx + ((ix + 1) % gx)];
        out[y * w + x] += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * amp;
      }
    }
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildBackdrops(): Backdrop[] {
  return LOOKS.map((look, i) => ({ far: buildFar(look, 900 + i * 31), mid: buildMid(look, 1700 + i * 57) }));
}

/** distant rock masses: soft, low contrast, a faint rim on their upper edges */
function buildFar(look: Look, seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [c, ctx] = makeCanvas(BW, BH);
  const img = ctx.createImageData(BW, BH);
  const d = img.data;
  const n = noise2(BW, BH, 8, 5, 5, r);
  const base = rgb(look.base);
  const rock = rgb(look.farRock);
  const rim = rgb(look.farRim);
  const T = 0.53;
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const k = y * BW + x;
      const v = n[k];
      let col = base;
      if (v > T) {
        const above = n[((y - 2 + BH) % BH) * BW + x];
        col = above <= T ? rim : rock;
      } else if (v > T - 0.025 && ((x + y) & 1) === 0) col = rock;
      const p = k * 4;
      d[p] = col[0];
      d[p + 1] = col[1];
      d[p + 2] = col[2];
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // far glows: dim pinpricks with a halo
  const g = rgb(look.glow);
  for (let k = 0; k < Math.round(look.glows * 0.6); k++) {
    const x = Math.floor(r() * BW);
    const y = Math.floor(r() * BH);
    halo(ctx, x, y, 6 + r() * 6, g, 0.1);
    ctx.fillStyle = `rgba(${g[0]},${g[1]},${g[2]},0.55)`;
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/** nearer layer: a stalactite fringe hanging into each band, stalagmites below, columns between */
function buildMid(look: Look, seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [c, ctx] = makeCanvas(BW, BH);
  const mask = new Uint8Array(BW * BH);
  const ceil = noise1(BW, 9, r);
  const floor = noise1(BW, 7, r);
  const ceilFine = noise1(BW, 41, r);
  const floorFine = noise1(BW, 37, r);
  const ceilD = new Float32Array(BW);
  const floorH = new Float32Array(BW);
  for (let x = 0; x < BW; x++) {
    ceilD[x] = 26 + ceil[x] * 36 + ceilFine[x] * 10;
    floorH[x] = 30 + floor[x] * 34 + floorFine[x] * 10;
  }
  // hanging spikes and rising spires
  const spike = (arr: Float32Array, n: number, minL: number, maxL: number): void => {
    for (let k = 0; k < n; k++) {
      const x0 = Math.floor(r() * BW);
      const w = 3 + Math.floor(r() * (look.shards ? 6 : 9));
      const len = minL + r() * (maxL - minL);
      for (let i = -w; i <= w; i++) {
        const x = (x0 + i + BW) % BW;
        const t = 1 - Math.abs(i) / (w + 1);
        const add = look.shards ? len * t : len * Math.pow(t, 1.7);
        arr[x] = Math.max(arr[x], arr[x] + add * 0.85);
      }
    }
  };
  spike(ceilD, 26, 14, 64);
  spike(floorH, 18, 10, 46);
  for (let x = 0; x < BW; x++) {
    for (let y = 0; y < BH; y++) {
      if (y < ceilD[x] || y > BH - floorH[x]) mask[y * BW + x] = 1;
    }
  }
  // columns joining roof and floor
  const nCol = Math.round(look.columns * 4);
  for (let k = 0; k < nCol; k++) {
    const cx = r() * BW;
    const w = 7 + r() * 12;
    const wob = r() * 6;
    for (let y = 0; y < BH; y++) {
      const t = y / BH;
      const waist = 1 - Math.sin(t * Math.PI) * 0.45;
      const half = w * waist;
      const off = Math.sin(t * Math.PI * 2 + cx) * wob;
      for (let x = Math.floor(cx - half + off); x <= cx + half + off; x++) mask[y * BW + ((x % BW) + BW) % BW] = 1;
    }
  }
  // paint: rim light on the upper and left edges, shade on the lower right
  const img = ctx.createImageData(BW, BH);
  const d = img.data;
  const rock = rgb(look.midRock);
  const rim = rgb(look.midRim);
  const shade = rgb(look.midShade);
  const tex = noise2(BW, BH, 32, 20, 2, r);
  const at = (x: number, y: number): number => mask[((y + BH) % BH) * BW + ((x + BW) % BW)];
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const k = y * BW + x;
      if (!mask[k]) continue;
      let col = rock;
      if (!at(x, y - 1) || !at(x - 1, y)) col = rim;
      else if (!at(x, y - 2) && tex[k] > 0.45) col = rim;
      else if (!at(x + 1, y) || !at(x, y + 1) || !at(x + 2, y + 1)) col = shade;
      else if (tex[k] > 0.66) col = shade;
      const p = k * 4;
      d[p] = col[0];
      d[p + 1] = col[1];
      d[p + 2] = col[2];
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // glowing life clinging to the rock edges
  const g = rgb(look.glow);
  for (let k = 0; k < look.glows; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const x = Math.floor(r() * BW);
      const y = Math.floor(r() * BH);
      if (!at(x, y) || at(x, y - 1)) continue;
      halo(ctx, x, y - 2, 7 + r() * 7, g, 0.16);
      ctx.fillStyle = `rgba(${g[0]},${g[1]},${g[2]},0.9)`;
      ctx.fillRect(x, y - 2, 2, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x, y - 2, 1, 1);
      break;
    }
  }
  return c;
}

function halo(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, g: [number, number, number], a: number): void {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, `rgba(${g[0]},${g[1]},${g[2]},${a})`);
  gr.addColorStop(1, `rgba(${g[0]},${g[1]},${g[2]},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}
