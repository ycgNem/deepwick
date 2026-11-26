/**
 * The turning year. Four days of each season, spring first: a gentle start, warm dry summers with
 * storms, foggy autumns when the leaves turn and the bushes are heavy with berries, then winter.
 * In winter snow falls instead of rain and lies on the meadow, nothing grows, the birds go quiet,
 * and the nights are bitter: out in the open with no fire the cold gets into you. The mountain
 * itself is the warm place then; a few tiles underground the cold cannot follow.
 */
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

/** days in a season */
export const SEASON_DAYS = 4;

export interface SeasonDef {
  id: SeasonId;
  name: string;
  /** how fast crops and saplings grow */
  growth: number;
  /** how fast berry bushes fruit */
  berries: number;
  /** how many critters come out on the meadow by day */
  critters: number;
  /** the birdsong by day and the crickets by night */
  birds: number;
  crickets: number;
  /** said as it comes in */
  arrive: string;
}

export const SEASONS: SeasonDef[] = [
  { id: 'spring', name: 'Spring', growth: 1.4, berries: 1, critters: 1.2, birds: 1.15, crickets: 0.8, arrive: 'Spring comes to the valley. Things are growing again.' },
  { id: 'summer', name: 'Summer', growth: 1, berries: 1.3, critters: 1, birds: 1, crickets: 1, arrive: 'Summer: long warm days, and storms off the peaks.' },
  { id: 'autumn', name: 'Autumn', growth: 0.7, berries: 1.6, critters: 0.9, birds: 0.6, crickets: 0.5, arrive: 'Autumn turns the leaves. The bushes are heavy with berries.' },
  { id: 'winter', name: 'Winter', growth: 0, berries: 0, critters: 0.45, birds: 0.08, crickets: 0, arrive: 'Winter comes down off the peaks. The nights will be bitter.' },
];

/** which season a day falls in (day 1 is the first of spring) */
export function seasonIndex(day: number): number {
  return Math.floor((Math.max(1, day) - 1) / SEASON_DAYS) % 4;
}

export function seasonOf(day: number): SeasonDef {
  return SEASONS[seasonIndex(day)];
}

/** the day within its season, 1..SEASON_DAYS */
export function seasonDay(day: number): number {
  return ((Math.max(1, day) - 1) % SEASON_DAYS) + 1;
}

/** how much of autumn's colour the trees wear (it comes in over the first day and stays through winter) */
export function autumnTint(day: number, clock: number): number {
  const s = seasonOf(day).id;
  if (s === 'winter') return 1;
  if (s !== 'autumn') return 0;
  return seasonDay(day) === 1 ? Math.min(1, clock * 1.6) : 1;
}
