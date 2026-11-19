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

const canvas = document.getElementById('game') as HTMLCanvasElement;
const loading = document.getElementById('loading') as HTMLElement;
const loadBar = document.getElementById('loadFill') as HTMLElement;
const title = document.getElementById('title') as HTMLElement;
const intro = document.getElementById('intro') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
(document.querySelector('.title-art') as HTMLElement).style.backgroundImage = 'url(./assets/bg/title.png)';

let game: Game | null = null;
let renderer: Renderer | null = null;
let input: Input | null = null;
let ui: UI | null = null;
let last = 0;

async function boot(): Promise<void> {
  await loadAssets((f) => (loadBar.style.width = `${Math.round(f * 100)}%`));
  await document.fonts.ready;
  loading.classList.add('gone');
  renderer = new Renderer(canvas);
  input = new Input(canvas);
  ui = new UI();
  ui.bindSettings();
  const s = loadSettings();
  audio.setVolumes(s.music, s.sfx);
  ui.onSettings = (music, sfx) => {
    audio.setVolumes(music, sfx);
    storeSettings({ music, sfx });
  };
  ui.onQuit = () => {
    if (game && ui) saveGame(game.saveSnapshot(ui.cursorStack()), game.world);
    game = null;
    hud.classList.remove('show');
    audio.music('none');
    showTitle();
  };
  window.addEventListener('resize', () => {
    if (game && renderer) renderer.resize(game);
  });
  window.addEventListener('beforeunload', () => {
    if (game && ui && !(window as { __noSave?: boolean }).__noSave) saveGame(game.saveSnapshot(ui.cursorStack()), game.world);
  });
  showTitle();
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('auto')) startGame(!hasSave());
  requestAnimationFrame(loop);
}

function showTitle(): void {
  title.classList.add('show');
  const cont = document.getElementById('btnContinue') as HTMLButtonElement;
  cont.style.display = hasSave() ? '' : 'none';
}

async function startAudio(): Promise<void> {
  await audio.init();
  audio.resume();
}

function startGame(fresh: boolean): void {
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
    loaded = { p: newProgress(seed, s.x, s.y), world };
  }
  const g = new Game(input, ui, loaded.p, loaded.world);
  game = g;
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
      g.toast('You wake in a meadow with nothing but the clothes on your back.', '#ffe9a8');
      g.toast('Hold the left mouse button on a tree trunk to punch out some wood. Esc shows all controls.', '#ffe9a8');
    }, 600);
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
document.getElementById('btnBegin')?.addEventListener('click', () => {
  audio.play('click');
  intro.classList.remove('show');
  deleteSave();
  startGame(true);
});

function loop(t: number): void {
  const dt = Math.min(1 / 30, (t - last) / 1000 || 0);
  last = t;
  if (game && renderer && ui && input) {
    game.update(dt);
    ui.update(dt);
    renderer.draw(game);
    input.endFrame();
  }
  audio.update(dt);
  requestAnimationFrame(loop);
}

if (import.meta.env.DEV) void import('./dev').then((m) => m.installDev(() => game));

void boot();
