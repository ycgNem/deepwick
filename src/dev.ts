/** Dev-only playtest helpers, exposed on window as __dev. Not included in production builds. */
import type { Game } from './game';
import { BIOMES } from './data/biomes';
import { TILE } from './constants';
import { B } from './data/blocks';
import { give } from './state';

export function installDev(getGame: () => Game | null): void {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const dev = {
    sleep,
    down: (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code })),
    up: (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code })),
    async hold(code: string, ms: number) {
      dev.down(code);
      await sleep(ms);
      dev.up(code);
    },
    aim(tx: number, ty: number) {
      const g = getGame();
      if (!g) return;
      g.input.mouseX = ((tx + 0.5) * TILE - g.camX) * g.scale;
      g.input.mouseY = ((ty + 0.5) * TILE - g.camY) * g.scale;
    },
    /** teleport to a random standing spot in a biome; god mode keeps tests alive */
    goBiome(i: number, god = true) {
      const g = getGame();
      if (!g) return null;
      const w = g.world;
      const bm = BIOMES[i];
      for (let tries = 0; tries < 6000; tries++) {
        const x = 6 + Math.floor(Math.random() * (w.w - 12));
        const y = bm.top + 8 + Math.floor(Math.random() * Math.max(4, bm.bottom - bm.top - 12));
        if (w.get(x, y) === 0 && w.get(x, y - 1) === 0 && w.solid(x, y + 1) && w.get(x + 1, y) === 0 && w.get(x, y + 1) !== B.LAVA) {
          g.placePlayer((x + 0.5) * TILE, (y + 1) * TILE);
          if (god) {
            g.player.oil = 9999;
            g.player.hp = 9999;
          }
          return { x, y };
        }
      }
      return null;
    },
    /** put items straight into the pack */
    give(id: string, n = 1) {
      const g = getGame();
      if (g) give(g.p.inv, id, n);
    },
    async mine(tx: number, ty: number, maxMs = 6000) {
      const g = getGame();
      if (!g) return false;
      dev.aim(tx, ty);
      g.input.mouseLeft = true;
      let t = 0;
      while (g.world.get(tx, ty) !== 0 && t < maxMs) {
        await sleep(100);
        t += 100;
        dev.aim(tx, ty);
      }
      g.input.mouseLeft = false;
      return g.world.get(tx, ty) === 0;
    },
  };
  Object.assign(window as object, { __dev: dev });
}
