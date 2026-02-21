/**
 * demo.js — Configured agent chat panel
 *
 * Agentic loop:
 *  1. POST /api/chat with current messages
 *  2. If stop_reason === "tool_use", execute tool calls directly on the game iframe
 *  3. Append tool results and loop back to step 1
 *  4. When stop_reason === "end_turn", display final assistant message
 *
 * Game access: direct iframe.contentWindow.gameAPI (same-origin — no postMessage needed).
 * If gameAPI isn't ready yet, callGameAPI() waits up to 8s for it to initialise.
 */

// ── Panel state ───────────────────────────────────────────────────────────────

const panel = {
  messages:       [],
  pendingMessage: null,   // queued while agent is busy
  iframe:         null,
  messagesEl:     null,
  inputEl:        null,
  sendBtn:        null,
  busy:           false,
  tokensIn:       0,
  tokensOut:      0,
  requests:       0,
};

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  panel.iframe     = document.getElementById('iframe-game');
  panel.messagesEl = document.getElementById('messages-game');
  panel.inputEl    = document.getElementById('input-game');
  panel.sendBtn    = document.getElementById('send-game');

  panel.sendBtn.addEventListener('click', () => {
    const text = panel.inputEl.value.trim();
    if (text) sendToPanel(text);
  });

  panel.inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = panel.inputEl.value.trim();
      if (text) sendToPanel(text);
    }
  });

  document.getElementById('reset-game').addEventListener('click', () => {
    panel.messages = [];
    panel.pendingMessage = null;
    panel.tokensIn  = 0;
    panel.tokensOut = 0;
    panel.requests  = 0;
    panel.messagesEl.innerHTML = '';
    panel.iframe.src = panel.iframe.src; // reload iframe
    updateTokenDisplay();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      panel.inputEl.value = prompt;
      sendToPanel(prompt);
    });
  });

  scaleGameFrame();
  window.addEventListener('resize', scaleGameFrame);
});


// ── Message sending ───────────────────────────────────────────────────────────

async function sendToPanel(text) {
  panel.inputEl.value = '';

  if (panel.busy) {
    // Queue it — agent loop will pick it up when done
    panel.pendingMessage = text;
    panel.sendBtn.textContent = '⏳ Queued';
    panel.sendBtn.classList.add('queued');
    return;
  }

  panel.messages.push({ role: 'user', content: text });
  appendMessage('user', text);
  await runAgentLoop();
}


// ── Agentic loop ──────────────────────────────────────────────────────────────

async function runAgentLoop() {
  setBusy(true);
  appendThinking('thinking…');

  const MAX_TOOL_TURNS = 20;
  let turns = 0;

  while (turns < MAX_TOOL_TURNS) {
    turns++;

    let response;
    try {
      response = await callClaudeAPI(panel.messages);
    } catch (err) {
      removeThinking();
      appendMessage('assistant', `Error: ${err.message}`);
      setBusy(false);
      return;
    }

    panel.messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      removeThinking();
      const toolResults = await executeToolCalls(response.content);

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          appendMessage('assistant', block.text);
        }
      }

      panel.messages.push({ role: 'user', content: toolResults });
      appendThinking('acting…');
    } else {
      removeThinking();
      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          appendMessage('assistant', block.text);
        }
      }
      break;
    }
  }

  if (turns >= MAX_TOOL_TURNS) {
    removeThinking();
    appendMessage('assistant', '[Max tool turns reached]');
  }

  setBusy(false);
}


// ── Game API access (direct contentWindow — same-origin) ──────────────────────

function getGameAPI() {
  try {
    const gw = panel.iframe.contentWindow;
    return (gw && gw.gameAPI) || null;
  } catch {
    return null;
  }
}

async function callGameAPI(method, args = {}) {
  // Wait for gameAPI to initialise (mirrors the 8s poll in gameAPI.js)
  let api = getGameAPI();
  if (!api) {
    const start = Date.now();
    while (!api && Date.now() - start < 8000) {
      await sleep(200);
      api = getGameAPI();
    }
  }

  if (!api) return { error: 'gameAPI not ready' };

  if (method === 'dispatch')         return api.dispatch(args.action, args.duration_ms);
  if (method === 'getState')         return api.getState();
  if (method === 'getReadableState') return api.getReadableState();
  return { error: `Unknown method: ${method}` };
}


// ── Tool execution ─────────────────────────────────────────────────────────────

async function executeToolCalls(content) {
  const toolResults = [];

  for (const block of content) {
    if (block.type !== 'tool_use') continue;

    const result = await executeSingleTool(block);
    toolResults.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    });
  }

  return toolResults;
}

async function executeSingleTool(toolUse) {
  const { name, input } = toolUse;

  switch (name) {
    case 'dispatch_action': {
      const action = input.action;
      const duration_ms = input.duration_ms || null;
      const result = await callGameAPI('dispatch', { action, duration_ms });
      const success = result && result.success;
      const durationLabel = duration_ms ? ` ×${duration_ms}ms` : '';
      const label = success
        ? `▶ dispatch("${action}")${durationLabel}`
        : `✗ dispatch("${action}") FAILED: ${result && result.error}`;
      appendToolMsg(label, success ? 'tool-dispatch' : 'tool-error');

      // For timed moves: wait for completion then snapshot state automatically
      if (success && duration_ms) {
        await sleep(duration_ms);
        const readable = await callGameAPI('getReadableState');
        appendToolMsg('↺ post-move state', 'tool-state');
        return JSON.stringify({ ...result, state_after: readable });
      }

      return JSON.stringify(result);
    }

    case 'get_state': {
      const state = await callGameAPI('getState');
      appendToolMsg(`↺ get_state → mario x=${state && state.mario ? state.mario.x : '?'}`, 'tool-state');
      return JSON.stringify(state);
    }

    case 'get_readable_state': {
      const readable = await callGameAPI('getReadableState');
      appendToolMsg('↺ get_readable_state', 'tool-state');
      return typeof readable === 'string' ? readable : JSON.stringify(readable);
    }

    case 'wait_ms': {
      const ms = Math.min(Math.max(Number(input.ms) || 500, 50), 3000);
      appendToolMsg(`⏱ wait ${ms}ms`, 'tool-state');
      await sleep(ms);
      return `waited ${ms}ms`;
    }

    case 'move_to_x': {
      const targetX   = Math.round(Number(input.x));
      const tolerance = Math.round(Number(input.tolerance) || 15);
      const MAX_STEPS = 20;

      appendToolMsg(`→ move_to_x(${targetX}, ±${tolerance}px)`, 'tool-dispatch');

      let lastX      = null;
      let stuckCount = 0;

      for (let step = 0; step < MAX_STEPS; step++) {
        const state = await callGameAPI('getState');
        if (!state || !state.mario) break;

        const marioX   = state.mario.x;
        const delta    = targetX - marioX;
        const absDelta = Math.abs(delta);

        if (absDelta <= tolerance) {
          await callGameAPI('dispatch', { action: 'stop' });
          const readable = await callGameAPI('getReadableState');
          appendToolMsg(`✓ reached x=${marioX} (target ${targetX})`, 'tool-dispatch');
          return JSON.stringify({ success: true, reached_x: marioX, target_x: targetX, state_after: readable });
        }

        // Stuck detection: if position didn't change after a burst, Mario is blocked
        if (lastX !== null && marioX === lastX) {
          stuckCount++;
          if (stuckCount >= 3) {
            await callGameAPI('dispatch', { action: 'stop' });
            const readable = await callGameAPI('getReadableState');
            appendToolMsg(`⚠ move_to_x(${targetX}) blocked at x=${marioX}`, 'tool-error');
            return JSON.stringify({
              success: false, error: 'blocked_by_obstacle',
              reached_x: marioX, target_x: targetX,
              state_after: readable,
            });
          }
        } else {
          stuckCount = 0;
        }
        lastX = marioX;

        // Burst proportional to distance — prevents overshooting small gaps
        const baseBurst  = absDelta > 150 ? 400 : absDelta > 60 ? 200 : 80;
        const burstMs    = Math.max(20, Math.min(baseBurst, Math.round(absDelta * 3)));
        const action     = delta > 0 ? 'move_right' : 'move_left';

        appendToolMsg(`  x=${marioX} Δ${delta > 0 ? '+' : ''}${delta}px → ${action} ${burstMs}ms`, 'tool-state');

        await callGameAPI('dispatch', { action });
        await sleep(burstMs);
        await callGameAPI('dispatch', { action: 'stop' });
        await sleep(100); // let Mario fully decelerate before re-reading position
      }

      const finalState = await callGameAPI('getState');
      const readable   = await callGameAPI('getReadableState');
      appendToolMsg(`✗ move_to_x(${targetX}) max steps`, 'tool-error');
      return JSON.stringify({
        success: false, error: 'max_steps_reached',
        reached_x: finalState?.mario?.x, target_x: targetX,
        state_after: readable,
      });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}


// ── API call ──────────────────────────────────────────────────────────────────

async function callClaudeAPI(messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  const data = await res.json();
  if (data.usage) {
    panel.tokensIn  += data.usage.input_tokens  || 0;
    panel.tokensOut += data.usage.output_tokens || 0;
    panel.requests  += 1;
    updateTokenDisplay();
  }
  return data;
}


// ── Token display ─────────────────────────────────────────────────────────────

function updateTokenDisplay() {
  const el = document.getElementById('token-count');
  if (!el) return;
  const total = panel.tokensIn + panel.tokensOut;
  if (total === 0) { el.textContent = ''; return; }
  const avgIn = panel.requests > 0 ? Math.round(panel.tokensIn / panel.requests) : 0;
  el.textContent =
    `↑${panel.tokensIn.toLocaleString()} ↓${panel.tokensOut.toLocaleString()} = ${total.toLocaleString()} tok` +
    ` · ${panel.requests} req · ~${avgIn.toLocaleString()} in/req`;
}


// ── DOM helpers ───────────────────────────────────────────────────────────────

function appendMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg msg-${role}`;
  el.textContent = text;
  panel.messagesEl.appendChild(el);
  scrollToBottom();
}

function appendToolMsg(label, cssClass) {
  const el = document.createElement('div');
  el.className = `msg msg-tool ${cssClass || ''}`;
  el.textContent = label;
  panel.messagesEl.appendChild(el);
  scrollToBottom();
}

let _thinkingEl = null;

function appendThinking(text) {
  if (_thinkingEl) removeThinking();
  const el = document.createElement('div');
  el.className = 'msg msg-thinking';
  el.textContent = text;
  panel.messagesEl.appendChild(el);
  _thinkingEl = el;
  scrollToBottom();
}

function removeThinking() {
  if (_thinkingEl) {
    _thinkingEl.remove();
    _thinkingEl = null;
  }
}

function scrollToBottom() {
  panel.messagesEl.scrollTop = panel.messagesEl.scrollHeight;
}

function setBusy(busy) {
  panel.busy = busy;
  const panelEl = document.getElementById('panel-game');
  if (busy) {
    panelEl.classList.add('busy');
    // Keep input enabled so user can type and queue
    panel.sendBtn.disabled = false;
    if (!panel.sendBtn.classList.contains('queued')) {
      panel.sendBtn.textContent = 'Send';
    }
  } else {
    panelEl.classList.remove('busy');
    panel.sendBtn.disabled = false;
    panel.sendBtn.textContent = 'Send';
    panel.sendBtn.classList.remove('queued');

    // Flush queued message
    if (panel.pendingMessage) {
      const text = panel.pendingMessage;
      panel.pendingMessage = null;
      panel.messages.push({ role: 'user', content: text });
      appendMessage('user', text);
      runAgentLoop();
    }
  }
}


// ── Game frame scaling ────────────────────────────────────────────────────────

function scaleGameFrame() {
  const wrapper = document.querySelector('.game-frame-wrapper');
  if (!wrapper) return;

  // Scale to fit wrapper dimensions while maintaining 760:600 aspect ratio
  const scale = Math.min(wrapper.clientWidth / 760, wrapper.clientHeight / 600);

  const iframe = wrapper.querySelector('iframe');
  if (iframe) {
    iframe.style.width  = '760px';
    iframe.style.height = '600px';
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';
    iframe.style.position = 'absolute';
    iframe.style.top  = '0';
    iframe.style.left = '0';
  }
}


// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
