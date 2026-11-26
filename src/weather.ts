/**
 * Weather over the valley. Rain and storms come down off the peaks now and then and fight your
 * light: a torch or campfire out in the open sputters in the wet (a roof over it keeps it
 * bright; the Wick, lamps and your lantern's glass do not care). A storm darkens the sky and
 * now and then lightning throws the whole valley into white for an instant. Some mornings the
 * valley fills with fog. Rain is not all bad: saplings drink it and the fish bite.
 */
import { TILE } from './constants';
import { audio } from './audio';
import type { Game } from './game';

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'fog';

/** what the save keeps */
export interface WeatherSave {
  kind: WeatherKind;
  /** seconds left of it */
  left: number;
}

/** how hard each kind rains, and how much it darkens the sky */
const RAIN: Record<WeatherKind, number> = { clear: 0, rain: 0.7, storm: 1, fog: 0 };
const DARK: Record<WeatherKind, number> = { clear: 0, rain: 0.22, storm: 0.42, fog: 0.08 };

export interface Bolt {
  /** the jagged path, world px */
  pts: { x: number; y: number }[];
  t: number;
}

export class Weather {
  kind: WeatherKind = 'clear';
  left = 240;
  /** how far in it has come (ramps over ~20 s either way) */
  k = 0;
  /** what was falling before it changed, while that eases off */
  private was: WeatherKind = 'clear';
  /** a lightning flash lighting everything, 0..1 */
  flash = 0;
  bolt: Bolt | null = null;
  private boltT = 8;
  private thunder: { t: number; near: boolean }[] = [];
  private lastClock = -1;
  /** where the last bolt came down, for the thunder's caption */
  private lastStrike: { x: number; y: number } | undefined;

  load(s: WeatherSave | undefined): void {
    if (!s || !(s.kind in RAIN)) return;
    this.kind = s.kind;
    this.left = s.left;
    this.k = 1;
  }

  save(): WeatherSave {
    return { kind: this.kind, left: Math.round(this.left) };
  }

  /** 0..1: how hard it is raining right now */
  get rain(): number {
    return RAIN[this.kind] * this.k + RAIN[this.was] * (1 - this.k);
  }
  /** 0..1: how much the cloud darkens the sky */
  get dark(): number {
    return DARK[this.kind] * this.k + DARK[this.was] * (1 - this.k);
  }
  get fog(): number {
    return (this.kind === 'fog' ? this.k : 0) + (this.was === 'fog' ? 1 - this.k : 0);
  }
  /** a word for the HUD clock, or '' */
  get label(): string {
    return this.kind === 'clear' || this.k < 0.3 ? '' : this.kind === 'rain' ? 'Rain' : this.kind === 'storm' ? 'Storm' : 'Fog';
  }

  /** settle it now (the light coming home at the end clears the sky) */
  clear(): void {
    if (this.kind === 'clear') return;
    this.was = this.kind;
    this.kind = 'clear';
    this.left = 300;
    this.k = 0;
  }

  /** the flash and the bolt die away every frame, menus open or not */
  fade(dt: number): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    if (this.bolt && (this.bolt.t += dt) > 0.35) this.bolt = null;
  }

  update(g: Game, dt: number): void {
    this.k = Math.min(1, this.k + dt / 20);
    this.left -= dt;
    if (this.left <= 0) this.next(g);
    // some mornings the valley fills with fog as the sun comes up
    const c = g.p.clock;
    if (this.lastClock >= 0 && this.lastClock < 0.965 && c >= 0.965 && this.kind === 'clear' && g.p.stats.days >= 2 && !g.ending && Math.random() < 0.3) {
      this.was = 'clear';
      this.k = 0;
      this.set(g, 'fog', 110 + Math.random() * 80);
    }
    this.lastClock = c;
    // lightning, now and then, once a storm has properly come in
    if (this.kind === 'storm' && this.k > 0.6) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 6 + Math.random() * 12;
        this.strike(g);
      }
    }
    for (const th of this.thunder) th.t -= dt;
    for (const th of this.thunder.filter((h) => h.t <= 0)) this.rumble(g, th.near);
    this.thunder = this.thunder.filter((h) => h.t > 0);
    // the rain you hear: full in the open, a patter near the surface, nothing deep down
    const pl = g.player;
    const tx = Math.max(0, Math.min(g.world.w - 1, Math.floor(pl.cx / TILE)));
    const under = Math.floor(pl.cy / TILE) - g.world.surface[tx];
    const hear = under <= 2 ? 1 : under < 14 ? 0.3 * (1 - under / 14) : 0;
    audio.rain(this.rain * hear);
  }

  /** what comes after: weather comes and goes, the sky clears between */
  private next(g: Game): void {
    this.was = this.kind;
    this.k = 0;
    const c = g.p.clock;
    const dawn = c > 0.94 || c < 0.1;
    // nothing on the first day: a new delver has enough to learn
    if (this.kind !== 'clear' || g.p.stats.days < 2 || g.ending) {
      this.kind = 'clear';
      this.left = 160 + Math.random() * 260;
      return;
    }
    const r = Math.random();
    if (dawn && r < 0.25) this.set(g, 'fog', 90 + Math.random() * 90);
    else if (r < 0.32) this.set(g, 'rain', 120 + Math.random() * 150);
    else if (r < 0.48) this.set(g, 'storm', 100 + Math.random() * 110);
    else {
      this.kind = 'clear';
      this.left = 140 + Math.random() * 220;
    }
  }

  private set(g: Game, kind: WeatherKind, left: number): void {
    this.kind = kind;
    this.left = left;
    const out = g.onSurface();
    if (kind === 'rain') {
      if (out) g.toast('Rain comes down the valley. Torches in the open sputter.', '#a8c8e8');
      g.hint('rain', 'Rain and storms make a torch or campfire out in the open sputter and burn low. Put a roof over it (any block above it) and it burns bright. The Wick, lamps and your lantern do not mind the wet, and the fish bite in the rain.');
    } else if (kind === 'storm') {
      if (out) g.toast('A storm is coming over the peaks.', '#c0b8ff');
      g.hint('rain', 'Rain and storms make a torch or campfire out in the open sputter and burn low. Put a roof over it (any block above it) and it burns bright. The Wick, lamps and your lantern do not mind the wet, and the fish bite in the rain.');
    } else if (kind === 'fog' && out) g.toast('Fog fills the valley.', '#d8dce8');
  }

  /** a bolt somewhere in view or off over the hills */
  private strike(g: Game): void {
    const near = Math.random() < 0.55;
    const pl = g.player;
    const x = near ? g.camX + g.viewW * (0.1 + Math.random() * 0.8) : g.camX + (Math.random() < 0.5 ? -1 : 1) * g.viewW * (0.8 + Math.random());
    const tx = Math.max(0, Math.min(g.world.w - 1, Math.floor(x / TILE)));
    const ground = g.world.skyline[tx] * TILE;
    const top = Math.min(ground - 200, g.camY - 40);
    const pts: { x: number; y: number }[] = [];
    let px = x + (Math.random() - 0.5) * 60;
    for (let y = top; y < ground; y += 14 + Math.random() * 14) {
      pts.push({ x: px, y });
      px += (Math.random() - 0.5) * 44 + (x - px) * 0.18;
    }
    pts.push({ x, y: ground });
    if (near) {
      this.bolt = { pts, t: 0 };
      this.flash = 1;
      g.tally('bolt');
    } else this.flash = Math.max(this.flash, 0.35);
    // the sound comes after the light, later the further off it is
    const d = Math.abs(x - pl.cx) / TILE;
    this.lastStrike = { x, y: ground };
    this.thunder.push({ t: 0.15 + Math.min(2.5, d / 40), near: near && d < 50 });
  }

  private rumble(g: Game, near: boolean): void {
    const pl = g.player;
    const tx = Math.max(0, Math.min(g.world.w - 1, Math.floor(pl.cx / TILE)));
    const under = Math.floor(pl.cy / TILE) - g.world.surface[tx];
    if (under > 30) return;
    const muffle = under > 2 ? 0.35 : 1;
    audio.play(near && under <= 2 ? 'thunder' : 'thunderfar', { vol: (near ? 0.9 : 0.6) * muffle, pitch: under > 2 ? 0.8 : 1, at: this.lastStrike });
    if (near && under <= 2) {
      g.shake = Math.max(g.shake, 4);
      // out in a storm at night, a crack like that frays you
      const c = g.p.clock;
      if (c > 0.6 && c < 0.96 && !g.inWickLight(pl.cx, pl.cy)) g.p.nerve = Math.max(0, g.p.nerve - 2);
    }
  }
}
