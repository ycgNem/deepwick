/**
 * Dawn over Deepwick: what happens when the Gloamheart is stilled.
 *
 * The light it drank pours out of it, gathers, and climbs: straight up through the mountain,
 * past every place you went down through (each torch you left on the way flares as it goes
 * by), and into the Wick's glass. The Wick takes it, the sun comes up, the light carries you
 * home, and the epilogue says who came home with it.
 */
import { TILE } from './constants';
import { WICK_GLOW } from './data/wick';
import { biomeAt } from './data/biomes';
import { audio } from './audio';
import type { Game } from './game';

/** seconds the heart spends pouring out its light before it climbs */
export const POUR = 3.4;
/** seconds the light takes to climb from the heart to the Wick */
export const CLIMB = 9;
/** seconds of sunrise over the town once the Wick has it */
export const DAWN = 5.2;
/** seconds the camera takes to find you at the Wick before the epilogue opens */
export const HOME = 2.6;
/** the Wick's reach once the heart is stilled, in tiles */
export const DAWN_RADIUS = 26;
/** where the sky is when the light arrives (just before first light) and where dawn leaves it */
export const DAWN_FROM = 0.93;
export const DAWN_TO = 0.09;

export type Stage = 'pour' | 'climb' | 'dawn' | 'home';

/** ease in and out: slow to leave, quick through the middle, slow to arrive */
function ease(k: number): number {
  return 0.5 - Math.cos(Math.PI * k) / 2;
}

export class Ending {
  stage: Stage = 'pour';
  /** seconds into the current stage */
  t = 0;
  /** the climbing light, px */
  x: number;
  y: number;
  /** where the camera looks (centre), px */
  lookX: number;
  lookY: number;
  /** the name of the place the light is passing through, and how long it has shown */
  caption = '';
  captionT = 0;
  private x0: number;
  private y0: number;
  private readonly x1 = WICK_GLOW.x * TILE;
  private readonly y1 = WICK_GLOW.y * TILE;
  private biome = -2;

  constructor(x: number, y: number) {
    this.x = this.x0 = x;
    this.y = this.y0 = y;
    this.lookX = x;
    this.lookY = y;
  }

  /** how far up the climb the light is, 0..1 (1 from dawn on) */
  get climbed(): number {
    if (this.stage === 'pour') return 0;
    if (this.stage === 'climb') return Math.min(1, this.t / CLIMB);
    return 1;
  }

  /** returns true once the epilogue should open */
  update(g: Game, dt: number): boolean {
    this.t += dt;
    this.captionT += dt;
    if (this.stage === 'pour') {
      // the light it drank gathers at its heart (sinking as it dies) before it goes
      if (g.boss) {
        this.x = g.boss.x;
        this.y = g.boss.y;
      }
      this.lookX = this.x;
      this.lookY = this.y - 40;
      if (this.t >= POUR) {
        this.stage = 'climb';
        this.t = 0;
        this.x0 = this.x;
        this.y0 = this.y;
        g.beginClimb();
        audio.play('lightrise', { vary: 0 });
      }
      return false;
    }
    if (this.stage === 'climb') {
      const k = Math.min(1, this.t / CLIMB);
      const e = ease(k);
      this.y = this.y0 + (this.y1 - this.y0) * e;
      this.x = this.x0 + (this.x1 - this.x0) * e;
      // the camera rides just above the light, so you see where it is going
      this.lookX = this.x;
      this.lookY = this.y - 40;
      // where it is passing through: each place you went down through, then the town
      const ty = Math.floor(this.y / TILE);
      const tx = Math.max(0, Math.min(g.world.surface.length - 1, Math.floor(this.x / TILE)));
      const up = ty <= g.world.surface[tx] + 1;
      const b = up ? -1 : biomeAt(ty).id;
      if (b !== this.biome) {
        this.biome = b;
        this.caption = up ? 'Deepwick' : biomeAt(ty).name;
        this.captionT = 0;
      }
      // a wake of light behind it
      const n = Math.ceil(dt * 90);
      for (let i = 0; i < n; i++)
        g.parts.push({
          x: this.x + (Math.random() - 0.5) * 22,
          y: this.y + Math.random() * 40,
          vx: (Math.random() - 0.5) * 30,
          vy: 20 + Math.random() * 60,
          life: 1.1,
          max: 1.1,
          color: Math.random() < 0.6 ? '#ffe9a8' : '#ffffff',
          size: Math.random() < 0.3 ? 2 : 1,
          grav: -10,
          glow: true,
        });
      if (k >= 1) {
        this.stage = 'dawn';
        this.t = 0;
        this.caption = '';
        g.beginDawn();
      }
      return false;
    }
    if (this.stage === 'dawn') {
      // hold on the Wick and the sky above it while the sun comes up
      this.lookX = this.x1;
      this.lookY = this.y1 - 60;
      g.dawnClock(dt / DAWN);
      if (this.t >= DAWN) {
        this.stage = 'home';
        this.t = 0;
      }
      return false;
    }
    // home: find the delver the light carried back
    this.lookX = g.player.cx;
    this.lookY = g.player.cy - 10;
    return this.t >= HOME;
  }
}
