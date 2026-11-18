import { BLOCKS, B } from './data/blocks';
import type { IconRef } from './data/items';

const BASE = './assets/';

export interface Assets {
  rock: HTMLImageElement;
  ore: HTMLImageElement;
  icons16: HTMLImageElement;
  icons32: HTMLImageElement;
  miner: HTMLImageElement;
  enemies: Record<string, HTMLImageElement>;
  camp: Record<string, HTMLImageElement>;
  bg: Record<string, HTMLImageElement>;
  blockTex: HTMLCanvasElement[];
  wallTex: HTMLCanvasElement[];
  iconUrl: Map<string, string>;
}

export const A = {} as Assets;

const ENEMY_FILES = ['bat', 'slime', 'beetle', 'toad', 'spider', 'wisp', 'imp', 'slug', 'wraith', 'sentinel', 'boss'];
const CAMP_FILES = ['npc_merchant', 'npc_smith', 'npc_archivist', 'shop', 'forge', 'archive', 'headframe', 'cabin', 'pine1', 'pine2', 'rocks'];
const BG_FILES = ['surface', 'title', 'cave0', 'cave1', 'cave2', 'cave3', 'cave4'];

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
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export async function loadAssets(onProgress: (f: number) => void): Promise<void> {
  const jobs: [string, (img: HTMLImageElement) => void][] = [
    ['sheets/rock.png', (i) => (A.rock = i)],
    ['sheets/ore.png', (i) => (A.ore = i)],
    ['sheets/icons16.png', (i) => (A.icons16 = i)],
    ['sheets/icons32.png', (i) => (A.icons32 = i)],
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
  buildIconUrls();
}

function buildBlockTextures(): void {
  A.blockTex = [];
  A.wallTex = [];
  for (let id = 0; id < B.COUNT; id++) {
    const def = BLOCKS[id];
    const [c, ctx] = makeCanvas(32, 32);
    const [wc, wctx] = makeCanvas(32, 32);
    if (def.tex) {
      const sheet = def.tex[0] === 'r' ? A.rock : A.ore;
      const sx = def.tex[1] * 16;
      for (let yy = 0; yy < 2; yy++)
        for (let xx = 0; xx < 2; xx++) ctx.drawImage(sheet, sx, 0, 16, 16, xx * 16, yy * 16, 16, 16);
      // walls: use the host rock for ores so mined tunnels don't look like ore
      wctx.drawImage(c, 0, 0);
      wctx.globalCompositeOperation = 'multiply';
      wctx.fillStyle = 'rgb(70,66,90)';
      wctx.fillRect(0, 0, 32, 32);
      wctx.globalCompositeOperation = 'source-over';
      wctx.fillStyle = 'rgba(8,6,14,0.32)';
      wctx.fillRect(0, 0, 32, 32);
    }
    A.blockTex.push(c);
    A.wallTex.push(wc);
  }
  // grass walls look odd: use dirt
  A.wallTex[B.GRASS] = A.wallTex[B.DIRT];
}

function buildIconUrls(): void {
  A.iconUrl = new Map();
  for (const [sheet, size, img] of [
    ['i16', 16, A.icons16],
    ['i32', 32, A.icons32],
  ] as const) {
    for (let i = 0; i < 64; i++) {
      const [c, ctx] = makeCanvas(size, size);
      ctx.drawImage(img, (i % 8) * size, Math.floor(i / 8) * size, size, size, 0, 0, size, size);
      A.iconUrl.set(`${sheet}:${i}`, c.toDataURL());
    }
  }
}

export function iconSrc(ref: IconRef): { img: HTMLImageElement; sx: number; sy: number; size: number } {
  const size = ref.sheet === 'i16' ? 16 : 32;
  const img = ref.sheet === 'i16' ? A.icons16 : A.icons32;
  return { img, sx: (ref.idx % 8) * size, sy: Math.floor(ref.idx / 8) * size, size };
}

export function iconUrl(ref: IconRef): string {
  return A.iconUrl.get(`${ref.sheet}:${ref.idx}`) ?? '';
}

/** decor code -> icon ref */
export function decorIcon(code: number): IconRef {
  return code >= 100 ? { sheet: 'i32', idx: code - 100 } : { sheet: 'i16', idx: code };
}
