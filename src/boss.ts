import type { Game } from './game';
import { TILE } from './constants';
import { BOSS_CENTER } from './world/gen';
import { Enemy } from './entities';
import { ENEMIES } from './data/enemies';
import { audio } from './audio';

export const BOSS_HP = 4500;

const enum Mode {
  FLOAT,
  WINDUP,
  DIVE,
  EXPOSED,
  RISE,
}

/**
 * The Gloamheart. Floats above the arena firing shard patterns, and every few
 * seconds winds up and slams into the floor, where it is exposed to melee.
 */
export class Boss {
  x: number;
  y: number;
  r = 50;
  hp = BOSS_HP;
  phase = 0;
  t = 0;
  burstT = 2.5;
  volleyT = 4;
  summonT = 9;
  rainT = 6;
  pulseT = 10;
  diveT = 6;
  mode = Mode.FLOAT;
  modeT = 0;
  targetX = 0;
  flash = 0;
  dead = false;
  deathT = 0;
  intro = 2.2;
  animT = 0;

  constructor() {
    this.x = (BOSS_CENTER.x + 0.5) * TILE;
    this.y = (BOSS_CENTER.y - 1) * TILE;
  }

  get exposed(): boolean {
    return this.mode === Mode.EXPOSED;
  }
  get winding(): boolean {
    return this.mode === Mode.WINDUP;
  }

  /** damage multiplier while it lies stunned on the floor */
  damageMult(): number {
    return this.mode === Mode.EXPOSED ? 1.25 : 1;
  }

  update(g: Game, dt: number): void {
    this.animT += dt * (this.mode === Mode.EXPOSED ? 0.4 : 1);
    if (this.flash > 0) this.flash -= dt;
    if (this.dead) {
      this.deathT += dt;
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * this.r;
        g.burst(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 6, ['#ff4a7a', '#ffd75a', '#a05aff'], 160, true);
      }
      if (Math.random() < dt * 6) audio.play('explosion', { vol: 0.5, pitch: 0.8 + Math.random() * 0.5 });
      g.shake = Math.max(g.shake, 4);
      return;
    }
    if (this.intro > 0) {
      this.intro -= dt;
      g.shake = Math.max(g.shake, 3);
      return;
    }
    this.t += dt;
    const pl = g.player;
    const cx = (BOSS_CENTER.x + 0.5) * TILE;
    const cy = (BOSS_CENTER.y - 1) * TILE;
    const floorY = (BOSS_CENTER.y + 6) * TILE - this.r - 4;
    const speed = 0.45 + this.phase * 0.15;
    const fx = cx + Math.sin(this.t * speed) * 9 * TILE;
    const fy = cy + Math.sin(this.t * speed * 2.1) * 1.6 * TILE;

    const frac = this.hp / BOSS_HP;
    const newPhase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
    if (newPhase > this.phase) {
      this.phase = newPhase;
      audio.play('roar', { vary: 0 });
      g.shake = 10;
      g.toast(newPhase === 1 ? 'The Gloamheart cracks and seethes!' : 'The Gloamheart drinks the light!', '#ff6a8a');
    }

    this.modeT += dt;
    switch (this.mode) {
      case Mode.FLOAT: {
        // ease back onto the floating path
        const k = Math.min(1, dt * 3);
        this.x += (fx - this.x) * k;
        this.y += (fy - this.y) * k;
        this.diveT -= dt;
        if (this.diveT <= 0) this.setMode(Mode.WINDUP);
        this.attacks(g, dt);
        break;
      }
      case Mode.WINDUP:
        this.x += (Math.random() - 0.5) * 4;
        this.flash = 0.05;
        if (this.modeT === dt) {
          audio.play('roar', { pitch: 1.4, vol: 0.5 });
          this.targetX = Math.max(cx - 19 * TILE, Math.min(cx + 19 * TILE, pl.cx));
        }
        if (this.modeT > 0.75) this.setMode(Mode.DIVE);
        break;
      case Mode.DIVE: {
        this.x += (this.targetX - this.x) * Math.min(1, dt * 6);
        this.y += 620 * dt;
        if (this.y >= floorY) {
          this.y = floorY;
          this.setMode(Mode.EXPOSED);
          audio.play('explosion', { pitch: 0.6, vary: 0 });
          g.shake = 14;
          for (let i = 0; i < 2; i++) {
            const dir = i ? 1 : -1;
            g.shots.push({ x: this.x + dir * this.r, y: floorY + this.r - 6, vx: dir * 260, vy: 0, dmg: 20, color: '#ff8a4a', life: 1.4, r: 7, gravity: 0, hostile: true });
          }
          g.burst(this.x, floorY + this.r, 40, ['#ff4a7a', '#ffd75a', '#5a2030'], 260);
          if (pl.onGround && Math.abs(pl.cx - this.x) < 3 * TILE) g.hurtPlayer(26, this.x);
        }
        break;
      }
      case Mode.EXPOSED:
        if (this.modeT === dt) g.text(this.x, this.y - this.r - 10, 'Exposed!', '#ffd75a', true);
        if (this.modeT > 2.1 - this.phase * 0.25) this.setMode(Mode.RISE);
        break;
      case Mode.RISE:
        this.y += (fy - this.y) * Math.min(1, dt * 2.2);
        this.x += (fx - this.x) * Math.min(1, dt * 2.2);
        if (this.modeT > 1.1) {
          this.setMode(Mode.FLOAT);
          this.diveT = 7.5 - this.phase * 1.5;
        }
        break;
    }

    // contact damage (not while lying stunned: that is the window to hit it)
    if (this.mode !== Mode.EXPOSED && Math.hypot(pl.cx - this.x, pl.cy - this.y) < this.r + 12) g.hurtPlayer(28, this.x);
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.modeT = 0;
  }

  private attacks(g: Game, dt: number): void {
    const pl = g.player;
    const ang = Math.atan2(pl.cy - this.y, pl.cx - this.x);
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = 3.4 - this.phase * 0.6;
      const n = 10 + this.phase * 4;
      const off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) this.shoot(g, off + (i / n) * Math.PI * 2, 150 + this.phase * 35, '#ff4a7a', 5);
      audio.play('fireball', { pitch: 0.7, vol: 0.7 });
    }
    if (this.phase >= 1) {
      this.volleyT -= dt;
      if (this.volleyT <= 0) {
        this.volleyT = 2.1;
        for (const a of [-0.18, 0, 0.18]) this.shoot(g, ang + a, 240, '#ffd75a', 5);
      }
      this.rainT -= dt;
      if (this.rainT <= 0) {
        this.rainT = 5;
        for (let i = 0; i < 6; i++) {
          g.shots.push({
            x: pl.cx + (Math.random() - 0.5) * 9 * TILE,
            y: (BOSS_CENTER.y - 8) * TILE,
            vx: 0,
            vy: 40,
            dmg: 22,
            color: '#c27aff',
            life: 5,
            r: 6,
            gravity: 420,
            hostile: true,
          });
        }
      }
    }
    this.summonT -= dt;
    if (this.summonT <= 0) {
      this.summonT = 12;
      const minions = g.enemies.filter((e) => !e.dead).length;
      if (minions < 3) {
        for (let i = 0; i < 2; i++) {
          const def = this.phase === 0 ? ENEMIES.wisp : ENEMIES.wraith;
          g.enemies.push(new Enemy(def, this.x + (i ? 60 : -60), this.y + 40));
          g.burst(this.x + (i ? 60 : -60), this.y + 20, 14, ['#a05aff', '#ffffff'], 120, true);
        }
      }
    }
    if (this.phase >= 2) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = 9;
        g.gloom = 3.5;
        pl.oil = Math.max(0, pl.oil - 15);
        audio.play('roar', { pitch: 1.3, vol: 0.6 });
        g.toast('The light gutters...', '#a05aff');
      }
    }
  }

  private shoot(g: Game, a: number, v: number, color: string, r: number): void {
    g.shots.push({ x: this.x, y: this.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: 20, color, life: 6, r, gravity: 0, hostile: true });
  }
}
