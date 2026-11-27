# Design notes

Explorations of where One Die Deep could go: write-ups, playable prototypes, and
what was decided about them. Nothing here is part of the game itself.

## Open the prototypes

Serve the repository root and open `design/prototypes/`:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/design/prototypes/>. Once this folder is on `main`,
GitHub Pages serves it too, at <https://fulibacsi.github.io/one-die-deep/design/prototypes/>.

Each prototype has a balance sim in `tests/balance/prototypes/`, for example:

```bash
node tests/balance/prototypes/netdive.js
```

## Explorations

### 2026-11-22: three directions

Three prototypes, each changing the theme, the genre and one core mechanic while
keeping the single d6. The write-up is
[2026-11-22-where-next.md](2026-11-22-where-next.md).

| Prototype | Theme, genre, mechanic | Status | Decision and reason |
| --- | --- | --- | --- |
| [NETDIVE](prototypes/netdive/) | Hacking; incremental; one stat (Bias) | Active, see v2 and v3 below | Explore further. It misses the core of a single moving value: a successful roll should shift your Bias. Ghosting past ICE (skipping) is the wrong action: it should be a second kind of attack, and ICE should resist different attacks. |
| [SONAR](prototypes/sonar/) | Deep sea; dungeon minesweeper; level only | Abandoned | Unplayable on a phone, and the direction isn't pursued. On phones the board covered the panel below it; that layout bug is fixed here so the prototype stays playable. |
| [STARHOLD](prototypes/starhold/) | Galaxy conquest; incremental with resources; one stat (Aggression) | New, see below | A variant of NETDIVE to try out, on the owner's idea. |
| [High Roller](prototypes/high-roller/) | Casino heist; roguelite; the die is the character | Abandoned | A game with the same mechanics was released in November 2026, and acclaimed games with very similar gameplay already exist. |

The write-up recommended High Roller's "die is the character" direction. With
High Roller abandoned, that recommendation was not taken.

### 2026-11-23: NETDIVE v2

Built from the feedback above:

- **Two attacks.** Break lands on a roll under Bias, Spoof on a roll over it. Both
  strip ICE layers and earn data. Rolling Bias exactly is a zero-day: the ICE
  crashes whatever it resists.
- **Resistant ICE.** Walls resist Spoof, sentries resist Break, Black ICE resists
  nothing, and the Core's six layers alternate. A resisted attack only gets
  through on a zero-day. The map shows which attack works on each node.
- **A moving Bias.** Every hit that isn't a zero-day moves Bias by one, within
  2 to 5. Which way is a setting on the rig screen:
  - **Swing:** a success pushes you toward the other attack.
  - **Momentum:** a success makes the same attack easier.

`node tests/balance/prototypes/netdive.js`, 300 profiles per row. A careful bot
picks the attack that isn't resisted and has better odds; a random bot doesn't
think:

| Shift | Bot | Dives to win (median) | Attacks land | Attacks made at Bias 2 or 5 |
| --- | --- | --- | --- | --- |
| Swing | careful | 15 | 70% | 29% |
| Swing | random | 20 | 53% | 30% |
| Momentum | careful | 14 | 75% | 66% |
| Momentum | random | 19 | 54% | 48% |

Choosing well saves about 5 dives under either setting, so the choice matters.
Under momentum the careful bot parks at an extreme for two-thirds of its
attacks, where Bias can't move further. Under swing Bias stays in play. That
makes swing the recommendation; the owner picks.

### 2026-11-23: after playing v2

The owner played v2, and it isn't fun yet. The upgrades are boring, fighting is
tedious, and exploring is discouraged because going back costs cycles.

- **Free backtracking.** Moving into a node you have already been to costs no
  cycles. In the sim, 28–29% of the bot's moves went back through explored
  nodes. With those free, the median number of dives to win drops by about 3:

  | Shift | Bot | Before | After |
  | --- | --- | --- | --- |
  | Swing | careful | 15 | 12 |
  | Swing | random | 20 | 16 |
  | Momentum | careful | 14 | 11 |
  | Momentum | random | 20 | 16 |

  The bot explores by a fixed rule, so it doesn't explore more now that going
  back is free. A player may.
- **Tap to travel**, in the game too. Tapping a node further away walks there one
  step at a time, through the nodes you have been to. On touch screens only the
  nodes one step away are highlighted.
- **Still open:** the upgrades and the fights.

### 2026-11-23: NETDIVE v3, Lasers & Feelings dice

The owner's answers: each fight is dull (not too many of them), one-time
programs don't appeal, and Lasers & Feelings' multi-dice roll has potential.
Built to the owner's choices:

- **Pick, then roll.** Choose Break or Spoof, then roll that attack's dice. Each
  die under your Bias is a hit for Break, each one over it a hit for Spoof, and
  your Bias exactly is a zero-day: a hit for either.
- **The Lasers & Feelings ladder.** 0 hits: fail, and the ICE hits back. 1 hit:
  strip a layer, but the ICE hits back. 2 hits: strip a layer clean. 3 hits: strip
  two layers.
- **Dice come from expertise.** You roll 1 die, +1 per level of Break or Spoof
  expertise, up to 3. These replace the flat upgrades (Battery, Buffer,
  Compressor, Firewall). Bias tuner, Relay and Exploit kit stay. Without Battery,
  every dive has 28 cycles.
- **No resistance**, as in Lasers & Feelings. ICE differs in layers and in how hard
  it hits back, which the map shows under each.
- Bias still moves by one when an attack hits, by the swing or momentum setting.
  Saves from v2 don't carry over.
- **More than one die.** This is the first prototype to roll several dice at once,
  up to three d6, so it leaves "a single d6" behind. Traces and caches still roll
  one die.

`node tests/balance/prototypes/netdive.js`, 300 profiles per row. "Real choice"
counts attacks where neither option is at least as likely as the other to get
1, 2 and 3 hits:

| Shift | Bot | Dives to win (median) | Hits 0 / 1 / 2 / 3 | Real choice | Attacks made at Bias 2 or 5 |
| --- | --- | --- | --- | --- | --- |
| Swing | careful | 18 | 5% / 22% / 38% / 34% | 4% | 35% |
| Swing | random | 31 | 10% / 26% / 34% / 31% | 2% | 42% |
| Momentum | careful | 10 | 3% / 16% / 22% / 58% | 1% | 83% |
| Momentum | random | 33 | 10% / 25% / 32% / 32% | 1% | 49% |

What it shows:

- **The ladder gives fights texture.** Under swing, a careful player's attacks
  fail outright only 5% of the time, and the other results are spread across 1, 2
  and 3 hits.
- **Picking matters, but the right pick is obvious.** Picking at random takes
  about twice as many dives. Yet at almost every roll, one attack is at least as
  good for 1, 2 and 3 hits: the one with more dice times more faces. With the same
  sim and Spoof expertise bought last, so the pools differ for longer, real
  choices rise to 10%.
- **Momentum breaks.** The careful bot parks at Bias 2 or 5 for 83% of its
  attacks and gets 3 hits 58% of the time.

Still open: making the choice of attack a real one on each roll.

### 2026-11-27: STARHOLD, galaxy conquest

The owner's idea: move the theme to conquering a galaxy. Nodes become star
systems, occupied by species you can kill or enslave, and each system you take
generates resources. It's a new variant next to NETDIVE, still incremental, and
maybe a resource management game too. Built on NETDIVE v3's roll:

- **One galaxy that stays.** 20 systems on a 6×6 chart, kept between campaigns.
  Systems you take stay yours. Defenders you don't finish regroup between
  campaigns, so a system has to fall within one campaign.
- **A campaign** launches from your homeworld with 6 supply, +4 per level of
  Supply lines. Flying through your own systems is free; any other system costs
  1 supply, and so does every roll. Uninhabited worlds are yours on arrival, and
  derelicts also give +3 supply.
- **Two actions, Purge (kill) and Enslave,** rolled as in NETDIVE v3, with
  Aggression as the one stat: a die under it hits for Purge, a die over it hits
  for Enslave, and a die equal to it hits for either. Same ladder: 0 hits fail and
  the defenders strike back, 1 hit takes 1 strength but they strike back, 2 take 1
  clean, 3 take 2. A hit moves Aggression toward the other action. This is
  NETDIVE's swing; momentum broke in v3, so it isn't offered.
- **The final blow decides the fate.** A purged world yields its planet's
  resource, alloys or fuel. An enslaved world yields labor. Strength, strike-back
  and yields grow with distance from home.
- **Income.** After every campaign, each system you hold ships its output home.
  Upgrades are each bought with one resource: Warfleet (+1 Purge die, alloys),
  Overseers (+1 Enslave die, labor), Supply lines (+4 supply, fuel) and War
  doctrine (choose your starting Aggression, labor).
- Take the Precursor throneworld at the far end, strength 12, to win.

`node tests/balance/prototypes/starhold.js`, 300 profiles per row. The careful
bot picks by odds, but on the final blow it picks the fate that yields the
resource it needs next. The odds bot ignores fate, and the random bot picks at
random:

| Bot | Campaigns to win (median, p10–p90) | Hits 0 / 1 / 2 / 3 | Systems claimed / purged / enslaved |
| --- | --- | --- | --- |
| Careful | 14 (12–18) | 14% / 40% / 35% / 11% | 25% / 31% / 44% |
| Odds | 14 (12–19) | 12% / 38% / 39% / 11% | 25% / 31% / 44% |
| Random | 17 (13–25) | 17% / 37% / 32% / 14% | 20% / 38% / 42% |

What it shows:

- **Pacing is close to NETDIVE's.** The first tuning won in 5 campaigns, because
  damage to a garrison carried over between campaigns. Regrouping, lower yields
  and dearer upgrades brought it to 14.
- **Choosing fates by need doesn't pay off yet.** The bot that ignores fate also
  needs a median of 14 campaigns. On the final blow, odds and need disagree about
  16 times per profile, so the choice does come up, but the three resources stay
  roughly balanced however you choose. Making fuel scarcer, on a third of planets
  instead of half, didn't change that (15 campaigns against 15).
- **Picking by odds still matters:** random takes 17.

Still open: making a species' fate matter. Ideas to discuss: enslaved worlds risk
revolt, which is where the heat meter from the NETDIVE discussion would fit;
costs that need a mix of resources; or upkeep.

### 2026-11-27: STARHOLD revolts, a heat meter

The owner asked for enslaved worlds that revolt, with a heat meter like the one
discussed for NETDIVE: enslaving risks a revolt, and then you have to purge.

- **Unrest** is the heat meter, 0 to 10, kept between campaigns.
- **Enslaving is the quiet action.** When a purge goes badly (0 or 1 hits) the
  defenders strike back and cost supply, as before. When an enslavement goes
  badly they don't, but unrest rises: +2 on 0 hits, +1 on 1 hit.
- **Each enslaved world adds 1 unrest** at the end of every campaign.
- **At 10, the largest enslaved world revolts.** It turns hostile at full
  strength, 2 stronger and striking back 1 harder than before, and unrest resets
  to 0. Rebels can only be purged; crushed, the world is yours again as a purged
  world. A revolt can cut your territory in two, because you can only fly freely
  through systems you hold.

`node tests/balance/prototypes/starhold.js`, 300 profiles per row. The careful
bot now weighs a point of unrest like a point of supply (three times as much
when a revolt is near) and won't enslave on a final blow that could set one off.
The odds bot ignores costs and fate:

| Bot | Won | Campaigns to win (median, p10–p90) | Enslaved systems | Revolts per galaxy | Rolls against rebels |
| --- | --- | --- | --- | --- | --- |
| Careful | 100% | 16 (12–24) | 20% | 3.0 | 22% |
| Odds | 96% | 19 (13–40) | 35% | 5.1 | 57% |
| Random | 96% | 19 (13–36) | 34% | 5.7 | 28% |

Bots that miss within 150 campaigns count as not winning.

What it shows:

- **Fate and cost now matter.** Before revolts, ignoring them cost nothing (14
  campaigns either way). Now the bots that ignore them take 3 campaigns longer,
  and 4% of their galaxies stall in a cycle of revolts.
- **The careful bot enslaves less:** a fifth of its systems, against a third.
- **Tuning:** without stronger rebels, revolts made the game easier, not harder
  (careful 13, random 14). A failed enslavement costs no supply, and a revolt was
  just one quick fight. Rebels rising 2 stronger and striking back 1 harder gave
  unrest its bite.

### 2026-11-27: STARHOLD unrest cools

Unrest only fell through a revolt, so with no enslaved worlds it could sit at
full and turn the next enslavement into an instant revolt. On the owner's go,
unrest now cools by 2 between campaigns, after each enslaved world adds its 1:
two enslaved worlds hold it steady, and more build heat.

`node tests/balance/prototypes/starhold.js`, 300 profiles per row:

| Bot | Won | Campaigns to win (median, p10–p90) | Enslaved systems | Revolts per galaxy |
| --- | --- | --- | --- | --- |
| Careful | 100% | 14 (10–19) | 28% | 2.2 |
| Odds | 98% | 15 (12–28) | 39% | 3.1 |
| Random | 98% | 16 (12–23) | 36% | 3.5 |

The game gets about 2 campaigns shorter for the careful bot, which enslaves more
now. Ignoring unrest and fate still costs, but less: 1–2 campaigns instead of 3,
and 2% of those galaxies stall instead of 4%. Cooling by 1 per campaign sits
between: careful 15, odds 16, random 17, with 2.6 to 4.6 revolts per galaxy.

### 2026-11-27: STARHOLD star systems

The owner asked for star systems instead of round rooms, seen from above, with
the player orbiting them, never static. Each system is now a star with one or
two planets on orbits that keep turning. The resource planet is coloured by
what the world yields: alloys or fuel. Your fleet circles the system it's at.
Held systems are shaded as territory, and badges show strength, fate and yield.
The map redraws after every action, so each orbit is drawn at its phase at that
moment and planets carry on instead of jumping back. With reduced motion
everything stands still. STARHOLD draws this with its own renderer,
`prototypes/starhold/starmap.js`; the other prototypes keep the shared map view.

### 2026-11-27: would a bigger die change One Die Deep?

The owner asked whether a d10, d12 or d20 would change the game dramatically.
`node tests/balance/die-size.js` builds a copy of the engine where only the
checks (hit, block, flee, spot a trap) roll the bigger die, and runs the balance
bot: 2000 runs per class and level-up order. Its d6 row reproduces
`simulate.js` exactly. Two ways to fit a bigger die:

- **Recentred:** keep the stats and targets, shift the roll so an average lands
  where a d6's does. A stat point is then worth 1/N of a roll instead of 1/6.
- **Same odds:** map the roll onto the d6's scale, as if every stat and target
  grew with the die. Each check succeeds as often as on a d6; only the naturals
  get rarer, 1 and the top face each 1/N of the time.

| Die | Fit | Wins: warrior / rogue / mage | Best minus worst level-up order |
| --- | --- | --- | --- |
| d6 | | 55 / 54 / 48% | 35 / 30 / 19 points |
| d10 | Recentred | 45 / 41 / 37% | 24 / 13 / 11 |
| d12 | Recentred | 41 / 38 / 39% | 19 / 13 / 14 |
| d20 | Recentred | 33 / 35 / 39% | 13 / 18 / 14 |
| d10 | Same odds | 44 / 35 / 26% | 35 / 23 / 13 |
| d12 | Same odds | 47 / 44 / 29% | 36 / 29 / 12 |
| d20 | Same odds | 43 / 35 / 22% | 36 / 24 / 13 |

What it shows:

- **Keeping the small stats, a bigger die makes the game about luck.** The gap
  between the best and worst level-up order shrinks to a third or half, and
  wins fall.
- **Even at the same odds, the naturals carry the current balance.** On a d6 a
  natural 1 or 6 decides a third of all checks; on a d20, a tenth. With fewer
  crits and lucky blocks, wins fall 8 to 26 points, the mage's most.
- **Recommendation:** keep the d6. A bigger die pays off only with bigger numbers
  (more stat range or levels), a rebalance, and crits on more than one face.
- **For NETDIVE and STARHOLD** (reasoned, not simulated): a bigger die needs the
  2–5 stat stretched, and then each one-step shift moves the odds by 1/N, which
  mutes the moving stat. The face that hits for either action gets rarer too.

## Parked ideas

- **Class passives** for every class, perhaps unlocked at the first level-up. They
  add class identity. Until then, the Rogue's retaliation lives in its skills.
- **Dice ladder:** a coin tutorial, a d4 intro, the d6 game, a d10 expert unlock.
  This depends on whether "a single d6" can relax to "a single die". The die-size
  sims above suggest a d10 mode would be luckier and harder, not more skilful,
  unless stats grow with it.
- From the write-up's open questions, still open: can a run fail hard, or only end
  softly; and how long should one run be.
