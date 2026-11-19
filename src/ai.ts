import type { Game } from './game';
import { Enemy, moveBody, applyGravity } from './entities';
import { TILE } from './constants';
import { audio } from './audio';

function los(g: Game, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) / (TILE / 3));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (g.world.solidAtPx(ax + dx * t, ay + dy * t)) return false;
  }
  return true;
}

export function updateEnemy(g: Game, e: Enemy, dt: number): void {
  const pl = g.player;
  const dx = pl.cx - e.cx;
  const dy = pl.cy - e.cy;
  const dist = Math.hypot(dx, dy);
  const aware = dist < 13 * TILE && !pl.dead;
  e.t += dt;
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
