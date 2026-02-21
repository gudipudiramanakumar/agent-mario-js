---
name: state-renderer
description: Renders a clean, human-readable summary of the current Mario game state from getState() JSON. Shows Mario position, power-up state, nearest landmark, enemies ahead (within 400px), items ahead, and gap warnings. Call this before every action decision so you know exactly where Mario is and what is coming.
---

# state-renderer

Converts raw `window.gameAPI.getState()` JSON into a focused, readable summary.

## Usage

Call `window.gameAPI.getReadableState()` — this automatically runs the renderer.

The JavaScript implementation is in `scripts/state_renderer.js` and is loaded
into the game page as `window.renderState()`.

## Output Format

```
=== GAME STATE ===
Mario is at x=<X>, y=<Y> | State: <small|big|fire> | <grounded|airborne>
Nearest landmark: <name> (~<dist>px ahead at x=<X>)
[⚠  GAP AHEAD: <gap warning> if within 300px of a gap]
Enemies ahead (400px): <type> at x=<X> (alive|defeated), ...
Items ahead (400px): <type> at x=<X> (SPAWNED — collect now! | in block), ...
Blocks ahead (400px): <type> at x=<X> (contents: coin|mushroom|empty), ...
Score: <n> | Coins: <n> | Lives: <n>
==================
```

## Why This Skill Exists

Without this skill, an agent gets raw JSON:
```json
{ "mario": { "x": 620, "y": 176 }, "entities": [...dozens of entries...] }
```

With this skill, the agent gets:
```
Mario is at x=620, y=176 | State: small | grounded
Nearest landmark: First pipe (~52px ahead at x=672)
Enemies ahead (400px): none
Items ahead (400px): none
Blocks ahead (400px): coin_block at x=672 (contents: coin)
Score: 0 | Coins: 0 | Lives: 3
```

That is the entire point of a skill.
