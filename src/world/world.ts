import { WORLD_W, WORLD_H, TILE } from '../constants';
import { BLOCKS, B } from '../data/blocks';

export enum Obj {
  NONE = 0,
  TORCH = 1,
  LADDER = 2,
  CHEST = 3,
  CHEST_OPEN = 4,
  LIFT = 5,
  BEAM = 6,
  CAMP_TORCH = 7,
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
  explored = new Uint8Array(WORLD_W * WORLD_H);
  /** surface row for every column */
  surface = new Int16Array(WORLD_W);
  damage = new Map<number, TileDamage>();
  /** tiles changed since the minimap last redrew them */
  dirty = new Set<number>();
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
  }
  solid(x: number, y: number): boolean {
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
  solidAtPx(px: number, py: number): boolean {
    return this.solid(Math.floor(px / TILE), Math.floor(py / TILE));
  }
  /** a tile that something can stand on / a torch can be mounted to */
  isAnchor(x: number, y: number): boolean {
    return this.solid(x, y) || this.wall[this.idx(x, y)] !== 0;
  }
}
