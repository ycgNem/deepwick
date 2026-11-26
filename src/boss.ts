import type { Game } from './game';
import { TILE } from './constants';
import { BOSS_CENTER } from './world/gen';
import { Enemy, Drop } from './entities';
import { ENEMIES } from './data/enemies';
import { Obj } from './world/world';
import { B } from './data/blocks';
import { audio } from './audio';

export const BOSS_HP = 4500;

export enum Mode {
  /** hanging in its own dark: nothing you do can touch it */
  SHROUD,
  /** the sconces' light tears the shroud away */
  TEAR,
  /** down on the floor, its stolen light showing through: strike it now */
  EXPOSED,
  /** it tears free, rises, and drinks every flame in the chamber */
  RISE,
}

/** an old iron sconce in the chamber wall: light enough of them and the shroud tears */
export interface Sconce {
  tx: number;
  ty: number;
  lit: boolean;
  /** seconds since it was lit or snuffed (for the flare and the fade) */
  t: number;
}

/** a reaching tendril: a pool of dark on the floor first, then the strike */
export interface Tendril {
  x: number;
  y: number;
  t: number;
  struck: boolean;
}

/** how many sconces must burn at once to tear the shroud, by phase */
const NEED = [2, 4, 6];
/** health it cannot be pushed below in each phase (it tears free and rises instead) */
const FLOOR = [BOSS_HP * (2 / 3), BOSS_HP / 3, 0];
/** seconds it lies exposed, by phase */
const OPEN = [8, 7, 6];
/** a lit sconce keeps tendrils out this far around it (px) */
export const SAFE = 3.6 * TILE;

/**
 * The Gloamheart: the thing at the root of the mountain that has been drinking the light. It
 * hangs in the dark at the top of its chamber, wrapped in a shroud nothing can cut, and drinks
 * your lamp while you are near. Around the walls stand the old miners' sconces: light enough
 * of them and their light tears the shroud away, and it sinks to the floor where you can reach
 * it. It fights to keep the dark: Gloamlings come off it to snuff the sconces, tendrils reach
 * for you wherever no sconce burns, your flame gutters, and at the last the Lampless walk.
 * Every time it tears free it rises and drinks every flame in the chamber, and you begin again.
 */
export class Boss {
  x: number;
  y: number;
  r = 50;
  hp = BOSS_HP;
  phase = 0;
  t = 0;
  mode = Mode.SHROUD;
  modeT = 0;
  /** 1 = wrapped in its dark, 0 = laid open */
  shroud = 1;
  flash = 0;
  dead = false;
  deathT = 0;
  intro = 2.2;
  animT = 0;
  /** seconds to the next heartbeat (it quickens as it weakens) */
  beatT = 1;
  /** 0..1, the swell of the last beat (drawn) */
  beat = 0;
  sconces: Sconce[];
  tendrils: Tendril[] = [];
  private tendrilT = 3;
  private raidT = 5;
  private walkT = 6;
  private sweepT = 0;
  private absorbT = 0;
  /** where it hangs, and where it lies when it falls */
  readonly hangY: number;
  readonly lowY: number;
  readonly floorY: number;

  constructor() {
    const { x: cx, y: cy } = BOSS_CENTER;
    this.x = (cx + 0.5) * TILE;
    this.hangY = (cy - 3) * TILE;
    this.floorY = (cy + 6) * TILE;
    this.lowY = this.floorY - this.r - 10;
    this.y = this.hangY;
    this.sconces = [
      [cx - 18, cy + 5],
      [cx - 13, cy + 1],
      [cx - 8, cy + 5],
      [cx + 8, cy + 5],
      [cx + 14, cy + 1],
      [cx + 18, cy + 5],
    ].map(([tx, ty]) => ({ tx, ty, lit: false, t: 9 }));
  }

  get exposed(): boolean {
    return this.mode === Mode.EXPOSED;
  }

  /** how many sconces it takes right now, and how many burn */
  get need(): number {
    return NEED[this.phase];
  }
  get lit(): number {
    return this.sconces.filter((s) => s.lit).length;
  }

  /** it presses on your flame (makes it gutter) from the second phase on, while it hangs shrouded */
  get presses(): boolean {
    return !this.dead && this.intro <= 0 && this.phase >= 1 && this.mode === Mode.SHROUD;
  }

  /** the centre of a sconce's flame, in px */
  flameAt(s: Sconce): { x: number; y: number } {
    return { x: (s.tx + 0.5) * TILE, y: s.ty * TILE + 4 };
  }

  /** a lit sconce near this point keeps the dark from reaching it */
  sheltered(x: number, y: number): boolean {
    return this.sconces.some((s) => s.lit && Math.hypot(this.flameAt(s).x - x, this.flameAt(s).y - y) < SAFE);
  }

  /** one of the lit sconces, for a Gloamling to go and snuff (-1 if none burn) */
  litIndex(): number {
    const lit = this.sconces.map((s, i) => (s.lit ? i : -1)).filter((i) => i >= 0);
    return lit.length ? lit[Math.floor(Math.random() * lit.length)] : -1;
  }

  /** the label on the bar under its name */
  label(): string {
    if (this.dead) return 'THE GLOAMHEART · STILLED';
    if (this.mode === Mode.EXPOSED) return 'THE GLOAMHEART · EXPOSED: STRIKE IT';
    if (this.mode === Mode.SHROUD) return `THE GLOAMHEART · SCONCES ${Math.min(this.lit, this.need)} / ${this.need}`;
    return 'THE GLOAMHEART';
  }

  /** at the start: clear the sconces' ground, and drink every flame already in the chamber */
  wake(g: Game): void {
    const w = g.world;
    for (const s of this.sconces) {
      for (const ty of [s.ty, s.ty - 1]) {
        if (w.solid(s.tx, ty)) w.set(s.tx, ty, B.AIR);
        w.obj[w.idx(s.tx, ty)] = 0;
      }
    }
    this.drinkFlames(g, true);
  }

  /** light a sconce (you, standing beside it) */
  kindle(g: Game, i: number): void {
    const s = this.sconces[i];
    if (!s || s.lit || this.dead) return;
    s.lit = true;
    s.t = 0;
    const f = this.flameAt(s);
    audio.play('ignite', { vol: 0.8 });
    g.burst(f.x, f.y, 26, ['#ffe08a', '#ffb84a', '#fff6d0'], 180, true);
    g.shake = Math.max(g.shake, 3);
    if (this.mode === Mode.SHROUD && this.lit < this.need) g.text(f.x, f.y - 26, `${this.lit} / ${this.need}`, '#ffe08a', true);
  }

  /** a blow, a shot or a blast: only lands when it lies exposed, and never past this phase's floor */
  hurt(g: Game, dmg: number, hx: number, hy: number): number {
    if (this.dead || this.intro > 0) return 0;
    if (!this.exposed) {
      if (this.absorbT <= 0) {
        this.absorbT = 0.6;
        g.text(hx, hy - 10, 'the dark swallows it', '#a08ac8');
      }
      g.burst(hx, hy, 6, ['#1a0c28', '#3a1a5a'], 90);
      return 0;
    }
    const real = Math.min(dmg, Math.max(0, this.hp - FLOOR[this.phase]));
    this.hp -= real;
    this.flash = 0.12;
    // it bleeds the light it drank: some of it comes back to your lamp
    g.player.oil = Math.min(g.st.oilMax, g.player.oil + 2.5);
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2;
      g.parts.push({ x: hx, y: hy, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 40, life: 0.7, max: 0.7, color: Math.random() < 0.5 ? '#ffe08a' : '#ffb84a', size: 2, grav: -30, glow: true });
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(g);
    } else if (this.hp <= FLOOR[this.phase]) this.rise(g, true);
    return real;
  }

  update(g: Game, dt: number): void {
    this.animT += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.absorbT > 0) this.absorbT -= dt;
    for (const s of this.sconces) s.t += dt;
    this.heartbeat(dt);
    if (this.dead) {
      this.deathT += dt;
      // the light it drank pours back out of it
      this.y += (this.lowY - this.y) * Math.min(1, dt * 2);
      this.shroud = Math.max(0, this.shroud - dt * 2);
      if (Math.random() < dt * 34) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * this.r;
        g.burst(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 5, ['#ffe08a', '#ffffff', '#ffb84a'], 200, true);
      }
      if (Math.random() < dt * 4) audio.play('explosion', { vol: 0.4, pitch: 0.7 + Math.random() * 0.4 });
      g.shake = Math.max(g.shake, 3);
      return;
    }
    if (this.intro > 0) {
      this.intro -= dt;
      g.shake = Math.max(g.shake, 2);
      return;
    }
    this.t += dt;
    this.modeT += dt;
    const pl = g.player;
    const cx = (BOSS_CENTER.x + 0.5) * TILE;
    const hx = cx + Math.sin(this.t * 0.35) * 2.5 * TILE;
    const hy = this.hangY + Math.sin(this.t * 0.9) * 8;

    switch (this.mode) {
      case Mode.SHROUD: {
        this.shroud = Math.min(1, this.shroud + dt * 1.5);
        this.x += (hx - this.x) * Math.min(1, dt * 2);
        this.y += (hy - this.y) * Math.min(1, dt * 2);
        this.drinkLamp(g, dt);
        this.reach(g, dt);
        this.sendRaiders(g, dt);
        if (this.phase >= 2) this.sendLampless(g, dt);
        this.sweepT -= dt;
        if (this.sweepT <= 0) {
          this.sweepT = 0.5;
          this.drinkFlames(g, false);
        }
        if (this.lit >= this.need) this.setMode(Mode.TEAR);
        break;
      }
      case Mode.TEAR:
        if (this.modeT <= dt) {
          audio.play('roar', { vary: 0, pitch: 0.8 });
          g.shake = Math.max(g.shake, 10);
          this.tendrils = [];
          // the light burns its children away
          for (const e of g.enemies) if (e.def.shade && e.raid >= 0) e.hp = 0;
          g.toast('The light tears its shroud away!', '#ffe08a');
        }
        this.shroud = Math.max(0, 1 - this.modeT / 1);
        this.x += (hx - this.x) * Math.min(1, dt * 2);
        if (this.modeT > 1) this.setMode(Mode.EXPOSED);
        break;
      case Mode.EXPOSED:
        this.shroud = 0;
        this.y += (this.lowY - this.y) * Math.min(1, dt * 3.5);
        if (this.modeT <= dt) {
          audio.play('explosion', { pitch: 0.55, vary: 0 });
          g.shake = Math.max(g.shake, 8);
          g.hint('gloamheart_open', 'It is down and laid open. Strike it now, before it tears free: every blow takes back a little of the light it drank.');
        }
        if (this.modeT > OPEN[this.phase]) this.rise(g, false);
        break;
      case Mode.RISE:
        this.x += (hx - this.x) * Math.min(1, dt * 1.6);
        this.y += (hy - this.y) * Math.min(1, dt * 1.6);
        this.shroud = Math.min(1, this.modeT / 1.2);
        if (this.modeT > 1.6) this.setMode(Mode.SHROUD);
        break;
    }
    this.updateTendrils(g, dt);
    this.raidersArrive(g);

    // touching it while it hangs in its dark burns
    if (this.mode !== Mode.EXPOSED && !pl.dead && Math.hypot(pl.cx - this.x, pl.cy - this.y) < this.r + 10) g.hurtPlayer(28, this.x);
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.modeT = 0;
  }

  /** it beats, slow at first and faster as it weakens; you feel it */
  private heartbeat(dt: number): void {
    this.beat = Math.max(0, this.beat - dt * 3);
    this.beatT -= dt;
    if (this.beatT > 0) return;
    const weak = 1 - this.hp / BOSS_HP;
    this.beatT = this.dead ? 0.35 : 1.4 - weak * 0.7;
    this.beat = 1;
    if (this.intro <= 0 || this.dead) audio.play('heartbeat', { vol: 0.55, pitch: 0.7 + weak * 0.2, vary: 0 });
  }

  /** tears free: back up into the dark, and it drinks every flame in the chamber */
  private rise(g: Game, broke: boolean): void {
    if (this.mode === Mode.RISE) return;
    const next = broke ? Math.min(2, this.phase + 1) : this.phase;
    this.setMode(Mode.RISE);
    audio.play('heartdrink', { vol: 0.9, vary: 0 });
    audio.play('roar', { pitch: 1.1, vol: 0.6 });
    g.shake = Math.max(g.shake, 8);
    for (const s of this.sconces) {
      if (!s.lit) continue;
      s.lit = false;
      s.t = 0;
      this.stream(g, this.flameAt(s).x, this.flameAt(s).y, 16);
    }
    if (next !== this.phase) {
      this.phase = next;
      this.tendrilT = 2.5;
      this.raidT = 3;
      g.toast(next === 1 ? 'The Gloamheart drinks the sconces dry, and your own flame shudders.' : 'The Gloamheart drinks deep. Something walks in the dark of the chamber.', '#c08aff');
    } else g.toast('It tears free and drinks the sconces dry.', '#c08aff');
  }

  private die(g: Game): void {
    this.dead = true;
    this.shroud = 0;
    this.tendrils = [];
    for (const s of this.sconces) {
      s.lit = true;
      s.t = 0;
    }
    g.onBossStilled();
  }

  /** while you are near and it hangs in its dark, it drinks your lamp: you see the light go */
  private drinkLamp(g: Game, dt: number): void {
    const pl = g.player;
    if (pl.dead || g.st.oilMax <= 0 || pl.oil <= 0) return;
    pl.oil = Math.max(0, pl.oil - dt * [0.6, 0.9, 1.2][this.phase]);
    if (Math.random() < dt * 14) {
      const dx = this.x - pl.cx;
      const dy = this.y - (pl.y + 8);
      const d = Math.hypot(dx, dy) || 1;
      const v = 150 + Math.random() * 60;
      g.parts.push({ x: pl.cx + (Math.random() - 0.5) * 8, y: pl.y + 8, vx: (dx / d) * v, vy: (dy / d) * v, life: d / v, max: d / v, color: Math.random() < 0.5 ? '#ffe08a' : '#ffc870', size: 1, grav: 0, glow: true });
    }
  }

  /** a ribbon of light pulled from a point into the heart */
  private stream(g: Game, x: number, y: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const sx = x + (Math.random() - 0.5) * 14;
      const sy = y + (Math.random() - 0.5) * 10;
      const dx = this.x - sx;
      const dy = this.y - sy;
      const d = Math.hypot(dx, dy) || 1;
      const v = 220 + Math.random() * 160;
      g.parts.push({ x: sx, y: sy, vx: (dx / d) * v, vy: (dy / d) * v, life: d / v, max: d / v, color: Math.random() < 0.5 ? '#ffe08a' : '#ffb84a', size: Math.random() < 0.3 ? 2 : 1, grav: 0, glow: true });
    }
  }

  /** no flame but the sconces burns in its chamber: torches, lamps and fires go out (you get them back) */
  private drinkFlames(g: Game, quiet: boolean): void {
    const w = g.world;
    const { x: cx, y: cy } = BOSS_CENTER;
    let drank = 0;
    for (let ty = cy - 10; ty <= cy + 6; ty++) {
      for (let tx = cx - 25; tx <= cx + 25; tx++) {
        const o = w.getObj(tx, ty);
        const item = o === Obj.TORCH ? 'torch' : o === Obj.LAMP ? 'lamp' : o === Obj.CAMPFIRE ? 'campfire' : null;
        if (!item) continue;
        w.setObj(tx, ty, 0);
        g.drops.push(new Drop(item, 1, tx * TILE + 16, ty * TILE + 16));
        this.stream(g, tx * TILE + 16, ty * TILE + 10, 10);
        drank++;
      }
    }
    if (drank && !quiet) {
      audio.play('heartdrink', { vol: 0.6 });
      g.hint('gloamheart_flames', 'The Gloamheart drinks every flame you set in its chamber. Only the old sconces hold their light against it.');
    }
  }

  /** where no sconce burns, the dark reaches down for you */
  private reach(g: Game, dt: number): void {
    const pl = g.player;
    this.tendrilT -= dt;
    if (this.tendrilT > 0 || pl.dead) return;
    this.tendrilT = [3.6, 2.8, 2.2][this.phase];
    const fx = pl.cx + pl.vx * 0.35;
    const fy = pl.y + pl.h;
    if (this.sheltered(fx, fy - 16)) return;
    this.tendrils.push({ x: fx, y: fy, t: 0, struck: false });
    if (this.phase >= 2 && Math.random() < 0.5) this.tendrils.push({ x: fx + (Math.random() < 0.5 ? -1 : 1) * 2.5 * TILE, y: fy, t: -0.25, struck: false });
  }

  private updateTendrils(g: Game, dt: number): void {
    const pl = g.player;
    for (const td of this.tendrils) {
      td.t += dt;
      if (!td.struck && td.t >= 0.9) {
        td.struck = true;
        audio.play('tendril', { vol: 0.8 });
        g.shake = Math.max(g.shake, 6);
        g.burst(td.x, td.y - 4, 18, ['#1a0c28', '#3a1a5a', '#6a3a8a'], 180);
        if (!pl.dead && Math.abs(pl.cx - td.x) < 1.3 * TILE && pl.y + pl.h > td.y - 3 * TILE && pl.y < td.y + TILE) {
          g.hurtPlayer(28 + this.phase * 6, td.x);
          g.p.nerve = Math.max(0, g.p.nerve - 6);
        }
      }
    }
    this.tendrils = this.tendrils.filter((td) => td.t < 1.3);
  }

  /** its children go for the sconces: a Gloamling that reaches one snuffs it */
  private sendRaiders(g: Game, dt: number): void {
    this.raidT -= dt;
    if (this.raidT > 0) return;
    this.raidT = [6.5, 5, 4][this.phase];
    if (!this.lit) return;
    const n = this.phase === 0 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const i = this.litIndex();
      if (i < 0) break;
      const e = new Enemy(ENEMIES.gloamling, this.x + (Math.random() - 0.5) * 40, this.y + 30);
      e.raid = i;
      e.hp = 10 + this.phase * 3;
      g.enemies.push(e);
      g.burst(e.cx, e.cy, 10, ['#2a1446', '#5a2e8f'], 90);
    }
    audio.play('gloam_hiss', { vol: 0.5, pitch: 0.8 });
    g.hint('gloamheart_raid', 'Gloamlings come off the heart to snuff the sconces. Cut them down before they reach the flame.');
  }

  private raidersArrive(g: Game): void {
    for (const e of g.enemies) {
      if (e.dead || e.raid < 0) continue;
      const s = this.sconces[e.raid];
      if (!s?.lit) continue;
      const f = this.flameAt(s);
      if (Math.hypot(e.cx - f.x, e.cy - f.y) > 0.8 * TILE) continue;
      s.lit = false;
      s.t = 0;
      e.dead = true;
      audio.play('hiss', { vol: 0.7, pitch: 0.8 });
      g.burst(f.x, f.y, 16, ['#2a1446', '#5a2e8f', '#ffb84a'], 120);
      this.stream(g, f.x, f.y, 8);
    }
  }

  /** at the last, the Lampless walk out of the chamber's dark */
  private sendLampless(g: Game, dt: number): void {
    this.walkT -= dt;
    if (this.walkT > 0) return;
    this.walkT = 9;
    if (g.enemies.filter((e) => e.def.behavior === 'still').length >= 2) return;
    const { x: cx, y: cy } = BOSS_CENTER;
    const w = g.world;
    for (let tries = 0; tries < 12; tries++) {
      const tx = cx + (Math.random() < 0.5 ? -1 : 1) * (15 + Math.floor(Math.random() * 6));
      const ty = cy + 5;
      if (w.solid(tx, ty) || w.solid(tx, ty - 1) || !w.solid(tx, ty + 1)) continue;
      if (g.light.at(tx, ty) > 0.25 || this.sheltered(tx * TILE + 16, ty * TILE)) continue;
      const e = new Enemy(ENEMIES.lampless, tx * TILE + TILE / 2, (ty + 1) * TILE - 1);
      e.hp = Math.round(e.def.hp * 2);
      e.power = 1.5;
      g.enemies.push(e);
      audio.play('moan', { vol: 0.6 });
      return;
    }
  }
}
