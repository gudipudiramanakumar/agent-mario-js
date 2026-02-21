# Configured Agent

An AI agent with structured world knowledge — `CLAUDE.md` / `AGENTS.md`, a navigator sub-agent, and a state-renderer skill. This is the high-accuracy configuration.

## How It Works

The server (`server.js`) builds a system prompt by concatenating three markdown files before every API call:

```
CLAUDE.md (or AGENTS.md)               Game world knowledge
.claude/agents/navigator.md            Multi-step navigation sub-agent
.claude/skills/state-renderer/SKILL.md How to read state output
```

The agent never has to guess what actions are valid, what speed Mario moves at, or where the goombas are — it is all in the prompt.

## CLAUDE.md vs AGENTS.md

Both files contain **identical game-control knowledge** and are fully interchangeable:

| File | Convention |
|---|---|
| `CLAUDE.md` | Use when running with **Claude** — follows the Claude Code CLAUDE.md convention |
| `AGENTS.md` | Use when integrating with a **different LLM or agent framework** — drop-in replacement |

To swap: update the `getConfiguredSystemPrompt()` function in `server.js` to read `AGENTS.md` instead of `CLAUDE.md`. No other changes needed.

## Run

```bash
npm install
npm start
# Open http://localhost:3000
```

Requires `ANTHROPIC_API_KEY` in `.env`.

## Key Files

| File | Purpose |
|---|---|
| `server.js` | Express server, API proxy, system prompt builder |
| `CLAUDE.md` | Game world reference — landmarks, actions, speed constants, stomping technique |
| `AGENTS.md` | Same content as CLAUDE.md — use this when integrating with non-Claude agents |
| `.claude/agents/navigator.md` | Sub-agent for multi-step goals (go to flag, collect mushroom) |
| `.claude/skills/state-renderer/SKILL.md` | Skill for interpreting `get_readable_state` output |
| `demo/demo.js` | Browser agentic loop — POSTs to `/api/chat`, executes tool calls on iframe |
| `demo/gameAPI.js` | Browser-side bridge — dispatches inputs, reads `window.game` state |
| `demo/state_renderer.js` | Converts raw game JSON into agent-readable text |
| `mario_js/` | Modified Mario JS game engine (see `mario_js/README.md`) |

## Tool Schema

The `dispatch_action` tool includes:
- `action` as an **enum** — the agent never guesses an invalid action string
- Speed constants in the description: walking ≈ 180 px/s, running ≈ 270 px/s
- `duration_ms` formula: `distance / speed * 1000`
- `state_after` auto-included in the response when `duration_ms` is used

`move_to_x` uses a position-feedback loop — reads Mario's actual X after each movement burst, corrects course, and returns `blocked_by_obstacle` if position stops changing (stuck against a pipe or wall).

## Navigator Sub-Agent

Invoked for multi-step positional goals ("get to the flag", "collect the mushroom"). Runs an assess → plan → execute → narrate loop:
- Full route planning with waypoints
- Gap crossing
- Goomba stomping: `move_to_x(goomba_x - 80)` then `dispatch_action("jump_right", 400ms)`
- Power-up priority — always collect mushrooms encountered mid-route
