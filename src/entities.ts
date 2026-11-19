import { World, Obj } from './world/world';
import { TILE, GRAVITY, MAX_FALL } from './constants';
import { BLOCKS } from './data/blocks';
import { EnemyDef } from './data/enemies';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  landed: boolean;
}

function solidRect(world: World, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - 0.001) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (world.solid(tx, ty)) return true;
  return false;
}

/** ladder tops act as one-way platforms unless dropDown is set */
function ladderTopUnder(world: World, b: Body, newY: number): number | null {
  const feetOld = b.y + b.h;
  const feetNew = newY + b.h;
  const ty = Math.floor(feetNew / TILE);
  const topPx = ty * TILE;
  if (feetOld > topPx + 0.01 || feetNew < topPx) return null;
  const x0 = Math.floor((b.x + 2) / TILE);
  const x1 = Math.floor((b.x + b.w - 2) / TILE);
  for (let tx = x0; tx <= x1; tx++) {
    if (world.getObj(tx, ty) === Obj.LADDER && world.getObj(tx, ty - 1) !== Obj.LADDER) return topPx;
  }
  return null;
}

export function moveBody(world: World, b: Body, dt: number, dropDown = false): MoveResult {
  const res: MoveResult = { hitX: false, hitY: false, landed: false };
  const dist = Math.max(Math.abs(b.vx * dt), Math.abs(b.vy * dt));
  const steps = Math.max(1, Math.ceil(dist / 10));
  const sdt = dt / steps;
  const wasGround = b.onGround;
  b.onGround = false;
  for (let s = 0; s < steps; s++) {
    // X
    const nx = b.x + b.vx * sdt;
    if (!solidRect(world, nx, b.y, b.w, b.h)) b.x = nx;
    else {
      // snap against the wall
      if (b.vx > 0) b.x = Math.floor((nx + b.w) / TILE) * TILE - b.w - 0.01;
      else if (b.vx < 0) b.x = (Math.floor(nx / TILE) + 1) * TILE + 0.01;
      b.vx = 0;
      res.hitX = true;
    }
    // Y
    const ny = b.y + b.vy * sdt;
    if (!solidRect(world, b.x, ny, b.w, b.h)) {
      const lt = b.vy > 0 && !dropDown ? ladderTopUnder(world, b, ny) : null;
      if (lt !== null) {
        b.y = lt - b.h - 0.01;
        b.vy = 0;
        b.onGround = true;
        res.hitY = true;
      } else b.y = ny;
    } else {
      if (b.vy > 0) {
        b.y = Math.floor((ny + b.h) / TILE) * TILE - b.h - 0.01;
        b.onGround = true;
      } else if (b.vy < 0) {
        b.y = (Math.floor(ny / TILE) + 1) * TILE + 0.01;
      }
      b.vy = 0;
      res.hitY = true;
    }
  }
  if (!b.onGround && b.vy >= 0) {
    // standing still on ground: probe one pixel below
    if (solidRect(world, b.x, b.y + 1, b.w, b.h) || (!dropDown && ladderTopUnder(world, b, b.y + 1) !== null)) b.onGround = true;
  }
  res.landed = b.onGround && !wasGround;
  return res;
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** is any part of the body in a tile of this block (lava burns, water only slows) */
export function touches(world: World, b: Body, block: number): boolean {
  const x0 = Math.floor(b.x / TILE);
  const x1 = Math.floor((b.x + b.w) / TILE);
  const y0 = Math.floor(b.y / TILE);
  const y1 = Math.floor((b.y + b.h) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (world.get(tx, ty) === block) return true;
  return false;
}

export function inLiquid(world: World, b: Body): boolean {
  const x0 = Math.floor(b.x / TILE);
  const x1 = Math.floor((b.x + b.w) / TILE);
  const y0 = Math.floor(b.y / TILE);
  const y1 = Math.floor((b.y + b.h) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (BLOCKS[world.get(tx, ty)].liquid) return true;
  return false;
}

// ---------------------------------------------------------------------------

export type PlayerAnim = 'idle' | 'walk' | 'jump' | 'hurt' | 'mine' | 'climb';

export class Player implements Body {
  x = 0;
  y = 0;
  w = 16;
  h = 42;
  vx = 0;
  vy = 0;
  onGround = false;
  facing = 1;
  jumpsUsed = 0;
  coyote = 0;
  jumpBuffer = 0;
  climbing = false;
  anim: PlayerAnim = 'idle';
  animT = 0;
  swingT = 0;
  swinging = false;
  swingHit = false;
  swingTarget: { x: number; y: number } | null = null;
  attack = false;
  invuln = 0;
  hurtT = 0;
  fallStartY = 0;
  recallT = 0;
  dead = false;
  deadT = 0;
  hp = 60;
  oil = 150;
  heatT = 0;
  darkT = 0;
  lavaT = 0;
  /** cooldown before the held item can be used again */
  useT = 0;
  starveT = 0;
  regenT = 0;
  swingKind: 'mine' | 'attack' | 'wall' = 'mine';
  eatT = 0;

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }
}

// ---------------------------------------------------------------------------

export class Enemy implements Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx = 0;
  vy = 0;
  onGround = false;
  hp: number;
  facing = 1;
  t = Math.random() * 10;
  animT = Math.random();
  flash = 0;
  stateT = Math.random() * 1.5;
  mode = 0;
  /** chargers only charge after something has hit them */
  provoked = false;
  shootT = 1.5 + Math.random() * 2;
  dead = false;
  knock = 0;

  constructor(
    public def: EnemyDef,
    x: number,
    y: number,
  ) {
    this.w = def.box[0];
    this.h = def.box[1];
    this.x = x - this.w / 2;
    this.y = y - this.h;
    this.hp = def.hp;
  }
  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }
}

export class Drop implements Body {
  x: number;
  y: number;
  w = 12;
  h = 12;
  vx: number;
  vy: number;
  onGround = false;
  age = 0;
  bob = Math.random() * 6;
  constructor(
    public item: string,
    public count: number,
    x: number,
    y: number,
  ) {
    this.x = x - 6;
    this.y = y - 6;
    this.vx = (Math.random() - 0.5) * 120;
    this.vy = -160 - Math.random() * 120;
  }
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  color: string;
  life: number;
  r: number;
  gravity: number;
  hostile: boolean;
  arrow?: boolean;
}

export class Bomb implements Body {
  x: number;
  y: number;
  w = 12;
  h = 12;
  vx: number;
  vy: number;
  onGround = false;
  fuse = 1.7;
  /** pick tier the thrower owned, which sets what the blast can break */
  tier = 0;
  constructor(x: number, y: number, vx: number, vy: number) {
    this.x = x - 6;
    this.y = y - 6;
    this.vx = vx;
    this.vy = vy;
  }
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  glow: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  big?: boolean;
}

export function applyGravity(b: Body, dt: number, scale = 1): void {
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * scale * dt);
}
