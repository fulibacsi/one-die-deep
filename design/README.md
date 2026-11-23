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
| [NETDIVE](prototypes/netdive/) | Hacking; incremental; one stat (Bias) | Active, see v2 below | Explore further. It misses the core of a single moving value: a successful roll should shift your Bias. Ghosting past ICE (skipping) is the wrong action: it should be a second kind of attack, and ICE should resist different attacks. |
| [SONAR](prototypes/sonar/) | Deep sea; dungeon minesweeper; level only | Abandoned | Unplayable on a phone, and the direction isn't pursued. On phones the board covered the panel below it; that layout bug is fixed here so the prototype stays playable. |
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

## Parked ideas

- **Class passives** for every class, perhaps unlocked at the first level-up. They
  add class identity. Until then, the Rogue's retaliation lives in its skills.
- **Dice ladder:** a coin tutorial, a d4 intro, the d6 game, a d10 expert unlock.
  This depends on whether "a single d6" can relax to "a single die".
- From the write-up's open questions, still open: can a run fail hard, or only end
  softly; and how long should one run be.
