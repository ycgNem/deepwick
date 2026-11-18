import { A, makeCanvas, iconSrc, decorIcon } from './assets';
import { TILE, SURFACE_Y, TARGET_VIEW_H, SHAFT_X, CAMP_X0, CAMP_X1 } from './constants';
import { BLOCKS, B } from './data/blocks';
import { BIOMES } from './data/biomes';
import { ITEMS, CONSUMABLES } from './data/items';
import { Obj } from './world/world';
import { MINE_ENTRANCE_X, BOSS_CENTER } from './world/gen';
import type { Game } from './game';

const ROW = { idle: 0, walk: 1, jump: 2, hurt: 3, mine: 4, climb: 5 } as const;
const CELL = 68;

interface CampSprite {
  key: string;
  cx: number; // tile units
  flip?: boolean;
}
const CAMP_BUILDINGS: CampSprite[] = [
  { key: 'cabin', cx: 41.6 },
  { key: 'shop', cx: 46.5 },
  { key: 'headframe', cx: 56 },
  { key: 'forge', cx: 61.2 },
  { key: 'archive', cx: 66.6 },
  { key: 'cabin', cx: 71, flip: true },
];
const NPCS: CampSprite[] = [
  { key: 'npc_merchant', cx: 47.6 },
  { key: 'npc_smith', cx: 59.6 },
  { key: 'npc_archivist', cx: 65.2 },
];

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  glow: HTMLCanvasElement;
  scale = 2;
  dpr = 1;
  private backdrops: HTMLCanvasElement[] = [];
  private cracks: HTMLCanvasElement[] = [];
  private glowSprite: HTMLCanvasElement;
  private skyTop = '#1b1426';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    this.ctx = ctx;
    [this.scene, this.sctx] = makeCanvas(640, 360);
    [this.glow] = makeCanvas(64, 64);
    this.glowSprite = this.makeGlow();
    this.buildBackdrops();
    this.buildCracks();
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

  private buildBackdrops(): void {
    for (let i = 0; i < 5; i++) {
      const img = A.bg['cave' + i];
      const [c, g] = makeCanvas(img.width * 2, img.height * 2);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(img, x * img.width, y * img.height);
      g.fillStyle = 'rgba(6,4,10,0.45)';
      g.fillRect(0, 0, c.width, c.height);
      this.backdrops.push(c);
    }
    // sample the top colour of the sky image
    const [, sg] = makeCanvas(1, 1);
    sg.drawImage(A.bg.surface, 0, 0, 1, 1, 0, 0, 1, 1);
    const d = sg.getImageData(0, 0, 1, 1).data;
    this.skyTop = `rgb(${d[0]},${d[1]},${d[2]})`;
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

  private vignette: HTMLCanvasElement | null = null;

  draw(g: Game): void {
    const ctx = this.sctx;
    const vw = this.scene.width;
    const vh = this.scene.height;
    let camX = Math.round(g.camX);
    let camY = Math.round(g.camY);
    if (g.shake > 0) {
      camX += Math.round((Math.random() - 0.5) * g.shake);
      camY += Math.round((Math.random() - 0.5) * g.shake);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.drawSky(g, ctx, camX, camY, vw, vh);
    this.drawTiles(g, ctx, camX, camY, vw, vh);
    this.drawCamp(g, ctx, camX, camY);
    this.drawObjects(g, ctx, camX, camY, vw, vh, false);
    this.drawEntities(g, ctx, camX, camY);
    this.drawObjects(g, ctx, camX, camY, vw, vh, true);

    // ---- lighting
    const L = g.light;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(L.canvas, L.x0 * TILE - camX - TILE / 2 + TILE / 2, L.y0 * TILE - camY, L.w * TILE, L.h * TILE);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;

    // ---- additive glows
    this.drawGlows(g, ctx, camX, camY, vw, vh);
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);
    this.drawHover(g, ctx, camX, camY);

    // vignette + gloom + fade
    if (g.gloom > 0) {
      ctx.fillStyle = `rgba(20,0,30,${Math.min(0.5, g.gloom * 0.25)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    const pl = g.player;
    if (pl.hurtT > 0) {
      ctx.fillStyle = `rgba(160,0,0,${pl.hurtT * 0.8})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (pl.dead) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, pl.deadT * 0.4)})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    // ---- present
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
  private drawSky(_g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    ctx.fillStyle = this.skyTop;
    ctx.fillRect(0, 0, vw, vh);
    const img = A.bg.surface;
    const groundY = SURFACE_Y * TILE - camY;
    if (groundY < -40) {
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, 0, vw, vh);
      return;
    }
    const baseCam = SURFACE_Y * TILE - vh * 0.62;
    const bottom = vh * 0.62 + 70 - (camY - baseCam) * 0.45;
    const top = Math.round(bottom - img.height);
    const ox = -(((camX * 0.15) % img.width) + img.width) % img.width;
    for (let x = ox; x < vw; x += img.width) ctx.drawImage(img, Math.round(x), top);
    // dark ground beneath the image
    const imgBottom = top + img.height;
    if (imgBottom < vh) {
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, imgBottom, vw, vh - imgBottom);
    }
  }

  // ------------------------------------------------------------------ tiles
  private drawTiles(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE));
    const ty0 = Math.max(0, Math.floor(camY / TILE));
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE));
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE));
    const L = g.light;
    const t = g.time;
    // backdrops + walls
    for (let ty = ty0; ty <= ty1; ty++) {
      const bi = biomeIndexRow(ty);
      const bd = this.backdrops[Math.min(4, bi)];
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * w.w + tx;
        const fg = w.fg[i];
        if (fg !== B.AIR && !BLOCKS[fg].liquid) continue;
        if (!w.explored[i] && L.at(tx, ty) < 0.004) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        const wall = w.wall[i];
        if (wall) ctx.drawImage(A.wallTex[wall], sx, sy);
        else if (ty >= w.surface[tx]) {
          const bw = bd.width / 2;
          const bh = bd.height / 2;
          const srcX = mod(sx + camX * 0.5, bw);
          const srcY = mod(sy + camY * 0.5, bh);
          ctx.drawImage(bd, srcX, srcY, TILE, TILE, sx, sy, TILE, TILE);
        } else continue;
        // ambient occlusion where open space meets rock
        const su = w.solid(tx, ty - 1);
        const sl = w.solid(tx - 1, ty);
        const sr = w.solid(tx + 1, ty);
        const sd = w.solid(tx, ty + 1);
        if (su || sl || sr || sd) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          if (su) ctx.fillRect(sx, sy, TILE, 6);
          if (sl) ctx.fillRect(sx, sy, 5, TILE);
          if (sr) ctx.fillRect(sx + TILE - 5, sy, 5, TILE);
          if (sd) ctx.fillRect(sx, sy + TILE - 3, TILE, 3);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          if (su) ctx.fillRect(sx, sy + 6, TILE, 4);
          if (sl) ctx.fillRect(sx + 5, sy, 3, TILE);
          if (sr) ctx.fillRect(sx + TILE - 8, sy, 3, TILE);
        }
      }
    }
    // solid blocks
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * w.w + tx;
        const fg = w.fg[i];
        if (fg === B.AIR) continue;
        if (!w.explored[i] && L.at(tx, ty) < 0.004) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        const def = BLOCKS[fg];
        if (def.liquid) {
          // lava: scroll the texture and ripple the surface
          const off = Math.floor(t * 6) % 16;
          ctx.save();
          ctx.beginPath();
          const surfaceTop = w.get(tx, ty - 1) !== B.LAVA;
          const rip = surfaceTop ? 6 + Math.round(Math.sin(t * 3 + tx) * 2) : 0;
          ctx.rect(sx, sy + rip, TILE, TILE - rip);
          ctx.clip();
          ctx.drawImage(A.blockTex[fg], 0, 0, 32, 32, sx - off, sy, 32, 32);
          ctx.drawImage(A.blockTex[fg], 0, 0, 32, 32, sx - off + 32, sy, 32, 32);
          ctx.restore();
          if (surfaceTop) {
            ctx.fillStyle = '#ffe08a';
            ctx.fillRect(sx, sy + rip, TILE, 2);
          }
          continue;
        }
        ctx.drawImage(A.blockTex[fg], sx, sy);
        // edges where the block meets open space
        const up = !BLOCKS[w.get(tx, ty - 1)].solid;
        const dn = !BLOCKS[w.get(tx, ty + 1)].solid;
        const lf = !BLOCKS[w.get(tx - 1, ty)].solid;
        const rt = !BLOCKS[w.get(tx + 1, ty)].solid;
        if (up || dn || lf || rt) {
          ctx.fillStyle = 'rgba(6,3,8,0.78)';
          if (up) ctx.fillRect(sx, sy, TILE, 2);
          if (dn) ctx.fillRect(sx, sy + TILE - 3, TILE, 3);
          if (lf) ctx.fillRect(sx, sy, 2, TILE);
          if (rt) ctx.fillRect(sx + TILE - 2, sy, 2, TILE);
          ctx.fillStyle = 'rgba(255,240,215,0.22)';
          if (up) ctx.fillRect(sx + (lf ? 2 : 0), sy + 2, TILE - (lf ? 2 : 0) - (rt ? 2 : 0), 2);
          if (lf) ctx.fillRect(sx + 2, sy + 2, 1, TILE - 5);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          if (dn) ctx.fillRect(sx, sy + TILE - 6, TILE, 3);
          if (rt) ctx.fillRect(sx + TILE - 4, sy, 2, TILE);
          // rounded outer corners
          ctx.fillStyle = 'rgba(8,4,10,0.85)';
          if (up && lf) ctx.fillRect(sx, sy, 3, 3);
          if (up && rt) ctx.fillRect(sx + TILE - 3, sy, 3, 3);
          if (dn && lf) ctx.fillRect(sx, sy + TILE - 3, 3, 3);
          if (dn && rt) ctx.fillRect(sx + TILE - 3, sy + TILE - 3, 3, 3);
        }
        const dmg = w.damage.get(i);
        if (dmg) {
          const frac = 1 - dmg.hp / def.hp;
          const stage = Math.min(3, Math.floor(frac * 4));
          ctx.drawImage(this.cracks[stage], sx, sy);
        }
      }
    }
    // decor
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) {
      for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
        if (!w.inside(tx, ty)) continue;
        const i = ty * w.w + tx;
        const dc = w.decor[i];
        if (!dc) continue;
        const ref = decorIcon(dc);
        const src = iconSrc(ref);
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        const ceil = w.solid(tx, ty - 1) && !w.solid(tx, ty + 1);
        const dx = sx + (TILE - src.size) / 2;
        const dy = ceil ? sy : sy + TILE - src.size;
        ctx.drawImage(src.img, src.sx, src.sy, src.size, src.size, Math.round(dx), Math.round(dy), src.size, src.size);
      }
    }
  }

  // ------------------------------------------------------------------ camp
  private drawCamp(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const ground = SURFACE_Y * TILE - camY;
    if (ground < -200 || ground > this.scene.height + 400) return;
    // forest on the hills around camp
    const w = g.world;
    const tx0 = Math.max(3, Math.floor(camX / TILE) - 2);
    const tx1 = Math.min(w.w - 4, Math.floor((camX + this.scene.width) / TILE) + 2);
    for (let x = tx0; x <= tx1; x++) {
      if (x >= CAMP_X0 - 1 && x <= CAMP_X1 + 1) continue;
      const s = w.surface[x];
      if (s !== w.surface[x + 1] || !w.solid(x, s)) continue;
      const h = hash(x, w.seed);
      const key = h < 0.2 ? 'pine1' : h < 0.32 ? 'pine2' : h < 0.42 ? 'rocks' : null;
      if (!key) continue;
      const img = A.camp[key];
      const px = Math.round(x * TILE + 16 - img.width / 2 + (hash(x + 999, w.seed) - 0.5) * 12 - camX);
      ctx.drawImage(img, px, Math.round(s * TILE - camY - img.height + 3));
    }
    for (const b of CAMP_BUILDINGS) {
      const img = A.camp[b.key];
      const x = Math.round(b.cx * TILE - img.width / 2 - camX);
      const y = Math.round(ground - img.height + 4);
      if (b.flip) {
        ctx.save();
        ctx.translate(x + img.width, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } else ctx.drawImage(img, x, y);
    }
    // mine entrance frame + sign + campfire
    const ex = MINE_ENTRANCE_X * TILE - camX;
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(ex - 6, ground - 40, 6, 44);
    ctx.fillRect(ex + 32, ground - 40, 6, 44);
    ctx.fillRect(ex - 10, ground - 46, 52, 7);
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(ex - 10, ground - 46, 52, 3);
    const sign = iconSrc({ sheet: 'i32', idx: 48 });
    ctx.drawImage(sign.img, sign.sx, sign.sy, 32, 32, ex + 50, ground - 32, 32, 32);
    const fire = iconSrc({ sheet: 'i32', idx: 50 });
    const fx = 52.6 * TILE - camX - 16;
    ctx.drawImage(fire.img, fire.sx, fire.sy, 32, 32, Math.round(fx), ground - 30, 32, 32);
    for (const lx of [43.6, 58.3, 63.8, 69]) {
      const post = iconSrc({ sheet: 'i32', idx: 49 });
      ctx.drawImage(post.img, post.sx, post.sy, 32, 32, Math.round(lx * TILE - camX - 16), ground - 31, 32, 32);
    }
    // NPCs bob gently and face the player
    for (const n of NPCS) {
      const img = A.camp[n.key];
      const bob = Math.round(Math.sin(g.time * 2 + n.cx) * 0.8);
      const x = Math.round(n.cx * TILE - img.width / 2 - camX);
      const bbBottom = img.height - 1;
      const y = Math.round(ground - bbBottom + bob - 1);
      const faceRight = g.player.cx > n.cx * TILE;
      ctx.save();
      if (faceRight) {
        ctx.translate(x + img.width, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
      } else ctx.drawImage(img, x, y);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ objects
  private drawObjects(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number, front: boolean): void {
    const w = g.world;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const tx1 = Math.min(w.w - 1, Math.floor((camX + vw) / TILE) + 1);
    const ty1 = Math.min(w.h - 1, Math.floor((camY + vh) / TILE) + 3);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const o = w.obj[ty * w.w + tx];
        if (!o) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        if (!front) {
          if (o === Obj.LADDER) drawLadder(ctx, sx, sy);
          else if (o === Obj.BEAM) drawBeam(ctx, sx, sy);
          else if (o === Obj.LIFT) {
            const s = iconSrc({ sheet: 'i32', idx: 62 });
            ctx.drawImage(s.img, s.sx, s.sy, 32, 32, sx, sy, 32, 32);
            ctx.fillStyle = '#3a2a1a';
            ctx.fillRect(sx + 15, sy - 4 * TILE, 2, 4 * TILE);
          }
        } else {
          if (o === Obj.TORCH) {
            const s = iconSrc({ sheet: 'i16', idx: 21 });
            ctx.drawImage(s.img, s.sx, s.sy, 16, 16, sx + 8, sy + 10, 16, 16);
            const f = Math.floor(g.time * 12 + tx * 3) % 3;
            ctx.fillStyle = ['#ffd75a', '#ffb02a', '#fff0a0'][f];
            ctx.fillRect(sx + 15 + (f === 1 ? -1 : 0), sy + 7, 3, 3);
          } else if (o === Obj.CHEST || o === Obj.CHEST_OPEN) {
            const s = iconSrc({ sheet: 'i32', idx: o === Obj.CHEST ? 46 : 47 });
            ctx.drawImage(s.img, s.sx, s.sy, 32, 32, sx, sy + 2, 32, 32);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ entities
  private drawEntities(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    // satchel
    const sat = g.p.satchel;
    if (sat) {
      const s = iconSrc({ sheet: 'i32', idx: 61 });
      ctx.drawImage(s.img, s.sx, s.sy, 32, 32, Math.round(sat.x - 16 - camX), Math.round(sat.y - 16 - camY + Math.sin(g.time * 3) * 2), 32, 32);
    }
    // drops
    for (const d of g.drops) {
      const def = ITEMS[d.item];
      const ref = d.item === 'coin' ? { sheet: 'i16' as const, idx: 27 } : def?.kind === 'relic' ? { sheet: 'i16' as const, idx: 34 } : def?.icon ?? { sheet: 'i16' as const, idx: 34 };
      const s = iconSrc(ref.sheet === 'i32' ? { sheet: 'i16', idx: 34 } : ref);
      const bob = d.onGround ? Math.round(Math.sin(g.time * 4 + d.bob) * 1.5) - 2 : 0;
      ctx.drawImage(s.img, s.sx, s.sy, 16, 16, Math.round(d.x - 2 - camX), Math.round(d.y - 4 - camY + bob), 16, 16);
    }
    // bombs
    for (const b of g.bombs) {
      const s = iconSrc({ sheet: 'i16', idx: 23 });
      ctx.drawImage(s.img, s.sx, s.sy, 16, 16, Math.round(b.x - 2 - camX), Math.round(b.y - 4 - camY), 16, 16);
    }
    // enemies
    for (const e of g.enemies) {
      const img = A.enemies[e.def.id];
      const fs = e.def.size;
      const frames = Math.floor(img.width / fs);
      const f = 1 + (Math.floor(e.animT * e.def.fps) % (frames - 1));
      const x = Math.round(e.cx - fs / 2 - camX);
      const y = Math.round(e.y + e.h - fs + (fs - e.h) * 0.25 - camY);
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
    // boss
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
        // telegraph where it will land
        const fy = (BOSS_CENTER.y + 6) * TILE - camY;
        ctx.fillStyle = Math.floor(g.time * 12) % 2 ? 'rgba(255,60,90,0.8)' : 'rgba(255,200,90,0.8)';
        ctx.fillRect(Math.round(b.targetX - 60 - camX), fy - 3, 120, 3);
      }
    }
    // player
    const pl = g.player;
    if (!(pl.invuln > 0 && Math.floor(pl.invuln * 14) % 2 === 0 && !pl.dead)) {
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
    }
    // non-glow particles
    for (const q of g.parts) {
      if (q.glow) continue;
      ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), q.size, q.size);
    }
    ctx.globalAlpha = 1;
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
        if (o === Obj.TORCH) {
          const fl = 0.85 + Math.sin(g.time * 10 + tx) * 0.1;
          this.glowAt(ctx, sx + 16, sy + 9, 26 * fl, 'rgba(255,170,60,0.55)');
        }
        const fg = w.fg[i];
        if (fg === B.LUMENITE || fg === B.DIAMOND || fg === B.AMETHYST || fg === B.RUBY || fg === B.JADE || fg === B.RELIC_STONE) {
          // twinkle on precious blocks
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
    // camp lights
    const ground = SURFACE_Y * TILE - camY;
    for (const lx of [43.6, 58.3, 63.8, 69]) this.glowAt(ctx, lx * TILE - camX + 6, ground - 22, 30, 'rgba(255,190,90,0.45)');
    this.glowAt(ctx, 52.6 * TILE - camX, ground - 12, 46 + Math.sin(g.time * 9) * 3, 'rgba(255,140,40,0.5)');
    this.glowAt(ctx, (SHAFT_X + 0.1) * TILE - camX, ground - 20, 20, 'rgba(255,190,90,0.3)');
    // player lantern + headlamp
    const pl = g.player;
    if (!pl.dead && pl.oil > 0) {
      const hx = pl.cx + pl.facing * 6 - camX;
      this.glowAt(ctx, hx, pl.y + 8 - camY, 14, 'rgba(140,220,255,0.55)');
    }
    for (const d of g.drops) {
      const gl = ITEMS[d.item]?.glow ?? (d.item.startsWith('r_') ? '#ffd75a' : null);
      if (gl) this.glowAt(ctx, d.x + 6 - camX, d.y + 4 - camY, 14 + Math.sin(g.time * 5 + d.bob) * 3, hexA(gl, 0.6));
    }
    for (const s of g.shots) {
      this.glowAt(ctx, s.x - camX, s.y - camY, s.r * 3.5, hexA(s.color, 0.8));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(s.x - camX - 1), Math.round(s.y - camY - 1), 3, 3);
    }
    for (const e of g.enemies) if (e.def.glow) this.glowAt(ctx, e.cx - camX, e.cy - camY, 18, `rgba(${e.def.glow.map((v) => Math.round(v * 400)).join(',')},0.35)`);
    if (g.boss) this.glowAt(ctx, g.boss.x - camX, g.boss.y - camY, 90 + Math.sin(g.time * 4) * 8, 'rgba(255,40,90,0.25)');
    const sat = g.p.satchel;
    if (sat) this.glowAt(ctx, sat.x - camX, sat.y - camY, 24, 'rgba(120,255,140,0.45)');
    for (const q of g.parts) {
      if (!q.glow) continue;
      ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), q.size, q.size);
    }
    ctx.restore();
  }

  private glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    // tint the white radial sprite by drawing it through a coloured composite
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
    this.tintCache.set(color, c);
    return c;
  }

  private drawHover(g: Game, ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (g.ui.isOpen() || g.player.dead) return;
    const h = g.hoverTile;
    const sx = h.x * TILE - camX;
    const sy = h.y * TILE - camY;
    const def = BLOCKS[g.world.get(h.x, h.y)];
    const sel = CONSUMABLES[g.p.hotbar];
    let color: string | null = null;
    if (h.ok) color = def.tier > g.st.pickTier ? 'rgba(255,110,80,0.9)' : 'rgba(255,255,255,0.85)';
    else if (h.inReach && !def.solid && (sel === 'torch' || sel === 'ladder')) color = 'rgba(255,215,90,0.5)';
    if (!color) return;
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
    if (g.near && !g.ui.isOpen() && !pl.dead) {
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
