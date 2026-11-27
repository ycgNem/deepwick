/**
 * Lantern Night. On the last night of autumn, before winter comes down off the peaks, Deepwick lets
 * paper lanterns go from the Wick for the miners who never came home. The townsfolk gather round the
 * Wick after the bell and stay out past dark to let theirs go; you bring yours (Old Pell sells them,
 * or make them at a workbench) and each one carries a name up into the dark. From the hills round
 * the valley, other lights rise too. The Wick takes a little from every lantern let go in its light.
 */
import type { Game } from './game';
import { TILE } from './constants';
import { seasonOf, seasonDay, SEASON_DAYS } from './seasons';
import { MINERS } from './data/lampless';

export interface SkyLantern {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  seed: number;
  /** one of the far lights rising from the hills: smaller, slower, fainter */
  far: boolean;
}

/** the festival runs from the evening bell until near midnight */
export const LANTERN_FROM = 0.58;
export const LANTERN_TO = 0.75;
/** Lumen the Wick takes from each lantern let go in its light, and how many a night it takes it from */
export const LANTERN_LUMEN = 3;
export const LANTERN_PAID = 12;

/** the last day of autumn */
export function isLanternDay(day: number): boolean {
  return seasonOf(day).id === 'autumn' && seasonDay(day) === SEASON_DAYS;
}

/** whose name the night's nth lantern carries */
export function lanternName(day: number, n: number): string {
  return MINERS[(day * 7 + n * 5) % MINERS.length];
}

const MAX = 90;

export class Lanterns {
  sky: SkyLantern[] = [];
  private farT = 0;

  release(x: number, y: number, far = false): void {
    if (this.sky.length >= MAX) this.sky.shift();
    this.sky.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: far ? -4 : -6, t: 0, seed: Math.random() * 100, far });
  }

  update(g: Game, dt: number): void {
    for (const l of this.sky) {
      l.t += dt;
      // the hot air lifts it, slowly at first; a light breeze down the valley carries it east
      const lift = l.far ? -7 : -15 - Math.min(10, l.t * 0.6);
      l.vy += (lift - l.vy) * Math.min(1, dt * 0.8);
      l.vx += (3 + Math.sin(l.t * 0.35 + l.seed) * 4 - l.vx) * Math.min(1, dt * 0.5);
      l.x += (l.vx + Math.sin(l.t * 0.9 + l.seed) * (l.far ? 2 : 6)) * dt;
      l.y += l.vy * dt;
    }
    this.sky = this.sky.filter((l) => l.t < (l.far ? 110 : 95) && l.y > -60 * TILE);
    // far lights rising from the hills round the valley while the night lasts
    if (g.lanternHour() && g.p.clock >= 0.6 && g.onSurface()) {
      this.farT -= dt;
      if (this.farT <= 0) {
        this.farT = 0.6 + Math.random() * 1.4;
        const w = g.world;
        const x = g.camX + Math.random() * g.viewW;
        const tx = Math.max(0, Math.min(w.w - 1, Math.floor(x / TILE)));
        // somewhere in the sky you can see, low over the hills, so it rises up through the view
        const top = g.camY + 16;
        const bottom = Math.min((w.skyline[tx] - 2) * TILE, g.camY + g.viewH * 0.75);
        if (bottom > top + 24) this.release(x, top + (bottom - top) * (0.45 + 0.55 * Math.random()), true);
      }
    }
  }
}
