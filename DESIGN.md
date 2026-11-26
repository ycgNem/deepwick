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
- [x] Cycle 2: the Wick. Kindle it (15 wood, 3 coal), feed it Lumen from
      anything that glows, five flame levels. Settlers arrive by flame level
      (deeds removed; old saves migrate), nothing hostile survives in its light,
      a warm safe pool at night, rest heals faster there. Wickposts at flame 2:
      lit waypoints, travel between any of them and the Wick.
- [x] Cycle 3: darkness. Nerve (0-100, saved) drains in the dark (faster the
      deeper you go, much faster in the Sunless Vault, halved by the Sunglass
      Lens) and recovers in light, fastest by a campfire or in the Wick's
      light. Frayed under 60: the screen closes in. Shaken under 35: a
      heartbeat, whispers, tendrils of dark at the screen edge, and Gloamlings
      hunt you while you stand in the dark. At 0 the dark bites. Gloamlings are
      living shadow: they seep through rock, circle at the edge of your light,
      burn in it, and drop Gloam Motes (6 Lumen). Difficulty: Hearth (keep your
      pack, softer), Delver, Gloam (harder, more Gloamlings); picked on the
      intro card, changeable from the pause menu.
- [x] Cycle 4: guidance. The Journal: 21 goals in four chapters (The Cold
      Wick, Into the Dark, The Long Descent, The Deep Places) walking the whole
      loop from punching wood to stilling the Gloamheart. Each is judged from the
      world state, pays coins and Delving XP, shows on the HUD under the minimap
      with a progress bar, and in full with how-to text on J. Old saves skip
      what they have done without being paid twice. Controller support: stick
      movement, right-stick aim (idle aim works the block in front of you, or
      below while holding down), triggers to use, an on-screen pointer that
      clicks through every menu and the title, button latching across menu
      changes, and a controller section in the pause menu.
- [x] Cycle 5: Gloam Tides. Every fourth night from the third (once the Wick
      is Glowing) the dark rises against the town: a bruised sky and a red
      moon, the Wick gutters to half its reach, and tide-born Gloamlings come
      over the hills from both sides to gnaw at its roots, draining its ward
      (HUD bar). The guttering Wick cannot burn them, but torches and lamps on
      the approaches can, so the town wants a lit perimeter. Hold until dawn
      for Lumen and coins (scaled by the ward left and the tide cut down); let
      the ward break and the Gloam eats some of the Lumen toward the next flame
      (never a whole level). No sleeping through a tide; a dawn warning and a
      "Tide tonight" chip; its own siege music (PixelLab). Journal goal added.
- [ ] Cycle 6+: review cycles: balance, polish, audio, performance, content.
