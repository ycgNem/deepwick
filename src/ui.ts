import type { Game, UIHooks } from './game';
import { iconUrl, makeCanvas } from './assets';
import { ITEMS, CONSUMABLES, ConsumableId, SHOP_PRICES, STACK_MAX, RELICS, UI_ICON, IconRef } from './data/items';
import { PICKS, LANTERNS, PACKS, BOOTS, ARMORS, CHARMS, Tier, Cost, sharpenCost, SHARPEN_MAX } from './data/upgrades';
import { BIOMES, biomeAt, LIFT_ROWS, LIFT_NAMES } from './data/biomes';
import { BLOCKS, B } from './data/blocks';
import { ENEMIES } from './data/enemies';
import { SkillId, xpToNext, packCount, owned, canAfford, itemValue, MAX_LEVEL } from './state';
import { TILE, SURFACE_Y, WORLD_W, WORLD_H, CAMP_X0, CAMP_X1 } from './constants';
import { Obj } from './world/world';
import { audio } from './audio';

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

const SKILL_INFO: Record<SkillId, { name: string; color: string; perk: (l: number) => string }> = {
  mining: { name: 'Mining', color: '#e0a050', perk: (l) => `+${(l - 1) * 2}% mining speed, +${((l - 1) * 0.6).toFixed(1)}% double ore` },
  combat: { name: 'Combat', color: '#e05a5a', perk: (l) => `+${(l - 1) * 3}% damage, +${(l - 1) * 2} max health` },
  delving: { name: 'Delving', color: '#5ab0e0', perk: (l) => `+${l - 1}% sell prices, +${l - 1}% oil efficiency` },
};

type Panel = 'shop' | 'forge' | 'archive' | 'lift' | 'char' | 'map' | 'pause' | 'victory' | null;

export class UI implements UIHooks {
  game!: Game;
  panel: Panel = null;
  private tab = 'sell';
  private archiveTab = 'relics';
  private hudEls: Record<string, HTMLElement> = {};
  private toasts: HTMLElement;
  private panelEl: HTMLElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  mapCanvas: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private mapImg: ImageData;
  private hudT = 0;
  onQuit: (() => void) | null = null;
  onSettings: ((music: number, sfx: number) => void) | null = null;

  constructor() {
    this.toasts = $('#toasts');
    this.panelEl = $('#panel');
    this.mini = $<HTMLCanvasElement>('#minimap');
    const mc = this.mini.getContext('2d');
    if (!mc) throw new Error('ctx');
    this.miniCtx = mc;
    [this.mapCanvas, this.mapCtx] = makeCanvas(WORLD_W, WORLD_H);
    this.mapImg = this.mapCtx.createImageData(WORLD_W, WORLD_H);
    for (const k of ['hpFill', 'hpText', 'oilFill', 'oilText', 'coins', 'pack', 'depth', 'biome', 'hotbar', 'skills', 'bossBar', 'bossFill']) {
      this.hudEls[k] = $('#' + k);
    }
    this.panelEl.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  attach(game: Game): void {
    this.game = game;
    for (const el of document.querySelectorAll<HTMLImageElement>('img[data-icon]')) {
      const key = el.dataset.icon as keyof typeof UI_ICON;
      if (UI_ICON[key]) el.src = iconUrl(UI_ICON[key]);
    }
    this.rebuildMap();
    this.buildHotbar();
  }

  // ------------------------------------------------------------------ hooks
  toast(msg: string, color = '#ffffff'): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.color = color;
    el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 5000);
  }

  isOpen(): boolean {
    return this.panel !== null;
  }

  levelUp(skill: SkillId, lvl: number): void {
    const info = SKILL_INFO[skill];
    this.toast(`${info.name} reached level ${lvl}! ${info.perk(lvl)}`, info.color);
  }

  victory(): void {
    this.open('victory');
  }

  open(panel: string): void {
    this.panel = panel as Panel;
    if (panel === 'shop') this.tab = 'sell';
    this.game.input.blocked = true;
    this.panelEl.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.panel = null;
    this.game.input.blocked = false;
    this.panelEl.classList.add('hidden');
    this.panelEl.innerHTML = '';
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.game || document.getElementById('title')?.classList.contains('show')) return;
    if (e.code === 'Escape') {
      if (this.panel && this.panel !== 'victory') this.close();
      else if (!this.panel) this.open('pause');
      e.preventDefault();
    } else if (e.code === 'Tab' || e.code === 'KeyI') {
      e.preventDefault();
      if (this.panel === 'char') this.close();
      else if (!this.panel) this.open('char');
    } else if (e.code === 'KeyM') {
      if (this.panel === 'map') this.close();
      else if (!this.panel) this.open('map');
    } else if (e.code === 'KeyE' && this.panel && this.panel !== 'pause' && this.panel !== 'victory') {
      this.close();
    }
  }

  // ------------------------------------------------------------------ HUD
  update(dt: number): void {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const g = this.game;
    const pl = g.player;
    const st = g.st;
    const h = this.hudEls;
    h.hpFill.style.width = `${(Math.max(0, pl.hp) / st.maxHp) * 100}%`;
    h.hpText.textContent = `${Math.ceil(Math.max(0, pl.hp))} / ${st.maxHp}`;
    const of = pl.oil / st.oilMax;
    h.oilFill.style.width = `${of * 100}%`;
    h.oilFill.classList.toggle('low', of < 0.2);
    h.oilText.textContent = pl.oil > 0 ? `${Math.ceil(pl.oil)}s` : 'EMPTY';
    h.coins.textContent = fmt(g.p.coins);
    const pc = packCount(g.p);
    h.pack.textContent = `${pc} / ${st.packCap}`;
    h.pack.parentElement?.classList.toggle('full', pc >= st.packCap);
    const pt = g.playerTile();
    const depth = g.depthOf(pt.y);
    h.depth.textContent = pt.y <= SURFACE_Y ? 'Surface' : `${depth}m`;
    h.biome.textContent = pt.y <= SURFACE_Y + 1 && pt.x >= CAMP_X0 && pt.x <= CAMP_X1 ? 'Deepwick Camp' : biomeAt(pt.y).name;
    // hotbar
    const slots = h.hotbar.children;
    for (let i = 0; i < CONSUMABLES.length; i++) {
      const s = slots[i] as HTMLElement;
      s.classList.toggle('sel', i === g.p.hotbar);
      const c = s.querySelector('.n');
      if (c) c.textContent = String(g.p.cons[CONSUMABLES[i]]);
      s.classList.toggle('empty', g.p.cons[CONSUMABLES[i]] <= 0);
    }
    // skills
    let sk = '';
    for (const id of ['mining', 'combat', 'delving'] as SkillId[]) {
      const s = g.p.skills[id];
      const frac = s.lvl >= MAX_LEVEL ? 1 : s.xp / xpToNext(s.lvl);
      sk += `<div class="sk"><b style="color:${SKILL_INFO[id].color}">${SKILL_INFO[id].name} ${s.lvl}</b><i><u style="width:${frac * 100}%;background:${SKILL_INFO[id].color}"></u></i></div>`;
    }
    h.skills.innerHTML = sk;
    // boss
    const bossOn = !!g.boss && !g.boss.dead;
    h.bossBar.classList.toggle('show', bossOn);
    if (bossOn) h.bossFill.style.width = `${g.bossHpFrac() * 100}%`;
    this.drawMinimap();
  }

  private buildHotbar(): void {
    const keys = ['1', '2', '3', '4', '5', '6'];
    this.hudEls.hotbar.innerHTML = CONSUMABLES.map(
      (id, i) => `<div class="slot" data-slot="${i}" title="${ITEMS[id].name}: ${ITEMS[id].desc}"><span class="k">${keys[i]}</span>${img(ITEMS[id].icon)}<span class="n"></span></div>`,
    ).join('');
    this.hudEls.hotbar.addEventListener('click', (e) => {
      const s = (e.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
      if (s) this.game.p.hotbar = Number(s.dataset.slot);
    });
  }

  // ------------------------------------------------------------------ maps
  private tileColor(x: number, y: number): [number, number, number, number] {
    const w = this.game.world;
    const i = y * w.w + x;
    if (y < w.surface[x] && w.fg[i] === B.AIR) return [0, 0, 0, 0];
    if (!w.explored[i]) return [0, 0, 0, 0];
    const fg = w.fg[i];
    if (fg !== B.AIR) {
      const c = hexRgb(BLOCKS[fg].color);
      return BLOCKS[fg].ore ? [c[0], c[1], c[2], 255] : [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75, 255];
    }
    const o = w.obj[i];
    if (o === Obj.TORCH) return [255, 200, 90, 255];
    if (o === Obj.LADDER) return [150, 100, 60, 255];
    if (o === Obj.LIFT) return [120, 255, 160, 255];
    return [26, 22, 34, 255];
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
      const x = i % WORLD_W;
      const y = Math.floor(i / WORLD_W);
      const c = this.tileColor(x, y);
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
    ctx.fillStyle = '#07060b';
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
    for (let s = 1; s < LIFT_ROWS.length; s++) {
      if (!p.lifts[s] && !g.world.explored[LIFT_ROWS[s] * WORLD_W + 56]) continue;
      ctx.fillStyle = p.lifts[s] ? '#7aff9a' : '#7a8a7a';
      ctx.fillRect(mx(56) - z, my(LIFT_ROWS[s]) - z, z * 3, z * 3);
    }
    if (p.satchel) {
      ctx.fillStyle = '#9af0a0';
      const sx = p.satchel.x / TILE;
      const sy = p.satchel.y / TILE;
      ctx.fillRect(mx(sx) - z, my(sy) - z, z * 3, z * 3);
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
    const g = this.game;
    let html = '';
    switch (this.panel) {
      case 'shop':
        html = this.shopHtml();
        break;
      case 'forge':
        html = this.forgeHtml();
        break;
      case 'archive':
        html = this.archiveHtml();
        break;
      case 'lift':
        html = this.liftHtml();
        break;
      case 'char':
        html = this.charHtml();
        break;
      case 'map':
        html = this.mapHtml();
        break;
      case 'pause':
        html = this.pauseHtml();
        break;
      case 'victory':
        html = this.victoryHtml();
        break;
      default:
        return;
    }
    this.panelEl.innerHTML = `<div class="win ${this.panel}">${html}<button class="x" data-a="close" title="Close (Esc)">✕</button></div>`;
    if (this.panel === 'map') this.paintBigMap();
    void g;
  }

  private header(title: string, who: string, line: string, portrait?: string): string {
    return `<div class="hd">${portrait ? `<img class="portrait" src="./assets/camp/${portrait}.png" alt="">` : ''}<div><h2>${title}</h2><div class="who">${who}</div><p class="line">“${line}”</p></div><div class="purse">${img(UI_ICON.coin)} ${fmt(this.game.p.coins)}</div></div>`;
  }

  private costHtml(cost: Cost): string {
    const p = this.game.p;
    let s = `<span class="cost ${p.coins >= cost.coins ? 'ok' : 'no'}">${img(UI_ICON.coin)}${fmt(cost.coins)}</span>`;
    for (const [id, n] of Object.entries(cost.items)) {
      const have = owned(p, id);
      s += `<span class="cost ${have >= n ? 'ok' : 'no'}" title="${ITEMS[id].name}">${img(ITEMS[id].icon)}${Math.min(have, n)}/${n}</span>`;
    }
    return s;
  }

  private shopHtml(): string {
    const g = this.game;
    const p = g.p;
    const lines = ['Fresh oil, sturdy ladders, fair prices. Mostly fair.', 'Bring me shiny things and I make you less poor.', 'The deeper the rock, the better the price.'];
    let html = this.header('Pell\'s Provisions', 'Old Pell, merchant', lines[Math.floor(g.time / 20) % lines.length], 'npc_merchant');
    html += `<div class="tabs"><button class="${this.tab === 'sell' ? 'on' : ''}" data-a="tab" data-v="sell">Sell finds</button><button class="${this.tab === 'buy' ? 'on' : ''}" data-a="tab" data-v="buy">Buy supplies</button></div>`;
    if (this.tab === 'sell') {
      const entries = Object.entries(p.stash).filter(([id]) => ITEMS[id] && ITEMS[id].kind !== 'relic');
      entries.sort((a, b) => ITEMS[b[0]].value - ITEMS[a[0]].value);
      let total = 0;
      for (const [id, n] of entries) if (ITEMS[id].kind !== 'consumable') total += itemValue(id, g.st) * Math.max(0, n - g.reservedFor(id));
      html += `<div class="row-actions"><button class="big" data-a="sellall" ${total ? '' : 'disabled'}>Sell everything (${fmt(total)}c)</button><span class="hint">Items a bounty needs are kept back.</span></div>`;
      if (!entries.length) html += `<p class="empty-note">Your stash is empty. Mine ore and it will be unloaded here when you return to camp.</p>`;
      html += '<div class="list">';
      for (const [id, n] of entries) {
        const def = ITEMS[id];
        const v = itemValue(id, g.st);
        const res = g.reservedFor(id);
        html += `<div class="li">${img(def.icon)}<div class="nm"><b>${def.name}</b> <span class="dim">×${n}${res ? ` · bounty needs ${res}` : ''}</span><small>${def.desc}</small></div><div class="pr">${v}c ea</div><button data-a="sell" data-id="${id}" data-n="1">Sell 1</button><button data-a="sell" data-id="${id}" data-n="${n}">All (${fmt(v * n)}c)</button></div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="list">';
      for (const id of CONSUMABLES) {
        const def = ITEMS[id];
        const price = SHOP_PRICES[id];
        const have = p.cons[id];
        const max = STACK_MAX[id];
        const can5 = Math.min(5, max - have);
        html += `<div class="li">${img(def.icon)}<div class="nm"><b>${def.name}</b> <span class="dim">${have}/${max}</span><small>${def.desc}</small></div><div class="pr">${price}c</div><button data-a="buy" data-id="${id}" data-n="1" ${p.coins >= price && have < max ? '' : 'disabled'}>Buy 1</button><button data-a="buy" data-id="${id}" data-n="${can5}" ${can5 > 0 && p.coins >= price * can5 ? '' : 'disabled'}>Buy ${Math.max(1, can5)}</button></div>`;
      }
      html += '</div>';
    }
    return html;
  }

  private upgradeCard(track: string, title: string, table: Tier[], level: number, statLine: (t: Tier) => string): string {
    const cur = table[level];
    const next = table[level + 1];
    const g = this.game;
    let s = `<div class="card"><div class="ct">${img(cur.icon, 'ic big')}<div><h3>${title}</h3><b>${cur.name}</b><small>${statLine(cur)}</small></div></div>`;
    if (next) {
      const ok = canAfford(g.p, next.cost);
      s += `<div class="next"><div class="arrow">Next: ${img(next.icon)} <b>${next.name}</b></div><small>${next.desc}</small><div class="costs">${this.costHtml(next.cost)}</div><button data-a="up" data-t="${track}" ${ok ? '' : 'disabled'}>Forge</button></div>`;
    } else s += `<div class="next maxed">Fully upgraded</div>`;
    return s + '</div>';
  }

  private forgeHtml(): string {
    const g = this.game;
    const up = g.p.up;
    let html = this.header('Brannoc\'s Forge', 'Brannoc Ashgrip, smith', 'Rock only respects two things. A sharper pick, and a stubborn miner.', 'npc_smith');
    html += '<div class="cards">';
    html += this.upgradeCard('pick', 'Pickaxe', PICKS, up.pick, (t) => {
      const pk = t as (typeof PICKS)[number];
      return `Tier ${pk.tier} · power ${pk.dmg}`;
    });
    html += this.upgradeCard('lantern', 'Lantern', LANTERNS, up.lantern, (t) => {
      const l = t as (typeof LANTERNS)[number];
      return `Light ${l.radius} · oil ${l.oil}s`;
    });
    html += this.upgradeCard('pack', 'Pack', PACKS, up.pack, (t) => `Holds ${(t as (typeof PACKS)[number]).cap}`);
    html += this.upgradeCard('boots', 'Boots', BOOTS, up.boots, (t) => {
      const b = t as (typeof BOOTS)[number];
      return `${b.jumps} jump${b.jumps > 1 ? 's' : ''} · speed ×${b.speed}`;
    });
    html += this.upgradeCard('armor', 'Armor', ARMORS, up.armor, (t) => {
      const a = t as (typeof ARMORS)[number];
      return `${a.hp} health · -${Math.round(a.reduce * 100)}% damage`;
    });
    // sharpen
    const sc = sharpenCost(up.sharpen);
    html += `<div class="card"><div class="ct">${img(UI_ICON.anvil, 'ic big')}<div><h3>Whetstone</h3><b>Sharpness ${up.sharpen}/${SHARPEN_MAX}</b><small>+8% pick power per level (mining & combat)</small></div></div>`;
    html +=
      up.sharpen < SHARPEN_MAX
        ? `<div class="next"><div class="costs">${this.costHtml({ coins: sc, items: {} })}</div><button data-a="sharpen" ${g.p.coins >= sc ? '' : 'disabled'}>Sharpen</button></div>`
        : `<div class="next maxed">Razor sharp</div>`;
    html += '</div>';
    for (const k of ['ember', 'lens'] as const) {
      const c = CHARMS[k];
      const ownedIt = up[k];
      html += `<div class="card charm"><div class="ct">${img(c.icon, 'ic big')}<div><h3>${k === 'ember' ? 'Heat Ward' : 'Light Ward'}</h3><b>${c.name}</b><small>${c.desc}</small></div></div>`;
      html += ownedIt
        ? `<div class="next maxed">Equipped</div>`
        : `<div class="next"><div class="costs">${this.costHtml(c.cost)}</div><button data-a="charm" data-k="${k}" ${canAfford(g.p, c.cost) ? '' : 'disabled'}>Forge</button></div>`;
      html += '</div>';
    }
    html += '</div><p class="hint">Materials come from your camp stash (and anything still in your pack).</p>';
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
        const inStash = (p.stash[r.id] ?? 0) > 0;
        const where = r.biome < 5 ? BIOMES[r.biome].name : 'The Heart Chamber';
        if (done) html += `<div class="relic done">${img(r.icon, 'ic big')}<b>${r.name}</b><small class="bonus">${r.bonus}</small><small>${r.desc}</small></div>`;
        else if (inStash)
          html += `<div class="relic ready">${img(r.icon, 'ic big')}<b>${r.name}</b><small class="bonus">${r.bonus}</small><button data-a="cat" data-id="${r.id}">Catalogue</button></div>`;
        else html += `<div class="relic unknown">${img(r.icon, 'ic big shadow')}<b>???</b><small>Somewhere in ${where}</small></div>`;
      }
      html += '</div><p class="hint">Relics drop from Fossil Beds and glowing Relic Stones, and sometimes from chests.</p>';
    } else if (this.archiveTab === 'bounties') {
      html += '<div class="bounties">';
      p.bounties.forEach((b, i) => {
        const ready = g.bountyReady(b);
        let prog = '';
        if (b.kind === 'deliver') prog = `${Math.min(owned(p, b.target), b.need)}/${b.need}`;
        else if (b.kind === 'depth') prog = `${Math.min(p.maxDepth, b.need)}m/${b.need}m`;
        else prog = `${b.have}/${b.need}`;
        const icon =
          b.kind === 'deliver' ? ITEMS[b.target].icon : b.kind === 'slay' ? UI_ICON.skull : b.kind === 'chests' ? UI_ICON.chest : UI_ICON.compass;
        const reroll = 25 + g.maxBiome() * 25;
        html += `<div class="bounty ${ready ? 'ready' : ''}">${img(icon, 'ic big')}<div class="bt"><b>${b.text}</b><small>Progress: ${prog}${b.kind === 'slay' ? ` · found in ${BIOMES.find((bm) => bm.enemies.includes(b.target))?.name ?? 'the deep'}` : ''}</small><small class="rw">${img(UI_ICON.coin)}${fmt(b.reward)} · ${img(UI_ICON.star)}${b.xp} Delving XP</small></div><button data-a="turnin" data-i="${i}" ${ready ? '' : 'disabled'}>Turn in</button><button class="ghost" data-a="reroll" data-i="${i}" ${p.coins >= reroll ? '' : 'disabled'} title="Swap for a new bounty">↻ ${reroll}c</button></div>`;
      });
      html += `</div><p class="hint">Bounties completed: ${p.bountiesDone}. New ones are posted as soon as you finish one.</p>`;
    } else {
      const s = p.stats;
      const mins = Math.floor(s.time / 60);
      html += `<div class="log"><div><span>Time underground</span><b>${Math.floor(mins / 60)}h ${mins % 60}m</b></div><div><span>Deepest point</span><b>${p.maxDepth}m</b></div><div><span>Blocks mined</span><b>${fmt(s.mined)}</b></div><div><span>Ore & gems</span><b>${fmt(s.ores)}</b></div><div><span>Creatures defeated</span><b>${fmt(s.kills)}</b></div><div><span>Chests opened</span><b>${s.chests}</b></div><div><span>Coins earned</span><b>${fmt(s.earned)}</b></div><div><span>Blackouts</span><b>${s.deaths}</b></div><div><span>Lifts restored</span><b>${p.lifts.filter(Boolean).length - 1}/4</b></div><div><span>Gloamheart</span><b>${p.bossDefeated ? 'Stilled' : 'Beating'}</b></div></div>`;
      html += '<h3 class="sub">Bestiary</h3><div class="bestiary">';
      for (const e of Object.values(ENEMIES)) {
        const bm = BIOMES.find((b) => b.enemies.includes(e.id));
        const known = !!p.seen['kill_' + e.id];
        html += `<div class="beast ${known ? '' : 'unknown'}"><div class="sprite" style="background-image:url(./assets/enemies/${e.id}.png);background-position:-${e.size}px 0;width:${e.size}px;height:${e.size}px"></div><b>${known ? e.name : '???'}</b><small>${bm?.name ?? ''}${known ? ` · ${e.hp} hp · drops ${ITEMS[e.drop].name}` : ' · not yet defeated'}</small></div>`;
      }
      html += '</div>';
    }
    return html;
  }

  private liftHtml(): string {
    const g = this.game;
    let html = `<div class="hd"><div><h2>The Old Lift</h2><p class="line">The cable groans, but it holds. Choose a station.</p></div></div><div class="list">`;
    const cur = g.playerTile().y;
    LIFT_NAMES.forEach((name, s) => {
      const on = g.p.lifts[s];
      const depth = s === 0 ? 'Surface' : `${LIFT_ROWS[s] - SURFACE_Y}m`;
      const here = Math.abs(LIFT_ROWS[s] - cur) < 3;
      html += `<div class="li ${on ? '' : 'locked'}">${img(on ? UI_ICON.lantern : UI_ICON.skull)}<div class="nm"><b>${name}</b><small>${depth} · ${s === 0 ? 'Home' : BIOMES[s].name}${on ? '' : ' — not yet restored'}</small></div><button data-a="travel" data-s="${s}" ${on && !here ? '' : 'disabled'}>${here ? 'You are here' : on ? 'Travel' : 'Locked'}</button></div>`;
    });
    html += '</div><p class="hint">Find and repair the old lift stations near the central shaft at the top of each region.</p>';
    return html;
  }

  private charHtml(): string {
    const g = this.game;
    const p = g.p;
    const st = g.st;
    let html = `<div class="hd"><div><h2>Delver</h2><p class="line">${PICKS[p.up.pick].name} · ${LANTERNS[p.up.lantern].name} · ${ARMORS[p.up.armor].name}</p></div><div class="purse">${img(UI_ICON.coin)} ${fmt(p.coins)}</div></div>`;
    html += '<div class="skills">';
    for (const id of ['mining', 'combat', 'delving'] as SkillId[]) {
      const s = p.skills[id];
      const need = xpToNext(s.lvl);
      const frac = s.lvl >= MAX_LEVEL ? 1 : s.xp / need;
      html += `<div class="skill"><b style="color:${SKILL_INFO[id].color}">${SKILL_INFO[id].name} — level ${s.lvl}</b><i><u style="width:${frac * 100}%;background:${SKILL_INFO[id].color}"></u></i><small>${s.lvl >= MAX_LEVEL ? 'Mastered' : `${fmt(s.xp)} / ${fmt(need)} XP`} · ${SKILL_INFO[id].perk(s.lvl)}</small></div>`;
    }
    html += '</div>';
    html += `<div class="statgrid"><div>Health<b>${st.maxHp}</b></div><div>Damage cut<b>${Math.round(st.reduce * 100)}%</b></div><div>Pick tier<b>${st.pickTier}</b></div><div>Pick power<b>${st.pickDmg.toFixed(1)}</b></div><div>Attack<b>${st.attack.toFixed(0)}</b></div><div>Light radius<b>${st.light}</b></div><div>Oil tank<b>${Math.round(st.oilMax)}s</b></div><div>Jumps<b>${st.jumps}</b></div><div>Reach<b>${st.reach.toFixed(1)}</b></div><div>Sell bonus<b>+${Math.round((st.sellMult - 1) * 100)}%</b></div></div>`;
    const pc = packCount(p);
    html += `<h3 class="sub">Pack (${pc}/${st.packCap})</h3><div class="inv">`;
    const ents = Object.entries(p.pack);
    if (!ents.length) html += '<p class="empty-note">Empty.</p>';
    for (const [id, n] of ents) html += `<div class="it" title="${ITEMS[id]?.name}">${img(ITEMS[id].icon)}<span>${n}</span></div>`;
    html += '</div>';
    const sEnts = Object.entries(p.stash);
    html += `<h3 class="sub">Camp stash</h3><div class="inv">`;
    if (!sEnts.length) html += '<p class="empty-note">Empty.</p>';
    for (const [id, n] of sEnts) html += `<div class="it" title="${ITEMS[id]?.name}">${img(ITEMS[id].icon)}<span>${n}</span></div>`;
    html += '</div>';
    const rel = p.catalogued.map((id) => RELICS.find((r) => r.id === id)).filter((r) => r);
    if (rel.length) html += `<h3 class="sub">Relic blessings</h3><ul class="bless">${rel.map((r) => `<li>${img(r!.icon)} ${r!.name}: <b>${r!.bonus}</b></li>`).join('')}</ul>`;
    return html;
  }

  private mapHtml(): string {
    return `<div class="hd"><div><h2>Survey Map</h2><p class="line">Everything your lantern has touched.</p></div></div><canvas id="bigmap"></canvas><div class="legend"><span><i style="background:#fff"></i>You</span><span><i style="background:#7aff9a"></i>Lift</span><span><i style="background:#9af0a0"></i>Lost satchel</span><span><i style="background:#ffc85a"></i>Torch</span>${BIOMES.slice(0, 5).map((b) => `<span class="dim">${b.name}: ${b.top - SURFACE_Y}m</span>`).join('')}</div>`;
  }

  private paintBigMap(): void {
    this.flushDirty();
    const c = this.panelEl.querySelector<HTMLCanvasElement>('#bigmap');
    if (!c) return;
    const g = this.game;
    const maxH = Math.min(window.innerHeight * 0.66, 620);
    const z = 3;
    const viewH = Math.floor(maxH / z);
    c.width = WORLD_W * z;
    c.height = viewH * z;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const pt = g.playerTile();
    const vy = Math.max(0, Math.min(WORLD_H - viewH, pt.y - viewH / 2));
    ctx.fillStyle = '#07060b';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.mapCanvas, 0, vy, WORLD_W, viewH, 0, 0, WORLD_W * z, viewH * z);
    // biome lines
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const b of BIOMES) {
      const y = (b.top - vy) * z;
      if (y > 0 && y < c.height) ctx.fillRect(0, y, c.width, 1);
    }
    this.drawMarkers(ctx, (x) => x * z, (y) => (y - vy) * z, z, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pt.x * z - 2, (pt.y - vy) * z - 4, 5, 8);
  }

  private pauseHtml(): string {
    const m = Math.round(audio.musicVolume * 100);
    const s = Math.round(audio.sfxVolume * 100);
    return `<div class="hd"><div><h2>Paused</h2><p class="line">The mountain will wait.</p></div></div>
      <div class="settings"><label>Music <input type="range" min="0" max="100" value="${m}" data-set="music"></label><label>Sound <input type="range" min="0" max="100" value="${s}" data-set="sfx"></label></div>
      <div class="controls"><h3 class="sub">Controls</h3>
      <div><kbd>A</kbd><kbd>D</kbd> move · <kbd>Space</kbd> jump · <kbd>W</kbd><kbd>S</kbd> climb ladders, <kbd>S</kbd> drops through ladder tops</div>
      <div><kbd>Left mouse</kbd> hold to mine the outlined block, or swing at creatures</div>
      <div><kbd>Right mouse</kbd> / <kbd>Q</kbd> place or use the selected item · <kbd>1</kbd>–<kbd>6</kbd> or wheel to select</div>
      <div><kbd>E</kbd> talk / open / ride · <kbd>F</kbd> lamp oil · <kbd>H</kbd> tonic · <kbd>R</kbd> recall to camp</div>
      <div><kbd>Tab</kbd> character · <kbd>M</kbd> map · <kbd>Esc</kbd> pause</div></div>
      <div class="row-actions"><button class="big" data-a="close">Resume</button><button data-a="save">Save now</button><button class="ghost" data-a="quit">Save & quit to title</button></div>`;
  }

  private victoryHtml(): string {
    const p = this.game.p;
    const mins = Math.floor(p.stats.time / 60);
    return `<div class="victory-inner"><h1>The Gloamheart is stilled</h1><p>Light pours back up the old shafts. Every lantern in Deepwick flares at once, and for the first time in a hundred years the mountain is quiet.</p>
    <div class="log"><div><span>Time</span><b>${Math.floor(mins / 60)}h ${mins % 60}m</b></div><div><span>Blocks mined</span><b>${fmt(p.stats.mined)}</b></div><div><span>Creatures defeated</span><b>${fmt(p.stats.kills)}</b></div><div><span>Relics catalogued</span><b>${p.catalogued.length}/${RELICS.length}</b></div><div><span>Blackouts</span><b>${p.stats.deaths}</b></div></div>
    <p class="dim">Pick up the Heart of Deepwick and bring it to Wren. The deep is still full of ore, relics and bounties — keep delving as long as you like.</p>
    <div class="row-actions"><button class="big" data-a="close">Keep delving</button></div></div>`;
  }

  // ------------------------------------------------------------------ clicks
  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) {
      if (e.target === this.panelEl) this.close();
      return;
    }
    const g = this.game;
    const a = t.dataset.a;
    audio.play('click', { vol: 0.6 });
    switch (a) {
      case 'close':
        this.close();
        return;
      case 'tab':
        this.tab = t.dataset.v ?? 'sell';
        break;
      case 'atab':
        this.archiveTab = t.dataset.v ?? 'relics';
        break;
      case 'sell':
        g.sell(t.dataset.id ?? '', Number(t.dataset.n));
        break;
      case 'sellall': {
        let total = 0;
        for (const [id, n] of Object.entries(g.p.stash)) {
          const def = ITEMS[id];
          if (!def || def.kind === 'relic' || def.kind === 'consumable') continue;
          const keep = Math.min(n, g.reservedFor(id));
          if (n - keep > 0) {
            total += itemValue(id, g.st) * (n - keep);
            g.sell(id, n - keep);
          }
        }
        if (total) this.toast(`Sold for ${fmt(total)} coins.`, '#ffd75a');
        break;
      }
      case 'buy':
        g.buy(t.dataset.id as ConsumableId, Number(t.dataset.n));
        break;
      case 'up':
        if (g.upgrade(t.dataset.t as 'pick')) this.toast('Brannoc hands it over, still warm from the forge.', '#ffd75a');
        break;
      case 'sharpen':
        g.sharpen();
        break;
      case 'charm':
        g.buyCharm(t.dataset.k as 'ember' | 'lens');
        break;
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
      case 'travel':
        this.close();
        g.travel(Number(t.dataset.s));
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
