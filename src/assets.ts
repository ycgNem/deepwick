import { B } from './data/blocks';
import type { IconRef } from './data/items';
import { buildTerrainArt, blockIcon } from './terrain';

const BASE = './assets/';

export interface Assets {
  /** seamless material textures, one 128px square per material (tools/gen_terrain.py) */
  terrain: HTMLImageElement;
  /** 32px ore inlays, 3 variants per row */
  ores: HTMLImageElement;
  /** big cave formations (src/data/props.ts has the rectangles) */
  props: HTMLImageElement;
  icons16: HTMLImageElement;
  icons32: HTMLImageElement;
  iconsN: HTMLImageElement;
  /** fishing icons (tools/gen_fish.py) */
  iconsF: HTMLImageElement;
  miner: HTMLImageElement;
  enemies: Record<string, HTMLImageElement>;
  camp: Record<string, HTMLImageElement>;
  bg: Record<string, HTMLImageElement>;
  /** framed picture of every block, for icons */
  blockIcon: HTMLCanvasElement[];
  /** icons drawn at load: 0 rail, 1 minecart, 2 mine lamp */
  cvIcons: HTMLCanvasElement[];
  grassTop: HTMLCanvasElement[];
  mossTop: HTMLCanvasElement[];
  /** transparent rows under each camp sprite's feet */
  padBottom: Record<string, number>;
  iconUrl: Map<string, string>;
}

export const A = {} as Assets;

const ENEMY_FILES = ['bat', 'slime', 'beetle', 'toad', 'spider', 'wisp', 'imp', 'slug', 'wraith', 'sentinel', 'gloamheart', 'rabbit', 'boar', 'hollow', 'lampless'];
const CAMP_FILES = ['npc_merchant', 'npc_smith', 'npc_archivist', 'shop', 'forge', 'archive', 'pine1', 'pine2', 'oak', 'birch', 'bed', 'rocks', 'minecart', 'wick', 'wick_lit', 'wickpost', 'walk_smith', 'walk_archivist', 'stillroom', 'npc_herbalist', 'walk_herbalist', 'sconce'];
const BG_FILES = ['surface', 'day'];

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
    ['sheets/terrain.png', (i) => (A.terrain = i)],
    ['sheets/ores.png', (i) => (A.ores = i)],
    ['sheets/props.png', (i) => (A.props = i)],
    ['sheets/icons16.png', (i) => (A.icons16 = i)],
    ['sheets/icons32.png', (i) => (A.icons32 = i)],
    ['sheets/icons_n32.png', (i) => (A.iconsN = i)],
    ['sheets/icons_fish.png', (i) => (A.iconsF = i)],
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
  buildTerrainArt();
  A.blockIcon = [];
  for (let b = 0; b < B.COUNT; b++) A.blockIcon.push(blockIcon(b));
  buildToppers();
  buildCvIcons();
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

/** a short length of mine track, as seen from the side */
export function drawRailAt(ctx: CanvasRenderingContext2D, sx: number, sy: number, endL: boolean, endR: boolean): void {
  // sleepers
  for (let x = 2; x < 32; x += 8) {
    ctx.fillStyle = '#2a1608';
    ctx.fillRect(sx + x, sy + 27, 6, 4);
    ctx.fillStyle = '#6a4220';
    ctx.fillRect(sx + x, sy + 27, 6, 1);
  }
  // the iron rail
  ctx.fillStyle = '#26262e';
  ctx.fillRect(sx, sy + 24, 32, 4);
  ctx.fillStyle = '#8a8a9a';
  ctx.fillRect(sx, sy + 24, 32, 1);
  ctx.fillStyle = '#4a4a56';
  ctx.fillRect(sx, sy + 25, 32, 2);
  // a buffer post where the line ends
  if (endL || endR) {
    const bx = endL ? sx + 1 : sx + 25;
    ctx.fillStyle = '#2a1608';
    ctx.fillRect(bx, sy + 14, 6, 14);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(bx + 1, sy + 15, 4, 12);
    ctx.fillStyle = '#c03a2a';
    ctx.fillRect(bx + 1, sy + 17, 4, 3);
  }
}

/** a hanging oil lamp: chain from the top of the tile, glass and flame */
export function drawLampAt(ctx: CanvasRenderingContext2D, sx: number, sy: number, flame: number): void {
  ctx.fillStyle = '#3a3440';
  for (let y = 0; y < 8; y += 2) ctx.fillRect(sx + 15, sy + y, 2, 1);
  ctx.fillStyle = '#1a1414';
  ctx.fillRect(sx + 10, sy + 8, 12, 3);
  ctx.fillRect(sx + 9, sy + 11, 14, 11);
  ctx.fillRect(sx + 10, sy + 22, 12, 3);
  ctx.fillStyle = '#b08030';
  ctx.fillRect(sx + 11, sy + 9, 10, 1);
  ctx.fillRect(sx + 11, sy + 23, 10, 1);
  ctx.fillStyle = '#ffd890';
  ctx.fillRect(sx + 11, sy + 12, 10, 9);
  ctx.fillStyle = ['#ff9a2a', '#ffb84a', '#ffe08a'][flame % 3];
  ctx.fillRect(sx + 14, sy + 14, 4, 6);
  ctx.fillStyle = '#fff6d0';
  ctx.fillRect(sx + 15, sy + 16, 2, 3);
  ctx.fillStyle = '#6a5030';
  ctx.fillRect(sx + 12, sy + 11, 1, 10);
  ctx.fillRect(sx + 19, sy + 11, 1, 10);
}

function buildCvIcons(): void {
  A.cvIcons = [];
  const [r, rc] = makeCanvas(32, 32);
  rc.translate(0, -8);
  drawRailAt(rc, 0, 0, false, false);
  A.cvIcons.push(r);
  const [m, mc] = makeCanvas(32, 32);
  const cart = A.camp.minecart;
  const k = Math.min(1, 30 / cart.width);
  mc.drawImage(cart, Math.round((32 - cart.width * k) / 2), Math.round((32 - cart.height * k) / 2) + 2, Math.round(cart.width * k), Math.round(cart.height * k));
  A.cvIcons.push(m);
  const [l, lc] = makeCanvas(32, 32);
  drawLampAt(lc, 0, 2, 1);
  A.cvIcons.push(l);
  // the wickpost, shrunk from its 32x64 sprite to fit the slot
  const [w, wc] = makeCanvas(32, 32);
  wc.imageSmoothingEnabled = false;
  // its pixels sit in x 5..29, y 17..61; scale that 24x44 box to 17x31
  wc.drawImage(A.camp.wickpost, 5, 17, 24, 44, 8, 0, 17, 31);
  A.cvIcons.push(w);
  // a Gloam Mote: a scrap of shadow with a violet rim and two pale eyes
  const [gm, gc] = makeCanvas(32, 32);
  const disc = (x: number, y: number, r: number): void => {
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
      gc.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
    }
  };
  const blobs: [number, number, number][] = [[16, 15, 8], [12, 12, 5], [20, 21, 4], [11, 22, 3], [23, 11, 3]];
  gc.fillStyle = '#8a5ad8';
  for (const [x, y, r] of blobs) disc(x, y, r + 2);
  gc.fillStyle = '#3a1d66';
  for (const [x, y, r] of blobs) disc(x, y, r + 1);
  gc.fillStyle = '#0b0614';
  for (const [x, y, r] of blobs) disc(x, y, r);
  gc.fillStyle = '#24123e';
  disc(13, 11, 2);
  gc.fillStyle = '#f2deff';
  gc.fillRect(12, 15, 2, 2);
  gc.fillRect(18, 15, 2, 2);
  A.cvIcons.push(gm);
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
    ['f32', 32, A.iconsF],
  ] as const) {
    const n = (img.width / size) * (img.height / size);
    for (let i = 0; i < n; i++) {
      const [c, ctx] = makeCanvas(size, size);
      ctx.drawImage(img, (i % 8) * size, Math.floor(i / 8) * size, size, size, 0, 0, size, size);
      A.iconUrl.set(`${sheet}:${i}`, c.toDataURL());
    }
  }
  for (let b = 1; b < B.COUNT; b++) {
    const [c, ctx] = makeCanvas(32, 32);
    ctx.drawImage(A.blockIcon[b], 2, 2, 28, 28);
    A.iconUrl.set(`blk:${b}`, c.toDataURL());
  }
  A.cvIcons.forEach((c, i) => A.iconUrl.set(`cv:${i}`, c.toDataURL()));
}

export function iconSrc(ref: IconRef): { img: CanvasImageSource; sx: number; sy: number; size: number } {
  if (ref.sheet === 'blk') return { img: A.blockIcon[ref.idx], sx: 0, sy: 0, size: 32 };
  if (ref.sheet === 'cv') return { img: A.cvIcons[ref.idx], sx: 0, sy: 0, size: 32 };
  const size = ref.sheet === 'i16' ? 16 : 32;
  const img = ref.sheet === 'i16' ? A.icons16 : ref.sheet === 'i32' ? A.icons32 : ref.sheet === 'f32' ? A.iconsF : A.iconsN;
  return { img, sx: (ref.idx % 8) * size, sy: Math.floor(ref.idx / 8) * size, size };
}

export function iconUrl(ref: IconRef): string {
  return A.iconUrl.get(`${ref.sheet}:${ref.idx}`) ?? '';
}

/** decor code -> icon ref */
export function decorIcon(code: number): IconRef {
  return code >= 100 ? { sheet: 'i32', idx: code - 100 } : { sheet: 'i16', idx: code };
}
