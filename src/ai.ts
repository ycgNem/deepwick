import type { Game } from './game';
import { Enemy, moveBody, applyGravity } from './entities';
import { TILE } from './constants';
import { audio } from './audio';
import { LIT, NERVE_SHAKEN } from './data/nerve';
import { WICK_GLOW, WICK_Y } from './data/wick';
import { HELD } from './data/lampless';
import { BLOCKS } from './data/blocks';

export function los(g: Game, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) / (TILE / 3));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (g.world.solidAtPx(ax + dx * t, ay + dy * t)) return false;
  }
  return true;
}

/**
 * A Lampless that cannot reach you walks out of the dark somewhere else: open floor in the same
 * cave as you (found by feeling out through the open air from where you stand), well out of any
 * light, and no further from you than it was.
 */
function stepThroughDark(g: Game, e: Enemy, now: number): boolean {
  const pl = g.player;
  const w = g.world;
  const ptx = Math.floor(pl.cx / TILE);
  const pty = Math.floor((pl.y + pl.h - 1) / TILE);
  const open = (x: number, y: number): boolean => w.inside(x, y) && !w.solid(x, y) && !BLOCKS[w.get(x, y)].liquid;
  const spots: [number, number][] = [];
  if (open(ptx, pty)) {
    const seen = new Set<number>([w.idx(ptx, pty)]);
    const q: [number, number][] = [[ptx, pty]];
    for (let h = 0; h < q.length && q.length < 1600; h++) {
      const [x, y] = q[h];
      const ddx = x - ptx;
      const ddy = y - pty;
      const d = Math.hypot(ddx, ddy);
      if (d >= 6 && w.solid(x, y + 1) && open(x, y - 1) && g.light.at(x, y) < 0.2 && g.light.at(x, y - 1) < 0.2 && !g.inWickLight(x * TILE, y * TILE)) spots.push([x, y]);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (Math.abs(nx - ptx) > 14 || Math.abs(ny - pty) > 10 || !open(nx, ny)) continue;
        const k = w.idx(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
  }
  for (let tries = 0; tries < 12 && spots.length; tries++) {
    const [tx, ty] = spots[Math.floor(Math.random() * spots.length)];
    const nx = tx * TILE + TILE / 2;
    const ny = (ty + 1) * TILE - 1 - e.h / 2;
    const d = Math.hypot(nx - pl.cx, ny - pl.cy);
    if (d > now) continue;
    e.x = nx - e.w / 2;
    e.y = (ty + 1) * TILE - 1 - e.h;
    e.vx = 0;
    e.vy = 0;
    e.best = d;
    e.stuck = 0;
    e.lost = 0;
    return true;
  }
  // nowhere yet: try again a little later; after long enough it gives up and goes back to the dark
  e.stuck = 1.5;
  if (++e.lost > 10) e.dead = true;
  return false;
}

export function updateEnemy(g: Game, e: Enemy, dt: number): void {
  const pl = g.player;
  const dx = pl.cx - e.cx;
  const dy = pl.cy - e.cy;
  const dist = Math.hypot(dx, dy);
  const aware = dist < 13 * TILE && !pl.dead;
  e.t += dt;
  e.age += dt;
  e.animT += dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.knock > 0) e.knock -= dt;
  const sp = e.def.speed;

  switch (e.def.behavior) {
    case 'critter': {
      // hops about; bolts away from anything that gets close
      applyGravity(e, dt);
      const r = moveBody(g.world, e, dt);
      const scared = dist < 5 * TILE || e.mode === 1;
      if (e.onGround) {
        e.vx *= Math.max(0, 1 - dt * 8);
        e.stateT -= dt;
        if (e.stateT <= 0) {
          const dir = scared ? -Math.sign(dx) || 1 : Math.random() < 0.5 ? -1 : 1;
          e.facing = dir;
          e.vx = dir * sp * (scared ? 1.6 : 0.6);
          e.vy = scared ? -380 : -260;
          e.stateT = scared ? 0.25 + Math.random() * 0.2 : 0.8 + Math.random() * 1.8;
        }
      } else if (r.hitX) {
        e.vy = Math.min(e.vy, -300);
      }
      break;
    }
    case 'charger': {
      // grazes peacefully until something hits it, then lowers its tusks and charges
      applyGravity(e, dt);
      const sameBand = Math.abs(dy) < 3 * TILE;
      if (e.provoked && dist > 12 * TILE) e.provoked = false;
      if (e.mode === 0 && e.provoked && aware && sameBand && Math.abs(dx) < 6 * TILE) e.mode = 1;
      let dir = e.facing;
      let speed = sp * 0.35;
      e.stateT -= dt;
      if (e.mode === 1) {
        if (e.stateT <= 0) {
          e.mode = 2;
          e.stateT = 1.1;
          e.facing = Math.sign(dx) || e.facing;
        }
        speed = 0;
      } else if (e.mode === 2) {
        dir = e.facing;
        speed = sp * 2.6;
        if (e.stateT <= 0) {
          e.mode = aware && dist < 8 * TILE ? 1 : 0;
          e.stateT = 0.9 + Math.random() * 0.6;
        }
      } else if (e.stateT <= 0) {
        e.facing = Math.random() < 0.5 ? -1 : 1;
        e.stateT = 1.5 + Math.random() * 2.5;
      }
      if (e.knock <= 0) e.vx += (dir * speed - e.vx) * Math.min(1, dt * 6);
      const r = moveBody(g.world, e, dt);
      if (r.hitX && e.onGround) {
        const ahead = Math.floor((e.cx + dir * (e.w / 2 + 4)) / TILE);
        const head = Math.floor((e.y - 4) / TILE);
        if (!g.world.solid(ahead, head) && e.mode !== 1) e.vy = -440;
        else e.facing = -dir;
      }
      break;
    }
    case 'flyer': {
      let tx = 0;
      let ty = 0;
      if (aware) {
        tx = (dx / dist) * sp;
        ty = (dy / dist) * sp + Math.sin(e.t * 5) * 60;
        e.stateT -= dt;
        if (e.stateT <= 0 && dist < 5 * TILE) {
          // swoop
          e.vx = (dx / dist) * sp * 2.6;
          e.vy = (dy / dist) * sp * 2.6;
          e.stateT = 1.6 + Math.random();
        }
      } else {
        tx = Math.cos(e.t * 0.7) * sp * 0.4;
        ty = Math.sin(e.t * 1.3) * sp * 0.3;
      }
      if (e.knock <= 0) {
        e.vx += (tx - e.vx) * Math.min(1, dt * 2.2);
        e.vy += (ty - e.vy) * Math.min(1, dt * 2.2);
      }
      moveBody(g.world, e, dt);
      if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
      break;
    }
    case 'hopper': {
      applyGravity(e, dt);
      const r = moveBody(g.world, e, dt);
      if (e.onGround) {
        e.vx *= Math.max(0, 1 - dt * 10);
        e.stateT -= dt;
        if (e.stateT <= 0) {
          const dir = aware ? Math.sign(dx) || 1 : Math.random() < 0.5 ? -1 : 1;
          e.facing = dir;
          e.vx = dir * sp * (aware ? 1.6 : 0.8);
          e.vy = -(e.def.id === 'toad' ? 520 : 430);
          e.stateT = 0.7 + Math.random() * 0.9;
        }
      } else if (r.hitX) e.vx = -e.vx * 0.3;
      break;
    }
    case 'walker':
    case 'roller': {
      applyGravity(e, dt);
      let dir = e.facing;
      const sameBand = Math.abs(dy) < 4 * TILE;
      if (aware && sameBand) dir = Math.sign(dx) || dir;
      let speed = sp * (aware ? 1 : 0.5);
      if (e.def.behavior === 'roller') {
        e.stateT -= dt;
        if (e.mode === 0 && aware && Math.abs(dx) < 7 * TILE && e.stateT <= 0) {
          e.mode = 1;
          e.stateT = 1.3;
        } else if (e.mode === 1 && e.stateT <= 0) {
          e.mode = 0;
          e.stateT = 1.8;
        }
        if (e.mode === 1) speed = sp * 3;
      }
      if (e.knock <= 0) e.vx += (dir * speed - e.vx) * Math.min(1, dt * 6);
      const r = moveBody(g.world, e, dt);
      if (r.hitX && e.onGround) {
        // hop up a ledge if there is room, else turn around
        const ahead = Math.floor((e.cx + dir * (e.w / 2 + 4)) / TILE);
        const head = Math.floor((e.y - 4) / TILE);
        if (!g.world.solid(ahead, head)) e.vy = -460;
        else e.facing = -dir;
      } else e.facing = dir;
      // spider pounce
      if (e.def.id === 'spider' && aware && e.onGround && dist < 4 * TILE && Math.random() < dt * 0.9) {
        e.vy = -480;
        e.vx = Math.sign(dx) * sp * 2.2;
      }
      break;
    }
    case 'shooter': {
      const want = 5 * TILE;
      let tx = 0;
      let ty = 0;
      if (aware) {
        const k = dist > want ? 1 : -0.8;
        tx = (dx / dist) * sp * k;
        ty = (dy / dist) * sp * k - 30 + Math.sin(e.t * 2.3) * 40;
        e.shootT -= dt;
        if (e.shootT <= 0 && los(g, e.cx, e.cy, pl.cx, pl.cy)) {
          e.shootT = e.def.id === 'imp' ? 2.2 + Math.random() : 2.8 + Math.random();
          const ang = Math.atan2(dy, dx);
          const spread = e.def.id === 'wisp' ? [-0.25, 0, 0.25] : [0];
          for (const a of spread) {
            const v = e.def.id === 'imp' ? 230 : 170;
            g.shots.push({
              x: e.cx,
              y: e.cy,
              vx: Math.cos(ang + a) * v,
              vy: Math.sin(ang + a) * v,
              dmg: Math.round(e.def.dmg * 0.8),
              color: e.def.shot ?? '#fff',
              life: 4,
              r: e.def.id === 'imp' ? 6 : 4,
              gravity: 0,
              hostile: true,
            });
          }
          audio.play('fireball', { vol: 0.45, pitch: e.def.id === 'wisp' ? 1.5 : 1 });
        }
      } else {
        tx = Math.cos(e.t * 0.6) * sp * 0.3;
        ty = Math.sin(e.t * 1.1) * sp * 0.3;
      }
      if (e.knock <= 0) {
        e.vx += (tx - e.vx) * Math.min(1, dt * 2);
        e.vy += (ty - e.vy) * Math.min(1, dt * 2);
      }
      moveBody(g.world, e, dt);
      e.facing = Math.sign(dx) || 1;
      break;
    }
    case 'lurker': {
      // a scrap of the dark: it seeps through rock, shuns light, and circles at the edge of your
      // lamp until your nerve goes; then it hunts you, but only while you stand in the dark
      const lit = g.light.at(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE));
      const plLit = g.litHere;
      const hunting = !pl.dead && g.p.nerve < NERVE_SHAKEN && plLit < LIT && e.age > 1.2 && g.buffs.ward <= 0;
      let tx = 0;
      let ty = 0;
      const d = dist || 1;
      e.stateT -= dt;
      if (e.tide) {
        // tide-born: it pushes through the light to gnaw at the Wick's roots, and only turns on you up close
        const near = !pl.dead && dist < 3 * TILE && g.buffs.ward <= 0;
        const gx = near ? pl.cx : WICK_GLOW.x * TILE + Math.cos(e.t * 1.7) * 34;
        const gy = near ? pl.cy : WICK_Y * TILE - 24 + Math.sin(e.t * 2.3) * 8;
        const ox = gx - e.cx;
        const oy = gy - e.cy;
        const od = Math.hypot(ox, oy) || 1;
        if (!near && od < 1.6 * TILE) {
          e.mode = 2;
          tx = (ox / od) * sp * 0.4;
          ty = (oy / od) * sp * 0.4;
        } else {
          e.mode = near ? 1 : 0;
          tx = (ox / od) * sp * 0.9;
          ty = (oy / od) * sp * 0.9 + Math.sin(e.t * 3) * 20;
          if (near && e.stateT <= 0 && e.knock <= 0) {
            e.vx = (dx / d) * sp * 3;
            e.vy = (dy / d) * sp * 3;
            e.stateT = 1.4 + Math.random();
          }
        }
      } else if (lit > LIT) {
        // scatter from the light
        tx = -(dx / d) * sp * 1.5;
        ty = -(dy / d) * sp * 1.5;
        e.mode = 0;
      } else if (hunting && dist < 18 * TILE && e.knock <= 0) {
        tx = (dx / d) * sp;
        ty = (dy / d) * sp + Math.sin(e.t * 3) * 25;
        if (e.stateT <= 0 && dist < 3.5 * TILE) {
          e.vx = (dx / d) * sp * 3.2;
          e.vy = (dy / d) * sp * 3.2;
          e.stateT = 1.3 + Math.random();
        }
        e.mode = 1;
      } else {
        // watch from the edge of the light, drifting round
        const a = e.t * 0.32;
        const want = (g.p.nerve < NERVE_SHAKEN ? 5 : 7.5) * TILE;
        const gx = pl.cx + Math.cos(a) * want;
        const gy = pl.cy + Math.sin(a) * want * 0.55;
        const ox = gx - e.cx;
        const oy = gy - e.cy;
        const od = Math.hypot(ox, oy) || 1;
        const k = Math.min(1, od / (2 * TILE)) * 0.7;
        tx = (ox / od) * sp * k;
        ty = (oy / od) * sp * k + Math.sin(e.t * 2.1) * 14;
        e.mode = 0;
      }
      if (e.knock <= 0) {
        e.vx += (tx - e.vx) * Math.min(1, dt * 2.6);
        e.vy += (ty - e.vy) * Math.min(1, dt * 2.6);
      }
      const thick = g.world.solidAtPx(e.cx, e.cy) ? 0.55 : 1;
      e.x += e.vx * dt * thick;
      e.y += e.vy * dt * thick;
      e.facing = Math.sign(dx) || 1;
      break;
    }
    case 'still': {
      // a Lampless: light on it holds it rooted, cowering; in the dark it comes for you, fast,
      // climbing whatever it cannot step over and up the sides of a shaft after you
      applyGravity(e, dt);
      const tx = Math.floor(e.cx / TILE);
      const lit = Math.max(g.light.at(tx, Math.floor((e.y + 10) / TILE)), g.light.at(tx, Math.floor(e.cy / TILE)));
      const held = lit >= HELD || g.inWickLight(e.cx, e.cy);
      if (held) {
        if (e.mode !== 0) {
          e.mode = 0;
          e.stateT = 0;
        }
        e.stateT += dt;
        // still held with your flame at its lowest: a torch, a lamp or the cave's own glow has it
        if (g.gutter > 0 && g.flameReach() <= 0.35) e.pinned = true;
        if (e.knock <= 0) e.vx = 0;
        if (Math.abs(dx) > 4) e.facing = Math.sign(dx);
      } else {
        const chase = !pl.dead && dist < 26 * TILE;
        if (e.mode === 0 && chase && e.age > 0.3 && dist < 16 * TILE) {
          // it moves, and you hear it before you see it
          audio.play('lurch', { vol: Math.max(0.15, 0.65 - dist / (30 * TILE)) });
          e.shootT = 0.9;
        }
        e.mode = 1;
        e.pinned = false;
        const dir = chase && Math.abs(dx) > 6 ? Math.sign(dx) : 0;
        const speed = sp * (g.gutter > 0 ? 1.3 : 1);
        if (e.knock <= 0) e.vx += (dir * speed - e.vx) * Math.min(1, dt * 10);
        if (dir) e.facing = dir;
        e.shootT -= dt;
        if (chase && e.shootT <= 0 && Math.abs(e.vx) > 30 && dist < 14 * TILE) {
          e.shootT = 0.9;
          audio.play('lurch', { vol: Math.max(0.08, 0.45 - dist / (30 * TILE)), pitch: 0.9 + Math.random() * 0.2 });
        }
        // no way through (it has not gained on you in three seconds)? it steps out of the dark
        // somewhere else, nearer you
        if (!chase || dist < e.best - 12) {
          e.best = dist;
          e.stuck = 0;
        } else {
          e.stuck += dt;
          if (e.stuck > 3) {
            e.best = dist;
            if (stepThroughDark(g, e, dist)) return;
          }
        }
      }
      const r = moveBody(g.world, e, dt);
      if (!held && e.knock <= 0 && !pl.dead) {
        const ty = Math.floor(e.cy / TILE);
        const shaft = dy < -1.5 * TILE && Math.abs(dx) < 1.5 * TILE && (g.world.solid(tx - 1, ty) || g.world.solid(tx + 1, ty));
        if (r.hitX || shaft) e.vy = Math.min(e.vy, -210);
      }
      break;
    }
    case 'phaser': {
      const lit = g.light.at(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE));
      const slow = Math.max(0.25, 1.25 - lit);
      if (aware) {
        e.vx += ((dx / dist) * sp * slow - e.vx) * Math.min(1, dt * 1.5);
        e.vy += ((dy / dist) * sp * slow + Math.sin(e.t * 2) * 20 - e.vy) * Math.min(1, dt * 1.5);
      } else {
        e.vx *= 0.98;
        e.vy = Math.sin(e.t) * 15;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.facing = Math.sign(dx) || 1;
      break;
    }
  }
}
