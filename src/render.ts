import { A, makeCanvas, iconSrc, decorIcon, drawRailAt, drawLampAt } from './assets';
import { Terrain, MAT, terrainTexture } from './terrain';
import { buildBackdrops, Backdrop, BW, BH } from './backdrop';
import { propOf } from './data/props';
import type { World } from './world/world';
import { TILE, TARGET_VIEW_H, SURFACE_Y } from './constants';
import { BLOCKS, B } from './data/blocks';
import { BIOMES } from './data/biomes';
import { ITEMS, IconRef } from './data/items';
import { Obj } from './world/world';
import { BOSS_CENTER } from './world/gen';
import { Game, BUILDING_INFO, BUILDING_W, treeKind, daylight, isNight } from './game';
import { heldDef } from './state';

const ROW = { idle: 0, walk: 1, jump: 2, hurt: 3, mine: 4, climb: 5 } as const;
const CELL = 68;
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
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  scale = 2;
  dpr = 1;
  private backdrops: Backdrop[] = [];
  private terrain: Terrain | null = null;
  private terrainWorld: World | null = null;
  private cracks: HTMLCanvasElement[] = [];
  private glowSprite: HTMLCanvasElement;
  private vignette: HTMLCanvasElement | null = null;
  private stars: { x: number; y: number; b: number }[] = [];
  private amb: Ambient[] = [];
  private lastT = 0;
  /** sky art mirrored side by side so it tiles without a seam */
  private skyDay: HTMLCanvasElement;
  private skyDusk: HTMLCanvasElement;
  private skyDayTop: SkyTop;
  private skyDuskTop: SkyTop;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    this.ctx = ctx;
    [this.scene, this.sctx] = makeCanvas(640, 360);
    this.glowSprite = this.makeGlow();
    this.backdrops = buildBackdrops();
    this.buildCracks();
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
    this.canvas.width = vw * s;
    this.canvas.height = vh * s;
    this.canvas.style.width = `${(vw * s) / this.dpr}px`;
    this.canvas.style.height = `${(vh * s) / this.dpr}px`;
    this.ctx.imageSmoothingEnabled = false;
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
  }

  draw(g: Game): void {
    const ctx = this.sctx;
    const vw = this.scene.width;
    const vh = this.scene.height;
    const dt = Math.min(0.05, Math.max(0, g.time - this.lastT));
    this.lastT = g.time;
    let camX = Math.round(g.camX);
    let camY = Math.round(g.camY);
    if (g.shake > 0) {
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
    this.terrain.drawBack(ctx, camX, camY, vw, vh);
    this.drawTrees(g, ctx, camX, camY, vw);
    this.drawBuildings(g, ctx, camX, camY);
    this.drawLiquids(g, ctx, camX, camY, vw, vh);
    this.terrain.drawFore(ctx, camX, camY, vw, vh);
    this.drawBlockDetails(g, ctx, camX, camY, vw, vh);
    this.drawObjects(g, ctx, camX, camY, vw, vh);
    this.drawNpcs(g, ctx, camX, camY);
    this.drawEntities(g, ctx, camX, camY);
    if (g.ride) {
      const c = A.camp.minecart;
      const bob = Math.abs(g.ride.vx) > 40 ? Math.round(Math.sin(g.time * 30) * 0.6) : 0;
      ctx.drawImage(c, Math.round(g.ride.x - c.width / 2 - camX), Math.round((g.ride.row + 1) * TILE - c.height - 3 + bob - camY));
    }
    this.drawWater(g, ctx, camX, camY, vw, vh);
    this.drawFishing(g, ctx, camX, camY);
    this.updateAmbient(g, dt, camX, camY, vw, vh);
    this.drawGhost(g, ctx, camX, camY);

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
    this.drawReelMeter(g, ctx, camX, camY);
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);
    this.drawHover(g, ctx, camX, camY);

    if (g.gloom > 0) {
      ctx.fillStyle = `rgba(20,0,30,${Math.min(0.5, g.gloom * 0.25)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    const pl = g.player;
    if (pl.hurtT > 0) {
      ctx.fillStyle = `rgba(160,0,0,${pl.hurtT * 0.8})`;
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

    const out = this.ctx;
    out.imageSmoothingEnabled = false;
    out.drawImage(this.scene, 0, 0, vw * this.scale, vh * this.scale);
    this.drawOverlayText(g, out, camX, camY);
    if (g.fade > 0) {
      out.fillStyle = `rgba(0,0,0,${g.fade})`;
      out.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
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
    if (dl < 0.6 && y0 > 0) {
      const a = (0.6 - dl) / 0.48;
      for (const s of this.stars) {
        const x = mod(s.x - camX * 0.05, vw + 40) - 20;
        const y = mod(s.y - (camY - baseCam) * 0.3, 900) - 600 + y0;
        if (y < 0 || y > y0 - 4) continue;
        ctx.fillStyle = `rgba(255,255,240,${a * (0.4 + 0.6 * Math.abs(Math.sin(g.time * (0.5 + s.b) + s.x)))})`;
        ctx.fillRect(Math.round(x), Math.round(y), s.b > 0.85 ? 2 : 1, s.b > 0.85 ? 2 : 1);
      }
    }
    // the moon
    if (isNight(c)) {
      const t = (c - 0.6) / 0.36;
      const mx = vw * (0.15 + t * 0.7);
      const my = 70 - Math.sin(t * Math.PI) * 40;
      this.glowAt(ctx, mx, my, 34, 'rgba(200,210,255,0.18)');
      ctx.fillStyle = '#e8ecff';
      ctx.beginPath();
      ctx.arc(Math.round(mx), Math.round(my), 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,170,210,0.7)';
      ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 2, 3, 3);
      ctx.fillRect(Math.round(mx) + 2, Math.round(my) + 3, 2, 2);
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
      }
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
    }
  }

  private drawNpcs(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const b of g.p.buildings) {
      const info = BUILDING_INFO[b.kind];
      const img = A.camp[info.npc];
      const pad = A.padBottom[info.npc] ?? 0;
      const nx = (b.x + BUILDING_W / 2 - 0.9) * TILE;
      const bob = Math.round(Math.sin(g.time * 2 + b.x) * 0.6);
      const x = Math.round(nx - img.width / 2 - camX);
      const y = Math.round(b.y * TILE - (img.height - pad) + bob - camY);
      const faceRight = g.player.cx > nx;
      ctx.save();
      if (faceRight) {
        ctx.translate(x + img.width, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
      } else ctx.drawImage(img, x, y);
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
          ctx.drawImage(set[(tx * 7 + ty) & 3], sx, sy - 7);
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
        this.drawObj(g, ctx, o, sx, sy, tx, 1);
      }
    }
  }

  private drawObj(g: Game, ctx: CanvasRenderingContext2D, o: number, sx: number, sy: number, tx: number, alpha: number): void {
    ctx.globalAlpha = alpha;
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
          drawBeam(ctx, sx, sy);
          break;
        case Obj.MINECART: {
          const c = A.camp.minecart;
          ctx.drawImage(c, Math.round(sx + 16 - c.width / 2), sy + TILE - c.height - 3);
          break;
        }
        case Obj.LAMP:
          drawLampAt(ctx, sx, sy, Math.floor(g.time * 9 + tx * 3) % 3);
          break;
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
      else this.drawObj(g, ctx, hd.obj, sx, sy, h.x, 0.45);
    } else if (hd.kind === 'deed' && hd.deed) {
      const info = BUILDING_INFO[hd.deed];
      const img = A.camp[info.sprite];
      const gy = groundRow(g, h.x);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(img, Math.round(h.x * TILE - img.width / 2 - camX), Math.round(gy * TILE - (img.height - (A.padBottom[info.sprite] ?? 0)) - camY));
      ctx.globalAlpha = 1;
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
      const img = A.enemies[e.def.id];
      const fs = e.def.size;
      const frames = Math.floor(img.width / fs);
      const moving = Math.abs(e.vx) > 8 || !e.onGround || e.def.behavior === 'flyer';
      const f = moving || e.def.behavior !== 'critter' ? 1 + (Math.floor(e.animT * e.def.fps) % (frames - 1)) : 0;
      const grounded = e.def.behavior !== 'flyer' && e.def.behavior !== 'shooter' && e.def.behavior !== 'phaser';
      const x = Math.round(e.cx - fs / 2 - camX);
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
    if (g.boss) {
      const b = g.boss;
      const img = A.enemies.boss;
      const f = 1 + (Math.floor(b.animT * 7) % 8);
      ctx.save();
      if (b.flash > 0) ctx.filter = 'brightness(3)';
      if (b.intro > 0) ctx.globalAlpha = 1 - b.intro / 2.2;
      if (b.dead) ctx.globalAlpha = Math.max(0, 1 - b.deathT / 3.2);
      ctx.drawImage(img, f * 128, 0, 128, 128, Math.round(b.x - 64 - camX), Math.round(b.y - 64 - camY), 128, 128);
      ctx.restore();
      if (b.winding) {
        const fy = (BOSS_CENTER.y + 6) * TILE - camY;
        ctx.fillStyle = Math.floor(g.time * 12) % 2 ? 'rgba(255,60,90,0.8)' : 'rgba(255,200,90,0.8)';
        ctx.fillRect(Math.round(b.targetX - 60 - camX), fy - 3, 120, 3);
      }
    }
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
        frame = 1 + (Math.floor(pl.animT * 6) % 6);
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
      frame = Math.min(5, 2 + Math.floor(pl.deadT * 4));
    } else if (pl.hurtT > 0.12 && !pl.swinging) {
      row = ROW.hurt;
      frame = 2;
    }
    const footY = Math.round(pl.y + pl.h - camY);
    const cx = Math.round(pl.cx - camX);
    const flip = pl.facing < 0 && pl.anim !== 'climb';
    ctx.save();
    if (pl.dead) ctx.globalAlpha = Math.max(0, 1 - pl.deadT * 0.3);
    if (flip) {
      ctx.translate(cx + 33, footY - 57);
      ctx.scale(-1, 1);
      ctx.drawImage(A.miner, frame * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
    } else ctx.drawImage(A.miner, frame * CELL, row * CELL, CELL, CELL, cx - 33, footY - 57, CELL, CELL);
    ctx.restore();
    if (pl.dead || pl.climbing) return;
    // held item: torches are carried, weapons swing in an arc
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
    } else if (pl.swinging && (hd.kind === 'sword' || hd.kind === 'hammer')) {
      const s = iconSrc(hd.icon);
      const t = Math.min(1, pl.swingT);
      const a = (-2.2 + t * 2.9) * pl.facing;
      ctx.save();
      ctx.translate(cx + pl.facing * 4, footY - 24);
      ctx.rotate(a + (pl.facing < 0 ? Math.PI / 2 : 0));
      if (pl.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, -2, -26, 28, 28);
      ctx.restore();
    } else if (hd.kind === 'bow' && pl.swinging) {
      const s = iconSrc(hd.icon);
      ctx.save();
      ctx.translate(cx + pl.facing * 12, footY - 26);
      if (pl.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(s.img, s.sx, s.sy, s.size, s.size, -10, -12, 24, 24);
      ctx.restore();
    }
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
    // drips from damp ceilings
    if (under && bi <= 1 && Math.random() < dt * 3) {
      const tx = Math.floor((camX + Math.random() * vw) / TILE);
      for (let ty = Math.floor(camY / TILE); ty < Math.floor((camY + vh) / TILE); ty++) {
        if (w.rock(tx, ty) && !w.rock(tx, ty + 1) && w.explored[(ty + 1) * w.w + tx] && Math.random() < 0.15) {
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

  // ------------------------------------------------------------------ glows (after lighting)
  private drawGlows(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE) + 1);
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE) + 1);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * w.w + tx;
        const o = w.obj[i];
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        if (o === Obj.TORCH) this.glowAt(ctx, sx + 16, sy + 9, 26 * (0.85 + Math.sin(g.time * 10 + tx) * 0.1), 'rgba(255,170,60,0.55)');
        else if (o === Obj.LAMP) this.glowAt(ctx, sx + 16, sy + 17, 30 * (0.9 + Math.sin(g.time * 6 + tx) * 0.05), 'rgba(255,190,90,0.5)');
        else if (o === Obj.CAMPFIRE) {
          this.glowAt(ctx, sx + 16, sy + 20, 40 + Math.sin(g.time * 9 + tx) * 4, 'rgba(255,140,40,0.55)');
          if (Math.random() < 0.3) g.parts.push({ x: sx + camX + 10 + Math.random() * 12, y: sy + camY + 14, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 0.8, max: 0.8, color: Math.random() < 0.5 ? '#ffb040' : '#ff6a20', size: 1, grav: 0, glow: true });
        } else if (o === Obj.FURNACE) this.glowAt(ctx, sx + 16, sy + 24, 22 + Math.sin(g.time * 7 + tx) * 2, 'rgba(255,120,30,0.45)');
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
    if (g.boss) this.glowAt(ctx, g.boss.x - camX, g.boss.y - camY, 90 + Math.sin(g.time * 4) * 8, 'rgba(255,40,90,0.25)');
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
    const placing = hd && (hd.kind === 'block' || hd.kind === 'wall' || hd.kind === 'place' || hd.kind === 'deed');
    let color: string | null = null;
    let ty = h.y;
    if (placing) color = 'rgba(255,215,90,0.55)';
    else if (h.ok) {
      ty = h.ty;
      const def = BLOCKS[g.world.get(h.x, h.y)];
      color = h.kind === 'block' && def.tier > g.st.pickTier ? 'rgba(255,110,80,0.9)' : 'rgba(255,255,255,0.85)';
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
    out.textAlign = 'center';
    out.textBaseline = 'middle';
    for (const t of g.texts) {
      const a = Math.min(1, t.life * 2);
      const size = Math.round((t.big ? 11 : 8) * s);
      out.font = `${size}px "Pixelify Sans", monospace`;
      out.globalAlpha = a;
      const x = Math.round((t.x - camX) * s);
      const y = Math.round((t.y - camY) * s);
      out.fillStyle = 'rgba(0,0,0,0.75)';
      out.fillText(t.text, x + s, y + s);
      out.fillStyle = t.color;
      out.fillText(t.text, x, y);
    }
    out.globalAlpha = 1;
    const pl = g.player;
    if (g.near && !g.ui.isOpen() && !pl.dead && !g.fishing) {
      const size = Math.round(8 * s);
      out.font = `${size}px "Pixelify Sans", monospace`;
      const label = `[E] ${g.near.label}`;
      const x = Math.round((pl.cx - camX) * s);
      const y = Math.round((pl.y - camY - 14) * s);
      const tw = out.measureText(label).width + 12 * s;
      out.fillStyle = 'rgba(14,10,20,0.8)';
      out.fillRect(x - tw / 2, y - size * 0.8, tw, size * 1.6);
      out.fillStyle = '#ffe9a8';
      out.fillText(label, x, y);
    }
    if (pl.recallT > 0) {
      const w = 40 * s;
      const x = Math.round((pl.cx - camX) * s - w / 2);
      const y = Math.round((pl.y - camY - 8) * s);
      out.fillStyle = 'rgba(0,0,0,0.7)';
      out.fillRect(x, y, w, 3 * s);
      out.fillStyle = '#7ac8ff';
      out.fillRect(x, y, w * (1 - pl.recallT / 1.6), 3 * s);
    }
  }
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

function groundRow(g: Game, x: number): number {
  for (let y = 0; y < g.world.h; y++) if (g.world.rock(x, y)) return y;
  return g.world.h - 1;
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

function drawBeam(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const top = sy - 2 * TILE;
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(sx + 1, top, 6, 3 * TILE);
  ctx.fillRect(sx + 25, top, 6, 3 * TILE);
  ctx.fillRect(sx - 4, top, 40, 7);
  ctx.fillStyle = '#7a4e26';
  ctx.fillRect(sx + 2, top, 3, 3 * TILE);
  ctx.fillRect(sx + 26, top, 3, 3 * TILE);
  ctx.fillRect(sx - 4, top, 40, 3);
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
