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
import { saveGame, loadGame, hasSave, deleteSave, loadSettings, storeSettings } from './save';
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
    if (game && ui) saveGame(game.saveSnapshot(ui.cursorStack()), game.world);
    game = null;
    hud.classList.remove('show');
    audio.music('none');
    showTitle();
  };
  window.addEventListener('resize', () => {
    applyPrefs();
    if (game && renderer) renderer.resize(game);
    else if (scene && renderer) renderer.resize(scene.game);
  });
  const saveNow = (): void => {
    if (game && ui && !(window as { __noSave?: boolean }).__noSave) saveGame(game.saveSnapshot(ui.cursorStack()), game.world);
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
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('auto')) startGame(!hasSave());
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
  if (scene && renderer) {
    renderer.resize(scene.game);
    scene.caption();
  }
  const cont = document.getElementById('btnContinue') as HTMLButtonElement;
  cont.style.display = hasSave() ? '' : 'none';
}

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
  const g = new Game(input, ui, loaded.p, loaded.world);
  game = g;
  input.touchUse = (x, y): boolean => g.touchWantsUse(x, y);
  if (import.meta.env.DEV) Object.assign(window as object, { __game: g, __renderer: renderer });
  ui.attach(g);
  renderer.resize(g);
  g.onSave = () => {
    if ((window as { __noSave?: boolean }).__noSave || !ui) return;
    saveGame(g.saveSnapshot(ui.cursorStack()), g.world);
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
  if (hasSave() && !confirm('Start a new game? Your current save will be replaced.')) return;
  await startAudio();
  audio.play('click');
  title.classList.remove('show');
  intro.classList.add('show');
});
document.getElementById('btnContinue')?.addEventListener('click', async () => {
  await startAudio();
  audio.play('click');
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
