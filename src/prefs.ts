/** Player preferences that change how the game looks and talks to you (saved with the volume settings). */
export interface Prefs {
  /** screen shake and full-screen flashes */
  shake: boolean;
  /** first-time tutorial hints */
  hints: boolean;
  /** HUD and menu size */
  hud: number;
  /** important sounds written out on screen */
  captions: boolean;
}

export const prefs: Prefs = { shake: true, hints: true, hud: 1, captions: false };

export const HUD_SIZES = [0.85, 1, 1.15, 1.3];

/** size the HUD and the menus */
export function applyPrefs(): void {
  for (const id of ['hud', 'panel']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (prefs.hud === 1) el.style.removeProperty('zoom');
    else el.style.setProperty('zoom', String(prefs.hud));
  }
}
