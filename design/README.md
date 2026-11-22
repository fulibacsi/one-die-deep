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
| [NETDIVE](prototypes/netdive/) | Hacking; incremental; one stat (Bias) | Active | Explore further. It misses the core of a single moving value: a successful roll should shift your Bias. Ghosting past ICE (skipping) is the wrong action: it should be a second kind of attack, and ICE should resist different attacks. |
| [SONAR](prototypes/sonar/) | Deep sea; dungeon minesweeper; level only | Abandoned | Unplayable on a phone, and the direction isn't pursued. On phones the board covered the panel below it; that layout bug is fixed here so the prototype stays playable. |
| [High Roller](prototypes/high-roller/) | Casino heist; roguelite; the die is the character | Abandoned | A game with the same mechanics was released in November 2026, and acclaimed games with very similar gameplay already exist. |

The write-up recommended High Roller's "die is the character" direction. With
High Roller abandoned, that recommendation was not taken.

## Parked ideas

- **Class passives** for every class, perhaps unlocked at the first level-up. They
  add class identity. Until then, the Rogue's retaliation lives in its skills.
- **Dice ladder:** a coin tutorial, a d4 intro, the d6 game, a d10 expert unlock.
  This depends on whether "a single d6" can relax to "a single die".
- From the write-up's open questions, still open: can a run fail hard, or only end
  softly; and how long should one run be.
