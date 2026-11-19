const SFX = [
  'pick_hit',
  'block_break',
  'ore_break',
  'pickup',
  'coins',
  'jump',
  'hurt',
  'swing',
  'enemy_hit',
  'enemy_die',
  'levelup',
  'explosion',
  'torch',
  'chest_open',
  'upgrade',
  'relic',
  'lift',
  'fireball',
  'roar',
  'teleport',
  'drink',
  'click',
  'ladder',
  'sizzle',
  'death',
  'cave_ambience',
  'chop',
  'eat',
  'craft',
  'place',
  'groan',
  'door',
  'bow',
  'rustle',
  'cart_roll',
  'cart_bump',
  'splash',
  'reel',
] as const;
export type SfxId = (typeof SFX)[number];

export type MusicId = 'camp' | 'cave' | 'cave2' | 'deep' | 'boss' | 'none';
const MUSIC_FILES: Record<Exclude<MusicId, 'none'>, string> = {
  camp: 'music_camp.mp3',
  cave: 'music_cave.mp3',
  cave2: 'music_cave2.mp3',
  deep: 'music_deep.mp3',
  boss: 'music_boss.mp3',
};

class AudioSystem {
  ctx: AudioContext | null = null;
  private buffers = new Map<SfxId, AudioBuffer>();
  private lastPlay = new Map<SfxId, number>();
  private sfxGain: GainNode | null = null;
  private musicEls = new Map<MusicId, HTMLAudioElement>();
  private current: MusicId = 'none';
  private fading: { el: HTMLAudioElement; from: number; t: number }[] = [];
  musicVolume = 0.5;
  sfxVolume = 0.7;

  async init(): Promise<void> {
    if (this.ctx) return;
    const Ctor = window.AudioContext;
    this.ctx = new Ctor();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.ctx.destination);
    await Promise.all(
      SFX.map(async (id) => {
        try {
          const res = await fetch(`./assets/audio/${id}.wav`);
          if (!res.ok) return;
          const data = await res.arrayBuffer();
          const ctx = this.ctx;
          if (!ctx) return;
          this.buffers.set(id, await ctx.decodeAudioData(data));
        } catch {
          // missing sounds are not fatal
        }
      }),
    );
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    const el = this.musicEls.get(this.current);
    if (el) el.volume = music;
  }

  play(id: SfxId, opts: { vol?: number; pitch?: number; vary?: number } = {}): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf || !this.sfxGain) return;
    const now = performance.now();
    if (now - (this.lastPlay.get(id) ?? 0) < 45) return;
    this.lastPlay.set(id, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const vary = opts.vary ?? 0.08;
    src.playbackRate.value = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
    const g = ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  music(id: MusicId): void {
    if (id === this.current) return;
    const old = this.musicEls.get(this.current);
    if (old) this.fading.push({ el: old, from: old.volume, t: 0 });
    this.current = id;
    if (id === 'none') return;
    let el = this.musicEls.get(id);
    if (!el) {
      el = new Audio(`./assets/audio/${MUSIC_FILES[id]}`);
      el.loop = true;
      this.musicEls.set(id, el);
    }
    this.fading = this.fading.filter((f) => f.el !== el);
    el.volume = 0;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }

  private ambGain: GainNode | null = null;
  private ambTarget = 0;

  /** quiet looping cave bed; level 0..1 */
  ambience(level: number): void {
    this.ambTarget = level;
    const ctx = this.ctx;
    const buf = this.buffers.get('cave_ambience');
    if (!ctx || !buf || !this.sfxGain || this.ambGain) return;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0;
    this.ambGain.connect(this.sfxGain);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.ambGain);
    src.start();
  }

  update(dt: number): void {
    if (this.ambGain) {
      const g = this.ambGain.gain;
      g.value += (this.ambTarget * 0.45 - g.value) * Math.min(1, dt * 1.5);
    }
    const el = this.musicEls.get(this.current);
    if (el && el.volume < this.musicVolume) el.volume = Math.min(this.musicVolume, el.volume + dt * 0.5);
    if (el && el.volume > this.musicVolume) el.volume = this.musicVolume;
    for (const f of this.fading) {
      f.t += dt;
      f.el.volume = Math.max(0, f.from * (1 - f.t / 1.5));
      if (f.t >= 1.5) f.el.pause();
    }
    this.fading = this.fading.filter((f) => f.t < 1.5);
  }
}

export const audio = new AudioSystem();
