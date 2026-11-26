/** Hesper's Stillroom: brews you pay for in coin and in what you carry up from the dark */
export interface Brew {
  id: string;
  coins: number;
  needs: Record<string, number>;
}

export const BREWS: Brew[] = [
  { id: 'steadydraught', coins: 25, needs: { sporecap: 2 } },
  { id: 'nightglass', coins: 40, needs: { jade: 2 } },
  { id: 'gloamward', coins: 50, needs: { gloammote: 3 } },
];

/** how long a tonic or salve lasts, in seconds */
export const BREW_TIME = 180;
