# Deepwick: design direction

A light-survival mining game. Not a Terraria clone: the thing you are really
gathering, spending and defending is **light**.

## The pitch

The mining town of Deepwick lived around the Wick, a great lantern whose flame
kept the dark in the mountain. Something far below (the Gloamheart) has been
drinking the light. The Wick is cold, the town is empty, and at night the Gloam
rolls down the valley.

You wake beside the cold Wick with nothing. Every trip underground is an
expedition into the dark: your lantern oil is your clock, darkness wears you
down, and what you bring back up (ore for tools, and anything that glows for
the flame) decides how far the light reaches tomorrow.

## Pillars

1. **Light is life.** Being in the dark is the danger, not just the enemies in
   it. Light sources you place stay lit and make the mountain safer over time.
2. **The Wick is the heart.** One hub to feed and grow. Its flame level drives
   progression: the safe radius at night, which settlers come back, what they
   offer. No abstract deeds.
3. **Expeditions, not just digging.** Push down, light a waypoint, push again,
   get home before the oil runs out. Depth is gated by light and nerve as much
   as by pickaxe tier.
4. **Readable and welcoming.** A clear next goal on screen at all times,
   difficulty choices, controller support, and juicy feedback.

## Core loop

- **Day, surface:** craft, cook, fish, trade, feed the Wick.
- **Descent:** mine ore and collect glowing things (glowcaps, jade, amethyst,
  lumenite, glowfin...). Plant Wickposts to make lit, safe waypoints you can
  travel back to.
- **Return:** refine glow into Lumen at the Wick, grow the flame, unlock the
  next settler or upgrade, forge better tools and lanterns.
- **Night:** the Gloam comes down the valley. Inside the Wick's light you are
  safe; outside it the Hollows hunt.

## Roadmap (one review cycle each, every cycle ends shippable)

- [x] Cycle 1: empty-handed miner; tools drawn in hand only when held and swung
      (each pick tier looks different). Playthrough bug fixes.
- [ ] Cycle 2: the Wick. Lumen refining, flame levels, settlers arrive by flame
      level (deeds removed), Wick safe radius at night, Wickposts (lit
      waypoints with fast travel back to the Wick).
- [ ] Cycle 3: darkness. A Nerve meter that drains in the dark and recovers in
      light; Gloamlings that only exist in darkness; difficulty modes
      (Hearthkeeper, Delver, Gloamwalker).
- [ ] Cycle 4: guidance. Journal of goals that walks the loop, better
      onboarding, gamepad support.
- [ ] Cycle 5+: review cycles: balance, polish, audio, performance, content.
