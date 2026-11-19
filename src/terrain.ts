import { A, makeCanvas } from './assets';
import { TILE } from './constants';
import { B, BLOCKS } from './data/blocks';
import { BIOMES } from './data/biomes';
import type { World } from './world/world';

/** texture period in pixels (tools/gen_terrain.py S) */
export const TEX = 128;
/** tiles per chunk side */
export const CH = 16;
const CPX = CH * TILE;

/** terrain.png column per material, see tools/gen_terrain.py MATERIALS */
export const MAT = {
  dirt: 0, clay: 1, stone: 2, gravel: 3, moss: 4, grotto: 5, crystal: 6, geode: 7, basalt: 8, magma: 9,
  obsidian: 10, lava: 11, abyss: 12, ruin: 13, planks: 14, bedrock: 15, heart: 16, stonebrick: 17, water: 18,
} as const;

/** plain material for every non-ore block (ores borrow the rock around them) */
const BLOCK_MAT: Partial<Record<number, number>> = {
  [B.DIRT]: MAT.dirt, [B.GRASS]: MAT.dirt, [B.CLAY]: MAT.clay, [B.STONE]: MAT.stone, [B.GRAVEL]: MAT.gravel,
  [B.MOSS_STONE]: MAT.moss, [B.GROTTO_ROCK]: MAT.grotto, [B.CRYSTAL_ROCK]: MAT.crystal, [B.GEODE]: MAT.geode,
  [B.BASALT]: MAT.basalt, [B.MAGMA_ROCK]: MAT.magma, [B.OBSIDIAN]: MAT.obsidian, [B.LAVA]: MAT.lava,
  [B.ABYSS_STONE]: MAT.abyss, [B.RUIN_BRICK]: MAT.ruin, [B.PLANKS]: MAT.planks, [B.BEDROCK]: MAT.bedrock,
  [B.HEARTSTONE]: MAT.heart, [B.STONE_BRICK]: MAT.stonebrick,
};

/** ores.png row per ore block */
const ORE_ROW: Partial<Record<number, number>> = {
  [B.COAL]: 0, [B.COPPER]: 1, [B.IRON]: 2, [B.JADE]: 3, [B.SILVER]: 4, [B.AMETHYST]: 5, [B.GOLD]: 6, [B.RUBY]: 7,
  [B.VOIDSTEEL]: 8, [B.LUMENITE]: 9, [B.DIAMOND]: 10, [B.FOSSIL]: 11, [B.RELIC_STONE]: 12, [B.GLOWMOSS]: 13,
};

export function matOf(b: number): number {
  return BLOCK_MAT[b] ?? -1;
}
export function oreRow(b: number): number {
  return ORE_ROW[b] ?? -1;
}

function hash(a: number, b: number): number {
  let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothNoise(x: number, y: number, s: number, seed: number): number {
  const fx = x / s;
  const fy = y / s;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const a = hash(x0 + seed, y0);
  const b = hash(x0 + 1 + seed, y0);
  const c = hash(x0 + seed, y0 + 1);
  const d = hash(x0 + 1 + seed, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** textures and rim stencils, built once at load (world independent) */
const ART = {
  tex: [] as HTMLCanvasElement[],
  wallTex: [] as HTMLCanvasElement[],
  /** [variant*16 + mask]: pixels to remove along exposed sides */
  cut: [] as HTMLCanvasElement[],
  /** [variant*16 + mask]: outline, lip and shade painted over the block */
  shade: [] as HTMLCanvasElement[],
  wallCut: [] as HTMLCanvasElement[],
  wallShade: [] as HTMLCanvasElement[],
};

export function buildTerrainArt(): void {
  ART.tex = [];
  ART.wallTex = [];
  const sheet = A.terrain;
  const n = Math.floor(sheet.width / TEX);
  for (let m = 0; m < n; m++) {
    const [c, ctx] = makeCanvas(TEX, TEX);
    ctx.drawImage(sheet, m * TEX, 0, TEX, TEX, 0, 0, TEX, TEX);
    ART.tex.push(c);
    ART.wallTex.push(wallVersion(c));
  }
  ART.cut = [];
  ART.shade = [];
  ART.wallCut = [];
  ART.wallShade = [];
  for (let v = 0; v < 2; v++) {
    for (let mask = 0; mask < 16; mask++) {
      const [c1, s1] = frameMasks(mask, v * 7 + 3, false);
      ART.cut.push(c1);
      ART.shade.push(s1);
      const [c2, s2] = frameMasks(mask, v * 7 + 40, true);
      ART.wallCut.push(c2);
      ART.wallShade.push(s2);
    }
  }
}

/** back walls: same rock, flattened, cooler and much darker so they read as "behind" */
function wallVersion(c: HTMLCanvasElement): HTMLCanvasElement {
  const [wc, wctx] = makeCanvas(TEX, TEX);
  wctx.drawImage(c, 0, 0);
  const img = wctx.getImageData(0, 0, TEX, TEX);
  const d = img.data;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let p = 0; p < d.length; p += 4) {
    mr += d[p];
    mg += d[p + 1];
    mb += d[p + 2];
  }
  const cnt = d.length / 4;
  mr /= cnt;
  mg /= cnt;
  mb /= cnt;
  for (let p = 0; p < d.length; p += 4) {
    const l = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11;
    let r = d[p] * 0.6 + l * 0.4;
    let g = d[p + 1] * 0.6 + l * 0.4;
    let b = d[p + 2] * 0.6 + l * 0.4;
    r = r * 0.62 + mr * 0.38;
    g = g * 0.62 + mg * 0.38;
    b = b * 0.62 + mb * 0.38;
    d[p] = r * 0.55;
    d[p + 1] = g * 0.55;
    d[p + 2] = Math.min(255, b * 0.6 + 3);
  }
  wctx.putImageData(img, 0, 0);
  return wc;
}

/** plain framed block picture for icons and the inventory */
export function blockIcon(b: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, 32);
  const m = matOf(b) >= 0 ? matOf(b) : MAT.stone;
  ctx.drawImage(ART.tex[m], 0, 0, 32, 32, 0, 0, 32, 32);
  const ore = oreRow(b);
  if (ore >= 0) ctx.drawImage(A.ores, 0, ore * 32, 32, 32, 0, 0, 32, 32);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(ART.shade[15], 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(ART.cut[15], 0, 0);
  return c;
}

export function terrainTexture(m: number): HTMLCanvasElement {
  return ART.tex[m];
}

interface Chunk {
  fore: HTMLCanvasElement;
  back: HTMLCanvasElement;
  rev: number;
  used: number;
}

/**
 * Terrain drawn as continuous material: each block samples a seamless texture in world
 * space (so solid rock has no tile grid), exposed sides get a ragged rim, outline and lit lip,
 * ores are inlaid into whatever rock surrounds them, and seams mark where two materials meet.
 * Everything static is cached per 16x16-tile chunk and redrawn only when a tile changes.
 */
export class Terrain {
  private chunks = new Map<number, Chunk>();
  private revs: Uint32Array;
  private frame = 0;
  private tint: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;

  constructor(private world: World) {
    this.revs = new Uint32Array(Math.ceil(world.w / CH) * Math.ceil(world.h / CH) + 1);
    [this.tint, this.tctx] = makeCanvas(CH + 2, CH + 2);
    world.onChange = (x, y) => this.touch(x, y);
  }

  private key(cx: number, cy: number): number {
    return cy * Math.ceil(this.world.w / CH) + cx;
  }

  /** a tile changed: its chunk and any chunk whose edge tiles look at it */
  touch(x: number, y: number): void {
    const cx = Math.floor(x / CH);
    const cy = Math.floor(y / CH);
    const lx = x - cx * CH;
    const ly = y - cy * CH;
    const cols = Math.ceil(this.world.w / CH);
    const rows = Math.ceil(this.world.h / CH);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === -1 && lx > 1) continue;
        if (dx === 1 && lx < CH - 2) continue;
        if (dy === -1 && ly > 1) continue;
        if (dy === 1 && ly < CH - 2) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        this.revs[this.key(nx, ny)]++;
      }
    }
  }

  /** forget every cached chunk (after a load) */
  reset(): void {
    this.chunks.clear();
    this.revs.fill(0);
  }

  // ------------------------------------------------------------------ drawing
  /** draw the cached back (walls) layer for the view */
  drawBack(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    this.drawLayer(ctx, camX, camY, vw, vh, 'back');
  }

  drawFore(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    this.drawLayer(ctx, camX, camY, vw, vh, 'fore');
    this.frame++;
    if (this.chunks.size > 48) this.evict();
  }

  private drawLayer(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number, layer: 'back' | 'fore'): void {
    const cols = Math.ceil(this.world.w / CH);
    const rows = Math.ceil(this.world.h / CH);
    const cx0 = Math.max(0, Math.floor(camX / CPX));
    const cy0 = Math.max(0, Math.floor(camY / CPX));
    const cx1 = Math.min(cols - 1, Math.floor((camX + vw) / CPX));
    const cy1 = Math.min(rows - 1, Math.floor((camY + vh) / CPX));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const ch = this.get(cx, cy);
        ctx.drawImage(layer === 'back' ? ch.back : ch.fore, cx * CPX - camX, cy * CPX - camY);
      }
    }
  }

  private get(cx: number, cy: number): Chunk {
    const k = this.key(cx, cy);
    let ch = this.chunks.get(k);
    const rev = this.revs[k];
    if (!ch) {
      const [fore] = makeCanvas(CPX, CPX);
      const [back] = makeCanvas(CPX, CPX);
      ch = { fore, back, rev: -1, used: 0 };
      this.chunks.set(k, ch);
    }
    if (ch.rev !== rev) {
      this.renderChunk(ch, cx, cy);
      ch.rev = rev;
    }
    ch.used = this.frame;
    return ch;
  }

  private evict(): void {
    const list = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < list.length - 36; i++) this.chunks.delete(list[i][0]);
  }

  /** material of a solid tile, ores resolved to the rock that surrounds them */
  private matAt(x: number, y: number, b: number): number {
    const m = matOf(b);
    if (m >= 0) return m;
    return this.hostMat(x, y);
  }

  private hostMat(x: number, y: number): number {
    const w = this.world;
    const votes = new Map<number, number>();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const m = matOf(w.get(x + dx, y + dy));
      if (m < 0 || m === MAT.lava || m === MAT.water || m === MAT.planks) continue;
      votes.set(m, (votes.get(m) ?? 0) + (dx && dy ? 1 : 2));
    }
    let best = -1;
    let bv = 0;
    for (const [m, v] of votes) if (v > bv) [best, bv] = [m, v];
    if (best >= 0) return best;
    const bi = biomeRow(y);
    return matOf(BIOMES[bi].base) >= 0 ? matOf(BIOMES[bi].base) : MAT.stone;
  }

  private renderChunk(ch: Chunk, cx: number, cy: number): void {
    const w = this.world;
    const x0 = cx * CH;
    const y0 = cy * CH;
    // ---- back walls
    const bctx = ch.back.getContext('2d') as CanvasRenderingContext2D;
    bctx.clearRect(0, 0, CPX, CPX);
    for (let ty = 0; ty < CH; ty++) {
      for (let tx = 0; tx < CH; tx++) {
        const x = x0 + tx;
        const y = y0 + ty;
        if (!w.inside(x, y)) continue;
        const wall = w.wall[y * w.w + x];
        if (!wall) continue;
        // hidden behind solid rock with solid rock all round: nothing to see
        const m = matOf(wall) >= 0 ? matOf(wall) : this.hostMat(x, y);
        const sx = tx * TILE;
        const sy = ty * TILE;
        bctx.globalCompositeOperation = 'source-over';
        bctx.drawImage(ART.wallTex[m], (x % 4) * TILE, (y % 4) * TILE, TILE, TILE, sx, sy, TILE, TILE);
        const up = !w.getWall(x, y - 1) && !w.rock(x, y - 1);
        const rt = !w.getWall(x + 1, y) && !w.rock(x + 1, y);
        const dn = !w.getWall(x, y + 1) && !w.rock(x, y + 1);
        const lf = !w.getWall(x - 1, y) && !w.rock(x - 1, y);
        const mask = (up ? 1 : 0) | (rt ? 2 : 0) | (dn ? 4 : 0) | (lf ? 8 : 0);
        if (mask) {
          const v = hash(x, y * 3 + 1) < 0.5 ? 0 : 1;
          bctx.globalCompositeOperation = 'source-atop';
          bctx.drawImage(ART.wallShade[v * 16 + mask], sx, sy);
          bctx.globalCompositeOperation = 'destination-out';
          bctx.drawImage(ART.wallCut[v * 16 + mask], sx, sy);
        }
      }
    }
    bctx.globalCompositeOperation = 'source-over';
    // ambient occlusion: open tiles darken where they meet rock
    for (let ty = 0; ty < CH; ty++) {
      for (let tx = 0; tx < CH; tx++) {
        const x = x0 + tx;
        const y = y0 + ty;
        if (!w.inside(x, y) || w.rock(x, y) || !w.wall[y * w.w + x]) continue;
        const sx = tx * TILE;
        const sy = ty * TILE;
        const su = w.rock(x, y - 1);
        const sl = w.rock(x - 1, y);
        const sr = w.rock(x + 1, y);
        const sd = w.rock(x, y + 1);
        if (su) {
          bctx.fillStyle = 'rgba(0,0,0,0.42)';
          bctx.fillRect(sx, sy, TILE, 5);
          bctx.fillStyle = 'rgba(0,0,0,0.22)';
          bctx.fillRect(sx, sy + 5, TILE, 6);
          bctx.fillStyle = 'rgba(0,0,0,0.1)';
          bctx.fillRect(sx, sy + 11, TILE, 6);
        }
        if (sl) {
          bctx.fillStyle = 'rgba(0,0,0,0.3)';
          bctx.fillRect(sx, sy, 4, TILE);
          bctx.fillStyle = 'rgba(0,0,0,0.14)';
          bctx.fillRect(sx + 4, sy, 5, TILE);
        }
        if (sr) {
          bctx.fillStyle = 'rgba(0,0,0,0.3)';
          bctx.fillRect(sx + TILE - 4, sy, 4, TILE);
          bctx.fillStyle = 'rgba(0,0,0,0.14)';
          bctx.fillRect(sx + TILE - 9, sy, 5, TILE);
        }
        if (sd) {
          bctx.fillStyle = 'rgba(0,0,0,0.25)';
          bctx.fillRect(sx, sy + TILE - 3, TILE, 3);
        }
      }
    }

    // ---- foreground rock
    const fctx = ch.fore.getContext('2d') as CanvasRenderingContext2D;
    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, CPX, CPX);
    const seams: [number, number, number][] = [];
    for (let ty = 0; ty < CH; ty++) {
      for (let tx = 0; tx < CH; tx++) {
        const x = x0 + tx;
        const y = y0 + ty;
        if (!w.inside(x, y)) continue;
        const b = w.fg[y * w.w + x];
        const def = BLOCKS[b];
        if (!def.solid) continue;
        const m = this.matAt(x, y, b);
        const sx = tx * TILE;
        const sy = ty * TILE;
        fctx.globalCompositeOperation = 'source-over';
        fctx.drawImage(ART.tex[m], (x % 4) * TILE, (y % 4) * TILE, TILE, TILE, sx, sy, TILE, TILE);
        const ore = oreRow(b);
        if (ore >= 0) {
          const v = Math.floor(hash(x * 5, y * 11) * 3);
          fctx.drawImage(A.ores, v * 32, ore * 32, 32, 32, sx, sy, 32, 32);
        }
        // where two different rocks meet, a thin dark seam so pockets read as embedded
        for (const [dx, dy, side] of [[1, 0, 1], [0, 1, 2]] as const) {
          const nb = w.get(x + dx, y + dy);
          if (!BLOCKS[nb].solid || nb === b) continue;
          if (this.matAt(x + dx, y + dy, nb) === m) continue;
          seams.push([sx, sy, side]);
        }
      }
    }
    // seams are drawn before the rims so the rim cut can still trim them
    fctx.globalCompositeOperation = 'source-atop';
    fctx.fillStyle = 'rgba(8,4,10,0.5)';
    for (const [sx, sy, side] of seams) {
      if (side === 1) {
        for (let k = 0; k < TILE; k += 4) fctx.fillRect(sx + TILE - 1 - (hash(sx + k, sy) < 0.3 ? 1 : 0), sy + k, 2, 4);
      } else {
        for (let k = 0; k < TILE; k += 4) fctx.fillRect(sx + k, sy + TILE - 1 - (hash(sx, sy + k) < 0.3 ? 1 : 0), 4, 2);
      }
    }
    // large-scale light and dark patches so the texture period never shows
    const t = this.tctx;
    const tw = CH + 2;
    const img = t.createImageData(tw, tw);
    for (let j = 0; j < tw; j++) {
      for (let i = 0; i < tw; i++) {
        const n = smoothNoise(x0 + i - 1, y0 + j - 1, 5, 77) * 0.65 + smoothNoise(x0 + i - 1, y0 + j - 1, 13, 151) * 0.35;
        const p = (j * tw + i) * 4;
        img.data[p + 3] = Math.round(Math.max(0, n - 0.35) * 0.42 * 255);
      }
    }
    t.putImageData(img, 0, 0);
    fctx.globalCompositeOperation = 'source-atop';
    fctx.imageSmoothingEnabled = true;
    fctx.drawImage(this.tint, 1, 1, CH, CH, 0, 0, CPX, CPX);
    fctx.imageSmoothingEnabled = false;
    // rims: shade then cut, per exposed tile
    for (let ty = 0; ty < CH; ty++) {
      for (let tx = 0; tx < CH; tx++) {
        const x = x0 + tx;
        const y = y0 + ty;
        if (!w.inside(x, y)) continue;
        const b = w.fg[y * w.w + x];
        if (!BLOCKS[b].solid) continue;
        const up = !BLOCKS[w.get(x, y - 1)].solid;
        const rt = !BLOCKS[w.get(x + 1, y)].solid;
        const dn = !BLOCKS[w.get(x, y + 1)].solid;
        const lf = !BLOCKS[w.get(x - 1, y)].solid;
        const mask = (up ? 1 : 0) | (rt ? 2 : 0) | (dn ? 4 : 0) | (lf ? 8 : 0);
        const sx = tx * TILE;
        const sy = ty * TILE;
        if (mask) {
          const v = hash(x * 3 + y * 7, 11) < 0.5 ? 0 : 1;
          fctx.globalCompositeOperation = 'source-atop';
          fctx.drawImage(ART.shade[v * 16 + mask], sx, sy);
          fctx.globalCompositeOperation = 'destination-out';
          fctx.drawImage(ART.cut[v * 16 + mask], sx, sy);
        }
        // inner corners: a dark notch where only the diagonal is open
        fctx.globalCompositeOperation = 'source-atop';
        fctx.fillStyle = 'rgba(6,4,10,0.55)';
        if (!up && !lf && !BLOCKS[w.get(x - 1, y - 1)].solid) fctx.fillRect(sx, sy, 2, 2);
        if (!up && !rt && !BLOCKS[w.get(x + 1, y - 1)].solid) fctx.fillRect(sx + TILE - 2, sy, 2, 2);
        if (!dn && !lf && !BLOCKS[w.get(x - 1, y + 1)].solid) fctx.fillRect(sx, sy + TILE - 2, 2, 2);
        if (!dn && !rt && !BLOCKS[w.get(x + 1, y + 1)].solid) fctx.fillRect(sx + TILE - 2, sy + TILE - 2, 2, 2);
      }
    }
    fctx.globalCompositeOperation = 'source-over';
  }

}

function biomeRow(y: number): number {
  for (let i = BIOMES.length - 1; i >= 0; i--) if (y >= BIOMES[i].top) return i;
  return 0;
}

/**
 * Two 32x32 stencils for one exposed-side mask: the pixels to cut away (ragged edge,
 * rounded outer corners) and the paint for what remains (dark outline, lit top lip, shade).
 */
function frameMasks(mask: number, seed: number, wall: boolean): [HTMLCanvasElement, HTMLCanvasElement] {
  const U = mask & 1;
  const R = mask & 2;
  const D = mask & 4;
  const L = mask & 8;
  const edge = (side: number, i: number): number => {
    const a = hash(seed * 4 + side, Math.floor(i / 3));
    const b = hash(seed * 4 + side, Math.floor(i / 3) + 1);
    const t = (i % 3) / 3;
    const n = a * (1 - t) + b * t;
    if (wall) return n < 0.5 ? 0 : 1;
    return n < 0.35 ? 0 : n < 0.8 ? 1 : 2;
  };
  const cut = new Uint8Array(32 * 32);
  const R0 = wall ? 3 : 5;
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
  const [cc, cctx] = makeCanvas(32, 32);
  const [sc, sctx] = makeCanvas(32, 32);
  const ci = cctx.createImageData(32, 32);
  const si = sctx.createImageData(32, 32);
  const put = (d: Uint8ClampedArray, p: number, r: number, g: number, b: number, a: number): void => {
    d[p] = r;
    d[p + 1] = g;
    d[p + 2] = b;
    d[p + 3] = a;
  };
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const p = (y * 32 + x) * 4;
      if (cut[y * 32 + x]) {
        put(ci.data, p, 0, 0, 0, 255);
        continue;
      }
      const outline = isCut(x - 1, y) || isCut(x + 1, y) || isCut(x, y - 1) || isCut(x, y + 1);
      if (outline) {
        put(si.data, p, 6, 4, 10, wall ? 150 : 235);
        continue;
      }
      if (wall) {
        if (isCut(x, y - 2) || isCut(x - 2, y) || isCut(x + 2, y) || isCut(x, y + 2)) put(si.data, p, 0, 0, 0, 70);
        continue;
      }
      // lit lip just under an exposed top, shade toward an exposed bottom
      if (isCut(x, y - 2) || isCut(x, y - 3)) put(si.data, p, 255, 246, 220, 78);
      else if (isCut(x - 2, y) || isCut(x + 2, y) || isCut(x, y + 2)) put(si.data, p, 0, 0, 0, 92);
      else if (isCut(x, y + 3) || isCut(x, y + 4)) put(si.data, p, 0, 0, 0, 52);
      else if (isCut(x - 3, y)) put(si.data, p, 255, 246, 220, 26);
      else if (isCut(x + 3, y)) put(si.data, p, 0, 0, 0, 34);
      else if (U && y < 7) put(si.data, p, 255, 246, 220, 14);
    }
  }
  cctx.putImageData(ci, 0, 0);
  sctx.putImageData(si, 0, 0);
  return [cc, sc];
}
