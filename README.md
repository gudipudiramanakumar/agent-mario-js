# agent_mario_js

A side-by-side demonstration of Claude AI controlling Super Mario Bros Level 1-1, comparing two agent configurations: one with structured knowledge and one working from raw source code alone.

## What This Shows

Both agents get identical tools and the same game. The difference is entirely in what you put in the system prompt.

| | Configured Agent | Raw Agent |
|---|---|---|
| **Port** | 3000 | 3001 |
| **System prompt** | CLAUDE.md + navigator sub-agent + state-renderer skill | 5 raw JS source files |
| **Tool descriptions** | Rich — action enum, speed constants, usage guidance | Minimal — one-liners |
| **Action vocabulary** | Enumerated in tool schema | Must infer from source code |
| **Accuracy** | High — knows exact positions, stomping technique | Variable — rediscovers rules each turn |
| **Tokens per request** | ~9k input/req | ~15k input/req |

## Architecture

```
Browser
  └── demo.js (agentic loop)
        ├── POST /api/chat  ──► Claude API (claude-opus-4-5)
        │                           └── tool calls
        └── game iframe (/play)
              ├── gameAPI.js   — dispatches inputs, reads window.game
              └── state_renderer.js — converts raw state to readable text
```

The agent loop in `demo.js` runs until `stop_reason === "end_turn"`:
1. POST messages → Claude decides next action
2. Execute tool calls on the game iframe
3. Append tool results → loop back

## Quick Start

Each project is self-contained. Install dependencies and start independently.

```bash
# Configured agent — http://localhost:3000
cd configured
npm install
npm start

# Raw agent — http://localhost:3001
cd raw
npm install
npm start
```

Both require `ANTHROPIC_API_KEY` in a `.env` file:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## Project Structure

```
agent_mario_js/
├── configured/        Claude with CLAUDE.md, skills, navigator sub-agent
│   ├── mario_js/      Game engine (modified for agentic use)
│   ├── demo/          Chat UI + agentic tool loop
│   ├── .claude/       Sub-agent and skill definitions
│   ├── CLAUDE.md      Game world knowledge fed to Claude
│   └── server.js      Express server, port 3000
│
└── raw/               Claude with raw game source code only
    ├── mario_js/      Game engine (same modifications)
    ├── demo/          Chat UI + agentic tool loop
    └── server.js      Express server, port 3001
```

## Tools Available to Both Agents

| Tool | Description |
|---|---|
| `get_readable_state` | Human-readable game state summary |
| `get_state` | Raw game state JSON |
| `dispatch_action` | Send a control action (move, jump, etc.) |
| `move_to_x` | Navigate Mario to an exact X coordinate via feedback loop |
| `wait_ms` | Wait N milliseconds |

The configured agent's tool descriptions include the valid action enum, Mario's speed constants (walking 180 px/s, running 270 px/s), and usage guidance. The raw agent's descriptions are intentionally minimal.

## Attribution

The game engine in `configured/mario_js/` and `raw/mario_js/` is a modified version of [mario_js](https://github.com/tylerreichle/mario_js) by Tyler Reichle (MIT License). The base used is commit [`1c89787`](https://github.com/tylerreichle/mario_js/commit/1c8978790c4c7fbf13afac6e3d300cb5af9e0b72). Modifications expose an agentic control API (`window.game`) and add a `gameAPI.js` layer for tool-based input dispatching.
