import { BLOCKS, B } from './data/blocks';
import type { IconRef } from './data/items';

const BASE = './assets/';

export interface Assets {
  rock: HTMLImageElement;
  ore: HTMLImageElement;
  icons16: HTMLImageElement;
  icons32: HTMLImageElement;
  iconsN: HTMLImageElement;
  miner: HTMLImageElement;
  enemies: Record<string, HTMLImageElement>;
  camp: Record<string, HTMLImageElement>;
  bg: Record<string, HTMLImageElement>;
  /** plain 32px texture per block */
  blockTex: HTMLCanvasElement[];
  /** framed textures: [block][variant * 16 + exposedMask] */
  framed: HTMLCanvasElement[][];
  wallTex: HTMLCanvasElement[];
  grassTop: HTMLCanvasElement[];
  mossTop: HTMLCanvasElement[];
  /** transparent rows under each camp sprite's feet */
  padBottom: Record<string, number>;
  iconUrl: Map<string, string>;
}

export const A = {} as Assets;

const ENEMY_FILES = ['bat', 'slime', 'beetle', 'toad', 'spider', 'wisp', 'imp', 'slug', 'wraith', 'sentinel', 'boss', 'rabbit', 'boar', 'hollow'];
const CAMP_FILES = ['npc_merchant', 'npc_smith', 'npc_archivist', 'shop', 'forge', 'archive', 'pine1', 'pine2', 'oak', 'birch', 'bed', 'rocks'];
const BG_FILES = ['surface', 'day', 'title', 'cave0', 'cave1', 'cave2', 'cave3', 'cave4'];

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + src));
    img.src = BASE + src;
  });
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export async function loadAssets(onProgress: (f: number) => void): Promise<void> {
  const jobs: [string, (img: HTMLImageElement) => void][] = [
    ['sheets/rock32.png', (i) => (A.rock = i)],
    ['sheets/ore32.png', (i) => (A.ore = i)],
    ['sheets/icons16.png', (i) => (A.icons16 = i)],
    ['sheets/icons32.png', (i) => (A.icons32 = i)],
    ['sheets/icons_n32.png', (i) => (A.iconsN = i)],
    ['player/miner.png', (i) => (A.miner = i)],
  ];
  A.enemies = {};
  A.camp = {};
  A.bg = {};
  for (const e of ENEMY_FILES) jobs.push([`enemies/${e}.png`, (i) => (A.enemies[e] = i)]);
  for (const c of CAMP_FILES) jobs.push([`camp/${c}.png`, (i) => (A.camp[c] = i)]);
  for (const b of BG_FILES) jobs.push([`bg/${b}.png`, (i) => (A.bg[b] = i)]);
  let done = 0;
  await Promise.all(
    jobs.map(async ([src, set]) => {
      set(await loadImg(src));
      done++;
      onProgress(done / jobs.length);
    }),
  );
  buildBlockTextures();
  buildFrames();
  buildToppers();
  measurePads();
  buildIconUrls();
}

function hash(a: number, b: number): number {
  let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function buildBlockTextures(): void {
  A.blockTex = [];
  A.wallTex = [];
  for (let id = 0; id < B.COUNT; id++) {
    const def = BLOCKS[id];
    const [c, ctx] = makeCanvas(32, 32);
    const [wc, wctx] = makeCanvas(32, 32);
    if (def.tex) {
      if (def.tex[0] === 'x') drawStoneBrick(ctx);
      else ctx.drawImage(def.tex[0] === 'r' ? A.rock : A.ore, def.tex[1] * 32, 0, 32, 32, 0, 0, 32, 32);
      // background walls: half resolution, darker and cooler so they read as "behind"
      const [hc, hctx] = makeCanvas(16, 16);
      hctx.imageSmoothingEnabled = true;
      hctx.drawImage(c, 0, 0, 16, 16);
      wctx.imageSmoothingEnabled = false;
      wctx.drawImage(hc, 0, 0, 32, 32);
      wctx.globalCompositeOperation = 'multiply';
      wctx.fillStyle = 'rgb(74,72,98)';
      wctx.fillRect(0, 0, 32, 32);
      wctx.globalCompositeOperation = 'source-over';
      wctx.fillStyle = 'rgba(8,6,18,0.3)';
      wctx.fillRect(0, 0, 32, 32);
    }
    A.blockTex.push(c);
    A.wallTex.push(wc);
  }
}

/** cut stone bricks out of the plain stone texture */
function drawStoneBrick(ctx: CanvasRenderingContext2D): void {
  ctx.drawImage(A.rock, 2 * 32, 0, 32, 32, 0, 0, 32, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#3a3a44';
  for (const y of [0, 15]) ctx.fillRect(0, y, 32, 2);
  ctx.fillRect(0, 0, 2, 15);
  ctx.fillRect(16, 0, 2, 15);
  ctx.fillRect(8, 15, 2, 17);
  ctx.fillRect(24, 15, 2, 17);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (const y of [2, 17]) ctx.fillRect(0, y, 32, 1);
}

/**
 * Terraria-style framing: every exposed side of a block gets a ragged edge,
 * rounded outer corners, a dark outline and a lit top lip.
 */
function buildFrames(): void {
  A.framed = [];
  for (let id = 0; id < B.COUNT; id++) {
    const list: HTMLCanvasElement[] = [];
    const def = BLOCKS[id];
    if (!def.tex || def.liquid) {
      A.framed.push(list);
      continue;
    }
    const base = A.blockTex[id];
    for (let v = 0; v < 2; v++) {
      const [, sctx] = makeCanvas(32, 32);
      if (v === 1 && !def.ore && def.tex[0] !== 'x') {
        sctx.translate(32, 0);
        sctx.scale(-1, 1);
      }
      sctx.drawImage(base, 0, 0);
      const srcData = sctx.getImageData(0, 0, 32, 32).data;
      for (let mask = 0; mask < 16; mask++) list.push(frameTile(srcData, mask, id * 7 + v));
    }
    A.framed.push(list);
  }
}

function frameTile(src: Uint8ClampedArray, mask: number, seed: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, 32);
  const img = ctx.createImageData(32, 32);
  const d = img.data;
  d.set(src);
  const U = mask & 1;
  const R = mask & 2;
  const D = mask & 4;
  const L = mask & 8;
  // ragged edge depth per position along each side, 0..2px, smoothed
  const edge = (side: number, i: number): number => {
    const a = hash(seed * 4 + side, Math.floor(i / 3));
    const b = hash(seed * 4 + side, Math.floor(i / 3) + 1);
    const t = (i % 3) / 3;
    const n = a * (1 - t) + b * t;
    return n < 0.35 ? 0 : n < 0.8 ? 1 : 2;
  };
  const cut = new Uint8Array(32 * 32);
  const R0 = 5;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      let k = false;
      if (U && y < edge(0, x)) k = true;
      if (D && 31 - y < edge(2, x)) k = true;
      if (L && x < edge(3, y)) k = true;
      if (R && 31 - x < edge(1, y)) k = true;
      const corner = (cx: number, cy: number): boolean => (x - cx) ** 2 + (y - cy) ** 2 > R0 * R0;
      if (U && L && x < R0 && y < R0 && corner(R0, R0)) k = true;
      if (U && R && x > 31 - R0 && y < R0 && corner(31 - R0, R0)) k = true;
      if (D && L && x < R0 && y > 31 - R0 && corner(R0, 31 - R0)) k = true;
      if (D && R && x > 31 - R0 && y > 31 - R0 && corner(31 - R0, 31 - R0)) k = true;
      if (k) cut[y * 32 + x] = 1;
    }
  }
  const isCut = (x: number, y: number): boolean => {
    if (x < 0) return !!L;
    if (x > 31) return !!R;
    if (y < 0) return !!U;
    if (y > 31) return !!D;
    return cut[y * 32 + x] === 1;
  };
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const p = (y * 32 + x) * 4;
      if (cut[y * 32 + x]) {
        d[p + 3] = 0;
        continue;
      }
      const outline = isCut(x - 1, y) || isCut(x + 1, y) || isCut(x, y - 1) || isCut(x, y + 1);
      if (outline) {
        d[p] = d[p] * 0.12 + 5;
        d[p + 1] = d[p + 1] * 0.1 + 3;
        d[p + 2] = d[p + 2] * 0.14 + 9;
        continue;
      }
      const inner = isCut(x - 2, y) || isCut(x + 2, y) || isCut(x, y + 2);
      // lit lip under an exposed top, shade over an exposed bottom
      let f = 1;
      if (isCut(x, y - 2) || isCut(x, y - 3)) f = 1.45;
      else if (inner) f = 0.62;
      else if (isCut(x, y + 3)) f = 0.78;
      else if (isCut(x - 3, y)) f = 1.12;
      else if (isCut(x + 3, y)) f = 0.85;
      if (U && y < 6) f *= 1.06;
      if (D && y > 25) f *= 0.9;
      if (f !== 1) {
        d[p] = Math.min(255, d[p] * f);
        d[p + 1] = Math.min(255, d[p + 1] * f);
        d[p + 2] = Math.min(255, d[p + 2] * f);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** grass and moss lips that hang over exposed tops (two variants each) */
function buildToppers(): void {
  A.grassTop = [];
  A.mossTop = [];
  for (let v = 0; v < 4; v++) {
    A.grassTop.push(topper(v, ['#1d3a14', '#3c7426', '#5a9a32', '#7cc046', '#a4dc5a'], 6, 0.85));
    A.mossTop.push(topper(v + 10, ['#16301a', '#2f5a2a', '#4a7f34', '#68a040', '#8cc455'], 4, 0.55));
  }
}

function topper(seed: number, pal: string[], tall: number, density: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, 16);
  const top = 7; // row where the block's top edge sits
  for (let x = 0; x < 32; x++) {
    const band = 3 + (hash(seed, x) < 0.3 ? 1 : 0);
    // outline below the band
    ctx.fillStyle = pal[0];
    ctx.fillRect(x, top + band, 1, 1);
    for (let y = 0; y < band; y++) {
      ctx.fillStyle = y === 0 ? pal[3] : y === 1 ? pal[2] : pal[1];
      ctx.fillRect(x, top + y, 1, 1);
    }
    if (hash(seed + 5, x) < density) {
      const h = 1 + Math.floor(hash(seed + 9, x) * tall);
      for (let y = 1; y <= h; y++) {
        ctx.fillStyle = y === h ? pal[4] : y > h - 2 ? pal[3] : pal[2];
        ctx.fillRect(x, top - y, 1, 1);
      }
      ctx.fillStyle = pal[0];
      ctx.fillRect(x, top - h - 1, 1, 1);
    } else {
      ctx.fillStyle = pal[0];
      ctx.fillRect(x, top - 1, 1, 1);
    }
  }
  return c;
}

function measurePads(): void {
  A.padBottom = {};
  for (const [key, img] of Object.entries(A.camp)) {
    const [c, ctx] = makeCanvas(img.width, img.height);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let pad = 0;
    outer: for (let y = img.height - 1; y >= 0; y--) {
      for (let x = 0; x < img.width; x++) if (data[(y * img.width + x) * 4 + 3] > 40) break outer;
      pad++;
    }
    A.padBottom[key] = pad;
    void c;
  }
}

function buildIconUrls(): void {
  A.iconUrl = new Map();
  for (const [sheet, size, img] of [
    ['i16', 16, A.icons16],
    ['i32', 32, A.icons32],
    ['n32', 32, A.iconsN],
  ] as const) {
    for (let i = 0; i < 64; i++) {
      const [c, ctx] = makeCanvas(size, size);
      ctx.drawImage(img, (i % 8) * size, Math.floor(i / 8) * size, size, size, 0, 0, size, size);
      A.iconUrl.set(`${sheet}:${i}`, c.toDataURL());
    }
  }
  for (let b = 1; b < B.COUNT; b++) {
    const f = A.framed[b]?.[15] ?? A.blockTex[b];
    const [c, ctx] = makeCanvas(32, 32);
    ctx.drawImage(f, 2, 2, 28, 28);
    A.iconUrl.set(`blk:${b}`, c.toDataURL());
  }
}

export function iconSrc(ref: IconRef): { img: CanvasImageSource; sx: number; sy: number; size: number } {
  if (ref.sheet === 'blk') return { img: A.framed[ref.idx]?.[15] ?? A.blockTex[ref.idx], sx: 0, sy: 0, size: 32 };
  const size = ref.sheet === 'i16' ? 16 : 32;
  const img = ref.sheet === 'i16' ? A.icons16 : ref.sheet === 'i32' ? A.icons32 : A.iconsN;
  return { img, sx: (ref.idx % 8) * size, sy: Math.floor(ref.idx / 8) * size, size };
}

export function iconUrl(ref: IconRef): string {
  return A.iconUrl.get(`${ref.sheet}:${ref.idx}`) ?? '';
}

/** decor code -> icon ref */
export function decorIcon(code: number): IconRef {
  return code >= 100 ? { sheet: 'i32', idx: code - 100 } : { sheet: 'i16', idx: code };
}
