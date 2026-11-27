/**
 * Tallow: a scruffy terrier the Wick's light draws in from the hills the first morning after
 * it is kindled. Win him over with something to eat and he is yours: he trots at your heels into
 * the dark, steadies your nerve just by being there, growls at what is coming before you can see
 * it, noses out buried relics and unopened chests, and once a day digs something up in the
 * meadow. Tell him to stay and he waits where you left him. Nothing in the mountain can hurt him.
 */
import type { Game } from './game';
import type { Enemy } from './entities';
import { Drop } from './entities';
import { TILE } from './constants';
import { audio } from './audio';
import { B } from './data/blocks';
import { ITEMS } from './data/items';
import { NERVE_SHAKEN } from './data/nerve';
import { WICK_X } from './data/wick';
import { count, takeItems } from './state';
import { Obj } from './world/world';
import { groundAt } from './world/gen';
import { isNight } from './game';

export const DOG_NAME = 'Tallow';

/** what the save keeps of him */
export interface DogSave {
  /** won over: he is yours */
  found: boolean;
  /** told to stay where he is */
  stay: boolean;
  /** where he stands (feet, px) */
  x: number;
  y: number;
  /** the day he last dug something up */
  dug: number;
  /** the finds he has already caught the scent of (tile indices) */
  sniffed?: number[];
}

export type DogAnim = 'idle' | 'walk' | 'run' | 'bark' | 'sniff' | 'sit' | 'dig' | 'leap';

/** rows of camp/dog.png (52px cells): frames, frames a second, and the row's foot line */
export const DOG_SHEET: Record<Exclude<DogAnim, 'leap'>, { row: number; n: number; fps: number; feet: number }> = {
  idle: { row: 0, n: 8, fps: 6, feet: 38 },
  walk: { row: 1, n: 6, fps: 10, feet: 38 },
  run: { row: 2, n: 6, fps: 14, feet: 37 },
  bark: { row: 3, n: 6, fps: 12, feet: 38 },
  sniff: { row: 4, n: 8, fps: 9, feet: 36 },
  sit: { row: 5, n: 7, fps: 10, feet: 38 },
  dig: { row: 6, n: 7, fps: 14, feet: 38 },
};
export const DOG_CELL = 52;

/** what he digs up in the meadow, once a day */
const FINDS: [number, string, number, number][] = [
  [45, 'coin', 6, 16],
  [12, 'seeds', 2, 3],
  [10, 'coal', 2, 3],
  [10, 'copper', 2, 3],
  [9, 'oil', 1, 1],
  [8, 'oldboot', 1, 1],
  [6, 'pearl', 1, 1],
];

/** foods he will take from your hand, the ones he likes best first */
const TREATS = ['steak', 'rawmeat', 'grilledfish', 'perch', 'trout', 'minnow', 'bread', 'stew', 'roastshroom', 'berries', 'mushroom'];

export class Dog {
  /** in the world at all: a stray waiting by the Wick, or yours */
  present = false;
  x = 0;
  y = 0;
  facing = 1;
  anim: DogAnim = 'idle';
  animT = 0;
  /** seconds he has stood still (he sits after a moment) */
  private stillT = 0;
  /** your trail, which he follows */
  private trail: { x: number; y: number; s: number }[] = [];
  private s = 0;
  private lastPx = NaN;
  private lastPy = NaN;
  /** a one-off pose playing (a bark, a sniff), and how long it has left */
  private pose: DogAnim | null = null;
  private poseT = 0;
  private growlT = 2;
  private scanT = 1;
  private scentT = 0;
  private whineT = 6;
  private petT = 0;
  /** seconds spent up in the meadow by day with you, toward his daily dig */
  private meadowT = 0;
  private digging: { x: number; t: number; at: boolean; sound: number } | null = null;
  private warned = new WeakSet<Enemy>();
  private sniffed = new Set<number>();
  /** a bark a moment after another sound (on the game's clock, so it never outlives the world) */
  private later: { t: number; vol: number; at?: { x: number; y: number } } | null = null;
  /** a scent he has caught: wisps rise from that tile for a while */
  scent: { x: number; y: number; t: number } | null = null;
  /** a pat: a little heart floats up */
  heartT = 0;
  /** how lit he is where he stands (for his eyes catching your lamp in the dark) */
  lit = 1;

  /** the save's record of him, if the stray has come at all */
  private rec(g: Game): DogSave | undefined {
    return g.p.dog;
  }

  get found(): boolean {
    return this.present && !!this.saved?.found;
  }
  private saved: DogSave | undefined;

  /** close enough to keep your nerve steady */
  near(g: Game): boolean {
    if (!this.found) return false;
    const pl = g.player;
    return Math.hypot(this.x - pl.cx, this.y - (pl.y + pl.h)) < 6 * TILE;
  }

  /** what pressing E (or tapping) on him does */
  label(g: Game): string {
    const d = this.rec(g);
    if (!d?.found) return this.treat(g) ? 'Offer the stray something to eat' : 'Hold out your hand to the stray';
    return d.stay ? `Pat ${DOG_NAME} and call him along` : `Pat ${DOG_NAME} and tell him to stay`;
  }

  private treat(g: Game): string | null {
    for (const id of TREATS) if (count(g.p, id) > 0) return id;
    for (const s of g.p.inv) if (s && ITEMS[s.id]?.kind === 'food' && !ITEMS[s.id].glow) return s.id;
    return null;
  }

  interact(g: Game): void {
    const d = this.rec(g);
    if (!d) return;
    const pl = g.player;
    this.facing = pl.cx > this.x ? 1 : -1;
    if (!d.found) {
      const id = this.treat(g);
      if (!id) {
        audio.play('dog_whine', { vol: 0.5, at: { x: this.x, y: this.y } });
        g.toast('The stray sniffs your empty hand and looks up at you. Something to eat might win him over.', '#f0d8b0');
        return;
      }
      takeItems(g.p, id, 1);
      d.found = true;
      d.stay = false;
      this.resetTrail(g);
      this.play('bark', 0.6);
      audio.play('eat', { vol: 0.6, pitch: 1.2 });
      this.later = { t: 0.45, vol: 0.7 };
      this.heartT = 1.4;
      g.tally('dog');
      g.toast(`He wolfs down the ${ITEMS[id].name} and decides he is yours. You call him ${DOG_NAME}.`, '#ffd9a0');
      g.hint('dog', `${DOG_NAME} goes where you go. With him close the dark frays you slower, he growls at what is coming before you can see it, and underground he noses out relics and chests. Pat him (E) to tell him to stay, and again to call him.`);
      return;
    }
    // a pat, and stay or come
    this.heartT = 1.2;
    if (this.petT <= 0) {
      this.petT = 20;
      g.p.nerve = Math.min(100, g.p.nerve + 8);
    }
    d.stay = !d.stay;
    if (d.stay) {
      this.digging = null;
      this.stillT = 2;
      g.text(this.x, this.y - 40, `Stay, ${DOG_NAME}.`, '#f0e0c0');
    } else {
      this.resetTrail(g);
      this.play('bark', 0.5);
      audio.play('dog_bark', { vol: 0.55 });
      g.text(this.x, this.y - 40, `Come on, ${DOG_NAME}!`, '#f0e0c0');
    }
  }

  /** drop back in beside you (after a Wickpost, a recall, waking up...) */
  warp(g: Game): void {
    const pl = g.player;
    const w = g.world;
    const fy = pl.y + pl.h;
    const ty = Math.floor((fy - 8) / TILE);
    const gy = Math.floor((fy + 2) / TILE);
    // just behind you if there is floor there, else just ahead, else at your feet
    let x = pl.cx;
    for (const off of [-pl.facing * 26, pl.facing * 26]) {
      const tx = Math.floor((pl.cx + off) / TILE);
      if (!w.solid(tx, ty) && w.solid(tx, gy)) {
        x = pl.cx + off;
        break;
      }
    }
    this.x = x;
    this.y = fy;
    this.stillT = 2;
    this.resetTrail(g);
    this.digging = null;
  }

  private resetTrail(g: Game): void {
    const pl = g.player;
    this.trail = [{ x: this.x, y: this.y, s: 0 }];
    const d = Math.hypot(pl.cx - this.x, pl.y + pl.h - this.y);
    if (d > 0.5) this.trail.push({ x: pl.cx, y: pl.y + pl.h, s: d });
    this.s = 0;
  }

  private play(a: DogAnim, t: number): void {
    this.pose = a;
    this.poseT = t;
    this.animT = 0;
  }

  update(g: Game, dt: number): void {
    const p = g.p;
    const pl = g.player;
    // the stray comes in to the Wick's warmth of a morning once it burns (while you are out of sight of the spot)
    if (!p.dog && p.wick.kindled && !isNight(p.clock) && p.clock < 0.45 && !g.ending) {
      const tx = this.straySpot(g);
      if (Math.abs(pl.cx - (tx + 0.5) * TILE) > 11 * TILE || !g.onSurface()) p.dog = { found: false, stay: true, x: (tx + 0.5) * TILE, y: g.world.skyline[tx] * TILE, dug: -1 };
    }
    const d = (this.saved = p.dog);
    if (!d) {
      this.present = false;
      return;
    }
    if (!this.present) {
      this.present = true;
      this.x = d.x;
      this.y = d.y;
      this.sniffed.clear();
      for (const i of d.sniffed ?? []) this.mark(g, i);
      // (a save made while you lay blacked out has him where you fell)
      if (d.found && !d.stay && !pl.dead && Math.hypot(pl.cx - d.x, pl.y + pl.h - d.y) > 6 * TILE) this.warp(g);
      else this.resetTrail(g);
    }
    if (this.later && (this.later.t -= dt) <= 0) {
      audio.play('dog_bark', { vol: this.later.vol, at: this.later.at });
      this.later = null;
    }
    const fx = pl.cx;
    const fy = pl.y + pl.h;
    // you jumped a long way at once (a Wickpost, a recall, waking up): he comes too
    const jumped = Number.isFinite(this.lastPx) && Math.hypot(fx - this.lastPx, fy - this.lastPy) > 5 * TILE;
    this.lastPx = fx;
    this.lastPy = fy;
    if (d.found && !d.stay && !pl.dead && jumped) this.warp(g);

    this.animT += dt;
    this.heartT = Math.max(0, this.heartT - dt);
    this.petT = Math.max(0, this.petT - dt);
    this.growlT = Math.max(0, this.growlT - dt);
    this.scentT = Math.max(0, this.scentT - dt);
    if (this.scent && (this.scent.t -= dt) <= 0) this.scent = null;
    if (this.pose && (this.poseT -= dt) <= 0) this.pose = null;
    const ox = this.x;
    const oy = this.y;

    if (!d.found || d.stay) {
      // waiting: watching you
      if (Math.abs(fx - this.x) < 10 * TILE) this.facing = fx > this.x ? 1 : -1;
      if (!d.found && Math.hypot(fx - this.x, fy - this.y) < 12 * TILE) {
        g.hint('stray', 'A stray dog has come in to the Wick\'s warmth. He looks hungry: hold out something to eat (E).');
        if ((this.whineT -= dt) <= 0) {
          this.whineT = 9 + Math.random() * 8;
          audio.play('dog_whine', { vol: 0.35, at: { x: this.x, y: this.y } });
        }
      }
    } else if (this.digging) {
      this.track(g);
      this.updateDig(g, dt);
    } else if (!pl.dead) this.follow(g, dt);

    // what he did this frame decides how he looks
    const dx = this.x - ox;
    const dy = this.y - oy;
    const moved = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.05) this.facing = Math.sign(dx);
    let anim: DogAnim;
    if (this.digging && !this.digging.at) anim = 'run';
    else if (this.digging) anim = 'dig';
    else if (moved > 0.2) {
      this.stillT = 0;
      const speed = moved / Math.max(dt, 0.001);
      anim = Math.abs(dy) > Math.abs(dx) * 1.3 ? 'leap' : speed > 230 ? 'run' : 'walk';
    } else {
      this.stillT += dt;
      anim = this.stillT > 1.4 || d.stay || !d.found ? 'sit' : 'idle';
    }
    if (this.pose) anim = this.pose;
    if (anim !== this.anim) {
      // sitting down plays once; walking into a sit from a sit does not restart it
      if (!(anim === 'sit' && this.anim === 'sit')) this.animT = 0;
      this.anim = anim;
    }
    d.x = this.x;
    d.y = this.y;
    const tx = Math.floor(this.x / TILE);
    const ty = Math.floor((this.y - 12) / TILE);
    this.lit = g.light.at(tx, ty);

    if (!d.found || d.stay || pl.dead) return;
    this.watch(g, dt);
    this.nose(g);
    this.meadow(g, dt);
    // shaken, he presses close and whines
    if (p.nerve < NERVE_SHAKEN && this.near(g)) {
      if ((this.whineT -= dt) <= 0) {
        this.whineT = 10 + Math.random() * 7;
        audio.play('dog_whine', { vol: 0.4, at: { x: this.x, y: this.y } });
      }
    }
  }

  /** where the stray turns up: beside Pell's corner of the Wick, on ground that has not been dug out or built over */
  private straySpot(g: Game): number {
    const w = g.world;
    const base = groundAt(w, WICK_X);
    for (const off of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
      const tx = WICK_X - 6 + off;
      if (tx > 1 && tx < w.w - 2 && Math.abs(w.skyline[tx] - base) <= 2 && w.rock(tx, w.skyline[tx])) return tx;
    }
    return WICK_X - 6;
  }

  /** a find he has caught the scent of, and the rest of its seam round it */
  private mark(g: Game, i: number): void {
    const w = g.world;
    const bx = i % w.w;
    const by = Math.floor(i / w.w);
    for (let y = by - 2; y <= by + 2; y++) for (let x = bx - 2; x <= bx + 2; x++) if (x >= 0 && y >= 0 && x < w.w && y < w.h) this.sniffed.add(y * w.w + x);
  }

  /** your footsteps, as he will follow them */
  private track(g: Game): { x: number; y: number; s: number } {
    const pl = g.player;
    const fx = pl.cx;
    const fy = pl.y + pl.h;
    let last = this.trail[this.trail.length - 1];
    if (!last) {
      last = { x: this.x, y: this.y, s: 0 };
      this.trail.push(last);
    }
    const step = Math.hypot(fx - last.x, fy - last.y);
    if (step >= 4) {
      last = { x: fx, y: fy, s: last.s + step };
      this.trail.push(last);
    }
    return last;
  }

  /** back from a dig: over to where he stepped off your trail, then along it after you */
  private rejoin(): void {
    const from = this.trail.length ? this.at(this.s) : { x: this.x, y: this.y };
    const pts = [{ x: this.x, y: this.y }, from, ...this.trail.filter((t) => t.s > this.s)];
    let s = 0;
    this.trail = pts.map((pt, i) => {
      if (i) s += Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y);
      return { x: pt.x, y: pt.y, s };
    });
    this.s = 0;
  }

  /** trot along your trail, a little behind */
  private follow(g: Game, dt: number): void {
    const pl = g.player;
    const fx = pl.cx;
    const fy = pl.y + pl.h;
    const last = this.track(g);
    const head = last.s + Math.hypot(fx - last.x, fy - last.y);
    // too far behind to catch up on foot (a long drop, a minecart): he turns up beside you
    if (head - this.s > 70 * TILE) {
      this.warp(g);
      return;
    }
    const close = Math.abs(this.x - fx) < 40 && Math.abs(this.y - fy) < 20;
    const air = !this.standing(g);
    const target = air ? head : head - 42;
    if (target > this.s && (!close || air)) {
      const gap = target - this.s;
      this.s = Math.min(target, this.s + (gap > 400 ? 560 : gap > 120 ? 300 : 150) * dt);
    }
    const at = this.at(this.s);
    this.x = at.x;
    this.y = at.y;
    while (this.trail.length > 2 && this.trail[1].s <= this.s) this.trail.shift();
  }

  /** something under his feet (rock, or a ladder top) */
  private standing(g: Game): boolean {
    const w = g.world;
    const ty = Math.floor((this.y + 2) / TILE);
    for (const ox of [-6, 0, 6]) {
      const tx = Math.floor((this.x + ox) / TILE);
      if (w.solid(tx, ty) || w.getObj(tx, ty) === Obj.LADDER || w.getObj(tx, ty - 1) === Obj.LADDER) return true;
    }
    return false;
  }

  private at(sv: number): { x: number; y: number } {
    const t = this.trail;
    if (sv <= t[0].s) return t[0];
    for (let i = 1; i < t.length; i++) {
      if (t[i].s >= sv) {
        const a = t[i - 1];
        const b = t[i];
        const k = (sv - a.s) / Math.max(0.001, b.s - a.s);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return t[t.length - 1];
  }

  /** something coming through the dark: he growls at it (and barks at a Lampless) */
  private watch(g: Game, dt: number): void {
    if ((this.scanT -= dt) > 0) return;
    this.scanT = 0.4;
    if (this.growlT > 0) return;
    let best: Enemy | null = null;
    let bd = 10 * TILE;
    for (const e of g.enemies) {
      if (e.dead || e.def.passive || this.warned.has(e)) continue;
      const dist = Math.hypot(e.cx - this.x, e.cy - this.y);
      if (dist >= bd) continue;
      // he only bothers about what you cannot see: things out in the dark
      if (g.light.at(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE)) > 0.35) continue;
      best = e;
      bd = dist;
    }
    if (!best) return;
    this.warned.add(best);
    this.growlT = 6;
    this.facing = best.cx > this.x ? 1 : -1;
    const at = { x: best.cx, y: best.cy };
    if (best.def.id === 'lampless') {
      this.play('bark', 0.9);
      audio.play('dog_growl', { vol: 0.55, at });
      this.later = { t: 0.5, vol: 0.7, at };
    } else {
      this.play('bark', 0.6);
      audio.play('dog_growl', { vol: 0.6, at });
    }
  }

  /** underground, his nose finds what is buried near: relic-bearing rock and chests nobody has opened */
  private nose(g: Game): void {
    if (this.scentT > 0 || this.pose) return;
    const w = g.world;
    const cx = Math.floor(this.x / TILE);
    const cy = Math.floor((this.y - 8) / TILE);
    if (cy <= w.surface[Math.max(0, Math.min(w.w - 1, cx))] + 3) return;
    this.scentT = 1.2;
    const R = 9;
    let best = -1;
    let bd = Infinity;
    for (let y = cy - R; y <= cy + R; y++) {
      if (y < 0 || y >= w.h) continue;
      for (let x = cx - R; x <= cx + R; x++) {
        if (x < 0 || x >= w.w) continue;
        const i = y * w.w + x;
        if (this.sniffed.has(i)) continue;
        const b = w.fg[i];
        if (b !== B.FOSSIL && b !== B.RELIC_STONE && w.obj[i] !== Obj.CHEST) continue;
        const dd = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (dd < bd && dd <= R * R) {
          bd = dd;
          best = i;
        }
      }
    }
    if (best < 0) return;
    // a find gives off scent for a while, and nearby ones of the same seam count as found too
    const bx = best % w.w;
    const by = Math.floor(best / w.w);
    this.mark(g, best);
    const saved = (this.saved!.sniffed ??= []);
    saved.push(best);
    if (saved.length > 400) saved.shift();
    this.scentT = 18;
    this.scent = { x: bx, y: by, t: 9 };
    this.facing = bx * TILE + TILE / 2 > this.x ? 1 : -1;
    this.play('sniff', 1.6);
    audio.play('dog_sniff', { vol: 0.6, at: { x: bx * TILE + TILE / 2, y: by * TILE + TILE / 2 } });
    g.tally('scent');
    g.hint('scent', `${DOG_NAME} has caught a scent: something is buried in the rock that way. Follow the faint wisps and dig.`);
  }

  /** up in the meadow by day, once a day, he finds a spot and digs */
  private meadow(g: Game, dt: number): void {
    const d = this.saved;
    if (!d || this.digging || isNight(g.p.clock) || g.p.tide || !g.onSurface()) return;
    if (d.dug === g.p.stats.days) return;
    this.meadowT += dt;
    if (this.meadowT < 22 || this.stillT < 0.8) return;
    const w = g.world;
    const here = Math.floor(this.x / TILE);
    const gy = groundAt(w, here);
    if (Math.abs(this.y - gy * TILE) > 6) {
      this.meadowT = 10;
      return;
    }
    const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
    for (const sd of dirs) {
      for (let k = 1; k <= 4; k++) {
        const tx = here + sd * k;
        if (tx < 2 || tx >= w.w - 2) break;
        const ty = groundAt(w, tx);
        if (Math.abs(ty - gy) > 1) break;
        if (k < 2) continue;
        const b = w.get(tx, ty);
        if (b !== B.GRASS && b !== B.DIRT) continue;
        if (w.getObj(tx, ty - 1)) continue;
        this.digging = { x: (tx + 0.5) * TILE, t: 2.4, at: false, sound: 0 };
        this.meadowT = 0;
        return;
      }
    }
    this.meadowT = 10;
  }

  private updateDig(g: Game, dt: number): void {
    const dg = this.digging;
    const d = this.saved;
    if (!dg || !d) return;
    const w = g.world;
    if (!dg.at) {
      const dx = dg.x - this.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), 190 * dt);
      this.x += step;
      const gy = groundAt(w, Math.floor(this.x / TILE)) * TILE;
      this.y += (gy - this.y) * Math.min(1, dt * 14);
      if (Math.abs(dg.x - this.x) < 1) {
        dg.at = true;
        this.facing = Math.random() < 0.5 ? 1 : -1;
      }
      return;
    }
    dg.t -= dt;
    dg.sound -= dt;
    if (dg.sound <= 0) {
      dg.sound = 1.25;
      audio.play('dog_dig', { vol: 0.5, at: { x: this.x, y: this.y } });
    }
    if (Math.random() < dt * 14) {
      const back = -this.facing;
      g.parts.push({ x: this.x + back * 6, y: this.y - 3, vx: back * (60 + Math.random() * 80), vy: -90 - Math.random() * 90, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#7a5434' : '#5c3e26', size: 2, grav: 600, glow: false });
    }
    if (dg.t > 0) return;
    // what came up
    let roll = Math.random() * 100;
    let pick = FINDS[0];
    for (const f of FINDS) {
      if ((roll -= f[0]) < 0) {
        pick = f;
        break;
      }
    }
    const n = pick[2] + Math.floor(Math.random() * (pick[3] - pick[2] + 1));
    const drop = new Drop(pick[1], n, this.x + this.facing * 4, this.y - 8);
    drop.vx = -this.facing * 60;
    g.drops.push(drop);
    d.dug = g.p.stats.days;
    this.digging = null;
    this.rejoin();
    this.play('bark', 0.6);
    audio.play('dog_bark', { vol: 0.6 });
    g.tally('dug');
    g.text(this.x, this.y - 40, `${DOG_NAME} dug something up!`, '#ffd9a0');
  }

  /** the frame to draw now: [sheet row, frame, foot line] */
  frame(): { row: number; f: number; feet: number } {
    const a = this.anim === 'leap' ? 'run' : this.anim;
    const s = DOG_SHEET[a];
    let f: number;
    if (this.anim === 'leap') f = 4;
    // head down and scrabbling: the last four frames, over and over
    else if (a === 'dig') f = 3 + (Math.floor(this.animT * s.fps) % 4);
    else if (a === 'sit') {
      // sits down once, then wags (the last two frames)
      const k = Math.floor(this.animT * s.fps);
      f = k < s.n - 1 ? k : s.n - 2 + (Math.floor(this.animT * 3) % 2);
    } else f = Math.floor(this.animT * s.fps) % s.n;
    return { row: s.row, f, feet: s.feet };
  }

  /** a new world, or leaving one */
  reset(): void {
    this.present = false;
    this.trail = [];
    this.digging = null;
    this.scent = null;
    this.sniffed.clear();
    this.lastPx = NaN;
    this.lastPy = NaN;
  }
}
