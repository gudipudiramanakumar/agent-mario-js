/**
 * server.js — Mario Agent Demo (Configured Agent)
 *
 * Port 3000. Runs the CONFIGURED agent panel — Claude with CLAUDE.md,
 * .claude/skills, and .claude/agents knowledge baked in.
 *
 * Serves:
 *   /       → demo/index.html
 *   /demo/* → demo/ static files
 *   /game/* → mario_js/ assets (CSS, audio, sprites, jQuery, bundle.js)
 *   /play   → game HTML page
 *   /api/chat → Claude API proxy (always uses configured system prompt)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json({ limit: '2mb' }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Static routes ─────────────────────────────────────────────────────────────

app.use('/demo', express.static(path.join(__dirname, 'demo')));
app.use('/game', express.static(path.join(__dirname, 'mario_js')));

// Game page — injects gameAPI.js and state_renderer.js into the game iframe
app.get('/play', (_req, res) => res.send(buildGameHtml()));

// Main demo page
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'demo', 'index.html')));


// ── Claude API proxy ──────────────────────────────────────────────────────────

/**
 * POST /api/chat
 * Body: { messages: [...] }
 * Returns: { content: [...], stop_reason: string }
 */
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: 'messages required' });

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: getConfiguredSystemPrompt(),
      tools: getConfiguredTools(),
      messages,
    });

    res.json({ content: response.content, stop_reason: response.stop_reason, usage: response.usage });
  } catch (err) {
    console.error('[/api/chat] Claude API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── System prompt ─────────────────────────────────────────────────────────────

function getConfiguredSystemPrompt() {
  const claudeMd   = fs.readFileSync(path.join(__dirname, 'CLAUDE.md'), 'utf8');
  const navigatorMd = fs.readFileSync(
    path.join(__dirname, '.claude', 'agents', 'navigator.md'), 'utf8'
  );
  const skillMd = fs.readFileSync(
    path.join(__dirname, '.claude', 'skills', 'state-renderer', 'SKILL.md'), 'utf8'
  );

  return `You are an AI game-control agent for Super Mario Bros Level 1-1.
You are the CONFIGURED agent — you have structured world knowledge that makes
you immediately effective.

${claudeMd}

---

${skillMd}

---

${navigatorMd}

---

## Your Tools

- \`move_to_x(x, tolerance?)\` — **PREFERRED for positioning**: moves Mario to exact X using position feedback loop; always converges
- \`dispatch_action\` — send a control action; pass \`duration_ms\` to auto-stop movement (see Timed Movement in CLAUDE.md)
- \`get_state\` — read raw game state JSON
- \`get_readable_state\` — get human-readable state summary (call before starting any goal)
- \`wait_ms\` — wait N milliseconds (use sparingly; move_to_x and duration_ms handle most timing)

## Behavior

Before every action: call get_readable_state to know exactly where Mario is.
After dispatching an action: call get_state to verify outcome.
For multi-step goals: follow the navigator.md protocol (assess → plan → execute → narrate).
Keep narration short and punchy — one or two sentences per action.`;
}


// ── Tool definitions ──────────────────────────────────────────────────────────

function getConfiguredTools() {
  return [
    {
      name: 'dispatch_action',
      description: 'Send a control action to the Mario game. Use ONLY the action strings defined in CLAUDE.md. For movement actions (move_right, move_left, run_right, jump_right, jump_left) you can pass duration_ms to auto-stop after the specified hold time — calculate it from Mario\'s speed (~180px/s walking, ~270px/s running) and the distance to travel. When duration_ms is used, the tool result includes a state_after field with Mario\'s position, size, and alive status after the move — no need for a separate get_readable_state call.',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['move_right', 'move_left', 'jump', 'jump_right', 'jump_left', 'run_right', 'stop', 'crouch', 'pause'],
            description: 'The action to dispatch to the game',
          },
          duration_ms: {
            type: 'number',
            description: 'Optional. For movement actions only: how many milliseconds to hold the key before auto-releasing. Calculate as: duration_ms = distance_px / speed_px_per_s * 1000. Walking speed ≈ 180 px/s (move_right/move_left). Running speed ≈ 270 px/s (run_right). Example: to travel 200px walking → 200/180*1000 ≈ 1111ms. Max 5000ms.',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'get_state',
      description: 'Get the current game state as a JSON object. Returns mario position, entity positions, score, etc. Prefer get_readable_state for a cleaner summary.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_readable_state',
      description: 'Get a human-readable summary of the current game state via the state_renderer skill. Includes Mario position, nearest landmark, threats ahead, and items. Call this before every response.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'wait_ms',
      description: 'Wait N milliseconds before the next action. Use for timing-sensitive operations (e.g., waiting for Mario to land after a jump). Max 3000ms.',
      input_schema: {
        type: 'object',
        properties: {
          ms: { type: 'number', description: 'Milliseconds to wait (50–3000)' },
        },
        required: ['ms'],
      },
    },
    {
      name: 'move_to_x',
      description: 'Move Mario to an exact X coordinate using a position-feedback loop. Reads Mario\'s actual x after each burst and corrects course — guaranteed to converge regardless of speed/acceleration. Use this whenever you need precise positioning (e.g., standing directly under a block). Returns reached_x and state_after when done.',
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Target X coordinate to move Mario to' },
          tolerance: { type: 'number', description: 'How close is close enough, in pixels. Default 12.' },
        },
        required: ['x'],
      },
    },
  ];
}


// ── Game HTML ─────────────────────────────────────────────────────────────────

function buildGameHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <base href="/game/">
  <title>Mario</title>
  <link href="/game/assets/css/reset.css" rel="stylesheet" />
  <link href="/game/assets/css/stylesheet.css" rel="stylesheet" />
  <style>
    body { background: #5c94fc; margin: 0; overflow: hidden; }
    .main { display: flex; justify-content: center; align-items: center; height: 100vh; }
    canvas { display: block; }
    .description, .contact { display: none !important; }
    #mute-button { display: none !important; }
  </style>
</head>
<body>
  <div class="main">
    <canvas id="game-canvas" width="760" height="600"></canvas>
    <audio id="background_music" muted loop>
      <source src="/game/assets/audio/music/mario_theme.mp3" type="audio/mp3" />
    </audio>
    <div id="mute-button"></div>
  </div>
  <script src="/game/assets/javascripts/jquery.min.js"></script>
  <script src="/game/assets/javascripts/bundle.js"></script>
  <script src="/demo/state_renderer.js"></script>
  <script src="/demo/gameAPI.js"></script>
</body>
</html>`;
}


// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎮 Mario Agent Demo — Configured Agent`);
  console.log(`   Open: http://localhost:${PORT}\n`);
});
