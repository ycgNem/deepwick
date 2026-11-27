/**
 * Furniture for a home. Each piece is made at the workbench (the stove at the anvil), goes on the
 * floor, on a back wall or under a ceiling, and brings one kind of comfort to the room it is in.
 * A room counts each kind of comfort once, so a home is furnished, not stacked (see home.ts).
 */
import { Obj } from '../world/world';

export type Mount = 'floor' | 'wall' | 'ceiling';
export type ComfortKind = 'fire' | 'seat' | 'table' | 'shelf' | 'green' | 'art' | 'rug' | 'dog';

export interface FurnDef {
  obj: Obj;
  item: string;
  /** its 32x32 cell in camp/furniture.png */
  cell: number;
  mount: Mount;
  kind: ComfortKind;
}

export const FURNITURE: FurnDef[] = [
  { obj: Obj.TABLE, item: 'table', cell: 0, mount: 'floor', kind: 'table' },
  { obj: Obj.CHAIR, item: 'chair', cell: 1, mount: 'floor', kind: 'seat' },
  { obj: Obj.ROCKER, item: 'rocker', cell: 2, mount: 'floor', kind: 'seat' },
  { obj: Obj.GERANIUM, item: 'geranium', cell: 3, mount: 'floor', kind: 'green' },
  { obj: Obj.FERN, item: 'fern', cell: 4, mount: 'floor', kind: 'green' },
  { obj: Obj.DOGBED, item: 'dogbed', cell: 5, mount: 'floor', kind: 'dog' },
  { obj: Obj.PAINTING, item: 'painting', cell: 6, mount: 'wall', kind: 'art' },
  { obj: Obj.BANNER, item: 'banner', cell: 7, mount: 'wall', kind: 'art' },
  { obj: Obj.ANTLERS, item: 'antlers', cell: 8, mount: 'wall', kind: 'art' },
  { obj: Obj.CUPBOARD, item: 'cupboard', cell: 9, mount: 'floor', kind: 'shelf' },
  { obj: Obj.STOOL, item: 'stool', cell: 10, mount: 'floor', kind: 'seat' },
  { obj: Obj.HEARTH, item: 'hearth', cell: 11, mount: 'floor', kind: 'fire' },
  { obj: Obj.CLOCK, item: 'clock', cell: 12, mount: 'wall', kind: 'art' },
  { obj: Obj.SHELF, item: 'bookshelf', cell: 13, mount: 'floor', kind: 'shelf' },
  { obj: Obj.RUG, item: 'rug', cell: 14, mount: 'floor', kind: 'rug' },
  { obj: Obj.STOVE, item: 'stove', cell: 15, mount: 'floor', kind: 'fire' },
  { obj: Obj.HERBS, item: 'herbs', cell: 16, mount: 'ceiling', kind: 'green' },
  { obj: Obj.DESK, item: 'desk', cell: 17, mount: 'floor', kind: 'table' },
  { obj: Obj.DRESSER, item: 'dresser', cell: 18, mount: 'floor', kind: 'shelf' },
];

export const FURN = new Map<number, FurnDef>(FURNITURE.map((f) => [f.obj, f]));

/** the first of the furniture icons in the drawn-at-load icon sheet */
export const FURN_ICON0 = 5;

/** fires: they cook, warm you and steady you; a hearth or a stove makes the best home */
export const FIRES = new Set<number>([Obj.CAMPFIRE, Obj.HEARTH, Obj.STOVE]);
/** what a fire is worth to a home */
export const HOME_FIRE: Partial<Record<number, number>> = { [Obj.HEARTH]: 2, [Obj.STOVE]: 2, [Obj.CAMPFIRE]: 1, [Obj.FURNACE]: 1 };
