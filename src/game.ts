import { World, Obj } from './world/world';
import { generateWorld, worldSpawn, groundAt, BOSS_CENTER } from './world/gen';
import { LightMap, PointLight } from './world/light';
import { TILE, WORLD_W, DAY_LENGTH, INV_SIZE } from './constants';
import { BLOCKS, B, PLACED_WALLS } from './data/blocks';
import { BIOMES, biomeAt, DECOR_DROPS } from './data/biomes';
import { propOf } from './data/props';
import { ITEMS, ItemDef, RELICS, SHOP_STOCK, equipSlotOf } from './data/items';
import { ENEMIES, DAY_SURFACE, NIGHT_SURFACE } from './data/enemies';
import { RECIPES, Recipe, Station, STATION_OBJS } from './data/recipes';
import {
  Progress,
  Stats,
  Slot,
  Stack,
  Bounty,
  BuildingKind,
  EquipKey,
  computeStats,
  count,
  give,
  roomFor,
  takeItems,
  hasAll,
  heldDef,
  itemValue,
  nextRelic,
  bestPick,
  xpToNext,
  MAX_LEVEL,
  SkillId,
} from './state';
import { Player, Enemy, Drop, Projectile, Bomb, Particle, FloatText, moveBody, applyGravity, overlaps, inLiquid } from './entities';
import { Input } from './input';
import { audio, MusicId } from './audio';
import { updateEnemy } from './ai';
import { Boss, BOSS_HP } from './boss';
import { Rng } from './rng';

const JUMP_V = 480;
const AIR_JUMP_V = 440;
const TREE_HP = 5;
export const CHEST_SLOTS = 20;
export const BUILDING_W = 4;

export interface Interactable {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface UIHooks {
  toast(msg: string, color?: string): void;
  open(panel: string): void;
  isOpen(): boolean;
  close(): void;
  levelUp(skill: SkillId, lvl: number): void;
  victory(): void;
}

export type HoverKind = 'none' | 'block' | 'tree' | 'obj' | 'decor' | 'wall' | 'rail';

export const BUILDING_INFO: Record<BuildingKind, { sprite: string; npc: string; panel: string; label: string; name: string }> = {
  trade: { sprite: 'shop', npc: 'npc_merchant', panel: 'shop', label: 'Trade with Pell', name: 'Trading Post' },
  forge: { sprite: 'forge', npc: 'npc_smith', panel: 'smith', label: "Visit Brannoc's Forge", name: 'Forge' },
  archive: { sprite: 'archive', npc: 'npc_archivist', panel: 'archive', label: 'Talk to Wren (Archive)', name: 'Lantern Archive' },
};

/** item you get back when you break a placed object */
const OBJ_ITEM: Partial<Record<Obj, string>> = {
  [Obj.TORCH]: 'torch',
  [Obj.LADDER]: 'ladder',
  [Obj.WORKBENCH]: 'workbench',
  [Obj.FURNACE]: 'furnace',
  [Obj.ANVIL]: 'anvil',
  [Obj.ALCHEMY]: 'alchemy',
  [Obj.CAMPFIRE]: 'campfire',
  [Obj.STORAGE]: 'chest',
  [Obj.BED]: 'bed',
  [Obj.BED_R]: 'bed',
  [Obj.DOOR]: 'door',
  [Obj.DOOR_TOP]: 'door',
  [Obj.DOOR_OPEN]: 'door',
  [Obj.DOOR_OPEN_TOP]: 'door',
  [Obj.SAPLING]: 'sapling',
  [Obj.HEART_CRYSTAL]: 'heartcrystal',
  [Obj.MINECART]: 'minecart',
  [Obj.LAMP]: 'lamp',
};

/** objects that fall off when the block under them goes */
const NEEDS_FLOOR = new Set<number>([
  Obj.WORKBENCH,
  Obj.FURNACE,
  Obj.ANVIL,
  Obj.ALCHEMY,
  Obj.CAMPFIRE,
  Obj.STORAGE,
  Obj.BED,
  Obj.BED_R,
  Obj.DOOR,
  Obj.DOOR_OPEN,
  Obj.SAPLING,
  Obj.TREE,
  Obj.BUSH,
  Obj.BUSH_BERRY,
  Obj.CROP0,
  Obj.CROP1,
  Obj.CROP2,
  Obj.CROP3,
  Obj.HEART_CRYSTAL,
  Obj.CHEST,
  Obj.CHEST_OPEN,
  Obj.MINECART,
]);

/** a cart you are riding: centre x in px, the rail row it runs on, speed */
interface Ride {
  x: number;
  row: number;
  vx: number;
  rollT: number;
}
const CART_MAX = 560;

/** the grappling hook: flying out, bitten into rock and hauling you in, or reeling back empty */
export interface Hook {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
  back: boolean;
  /** reeled all the way in (or wedged): now hanging, climbing with W and S */
  hang: boolean;
  /** the tile it bit into */
  tx: number;
  ty: number;
  /** closest the rider has come to the anchor, and how long since that improved */
  best: number;
  stall: number;
}
const HOOK_RANGE = 11 * TILE;
const HOOK_SPEED = 1150;
const HOOK_PULL = 640;

export function sharpenCost(level: number): number {
  return Math.round(80 * Math.pow(1.7, level));
}
export const SHARPEN_MAX = 10;

export function daylight(c: number): number {
  if (c < 0.06) return 0.35 + 0.65 * (c / 0.06);
  if (c < 0.55) return 1;
  if (c < 0.63) return 1 - 0.88 * ((c - 0.55) / 0.08);
  if (c < 0.94) return 0.12;
  return 0.12 + 0.23 * ((c - 0.94) / 0.06);
}
export function isNight(c: number): boolean {
  return c >= 0.6 && c < 0.96;
}

export class Game {
  world: World;
  p: Progress;
  st: Stats;
  player = new Player();
  enemies: Enemy[] = [];
  drops: Drop[] = [];
  shots: Projectile[] = [];
  bombs: Bomb[] = [];
  parts: Particle[] = [];
  texts: FloatText[] = [];
  boss: Boss | null = null;
  light = new LightMap();
  camX = 0;
  camY = 0;
  viewW = 640;
  viewH = 360;
  scale = 2;
  time = 0;
  shake = 0;
  gloom = 0;
  fade = 0;
  fadeAction: (() => void) | null = null;
  spawnT = 1;
  saveT = 30;
  tickT = 0;
  biome = 0;
  near: Interactable | null = null;
  /** the minecart you are sitting in, if any */
  ride: Ride | null = null;
  /** the grappling hook, while it is out */
  hook: Hook | null = null;
  hoverTile = { x: 0, y: 0, inReach: false, kind: 'none' as HoverKind, tx: 0, ty: 0, ok: false };
  hintCooldown = 0;
  lowOilWarned = false;
  rng = new Rng(Date.now() & 0xffff);
  onSave: (() => void) | null = null;
  /** tile index of the storage chest the UI has open */
  openChest = -1;
  wasNight = false;

  constructor(
    public input: Input,
    public ui: UIHooks,
    p: Progress,
    world?: World,
  ) {
    this.p = p;
    this.world = world ?? generateWorld(p.seed);
    this.st = computeStats(p);
    const pl = this.player;
    pl.x = p.px - pl.w / 2;
    pl.y = p.py - pl.h;
    pl.hp = Math.min(p.hp, this.st.maxHp);
    pl.oil = this.st.oilMax > 0 ? Math.min(p.oil, this.st.oilMax) : p.oil;
    pl.fallStartY = pl.y;
    this.wasNight = isNight(p.clock);
    if (this.p.bounties.length === 0) this.refillBounties();
    this.reconcileRelics();
    if (this.p.bossRewardPending) setTimeout(() => this.grantBossReward(this.player.cx, this.player.cy), 800);
    this.snapCamera();
  }

  /**
   * Relics are marked as dropped when they spawn so the same one never drops twice. Ground
   * drops aren't saved, so after a reload any relic that isn't actually owned can drop again.
   */
  private reconcileRelics(): void {
    const owned = new Set<string>(this.p.catalogued);
    const add = (s: Slot | undefined): void => {
      if (s && s.id.startsWith('r_')) owned.add(s.id);
    };
    this.p.inv.forEach(add);
    for (const c of Object.values(this.p.chests)) c.forEach(add);
    for (const s of this.p.satchel?.items ?? []) add(s);
    this.p.relicsDropped = this.p.relicsDropped.filter((id) => owned.has(id));
  }

  private grantBossReward(x: number, y: number): void {
    this.p.bossRewardPending = false;
    this.drops.push(new Drop('r_heart', 1, x, y));
    this.drops.push(new Drop('coin', 2500, x, y));
    if (!this.p.relicsDropped.includes('r_heart')) this.p.relicsDropped.push('r_heart');
    audio.play('relic', { vary: 0 });
    this.burst(x, y, 80, ['#ffd75a', '#ffffff', '#ff4a7a'], 300, true);
    this.ui.victory();
    this.onSave?.();
  }

  // ------------------------------------------------------------------ helpers
  refresh(): void {
    this.st = computeStats(this.p);
    this.player.hp = Math.min(this.player.hp, this.st.maxHp);
    // without a lantern the oil you had waits for the next one
    if (this.st.oilMax > 0) this.player.oil = Math.min(this.player.oil, this.st.oilMax);
  }

  toast(msg: string, color?: string): void {
    this.ui.toast(msg, color);
  }

  hint(key: string, msg: string): void {
    if (this.p.seen[key]) return;
    this.p.seen[key] = true;
    this.ui.toast(msg, '#ffe9a8');
  }

  text(x: number, y: number, text: string, color: string, big = false): void {
    this.texts.push({ x, y, text, color, life: big ? 1.6 : 1.1, big });
  }

  burst(x: number, y: number, n: number, colors: string[], speed: number, glow = false): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.4 + Math.random() * 0.5;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life, max: life, color: colors[i % colors.length], size: Math.random() < 0.3 ? 3 : 2, grav: glow ? 0 : 600, glow });
    }
  }

  playerTile(): { x: number; y: number } {
    return { x: Math.floor(this.player.cx / TILE), y: Math.floor(this.player.cy / TILE) };
  }

  depthOf(tileY: number): number {
    return Math.max(0, tileY - this.world.surface[Math.max(0, Math.min(WORLD_W - 1, this.playerTile().x))]);
  }

  onSurface(): boolean {
    const pt = this.playerTile();
    return pt.y <= this.world.surface[Math.max(0, Math.min(WORLD_W - 1, pt.x))] + 3;
  }

  addXp(skill: SkillId, amount: number): void {
    const s = this.p.skills[skill];
    if (s.lvl >= MAX_LEVEL) return;
    s.xp += amount * this.st.xpMult[skill];
    let leveled = false;
    while (s.lvl < MAX_LEVEL && s.xp >= xpToNext(s.lvl)) {
      s.xp -= xpToNext(s.lvl);
      s.lvl++;
      leveled = true;
    }
    if (leveled) {
      audio.play('levelup', { vary: 0 });
      this.ui.levelUp(skill, s.lvl);
      this.text(this.player.cx, this.player.y - 10, `${skill.toUpperCase()} ${s.lvl}!`, '#ffd75a', true);
      this.burst(this.player.cx, this.player.cy, 24, ['#ffd75a', '#fff3b0'], 160, true);
      const before = this.st.maxHp;
      this.refresh();
      if (this.st.maxHp > before) this.player.hp += this.st.maxHp - before;
    }
  }

  /** put items in the inventory, dropping whatever does not fit at the player's feet */
  giveOrDrop(id: string, n: number): void {
    const left = give(this.p.inv, id, n);
    if (left > 0) {
      const d = new Drop(id, left, this.player.cx, this.player.cy);
      d.age = -1.5;
      this.drops.push(d);
    }
  }

  // ------------------------------------------------------------------ main update
  update(dt: number): void {
    this.time += dt;
    this.p.stats.time += dt;
    if (this.hintCooldown > 0) this.hintCooldown -= dt;
    if (this.fade > 0 || this.fadeAction) this.updateFade(dt);
    const menu = this.ui.isOpen();
    this.st = computeStats(this.p);
    this.player.hp = Math.min(this.player.hp, this.st.maxHp);
    if (!menu) {
      this.updateClock(dt);
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      if (this.boss) this.updateBoss(dt);
      this.randomTicks(dt);
    }
    this.updateDrops(dt);
    this.updateShots(dt);
    this.updateBombs(dt);
    this.updateParticles(dt);
    this.updateEnvironment(dt, menu);
    this.updateCamera(dt);
    this.computeLight();
    this.updateMusic();
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 30;
      this.onSave?.();
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
    if (this.gloom > 0) this.gloom -= dt;
  }

  private updateFade(dt: number): void {
    if (this.fadeAction) {
      this.fade = Math.min(1, this.fade + dt * 2.5);
      if (this.fade >= 1) {
        const a = this.fadeAction;
        this.fadeAction = null;
        a();
      }
    } else this.fade = Math.max(0, this.fade - dt * 2);
  }

  fadeTo(action: () => void): void {
    this.fadeAction = action;
  }

  // ------------------------------------------------------------------ day and night
  private updateClock(dt: number): void {
    const p = this.p;
    p.clock += dt / DAY_LENGTH;
    if (p.clock >= 1) {
      p.clock -= 1;
      p.stats.days++;
      this.toast(`Day ${p.stats.days}`, '#ffe9a8');
    }
    const night = isNight(p.clock);
    if (night && !this.wasNight) {
      this.toast('Night falls. The Hollows are rising...', '#b09aff');
      this.hint('night', 'At night Hollows roam the surface. Wall yourself in, add a door and torches, or sleep in a bed to skip the night.');
      audio.play('groan', { vol: 0.5, vary: 0 });
    } else if (!night && this.wasNight) this.toast('Dawn breaks.', '#ffd79a');
    this.wasNight = night;
  }

  skyColor(): [number, number, number] {
    const c = this.p.clock;
    const dl = daylight(c);
    const t = (dl - 0.12) / 0.88;
    const r = 0.1 + (1.02 - 0.1) * t;
    const g = 0.13 + (0.97 - 0.13) * t;
    const b = 0.27 + (0.92 - 0.27) * t;
    // warm sunsets and sunrises
    const warm = c > 0.5 && c < 0.66 ? 1 - Math.abs(c - 0.58) / 0.08 : c < 0.08 ? 1 - c / 0.08 : c > 0.95 ? (c - 0.95) / 0.05 : 0;
    const k = Math.max(0, warm) * 0.5;
    return [r + k * 0.25, g - k * 0.15, b - k * 0.35];
  }

  // ------------------------------------------------------------------ player
  private updatePlayer(dt: number): void {
    const pl = this.player;
    const inp = this.input;
    const st = this.st;
    if (pl.dead) {
      pl.deadT += dt;
      pl.vx *= 0.9;
      applyGravity(pl, dt);
      moveBody(this.world, pl, dt);
      if (pl.deadT > 2.6 && !this.fadeAction) this.fadeTo(() => this.respawn());
      return;
    }
    if (pl.invuln > 0) pl.invuln -= dt;
    if (pl.hurtT > 0) pl.hurtT -= dt;
    if (this.ride) {
      this.updateRide(dt);
      this.updateHotbarAndUse(dt);
      return;
    }

    const left = inp.isDown('KeyA', 'ArrowLeft');
    const right = inp.isDown('KeyD', 'ArrowRight');
    const up = inp.isDown('KeyW', 'ArrowUp');
    const down = inp.isDown('KeyS', 'ArrowDown');
    const jumpPressed = !inp.blocked && inp.wasPressed('Space');
    const jumpHeld = inp.isDown('Space');
    const liquid = inLiquid(this.world, pl);
    const hooked = this.updateHook(dt);

    // ladders
    const ptx = Math.floor(pl.cx / TILE);
    const onLadder = this.world.getObj(ptx, Math.floor((pl.y + pl.h - 4) / TILE)) === Obj.LADDER || this.world.getObj(ptx, Math.floor((pl.y + 6) / TILE)) === Obj.LADDER;
    const ladderBelow = this.world.getObj(ptx, Math.floor((pl.y + pl.h + 4) / TILE)) === Obj.LADDER;
    if (!hooked && !pl.climbing && ((onLadder && (up || down)) || (ladderBelow && down && pl.onGround))) {
      pl.climbing = true;
      pl.vx = 0;
      pl.x = ptx * TILE + TILE / 2 - pl.w / 2;
    }
    if (pl.climbing && !onLadder && !ladderBelow) pl.climbing = false;

    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (hooked) {
      this.hookPull(dt, dir, jumpPressed, up, down);
    } else if (pl.climbing) {
      pl.vy = ((down ? 1 : 0) - (up ? 1 : 0)) * 150;
      pl.vx = dir * 70;
      if (dir && !onLadder) pl.climbing = false;
      pl.jumpsUsed = 0;
      pl.fallStartY = pl.y;
      if (jumpPressed) {
        pl.climbing = false;
        pl.vy = -JUMP_V * 0.8;
        audio.play('jump', { vol: 0.5 });
      }
      moveBody(this.world, pl, dt, true);
      if (Math.abs(pl.vy) > 1 || Math.abs(pl.vx) > 1) pl.animT += dt;
    } else {
      const slow = this.p.food <= 0 ? 0.75 : 1;
      const maxV = 165 * st.speed * slow * (liquid ? 0.45 : 1);
      const accel = pl.onGround ? 1600 : 1000;
      const target = dir * maxV;
      if (pl.swinging && pl.onGround && !pl.attack) {
        pl.vx += (0 - pl.vx) * Math.min(1, dt * 14);
      } else if (dir !== 0) {
        pl.vx += Math.sign(target - pl.vx) * Math.min(Math.abs(target - pl.vx), accel * dt);
      } else {
        pl.vx += (0 - pl.vx) * Math.min(1, dt * (pl.onGround ? 14 : 3));
      }
      if (dir !== 0 && !pl.swinging) pl.facing = dir;

      if (pl.onGround) {
        pl.coyote = 0.1;
        pl.jumpsUsed = 0;
      } else pl.coyote -= dt;
      if (jumpPressed) pl.jumpBuffer = 0.13;
      else pl.jumpBuffer -= dt;
      if (pl.jumpBuffer > 0) {
        if (pl.onGround || pl.coyote > 0) {
          pl.vy = -JUMP_V * (liquid ? 0.7 : 1);
          pl.jumpsUsed = 1;
          pl.coyote = 0;
          pl.jumpBuffer = 0;
          pl.onGround = false;
          this.p.food = Math.max(0, this.p.food - 0.05);
          audio.play('jump', { vol: 0.5 });
        } else if (pl.jumpsUsed < st.jumps) {
          pl.vy = -AIR_JUMP_V;
          pl.jumpsUsed = Math.max(2, pl.jumpsUsed + 1);
          pl.jumpBuffer = 0;
          pl.fallStartY = pl.y;
          audio.play('jump', { vol: 0.5, pitch: 1.3 });
          this.burst(pl.cx, pl.y + pl.h, 10, ['#ffffff', '#ffe9a8'], 90, true);
        }
      }
      if (!jumpHeld && pl.vy < -220) pl.vy = -220;
      applyGravity(pl, dt, liquid ? 0.35 : 1);
      if (liquid && pl.vy > 120) pl.vy = 120;
      const wasGround = pl.onGround;
      const res = moveBody(this.world, pl, dt, down);
      if (wasGround && !pl.onGround && pl.vy >= 0) pl.fallStartY = pl.y;
      if (!pl.onGround && pl.vy < 0) pl.fallStartY = Math.min(pl.fallStartY, pl.y);
      if (pl.onGround && !wasGround) pl.fallStartY = Math.min(pl.fallStartY, pl.y);
      if (res.landed) {
        const tiles = (pl.y - pl.fallStartY) / TILE;
        if (tiles > st.fallSafe && !liquid) {
          const dmg = Math.round((tiles - st.fallSafe) * 7);
          this.hurtPlayer(dmg, pl.cx, true);
          this.text(pl.cx, pl.y, 'Ouch!', '#ff8a8a');
        }
        if (tiles > 2) this.burst(pl.cx, pl.y + pl.h, 6, ['#9a8a7a', '#6a5a4a'], 60);
        pl.fallStartY = pl.y;
      }
      if (pl.onGround) pl.fallStartY = pl.y;
    }

    this.updateHotbarAndUse(dt);

    if (!inp.blocked) {
      if (inp.mouseRightPressed) this.rightClick();
      if (inp.wasPressed('KeyE')) this.interact();
      if (inp.wasPressed('KeyR')) this.useFromInventory('recall');
      if (inp.wasPressed('KeyH')) this.useFromInventory('tonic');
      if (inp.wasPressed('KeyF')) this.useFromInventory('oil');
      if (inp.wasPressed('KeyQ')) this.dropHeld();
      if (inp.wasPressed('KeyG')) {
        if (this.hook) this.releaseHook(false);
        else if (count(this.p, 'grapple') > 0) this.fireGrapple();
        else this.toast('You have no Grappling Hook. Forge one at an anvil.');
      }
    }

    // recall channel
    if (pl.recallT > 0) {
      pl.recallT -= dt;
      if (Math.random() < dt * 40) this.burst(pl.cx + (Math.random() - 0.5) * 24, pl.y + pl.h, 1, ['#7ac8ff', '#ffffff'], 40, true);
      if (pl.recallT <= 0) {
        audio.play('teleport', { vary: 0 });
        this.fadeTo(() => this.teleportHome());
      }
    }

    // animation
    pl.animT += dt;
    if (pl.swinging) pl.anim = 'mine';
    else if (pl.climbing) pl.anim = 'climb';
    else if (!pl.onGround) pl.anim = 'jump';
    else if (Math.abs(pl.vx) > 20) pl.anim = 'walk';
    else pl.anim = 'idle';

    // satchel recovery
    const sat = this.p.satchel;
    if (sat && Math.hypot(sat.x - pl.cx, sat.y - pl.cy) < 30) {
      for (const s of sat.items) this.giveOrDrop(s.id, s.n);
      this.p.satchel = null;
      audio.play('chest_open', { vary: 0 });
      this.toast('Recovered your lost satchel!', '#9af0a0');
    }

    pl.x = Math.max(2 * TILE, Math.min(pl.x, (WORLD_W - 2) * TILE - pl.w));
  }

  private updateHotbarAndUse(dt: number): void {
    const inp = this.input;
    for (let i = 0; i < 10; i++) if (inp.wasPressed('Digit' + ((i + 1) % 10))) this.p.sel = i;
    if (inp.wheel !== 0 && !inp.blocked) this.p.sel = (this.p.sel + inp.wheel + 10) % 10;
    this.updateTargeting();
    this.updateUse(dt);
  }

  // ------------------------------------------------------------------ minecarts
  /** climb into the cart parked at a tile */
  private mountCart(tx: number, ty: number): void {
    const w = this.world;
    if (w.getObj(tx, ty) !== Obj.MINECART) return;
    this.hook = null;
    w.setObj(tx, ty, Obj.NONE);
    this.ride = { x: tx * TILE + TILE / 2, row: ty, vx: 0, rollT: 0 };
    const pl = this.player;
    pl.climbing = false;
    pl.vx = 0;
    pl.vy = 0;
    audio.play('cart_bump', { vol: 0.4, pitch: 1.3 });
    this.hint('cart', 'A / D to roll along the rails, Space to jump out. Carts ram anything in the way.');
  }

  /** park the cart on the nearest free rail tile and hop out, keeping some speed */
  private dismount(jump: boolean): void {
    const r = this.ride;
    if (!r) return;
    const w = this.world;
    const pl = this.player;
    let tx = Math.floor(r.x / TILE);
    for (const d of [0, -1, 1, -2, 2]) {
      const x = tx + d;
      if (w.hasRail(x, r.row) && !w.getObj(x, r.row) && !w.rock(x, r.row)) {
        tx = x;
        break;
      }
    }
    if (!w.getObj(tx, r.row) && !w.rock(tx, r.row)) w.setObj(tx, r.row, Obj.MINECART);
    else this.giveOrDrop('minecart', 1);
    this.ride = null;
    pl.vx = r.vx * 0.8;
    pl.vy = jump ? -JUMP_V * 0.85 : 0;
    pl.fallStartY = pl.y;
  }

  private updateRide(dt: number): void {
    const r = this.ride as Ride;
    const w = this.world;
    const pl = this.player;
    const inp = this.input;
    const dir = (inp.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (inp.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    if (dir) r.vx += dir * 900 * dt;
    else r.vx -= Math.sign(r.vx) * Math.min(Math.abs(r.vx), 110 * dt);
    r.vx = Math.max(-CART_MAX, Math.min(CART_MAX, r.vx));
    // the track must continue under the leading wheel, and the way must be clear
    const nx = r.x + r.vx * dt;
    const lead = Math.floor((nx + Math.sign(r.vx) * 15) / TILE);
    const blocked = !w.hasRail(lead, r.row) || w.rock(lead, r.row) || w.solid(lead, r.row - 1) || w.getObj(lead, r.row) === Obj.MINECART;
    if (r.vx !== 0 && blocked) {
      if (Math.abs(r.vx) > 200) {
        audio.play('cart_bump', { vol: 0.7 });
        this.shake = Math.max(this.shake, Math.abs(r.vx) / 90);
        this.burst(r.x + Math.sign(r.vx) * 16, (r.row + 1) * TILE - 6, 8, ['#ffd75a', '#8a8a9a'], 120, true);
      }
      const edge = Math.sign(r.vx) > 0 ? lead * TILE - 16 : (lead + 1) * TILE + 16;
      r.x = Math.sign(r.vx) > 0 ? Math.min(nx, edge) : Math.max(nx, edge);
      r.vx = 0;
    } else r.x = nx;
    // ram whatever is on the line
    if (Math.abs(r.vx) > 220) {
      for (const e of this.enemies) {
        if (e.dead || e.def.passive) continue;
        if (Math.abs(e.cx - r.x) < 26 && Math.abs(e.cy - ((r.row + 1) * TILE - 20)) < 34) {
          this.damageEnemy(e, r.vx > 0 ? -0.5 : Math.PI + 0.5, Math.round(Math.abs(r.vx) / 40));
          r.vx *= 0.55;
        }
      }
    }
    // sit the rider in the cart
    pl.x = r.x - pl.w / 2;
    pl.y = (r.row + 1) * TILE - 18 - pl.h;
    pl.vx = r.vx;
    pl.vy = 0;
    pl.onGround = true;
    pl.fallStartY = pl.y;
    if (Math.abs(r.vx) > 5) pl.facing = Math.sign(r.vx);
    pl.anim = pl.swinging ? 'mine' : 'idle';
    pl.animT += dt;
    // rumble
    r.rollT -= dt * (Math.abs(r.vx) / 120);
    if (Math.abs(r.vx) > 40 && r.rollT <= 0) {
      r.rollT = 1;
      audio.play('cart_roll', { vol: 0.25 + Math.min(0.35, Math.abs(r.vx) / 1200), pitch: 0.75 + Math.abs(r.vx) / 1100 });
      if (Math.random() < 0.5) this.parts.push({ x: r.x - Math.sign(r.vx) * 14, y: (r.row + 1) * TILE - 6, vx: -r.vx * 0.1, vy: -40, life: 0.3, max: 0.3, color: '#ffd75a', size: 1, grav: 300, glow: true });
    }
    if (!inp.blocked && inp.wasPressed('Space')) this.dismount(true);
    if (!w.hasRail(Math.floor(r.x / TILE), r.row) && !w.hasRail(Math.floor((r.x - 14) / TILE), r.row) && !w.hasRail(Math.floor((r.x + 14) / TILE), r.row)) this.dismount(false);
  }

  // ------------------------------------------------------------------ grappling hook
  private fireGrapple(): void {
    const pl = this.player;
    if (this.ride || pl.dead || pl.recallT > 0 || this.hook) return;
    const m = this.mouseWorld();
    const ox = pl.cx;
    const oy = pl.y + 14;
    const a = Math.atan2(m.y - oy, m.x - ox);
    this.hook = { x: ox, y: oy, vx: Math.cos(a) * HOOK_SPEED, vy: Math.sin(a) * HOOK_SPEED, stuck: false, back: false, hang: false, tx: 0, ty: 0, best: Infinity, stall: 0 };
    pl.facing = m.x >= pl.cx ? 1 : -1;
    audio.play('swing', { pitch: 0.6, vol: 0.8 });
    this.hint('grapple', 'The hook bites into rock and hauls you to it. Hanging, W and S climb the rope; Space jumps off, G lets go.');
  }

  /** let go: the empty hook reels back to your hand */
  private releaseHook(jump: boolean): void {
    const h = this.hook;
    if (!h) return;
    const pl = this.player;
    if (h.stuck) {
      h.stuck = false;
      h.hang = false;
      h.back = true;
      pl.fallStartY = pl.y;
      if (jump) {
        pl.vy = -JUMP_V * 0.85;
        pl.jumpsUsed = 1;
        pl.onGround = false;
        audio.play('jump', { vol: 0.5 });
      }
    } else h.back = true;
  }

  /** move the hook; true while it is bitten in and hauling the player */
  private updateHook(dt: number): boolean {
    const h = this.hook;
    if (!h) return false;
    const pl = this.player;
    const w = this.world;
    const ox = pl.cx;
    const oy = pl.y + 14;
    if (h.stuck) {
      // the rock it bit into may have been mined out from under it
      if (!w.solid(h.tx, h.ty)) {
        this.releaseHook(false);
        return false;
      }
      return true;
    }
    if (h.back) {
      const dx = ox - h.x;
      const dy = oy - h.y;
      const d = Math.hypot(dx, dy);
      const step = HOOK_SPEED * 1.4 * dt;
      if (d <= step + 10) this.hook = null;
      else {
        h.x += (dx / d) * step;
        h.y += (dy / d) * step;
      }
      return false;
    }
    // fly in short steps so it cannot skip through a thin wall
    const steps = Math.max(1, Math.ceil((Math.hypot(h.vx, h.vy) * dt) / 8));
    for (let s = 0; s < steps; s++) {
      h.x += (h.vx * dt) / steps;
      h.y += (h.vy * dt) / steps;
      const tx = Math.floor(h.x / TILE);
      const ty = Math.floor(h.y / TILE);
      if (w.solid(tx, ty)) {
        h.stuck = true;
        h.tx = tx;
        h.ty = ty;
        h.best = Infinity;
        h.stall = 0;
        pl.climbing = false;
        audio.play('pick_hit', { pitch: 1.5, vol: 0.7 });
        this.burst(h.x, h.y, 6, ['#c8c8d8', '#8a8a9a'], 70);
        return true;
      }
      if (Math.hypot(h.x - ox, h.y - oy) > HOOK_RANGE) {
        h.back = true;
        return false;
      }
    }
    return false;
  }

  /** hauled along the rope toward the anchor, then hanging from it */
  private hookPull(dt: number, dir: number, jumpPressed: boolean, up: boolean, down: boolean): void {
    const h = this.hook as Hook;
    const pl = this.player;
    pl.fallStartY = pl.y;
    pl.jumpsUsed = 0;
    if (jumpPressed) {
      this.releaseHook(true);
      moveBody(this.world, pl, dt);
      return;
    }
    const dx = h.x - pl.cx;
    const dy = h.y - (pl.y + 14);
    const d = Math.hypot(dx, dy);
    if (!h.hang) {
      // hauled in along the rope; wedged under a ledge, you just hang where you are
      const k = Math.min(1, dt * 12);
      pl.vx += ((dx / d) * HOOK_PULL - pl.vx) * k;
      pl.vy += ((dy / d) * HOOK_PULL - pl.vy) * k;
      if (d < h.best - 3) {
        h.best = d;
        h.stall = 0;
      } else h.stall += dt;
      if (d <= 34 || h.stall > 0.35) {
        h.hang = true;
        pl.vx *= 0.2;
        pl.vy *= 0.2;
      }
    } else {
      // hanging: W climbs the rope, S lets it out, A and D sway a little
      const k = Math.min(1, dt * 14);
      if (up && d > 34) {
        pl.vx += ((dx / d) * 150 - pl.vx) * k;
        pl.vy += ((dy / d) * 150 - pl.vy) * k;
      } else {
        const tvy = down && d < HOOK_RANGE ? 160 : 0;
        pl.vy += (tvy - pl.vy) * k;
        pl.vx += (dir * 70 - pl.vx) * Math.min(1, dt * 8);
        // the rope only lets you drift so far to either side of the anchor
        const reach = 24 + Math.max(0, -dy) * 0.35;
        const nx = pl.cx + pl.vx * dt - h.x;
        if (Math.abs(nx) > reach && Math.sign(nx) === Math.sign(pl.vx)) pl.vx = 0;
      }
    }
    if (Math.abs(dx) > 4) pl.facing = Math.sign(dx);
    moveBody(this.world, pl, dt);
    // feet on the floor: the rope goes slack and you stand
    if (h.hang && pl.onGround) {
      this.releaseHook(false);
      return;
    }
    pl.onGround = false;
  }

  // ------------------------------------------------------------------ rails
  private placeRail(x: number, y: number): boolean {
    const w = this.world;
    if (!this.emptyAt(x, y) && w.getObj(x, y) !== Obj.BEAM && w.getObj(x, y) !== Obj.TORCH) return false;
    if (w.rock(x, y) || BLOCKS[w.get(x, y)].liquid || w.hasRail(x, y)) return false;
    if (!w.rock(x, y + 1)) {
      this.text(x * TILE + 16, y * TILE, 'Rails need a floor', '#ff9a6a');
      return false;
    }
    w.setRail(x, y, true);
    w.decor[w.idx(x, y)] = 0;
    this.hint('rail', 'Lay a line of rails, then set a Minecart on it and press E to ride.');
    return true;
  }

  private hitRail(x: number, y: number): void {
    const w = this.world;
    if (!w.hasRail(x, y) || w.getObj(x, y) === Obj.MINECART) return;
    w.setRail(x, y, false);
    this.drops.push(new Drop('rail', 1, x * TILE + 16, y * TILE + 20));
    audio.play('block_break', { vol: 0.5, pitch: 1.4 });
    this.burst(x * TILE + 16, y * TILE + 26, 6, ['#8a8a9a', '#6a4220'], 80);
  }

  mouseWorld(): { x: number; y: number } {
    return { x: this.input.mouseX / this.scale + this.camX, y: this.input.mouseY / this.scale + this.camY };
  }

  private updateTargeting(): void {
    const m = this.mouseWorld();
    const tx = Math.floor(m.x / TILE);
    const ty = Math.floor(m.y / TILE);
    const pl = this.player;
    const w = this.world;
    const d = Math.hypot(tx * TILE + TILE / 2 - pl.cx, ty * TILE + TILE / 2 - pl.cy);
    const h = this.hoverTile;
    h.x = tx;
    h.y = ty;
    h.tx = tx;
    h.ty = ty;
    h.inReach = d <= this.st.reach * TILE;
    h.kind = 'none';
    h.ok = false;
    if (!w.inside(tx, ty)) return;
    const hd = heldDef(this.p);
    if (hd?.kind === 'hammer') {
      if (!w.rock(tx, ty) && w.getWall(tx, ty) && !BLOCKS[w.getWall(tx, ty)].unbreakable) h.kind = 'wall';
      h.ok = h.inReach && h.kind === 'wall';
      return;
    }
    // tree trunks: the tree object sits on the ground tile under the cursor's column
    for (let k = 0; k <= 3; k++) {
      if (w.getObj(tx, ty + k) === Obj.TREE) {
        h.kind = 'tree';
        h.ty = ty + k;
        h.ok = h.inReach;
        return;
      }
      if (w.rock(tx, ty + k)) break;
    }
    const o = w.getObj(tx, ty);
    if (o) {
      h.kind = 'obj';
      h.ok = h.inReach;
      return;
    }
    const b = w.get(tx, ty);
    if (w.hasRail(tx, ty) && !BLOCKS[b].solid && hd?.id !== 'rail' && !(hd && (hd.kind === 'block' || hd.kind === 'place'))) {
      h.kind = 'rail';
      h.ok = h.inReach;
      return;
    }
    if (BLOCKS[b].solid) {
      h.kind = 'block';
      h.ok = h.inReach && !BLOCKS[b].unbreakable && !this.isProtected(tx, ty);
      return;
    }
    if (w.decor[w.idx(tx, ty)]) {
      h.kind = 'decor';
      h.ok = h.inReach;
      return;
    }
    // the sprite of a big formation covers tiles around its anchor
    const pr = this.propUnder(m.x, m.y);
    if (pr) {
      h.x = pr.x;
      h.y = pr.y;
      h.tx = pr.x;
      h.ty = pr.y;
      h.kind = 'decor';
      h.inReach = Math.hypot(pr.x * TILE + TILE / 2 - pl.cx, pr.y * TILE + TILE / 2 - pl.cy) <= (this.st.reach + 1) * TILE;
      h.ok = h.inReach;
    }
  }

  /** the big formation whose picture is under a world point, if any */
  propUnder(px: number, py: number): { x: number; y: number } | null {
    const w = this.world;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!w.inside(x, y)) continue;
        const p = propOf(w.decor[w.idx(x, y)]);
        if (!p) continue;
        const left = x * TILE + 16 - p.w / 2;
        const top = p.anchor === 'floor' ? (y + 1) * TILE + 3 - p.h : y * TILE - 5;
        if (px >= left + 5 && px <= left + p.w - 5 && py >= top + 4 && py <= top + p.h - 2) return { x, y };
      }
    }
    return null;
  }

  /** ground under a settler's building can't be dug away */
  isProtected(tx: number, ty: number): boolean {
    for (const b of this.p.buildings) {
      if (tx >= b.x - BUILDING_W / 2 && tx < b.x + BUILDING_W / 2 && ty >= b.y && ty <= b.y + 1) return true;
    }
    return false;
  }

  private enemyNearCursor(): boolean {
    const m = this.mouseWorld();
    const pl = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (m.x > e.x - 10 && m.x < e.x + e.w + 10 && m.y > e.y - 10 && m.y < e.y + e.h + 10) return true;
      if (Math.hypot(e.cx - pl.cx, e.cy - pl.cy) < 58 && Math.sign(e.cx - pl.cx) === Math.sign(m.x - pl.cx)) return true;
    }
    if (this.boss && !this.boss.dead && Math.hypot(this.boss.x - pl.cx, this.boss.y - pl.cy) < this.boss.r + 70) return true;
    return false;
  }

  // ------------------------------------------------------------------ using the held item
  private updateUse(dt: number): void {
    const pl = this.player;
    const inp = this.input;
    if (pl.useT > 0) pl.useT -= dt;
    // a swing in progress always plays out, whatever is in hand now
    if (pl.swinging) this.advanceSwing(dt);
    if (inp.blocked || pl.recallT > 0) return;
    const hd = heldDef(this.p);
    const kind = hd?.kind;
    // a click shorter than one frame still counts
    const lmb = inp.mouseLeft || inp.mouseLeftPressed;
    const press = inp.mouseLeftPressed;
    if (hd && kind === 'bow') {
      if (lmb && pl.useT <= 0) this.fireBow(hd);
      return;
    }
    if (hd && hd.id === 'grapple') {
      if (press) {
        if (this.hook) this.releaseHook(false);
        else this.fireGrapple();
      }
      return;
    }
    // with something that is not a tool in hand, a click on anything breakable breaks it
    // (with the best pickaxe on your hotbar); a click on empty space uses the item instead
    const tool = kind === 'pick' || kind === 'hammer' || kind === 'sword';
    if (hd && !tool && !this.wantsToBreak()) {
      if (kind === 'block' || kind === 'wall' || kind === 'place' || kind === 'deed') {
        if (lmb && pl.useT <= 0) this.placeHeld(hd, press);
        return;
      }
      if (kind === 'food') {
        if (press) this.eat(hd);
        return;
      }
      if (kind === 'use') {
        if (press) this.useItem(hd.id);
        return;
      }
    }
    // pickaxe, hammer, sword, bare hands, anything else: swing
    if (!pl.swinging && lmb) {
      const h = this.hoverTile;
      // world loot chests open with a click
      if (inp.mouseLeftPressed && h.inReach && this.world.getObj(h.x, h.y) === Obj.CHEST) {
        this.lootChest(h.x, h.y);
        return;
      }
      pl.swinging = true;
      pl.swingT = 0;
      pl.swingHit = false;
      pl.swingTarget = null;
      const sword = kind === 'sword';
      pl.attack = sword || this.enemyNearCursor() || !h.ok;
      if (!pl.attack) {
        pl.swingTarget = { x: h.x, y: h.ty };
        pl.swingKind = h.kind === 'wall' ? 'wall' : 'mine';
      }
      const m = this.mouseWorld();
      pl.facing = m.x >= pl.cx ? 1 : -1;
      if (pl.attack) audio.play('swing', { vol: 0.5 });
      this.p.food = Math.max(0, this.p.food - 0.02);
    }
  }

  /** is the cursor on something a swing would break or hit? */
  private wantsToBreak(): boolean {
    if (this.enemyNearCursor()) return true;
    const h = this.hoverTile;
    if (!h.inReach || !h.ok) return false;
    if (h.kind === 'block' || h.kind === 'tree' || h.kind === 'obj' || h.kind === 'rail') return true;
    if (h.kind === 'decor') return !!propOf(this.world.decor[this.world.idx(h.x, h.ty)]);
    return false;
  }

  private advanceSwing(dt: number): void {
    const pl = this.player;
    if (!pl.swinging) return;
    const hd = heldDef(this.p);
    const hands = this.st.pickTier === 0 && hd?.kind !== 'sword' && hd?.kind !== 'hammer';
    const rate = pl.attack ? 1 / (hd?.cd ?? 0.32) : (this.st.mineSpeed / 0.34) * (hands ? 0.8 : 1);
    pl.swingT += dt * rate;
    if (!pl.swingHit && pl.swingT >= 0.5) {
      pl.swingHit = true;
      if (pl.attack) this.doAttack();
      else if (pl.swingTarget) {
        const { x, y } = pl.swingTarget;
        const k = this.hoverTile.kind;
        if (pl.swingKind === 'wall') this.hitWall(x, y);
        else if (this.world.getObj(x, y) === Obj.TREE) this.hitTree(x, y);
        else if (k === 'rail' && !this.world.getObj(x, y)) this.hitRail(x, y);
        else if (this.world.getObj(x, y)) this.hitObj(x, y);
        else if (this.world.rock(x, y)) this.hitBlock(x, y);
        else if (k === 'decor' || this.world.decor[this.world.idx(x, y)]) this.harvestDecor(x, y);
      }
    }
    if (pl.swingT >= 1) pl.swinging = false;
  }

  private doAttack(): void {
    const pl = this.player;
    const m = this.mouseWorld();
    const a = Math.atan2(m.y - pl.cy, m.x - pl.cx);
    const hx = pl.cx + Math.cos(a) * 26;
    const hy = pl.cy + Math.sin(a) * 22;
    const R = heldDef(this.p)?.kind === 'sword' ? 40 : 32;
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const nx = Math.max(e.x, Math.min(hx, e.x + e.w));
      const ny = Math.max(e.y, Math.min(hy, e.y + e.h));
      if (Math.hypot(nx - hx, ny - hy) > R) continue;
      hitAny = true;
      this.damageEnemy(e, a);
    }
    if (this.boss && !this.boss.dead && this.boss.intro <= 0 && Math.hypot(this.boss.x - hx, this.boss.y - hy) < this.boss.r + R) {
      hitAny = true;
      const crit = Math.random() < 0.08;
      const dmg = Math.round(this.st.attack * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1) * this.boss.damageMult());
      this.damageBoss(dmg, hx, hy, crit);
    }
    if (hitAny) this.shake = Math.max(this.shake, 2);
  }

  private damageBoss(dmg: number, hx: number, hy: number, crit: boolean): void {
    const b = this.boss;
    if (!b) return;
    b.hp -= dmg;
    b.flash = 0.12;
    this.text(hx, hy - 10, String(dmg), crit ? '#ffd75a' : '#ffffff', crit);
    this.burst(hx, hy, 8, ['#ff4a7a', '#a05aff'], 140, true);
    audio.play('enemy_hit', { pitch: 0.7 });
    this.shake = Math.max(this.shake, 2);
    if (b.hp <= 0) this.killBoss();
  }

  damageEnemy(e: Enemy, ang: number, dmgOverride?: number): void {
    const crit = dmgOverride === undefined && Math.random() < 0.08;
    const dmg = dmgOverride ?? Math.round(this.st.attack * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1));
    e.hp -= dmg;
    e.flash = 0.12;
    e.knock = 0.18;
    e.vx = Math.cos(ang) * 260;
    e.vy = Math.sin(ang) * 200 - 120;
    if (e.def.behavior === 'charger') {
      e.provoked = true;
      if (e.mode === 0) e.mode = 1;
    }
    if (e.def.behavior === 'critter') e.mode = 1;
    this.text(e.cx, e.y - 4, String(Math.max(1, Math.round(dmg))), crit ? '#ffd75a' : '#ffffff', crit);
    this.burst(e.cx, e.cy, 6, ['#ffffff', '#ffb0b0'], 120);
    audio.play('enemy_hit');
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.p.stats.kills++;
    this.p.seen['kill_' + e.def.id] = true;
    audio.play('enemy_die');
    this.burst(e.cx, e.cy, 18, ['#ffffff', '#c8c0d8', e.def.shot ?? '#a09080'], 150);
    this.addXp('combat', e.def.xp);
    for (const d of e.def.drops) {
      if (Math.random() < d.chance) this.drops.push(new Drop(d.id, this.rng.int(d.n[0], d.n[1]), e.cx, e.cy));
    }
    const coins = this.rng.int(e.def.coins[0], e.def.coins[1]);
    if (coins > 0) this.drops.push(new Drop('coin', coins, e.cx, e.cy));
    for (const b of this.p.bounties) if (b.kind === 'slay' && b.target === e.def.id) b.have = Math.min(b.need, b.have + 1);
  }

  // ------------------------------------------------------------------ breaking things
  private tierName(tier: number): string {
    const names = ['bare hands', 'a wooden or stone pickaxe', 'a copper pickaxe', 'an iron pickaxe', 'a silver pickaxe', 'a goldforged pickaxe', 'a voidsteel pickaxe'];
    return names[Math.min(tier, names.length - 1)] ?? 'a better pickaxe';
  }

  hitBlock(tx: number, ty: number): void {
    const b = this.world.get(tx, ty);
    const def = BLOCKS[b];
    if (!def.solid || def.unbreakable || this.isProtected(tx, ty)) return;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    if (def.tier > this.st.pickTier) {
      audio.play('pick_hit', { pitch: 1.6, vol: 0.6 });
      this.burst(cx, cy, 5, ['#ffffff', '#ffd75a'], 120, true);
      if (this.hintCooldown <= 0) {
        this.text(cx, cy - 18, `Needs ${this.tierName(def.tier)}`, '#ff9a6a');
        this.hintCooldown = 1.2;
      }
      if (def.tier === 1) this.hint('needPick', 'Stone is too hard for bare hands. Chop wood, make a Workbench (Tab to craft) and then a Wooden Pickaxe.');
      return;
    }
    const i = this.world.idx(tx, ty);
    let d = this.world.damage.get(i);
    if (!d) {
      d = { hp: def.hp, t: 0 };
      this.world.damage.set(i, d);
    }
    d.hp -= this.st.pickPower;
    d.t = 0;
    audio.play('pick_hit', { vol: 0.7 });
    this.shake = Math.max(this.shake, 1.2);
    this.chips(cx, cy, def.color);
    if (d.hp <= 0) this.breakBlock(tx, ty, true);
  }

  private chips(cx: number, cy: number, color: string): void {
    for (let k = 0; k < 4; k++) {
      const life = 0.3 + Math.random() * 0.3;
      this.parts.push({ x: cx + (Math.random() - 0.5) * 20, y: cy + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, life, max: life, color, size: 2, grav: 700, glow: false });
    }
  }

  breakBlock(tx: number, ty: number, byPlayer: boolean): void {
    const w = this.world;
    const b = w.get(tx, ty);
    const def = BLOCKS[b];
    const i = w.idx(tx, ty);
    const placedByYou = w.placed[i] === 1;
    w.placed[i] = 0;
    w.set(tx, ty, B.AIR);
    w.damage.delete(i);
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    // decor resting on (or hanging from) this block goes with it; big formations break loose
    if (ty > 0) {
      const up = w.decor[w.idx(tx, ty - 1)];
      if (propOf(up)?.anchor === 'floor') this.harvestDecor(tx, ty - 1);
      else if (up && !propOf(up) && !w.rock(tx, ty - 2)) w.decor[w.idx(tx, ty - 1)] = 0;
    }
    if (ty + 1 < w.h) {
      const dn = w.decor[w.idx(tx, ty + 1)];
      if (propOf(dn)?.anchor === 'ceil') this.harvestDecor(tx, ty + 1);
      else if (dn && !propOf(dn) && !w.rock(tx, ty + 2)) w.decor[w.idx(tx, ty + 1)] = 0;
    }
    // objects standing on it fall
    const above = w.getObj(tx, ty - 1);
    if (above && NEEDS_FLOOR.has(above)) {
      if (above === Obj.TREE) this.fellTree(tx, ty - 1);
      else this.breakObj(tx, ty - 1, true);
    }
    this.checkTorches(tx, ty);
    // rails need their floor, lamps their ceiling
    if (w.hasRail(tx, ty - 1)) {
      w.setRail(tx, ty - 1, false);
      this.drops.push(new Drop('rail', 1, cx, cy - TILE));
    }
    if (w.getObj(tx, ty + 1) === Obj.LAMP) this.breakObj(tx, ty + 1, true);

    this.p.stats.mined++;
    this.burst(cx, cy, 12, [def.color, '#3a3030', def.color], 140);
    if (byPlayer && !placedByYou) this.addXp('mining', def.xp);
    if (def.drop) {
      if (def.drop === '@relic') {
        const biome = biomeAt(ty).id;
        const r = nextRelic(this.p, biome);
        if (r) {
          this.p.relicsDropped.push(r);
          this.drops.push(new Drop(r, 1, cx, cy));
          audio.play('relic', { vary: 0 });
          this.burst(cx, cy, 30, ['#ffd75a', '#fff3b0', '#ffffff'], 200, true);
          this.text(cx, cy - 20, 'A relic!', '#ffd75a', true);
        } else {
          this.drops.push(new Drop('coin', 20 + biome * 40, cx, cy));
          this.addXp('delving', 15 + biome * 10);
        }
      } else {
        let n = 1;
        if (def.ore && Math.random() < this.st.doubleChance) {
          n = 2;
          this.text(cx, cy - 16, 'Double!', '#9af0ff');
        }
        this.drops.push(new Drop(def.drop, n, cx, cy));
        if (def.ore) this.p.stats.ores++;
      }
    }
    if (def.ore || def.light) audio.play('ore_break', { vol: 0.8 });
    else audio.play('block_break', { vol: 0.65 });
  }

  /** torches with nothing left to hold them drop */
  private checkTorches(tx: number, ty: number): void {
    const w = this.world;
    for (const [x, y] of [
      [tx - 1, ty],
      [tx + 1, ty],
      [tx, ty - 1],
      [tx, ty + 1],
    ]) {
      if (w.getObj(x, y) !== Obj.TORCH) continue;
      const held = w.getWall(x, y) || w.rock(x - 1, y) || w.rock(x + 1, y) || w.rock(x, y + 1) || w.rock(x, y - 1);
      if (!held) this.breakObj(x, y, true);
    }
  }

  private hitTree(tx: number, ty: number): void {
    const i = this.world.idx(tx, ty);
    let d = this.world.damage.get(i);
    if (!d) {
      d = { hp: TREE_HP, t: 0 };
      this.world.damage.set(i, d);
    }
    const hd = heldDef(this.p);
    const power = this.st.pickTier > 0 && hd?.kind !== 'sword' ? this.st.pickPower : hd?.kind === 'sword' ? 0.7 : 0.6;
    d.hp -= power;
    d.t = 0;
    audio.play('chop', { vol: 0.8 });
    this.shake = Math.max(this.shake, 1);
    const cx = tx * TILE + TILE / 2;
    for (let k = 0; k < 3; k++) {
      const life = 0.5 + Math.random() * 0.4;
      this.parts.push({ x: cx + (Math.random() - 0.5) * 40, y: ty * TILE - 40 - Math.random() * 40, vx: (Math.random() - 0.5) * 60, vy: 20 + Math.random() * 40, life, max: life, color: Math.random() < 0.5 ? '#4a8a2a' : '#6aa83a', size: 2, grav: 120, glow: false });
    }
    this.chips(cx, ty * TILE + 16, '#7a4e26');
    this.hint('chop', 'Keep swinging to fell the tree. Wood builds almost everything.');
    if (d.hp <= 0) this.fellTree(tx, ty);
  }

  fellTree(tx: number, ty: number): void {
    const w = this.world;
    w.setObj(tx, ty, 0);
    w.damage.delete(w.idx(tx, ty));
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE;
    const kind = treeKind(tx, w.seed);
    const wood = kind === 0 ? this.rng.int(5, 8) : kind === 1 ? this.rng.int(4, 6) : this.rng.int(3, 5);
    for (let k = 0; k < wood; k++) this.drops.push(new Drop('wood', 1, cx + (Math.random() - 0.5) * 24, cy - Math.random() * 60));
    if (Math.random() < 0.6) this.drops.push(new Drop('sapling', this.rng.int(1, 2), cx, cy - 40));
    if (kind === 0 && Math.random() < 0.3) this.drops.push(new Drop('berries', this.rng.int(1, 3), cx, cy - 60));
    this.burst(cx, cy - 50, 30, ['#4a8a2a', '#6aa83a', '#2a5a1a', '#d8b040'], 160);
    audio.play('block_break', { pitch: 0.6 });
    this.addXp('mining', 3);
  }

  private hitObj(tx: number, ty: number): void {
    const w = this.world;
    const o = w.getObj(tx, ty);
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    if (o === Obj.BUSH_BERRY) {
      this.harvestBush(tx, ty);
      return;
    }
    if (o === Obj.CROP3) {
      this.harvestCrop(tx, ty);
      return;
    }
    if (o === Obj.CHEST) {
      this.lootChest(tx, ty);
      return;
    }
    if (o === Obj.STORAGE) {
      const items = this.p.chests[String(w.idx(tx, ty))];
      if (items && items.some((s) => s)) {
        this.text(cx, cy - 16, 'Empty it first', '#ff9a6a');
        return;
      }
    }
    if (o === Obj.HEART_CRYSTAL && this.st.pickTier < 1) {
      this.text(cx, cy - 16, 'Needs a pickaxe', '#ff9a6a');
      return;
    }
    // sturdier things take a few hits
    const sturdy = o === Obj.WORKBENCH || o === Obj.FURNACE || o === Obj.ANVIL || o === Obj.ALCHEMY || o === Obj.STORAGE || o === Obj.HEART_CRYSTAL || o === Obj.BED || o === Obj.BED_R || o === Obj.DOOR || o === Obj.DOOR_TOP || o === Obj.DOOR_OPEN || o === Obj.DOOR_OPEN_TOP;
    if (sturdy) {
      const i = w.idx(tx, ty);
      let d = w.damage.get(i);
      if (!d) {
        d = { hp: o === Obj.HEART_CRYSTAL ? 4 : 2.2, t: 0 };
        w.damage.set(i, d);
      }
      d.hp -= Math.max(0.8, this.st.pickPower);
      d.t = 0;
      audio.play('pick_hit', { vol: 0.6, pitch: o === Obj.HEART_CRYSTAL ? 1.5 : 0.9 });
      this.chips(cx, cy, o === Obj.HEART_CRYSTAL ? '#ff6a9a' : '#8a5a32');
      if (d.hp > 0) return;
    }
    this.breakObj(tx, ty, true);
  }

  /** remove an object (and its other half) and drop its item */
  breakObj(tx: number, ty: number, dropItem: boolean): void {
    const w = this.world;
    const o = w.getObj(tx, ty);
    if (!o) return;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    // an unopened treasure chest spills its loot rather than vanishing
    if (o === Obj.CHEST) this.lootChest(tx, ty);
    // a storage chest broken by anything (a bomb, digging under it) spills what it held
    if (o === Obj.STORAGE) {
      const key = String(w.idx(tx, ty));
      for (const st of this.p.chests[key] ?? []) if (st) this.drops.push(new Drop(st.id, st.n, cx + (Math.random() - 0.5) * 12, cy - 6));
      if (this.openChest === w.idx(tx, ty) && this.ui.isOpen()) this.ui.close();
    }
    w.setObj(tx, ty, 0);
    w.damage.delete(w.idx(tx, ty));
    // partner halves
    if (o === Obj.BED && w.getObj(tx + 1, ty) === Obj.BED_R) w.setObj(tx + 1, ty, 0);
    if (o === Obj.BED_R && w.getObj(tx - 1, ty) === Obj.BED) w.setObj(tx - 1, ty, 0);
    if ((o === Obj.DOOR || o === Obj.DOOR_OPEN) && [Obj.DOOR_TOP, Obj.DOOR_OPEN_TOP].includes(w.getObj(tx, ty - 1))) w.setObj(tx, ty - 1, 0);
    if ((o === Obj.DOOR_TOP || o === Obj.DOOR_OPEN_TOP) && [Obj.DOOR, Obj.DOOR_OPEN].includes(w.getObj(tx, ty + 1))) w.setObj(tx, ty + 1, 0);
    if (o === Obj.STORAGE) delete this.p.chests[String(w.idx(tx, ty))];
    if (o === Obj.BED || o === Obj.BED_R) {
      const sx = o === Obj.BED ? tx : tx - 1;
      if (this.p.spawn.x === sx && this.p.spawn.y === ty) {
        const s = worldSpawn(w);
        this.p.spawn = s;
        this.toast('Your bed is gone. You will wake at the meadow again.', '#ffb08a');
      }
    }
    if (dropItem) {
      let item = OBJ_ITEM[o as Obj];
      if (o === Obj.BEAM) item = 'wood';
      if (o === Obj.CROP0 || o === Obj.CROP1 || o === Obj.CROP2) item = 'seeds';
      if (o === Obj.BUSH) {
        item = undefined;
        if (Math.random() < 0.3) this.drops.push(new Drop('seeds', 1, cx, cy));
      }
      if (item) this.drops.push(new Drop(item, 1, cx, cy));
      if (o === Obj.TREE) this.fellTree(tx, ty);
    }
    this.burst(cx, cy, 8, ['#8a5a32', '#c89a5a'], 100);
    audio.play('block_break', { vol: 0.5, pitch: 1.2 });
    // anything standing on top of it
    const above = w.getObj(tx, ty - 1);
    if (above && NEEDS_FLOOR.has(above) && !w.rock(tx, ty)) {
      if (above === Obj.TREE) this.fellTree(tx, ty - 1);
      else this.breakObj(tx, ty - 1, true);
    }
  }

  private hitWall(tx: number, ty: number): void {
    const w = this.world;
    const wall = w.getWall(tx, ty);
    if (!wall || w.rock(tx, ty)) return;
    const i = w.idx(tx, ty);
    let d = w.damage.get(i);
    if (!d) {
      d = { hp: 1.5, t: 0 };
      w.damage.set(i, d);
    }
    d.hp -= 0.8;
    d.t = 0;
    audio.play('pick_hit', { vol: 0.5, pitch: 0.7 });
    this.chips(tx * TILE + 16, ty * TILE + 16, BLOCKS[wall].color);
    if (d.hp > 0) return;
    w.setWall(tx, ty, 0);
    w.damage.delete(i);
    const item = PLACED_WALLS[wall];
    if (item) this.drops.push(new Drop(item, 1, tx * TILE + 16, ty * TILE + 16));
    this.checkTorches(tx, ty);
    if (w.getObj(tx, ty) === Obj.TORCH) this.checkTorches(tx, ty + 1);
  }

  private harvestDecor(tx: number, ty: number): void {
    const w = this.world;
    const i = w.idx(tx, ty);
    const dc = w.decor[i];
    if (!dc) return;
    w.decor[i] = 0;
    const drop = DECOR_DROPS[dc];
    const cx = tx * TILE + 16;
    const cy = ty * TILE + 16;
    if (drop && Math.random() < drop.chance) {
      const n = drop.n ? drop.n[0] + Math.floor(Math.random() * (drop.n[1] - drop.n[0] + 1)) : 1;
      this.drops.push(new Drop(drop.id, n, cx, cy));
    }
    const prop = propOf(dc);
    if (prop) {
      const cols: Record<string, string[]> = {
        mushroom: ['#4af0d0', '#b0fff0', '#8a6aa0'],
        crystal: ['#b47aee', '#f0dcff', '#6a3aa8'],
        magma: ['#ff8a2a', '#3a3040', '#ffd060'],
        ruin: ['#5a4a7a', '#7af0ff', '#3a2e50'],
        roots: ['#4a7a2a', '#6a4a2a', '#8ad050'],
      };
      const midY = prop.anchor === 'floor' ? (ty + 1) * TILE - prop.h / 2 : ty * TILE + prop.h / 2;
      this.burst(cx, midY, 22, cols[prop.kind] ?? ['#9a8a70', '#6a5a4a', '#c8b898'], 150, prop.kind === 'mushroom' || prop.kind === 'crystal');
      audio.play(prop.kind === 'mushroom' || prop.kind === 'roots' ? 'rustle' : 'block_break', { vol: 0.75 });
      this.shake = Math.max(this.shake, 2);
      return;
    }
    this.burst(cx, cy, 6, ['#6aa83a', '#a0d060', '#c8b090'], 70);
    audio.play('rustle', { vol: 0.6 });
  }

  private harvestBush(tx: number, ty: number): void {
    this.world.setObj(tx, ty, Obj.BUSH);
    const cx = tx * TILE + 16;
    this.drops.push(new Drop('berries', this.rng.int(2, 3), cx, ty * TILE + 10));
    this.burst(cx, ty * TILE + 16, 8, ['#d0203a', '#4a8a2a'], 80);
    audio.play('rustle', { vary: 0.15 });
    this.hint('berries', 'Berries! Hold them and click to eat. Watch your Food bar: you starve without it.');
  }

  private harvestCrop(tx: number, ty: number): void {
    this.world.setObj(tx, ty, Obj.CROP0);
    const cx = tx * TILE + 16;
    this.drops.push(new Drop('wheat', this.rng.int(1, 3), cx, ty * TILE + 10));
    if (Math.random() < 0.7) this.drops.push(new Drop('seeds', 1, cx, ty * TILE + 10));
    audio.play('rustle', { vary: 0.15 });
  }

  // ------------------------------------------------------------------ placing
  private bodyBlocks(tx: number, ty: number): boolean {
    const r = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
    if (overlaps(this.player, r)) return true;
    for (const e of this.enemies) if (!e.dead && overlaps(e, r)) return true;
    return false;
  }

  private emptyAt(tx: number, ty: number): boolean {
    const w = this.world;
    return w.inside(tx, ty) && !w.rock(tx, ty) && !BLOCKS[w.get(tx, ty)].liquid && !w.getObj(tx, ty);
  }

  private placeHeld(hd: ItemDef, press = true): void {
    const h = this.hoverTile;
    const pl = this.player;
    const w = this.world;
    if (!h.inReach) return;
    const { x, y } = h;
    if (!w.inside(x, y)) return;
    let ok = false;
    if (hd.kind === 'block' && hd.block !== undefined) {
      if (!this.emptyAt(x, y) || this.bodyBlocks(x, y)) return;
      const touching = w.getWall(x, y) || w.rock(x - 1, y) || w.rock(x + 1, y) || w.rock(x, y - 1) || w.rock(x, y + 1) || w.getObj(x, y + 1) === Obj.LADDER;
      if (!touching) return;
      w.set(x, y, hd.block);
      w.decor[w.idx(x, y)] = 0;
      w.placed[w.idx(x, y)] = 1;
      ok = true;
      pl.useT = 0.14;
    } else if (hd.kind === 'wall' && hd.wall !== undefined) {
      if (w.rock(x, y) || w.getWall(x, y)) return;
      const touching = w.getWall(x - 1, y) || w.getWall(x + 1, y) || w.getWall(x, y - 1) || w.getWall(x, y + 1) || w.rock(x - 1, y) || w.rock(x + 1, y) || w.rock(x, y - 1) || w.rock(x, y + 1);
      if (!touching) return;
      w.setWall(x, y, hd.wall);
      ok = true;
      pl.useT = 0.08;
    } else if (hd.kind === 'deed' && hd.deed) {
      if (!press) return;
      ok = this.placeBuilding(hd.deed, x);
      pl.useT = 0.5;
    } else if (hd.id === 'rail') {
      ok = this.placeRail(x, y);
      pl.useT = 0.08;
    } else if (hd.kind === 'place' && hd.obj !== undefined) {
      ok = this.placeObj(hd.obj, x, y);
      pl.useT = 0.2;
    }
    if (!ok) return;
    takeItems(this.p, hd.id, 1);
    if (hd.kind !== 'deed') audio.play(hd.id === 'torch' ? 'torch' : 'place', { vol: 0.7 });
    pl.swinging = true;
    pl.swingT = 0.4;
    pl.swingHit = true;
  }

  private placeObj(o: Obj, x: number, y: number): boolean {
    const w = this.world;
    if (!this.emptyAt(x, y)) return false;
    const floor = w.rock(x, y + 1);
    switch (o) {
      case Obj.TORCH: {
        const anchored = w.getWall(x, y) || w.rock(x - 1, y) || w.rock(x + 1, y) || w.rock(x, y + 1) || w.rock(x, y - 1);
        if (!anchored) {
          this.text(x * TILE + 16, y * TILE, 'Nothing to mount it on', '#ff9a6a');
          return false;
        }
        w.setObj(x, y, Obj.TORCH);
        this.burst(x * TILE + 16, y * TILE + 12, 10, ['#ffd75a', '#ff8a2a'], 80, true);
        this.hint('torch', 'Torches light the way home, and creatures will not spawn in their glow.');
        return true;
      }
      case Obj.LADDER: {
        const ok = w.isAnchor(x, y) || w.getObj(x, y - 1) === Obj.LADDER || w.getObj(x, y + 1) === Obj.LADDER || floor;
        if (!ok) return false;
        w.setObj(x, y, Obj.LADDER);
        return true;
      }
      case Obj.BED: {
        if (!floor || !this.emptyAt(x + 1, y) || !w.rock(x + 1, y + 1)) {
          this.text(x * TILE + 16, y * TILE, 'Needs 2 tiles of flat floor', '#ff9a6a');
          return false;
        }
        w.setObj(x, y, Obj.BED);
        w.setObj(x + 1, y, Obj.BED_R);
        this.hint('bed', 'Right-click the bed to set your spawn point. At night you can sleep until morning.');
        return true;
      }
      case Obj.DOOR: {
        if (!floor || !this.emptyAt(x, y - 1) || this.bodyBlocks(x, y) || this.bodyBlocks(x, y - 1)) {
          this.text(x * TILE + 16, y * TILE, 'Needs a 1x2 gap on the floor', '#ff9a6a');
          return false;
        }
        w.setObj(x, y, Obj.DOOR);
        w.setObj(x, y - 1, Obj.DOOR_TOP);
        return true;
      }
      case Obj.SAPLING:
      case Obj.CROP0: {
        const soil = w.get(x, y + 1);
        if (soil !== B.GRASS && soil !== B.DIRT) {
          this.text(x * TILE + 16, y * TILE, 'Plant it on grass or dirt', '#ff9a6a');
          return false;
        }
        w.setObj(x, y, o);
        w.decor[w.idx(x, y)] = 0;
        return true;
      }
      case Obj.MINECART: {
        if (!w.hasRail(x, y)) {
          this.text(x * TILE + 16, y * TILE, 'Set it on a rail', '#ff9a6a');
          return false;
        }
        w.setObj(x, y, o);
        this.hint('cartplace', 'Press E next to the cart to climb in.');
        return true;
      }
      case Obj.LAMP: {
        if (!w.rock(x, y - 1)) {
          this.text(x * TILE + 16, y * TILE, 'Hang it from a ceiling', '#ff9a6a');
          return false;
        }
        w.setObj(x, y, o);
        return true;
      }
      case Obj.STORAGE: {
        if (!floor) return false;
        w.setObj(x, y, o);
        this.p.chests[String(w.idx(x, y))] = new Array<Slot>(CHEST_SLOTS).fill(null);
        return true;
      }
      default: {
        if (!floor) {
          this.text(x * TILE + 16, y * TILE, 'Needs a floor', '#ff9a6a');
          return false;
        }
        w.setObj(x, y, o);
        w.decor[w.idx(x, y)] = 0;
        if (o === Obj.WORKBENCH) this.hint('bench', 'Workbench placed! Open your inventory (Tab) next to it to see what you can craft.');
        if (o === Obj.CAMPFIRE) this.hint('fire', 'Resting by a campfire heals you. Cook raw meat on it from the crafting list.');
        return true;
      }
    }
  }

  private placeBuilding(kind: BuildingKind, x: number): boolean {
    const w = this.world;
    const info = BUILDING_INFO[kind];
    if (this.p.buildings.some((b) => b.kind === kind)) {
      this.toast(`${info.name} is already built.`);
      return false;
    }
    if (this.p.buildings.some((b) => Math.abs(b.x - x) < BUILDING_W + 2)) {
      this.toast('Too close to another building.', '#ff9a6a');
      return false;
    }
    const x0 = x - BUILDING_W / 2;
    const gy = groundAt(w, x);
    if (gy > w.surface[x] + 4 || x0 < 4 || x0 + BUILDING_W > w.w - 4) {
      this.toast('Settlers want open ground under the sky.', '#ff9a6a');
      return false;
    }
    // level the plot: fill dips with dirt, clear bumps and plants
    for (let cx = x0 - 2; cx < x0 + BUILDING_W + 2; cx++) {
      const edge = cx < x0 - 1 || cx >= x0 + BUILDING_W + 1;
      for (let cy = gy - 5; cy < gy; cy++) {
        if (w.getObj(cx, cy) === Obj.TREE) this.fellTree(cx, cy);
        else if (w.getObj(cx, cy) && !edge) this.breakObj(cx, cy, true);
        if (!edge && w.rock(cx, cy)) {
          const drop = BLOCKS[w.get(cx, cy)].drop;
          if (drop && !drop.startsWith('@')) this.drops.push(new Drop(drop, 1, cx * TILE + 16, cy * TILE + 16));
          w.set(cx, cy, B.AIR);
        }
        w.decor[w.idx(cx, cy)] = 0;
      }
      if (edge) continue;
      for (let cy = gy; cy < gy + 4; cy++) {
        if (w.rock(cx, cy)) continue;
        if (w.getObj(cx, cy)) this.breakObj(cx, cy, true);
        w.set(cx, cy, cy === gy ? B.GRASS : B.DIRT);
      }
    }
    // anyone standing in a dip that was just filled in is lifted onto the new ground
    const top = gy * TILE;
    const lift = (b: { x: number; y: number; w: number; h: number; vy: number }): void => {
      if (b.x + b.w <= (x0 - 1) * TILE || b.x >= (x0 + BUILDING_W + 1) * TILE) return;
      if (b.y + b.h <= top || b.y >= top + 4 * TILE) return;
      b.y = top - b.h - 0.5;
      b.vy = 0;
    };
    lift(this.player);
    this.player.fallStartY = this.player.y;
    for (const e of this.enemies) if (!e.dead) lift(e);
    this.p.buildings.push({ kind, x, y: gy });
    audio.play('upgrade', { vary: 0 });
    this.burst(x * TILE, gy * TILE - 40, 50, ['#ffd75a', '#ffffff', '#c89a5a'], 220, true);
    this.shake = 6;
    const msg: Record<BuildingKind, string> = {
      trade: 'Pell has set up a Trading Post! Sell ore and buy supplies (E to talk).',
      forge: "Brannoc's Forge is open! He sharpens picks and hones blades.",
      archive: 'Wren opens the Lantern Archive! Bring relics, take bounties.',
    };
    this.toast(msg[kind], '#9af0a0');
    this.onSave?.();
    return true;
  }

  // ------------------------------------------------------------------ eating, items, bows
  private eat(hd: ItemDef): void {
    const pl = this.player;
    if (pl.eatT > this.time) return;
    if (this.p.food >= 99 && pl.hp >= this.st.maxHp) {
      this.text(pl.cx, pl.y - 6, 'Full', '#e8e0d0');
      return;
    }
    pl.eatT = this.time + 0.45;
    takeItems(this.p, hd.id, 1);
    this.p.food = Math.min(100, this.p.food + (hd.food ?? 0));
    if (hd.heal) pl.hp = Math.min(this.st.maxHp, pl.hp + hd.heal);
    audio.play('eat');
    this.text(pl.cx, pl.y - 4, `+${hd.food} food`, '#ffc890');
    this.burst(pl.cx + pl.facing * 6, pl.y + 10, 6, ['#c87a4a', '#ffe0b0'], 50);
  }

  private fireBow(hd: ItemDef): void {
    const pl = this.player;
    if (count(this.p, 'arrows') <= 0) {
      if (this.hintCooldown <= 0) {
        this.text(pl.cx, pl.y - 6, 'No arrows', '#ff9a6a');
        this.hintCooldown = 1;
      }
      return;
    }
    takeItems(this.p, 'arrows', 1);
    const m = this.mouseWorld();
    const a = Math.atan2(m.y - (pl.y + 14), m.x - pl.cx);
    const v = hd.id === 'crystalbow' ? 760 : 560;
    const dmg = ((hd.dmg ?? 5) + (ITEMS.arrows.dmg ?? 0)) * (1 + (this.p.skills.combat.lvl - 1) * 0.03);
    this.shots.push({ x: pl.cx, y: pl.y + 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: Math.round(dmg), color: hd.id === 'crystalbow' ? '#d0a0ff' : '#e8d8b0', life: 2.5, r: 4, gravity: hd.id === 'crystalbow' ? 220 : 520, hostile: false, arrow: true });
    pl.facing = m.x >= pl.cx ? 1 : -1;
    pl.useT = hd.cd ?? 0.6;
    pl.swinging = true;
    pl.attack = true;
    pl.swingT = 0.3;
    pl.swingHit = true;
    audio.play('bow');
  }

  private useFromInventory(id: string): void {
    if (count(this.p, id) <= 0) {
      this.toast(`No ${ITEMS[id].name} in your pack.`);
      return;
    }
    this.useItem(id);
  }

  useItem(id: string): void {
    const pl = this.player;
    if (count(this.p, id) <= 0) return;
    switch (id) {
      case 'bomb': {
        const m = this.mouseWorld();
        const a = Math.atan2(m.y - pl.cy, m.x - pl.cx);
        const bomb = new Bomb(pl.cx, pl.cy - 6, Math.cos(a) * 330 + pl.vx * 0.5, Math.sin(a) * 330 - 120);
        bomb.tier = bestPick(this.p)?.tier ?? 0;
        this.bombs.push(bomb);
        audio.play('swing');
        break;
      }
      case 'oil':
        if (this.st.oilMax <= 0) {
          this.toast('You need a lantern equipped to use lamp oil.');
          return;
        }
        if (pl.oil >= this.st.oilMax - 1) return;
        pl.oil = Math.min(this.st.oilMax, pl.oil + this.st.oilMax * 0.6);
        audio.play('drink', { pitch: 1.2 });
        this.text(pl.cx, pl.y, '+Oil', '#ffc85a');
        this.lowOilWarned = false;
        break;
      case 'tonic':
        if (pl.hp >= this.st.maxHp) return;
        pl.hp = Math.min(this.st.maxHp, pl.hp + this.st.maxHp * 0.5);
        audio.play('drink');
        this.text(pl.cx, pl.y, '+HP', '#ff6a7a');
        this.burst(pl.cx, pl.cy, 12, ['#ff6a7a', '#ffb0b0'], 80, true);
        break;
      case 'recall':
        if (pl.recallT > 0) return;
        pl.recallT = 1.6;
        this.text(pl.cx, pl.y - 6, 'Recalling...', '#7ac8ff');
        break;
      case 'grapple':
        if (this.hook) this.releaseHook(false);
        else this.fireGrapple();
        return;
      case 'heartcrystal':
        if (this.p.hearts >= 10) {
          this.toast('Your heart can hold no more crystals.');
          return;
        }
        this.p.hearts++;
        this.refresh();
        pl.hp = Math.min(this.st.maxHp, pl.hp + 10);
        audio.play('relic', { vary: 0 });
        this.burst(pl.cx, pl.cy, 30, ['#ff6a9a', '#ffd0e0', '#ffffff'], 160, true);
        this.text(pl.cx, pl.y - 10, '+10 max health', '#ff8ab0', true);
        break;
      default:
        return;
    }
    takeItems(this.p, id, 1);
  }

  /** throw the held stack (Q) */
  private dropHeld(): void {
    const s = this.p.inv[this.p.sel];
    if (!s) return;
    this.p.inv[this.p.sel] = null;
    const d = new Drop(s.id, s.n, this.player.cx + this.player.facing * 20, this.player.cy);
    d.vx = this.player.facing * 200;
    d.age = -1.2;
    this.drops.push(d);
  }

  /** drop a stack out of the inventory UI into the world */
  dropStack(s: Stack): void {
    const d = new Drop(s.id, s.n, this.player.cx + this.player.facing * 20, this.player.cy);
    d.vx = this.player.facing * 200;
    d.age = -1.2;
    this.drops.push(d);
  }

  // ------------------------------------------------------------------ interacting
  private rightClick(): void {
    const h = this.hoverTile;
    const o = h.inReach ? this.world.getObj(h.x, h.y) : 0;
    if (o && this.useObj(h.x, h.y, o)) return;
    // nothing to interact with: right click places or uses what you hold (Minecraft style)
    const hd = heldDef(this.p);
    if (!hd || this.player.useT > 0) return;
    if (hd.kind === 'block' || hd.kind === 'wall' || hd.kind === 'place' || hd.kind === 'deed') this.placeHeld(hd, true);
    else if (hd.kind === 'food') this.eat(hd);
    else if (hd.kind === 'use') this.useItem(hd.id);
  }

  private useObj(tx: number, ty: number, o: number): boolean {
    const w = this.world;
    switch (o) {
      case Obj.STORAGE:
        this.openChest = w.idx(tx, ty);
        if (!this.p.chests[String(this.openChest)]) this.p.chests[String(this.openChest)] = new Array<Slot>(CHEST_SLOTS).fill(null);
        audio.play('chest_open', { vol: 0.6, vary: 0 });
        this.ui.open('chest');
        return true;
      case Obj.CHEST:
        this.lootChest(tx, ty);
        return true;
      case Obj.BED:
      case Obj.BED_R:
        this.useBed(o === Obj.BED ? tx : tx - 1, ty);
        return true;
      case Obj.DOOR:
      case Obj.DOOR_TOP:
      case Obj.DOOR_OPEN:
      case Obj.DOOR_OPEN_TOP:
        this.toggleDoor(tx, o === Obj.DOOR_TOP || o === Obj.DOOR_OPEN_TOP ? ty + 1 : ty);
        return true;
      case Obj.BUSH_BERRY:
        this.harvestBush(tx, ty);
        return true;
      case Obj.MINECART:
        this.mountCart(tx, ty);
        return true;
      case Obj.CROP3:
        this.harvestCrop(tx, ty);
        return true;
      case Obj.WORKBENCH:
      case Obj.FURNACE:
      case Obj.ANVIL:
      case Obj.ALCHEMY:
      case Obj.CAMPFIRE:
        audio.play('click');
        this.ui.open('inv');
        return true;
    }
    return false;
  }

  private toggleDoor(tx: number, ty: number): void {
    const w = this.world;
    const o = w.getObj(tx, ty);
    if (o === Obj.DOOR) {
      w.setObj(tx, ty, Obj.DOOR_OPEN);
      w.setObj(tx, ty - 1, Obj.DOOR_OPEN_TOP);
    } else if (o === Obj.DOOR_OPEN) {
      if (this.bodyBlocks(tx, ty) || this.bodyBlocks(tx, ty - 1)) return;
      w.setObj(tx, ty, Obj.DOOR);
      w.setObj(tx, ty - 1, Obj.DOOR_TOP);
    } else return;
    audio.play('door', { vol: 0.7 });
  }

  private useBed(tx: number, ty: number): void {
    const p = this.p;
    const changed = p.spawn.x !== tx || p.spawn.y !== ty;
    p.spawn = { x: tx, y: ty };
    if (isNight(p.clock) || p.clock > 0.56) {
      const danger = this.enemies.some((e) => !e.def.passive && Math.hypot(e.cx - this.player.cx, e.cy - this.player.cy) < 10 * TILE);
      if (danger) {
        this.toast('You cannot sleep with monsters nearby.', '#ff9a9a');
        return;
      }
      this.fadeTo(() => {
        p.clock = 0.02;
        p.stats.days++;
        this.player.hp = Math.min(this.st.maxHp, this.player.hp + this.st.maxHp * 0.5);
        p.food = Math.max(0, p.food - 15);
        this.enemies = this.enemies.filter((e) => !e.def.nocturnal);
        this.wasNight = false;
        this.toast(`You sleep soundly. Day ${p.stats.days}.`, '#ffd79a');
        this.onSave?.();
      });
    } else if (changed) {
      this.toast('Spawn point set. You can sleep here once it gets dark.', '#9af0a0');
      audio.play('click');
    } else this.toast('You can only sleep at night.', '#e8e0d0');
  }

  private interact(): void {
    const n = this.near;
    if (!n) return;
    audio.play('click');
    if (n.id.startsWith('obj:')) {
      const [, xs, ys] = n.id.split(':');
      const tx = Number(xs);
      const ty = Number(ys);
      this.useObj(tx, ty, this.world.getObj(tx, ty));
      return;
    }
    this.ui.open(n.id);
  }

  lootChest(tx: number, ty: number): void {
    if (this.world.getObj(tx, ty) !== Obj.CHEST) return;
    this.world.setObj(tx, ty, Obj.CHEST_OPEN);
    const biome = biomeAt(ty).id;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const r = new Rng(this.world.seed ^ (tx * 7919 + ty * 104729));
    audio.play('chest_open', { vary: 0 });
    this.burst(cx, cy, 20, ['#ffd75a', '#ffffff'], 140, true);
    this.drops.push(new Drop('coin', r.int(10, 30) * (biome + 1) * (biome + 1), cx, cy - 6));
    const pools = [
      ['torch', 'torch', 'rope', 'arrows', 'tonic', 'bread', 'copperbar', 'woodbow', 'stonepick', 'recall'],
      ['torch', 'arrows', 'tonic', 'oil', 'ironbar', 'bomb', 'steak', 'coppersword', 'copperlantern', 'springboots'],
      ['oil', 'tonic', 'bomb', 'silverbar', 'ironbar', 'recall', 'stew', 'jadering', 'heartcrystal'],
      ['oil', 'tonic', 'bomb', 'goldbar', 'silverbar', 'recall', 'stew', 'locket', 'heartcrystal'],
      ['oil', 'tonic', 'bomb', 'goldbar', 'voidbar', 'recall', 'stew', 'amulet', 'heartcrystal'],
    ];
    const pool = pools[Math.min(4, biome)].filter((id) => ITEMS[id]);
    for (let k = 0; k < 3; k++) {
      const id = r.pick(pool);
      const def = ITEMS[id];
      const n = id === 'torch' || id === 'arrows' ? r.int(6, 14) : def.kind === 'material' ? r.int(2, 5) : 1;
      this.drops.push(new Drop(id, n, cx, cy - 6));
    }
    const ores = BIOMES[Math.min(biome, 4)].ores.filter((o) => BLOCKS[o.block].drop && BLOCKS[o.block].drop !== '@relic');
    for (let k = 0; k < r.int(2, 4); k++) {
      const drop = BLOCKS[r.pick(ores).block].drop;
      if (drop) this.drops.push(new Drop(drop, 1, cx, cy - 6));
    }
    if (r.chance(0.3)) {
      const rel = nextRelic(this.p, Math.min(biome, 4));
      if (rel) {
        this.p.relicsDropped.push(rel);
        this.drops.push(new Drop(rel, 1, cx, cy - 6));
        audio.play('relic', { vary: 0 });
      }
    }
    this.p.stats.chests++;
    this.addXp('delving', 20 + biome * 15);
    for (const b of this.p.bounties) if (b.kind === 'chests') b.have = Math.min(b.need, b.have + 1);
  }

  hurtPlayer(dmg: number, fromX: number, ignoreArmor = false): void {
    const pl = this.player;
    if (pl.dead || pl.invuln > 0) return;
    const real = Math.max(1, Math.round(dmg * (ignoreArmor ? 1 : 1 - this.st.reduce)));
    pl.hp -= real;
    pl.invuln = 0.9;
    pl.hurtT = 0.25;
    pl.regenT = 4;
    pl.recallT = 0;
    pl.vx = Math.sign(pl.cx - fromX || 1) * 220;
    pl.vy = Math.min(pl.vy, -200);
    pl.climbing = false;
    this.shake = Math.max(this.shake, 5);
    this.text(pl.cx, pl.y - 4, '-' + real, '#ff5a5a');
    audio.play('hurt');
    this.burst(pl.cx, pl.cy, 10, ['#ff5a5a', '#aa2020'], 120);
    if (pl.hp <= 0) this.die();
  }

  private sap(dmg: number, label: string, color: string): void {
    const pl = this.player;
    if (pl.dead) return;
    pl.hp -= dmg;
    pl.hurtT = 0.12;
    pl.regenT = 3;
    this.text(pl.cx, pl.y, label, color);
    if (pl.hp <= 0) this.die();
  }

  private die(): void {
    const pl = this.player;
    if (pl.dead) return;
    pl.hp = 0;
    pl.dead = true;
    pl.deadT = 0;
    pl.swinging = false;
    this.hook = null;
    if (this.ride) this.dismount(false);
    audio.play('death', { vary: 0 });
    audio.music('none');
    this.p.stats.deaths++;
    const items = this.p.inv.filter((s): s is Stack => !!s);
    if (items.length) {
      // an older satchel is lost for good
      this.p.satchel = { x: pl.cx, y: pl.cy, items: items.map((s) => ({ ...s })) };
      this.p.inv = new Array<Slot>(INV_SIZE).fill(null);
    }
  }

  private respawn(): void {
    this.hook = null;
    const pl = this.player;
    pl.dead = false;
    const lost = Math.floor(this.p.coins * 0.1);
    this.p.coins -= lost;
    this.teleportHome();
    pl.hp = this.st.maxHp;
    this.p.food = Math.max(this.p.food, 50);
    this.enemies = [];
    this.shots = [];
    if (this.boss?.dead && this.p.bossRewardPending) this.grantBossReward(this.player.cx, this.player.cy);
    this.boss = null;
    this.toast(`You blacked out.${lost ? ` (-${lost} coins)` : ''}${this.p.satchel ? ' Everything you carried lies in a satchel where you fell.' : ''}`, '#ff9a9a');
  }

  teleportHome(): void {
    this.hook = null;
    const s = this.p.spawn;
    const w = this.world;
    // beds are two tiles wide and you wake standing over the middle of them
    const bed = w.getObj(s.x, s.y) === Obj.BED;
    const cols = bed ? [s.x, s.x + 1] : [s.x];
    const blocked = cols.some((x) => w.solid(x, s.y) || w.solid(x, s.y - 1));
    if (blocked) {
      const sp = worldSpawn(w);
      this.placePlayer(sp.x * TILE + TILE / 2, (sp.y + 1) * TILE);
      return;
    }
    this.placePlayer(bed ? s.x * TILE + TILE : s.x * TILE + TILE / 2, (s.y + 1) * TILE);
  }

  placePlayer(px: number, py: number): void {
    const pl = this.player;
    pl.x = px - pl.w / 2;
    pl.y = py - pl.h - 0.5;
    pl.vx = 0;
    pl.vy = 0;
    pl.fallStartY = pl.y;
    pl.climbing = false;
    pl.recallT = 0;
    this.enemies = this.enemies.filter((e) => Math.hypot(e.cx - pl.cx, e.cy - pl.cy) < 10 * TILE);
    this.snapCamera();
  }

  // ------------------------------------------------------------------ crafting
  stationsNear(): Set<Station> {
    const set = new Set<Station>(['hand']);
    const pt = this.playerTile();
    const w = this.world;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const o = w.getObj(pt.x + dx, pt.y + dy);
        if (!o) continue;
        for (const [st, objs] of Object.entries(STATION_OBJS) as [Station, Obj[]][]) if (objs.includes(o)) set.add(st);
      }
    }
    return set;
  }

  canCraft(r: Recipe, stations: Set<Station>): boolean {
    return stations.has(r.at) && hasAll(this.p, r.need);
  }

  craft(r: Recipe, times: number): number {
    const stations = this.stationsNear();
    let made = 0;
    for (let k = 0; k < times; k++) {
      if (!this.canCraft(r, stations)) break;
      for (const [id, n] of Object.entries(r.need)) takeItems(this.p, id, n);
      this.giveOrDrop(r.out, r.n);
      made++;
    }
    if (made) {
      this.p.stats.crafted += made;
      audio.play('craft', { vary: 0.05 });
      if (r.out === 'workbench') this.hint('placeBench', 'Select the Workbench in your hotbar and click the ground to place it.');
    }
    return made;
  }

  recipesFor(stations: Set<Station>): Recipe[] {
    return RECIPES.filter((r) => stations.has(r.at));
  }

  // ------------------------------------------------------------------ inventory actions from the UI
  equip(invIndex: number): void {
    const s = this.p.inv[invIndex];
    if (!s) return;
    const def = ITEMS[s.id];
    const slot = def ? equipSlotOf(def) : null;
    if (!slot) return;
    let key: EquipKey = slot === 'charm' ? 'charm1' : slot;
    if (slot === 'charm') {
      if (this.p.equip.charm1?.id === s.id || this.p.equip.charm2?.id === s.id) return;
      if (this.p.equip.charm1 && !this.p.equip.charm2) key = 'charm2';
    }
    const old = this.p.equip[key];
    this.p.equip[key] = s;
    this.p.inv[invIndex] = old;
    this.afterEquip();
  }

  unequip(key: EquipKey): void {
    const s = this.p.equip[key];
    if (!s) return;
    if (roomFor(this.p.inv, s.id) < 1) {
      this.toast('No room in your pack.');
      return;
    }
    this.p.equip[key] = null;
    give(this.p.inv, s.id, s.n);
    this.afterEquip();
  }

  afterEquip(): void {
    const hadLantern = this.st.oilMax > 0;
    const oil = this.player.oil;
    this.refresh();
    if (!hadLantern && this.st.oilMax > 0) {
      // your first lantern comes full; after that, swapping lanterns keeps the oil you had
      this.player.oil = this.p.hadLantern ? Math.min(this.st.oilMax, oil) : this.st.oilMax;
      this.p.hadLantern = true;
    }
    audio.play('upgrade', { pitch: 1.4, vol: 0.5, vary: 0 });
  }

  // ------------------------------------------------------------------ enemies
  private updateEnemies(dt: number): void {
    const pl = this.player;
    const night = isNight(this.p.clock);
    for (const e of this.enemies) {
      if (e.dead) continue;
      updateEnemy(this, e, dt);
      if (!pl.dead && !e.def.passive && e.knock <= 0 && overlaps(pl, e)) {
        this.hurtPlayer(e.def.dmg, e.cx);
        e.vx = -Math.sign(pl.cx - e.cx || 1) * 160;
        e.knock = 0.25;
        // a boar that lands a hit usually trots off and calms down
        if (e.def.behavior === 'charger') {
          e.mode = 0;
          e.stateT = 1.5;
          e.facing = -Math.sign(pl.cx - e.cx || 1);
          if (Math.random() < 0.6) e.provoked = false;
        }
      }
      // Hollows crumble in daylight
      if (e.def.nocturnal && !night) {
        const tx = Math.floor(e.cx / TILE);
        const ty = Math.floor(e.y / TILE);
        if (ty < this.world.skyline[Math.max(0, Math.min(WORLD_W - 1, tx))]) {
          e.hp -= dt * 12;
          if (Math.random() < dt * 20) this.parts.push({ x: e.cx + (Math.random() - 0.5) * 16, y: e.y + Math.random() * e.h, vx: 0, vy: -40, life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#ff8a2a' : '#5a5050', size: 2, grav: -20, glow: false });
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      if (e.def.id === 'hollow' && Math.random() < dt * 0.08 && Math.hypot(e.cx - pl.cx, e.cy - pl.cy) < 12 * TILE) audio.play('groan', { vol: 0.35 });
      if (Math.hypot(e.cx - pl.cx, e.cy - pl.cy) > 46 * TILE) e.dead = true;
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.1;
      if (this.onSurface()) this.trySurfaceSpawn();
      else this.trySpawn();
    }
  }

  private trySurfaceSpawn(): void {
    if (this.boss) return;
    const pl = this.player;
    const night = isNight(this.p.clock);
    const near = this.enemies.filter((e) => Math.hypot(e.cx - pl.cx, e.cy - pl.cy) < 46 * TILE);
    // the first night is gentler
    const cap = night ? (this.p.stats.days <= 1 ? 3 : 4) : 4;
    if (near.length >= cap) return;
    if (Math.random() < (night ? 0.45 : 0.6)) return;
    const pt = this.playerTile();
    const w = this.world;
    for (let tries = 0; tries < 10; tries++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const tx = pt.x + side * this.rng.int(15, 26);
      if (tx < 4 || tx >= w.w - 4) continue;
      const gy = w.skyline[tx];
      if (gy <= 2 || gy > w.surface[tx] + 4) continue;
      const ty = gy - 1;
      if (w.solid(tx, ty) || w.solid(tx, ty - 1)) continue;
      if (this.p.buildings.some((b) => Math.abs(b.x - tx) < 6)) continue;
      const lit = this.torchLightNear(tx, ty);
      if (night && lit) continue;
      const id = this.rng.pick(night ? NIGHT_SURFACE : DAY_SURFACE);
      const def = ENEMIES[id];
      if (!night && w.get(tx, gy) !== B.GRASS) continue;
      const y = def.behavior === 'flyer' ? (ty - 4) * TILE : (ty + 1) * TILE - 1;
      this.enemies.push(new Enemy(def, tx * TILE + TILE / 2, y));
      return;
    }
  }

  /** is there a torch or campfire within a few tiles? */
  private torchLightNear(tx: number, ty: number): boolean {
    const w = this.world;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const o = w.getObj(tx + dx, ty + dy);
        if (o === Obj.TORCH || o === Obj.CAMPFIRE || o === Obj.FURNACE || o === Obj.LAMP) return true;
      }
    }
    return false;
  }

  private trySpawn(): void {
    const pl = this.player;
    const pt = this.playerTile();
    if (this.boss) return;
    const bm = biomeAt(pt.y);
    if (!bm.enemies.length) return;
    const nearby = this.enemies.filter((e) => Math.hypot(e.cx - pl.cx, e.cy - pl.cy) < 30 * TILE).length;
    if (nearby >= bm.enemyCap) return;
    for (let tries = 0; tries < 14; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 11 + Math.random() * 9;
      const tx = Math.floor(pt.x + Math.cos(ang) * dist);
      const ty = Math.floor(pt.y + Math.sin(ang) * dist * 0.7);
      if (!this.world.inside(tx, ty) || this.world.solid(tx, ty) || BLOCKS[this.world.get(tx, ty)].liquid) continue;
      if (ty < this.world.surface[tx] + 5) continue;
      if (this.light.at(tx, ty) > 0.24) continue;
      const tb = biomeAt(ty);
      if (!tb.enemies.length) continue;
      const def = ENEMIES[this.rng.pick(tb.enemies)];
      const grounded = def.behavior === 'walker' || def.behavior === 'hopper' || def.behavior === 'roller';
      if (grounded && !this.world.solid(tx, ty + 1)) continue;
      if (this.world.solid(tx, ty - 1) && def.box[1] > 30) continue;
      this.enemies.push(new Enemy(def, tx * TILE + TILE / 2, (ty + 1) * TILE - 1));
      return;
    }
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    b.update(this, dt);
    if (b.dead && b.deathT > 3.2) {
      this.boss = null;
      this.grantBossReward(b.x, b.y);
    }
  }

  private killBoss(): void {
    const b = this.boss;
    if (!b || b.dead) return;
    b.dead = true;
    b.hp = 0;
    this.p.bossDefeated = true;
    this.p.bossRewardPending = true;
    this.shots = [];
    for (const e of this.enemies) e.dead = true;
    audio.play('roar', { pitch: 0.7, vary: 0 });
    this.addXp('combat', 2000);
    this.addXp('delving', 1500);
    this.onSave?.();
  }

  // ------------------------------------------------------------------ random ticks: growth
  private randomTicks(dt: number): void {
    this.tickT -= dt;
    if (this.tickT > 0) return;
    this.tickT = 0.25;
    const w = this.world;
    const pt = this.playerTile();
    for (let k = 0; k < 40; k++) {
      const x = pt.x + this.rng.int(-40, 40);
      const y = pt.y + this.rng.int(-25, 25);
      if (!w.inside(x, y)) continue;
      const o = w.getObj(x, y);
      if (o === Obj.SAPLING && Math.random() < 0.06) {
        let room = true;
        for (let yy = y - 4; yy < y; yy++) if (w.rock(x, yy)) room = false;
        if (room && y <= w.skyline[x]) w.setObj(x, y, Obj.TREE);
      } else if (o === Obj.BUSH && Math.random() < 0.025) w.setObj(x, y, Obj.BUSH_BERRY);
      else if ((o === Obj.CROP0 || o === Obj.CROP1 || o === Obj.CROP2) && Math.random() < 0.08 && y <= w.skyline[x] + 1) w.setObj(x, y, o + 1);
      else if (w.get(x, y) === B.DIRT && !w.rock(x, y - 1) && !w.getObj(x, y - 1) && y <= w.skyline[x]) {
        // grass creeps back over bare dirt that sees the sky
        if (w.get(x - 1, y) === B.GRASS || w.get(x + 1, y) === B.GRASS || w.get(x - 1, y + 1) === B.GRASS || w.get(x + 1, y - 1) === B.GRASS) w.set(x, y, B.GRASS);
      } else if (w.get(x, y) === B.GRASS && w.rock(x, y - 1)) w.set(x, y, B.DIRT);
    }
  }

  // ------------------------------------------------------------------ drops/shots/bombs/particles
  private updateDrops(dt: number): void {
    const pl = this.player;
    let full = false;
    for (const d of this.drops) {
      d.age += dt;
      const dx = pl.cx - (d.x + 6);
      const dy = pl.cy - (d.y + 6);
      const dist = Math.hypot(dx, dy);
      const room = d.item === 'coin' || roomFor(this.p.inv, d.item) > 0;
      if (!room && dist < 70) full = true;
      if (!pl.dead && d.age > 0.35 && room && dist < 80) {
        d.vx += (dx / dist) * 1400 * dt;
        d.vy += (dy / dist) * 1400 * dt;
        d.vx *= 0.9;
        d.vy *= 0.9;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (dist < 16) this.collect(d);
      } else {
        applyGravity(d, dt);
        const r = moveBody(this.world, d, dt);
        if (d.onGround) d.vx *= 0.85;
        if (r.hitX) d.vx *= -0.5;
      }
      if (d.age > 600 && !d.item.startsWith('r_')) d.count = 0;
    }
    this.drops = this.drops.filter((d) => d.count > 0);
    if (full && this.hintCooldown <= 0) {
      this.text(pl.cx, pl.y - 14, 'Pack full!', '#ff9a6a');
      this.hintCooldown = 2;
      this.hint('packFull', 'Your pack is full. Build a Storage Chest at a workbench to stash things.');
    }
  }

  private collect(d: Drop): void {
    if (d.item === 'coin') {
      this.p.coins += d.count;
      this.p.stats.earned += d.count;
      audio.play('coins', { vol: 0.5, pitch: 1.3 });
      this.text(d.x, d.y, `+${d.count}c`, '#ffd75a');
      d.count = 0;
      return;
    }
    const before = d.count;
    d.count = give(this.p.inv, d.item, d.count);
    const got = before - d.count;
    if (got <= 0) return;
    const def = ITEMS[d.item];
    audio.play('pickup', { vol: 0.6 });
    this.text(d.x, d.y, `+${got} ${def ? def.name : d.item}`, def?.kind === 'relic' ? '#ffd75a' : '#e8e0d0');
    if (def?.kind === 'relic' && !this.p.seen['relic_' + d.item]) {
      this.p.seen['relic_' + d.item] = true;
      this.toast(`Relic found: ${def.name}! Wren can catalogue it once her Archive is built.`, '#ffd75a');
      this.addXp('delving', 120);
    }
    if (d.item === 'wood') this.hint('wood', 'Wood! Press Tab to open your inventory and craft a Workbench (10 wood).');
    if (def?.kind === 'material' && BLOCKS.some((b) => b.drop === d.item && b.ore)) this.hint('ore', 'Ore! Smelt it into bars at a Furnace, then forge tools at an Anvil.');
  }

  private updateShots(dt: number): void {
    const pl = this.player;
    for (const s of this.shots) {
      s.life -= dt;
      s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (!s.arrow && Math.random() < dt * 30) this.parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: s.color, size: 2, grav: 0, glow: true });
      if (this.world.solidAtPx(s.x, s.y)) {
        s.life = 0;
        this.burst(s.x, s.y, 6, [s.color], 80, !s.arrow);
        continue;
      }
      if (s.hostile) {
        if (!pl.dead && s.x > pl.x - s.r && s.x < pl.x + pl.w + s.r && s.y > pl.y - s.r && s.y < pl.y + pl.h + s.r) {
          s.life = 0;
          this.hurtPlayer(s.dmg, s.x);
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (s.x > e.x - s.r && s.x < e.x + e.w + s.r && s.y > e.y - s.r && s.y < e.y + e.h + s.r) {
            s.life = 0;
            this.damageEnemy(e, Math.atan2(s.vy, s.vx), s.dmg);
            break;
          }
        }
        const b = this.boss;
        if (s.life > 0 && b && !b.dead && b.intro <= 0 && Math.hypot(b.x - s.x, b.y - s.y) < b.r) {
          s.life = 0;
          this.damageBoss(Math.round(s.dmg * b.damageMult()), s.x, s.y, false);
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  private updateBombs(dt: number): void {
    for (const b of this.bombs) {
      b.fuse -= dt;
      applyGravity(b, dt);
      const r = moveBody(this.world, b, dt);
      if (r.hitX) b.vx *= -0.5;
      if (b.onGround) b.vx *= 0.9;
      if (Math.random() < dt * 30) this.parts.push({ x: b.x + 8, y: b.y, vx: 0, vy: -30, life: 0.3, max: 0.3, color: '#ffd75a', size: 2, grav: 0, glow: true });
      if (b.fuse <= 0) this.explode(b.x + 6, b.y + 6, b.tier);
    }
    this.bombs = this.bombs.filter((b) => b.fuse > 0);
  }

  private explode(x: number, y: number, pickTier = this.st.pickTier): void {
    audio.play('explosion', { vary: 0.1 });
    this.shake = 10;
    this.burst(x, y, 40, ['#ffd75a', '#ff8a2a', '#ffffff', '#5a4a3a'], 280, true);
    this.burst(x, y, 24, ['#5a4a3a', '#3a3030'], 200);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const maxTier = Math.max(2, pickTier + 1);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 5) continue;
        const bx = tx + dx;
        const by = ty + dy;
        const def = BLOCKS[this.world.get(bx, by)];
        if (!def.solid || def.unbreakable || def.tier > maxTier || this.isProtected(bx, by)) continue;
        this.breakBlock(bx, by, true);
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.cx - x, e.cy - y);
      if (d < 3 * TILE) this.damageEnemy(e, Math.atan2(e.cy - y, e.cx - x), 40 + this.st.attack * 2);
    }
    const boss = this.boss;
    if (boss && !boss.dead && boss.intro <= 0 && Math.hypot(boss.x - x, boss.y - y) < 3 * TILE + boss.r) {
      this.damageBoss(Math.round((60 + this.st.attack * 2) * boss.damageMult()), boss.x, boss.y - boss.r * 0.5, false);
    }
    const pl = this.player;
    if (Math.hypot(pl.cx - x, pl.cy - y) < 2.2 * TILE) this.hurtPlayer(14, x);
  }

  private updateParticles(dt: number): void {
    for (const q of this.parts) {
      q.life -= dt;
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.glow) {
        q.vx *= 0.96;
        q.vy *= 0.96;
      }
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 28;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const [i, d] of this.world.damage) {
      d.t += dt;
      if (d.t > 4) this.world.damage.delete(i);
    }
  }

  // ------------------------------------------------------------------ environment
  private updateEnvironment(dt: number, menu: boolean): void {
    const pl = this.player;
    const pt = this.playerTile();
    const w = this.world;
    const cx = Math.max(0, Math.min(WORLD_W - 1, pt.x));
    const underground = pt.y > w.surface[cx] + 2;
    this.biome = underground ? biomeAt(pt.y).id : 0;

    // interactables near the player
    this.near = null;
    if (!pl.dead) {
      let best = 2.6 * TILE;
      for (const b of this.p.buildings) {
        const d = Math.abs(b.x * TILE - pl.cx);
        if (d < best && Math.abs(b.y * TILE - (pl.y + pl.h)) < 60) {
          best = d;
          const info = BUILDING_INFO[b.kind];
          this.near = { id: info.panel, x: b.x * TILE, y: b.y * TILE, label: info.label };
        }
      }
      if (!this.near) {
        let bd = 99;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const tx = pt.x + dx;
            const ty = pt.y + dy;
            const o = w.getObj(tx, ty);
            const label = objLabel(o, this.p.clock);
            if (!label) continue;
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist < bd) {
              bd = dist;
              this.near = { id: `obj:${tx}:${ty}`, x: tx * TILE + 16, y: ty * TILE + 16, label };
            }
          }
        }
      }
    }

    if (menu || pl.dead) return;

    // depth
    const depth = Math.max(0, pt.y - w.surface[cx]);
    if (underground && depth > this.p.maxDepth) {
      const gained = depth - this.p.maxDepth;
      this.p.maxDepth = depth;
      this.addXp('delving', gained * (1 + this.biome));
      if (depth % 25 === 0) this.text(pl.cx, pl.y - 20, `New depth: ${depth}m`, '#9ad8ff');
      for (const b of this.p.bounties) if (b.kind === 'depth') b.have = Math.max(b.have, depth);
    }
    if (underground) this.hint('underground', 'It is dark down here. Hold a torch (select it in the hotbar) to light your way, or place torches on the walls.');

    // hunger
    const p = this.p;
    p.food = Math.max(0, p.food - dt * 0.075);
    if (p.food <= 0) {
      pl.starveT += dt;
      if (pl.starveT > 3) {
        pl.starveT = 0;
        this.sap(2, 'Starving', '#ffb070');
      }
      this.hint('starve', 'You are starving! Eat berries, mushrooms or cooked meat (hold food and click).');
    } else if (p.food < 20) this.hint('hungry', 'You are getting hungry. Pick berries, hunt rabbits and boars, cook at a campfire.');
    // healing
    if (pl.regenT > 0) pl.regenT -= dt;
    else if (p.food > 30 && pl.hp < this.st.maxHp) {
      let rate = p.food > 75 ? 0.9 : 0.4;
      if (this.nearObj(Obj.CAMPFIRE, 3)) rate += 1.6;
      pl.hp = Math.min(this.st.maxHp, pl.hp + rate * dt);
      p.food = Math.max(0, p.food - rate * dt * 0.08);
    }

    // lantern oil burns underground
    if (underground && this.st.oilMax > 0 && pl.oil > 0) {
      pl.oil = Math.max(0, pl.oil - dt / (1 + (p.skills.delving.lvl - 1) * 0.01));
      if (pl.oil < this.st.oilMax * 0.2 && !this.lowOilWarned) {
        this.lowOilWarned = true;
        this.toast('Your lantern is running low on oil!', '#ffc85a');
        audio.play('sizzle', { pitch: 0.6, vary: 0 });
      }
    }
    if (!underground && this.st.oilMax > 0) pl.oil = Math.min(this.st.oilMax, pl.oil + dt * 2);
    if (pl.oil > this.st.oilMax * 0.25) this.lowOilWarned = false;

    // the Sunless Vault's gloom bites anyone standing in the dark
    const lightHere = this.light.at(pt.x, pt.y);
    if (this.biome >= 4 && !this.st.lens && lightHere < 0.3) {
      pl.darkT += dt;
      if (pl.darkT > 3 && Math.floor(pl.darkT * 2) !== Math.floor((pl.darkT - dt) * 2)) this.sap(4, 'The dark bites', '#a07aff');
      this.hint('dark', 'The Sunless Vault eats light and the dark bites. Stay near torches, or forge a Sunglass Lens.');
    } else pl.darkT = 0;

    // heat
    if (this.biome === 3 && !this.st.heatWard) {
      pl.heatT += dt;
      if (pl.heatT > 1.5) {
        pl.heatT = 0;
        this.sap(Math.max(1, Math.round(3 * this.st.heatResist)), `-${Math.max(1, Math.round(3 * this.st.heatResist))} heat`, '#ff8a4a');
      }
      this.hint('heat', 'The Ember Depths are scorching! An Emberward Talisman (anvil) protects you.');
    }

    // lava
    if (inLiquid(w, pl)) {
      pl.lavaT -= dt;
      if (pl.lavaT <= 0) {
        pl.lavaT = 0.4;
        audio.play('sizzle');
        const dmg = Math.round(14 * this.st.heatResist);
        this.burst(pl.cx, pl.y + pl.h, 8, ['#ff8a2a', '#ffd75a'], 120, true);
        this.sap(dmg, `-${dmg}`, '#ff6a2a');
      }
    }

    // boss arena
    if (!p.bossDefeated && !this.boss && pt.y > BOSS_CENTER.y - 10 && Math.abs(pt.x - BOSS_CENTER.x) < 24) {
      this.boss = new Boss();
      this.enemies = [];
      audio.play('roar', { vary: 0 });
      this.toast('THE GLOAMHEART AWAKENS', '#ff4a7a');
    }
    if (this.boss && !this.boss.dead && pt.y < BOSS_CENTER.y - 14) {
      this.boss = null;
      this.toast('The Gloamheart slumbers again...', '#a05aff');
    }
  }

  nearObj(o: Obj, r: number): boolean {
    const pt = this.playerTile();
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.world.getObj(pt.x + dx, pt.y + dy) === o) return true;
    return false;
  }

  // ------------------------------------------------------------------ camera, light, music
  snapCamera(): void {
    const pl = this.player;
    this.camX = pl.cx - this.viewW / 2;
    this.camY = pl.cy - this.viewH / 2;
    this.clampCamera();
  }

  private clampCamera(): void {
    this.camX = Math.max(0, Math.min(this.camX, WORLD_W * TILE - this.viewW));
    this.camY = Math.max(-4 * TILE, Math.min(this.camY, this.world.h * TILE - this.viewH));
  }

  private updateCamera(dt: number): void {
    const pl = this.player;
    const b = this.boss;
    const fight = !!b && !b.dead;
    const tx = (fight && b ? pl.cx * 0.7 + b.x * 0.3 : pl.cx + pl.facing * 24) - this.viewW / 2;
    const ty = (fight && b ? pl.cy * 0.68 + b.y * 0.32 : pl.cy - 10) - this.viewH / 2;
    const k = 1 - Math.exp(-dt * 6);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.clampCamera();
  }

  private computeLight(): void {
    const pl = this.player;
    const tx0 = Math.floor(this.camX / TILE);
    const ty0 = Math.floor(this.camY / TILE);
    const tw = Math.ceil(this.viewW / TILE) + 2;
    const th = Math.ceil(this.viewH / TILE) + 2;
    const lights: PointLight[] = [];
    const flick = 1 + Math.sin(this.time * 13) * 0.015 + Math.sin(this.time * 7.7) * 0.015;
    const vault = this.biome === 4 && !this.st.lens ? 0.55 : 1;
    const dim = this.gloom > 0 ? 0.4 : 1;
    const ly = (pl.y + 10) / TILE;
    const lx = pl.cx / TILE;
    // your own eyes adjust a little to the dark
    const bonus = this.st.light - (this.st.oilMax > 0 ? (ITEMS[this.p.equip.lantern?.id ?? '']?.radius ?? 0) : 0);
    lights.push({ x: lx, y: ly, r: 0.44, g: 0.4, b: 0.46, radius: (4.2 + Math.max(0, bonus)) * vault, cast: true });
    const hd = heldDef(this.p);
    if (hd?.id === 'torch' && !pl.dead) lights.push({ x: lx + pl.facing * 0.4, y: ly, r: 1.1, g: 0.74, b: 0.38, radius: 7 * flick * vault * dim, cast: true });
    if (this.st.oilMax > 0 && pl.oil > 0 && !pl.dead) {
      let rad = this.st.light * vault * dim;
      if (pl.oil < this.st.oilMax * 0.1) rad *= 0.6 + 0.4 * (pl.oil / (this.st.oilMax * 0.1));
      lights.push({ x: lx, y: ly, r: 1.05, g: 0.86, b: 0.62, radius: rad * flick, cast: true });
    }
    for (const e of this.enemies) {
      const gl = e.def.glow;
      if (gl) lights.push({ x: e.cx / TILE, y: e.cy / TILE, r: gl[0], g: gl[1], b: gl[2], radius: 3, cast: false });
    }
    for (const s of this.shots) if (!s.arrow) lights.push({ x: s.x / TILE, y: s.y / TILE, r: 0.5, g: 0.3, b: 0.3, radius: 2.2, cast: false });
    for (const d of this.drops) {
      if (ITEMS[d.item]?.glow) lights.push({ x: d.x / TILE, y: d.y / TILE, r: 0.3, g: 0.3, b: 0.3, radius: 1.6, cast: false });
    }
    if (this.boss) lights.push({ x: this.boss.x / TILE, y: this.boss.y / TILE, r: 0.9, g: 0.15, b: 0.3, radius: 9, cast: false });
    for (const b of this.bombs) lights.push({ x: b.x / TILE, y: b.y / TILE, r: 0.6, g: 0.45, b: 0.1, radius: 2, cast: false });
    for (const b of this.p.buildings) lights.push({ x: b.x, y: b.y - 1.5, r: 0.7, g: 0.5, b: 0.25, radius: 5, cast: false });
    const sat = this.p.satchel;
    if (sat) lights.push({ x: sat.x / TILE, y: sat.y / TILE, r: 0.3, g: 0.6, b: 0.3, radius: 3, cast: false });
    this.light.compute(this.world, tx0, ty0, tw, th, lights, this.time, this.skyColor());
    this.light.finish(this.world);
  }

  private updateMusic(): void {
    if (this.player.dead) return;
    let m: MusicId;
    if (this.boss && !this.boss.dead) m = 'boss';
    else if (this.biome === 0 && this.onSurface()) m = isNight(this.p.clock) ? 'cave' : 'camp';
    else if (this.biome >= 3) m = 'deep';
    else m = this.biome === 2 ? 'cave2' : 'cave';
    audio.music(m);
    audio.ambience(this.onSurface() ? 0 : 1);
  }

  // ------------------------------------------------------------------ economy (from the UI)
  sellSlot(i: number, n: number): void {
    const s = this.p.inv[i];
    if (!s) return;
    n = Math.min(n, s.n);
    if (itemValue(s.id, this.st) <= 0) return;
    const v = itemValue(s.id, this.st) * n;
    s.n -= n;
    if (s.n <= 0) this.p.inv[i] = null;
    this.p.coins += v;
    this.p.stats.earned += v;
    audio.play('coins');
  }

  /** sell every ore, gem, bar and creature part not reserved for a bounty */
  sellAllMaterials(): number {
    let total = 0;
    const reserved: Record<string, number> = {};
    for (const b of this.p.bounties) if (b.kind === 'deliver') reserved[b.target] = (reserved[b.target] ?? 0) + b.need;
    for (let i = 0; i < this.p.inv.length; i++) {
      const s = this.p.inv[i];
      if (!s) continue;
      const def = ITEMS[s.id];
      if (!def || def.kind !== 'material' || def.value <= 0 || s.id === 'wood') continue;
      const keep = Math.min(s.n, reserved[s.id] ?? 0);
      reserved[s.id] = (reserved[s.id] ?? 0) - keep;
      const n = s.n - keep;
      if (n <= 0) continue;
      total += itemValue(s.id, this.st) * n;
      s.n -= n;
      if (s.n <= 0) this.p.inv[i] = null;
    }
    if (total > 0) {
      this.p.coins += total;
      this.p.stats.earned += total;
      audio.play('coins');
    }
    return total;
  }

  buy(id: string, price: number, n: number): boolean {
    if (this.p.coins < price) return false;
    if (roomFor(this.p.inv, id) < n) {
      this.toast('No room in your pack.');
      return false;
    }
    this.p.coins -= price;
    give(this.p.inv, id, n);
    audio.play('coins', { pitch: 0.9 });
    return true;
  }

  shopStock(): typeof SHOP_STOCK {
    return SHOP_STOCK;
  }

  sharpen(kind: 'sharpen' | 'hone'): boolean {
    const lvl = this.p[kind];
    const c = sharpenCost(lvl);
    if (lvl >= SHARPEN_MAX || this.p.coins < c) return false;
    this.p.coins -= c;
    this.p[kind]++;
    this.refresh();
    audio.play('upgrade', { pitch: 1.2, vary: 0 });
    return true;
  }

  catalogue(id: string): void {
    if (count(this.p, id) <= 0 || this.p.catalogued.includes(id)) return;
    takeItems(this.p, id, 1);
    this.p.catalogued.push(id);
    this.refresh();
    audio.play('relic', { vary: 0 });
    this.addXp('delving', 200);
    this.onSave?.();
  }

  bountyReady(b: Bounty): boolean {
    if (b.kind === 'deliver') return count(this.p, b.target) >= b.need;
    if (b.kind === 'depth') return this.p.maxDepth >= b.need;
    return b.have >= b.need;
  }

  turnIn(i: number): void {
    const b = this.p.bounties[i];
    if (!b || !this.bountyReady(b)) return;
    if (b.kind === 'deliver') takeItems(this.p, b.target, b.need);
    this.p.coins += b.reward;
    this.p.stats.earned += b.reward;
    this.addXp('delving', b.xp);
    this.p.bounties.splice(i, 1);
    this.p.bountiesDone++;
    audio.play('coins', { vary: 0 });
    this.refillBounties();
    this.onSave?.();
  }

  rerollBounty(i: number): void {
    const cost = 25 + this.maxBiome() * 25;
    if (this.p.coins < cost) return;
    this.p.coins -= cost;
    this.p.bounties.splice(i, 1);
    this.refillBounties();
    audio.play('click');
  }

  maxBiome(): number {
    return biomeAt(this.p.maxDepth + 26).id;
  }

  refillBounties(): void {
    while (this.p.bounties.length < 3) this.p.bounties.push(this.makeBounty());
  }

  private makeBounty(): Bounty {
    const mb = Math.min(4, this.maxBiome());
    const r = this.rng;
    const kinds = ['deliver', 'deliver', 'slay', 'slay', 'chests', 'depth'] as const;
    let kind: (typeof kinds)[number] = r.pick(kinds);
    const used = new Set(this.p.bounties.map((b) => b.kind + b.target));
    for (let tries = 0; tries < 10; tries++) {
      kind = r.pick(kinds);
      if (kind === 'depth' && this.p.maxDepth > 400) continue;
      const bi = r.int(Math.max(0, mb - 1), mb);
      const bm = BIOMES[bi];
      if (kind === 'deliver') {
        const pool = [...bm.ores.map((o) => BLOCKS[o.block].drop ?? ''), ...bm.enemies.flatMap((e) => ENEMIES[e].drops.map((d) => d.id))].filter((d) => d && d !== '@relic' && ITEMS[d]);
        const target = r.pick(pool);
        if (used.has('deliver' + target)) continue;
        const def = ITEMS[target];
        const need = def.value > 15 ? r.int(3, 5) : Math.max(3, Math.min(20, Math.round((r.int(50, 80) * (bi + 1)) / Math.max(2, def.value))));
        return { kind, target, need, have: 0, reward: Math.round(def.value * need * 2.2 + 30 * (bi + 1)), xp: 30 + 25 * bi, text: `Deliver ${need} ${def.name}` };
      }
      if (kind === 'slay') {
        const target = r.pick(bm.enemies);
        if (!target || used.has('slay' + target)) continue;
        const e = ENEMIES[target];
        const need = r.int(5, 10);
        return { kind, target, need, have: 0, reward: Math.round(e.xp * need * 1.6 + 20), xp: 25 + 25 * bi, text: `Defeat ${need} ${e.name}s` };
      }
      if (kind === 'chests') {
        if (used.has('chests')) continue;
        const need = r.int(2, 3);
        return { kind, target: '', need, have: 0, reward: 70 + 60 * mb * mb + need * 20, xp: 50 + 30 * mb, text: `Open ${need} treasure chests` };
      }
      if (kind === 'depth') {
        if (used.has('depth')) continue;
        const need = Math.min(410, this.p.maxDepth + r.int(15, 35));
        return { kind, target: '', need, have: this.p.maxDepth, reward: 60 + need * 3, xp: 60 + need, text: `Reach ${need}m deep` };
      }
    }
    return { kind: 'chests', target: '', need: 1, have: 0, reward: 80, xp: 40, text: 'Open a treasure chest' };
  }

  relicsHeld(): string[] {
    return RELICS.filter((r) => count(this.p, r.id) > 0 && !this.p.catalogued.includes(r.id)).map((r) => r.id);
  }

  /** persist positional state into progress before saving */
  syncProgress(): void {
    const pl = this.player;
    if (pl.dead) {
      const s = this.p.spawn;
      this.p.px = s.x * TILE + TILE;
      this.p.py = (s.y + 1) * TILE;
    } else {
      this.p.px = pl.cx;
      this.p.py = pl.y + pl.h;
    }
    this.p.hp = pl.dead ? this.st.maxHp : Math.max(1, pl.hp);
    this.p.oil = pl.oil;
  }

  /**
   * A copy of the progress for saving: includes a stack held on the inventory cursor and,
   * if you are mid-death, the penalties you would wake up with.
   */
  saveSnapshot(cursor: Stack | null): Progress {
    this.syncProgress();
    const p = JSON.parse(JSON.stringify(this.p)) as Progress;
    if (cursor) give(p.inv, cursor.id, cursor.n);
    if (this.player.dead) {
      p.coins -= Math.floor(p.coins * 0.1);
      p.food = Math.max(p.food, 50);
    }
    if (this.ride) give(p.inv, 'minecart', 1);
    return p;
  }

  bossHpFrac(): number {
    return this.boss ? Math.max(0, this.boss.hp / BOSS_HP) : 0;
  }
}

/** 0 = oak, 1 = pine, 2 = birch, 3 = tall pine; stable per column */
export function treeKind(x: number, seed: number): number {
  let h = Math.imul(x ^ (seed * 31), 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) % 4;
}

function objLabel(o: number, clock: number): string | null {
  switch (o) {
    case Obj.STORAGE:
      return 'Open chest';
    case Obj.MINECART:
      return 'Ride the cart';
    case Obj.CHEST:
      return 'Open treasure chest';
    case Obj.BED:
    case Obj.BED_R:
      return isNight(clock) || clock > 0.56 ? 'Sleep' : 'Set spawn point';
    case Obj.WORKBENCH:
      return 'Craft (workbench)';
    case Obj.FURNACE:
      return 'Craft (furnace)';
    case Obj.ANVIL:
      return 'Craft (anvil)';
    case Obj.ALCHEMY:
      return 'Craft (alchemy)';
    case Obj.CAMPFIRE:
      return 'Cook';
    case Obj.DOOR:
    case Obj.DOOR_TOP:
      return 'Open door';
    case Obj.DOOR_OPEN:
    case Obj.DOOR_OPEN_TOP:
      return 'Close door';
    case Obj.BUSH_BERRY:
      return 'Pick berries';
    case Obj.CROP3:
      return 'Harvest wheat';
  }
  return null;
}
