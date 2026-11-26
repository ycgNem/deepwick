import { Game, UIHooks, CHEST_SLOTS, sharpenCost, SHARPEN_MAX, daylight, isNight } from './game';
import { iconUrl, makeCanvas } from './assets';
import { ITEMS, RELICS, UI_ICON, IconRef, ItemDef, equipSlotOf, sellable } from './data/items';
import { BIOMES, biomeAt } from './data/biomes';
import { BLOCKS, B } from './data/blocks';
import { ENEMIES } from './data/enemies';
import { Recipe, STATION_NAME, RECIPES } from './data/recipes';
import { SkillId, xpToNext, count, itemValue, MAX_LEVEL, Slot, Stack, EquipKey, give } from './state';
import { TILE, WORLD_W, WORLD_H, HOTBAR, INV_SIZE, DAY_LENGTH } from './constants';
import { Obj } from './world/world';
import { WICK_X, WICK_Y } from './data/wick';
import { audio } from './audio';
import { FLAME, KINDLING, LUMEN, MAX_FLAME, lumenToNext } from './data/wick';
import { MODES, MODE_IDS, ModeId, NERVE_FRAYED, NERVE_SHAKEN } from './data/nerve';
import { CHAPTERS, GOALS, ROMAN, goalDone } from './data/journal';
import { prefs, HUD_SIZES } from './prefs';
import { LOST } from './data/lost';
import { MINERS } from './data/lampless';
import { BREWS } from './data/brews';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector(sel);
  if (!el) throw new Error('missing ' + sel);
  return el as T;
};

function img(ref: IconRef, cls = 'ic'): string {
  return `<img class="${cls}" src="${iconUrl(ref)}" alt="">`;
}

function fmt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const SKILL_INFO: Record<SkillId, { name: string; color: string; perk: (l: number) => string }> = {
  mining: { name: 'Mining', color: '#e0a050', perk: (l) => `+${(l - 1) * 2}% mining speed, +${((l - 1) * 0.6).toFixed(1)}% double ore` },
  combat: { name: 'Combat', color: '#e05a5a', perk: (l) => `+${(l - 1) * 3}% damage, +${(l - 1) * 2} max health` },
  delving: { name: 'Delving', color: '#5ab0e0', perk: (l) => `+${l - 1}% sell prices, +${l - 1}% oil efficiency` },
  fishing: { name: 'Fishing', color: '#5ad0b0', perk: (l) => `${Math.min(45, (l - 1) * 1.5).toFixed(0)}% quicker bites, wider catch zone, rarer fish` },
};

const EQUIP_SLOTS: { key: EquipKey; label: string; slot: string }[] = [
  { key: 'armor', label: 'Armor', slot: 'armor' },
  { key: 'lantern', label: 'Lantern', slot: 'lantern' },
  { key: 'boots', label: 'Boots', slot: 'boots' },
  { key: 'charm1', label: 'Charm', slot: 'charm' },
  { key: 'charm2', label: 'Charm', slot: 'charm' },
];

/** Journal pages for bringing the lost home */
const LOST_GOALS = { brannoc: 1, wren: 1, hesper: 1 };

type Panel = 'inv' | 'chest' | 'shop' | 'smith' | 'archive' | 'still' | 'wick' | 'map' | 'pause' | 'victory' | 'journal' | null;

export class UI implements UIHooks {
  game!: Game;
  panel: Panel = null;
  private tab = 'sell';
  private archiveTab = 'relics';
  private showAll = false;
  private hudEls: Record<string, HTMLElement> = {};
  private toasts: HTMLElement;
  private panelEl: HTMLElement;
  private cursorEl: HTMLImageElement;
  private cursorN: HTMLElement;
  private tipEl: HTMLElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  mapCanvas: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private mapImg: ImageData;
  private hudT = 0;
  private cursor: Stack | null = null;
  private lastHotbar = '';
  private lastGoal = '';
  private lastSeek = '';
  private lastGoalIdx = -1;
  private lastHelp = '';
  private lastCanary = '';
  onQuit: (() => void) | null = null;
  onSettings: ((music: number, sfx: number) => void) | null = null;
  onPrefs: (() => void) | null = null;

  constructor() {
    this.toasts = $('#toasts');
    this.panelEl = $('#panel');
    this.cursorEl = $<HTMLImageElement>('#cursorItem img');
    this.cursorN = $('#cursorItem span');
    this.tipEl = $('#tip');
    this.mini = $<HTMLCanvasElement>('#minimap');
    const mc = this.mini.getContext('2d');
    if (!mc) throw new Error('ctx');
    this.miniCtx = mc;
    [this.mapCanvas, this.mapCtx] = makeCanvas(WORLD_W, WORLD_H);
    this.mapImg = this.mapCtx.createImageData(WORLD_W, WORLD_H);
    for (const k of ['hpFill', 'hpText', 'foodFill', 'foodText', 'oilFill', 'oilText', 'oilBar', 'nerveFill', 'nerveText', 'nerveBar', 'goal', 'hudHelp', 'coins', 'clock', 'wickChip', 'depth', 'biome', 'hotbar', 'heldName', 'skills', 'bossBar', 'bossFill', 'bossName', 'tideChip', 'seek', 'buffChip', 'canaryChip']) {
      this.hudEls[k] = $('#' + k);
    }
    this.panelEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.bindTouchSlots();
    // the Journal goal and the minimap open their pages when tapped or clicked
    this.hudEls.goal.addEventListener('click', () => {
      if (this.game && !this.panel) this.open('journal');
    });
    this.mini.addEventListener('click', () => {
      if (this.game && !this.panel) this.open('map');
    });
    this.panelEl.addEventListener('contextmenu', (e) => e.preventDefault());
    this.panelEl.addEventListener('mouseover', (e) => this.onHover(e));
    this.panelEl.addEventListener('mouseleave', () => this.tipEl.classList.remove('show'));
    window.addEventListener('mousemove', (e) => {
      const c = this.cursorEl.parentElement as HTMLElement;
      c.style.left = `${e.clientX + 6}px`;
      c.style.top = `${e.clientY + 6}px`;
      this.tipEl.style.left = `${e.clientX + 18}px`;
      this.tipEl.style.top = `${e.clientY + 14}px`;
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  attach(game: Game): void {
    this.game = game;
    for (const el of document.querySelectorAll<HTMLImageElement>('img[data-icon]')) {
      const key = el.dataset.icon as keyof typeof UI_ICON;
      if (UI_ICON[key]) el.src = iconUrl(UI_ICON[key]);
    }
    this.rebuildMap();
    this.lastHotbar = '';
    this.hudEls.hotbar.onclick = (e): void => {
      const s = (e.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
      if (s) this.game.p.sel = Number(s.dataset.slot);
    };
  }

  // ------------------------------------------------------------------ hooks
  toast(msg: string, color = '#ffffff'): void {
    // the same news twice in a row just counts up
    const last = this.toasts.lastElementChild as (HTMLElement & { _t?: number[]; _n?: number }) | null;
    if (last && last.dataset.msg === msg && !last.classList.contains('out')) {
      last._n = (last._n ?? 1) + 1;
      last.textContent = `${msg}  \u00d7${last._n}`;
      for (const t of last._t ?? []) clearTimeout(t);
      last._t = [window.setTimeout(() => last.classList.add('out'), 4200), window.setTimeout(() => last.remove(), 5000)];
      return;
    }
    const el = document.createElement('div') as HTMLElement & { _t?: number[] };
    el.className = 'toast';
    el.style.color = color;
    el.textContent = msg;
    el.dataset.msg = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    el._t = [window.setTimeout(() => el.classList.add('out'), 4200), window.setTimeout(() => el.remove(), 5000)];
  }

  private hintQ: string[] = [];
  private hintOn = false;
  private hintSeq = 0;
  private hintTimer = 0;

  /** tutorial tips wait their turn in a card of their own, so they never bury the news */
  hintCard(msg: string): void {
    if (this.hintQ.includes(msg)) return;
    this.hintQ.push(msg);
    if (!this.hintOn) this.nextHint();
  }

  private nextHint(): void {
    const el = document.getElementById('hintCard');
    const msg = this.hintQ.shift();
    if (!el || !msg) {
      this.hintOn = false;
      return;
    }
    this.hintOn = true;
    const p = el.querySelector('p');
    if (p) p.textContent = msg;
    const ms = Math.min(13000, Math.max(6500, msg.length * 60));
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    const bar = el.querySelector('u');
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      void bar.offsetWidth;
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = '0%';
    }
    const id = ++this.hintSeq;
    const done = (): void => {
      if (id !== this.hintSeq) return;
      this.hintSeq++;
      el.classList.remove('show');
      window.setTimeout(() => this.nextHint(), 450);
    };
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(done, ms);
    el.onclick = (): void => {
      window.clearTimeout(this.hintTimer);
      done();
    };
  }

  private goalQ: { text: string; coins: number }[] = [];
  private goalFlashUntil = 0;
  private goalFlash: { text: string; coins: number } | null = null;

  /** a Journal page ticked off: the tracker shows it done for a moment before turning the page */
  goalDone(text: string, coins: number): void {
    this.goalQ.push({ text, coins });
  }

  /** skills that just levelled, and when */
  private skillUp: Partial<Record<SkillId, number>> = {};

  isOpen(): boolean {
    return this.panel !== null;
  }

  private bannerAt = -1e9;

  /** a big title card across the middle of the screen (a second one waits its turn) */
  banner(title: string, sub: string): void {
    const now = performance.now();
    const free = this.bannerAt + 2600;
    if (now < free) {
      this.bannerAt = free;
      setTimeout(() => this.showBanner(title, sub), free - now);
      return;
    }
    this.bannerAt = now;
    this.showBanner(title, sub);
  }

  private showBanner(title: string, sub: string): void {
    const el = document.getElementById('banner');
    if (!el) return;
    const b = el.querySelector('b');
    const s = el.querySelector('span');
    if (b) b.textContent = title;
    if (s) s.textContent = sub;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  levelUp(skill: SkillId, lvl: number): void {
    // the skill's row lights up (its perk is in the row's tooltip); the big text is over your head
    void lvl;
    this.skillUp[skill] = performance.now();
  }

  victory(): void {
    this.open('victory');
  }

  open(panel: string): void {
    this.panel = panel as Panel;
    if (panel === 'shop') this.tab = 'sell';
    this.game.input.blocked = true;
    this.game.input.mouseLeft = false;
    this.panelEl.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.returnCursor();
    this.panel = null;
    this.game.input.blocked = false;
    this.game.openChest = -1;
    this.panelEl.classList.add('hidden');
    this.panelEl.innerHTML = '';
    this.tipEl.classList.remove('show');
  }

  /** the stack held on the mouse, if any (saved with the pack) */
  cursorStack(): Stack | null {
    return this.cursor;
  }

  private returnCursor(): void {
    if (!this.cursor) return;
    const left = give(this.game.p.inv, this.cursor.id, this.cursor.n);
    if (left > 0) this.game.dropStack({ id: this.cursor.id, n: left });
    this.cursor = null;
    this.updateCursor();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.game || document.getElementById('title')?.classList.contains('show')) return;
    if (e.code === 'Escape') {
      if (this.panel && this.panel !== 'victory') this.close();
      else if (!this.panel) this.open('pause');
      e.preventDefault();
    } else if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'KeyC') {
      e.preventDefault();
      if (this.panel === 'inv' || this.panel === 'chest') this.close();
      else if (!this.panel) this.open('inv');
    } else if (e.code === 'KeyM') {
      if (this.panel === 'map') this.close();
      else if (!this.panel) this.open('map');
    } else if (e.code === 'KeyJ') {
      if (this.panel === 'journal') this.close();
      else if (!this.panel) this.open('journal');
    } else if (e.code === 'KeyE' && this.panel && this.panel !== 'pause' && this.panel !== 'victory') {
      this.close();
      // otherwise the same press reopens whatever you are standing next to
      this.game.input.consume('KeyE');
    } else if (this.panel === 'inv' || this.panel === 'chest') {
      // number keys still pick the hotbar slot while the inventory is open
      const m = /^Digit(\d)$/.exec(e.code);
      if (m) {
        this.game.p.sel = (Number(m[1]) + 9) % 10;
        this.render();
      }
    }
  }

  // ------------------------------------------------------------------ captions
  private caps = new Map<string, { el: HTMLElement; t: number }>();

  /** write a sound out above the hotbar: refreshed if it is already showing, oldest dropped past four */
  caption(key: string, text: string, warn: boolean, dir: string): void {
    const box = document.getElementById('captions');
    if (!box) return;
    let c = this.caps.get(key);
    if (c) this.caps.delete(key);
    else {
      const el = document.createElement('div');
      c = { el, t: 0 };
    }
    const arrow = (d: string): string => `<i class="ar ${d}"></i>`;
    const html = `${dir === 'l' ? arrow('l') : ''}<span>${text}</span>${dir && dir !== 'l' ? arrow(dir) : ''}`;
    if (c.el.innerHTML !== html) c.el.innerHTML = html;
    c.el.className = `cap${warn ? ' warn' : ''}`;
    box.appendChild(c.el);
    c.t = 2.6;
    this.caps.set(key, c);
    while (this.caps.size > 4) {
      const first = this.caps.keys().next().value;
      if (first === undefined) break;
      this.caps.get(first)?.el.remove();
      this.caps.delete(first);
    }
  }

  clearCaptions(): void {
    for (const c of this.caps.values()) c.el.remove();
    this.caps.clear();
  }

  private tickCaptions(dt: number): void {
    for (const [k, c] of this.caps) {
      c.t -= dt;
      if (c.t < 0.5) c.el.classList.add('fade');
      if (c.t <= 0) {
        c.el.remove();
        this.caps.delete(k);
      }
    }
  }

  // ------------------------------------------------------------------ HUD
  update(dt: number): void {
    if (this.caps.size) this.tickCaptions(dt);
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const g = this.game;
    const pl = g.player;
    const st = g.st;
    const h = this.hudEls;
    h.hpFill.style.width = `${(Math.max(0, pl.hp) / st.maxHp) * 100}%`;
    h.hpText.textContent = `${Math.ceil(Math.max(0, pl.hp))} / ${st.maxHp}`;
    const food = g.p.food;
    h.foodFill.style.width = `${food}%`;
    h.foodFill.classList.toggle('low', food < 20);
    h.foodText.textContent = food <= 0 ? 'STARVING' : `${Math.ceil(food)}`;
    h.oilBar.style.display = st.oilMax > 0 ? '' : 'none';
    if (st.oilMax > 0) {
      const of = pl.oil / st.oilMax;
      h.oilFill.style.width = `${of * 100}%`;
      h.oilFill.classList.toggle('low', of < 0.2);
      h.oilText.textContent = pl.oil > 0 ? `${Math.ceil(pl.oil)}s` : 'EMPTY';
    }
    const nv = g.p.nerve;
    h.nerveFill.style.width = `${nv}%`;
    h.nerveFill.classList.toggle('low', nv < NERVE_SHAKEN);
    h.nerveBar.classList.toggle('frayed', nv < NERVE_FRAYED);
    h.nerveText.textContent = nv <= 0 ? 'BROKEN' : nv < NERVE_SHAKEN ? 'SHAKEN' : nv < NERVE_FRAYED ? 'FRAYED' : `${Math.ceil(nv)}`;
    this.updateGoal();
    this.updateSeek();
    // tips step aside while a window is open
    document.getElementById('hintCard')?.classList.toggle('muted', this.panel !== null);
    h.coins.textContent = fmt(g.p.coins);
    const c = g.p.clock;
    const hours = Math.floor(((c * 24 + 6) % 24) * 1);
    const mins = Math.floor((((c * 24 + 6) % 1) * 60) / 10) * 10;
    const wl = g.weather.label;
    h.clock.innerHTML = `<i class="${wl ? `wx ${wl.toLowerCase()}` : isNight(c) ? 'moon' : 'sun'}"></i>Day ${g.p.stats.days} · ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}${wl ? ` <small class="wxl">${wl}</small>` : ''}`;
    const tideNote = g.p.tide ? 'Gloam Tide' : g.tideTonight() && !isNight(c) ? 'Tide tonight' : '';
    h.tideChip.textContent = tideNote;
    h.tideChip.style.display = tideNote ? '' : 'none';
    const mmss = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const bf: string[] = [];
    if (g.buffs.nightglass > 0) bf.push(`<i class="bn"></i>Nightglass ${mmss(g.buffs.nightglass)}`);
    if (g.buffs.ward > 0) bf.push(`<i class="bw"></i>Gloamward ${mmss(g.buffs.ward)}`);
    if (g.wet > 0.15) bf.push(`<i class="bwet${g.chill > 0.3 ? ' cold' : ''}"></i>${g.wet > 0.6 ? 'Soaked' : 'Damp'}${g.chill > 0.3 ? ' · cold' : ''}`);
    const bfHtml = bf.join('<b class="sep"></b>');
    if (h.buffChip.innerHTML !== bfHtml) h.buffChip.innerHTML = bfHtml;
    h.buffChip.style.display = bfHtml ? '' : 'none';
    // the canary: shown underground, or anywhere it is upset
    const cm = g.canary.mood;
    const below = pl.cy / TILE > g.world.surface[Math.max(0, Math.min(WORLD_W - 1, Math.floor(pl.cx / TILE)))] + 2;
    const showCanary = cm !== 'none' && (cm !== 'calm' || below);
    h.canaryChip.style.display = showCanary ? '' : 'none';
    if (showCanary && cm !== this.lastCanary) {
      this.lastCanary = cm;
      h.canaryChip.className = `chip canary ${cm}`;
      const label = h.canaryChip.querySelector('span');
      if (label) label.textContent = cm === 'calm' ? 'Canary singing' : cm === 'uneasy' ? 'Canary uneasy' : cm === 'frantic' ? 'Canary frantic!' : 'Canary fainted';
      const im = h.canaryChip.querySelector('img');
      if (im && !im.getAttribute('src')) im.src = iconUrl(ITEMS.canary.icon);
    }
    h.clock.classList.toggle('night', daylight(c) < 0.5);
    const fl = g.flame;
    const nextNeed = fl > 0 && fl < MAX_FLAME ? FLAME[fl + 1].need : 0;
    const prog = fl === 0 ? 'cold' : nextNeed ? `${fmt(g.p.wick.lumen)}/${fmt(nextNeed)}` : 'radiant';
    h.wickChip.innerHTML = `<i class="fl l${fl}"></i>Wick ${fl > 0 ? `<b>${g.flameName()}</b>` : ''}<small>${g.dawnLit ? 'the heart is stilled' : prog}</small>`;
    h.wickChip.classList.toggle('cold', fl === 0);
    const pt = g.playerTile();
    const surf = g.world.surface[Math.max(0, Math.min(WORLD_W - 1, pt.x))];
    const depth = Math.max(0, pt.y - surf);
    h.depth.textContent = pt.y <= surf + 2 ? 'Surface' : `${depth}m`;
    h.biome.textContent = pt.y <= surf + 2 ? (g.p.wick.kindled ? 'Deepwick' : 'The Wild Meadow') : biomeAt(pt.y).name;
    this.updateHotbar();
    let sk = '';
    for (const id of ['mining', 'combat', 'delving', 'fishing'] as SkillId[]) {
      const s = g.p.skills[id];
      const frac = s.lvl >= MAX_LEVEL ? 1 : s.xp / xpToNext(s.lvl);
      const up = performance.now() - (this.skillUp[id] ?? -1e9) < 3200;
      sk += `<div class="sk${up ? ' up' : ''}" title="${SKILL_INFO[id].perk(s.lvl)}"><b style="color:${SKILL_INFO[id].color}">${SKILL_INFO[id].name} ${s.lvl}${up ? ' <em>\u25b2</em>' : ''}</b><i><u style="width:${frac * 100}%;background:${SKILL_INFO[id].color}"></u></i></div>`;
    }
    h.skills.innerHTML = sk;
    // its bar comes in once the title card has cleared, so the two never sit on top of each other
    const bossOn = !!g.boss && !g.boss.dead && g.boss.intro <= 0 && g.boss.t > 1.4;
    const tide = g.p.tide;
    h.bossBar.classList.toggle('show', bossOn || !!tide);
    h.bossBar.classList.toggle('tide', !bossOn && !!tide);
    if (bossOn) {
      h.bossName.textContent = g.boss?.label() ?? 'THE GLOAMHEART';
      h.bossFill.style.width = `${g.bossHpFrac() * 100}%`;
    } else if (tide) {
      h.bossName.textContent = `GLOAM TIDE \u00b7 THE WICK'S WARD${tide.kills ? ` \u00b7 ${tide.kills} DRIVEN OFF` : ''}`;
      h.bossFill.style.width = `${tide.ward}%`;
    }
    this.drawMinimap();
  }

  private updateHotbar(): void {
    const g = this.game;
    const key = g.p.inv
      .slice(0, HOTBAR)
      .map((s) => (s ? `${s.id}:${s.n}` : '-'))
      .join('|') + '#' + g.p.sel;
    if (key === this.lastHotbar) return;
    this.lastHotbar = key;
    let html = '';
    for (let i = 0; i < HOTBAR; i++) {
      const s = g.p.inv[i];
      const def = s ? ITEMS[s.id] : null;
      html += `<div class="slot ${i === g.p.sel ? 'sel' : ''} ${s ? '' : 'empty'}" data-slot="${i}"><span class="k">${(i + 1) % 10}</span>${def ? img(def.icon) : ''}${s && s.n > 1 ? `<span class="n">${s.n}</span>` : ''}</div>`;
    }
    this.hudEls.hotbar.innerHTML = html;
    const held = g.p.inv[g.p.sel];
    this.hudEls.heldName.textContent = held ? ITEMS[held.id]?.name ?? '' : 'Bare hands';
    this.hudEls.heldName.classList.remove('flash');
    void this.hudEls.heldName.offsetWidth;
    this.hudEls.heldName.classList.add('flash');
  }

  // ------------------------------------------------------------------ maps
  private tileColor(x: number, y: number): [number, number, number, number] {
    const w = this.game.world;
    const i = y * w.w + x;
    const fg = w.fg[i];
    if (y < w.surface[x] && fg === B.AIR) {
      const o = w.obj[i];
      if (o === Obj.TREE) return [40, 110, 40, 255];
      return [0, 0, 0, 0];
    }
    if (!w.explored[i]) return [0, 0, 0, 0];
    if (fg !== B.AIR) {
      const c = hexRgb(BLOCKS[fg].color);
      return BLOCKS[fg].ore ? [c[0], c[1], c[2], 255] : [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75, 255];
    }
    const o = w.obj[i];
    if (o === Obj.TORCH || o === Obj.CAMPFIRE) return [255, 200, 90, 255];
    if (o === Obj.LADDER) return [150, 100, 60, 255];
    if (o === Obj.HEART_CRYSTAL) return [255, 110, 170, 255];
    if (o && o !== Obj.TREE) return [190, 150, 100, 255];
    if (w.wall[i]) return [30, 26, 40, 255];
    return [18, 16, 26, 255];
  }

  rebuildMap(): void {
    const d = this.mapImg.data;
    for (let y = 0; y < WORLD_H; y++)
      for (let x = 0; x < WORLD_W; x++) {
        const c = this.tileColor(x, y);
        const p = (y * WORLD_W + x) * 4;
        d[p] = c[0];
        d[p + 1] = c[1];
        d[p + 2] = c[2];
        d[p + 3] = c[3];
      }
    this.mapCtx.putImageData(this.mapImg, 0, 0);
    this.game.world.dirty.clear();
  }

  private flushDirty(): void {
    const w = this.game.world;
    if (w.dirty.size === 0) return;
    const d = this.mapImg.data;
    for (const i of w.dirty) {
      const c = this.tileColor(i % WORLD_W, Math.floor(i / WORLD_W));
      const p = i * 4;
      d[p] = c[0];
      d[p + 1] = c[1];
      d[p + 2] = c[2];
      d[p + 3] = c[3];
    }
    w.dirty.clear();
    this.mapCtx.putImageData(this.mapImg, 0, 0);
  }

  private drawMinimap(): void {
    this.flushDirty();
    const g = this.game;
    const ctx = this.miniCtx;
    const W = this.mini.width;
    const H = this.mini.height;
    const z = 3;
    const pt = g.playerTile();
    const vx = pt.x - W / z / 2;
    const vy = pt.y - H / z / 2;
    ctx.imageSmoothingEnabled = false;
    const day = daylight(g.p.clock);
    ctx.fillStyle = pt.y < g.world.surface[Math.max(0, Math.min(WORLD_W - 1, pt.x))] + 6 ? `rgb(${Math.round(20 + 60 * day)},${Math.round(24 + 90 * day)},${Math.round(44 + 120 * day)})` : '#07060b';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.mapCanvas, vx, vy, W / z, H / z, 0, 0, W, H);
    this.drawMarkers(ctx, (x) => (x - vx) * z, (y) => (y - vy) * z, z, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(W / 2 - 2), Math.round(H / 2 - 3), 4, 6);
  }

  private drawMarkers(ctx: CanvasRenderingContext2D, mx: (x: number) => number, my: (y: number) => number, z: number, range: number): void {
    const g = this.game;
    const p = g.p;
    const pt = g.playerTile();
    for (const b of p.buildings) {
      ctx.fillStyle = '#c8963a';
      ctx.fillRect(mx(b.x) - z * 2, my(b.y - 2) - z, z * 4, z * 3);
    }
    // the Wick: a bright beacon (dim while cold)
    ctx.fillStyle = g.flame > 0 ? '#fff0a0' : '#6a6070';
    ctx.fillRect(mx(WICK_X) - z, my(WICK_Y - 6) - z, z * 3, z * 6);
    const w0 = g.world;
    ctx.fillStyle = '#ffd75a';
    for (let y = Math.max(0, pt.y - range); y < Math.min(w0.h, pt.y + range); y++)
      for (let x = Math.max(0, pt.x - range); x < Math.min(w0.w, pt.x + range); x++) if (w0.obj[y * w0.w + x] === Obj.WICKPOST) ctx.fillRect(mx(x), my(y - 1), z * 2, z * 3);
    ctx.fillStyle = '#ff7a9a';
    ctx.fillRect(mx(p.spawn.x) - z, my(p.spawn.y) - z, z * 3, z * 2);
    // the lost: a fire that blinks
    const blink = Math.floor(performance.now() / 450) % 2 === 0;
    for (const s of g.souls) {
      ctx.fillStyle = blink ? '#ffe08a' : '#ff8a3a';
      ctx.fillRect(mx(s.x / TILE) - z * 1.5, my(s.y / TILE - 1) - z * 1.5, z * 4, z * 4);
      ctx.fillStyle = '#2a1408';
      ctx.fillRect(mx(s.x / TILE) - z * 0.5, my(s.y / TILE - 1) - z * 0.5, z * 2, z * 2);
    }
    if (p.satchel) {
      ctx.fillStyle = '#9af0a0';
      ctx.fillRect(mx(p.satchel.x / TILE) - z, my(p.satchel.y / TILE) - z, z * 3, z * 3);
    }
    const w = g.world;
    const compass = p.catalogued.includes('r_compass');
    const starmap = p.catalogued.includes('r_starmap');
    if (compass || starmap) {
      for (let y = Math.max(0, pt.y - range); y < Math.min(w.h, pt.y + range); y++) {
        for (let x = Math.max(0, pt.x - range); x < Math.min(w.w, pt.x + range); x++) {
          const i = y * w.w + x;
          if (compass && w.obj[i] === Obj.CHEST) {
            ctx.fillStyle = '#ffd75a';
            ctx.fillRect(mx(x), my(y), z * 2, z * 2);
          }
          if (starmap && (w.fg[i] === B.RELIC_STONE || w.fg[i] === B.FOSSIL)) {
            ctx.fillStyle = '#ff9aff';
            ctx.fillRect(mx(x), my(y), z * 2, z * 2);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ panels
  render(): void {
    // the element under the mouse is about to be replaced; its tooltip goes with it
    this.tipEl.classList.remove('show');
    let html = '';
    switch (this.panel) {
      case 'inv':
        html = this.invHtml();
        break;
      case 'chest':
        html = this.chestHtml();
        break;
      case 'shop':
        html = this.shopHtml();
        break;
      case 'smith':
        html = this.smithHtml();
        break;
      case 'archive':
        html = this.archiveHtml();
        break;
      case 'still':
        html = this.stillHtml();
        break;
      case 'wick':
        html = this.wickHtml();
        break;
      case 'map':
        html = this.mapHtml();
        break;
      case 'pause':
        html = this.pauseHtml();
        break;
      case 'journal':
        html = this.journalHtml();
        break;
      case 'victory':
        html = this.victoryHtml();
        break;
      default:
        return;
    }
    this.panelEl.innerHTML = `<div class="win ${this.panel}">${html}<button class="x" data-a="close" title="Close (Esc)">✕</button></div>`;
    if (this.panel === 'map') this.paintBigMap();
    this.updateCursor();
  }

  private slotHtml(s: Slot, attr: string, extra = ''): string {
    const def = s ? ITEMS[s.id] : null;
    return `<div class="slot ${extra} ${s ? '' : 'empty'}" ${attr}>${def ? img(def.icon) : ''}${s && s.n > 1 ? `<span class="n">${s.n}</span>` : ''}</div>`;
  }

  private gridHtml(): string {
    const p = this.game.p;
    let html = '<div class="grid inv-grid">';
    for (let i = 0; i < INV_SIZE; i++) html += this.slotHtml(p.inv[i], `data-inv="${i}"`, `${i < HOTBAR ? 'hb' : ''} ${i === p.sel ? 'sel' : ''}`);
    return html + '</div>';
  }

  private equipHtml(): string {
    const p = this.game.p;
    let html = '<div class="equip">';
    for (const e of EQUIP_SLOTS) {
      const s = p.equip[e.key];
      html += `<div class="eq"><small>${e.label}</small>${this.slotHtml(s, `data-equip="${e.key}"`, 'eqslot')}</div>`;
    }
    const st = this.game.st;
    html += `</div><div class="mini-stats"><span>${img(UI_ICON.heart)} ${st.maxHp}</span><span>🛡 ${Math.round(st.reduce * 100)}%</span><span>⚔ ${st.attack.toFixed(0)}</span><span>⛏ T${st.pickTier}</span></div>`;
    return html;
  }

  private invHtml(): string {
    const g = this.game;
    const stations = g.stationsNear();
    const names = [...stations].filter((s) => s !== 'hand').map((s) => STATION_NAME[s]);
    const how = g.input.usingTouch
      ? 'Tap to pick up, tap to place. Hold a stack to split it. Double-tap equips or quick-moves. Tap outside to drop.'
      : 'Click to pick up, click to place. Right-click splits. Shift-click equips or quick-moves. Click outside to drop.';
    let html = `<div class="hd"><div><h2>Pack</h2><p class="line">${how}</p></div><div class="purse">${img(UI_ICON.coin)} ${fmt(g.p.coins)}</div></div>`;
    html += `<div class="invwrap"><div class="left">${this.equipHtml()}${this.gridHtml()}</div>`;
    html += `<div class="craft"><div class="craft-hd"><h3>Crafting</h3><small>${names.length ? 'Near: ' + names.join(', ') : 'By hand only. Build a Workbench for more.'}</small><label class="toggle"><input type="checkbox" data-a="showall" ${this.showAll ? 'checked' : ''}> all</label></div><div class="recipes">`;
    const list = this.showAll ? RECIPES : g.recipesFor(stations);
    const sorted = list
      .map((r, i) => ({ r, i, ok: g.canCraft(r, stations) }))
      .sort((a, b) => (a.ok === b.ok ? a.i - b.i : a.ok ? -1 : 1));
    for (const { r, ok } of sorted) html += this.recipeHtml(r, ok, stations.has(r.at));
    html += '</div></div></div>';
    return html;
  }

  private recipeHtml(r: Recipe, ok: boolean, here: boolean): string {
    const g = this.game;
    const out = ITEMS[r.out];
    const idx = RECIPES.indexOf(r);
    let need = '';
    for (const [id, n] of Object.entries(r.need)) {
      const have = count(g.p, id);
      need += `<span class="cost ${have >= n ? 'ok' : 'no'}" title="${esc(ITEMS[id]?.name ?? id)}">${img(ITEMS[id].icon)}${n}</span>`;
    }
    const flameNote = (r.flame ?? 0) > g.flame ? `<small class="where">Needs the Wick ${FLAME[r.flame ?? 0].name}</small>` : '';
    const where = (here ? '' : `<small class="where">${STATION_NAME[r.at]}</small>`) + flameNote;
    return `<div class="rc ${ok ? 'ok' : ''}" data-tipitem="${r.out}">${img(out.icon, 'ic big')}<div class="rn"><b>${esc(out.name)}${r.n > 1 ? ` ×${r.n}` : ''}</b><div class="needs">${need}</div>${where}</div><button data-a="craft" data-r="${idx}" ${ok ? '' : 'disabled'}>Craft</button><button class="ghost" data-a="craft5" data-r="${idx}" ${ok ? '' : 'disabled'} title="Craft up to 5">×5</button></div>`;
  }

  private chestHtml(): string {
    const g = this.game;
    const items = g.p.chests[String(g.openChest)] ?? [];
    let html = `<div class="hd"><div><h2>Storage Chest</h2><p class="line">${g.input.usingTouch ? 'Double-tap' : 'Shift-click'} moves a stack between the chest and your pack.</p></div><div class="row-actions"><button data-a="stashall">Store all (not hotbar)</button><button data-a="takeall">Take all</button></div></div>`;
    html += '<div class="grid chest-grid">';
    for (let i = 0; i < CHEST_SLOTS; i++) html += this.slotHtml(items[i] ?? null, `data-chest="${i}"`);
    html += '</div><h3 class="sub">Your pack</h3>' + this.gridHtml();
    return html;
  }

  private header(title: string, who: string, line: string, portrait?: string): string {
    return `<div class="hd">${portrait ? `<img class="portrait" src="./assets/camp/${portrait}.png" alt="">` : ''}<div><h2>${title}</h2><div class="who">${who}</div><p class="line">“${line}”</p></div><div class="purse">${img(UI_ICON.coin)} ${fmt(this.game.p.coins)}</div></div>`;
  }

  private shopHtml(): string {
    const g = this.game;
    const p = g.p;
    const lines = ['You lit the Wick again? Then you can afford my prices.', 'Bring me shiny things and I make you less poor. The glowing ones, though... the Wick wants those.', 'The deeper the rock, the better the price.'];
    let html = this.header("Pell's Trading Post", 'Old Pell, merchant', lines[Math.floor(g.time / 20) % lines.length], 'npc_merchant');
    html += `<div class="tabs"><button class="${this.tab === 'sell' ? 'on' : ''}" data-a="tab" data-v="sell">Sell</button><button class="${this.tab === 'buy' ? 'on' : ''}" data-a="tab" data-v="buy">Buy</button></div>`;
    if (this.tab === 'sell') {
      let total = 0;
      for (const s of p.inv) if (s && ITEMS[s.id]?.kind === 'material' && s.id !== 'wood') total += itemValue(s.id, g.st) * s.n;
      html += `<div class="row-actions"><button class="big" data-a="sellall" ${total ? '' : 'disabled'}>Sell all ore, bars & parts (~${fmt(total)}c)</button><span class="hint">Items a bounty needs are kept back.</span></div><div class="list">`;
      let any = false;
      p.inv.forEach((s, i) => {
        if (!s) return;
        const def = ITEMS[s.id];
        if (!def || !sellable(def)) return;
        const v = itemValue(s.id, g.st);
        if (v <= 0) return;
        any = true;
        html += `<div class="li">${img(def.icon)}<div class="nm"><b>${esc(def.name)}</b> <span class="dim">×${s.n}</span><small>${esc(def.desc)}</small></div><div class="pr">${v}c ea</div><button data-a="sell" data-i="${i}" data-n="1">Sell 1</button><button data-a="sell" data-i="${i}" data-n="${s.n}">All (${fmt(v * s.n)}c)</button></div>`;
      });
      if (!any) html += '<p class="empty-note">Nothing worth coin in your pack. Ore, gems, bars and creature parts sell well.</p>';
      html += '</div>';
    } else {
      html += '<div class="list">';
      g.shopStock().forEach((it, k) => {
        const def = ITEMS[it.id];
        html += `<div class="li">${img(def.icon)}<div class="nm"><b>${esc(def.name)}${it.n > 1 ? ` ×${it.n}` : ''}</b> <span class="dim">have ${count(p, it.id)}</span><small>${esc(def.desc)}</small></div><div class="pr">${it.price * it.n}c</div><button data-a="buy" data-k="${k}" ${p.coins >= it.price * it.n ? '' : 'disabled'}>Buy</button></div>`;
      });
      html += '</div>';
    }
    return html;
  }

  private wickHtml(): string {
    const g = this.game;
    const p = g.p;
    const lvl = g.flame;
    const atPost = !!g.wickFrom;
    const lines = lvl === 0
      ? 'Iron and dusty glass. Once, the whole valley lived in its light.'
      : g.dawnLit
        ? 'It burns with all the light the Gloamheart ever drank. There is no dark left in the valley that it cannot reach.'
        : lvl >= MAX_FLAME
        ? 'The Wick burns as it did in the old days. The dark keeps well away.'
        : 'It drinks whatever glows. Bring the mountain’s light home.';
    let html = `<div class="hd"><img class="portrait wickport" src="./assets/camp/${atPost ? 'wickpost' : lvl > 0 ? 'wick_lit' : 'wick'}.png" alt=""><div><h2>${atPost ? 'Wickpost' : 'The Wick'}</h2><div class="who">${g.dawnLit ? 'Dawn · the heart is stilled' : lvl > 0 ? `${FLAME[lvl].name} · flame ${lvl} of ${MAX_FLAME}` : 'Cold'}</div><p class="line">${atPost ? 'A little of the Wick’s flame, carried down into the dark.' : lines}</p></div></div>`;
    if (!atPost) {
      // the ladder of flame levels
      html += '<div class="flames">';
      for (let i = 1; i <= MAX_FLAME; i++) {
        const f = FLAME[i];
        html += `<div class="fstep ${i <= lvl ? 'lit' : ''} ${i === lvl + 1 ? 'next' : ''}"><i class="fl l${i <= lvl ? i : 0}"></i><b>${f.name}</b><small>${i === 1 ? 'Kindle it' : `${fmt(f.need)} Lumen`}</small><em>${esc(f.perk)}</em></div>`;
      }
      html += '</div>';
      if (!p.wick.kindled) {
        let need = '';
        for (const [id, n] of Object.entries(KINDLING)) need += `<span class="cost ${count(p, id) >= n ? 'ok' : 'no'}">${img(ITEMS[id].icon)}${count(p, id)}/${n}</span>`;
        const ok = Object.entries(KINDLING).every(([id, n]) => count(p, id) >= n);
        html += `<div class="card kindle"><h3>Kindle the Wick</h3><div class="costs">${need}</div><button class="big" data-a="kindle" ${ok ? '' : 'disabled'}>Kindle it</button><small>Wood from trees; coal from the rock below the meadow (a Wooden Pickaxe will do).</small></div>`;
      } else {
        const toNext = lumenToNext(p.wick);
        if (lvl < MAX_FLAME) {
          const base = FLAME[lvl].need;
          const span = FLAME[lvl + 1].need - base;
          const frac = Math.max(0, Math.min(1, (p.wick.lumen - base) / span));
          html += `<div class="lumenbar"><div class="fill" style="width:${frac * 100}%"></div><span>${fmt(p.wick.lumen)} Lumen · ${fmt(toNext)} more to ${FLAME[lvl + 1].name}</span></div>`;
        }
        // what you carry that would feed it
        const have = new Map<string, number>();
        for (const st of p.inv) if (st && LUMEN[st.id]) have.set(st.id, (have.get(st.id) ?? 0) + st.n);
        let total = 0;
        for (const [id, n] of have) total += LUMEN[id] * n;
        html += `<div class="row-actions"><button class="big" data-a="offerall" ${total ? '' : 'disabled'}>Offer everything that glows${total ? ` (+${fmt(total)} Lumen)` : ''}</button><span class="hint">Anything a bounty still needs is kept back.</span></div>`;
        if (have.size) {
          html += '<div class="list">';
          for (const [id, n] of have) {
            const def = ITEMS[id];
            html += `<div class="li">${img(def.icon)}<div class="nm"><b>${esc(def.name)}</b> <span class="dim">×${n}</span><small>${LUMEN[id]} Lumen each</small></div><div class="pr lum">+${fmt(LUMEN[id] * n)}</div><button data-a="offer" data-id="${id}">Offer</button></div>`;
          }
          html += '</div>';
        } else {
          html += '<p class="empty-note">You carry nothing that glows. These feed the flame:</p><div class="glowlist">';
          for (const [id, v] of Object.entries(LUMEN)) html += `<span class="cost" title="${esc(ITEMS[id]?.name ?? id)}">${img(ITEMS[id].icon)}${v}</span>`;
          html += '</div>';
        }
      }
    }
    // travel along the light
    if (lvl >= 1) {
      const posts = g.wickposts().filter((q) => !(atPost && g.wickFrom && q.x === g.wickFrom.x && q.y === g.wickFrom.y));
      html += '<h3 class="sub">Follow the light</h3><div class="list">';
      if (atPost) html += `<div class="li"><i class="fl l${lvl} big"></i><div class="nm"><b>The Wick</b><small>Home, in the meadow</small></div><button data-a="travel">Travel</button></div>`;
      for (const q of posts) {
        const surf = g.world.surface[q.x] ?? 0;
        const depth = Math.max(0, q.y - surf);
        html += `<div class="li"><img class="ic" src="${iconUrl(ITEMS.wickpost.icon)}" alt=""><div class="nm"><b>Wickpost</b><small>${depth <= 2 ? 'On the surface' : `${esc(biomeAt(q.y).name)} · ${depth}m down`}</small></div><button data-a="travel" data-x="${q.x}" data-y="${q.y}">Travel</button></div>`;
      }
      if (!posts.length && !atPost) html += `<p class="empty-note">${lvl >= 2 ? 'Craft Wickposts at a workbench and plant them as you delve. You can travel to any of them from here.' : 'At the Glowing flame you can build Wickposts: lit waypoints you can travel between.'}</p>`;
      html += '</div>';
    }
    return html;
  }

  private smithHtml(): string {
    const g = this.game;
    const p = g.p;
    let html = this.header("Brannoc's Forge", 'Brannoc Ashgrip, smith', 'Rock only respects two things. A sharper pick, and a stubborn miner.', 'npc_smith');
    html += '<div class="cards">';
    const card = (kind: 'sharpen' | 'hone', title: string, icon: IconRef, what: string): string => {
      const lvl = p[kind];
      const c = sharpenCost(lvl);
      let s = `<div class="card"><div class="ct">${img(icon, 'ic big')}<div><h3>${title}</h3><b>Level ${lvl}/${SHARPEN_MAX}</b><small>${what}</small></div></div>`;
      s += lvl < SHARPEN_MAX ? `<div class="next"><div class="costs"><span class="cost ${p.coins >= c ? 'ok' : 'no'}">${img(UI_ICON.coin)}${fmt(c)}</span></div><button data-a="${kind}" ${p.coins >= c ? '' : 'disabled'}>${kind === 'sharpen' ? 'Sharpen' : 'Hone'}</button></div>` : '<div class="next maxed">Razor sharp</div>';
      return s + '</div>';
    };
    html += card('sharpen', 'Whetstone', { sheet: 'i32', idx: 2 }, '+8% pickaxe power per level, for every pick you own.');
    html += card('hone', 'Blade Hone', { sheet: 'n32', idx: 6 }, '+8% sword damage per level, for every sword you own.');
    html += '</div><p class="hint">Tools, armor, lanterns and charms are forged at your own Anvil. Brannoc makes them better.</p>';
    return html;
  }

  private stillHtml(): string {
    const g = this.game;
    const p = g.p;
    const lines = ['Breathe slow. The dark feeds on a racing heart.', 'Bring me what grows in the dark and I will brew you the nerve to face it.', 'Gloam motes make the best salve. Spite is a fine ingredient too.'];
    let html = this.header("Hesper's Stillroom", 'Hesper Vell, apothecary', lines[Math.floor(g.time / 20) % lines.length], 'npc_herbalist');
    html += '<div class="list brews">';
    for (const b of BREWS) {
      const def = ITEMS[b.id];
      const have = count(p, b.id);
      let ok = p.coins >= b.coins;
      let costs = `<span class="cost ${p.coins >= b.coins ? 'ok' : 'no'}">${img(UI_ICON.coin)}${b.coins}</span>`;
      for (const [id, n] of Object.entries(b.needs)) {
        const c = count(p, id);
        if (c < n) ok = false;
        costs += `<span class="cost ${c >= n ? 'ok' : 'no'}" title="${esc(ITEMS[id]?.name ?? id)}">${img(ITEMS[id].icon)}${c}/${n}</span>`;
      }
      html += `<div class="li">${img(def.icon)}<div class="nm"><b>${esc(def.name)}</b>${have ? ` <span class="dim">\u00d7${have}</span>` : ''}<small>${esc(def.desc)}</small></div><div class="costs">${costs}</div><button data-a="brew" data-id="${b.id}" ${ok ? '' : 'disabled'}>Brew</button></div>`;
    }
    html += '</div><p class="hint">Hold a brew in your hotbar and click to drink it. Glowcaps grow in the tunnels, jade in the Grotto, and Gloam Motes are what Gloamlings leave behind.</p>';
    return html;
  }

  private archiveHtml(): string {
    const g = this.game;
    const p = g.p;
    let html = this.header('The Lantern Archive', 'Wren, archivist', 'Every relic down there remembers the light. Bring them home and they will share it.', 'npc_archivist');
    html += `<div class="tabs"><button class="${this.archiveTab === 'relics' ? 'on' : ''}" data-a="atab" data-v="relics">Relics (${p.catalogued.length}/${RELICS.length})</button><button class="${this.archiveTab === 'bounties' ? 'on' : ''}" data-a="atab" data-v="bounties">Bounty board</button><button class="${this.archiveTab === 'log' ? 'on' : ''}" data-a="atab" data-v="log">Delver's log</button></div>`;
    if (this.archiveTab === 'relics') {
      html += '<div class="relics">';
      for (const r of RELICS) {
        const done = p.catalogued.includes(r.id);
        const have = count(p, r.id) > 0;
        const where = r.biome < 5 ? BIOMES[r.biome].name : 'The Heart Chamber';
        if (done) html += `<div class="relic done">${img(r.icon, 'ic big')}<b>${r.name}</b><small class="bonus">${r.bonus}</small><small>${r.desc}</small></div>`;
        else if (have) html += `<div class="relic ready">${img(r.icon, 'ic big')}<b>${r.name}</b><small class="bonus">${r.bonus}</small><button data-a="cat" data-id="${r.id}">Catalogue</button></div>`;
        else html += `<div class="relic unknown">${img(r.icon, 'ic big shadow')}<b>???</b><small>Somewhere in ${where}</small></div>`;
      }
      html += '</div><p class="hint">Relics drop from Fossil Beds and glowing Relic Stones, and sometimes from chests.</p>';
    } else if (this.archiveTab === 'bounties') {
      html += '<div class="bounties">';
      p.bounties.forEach((b, i) => {
        const ready = g.bountyReady(b);
        let prog = '';
        if (b.kind === 'deliver') prog = `${Math.min(count(p, b.target), b.need)}/${b.need}`;
        else if (b.kind === 'depth') prog = `${Math.min(p.maxDepth, b.need)}m/${b.need}m`;
        else prog = `${b.have}/${b.need}`;
        const icon = b.kind === 'deliver' ? ITEMS[b.target].icon : b.kind === 'slay' ? UI_ICON.skull : b.kind === 'chests' ? UI_ICON.chest : UI_ICON.compass;
        const reroll = 25 + g.maxBiome() * 25;
        html += `<div class="bounty ${ready ? 'ready' : ''}">${img(icon, 'ic big')}<div class="bt"><b>${b.text}</b><small>Progress: ${prog}${b.kind === 'slay' ? ` · found in ${BIOMES.find((bm) => bm.enemies.includes(b.target))?.name ?? 'the deep'}` : ''}</small><small class="rw">${img(UI_ICON.coin)}${fmt(b.reward)} · ${img(UI_ICON.star)}${b.xp} Delving XP</small></div><button data-a="turnin" data-i="${i}" ${ready ? '' : 'disabled'}>Turn in</button><button class="ghost" data-a="reroll" data-i="${i}" ${p.coins >= reroll ? '' : 'disabled'} title="Swap for a new bounty">↻ ${reroll}c</button></div>`;
      });
      html += `</div><p class="hint">Bounties completed: ${p.bountiesDone}.</p>`;
    } else {
      const s = p.stats;
      const mins = Math.floor(s.time / 60);
      html += `<div class="log"><div><span>Time played</span><b>${Math.floor(mins / 60)}h ${mins % 60}m</b></div><div><span>Days survived</span><b>${s.days}</b></div><div><span>Deepest point</span><b>${p.maxDepth}m</b></div><div><span>Blocks mined</span><b>${fmt(s.mined)}</b></div><div><span>Items crafted</span><b>${fmt(s.crafted)}</b></div><div><span>Creatures defeated</span><b>${fmt(s.kills)}</b></div><div><span>Chests opened</span><b>${s.chests}</b></div><div><span>Coins earned</span><b>${fmt(s.earned)}</b></div><div><span>Blackouts</span><b>${s.deaths}</b></div><div><span>Gloamheart</span><b>${p.bossDefeated ? 'Stilled' : 'Beating'}</b></div></div>`;
      html += '<h3 class="sub">Bestiary</h3><div class="bestiary">';
      for (const e of Object.values(ENEMIES)) {
        const bm = BIOMES.find((b) => b.enemies.includes(e.id));
        const known = !!p.seen['kill_' + e.id];
        const drop = e.drops[0] ? ITEMS[e.drops[0].id]?.name : '';
        // shades have no sprite sheet: their portrait is the mote they leave behind
        const sprite = e.shade
          ? `<div class="sprite" style="background-image:url(${iconUrl(ITEMS.gloammote.icon)});background-size:contain;image-rendering:pixelated;width:48px;height:48px"></div>`
          : `<div class="sprite" style="background-image:url(./assets/enemies/${e.id}.png);background-position:-${e.size}px 0;width:${e.size}px;height:${e.size}px"></div>`;
        const where = e.shade ? 'Wherever it is dark, when your nerve is going' : bm?.name ?? (e.nocturnal ? 'Surface, at night' : 'The surface');
        html += `<div class="beast ${known ? '' : 'unknown'}">${sprite}<b>${known ? e.name : '???'}</b><small>${where}${known ? ` · ${e.hp} hp · drops ${drop}` : ' · not yet defeated'}</small></div>`;
      }
      html += '</div>';
    }
    return html;
  }

  private mapHtml(): string {
    return `<div class="hd"><div><h2>Survey Map</h2><p class="line">Everything your light has touched.</p></div></div><canvas id="bigmap"></canvas><div class="legend"><span><i style="background:#fff"></i>You</span><span><i style="background:#ff7a9a"></i>Spawn / bed</span><span><i style="background:#ffd75a"></i>Settlement</span><span><i style="background:#9af0a0"></i>Lost satchel</span><span><i style="background:#ff6eaa"></i>Heart crystal</span>${BIOMES.slice(1, 5)
      .map((b) => `<span class="dim">${b.name}: ${b.top - 26}m</span>`)
      .join('')}</div>`;
  }

  private paintBigMap(): void {
    this.flushDirty();
    const c = this.panelEl.querySelector<HTMLCanvasElement>('#bigmap');
    if (!c) return;
    const g = this.game;
    const z = 3;
    const maxW = Math.min(window.innerWidth * 0.86, 900);
    const viewW = Math.min(WORLD_W, Math.floor(maxW / z));
    const viewH = Math.floor(Math.min(window.innerHeight * 0.62, 600) / z);
    c.width = viewW * z;
    c.height = viewH * z;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const pt = g.playerTile();
    const vx = Math.max(0, Math.min(WORLD_W - viewW, pt.x - viewW / 2));
    const vy = Math.max(0, Math.min(WORLD_H - viewH, pt.y - viewH / 2));
    ctx.fillStyle = '#07060b';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.mapCanvas, vx, vy, viewW, viewH, 0, 0, viewW * z, viewH * z);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const b of BIOMES) {
      const y = (b.top - vy) * z;
      if (y > 0 && y < c.height) ctx.fillRect(0, y, c.width, 1);
    }
    this.drawMarkers(ctx, (x) => (x - vx) * z, (y) => (y - vy) * z, z, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((pt.x - vx) * z - 2, (pt.y - vy) * z - 4, 5, 8);
  }

  /** where the lost are, under the Journal goal: a pointer and how far */
  private updateSeek(): void {
    const g = this.game;
    const pt = g.playerTile();
    let html = '';
    for (const s of g.souls) {
      const def = LOST[s.kind];
      const with_ = g.soulFollowing(s.kind);
      const tx = with_ ? WICK_X : Math.floor(s.x / TILE);
      const ty = with_ ? WICK_Y - 1 : Math.floor(s.y / TILE) - 1;
      const dx = tx - pt.x;
      const dy = ty - pt.y;
      const parts: string[] = [];
      if (dy > 1) parts.push(`${dy}m down`);
      else if (dy < -1) parts.push(`${-dy}m up`);
      if (dx > 1) parts.push(`${dx}m right`);
      else if (dx < -1) parts.push(`${-dx}m left`);
      const near = Math.hypot(dx, dy) < 3;
      const ang = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      const where = near ? (with_ ? 'almost home' : 'right here') : parts.join(' \u00b7 ');
      html += `<div class="seek${with_ ? ' with' : ''}"><i class="arr" style="transform:rotate(${near ? 90 : ang}deg)"><svg viewBox="-8 -8 16 16"><path d="M-7 -1.6H0.5V-5.5L7.5 0 0.5 5.5V1.6H-7Z"/></svg></i><b>${with_ ? `${def.name} is with you` : `${def.name}'s fire`}</b><span>${with_ ? `To the Wick: ${where}` : where}</span></div>`;
    }
    if (html !== this.lastSeek) {
      this.hudEls.seek.innerHTML = html;
      this.hudEls.seek.style.display = html ? '' : 'none';
      this.lastSeek = html;
    }
  }

  /** the Journal's current goal, under the minimap */
  private updateGoal(): void {
    const g = this.game;
    const h = this.hudEls;
    const cur = GOALS[g.p.journal];
    let html = '';
    // a page just ticked off stays up, done, for a moment
    const now = performance.now();
    if (now >= this.goalFlashUntil) {
      this.goalFlash = this.goalQ.shift() ?? null;
      // a run of pages turns faster
      if (this.goalFlash) this.goalFlashUntil = now + (this.goalQ.length >= 2 ? 1100 : 1900);
    }
    const flash = now < this.goalFlashUntil ? this.goalFlash : null;
    h.goal.classList.toggle('done', !!flash);
    if (flash) html = `<small>Journal \u00b7 done</small><b>\u2713 ${flash.text}</b><span>+${flash.coins} coins</span>`;
    else if (cur) {
      const [have, need] = cur.goal.progress(g);
      html = `<small>Journal \u00b7 ${ROMAN[cur.chapter]}</small><b>${cur.goal.text}</b>${need > 1 ? `<div class="gbar"><em style="width:${Math.round((have / need) * 100)}%"></em></div><span>${fmt(have)} / ${fmt(need)}</span>` : ''}`;
    }
    // while the Wick is cold, the day is a clock: how long until dark, or until dawn
    if (!flash && !g.p.wick.kindled && !g.ending) {
      const c = g.p.clock;
      // night runs 0.6 to 0.96; from dawn the next sundown is the following day's
      const night = c >= 0.6 && c < 0.96;
      const left = night ? (0.96 - c) * DAY_LENGTH : ((c < 0.6 ? 0.6 : 1.6) - c) * DAY_LENGTH;
      if (left > 0) {
        const m = Math.floor(left / 60);
        const s = Math.floor(left % 60);
        const t = `${m}:${String(s).padStart(2, '0')}`;
        html += !night ? `<div class="sundown${left < 75 ? ' urgent' : ''}"><i class="sun"></i>Sundown in ${t}</div>` : `<div class="sundown night"><i class="moon"></i>Hold out: dawn in ${t}</div>`;
      }
    }
    if (html !== this.lastGoal) {
      h.goal.innerHTML = html;
      h.goal.style.display = html ? '' : 'none';
      this.lastGoal = html;
    }
    if (!flash && this.lastGoalIdx !== g.p.journal) {
      // a fresh goal catches the eye
      if (this.lastGoalIdx >= 0) {
        h.goal.classList.remove('fresh');
        void h.goal.offsetWidth;
        h.goal.classList.add('fresh');
      }
      this.lastGoalIdx = g.p.journal;
    }
    const help = g.input.usingPad ? 'Y pack \u00b7 D-pad \u2192 journal \u00b7 Back map \u00b7 Start menu' : 'Tab pack & craft \u00b7 J journal \u00b7 M map \u00b7 Esc menu';
    if (help !== this.lastHelp) {
      h.hudHelp.textContent = help;
      this.lastHelp = help;
    }
  }

  private journalHtml(): string {
    const g = this.game;
    const at = g.p.journal;
    const cur = GOALS[at];
    let html = `<div class="hd"><div><h2>Journal</h2><p class="line">${cur ? `Chapter ${ROMAN[cur.chapter]}: ${CHAPTERS[cur.chapter].title}` : 'Every page filled. The Wick burns, and Deepwick is yours.'}</p></div></div><div class="journal">`;
    let k = 0;
    CHAPTERS.forEach((c, ci) => {
      const open = !cur || ci <= cur.chapter;
      html += `<div class="jch ${open ? '' : 'locked'}"><h3 class="sub">${ROMAN[ci]}. ${open ? c.title : '? ? ?'}</h3>`;
      for (const goal of c.goals) {
        const i = k++;
        if (!open) continue;
        // a page added after you had passed it (someone the Wick called in an older save) stays open until it is done
        if (i < at && goal.id in LOST_GOALS && !goalDone(g, goal)) html += `<div class="jg now"><i>\u25b8</i><div class="jt"><b>${goal.text}</b><p>${goal.how}</p></div><small>still to do</small></div>`;
        else if (i < at) html += `<div class="jg done"><i>\u2713</i><span>${goal.text}</span><small>+${goal.coins}</small></div>`;
        else if (i === at) {
          const [have, need] = goal.progress(g);
          html += `<div class="jg now"><i>\u25b8</i><div class="jt"><b>${goal.text}</b><p>${goal.how}</p>${need > 1 ? `<div class="gbar"><em style="width:${Math.round((have / need) * 100)}%"></em></div><small>${fmt(have)} / ${fmt(need)}</small>` : ''}</div><small>+${goal.coins}</small></div>`;
        } else html += `<div class="jg later"><i>\u00b7</i><span>${goal.text}</span></div>`;
      }
      html += '</div>';
    });
    return html + '</div>';
  }

  private pauseHtml(): string {
    const m = Math.round(audio.musicVolume * 100);
    const s = Math.round(audio.sfxVolume * 100);
    return `<div class="hd"><div><h2>Paused</h2><p class="line">The mountain will wait.</p></div></div>
      <div class="settings"><label>Music <input type="range" min="0" max="100" value="${m}" data-set="music"></label><label>Sound <input type="range" min="0" max="100" value="${s}" data-set="sfx"></label></div>
      <div class="settings diff"><span>Options</span><button class="${prefs.shake ? 'on' : ''}" data-a="pref" data-id="shake">Screen shake &amp; flashes: ${prefs.shake ? 'On' : 'Off'}</button><button class="${prefs.hints ? 'on' : ''}" data-a="pref" data-id="hints">Tutorial hints: ${prefs.hints ? 'On' : 'Off'}</button><button class="${prefs.captions ? 'on' : ''}" data-a="pref" data-id="captions">Sound captions: ${prefs.captions ? 'On' : 'Off'}</button><button data-a="hudsize">HUD size: ${Math.round(prefs.hud * 100)}%</button><button data-a="fullscreen">${document.fullscreenElement ? 'Leave fullscreen' : 'Fullscreen'}</button></div>
      <div class="settings diff"><span>Difficulty</span>${MODE_IDS.map((id) => `<button class="${this.game.p.mode === id ? 'on' : ''}" data-a="mode" data-id="${id}">${MODES[id].name}</button>`).join('')}<small>${MODES[this.game.mode.id].blurb}</small></div>
      <div class="controls">${this.controlsHtml()}</div>
      <div class="row-actions"><button class="big" data-a="close">Resume</button><button data-a="journal">Journal</button><button data-a="save">Save now</button><button class="ghost" data-a="quit">Save &amp; quit to title</button></div>`;
  }

  /** every control, the way you are playing first */
  private controlsHtml(): string {
    const kb = `<h3 class="sub">Keyboard &amp; mouse</h3>      <div><kbd>A</kbd><kbd>D</kbd> move · <kbd>Space</kbd> jump · <kbd>W</kbd><kbd>S</kbd> climb ladders, <kbd>S</kbd> drops through ladder tops</div>
      <div><kbd>Left mouse</kbd> use the held item: dig, chop, attack, place, eat. Clicking rock with anything in hand digs with your best pickaxe</div>
      <div><kbd>Right mouse</kbd> open chests and doors, use beds and stations, pick berries, climb into carts; otherwise place or eat what you hold</div>
      <div><kbd>Left mouse</kbd> with a fishing rod: cast at water, click when the bobber dips, then click while the needle is in the green · <kbd>Space</kbd> swims up</div>
      <div><kbd>1</kbd>–<kbd>0</kbd> or wheel: hotbar · <kbd>Q</kbd> drop held stack</div>
      <div><kbd>E</kbd> talk / interact / ride a cart · <kbd>F</kbd> lamp oil · <kbd>H</kbd> tonic · <kbd>R</kbd> recall to bed · <kbd>G</kbd> grappling hook</div>
      <div><kbd>Tab</kbd> pack &amp; crafting · <kbd>J</kbd> journal · <kbd>M</kbd> map · <kbd>Esc</kbd> pause</div>`;
    const touch = `<h3 class="sub">Touch</h3>      
      <div><kbd>Left thumb</kbd> anywhere on the left: walk, push up to climb, down to drop · <kbd>Jump</kbd> jump and swim · <kbd>Use</kbd> talk, travel, ride (it lights up when there is something to do)</div>
      <div><kbd>Finger on the world</kbd> dig, chop, fight, place what you hold, eat; hold to keep digging · <kbd>Tap</kbd> a door, bed, chest or station to open it · tap the hotbar to choose</div>
      <div><kbd>Pack</kbd> pack &amp; crafting (hold a stack to split it, double-tap to quick-move) · <kbd>Oil</kbd> refill the lantern · tap the Journal goal or the minimap to open them · <kbd>☰</kbd> pause</div>`;
    const pad = `<h3 class="sub">Controller</h3>      
      <div><kbd>Left stick</kbd> move / climb · <kbd>A</kbd> jump · <kbd>RT</kbd> use the held item · <kbd>LT</kbd> or <kbd>X</kbd> open, place, eat · <kbd>Right stick</kbd> aim (let go to work the block in front of you)</div>
      <div><kbd>B</kbd> interact · <kbd>Y</kbd> pack · <kbd>LB</kbd><kbd>RB</kbd> hotbar · <kbd>L3</kbd> hook · <kbd>R3</kbd> drop · D-pad: <kbd>\u2190</kbd> oil <kbd>\u2191</kbd> tonic <kbd>\u2193</kbd> recall <kbd>\u2192</kbd> journal · <kbd>Back</kbd> map · <kbd>Start</kbd> pause</div>
      <div>In menus the left stick moves a pointer: <kbd>A</kbd> click, <kbd>X</kbd> right-click, <kbd>B</kbd> back, right stick scrolls.</div>`;
    const inp = this.game.input;
    const order = inp.usingTouch ? [touch, kb, pad] : inp.usingPad ? [pad, kb, touch] : [kb, pad, touch];
    return order.join('');
  }

  /** the epilogue: the town at dawn, who came home, whose lamps were carried up, and what it took */
  private victoryHtml(): string {
    const p = this.game.p;
    const mins = Math.floor(p.stats.time / 60);
    const home = (k: string): boolean => p.buildings.some((b) => b.kind === k);
    const folk: [string, string, string, string][] = [
      ['trade', 'Old Pell', 'keeps the Trading Post open late now, just to sit on the step and watch the square in the light.', 'never came back to the square. Perhaps now he will.'],
      ['forge', LOST.forge.name, 'has his hammer going from first light. He says he can finally see his own work.', 'is still down there, by a fire burning low. The way up is lit now.'],
      ['archive', LOST.archive.name, 'is writing all of it down: every relic, every lamp, every name.', 'is still waiting in the Grotto with her lantern. The way up is lit now.'],
      ['stillroom', LOST.stillroom.name, 'still brews Steady Draughts, though nobody needs them now. She says the habit steadies her.', 'is still singing to herself in the Crystal Hollows. The way up is lit now.'],
    ];
    const rows = folk.map(([k, name, there, away]) => `<li class="${home(k) ? '' : 'away'}"><b>${name}</b> ${home(k) ? there : away}</li>`).join('');
    const n = p.lampsHome ?? 0;
    const names = MINERS.slice(0, Math.min(n, MINERS.length));
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
    const lamps = n > 0
      ? `<p>${n === 1 ? 'One lamp' : `${n} lamps`} came home with you, and the Wick said their names: <span class="names">${esc(list)}</span>${n > MINERS.length ? `, and ${n - MINERS.length} more nobody remembers` : ''}. Rest now.</p>`
      : '<p class="away">The lamps of the lost miners still lie cold in the deep. Carry them home and the Wick will say their names.</p>';
    return `<div class="victory-inner epilogue"><img class="dawnart" src="./assets/bg/dawn.png" alt="Deepwick at dawn, the Wick blazing in the square">
    <h1>Dawn over Deepwick</h1>
    <p class="lede">The Gloamheart is stilled. The light it drank for a hundred years ran back up through the mountain and into the Wick, and the sun came up over a town with its heart burning again.</p>
    <h3>Who came home</h3><ul class="folk">${rows}</ul>
    <h3>The lost miners</h3>${lamps}
    <div class="log"><div><span>Time</span><b>${Math.floor(mins / 60)}h ${mins % 60}m</b></div><div><span>Days survived</span><b>${p.stats.days}</b></div><div><span>Deepest point</span><b>${p.maxDepth}m</b></div><div><span>Blocks mined</span><b>${fmt(p.stats.mined)}</b></div><div><span>Creatures defeated</span><b>${fmt(p.stats.kills)}</b></div><div><span>Relics catalogued</span><b>${p.catalogued.length}/${RELICS.length}</b></div><div><span>Blackouts</span><b>${p.stats.deaths}</b></div></div>
    <p class="dim">The Gloam Tides are over. Nothing of the Gloam rises from the dark now, the Lampless are at rest, and the dark below frays your nerve half as fast. The mountain still holds its ore, relics and fish. The Heart of Deepwick came home with you: take it to the Lantern Archive.</p>
    <div class="row-actions"><button class="big" data-a="close">Keep playing</button></div></div>`;
  }

  // ------------------------------------------------------------------ slot mouse logic
  private slotRef(el: HTMLElement): { arr: Slot[]; i: number; equip?: EquipKey } | null {
    const g = this.game;
    if (el.dataset.inv !== undefined) return { arr: g.p.inv, i: Number(el.dataset.inv) };
    if (el.dataset.chest !== undefined) {
      const arr = g.p.chests[String(g.openChest)];
      return arr ? { arr, i: Number(el.dataset.chest) } : null;
    }
    if (el.dataset.equip !== undefined) return { arr: [], i: -1, equip: el.dataset.equip as EquipKey };
    return null;
  }

  /** a long press already split this stack: the tap the browser makes of it afterwards is swallowed */
  private swallowTapUntil = 0;
  /** the last slot tapped, for a double tap */
  private lastTap: { key: string; t: number; picked: boolean } | null = null;

  /**
   * Fingers have no right button and no Shift: holding a finger on a stack splits it (the right
   * button), and a quick double tap quick-moves or equips it (Shift-click).
   */
  private bindTouchSlots(): void {
    let timer = 0;
    let sx = 0;
    let sy = 0;
    let fired = false;
    const cancel = (): void => window.clearTimeout(timer);
    const lift = (): void => {
      cancel();
      if (fired) this.swallowTapUntil = performance.now() + 450;
      fired = false;
    };
    const move = (e: TouchEvent): void => {
      const t = e.changedTouches[0];
      if (t && Math.hypot(t.clientX - sx, t.clientY - sy) > 10) cancel();
    };
    this.panelEl.addEventListener(
      'touchstart',
      (e) => {
        const t = e.changedTouches[0];
        const target = e.target as HTMLElement;
        const slotEl = target.closest('.slot') as HTMLElement | null;
        cancel();
        fired = false;
        if (!t || !slotEl || (slotEl.dataset.inv === undefined && slotEl.dataset.chest === undefined)) return;
        sx = t.clientX;
        sy = t.clientY;
        // the split redraws the pack, so the finger's own element (no longer in the page) hears it lift
        target.addEventListener('touchmove', move, { passive: true });
        target.addEventListener('touchend', lift, { once: true });
        target.addEventListener('touchcancel', lift, { once: true });
        timer = window.setTimeout(() => {
          fired = true;
          this.lastTap = null;
          this.slotClick(slotEl, true, false);
          navigator.vibrate?.(12);
        }, 430);
      },
      { passive: true },
    );
  }

  private onMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const slotEl = target.closest('.slot') as HTMLElement | null;
    if (slotEl && (slotEl.dataset.inv !== undefined || slotEl.dataset.chest !== undefined || slotEl.dataset.equip !== undefined)) {
      e.preventDefault();
      if (performance.now() < this.swallowTapUntil) return;
      if (this.game.input.usingTouch && slotEl.dataset.equip === undefined) {
        const key = slotEl.dataset.inv !== undefined ? `i${slotEl.dataset.inv}` : `c${slotEl.dataset.chest}`;
        const now = performance.now();
        const last = this.lastTap;
        this.lastTap = null;
        // a double tap: the first tap picked the stack up; put it back and quick-move it instead
        if (last && last.key === key && last.picked && now - last.t < 340 && this.cursor) {
          const ref = this.slotRef(slotEl);
          if (ref && !ref.equip && !ref.arr[ref.i]) {
            ref.arr[ref.i] = this.cursor;
            this.cursor = null;
            this.slotClick(slotEl, false, true);
            this.updateCursor();
            return;
          }
        }
        const had = !!this.cursor;
        this.slotClick(slotEl, false, false);
        this.lastTap = { key, t: now, picked: !had && !!this.cursor };
        return;
      }
      this.slotClick(slotEl, e.button === 2, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    const t = target.closest('[data-a]') as HTMLElement | null;
    if (t) {
      if ((t as HTMLButtonElement).disabled) return;
      this.action(t, e.shiftKey);
      return;
    }
    // clicked the dimmed backdrop
    if (target === this.panelEl) {
      if (this.cursor) {
        this.game.dropStack(this.cursor);
        this.cursor = null;
        this.updateCursor();
        audio.play('pickup', { pitch: 0.7 });
      } else this.close();
    }
  }

  private slotClick(el: HTMLElement, right: boolean, shift: boolean): void {
    const g = this.game;
    const ref = this.slotRef(el);
    if (!ref) return;
    audio.play('click', { vol: 0.35, pitch: 1.3 });
    // equipment slots
    if (ref.equip) {
      const key = ref.equip;
      const cur = g.p.equip[key];
      if (this.cursor) {
        const def = ITEMS[this.cursor.id];
        const want = EQUIP_SLOTS.find((s) => s.key === key)?.slot;
        if (!def || equipSlotOf(def) !== want) return;
        const other = key === 'charm1' ? g.p.equip.charm2 : key === 'charm2' ? g.p.equip.charm1 : null;
        if (other && other.id === this.cursor.id) return;
        g.p.equip[key] = this.cursor;
        this.cursor = cur;
        g.afterEquip();
      } else if (cur) {
        if (shift) g.unequip(key);
        else {
          this.cursor = cur;
          g.p.equip[key] = null;
          g.afterEquip();
        }
      }
      this.render();
      return;
    }
    const { arr, i } = ref;
    const s = arr[i];
    if (shift && !this.cursor && s) {
      this.quickMove(arr, i);
      this.render();
      return;
    }
    if (right) {
      if (!this.cursor && s) {
        const half = Math.ceil(s.n / 2);
        this.cursor = { id: s.id, n: half };
        s.n -= half;
        if (s.n <= 0) arr[i] = null;
      } else if (this.cursor && (!s || s.id === this.cursor.id)) {
        const max = ITEMS[this.cursor.id]?.stack ?? 99;
        if (!s) arr[i] = { id: this.cursor.id, n: 1 };
        else if (s.n < max) s.n++;
        else return this.render();
        this.cursor.n--;
        if (this.cursor.n <= 0) this.cursor = null;
      }
      this.render();
      return;
    }
    if (!this.cursor) {
      if (s) {
        this.cursor = s;
        arr[i] = null;
      }
    } else if (!s) {
      arr[i] = this.cursor;
      this.cursor = null;
    } else if (s.id === this.cursor.id) {
      const max = ITEMS[s.id]?.stack ?? 99;
      const k = Math.min(this.cursor.n, max - s.n);
      s.n += k;
      this.cursor.n -= k;
      if (this.cursor.n <= 0) this.cursor = null;
    } else {
      arr[i] = this.cursor;
      this.cursor = s;
    }
    this.render();
  }

  private quickMove(arr: Slot[], i: number): void {
    const g = this.game;
    const s = arr[i];
    if (!s) return;
    const def = ITEMS[s.id];
    const chest = g.openChest >= 0 ? g.p.chests[String(g.openChest)] : null;
    if (arr === g.p.inv) {
      if (chest) {
        const left = give(chest, s.id, s.n);
        if (left === s.n) return;
        if (left > 0) s.n = left;
        else arr[i] = null;
        return;
      }
      if (def && equipSlotOf(def)) {
        g.equip(i);
        return;
      }
      // hotbar <-> pack
      const dest = i < HOTBAR ? g.p.inv.slice(HOTBAR) : g.p.inv.slice(0, HOTBAR);
      const off = i < HOTBAR ? HOTBAR : 0;
      arr[i] = null;
      const left = give(dest, s.id, s.n);
      dest.forEach((d, k) => (g.p.inv[off + k] = d));
      if (left > 0) arr[i] = { id: s.id, n: left };
    } else {
      const left = give(g.p.inv, s.id, s.n);
      if (left > 0) s.n = left;
      else arr[i] = null;
    }
  }

  private updateCursor(): void {
    const box = this.cursorEl.parentElement as HTMLElement;
    if (!this.cursor) {
      box.classList.remove('show');
      return;
    }
    const def = ITEMS[this.cursor.id];
    this.cursorEl.src = def ? iconUrl(def.icon) : '';
    this.cursorN.textContent = this.cursor.n > 1 ? String(this.cursor.n) : '';
    box.classList.add('show');
  }

  private onHover(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const slot = t.closest('.slot') as HTMLElement | null;
    const rc = t.closest('[data-tipitem]') as HTMLElement | null;
    let def: ItemDef | null = null;
    let n = 0;
    if (slot) {
      const ref = this.slotRef(slot);
      const s = ref?.equip ? this.game.p.equip[ref.equip] : ref ? ref.arr[ref.i] : null;
      if (s) {
        def = ITEMS[s.id] ?? null;
        n = s.n;
      }
    } else if (rc) def = ITEMS[rc.dataset.tipitem ?? ''] ?? null;
    if (!def) {
      this.tipEl.classList.remove('show');
      return;
    }
    const stats: string[] = [];
    if (def.kind === 'pick') stats.push(`Pick tier ${def.tier} · power ${def.power}`);
    if (def.kind === 'sword') stats.push(`${def.dmg} damage`);
    if (def.kind === 'bow') stats.push(`${def.dmg} damage + arrows`);
    if (def.kind === 'food') stats.push(`+${def.food} food${def.heal ? `, +${def.heal} health` : ''}`);
    if (def.kind === 'lantern') stats.push(`Light ${def.radius} · ${def.oil}s of oil`);
    if (def.kind === 'rod') stats.push(def.rod && def.rod > 1 ? `Bites ${Math.round((def.rod - 1) * 100)}% sooner, wider catch zone` : 'Catches pond and pool fish');
    if (LUMEN[def.id]) stats.push(`Feeds the Wick: ${LUMEN[def.id]} Lumen`);
    if (def.value > 0 && sellable(def) && itemValue(def.id, this.game.st) > 0) stats.push(`Sells for ${itemValue(def.id, this.game.st)}c`);
    const slotName = equipSlotOf(def);
    this.tipEl.innerHTML = `<b>${esc(def.name)}${n > 1 ? ` ×${n}` : ''}</b>${stats.length ? `<em>${stats.join(' · ')}</em>` : ''}<small>${esc(def.desc)}</small>${slotName ? '<small class="dim">Shift-click to equip</small>' : ''}`;
    this.tipEl.classList.add('show');
  }

  // ------------------------------------------------------------------ buttons
  private action(t: HTMLElement, shift: boolean): void {
    const g = this.game;
    const a = t.dataset.a;
    audio.play('click', { vol: 0.6 });
    switch (a) {
      case 'close':
        this.close();
        return;
      case 'showall':
        this.showAll = !this.showAll;
        break;
      case 'craft':
      case 'craft5': {
        const r = RECIPES[Number(t.dataset.r)];
        if (r) {
          const made = g.craft(r, a === 'craft5' || shift ? 5 : 1);
          if (made) this.toast(`Crafted ${ITEMS[r.out].name}${made * r.n > 1 ? ` ×${made * r.n}` : ''}`, '#9af0a0');
        }
        break;
      }
      case 'stashall': {
        const chest = g.p.chests[String(g.openChest)];
        if (chest)
          for (let i = HOTBAR; i < INV_SIZE; i++) {
            const s = g.p.inv[i];
            if (!s) continue;
            const left = give(chest, s.id, s.n);
            if (left > 0) s.n = left;
            else g.p.inv[i] = null;
          }
        break;
      }
      case 'takeall': {
        const chest = g.p.chests[String(g.openChest)];
        if (chest)
          for (let i = 0; i < chest.length; i++) {
            const s = chest[i];
            if (!s) continue;
            const left = give(g.p.inv, s.id, s.n);
            if (left > 0) s.n = left;
            else chest[i] = null;
          }
        break;
      }
      case 'tab':
        this.tab = t.dataset.v ?? 'sell';
        break;
      case 'atab':
        this.archiveTab = t.dataset.v ?? 'relics';
        break;
      case 'sell':
        g.sellSlot(Number(t.dataset.i), Number(t.dataset.n));
        break;
      case 'sellall': {
        const total = g.sellAllMaterials();
        if (total) this.toast(`Sold for ${fmt(total)} coins.`, '#ffd75a');
        break;
      }
      case 'buy': {
        const it = g.shopStock()[Number(t.dataset.k)];
        if (it) g.buy(it.id, it.price * it.n, it.n);
        break;
      }
      case 'sharpen':
      case 'hone':
        g.sharpen(a);
        break;
      case 'brew': {
        const id = t.dataset.id ?? '';
        if (g.brew(id)) this.toast(`Hesper brews you a ${ITEMS[id]?.name ?? id}.`, '#c8f0a0');
        break;
      }
      case 'cat': {
        const id = t.dataset.id ?? '';
        g.catalogue(id);
        const r = RELICS.find((x) => x.id === id);
        if (r) this.toast(`${r.name} catalogued: ${r.bonus}`, '#ffd75a');
        break;
      }
      case 'turnin':
        g.turnIn(Number(t.dataset.i));
        this.toast('Bounty complete!', '#9af0a0');
        break;
      case 'reroll':
        g.rerollBounty(Number(t.dataset.i));
        break;
      case 'kindle':
        g.kindleWick();
        break;
      case 'offer':
        g.offerLumen(t.dataset.id ?? '');
        break;
      case 'offerall':
        g.offerLumen();
        break;
      case 'travel': {
        const x = t.dataset.x;
        g.travelTo(x === undefined ? null : { x: Number(x), y: Number(t.dataset.y) });
        return;
      }
      case 'pref': {
        const id = t.dataset.id;
        if (id === 'shake') prefs.shake = !prefs.shake;
        else if (id === 'hints') prefs.hints = !prefs.hints;
        else if (id === 'captions') {
          prefs.captions = !prefs.captions;
          if (!prefs.captions) this.clearCaptions();
        }
        this.onPrefs?.();
        break;
      }
      case 'hudsize': {
        const i = HUD_SIZES.indexOf(prefs.hud);
        prefs.hud = HUD_SIZES[(i + 1) % HUD_SIZES.length];
        this.onPrefs?.();
        break;
      }
      case 'fullscreen':
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void document.documentElement.requestFullscreen().catch(() => undefined);
        setTimeout(() => this.panel === 'pause' && this.render(), 300);
        break;
      case 'mode': {
        const id = (t.dataset.id ?? '') as ModeId;
        if (MODES[id] && g.p.mode !== id) {
          g.p.mode = id;
          this.toast(`Difficulty: ${MODES[id].name}`, '#e8d8ff');
        }
        break;
      }
      case 'journal':
        this.open('journal');
        return;
      case 'save':
        g.onSave?.();
        this.toast('Game saved.', '#9af0a0');
        break;
      case 'quit':
        this.close();
        this.onQuit?.();
        return;
    }
    this.render();
  }

  bindSettings(): void {
    this.panelEl.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const which = el.dataset.set;
      if (!which) return;
      const v = Number(el.value) / 100;
      const music = which === 'music' ? v : audio.musicVolume;
      const sfx = which === 'sfx' ? v : audio.sfxVolume;
      this.onSettings?.(music, sfx);
    });
  }
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
