import { World, Obj } from './world/world';
import { generateWorld, campSpawn, BOSS_CENTER } from './world/gen';
import { LightMap, PointLight } from './world/light';
import { TILE, SURFACE_Y, CAMP_X0, CAMP_X1, SHAFT_X, WORLD_W } from './constants';
import { BLOCKS, B } from './data/blocks';
import { BIOMES, biomeAt, LIFT_ROWS, LIFT_NAMES } from './data/biomes';
import { ITEMS, CONSUMABLES, ConsumableId, SHOP_PRICES, STACK_MAX, RELICS } from './data/items';
import { ENEMIES } from './data/enemies';
import { PICKS, LANTERNS, PACKS, BOOTS, ARMORS, CHARMS, sharpenCost, SHARPEN_MAX } from './data/upgrades';
import {
  Progress,
  Stats,
  computeStats,
  packCount,
  add,
  take,
  itemValue,
  nextRelic,
  xpToNext,
  MAX_LEVEL,
  SkillId,
  canAfford,
  pay,
  owned,
  Bounty,
} from './state';
import { Player, Enemy, Drop, Projectile, Bomb, Particle, FloatText, moveBody, applyGravity, overlaps, inLiquid } from './entities';
import { Input } from './input';
import { audio, MusicId } from './audio';
import { updateEnemy } from './ai';
import { Boss, BOSS_HP } from './boss';
import { Rng } from './rng';

const CEIL_DECOR = new Set([36, 42, 47, 49, 138, 159]);
const JUMP_V = 480;
const AIR_JUMP_V = 440;

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
  levelUp(skill: SkillId, lvl: number): void;
  victory(): void;
}

export const CAMP_SPOTS: Interactable[] = [
  { id: 'shop', x: 46.5 * TILE, y: SURFACE_Y * TILE, label: 'Trade with Pell' },
  { id: 'lift', x: 56 * TILE, y: SURFACE_Y * TILE, label: 'Ride the Lift' },
  { id: 'forge', x: 61 * TILE, y: SURFACE_Y * TILE, label: 'Visit Brannoc\'s Forge' },
  { id: 'archive', x: 66.5 * TILE, y: SURFACE_Y * TILE, label: 'Talk to Wren (Archive)' },
];

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
  biome = 0;
  inCamp = true;
  near: Interactable | null = null;
  hoverTile = { x: 0, y: 0, ok: false, inReach: false };
  hintCooldown = 0;
  lowOilWarned = false;
  rng = new Rng(Date.now() & 0xffff);
  onSave: (() => void) | null = null;

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
    pl.oil = Math.min(p.oil, this.st.oilMax);
    pl.fallStartY = pl.y;
    if (this.p.bounties.length === 0) this.refillBounties();
    this.snapCamera();
  }

  // ------------------------------------------------------------------ helpers
  refresh(): void {
    this.st = computeStats(this.p);
    this.player.hp = Math.min(this.player.hp, this.st.maxHp);
    this.player.oil = Math.min(this.player.oil, this.st.oilMax);
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
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.3,
        life,
        max: life,
        color: colors[i % colors.length],
        size: Math.random() < 0.3 ? 3 : 2,
        grav: glow ? 0 : 600,
        glow,
      });
    }
  }

  playerTile(): { x: number; y: number } {
    return { x: Math.floor(this.player.cx / TILE), y: Math.floor(this.player.cy / TILE) };
  }

  depthOf(tileY: number): number {
    return Math.max(0, tileY - SURFACE_Y);
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

  // ------------------------------------------------------------------ main update
  update(dt: number): void {
    this.time += dt;
    this.p.stats.time += dt;
    if (this.hintCooldown > 0) this.hintCooldown -= dt;
    if (this.fade > 0 || this.fadeAction) this.updateFade(dt);
    const menu = this.ui.isOpen();
    if (!menu) {
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      if (this.boss) this.updateBoss(dt);
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

    const left = inp.isDown('KeyA', 'ArrowLeft');
    const right = inp.isDown('KeyD', 'ArrowRight');
    const up = inp.isDown('KeyW', 'ArrowUp');
    const down = inp.isDown('KeyS', 'ArrowDown');
    const jumpPressed = !inp.blocked && inp.wasPressed('Space');
    const jumpHeld = inp.isDown('Space');
    const liquid = inLiquid(this.world, pl);

    // ladders
    const ptx = Math.floor(pl.cx / TILE);
    const onLadder =
      this.world.getObj(ptx, Math.floor((pl.y + pl.h - 4) / TILE)) === Obj.LADDER ||
      this.world.getObj(ptx, Math.floor((pl.y + 6) / TILE)) === Obj.LADDER;
    const ladderBelow = this.world.getObj(ptx, Math.floor((pl.y + pl.h + 4) / TILE)) === Obj.LADDER;
    if (!pl.climbing && ((onLadder && (up || down)) || (ladderBelow && down && pl.onGround))) {
      pl.climbing = true;
      pl.vx = 0;
      pl.x = ptx * TILE + TILE / 2 - pl.w / 2;
    }
    if (pl.climbing && !onLadder && !ladderBelow) pl.climbing = false;

    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (pl.climbing) {
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
      const maxV = 165 * st.speed * (liquid ? 0.45 : 1);
      const accel = pl.onGround ? 1600 : 1000;
      const target = dir * maxV;
      if (pl.swinging && pl.onGround && !pl.attack) {
        // planted while mining
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

    // hotbar
    for (let i = 0; i < CONSUMABLES.length; i++) if (inp.wasPressed('Digit' + (i + 1))) this.p.hotbar = i;
    if (inp.wheel !== 0) this.p.hotbar = (this.p.hotbar + inp.wheel + CONSUMABLES.length) % CONSUMABLES.length;

    this.updateTargeting();
    this.updateSwing(dt);

    if (!inp.blocked) {
      if (inp.mouseRightPressed || inp.wasPressed('KeyQ')) this.useSelected();
      if (inp.wasPressed('KeyE')) this.interact();
      if (inp.wasPressed('KeyR')) this.useItem('recall');
      if (inp.wasPressed('KeyH')) this.useItem('tonic');
      if (inp.wasPressed('KeyF')) this.useItem('oil');
    }

    // recall channel
    if (pl.recallT > 0) {
      pl.recallT -= dt;
      if (Math.random() < dt * 40) this.burst(pl.cx + (Math.random() - 0.5) * 24, pl.y + pl.h, 1, ['#7ac8ff', '#ffffff'], 40, true);
      if (pl.recallT <= 0) {
        audio.play('teleport', { vary: 0 });
        this.fadeTo(() => this.teleportToCamp());
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
      for (const [id, n] of Object.entries(sat.items)) add(this.p.pack, id, n);
      this.p.satchel = null;
      audio.play('chest_open', { vary: 0 });
      this.toast('Recovered your lost satchel!', '#9af0a0');
    }

    // world bounds
    pl.x = Math.max(2 * TILE, Math.min(pl.x, (WORLD_W - 2) * TILE - pl.w));
  }

  mouseWorld(): { x: number; y: number } {
    return { x: this.input.mouseX / this.scale + this.camX, y: this.input.mouseY / this.scale + this.camY };
  }

  private updateTargeting(): void {
    const m = this.mouseWorld();
    const tx = Math.floor(m.x / TILE);
    const ty = Math.floor(m.y / TILE);
    const pl = this.player;
    const d = Math.hypot(tx * TILE + TILE / 2 - pl.cx, ty * TILE + TILE / 2 - pl.cy);
    const inReach = d <= this.st.reach * TILE;
    const b = this.world.get(tx, ty);
    const def = BLOCKS[b];
    this.hoverTile.x = tx;
    this.hoverTile.y = ty;
    this.hoverTile.inReach = inReach;
    this.hoverTile.ok = inReach && def.solid && !def.unbreakable && !(this.inCampZone(tx, ty) && ty <= SURFACE_Y);
  }

  private inCampZone(tx: number, ty: number): boolean {
    return tx >= CAMP_X0 && tx <= CAMP_X1 && ty < SURFACE_Y + 1;
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

  private updateSwing(dt: number): void {
    const pl = this.player;
    const inp = this.input;
    const held = inp.mouseLeft && !inp.blocked;
    if (!pl.swinging && held && pl.recallT <= 0) {
      // chests can be opened by clicking them
      const ht = this.hoverTile;
      if (this.world.getObj(ht.x, ht.y) === Obj.CHEST && ht.inReach && inp.mouseLeftPressed) {
        this.openChest(ht.x, ht.y);
        return;
      }
      pl.swinging = true;
      pl.swingT = 0;
      pl.swingHit = false;
      pl.attack = this.enemyNearCursor() || !ht.ok;
      pl.swingTarget = pl.attack ? null : { x: ht.x, y: ht.y };
      const m = this.mouseWorld();
      pl.facing = m.x >= pl.cx ? 1 : -1;
      if (pl.attack) audio.play('swing', { vol: 0.5 });
    }
    if (!pl.swinging) return;
    const rate = pl.attack ? 1 / 0.3 : this.st.mineSpeed / 0.34;
    pl.swingT += dt * rate;
    if (!pl.swingHit && pl.swingT >= 0.5) {
      pl.swingHit = true;
      if (pl.attack) this.doAttack();
      else if (pl.swingTarget) this.hitBlock(pl.swingTarget.x, pl.swingTarget.y);
    }
    if (pl.swingT >= 1) {
      pl.swinging = false;
      // keep mining the same tile when the cursor moves onto a new one
    }
  }

  private doAttack(): void {
    const pl = this.player;
    const m = this.mouseWorld();
    const a = Math.atan2(m.y - pl.cy, m.x - pl.cx);
    const hx = pl.cx + Math.cos(a) * 26;
    const hy = pl.cy + Math.sin(a) * 22;
    const R = 34;
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
      this.boss.hp -= dmg;
      this.boss.flash = 0.12;
      this.text(hx, hy - 10, String(dmg), crit ? '#ffd75a' : '#ffffff', crit);
      this.burst(hx, hy, 8, ['#ff4a7a', '#a05aff'], 140, true);
      audio.play('enemy_hit', { pitch: 0.7 });
      this.shake = Math.max(this.shake, 2);
      if (this.boss.hp <= 0) this.killBoss();
    }
    if (hitAny) this.shake = Math.max(this.shake, 2);
  }

  damageEnemy(e: Enemy, ang: number, dmgOverride?: number): void {
    const crit = dmgOverride === undefined && Math.random() < 0.08;
    const dmg = dmgOverride ?? Math.round(this.st.attack * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1));
    e.hp -= dmg;
    e.flash = 0.12;
    e.knock = 0.18;
    e.vx = Math.cos(ang) * 260;
    e.vy = Math.sin(ang) * 200 - 120;
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
    if (Math.random() < e.def.dropChance) this.drops.push(new Drop(e.def.drop, 1, e.cx, e.cy));
    const coins = this.rng.int(e.def.coins[0], e.def.coins[1]);
    if (coins > 0) this.drops.push(new Drop('coin', coins, e.cx, e.cy));
    for (const b of this.p.bounties) if (b.kind === 'slay' && b.target === e.def.id) b.have = Math.min(b.need, b.have + 1);
  }

  hitBlock(tx: number, ty: number): void {
    const b = this.world.get(tx, ty);
    const def = BLOCKS[b];
    if (!def.solid || def.unbreakable) return;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    if (def.tier > this.st.pickTier) {
      audio.play('pick_hit', { pitch: 1.6, vol: 0.6 });
      this.burst(cx, cy, 5, ['#ffffff', '#ffd75a'], 120, true);
      if (this.hintCooldown <= 0) {
        const need = PICKS.find((pk) => pk.tier >= def.tier);
        this.text(cx, cy - 18, `Too hard! Needs ${need ? need.name : 'a better pick'}`, '#ff9a6a');
        this.hintCooldown = 1.2;
      }
      this.hint('tooHard', 'That rock is too hard for your pick. Brannoc\'s Forge at camp can upgrade it.');
      return;
    }
    const i = this.world.idx(tx, ty);
    const dmg = this.st.pickDmg;
    let d = this.world.damage.get(i);
    if (!d) {
      d = { hp: def.hp, t: 0 };
      this.world.damage.set(i, d);
    }
    d.hp -= dmg;
    d.t = 0;
    audio.play('pick_hit', { vol: 0.7 });
    this.shake = Math.max(this.shake, 1.2);
    for (let k = 0; k < 4; k++) {
      const life = 0.3 + Math.random() * 0.3;
      this.parts.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 160,
        vy: -60 - Math.random() * 120,
        life,
        max: life,
        color: def.color,
        size: 2,
        grav: 700,
        glow: false,
      });
    }
    if (d.hp <= 0) this.breakBlock(tx, ty, true);
  }

  breakBlock(tx: number, ty: number, byPlayer: boolean): void {
    const b = this.world.get(tx, ty);
    const def = BLOCKS[b];
    const i = this.world.idx(tx, ty);
    this.world.set(tx, ty, B.AIR);
    this.world.damage.delete(i);
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    // detached decor falls away
    const above = this.world.idx(tx, ty - 1);
    if (ty > 0 && this.world.decor[above] && !CEIL_DECOR.has(this.world.decor[above])) this.world.decor[above] = 0;
    const below = this.world.idx(tx, ty + 1);
    if (ty + 1 < this.world.h && this.world.decor[below] && CEIL_DECOR.has(this.world.decor[below])) this.world.decor[below] = 0;

    this.p.stats.mined++;
    this.burst(cx, cy, 12, [def.color, '#3a3030', def.color], 140);
    if (byPlayer) this.addXp('mining', def.xp);
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
        for (let k = 0; k < n; k++) this.drops.push(new Drop(def.drop, 1, cx, cy));
        if (def.ore) this.p.stats.ores++;
      }
    }
    if (def.ore || def.light) audio.play('ore_break', { vol: 0.8 });
    else audio.play('block_break', { vol: 0.65 });
    if (def.ore && byPlayer) this.hint('firstOre', 'Ore! It goes in your pack. Haul it back to camp and sell it to Pell.');
  }

  private useSelected(): void {
    const id = CONSUMABLES[this.p.hotbar];
    if (id === 'torch' || id === 'ladder') this.placeItem(id);
    else this.useItem(id);
  }

  private placeItem(id: 'torch' | 'ladder'): void {
    const { x, y, inReach } = this.hoverTile;
    if (!inReach) return;
    if (this.p.cons[id] <= 0) {
      this.toast(`Out of ${id}s — Pell sells more at camp.`);
      return;
    }
    const w = this.world;
    if (w.solid(x, y) || w.getObj(x, y) || BLOCKS[w.get(x, y)].liquid) return;
    if (id === 'torch') {
      const anchored = w.isAnchor(x, y) || w.solid(x - 1, y) || w.solid(x + 1, y) || w.solid(x, y + 1) || w.solid(x, y - 1);
      if (!anchored) {
        this.text(x * TILE + 16, y * TILE, 'Nothing to mount it on', '#ff9a6a');
        return;
      }
      w.setObj(x, y, Obj.TORCH);
      audio.play('torch');
      this.burst(x * TILE + 16, y * TILE + 12, 10, ['#ffd75a', '#ff8a2a'], 80, true);
      this.hint('torch', 'Torches light the way home and creatures will not spawn in their glow.');
    } else {
      const ok = w.isAnchor(x, y) || w.getObj(x, y - 1) === Obj.LADDER || w.getObj(x, y + 1) === Obj.LADDER || w.solid(x, y + 1);
      if (!ok) return;
      w.setObj(x, y, Obj.LADDER);
      audio.play('ladder');
    }
    this.p.cons[id]--;
  }

  useItem(id: ConsumableId): void {
    const pl = this.player;
    if (this.p.cons[id] <= 0) {
      this.toast(`No ${ITEMS[id].name} left.`);
      return;
    }
    switch (id) {
      case 'torch':
      case 'ladder':
        this.placeItem(id);
        return;
      case 'bomb': {
        const m = this.mouseWorld();
        const a = Math.atan2(m.y - pl.cy, m.x - pl.cx);
        this.bombs.push(new Bomb(pl.cx, pl.cy - 6, Math.cos(a) * 330 + pl.vx * 0.5, Math.sin(a) * 330 - 120));
        audio.play('swing');
        break;
      }
      case 'oil':
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
        if (this.inCamp || pl.recallT > 0) return;
        pl.recallT = 1.6;
        this.text(pl.cx, pl.y - 6, 'Recalling...', '#7ac8ff');
        break;
    }
    this.p.cons[id]--;
  }

  private interact(): void {
    if (this.near) {
      audio.play('click');
      if (this.near.id === 'chest') {
        this.openChest(Math.floor(this.near.x / TILE), Math.floor(this.near.y / TILE));
        return;
      }
      if (this.near.id.startsWith('lift')) {
        const s = Number(this.near.id.slice(4));
        if (!this.p.lifts[s]) {
          this.p.lifts[s] = true;
          audio.play('upgrade', { pitch: 0.8 });
          this.toast(`Lift station restored: ${LIFT_NAMES[s]}!`, '#9af0a0');
          this.addXp('delving', 40 * s);
          this.onSave?.();
        }
        this.ui.open('lift');
        return;
      }
      this.ui.open(this.near.id);
    }
  }

  openChest(tx: number, ty: number): void {
    if (this.world.getObj(tx, ty) !== Obj.CHEST) return;
    this.world.setObj(tx, ty, Obj.CHEST_OPEN);
    const biome = biomeAt(ty).id;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const r = new Rng(this.world.seed ^ (tx * 7919 + ty * 104729));
    audio.play('chest_open', { vary: 0 });
    this.burst(cx, cy, 20, ['#ffd75a', '#ffffff'], 140, true);
    this.drops.push(new Drop('coin', r.int(15, 40) * (biome + 1) * (biome + 1), cx, cy - 6));
    const consum: ConsumableId[] = ['torch', 'ladder', 'bomb', 'oil', 'tonic', 'recall'];
    for (let k = 0; k < 2; k++) {
      const c = r.pick(consum);
      const n = c === 'torch' || c === 'ladder' ? r.int(4, 8) : 1;
      this.drops.push(new Drop(c, n, cx, cy - 6));
    }
    const ores = BIOMES[Math.min(biome, 4)].ores.filter((o) => BLOCKS[o.block].drop && BLOCKS[o.block].drop !== '@relic');
    for (let k = 0; k < r.int(2, 4); k++) {
      const o = r.pick(ores);
      const drop = BLOCKS[o.block].drop;
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

  private die(): void {
    const pl = this.player;
    pl.hp = 0;
    pl.dead = true;
    pl.deadT = 0;
    pl.swinging = false;
    audio.play('death', { vary: 0 });
    audio.music('none');
    this.p.stats.deaths++;
    if (packCount(this.p) > 0) {
      this.p.satchel = { x: pl.cx, y: pl.cy, items: { ...this.p.pack } };
      this.p.pack = {};
    }
  }

  private respawn(): void {
    const pl = this.player;
    pl.dead = false;
    const lost = Math.floor(this.p.coins * 0.1);
    this.p.coins -= lost;
    this.teleportToCamp();
    pl.hp = this.st.maxHp;
    this.enemies = [];
    this.shots = [];
    this.boss = null;
    this.toast(
      `You blacked out and were dragged back to camp.${lost ? ` (-${lost} coins)` : ''}${this.p.satchel ? ' Your satchel lies where you fell.' : ''}`,
      '#ff9a9a',
    );
  }

  teleportToCamp(): void {
    const s = campSpawn();
    this.placePlayer(s.x * TILE + TILE / 2, s.y * TILE + TILE);
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

  travel(station: number): void {
    if (!this.p.lifts[station]) return;
    audio.play('lift', { vary: 0 });
    this.fadeTo(() => {
      if (station === 0) this.teleportToCamp();
      else this.placePlayer((SHAFT_X + 0.5) * TILE + 40, (LIFT_ROWS[station] + 1) * TILE);
    });
  }

  // ------------------------------------------------------------------ enemies
  private updateEnemies(dt: number): void {
    const pl = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      updateEnemy(this, e, dt);
      if (!pl.dead && e.knock <= 0 && overlaps(pl, e)) {
        this.hurtPlayer(e.def.dmg, e.cx);
        // bounce the creature off so it doesn't sit inside the player
        e.vx = -Math.sign(pl.cx - e.cx || 1) * 160;
        e.knock = 0.25;
      }
      if (Math.hypot(e.cx - pl.cx, e.cy - pl.cy) > 42 * TILE) e.dead = true;
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.1;
      this.trySpawn();
    }
  }

  private trySpawn(): void {
    const pl = this.player;
    const pt = this.playerTile();
    if (this.inCamp || pt.y < this.world.surface[pt.x] + 4 || this.boss) return;
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
      if (ty < this.world.surface[tx] + 3) continue;
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
      this.drops.push(new Drop('r_heart', 1, b.x, b.y));
      this.drops.push(new Drop('coin', 2500, b.x, b.y));
      this.p.relicsDropped.push('r_heart');
      audio.play('relic', { vary: 0 });
      this.burst(b.x, b.y, 80, ['#ffd75a', '#ffffff', '#ff4a7a'], 300, true);
      this.ui.victory();
    }
  }

  private killBoss(): void {
    const b = this.boss;
    if (!b || b.dead) return;
    b.dead = true;
    b.hp = 0;
    this.p.bossDefeated = true;
    this.shots = [];
    for (const e of this.enemies) e.dead = true;
    audio.play('roar', { pitch: 0.7, vary: 0 });
    this.addXp('combat', 2000);
    this.addXp('delving', 1500);
    this.onSave?.();
  }

  // ------------------------------------------------------------------ drops/shots/bombs/particles
  private updateDrops(dt: number): void {
    const pl = this.player;
    const cap = this.st.packCap;
    let full = false;
    for (const d of this.drops) {
      d.age += dt;
      const dx = pl.cx - (d.x + 6);
      const dy = pl.cy - (d.y + 6);
      const dist = Math.hypot(dx, dy);
      const isRelic = d.item.startsWith('r_');
      const free = d.item === 'coin' || isRelic || CONSUMABLES.includes(d.item as ConsumableId);
      const room = free || packCount(this.p) + d.count <= cap;
      if (!room && dist < 70) full = true;
      if (!pl.dead && d.age > 0.35 && room && dist < 80) {
        d.vx += (dx / dist) * 1400 * dt;
        d.vy += (dy / dist) * 1400 * dt;
        d.vx *= 0.9;
        d.vy *= 0.9;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (dist < 16) {
          this.collect(d);
          d.count = 0;
        }
      } else {
        applyGravity(d, dt);
        const r = moveBody(this.world, d, dt);
        if (d.onGround) d.vx *= 0.85;
        if (r.hitX) d.vx *= -0.5;
      }
      if (d.age > 300) d.count = 0;
    }
    this.drops = this.drops.filter((d) => d.count > 0);
    if (full && this.hintCooldown <= 0) {
      this.text(pl.cx, pl.y - 14, 'Pack full!', '#ff9a6a');
      this.hintCooldown = 2;
      this.hint('packFull', 'Your pack is full! Head back to camp to unload, or press R to use a Recall Charm.');
    }
  }

  private collect(d: Drop): void {
    if (d.item === 'coin') {
      this.p.coins += d.count;
      this.p.stats.earned += d.count;
      audio.play('coins', { vol: 0.5, pitch: 1.3 });
      this.text(d.x, d.y, `+${d.count}c`, '#ffd75a');
      return;
    }
    if (CONSUMABLES.includes(d.item as ConsumableId)) {
      const c = d.item as ConsumableId;
      this.p.cons[c] = Math.min(STACK_MAX[c], this.p.cons[c] + d.count);
    } else add(this.p.pack, d.item, d.count);
    const def = ITEMS[d.item];
    audio.play('pickup', { vol: 0.6 });
    this.text(d.x, d.y, `+${d.count} ${def ? def.name : d.item}`, def?.kind === 'relic' ? '#ffd75a' : '#e8e0d0');
    if (def?.kind === 'relic') {
      this.toast(`Relic found: ${def.name}! Bring it to Wren at the Archive.`, '#ffd75a');
      this.addXp('delving', 120);
    }
  }

  private updateShots(dt: number): void {
    const pl = this.player;
    for (const s of this.shots) {
      s.life -= dt;
      s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (Math.random() < dt * 30) {
        this.parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: s.color, size: 2, grav: 0, glow: true });
      }
      if (this.world.solidAtPx(s.x, s.y)) {
        s.life = 0;
        this.burst(s.x, s.y, 6, [s.color], 80, true);
        continue;
      }
      if (s.hostile && !pl.dead && s.x > pl.x - s.r && s.x < pl.x + pl.w + s.r && s.y > pl.y - s.r && s.y < pl.y + pl.h + s.r) {
        s.life = 0;
        this.hurtPlayer(s.dmg, s.x);
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
      if (b.fuse <= 0) this.explode(b.x + 6, b.y + 6);
    }
    this.bombs = this.bombs.filter((b) => b.fuse > 0);
  }

  private explode(x: number, y: number): void {
    audio.play('explosion', { vary: 0.1 });
    this.shake = 10;
    this.burst(x, y, 40, ['#ffd75a', '#ff8a2a', '#ffffff', '#5a4a3a'], 280, true);
    this.burst(x, y, 24, ['#5a4a3a', '#3a3030'], 200);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const maxTier = this.st.pickTier + 1;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 5) continue;
        const bx = tx + dx;
        const by = ty + dy;
        const def = BLOCKS[this.world.get(bx, by)];
        if (!def.solid || def.unbreakable || def.tier > maxTier) continue;
        if (this.inCampZone(bx, by) && by <= SURFACE_Y) continue;
        this.breakBlock(bx, by, true);
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.cx - x, e.cy - y);
      if (d < 3 * TILE) this.damageEnemy(e, Math.atan2(e.cy - y, e.cx - x), 40 + this.st.attack * 2);
    }
    if (this.boss && !this.boss.dead && Math.hypot(this.boss.x - x, this.boss.y - y) < 3 * TILE + this.boss.r) {
      this.boss.hp -= 60 + this.st.attack * 2;
      this.boss.flash = 0.2;
      if (this.boss.hp <= 0) this.killBoss();
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
    // regenerate tile damage
    for (const [i, d] of this.world.damage) {
      d.t += dt;
      if (d.t > 4) this.world.damage.delete(i);
    }
  }

  // ------------------------------------------------------------------ environment
  private updateEnvironment(dt: number, menu: boolean): void {
    const pl = this.player;
    const pt = this.playerTile();
    const surf = this.world.surface[Math.max(0, Math.min(WORLD_W - 1, pt.x))];
    const wasCamp = this.inCamp;
    this.inCamp = pt.x >= CAMP_X0 && pt.x <= CAMP_X1 && pt.y <= SURFACE_Y;
    const underground = pt.y > surf + 1;
    this.biome = biomeAt(pt.y).id;

    if (this.inCamp && !wasCamp) this.arriveCamp();
    if (this.inCamp && !pl.dead) {
      pl.oil = Math.min(this.st.oilMax, pl.oil + dt * 60);
      pl.hp = Math.min(this.st.maxHp, pl.hp + dt * 12);
    }

    // interactables
    this.near = null;
    if (!pl.dead) {
      let best = 48;
      if (this.inCamp || pt.y <= SURFACE_Y) {
        for (const s of CAMP_SPOTS) {
          const d = Math.abs(s.x - pl.cx);
          if (d < best && Math.abs(s.y - (pl.y + pl.h)) < 40) {
            best = d;
            this.near = s;
          }
        }
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = pt.x + dx;
          const ty = pt.y + dy;
          const o = this.world.getObj(tx, ty);
          if (o === Obj.LIFT) {
            const s = LIFT_ROWS.indexOf(ty);
            if (s > 0) this.near = { id: 'lift' + s, x: tx * TILE + 16, y: ty * TILE + 16, label: this.p.lifts[s] ? 'Ride the Lift' : 'Repair the old lift' };
          } else if (o === Obj.CHEST) {
            this.near = { id: 'chest', x: tx * TILE + 16, y: ty * TILE + 16, label: 'Open chest' };
          }
        }
      }
    }

    if (menu || pl.dead) return;

    // depth
    const depth = this.depthOf(pt.y);
    if (depth > this.p.maxDepth) {
      const gained = depth - this.p.maxDepth;
      this.p.maxDepth = depth;
      this.addXp('delving', gained * (1 + this.biome));
      if (depth % 25 === 0) this.text(pl.cx, pl.y - 20, `New depth: ${depth}m`, '#9ad8ff');
      for (const b of this.p.bounties) if (b.kind === 'depth') b.have = Math.max(b.have, depth);
    }
    if (underground) this.hint('underground', 'Your lantern burns oil while you are underground. It refills at camp, or press F to use a flask of Lamp Oil.');

    // oil
    if (underground && pl.oil > 0) {
      pl.oil = Math.max(0, pl.oil - dt * this.st.oilDrain);
      if (pl.oil < this.st.oilMax * 0.2 && !this.lowOilWarned) {
        this.lowOilWarned = true;
        this.toast('Your lantern is running low on oil!', '#ffc85a');
        audio.play('sizzle', { pitch: 0.6, vary: 0 });
      }
    }
    if (pl.oil > this.st.oilMax * 0.25) this.lowOilWarned = false;
    const lightHere = this.light.at(pt.x, pt.y);
    if (underground && pl.oil <= 0 && lightHere < 0.42) {
      pl.darkT += dt;
      if (pl.darkT > 3) {
        if (Math.floor(pl.darkT * 2) !== Math.floor((pl.darkT - dt) * 2)) {
          pl.hp -= 3;
          this.text(pl.cx, pl.y, 'The dark bites', '#a07aff');
          pl.hurtT = 0.15;
          if (pl.hp <= 0) this.die();
        }
      }
      this.hint('dark', 'Out of oil! The dark itself will hurt you. Stand near torches, drink Lamp Oil (F) or recall (R).');
    } else pl.darkT = 0;

    // heat
    if (this.biome === 3 && !this.p.up.ember) {
      pl.heatT += dt;
      if (pl.heatT > 1.5) {
        pl.heatT = 0;
        const dmg = Math.max(1, Math.round(3 * this.st.heatResist));
        pl.hp -= dmg;
        pl.hurtT = 0.12;
        this.text(pl.cx, pl.y, `-${dmg} heat`, '#ff8a4a');
        if (pl.hp <= 0) this.die();
      }
      this.hint('heat', 'The Ember Depths are scorching! Brannoc can forge an Emberward Talisman to protect you.');
    }
    if (this.biome === 4 && !this.p.up.lens) this.hint('vault', 'The Vault swallows your lantern light. Brannoc knows how to grind a Sunglass Lens.');

    // lava
    if (inLiquid(this.world, pl)) {
      pl.lavaT -= dt;
      if (pl.lavaT <= 0) {
        pl.lavaT = 0.4;
        audio.play('sizzle');
        const dmg = Math.round(14 * this.st.heatResist);
        pl.hp -= dmg;
        pl.hurtT = 0.15;
        this.text(pl.cx, pl.y, `-${dmg}`, '#ff6a2a');
        this.burst(pl.cx, pl.y + pl.h, 8, ['#ff8a2a', '#ffd75a'], 120, true);
        if (pl.hp <= 0) this.die();
      }
    }

    // boss arena
    if (!this.p.bossDefeated && !this.boss && pt.y > BOSS_CENTER.y - 10 && Math.abs(pt.x - BOSS_CENTER.x) < 24) {
      this.boss = new Boss();
      this.enemies = [];
      audio.play('roar', { vary: 0 });
      this.toast('THE GLOAMHEART AWAKENS', '#ff4a7a');
    }
    if (this.boss && !this.boss.dead && pt.y < BOSS_CENTER.y - 14) {
      // fled the arena: the heart heals
      this.boss = null;
      this.toast('The Gloamheart slumbers again...', '#a05aff');
    }
  }

  private arriveCamp(): void {
    const n = packCount(this.p);
    if (n > 0) {
      for (const [id, c] of Object.entries(this.p.pack)) add(this.p.stash, id, c);
      this.p.pack = {};
      this.toast(`Unloaded ${n} find${n === 1 ? '' : 's'} into your camp stash.`, '#9af0a0');
      audio.play('coins', { vol: 0.4, pitch: 0.8 });
      this.hint('sell', 'Sell finds to Pell (left), upgrade gear at Brannoc\'s Forge, and bring relics to Wren. Press E near them.');
    }
    this.onSave?.();
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
    let rad = pl.oil > 0 ? this.st.light : 1.8;
    if (this.biome === 4 && !this.p.up.lens) rad *= 0.55;
    if (this.gloom > 0) rad *= 0.4;
    if (pl.oil > 0 && pl.oil < this.st.oilMax * 0.1) rad *= 0.6 + 0.4 * (pl.oil / (this.st.oilMax * 0.1));
    const flick = 1 + Math.sin(this.time * 13) * 0.015 + Math.sin(this.time * 7.7) * 0.015;
    // an empty lantern leaves only a faint ember, too weak to keep the dark away
    const k = pl.oil > 0 ? 1 : 0.3;
    lights.push({ x: pl.cx / TILE, y: (pl.y + 10) / TILE, r: 1.05 * k, g: 0.86 * k, b: 0.62 * k, radius: rad * flick, cast: true });
    for (const e of this.enemies) {
      const gl = e.def.glow;
      if (gl) lights.push({ x: e.cx / TILE, y: e.cy / TILE, r: gl[0], g: gl[1], b: gl[2], radius: 3, cast: false });
    }
    for (const s of this.shots) lights.push({ x: s.x / TILE, y: s.y / TILE, r: 0.5, g: 0.3, b: 0.3, radius: 2.2, cast: false });
    for (const d of this.drops) {
      const g = ITEMS[d.item]?.glow;
      if (g) lights.push({ x: d.x / TILE, y: d.y / TILE, r: 0.3, g: 0.3, b: 0.3, radius: 1.6, cast: false });
    }
    if (this.boss) lights.push({ x: this.boss.x / TILE, y: this.boss.y / TILE, r: 0.9, g: 0.15, b: 0.3, radius: 9, cast: false });
    for (const b of this.bombs) lights.push({ x: b.x / TILE, y: b.y / TILE, r: 0.6, g: 0.45, b: 0.1, radius: 2, cast: false });
    const sat = this.p.satchel;
    if (sat) lights.push({ x: sat.x / TILE, y: sat.y / TILE, r: 0.3, g: 0.6, b: 0.3, radius: 3, cast: false });
    this.light.compute(this.world, tx0, ty0, tw, th, lights, this.time, 0.9);
    this.light.finish(this.world);
  }

  private updateMusic(): void {
    let m: MusicId;
    const pt = this.playerTile();
    if (this.player.dead) return;
    if (this.boss && !this.boss.dead) m = 'boss';
    else if (pt.y <= SURFACE_Y + 3) m = 'camp';
    else if (this.biome >= 3) m = 'deep';
    else m = this.biome === 2 ? 'cave2' : 'cave';
    audio.music(m);
    audio.ambience(pt.y > SURFACE_Y + 4 ? 1 : 0);
  }

  // ------------------------------------------------------------------ economy actions (called from UI)
  sell(id: string, n: number): void {
    const have = this.p.stash[id] ?? 0;
    n = Math.min(n, have);
    if (n <= 0) return;
    const v = itemValue(id, this.st) * n;
    take(this.p.stash, id, n);
    this.p.coins += v;
    this.p.stats.earned += v;
    audio.play('coins');
  }

  sellAll(kinds: string[]): number {
    let total = 0;
    for (const [id, n] of Object.entries(this.p.stash)) {
      const def = ITEMS[id];
      if (!def || !kinds.includes(def.kind)) continue;
      if (this.reservedFor(id) > 0) continue;
      total += itemValue(id, this.st) * n;
      delete this.p.stash[id];
    }
    if (total > 0) {
      this.p.coins += total;
      this.p.stats.earned += total;
      audio.play('coins');
    }
    return total;
  }

  /** items a delivery bounty is waiting for are kept back from "sell all" */
  reservedFor(id: string): number {
    let r = 0;
    for (const b of this.p.bounties) if (b.kind === 'deliver' && b.target === id) r += b.need;
    return r;
  }

  buy(id: ConsumableId, n: number): boolean {
    const price = SHOP_PRICES[id] * n;
    if (this.p.coins < price) return false;
    const room = STACK_MAX[id] - this.p.cons[id];
    if (room < n) return false;
    this.p.coins -= price;
    this.p.cons[id] += n;
    audio.play('coins', { pitch: 0.9 });
    return true;
  }

  upgrade(track: 'pick' | 'lantern' | 'pack' | 'boots' | 'armor'): boolean {
    const tables = { pick: PICKS, lantern: LANTERNS, pack: PACKS, boots: BOOTS, armor: ARMORS };
    const table = tables[track];
    const next = table[this.p.up[track] + 1];
    if (!next || !canAfford(this.p, next.cost)) return false;
    pay(this.p, next.cost);
    this.p.up[track]++;
    this.refresh();
    if (track === 'armor') this.player.hp = this.st.maxHp;
    if (track === 'lantern') this.player.oil = this.st.oilMax;
    audio.play('upgrade', { vary: 0 });
    this.onSave?.();
    return true;
  }

  sharpen(): boolean {
    const c = sharpenCost(this.p.up.sharpen);
    if (this.p.up.sharpen >= SHARPEN_MAX || this.p.coins < c) return false;
    this.p.coins -= c;
    this.p.up.sharpen++;
    this.refresh();
    audio.play('upgrade', { pitch: 1.2, vary: 0 });
    return true;
  }

  buyCharm(k: 'ember' | 'lens'): boolean {
    if (this.p.up[k]) return false;
    const cost = CHARMS[k].cost;
    if (!canAfford(this.p, cost)) return false;
    pay(this.p, cost);
    this.p.up[k] = true;
    this.refresh();
    audio.play('upgrade', { vary: 0 });
    this.onSave?.();
    return true;
  }

  catalogue(id: string): void {
    if ((this.p.stash[id] ?? 0) <= 0 || this.p.catalogued.includes(id)) return;
    take(this.p.stash, id, 1);
    this.p.catalogued.push(id);
    this.refresh();
    audio.play('relic', { vary: 0 });
    this.addXp('delving', 200);
    this.onSave?.();
  }

  bountyReady(b: Bounty): boolean {
    if (b.kind === 'deliver') return owned(this.p, b.target) >= b.need;
    if (b.kind === 'depth') return this.p.maxDepth >= b.need;
    return b.have >= b.need;
  }

  turnIn(i: number): void {
    const b = this.p.bounties[i];
    if (!b || !this.bountyReady(b)) return;
    if (b.kind === 'deliver') pay(this.p, { coins: 0, items: { [b.target]: b.need } });
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
    return biomeAt(this.p.maxDepth + SURFACE_Y).id;
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
      if (kind === 'depth' && this.p.maxDepth > 420) continue;
      const bi = r.int(Math.max(0, mb - 1), mb);
      const bm = BIOMES[bi];
      if (kind === 'deliver') {
        const pool = [...bm.ores.map((o) => BLOCKS[o.block].drop ?? ''), ...bm.enemies.map((e) => ENEMIES[e].drop)].filter((d) => d && d !== '@relic');
        const target = r.pick(pool);
        if (used.has('deliver' + target)) continue;
        const def = ITEMS[target];
        const need =
          def.kind === 'drop'
            ? r.int(3, def.value > 20 ? 5 : 8)
            : Math.max(3, Math.min(20, Math.round((r.int(50, 80) * (bi + 1)) / def.value)));
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
        const need = Math.min(425, this.p.maxDepth + r.int(15, 35));
        return { kind, target: '', need, have: this.p.maxDepth, reward: 60 + need * 3, xp: 60 + need, text: `Reach ${need}m deep` };
      }
    }
    return { kind: 'chests', target: '', need: 1, have: 0, reward: 80, xp: 40, text: 'Open a treasure chest' };
  }

  relicsInStash(): string[] {
    return RELICS.filter((r) => (this.p.stash[r.id] ?? 0) > 0 && !this.p.catalogued.includes(r.id)).map((r) => r.id);
  }

  /** persist positional state into progress before saving */
  syncProgress(): void {
    const pl = this.player;
    if (pl.dead) {
      const s = campSpawn();
      this.p.px = s.x * TILE + TILE / 2;
      this.p.py = s.y * TILE + TILE;
    } else {
      this.p.px = pl.cx;
      this.p.py = pl.y + pl.h;
    }
    this.p.hp = Math.max(1, pl.hp);
    this.p.oil = pl.oil;
  }

  bossHpFrac(): number {
    return this.boss ? Math.max(0, this.boss.hp / BOSS_HP) : 0;
  }
}
