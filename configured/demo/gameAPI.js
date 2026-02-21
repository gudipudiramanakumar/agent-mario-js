/**
 * gameAPI.js — Browser-ready game bridge
 *
 * Attaches window.gameAPI once window.game is available.
 *
 * Input is controlled by DIRECTLY manipulating window.game.input.down and
 * window.game.input.pressed — NOT via jQuery synthetic events.
 *
 * Why: the game's keyup handler has a missing `event` param bug, which causes
 * any jQuery-triggered keyup to throw "undefined is not an object (evaluating
 * 'event.keyCode')". Direct state manipulation bypasses this entirely and is
 * more reliable regardless of window focus.
 */

(function initGameAPI() {
  const MAX_WAIT_MS = 8000;
  const POLL_INTERVAL_MS = 100;
  let waited = 0;

  const pollForGame = setInterval(() => {
    waited += POLL_INTERVAL_MS;

    if (window.game && window.game.data && window.game.input &&
        window.game.data.entities && window.game.data.entities.mario) {
      clearInterval(pollForGame);
      attachAPI(window.game.data, window.game.input);
      console.log('[gameAPI] ✅ Attached (direct input mode).');
    }

    if (waited >= MAX_WAIT_MS) {
      clearInterval(pollForGame);
      console.error('[gameAPI] ❌ Game did not initialize in time.');
    }
  }, POLL_INTERVAL_MS);
})();


function attachAPI(data, inp) {

  // ── Key codes ────────────────────────────────────────────────────────────
  const KEYS = {
    LEFT:  [37, 65],
    RIGHT: [39, 68],
    JUMP:  [38, 87, 32],
    DOWN:  [40],
  };

  // ── Direct input state manipulation ─────────────────────────────────────
  // Bypasses jQuery events. Works regardless of iframe focus.

  function holdKey(codes) {
    codes.forEach(code => { inp.down[code] = true; });
  }

  function releaseKey(codes) {
    codes.forEach(code => {
      delete inp.down[code];
      delete inp.pressed[code];
    });
  }

  function releaseAll() {
    [...KEYS.LEFT, ...KEYS.RIGHT, ...KEYS.JUMP, ...KEYS.DOWN].forEach(code => {
      delete inp.down[code];
      delete inp.pressed[code];
    });
  }

  // Jump: must clear pressed[] first so isPressed() fires on the next frame
  function triggerJump(codes, holdMs) {
    codes.forEach(code => {
      delete inp.pressed[code];
      inp.down[code] = true;
    });
    setTimeout(() => releaseKey(codes), holdMs);
  }

  // ── Action dispatcher ────────────────────────────────────────────────────

  const ACTIONS = {
    move_right:  () => { releaseAll(); holdKey(KEYS.RIGHT); },
    move_left:   () => { releaseAll(); holdKey(KEYS.LEFT); },
    jump:        () => { triggerJump(KEYS.JUMP, 150); },
    jump_right:  () => { holdKey(KEYS.RIGHT); triggerJump(KEYS.JUMP, 200); },
    jump_left:   () => { holdKey(KEYS.LEFT);  triggerJump(KEYS.JUMP, 200); },
    run_right:   () => { releaseAll(); holdKey(KEYS.RIGHT); },
    stop:        () => { releaseAll(); },
    crouch:      () => { holdKey(KEYS.DOWN); setTimeout(() => releaseKey(KEYS.DOWN), 200); },
    pause:       () => { data.paused = !data.paused; },
  };

  // ── State reader ─────────────────────────────────────────────────────────

  function getMarioState(mario) {
    if (mario.currentState === mario.states.dead) return 'dead';
    if (mario.type === 'invincible') return 'invincible';
    if (mario.bigMario) return 'big';
    return 'small';
  }

  function getState() {
    const mario = data.entities.mario;
    const entities = [];

    (data.entities.goombas || []).forEach(e => {
      entities.push({
        type: 'goomba',
        x: Math.round(e.xPos),
        y: Math.round(e.yPos),
        alive: e.currentState !== e.states.dead,
      });
    });

    (data.entities.koopas || []).forEach(e => {
      entities.push({
        type: 'koopa',
        x: Math.round(e.xPos),
        y: Math.round(e.yPos),
        alive: e.currentState !== e.states.dead,
      });
    });

    (data.entities.mushrooms || []).forEach(m => {
      if (m) {
        entities.push({
          type: 'mushroom',
          x: Math.round(m.xPos),
          y: Math.round(m.yPos),
          active: true,
        });
      }
    });

    (data.mapBuilder.blockEntities || []).forEach(b => {
      entities.push({
        type: 'coin_block',
        x: Math.round(b.xPos),
        y: Math.round(b.yPos),
        contents: b.contents,
        hit: b.contents === 'empty',
      });
    });

    return {
      mario: {
        x: Math.round(mario.xPos),
        y: Math.round(mario.yPos),
        vx: mario.velX || 0,
        vy: mario.velY || 0,
        state: getMarioState(mario),
        isGrounded: mario.velY >= 0 && mario.velY <= 1.3,
        isDead: mario.currentState === mario.states.dead,
      },
      entities,
      score: (data.entities.score && data.entities.score.value) || 0,
      coins: (data.entities.score && data.entities.score.coinCount) || 0,
      lives: 3,
      levelComplete: false,
      gameOver: false,
    };
  }

  // Movement actions that support auto-release via duration_ms
  const MOVEMENT_ACTIONS = new Set(['move_right', 'move_left', 'run_right', 'jump_right', 'jump_left']);

  // ── Public API ────────────────────────────────────────────────────────────

  window.gameAPI = {
    dispatch(action, duration_ms) {
      if (!ACTIONS[action]) {
        const error = `Unknown action: "${action}". Valid: ${Object.keys(ACTIONS).join(', ')}`;
        console.warn('[gameAPI]', error);
        return { success: false, action, error };
      }
      try {
        ACTIONS[action]();
        const ms = duration_ms != null ? Math.min(Math.max(Number(duration_ms) || 0, 0), 5000) : 0;
        if (ms > 0 && MOVEMENT_ACTIONS.has(action)) {
          setTimeout(() => releaseAll(), ms);
          console.log(`[gameAPI] ▶ dispatch("${action}", ${ms}ms) — auto-stop scheduled`);
        } else {
          console.log(`[gameAPI] ▶ dispatch("${action}")`);
        }
        return { success: true, action, duration_ms: ms || null };
      } catch (err) {
        console.error('[gameAPI] dispatch error:', err);
        return { success: false, action, error: err.message };
      }
    },

    getState() {
      try {
        return getState();
      } catch (err) {
        console.error('[gameAPI] getState error:', err);
        return null;
      }
    },

    getReadableState() {
      if (window.renderState) {
        return window.renderState(this.getState());
      }
      return JSON.stringify(this.getState(), null, 2);
    },
  };
}
