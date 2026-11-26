/**
 * Sound captions: the sounds that carry warnings or news, written out on screen for anyone
 * playing with the sound off (most phones, much of the time) or who cannot hear them. Warnings
 * (the roof about to fall, gas, floodwater, something coming in the dark) are picked out in amber.
 */
import type { SfxId } from './audio';

export interface Caption {
  text: string;
  warn?: boolean;
}

export const CAPTIONS: Partial<Record<SfxId, Caption>> = {
  creak: { text: 'Rock creaking overhead', warn: true },
  rockfall: { text: 'Rocks falling', warn: true },
  hiss: { text: 'Gas hissing out', warn: true },
  whoomph: { text: 'Gas ignites', warn: true },
  explosion: { text: 'Explosion' },
  gush: { text: 'Water bursting through', warn: true },
  lurch: { text: 'Dragging footsteps', warn: true },
  moan: { text: 'A low moan' },
  groan: { text: 'Groaning in the dark' },
  gloam_hiss: { text: 'A hiss in the dark' },
  gutter: { text: 'Your flame gutters', warn: true },
  whisper: { text: 'Whispers' },
  heartbeat: { text: 'Your heart pounding' },
  thunder: { text: 'Thunder cracks' },
  thunderfar: { text: 'Distant thunder' },
  duskbell: { text: 'The town bell tolls' },
  splash: { text: 'Splash' },
  roar: { text: 'A roar' },
  tendril: { text: 'A tendril lashes out', warn: true },
  heartdrink: { text: 'The heart drinks the light', warn: true },
  dog_growl: { text: 'Tallow growls at the dark', warn: true },
  dog_bark: { text: 'Tallow barks' },
  dog_whine: { text: 'A dog whines' },
  dog_sniff: { text: 'Tallow has caught a scent' },
  dog_dig: { text: 'Paws scrabbling at earth' },
};
