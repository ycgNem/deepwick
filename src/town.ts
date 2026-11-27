/**
 * Town life. The townsfolk you bring home keep hours: by day they work their stalls and now and
 * then stroll over to a neighbour or the Wick for a word; when the bell goes they gather round the
 * Wick to warm their hands; at night they go in, and their windows glow. Near you they talk: about
 * the season, the weather, the dog, a tide coming, and now and then something worth knowing.
 * On a tide night they go in early and bar the door.
 */
import type { Game } from './game';
import type { BuildingKind } from './state';
import { TILE } from './constants';
import { WICK_X } from './data/wick';
import { groundAt } from './world/gen';
import { isNight } from './game';
import type { SeasonId } from './seasons';

export type TownPlan = 'stall' | 'stroll' | 'visit' | 'wick' | 'home' | 'inside';

export interface Townie {
  kind: BuildingKind;
  /** feet, px */
  x: number;
  y: number;
  facing: number;
  walkT: number;
  moving: boolean;
  plan: TownPlan;
  /** where they are walking to (px) */
  tx: number;
  /** seconds to stay where they have got to */
  waitT: number;
  /** seconds until the next stroll */
  strollT: number;
  say: string;
  sayT: number;
  chatT: number;
}

interface Lines {
  any: string[];
  season: Record<SeasonId, string[]>;
  dusk: string[];
  dog: string[];
}

const LINES: Record<BuildingKind, Lines> = {
  trade: {
    any: ['Buying, selling, gossiping. Mostly gossiping.', 'Sell me your ore, delver. I know a man two valleys over.', 'Somebody has to ring that bell. Might as well be me.', 'A home is four walls, a fire and a chair. The rest is cushions, and I can get you cushions.'],
    season: {
      spring: ['Seeds! Fresh seeds! Well. Last year\'s seeds.', 'Mud on every boot in the valley. Mind my floor.'],
      summer: ['Storm season. Lightning hit the old mill once, you know.', 'Long days are good for trade. Bad for my feet.'],
      autumn: ['Stock up for winter, delver. Nothing grows once the snow comes.', 'Berries are thick on the bushes. Pick them while you can.'],
      winter: ['A Leather Coat, that\'s what you want in this cold.', 'Wind\'s cutting right through the stall. Business is slow.'],
    },
    dusk: ['Bell\'s rung. Off to the Wick with you.'],
    dog: ['Who\'s a good dog? Not you. You stole my sausage.', 'That dog of yours sold me a stick this morning. Paid too much.'],
  },
  forge: {
    any: ['Good iron sings when you strike it. Bad iron sulks.', 'Bring me bars, not excuses.', 'I can hear the mountain settling at night. Don\'t like it.', 'Sleep in your own bed by your own fire, delver. You swing a pick better for it.'],
    season: {
      spring: ['Thaw\'s loosening the rock up top. Prop your tunnels.', 'Spring. Everything\'s dripping, my forge included.'],
      summer: ['Hot as my forge out here. I\'ll take it.', 'Storms make good light for working. Lightning\'s just a big spark.'],
      autumn: ['Leaves are turning. Get your wood in before the snow.', 'Fog in the valley. Sound carries strange in fog.'],
      winter: ['Cold enough to crack an anvil. Keep near a fire after dark.', 'Build yourself four walls and a roof, delver. The wind can\'t follow you in.'],
    },
    dusk: ['Warm your hands, all of you. Night\'s coming.', 'Look at her burn. We did that.'],
    dog: ['That dog\'s been sniffing round my coal sack again.', 'Good nose on that mutt. Better than mine.'],
  },
  archive: {
    any: ['Every relic you bring me is a page of Deepwick we thought was lost.', 'The old miners wrote in the margins. Mostly complaints.', 'There are more lamps down there. More names.', 'The old miners lived in rooms cut from the rock, with a hearth in the wall. Warm as a bread oven, the ledgers say.'],
    season: {
      spring: ['The swallows are back. The records say they always come back.', 'Spring rains. The ledgers say the mine floods worse in spring.'],
      summer: ['Long days. More hours to read by.', 'The almanac says the summer storms come off the east peak. It\'s usually wrong.'],
      autumn: ['Fog again. The old ledgers call this mine weather.', 'Autumn. The town used to lay in a whole winter\'s food by now.'],
      winter: ['The old town wintered underground, you know. The rock keeps the warmth.', 'Snow on the archive roof. I hope the old shingles hold.'],
    },
    dusk: ['The Wick looks brighter every night. I\'m writing it down.', 'I counted the lights on the hills tonight. More than last week.'],
    dog: ['Tallow sat with me all morning. Excellent listener.', 'I\'ve started a file on your dog. It\'s mostly about sausages.'],
  },
  stillroom: {
    any: ['Glowcaps, jade, a little patience. That\'s all a good draught is.', 'You look pale. Paler. Sit by the Wick a while.', 'The dark gets into people. Light gets it out.', 'A good night in a warm room does more for you than any draught of mine.'],
    season: {
      spring: ['Everything\'s sprouting. My shelves will be full by summer.', 'Plant your seeds now. They grow fastest in spring.'],
      summer: ['Drink water, delver. You look like dried moss.', 'Summer storms. Stay out from under the tall trees.'],
      autumn: ['Pick the berries now. Winter takes everything.', 'The bushes are heavy this year. Eat while you can.'],
      winter: ['Soaked in this cold, you\'ll freeze twice as fast. Dry off by a fire.', 'Nothing grows till spring. Keep something in your pack to eat.'],
    },
    dusk: ['There\'s nothing like the Wick at dusk. Nothing.', 'Hands out, everyone. Free warmth.'],
    dog: ['Keep that dog out of my herbs. ...Fine. One biscuit.', 'Your dog has better sense than most delvers. He stays by the fire.'],
  },
};

const TIDE_LINES = ['A tide tonight. Light every torch you have.', 'I\'ll be indoors when the tide comes. You hold the Wick.', 'The birds went quiet this morning. Tide\'s coming.'];

/** where each of them stands at the Wick of an evening (tiles off its centre) */
const WICK_SPOT: Record<BuildingKind, number> = { forge: -2.4, archive: 2.4, stillroom: -3.6, trade: 3.6 };

export class Town {
  folk: Townie[] = [];
  /** one voice at a time */
  private quietT = 2;

  /** someone in by the fire at night: their windows glow */
  inside(kind: BuildingKind): boolean {
    return this.folk.find((t) => t.kind === kind)?.plan === 'inside';
  }

  update(g: Game, dt: number): void {
    const p = g.p;
    // in step with the buildings (a townsperson just home walks over first)
    this.folk = this.folk.filter((t) => p.buildings.some((b) => b.kind === t.kind));
    for (const b of p.buildings) {
      if (this.folk.some((t) => t.kind === b.kind) || g.homing.some((h) => h.kind === b.kind)) continue;
      const x = this.stall(b.kind, g);
      this.folk.push({ kind: b.kind, x, y: b.y * TILE, facing: -1, walkT: 0, moving: false, plan: 'stall', tx: x, waitT: 0, strollT: 20 + Math.random() * 40, say: '', sayT: 0, chatT: 4 + Math.random() * 10 });
    }
    const c = p.clock;
    const tide = !!p.tide || (g.tideTonight() && c >= 0.55);
    const night = isNight(c) || tide;
    const dusk = !night && c >= 0.5 && p.wick.kindled;
    this.quietT -= dt;
    const pl = g.player;
    for (const t of this.folk) {
      t.sayT = Math.max(0, t.sayT - dt);
      t.chatT -= dt;
      const walker = t.kind !== 'trade';
      // where they should be now
      if (night) {
        if (t.plan !== 'inside' && t.plan !== 'home') this.go(t, 'home', this.door(t.kind, g));
      } else if (t.plan === 'inside') {
        // out at first light
        t.plan = 'stall';
        t.x = this.door(t.kind, g);
        t.tx = this.stall(t.kind, g);
      } else if (dusk && walker) {
        if (t.plan !== 'wick') this.go(t, 'wick', (WICK_X + 0.5 + WICK_SPOT[t.kind]) * TILE);
      } else if (t.plan === 'wick') this.go(t, 'stall', this.stall(t.kind, g));
      else if (walker && t.plan === 'stall' && Math.abs(t.x - t.tx) < 1) {
        // now and then a stroll: over to a neighbour, or to the Wick
        t.strollT -= dt * (g.weather.snow > 0.3 || g.weather.rain > 0.3 ? 0.4 : 1);
        if (t.strollT <= 0) {
          t.strollT = 50 + Math.random() * 50;
          const others = this.folk.filter((o) => o !== t && o.plan === 'stall');
          if (others.length && Math.random() < 0.65) {
            const o = others[Math.floor(Math.random() * others.length)];
            this.go(t, 'visit', o.x + (t.x < o.x ? -1 : 1) * 1.3 * TILE);
          } else this.go(t, 'stroll', (WICK_X + 0.5 + WICK_SPOT[t.kind] * 0.8) * TILE);
          t.waitT = 9 + Math.random() * 7;
        }
      } else if ((t.plan === 'visit' || t.plan === 'stroll') && Math.abs(t.x - t.tx) < 1) {
        t.waitT -= dt;
        if (t.waitT <= 0) this.go(t, 'stall', this.stall(t.kind, g));
      }
      // walking
      const dx = t.tx - t.x;
      // Pell keeps to his stall: he just steps in and out of the door
      const step = walker ? Math.sign(dx) * Math.min(Math.abs(dx), 58 * dt) : dx;
      t.x += step;
      t.moving = Math.abs(step) > 0.05 && walker;
      if (t.moving) {
        t.walkT += dt;
        t.facing = Math.sign(dx);
      } else if (t.plan === 'wick') t.facing = (WICK_X + 0.5) * TILE > t.x ? 1 : -1;
      else if (t.plan === 'visit') {
        const o = this.folk.find((x) => x !== t && Math.abs(x.x - t.x) < 2 * TILE);
        if (o) t.facing = o.x > t.x ? 1 : -1;
      } else if (Math.abs(pl.cx - t.x) < 10 * TILE) t.facing = pl.cx > t.x ? 1 : -1;
      const gy = this.floor(g, t);
      t.y += (gy - t.y) * Math.min(1, dt * 12);
      // home: in through the door
      if (t.plan === 'home' && Math.abs(t.x - t.tx) < 1) t.plan = 'inside';
      // a word, when you are close
      if (t.plan !== 'inside' && t.chatT <= 0 && t.sayT <= 0 && this.quietT <= 0 && !pl.dead && Math.hypot(pl.cx - t.x, pl.y + pl.h - t.y) < 6 * TILE) {
        t.say = this.line(t, g, dusk);
        t.sayT = 4.5;
        t.chatT = 22 + Math.random() * 18;
        this.quietT = 7;
      }
    }
  }

  /** the floor under their feet: up a step or down a drop from where they stand, never up onto a roof you built over them */
  private floor(g: Game, t: Townie): number {
    const w = g.world;
    const tx = Math.floor(t.x / TILE);
    let ty = Math.round(t.y / TILE);
    if (ty <= 0 || ty >= w.h) return groundAt(w, tx) * TILE;
    for (let k = 0; k < 3 && w.rock(tx, ty - 1); k++) ty--;
    for (let k = 0; k < 8 && !w.rock(tx, ty); k++) ty++;
    return ty * TILE;
  }

  private go(t: Townie, plan: TownPlan, x: number): void {
    t.plan = plan;
    t.tx = x;
  }

  private stall(kind: BuildingKind, g: Game): number {
    const b = g.p.buildings.find((x) => x.kind === kind);
    return b ? (b.x + 2 - 0.9) * TILE : 0;
  }

  private door(kind: BuildingKind, g: Game): number {
    const b = g.p.buildings.find((x) => x.kind === kind);
    return b ? b.x * TILE : 0;
  }

  private line(t: Townie, g: Game, dusk: boolean): string {
    const L = LINES[t.kind];
    const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];
    const r = Math.random();
    if (dusk && t.plan === 'wick' && r < 0.6) return pick(L.dusk);
    if (g.tideTonight() && !isNight(g.p.clock) && r < 0.5) return pick(TIDE_LINES);
    const dg = g.dog;
    if (dg.found && Math.abs(dg.x - t.x) < 5 * TILE && r < 0.35) return pick(L.dog);
    return Math.random() < 0.55 ? pick(L.season[g.season.id]) : pick(L.any);
  }
}
