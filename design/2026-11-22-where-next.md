# One Die Deep: where next

Snapshot of the design write-up as of 2026-11-22. The live version is a
[Claude doc](https://claude.ai/artifact/PoMTi9qcRQwBxL2BhkhqEj). What was decided
after it, including that its recommendation was not taken, is in
[README.md](README.md).

## Summary

My recommendation: make the die itself the character, as in High Roller. Its six faces replace the stats, and loot replaces faces. Keep One Die Deep's room crawl, wrap it in runs with permanent upgrades, and theme it as a network hack.

Why: it is the only direction that keeps a single d6 *and* removes stats entirely. Every pickup becomes a decision, and its sim curve is healthy: 9% wins on run 1, 53% by run 5, 77% by run 10. The single-stat and minesweeper prototypes both work, but each showed a weakness in the sims (sections below).

While you were away:

| Change | Pull request | Status |
| --- | --- | --- |
| A found potion is drunk when the belt is full; lost at full HP | [#2](https://github.com/fulibacsi/one-die-deep/pull/2) | Open, balance within 1 point |
| Vanish is now a combat skill: the roll can't hurt you, and a hit crits. The rogue was rebalanced to 8 HP and Might 2 / Grit 3 / Wits 2 | [#3](https://github.com/fulibacsi/one-die-deep/pull/3) | Open, rogue 51% (was 50%) |
| One-screen portrait layout for phones | [#4](https://github.com/fulibacsi/one-die-deep/pull/4) | Open, no scrolling on 4 phone sizes |
| Bug found while testing: clicking or tapping inside an unexplored room did nothing | [#5](https://github.com/fulibacsi/one-die-deep/pull/5) | Open, 1 in 4 clicks worked before, 4 in 4 after |

All four merge cleanly together, and the combined code passes its 18 tests. Three playable prototypes are on [feature/design-prototypes](https://github.com/fulibacsi/one-die-deep/tree/feature/design-prototypes) and in a [private preview](https://claude.ai/artifact/HxRUJzM9AeChsCCyJFGmPa).

## The three prototypes

Each prototype keeps the single d6 and changes three things at once, so the directions feel clearly different. Play them from the [picker](https://claude.ai/artifact/HxRUJzM9AeChsCCyJFGmPa); NETDIVE and High Roller save progress in your browser.

| Prototype | Theme | Genre | Mechanic change | What the sim shows |
| --- | --- | --- | --- | --- |
| NETDIVE | Hacking a corporate network | Incremental: dives end when cycles run out, data buys permanent upgrades | One stat, Bias. Break wins on a roll under it, Ghost on a roll over it, equal is a zero-day | A greedy bot cracks the Core in a median of 18 dives. Bias 2, 3, 4 or 5 all land at 18 to 20 |
| SONAR | Submarine in a deep-sea trench | Dungeon minesweeper | No stats, only a level. A fight costs power minus the roll | Reading the echoes wins 49 to 52%, pinging blind 30% |
| High Roller | Casino heist | Roguelite with permanent upgrades | The die is the character. Faces are hit, block, parry, heal, chip or blank; loot is new faces | Win rate climbs from 9% on run 1 to 53% on run 5 and 77% on run 10 |

The sims are in `tests/balance/prototypes/` on the branch, one per prototype. Each has a bot that plays the way the table says, so the numbers are floors for a careful human, not targets.

## Themes

A network hack fits the current game best: the abstract map already reads as a network diagram, and every room type has a one-to-one match. Casino is the close second, because dice are the casino's own tool. Each theme below keeps the same mechanics.

| Theme | Rooms | Foes | Traps | Loot | Down / boss | Why it fits | Watch out |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Network hack | Nodes | ICE | Trace programs | Data, programs | Uplink / the Core | Nodes and links are what the map already draws; fog becomes unscanned nodes | Crowded genre; the neon-on-black look is a cliché, so NETDIVE uses printer paper and amber CRT |
| Casino heist | Rooms on a floor | Bouncers, dealers, pit bosses | Alarms | Chips, safes | Elevator / the House | Dice and chips belong there; chips can be both currency and rerolls | Gambling framing; check app store rules before shipping |
| Deep-sea descent | Trench cells | Creatures | Currents, leaks | Pearls, wrecks | Deeper trench / the Leviathan | The title already says "Deep"; sonar explains fog and echoes | A sub dueling a shark reads oddly; suits a puzzle more than combat |
| Dream descent | Memories | Fears | Intrusive thoughts | Keepsakes | Deeper sleep / the nightmare | Unusual tone; a "feelings" side for a one-stat system | Abstract shapes struggle to read as fears without art |
| Office tower, down to the archive | Offices | Clerks, managers | Paper cuts, red tape | Stamps, forms | Stairwell / the Director | Comedy, and nobody else does it | One joke; hard to keep funny for six floors |
| Fantasy (today) | Rooms | Monsters | Traps | Gear | Stairs / the Hollow King | Built, instantly readable | Generic |

## Genres

The roguelite and incremental options converge: both are runs with permanent upgrades. The real choice is whether a run can fail hard (High Roller busts) or only ends softly (NETDIVE's cycles run out). The minesweeper direction is the one that changes how you play the most, and the d6 works against it.

| Genre | Reference | How the reference does it | In One Die Deep | Tested |
| --- | --- | --- | --- | --- |
| Roguelite with permanent upgrades | Rogue Legacy, Hades | Currency survives a failed run and buys permanent upgrades | High Roller: unspent chips are banked even on a bust | Yes: 9% wins on run 1, 77% on run 10 |
| Incremental, limited steps | [Nodebuster](https://mancunion.com/2025/05/08/nodebuster-review-a-short-and-sweet-incremental-game/) | Short runs, a big upgrade tree between them; reviews put it at 3 to 5 hours | NETDIVE: dives end when cycles run out; you keep all data | Yes: Core cracked in a median of 18 dives |
| Puzzle crawler | [Desktop Dungeons](https://www.giantbomb.com/desktop-dungeons/3030-31011/) | Exploring new tiles regenerates HP and mana; a level-up refills both, so you time fights around it | One Die Deep already refills on level-up; SONAR builds its puzzle on it | Partly, in SONAR |
| Dungeon minesweeper | [Dragonsweeper](https://danielben.itch.io/dragonsweeper) | A hidden board of monsters; as I understand it, numbers show the total power of the monsters around a tile, and fights cost HP | SONAR: echoes show nearby power; a fight costs power minus your roll | Yes: deduction wins 49 to 52%, blind play 30% |
| Dice ladder: D2, D4, D6, D10 | [Die in the Dungeon](https://www.avclub.com/die-in-the-dungeon-early-access-thoughts) | Dice of different sizes cost different energy (d4 free, d6 one point, d8 two) | Not built. Fits the faces model: a coin tutorial, a d4 intro, the d6 game, a d10 expert unlock | No |

The minesweeper finding matters: as I understand it, Dragonsweeper's damage is fixed, so reading the board is everything. Putting a d6 in the fight adds luck that blind play can ride: deduction beats blind by about 20 points, not more.

## Mechanic experiments

The die-as-character idea held up best. The single stat is elegant on paper, but with one die it offers a weak choice.

| Mechanic | Reference | Tested in | Finding |
| --- | --- | --- | --- |
| One stat | [Lasers & Feelings](https://johnharper.itch.io/lasers-feelings): one number, roll under it for Lasers, over it for Feelings, exactly it for an insight | NETDIVE (Bias) | With one die the two sides mirror each other: Break wins on N of 6 faces, Ghost on 7 − N. Picking Bias 2, 3, 4 or 5 moved the bot only from 18 to 20 dives. Depth would have to come from content, such as ICE that only one approach can beat |
| The die is the character | [Slice & Dice](https://www.pcgamer.com/games/roguelike/heres-slice-and-dice-the-roguelike-rpg-where-each-of-your-party-members-is-a-different-die): each hero is a die, items change faces. [Dicey Dungeons](https://en.wikipedia.org/wiki/Dicey_Dungeons): rolled dice go into equipment slots | High Roller | No stats at all. Every roll is a keep-or-reroll choice with a cost, and every safe is a choice of which face to give up |
| Dice as loot | [Die in the Dungeon](https://www.avclub.com/die-in-the-dungeon-early-access-thoughts): upgrades raise face numbers or fill blank faces | High Roller | Same build as above; loot never feels like a flat +1 |
| Talent tree, classless | Nodebuster's upgrade tree | NETDIVE's 7 upgrades (a flat list, not a tree) | Not built as a tree. In the faces model, classes become starting dice and talents become face upgrades, so classless comes for free |

One lesson from One Die Deep itself: one roll against one target made Might dominant (70 to 81% wins against about 50% for mixed builds), until the roll was checked twice. A single number only stays interesting when its two sides really trade off, as Lasers & Feelings' under and over do.

## Recommendation

Next, build the current room crawl with the die as the character, on a branch, and play it against today's game. Each choice below is separable, so you can take some and not others.

- **Core: the die is the character.** No stats. Classes become starting dice, for example a Warrior die heavy on hits and blocks and a Mage die with heal and parry faces. Level-ups and loot change faces.
- **Shell: runs with permanent upgrades.** What survives a run buys upgrades between runs. Whether a run can fail hard is an open question below.
- **Theme: network hack.** Faces become programs (Break 2, Firewall, Patch). Casino is the runner-up if you want the dice to stay literal.
- **Structure: the dice ladder.** A coin tutorial (2 faces: hit, block), a d4 intro, the d6 game, a d10 expert unlock. Each step up means more faces to build. This needs "a single d6" to relax to "a single die".
- **Park SONAR.** Keep it as a separate puzzle idea. If you revisit it, take the die out of combat and give it another job.

Concrete next step: a branch that swaps the three stats for faces in One Die Deep and keeps everything else (map, rooms, sound, animation, phone layout). Then adapt `tests/balance/` to it, so the new version is tuned to the same targets as today's.

## Open questions

These five answers decide what the next branch looks like.

- [ ] Is "only a single d6" a hard rule, or is "a single die" enough? The dice ladder depends on it.
- [ ] Can a run fail hard? NETDIVE keeps everything when a dive ends; High Roller keeps only the chips you didn't spend.
- [ ] Which theme: network hack, casino, or stay with fantasy?
- [ ] Classes as starting dice, or classless with face upgrades as talents?
- [ ] How long should one run be? I haven't timed play sessions; the sims count dives and runs, not minutes.

## Sources

This session's network blocks these sites, so I could not open the pages. What the tables say about other games comes from search-result summaries and my own knowledge, so check the details before relying on them. The sim numbers are mine and come from the scripts on the branch.

- [Lasers & Feelings](https://johnharper.itch.io/lasers-feelings), John Harper. Rules as described by [Dice Exploder](https://diceexploder.substack.com/p/rolling-the-dice-lasers-and-feelings) and the [2d4chan wiki](https://2d4chan.org/wiki/Lasers_and_feelings)
- [Dragonsweeper](https://danielben.itch.io/dragonsweeper), Daniel Benmergui
- [Desktop Dungeons](https://www.giantbomb.com/desktop-dungeons/3030-31011/), Giant Bomb
- [Dicey Dungeons](https://en.wikipedia.org/wiki/Dicey_Dungeons), Wikipedia
- [Slice & Dice](https://www.pcgamer.com/games/roguelike/heres-slice-and-dice-the-roguelike-rpg-where-each-of-your-party-members-is-a-different-die), PC Gamer
- [Die in the Dungeon](https://www.avclub.com/die-in-the-dungeon-early-access-thoughts), The A.V. Club
- [Nodebuster review](https://mancunion.com/2025/05/08/nodebuster-review-a-short-and-sweet-incremental-game/), The Mancunion, and the [incrementaldb review](https://www.incrementaldb.com/community/review/5808)
- [Android: Netrunner runs](https://netrunnercodex.github.io/docs/introduction/runners_turn), Netrunner Codex, for the ICE and trace vocabulary
