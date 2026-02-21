/**
 * server.js — Mario Agent Demo (Raw Agent)
 *
 * Port 3001. Runs the RAW agent panel — Claude given only game source code,
 * no CLAUDE.md, no .claude/agents, no .claude/skills.
 *
 * Game assets are loaded from the sibling Gittogether_Demos repo
 * (../Gittogether_Demos/mario_js copy/) to avoid duplicating large files.
 *
 * Serves:
 *   /       → demo/index.html
 *   /demo/* → demo/ static files
 *   /game/* → mario_js copy/ assets (CSS, audio, sprites, jQuery, bundle.js)
 *   /play   → game HTML page
 *   /api/chat → Claude API proxy (always uses raw system prompt)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json({ limit: '2mb' }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GAME_DIR = path.join(__dirname, 'mario_js');

// ── Static routes ─────────────────────────────────────────────────────────────

app.use('/demo', express.static(path.join(__dirname, 'demo')));
app.use('/game', express.static(GAME_DIR));

// Game page
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
      system: getRawSystemPrompt(),
      tools: getRawTools(),
      messages,
    });

    res.json({ content: response.content, stop_reason: response.stop_reason, usage: response.usage });
  } catch (err) {
    console.error('[/api/chat] Claude API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── System prompt ─────────────────────────────────────────────────────────────

function getRawSystemPrompt() {
  const read = (file) =>
    fs.readFileSync(path.join(GAME_DIR, 'lib', file), 'utf8');

  return `You are an AI agent connected to a browser-based Mario game.
The game source code is provided below. Figure out how to interact with the game.

You have access to tools: dispatch_action, get_state, get_readable_state, wait_ms.

## Game Source Code

### game.js
\`\`\`js
${read('game.js')}
\`\`\`

### util/input.js
\`\`\`js
${read('util/input.js')}
\`\`\`

### util/movement.js
\`\`\`js
${read('util/movement.js')}
\`\`\`

### util/physics.js
\`\`\`js
${read('util/physics.js')}
\`\`\`

### map/level_1-1.js
\`\`\`js
${read('map/level_1-1.js')}
\`\`\`

Help the user control Mario based on their instructions.`;
}


// ── Tool definitions ──────────────────────────────────────────────────────────

function getRawTools() {
  // Minimal descriptions — no action vocabulary, no hints
  return [
    {
      name: 'dispatch_action',
      description: 'Dispatch an action string to the game engine. For movement actions you can pass duration_ms to auto-stop after holding the key for that many milliseconds.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'The action to send' },
          duration_ms: { type: 'number', description: 'Optional. For movement actions: milliseconds to hold the key before auto-releasing.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'get_state',
      description: 'Get the current game state.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_readable_state',
      description: 'Get a readable version of the game state.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'wait_ms',
      description: 'Wait N milliseconds.',
      input_schema: {
        type: 'object',
        properties: { ms: { type: 'number' } },
        required: ['ms'],
      },
    },
    {
      name: 'move_to_x',
      description: 'Move Mario to a target X coordinate using position feedback. Reads actual position after each movement burst and corrects until within tolerance.',
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Target X coordinate' },
          tolerance: { type: 'number', description: 'Acceptable error in pixels (default 12)' },
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
  <title>Mario (raw)</title>
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🎮 Mario Agent Demo — Raw Agent`);
  console.log(`   Open: http://localhost:${PORT}\n`);
});
