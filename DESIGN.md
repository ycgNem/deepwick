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
- [x] Cycle 6: the Wick catches. Kindling (and every later flame level) is now an event: the light spreads out from the glass over 1.5s instead of snapping on, rings of light race to the new edge, slow rays turn about the lamp, a flash and a centred title card ("THE WICK BURNS / Deepwick has a heart again."), plus a new kindle sound. The two old flame-up toasts are gone. Accessibility & options in the pause menu: screen shake & flashes on/off (also softens the hurt flash), tutorial hints on/off (the Journal still reads the hint flags), HUD size 85-130%, fullscreen; saved with the volume settings. Measured the opening: bare hands fell a tree in ~3.7s, five trees within 30 tiles, coal ~11m down, so kindling takes ~3 minutes, well before the first night (~6 minutes); no pacing change needed.
- [x] Cycle 7: bring them home. The smith and the archivist no longer just appear: when the Wick grows Glowing (and Bright) its light is seen from below, and they answer from a hollow in the rock by a fire burning low (Brannoc 34-44m down in the Topsoil Tunnels, Wren 72-86m down in the Mossroot Grotto). A compass under the Journal and a blinking marker on both maps point the way; they call out when you are near. Talk to them and they follow you home along the exact path you walked (walk cycles from PixelLab), carrying a little light, chatting in speech bubbles, and halving the nerve the dark costs you. Wickposts and recall bring them along; black out and they go back to their fire. Inside the Wick's light their house goes up, they walk over to their door, and a title card welcomes them home. Two Journal goals added, and the Journal now remembers goals by id so new ones never shift a save. Title cards queue instead of overwriting each other.
- [x] Cycle 8: Hesper's Stillroom. A fourth townsperson: at the Blazing flame Hesper the apothecary answers from the Crystal Hollows (150-168m down), the deepest rescue yet, with her own PixelLab portrait, walk cycle and an open-fronted stillroom with a copper still. Home, she brews from coin and what you carry up: Steady Draught (2 glowcaps: +60 nerve at once), Nightglass Tonic (2 jade: three minutes of wider sight in the dark and half the nerve drain), Gloamward Salve (3 Gloam Motes: three minutes in which no Gloamling hunts you or rises near you and the tide-born pass you by). Active brews show as a timed chip under the Wick chip. New Journal goal; older saves that are already past a rescue page see it as still to do. Verified saving and reloading mid-escort (the follower resumes at your heels).
- [x] Cycle 9: readable at a glance. Notifications rebuilt so the top of the screen never stacks five banners: tutorial tips have their own card bottom-left (one at a time, queued, click to dismiss, hidden while a window is open); Journal pages tick off inside the goal tracker itself (green, with the coins) and turn in order; chapters and the opening ("DEEPWICK / You wake beside the Wick...") are title cards; level-ups light up the skill row (perk in its tooltip) instead of a toast; news toasts are compact, at most three, and a repeat counts up (x3) instead of stacking. Pickups of the same thing merge into one counting label (+5 Wood). Numbers were hard to read: Pixelify Sans draws 5 like an S (1,500 read as 1,800), so every digit in the HUD, menus and in-world text now comes from Silkscreen. Title cards no longer wait 2.6s after a page load.
- [ ] Cycle 10+: review cycles: balance, polish, audio, performance, content.
