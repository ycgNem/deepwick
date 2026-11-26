import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/silkscreen/400.css';
import './style.css';
import { loadAssets } from './assets';
import { audio } from './audio';
import { Input } from './input';
import { UI } from './ui';
import { Game } from './game';
import { Renderer } from './render';
import { newProgress } from './state';
import { generateWorld, worldSpawn } from './world/gen';
import { BIOMES } from './data/biomes';
import { SURFACE_Y } from './constants';
import { saveGame, loadGame, hasSave, deleteSave, loadSettings, storeSettings, SLOTS, SlotMeta, slotMeta, useSlot, lastSlot, anySave } from './save';
import { TitleScene } from './title';
import { MODES, ModeId } from './data/nerve';
import { prefs, applyPrefs } from './prefs';
import { TouchControls, goFullscreenLandscape } from './touch';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const loading = document.getElementById('loading') as HTMLElement;
const loadBar = document.getElementById('loadFill') as HTMLElement;
const title = document.getElementById('title') as HTMLElement;
const intro = document.getElementById('intro') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const caption = document.getElementById('titleCaption') as HTMLElement;
const capLabel = document.getElementById('capLabel') as HTMLElement;
const capSub = document.getElementById('capSub') as HTMLElement;

let game: Game | null = null;
let renderer: Renderer | null = null;
let input: Input | null = null;
let ui: UI | null = null;
let touch: TouchControls | null = null;
/** the live scene behind the title menu */
let scene: TitleScene | null = null;
let last = 0;

async function boot(): Promise<void> {
  await loadAssets((f) => (loadBar.style.width = `${Math.round(f * 100)}%`));
  await document.fonts.ready;
  loading.classList.add('gone');
  renderer = new Renderer(canvas);
  input = new Input(canvas);
  touch = new TouchControls(input);
  ui = new UI();
  ui.bindSettings();
  makeScene(0x5eed ^ Math.floor(Math.random() * 6));
  if (import.meta.env.DEV) Object.assign(window as object, { __renderer: renderer, __titleSeed: makeScene, __scene: () => scene });
  const s = loadSettings();
  audio.setVolumes(s.music, s.sfx);
  prefs.shake = s.shake ?? true;
  prefs.hints = s.hints ?? true;
  prefs.hud = s.hud ?? 1;
  applyPrefs();
  ui.onSettings = (music, sfx) => {
    audio.setVolumes(music, sfx);
    storeSettings({ music, sfx, ...prefs });
  };
  ui.onPrefs = () => {
    applyPrefs();
    storeSettings({ music: audio.musicVolume, sfx: audio.sfxVolume, ...prefs });
  };
  ui.onQuit = () => {
    if (game && ui) saveGame(game.saveSnapshot(ui.cursorStack()), game.world, metaOf(game));
    if (game) game.retired = true;
    game = null;
    document.body.classList.remove('cine');
    hud.classList.remove('show');
    audio.music('none');
    audio.hushBeds();
    showTitle();
  };
  window.addEventListener('resize', () => {
    applyPrefs();
    if (game && renderer) renderer.resize(game);
    else if (scene && renderer) renderer.resize(scene.game);
  });
  const saveNow = (): void => {
    if (game && ui && !(window as { __noSave?: boolean }).__noSave) saveGame(game.saveSnapshot(ui.cursorStack()), game.world, metaOf(game));
  };
  window.addEventListener('beforeunload', saveNow);
  // a phone rarely says goodbye: it hides the page and may close it later without a word, so save as it goes
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveNow();
      audio.pause();
    } else audio.resume();
  });
  // a touch or a click wakes sound the browser put to sleep
  window.addEventListener('pointerdown', () => audio.resume(), { capture: true });
  showTitle();
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('auto')) {
    useSlot(lastSlot());
    startGame(!hasSave());
  }
  requestAnimationFrame(loop);
}

/** a fresh world for the live scene behind the title menu */
function makeScene(seed: number): void {
  if (!input || !renderer) return;
  scene = new TitleScene(input, seed);
  scene.onCaption = (label, sub) => {
    caption.classList.add('fade');
    setTimeout(() => {
      capLabel.textContent = label;
      capSub.textContent = sub;
      caption.classList.remove('fade');
    }, 450);
  };
  renderer.resize(scene.game);
}

function showTitle(): void {
  title.classList.add('show');
  title.classList.remove('picking');
  if (scene && renderer) {
    renderer.resize(scene.game);
    scene.caption();
  }
  // a first visit has one thing to do; after that, the last world and the rest of them
  const any = anySave();
  const cont = document.getElementById('btnContinue') as HTMLButtonElement;
  cont.style.display = any ? '' : 'none';
  if (any) {
    const n = lastSlot();
    const m = slotMeta(n);
    cont.innerHTML = `Continue<small>World ${n}${m ? ` \u00b7 Day ${m.day}` : ''}</small>`;
  }
  (document.getElementById('btnNew') as HTMLElement).style.display = any ? 'none' : '';
  (document.getElementById('btnWorlds') as HTMLElement).style.display = any ? '' : 'none';
}

/** a strip of the world's map for its card on the title */
const thumb = document.createElement('canvas');
thumb.width = 100;
thumb.height = 230;
function metaOf(g: Game): SlotMeta {
  let map: string | undefined;
  try {
    const x = thumb.getContext('2d');
    if (x && ui) {
      // the valley in section: dusk sky, then each layer of the mountain, faint where you have not been
      const k = thumb.height / g.world.h;
      x.imageSmoothingEnabled = false;
      x.fillStyle = '#2a2440';
      x.fillRect(0, 0, thumb.width, thumb.height);
      const bands = ['#3a2a1c', '#1f3324', '#2a2046', '#3a1a14', '#1c1428', '#3a0e18'];
      BIOMES.forEach((bm, i) => {
        const y0 = Math.round((i === 0 ? SURFACE_Y : bm.top) * k);
        const y1 = Math.round((BIOMES[i + 1]?.top ?? g.world.h) * k);
        x.fillStyle = bands[i] ?? '#14101c';
        x.fillRect(0, y0, thumb.width, y1 - y0);
      });
      x.drawImage(ui.mapCanvas, 0, 0, thumb.width, thumb.height);
      // the deepest you have been
      x.fillStyle = '#ffd75a';
      x.fillRect(0, Math.round((SURFACE_Y + g.p.maxDepth) * k), thumb.width, 1);
      map = thumb.toDataURL('image/png');
    }
  } catch {
    map = undefined;
  }
  return { day: g.p.stats.days, flame: g.p.wick.kindled ? g.flameName() : 'Cold', deepest: g.p.maxDepth, time: g.p.stats.time, mode: g.p.mode, stilled: g.p.bossDefeated, at: Date.now(), map };
}

function ago(at: number): string {
  if (!at) return '';
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** the three worlds, each with its card */
function showSlots(): void {
  const list = document.getElementById('slotList') as HTMLElement;
  let html = '';
  for (let n = 1; n <= SLOTS; n++) {
    const m = hasSave(n) ? slotMeta(n) : null;
    if (m) {
      const mins = Math.floor(m.time / 60);
      const when = ago(m.at);
      html += `<div class="wcard"><div class="wcard-map">${m.map ? `<img src="${m.map}" alt="">` : ''}</div><div class="wcard-info"><b>World ${n}</b><span>Day ${m.day} \u00b7 Wick <em>${m.flame}</em></span><span>Deepest ${m.deepest}m \u00b7 ${Math.floor(mins / 60)}h ${mins % 60}m played</span><span class="chips"><i>${MODES[m.mode as ModeId]?.name ?? 'Delver'}</i>${m.stilled ? '<i class="dawn">Heart stilled</i>' : ''}${when ? `<small>${when}</small>` : ''}</span></div><div class="wcard-btns"><button class="big" data-play="${n}">Play</button><button class="ghost" data-del="${n}">Delete</button></div></div>`;
    } else if (hasSave(n)) html += `<div class="wcard"><div class="wcard-map"></div><div class="wcard-info"><b>World ${n}</b><span>A world in progress (its card could not be read).</span></div><div class="wcard-btns"><button class="big" data-play="${n}">Play</button><button class="ghost" data-del="${n}">Delete</button></div></div>`;
    else html += `<div class="wcard empty"><div class="wcard-map"></div><div class="wcard-info"><b>World ${n}</b><span>An untouched valley, the Wick cold.</span></div><div class="wcard-btns"><button class="big" data-new="${n}">New World</button></div></div>`;
  }
  list.innerHTML = html;
  title.classList.add('picking');
}

document.getElementById('slotList')?.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  const n = Number(b.dataset.play ?? b.dataset.new ?? b.dataset.del);
  if (b.dataset.del) {
    if (!confirm(`Delete World ${n}? Everything in it is gone for good.`)) return;
    audio.play('click');
    deleteSave(n);
    if (anySave()) showSlots();
    else showTitle();
    return;
  }
  await startAudio();
  audio.play('click');
  useSlot(n);
  if (b.dataset.play) startGame(false);
  else {
    title.classList.remove('show');
    intro.classList.add('show');
  }
});
document.getElementById('btnWorlds')?.addEventListener('click', async () => {
  await startAudio();
  audio.play('click');
  showSlots();
});
document.getElementById('btnSlotsBack')?.addEventListener('click', () => {
  audio.play('click');
  title.classList.remove('picking');
});

async function startAudio(): Promise<void> {
  // on a phone or tablet, play fills the screen
  if (input?.usingTouch) goFullscreenLandscape();
  await audio.init();
  audio.resume();
}

function startGame(fresh: boolean, mode: ModeId = 'delver'): void {
  if (!input || !ui || !renderer) return;
  let loaded = fresh ? null : loadGame();
  if (!fresh && !loaded) {
    // never quietly replace a save we could not read: the autosave would overwrite it
    alert('That save could not be loaded. It has been left untouched; start a New World to play on.');
    showTitle();
    return;
  }
  if (!loaded) {
    const seed = (Math.random() * 1e9) | 0;
    const world = generateWorld(seed);
    const s = worldSpawn(world);
    const p = newProgress(seed, s.x, s.y);
    p.mode = mode;
    loaded = { p, world };
  }
  document.body.classList.remove('cine');
  const g = new Game(input, ui, loaded.p, loaded.world);
  game = g;
  input.touchUse = (x, y): boolean => g.touchWantsUse(x, y);
  if (import.meta.env.DEV) Object.assign(window as object, { __game: g, __renderer: renderer, __audio: audio });
  ui.attach(g);
  renderer.resize(g);
  g.onSave = () => {
    if ((window as { __noSave?: boolean }).__noSave || !ui || g.retired) return;
    saveGame(g.saveSnapshot(ui.cursorStack()), g.world, metaOf(g));
  };
  if (fresh) g.onSave();
  title.classList.remove('show');
  hud.classList.add('show');
  input.blocked = false;
  if (fresh) {
    setTimeout(() => {
      ui?.banner('Deepwick', 'You wake beside the Wick, the great lantern of the town. It has gone cold.');
      g.hint('journal_intro', 'Your Journal (top right, J) always shows what to do next. Esc shows every control.');
    }, 700);
  } else g.toast('Welcome back, delver.', '#ffe9a8');
}

document.getElementById('btnNew')?.addEventListener('click', async () => {
  // only shown before there is any world at all
  useSlot(1);
  await startAudio();
  audio.play('click');
  title.classList.remove('show');
  intro.classList.add('show');
});
document.getElementById('btnContinue')?.addEventListener('click', async () => {
  await startAudio();
  audio.play('click');
  useSlot(lastSlot());
  startGame(false);
});
/** the difficulty picked on the intro card */
let pickedMode: ModeId = 'delver';
const modeButtons = Array.from(document.querySelectorAll<HTMLElement>('#modePick .mode'));
function pickMode(id: ModeId): void {
  pickedMode = id;
  for (const b of modeButtons) b.classList.toggle('on', b.dataset.mode === id);
  const blurb = document.getElementById('modeBlurb');
  if (blurb) blurb.textContent = MODES[id].blurb + ' You can change this later from the pause menu.';
}
for (const b of modeButtons) {
  b.addEventListener('click', () => {
    audio.play('click');
    const id = b.dataset.mode as ModeId;
    if (MODES[id]) pickMode(id);
  });
}
pickMode('delver');
document.getElementById('btnBegin')?.addEventListener('click', () => {
  audio.play('click');
  intro.classList.remove('show');
  deleteSave();
  startGame(true, pickedMode);
});

function loop(t: number): void {
  const dt = Math.min(1 / 30, (t - last) / 1000 || 0);
  last = t;
  // a controller drives play, or a pointer in menus and on the title
  const menu = !game || !ui || ui.isOpen() || title.classList.contains('show') || intro.classList.contains('show');
  input?.pollPad(dt, menu);
  touch?.update({ play: !menu && !!game && !game.player.dead, near: game && !menu ? (game.near?.label ?? null) : null });
  if (game && renderer && ui && input) {
    game.update(dt);
    ui.update(dt);
    renderer.draw(game);
    input.endFrame();
  } else if (scene && renderer) {
    scene.update(dt);
    renderer.draw(scene.game);
  }
  audio.update(dt);
  requestAnimationFrame(loop);
}

if (import.meta.env.DEV) void import('./dev').then((m) => m.installDev(() => game));

void boot();
