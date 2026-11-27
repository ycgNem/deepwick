import { keyName } from './keys';
import { A, makeCanvas, iconSrc, decorIcon, drawRailAt, drawLampAt } from './assets';
import { Terrain, MAT, terrainTexture } from './terrain';
import { buildBackdrops, Backdrop, BW, BH } from './backdrop';
import { propOf } from './data/props';
import type { World } from './world/world';
import { TILE, TARGET_VIEW_H, SURFACE_Y } from './constants';
import { BLOCKS, B } from './data/blocks';
import { FURN } from './data/furniture';
import { BIOMES } from './data/biomes';
import { ITEMS, IconRef } from './data/items';
import { Obj } from './world/world';
import { BOSS_CENTER } from './world/gen';
import { Game, BUILDING_INFO, treeKind, daylight, isNight } from './game';
import { DOG_CELL } from './dog';
import { seasonOf, autumnTint } from './seasons';
import { heldDef } from './state';
import { WICK_X, WICK_Y, WICK_GLOW, MAX_FLAME } from './data/wick';
import { NERVE_FRAYED, NERVE_SHAKEN } from './data/nerve';
import { prefs } from './prefs';
import { LOST } from './data/lost';
import { propRoof, PROP_REACH } from './world/cavein';
import { dampAt, BREATH_MAX } from './world/flood';
import { Mode as HeartMode } from './boss';
import { POUR } from './ending';
import { sputter } from './world/light';

const ROW = { idle: 0, walk: 1, jump: 2, hurt: 3, mine: 4, climb: 5 } as const;
const CELL = 68;
/** the miner breathes on the calm idle frames only (the rest of that clip raises a fist) */
const IDLE_FRAMES = [0, 1, 2, 2, 1, 0] as const;
/**
 * Where the swung tool sits on each frame of the swing row, facing right: the grip in the 68px
 * cell, and the angle the handle points from the grip toward the head (radians, y down).
 * Frames 1-2 wind up over the shoulder, 3-4 strike, 5-8 recover.
 */
const SWING_POSE: readonly (readonly [number, number, number])[] = [
  [31, 42, 1.0],
  [40, 27, -1.9],
  [38, 27, -2.8],
  [40, 40, -0.9],
  [38, 41, 0.5],
  [41, 42, 0.35],
  [41, 42, 0.3],
  [41, 42, 0.25],
  [40, 41, 0.3],
];
/** every tool icon has its grip near the bottom left and its head toward the top right */
const TOOL_GRIP = [5, 27] as const;
const TOOL_SIZE = 28;
const TREE_SPRITES = ['oak', 'pine1', 'birch', 'pine2'];

interface Ambient {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  drip: boolean;
}

const OBJ_ICON: Partial<Record<Obj, IconRef>> = {
  [Obj.WORKBENCH]: { sheet: 'n32', idx: 15 },
  [Obj.FURNACE]: { sheet: 'n32', idx: 16 },
  [Obj.ANVIL]: { sheet: 'i32', idx: 51 },
  [Obj.ALCHEMY]: { sheet: 'n32', idx: 18 },
  [Obj.CAMPFIRE]: { sheet: 'i32', idx: 50 },
  [Obj.STORAGE]: { sheet: 'i32', idx: 46 },
  [Obj.CHEST]: { sheet: 'i32', idx: 46 },
  [Obj.CHEST_OPEN]: { sheet: 'i32', idx: 47 },
  [Obj.SAPLING]: { sheet: 'n32', idx: 20 },
  [Obj.BUSH]: { sheet: 'n32', idx: 23 },
  [Obj.BUSH_BERRY]: { sheet: 'n32', idx: 22 },
};

export class Renderer {
  /**
   * The world is drawn straight into the on-screen canvas at its own pixel size (one canvas
   * pixel per art pixel) and the browser scales it up, crisp, by a whole number. Text that
   * should stay sharp (numbers, speech, prompts) goes on a full-resolution overlay above it.
   */
  scene: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  private over: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  /** the part of the overlay drawn on last frame, wiped before the next */
  private dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private overOpacity = '';
  /** firedamp: a soft map of the gas (one pixel per tile), the cloud that fills it, and the layer they meet on */
  private gasMap: HTMLCanvasElement | null = null;
  private gasMapCtx: CanvasRenderingContext2D | null = null;
  private gasImg: ImageData | null = null;
  private gasLayer: HTMLCanvasElement | null = null;
  private gasLayerCtx: CanvasRenderingContext2D | null = null;
  private gasCloud: HTMLCanvasElement | null = null;
  scale = 2;
  dpr = 1;
  private backdrops: Backdrop[] = [];
  private terrain: Terrain | null = null;
  private terrainWorld: World | null = null;
  private cracks: HTMLCanvasElement[] = [];
  /** fault lines over loose rock, and the crumbling underside it shows when nothing is below */
  private looseArt: HTMLCanvasElement[] = [];
  private looseUnder: HTMLCanvasElement[] = [];
  /** rock with water close behind it: dark seeps and wet glints */
  private dampArt: HTMLCanvasElement[] = [];
  private glowSprite: HTMLCanvasElement;
  private vignette: HTMLCanvasElement | null = null;
  /** the dark closing in as your nerve goes */
  private dread: HTMLCanvasElement | null = null;
  private stars: { x: number; y: number; b: number }[] = [];
  private amb: Ambient[] = [];
  private lastT = 0;
  /** sky art mirrored side by side so it tiles without a seam */
  private skyDay: HTMLCanvasElement;
  private skyDusk: HTMLCanvasElement;
  private skyDayTop: SkyTop;
  private skyDuskTop: SkyTop;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no ctx');
    this.scene = canvas;
    this.sctx = ctx;
    const over = document.createElement('canvas');
    over.id = 'overlay';
    canvas.after(over);
    const octx = over.getContext('2d');
    if (!octx) throw new Error('no ctx');
    this.over = over;
    this.octx = octx;
    this.glowSprite = this.makeGlow();
    this.backdrops = buildBackdrops();
    this.buildCracks();
    this.buildLoose();
    this.buildDamp();
    this.skyDay = mirrored(A.bg.day);
    this.skyDusk = mirrored(A.bg.surface);
    this.skyDayTop = skyTop(this.skyDay, [0.62, 0.74, 0.9]);
    this.skyDuskTop = skyTop(this.skyDusk, [0.45, 0.5, 0.62]);
    for (let i = 0; i < 320; i++) this.stars.push({ x: Math.random() * 2000, y: Math.random() * 900, b: Math.random() });
  }

  private makeGlow(): HTMLCanvasElement {
    const [c, g] = makeCanvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  /** loose rock: pixel fault lines running across the tile, and a crumbling lip under it */
  private buildLoose(): void {
    let seed = 91;
    const rnd = (): number => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let v = 0; v < 4; v++) {
      const [c, g] = makeCanvas(32, 32);
      // a faint darkening: bad ground looks tired
      g.fillStyle = 'rgba(20,12,8,0.18)';
      g.fillRect(0, 0, 32, 32);
      for (let k = 0; k < 2; k++) {
        // a crack from one edge to the other, wandering a pixel at a time
        const horiz = (v + k) % 2 === 0;
        let a = 5 + Math.floor(rnd() * 22);
        for (let t = 0; t < 32; t++) {
          if (rnd() < 0.45) a += rnd() < 0.5 ? -1 : 1;
          a = Math.max(2, Math.min(29, a));
          const x = horiz ? t : a;
          const y = horiz ? a : t;
          g.fillStyle = 'rgba(12,8,6,0.85)';
          g.fillRect(x, y, 1, 1);
          if (rnd() < 0.75) g.fillRect(horiz ? x : x + 1, horiz ? y + 1 : y, 1, 1);
          g.fillStyle = 'rgba(255,236,210,0.3)';
          g.fillRect(horiz ? x : x - 1, horiz ? y - 1 : y, 1, 1);
          // short branches
          if (rnd() < 0.08) {
            let bx = x;
            let by = y;
            const dx = horiz ? (rnd() < 0.5 ? -1 : 1) : 1;
            const dy = horiz ? 1 : rnd() < 0.5 ? -1 : 1;
            for (let j = 0; j < 3 + Math.floor(rnd() * 3); j++) {
              bx += rnd() < 0.6 ? dx : 0;
              by += rnd() < 0.6 ? dy : 0;
              g.fillStyle = 'rgba(12,8,6,0.7)';
              g.fillRect(bx, by, 1, 1);
            }
          }
        }
      }
      this.looseArt.push(c);
    }
    for (let v = 0; v < 2; v++) {
      const [c, g] = makeCanvas(32, 36);
      // gaps along the underside and a few chips about to drop
      g.fillStyle = 'rgba(10,6,4,0.75)';
      for (let x = 0; x < 32; x++) if (rnd() < 0.55) g.fillRect(x, 30 + Math.floor(rnd() * 2), 1, 2);
      for (let k = 0; k < 3; k++) {
        const x = 3 + Math.floor(rnd() * 25);
        g.fillStyle = 'rgba(10,6,4,0.8)';
        g.fillRect(x - 1, 31, 4, 3);
        g.fillStyle = 'rgba(150,135,118,0.9)';
        g.fillRect(x, 31, 2, 2);
      }
      this.looseUnder.push(c);
    }
  }

  /** weeping rock: a cold darkening, seep streaks running down, and a few wet glints */
  private buildDamp(): void {
    let seed = 57;
    const rnd = (): number => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let v = 0; v < 4; v++) {
      const [c, g] = makeCanvas(32, 32);
      g.fillStyle = 'rgba(8,18,34,0.2)';
      g.fillRect(0, 0, 32, 32);
      for (let k = 0; k < 3; k++) {
        const x = 3 + Math.floor(rnd() * 26);
        const y0 = Math.floor(rnd() * 14);
        const len = 8 + Math.floor(rnd() * 16);
        g.fillStyle = 'rgba(10,26,50,0.4)';
        g.fillRect(x, y0, rnd() < 0.5 ? 2 : 1, len);
        g.fillStyle = 'rgba(150,200,240,0.35)';
        g.fillRect(x, y0 + 1, 1, Math.floor(len * 0.4));
        // a bead gathering at the bottom of the streak
        g.fillStyle = 'rgba(190,226,255,0.7)';
        g.fillRect(x, y0 + len, 1, 1);
      }
      for (let k = 0; k < 4; k++) {
        g.fillStyle = 'rgba(200,232,255,0.55)';
        g.fillRect(Math.floor(rnd() * 31), Math.floor(rnd() * 31), 1, 1);
      }
      this.dampArt.push(c);
    }
  }

  private buildCracks(): void {
    for (let s = 1; s <= 4; s++) {
      const [c, g] = makeCanvas(32, 32);
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 2;
      let seed = 17;
      const rnd = (): number => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let k = 0; k < s * 2; k++) {
        let x = 16;
        let y = 16;
        g.beginPath();
        g.moveTo(x, y);
        const a0 = rnd() * Math.PI * 2;
        for (let j = 0; j < 3 + s; j++) {
          x += Math.cos(a0 + (rnd() - 0.5) * 1.2) * 4;
          y += Math.sin(a0 + (rnd() - 0.5) * 1.2) * 4;
          g.lineTo(Math.round(x), Math.round(y));
        }
        g.stroke();
      }
      this.cracks.push(c);
    }
  }

  resize(game: Game): void {
    this.dpr = window.devicePixelRatio || 1;
    const W = Math.floor(window.innerWidth * this.dpr);
    const H = Math.floor(window.innerHeight * this.dpr);
    const s = Math.max(1, Math.round(H / TARGET_VIEW_H));
    this.scale = s;
    const vw = Math.ceil(W / s);
    const vh = Math.ceil(H / s);
    this.scene.width = vw;
    this.scene.height = vh;
    this.sctx.imageSmoothingEnabled = false;
    const cssW = `${(vw * s) / this.dpr}px`;
    const cssH = `${(vh * s) / this.dpr}px`;
    this.scene.style.width = cssW;
    this.scene.style.height = cssH;
    this.over.width = vw * s;
    this.over.height = vh * s;
    this.over.style.width = cssW;
    this.over.style.height = cssH;
    this.dirty = null;
    game.viewW = vw;
    game.viewH = vh;
    game.scale = s / this.dpr;
    const [vc, vg] = makeCanvas(vw, vh);
    const grad = vg.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    vg.fillStyle = grad;
    vg.fillRect(0, 0, vw, vh);
    this.vignette = vc;
    const [dc, dg] = makeCanvas(vw, vh);
    const dgrad = dg.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.2, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
    dgrad.addColorStop(0, 'rgba(6,2,12,0)');
    dgrad.addColorStop(0.55, 'rgba(6,2,12,0.55)');
    dgrad.addColorStop(1, 'rgba(6,2,12,0.97)');
    dg.fillStyle = dgrad;
    dg.fillRect(0, 0, vw, vh);
    this.dread = dc;
  }

  draw(g: Game): void {
    const ctx = this.sctx;
    const vw = this.scene.width;
    const vh = this.scene.height;
    const dt = Math.min(0.05, Math.max(0, g.time - this.lastT));
    this.lastT = g.time;
    let camX = Math.round(g.camX);
    let camY = Math.round(g.camY);
    if (g.shake > 0 && prefs.shake) {
      camX += Math.round((Math.random() - 0.5) * g.shake);
      camY += Math.round((Math.random() - 0.5) * g.shake);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.terrainWorld !== g.world || !this.terrain) {
      this.terrain = new Terrain(g.world);
      this.terrainWorld = g.world;
    }
    this.drawSky(g, ctx, camX, camY, vw, vh);
    this.drawBackdrop(g, ctx, camX, camY, vw, vh);
    this.drawFlock(g, ctx, camX, camY, vw, dt);
    this.terrain.drawBack(ctx, camX, camY, vw, vh);
    this.drawTrees(g, ctx, camX, camY, vw);
    this.drawWick(g, ctx, camX, camY);
    this.drawBuildings(g, ctx, camX, camY);
    this.drawLiquids(g, ctx, camX, camY, vw, vh);
    this.terrain.drawFore(ctx, camX, camY, vw, vh);
    this.drawBlockDetails(g, ctx, camX, camY, vw, vh);
    this.drawSnowCover(g, ctx, camX, camY, vw, vh);
    this.drawObjects(g, ctx, camX, camY, vw, vh);
    this.drawNpcs(g, ctx, camX, camY);
    this.drawDog(g, ctx, camX, camY);
    this.drawEntities(g, ctx, camX, camY);
    if (g.ride) {
      const c = A.camp.minecart;
      const bob = Math.abs(g.ride.vx) > 40 ? Math.round(Math.sin(g.time * 30) * 0.6) : 0;
      ctx.drawImage(c, Math.round(g.ride.x - c.width / 2 - camX), Math.round((g.ride.row + 1) * TILE - c.height - 3 + bob - camY));
    }
    this.drawWater(g, ctx, camX, camY, vw, vh);
    this.drawGas(g, ctx, camX, camY, vw, vh);
    this.drawFishing(g, ctx, camX, camY);
    this.updateAmbient(g, dt, camX, camY, vw, vh);
    this.drawGhost(g, ctx, camX, camY);
    this.drawFog(g, ctx, camX, camY, vw, vh);
    this.drawRain(g, ctx, camX, camY, vw, vh);
    this.drawSnow(g, ctx, camX, camY, vw, vh);

    // ---- lighting
    const L = g.light;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(L.canvas, L.x0 * TILE - camX, L.y0 * TILE - camY, L.w * TILE, L.h * TILE);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;

    this.drawGlows(g, ctx, camX, camY, vw, vh);
    this.drawLanterns(g, ctx, camX, camY, vw, vh);
    this.drawBolt(g, ctx, camX, camY);
    this.drawShades(g, ctx, camX, camY);
    this.drawDogMarks(g, ctx, camX, camY);
    this.drawReelMeter(g, ctx, camX, camY);
    this.drawBreath(g, ctx, camX, camY);
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);
    this.drawDread(g, ctx, vw, vh);
    this.drawHover(g, ctx, camX, camY);

    // a near strike whites out the screen for an instant (gently, with screen effects off)
    const fl = g.weather.flash;
    if (fl > 0.02 && camY < (SURFACE_Y + 30) * TILE) {
      ctx.fillStyle = `rgba(235,240,255,${(fl * (prefs.shake ? 0.32 : 0.1)).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (g.flare && g.flare.t < 0.7 && prefs.shake) {
      ctx.fillStyle = `rgba(255,236,190,${(0.5 * (1 - g.flare.t / 0.7) * (g.flare.level === 1 ? 1 : 0.6)).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (g.gloom > 0) {
      ctx.fillStyle = `rgba(20,0,30,${Math.min(0.5, g.gloom * 0.25)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    // near a Lampless your flame gutters: the whole cave sinks for a moment
    const reach = g.flameReach();
    if (reach < 1) {
      ctx.fillStyle = `rgba(3,2,8,${((1 - reach) * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    const pl = g.player;
    if (pl.hurtT > 0) {
      ctx.fillStyle = `rgba(160,0,0,${pl.hurtT * (prefs.shake ? 0.8 : 0.3)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (g.p.food <= 0) {
      ctx.fillStyle = `rgba(60,20,0,${0.12 + Math.sin(g.time * 3) * 0.05})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (pl.dead) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, pl.deadT * 0.4)})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    if (g.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${g.fade})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    // the overlay: wipe only what was drawn last frame, and fade it with the scene
    const o = this.octx;
    const d = this.dirty;
    if (d) o.clearRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
    this.dirty = null;
    const op = g.fade > 0 ? Math.max(0, 1 - g.fade).toFixed(2) : '';
    if (op !== this.overOpacity) {
      this.over.style.opacity = op;
      this.overOpacity = op;
    }
    this.drawOverlayText(g, o, camX, camY);
  }

  /** grow the part of the overlay to wipe next frame */
  private mark(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.dirty;
    const a = Math.floor(x0) - 3;
    const b = Math.floor(y0) - 3;
    const c = Math.ceil(x1) + 3;
    const e = Math.ceil(y1) + 3;
    if (!d) this.dirty = { x0: a, y0: b, x1: c, y1: e };
    else {
      d.x0 = Math.min(d.x0, a);
      d.y0 = Math.min(d.y0, b);
      d.x1 = Math.max(d.x1, c);
      d.y1 = Math.max(d.y1, e);
    }
  }

  // ------------------------------------------------------------------ the valley's birds
  /** a flock crossing the sky, in parallax space (it drifts at 0.4 of the camera) */
  private flock: { x: number; y: number; vx: number; vy: number; birds: { dx: number; dy: number; ph: number }[]; scared: boolean } | null = null;
  private flockT = 6;

  /**
   * Now and then on a fair day a little flock crosses the sky over the valley, wings flickering.
   * Never in rain, at night, on a tide night or in the heart's chamber; a crack of lightning scatters it.
   */
  private drawFlock(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, dt: number): void {
    const P = 0.4;
    const groundY = SURFACE_Y * TILE - camY;
    const wx = g.weather;
    if (!this.flock) {
      this.flockT -= dt;
      if (this.flockT > 0) return;
      this.flockT = 16 + Math.random() * 28;
      if (daylight(g.p.clock) < 0.6 || wx.rain > 0.15 || wx.fog > 0.5 || groundY < 120 || g.p.tide || g.boss || seasonOf(g.p.stats.days).id === 'winter') return;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const n = 3 + Math.floor(Math.random() * 6);
      const birds = Array.from({ length: n }, (_, i) => ({ dx: -dir * (i * 9 + Math.random() * 7), dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 5 + Math.random() * 3, ph: Math.random() * 6 }));
      // across the open sky above the peaks, clear of the HUD along the top
      const sy = Math.max(40, groundY - 70 - Math.random() * 120);
      this.flock = { x: camX * P + (dir > 0 ? -60 : vw + 60), y: camY * P + sy, vx: dir * (34 + Math.random() * 22), vy: 0, birds, scared: false };
      return;
    }
    const f = this.flock;
    // thunder, or the rain coming on, sends them off fast and high
    if (!f.scared && (wx.flash > 0.5 || wx.rain > 0.3)) {
      f.scared = true;
      f.vx *= 2.2;
      f.vy = -40;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    const sx = f.x - camX * P;
    const sy = f.y - camY * P;
    if (sx < -140 || sx > vw + 140 || sy < -60) {
      this.flock = null;
      return;
    }
    ctx.fillStyle = 'rgba(38,32,46,0.85)';
    const flap = f.scared ? 16 : 9;
    for (const b of f.birds) {
      const bx = Math.round(sx + b.dx);
      const by = Math.round(sy + b.dy + Math.sin(g.time * 1.7 + b.ph) * 1.5);
      const fr = Math.floor(g.time * flap + b.ph) % 3;
      // a five-pixel bird: wings up, level, down
      ctx.fillRect(bx, by, 1, 1);
      if (fr === 0) {
        ctx.fillRect(bx - 1, by - 1, 1, 1);
        ctx.fillRect(bx + 1, by - 1, 1, 1);
        ctx.fillRect(bx - 2, by - 2, 1, 1);
        ctx.fillRect(bx + 2, by - 2, 1, 1);
      } else if (fr === 1) {
        ctx.fillRect(bx - 2, by - 1, 2, 1);
        ctx.fillRect(bx + 1, by - 1, 2, 1);
      } else {
        ctx.fillRect(bx - 1, by, 1, 1);
        ctx.fillRect(bx + 1, by, 1, 1);
        ctx.fillRect(bx - 2, by + 1, 1, 1);
        ctx.fillRect(bx + 2, by + 1, 1, 1);
      }
    }
  }

  // ------------------------------------------------------------------ weather
  /** a fixed field of raindrops, scrolled with time and the camera */
  private drops: { x: number; y: number; s: number; l: number }[] = Array.from({ length: 360 }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: 0.8 + Math.random() * 0.45,
    l: 7 + Math.random() * 9,
  }));
  private fogPuff: HTMLCanvasElement | null = null;

  /** rain: streaks that stop at the first solid thing above them, and splashes where they land */
  private drawRain(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const wx = g.weather;
    const rain = wx.rain;
    if (rain < 0.02) return;
    const w = g.world;
    const sky = w.skyline;
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE));
    let low = 0;
    for (let x = c0; x <= c1; x++) if (sky[x] > low) low = sky[x];
    // deep underground: nothing to draw
    if (low * TILE < camY) return;
    const storm = wx.kind === 'storm' ? wx.k : 0;
    const slant = 0.16 + 0.3 * storm;
    const W = vw + 80;
    const H = vh + 80;
    const n = Math.min(this.drops.length, Math.round(rain * (vw * vh) / 1500));
    const t = g.time;
    ctx.save();
    ctx.strokeStyle = `rgba(185,205,235,${(0.35 + 0.2 * rain).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      const fall = t * 560 * d.s;
      const y = mod(d.y * H + fall - camY, H) - 40;
      const x = mod(d.x * W - camX - fall * slant, W) - 40;
      const col = Math.floor((x + camX) / TILE);
      if (col < 0 || col >= w.w) continue;
      const ground = sky[col] * TILE - camY;
      if (y - d.l > ground) continue;
      const y1 = Math.min(y, ground);
      const len = y1 - (y - d.l);
      ctx.moveTo(Math.round(x + d.l * slant) + 0.5, Math.round(y - d.l));
      ctx.lineTo(Math.round(x + (d.l - len) * slant) + 0.5, Math.round(y1));
    }
    ctx.stroke();
    // splashes on whatever the rain lands on (the top of the water, where there is water)
    ctx.fillStyle = 'rgba(205,220,245,0.7)';
    const m = Math.round(n * 0.35);
    for (let k = 0; k < m; k++) {
      const x = Math.floor(Math.random() * vw);
      const col = Math.floor((x + camX) / TILE);
      if (col < 0 || col >= w.w) continue;
      let top = sky[col];
      for (let u = 0; u < 12 && top > 0 && w.fg[(top - 1) * w.w + col] === B.WATER; u++) top--;
      const y = top * TILE - camY;
      if (y < 0 || y > vh) continue;
      const h = Math.random() < 0.5 ? 1 : 2;
      ctx.fillRect(x - 1, y - h - 1, 1, 1);
      ctx.fillRect(x + 1, y - h, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1);
    }
    ctx.restore();
  }

  /** morning fog: a pale haze over the valley floor and slow banks drifting through it */
  private drawFog(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const f = g.weather.fog;
    if (f < 0.02) return;
    const groundY = SURFACE_Y * TILE - camY;
    if (groundY + 260 < 0) return;
    if (!this.fogPuff) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 96;
      const x = c.getContext('2d');
      if (x) {
        // a soft ellipse: a round gradient, squashed to the canvas height
        const gr = x.createRadialGradient(128, 128, 4, 128, 128, 128);
        gr.addColorStop(0, 'rgba(225,230,238,0.85)');
        gr.addColorStop(0.5, 'rgba(225,230,238,0.4)');
        gr.addColorStop(1, 'rgba(225,230,238,0)');
        x.setTransform(1, 0, 0, 0.375, 0, 0);
        x.fillStyle = gr;
        x.fillRect(0, 0, 256, 256);
      }
      this.fogPuff = c;
    }
    const haze = ctx.createLinearGradient(0, groundY - 220, 0, groundY + 160);
    haze.addColorStop(0, 'rgba(215,220,230,0)');
    haze.addColorStop(0.55, `rgba(215,220,230,${(0.42 * f).toFixed(3)})`);
    haze.addColorStop(1, 'rgba(215,220,230,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, Math.max(0, groundY - 220), vw, Math.min(vh, groundY + 160) - Math.max(0, groundY - 220));
    const span = vw + 520;
    const w = g.world;
    ctx.globalAlpha = 0.55 * f;
    for (let i = 0; i < 12; i++) {
      const sx = mod(i * 197 + g.time * (5 + (i % 4) * 3) - camX, span) - 260;
      const col = Math.max(0, Math.min(w.w - 1, Math.floor((sx + 128 + camX) / TILE)));
      const sy = w.surface[col] * TILE - camY - 60 - (i % 3) * 26;
      if (sy > vh || sy + 96 < 0) continue;
      ctx.drawImage(this.fogPuff, Math.round(sx), Math.round(sy), 256 + (i % 3) * 60, 96);
    }
    ctx.globalAlpha = 1;
  }

  /** a bolt of lightning, white-hot and gone in a blink */
  private drawBolt(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const b = g.weather.bolt;
    if (!b) return;
    // it strikes, dims, and strikes again down the same path
    const a = b.t < 0.08 ? 1 : b.t < 0.14 ? 0.3 : b.t < 0.22 ? 0.9 : Math.max(0, 1 - (b.t - 0.22) / 0.13);
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    const path = (): void => {
      ctx.beginPath();
      b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(Math.round(p.x - camX), Math.round(p.y - camY)) : ctx.lineTo(Math.round(p.x - camX), Math.round(p.y - camY))));
    };
    path();
    ctx.strokeStyle = `rgba(150,160,255,${(0.35 * a).toFixed(3)})`;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = `rgba(210,220,255,${(0.7 * a).toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    const end = b.pts[b.pts.length - 1];
    this.glowAt(ctx, end.x - camX, end.y - camY, 60, `rgba(200,210,255,${(0.5 * a).toFixed(3)})`);
    ctx.restore();
  }

  // ------------------------------------------------------------------ sky
  private drawSky(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const groundY = SURFACE_Y * TILE - camY;
    if (groundY < -160) {
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, 0, vw, vh);
      return;
    }
    const c = g.p.clock;
    const dl = daylight(c);
    const dusk = c > 0.5 && c < 0.68 ? 1 - Math.abs(c - 0.59) / 0.09 : c < 0.07 ? 1 - c / 0.07 : c > 0.93 ? (c - 0.93) / 0.07 : 0;
    const baseCam = SURFACE_Y * TILE - vh * 0.62;
    const y0 = Math.round(vh * 0.62 + 90 - (camY - baseCam) * 0.45 - this.skyDay.height);
    // the art continues upward: a gradient from its own top colour into a deeper zenith, so it never ends mid-sky
    const draw = (img: HTMLCanvasElement, top: SkyTop, alpha: number): void => {
      if (alpha <= 0.01) return;
      ctx.globalAlpha = alpha;
      if (y0 > 0) {
        const grad = ctx.createLinearGradient(0, y0 - 300, 0, y0);
        grad.addColorStop(0, top.deep);
        grad.addColorStop(1, top.join);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, vw, y0);
      }
      const ox = -(((camX * 0.15) % img.width) + img.width) % img.width;
      for (let x = ox; x < vw; x += img.width) ctx.drawImage(img, Math.round(x), y0);
      ctx.globalAlpha = 1;
      const imgBottom = y0 + img.height;
      if (imgBottom < vh) {
        ctx.fillStyle = '#0c1a10';
        ctx.fillRect(0, imgBottom, vw, vh - imgBottom);
      }
    };
    // day art fades into the dusk art, then both darken into night
    const dayA = Math.max(0, Math.min(1, (dl - 0.3) / 0.6)) * (1 - dusk * 0.8);
    ctx.fillStyle = this.skyDuskTop.deep;
    ctx.fillRect(0, 0, vw, vh);
    draw(this.skyDusk, this.skyDuskTop, 1);
    draw(this.skyDay, this.skyDayTop, dayA);
    if (dl < 1) {
      ctx.fillStyle = `rgba(8,10,30,${(1 - dl) * 0.72})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    // stars only in the open sky above the painted mountains (the dusk art has its own)
    if (dl < 0.6 && y0 > 0 && g.weather.dark < 0.2) {
      const a = ((0.6 - dl) / 0.48) * (1 - g.weather.dark * 5);
      for (const s of this.stars) {
        const x = mod(s.x - camX * 0.05, vw + 40) - 20;
        const y = mod(s.y - (camY - baseCam) * 0.3, 900) - 600 + y0;
        if (y < 0 || y > y0 - 4) continue;
        ctx.fillStyle = `rgba(255,255,240,${a * (0.4 + 0.6 * Math.abs(Math.sin(g.time * (0.5 + s.b) + s.x)))})`;
        ctx.fillRect(Math.round(x), Math.round(y), s.b > 0.85 ? 2 : 1, s.b > 0.85 ? 2 : 1);
      }
    }
    // a Gloam Tide bruises the sky
    const tide = !!g.p.tide;
    if (tide) {
      ctx.fillStyle = `rgba(70,14,90,${0.28 + Math.sin(g.time * 0.8) * 0.06})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    // cloud: the sky greys over, the stars and moon go out, and a low wrack rolls over the peaks
    const wx = g.weather;
    const od = Math.min(1, wx.dark * 2.2);
    if (od > 0.01) {
      ctx.fillStyle = `rgba(46,50,62,${(od * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
      const band = Math.max(40, y0 + 40);
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer === 0 ? `rgba(70,74,88,${(od * 0.5).toFixed(3)})` : `rgba(34,36,46,${(od * 0.6).toFixed(3)})`;
        const speed = layer === 0 ? 5 : 9;
        const step = layer === 0 ? 90 : 70;
        const off = mod(g.time * speed - camX * (layer === 0 ? 0.08 : 0.12), step);
        for (let x = -step + off - step; x < vw + step; x += step) {
          const seed = Math.floor((x - off + camX * (layer === 0 ? 0.08 : 0.12)) / step);
          const r = 30 + mod(seed * 37, 26) + layer * 8;
          const cy = band * (layer === 0 ? 0.25 : 0.12) + mod(seed * 53, 22);
          ctx.beginPath();
          ctx.arc(Math.round(x), Math.round(cy), r, 0, Math.PI * 2);
          ctx.arc(Math.round(x + r * 0.9), Math.round(cy + 8), r * 0.75, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillRect(0, 0, vw, Math.round(band * (layer === 0 ? 0.25 : 0.12)));
      }
    }
    // the moon (red on a tide night), hidden behind cloud
    if (isNight(c) && od < 0.9) {
      ctx.globalAlpha = 1 - od;
      const t = (c - 0.6) / 0.36;
      const mx = vw * (0.15 + t * 0.7);
      const my = 70 - Math.sin(t * Math.PI) * 40;
      this.glowAt(ctx, mx, my, tide ? 48 : 34, tide ? 'rgba(255,80,110,0.3)' : 'rgba(200,210,255,0.18)');
      ctx.fillStyle = tide ? '#ff9a9a' : '#e8ecff';
      ctx.beginPath();
      ctx.arc(Math.round(mx), Math.round(my), 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,170,210,0.7)';
      ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 2, 3, 3);
      ctx.fillRect(Math.round(mx) + 2, Math.round(my) + 3, 2, 2);
      ctx.globalAlpha = 1;
    }
    // lightning lights the whole sky
    if (wx.flash > 0.02) {
      ctx.fillStyle = `rgba(225,230,255,${(wx.flash * (prefs.shake ? 0.7 : 0.3)).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  // ------------------------------------------------------------------ water and fishing
  private drawWater(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const ty0 = Math.max(0, Math.floor(camY / TILE));
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE));
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE));
    const t = g.time;
    const tex = terrainTexture(MAT.water);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (w.fg[ty * w.w + tx] !== B.WATER) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        const above = w.get(tx, ty - 1);
        const top = above !== B.WATER;
        const open = top && !BLOCKS[above].solid;
        const rip = open ? 3 + Math.round(Math.sin(t * 2.1 + tx * 0.9) * 1.2 + Math.sin(t * 1.3 + tx * 2.3) * 0.6) : 0;
        let depth = 0;
        while (depth < 4 && w.get(tx, ty - depth - 1) === B.WATER) depth++;
        ctx.globalAlpha = 0.66;
        const ox = mod(Math.floor(tx * TILE + t * 6), 128);
        const oy = mod(Math.floor(ty * TILE + Math.sin(t * 0.6 + tx * 0.4) * 4), 128);
        blitWrapped(ctx, tex, ox, oy, sx, sy + rip, TILE, TILE - rip);
        if (depth > 0) {
          ctx.globalAlpha = Math.min(0.45, depth * 0.11);
          ctx.fillStyle = '#04102a';
          ctx.fillRect(sx, sy, TILE, TILE);
        }
        if (open) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#b4e2ff';
          ctx.fillRect(sx, sy + rip, TILE, 1);
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = '#6ab4e8';
          ctx.fillRect(sx, sy + rip + 1, TILE, 2);
          // a glint drifting along the surface
          const gl = mod(Math.floor(t * 9 + tx * 13), 64);
          if (gl < TILE - 4) {
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx + gl, sy + rip, 3, 1);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFishing(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const f = g.fishing;
    if (f && !g.player.dead) {
      const tip = g.rodTip();
      const tx = tip.x - camX;
      const ty = tip.y - camY;
      let bx = f.x - camX;
      let by = f.y - camY;
      if (f.state === 'float') by += Math.sin(g.time * 3) * 1.2;
      else if (f.state === 'bite') by += 4;
      else if (f.state === 'reel') {
        bx += Math.round((Math.random() - 0.5) * 3);
        by += 2 + Math.round((Math.random() - 0.5) * 2);
      }
      // the line: slack and sagging while you wait, tight while something pulls
      const d = Math.hypot(bx - tx, by - ty);
      const sag = f.state === 'float' ? Math.min(40, d * 0.22) : f.state === 'reel' || f.state === 'bite' ? 0 : Math.min(16, d * 0.08);
      ctx.strokeStyle = 'rgba(230,236,245,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(tx) + 0.5, Math.round(ty) + 0.5);
      ctx.quadraticCurveTo((tx + bx) / 2, (ty + by) / 2 + sag, Math.round(bx) + 0.5, Math.round(by) + 0.5);
      ctx.stroke();
      // ripples around a floating bobber
      if (f.state === 'float' || f.state === 'bite') {
        const r = (g.time * 14) % 16;
        ctx.strokeStyle = `rgba(200,235,255,${0.5 * (1 - r / 16)})`;
        ctx.beginPath();
        ctx.ellipse(Math.round(bx), Math.round(f.y - camY), 3 + r, 1 + r * 0.25, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // the bobber: red over white
      const x = Math.round(bx) - 2;
      const y = Math.round(by) - 3;
      ctx.fillStyle = '#1a1018';
      ctx.fillRect(x - 1, y - 1, 6, f.state === 'bite' ? 4 : 7);
      ctx.fillStyle = '#e04040';
      ctx.fillRect(x, y, 4, 2);
      if (f.state !== 'bite') {
        ctx.fillStyle = '#f4f4f0';
        ctx.fillRect(x, y + 2, 4, 3);
      }
      ctx.fillStyle = '#ffb0a0';
      ctx.fillRect(x, y, 1, 1);
    }
    // the catch flies out of the water to you
    const ff = g.fishFly;
    if (ff) {
      const k = Math.min(1, ff.t / 0.6);
      const pl = g.player;
      const x = ff.x0 + (pl.cx - ff.x0) * k;
      const y = ff.y0 + (pl.cy - ff.y0) * k - Math.sin(k * Math.PI) * 46;
      const def = ITEMS[ff.id] ?? ITEMS.coin;
      if (def) {
        const s = iconSrc(def.icon);
        ctx.save();
        ctx.translate(Math.round(x - camX), Math.round(y - camY));
        ctx.rotate(k * Math.PI * 2 * (ff.x0 < pl.cx ? 1 : -1));
        ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, -11, -11, 22, 22);
        ctx.restore();
      }
    }
  }

  /** the reeling game: click while the needle is in the green */
  private drawReelMeter(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const f = g.fishing;
    const pl = g.player;
    if (!f || f.state !== 'reel' || pl.dead) return;
    const W = 70;
    const x = Math.round(pl.cx - camX - W / 2);
    const y = Math.round(pl.y - camY - 24);
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(x - 2, y - 2, W + 4, 11);
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(x, y, W, 7);
    const z0 = Math.round(x + (f.zone - f.zoneW / 2) * W);
    const zw = Math.max(3, Math.round(f.zoneW * W));
    ctx.fillStyle = '#3aa85a';
    ctx.fillRect(z0, y, zw, 7);
    ctx.fillStyle = '#7ae89a';
    ctx.fillRect(z0, y, zw, 2);
    const nx = Math.round(x + f.needle * W);
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(nx - 2, y - 3, 4, 13);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(nx - 1, y - 2, 2, 11);
    // one pip per pull still needed
    for (let i = 0; i < f.need; i++) {
      const px = Math.round(pl.cx - camX - (f.need * 7) / 2 + i * 7);
      ctx.fillStyle = '#0c0a12';
      ctx.fillRect(px, y + 11, 5, 5);
      ctx.fillStyle = i < f.hits ? '#ffd75a' : '#4a4058';
      ctx.fillRect(px + 1, y + 12, 3, 3);
    }
  }

  // ------------------------------------------------------------------ cave backdrops
  /** layered, parallax cave depths behind every open cavern, one look per biome */
  private drawBackdrop(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE) + 1);
    let shallowest = 1e9;
    let deepest = -1e9;
    for (let tx = tx0; tx <= tx1; tx++) {
      const y = (w.surface[tx] + 2) * TILE - camY;
      shallowest = Math.min(shallowest, y);
      deepest = Math.max(deepest, y);
    }
    // nothing underground on screen
    if (shallowest > vh) return;
    ctx.save();
    if (deepest > 0) {
      // clip to below the ground line so the sky stays above it
      ctx.beginPath();
      ctx.moveTo(-2, vh + 2);
      for (let tx = tx0; tx <= tx1; tx++) {
        const y = (w.surface[tx] + 2) * TILE - camY;
        ctx.lineTo(tx * TILE - camX, y);
        ctx.lineTo((tx + 1) * TILE - camX, y);
      }
      ctx.lineTo(vw + 2, vh + 2);
      ctx.closePath();
      ctx.clip();
    }
    const rowTop = Math.floor(camY / TILE);
    const rowBot = Math.floor((camY + vh) / TILE);
    for (let bi = 0; bi < BIOMES.length; bi++) {
      const top = bi === 0 ? 0 : BIOMES[bi].top;
      const bot = bi === BIOMES.length - 1 ? w.h : BIOMES[bi + 1].top;
      if (bot < rowTop || top > rowBot) continue;
      const y0 = Math.max(0, top * TILE - camY);
      const y1 = Math.min(vh, bot * TILE - camY);
      if (y1 <= y0) continue;
      const bd = this.backdrops[Math.min(this.backdrops.length - 1, bi)];
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, vw, y1 - y0);
      ctx.clip();
      this.tileLayer(ctx, bd.far, camX * 0.18, camY * 0.18 + bi * 97, vw, vh);
      this.tileLayer(ctx, bd.mid, camX * 0.42, camY * 0.42 + bi * 53, vw, vh);
      ctx.restore();
    }
    ctx.restore();
  }

  private tileLayer(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, ox: number, oy: number, vw: number, vh: number): void {
    const x0 = -mod(Math.round(ox), BW);
    const y0 = -mod(Math.round(oy), BH);
    for (let y = y0; y < vh; y += BH) for (let x = x0; x < vw; x += BW) ctx.drawImage(img, x, y);
  }

  // ------------------------------------------------------------------ trees + settlers
  private drawTrees(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 3);
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE) + 3);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const ty1 = Math.min(w.h - 1, Math.floor((camY + this.scene.height) / TILE) + 5);
    const autumn = autumnTint(g.p.stats.days, g.p.clock);
    // in winter the last leaves hang dull and brown under the snow
    const leaves = seasonOf(g.p.stats.days).id === 'winter' ? 'winter' : 'autumn';
    const cover = g.weather.cover;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (w.obj[ty * w.w + tx] !== Obj.TREE) continue;
        const key = TREE_SPRITES[treeKind(tx, w.seed)];
        const img = A.camp[key];
        const pad = A.padBottom[key] ?? 0;
        const off = Math.round((hash(tx, w.seed + 3) - 0.5) * 8);
        const x = Math.round(tx * TILE + 16 - img.width / 2 + off - camX);
        const y = Math.round((ty + 1) * TILE - (img.height - pad) + 3 - camY);
        const dmg = w.damage.get(ty * w.w + tx);
        const wob = dmg ? Math.sin(g.time * 40) * 1.5 : 0;
        ctx.drawImage(img, Math.round(x + wob), y);
        if (autumn > 0 && (key === 'oak' || key === 'birch')) {
          ctx.globalAlpha = autumn;
          ctx.drawImage(this.seasonal(key, img, leaves), Math.round(x + wob), y);
          ctx.globalAlpha = 1;
        }
        if (cover > 0.02) {
          ctx.globalAlpha = cover;
          ctx.drawImage(this.seasonal(key, img, 'snow'), Math.round(x + wob), y);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /** the great lantern: cold iron until kindled, then the lit sprite burns brighter with every level */
  private drawWick(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const cold = A.camp.wick;
    const x = Math.round((WICK_X + 0.5) * TILE - cold.width / 2 - camX);
    if (x > this.scene.width + 10 || x + cold.width < -10) return;
    const y = Math.round(WICK_Y * TILE - (cold.height - (A.padBottom.wick ?? 0)) + 2 - camY);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 10, Math.round(WICK_Y * TILE - camY) - 1, cold.width - 20, 3);
    ctx.drawImage(cold, x, y);
    const lvl = g.flame;
    if (lvl > 0) {
      let flick = 0.92 + Math.sin(g.time * 9.1) * 0.04 + Math.sin(g.time * 14.7) * 0.04;
      const tide = g.p.tide;
      // on a tide night the flame gutters, worse as its ward goes
      if (tide) flick *= 0.45 + 0.4 * (tide.ward / 100) + (Math.sin(g.time * 23) > 0.6 ? -0.15 : 0.05);
      ctx.globalAlpha = Math.max(0, Math.min(1, (0.62 + lvl * 0.08) * flick));
      ctx.drawImage(A.camp.wick_lit, x, y);
      ctx.globalAlpha = 1;
    }
  }

  private drawBuildings(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const b of g.p.buildings) {
      const info = BUILDING_INFO[b.kind];
      const img = A.camp[info.sprite];
      const pad = A.padBottom[info.sprite] ?? 0;
      const x = Math.round(b.x * TILE - img.width / 2 - camX);
      const y = Math.round(b.y * TILE - (img.height - pad) + 2 - camY);
      // contact shadow so it reads as standing on the grass
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 6, Math.round(b.y * TILE - camY) - 1, img.width - 12, 3);
      ctx.drawImage(img, x, y);
      if (g.weather.cover > 0.02) {
        ctx.globalAlpha = g.weather.cover;
        ctx.drawImage(this.seasonal(info.sprite, img, 'snow'), x, y);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** a sprite in the season's colours: autumn leaves, or snow lying on every top edge (made once) */
  private seasonArt = new Map<string, HTMLCanvasElement>();
  private seasonal(key: string, img: HTMLImageElement, kind: 'autumn' | 'winter' | 'snow'): HTMLCanvasElement {
    const id = kind + ':' + key;
    const have = this.seasonArt.get(id);
    if (have) return have;
    const W = img.width;
    const H = img.height;
    const [cv, cx] = makeCanvas(W, H);
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, W, H).data;
    const out = new ImageData(W, H);
    const o = out.data;
    const put = (i: number, r: number, gg: number, b: number, a: number): void => {
      o[i] = r;
      o[i + 1] = gg;
      o[i + 2] = b;
      o[i + 3] = a;
    };
    const AUTUMN = [
      [222, 128, 44],
      [236, 176, 62],
      [190, 74, 46],
    ];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 40) continue;
        if (kind !== 'snow') {
          const r = d[i];
          const gg = d[i + 1];
          const b = d[i + 2];
          // only the leaves: green over red and blue
          if (gg <= r + 6 || gg <= b) continue;
          const L = (r + gg + b) / 765;
          const pick = hash(Math.floor(x / 6) + Math.floor(y / 5) * 37, 11);
          const c = kind === 'winter' ? (pick < 0.5 ? [128, 104, 86] : [148, 120, 96]) : AUTUMN[pick < 0.45 ? 0 : pick < 0.8 ? 1 : 2];
          const m = 0.4 + L * 1.25;
          put(i, Math.min(255, c[0] * m), Math.min(255, c[1] * m), Math.min(255, c[2] * m), d[i + 3]);
        } else {
          // snow: lying on every edge that faces the sky, a pixel proud of it and two into it
          const up = y === 0 ? 0 : d[i - W * 4 + 3];
          const up2 = y < 2 ? 0 : d[i - W * 8 + 3];
          if (up < 40) {
            put(i, 246, 249, 255, 255);
            if (y > 0 && hash(x, y + 5) < 0.75) put(i - W * 4, 236, 242, 252, 255);
          } else if (up2 < 40) put(i, 226, 234, 246, 255);
          else if (y > 2 && d[i - W * 12 + 3] < 40 && hash(x * 7, y) < 0.5) put(i, 200, 214, 234, 255);
        }
      }
    }
    cx.clearRect(0, 0, W, H);
    cx.putImageData(out, 0, 0);
    this.seasonArt.set(id, cv);
    return cv;
  }

  /** snow lying on the meadow: a white cap on every top that sees the sky */
  private drawSnowCover(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const cover = g.weather.cover;
    if (cover < 0.02) return;
    const w = g.world;
    const sky = w.skyline;
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE));
    const depth = Math.round(2 + cover * 6);
    for (let x = c0; x <= c1; x++) {
      const ty = sky[x];
      if (ty >= w.h) continue;
      // a pond: nothing settles on open water
      if (ty > 0 && BLOCKS[w.fg[(ty - 1) * w.w + x]].liquid) continue;
      const sy = Math.round(ty * TILE - camY);
      if (sy < -12 || sy > vh + 12) continue;
      const sx = Math.round(x * TILE - camX);
      for (let k = 0; k < TILE; k += 4) {
        // little drifts: the top edge rises and falls along the ground
        const bump = Math.round((1 + hash(x * 8 + k / 4, w.seed + 77) * 2) * cover);
        ctx.fillStyle = '#eef4fc';
        ctx.fillRect(sx + k, sy - bump, 4, depth + bump);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx + k, sy - bump, 4, 1);
      }
      // a cold blue shade under it, and the snow wrapping over a step down
      ctx.fillStyle = 'rgba(150,172,210,0.6)';
      ctx.fillRect(sx, sy + depth, TILE, 1);
      ctx.fillStyle = '#e2eaf6';
      if (x > 0 && sky[x - 1] > ty) ctx.fillRect(sx, sy, 2, depth + 3);
      if (x < w.w - 1 && sky[x + 1] > ty) ctx.fillRect(sx + TILE - 2, sy, 2, depth + 3);
    }
  }

  /** falling snow: slow flakes drifting side to side */
  private drawSnow(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const s = g.weather.snow;
    if (s < 0.02) return;
    const w = g.world;
    const sky = w.skyline;
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE));
    let low = 0;
    for (let x = c0; x <= c1; x++) if (sky[x] > low) low = sky[x];
    if (low * TILE < camY) return;
    const W = vw + 80;
    const H = vh + 80;
    const n = Math.min(this.drops.length, Math.round((s * (vw * vh)) / 1000));
    const t = g.time;
    ctx.fillStyle = 'rgba(242,247,255,0.9)';
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      const fall = t * (26 + 34 * (d.s - 0.8));
      const y = mod(d.y * H + fall * 1.6 - camY, H) - 40;
      const x = mod(d.x * W - camX + Math.sin(t * (0.6 + d.s * 0.5) + i * 1.7) * 12 - fall * 0.25, W) - 40;
      const col = Math.floor((x + camX) / TILE);
      if (col < 0 || col >= w.w) continue;
      let top = sky[col];
      while (top > 0 && BLOCKS[w.fg[(top - 1) * w.w + col]].liquid) top--;
      if (y > top * TILE - camY) continue;
      const sz = d.l > 13 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
    }
  }

  /** Tallow, at your heels or waiting where you left him */
  private drawDog(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const dg = g.dog;
    const img = A.camp.dog;
    if (!dg.present || !img) return;
    const { row, f, feet } = dg.frame();
    const C = DOG_CELL;
    const x = Math.round(dg.x - C / 2 - camX);
    const y = Math.round(dg.y - feet - camY) + 1;
    // a soft shadow under him so he stands on the ground
    if (dg.anim !== 'leap') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 14, Math.round(dg.y - camY), C - 28, 2);
    }
    ctx.save();
    if (dg.facing < 0) {
      ctx.translate(x + C, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, f * C, row * C, C, C, 0, 0, C, C);
    } else ctx.drawImage(img, f * C, row * C, C, C, x, y, C, C);
    ctx.restore();
  }

  /** over the dark: his eyes catching your lamp, a scent he has caught, a pat */
  private drawDogMarks(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const dg = g.dog;
    if (!dg.present) return;
    const t = g.time;
    // two pinpricks of eyeshine where the light does not reach him
    if (dg.lit < 0.3 && dg.anim !== 'dig') {
      const blink = (t * 0.7 + dg.x * 0.01) % 4 < 0.12;
      if (!blink) {
        const head = dg.anim === 'sniff' ? 20 : dg.anim === 'run' || dg.anim === 'leap' ? 24 : 26;
        const ex = Math.round(dg.x + dg.facing * 11 - camX);
        const ey = Math.round(dg.y - head - camY);
        ctx.globalAlpha = 0.85 * (1 - dg.lit / 0.3) + 0.15;
        ctx.fillStyle = '#e8f0a0';
        ctx.fillRect(ex, ey, 1, 1);
        ctx.fillRect(ex - dg.facing * 2, ey, 1, 1);
        ctx.globalAlpha = 1;
      }
    }
    // the scent: faint wisps curling up out of the rock
    const sc = dg.scent;
    if (sc) {
      const a = Math.min(1, sc.t / 2) * Math.min(1, (9 - sc.t) * 2);
      const cx = (sc.x + 0.5) * TILE - camX;
      const cy = (sc.y + 0.5) * TILE - camY;
      for (let k = 0; k < 7; k++) {
        const ph = (t * 0.45 + k / 7) % 1;
        const px = Math.round(cx + Math.sin(t * 2 + k * 1.7 + ph * 5) * (5 + ph * 7));
        const py = Math.round(cy + 6 - ph * 34);
        ctx.globalAlpha = a * 0.9 * Math.sin(ph * Math.PI);
        ctx.fillStyle = k % 2 ? '#fff0b8' : '#e8d498';
        ctx.fillRect(px, py, 2, 3);
        ctx.globalAlpha *= 0.35;
        ctx.fillRect(px - 1, py - 1, 4, 5);
      }
      ctx.globalAlpha = 1;
    }
    // a pat: a little heart floating up
    if (dg.heartT > 0) {
      const k = 1 - dg.heartT / 1.4;
      const hx = Math.round(dg.x - camX) - 3;
      const hy = Math.round(dg.y - 40 - k * 18 - camY);
      ctx.globalAlpha = Math.min(1, dg.heartT * 2);
      ctx.fillStyle = '#ff7a96';
      ctx.fillRect(hx + 1, hy, 2, 1);
      ctx.fillRect(hx + 4, hy, 2, 1);
      ctx.fillRect(hx, hy + 1, 7, 2);
      ctx.fillRect(hx + 1, hy + 3, 5, 1);
      ctx.fillRect(hx + 2, hy + 4, 3, 1);
      ctx.fillRect(hx + 3, hy + 5, 1, 1);
      ctx.globalAlpha = 1;
    }
  }

  private drawNpcs(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    // the townsfolk at their stalls, out for a stroll, or round the Wick (indoors at night)
    for (const t of g.town.folk) {
      if (t.plan === 'inside') continue;
      const lost = t.kind === 'trade' ? null : LOST[t.kind];
      const key = lost && t.moving ? lost.walk : BUILDING_INFO[t.kind].npc;
      const img = A.camp[key];
      if (!img) continue;
      const pad = A.padBottom[key] ?? 0;
      if (lost && t.moving) {
        const frame = Math.floor(t.walkT * 11) % 8;
        const bob = frame % 4 === 1 || frame % 4 === 2 ? -1 : 0;
        const x = Math.round(t.x - 24 - camX);
        const y = Math.round(t.y - (48 - pad) + bob - camY);
        ctx.save();
        if (t.facing > 0) {
          ctx.translate(x + 48, y);
          ctx.scale(-1, 1);
          ctx.drawImage(img, frame * 48, 0, 48, 48, 0, 0, 48, 48);
        } else ctx.drawImage(img, frame * 48, 0, 48, 48, x, y, 48, 48);
        ctx.restore();
        continue;
      }
      const bob = Math.round(Math.sin(g.time * 2 + t.x * 0.03) * 0.6);
      const x = Math.round(t.x - img.width / 2 - camX);
      const y = Math.round(t.y - (img.height - pad) + bob - camY);
      ctx.save();
      if (t.facing > 0) {
        ctx.translate(x + img.width, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
      } else ctx.drawImage(img, x, y);
      ctx.restore();
    }
    // the lost: by their fire, or walking home at your heels
    for (const sl of [...g.souls, ...g.homing]) {
      const def = LOST[sl.kind];
      const key = sl.moving ? def.walk : def.sprite;
      const img = A.camp[key];
      if (!img) continue;
      const pad = A.padBottom[key] ?? 0;
      const frame = sl.moving ? Math.floor(sl.walkT * 11) % 8 : 0;
      const bob = sl.moving ? (frame % 4 === 1 || frame % 4 === 2 ? -1 : 0) : Math.round(Math.sin(g.time * 2 + sl.x) * 0.6);
      const x = Math.round(sl.x - 24 - camX);
      const y = Math.round(sl.y - (48 - pad) + bob - camY);
      ctx.save();
      if (sl.facing > 0) {
        ctx.translate(x + 48, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * 48, 0, 48, 48, 0, 0, 48, 48);
      } else ctx.drawImage(img, frame * 48, 0, 48, 48, x, y, 48, 48);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ liquids
  private drawLiquids(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const ty0 = Math.max(0, Math.floor(camY / TILE));
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE));
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE));
    const t = g.time;
    const lava = terrainTexture(MAT.lava);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const fg = w.fg[ty * w.w + tx];
        if (fg !== B.LAVA) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        const top = w.get(tx, ty - 1) !== B.LAVA;
        const rip = top ? 5 + Math.round(Math.sin(t * 2.6 + tx * 0.9) * 1.5) : 0;
        // slow churn: the seamless lava texture drifting under the surface
        const ox = mod(Math.floor(tx * TILE + t * 9), 128);
        const oy = mod(Math.floor(ty * TILE + rip + Math.sin(t * 0.7 + tx * 0.3) * 6), 128);
        blitWrapped(ctx, lava, ox, oy, sx, sy + rip, TILE, TILE - rip);
        if (top) {
          ctx.fillStyle = '#fff1a8';
          ctx.fillRect(sx, sy + rip, TILE, 1);
          ctx.fillStyle = 'rgba(255,200,90,0.7)';
          ctx.fillRect(sx, sy + rip + 1, TILE, 2);
        }
      }
    }
  }

  // ------------------------------------------------------------------ grass, cracks, decor
  private drawBlockDetails(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const ty0 = Math.max(0, Math.floor(camY / TILE));
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE));
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE) + 1);
    const snowCover = g.weather.cover;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * w.w + tx;
        const fg = w.fg[i];
        if (fg === B.AIR) continue;
        const def = BLOCKS[fg];
        if (!def.solid) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        if (def.topper && !BLOCKS[w.get(tx, ty - 1)].solid) {
          const set = def.topper === 'grass' ? A.grassTop : A.mossTop;
          // under snow the grass is buried
          const buried = ty === w.skyline[tx] ? snowCover : 0;
          if (buried < 0.95) {
            ctx.globalAlpha = 1 - buried;
            ctx.drawImage(set[(tx * 7 + ty) & 3], sx, sy - 7);
            ctx.globalAlpha = 1;
          }
        }
        if (fg !== B.LAVA && dampAt(w, tx, ty)) ctx.drawImage(this.dampArt[(tx * 7 + ty * 3) & 3], sx, sy);
        if (w.loose[i]) {
          // rock that has started to give shudders
          const j = g.working.has(i) ? Math.round((Math.random() - 0.5) * 2.4) : 0;
          ctx.drawImage(this.looseArt[(tx * 3 + ty * 5) & 3], sx + j, sy);
          if (!w.rock(tx, ty + 1)) ctx.drawImage(this.looseUnder[(tx + ty) & 1], sx + j, sy);
        }
        const dmg = w.damage.get(i);
        if (dmg) {
          const frac = 1 - dmg.hp / def.hp;
          ctx.drawImage(this.cracks[Math.max(0, Math.min(3, Math.floor(frac * 4)))], sx, sy);
        }
      }
    }
    // mine rails
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
        if (!w.hasRail(tx, ty)) continue;
        drawRailAt(ctx, tx * TILE - camX, ty * TILE - camY, !w.hasRail(tx - 1, ty), !w.hasRail(tx + 1, ty));
      }
    }
    // decor: big formations first (they sit behind the small stuff), then small decor
    for (let ty = ty0 - 3; ty <= ty1 + 3; ty++) {
      for (let tx = tx0 - 2; tx <= tx1 + 2; tx++) {
        if (!w.inside(tx, ty)) continue;
        const prop = propOf(w.decor[ty * w.w + tx]);
        if (!prop) continue;
        const flip = hash(tx, ty + 31) < 0.5;
        const sx = Math.round(tx * TILE + 16 - prop.w / 2 + (hash(tx * 3, ty) - 0.5) * 6 - camX);
        const sy = prop.anchor === 'floor' ? (ty + 1) * TILE + 3 - prop.h - camY : ty * TILE - 5 - camY;
        if (flip) {
          ctx.save();
          ctx.translate(sx + prop.w, sy);
          ctx.scale(-1, 1);
          ctx.drawImage(A.props, prop.x, prop.y, prop.w, prop.h, 0, 0, prop.w, prop.h);
          ctx.restore();
        } else ctx.drawImage(A.props, prop.x, prop.y, prop.w, prop.h, sx, sy, prop.w, prop.h);
      }
    }
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) {
      for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
        if (!w.inside(tx, ty)) continue;
        const dc = w.decor[ty * w.w + tx];
        if (!dc || propOf(dc)) continue;
        // little plants on the meadow vanish under the snow
        const under = ty + 1 === w.skyline[tx] ? snowCover : 0;
        if (under > 0.6) continue;
        const src = iconSrc(decorIcon(dc));
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        const ceil = w.rock(tx, ty - 1) && !w.rock(tx, ty + 1);
        const dx = sx + (TILE - src.size) / 2;
        const dy = ceil ? sy : sy + TILE - src.size + 1;
        // plants sway a little
        const sway = !ceil && ty < w.surface[tx] + 2 ? Math.round(Math.sin(g.time * 1.6 + tx) * 0.8) : 0;
        ctx.drawImage(src.img, src.sx, src.sy, src.size, src.size, Math.round(dx + sway), Math.round(dy), src.size, src.size);
      }
    }
  }

  // ------------------------------------------------------------------ objects
  private drawObjects(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 2);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE) + 1);
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE) + 2);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const o = w.obj[ty * w.w + tx];
        if (!o || o === Obj.TREE) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        this.drawObj(g, ctx, o, sx, sy, tx, 1, ty);
      }
    }
    // rock coming down
    for (const r of g.rocks) ctx.drawImage(A.blockIcon[r.b], Math.round(r.x - TILE / 2 - camX), Math.round(r.y - camY));
  }

  private drawObj(g: Game, ctx: CanvasRenderingContext2D, o: number, sx: number, sy: number, tx: number, alpha: number, ty = -1): void {
    ctx.globalAlpha = alpha;
    const fd = FURN.get(o);
    if (fd) {
      // furniture: stood on the floor, hung on the wall, or hung from the ceiling
      const pad = A.furnPad[fd.cell];
      const dy = fd.mount === 'floor' ? sy + pad.bottom + 1 : fd.mount === 'ceiling' ? sy - pad.top : sy;
      ctx.drawImage(A.camp.furniture, fd.cell * 32, 0, 32, 32, Math.round(sx), Math.round(dy), 32, 32);
      // the fire in the hearth and the stove
      if ((o === Obj.HEARTH || o === Obj.STOVE) && alpha >= 1) {
        const f = Math.floor(g.time * 10 + tx * 3) % 3;
        ctx.fillStyle = ['#ffd75a', '#ffb02a', '#fff0a0'][f];
        const fx = Math.round(sx) + (o === Obj.HEARTH ? 15 : 15);
        const fy = Math.round(dy) + (o === Obj.HEARTH ? 20 : 22);
        ctx.fillRect(fx + (f === 1 ? -1 : 0), fy, 2, 2);
      }
      ctx.globalAlpha = 1;
      return;
    }
    const icon = OBJ_ICON[o as Obj];
    if (icon) {
      const s = iconSrc(icon);
      ctx.drawImage(s.img, s.sx, s.sy, 32, 32, sx, sy + 1, 32, 32);
    } else
      switch (o) {
        case Obj.LADDER:
          drawLadder(ctx, sx, sy);
          break;
        case Obj.BEAM:
          drawBeam(ctx, sx, sy, g.world, tx, ty);
          break;
        case Obj.MINECART: {
          const c = A.camp.minecart;
          ctx.drawImage(c, Math.round(sx + 16 - c.width / 2), sy + TILE - c.height - 3);
          break;
        }
        case Obj.LAMP:
          drawLampAt(ctx, sx, sy, Math.floor(g.time * 9 + tx * 3) % 3);
          break;
        case Obj.WICKPOST: {
          const img = A.camp.wickpost;
          const top = sy + TILE - img.height + (A.padBottom.wickpost ?? 0) + 1;
          ctx.drawImage(img, sx, top);
          // the flame in the little lantern
          const f = Math.floor(g.time * 10 + tx * 3) % 3;
          ctx.fillStyle = ['#ffd75a', '#ffb02a', '#fff0a0'][f];
          ctx.fillRect(sx + 22, top + 34 + (f === 1 ? 1 : 0), 3, 4);
          ctx.fillStyle = '#fff6d0';
          ctx.fillRect(sx + 23, top + 36, 1, 2);
          break;
        }
        case Obj.TORCH: {
          const s = iconSrc({ sheet: 'i16', idx: 21 });
          ctx.drawImage(s.img, s.sx, s.sy, 16, 16, sx + 8, sy + 10, 16, 16);
          const f = Math.floor(g.time * 12 + tx * 3) % 3;
          ctx.fillStyle = ['#ffd75a', '#ffb02a', '#fff0a0'][f];
          ctx.fillRect(sx + 15 + (f === 1 ? -1 : 0), sy + 7, 3, 3);
          break;
        }
        case Obj.BED:
          ctx.drawImage(A.camp.bed, sx, sy + TILE - A.camp.bed.height + 1);
          break;
        case Obj.DOOR_TOP:
          drawDoor(ctx, sx, sy, false);
          break;
        case Obj.DOOR_OPEN_TOP:
          drawDoor(ctx, sx, sy, true);
          break;
        case Obj.HEART_CRYSTAL: {
          const s = iconSrc({ sheet: 'n32', idx: 43 });
          const bob = Math.round(Math.sin(g.time * 2.5 + tx) * 2) - 3;
          ctx.drawImage(s.img, s.sx, s.sy, 32, 32, sx, sy + bob, 32, 32);
          break;
        }
        case Obj.CROP0:
        case Obj.CROP1:
        case Obj.CROP2:
        case Obj.CROP3:
          drawCrop(ctx, sx, sy, o - Obj.CROP0, g.time, tx);
          break;
      }
    ctx.globalAlpha = 1;
  }

  /** translucent preview of what the held item would place */
  private drawGhost(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (g.ui.isOpen() || g.player.dead) return;
    const hd = heldDef(g.p);
    const h = g.hoverTile;
    if (!hd || !h.inReach) return;
    const w = g.world;
    if (w.rock(h.x, h.y) || w.getObj(h.x, h.y)) return;
    const sx = h.x * TILE - camX;
    const sy = h.y * TILE - camY;
    if (hd.kind === 'block' && hd.block !== undefined) {
      const touching = w.getWall(h.x, h.y) || w.rock(h.x - 1, h.y) || w.rock(h.x + 1, h.y) || w.rock(h.x, h.y - 1) || w.rock(h.x, h.y + 1);
      if (!touching) return;
      ctx.globalAlpha = 0.45;
      ctx.drawImage(A.blockIcon[hd.block], sx, sy);
      ctx.globalAlpha = 1;
    } else if (hd.kind === 'wall' && hd.wall !== undefined && !w.getWall(h.x, h.y)) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(A.blockIcon[hd.wall], sx, sy);
      ctx.globalAlpha = 1;
    } else if (hd.kind === 'place' && hd.obj !== undefined) {
      if (hd.obj === Obj.DOOR) this.drawObj(g, ctx, Obj.DOOR_TOP, sx, sy - TILE, h.x, 0.45);
      else this.drawObj(g, ctx, hd.obj, sx, sy, h.x, 0.45, h.y);
    }
  }

  // ------------------------------------------------------------------ entities
  private drawEntities(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const sat = g.p.satchel;
    if (sat) {
      const s = iconSrc({ sheet: 'i32', idx: 61 });
      ctx.drawImage(s.img, s.sx, s.sy, 32, 32, Math.round(sat.x - 16 - camX), Math.round(sat.y - 16 - camY + Math.sin(g.time * 3) * 2), 32, 32);
    }
    for (const d of g.drops) {
      const def = ITEMS[d.item];
      const ref: IconRef = d.item === 'coin' ? { sheet: 'i16', idx: 27 } : def?.icon ?? { sheet: 'i16', idx: 34 };
      const s = iconSrc(ref);
      const bob = d.onGround ? Math.round(Math.sin(g.time * 4 + d.bob) * 1.5) - 2 : 0;
      ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, Math.round(d.x - 2 - camX), Math.round(d.y - 4 - camY + bob), 16, 16);
    }
    for (const b of g.bombs) {
      const s = iconSrc({ sheet: 'i16', idx: 23 });
      ctx.drawImage(s.img, s.sx, s.sy, 16, 16, Math.round(b.x - 2 - camX), Math.round(b.y - 4 - camY), 16, 16);
    }
    // arrows
    for (const s of g.shots) {
      if (!s.arrow) continue;
      const a = Math.atan2(s.vy, s.vx);
      ctx.save();
      ctx.translate(Math.round(s.x - camX), Math.round(s.y - camY));
      ctx.rotate(a);
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(-10, -1, 14, 2);
      ctx.fillStyle = s.color;
      ctx.fillRect(4, -1, 4, 2);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-12, -2, 3, 1);
      ctx.fillRect(-12, 1, 3, 1);
      ctx.restore();
    }
    for (const e of g.enemies) {
      if (e.def.shade) continue;
      const img = A.enemies[e.def.id];
      const fs = e.def.size;
      const frames = Math.floor(img.width / fs);
      const moving = Math.abs(e.vx) > 8 || !e.onGround || e.def.behavior === 'flyer';
      let f = moving || e.def.behavior !== 'critter' ? 1 + (Math.floor(e.animT * e.def.fps) % (frames - 1)) : 0;
      let jx = 0;
      if (e.def.behavior === 'still') {
        if (e.mode === 0) {
          // caught in the light: it flinches, arm over its eyes, and trembles where it stands
          f = 0;
          jx = e.stateT < 0.3 ? Math.round(Math.sin(g.time * 70) * 1.5) : Math.random() < 0.06 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        } else if (Math.abs(e.vx) < 10 && e.onGround) f = 1;
      }
      const grounded = e.def.behavior !== 'flyer' && e.def.behavior !== 'shooter' && e.def.behavior !== 'phaser';
      const x = Math.round(e.cx - fs / 2 - camX) + jx;
      const y = grounded ? Math.round(e.y + e.h - fs + 2 - camY) : Math.round(e.y + e.h - fs + (fs - e.h) * 0.25 - camY);
      const flip = e.def.facesRight ? e.facing < 0 : e.facing > 0;
      ctx.save();
      if (e.def.behavior === 'phaser') ctx.globalAlpha = 0.85;
      if (e.flash > 0) ctx.filter = 'brightness(4)';
      if (flip) {
        ctx.translate(x + fs, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, f * fs, 0, fs, fs, 0, 0, fs, fs);
      } else ctx.drawImage(img, f * fs, 0, fs, fs, x, y, fs, fs);
      ctx.restore();
    }
    if (g.boss) this.drawHeart(g, ctx, camX, camY);
    this.drawHook(g, ctx, camX, camY);
    this.drawPlayer(g, ctx, camX, camY);
    for (const q of g.parts) {
      if (q.glow) continue;
      ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  /** the grappling hook's rope and claw */
  private drawHook(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const h = g.hook;
    if (!h) return;
    const pl = g.player;
    const x0 = pl.cx + pl.facing * 6 - camX;
    const y0 = pl.y + 16 - camY;
    const x1 = h.x - camX;
    const y1 = h.y - camY;
    const d = Math.hypot(x1 - x0, y1 - y0);
    // slack while it flies or reels in, taut once it has bitten
    const sag = h.stuck ? 0 : Math.min(22, d * 0.1);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 + sag;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a170a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = '#b48a56';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    // three iron prongs pointing the way it was thrown
    const a = h.back ? Math.atan2(y0 - y1, x0 - x1) + Math.PI : Math.atan2(h.vy, h.vx);
    ctx.translate(Math.round(x1), Math.round(y1));
    ctx.rotate(a);
    ctx.fillStyle = '#3a3a48';
    ctx.fillRect(-7, -2, 9, 4);
    ctx.fillStyle = '#a8a8bc';
    ctx.fillRect(-6, -1, 8, 2);
    ctx.fillStyle = '#d8d8e8';
    ctx.fillRect(1, -5, 2, 10);
    ctx.fillRect(3, -6, 2, 2);
    ctx.fillRect(3, 4, 2, 2);
    ctx.fillRect(2, -1, 4, 2);
    ctx.restore();
  }

  private drawPlayer(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const pl = g.player;
    if (pl.invuln > 0 && Math.floor(pl.invuln * 14) % 2 === 0 && !pl.dead) return;
    let row: number = ROW[pl.anim];
    let frame = 0;
    switch (pl.anim) {
      case 'idle':
        frame = IDLE_FRAMES[Math.floor(pl.animT * 4) % IDLE_FRAMES.length];
        break;
      case 'walk':
        frame = 1 + (Math.floor(pl.animT * 12) % 8);
        break;
      case 'jump':
        frame = pl.vy < -250 ? 3 : pl.vy < 0 ? 4 : pl.vy < 250 ? 5 : 6;
        break;
      case 'mine':
        frame = Math.min(8, Math.floor(pl.swingT * 9));
        break;
      case 'climb':
        frame = 1 + (Math.floor(pl.animT * 10) % 8);
        break;
      default:
        break;
    }
    if (pl.dead) {
      row = ROW.hurt;
      frame = Math.min(4, 2 + Math.floor(pl.deadT * 4));
    } else if (pl.hurtT > 0.12 && !pl.swinging) {
      row = ROW.hurt;
      frame = 3;
    }
    const footY = Math.round(pl.y + pl.h - camY);
    const cx = Math.round(pl.cx - camX);
    const flip = pl.facing < 0 && pl.anim !== 'climb';
    // the miner's hands are empty: a tool only comes out for the swing that uses it
    const swingDef = !pl.dead && row === ROW.mine && pl.swingTool ? ITEMS[pl.swingTool] : undefined;
    const pose = swingDef ? this.swingPose(pl.swingT) : null;
    // on the wind-up the tool is over the shoulder, behind the miner
    if (swingDef && pose && pose.a < -1.3) this.drawSwingTool(ctx, swingDef, pose, cx, footY, pl.facing);
    if (g.canary.mood !== 'none' && !pl.dead) this.drawCage(g, ctx, cx, footY, pl.facing);
    ctx.save();
    if (pl.dead) ctx.globalAlpha = Math.max(0, 1 - pl.deadT * 0.3);
    if (flip) {
      ctx.translate(cx + 33, footY - 57);
      ctx.scale(-1, 1);
      ctx.drawImage(A.miner, frame * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
    } else ctx.drawImage(A.miner, frame * CELL, row * CELL, CELL, CELL, cx - 33, footY - 57, CELL, CELL);
    ctx.restore();
    if (swingDef && pose && pose.a >= -1.3) this.drawSwingTool(ctx, swingDef, pose, cx, footY, pl.facing);
    if (pl.dead || pl.climbing) return;
    // held items that stay visible: the torch you carry, the rod you fish with, the bow you draw
    const hd = heldDef(g.p);
    if (!hd) return;
    if (hd.kind === 'rod' && !pl.swinging) {
      const s = iconSrc(hd.icon);
      const tip = g.rodTip();
      // the icon runs from the handle (bottom left) to the tip (top right)
      ctx.save();
      ctx.translate(Math.round(tip.x - camX), Math.round(tip.y - camY));
      if (pl.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, -25, -2, 28, 28);
      ctx.restore();
    } else if (hd.id === 'torch' && !pl.swinging) {
      const s = iconSrc(hd.icon);
      const hx = cx + pl.facing * 9 - 8;
      const hy = footY - 30;
      ctx.drawImage(s.img, s.sx, s.sy, 16, 16, hx, hy, 16, 16);
      const f = Math.floor(g.time * 12) % 3;
      ctx.fillStyle = ['#ffd75a', '#ffb02a', '#fff0a0'][f];
      ctx.fillRect(hx + 7 + (f === 1 ? -1 : 0), hy - 2, 3, 3);
    } else if (hd.kind === 'bow' && pl.swinging) {
      const s = iconSrc(hd.icon);
      ctx.save();
      ctx.translate(cx + pl.facing * 12, footY - 26);
      if (pl.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, -10, -12, 24, 24);
      ctx.restore();
    }
  }

  /** the tool's grip and angle at a point in the swing, eased between the drawn frames */
  private swingPose(swingT: number): { x: number; y: number; a: number; f: number } {
    const f = Math.max(0, Math.min(8, swingT * 9));
    const i = Math.min(7, Math.floor(f));
    const k = f - i;
    const p0 = SWING_POSE[i];
    const p1 = SWING_POSE[i + 1];
    return { x: p0[0] + (p1[0] - p0[0]) * k, y: p0[1] + (p1[1] - p0[1]) * k, a: p0[2] + (p1[2] - p0[2]) * k, f };
  }

  private drawSwingTool(
    ctx: CanvasRenderingContext2D,
    def: { icon: IconRef; glow?: string },
    pose: { x: number; y: number; a: number; f: number },
    cx: number,
    footY: number,
    facing: number,
  ): void {
    const s = iconSrc(def.icon);
    const k = TOOL_SIZE / 32;
    ctx.save();
    ctx.translate(cx, footY);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.translate(Math.round(pose.x - 33), Math.round(pose.y - 57));
    // the strike leaves a smear along the head's path
    if (pose.f > 2.3 && pose.f < 4.8) {
      const back = this.swingPose(Math.max(0, pose.f - 1.1) / 9).a;
      const fade = 1 - Math.abs(pose.f - 3.4) / 1.5;
      ctx.globalAlpha = Math.max(0, fade) * 0.45;
      ctx.strokeStyle = def.glow ?? '#f4f0e6';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // the head sits about 22px from the grip on a 32px icon
      ctx.arc(0, 0, 22 * k, back, pose.a, false);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // icons point their handle at -45 degrees; turn it to the pose's angle about the grip
    ctx.rotate(pose.a + Math.PI / 4);
    ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, -TOOL_GRIP[0] * k, -TOOL_GRIP[1] * k, TOOL_SIZE, TOOL_SIZE);
    ctx.restore();
  }

  // ------------------------------------------------------------------ ambient motes, drips, fireflies
  private updateAmbient(g: Game, dt: number, camX: number, camY: number, vw: number, vh: number): void {
    const w = g.world;
    const pt = g.playerTile();
    const surf = w.surface[Math.max(0, Math.min(w.w - 1, pt.x))];
    const under = pt.y > surf + 2;
    const bi = under ? biomeIndexRow(pt.y) : -1;
    const want = under ? 46 : isNight(g.p.clock) ? 26 : 10;
    let tries = 0;
    while (this.amb.length < want && tries++ < 6) {
      const x = camX + Math.random() * vw;
      const y = camY + Math.random() * vh;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (!w.inside(tx, ty) || w.rock(tx, ty)) continue;
      if (under && !w.explored[ty * w.w + tx]) continue;
      let color = 'rgba(255,240,210,';
      let vx = (Math.random() - 0.5) * 6;
      let vy = (Math.random() - 0.5) * 6;
      let size = 1;
      if (!under) {
        if (isNight(g.p.clock)) {
          color = 'rgba(200,255,120,';
          size = 2;
        } else {
          color = 'rgba(255,255,230,';
        }
      } else if (bi === 1) {
        color = 'rgba(120,255,210,';
        vy = -4 - Math.random() * 6;
        size = Math.random() < 0.3 ? 2 : 1;
      } else if (bi === 2) color = Math.random() < 0.5 ? 'rgba(220,180,255,' : 'rgba(200,240,255,';
      else if (bi === 3) {
        color = 'rgba(255,150,60,';
        vy = -14 - Math.random() * 20;
        vx = (Math.random() - 0.5) * 14;
      } else if (bi >= 4) color = 'rgba(170,130,255,';
      const life = 2 + Math.random() * 3;
      this.amb.push({ x, y, vx, vy, life, max: life, color, size, grav: 0, drip: false });
    }
    // drips from damp ceilings (weeping rock, with water close behind it, drips most)
    if (under && Math.random() < dt * 6) {
      const tx = Math.floor((camX + Math.random() * vw) / TILE);
      for (let ty = Math.floor(camY / TILE); ty < Math.floor((camY + vh) / TILE); ty++) {
        if (!w.rock(tx, ty) || w.rock(tx, ty + 1) || !w.explored[(ty + 1) * w.w + tx] || w.get(tx, ty + 1) === B.WATER) continue;
        const chance = dampAt(w, tx, ty) ? 0.6 : bi <= 1 ? 0.08 : 0;
        if (Math.random() < chance) {
          this.amb.push({ x: tx * TILE + 6 + Math.random() * 20, y: (ty + 1) * TILE, vx: 0, vy: 0, life: 3, max: 3, color: 'rgba(170,210,255,', size: 1, grav: 500, drip: true });
          break;
        }
      }
    }
    for (const a of this.amb) {
      a.life -= dt;
      a.vy += a.grav * dt;
      a.x += a.vx * dt + (a.drip ? 0 : Math.sin(g.time + a.max * 10) * dt * 3);
      a.y += a.vy * dt;
      if (a.drip && w.solidAtPx(a.x, a.y)) {
        a.life = 0;
        g.parts.push({ x: a.x, y: a.y - 2, vx: -30, vy: -40, life: 0.3, max: 0.3, color: '#9ac8ff', size: 1, grav: 400, glow: false });
        g.parts.push({ x: a.x, y: a.y - 2, vx: 30, vy: -40, life: 0.3, max: 0.3, color: '#9ac8ff', size: 1, grav: 400, glow: false });
      }
    }
    this.amb = this.amb.filter((a) => a.life > 0 && a.x > camX - 40 && a.x < camX + vw + 40 && a.y > camY - 40 && a.y < camY + vh + 40);
  }

  // ------------------------------------------------------------------ sky lanterns (after lighting: they are their own light)
  private drawLanterns(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const sky = g.lanterns.sky;
    if (!sky.length) return;
    const s = iconSrc(ITEMS.skylantern.icon);
    for (const l of sky) {
      const x = l.x - camX;
      const y = l.y - camY;
      if (x < -30 || y < -30 || x > vw + 30 || y > vh + 30) continue;
      const fade = Math.min(1, l.t * 2, (l.far ? 110 : 95) - l.t);
      const flick = 1 + Math.sin(g.time * 11 + l.seed) * 0.08;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      if (l.far) {
        this.glowAt(ctx, x, y, 7 * flick, 'rgba(255,170,80,0.45)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffd08a';
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 3);
      } else {
        this.glowAt(ctx, x, y + 2, 22 * flick, 'rgba(255,150,60,0.42)');
        ctx.globalCompositeOperation = 'source-over';
        const sw = Math.sin(l.t * 0.9 + l.seed) * 0.08;
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(sw);
        ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, -10, -12, 20, 20);
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ glows (after lighting)
  private drawGlows(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of g.burning) {
      const k = Math.min(1, b.t * 3);
      const sx = b.x * TILE - camX;
      const sy = b.y * TILE - camY;
      if (sx < -40 || sy < -40 || sx > vw + 40 || sy > vh + 40) continue;
      this.glowAt(ctx, sx + 16, sy + 16, (20 + Math.random() * 8) * k, 'rgba(255,150,50,0.75)');
      // a few licks of flame, pixel by pixel: a wide orange foot, a yellow body, a pale tip
      const seed = (b.x * 7 + b.y * 13) % 5;
      for (let f = 0; f < 3; f++) {
        const fx = Math.round(sx + 5 + ((seed + f * 9) % 20) + (Math.random() - 0.5) * 3);
        const h = Math.max(2, Math.round((6 + Math.random() * 10) * k));
        const fy = Math.round(sy + 26 - ((seed * 3 + f * 5) % 10));
        ctx.fillStyle = `rgba(255,90,30,${(0.55 * k).toFixed(2)})`;
        ctx.fillRect(fx - 2, fy - 3, 5, 3);
        ctx.fillStyle = `rgba(255,170,50,${(0.7 * k).toFixed(2)})`;
        ctx.fillRect(fx - 1, fy - Math.ceil(h * 0.7), 3, Math.ceil(h * 0.7));
        ctx.fillStyle = `rgba(255,240,170,${(0.8 * k).toFixed(2)})`;
        ctx.fillRect(fx, fy - h, 1, Math.ceil(h * 0.45));
      }
    }
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE) + 1);
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE) + 1);
    const wet = g.weather.rain;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * w.w + tx;
        const o = w.obj[i];
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        const sp = wet > 0 && (o === Obj.TORCH || o === Obj.CAMPFIRE) && ty < w.skyline[tx] ? sputter(wet, g.time, tx) : 1;
        if (sp < 1 && Math.random() < 0.06 * wet)
          g.parts.push({ x: sx + camX + 12 + Math.random() * 8, y: sy + camY + (o === Obj.TORCH ? 4 : 14), vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 14, life: 0.9, max: 0.9, color: '#b8bcc8', size: 2, grav: 0, glow: false });
        if (o === Obj.TORCH) this.glowAt(ctx, sx + 16, sy + 9, 26 * sp * (0.85 + Math.sin(g.time * 10 + tx) * 0.1), 'rgba(255,170,60,0.55)');
        else if (o === Obj.LAMP) this.glowAt(ctx, sx + 16, sy + 17, 30 * (0.9 + Math.sin(g.time * 6 + tx) * 0.05), 'rgba(255,190,90,0.5)');
        else if (o === Obj.CAMPFIRE) {
          this.glowAt(ctx, sx + 16, sy + 20, (40 + Math.sin(g.time * 9 + tx) * 4) * sp, 'rgba(255,140,40,0.55)');
          if (Math.random() < 0.3 * sp) g.parts.push({ x: sx + camX + 10 + Math.random() * 12, y: sy + camY + 14, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 0.8, max: 0.8, color: Math.random() < 0.5 ? '#ffb040' : '#ff6a20', size: 1, grav: 0, glow: true });
        } else if (o === Obj.HEARTH || o === Obj.STOVE) {
          this.glowAt(ctx, sx + 16, sy + 22, 34 + Math.sin(g.time * 9 + tx) * 3, 'rgba(255,140,40,0.5)');
          if (Math.random() < 0.08) g.parts.push({ x: sx + camX + 13 + Math.random() * 6, y: sy + camY + 20, vx: (Math.random() - 0.5) * 8, vy: -24 - Math.random() * 20, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#ffb040' : '#ff6a20', size: 1, grav: 0, glow: true });
        } else if (o === Obj.FURNACE) this.glowAt(ctx, sx + 16, sy + 24, 22 + Math.sin(g.time * 7 + tx) * 2, 'rgba(255,120,30,0.45)');
        else if (o === Obj.WICKPOST) {
          const top = sy + TILE - A.camp.wickpost.height + (A.padBottom.wickpost ?? 0) + 1;
          this.glowAt(ctx, sx + 23, top + 36, 26 + Math.sin(g.time * 6 + tx) * 2, 'rgba(255,205,120,0.55)');
        }
        else if (o === Obj.HEART_CRYSTAL) this.glowAt(ctx, sx + 16, sy + 14, 22 + Math.sin(g.time * 3) * 3, 'rgba(255,90,160,0.5)');
        const fg = w.fg[i];
        if (fg === B.LUMENITE || fg === B.DIAMOND || fg === B.AMETHYST || fg === B.RUBY || fg === B.JADE || fg === B.RELIC_STONE || fg === B.GOLD || fg === B.SILVER) {
          const tw = Math.sin(g.time * 3 + tx * 1.7 + ty * 2.3);
          if (tw > 0.85 && g.light.at(tx, ty) > 0.05) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            const px = sx + ((tx * 13 + ty * 7) % 24) + 4;
            const py = sy + ((tx * 5 + ty * 11) % 24) + 4;
            ctx.fillRect(px, py - 2, 1, 5);
            ctx.fillRect(px - 2, py, 5, 1);
          }
        }
        if (fg === B.LAVA && w.get(tx, ty - 1) !== B.LAVA) this.glowAt(ctx, sx + 16, sy + 8, 30, 'rgba(255,110,20,0.35)');
      }
    }
    // the Wick: a warm heart that swells with every level, shedding embers
    const lvl = g.flame;
    if (lvl > 0) {
      const gx = WICK_GLOW.x * TILE - camX;
      const gy = WICK_GLOW.y * TILE - camY;
      const tide = g.p.tide;
      const gut = tide ? 0.5 + 0.5 * (tide.ward / 100) : 1;
      const pulse = Math.sin(g.time * 2.2) * 3 + Math.sin(g.time * 9.3) * 1.5 + (tide ? Math.sin(g.time * 17) * 4 : 0);
      if (tide) this.glowAt(ctx, gx, gy, 46 + pulse, 'rgba(150,70,220,0.3)');
      this.glowAt(ctx, gx, gy, (34 + lvl * 7) * gut + pulse, 'rgba(255,190,90,0.55)');
      this.glowAt(ctx, gx, gy, 16 + lvl * 2 + pulse * 0.5, 'rgba(255,240,190,0.7)');
      if (lvl >= MAX_FLAME || g.dawnLit) this.glowAt(ctx, gx, gy, 90 + pulse * 2, 'rgba(255,220,140,0.18)');
      if (g.dawnLit) {
        this.glowAt(ctx, gx, gy, 140 + pulse * 3, 'rgba(255,240,200,0.12)');
        this.glowAt(ctx, gx, gy, 24 + pulse * 0.6, 'rgba(255,255,240,0.6)');
      }
      // after dark, a warm pool on the ground marks how far the flame keeps you safe
      const dark = 1 - daylight(g.p.clock);
      if (dark > 0.2) {
        const R = g.wickRadius() * TILE;
        const pool = this.tinted(`rgba(255,170,80,${(0.1 + 0.16 * dark).toFixed(2)})`);
        ctx.drawImage(pool, Math.round(gx - R), Math.round(WICK_Y * TILE - camY - R * 0.55), Math.round(R * 2), Math.round(R * 1.1));
      }
      if (Math.random() < 0.15 + lvl * 0.08)
        g.parts.push({ x: WICK_GLOW.x * TILE + (Math.random() - 0.5) * 18, y: (WICK_GLOW.y - 1.3) * TILE, vx: (Math.random() - 0.5) * 16, vy: -35 - Math.random() * 40, life: 1.4, max: 1.4, color: Math.random() < 0.5 ? '#ffd070' : '#ff9a3a', size: 1, grav: -4, glow: true });
    }
    if (g.flare) this.drawFlare(g, ctx, camX, camY);
    // building windows glow at night
    if (daylight(g.p.clock) < 0.6) {
      for (const b of g.p.buildings) this.glowAt(ctx, b.x * TILE - camX, b.y * TILE - camY - 40, 46, 'rgba(255,190,90,0.3)');
    }
    const pl = g.player;
    const hd = heldDef(g.p);
    if (!pl.dead && hd?.id === 'torch' && !pl.climbing) this.glowAt(ctx, pl.cx + pl.facing * 9 - camX, pl.y + pl.h - 32 - camY, 22, 'rgba(255,170,60,0.5)');
    if (!pl.dead && g.st.oilMax > 0 && pl.oil > 0) this.glowAt(ctx, pl.cx + pl.facing * 6 - camX, pl.y + 8 - camY, 14, 'rgba(140,220,255,0.5)');
    for (const d of g.drops) {
      const gl = ITEMS[d.item]?.glow ?? (d.item.startsWith('r_') ? '#ffd75a' : null);
      if (gl) this.glowAt(ctx, d.x + 6 - camX, d.y + 4 - camY, 14 + Math.sin(g.time * 5 + d.bob) * 3, hexA(gl, 0.6));
    }
    for (const s of g.shots) {
      if (s.arrow) continue;
      this.glowAt(ctx, s.x - camX, s.y - camY, s.r * 3.5, hexA(s.color, 0.8));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(s.x - camX - 1), Math.round(s.y - camY - 1), 3, 3);
    }
    for (const e of g.enemies) {
      if (e.def.glow) this.glowAt(ctx, e.cx - camX, e.cy - camY, 18, `rgba(${e.def.glow.map((v) => Math.round(v * 400)).join(',')},0.35)`);
      if (e.def.id === 'hollow') {
        const ex = e.cx + (e.facing > 0 ? 6 : -6) - camX;
        this.glowAt(ctx, ex, e.y + 10 - camY, 6, 'rgba(255,60,220,0.8)');
      }
    }
    if (g.boss) this.drawHeartGlow(g, ctx, camX, camY);
    if (g.ending) this.drawEnding(g, ctx, camX, camY);
    const sat = g.p.satchel;
    if (sat) this.glowAt(ctx, sat.x - camX, sat.y - camY, 24, 'rgba(120,255,140,0.45)');
    for (const q of g.parts) {
      if (!q.glow) continue;
      ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), q.size, q.size);
    }
    for (const a of this.amb) {
      // dust is only seen where there is light to see it by
      const lit = Math.min(1, g.light.at(Math.floor(a.x / TILE), Math.floor(a.y / TILE)) * 2.2);
      if (lit < 0.05) continue;
      const k = Math.min(1, a.life / 0.6, (a.max - a.life) / 0.6) * lit;
      ctx.globalAlpha = 1;
      ctx.fillStyle = a.color + (a.drip ? 0.7 * lit : 0.55 * k) + ')';
      ctx.fillRect(Math.round(a.x - camX), Math.round(a.y - camY), a.size, a.drip ? 3 : a.size);
    }
    ctx.restore();
  }

  /** the Wick flaring up: a ring of light racing out over the meadow, slow rays and a bloom at the glass */
  private drawFlare(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const f = g.flare;
    if (!f) return;
    const t = f.t;
    const gx = WICK_GLOW.x * TILE - camX;
    const gy = WICK_GLOW.y * TILE - camY;
    const big = f.level === 1 || g.dawnLit ? 1.25 : 1;
    // rays turning slowly about the glass
    const ra = (t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 2.8)) * big;
    if (ra > 0) {
      ctx.fillStyle = '#ffe3a0';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.22 + (i % 2) * 0.12;
        const len = (150 + (i % 3) * 60) * (0.6 + 0.4 * Math.min(1, t / 0.6)) * big;
        const w = 0.05 + (i % 2) * 0.03;
        ctx.globalAlpha = ra * (i % 2 ? 0.1 : 0.16);
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(a - w) * len, gy + Math.sin(a - w) * len);
        ctx.lineTo(gx + Math.cos(a + w) * len, gy + Math.sin(a + w) * len);
        ctx.closePath();
        ctx.fill();
      }
    }
    // two rings racing out to the new edge of the light
    const reach = g.wickRadius() * TILE * 1.1;
    for (const lag of [0, 0.22]) {
      const k = (t - lag) / 1.5;
      if (k <= 0 || k >= 1) continue;
      const e = 1 - Math.pow(1 - k, 3);
      ctx.globalAlpha = (1 - k) * (lag ? 0.45 : 0.8);
      ctx.strokeStyle = lag ? '#ffb850' : '#fff0c0';
      ctx.lineWidth = Math.max(1, (lag ? 3 : 5) * (1 - k) + 1);
      ctx.beginPath();
      ctx.ellipse(gx, gy + 40 * e, 30 + e * reach, (30 + e * reach) * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // a bloom at the glass that blooms and settles
    const b = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 1.8);
    if (b > 0) {
      ctx.globalAlpha = b;
      this.glowAt(ctx, gx, gy, (70 + 90 * Math.min(1, t / 0.5)) * big, 'rgba(255,225,160,0.85)');
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The ending: the Gloamheart's light gathering, then climbing up through the mountain as a
   * bright mote with a long wake, and every placed light it passes flaring.
   */
  private drawEnding(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const en = g.ending;
    if (!en) return;
    const t = g.time;
    for (const f of g.flaring) {
      const fx = (f.x + 0.5) * TILE - camX;
      const fy = (f.y + 0.35) * TILE - camY;
      this.glowAt(ctx, fx, fy, 16 + 34 * f.k + Math.sin(t * 12 + f.x) * 2, `rgba(255,200,110,${(0.2 + 0.5 * f.k).toFixed(2)})`);
      if (f.k > 0.6) this.glowAt(ctx, fx, fy, 8 + 10 * f.k, 'rgba(255,250,220,0.7)');
    }
    const x = en.x - camX;
    const y = en.y - camY;
    if (en.stage === 'pour') {
      // its light gathering into one bright point
      const k = Math.min(1, en.t / POUR);
      this.glowAt(ctx, x, y, 30 + 110 * k * k, `rgba(255,236,190,${(0.25 + 0.5 * k).toFixed(2)})`);
      this.glowAt(ctx, x, y, 10 + 26 * k, 'rgba(255,255,245,0.85)');
      return;
    }
    if (en.stage !== 'climb') return;
    // the wake: a column of light falling away below it
    const len = 520;
    for (let i = 0; i < 26; i++) {
      const u = i / 26;
      const a = (1 - u) * (1 - u);
      const wd = Math.round(18 * (1 - u * 0.7));
      ctx.fillStyle = `rgba(255,226,150,${(0.22 * a).toFixed(3)})`;
      ctx.fillRect(Math.round(x - wd / 2), Math.round(y + u * len), wd, Math.ceil(len / 26) + 1);
      ctx.fillStyle = `rgba(255,252,230,${(0.35 * a).toFixed(3)})`;
      ctx.fillRect(Math.round(x - 2), Math.round(y + u * len), 4, Math.ceil(len / 26) + 1);
    }
    // the mote itself
    const pulse = Math.sin(t * 14) * 4;
    this.glowAt(ctx, x, y, 120 + pulse * 2, 'rgba(255,214,140,0.35)');
    this.glowAt(ctx, x, y, 48 + pulse, 'rgba(255,240,200,0.8)');
    this.glowAt(ctx, x, y, 16, 'rgba(255,255,255,0.95)');
  }

  /** Gloamlings: living shadow with a violet rim, and eyes that open before the body has formed */
  /**
   * The Gloamheart: black roots from the chamber roof, the heart itself (beating), its shroud of
   * living dark, the reaching tendrils, and the old sconces round the walls.
   */
  private drawHeart(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const b = g.boss;
    if (!b) return;
    const t = g.time;
    // the sconces
    const sc = A.camp.sconce;
    for (const s of b.sconces) {
      const sx = Math.round((s.tx + 0.5) * TILE - 24 - camX);
      const sy = Math.round((s.ty + 1) * TILE - 44 - camY);
      ctx.drawImage(sc, sx, sy);
    }
    const fade = b.intro > 0 ? 1 - b.intro / 2.2 : b.dead ? Math.max(0, 1 - b.deathT / 3.2) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    // the roots it hangs by, swaying, pixel by pixel down from the roof
    const roof = (BOSS_CENTER.y - 9) * TILE;
    ctx.fillStyle = '#0b0712';
    for (let k = 0; k < 6; k++) {
      const x0 = b.x + (k - 2.5) * 26 + Math.sin(t * 0.5 + k * 1.7) * 6;
      const x1 = b.x + (k - 2.5) * 9;
      const y1 = b.y - b.r * 0.7;
      const mx = (x0 + x1) / 2 + Math.sin(t * 0.8 + k) * 16;
      const my = (roof + y1) / 2;
      const steps = Math.max(8, Math.ceil((y1 - roof) / 3));
      const w = k === 2 || k === 3 ? 4 : 3;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const px = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1;
        const py = (1 - u) * (1 - u) * roof + 2 * (1 - u) * u * my + u * u * y1;
        ctx.fillRect(Math.round(px - camX - w / 2), Math.round(py - camY), w, 4);
      }
    }
    // reaching tendrils: a pool of dark gathers on the floor, then the strike comes down
    for (const td of b.tendrils) {
      const fx = td.x - camX;
      const fy = td.y - camY;
      if (td.t < 0.9) {
        const k = Math.max(0, td.t) / 0.9;
        const half = Math.round(6 + k * 22);
        ctx.fillStyle = `rgba(20,6,34,${(0.35 + k * 0.45).toFixed(2)})`;
        ctx.fillRect(Math.round(fx - half), Math.round(fy - 2), half * 2, 3);
        ctx.fillRect(Math.round(fx - half * 0.6), Math.round(fy - 4), Math.round(half * 1.2), 2);
        if (Math.floor(t * 14) % 2 && k > 0.5) {
          ctx.fillStyle = 'rgba(170,110,255,0.7)';
          ctx.fillRect(Math.round(fx - half), Math.round(fy - 1), half * 2, 1);
        }
      } else {
        const k = 1 - (td.t - 0.9) / 0.4;
        const sx0 = b.x;
        const sy0 = b.y + b.r * 0.5;
        const steps = 30;
        ctx.fillStyle = `rgba(8,4,14,${Math.max(0, k).toFixed(2)})`;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const px = sx0 + (td.x - sx0) * u + Math.sin(u * Math.PI) * 30 * Math.sign(td.x - sx0 || 1);
          const py = sy0 + (td.y - sy0) * u;
          const wd = Math.round(10 - u * 6);
          ctx.fillRect(Math.round(px - camX - wd / 2), Math.round(py - camY - 3), wd, 6);
        }
      }
    }
    // the heart, beating
    const img = A.enemies.gloamheart;
    const sc2 = 1 + b.beat * 0.06;
    const dw = Math.round(128 * sc2);
    if (b.flash > 0) ctx.filter = 'brightness(2.4)';
    else if (b.shroud > 0) ctx.filter = `brightness(${(1 - b.shroud * 0.45).toFixed(2)})`;
    ctx.drawImage(img, Math.round(b.x - dw / 2 - camX), Math.round(b.y - dw / 2 - camY), dw, dw);
    ctx.filter = 'none';
    // its shroud: living dark roiling round it, the same stuff as the Gloamlings
    if (b.shroud > 0.02) {
      const x = b.x - camX;
      const y = b.y - camY;
      ctx.globalAlpha = fade * Math.min(1, b.shroud * 1.1);
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? '#2a1450' : '#06030b';
        for (let k = 0; k < 22; k++) {
          const a = t * (k % 2 ? 0.55 : -0.42) + k * 1.13;
          const rr = b.r * (0.25 + ((k * 37) % 10) / 14) + Math.sin(t * 1.4 + k) * 8;
          const size = 10 + ((k * 13) % 9) + b.beat * 3;
          pixDisc(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9, pass === 0 ? size + 2 : size);
        }
      }
      // two pale eyes in the dark, watching you
      const blink = (t * 0.6) % 5 < 0.15;
      ctx.fillStyle = '#f0dcff';
      const ex = Math.round(x + Math.sign(g.player.cx - b.x) * 4);
      const ey = Math.round(y - 6);
      ctx.fillRect(ex - 9, ey, 4, blink ? 1 : 3);
      ctx.fillRect(ex + 5, ey, 4, blink ? 1 : 3);
    }
    ctx.restore();
  }

  /** after the lighting: the sconce flames, the light they burn into its dark, and its stolen light showing */
  private drawHeartGlow(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const b = g.boss;
    if (!b) return;
    const t = g.time;
    for (const s of b.sconces) {
      const f = b.flameAt(s);
      const fx = f.x - camX;
      const fy = f.y - camY;
      if (!s.lit) {
        // a thread of smoke where one was just snuffed
        if (s.t < 1.4) {
          ctx.fillStyle = `rgba(120,110,130,${(0.5 * (1 - s.t / 1.4)).toFixed(2)})`;
          for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(fx + Math.sin(t * 4 + k) * 2), Math.round(fy - 4 - k * 5 - s.t * 10), 2, 3);
        }
        continue;
      }
      const flare = s.t < 0.4 ? 1 + (0.4 - s.t) * 4 : 1;
      this.glowAt(ctx, fx, fy - 4, (36 + Math.sin(t * 9 + s.tx) * 3) * flare, 'rgba(255,170,70,0.55)');
      for (let k = 0; k < 4; k++) {
        const h = Math.round(10 + Math.random() * 10 + (k === 1 || k === 2 ? 6 : 0));
        const x = Math.round(fx - 9 + k * 5 + (Math.random() - 0.5) * 2);
        ctx.fillStyle = 'rgba(255,90,30,0.8)';
        ctx.fillRect(x - 1, Math.round(fy - 3), 5, 4);
        ctx.fillStyle = 'rgba(255,190,60,0.85)';
        ctx.fillRect(x, Math.round(fy - h * 0.7), 3, Math.round(h * 0.7));
        ctx.fillStyle = 'rgba(255,245,200,0.9)';
        ctx.fillRect(x + 1, Math.round(fy - h), 1, Math.round(h * 0.35));
      }
      // while it hangs in its dark, each burning sconce sends a thread of light into it
      if (b.mode === HeartMode.SHROUD && !b.dead) {
        const dx = b.x - f.x;
        const dy = b.y - f.y;
        const d = Math.hypot(dx, dy);
        const n = Math.floor(d / 6);
        const off = (t * 40) % 6;
        ctx.fillStyle = 'rgba(255,214,140,0.22)';
        for (let i = 0; i < n; i++) {
          const u = (i * 6 + off) / d;
          if (u > 1) break;
          ctx.fillRect(Math.round(fx + dx * u), Math.round(fy - 8 + (dy + 8) * u), 2, 2);
        }
      }
    }
    // its stolen light shows through as the dark comes off it
    const open = (1 - b.shroud) * (b.intro > 0 ? 0 : 1);
    const x = b.x - camX;
    const y = b.y - camY;
    if (open > 0.02) {
      this.glowAt(ctx, x, y, 70 + b.beat * 14, `rgba(255,190,90,${(0.32 * open).toFixed(2)})`);
      ctx.globalAlpha = Math.min(1, (0.45 + b.beat * 0.4) * open);
      const dw = Math.round(128 * (1 + b.beat * 0.06));
      ctx.drawImage(A.enemies.gloamheart, Math.round(x - dw / 2), Math.round(y - dw / 2), dw, dw);
      ctx.globalAlpha = 1;
    } else this.glowAt(ctx, x, y, 64 + b.beat * 10, 'rgba(120,40,200,0.16)');
  }

  private drawShades(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const e of g.enemies) {
      if (!e.def.shade) continue;
      const x = e.cx - camX;
      const y = e.cy - camY;
      if (x < -40 || y < -40 || x > this.scene.width + 40 || y > this.scene.height + 40) continue;
      const t = e.t;
      const sp = Math.hypot(e.vx, e.vy);
      // wisps trail against its motion; at rest they hang beneath it like smoke
      const bx = sp > 8 ? -e.vx / sp : 0;
      const by = sp > 8 ? -e.vy / sp : 1;
      const pieces: [number, number, number][] = [
        [0, 0, 7 + Math.sin(t * 5) * 0.8],
        [Math.cos(t * 3.1) * 3, Math.sin(t * 2.7) * 2 - 2, 5.5],
        [bx * 7 + Math.sin(t * 4) * 1.5, by * 7 + Math.cos(t * 3.3), 4.5],
        [bx * 12 + Math.sin(t * 3 + 1) * 2, by * 12 + Math.cos(t * 2.6 + 1) * 1.5, 3],
        [bx * 16 + Math.sin(t * 2.4 + 2) * 2.5, by * 16 + Math.cos(t * 2 + 2) * 2, 1.6],
        [-5 + Math.sin(t * 6) * 1.5, 4 + Math.cos(t * 4.4), 2.5],
        [5 + Math.cos(t * 5.2) * 1.5, 4 + Math.sin(t * 3.8), 2.5],
      ];
      const form = Math.min(1, Math.max(0, (e.age - 0.4) / 1.2));
      if (form > 0) {
        ctx.globalAlpha = form;
        ctx.fillStyle = e.burn > 0 && Math.floor(g.time * 24) % 2 ? '#a0502a' : '#33195c';
        for (const [px, py, r] of pieces) pixDisc(ctx, x + px, y + py, r + 1);
        ctx.fillStyle = '#07040c';
        for (const [px, py, r] of pieces) pixDisc(ctx, x + px, y + py, r);
        ctx.fillStyle = '#1c0f30';
        pixDisc(ctx, x - 2, y - 3, 2);
        ctx.globalAlpha = 1;
      }
      // eyes, turned your way
      const hunting = e.mode === 1;
      const blink = (t * 0.83) % 4.1 < 0.13;
      const ex = Math.round(x + e.facing * 2);
      const ey = Math.round(y - 1 + Math.sin(t * 5) * 0.5);
      ctx.globalAlpha = Math.min(1, e.age / 0.4);
      ctx.fillStyle = e.tide ? '#ff6a4a' : hunting ? '#ff8ab4' : '#f0dcff';
      if (blink) {
        ctx.fillRect(ex - 4, ey, 2, 1);
        ctx.fillRect(ex + 2, ey, 2, 1);
      } else {
        ctx.fillRect(ex - 4, ey - 1, 2, 2);
        ctx.fillRect(ex + 2, ey - 1, 2, 2);
      }
      ctx.globalCompositeOperation = 'lighter';
      const eg = e.tide ? 'rgba(255,90,60,0.65)' : hunting ? 'rgba(255,80,150,0.6)' : 'rgba(180,130,255,0.5)';
      this.glowAt(ctx, ex - 3, ey, 6, eg);
      this.glowAt(ctx, ex + 3, ey, 6, eg);
      if (form > 0) this.glowAt(ctx, x, y, 20, 'rgba(90,40,160,0.18)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  /** as your nerve goes the screen closes in, and below Shaken the dark reaches in from the edges */
  private drawDread(g: Game, ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
    const n = g.p.nerve;
    if (n >= NERVE_FRAYED || g.player.dead) return;
    const f = (NERVE_FRAYED - n) / NERVE_FRAYED;
    const shaken = n < NERVE_SHAKEN;
    // the dark breathes with your heartbeat once you are shaken
    const beat = shaken ? Math.max(0, Math.sin(g.time * (5 + (1 - n / NERVE_SHAKEN) * 3))) * 0.12 : 0;
    if (this.dread) {
      ctx.globalAlpha = Math.min(1, f * 0.9 + beat);
      ctx.drawImage(this.dread, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (!shaken) return;
    const s = 1 - n / NERVE_SHAKEN;
    const m = Math.min(vw, vh);
    // a violet cast over everything
    ctx.fillStyle = `rgba(40,12,72,${0.08 + s * 0.12})`;
    ctx.fillRect(0, 0, vw, vh);
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 9; k++) {
      // each tendril roots on an edge and gropes toward the middle
      const side = k % 4;
      const u = ((k * 0.37 + 0.13) % 1) * 0.8 + 0.1;
      const ox = side === 0 ? u * vw : side === 1 ? vw + 6 : side === 2 ? u * vw : -6;
      const oy = side === 0 ? -6 : side === 1 ? u * vh : side === 2 ? vh + 6 : u * vh;
      const ang = Math.atan2(vh / 2 - oy, vw / 2 - ox) + Math.sin(g.time * 0.7 + k * 1.9) * 0.35;
      const len = m * (0.1 + 0.26 * s) * (0.75 + 0.25 * Math.sin(g.time * 0.9 + k));
      // enough segments that the discs overlap into one tapering limb
      const segs = Math.max(12, Math.ceil(len / 3));
      for (let i = 0; i < segs; i++) {
        const q = i / (segs - 1);
        const wob = Math.sin(g.time * 2.3 + k * 2.1 + q * 5) * 7 * q;
        pts.push([ox + Math.cos(ang) * len * q - Math.sin(ang) * wob, oy + Math.sin(ang) * len * q + Math.cos(ang) * wob, Math.pow(1 - q, 0.8) * 11 + 1]);
      }
    }
    // a violet rim so they read against the black, then the black itself
    ctx.fillStyle = '#3a1d66';
    for (const [x, y, r] of pts) pixDisc(ctx, x, y, r + 1);
    ctx.fillStyle = '#05020a';
    for (const [x, y, r] of pts) pixDisc(ctx, x, y, r);
  }

  /**
   * Firedamp haze: the gas map, smoothed up to world size, cuts a drifting cloud to its shape.
   * It is drawn before the lighting, so gas is only seen where there is light to see it by.
   */
  private drawGas(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    if (!g.gasNear) return;
    const w = g.world;
    const tx0 = Math.floor(camX / TILE) - 1;
    const ty0 = Math.floor(camY / TILE) - 1;
    const tw = Math.ceil(vw / TILE) + 3;
    const th = Math.ceil(vh / TILE) + 3;
    if (!this.gasMap || !this.gasMapCtx || !this.gasImg || this.gasMap.width !== tw || this.gasMap.height !== th) {
      const c = document.createElement('canvas');
      c.width = tw;
      c.height = th;
      const cc = c.getContext('2d');
      if (!cc) return;
      this.gasMap = c;
      this.gasMapCtx = cc;
      this.gasImg = cc.createImageData(tw, th);
    }
    const d = this.gasImg.data;
    let any = false;
    for (let y = 0; y < th; y++) {
      const wy = ty0 + y;
      for (let x = 0; x < tw; x++) {
        const wx = tx0 + x;
        let a = 0;
        if (wx >= 0 && wy >= 0 && wx < w.w && wy < w.h) {
          const v = w.gas[wy * w.w + wx];
          if (v > 8) {
            a = Math.min(235, 24 + (v - 8) * 1.4);
            any = true;
          }
        }
        const o = (y * tw + x) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = a;
      }
    }
    if (!any) return;
    this.gasMapCtx.putImageData(this.gasImg, 0, 0);
    if (!this.gasLayer || !this.gasLayerCtx || this.gasLayer.width !== vw || this.gasLayer.height !== vh) {
      const c = document.createElement('canvas');
      c.width = vw;
      c.height = vh;
      const cc = c.getContext('2d');
      if (!cc) return;
      this.gasLayer = c;
      this.gasLayerCtx = cc;
    }
    const L = this.gasLayerCtx;
    const cloud = this.gasCloud ?? (this.gasCloud = makeCloud());
    const N = cloud.width;
    const mod = (v: number): number => ((v % N) + N) % N;
    L.clearRect(0, 0, vw, vh);
    L.globalCompositeOperation = 'source-over';
    L.globalAlpha = 1;
    // two sheets of cloud drifting past each other, fixed to the world
    const ax = mod(camX - g.time * 6);
    const ay = mod(camY + g.time * 2);
    for (let y = -ay; y < vh; y += N) for (let x = -ax; x < vw; x += N) L.drawImage(cloud, Math.round(x), Math.round(y));
    L.globalAlpha = 0.5;
    const bx = mod(camX + g.time * 4 + 57);
    const by = mod(camY - g.time * 3 + 31);
    for (let y = -by; y < vh; y += N) for (let x = -bx; x < vw; x += N) L.drawImage(cloud, Math.round(x), Math.round(y));
    L.globalAlpha = 1;
    L.globalCompositeOperation = 'destination-in';
    L.imageSmoothingEnabled = true;
    L.imageSmoothingQuality = 'high';
    L.drawImage(this.gasMap, 0, 0, tw, th, tx0 * TILE - camX, ty0 * TILE - camY, tw * TILE, th * TILE);
    L.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.gasLayer, 0, 0);
  }

  /** five bubbles over your head while you hold your breath; each one is two seconds of air */
  private drawBreath(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const pl = g.player;
    if (g.breath >= BREATH_MAX || pl.dead) return;
    const per = BREATH_MAX / 5;
    const left = g.breath / per;
    const x0 = Math.round(pl.cx - camX) - 22;
    const y = Math.round(pl.y - camY) - 16;
    const warn = g.breath < per && Math.floor(g.time * 6) % 2 === 1;
    for (let k = 0; k < 5; k++) {
      const x = x0 + k * 9;
      const fill = Math.max(0, Math.min(1, left - k));
      if (fill <= 0) {
        // a burst bubble: a faint broken ring
        ctx.fillStyle = 'rgba(160,210,255,0.3)';
        ctx.fillRect(x + 1, y + 3, 1, 1);
        ctx.fillRect(x + 5, y + 3, 1, 1);
        ctx.fillRect(x + 3, y + 1, 1, 1);
        continue;
      }
      // a round 7px bubble, shrinking as it runs out
      const s = fill > 0.5 ? 0 : 1;
      ctx.fillStyle = 'rgba(8,26,52,0.85)';
      ctx.fillRect(x + 1 + s, y + s, 5 - s * 2, 7 - s * 2);
      ctx.fillRect(x + s, y + 1 + s, 7 - s * 2, 5 - s * 2);
      ctx.fillStyle = warn ? '#ff9a8a' : '#8fd0ff';
      ctx.fillRect(x + 1 + s, y + 1 + s, 5 - s * 2, 5 - s * 2);
      ctx.fillStyle = warn ? '#ffd0c8' : '#d8f0ff';
      ctx.fillRect(x + 2 + s, y + 2 + s, 2, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 2 + s, y + 2 + s, 1, 1);
    }
  }

  /** the canary's cage, hanging from the pack on the miner's back; the bird inside shows how it feels */
  private drawCage(g: Game, ctx: CanvasRenderingContext2D, cx: number, footY: number, facing: number): void {
    const mood = g.canary.mood;
    const x = Math.round(cx - facing * 12) - 3;
    const y = footY - 32;
    const P = (px: number, py: number, pw: number, ph: number, c: string): void => {
      ctx.fillStyle = c;
      ctx.fillRect(x + (facing < 0 ? 7 - px - pw : px), y + py, pw, ph);
    };
    const t = g.time;
    // the cage
    P(3, 0, 1, 1, '#4a3a20');
    P(2, 1, 3, 1, '#d8b060');
    P(1, 2, 5, 1, '#c8a050');
    P(0, 3, 1, 5, '#8a6a30');
    P(6, 3, 1, 5, '#8a6a30');
    // the bird
    let hop = 0;
    if (mood === 'frantic') hop = Math.floor(t * 14) % 2 ? -1 : 0;
    else if (mood === 'uneasy') hop = t % 0.8 < 0.12 ? -1 : 0;
    if (mood === 'fainted') {
      P(2, 7, 3, 1, '#c8b060');
      P(5, 7, 1, 1, '#d8c070');
    } else {
      P(1, 7, 5, 1, '#6a4a20');
      P(3, 4 + hop, 2, 1, '#ffd43a');
      P(5, 4 + hop, 1, 1, '#ff9a2a');
      P(2, 5 + hop, 3, 2, '#ffd43a');
      P(2, 5 + hop, 1, 1, mood === 'frantic' && hop ? '#fff0a0' : '#e0a820');
      P(1, 6 + hop, 1, 1, '#e0a820');
    }
    P(3, 3, 1, 4, 'rgba(110,80,36,0.7)');
    P(0, 8, 7, 1, '#a07838');
    if (mood === 'frantic' && Math.floor(t * 4) % 2) {
      P(3, -5, 1, 2, '#ff5a3a');
      P(3, -2, 1, 1, '#ff5a3a');
    }
  }

  private glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    const c = this.tinted(color);
    ctx.drawImage(c, Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
  }

  private tintCache = new Map<string, HTMLCanvasElement>();
  private tinted(color: string): HTMLCanvasElement {
    let c = this.tintCache.get(color);
    if (c) return c;
    const [cc, g] = makeCanvas(64, 64);
    g.drawImage(this.glowSprite, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    c = cc;
    if (this.tintCache.size > 200) this.tintCache.clear();
    this.tintCache.set(color, c);
    return c;
  }

  private drawHover(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (g.ui.isOpen() || g.player.dead) return;
    const h = g.hoverTile;
    if (!h.inReach) return;
    const hd = heldDef(g.p);
    const placing = hd && (hd.kind === 'block' || hd.kind === 'wall' || hd.kind === 'place');
    let color: string | null = null;
    let ty = h.y;
    if (placing) color = 'rgba(255,215,90,0.55)';
    else if (h.ok) {
      ty = h.ty;
      const w = g.world;
      const def = BLOCKS[w.get(h.x, h.y)];
      color = h.kind === 'block' && def.tier > g.st.pickTier ? 'rgba(255,110,80,0.9)' : 'rgba(255,255,255,0.85)';
      // amber: taking this out frees the loose rock it holds up
      const frees = (h.kind === 'block' && w.inside(h.x, h.y - 1) && w.loose[w.idx(h.x, h.y - 1)]) || (h.kind === 'obj' && w.getObj(h.x, h.y) === Obj.BEAM);
      if (frees && color !== 'rgba(255,110,80,0.9)') color = 'rgba(255,176,64,0.95)';
    }
    if (!color) return;
    const sx = h.x * TILE - camX;
    const sy = ty * TILE - camY;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const corner = 7;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [sx, sy, 1, 1],
      [sx + TILE, sy, -1, 1],
      [sx, sy + TILE, 1, -1],
      [sx + TILE, sy + TILE, -1, -1],
    ]) {
      ctx.moveTo(cx + 0.5 * dx, cy + corner * dy);
      ctx.lineTo(cx + 0.5 * dx, cy + 0.5 * dy);
      ctx.lineTo(cx + corner * dx, cy + 0.5 * dy);
    }
    ctx.stroke();
  }

  // ------------------------------------------------------------------ crisp text on the full-res canvas
  private drawOverlayText(g: Game, out: CanvasRenderingContext2D, camX: number, camY: number): void {
    const s = this.scale;
    const en = g.ending;
    if (en && en.stage === 'climb') {
      const W = out.canvas.width;
      const H = out.canvas.height;
      const cx = Math.round(W / 2);
      const cy = Math.round(H * 0.74);
      const tx = Math.max(0, Math.min(g.world.surface.length - 1, Math.floor(en.x / TILE)));
      const depth = Math.max(0, Math.floor(en.y / TILE) - g.world.surface[tx]);
      out.textAlign = 'center';
      out.textBaseline = 'middle';
      const a = en.caption ? Math.min(1, en.captionT * 3) * Math.min(1, Math.max(0, 2.2 - en.captionT) * 1.5) : 0;
      const big = Math.round(13 * s);
      const small = Math.round(8 * s);
      if (a > 0.01) {
        out.globalAlpha = a;
        out.font = `${big}px "Silkscreen", monospace`;
        out.fillStyle = 'rgba(20,10,0,0.8)';
        out.fillText(en.caption, cx + s, cy + s);
        out.fillStyle = '#ffe9a8';
        out.fillText(en.caption, cx, cy);
      }
      out.globalAlpha = 0.85;
      out.font = `${small}px "DW Digits", "Pixelify Sans", monospace`;
      const dl = depth > 0 ? `${depth}m` : 'Surface';
      out.fillStyle = 'rgba(0,0,0,0.75)';
      out.fillText(dl, cx + s, cy + big + s);
      out.fillStyle = '#f4ead6';
      out.fillText(dl, cx, cy + big);
      out.globalAlpha = 1;
      this.mark(0, cy - big, W, cy + big + small + s * 2);
    }
    out.textAlign = 'center';
    out.textBaseline = 'middle';
    for (const t of g.texts) {
      const a = Math.min(1, t.life * 2);
      const size = Math.round((t.big ? 11 : 8) * s);
      out.font = `${size}px "DW Digits", "Pixelify Sans", monospace`;
      out.globalAlpha = a;
      const x = Math.round((t.x - camX) * s);
      const y = Math.round((t.y - camY) * s);
      out.fillStyle = 'rgba(0,0,0,0.75)';
      out.fillText(t.text, x + s, y + s);
      out.fillStyle = t.color;
      out.fillText(t.text, x, y);
      const hw = out.measureText(t.text).width / 2;
      this.mark(x - hw, y - size, x + hw + s, y + size + s);
    }
    out.globalAlpha = 1;
    // what the lost say, in a speech bubble over their heads
    for (const sl of [...g.souls, ...g.homing, ...g.town.folk.filter((t) => t.plan !== 'inside')]) {
      if (sl.sayT <= 0 || !sl.say) continue;
      const size = Math.round(7 * s);
      out.font = `${size}px "DW Digits", "Pixelify Sans", monospace`;
      const maxW = 150 * s;
      const lines: string[] = [];
      let cur = '';
      for (const wd of sl.say.split(' ')) {
        const t = cur ? `${cur} ${wd}` : wd;
        if (cur && out.measureText(t).width > maxW) {
          lines.push(cur);
          cur = wd;
        } else cur = t;
      }
      if (cur) lines.push(cur);
      const lh = size * 1.25;
      const bw = Math.round(Math.max(...lines.map((l) => out.measureText(l).width)) + 10 * s);
      const bh = Math.round(lines.length * lh + 6 * s);
      const x = Math.round((sl.x - camX) * s);
      const yb = Math.round((sl.y - 52 - camY) * s);
      out.globalAlpha = Math.min(1, sl.sayT * 2.5);
      this.mark(x - bw / 2 - s, yb - bh - s, x + bw / 2 + s, yb + 7 * s);
      out.fillStyle = '#2a1c10';
      out.fillRect(x - bw / 2 - s, yb - bh - s, bw + 2 * s, bh + 2 * s);
      out.beginPath();
      out.moveTo(x - 5 * s, yb);
      out.lineTo(x + 3 * s, yb);
      out.lineTo(x - 3 * s, yb + 6 * s);
      out.closePath();
      out.fill();
      out.fillStyle = '#f7eedc';
      out.fillRect(x - bw / 2, yb - bh, bw, bh);
      out.beginPath();
      out.moveTo(x - 4 * s, yb - s);
      out.lineTo(x + 2 * s, yb - s);
      out.lineTo(x - 2.5 * s, yb + 4 * s);
      out.closePath();
      out.fill();
      out.fillStyle = '#2a1c10';
      lines.forEach((l, i) => out.fillText(l, x, yb - bh + 3 * s + lh * (i + 0.5)));
      out.globalAlpha = 1;
    }
    const pl = g.player;
    if (g.near && !g.ui.isOpen() && !pl.dead && !g.fishing) {
      const size = Math.round(8 * s);
      out.font = `${size}px "DW Digits", "Pixelify Sans", monospace`;
      // on a touchscreen the Use button carries the same words
      const label = g.input.usingTouch ? g.near.label : `[${keyName('interact')}] ${g.near.label}`;
      const x = Math.round((pl.cx - camX) * s);
      const y = Math.round((pl.y - camY - 14) * s);
      const tw = out.measureText(label).width + 12 * s;
      this.mark(x - tw / 2, y - size * 0.8, x + tw / 2, y + size * 0.8);
      out.fillStyle = 'rgba(14,10,20,0.8)';
      out.fillRect(x - tw / 2, y - size * 0.8, tw, size * 1.6);
      out.fillStyle = '#ffe9a8';
      out.fillText(label, x, y);
    }
    if (pl.recallT > 0) {
      const w = 40 * s;
      const x = Math.round((pl.cx - camX) * s - w / 2);
      const y = Math.round((pl.y - camY - 8) * s);
      this.mark(x, y, x + w, y + 3 * s);
      out.fillStyle = 'rgba(0,0,0,0.7)';
      out.fillRect(x, y, w, 3 * s);
      out.fillStyle = '#7ac8ff';
      out.fillRect(x, y, w * (1 - pl.recallT / 1.6), 3 * s);
    }
  }
}

/** a tileable cloud for firedamp haze: soft noise in a few pale bands, sickly yellow-green */
function makeCloud(): HTMLCanvasElement {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d');
  if (!g) return c;
  const img = g.createImageData(N, N);
  const grid = (n: number): Float32Array => {
    const a = new Float32Array(n * n);
    for (let i = 0; i < a.length; i++) a[i] = Math.random();
    return a;
  };
  const sample = (a: Float32Array, n: number, x: number, y: number): number => {
    const fx = (x / N) * n;
    const fy = (y / N) * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const s = (v: number): number => v * v * (3 - 2 * v);
    const sx = s(fx - x0);
    const sy = s(fy - y0);
    const at = (xx: number, yy: number): number => a[(((yy % n) + n) % n) * n + (((xx % n) + n) % n)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bot - top) * sy;
  };
  const g1 = grid(6);
  const g2 = grid(14);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = sample(g1, 6, x, y) * 0.65 + sample(g2, 14, x, y) * 0.35;
      const q = Math.floor(v * 5) / 5;
      const o = (y * N + x) * 4;
      img.data[o] = Math.round(180 + q * 40);
      img.data[o + 1] = Math.round(198 + q * 34);
      img.data[o + 2] = Math.round(112 + q * 40);
      img.data[o + 3] = Math.round(60 + q * 150);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

interface SkyTop {
  join: string;
  deep: string;
}

/** the colour along the top edge of a sky painting, and a deeper zenith to fade into above it */
function skyTop(img: HTMLCanvasElement, deepen: [number, number, number]): SkyTop {
  const g = img.getContext('2d');
  // the most common colour along the top edge (an average would pick up clouds that touch it)
  let r = 0;
  let gg = 0;
  let b = 0;
  if (g) {
    const d = g.getImageData(0, 0, img.width, 1).data;
    const counts = new Map<number, number>();
    let best = 0;
    for (let i = 0; i < d.length; i += 4) {
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      if (n > best) {
        best = n;
        r = d[i];
        gg = d[i + 1];
        b = d[i + 2];
      }
    }
  }
  const c = (v: number[]): string => `rgb(${v.map((x) => Math.round(x)).join(',')})`;
  return { join: c([r, gg, b]), deep: c([r * deepen[0], gg * deepen[1], b * deepen[2]]) };
}

function mirrored(img: HTMLImageElement): HTMLCanvasElement {
  const [c, g] = makeCanvas(img.width * 2, img.height);
  g.drawImage(img, 0, 0);
  g.translate(img.width * 2, 0);
  g.scale(-1, 1);
  g.drawImage(img, 0, 0);
  return c;
}

function drawLadder(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.fillStyle = '#4a2e14';
  ctx.fillRect(sx + 6, sy, 4, TILE);
  ctx.fillRect(sx + 22, sy, 4, TILE);
  ctx.fillStyle = '#9a6a3a';
  ctx.fillRect(sx + 7, sy, 2, TILE);
  ctx.fillRect(sx + 23, sy, 2, TILE);
  for (let y = 4; y < TILE; y += 9) {
    ctx.fillStyle = '#4a2e14';
    ctx.fillRect(sx + 8, sy + y, 16, 4);
    ctx.fillStyle = '#b07a44';
    ctx.fillRect(sx + 8, sy + y, 16, 2);
  }
}

/**
 * A timber prop: a post standing on the floor up to the roof, and a cap board along the roof
 * as far as it holds it (two tiles either side, where the roof runs at the same height).
 */
function drawBeam(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: World, tx: number, ty: number): void {
  let rows = 3;
  let left = 0;
  let right = 0;
  if (ty >= 0) {
    const roof = propRoof(w, tx, ty);
    if (roof >= 0) {
      rows = ty - roof;
      const flat = (x: number): boolean => w.rock(x, roof) && !w.rock(x, roof + 1);
      while (left < PROP_REACH && flat(tx - left - 1)) left++;
      while (right < PROP_REACH && flat(tx + right + 1)) right++;
    }
  }
  const top = sy + TILE - rows * TILE;
  const x0 = sx - left * TILE + 2;
  const x1 = sx + TILE + right * TILE - 2;
  // the cap board under the roof
  ctx.fillStyle = '#2a1608';
  ctx.fillRect(x0, top, x1 - x0, 7);
  ctx.fillStyle = '#7a4e26';
  ctx.fillRect(x0 + 1, top + 1, x1 - x0 - 2, 5);
  ctx.fillStyle = '#c89a5a';
  ctx.fillRect(x0 + 1, top + 1, x1 - x0 - 2, 1);
  ctx.fillStyle = '#5a3818';
  ctx.fillRect(x0 + 1, top + 5, x1 - x0 - 2, 1);
  ctx.fillStyle = '#40260e';
  for (let x = x0 + 7; x < x1 - 4; x += 13) ctx.fillRect(x, top + 3, 2, 1);
  // wedges either side of the post
  ctx.fillStyle = '#2a1608';
  ctx.fillRect(sx + 8, top + 7, 4, 3);
  ctx.fillRect(sx + 20, top + 7, 4, 3);
  ctx.fillStyle = '#a8743e';
  ctx.fillRect(sx + 9, top + 7, 2, 1);
  ctx.fillRect(sx + 21, top + 7, 2, 1);
  // the post
  const py = top + 7;
  const ph = sy + TILE - py;
  ctx.fillStyle = '#2a1608';
  ctx.fillRect(sx + 11, py, 10, ph);
  ctx.fillStyle = '#7a4e26';
  ctx.fillRect(sx + 12, py, 8, ph);
  ctx.fillStyle = '#a8743e';
  ctx.fillRect(sx + 12, py, 2, ph);
  ctx.fillStyle = '#c89a5a';
  ctx.fillRect(sx + 12, py, 1, ph);
  ctx.fillStyle = '#5a3818';
  ctx.fillRect(sx + 19, py, 1, ph);
  ctx.fillStyle = '#40260e';
  for (let y = py + 6; y < sy + TILE - 6; y += 11) ctx.fillRect(sx + 15 + ((y >> 3) & 1), y, 1, 3);
  // a sill block on the floor
  ctx.fillStyle = '#2a1608';
  ctx.fillRect(sx + 8, sy + TILE - 4, 16, 4);
  ctx.fillStyle = '#a8743e';
  ctx.fillRect(sx + 9, sy + TILE - 3, 14, 1);
}

/** a two-tile wooden door, drawn from its top tile */
function drawDoor(ctx: CanvasRenderingContext2D, sx: number, sy: number, open: boolean): void {
  const h = TILE * 2;
  // frame
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(sx + 2, sy, 3, h);
  ctx.fillRect(sx + 2, sy, 28, 3);
  if (open) {
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(sx + 4, sy + 3, 6, h - 3);
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(sx + 5, sy + 4, 3, h - 5);
    return;
  }
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(sx + 7, sy + 3, 18, h - 3);
  ctx.fillStyle = '#7a4e26';
  ctx.fillRect(sx + 8, sy + 4, 16, h - 5);
  ctx.fillStyle = '#9a6a3a';
  for (const x of [9, 14, 19]) ctx.fillRect(sx + x, sy + 5, 3, h - 7);
  ctx.fillStyle = '#4a2e14';
  ctx.fillRect(sx + 8, sy + 14, 16, 3);
  ctx.fillRect(sx + 8, sy + h - 18, 16, 3);
  ctx.fillStyle = '#e0c060';
  ctx.fillRect(sx + 20, sy + 34, 3, 3);
}

function drawCrop(ctx: CanvasRenderingContext2D, sx: number, sy: number, stage: number, t: number, tx: number): void {
  const heights = [6, 12, 20, 26];
  const h = heights[stage];
  const ripe = stage === 3;
  for (let k = 0; k < 5; k++) {
    const x = sx + 5 + k * 5;
    const sway = Math.round(Math.sin(t * 2 + tx + k) * (stage > 1 ? 1 : 0));
    ctx.fillStyle = ripe ? '#8a7a20' : '#3a6a1a';
    ctx.fillRect(x + sway, sy + TILE - h, 1, h);
    ctx.fillStyle = ripe ? '#e8c050' : stage > 1 ? '#7aa83a' : '#5a9a32';
    ctx.fillRect(x - 1 + sway, sy + TILE - h, 3, Math.max(2, Math.round(h / 3)));
  }
}

function biomeIndexRow(ty: number): number {
  for (let i = BIOMES.length - 1; i >= 0; i--) if (ty >= BIOMES[i].top) return i;
  return 0;
}

function hash(x: number, seed: number): number {
  let h = Math.imul(x ^ seed, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** copy a w x h region out of a seamless texture starting at (ox, oy), wrapping at its edges */
function blitWrapped(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, ox: number, oy: number, dx: number, dy: number, w: number, h: number): void {
  const S = img.width;
  const w1 = Math.min(w, S - ox);
  const h1 = Math.min(h, S - oy);
  if (w1 > 0 && h1 > 0) ctx.drawImage(img, ox, oy, w1, h1, dx, dy, w1, h1);
  if (w - w1 > 0 && h1 > 0) ctx.drawImage(img, 0, oy, w - w1, h1, dx + w1, dy, w - w1, h1);
  if (h - h1 > 0 && w1 > 0) ctx.drawImage(img, ox, 0, w1, h - h1, dx, dy + h1, w1, h - h1);
  if (w - w1 > 0 && h - h1 > 0) ctx.drawImage(img, 0, 0, w - w1, h - h1, dx + w1, dy + h1, w - w1, h - h1);
}

/** a filled circle in whole pixels: crisp at any size, unlike arc() */
function pixDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  const ri = Math.max(1, Math.round(r));
  for (let dy = -ri; dy <= ri; dy++) {
    const w = Math.floor(Math.sqrt(ri * ri - dy * dy) + 0.35);
    ctx.fillRect(xi - w, yi + dy, w * 2 + 1, 1);
  }
}
