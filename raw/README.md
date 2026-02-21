# Raw Agent

An AI agent given only the raw game source code — no structured knowledge, no landmark map, no action vocabulary. This is the baseline configuration showing what happens without a `CLAUDE.md` or `AGENTS.md`.

## How It Works

The server (`server.js`) builds a system prompt by reading five JS source files directly from `mario_js/lib/` and concatenating them:

```
lib/game.js
lib/util/input.js
lib/util/movement.js
lib/util/physics.js
lib/map/level_1-1.js
```

The agent has to infer everything — valid action names, Mario's speed, goomba positions, pipe locations — by reading the source code on every single request.

## Run

```bash
npm install
npm start
# Open http://localhost:3001
```

Requires `ANTHROPIC_API_KEY` in `.env`.

## Key Files

| File | Purpose |
|---|---|
| `server.js` | Express server, API proxy, raw system prompt builder |
| `demo/demo.js` | Browser agentic loop — POSTs to `/api/chat`, executes tool calls on iframe |
| `demo/gameAPI.js` | Browser-side bridge — dispatches inputs, reads `window.game` state |
| `demo/state_renderer.js` | Converts raw game JSON into agent-readable text |
| `mario_js/` | Modified Mario JS game engine (see `mario_js/README.md`) |

## Tool Schema

The raw agent gets the same five tools as the configured agent, but with minimal descriptions — no action enum, no speed constants, no usage guidance:

| Tool | Raw description |
|---|---|
| `dispatch_action` | "Dispatch an action string to the game engine." |
| `get_state` | "Get the current game state." |
| `get_readable_state` | "Get a readable version of the game state." |
| `move_to_x` | "Move Mario to a target X coordinate using position feedback." |
| `wait_ms` | "Wait N milliseconds." |

The `action` parameter is a plain `string` with no enum — the agent must infer valid action names from the source code.

## Why It Performs Differently

| Factor | Configured | Raw |
|---|---|---|
| Valid action names | Enumerated in tool schema | Must infer from `input.js` source |
| Mario's speed | Stated (180/270 px/s) | Must derive from `movement.js` physics |
| Landmark positions | Exact table in `CLAUDE.md` | Must read `level_1-1.js` coordinates |
| Stomping technique | Documented with exact timing | Must figure out from trial and error |
| Tokens per request | ~9k input | ~15k input (source files are larger) |

Same model, same tools, same game — the difference is entirely in what context the agent is given.
