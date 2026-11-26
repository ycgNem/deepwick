/**
 * The title screen's backdrop: the game itself. A world is generated and the camera visits a
 * few real places in it (the old mine head at dusk, a lamplit drift, then one cavern in each
 * of the deeper biomes), with a delver walking into frame and standing in the lantern light.
 */
import { Game, UIHooks } from './game';
import type { Input } from './input';
import { generateWorld, groundAt, decorLight, SPAWN_X } from './world/gen';
import { newProgress } from './state';
import { BIOMES } from './data/biomes';
import { BLOCKS, B } from './data/blocks';
import { propOf } from './data/props';
import { World, Obj } from './world/world';
import { TILE } from './constants';
import { WICK_X } from './data/wick';
import { applyGravity, moveBody } from './entities';
import { Rng } from './rng';

const SHOT_TIME = 10;
const FADE = 0.8;
const WALK_SPEED = 120;

interface Shot {
  label: string;
  sub: string;
  biome: number;
  /** the air tile the delver ends up standing in */
  x: number;
  y: number;
  face: 1 | -1;
  /** what the shot is about (tile column): framed beside the delver, clear of the menu */
  fx: number;
  /** tiles walked into frame before stopping */
  walk: number;
  torch: boolean;
  /** a line out on this water tile (column, surface row) */
  fish?: { x: number; row: number };
}

const NO_UI: UIHooks = {
  toast() {},
  open() {},
  isOpen: () => false,
  close() {},
  levelUp() {},
  victory() {},
};

export class TitleScene {
  game: Game;
  onCaption: ((label: string, sub: string) => void) | null = null;
  private shots: Shot[];
  private i = -1;
  private t = 0;
  private drift = 1;

  constructor(input: Input, seed: number) {
    const world = generateWorld(seed);
    const p = newProgress(seed, SPAWN_X, 20);
    p.clock = 0.585;
    // the title shows Deepwick as it should be: the Wick burning bright, the town come home
    p.wick = { kindled: true, lumen: 300 };
    p.equip.lantern = { id: 'ironlantern', n: 1 };
    p.inv[0] = { id: 'ironpick', n: 1 };
    p.inv[1] = { id: 'torch', n: 1 };
    p.inv[2] = { id: 'fishingrod', n: 1 };
    this.game = new Game(input, NO_UI, p, world);
    this.shots = findShots(world, seed);
  }

  /** the caption for the shot on screen (for when the title is shown again) */
  caption(): void {
    const s = this.shots[this.i];
    if (s) this.onCaption?.(s.label, s.sub);
  }

  update(dt: number): void {
    const g = this.game;
    if (this.i < 0 || this.t >= SHOT_TIME) this.next();
    this.t += dt;
    const s = this.shots[this.i];
    const pl = g.player;
    // the delver walks in, then stands looking about
    const goal = (s.x + 0.5) * TILE;
    const walking = Math.abs(pl.cx - goal) > 3 && s.walk > 0;
    pl.vx = walking ? Math.sign(goal - pl.cx) * WALK_SPEED : 0;
    pl.facing = walking ? (Math.sign(goal - pl.cx) as 1 | -1) : s.face;
    applyGravity(pl, dt);
    moveBody(g.world, pl, dt);
    const anim = walking && pl.onGround ? 'walk' : 'idle';
    if (anim !== pl.anim) pl.animT = 0;
    pl.anim = anim;
    pl.animT += dt * (walking ? WALK_SPEED / 165 : 1);
    pl.oil = g.st.oilMax;
    // slow drift across the scene, the delver and the subject in the right-hand part of the screen
    const { tx, ty } = this.camTarget(this.t / SHOT_TIME);
    const ease = 1 - Math.exp(-dt * 3);
    g.camX += (tx - g.camX) * ease;
    g.camY += (ty - g.camY) * ease;
    g.camX = Math.max(0, Math.min(g.camX, g.world.w * TILE - g.viewW));
    g.camY = Math.max(-4 * TILE, Math.min(g.camY, g.world.h * TILE - g.viewH));
    g.fade = this.t < FADE ? 1 - this.t / FADE : this.t > SHOT_TIME - FADE ? (this.t - (SHOT_TIME - FADE)) / FADE : 0;
    g.demoTick(dt);
  }

  private camTarget(k: number): { tx: number; ty: number } {
    const g = this.game;
    const s = this.shots[this.i];
    const pl = g.player;
    const goal = (s.x + 0.5) * TILE;
    const mid = (goal + (s.fx + 0.5) * TILE) / 2;
    return {
      tx: mid - g.viewW * 0.64 + (k - 0.5) * 70 * this.drift,
      ty: pl.y + pl.h - g.viewH * 0.68 - (k - 0.5) * 16,
    };
  }

  private next(): void {
    const g = this.game;
    this.i = (this.i + 1) % this.shots.length;
    this.t = 0;
    this.drift = -this.drift;
    const s = this.shots[this.i];
    g.biome = s.biome;
    g.p.sel = s.fish ? 2 : s.torch ? 1 : 0;
    g.parts = [];
    g.placePlayer((s.x - s.face * s.walk + 0.5) * TILE, (s.y + 1) * TILE);
    g.player.facing = s.face;
    // a line already out: the renderer bobs it on the water (the demo never runs the fishing itself)
    g.fishing = s.fish
      ? { x: (s.fish.x + 0.5) * TILE, y: s.fish.row * TILE + 5, vx: 0, vy: 0, state: 'float', t: 0, wait: 99, catchId: '', tier: 0, needle: 0, dir: 1, speed: 1, zone: 0.5, zoneW: 0.3, hits: 0, need: 1, misses: 0, row: s.fish.row, biome: -1, pond: true }
      : null;
    const c = this.camTarget(0);
    g.camX = c.tx;
    g.camY = c.ty;
    this.onCaption?.(s.label, s.sub);
  }
}

// ---------------------------------------------------------------------------- finding the shots

function standable(w: World, x: number, y: number): boolean {
  if (x < 2 || x > w.w - 3 || y < 2 || y > w.h - 3) return false;
  const here = w.get(x, y);
  return here === B.AIR && w.get(x, y - 1) === B.AIR && w.solid(x, y + 1) && w.get(x, y + 1) !== B.LAVA && !w.getObj(x, y);
}

/** how many tiles the delver can walk in from, on level ground, before reaching x */
function walkRoom(w: World, x: number, y: number, dir: number, max: number): number {
  let k = 0;
  while (k < max) {
    const xx = x - dir * (k + 1);
    if (!(w.get(xx, y) === B.AIR && w.get(xx, y - 1) === B.AIR && w.solid(xx, y + 1) && w.get(xx, y + 1) !== B.LAVA)) break;
    k++;
  }
  return k;
}

function findShots(w: World, seed: number): Shot[] {
  const rng = new Rng(seed ^ 0x7a11);
  const shots: Shot[] = [];
  // the heart of it all: the Wick burning over the town at dusk
  const wx = WICK_X - 3;
  const wy = groundAt(w, wx) - 1;
  if (standable(w, wx, wy)) shots.push({ label: 'The Wick', sub: 'Deepwick, as the light comes home', biome: 0, x: wx, y: wy, face: 1, fx: WICK_X + 1, walk: walkRoom(w, wx, wy, 1, 4), torch: false });
  const entrance = findEntrance(w) ?? findMeadow(w);
  if (entrance) shots.push(entrance);
  const pond = findPond(w);
  if (pond) shots.push(pond);
  const mine = findMine(w);
  if (mine) shots.push(mine);
  for (const bi of [1, 2, 3]) {
    const c = findCavern(w, rng, bi);
    if (c) shots.push(c);
  }
  if (shots.length === 0) {
    const y = groundAt(w, SPAWN_X) - 1;
    shots.push({ label: 'Deepwick Valley', sub: 'where you wake', biome: 0, x: SPAWN_X, y, face: 1, fx: SPAWN_X, walk: 0, torch: false });
  }
  return shots;
}

/** the old mine head that still opens onto the hills */
function findEntrance(w: World): Shot | null {
  for (let x = 4; x < w.w - 4; x++) {
    // the headframe sits on the lower of the two shaft columns' surface rows
    let found = false;
    for (let y = w.surface[x] - 4; y <= w.surface[x] + 2 && !found; y++) found = w.getObj(x, y) === Obj.LADDER && w.getObj(x - 1, y) === Obj.BEAM;
    if (!found) continue;
    // stand a little way off, by the lamp, looking at the headframe
    for (const dir of [1, -1] as const) {
      const sx = dir > 0 ? x - 4 : x + 5;
      const sy = groundAt(w, sx) - 1;
      if (!standable(w, sx, sy)) continue;
      const walk = walkRoom(w, sx, sy, dir, 6);
      return { label: 'Old Deepwick', sub: 'the mine head, at dusk', biome: 0, x: sx, y: sy, face: dir, fx: x, walk, torch: true };
    }
  }
  return null;
}

/** the meadow you wake in, when no mine head made it to the surface */
function findMeadow(w: World): Shot | null {
  for (let d = 0; d < 30; d++) {
    for (const x of [SPAWN_X + d, SPAWN_X - d]) {
      const y = groundAt(w, x) - 1;
      if (!standable(w, x, y)) continue;
      const walk = walkRoom(w, x, y, 1, 5);
      if (walk < 3) continue;
      return { label: 'Deepwick Valley', sub: 'the meadow, at dusk', biome: 0, x, y, face: 1, fx: x + 3, walk, torch: true };
    }
  }
  return null;
}

/** a meadow pond with the line out */
function findPond(w: World): Shot | null {
  for (let d = 0; d < 60; d++) {
    for (const x of [SPAWN_X + d, SPAWN_X - d]) {
      const row = w.surface[x];
      if (w.get(x, row) !== B.WATER || w.get(x, row - 1) !== B.AIR) continue;
      // the pond's near edge, and the bank just beyond it
      const dir = x > SPAWN_X ? -1 : 1;
      let edge = x;
      while (w.get(edge + dir, row) === B.WATER) edge += dir;
      for (let k = 1; k <= 3; k++) {
        const sx = edge + dir * k;
        const sy = groundAt(w, sx) - 1;
        if (!standable(w, sx, sy)) continue;
        // cast a few tiles out from the bank
        const fx = edge - dir * 3;
        const fishX = w.get(fx, row) === B.WATER ? fx : edge;
        return { label: 'Meadow Pond', sub: 'a line out before nightfall', biome: 0, x: sx, y: sy, face: (dir > 0 ? -1 : 1) as 1 | -1, fx: fishX, walk: 0, torch: false, fish: { x: fishX, row } };
      }
    }
  }
  return null;
}

/** a lamplit drift with a cart still on the rails */
function findMine(w: World): Shot | null {
  let best: Shot | null = null;
  let bestScore = -1;
  for (let y = 4; y < w.h - 4; y++) {
    for (let x = 6; x < w.w - 6; x++) {
      if (w.obj[w.idx(x, y)] !== Obj.MINECART) continue;
      let lamps = 0;
      for (let dy = -4; dy <= 1; dy++) for (let dx = -8; dx <= 8; dx++) if (w.getObj(x + dx, y + dy) === Obj.LAMP) lamps++;
      for (const dir of [1, -1] as const) {
        const sx = x - dir * 3;
        if (!standable(w, sx, y)) continue;
        const walk = walkRoom(w, sx, y, dir, 5);
        const score = lamps * 3 + walk;
        if (score > bestScore) {
          bestScore = score;
          best = { label: 'The Old Workings', sub: 'rails, carts and lamps still lit', biome: y >= BIOMES[1].top ? 1 : 0, x: sx, y, face: dir, fx: x, walk, torch: true };
        }
      }
    }
  }
  return best;
}

/** blocks that make a cavern worth looking at, by biome */
const SHOWY: Record<number, Partial<Record<number, number>>> = {
  1: { [B.GLOWMOSS]: 1.2, [B.JADE]: 1, [B.MOSS_STONE]: 0.05 },
  2: { [B.GEODE]: 0.6, [B.AMETHYST]: 1.6, [B.CRYSTAL_ROCK]: 0.05 },
  3: { [B.LAVA]: 0.9, [B.MAGMA_ROCK]: 0.25, [B.RUBY]: 1.5 },
};

const SUBS: Record<number, string> = {
  1: 'glowcaps and mossy roots',
  2: 'amethyst and silver',
  3: 'lava, basalt and rubies',
};

/** the best-looking open, glowing cavern in a biome */
function findCavern(w: World, rng: Rng, bi: number): Shot | null {
  const bm = BIOMES[bi];
  let best: Shot | null = null;
  let bestScore = -1e9;
  for (let n = 0; n < 500; n++) {
    const cx = rng.int(14, w.w - 15);
    const cy = rng.int(bm.top + 8, bm.bottom - 8);
    let open = 0;
    let glow = 0;
    let lava = 0;
    let props = 0;
    let showy = 0;
    const want = SHOWY[bi] ?? {};
    for (let y = cy - 6; y < cy + 6; y++) {
      for (let x = cx - 10; x < cx + 10; x++) {
        const b = w.get(x, y);
        showy += want[b] ?? 0;
        if (w.getWall(x, y) === B.GEODE && b === B.AIR) showy += 0.5;
        if (b === B.AIR) open++;
        if (b === B.LAVA) lava++;
        const L = BLOCKS[b].light;
        if (L && b !== B.LAVA) glow += L[0] + L[1] + L[2];
        const dc = w.decor[w.idx(x, y)];
        if (dc) {
          const dl = decorLight(dc);
          if (dl) glow += dl[0] + dl[1] + dl[2];
          if (propOf(dc)) props++;
        }
      }
    }
    const of = open / 240;
    let score = Math.min(glow, 20) * 1.5 + Math.min(props, 6) * 3 + Math.min(showy, 30) - Math.abs(of - 0.45) * 50;
    if (lava > 40) score -= (lava - 40) * 0.6;
    if (score <= bestScore) continue;
    // somewhere to stand near the middle of the frame
    let spot: { x: number; y: number; walk: number; dir: 1 | -1 } | null = null;
    for (let r = 0; r <= 4 && !spot; r++) {
      for (const dx of r === 0 ? [0] : [-r, r]) {
        for (let dy = -3; dy <= 4 && !spot; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          if (!standable(w, x, y)) continue;
          const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
          spot = { x, y, walk: walkRoom(w, x, y, dir, 5), dir };
        }
      }
    }
    if (!spot) continue;
    bestScore = score + spot.walk;
    best = { label: bm.name, sub: SUBS[bi] ?? '', biome: bi, x: spot.x, y: spot.y, face: spot.dir, fx: cx, walk: spot.walk, torch: false };
  }
  return best;
}
