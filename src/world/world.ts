import { WORLD_W, WORLD_H, TILE } from '../constants';
import { BLOCKS, B } from '../data/blocks';

export enum Obj {
  NONE = 0,
  TORCH,
  LADDER,
  /** a world loot chest (opens once) */
  CHEST,
  CHEST_OPEN,
  BEAM,
  TREE,
  SAPLING,
  BUSH,
  BUSH_BERRY,
  WORKBENCH,
  FURNACE,
  ANVIL,
  ALCHEMY,
  CAMPFIRE,
  /** a player-built storage chest */
  STORAGE,
  BED,
  BED_R,
  DOOR,
  DOOR_TOP,
  DOOR_OPEN,
  DOOR_OPEN_TOP,
  HEART_CRYSTAL,
  CROP0,
  CROP1,
  CROP2,
  CROP3,
  /** a mine cart parked on a rail */
  MINECART,
  /** an oil lamp hanging in the old mine */
  LAMP,
  /** a lantern post lit from the Wick: a light and a travel point */
  WICKPOST,
}

/** objects that block movement */
export function objSolid(o: number): boolean {
  return o === Obj.DOOR || o === Obj.DOOR_TOP;
}

export interface TileDamage {
  hp: number;
  t: number;
}

export class World {
  readonly w = WORLD_W;
  readonly h = WORLD_H;
  fg = new Uint8Array(WORLD_W * WORLD_H);
  wall = new Uint8Array(WORLD_W * WORLD_H);
  decor = new Uint8Array(WORLD_W * WORLD_H);
  obj = new Uint8Array(WORLD_W * WORLD_H);
  /** blocks the player put down (they give no mining experience back) */
  placed = new Uint8Array(WORLD_W * WORLD_H);
  /** mine rails, a layer of their own so frames and lamps can share their tiles */
  rail = new Uint8Array(WORLD_W * WORLD_H);
  explored = new Uint8Array(WORLD_W * WORLD_H);
  /** surface row for every column (as generated) */
  surface = new Int16Array(WORLD_W);
  /** first solid row from the top of each column, kept up to date as blocks change */
  skyline = new Int16Array(WORLD_W);
  damage = new Map<number, TileDamage>();
  /** tiles changed since the minimap last redrew them */
  dirty = new Set<number>();
  /** called whenever a block or wall changes (the renderer's chunk cache listens) */
  onChange: ((x: number, y: number) => void) | null = null;
  seed = 1;

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number): number {
    if (x < 0 || x >= this.w) return B.BEDROCK;
    if (y < 0) return B.AIR;
    if (y >= this.h) return B.BEDROCK;
    return this.fg[y * this.w + x];
  }
  set(x: number, y: number, b: number): void {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.fg[i] = b;
    this.dirty.add(i);
    this.onChange?.(x, y);
    if (BLOCKS[b].solid) {
      if (y < this.skyline[x]) this.skyline[x] = y;
    } else if (y === this.skyline[x]) this.updateSky(x);
  }
  updateSky(x: number): void {
    let y = 0;
    while (y < this.h && !BLOCKS[this.fg[y * this.w + x]].solid) y++;
    this.skyline[x] = y;
  }
  updateAllSky(): void {
    for (let x = 0; x < this.w; x++) this.updateSky(x);
  }
  /** solid for movement: rock or a closed door */
  solid(x: number, y: number): boolean {
    if (BLOCKS[this.get(x, y)].solid) return true;
    return this.inside(x, y) && objSolid(this.obj[y * this.w + x]);
  }
  /** solid rock only (no doors) */
  rock(x: number, y: number): boolean {
    return BLOCKS[this.get(x, y)].solid;
  }
  getObj(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.obj[y * this.w + x];
  }
  setObj(x: number, y: number, o: number): void {
    if (!this.inside(x, y)) return;
    this.obj[y * this.w + x] = o;
    this.dirty.add(y * this.w + x);
  }
  getWall(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.wall[y * this.w + x];
  }
  setWall(x: number, y: number, b: number): void {
    if (!this.inside(x, y)) return;
    this.wall[y * this.w + x] = b;
    this.dirty.add(y * this.w + x);
    this.onChange?.(x, y);
  }
  hasRail(x: number, y: number): boolean {
    return this.inside(x, y) && this.rail[y * this.w + x] !== 0;
  }
  setRail(x: number, y: number, on: boolean): void {
    if (!this.inside(x, y)) return;
    this.rail[y * this.w + x] = on ? 1 : 0;
    this.dirty.add(y * this.w + x);
  }
  solidAtPx(px: number, py: number): boolean {
    return this.solid(Math.floor(px / TILE), Math.floor(py / TILE));
  }
  /** a tile something can be mounted on / built against */
  isAnchor(x: number, y: number): boolean {
    return this.rock(x, y) || this.getWall(x, y) !== 0;
  }
}
